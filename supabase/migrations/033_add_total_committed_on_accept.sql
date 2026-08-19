-- Move the total_committed_sessions increment from feedback-time to the moment
-- a participant is actually accepted ("Yes, I'm In!" + creator approval), so the
-- profile counter reflects sessions the user committed to, not just ones they
-- later gave feedback on.
--
-- The increment is guarded so a user who leaves and re-applies to the SAME
-- session only counts it once (their profile value is a distinct-session count).

drop function if exists public.handle_commitment_feedback() cascade;

create function public.handle_commitment_feedback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Increment completed only when attendance feedback says they showed up
  if new.feedback_status = 'showed_up' then
    if old.feedback_status is distinct from 'showed_up' then
      update public.profiles
      set completed_sessions = completed_sessions + 1
      where id = new.user_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_commitments_feedback
  after insert or update of feedback_status
  on public.commitments
  for each row
  execute function public.handle_commitment_feedback();

-- Increment total_committed_sessions the first time a (re-)commitment for this
-- session becomes accepted.
create or replace function public.handle_commitment_total_committed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'accepted' and (TG_OP = 'INSERT' or old.status is distinct from 'accepted') then
    if not exists (
      select 1
      from public.commitments
      where session_id = new.session_id and user_id = new.user_id and id <> new.id
    ) then
      update public.profiles
      set total_committed_sessions = total_committed_sessions + 1
      where id = new.user_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_commitments_total_committed
  after insert or update of status
  on public.commitments
  for each row
  execute function public.handle_commitment_total_committed();