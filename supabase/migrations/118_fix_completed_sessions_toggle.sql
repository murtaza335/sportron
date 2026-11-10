-- BUG-M16: completed_sessions was incremented every time feedback went (back) to 'showed_up'
-- and never decremented when the creator corrected it, so toggling showed_up -> no_show ->
-- showed_up inflated the counter. The trigger is now symmetric (+1 entering 'showed_up',
-- -1 leaving it) and counters are repaired once from the commitments table.

create or replace function public.handle_commitment_feedback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.feedback_status = 'showed_up' then
      update public.profiles set completed_sessions = completed_sessions + 1 where id = new.user_id;
    end if;
    return new;
  end if;

  if new.feedback_status = 'showed_up' and old.feedback_status is distinct from 'showed_up' then
    update public.profiles set completed_sessions = completed_sessions + 1 where id = new.user_id;
  elsif old.feedback_status = 'showed_up' and new.feedback_status is distinct from 'showed_up' then
    update public.profiles
       set completed_sessions = greatest(0, completed_sessions - 1)
     where id = new.user_id;
  end if;

  return new;
end;
$$;

-- One-time repair of counters inflated by toggling.
update public.profiles p
   set completed_sessions = coalesce(c.cnt, 0)
  from (
    select pr.id, count(cm.id) filter (where cm.feedback_status = 'showed_up') as cnt
      from public.profiles pr
      left join public.commitments cm on cm.user_id = pr.id
     group by pr.id
  ) c
 where p.id = c.id
   and p.completed_sessions is distinct from coalesce(c.cnt, 0);
