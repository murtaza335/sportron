-- SEC-M3: sessions were only validated client-side. Via the API a user could create a session
-- with expires_at in year 9999, max_participants 0 / 100000, a date months away or in the past,
-- status 'full', and 10 KB of text; and delete a session that already has accepted participants.
-- A BEFORE INSERT/UPDATE/DELETE guard (client writes only; auth.uid() is null for service role
-- and the SECURITY DEFINER expiry job) enforces the same limits the app already applies.
--
-- Limits: date_time within [now()-15min, now()+8 days]; expires_at clamped to
-- [date_time, date_time+7 days]; 1..50 participants; title <= 40; description <= 1000.
-- Backward compatible: installed builds already respect these; the tolerances absorb clock skew
-- and the "end of day +7" client rule.

create or replace function public.guard_session_write()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if exists (
      select 1 from public.commitments c
      where c.session_id = old.id and c.status = 'accepted'
    ) then
      raise exception 'SESSION_HAS_PARTICIPANTS';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'open';
    if new.created_by <> auth.uid() then
      raise exception 'NOT_ALLOWED';
    end if;
  else
    -- UPDATE: identity is immutable; only 'full'/'open'/ended statuses are valid.
    if new.created_by is distinct from old.created_by then
      raise exception 'NOT_ALLOWED';
    end if;
    if new.status not in ('open', 'full', 'closed', 'completed', 'cancelled') then
      raise exception 'NOT_ALLOWED';
    end if;
  end if;

  if tg_op = 'INSERT' or new.date_time is distinct from old.date_time then
    if new.date_time < now() - interval '15 minutes'
       or new.date_time > now() + interval '8 days' then
      raise exception 'INVALID_SESSION_TIME';
    end if;
  end if;

  if new.expires_at is not null then
    new.expires_at := least(greatest(new.expires_at, new.date_time), new.date_time + interval '7 days');
  end if;

  if (tg_op = 'INSERT' or new.max_participants is distinct from old.max_participants)
     and (new.max_participants is null or new.max_participants < 1 or new.max_participants > 50) then
    raise exception 'INVALID_MAX_PARTICIPANTS';
  end if;

  if (tg_op = 'INSERT' or new.title is distinct from old.title)
     and new.title is not null and char_length(new.title) > 40 then
    raise exception 'TITLE_TOO_LONG';
  end if;
  if (tg_op = 'INSERT' or new.description is distinct from old.description)
     and new.description is not null and char_length(new.description) > 1000 then
    raise exception 'DESCRIPTION_TOO_LONG';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_session_write() from public, anon, authenticated;

drop trigger if exists trg_guard_session_write on public.sessions;
create trigger trg_guard_session_write
  before insert or update or delete on public.sessions
  for each row execute function public.guard_session_write();

-- NOTE: no CHECK constraints on legacy-capable columns. A CHECK (even NOT VALID) is evaluated on
-- every UPDATE of the row, so a legacy session with e.g. 100 participants would make every
-- later update (status changes by close_expired_sessions, capacity sync) fail. The guard above
-- validates only when the value is written.
