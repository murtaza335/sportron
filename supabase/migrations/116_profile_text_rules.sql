-- BUG-M11: usernames had no server-side format rule (spaces, emoji, 500 chars) and bios no cap.
-- New values must be 3-30 chars of a-z 0-9 . _ - and not a reserved name; bio <= 300 chars.
-- Implemented as a trigger that validates only when the value CHANGES (no CHECK constraint, so
-- legacy usernames/bios never block unrelated profile updates such as fcm_tokens or streaks).
-- The stored username is lowercased by the app already; the trigger also lowercases/trim to be safe.

create or replace function public.validate_profile_text()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' or new.username is distinct from old.username then
    new.username := lower(btrim(new.username));
    if new.username !~ '^[a-z0-9._-]{3,30}$' then
      raise exception 'INVALID_USERNAME';
    end if;
    if new.username in ('admin', 'administrator', 'sportron', 'support', 'moderator', 'system', 't3s') then
      raise exception 'RESERVED_USERNAME';
    end if;
  end if;

  if (tg_op = 'INSERT' or new.bio is distinct from old.bio)
     and new.bio is not null and char_length(new.bio) > 300 then
    raise exception 'BIO_TOO_LONG';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_profile_text() from public, anon, authenticated;

drop trigger if exists trg_validate_profile_text on public.profiles;
create trigger trg_validate_profile_text
  before insert or update on public.profiles
  for each row execute function public.validate_profile_text();
