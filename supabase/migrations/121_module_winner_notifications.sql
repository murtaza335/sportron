-- 121: richer "module completed" notifications.
--  * Champion(s) (entry profile + linked roster members) get a personal "🏆 You won …" message.
--  * Audience widened: module entrants/roster/module admins (as before) + tournament admins
--    + entrants of the other modules in the same tournament. Everyone is notified once.
-- Same type (`tournament_module_completed`) → no check-constraint change; additive (create or replace).
-- Still only while the tournament is `published`.

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
  v_champs uuid[] := '{}';
  v_data jsonb;
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
  if NEW.champion_entry_id is not null then
    v_champs := coalesce(public._entry_profile_ids(NEW.champion_entry_id), '{}');
  end if;

  v_body := '🏆 ' || coalesce(v_champion, 'The champion') || ' won ' || NEW.name || ' — ' || coalesce(v_tournament_name, '');
  v_data := jsonb_build_object('tournamentId', NEW.tournament_id, 'moduleId', NEW.id);

  for v_profile in
    select distinct p from (
      select e.profile_id as p from public.tournament_entries e where e.module_id = NEW.id and e.profile_id is not null
      union
      select tem.profile_id from public.tournament_entry_members tem where tem.module_id = NEW.id and tem.profile_id is not null
      union
      select a.profile_id from public.tournament_module_admins a where a.module_id = NEW.id
      union
      select ta.profile_id from public.tournament_admins ta where ta.tournament_id = NEW.tournament_id
      union
      select e2.profile_id from public.tournament_entries e2
        join public.tournament_modules m2 on m2.id = e2.module_id
        where m2.tournament_id = NEW.tournament_id and e2.profile_id is not null
      union
      select tem2.profile_id from public.tournament_entry_members tem2
        join public.tournament_modules m3 on m3.id = tem2.module_id
        where m3.tournament_id = NEW.tournament_id and tem2.profile_id is not null
    ) x where p is not null
  loop
    if v_profile = any (v_champs) then
      perform public._tournament_notify(
        v_profile,
        'tournament_module_completed',
        '🏆 You won ' || NEW.name || '!',
        'Congratulations — you are the champion of ' || NEW.name || ' · ' || coalesce(v_tournament_name, ''),
        v_data
      );
    else
      perform public._tournament_notify(
        v_profile,
        'tournament_module_completed',
        NEW.name || ' is complete',
        v_body,
        v_data
      );
    end if;
  end loop;
  return NEW;
end;
$$;
