-- BUG-H5: when a participant left a full session the client tried to set sessions.status back
-- to 'open', but the participant has no UPDATE right on sessions (RLS silently filtered it), so
-- the session stayed 'full' forever. Capacity status is now maintained in the database:
--   * a commitment leaving 'accepted' reopens a 'full' session that is below capacity;
--   * a commitment becoming 'accepted' marks an 'open' session 'full' at capacity.
-- The client-side updates in sessions.ts stay harmless (they simply no-op).

create or replace function public.sync_session_capacity_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max int;
  v_status text;
  v_accepted int;
begin
  if tg_op = 'UPDATE' and old.status = 'accepted' and new.status <> 'accepted' then
    -- participant removed from the accepted set
    null;
  elsif new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    null;
  else
    return new;
  end if;

  select max_participants, status into v_max, v_status
    from public.sessions where id = new.session_id for update;
  if v_max is null then
    return new;
  end if;

  select count(*) into v_accepted
    from public.commitments
   where session_id = new.session_id and status = 'accepted';

  if v_status = 'full' and v_accepted < v_max then
    update public.sessions set status = 'open' where id = new.session_id;
  elsif v_status = 'open' and v_accepted >= v_max then
    update public.sessions set status = 'full' where id = new.session_id;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_session_capacity_status() from public, anon, authenticated;

drop trigger if exists trg_sync_session_capacity_status on public.commitments;
create trigger trg_sync_session_capacity_status
  after insert or update of status on public.commitments
  for each row execute function public.sync_session_capacity_status();
