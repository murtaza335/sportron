-- docs/tournaments/sql-tests-v2.sql
-- Tournament v2 DB tests (rosters, formats). Run AFTER sql-tests.sql passes and after applying 090+.
-- Same harness and the same 3 steps as sql-tests.sql (helpers → one self-rolling-back DO → cleanup).
-- STEP 2 ends by raising "ALL TESTS PASSED — rolled back, nothing saved": that "error" IS success.
-- NOTE: the editor runs as the table owner, so RLS itself is not exercised here; PII is tested through the RPCs.
-- Needs >= 4 existing, non-deleted profiles (tournament admin, stranger, linked member, 2nd member).

-- ═══════════════════════════ STEP 1: helpers ═══════════════════════════
drop schema if exists tt_test cascade;
create schema tt_test;

create function tt_test.put(p_k text, p_v text) returns void language plpgsql as $$
begin
  perform set_config('tt.' || p_k, p_v, true);
end $$;

create function tt_test.ctx(p_k text) returns text language sql stable as
  $$ select nullif(current_setting('tt.' || p_k, true), '') $$;

create function tt_test.as_user(p_k text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', tt_test.ctx(p_k), 'role', 'authenticated')::text, true);
end $$;

create function tt_test.chk(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAIL: %', p_msg; end if;
  raise notice 'PASS: %', p_msg;
end $$;

create function tt_test.expect_err(p_sql text, p_code text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like p_code || '%' then
      raise notice 'PASS: % (got %)', p_msg, sqlerrm;
      return;
    end if;
    raise exception 'FAIL: % — expected % but got: %', p_msg, p_code, sqlerrm;
  end;
  raise exception 'FAIL: % — expected error % but the call succeeded', p_msg, p_code;
end $$;

-- one roster member payload: cms id '<prefix>-<i>'
create function tt_test.mem(p_prefix text, i int) returns jsonb language sql as $$
  select jsonb_build_object('name', p_prefix || ' Player ' || i,
    'field_values', jsonb_build_object('cms_id', p_prefix || '-' || i, 'school', 'S' || (i % 3),
                                       'phone', '03001234567', 'email', p_prefix || i || '@example.com'))
$$;

-- roster of n members (no captain, no squad numbers)
create function tt_test.roster(p_prefix text, n int) returns jsonb language sql as $$
  select coalesce(jsonb_agg(tt_test.mem(p_prefix, g) order by g), '[]'::jsonb) from generate_series(1, n) g
$$;

-- team module (sport p_sport) with roster p_min..p_max, status 'open', as admin
create function tt_test.mk_team_module(p_name text, p_sport text, p_min int, p_max int, p_third boolean)
returns uuid language plpgsql as $$
declare v_t uuid := tt_test.ctx('t')::uuid; v_m uuid;
begin
  perform tt_test.as_user('admin');
  v_m := public.create_tournament_module(v_t, p_name, p_sport, null, null, null, null, null, p_third, 'manual');
  perform public.update_tournament_module_settings(v_m, jsonb_build_object(
    'participant_type', 'team', 'roster_min', p_min, 'roster_max', p_max, 'lineup_size', p_min));
  perform public.set_module_status(v_m, 'open');
  return v_m;
end $$;

-- individual module with n entries named P1..Pn (cms '<name>-i'), format settings applied, status 'seeding' → generated → in_progress
create function tt_test.mk_format(p_name text, p_sport text, p_n int, p_settings jsonb, p_start boolean default true)
returns uuid language plpgsql as $$
declare v_t uuid := tt_test.ctx('t')::uuid; v_m uuid; i int;
begin
  perform tt_test.as_user('admin');
  v_m := public.create_tournament_module(v_t, p_name, p_sport, null, null, null, null, null, false, 'manual');
  if p_settings is not null then perform public.update_tournament_module_settings(v_m, p_settings); end if;
  perform public.set_module_status(v_m, 'open');
  for i in 1..p_n loop
    perform public.upsert_tournament_entry(v_m, null, 'P' || i, null,
      jsonb_build_object('cms_id', p_name || '-' || i, 'school', 'S' || (i % 3),
                         'phone', '03001234567', 'email', 'p' || i || '@example.com'));
  end loop;
  perform public.set_module_status(v_m, 'seeding');
  if p_start then
    perform public.generate_bracket(v_m);
    perform public.set_module_status(v_m, 'in_progress');
  end if;
  return v_m;
end $$;

-- entry id by name inside a module
create function tt_test.eid(p_m uuid, p_name text) returns uuid language sql stable as
  $$ select id from public.tournament_entries where module_id = p_m and name = p_name $$;

-- record "x scores sx, y scores sy" on the match between entries named x and y
create function tt_test.rec(p_m uuid, p_x text, p_y text, p_sx int, p_sy int) returns void language plpgsql as $$
declare v_x uuid := tt_test.eid(p_m, p_x); v_y uuid := tt_test.eid(p_m, p_y); v_match public.tournament_matches;
begin
  perform tt_test.as_user('admin');
  select * into v_match from public.tournament_matches
  where module_id = p_m and ((entry_a_id = v_x and entry_b_id = v_y) or (entry_a_id = v_y and entry_b_id = v_x)) limit 1;
  if v_match.id is null then raise exception 'FAIL: no match between % and %', p_x, p_y; end if;
  if v_match.entry_a_id = v_x then
    perform public.record_tournament_result(v_match.id, p_sx, p_sy, null, null, null);
  else
    perform public.record_tournament_result(v_match.id, p_sy, p_sx, null, null, null);
  end if;
end $$;

-- play every playable match (side A wins 3–1) until nothing is left
create function tt_test.play_all(p_m uuid) returns void language plpgsql as $$
declare v_id uuid; guard int := 0;
begin
  perform tt_test.as_user('admin');
  loop
    select id into v_id from public.tournament_matches
    where module_id = p_m and status in ('pending','scheduled')
      and entry_a_id is not null and entry_b_id is not null
    order by is_third_place, round_number, match_number limit 1;
    exit when v_id is null;
    perform public.record_tournament_result(v_id, 3, 1, null, null, null);
    guard := guard + 1;
    if guard > 800 then raise exception 'FAIL: play_all runaway'; end if;
  end loop;
end $$;

-- ═══════════════════════════ STEP 2: the tests (single DO, self-rolling-back) ═══════════════════════════
do $$
begin
  -- ── section 0: setup
  declare v_ids uuid[]; v_t uuid;
  begin
    select array_agg(id) into v_ids from (
      select id from public.profiles where deleted_at is null order by created_at limit 4) x;
    if coalesce(array_length(v_ids, 1), 0) < 4 then
      raise exception 'Need at least 4 profiles to run these tests';
    end if;
    perform tt_test.put('admin', v_ids[1]::text);
    perform tt_test.put('stranger', v_ids[2]::text);
    perform tt_test.put('member', v_ids[3]::text);
    perform tt_test.put('member2', v_ids[4]::text);

    insert into public.tournaments (name, status) values ('V2 SQL Test Cup', 'published') returning id into v_t;
    insert into public.tournament_admins (tournament_id, profile_id) values (v_t, v_ids[1]);
    perform tt_test.put('t', v_t::text);
  end;

  -- ── section R1: rosters (steps 25–26)
  declare v_t uuid := tt_test.ctx('t')::uuid; v_m uuid; v_d uuid; v_e uuid; v_e2 uuid; v_json jsonb; v_rec record;
  begin
    perform tt_test.as_user('admin');
    v_m := tt_test.mk_team_module('Foot2', 'football', 3, 5, false);
    perform tt_test.expect_err(
      format('select public.update_tournament_module_settings(%L, %L::jsonb)', v_m, '{"participant_type":"individual"}'),
      'FIELD_INVALID:participant_type', 'a team sport cannot be switched to individual entries');

    perform tt_test.expect_err(
      format('select public.upsert_tournament_entry(%L,null,%L,null,%L::jsonb)', v_m, 'Solo', '{}'),
      'WRONG_PARTICIPANT_TYPE', 'upsert_tournament_entry rejects team modules');

    -- empty / small / full / too large rosters
    v_e := public.upsert_team_entry(v_m, null, 'Thunder FC', '[]'::jsonb);
    perform tt_test.chk(v_e is not null, 'a team with 0 members can be saved while open (B6)');
    perform tt_test.expect_err(
      format('select public.upsert_team_entry(%L,null,%L,%L::jsonb)', v_m, 'Big', tt_test.roster('big', 6)),
      'ROSTER_TOO_LARGE', 'roster above roster_max rejected');
    v_e2 := public.upsert_team_entry(v_m, null, 'Lions', tt_test.roster('lion', 5));
    perform tt_test.chk((select count(*) from public.tournament_entry_members where entry_id = v_e2) = 5,
                        'a team with 5 members saved');

    -- duplicates
    perform tt_test.expect_err(
      format('select public.upsert_team_entry(%L,null,%L,%L::jsonb)', v_m, 'Clone', tt_test.roster('lion', 3)),
      'DUPLICATE_MEMBER_CMS_ID', 'same CMS ID on another team rejected');
    perform tt_test.expect_err(
      format('select public.upsert_team_entry(%L,null,%L,%L::jsonb)', v_m, 'Twin',
        (select jsonb_build_array(
            tt_test.mem('tw', 1) || jsonb_build_object('profile_id', tt_test.ctx('member')),
            tt_test.mem('tw', 2) || jsonb_build_object('profile_id', tt_test.ctx('member')),
            tt_test.mem('tw', 3)))),
      'DUPLICATE_MEMBER_PROFILE@1', 'same profile twice in one payload rejected with index');

    -- captain / squad numbers
    perform tt_test.expect_err(
      format('select public.upsert_team_entry(%L,null,%L,%L::jsonb)', v_m, 'Cap',
        jsonb_build_array(tt_test.mem('cp', 1) || '{"is_captain":true}'::jsonb,
                          tt_test.mem('cp', 2) || '{"is_captain":true}'::jsonb, tt_test.mem('cp', 3))),
      'FIELD_INVALID:is_captain', 'two captains rejected');
    perform tt_test.expect_err(
      format('select public.upsert_team_entry(%L,null,%L,%L::jsonb)', v_m, 'Sq',
        jsonb_build_array(tt_test.mem('sq', 1) || '{"squad_number":7}'::jsonb,
                          tt_test.mem('sq', 2) || '{"squad_number":7}'::jsonb, tt_test.mem('sq', 3))),
      'DUPLICATE_SQUAD_NUMBER', 'duplicate squad number rejected');

    -- member field validation carries the member index
    perform tt_test.expect_err(
      format('select public.upsert_team_entry(%L,null,%L,%L::jsonb)', v_m, 'Bad',
        jsonb_build_array(tt_test.mem('bd', 1),
                          jsonb_build_object('name', 'No Cms', 'field_values', '{"school":"S","phone":"03001234567","email":"a@b.co"}'::jsonb),
                          tt_test.mem('bd', 3))),
      'FIELD_REQUIRED:cms_id@1', 'member field errors carry @index');
    perform tt_test.expect_err(
      format('select public.upsert_team_entry(%L,null,%L,%L::jsonb)', v_m, 'Bad2',
        jsonb_build_array(tt_test.mem('be', 1) || '{"field_values":{"cms_id":"be-1","school":"S","phone":"03001234567","email":"nope"}}'::jsonb)),
      'FIELD_INVALID:email@0', 'invalid member email carries @0');

    -- edit: swap captain, add / remove members (full-roster semantics)
    v_json := (select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'field_values', field_values,
                                                   'is_captain', false, 'squad_number', null) order by sort_order)
               from public.tournament_entry_members where entry_id = v_e2);
    v_json := jsonb_set(v_json, '{0,is_captain}', 'true'::jsonb);
    v_json := jsonb_set(v_json, '{0,squad_number}', '10'::jsonb);
    v_json := jsonb_set(v_json, '{1,squad_number}', '7'::jsonb);
    perform public.upsert_team_entry(v_m, v_e2, 'Lions FC', v_json - 4 - 3);   -- drop the last two → 3 left
    perform tt_test.chk((select count(*) from public.tournament_entry_members where entry_id = v_e2) = 3
                        and (select name from public.tournament_entries where id = v_e2) = 'Lions FC'
                        and (select count(*) from public.tournament_entry_members
                             where entry_id = v_e2 and is_captain and squad_number = 10) = 1,
                        'edit replaces the roster (removed members deleted, captain + numbers set)');

    -- foreign member id → NOT_FOUND
    perform tt_test.expect_err(
      format('select public.upsert_team_entry(%L,%L,%L,%L::jsonb)', v_m, v_e, 'Thunder FC',
        jsonb_build_array(tt_test.mem('x', 1) || jsonb_build_object('id', (select id from public.tournament_entry_members where entry_id = v_e2 limit 1)))),
      'NOT_FOUND', 'member id of another team rejected');

    -- open → seeding blocked while a roster is incomplete (Thunder FC has 0)
    perform tt_test.expect_err(format('select public.set_module_status(%L,%L)', v_m, 'seeding'),
      'ROSTER_INCOMPLETE', 'open → seeding needs complete rosters');
    perform public.upsert_team_entry(v_m, v_e, 'Thunder FC', tt_test.roster('thu', 4));
    perform public.set_module_status(v_m, 'seeding');
    perform tt_test.chk((select count(*) from public.get_module_entries(v_m)) = 2, 'seeding reached with 2 complete teams');

    -- in seeding a roster may not go below roster_min
    perform tt_test.expect_err(
      format('select public.upsert_team_entry(%L,%L,%L,%L::jsonb)', v_m, v_e, 'Thunder FC', tt_test.roster('thu', 2)),
      'ROSTER_INCOMPLETE', 'roster below roster_min rejected from seeding onwards');

    -- roster_max cannot go below an existing team
    perform tt_test.expect_err(
      format('select public.update_tournament_module_settings(%L,%L::jsonb)', v_m, '{"roster_max":3}'),
      'ROSTER_TOO_LARGE', 'cannot lower roster_max below an existing team');  -- Thunder has 4

    -- unknown keys
    perform tt_test.expect_err(
      format('select public.update_tournament_module_settings(%L,%L::jsonb)', v_m, '{"bogus":1}'),
      'FIELD_INVALID:bogus', 'unknown settings key rejected');

    -- a stranger cannot write
    perform tt_test.as_user('stranger');
    perform tt_test.expect_err(
      format('select public.upsert_team_entry(%L,null,%L,%L::jsonb)', v_m, 'Hax', '[]'),
      'NOT_ALLOWED', 'plain user cannot create a team');
  end;

  -- ── section R2: doubles + PII + roles + a full single-elimination run with teams
  declare
    v_t uuid := tt_test.ctx('t')::uuid; v_m uuid; v_e uuid; i int; v_row record; v_ok boolean; v_fields jsonb;
  begin
    perform tt_test.as_user('admin');
    v_m := tt_test.mk_team_module('Doubles', 'badminton', 2, 2, false);
    -- 4 doubles teams; the first team's player 1 is linked to the 'member' profile
    v_e := public.upsert_team_entry(v_m, null, 'Ali / Omar', jsonb_build_array(
      tt_test.mem('d1', 1) || jsonb_build_object('profile_id', tt_test.ctx('member')),
      tt_test.mem('d1', 2)));
    for i in 2..4 loop
      perform public.upsert_team_entry(v_m, null, 'Pair ' || i, tt_test.roster('d' || i, 2));
    end loop;
    perform tt_test.expect_err(
      format('select public.upsert_team_entry(%L,null,%L,%L::jsonb)', v_m, 'Triple', tt_test.roster('d9', 3)),
      'ROSTER_TOO_LARGE', 'doubles module takes exactly 2 players');

    -- PII: admin sees everything, the linked member only their own private fields, a stranger none
    select members into v_fields from public.get_module_entries(v_m) where id = v_e;
    perform tt_test.chk((v_fields -> 0 -> 'fields') ? 'cms_id' and (v_fields -> 1 -> 'fields') ? 'cms_id',
                        'admin sees every member''s private fields');
    perform tt_test.as_user('member');
    select members into v_fields from public.get_module_entries(v_m) where id = v_e;
    perform tt_test.chk((v_fields -> 0 -> 'fields') ? 'cms_id' and not ((v_fields -> 1 -> 'fields') ? 'cms_id')
                        and (v_fields -> 1 -> 'fields') ? 'school',
                        'linked member sees own private fields, teammates only public ones');
    perform tt_test.as_user('stranger');
    select members into v_fields from public.get_module_entries(v_m) where id = v_e;
    perform tt_test.chk(not ((v_fields -> 0 -> 'fields') ? 'cms_id') and not ((v_fields -> 0 -> 'fields') ? 'email')
                        and (v_fields -> 0 -> 'fields') ? 'school',
                        'stranger sees public member fields only');

    -- roles
    perform tt_test.as_user('member');
    perform tt_test.chk((select my_role from public.get_tournaments('all') where id = v_t) = 'entrant',
                        'linked member has my_role = entrant in get_tournaments');
    perform tt_test.chk(public.get_module_detail(v_m) ->> 'my_role' = 'entrant', 'linked member has my_role = entrant in get_module_detail');
    perform tt_test.chk(public.get_tournament_detail(v_t) ->> 'my_role' = 'entrant', 'linked member has my_role = entrant in get_tournament_detail');
    perform tt_test.as_user('stranger');
    perform tt_test.chk(coalesce((select my_role from public.get_tournaments('all') where id = v_t), 'none') = 'none',
                        'stranger has no role');

    -- profile_ids in bracket entry refs; full run to completion with teams
    perform tt_test.as_user('admin');
    perform public.set_module_status(v_m, 'seeding');
    perform public.generate_bracket(v_m);
    perform public.set_module_status(v_m, 'in_progress');
    perform tt_test.chk((select bool_or((entry_a -> 'profile_ids') ? tt_test.ctx('member')
                                       or (entry_b -> 'profile_ids') ? tt_test.ctx('member'))
                         from public.get_module_bracket(v_m)), 'bracket entry refs carry profile_ids');
    perform tt_test.play_all(v_m);
    perform tt_test.chk((select status = 'completed' and champion_entry_id is not null
                         from public.tournament_modules where id = v_m), 'doubles single-elim module completes');

    -- roster stays editable (B5) only until completed
    perform tt_test.expect_err(
      format('select public.upsert_team_entry(%L,%L,%L,%L::jsonb)', v_m, v_e, 'Late', tt_test.roster('d1', 2)),
      'INVALID_STATUS', 'completed module rosters are read-only');
  end;

  -- ── section R3: roster notifications (step 27)
  declare v_t uuid := tt_test.ctx('t')::uuid; v_m uuid; v_a uuid; v_b uuid; v_match uuid; v_before int;
  begin
    perform tt_test.as_user('admin');
    v_m := tt_test.mk_team_module('NotifyTeams', 'football', 2, 4, false);
    v_before := (select count(*) from public.in_app_notifications where user_id = tt_test.ctx('member')::uuid);
    v_a := public.upsert_team_entry(v_m, null, 'Reds', jsonb_build_array(
      tt_test.mem('nr', 1) || jsonb_build_object('profile_id', tt_test.ctx('member')),
      tt_test.mem('nr', 2) || jsonb_build_object('profile_id', tt_test.ctx('member2')),
      tt_test.mem('nr', 3)));
    perform tt_test.chk((select count(*) from public.in_app_notifications
                         where user_id = tt_test.ctx('member')::uuid and type = 'tournament_entry_added'
                           and data ->> 'moduleId' = v_m::text) = 1,
                        'linked member is notified when added to a team (published tournament)');
    v_b := public.upsert_team_entry(v_m, null, 'Blues', tt_test.roster('nb', 2));
    perform public.set_module_status(v_m, 'seeding');
    perform public.generate_bracket(v_m);
    perform public.set_module_status(v_m, 'in_progress');
    select id into v_match from public.tournament_matches where module_id = v_m and entry_a_id is not null and entry_b_id is not null limit 1;
    perform public.record_tournament_result(v_match, 3, 1, null, null, null);
    perform tt_test.chk((select count(*) from public.in_app_notifications
                         where user_id in (tt_test.ctx('member')::uuid, tt_test.ctx('member2')::uuid)
                           and type = 'tournament_match_result' and data ->> 'matchId' = v_match::text) = 2,
                        'a team of 3 with 2 linked members yields 2 result notifications');

    -- draft tournament: nothing is sent
    update public.tournaments set status = 'draft' where id = v_t;
    v_before := (select count(*) from public.in_app_notifications where user_id = tt_test.ctx('stranger')::uuid);
    declare v_m2 uuid; begin
      v_m2 := tt_test.mk_team_module('QuietTeams', 'football', 2, 4, false);
      perform public.upsert_team_entry(v_m2, null, 'Quiet', jsonb_build_array(
        tt_test.mem('qq', 1) || jsonb_build_object('profile_id', tt_test.ctx('stranger')), tt_test.mem('qq', 2)));
    end;
    perform tt_test.chk((select count(*) from public.in_app_notifications where user_id = tt_test.ctx('stranger')::uuid) = v_before,
                        'a member linked while the tournament is draft gets nothing');
    update public.tournaments set status = 'published' where id = v_t;
  end;

  -- ── section F0: format settings (step 32)
  declare v_t uuid := tt_test.ctx('t')::uuid; v_m uuid; v_r uuid;
  begin
    perform tt_test.as_user('admin');
    v_m := public.create_tournament_module(v_t, 'Fmt', 'football', null, null, null, null, null, false, 'manual');
    perform public.update_tournament_module_settings(v_m,
      '{"participant_type":"team","roster_min":3,"roster_max":5,"format":"round_robin","allow_draws":true,"rr_legs":2,"points_win":3,"points_draw":1,"points_loss":0}'::jsonb);
    perform tt_test.chk((select format = 'round_robin' and allow_draws and rr_legs = 2 from public.tournament_modules where id = v_m),
                        'format settings saved');
    perform tt_test.expect_err(format('select public.update_tournament_module_settings(%L,%L::jsonb)', v_m, '{"points_win":1,"points_draw":1}'),
      'FIELD_INVALID:points', 'win must beat draw');
    perform tt_test.expect_err(format('select public.update_tournament_module_settings(%L,%L::jsonb)', v_m, '{"group_count":4}'),
      'FIELD_INVALID:group_count', 'group_count only for groups_knockout');
    perform tt_test.expect_err(format('select public.update_tournament_module_settings(%L,%L::jsonb)', v_m, '{"grand_final_reset":false}'),
      'FIELD_INVALID:grand_final_reset', 'grand_final_reset only for double elimination');
    perform public.update_tournament_module_settings(v_m, '{"format":"groups_knockout","group_count":4,"advance_per_group":2}'::jsonb);
    perform tt_test.chk((select group_count = 4 and advance_per_group = 2 from public.tournament_modules where id = v_m), 'group settings saved');
    perform public.update_tournament_module_settings(v_m, '{"format":"single_elimination","allow_draws":false}'::jsonb);
    perform tt_test.expect_err(format('select public.update_tournament_module_settings(%L,%L::jsonb)', v_m, '{"allow_draws":true}'),
      'FIELD_INVALID:allow_draws', 'draws only for league / groups');
    -- racket sports can never allow draws
    v_r := public.create_tournament_module(v_t, 'FmtR', 'badminton', null, null, null, null, null, false, 'manual');
    perform tt_test.expect_err(format('select public.update_tournament_module_settings(%L,%L::jsonb)', v_r, '{"format":"round_robin","allow_draws":true}'),
      'FIELD_INVALID:allow_draws', 'racket sports cannot allow draws');
    perform tt_test.expect_err(format('select public.update_tournament_module_settings(%L,%L::jsonb)', v_r, '{"format":"nonsense"}'),
      'FIELD_INVALID:format', 'unknown format rejected');
    perform tt_test.chk(exists (select 1 from pg_indexes where indexname = 'tmatch_unique_v2'), 'v2 unique index on matches exists');
  end;

  -- ── section L1: round-robin structure (step 33)
  declare n int; legs int; v_m uuid; v_rounds int; v_expected int;
  begin
    for n in 2..7 loop
      for legs in 1..2 loop
        v_m := tt_test.mk_format('RR' || n || '_' || legs, 'table_tennis', n,
                 jsonb_build_object('format', 'round_robin', 'rr_legs', legs));
        v_expected := legs * n * (n - 1) / 2;
        perform tt_test.chk((select count(*) from public.tournament_matches where module_id = v_m and bracket_side = 'league') = v_expected,
          format('RR n=%s legs=%s creates %s matches', n, legs, v_expected));
        perform tt_test.chk(not exists (
            select 1 from (select least(entry_a_id, entry_b_id) a, greatest(entry_a_id, entry_b_id) b, count(*) c
                           from public.tournament_matches where module_id = v_m group by 1, 2) x where x.c <> legs)
          and (select count(*) from (select distinct least(entry_a_id, entry_b_id), greatest(entry_a_id, entry_b_id)
                                     from public.tournament_matches where module_id = v_m) d) = n * (n - 1) / 2,
          format('RR n=%s legs=%s: every pair meets exactly %s time(s)', n, legs, legs));
        perform tt_test.chk(not exists (
            select 1 from (select tm.round_number, v.e from public.tournament_matches tm
                           cross join lateral (values (tm.entry_a_id), (tm.entry_b_id)) v(e)
                           where tm.module_id = v_m) x group by x.round_number, x.e having count(*) > 1),
          format('RR n=%s legs=%s: nobody plays twice in a matchday', n, legs));
        v_rounds := (select count(distinct round_number) from public.tournament_matches where module_id = v_m);
        perform tt_test.chk(not exists (
            select 1 from public.tournament_entries e
            where e.module_id = v_m
              and v_rounds - (select count(*) from public.tournament_matches tm
                              where tm.module_id = v_m and (tm.entry_a_id = e.id or tm.entry_b_id = e.id))
                  <> case when n % 2 = 1 then legs else 0 end),
          format('RR n=%s legs=%s: rest days are right (odd n rests once per leg)', n, legs));
      end loop;
    end loop;
  end;

  -- ── section L2: draws, tiebreakers, completion
  declare v_t uuid := tt_test.ctx('t')::uuid; v_m uuid; v_x uuid; r jsonb; v_row record; v_names text;
  begin
    perform tt_test.as_user('admin');
    -- draws allowed (football, individual entries)
    v_m := tt_test.mk_format('Draws', 'football', 3, '{"format":"round_robin","allow_draws":true}'::jsonb);
    select id into v_x from public.tournament_matches where module_id = v_m order by round_number, match_number limit 1;
    r := public.record_tournament_result(v_x, 1, 1, null, null, null);
    perform tt_test.chk((r->>'is_draw')::boolean and r->>'winner_entry_id' is null and r->>'status' = 'completed',
                        'level score in a league with draws allowed is a draw');
    perform tt_test.chk((select sum(points) from public._league_table(v_m, null)) = 2,
                        'a draw gives 1 point to each side');
    -- draws not allowed
    v_m := tt_test.mk_format('NoDraws', 'football', 3, '{"format":"round_robin"}'::jsonb);
    select id into v_x from public.tournament_matches where module_id = v_m order by round_number, match_number limit 1;
    perform tt_test.expect_err(format('select public.record_tournament_result(%L,1,1,null,null,null)', v_x),
      'TIE_NEEDS_WINNER', 'level score without allow_draws needs a winner');
    perform public.record_tournament_walkover(v_x, (select entry_a_id from public.tournament_matches where id = v_x), null);
    perform tt_test.chk((select won = 1 from public._league_table(v_m, null) where entry_id = (select entry_a_id from public.tournament_matches where id = v_x)),
                        'league walkover counts as a win');
    perform public.reset_tournament_match(v_x);
    perform tt_test.chk((select count(*) from public._league_table(v_m, null) where played > 0) = 0, 'reset removes the result from the table');

    -- 2-way tie on points broken by head-to-head (A=P1 B=P2 C=P3 D=P4)
    v_m := tt_test.mk_format('Tie2', 'table_tennis', 4, '{"format":"round_robin"}'::jsonb);
    perform tt_test.rec(v_m, 'P1', 'P2', 2, 3);   -- B beats A
    perform tt_test.rec(v_m, 'P1', 'P3', 3, 0);
    perform tt_test.rec(v_m, 'P1', 'P4', 3, 0);
    perform tt_test.rec(v_m, 'P2', 'P3', 3, 2);
    perform tt_test.rec(v_m, 'P2', 'P4', 0, 3);   -- D beats B
    perform tt_test.rec(v_m, 'P3', 'P4', 3, 0);   -- C beats D
    select string_agg(name, ',' order by rnk) into v_names from public._league_table(v_m, null);
    perform tt_test.chk(v_names = 'P2,P1,P3,P4', format('head-to-head beats score difference (got %s)', v_names));
    perform tt_test.chk((select status = 'completed' from public.tournament_modules where id = v_m), 'league completes when every match is decided');
    perform tt_test.chk((select count(distinct final_rank) = 4 and min(final_rank) = 1 and max(final_rank) = 4
                         from public.tournament_entries where module_id = v_m), 'final ranks are 1..N');
    perform tt_test.chk((select champion_entry_id = tt_test.eid(v_m, 'P2') and runner_up_entry_id = tt_test.eid(v_m, 'P1')
                                and third_place_entry_id = tt_test.eid(v_m, 'P3') from public.tournament_modules where id = v_m),
                        'champion / runner-up / third are the top three');
    perform tt_test.expect_err(format('select public.record_tournament_result(%L,1,0,null,null,null)',
        (select id from public.tournament_matches where module_id = v_m limit 1)),
      'INVALID_STATUS', 'completed league is read-only');

    -- 3-way tie: head-to-head equal → score difference → score for
    v_m := tt_test.mk_format('Tie3', 'table_tennis', 4, '{"format":"round_robin"}'::jsonb);
    perform tt_test.rec(v_m, 'P1', 'P2', 3, 0);
    perform tt_test.rec(v_m, 'P2', 'P3', 3, 1);
    perform tt_test.rec(v_m, 'P3', 'P1', 3, 2);
    perform tt_test.rec(v_m, 'P1', 'P4', 3, 0);
    perform tt_test.rec(v_m, 'P2', 'P4', 3, 0);
    perform tt_test.rec(v_m, 'P3', 'P4', 3, 0);
    select string_agg(name, ',' order by rnk) into v_names from public._league_table(v_m, null);
    perform tt_test.chk(v_names = 'P1,P3,P2,P4', format('3-way tie falls through to diff then score for (got %s)', v_names));

    -- limits
    v_m := tt_test.mk_format('Big', 'table_tennis', 20, '{"format":"round_robin"}'::jsonb, false);
    perform public.set_module_status(v_m, 'open');
    perform public.upsert_tournament_entry(v_m, null, 'P21', null,
      '{"cms_id":"big-21","school":"s","phone":"03001234567","email":"p21@example.com"}'::jsonb);
    perform tt_test.expect_err(format('select public.set_module_status(%L,%L)', v_m, 'seeding'),
      'TOO_MANY_ENTRIES', 'a league takes at most 20 entries');
  end;

  -- ── section G1: group stage (step 37)
  declare v_m uuid; v_a uuid; v_b uuid; v_names text; v_ids uuid[]; v_json jsonb; v_x uuid;
  begin
    perform tt_test.as_user('admin');
    -- 8 entries, 2 groups, top 2: snake → A: 1,4,5,8  B: 2,3,6,7
    v_m := tt_test.mk_format('G8', 'table_tennis', 8, '{"format":"groups_knockout","group_count":2,"advance_per_group":2}'::jsonb);
    select string_agg(e.name, ',' order by e.seed) into v_names
      from public.tournament_group_entries ge join public.tournament_groups g on g.id = ge.group_id
      join public.tournament_entries e on e.id = ge.entry_id where g.module_id = v_m and g.letter = 'A';
    perform tt_test.chk(v_names = 'P1,P4,P5,P8', format('snake draw: group A = P1,P4,P5,P8 (got %s)', v_names));
    select string_agg(e.name, ',' order by e.seed) into v_names
      from public.tournament_group_entries ge join public.tournament_groups g on g.id = ge.group_id
      join public.tournament_entries e on e.id = ge.entry_id where g.module_id = v_m and g.letter = 'B';
    perform tt_test.chk(v_names = 'P2,P3,P6,P7', format('snake draw: group B = P2,P3,P6,P7 (got %s)', v_names));
    perform tt_test.chk((select count(*) from public.tournament_matches where module_id = v_m and bracket_side = 'group') = 12,
                        '2 groups of 4 → 12 group matches');
    perform tt_test.chk((select count(distinct round_number) from public.tournament_matches where module_id = v_m) = 3,
                        'groups share 3 matchdays');
    perform tt_test.chk(not exists (
        select 1 from (select round_number, match_number, count(*) c from public.tournament_matches where module_id = v_m group by 1, 2) x where c > 1),
                        'match numbers are unique inside a round across groups');
    perform tt_test.chk((select count(*) from public.tournament_matches where module_id = v_m and code ~ '^[AB][0-9]+$') = 12,
                        'group match codes look like A3 / B2');
    perform tt_test.chk(not exists (
        select 1 from public.tournament_matches tm join public.tournament_group_entries ga on ga.entry_id = tm.entry_a_id
        join public.tournament_group_entries gb on gb.entry_id = tm.entry_b_id
        where tm.module_id = v_m and (ga.group_id <> gb.group_id or tm.group_id <> ga.group_id)),
                        'group matches only pair entries of the same group');
    perform tt_test.chk((public.get_module_detail(v_m) -> 'counts' ->> 'groups_finished')::boolean is false, 'groups_finished is false at the start');
    perform tt_test.chk(jsonb_array_length(public.get_module_groups(v_m)) = 2, 'get_module_groups returns both groups');
    v_json := public.get_module_standings_v2(v_m);
    perform tt_test.chk(v_json ->> 'kind' = 'groups' and jsonb_array_length(v_json -> 'groups') = 2
                        and jsonb_array_length(v_json -> 'groups' -> 0 -> 'table') = 4 and (v_json -> 'groups' -> 0 ->> 'advance')::int = 2,
                        'standings v2 (groups) has one table per group with the advance count');

    -- 10 entries, 3 groups, top 1: sizes A=3 B=3 C=4
    v_m := tt_test.mk_format('G10', 'table_tennis', 10, '{"format":"groups_knockout","group_count":3,"advance_per_group":1}'::jsonb);
    perform tt_test.chk((select string_agg(c::text, ',' order by letter) from (
        select g.letter, count(*) c from public.tournament_group_entries ge join public.tournament_groups g on g.id = ge.group_id
        where g.module_id = v_m group by g.letter) x) = '3,3,4', '10 entries / 3 groups → sizes 3,3,4');
    perform tt_test.chk((select count(*) from public.tournament_matches where module_id = v_m) = 12, '3+3+6 = 12 group matches');

    -- 16 entries, 4 groups, top 2
    v_m := tt_test.mk_format('G16', 'table_tennis', 16, '{"format":"groups_knockout","group_count":4,"advance_per_group":2}'::jsonb);
    perform tt_test.chk((select count(*) from public.tournament_matches where module_id = v_m) = 24, '4 groups of 4 → 24 group matches');

    -- move_group_entry (seeding only, keeps >= 2 per group, rebuilds fixtures)
    v_m := tt_test.mk_format('GMove', 'table_tennis', 8, '{"format":"groups_knockout","group_count":2,"advance_per_group":2}'::jsonb, false);
    perform public.generate_bracket(v_m);
    select ge.entry_id, ge.group_id into v_x, v_a from public.tournament_group_entries ge
      join public.tournament_groups g on g.id = ge.group_id where g.module_id = v_m and g.letter = 'A' order by ge.entry_id limit 1;
    select id into v_b from public.tournament_groups where module_id = v_m and letter = 'B';
    perform public.move_group_entry(v_x, v_b);
    perform tt_test.chk((select count(*) from public.tournament_matches where module_id = v_m) = 3 + 10,
                        'moving an entry rebuilds fixtures (3 + 10 matches)');
    perform tt_test.chk(not exists (select 1 from public.tournament_matches tm where tm.module_id = v_m and
                        (tm.entry_a_id = v_x or tm.entry_b_id = v_x) and tm.group_id <> v_b), 'moved entry only plays in its new group');
    -- shrink group A to 2 then refuse to go below
    for v_x in select ge.entry_id from public.tournament_group_entries ge join public.tournament_groups g on g.id = ge.group_id
               where g.module_id = v_m and g.letter = 'A' order by ge.entry_id limit 1 loop
      perform public.move_group_entry(v_x, v_b);
    end loop;
    select ge.entry_id into v_x from public.tournament_group_entries ge join public.tournament_groups g on g.id = ge.group_id
      where g.module_id = v_m and g.letter = 'A' limit 1;
    perform tt_test.expect_err(format('select public.move_group_entry(%L,%L)', v_x, v_b), 'FIELD_INVALID:group',
      'a group cannot drop below 2 entries');
    perform tt_test.as_user('stranger');
    perform tt_test.expect_err(format('select public.move_group_entry(%L,%L)', v_x, v_b), 'NOT_ALLOWED', 'plain user cannot move entries');
    perform tt_test.as_user('admin');

    -- setup guards at open → seeding
    perform tt_test.expect_err(
      format('select tt_test.mk_format(%L,%L,6,%L::jsonb,false)', 'GBad', 'table_tennis',
             '{"format":"groups_knockout","group_count":3,"advance_per_group":2}'),
      'FIELD_INVALID:advance_per_group', 'advance_per_group must leave at least one team out of each group (open → seeding)');
  end;

  -- ── section G2: knockout stage (step 38)
  declare v_m uuid; v_ids uuid[]; v_json jsonb; v_x uuid; v_n int;
  begin
    perform tt_test.as_user('admin');
    -- 8 entries / 2 groups / top 2 → 4-team knockout
    v_m := tt_test.mk_format('K8', 'table_tennis', 8, '{"format":"groups_knockout","group_count":2,"advance_per_group":2}'::jsonb);
    perform tt_test.expect_err(format('select * from public.preview_knockout_qualifiers(%L)', v_m),
      'GROUPS_NOT_FINISHED', 'preview needs every group match decided');
    perform tt_test.expect_err(format('select public.build_knockout_stage(%L)', v_m),
      'GROUPS_NOT_FINISHED', 'build needs every group match decided');
    perform tt_test.play_all(v_m);
    perform tt_test.chk((public.get_module_detail(v_m) -> 'counts' ->> 'groups_finished')::boolean, 'groups_finished turns true');
    perform tt_test.chk((select status = 'in_progress' and current_stage = 1 from public.tournament_modules where id = v_m),
                        'module stays in progress after the group stage');
    perform tt_test.chk((select count(*) from public.preview_knockout_qualifiers(v_m)) = 4, 'preview lists 4 qualifiers');
    perform tt_test.expect_err(format('select public.build_knockout_stage(%L, %L::uuid[])', v_m, array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()]),
      'FIELD_INVALID:entry_ids', 'custom order must be exactly the qualifier set');
    v_n := public.build_knockout_stage(v_m);
    perform tt_test.chk(v_n = 3, 'knockout of 4 has 3 matches');
    perform tt_test.chk((select current_stage = 2 from public.tournament_modules where id = v_m), 'current_stage = 2 after building');
    perform tt_test.chk((select count(*) filter (where qualified) = 4 and count(*) filter (where not qualified) = 4
                         from public.tournament_group_entries where module_id = v_m), 'qualified flags written');
    perform tt_test.chk((select count(*) from public.tournament_matches where module_id = v_m and stage_number = 2 and entry_a_label ~ '^[AB][12]$') >= 1,
                        'knockout slots carry group labels (A1, B2 …)');
    select id into v_x from public.tournament_matches where module_id = v_m and bracket_side = 'group' limit 1;
    perform tt_test.expect_err(format('select public.record_tournament_result(%L,3,0,null,null,null)', v_x),
      'STAGE_LOCKED', 'group results are locked once the knockout exists');
    perform tt_test.expect_err(format('select public.reset_tournament_match(%L)', v_x),
      'STAGE_LOCKED', 'group matches cannot be reset once the knockout exists');
    -- undo + rebuild with a custom (reversed) order
    perform public.reset_knockout_stage(v_m);
    perform tt_test.chk((select current_stage = 1 from public.tournament_modules where id = v_m)
                        and not exists (select 1 from public.tournament_matches where module_id = v_m and stage_number = 2),
                        'reset_knockout_stage removes the knockout');
    select array_agg(entry_id order by suggested_seed desc) into v_ids from public.preview_knockout_qualifiers(v_m);
    perform public.build_knockout_stage(v_m, v_ids);
    -- play the knockout
    perform tt_test.play_all(v_m);
    perform tt_test.chk((select status = 'completed' and champion_entry_id is not null and runner_up_entry_id is not null
                         from public.tournament_modules where id = v_m), 'groups + knockout module completes');
    perform tt_test.chk((select count(*) filter (where final_rank = 5) = 2 and count(*) filter (where final_rank = 7) = 2
                         from public.tournament_entries where module_id = v_m),
                        '3rd-placed group entries share rank 5, 4th-placed share rank 7 (4 qualifiers)');
    perform tt_test.chk((select count(*) from public.tournament_entries where module_id = v_m and final_rank in (1, 2)) = 2,
                        'champion and runner-up ranked 1 and 2');
    perform tt_test.chk(jsonb_array_length(public.get_module_standings_v2(v_m) -> 'final') = 8
                        and (public.get_module_standings_v2(v_m) -> 'final' -> 4 ->> 'rank_label') = 'T-5',
                        'standings v2 final list has T-5 labels');
    perform tt_test.chk(jsonb_array_length(public.get_module_standings_v2(v_m) -> 'knockout') = 4, 'standings v2 knockout rows cover the 4 qualifiers');
    perform tt_test.expect_err(format('select public.reset_knockout_stage(%L)', v_m), 'INVALID_STATUS', 'completed module cannot reset the knockout');

    -- undo is blocked once a knockout match was played
    v_m := tt_test.mk_format('K8b', 'table_tennis', 8, '{"format":"groups_knockout","group_count":2,"advance_per_group":2}'::jsonb);
    perform tt_test.play_all(v_m);
    perform public.build_knockout_stage(v_m);
    select id into v_x from public.tournament_matches where module_id = v_m and stage_number = 2 and entry_a_id is not null and entry_b_id is not null limit 1;
    perform public.record_tournament_result(v_x, 3, 1, null, null, null);
    perform tt_test.expect_err(format('select public.reset_knockout_stage(%L)', v_m), 'DOWNSTREAM_PLAYED',
      'cannot undo the knockout once a knockout match is decided');

    -- 16 entries / 4 groups / top 2: no same-group first-round pair; ranks T-9 and T-13
    v_m := tt_test.mk_format('K16', 'table_tennis', 16, '{"format":"groups_knockout","group_count":4,"advance_per_group":2}'::jsonb);
    perform tt_test.play_all(v_m);
    perform public.build_knockout_stage(v_m);
    perform tt_test.chk(not exists (
        select 1 from public.tournament_matches tm
        join public.tournament_group_entries ga on ga.entry_id = tm.entry_a_id
        join public.tournament_group_entries gb on gb.entry_id = tm.entry_b_id
        where tm.module_id = v_m and tm.stage_number = 2 and tm.round_number = 1 and ga.group_id = gb.group_id),
                        '16/4/2: suggested order avoids same-group round-1 pairs');
    perform tt_test.play_all(v_m);
    perform tt_test.chk((select count(*) filter (where final_rank = 9) = 4 and count(*) filter (where final_rank = 13) = 4
                         from public.tournament_entries where module_id = v_m), '16/4/2: 3rd-placed share 9 (T-9), 4th-placed share 13 (T-13)');
    perform tt_test.chk((select status = 'completed' from public.tournament_modules where id = v_m), '16/4/2 completes');

    -- 10 entries / 3 groups / top 1 → 3 qualifiers, one bye
    v_m := tt_test.mk_format('K10', 'table_tennis', 10, '{"format":"groups_knockout","group_count":3,"advance_per_group":1}'::jsonb);
    perform tt_test.play_all(v_m);
    perform public.build_knockout_stage(v_m);
    perform tt_test.chk((select count(*) from public.tournament_matches where module_id = v_m and stage_number = 2 and status = 'bye') = 1,
                        '3 qualifiers → one bye in the knockout');
    perform tt_test.play_all(v_m);
    perform tt_test.chk((select status = 'completed' from public.tournament_modules where id = v_m), '10/3/1 completes');
    perform tt_test.chk((select count(*) filter (where final_rank = 4) = 3 and count(*) filter (where final_rank = 7) = 3
                         and count(*) filter (where final_rank = 10) = 1 from public.tournament_entries where module_id = v_m),
                        'uneven groups: ranks 4 (x3, pos 2), 7 (x3, pos 3), 10 (pos 4)');
  end;

  -- @@END (new steps insert their test sections above this line)
  raise exception 'ALL TESTS PASSED — rolled back, nothing saved';
end $$;

-- ═══════════════════════════ STEP 3: cleanup ═══════════════════════════
drop schema if exists tt_test cascade;
