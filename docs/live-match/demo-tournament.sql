-- docs/live-match/demo-tournament.sql
-- Dummy data for demoing LIVE SCORING.
-- Creates a PUBLISHED tournament "Sportron Demo Cup" with 4 modules, each a single-elimination
-- bracket of 4 TEAMS (with named members) that is already generated and IN PROGRESS, so the
-- two semi-finals of every sport are ready to be scored live. No results are recorded.
--
--   Basketball     4 teams x 5 players (squad numbers, captain)
--   Volleyball     4 teams x 6 players
--   Table Tennis   4 doubles pairs
--   Badminton      4 doubles pairs
--
-- HOW TO RUN: Supabase SQL editor (runs as postgres). Set your username below, run the whole file.
-- Re-running is safe: it deletes the previous "Sportron Demo Cup" first (cascades everything).
-- To get a result for the demo: open the app > Tournaments > Sportron Demo Cup > a module > a
-- match > Start live scoring (needs the `live_scoring` feature flag ON for your account).
-- Cleanup only:  delete from public.tournaments where name = 'Sportron Demo Cup';

do $$
declare
  v_username text := 'CHANGE_ME';          -- <-- your profiles.username (becomes the tournament admin)

  v_admin uuid;
  v_t uuid;
  v_m uuid;
  v_cfg jsonb;
  v_c jsonb;
  v_team jsonb;
  v_members jsonb;
  v_i int;
  v_n int;
  v_sport_idx int := 0;
  -- name lists used to build players
  v_first text[] := array['Ali','Hamza','Usman','Bilal','Zain','Hassan','Omar','Saad','Faisal','Talha',
                          'Ahmed','Danish','Farhan','Haris','Imran','Junaid','Kamran','Luqman','Moiz','Nabeel',
                          'Owais','Qasim','Rehan','Shahid','Taimoor','Umair','Waqar','Yasir','Zeeshan','Adeel',
                          'Babar','Daniyal','Ehsan','Fahad','Ghazi','Hashir','Ibrahim','Jahanzaib','Kashif','Mubeen',
                          'Noman','Raza','Sami','Tariq','Uzair','Wasi','Zubair','Arslan'];
  v_last text[] := array['Khan','Malik','Sheikh','Butt','Raza','Chaudhry','Qureshi','Siddiqui'];
  v_schools text[] := array['SSE','SBASSE','SDSB','SAHSOL','SOL'];
begin
  select id into v_admin from public.profiles
  where lower(username) = lower(v_username) and deleted_at is null;
  if v_admin is null then
    raise exception 'No profile with username "%" - edit v_username at the top of the script', v_username;
  end if;

  delete from public.tournaments where name = 'Sportron Demo Cup';

  -- tournament (draft) + you as admin
  insert into public.tournaments (name, description, organization, location, starts_at, ends_at)
  values ('Sportron Demo Cup',
          'Demo tournament with dummy teams for trying out live scoring.',
          'Sportron Demo', 'Lahore',
          now() - interval '1 hour', now() + interval '7 days')
  returning id into v_t;
  insert into public.tournament_admins (tournament_id, profile_id) values (v_t, v_admin);

  -- act as the admin so the SECURITY DEFINER RPCs pass their auth.uid() checks
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);

  -- module config: sport, display name, team size, roster min/max, lineup, team names
  v_cfg := jsonb_build_array(
    jsonb_build_object('name','Basketball 5v5','sport','basketball','size',5,'min',5,'max',8,'lineup',5,
      'teams', jsonb_build_array('Lahore Hawks','Karachi Kings','Islamabad Wolves','Peshawar Panthers')),
    jsonb_build_object('name','Volleyball 6v6','sport','volleyball','size',6,'min',6,'max',9,'lineup',6,
      'teams', jsonb_build_array('Spike Squad','Block Party','Net Ninjas','Ace Aces')),
    jsonb_build_object('name','Table Tennis Doubles','sport','table_tennis','size',2,'min',2,'max',2,'lineup',2,
      'teams', jsonb_build_array('Topspin Titans','Smash Bros','Loop Legends','Paddle Pros')),
    jsonb_build_object('name','Badminton Doubles','sport','badminton','size',2,'min',2,'max',2,'lineup',2,
      'teams', jsonb_build_array('Shuttle Storm','Feather Force','Drop Shot Duo','Smash & Net'))
  );

  for v_c in select * from jsonb_array_elements(v_cfg) loop
    v_m := public.create_tournament_module(
      v_t, v_c ->> 'name', v_c ->> 'sport', null, null, 'Main Arena', now(), null, true, 'manual');
    perform public.update_tournament_module_settings(v_m, jsonb_build_object(
      'participant_type', 'team',
      'roster_min', (v_c ->> 'min')::int, 'roster_max', (v_c ->> 'max')::int,
      'lineup_size', (v_c ->> 'lineup')::int));
    perform public.set_module_status(v_m, 'open');

    v_n := (v_c ->> 'size')::int;
    v_i := 0;
    for v_team in select * from jsonb_array_elements(v_c -> 'teams') loop
      -- unique, readable players: "<First> <Last>", cms id "<sport>-<team#>-<player#>"
      select jsonb_agg(jsonb_build_object(
               'name', v_first[1 + ((v_sport_idx * 13 + v_i * 7 + p * 3) % array_length(v_first, 1))]
                       || ' ' || v_last[1 + ((v_i + p) % array_length(v_last, 1))],
               'is_captain', p = 1,
               'squad_number', case when (v_c ->> 'sport') in ('basketball','volleyball') then p end,
               'field_values', jsonb_build_object(
                  'cms_id', (v_c ->> 'sport') || '-' || (v_i + 1) || '-' || p,
                  'school', v_schools[1 + ((v_i + p) % array_length(v_schools, 1))],
                  'phone', '0300000' || lpad((v_sport_idx * 100 + v_i * 10 + p)::text, 4, '0'),
                  'email', 'demo.' || (v_c ->> 'sport') || '.' || (v_i + 1) || '.' || p || '@example.com'))
               order by p)
        into v_members
        from generate_series(1, v_n) p;

      perform public.upsert_team_entry(v_m, null, trim('"' from v_team::text), v_members);
      v_i := v_i + 1;
    end loop;

    perform public.set_module_status(v_m, 'seeding');
    perform public.generate_bracket(v_m);
    perform public.set_module_status(v_m, 'in_progress');
    v_sport_idx := v_sport_idx + 1;
  end loop;

  -- make it visible to everyone (admin-only while draft)
  update public.tournaments set status = 'published' where id = v_t;

  raise notice 'Created "Sportron Demo Cup" (id %) with 4 modules. Open it in the app > Tournaments.', v_t;
end $$;
