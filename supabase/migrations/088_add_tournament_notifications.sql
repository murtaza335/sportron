-- 088_add_tournament_notifications.sql
-- Tournament notifications (PLAN §8). In-app rows are created by DB triggers; the existing
-- trg_fcm_push → send-notification edge function (migration 035) delivers the push. NO edge
-- function change is needed. ADDITIVE ONLY apart from widening the type check constraint.
--
-- Old app builds: unknown types land in Past Activity and the tap handler ignores them.
--
-- Types: tournament_admin_assigned, tournament_module_admin_assigned, tournament_entry_added,
--        tournament_match_scheduled, tournament_match_result, tournament_module_completed
-- Non-admin notifications are only sent while the tournament is `published`.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Widen the type check constraint (082 list + 6 tournament types)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.in_app_notifications
  DROP CONSTRAINT IF EXISTS in_app_notifications_type_check;

ALTER TABLE public.in_app_notifications
  ADD CONSTRAINT in_app_notifications_type_check
  CHECK (type IN (
    'match_pending',
    'match_approved',
    'match_rejected',
    'match_liked',
    'match_commented',
    'session_application',
    'session_accepted',
    'session_rejected',
    'session_left',
    'session_reminder',
    'feedback_prompt',
    'ping',
    'join_request',
    'join_approved',
    'join_rejected',
    'match_approval_request',
    'match_approved_community',
    'match_disputed',
    'member_removed',
    'admin_transferred',
    'admin_promoted',
    'community_match_pending',
    'community_match_approved',
    'community_match_disputed',
    'community_invite',
    'community_invite_accepted',
    'community_invite_rejected',
    'session_chat_message',
    'session_chat_reply',
    'community_chat_message',
    'community_chat_reply',
    'streak_reminder',
    'streak_at_risk',
    'streak_milestone',
    'community_post_created',
    'community_post_liked',
    'community_post_commented',
    'member_joined',
    'community_engagement',
    'new_community',
    'tournament_admin_assigned',
    'tournament_module_admin_assigned',
    'tournament_entry_added',
    'tournament_match_scheduled',
    'tournament_match_result',
    'tournament_module_completed'
  ));

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Internal helper: insert one notification with the project's dedupe guard
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public._tournament_notify(
  p_user uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null then
    return;
  end if;
  if public._notification_already_exists(p_user, p_type, p_data) then
    return;
  end if;
  insert into public.in_app_notifications (user_id, type, title, body, data)
  values (p_user, p_type, p_title, p_body, p_data);
end;
$$;
revoke all on function public._tournament_notify(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Tournament admin assigned (always, even while the tournament is draft)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.trg_tournament_admin_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select t.name into v_name from public.tournaments t where t.id = NEW.tournament_id;
  perform public._tournament_notify(
    NEW.profile_id,
    'tournament_admin_assigned',
    'You''re a tournament admin',
    'You can now manage ' || coalesce(v_name, 'a tournament') || '.',
    jsonb_build_object('tournamentId', NEW.tournament_id)
  );
  return NEW;
end;
$$;

drop trigger if exists trg_tournament_admin_assigned on public.tournament_admins;
create trigger trg_tournament_admin_assigned
  after insert on public.tournament_admins
  for each row execute function public.trg_tournament_admin_assigned();

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Module admin assigned
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.trg_tournament_module_admin_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module_name text;
  v_tournament_id uuid;
  v_tournament_name text;
begin
  select m.name, m.tournament_id, t.name
    into v_module_name, v_tournament_id, v_tournament_name
  from public.tournament_modules m
  join public.tournaments t on t.id = m.tournament_id
  where m.id = NEW.module_id;

  perform public._tournament_notify(
    NEW.profile_id,
    'tournament_module_admin_assigned',
    'You''re a module admin',
    'You can now manage ' || coalesce(v_module_name, 'a module') || ' in ' || coalesce(v_tournament_name, 'a tournament') || '.',
    jsonb_build_object('tournamentId', v_tournament_id, 'moduleId', NEW.module_id)
  );
  return NEW;
end;
$$;

drop trigger if exists trg_tournament_module_admin_assigned on public.tournament_module_admins;
create trigger trg_tournament_module_admin_assigned
  after insert on public.tournament_module_admins
  for each row execute function public.trg_tournament_module_admin_assigned();

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Entry added for a linked app user
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.trg_tournament_entry_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module_name text;
  v_tournament_name text;
  v_status text;
begin
  if NEW.profile_id is null then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and OLD.profile_id is not distinct from NEW.profile_id then
    return NEW;
  end if;

  select m.name, t.name, t.status into v_module_name, v_tournament_name, v_status
  from public.tournament_modules m
  join public.tournaments t on t.id = m.tournament_id
  where m.id = NEW.module_id;

  if v_status is distinct from 'published' then
    return NEW;
  end if;

  perform public._tournament_notify(
    NEW.profile_id,
    'tournament_entry_added',
    'You''re in ' || coalesce(v_module_name, 'a tournament module'),
    'You were added to ' || coalesce(v_module_name, 'a module') || ' in ' || coalesce(v_tournament_name, 'a tournament') || '.',
    jsonb_build_object('tournamentId', NEW.tournament_id, 'moduleId', NEW.module_id, 'entryId', NEW.id)
  );
  return NEW;
end;
$$;

drop trigger if exists trg_tournament_entry_added on public.tournament_entries;
create trigger trg_tournament_entry_added
  after insert or update of profile_id on public.tournament_entries
  for each row execute function public.trg_tournament_entry_added();

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Match scheduled / result → linked profiles of both entries
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.trg_tournament_match_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_id uuid;
  v_tournament_status text;
  v_module_name text;
  v_round_name text;
  v_a public.tournament_entries;
  v_b public.tournament_entries;
  v_winner_name text;
  v_loser_name text;
  v_score text;
  v_when text;
  v_data jsonb;
  v_profile uuid;
begin
  if NEW.entry_a_id is null or NEW.entry_b_id is null then
    return NEW;
  end if;

  select m.tournament_id, m.name, t.status
    into v_tournament_id, v_module_name, v_tournament_status
  from public.tournament_modules m
  join public.tournaments t on t.id = m.tournament_id
  where m.id = NEW.module_id;

  if v_tournament_status is distinct from 'published' then
    return NEW;
  end if;

  select r.name into v_round_name from public.tournament_rounds r where r.id = NEW.round_id;
  select * into v_a from public.tournament_entries where id = NEW.entry_a_id;
  select * into v_b from public.tournament_entries where id = NEW.entry_b_id;
  v_data := jsonb_build_object('tournamentId', v_tournament_id, 'moduleId', NEW.module_id, 'matchId', NEW.id);

  -- Scheduled (time set or changed while undecided)
  if NEW.scheduled_at is not null
     and NEW.status in ('pending','scheduled')
     and NEW.scheduled_at is distinct from OLD.scheduled_at then
    v_when := to_char(NEW.scheduled_at at time zone 'Asia/Karachi', 'Dy DD Mon, HH12:MI AM');
    for v_profile in
      select distinct p from unnest(array[v_a.profile_id, v_b.profile_id]) p where p is not null
    loop
      perform public._tournament_notify(
        v_profile,
        'tournament_match_scheduled',
        'Match scheduled',
        coalesce(v_a.name, 'TBD') || ' vs ' || coalesce(v_b.name, 'TBD') || ' · '
          || coalesce(v_round_name, 'Match') || ' · ' || v_when || ' (PKT)'
          || coalesce(' · ' || nullif(concat_ws(' ', NEW.venue, NEW.court), ''), ''),
        v_data
      );
    end loop;
  end if;

  -- Result (status becomes decided, or the winner changed on an edit)
  if NEW.status in ('completed','walkover')
     and (OLD.status is distinct from NEW.status or OLD.winner_entry_id is distinct from NEW.winner_entry_id) then
    if NEW.winner_entry_id = v_a.id then
      v_winner_name := v_a.name; v_loser_name := v_b.name;
    else
      v_winner_name := v_b.name; v_loser_name := v_a.name;
    end if;
    v_score := case
      when NEW.status = 'walkover' then ' (walkover)'
      when NEW.score_a is not null and NEW.score_b is not null then ' ' || NEW.score_a || '–' || NEW.score_b
      else ''
    end;
    for v_profile in
      select distinct p from unnest(array[v_a.profile_id, v_b.profile_id]) p where p is not null
    loop
      perform public._tournament_notify(
        v_profile,
        'tournament_match_result',
        'Match result',
        v_winner_name || ' beat ' || v_loser_name || v_score || ' · ' || coalesce(v_round_name, 'Match')
          || ' · ' || coalesce(v_module_name, ''),
        v_data
      );
    end loop;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_tournament_match_events on public.tournament_matches;
create trigger trg_tournament_match_events
  after update on public.tournament_matches
  for each row execute function public.trg_tournament_match_events();

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Module completed → all linked entrants + module admins
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.trg_tournament_module_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_name text;
  v_tournament_status text;
  v_champion text;
  v_profile uuid;
  v_body text;
begin
  if NEW.status <> 'completed' or OLD.status = 'completed' then
    return NEW;
  end if;

  select t.name, t.status into v_tournament_name, v_tournament_status
  from public.tournaments t where t.id = NEW.tournament_id;
  if v_tournament_status is distinct from 'published' then
    return NEW;
  end if;

  select e.name into v_champion from public.tournament_entries e where e.id = NEW.champion_entry_id;
  v_body := '🏆 ' || coalesce(v_champion, 'The champion') || ' won ' || NEW.name || ' — ' || coalesce(v_tournament_name, '');

  for v_profile in
    select distinct p from (
      select e.profile_id as p from public.tournament_entries e where e.module_id = NEW.id and e.profile_id is not null
      union
      select a.profile_id from public.tournament_module_admins a where a.module_id = NEW.id
    ) x where p is not null
  loop
    perform public._tournament_notify(
      v_profile,
      'tournament_module_completed',
      NEW.name || ' is complete',
      v_body,
      jsonb_build_object('tournamentId', NEW.tournament_id, 'moduleId', NEW.id)
    );
  end loop;
  return NEW;
end;
$$;

drop trigger if exists trg_tournament_module_completed on public.tournament_modules;
create trigger trg_tournament_module_completed
  after update of status on public.tournament_modules
  for each row execute function public.trg_tournament_module_completed();
