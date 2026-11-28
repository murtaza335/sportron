-- docs/organizations/sql-tests-scorers.sql
-- Scorer role (migration 138). Run with docs/tournaments/local-db/run.sh (listed there), or paste into the SQL editor.
-- The final "ALL TESTS PASSED — rolled back, nothing saved" error IS success.

drop schema if exists sc_test cascade;
create schema sc_test;

create function sc_test.put(p_k text, p_v text) returns void language plpgsql as $$
begin perform set_config('sc.' || p_k, p_v, true); end $$;
create function sc_test.ctx(p_k text) returns text language sql stable as
  $$ select nullif(current_setting('sc.' || p_k, true), '') $$;
create function sc_test.as_user(p_k text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', sc_test.ctx(p_k), 'role', 'authenticated')::text, true);
end $$;
create function sc_test.chk(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAIL: %', p_msg; end if;
  raise notice 'PASS: %', p_msg;
end $$;
create function sc_test.expect_err(p_sql text, p_code text, p_msg text) returns void language plpgsql as $$
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

create function sc_test.mk_module(p_t uuid, p_name text, p_sport text) returns uuid language plpgsql as $$
declare v_m uuid; i int;
begin
  perform sc_test.as_user('admin');
  v_m := public.create_tournament_module(p_t, p_name, p_sport, null, null, null, null, null, false, 'manual');
  perform public.set_module_status(v_m, 'open');
  for i in 1..4 loop
    perform public.upsert_tournament_entry(v_m, null, 'P' || i, null,
      jsonb_build_object('cms_id', p_name || '-' || i, 'school', 'School ' || i,
                         'phone', '03001234567', 'email', 'p' || i || '@example.com'));
  end loop;
  perform public.set_module_status(v_m, 'seeding');
  perform public.generate_bracket(v_m);
  perform public.set_module_status(v_m, 'in_progress');
  return v_m;
end $$;

create function sc_test.match_of(p_m uuid, p_n int) returns uuid language sql stable as $$
  select id from public.tournament_matches
  where module_id = p_m and round_number = 1 and entry_a_id is not null and entry_b_id is not null
  order by match_number offset p_n - 1 limit 1
$$;

do $$
declare
  v_ids uuid[]; v_t uuid; v_draft uuid; v_m uuid; v_other uuid; v_dm uuid;
  v_m1 uuid; v_m2 uuid; v_o1 uuid; v_res jsonb; v_list jsonb; v_n int; v_row record;
  v_rules constant jsonb := '{"family":"sets","preset":"badminton_21","pointsToWin":21,"bestOf":1}'::jsonb;
  v_snap constant jsonb := '{"state":"live"}'::jsonb;
  v_sum constant jsonb := '{"a":"0","b":"0"}'::jsonb;
begin
  insert into public.profiles (username) select 'sc_user_' || g from generate_series(1, 5) g;
  select array_agg(id order by username) into v_ids from public.profiles where username like 'sc_user_%';
  perform sc_test.put('admin', v_ids[1]::text);     -- tournament admin
  perform sc_test.put('mgr', v_ids[2]::text);       -- sport manager of v_m
  perform sc_test.put('scorer', v_ids[3]::text);
  perform sc_test.put('scorer2', v_ids[4]::text);
  perform sc_test.put('stranger', v_ids[5]::text);

  insert into public.tournaments (name, status) values ('Scorer Cup', 'published') returning id into v_t;
  insert into public.tournaments (name, status) values ('Scorer Draft Cup', 'draft') returning id into v_draft;
  insert into public.tournament_admins (tournament_id, profile_id) values (v_t, v_ids[1]), (v_draft, v_ids[1]);

  v_m := sc_test.mk_module(v_t, 'Badminton Singles', 'badminton');
  v_other := sc_test.mk_module(v_t, 'Badminton Women', 'badminton');
  v_m1 := sc_test.match_of(v_m, 1);
  v_m2 := sc_test.match_of(v_m, 2);
  v_o1 := sc_test.match_of(v_other, 1);
  perform sc_test.as_user('admin');
  perform public.add_module_admin(v_m, v_ids[2]);

  -- ── appointing
  perform sc_test.as_user('stranger');
  perform sc_test.expect_err(format('select public.add_module_scorer(%L, %L)', v_m, v_ids[5]), 'NOT_ALLOWED', 'stranger cannot appoint scorers');
  perform sc_test.expect_err(format('select * from public.get_module_scorers(%L)', v_m), 'NOT_ALLOWED', 'stranger cannot list scorers');
  perform sc_test.as_user('mgr');
  perform public.add_module_scorer(v_m, v_ids[3]);
  perform public.add_module_scorer(v_m, v_ids[3]);
  perform public.add_module_scorer(v_m, v_ids[4]);
  select count(*) into v_n from public.get_module_scorers(v_m);
  perform sc_test.chk(v_n = 2, 'sport manager appoints scorers (idempotent)');
  perform sc_test.expect_err(format('select public.add_module_scorer(%L, %L)', v_other, v_ids[3]), 'NOT_ALLOWED', 'manager cannot appoint on another sport');
  perform sc_test.expect_err(format('select public.add_module_scorer(%L, %L)', v_m, gen_random_uuid()), 'NOT_FOUND', 'unknown profile refused');
  perform sc_test.chk((select count(*) from public.in_app_notifications where type = 'tournament_scorer_assigned' and user_id = v_ids[3]) = 1,
                      'scorer gets one notification');
  perform sc_test.as_user('scorer');
  perform sc_test.expect_err(format('select public.add_module_scorer(%L, %L)', v_m, v_ids[5]), 'NOT_ALLOWED', 'scorer cannot appoint scorers');

  -- ── role reporting + private fields
  perform sc_test.chk(public.get_module_detail(v_m) ->> 'my_role' = 'scorer', 'module detail says scorer');
  perform sc_test.chk(public.get_module_detail(v_other) ->> 'my_role' is null, 'no role on the other sport');
  perform sc_test.chk(not exists (select 1 from public.get_module_entries(v_m) e where e.fields::text ~* 'phone|0300|@example|cms'),
                      'scorer never sees private entry fields');

  -- ── "to score" list
  v_list := public.get_my_scoring_matches() -> 'matches';
  perform sc_test.chk(jsonb_array_length(v_list) = 2, 'to-score lists the two open matches of the scored sport only');
  perform sc_test.chk(v_list::text !~* 'phone|0300|@example|cms', 'to-score has no private fields');
  perform sc_test.chk(v_list -> 0 ->> 'my_role' = 'scorer' and v_list -> 0 ->> 'a_name' is not null, 'to-score row shape');
  perform sc_test.as_user('stranger');
  perform sc_test.chk(jsonb_array_length(public.get_my_scoring_matches() -> 'matches') = 0, 'stranger has nothing to score');

  -- ── scorer is refused everything that is not scoring
  perform sc_test.as_user('scorer');
  perform sc_test.expect_err(format('select public.record_tournament_result(%L, 2, 0)', v_m1), 'NOT_ALLOWED', 'scorer cannot enter a result directly');
  perform sc_test.expect_err(format('select public.record_tournament_walkover(%L, %L)', v_m1, gen_random_uuid()), 'NOT_ALLOWED', 'scorer cannot give a walkover');
  perform sc_test.expect_err(format('select public.reset_tournament_match(%L)', v_m1), 'NOT_ALLOWED', 'scorer cannot reset');
  perform sc_test.expect_err(format('select public.set_module_live_rules(%L, %L::jsonb)', v_m, v_rules), 'NOT_ALLOWED', 'scorer cannot change module rules');
  perform sc_test.expect_err(format('select public.upsert_tournament_entry(%L, null, %L, null, %L::jsonb)', v_m, 'X', '{}'), 'NOT_ALLOWED', 'scorer cannot manage players');
  perform sc_test.expect_err(format('select public.schedule_tournament_match(%L, now(), null, null)', v_m1), 'NOT_ALLOWED', 'scorer cannot schedule');

  -- ── rules are locked for scorers
  perform sc_test.expect_err(format('select public.live_start_match(%L, %L, false, null, %L::jsonb)', v_m1, 'd1',
                              '{"family":"sets","preset":"badminton_15"}'), 'RULES_LOCKED', 'scorer cannot pick another preset');
  perform sc_test.as_user('mgr');
  perform public.set_module_live_rules(v_m, v_rules);
  perform sc_test.as_user('scorer');
  perform sc_test.expect_err(format('select public.live_start_match(%L, %L, false, null, %L::jsonb)', v_m1, 'd1',
                              (v_rules || '{"pointsToWin":11}')::text), 'RULES_LOCKED', 'scorer cannot override a saved setting');
  perform sc_test.expect_err(format('select public.live_start_match(%L, %L, false, null, %L::jsonb)', v_m1, 'd1',
                              (v_rules || '{"bestOf":3}')::text), 'RULES_LOCKED', 'scorer cannot change best-of');
  perform sc_test.as_user('stranger');
  perform sc_test.expect_err(format('select public.live_start_match(%L, %L, false, null, %L::jsonb)', v_m1, 'd1', v_rules), 'NOT_ALLOWED', 'stranger cannot start');
  perform sc_test.as_user('scorer');
  perform sc_test.expect_err(format('select public.live_start_match(%L, %L, false, null, %L::jsonb)', v_o1, 'd1', v_rules), 'NOT_ALLOWED', 'scorer cannot score another sport');

  -- ── start, push, take-over
  v_res := public.live_start_match(v_m1, 'd1', false, 'Court 1', v_rules, v_snap, v_sum);
  perform sc_test.chk((v_res ->> 'scorer_id')::uuid = v_ids[3], 'scorer starts a match and sets the court');
  perform pg_sleep(0.06);
  perform sc_test.chk((public.live_push_score(v_m1, 2, v_snap, v_sum) ->> 'seq')::int = 2, 'scorer pushes');
  v_list := public.get_my_scoring_matches() -> 'matches';
  perform sc_test.chk(v_list -> 0 ->> 'live_state' = 'live' and (v_list -> 0 ->> 'mine')::boolean, 'my live match is first and marked mine');
  perform sc_test.as_user('scorer2');
  perform sc_test.expect_err(format('select public.live_start_match(%L, %L, false, null, %L::jsonb)', v_m1, 'd2', v_rules), 'LIVE_TAKEN', 'second scorer must confirm');
  perform sc_test.expect_err(format('select public.live_abandon_match(%L)', v_m1), 'NOT_ALLOWED', 'scorer cannot stop someone else''s match');
  -- resume keeps stored rules, so no rules check even if the client sends others
  v_res := public.live_start_match(v_m1, 'd2', true, null, v_rules);
  perform sc_test.chk((v_res ->> 'scorer_id')::uuid = v_ids[4], 'second scorer takes over after confirming');
  perform sc_test.as_user('scorer');
  perform sc_test.expect_err(format('select public.live_push_score(%L, 3, %L::jsonb, %L::jsonb)', v_m1, v_snap, v_sum), 'LIVE_TAKEN', 'old phone is told it was taken over');

  -- ── removal stops a scorer immediately and frees the claim
  perform sc_test.as_user('mgr');
  perform public.remove_module_scorer(v_m, v_ids[4]);
  perform sc_test.chk((select scorer_id from public.tournament_live_scores where match_id = v_m1) is null, 'removal frees the live claim');
  perform sc_test.as_user('scorer2');
  perform sc_test.expect_err(format('select public.live_push_score(%L, 3, %L::jsonb, %L::jsonb)', v_m1, v_snap, v_sum), 'NOT_ALLOWED', 'removed scorer cannot push');
  perform sc_test.expect_err(format('select public.live_finish_match(%L, 3, %L::jsonb, %L::jsonb, 2, 0)', v_m1, v_snap, v_sum), 'NOT_ALLOWED', 'removed scorer cannot finish');
  perform sc_test.expect_err('select public.get_module_detail(gen_random_uuid())', 'NOT_ALLOWED', 'unknown module refused');
  perform sc_test.as_user('scorer');
  v_res := public.live_start_match(v_m1, 'd1', false);
  perform sc_test.chk((v_res ->> 'scorer_id')::uuid = v_ids[3], 'next scorer resumes without waiting');

  -- ── finish: counts at once, once
  perform sc_test.expect_err(format('select public.live_finish_match(%L, 9, %L::jsonb, %L::jsonb, 1, 1)', v_m1, v_snap, v_sum), 'TIE_NEEDS_WINNER', 'engine checks still apply');
  v_res := public.live_finish_match(v_m1, 9, v_snap, v_sum, 2, 0);
  perform sc_test.chk(v_res ->> 'status' = 'completed' and (v_res ->> 'recorded_by')::uuid = v_ids[3], 'scorer finish records the result with their name');
  perform sc_test.chk(public.live_finish_match(v_m1, 9, v_snap, v_sum, 0, 2) ->> 'score_a' = '2', 'retry returns the saved result unchanged');
  perform sc_test.expect_err(format('select public.record_tournament_result(%L, 0, 2)', v_m1), 'NOT_ALLOWED', 'scorer cannot edit the finished result');
  perform sc_test.expect_err(format('select public.live_start_match(%L, %L, true, null, %L::jsonb)', v_m1, 'd1', v_rules), 'INVALID_STATUS', 'cannot restart a finished match');
  perform sc_test.chk(jsonb_array_length(public.get_my_scoring_matches() -> 'matches') = 1, 'finished match leaves the list');

  -- ── own abandon allowed
  perform public.live_start_match(v_m2, 'd1', false, null, v_rules);
  perform public.live_abandon_match(v_m2);
  perform sc_test.chk((select state from public.tournament_live_scores where match_id = v_m2) = 'abandoned', 'scorer can stop their own match');

  -- ── managers and admins behave as before
  perform sc_test.as_user('admin');
  perform public.reset_tournament_match(v_m1);
  perform sc_test.chk((public.record_tournament_result(v_m1, 2, 1) ->> 'status') = 'completed', 'admin result entry unchanged');

  -- ── drafts: a scorer can prepare, others cannot see
  v_dm := public.create_tournament_module(v_draft, 'Draft Sport', 'badminton', null, null, null, null, null, false, 'manual');
  perform public.add_module_scorer(v_dm, v_ids[3]);
  perform sc_test.as_user('scorer');
  perform sc_test.chk(public.can_view_tournament(v_draft) and public.can_view_module(v_dm), 'scorer sees their draft');
  perform sc_test.as_user('stranger');
  perform sc_test.chk(not public.can_view_tournament(v_draft), 'stranger does not');

  -- ── privileges
  perform sc_test.chk(not has_table_privilege('authenticated', 'public.tournament_module_scorers', 'select'), 'no direct table access');
  perform sc_test.chk(not has_function_privilege('anon', 'public.get_my_scoring_matches()', 'execute'), 'anon cannot list');
  perform sc_test.chk(not has_function_privilege('authenticated', 'public._record_tournament_result_core(uuid,integer,integer,jsonb,uuid,text)', 'execute'), 'result core is internal');

  raise exception 'ALL TESTS PASSED — rolled back, nothing saved';
end $$;
