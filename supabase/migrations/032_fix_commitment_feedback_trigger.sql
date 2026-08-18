-- Fix: handle_commitment_feedback runs as SECURITY DEFINER so the trigger can
-- update profiles.completed_sessions / total_committed_sessions for OTHER
-- participants. With SECURITY INVOKER the update ran under the session
-- creator's RLS, where the "Users can update their own profile" policy
-- (auth.uid() = id) silently filtered out every participant's row — the
-- counters never changed even though commitments.feedback_status was written.

drop function if exists public.handle_commitment_feedback() cascade;

create function public.handle_commitment_feedback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.feedback_status is not null then
    -- Always increment total_committed (first time feedback given)
    if old.feedback_status is null then
      update public.profiles
      set total_committed_sessions = total_committed_sessions + 1
      where id = new.user_id;
    end if;

    -- Increment completed if showed_up
    if new.feedback_status = 'showed_up' then
      if old.feedback_status is distinct from 'showed_up' then
        update public.profiles
        set completed_sessions = completed_sessions + 1
        where id = new.user_id;
      end if;
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