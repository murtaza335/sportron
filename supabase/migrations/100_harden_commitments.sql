-- SEC-C3 / SEC-H4: commitments could be written freely by the participant:
--   * INSERT with status 'accepted' (bypassing creator approval + capacity),
--   * UPDATE own row to 'accepted', or set own feedback_status = 'showed_up'.
-- A BEFORE INSERT/UPDATE trigger now enforces the state machine for client calls
-- (auth.uid() is not null). Service-role / internal writes (auth.uid() null) pass through.
--
-- Backward compatible: installed builds insert status 'pending', participants update to 'left',
-- the creator updates to accepted/rejected and writes feedback after the session ended.
-- Error codes: NOT_ALLOWED, CANNOT_JOIN_OWN_SESSION, SESSION_NOT_OPEN, SESSION_FULL, FEEDBACK_NOT_ALLOWED.

create or replace function public.guard_commitment_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator  uuid;
  v_max      int;
  v_status   text;
  v_accepted int;
begin
  if auth.uid() is null then
    return new;
  end if;

  -- Lock the session row so concurrent approvals cannot both pass the capacity check.
  select created_by, max_participants, status
    into v_creator, v_max, v_status
    from public.sessions
   where id = new.session_id
   for update;

  if tg_op = 'INSERT' then
    if new.user_id <> auth.uid() then
      raise exception 'NOT_ALLOWED';
    end if;
    if new.user_id = v_creator then
      raise exception 'CANNOT_JOIN_OWN_SESSION';
    end if;
    if v_status is distinct from 'open' then
      raise exception 'SESSION_NOT_OPEN';
    end if;
    new.status := 'pending';
    new.feedback_status := null;
    new.feedback_provided_by := null;
    return new;
  end if;

  -- UPDATE
  if new.session_id <> old.session_id or new.user_id <> old.user_id then
    raise exception 'NOT_ALLOWED';
  end if;

  if auth.uid() = v_creator then
    if new.status is distinct from old.status
       and new.status = 'accepted' and v_max is not null then
      select count(*) into v_accepted
        from public.commitments
       where session_id = new.session_id and status = 'accepted' and id <> new.id;
      if v_accepted >= v_max then
        raise exception 'SESSION_FULL';
      end if;
    end if;
    if (new.feedback_status is distinct from old.feedback_status
        or new.feedback_provided_by is distinct from old.feedback_provided_by) then
      if old.status <> 'accepted'
         or v_status not in ('closed', 'completed', 'cancelled') then
        raise exception 'FEEDBACK_NOT_ALLOWED';
      end if;
    end if;
  elsif auth.uid() = new.user_id then
    -- A participant may only leave (pending/accepted -> left); no feedback edits.
    if new.status is distinct from old.status
       and not (new.status = 'left' and old.status in ('pending', 'accepted')) then
      raise exception 'NOT_ALLOWED';
    end if;
    if new.feedback_status is distinct from old.feedback_status
       or new.feedback_provided_by is distinct from old.feedback_provided_by then
      raise exception 'NOT_ALLOWED';
    end if;
  else
    raise exception 'NOT_ALLOWED';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_commitment_write() from public, anon, authenticated;

drop trigger if exists trg_guard_commitment_write on public.commitments;
create trigger trg_guard_commitment_write
  before insert or update on public.commitments
  for each row execute function public.guard_commitment_write();

-- Add WITH CHECK to both UPDATE policies (same expression as USING) so a row cannot be
-- handed to a different user/session by an update.
do $$
declare r record;
begin
  for r in
    select policyname, qual from pg_policies
     where schemaname = 'public' and tablename = 'commitments' and cmd = 'UPDATE'
  loop
    execute format('alter policy %I on public.commitments with check (%s)', r.policyname, r.qual);
  end loop;
end $$;
