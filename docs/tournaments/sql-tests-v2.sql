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
      'INVALID_STATUS', 'participant_type cannot change after the module is open');

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

  -- @@END (new steps insert their test sections above this line)
  raise exception 'ALL TESTS PASSED — rolled back, nothing saved';
end $$;

-- ═══════════════════════════ STEP 3: cleanup ═══════════════════════════
drop schema if exists tt_test cascade;
