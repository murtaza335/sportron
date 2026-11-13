-- 131_username_change_limit.sql
-- A user may change their username only once every 30 days (docs/reporting/PLAN.md §12).
-- ADDITIVE: one nullable column + one BEFORE UPDATE trigger. Onboarding INSERTs are unaffected, existing
-- users have no recorded change so their first rename is allowed. Takes effect for EVERY client at once
-- (old builds, web, OTA). Old builds show `error.message` raw, so the message is the final user-facing
-- sentence; the machine code sits in `hint` and the next-allowed ISO timestamp in `detail`.
--
-- Never add a CHECK for this (trigger-based on purpose, fires only on a real username change — see
-- the hardening rules in AGENTS.md).

alter table public.profiles add column if not exists username_changed_at timestamptz;

create or replace function public.enforce_username_change_limit()
returns trigger
language plpgsql
as $$
declare
  v_next timestamptz;
begin
  -- staff / service role / cron have no auth.uid(): exempt (lets staff fix an offensive name)
  if auth.uid() is null then
    return new;
  end if;

  -- server-owned column: client writes are silently reverted
  new.username_changed_at := old.username_changed_at;

  if lower(btrim(new.username)) is distinct from lower(btrim(old.username)) then
    if old.username_changed_at is not null
       and old.username_changed_at > now() - interval '30 days' then
      v_next := old.username_changed_at + interval '30 days';
      raise exception using
        message = format('You can change your username only once every 30 days. You can change it again on %s.',
                         to_char(v_next at time zone 'UTC', 'DD Mon YYYY')),
        hint    = 'USERNAME_CHANGE_LIMIT',
        detail  = to_char(v_next at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    end if;
    new.username_changed_at := now();
  end if;
  return new;
end
$$;

revoke all on function public.enforce_username_change_limit() from public, anon, authenticated;

-- BEFORE UPDATE only (onboarding INSERT is free). Sorts before trg_validate_profile_text (116), which
-- lowercases the name, hence the lower(btrim()) comparison above.
drop trigger if exists trg_username_change_limit on public.profiles;
create trigger trg_username_change_limit
  before update on public.profiles
  for each row execute function public.enforce_username_change_limit();
