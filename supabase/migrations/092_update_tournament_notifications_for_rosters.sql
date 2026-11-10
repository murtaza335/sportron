-- 092_update_tournament_notifications_for_rosters.sql
-- Tournaments v2 (rosters): team members get the notifications their team gets.
-- NO new notification types, NO change to the in_app_notifications.type check constraint.
-- See docs/tournaments/PLAN-v2.md §4.2. Only create-or-replace of the 088 trigger functions + one new trigger.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Member linked to an app user → tournament_entry_added (published tournaments only)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.trg_tournament_member_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module_name text;
  v_tournament_name text;
  v_status text;
  v_team text;
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

  select e.name into v_team from public.tournament_entries e where e.id = NEW.entry_id;

  perform public._tournament_notify(
    NEW.profile_id,
    'tournament_entry_added',
    'You''re on ' || coalesce(v_team, 'a team'),
    'You were added to ' || coalesce(v_team, 'a team') || ' in ' || coalesce(v_module_name, 'a module')
      || ' · ' || coalesce(v_tournament_name, 'a tournament') || '.',
    jsonb_build_object('tournamentId', NEW.tournament_id, 'moduleId', NEW.module_id,
                       'entryId', NEW.entry_id, 'memberId', NEW.id)
  );
  return NEW;
end;
$$;

drop trigger if exists trg_tournament_member_added on public.tournament_entry_members;
create trigger trg_tournament_member_added
  after insert or update of profile_id on public.tournament_entry_members
  for each row execute function public.trg_tournament_member_added();

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Match scheduled / result → every linked profile of both entries (entry + members)
--    (088 body, recipients widened; nothing else changed)
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
      select distinct p from unnest(
        public._entry_profile_ids(v_a.id) || public._entry_profile_ids(v_b.id)) p where p is not null
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
      select distinct p from unnest(
        public._entry_profile_ids(v_a.id) || public._entry_profile_ids(v_b.id)) p where p is not null
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

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Module completed → entrants, team members and module admins
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
      select tem.profile_id from public.tournament_entry_members tem where tem.module_id = NEW.id and tem.profile_id is not null
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
