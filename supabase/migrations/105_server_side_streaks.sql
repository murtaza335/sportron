-- SEC-H3 (+ BUG-H6): profile counters were client-writable (a user could PATCH their own
-- streak_count / longest_streak / completed_sessions / total_committed_sessions), and the
-- 'session_joined' streak never worked because the creator tried to update the participant's
-- profile (blocked by own-row RLS).
--
-- 1. Streaks are now computed in the DB (UTC days, same rules as src/services/streak.ts):
--      * after insert on community_matches  -> recorder
--      * after insert on sessions           -> creator
--      * commitment becomes 'accepted'      -> participant
--    plus an RPC record_streak_activity() for explicit calls.
-- 2. A BEFORE UPDATE guard on profiles silently keeps the old values of the protected columns
--    for client writes. It does NOT raise, so installed builds that still call updateStreak()
--    keep working (their write is simply ignored; the server owns the values).
--    Writes from other triggers (depth > 1: feedback/total_committed triggers) and from the
--    service role (auth.uid() is null: streak-cron) pass through.

create or replace function public._apply_streak_activity(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_last date;
  v_count int;
  v_longest int;
begin
  select last_activity_date, coalesce(streak_count, 0), coalesce(longest_streak, 0)
    into v_last, v_count, v_longest
    from public.profiles where id = p_user_id;
  if not found then
    return;
  end if;

  if v_last is null then
    v_count := 1;
  elsif v_last = v_today then
    v_count := greatest(v_count, 1);
  elsif v_last = v_today - 1 then
    v_count := v_count + 1;
  else
    v_count := 1;
  end if;
  v_longest := greatest(v_longest, v_count);

  perform set_config('app.bypass_profile_guard', 'on', true);
  update public.profiles
     set streak_count = v_count,
         longest_streak = v_longest,
         last_activity_date = v_today,
         streak_updated_at = now()
   where id = p_user_id;
  perform set_config('app.bypass_profile_guard', 'off', true);
end;
$$;

revoke all on function public._apply_streak_activity(uuid) from public, anon, authenticated;
grant execute on function public._apply_streak_activity(uuid) to service_role;

create or replace function public.record_streak_activity(p_activity text default 'match_recorded')
returns table (streak_count int, longest_streak int, last_activity_date date)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_activity not in ('match_recorded', 'session_joined', 'session_created') then
    raise exception 'INVALID_ACTIVITY';
  end if;
  perform public._apply_streak_activity(auth.uid());
  return query
    select p.streak_count, p.longest_streak, p.last_activity_date
      from public.profiles p where p.id = auth.uid();
end;
$$;

revoke all on function public.record_streak_activity(text) from public, anon;
grant execute on function public.record_streak_activity(text) to authenticated;

-- Triggers
create or replace function public.trg_streak_on_match()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._apply_streak_activity(new.recorded_by);
  return new;
end $$;

create or replace function public.trg_streak_on_session()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._apply_streak_activity(new.created_by);
  return new;
end $$;

create or replace function public.trg_streak_on_commitment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    perform public._apply_streak_activity(new.user_id);
  end if;
  return new;
end $$;

revoke all on function public.trg_streak_on_match() from public, anon, authenticated;
revoke all on function public.trg_streak_on_session() from public, anon, authenticated;
revoke all on function public.trg_streak_on_commitment() from public, anon, authenticated;

drop trigger if exists trg_streak_on_match on public.community_matches;
create trigger trg_streak_on_match after insert on public.community_matches
  for each row execute function public.trg_streak_on_match();

drop trigger if exists trg_streak_on_session on public.sessions;
create trigger trg_streak_on_session after insert on public.sessions
  for each row execute function public.trg_streak_on_session();

drop trigger if exists trg_streak_on_commitment on public.commitments;
create trigger trg_streak_on_commitment after insert or update of status on public.commitments
  for each row execute function public.trg_streak_on_commitment();

-- Guard
create or replace function public.guard_profile_protected_columns()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null
     or pg_trigger_depth() > 1
     or coalesce(current_setting('app.bypass_profile_guard', true), '') = 'on' then
    return new;
  end if;

  new.streak_count := old.streak_count;
  new.longest_streak := old.longest_streak;
  new.last_activity_date := old.last_activity_date;
  new.streak_updated_at := old.streak_updated_at;
  new.completed_sessions := old.completed_sessions;
  new.total_committed_sessions := old.total_committed_sessions;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_protected_columns on public.profiles;
create trigger trg_guard_profile_protected_columns
  before update on public.profiles
  for each row execute function public.guard_profile_protected_columns();
