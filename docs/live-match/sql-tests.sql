-- docs/live-match/sql-tests.sql
-- Live match scoring DB tests (migration 133). Run AFTER applying migrations 084..133.
-- Run with: docs/tournaments/local-db/run.sh  (it is listed there), or paste into the SQL editor.
-- The single DO block ends by raising "ALL TESTS PASSED — rolled back, nothing saved": that "error" IS success.
-- NOTE: the editor runs as the table owner, so grants/RLS are not exercised here; permissions are tested through
-- the functions' own guards (auth.uid() from request.jwt.claims). Creates its own profiles (rolled back).

drop schema if exists lv_test cascade;
create schema lv_test;

create function lv_test.put(p_k text, p_v text) returns void language plpgsql as $$
begin perform set_config('lv.' || p_k, p_v, true); end $$;

create function lv_test.ctx(p_k text) returns text language sql stable as
  $$ select nullif(current_setting('lv.' || p_k, true), '') $$;

create function lv_test.as_user(p_k text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', lv_test.ctx(p_k), 'role', 'authenticated')::text, true);
end $$;

create function lv_test.as_anon() returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', '', true); end $$;

create function lv_test.chk(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAIL: %', p_msg; end if;
  raise notice 'PASS: %', p_msg;
end $$;

create function lv_test.expect_err(p_sql text, p_code text, p_msg text) returns void language plpgsql as $$
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

-- a module in progress with 4 entries and a generated single-elimination bracket
create function lv_test.mk_module(p_t uuid, p_name text, p_sport text) returns uuid language plpgsql as $$
declare v_m uuid; i int;
begin
  perform lv_test.as_user('admin');
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

-- first playable round-1 match of a module (n-th by match_number)
create function lv_test.match_of(p_m uuid, p_n int) returns uuid language sql stable as $$
  select id from public.tournament_matches
  where module_id = p_m and round_number = 1 and entry_a_id is not null and entry_b_id is not null
  order by match_number offset p_n - 1 limit 1
$$;

do $$
declare
  v_ids uuid[]; v_t uuid; v_t2 uuid; v_draft uuid; v_m uuid; v_vm uuid;
  v_m1 uuid; v_m2 uuid; v_code text; v_board jsonb; v_res jsonb; v_next int; v_n int;
  v_rules constant jsonb := '{"family":"sets","preset":"badminton_21","points_to_win":21}'::jsonb;
  v_snap jsonb := '{"state":"live","games":[],"cur":{"a":0,"b":0}}'::jsonb;
  v_sum jsonb := '{"a":"0","b":"0","line":"Game 1","state_label":"LIVE"}'::jsonb;
begin
  -- ── setup: 5 profiles (admin, admin2, stranger, member, spare), published tournament + one draft
  insert into public.profiles (username) select 'lv_user_' || g from generate_series(1, 5) g;
  select array_agg(id) into v_ids from (
    select id from public.profiles where username like 'lv_user_%' order by username) x;
  perform lv_test.put('admin', v_ids[1]::text);
  perform lv_test.put('admin2', v_ids[2]::text);
  perform lv_test.put('stranger', v_ids[3]::text);

  insert into public.tournaments (name, status) values ('Live Test Cup', 'published') returning id into v_t;
  insert into public.tournaments (name, status) values ('Other Live Cup', 'published') returning id into v_t2;
  insert into public.tournaments (name, status) values ('Hidden Draft Live Cup', 'draft') returning id into v_draft;
  insert into public.tournament_admins (tournament_id, profile_id) values (v_t, v_ids[1]), (v_t2, v_ids[1]), (v_draft, v_ids[1]);
  perform lv_test.put('t', v_t::text);

  v_m := lv_test.mk_module(v_t, 'Mens Singles', 'badminton');
  v_m1 := lv_test.match_of(v_m, 1);
  v_m2 := lv_test.match_of(v_m, 2);
  perform lv_test.chk(v_m1 is not null and v_m2 is not null, 'setup: two playable round-1 matches');

  -- ── defaults: migration adds the columns with the documented defaults
  perform lv_test.chk((select live_public from public.tournaments where id = v_t) = true, 'live_public defaults to true');
  perform lv_test.chk((select live_code from public.tournaments where id = v_t) is null, 'no live_code until first needed');
  perform lv_test.chk((select live_display from public.tournaments where id = v_t) = '{}'::jsonb, 'live_display defaults to {}');
  perform lv_test.chk((select enabled from public.feature_flags where key = 'live_scoring') = false, 'live_scoring flag seeded OFF');
  perform lv_test.chk((select value #>> '{}' from public.remote_config where key = 'live_projector_base_url') = 'https://sportron-live-sigma.vercel.app',
                      'base url seeded in remote_config');

  -- ── anon before anything exists
  perform lv_test.as_anon();
  perform lv_test.chk((public.get_live_board('nope123') ->> 'active')::boolean = false, 'unknown code -> active=false (no existence leak)');
  perform lv_test.chk((public.get_live_board(null) ->> 'active')::boolean = false, 'null code -> active=false');

  -- ── permissions on start
  perform lv_test.as_user('stranger');
  perform lv_test.expect_err(format('select public.live_start_match(%L, %L, false, null, %L::jsonb)', v_m1, 'dev-s', v_rules),
                             'NOT_ALLOWED', 'non-admin cannot start live scoring');
  perform lv_test.as_anon();
  perform lv_test.expect_err(format('select public.live_start_match(%L, %L, false, null, %L::jsonb)', v_m1, 'dev-a', v_rules),
                             'NOT_ALLOWED', 'anon cannot start live scoring');

  -- ── rules envelope validation
  perform lv_test.as_user('admin');
  perform lv_test.expect_err(format('select public.live_start_match(%L, %L, false, null, null)', v_m1, 'dev-a'),
                             'FIELD_INVALID:live_rules', 'rules required (module has none, none sent)');
  perform lv_test.expect_err(format('select public.live_start_match(%L, %L, false, null, %L::jsonb)', v_m1, 'dev-a', '{"family":"chess"}'),
                             'FIELD_INVALID:live_rules', 'unknown family rejected');
  perform lv_test.expect_err(format('select public.live_start_match(%L, %L, false, null, %L::jsonb)', v_m1, 'dev-a', '{"family":"timed"}'),
                             'FIELD_INVALID:live_rules_family', 'games module (badminton) cannot use a timed family');
  perform lv_test.expect_err(format('select public.set_module_live_rules(%L, %L::jsonb)', v_m, '{"family":"cricket"}'),
                             'FIELD_INVALID:live_rules_family', 'module rules: family must fit scoring mode');
  perform lv_test.chk(public.set_module_live_rules(v_m, v_rules) = v_rules, 'module rules saved');
  perform lv_test.as_user('stranger');
  perform lv_test.expect_err(format('select public.set_module_live_rules(%L, %L::jsonb)', v_m, v_rules),
                             'NOT_ALLOWED', 'non-admin cannot set module rules');

  -- ── start
  perform lv_test.as_user('admin');
  v_res := public.live_start_match(v_m1, 'dev-a', false, '  Court 2 ', v_rules, v_snap, v_sum);
  perform lv_test.chk((v_res ->> 'seq')::int = 1 and v_res ->> 'state' = 'live' and v_res ->> 'family' = 'sets', 'start creates live row (seq 1)');
  perform lv_test.chk((select court from public.tournament_matches where id = v_m1) = 'Court 2', 'court written (trimmed) to the match');
  select live_code into v_code from public.tournaments where id = v_t;
  perform lv_test.chk(v_code ~ '^[a-hj-km-np-z2-9]{6}$', 'live_code generated lazily: 6 unambiguous chars');
  perform lv_test.chk((select count(*) from realtime.messages where topic = 'live:' || v_code and event = 'score') >= 1,
                      'broadcast sent on live:<code>');
  perform lv_test.chk(public.live_start_match(v_m1, 'dev-a', false, null, v_rules)::jsonb ->> 'seq' = '1', 'same scorer start again = resume (idempotent)');

  -- ── second admin: takeover rules
  insert into public.tournament_admins (tournament_id, profile_id) values (v_t, v_ids[2]);
  perform lv_test.as_user('admin2');
  perform lv_test.expect_err(format('select public.live_start_match(%L, %L, false, null, %L::jsonb)', v_m1, 'dev-b', v_rules),
                             'LIVE_TAKEN', 'other admin blocked while scorer is active');
  perform lv_test.chk(public.live_start_match(v_m1, 'dev-b', true, null, v_rules) ->> 'scorer_id' = v_ids[2]::text, 'takeover moves the claim');
  perform lv_test.as_user('admin');
  perform lv_test.expect_err(format('select public.live_push_score(%L, 2, %L::jsonb, %L::jsonb)', v_m1, v_snap, v_sum),
                             'LIVE_TAKEN', 'old scorer can no longer push');
  perform lv_test.as_user('admin2');

  -- ── push: seq rules, validation
  perform pg_sleep(0.06);
  v_res := public.live_push_score(v_m1, 2, '{"state":"live","games":[],"cur":{"a":1,"b":0}}', '{"a":"1","b":"0","line":"Game 1"}');
  perform lv_test.chk((v_res ->> 'seq')::int = 2, 'push seq 2 applied');
  perform pg_sleep(0.06);
  v_res := public.live_push_score(v_m1, 2, '{"state":"live","cur":{"a":9,"b":9}}', '{"a":"9"}');
  perform lv_test.chk((v_res ->> 'seq')::int = 2 and (select snapshot #>> '{cur,a}' from public.tournament_live_scores where match_id = v_m1) = '1',
                      'duplicate seq ignored, no error, score unchanged');
  perform pg_sleep(0.06);
  v_res := public.live_push_score(v_m1, 1, '{"state":"live","cur":{"a":0,"b":0}}', '{"a":"0"}');
  perform lv_test.chk((v_res ->> 'seq')::int = 2, 'stale seq ignored, no error');
  perform pg_sleep(0.06);
  perform lv_test.expect_err(format('select public.live_push_score(%L, 3, %L::jsonb, %L::jsonb)', v_m1, '{"state":"nope"}', v_sum),
                             'FIELD_INVALID:live_state', 'unknown snapshot state rejected');
  perform lv_test.expect_err(format('select public.live_push_score(%L, 3, %L::jsonb, %L::jsonb)', v_m1,
                               jsonb_build_object('state', 'live', 'pad', repeat('x', 9000)), v_sum),
                             'FIELD_INVALID:live_state', 'snapshot over 8 KB rejected');
  perform pg_sleep(0.06);
  v_res := public.live_push_score(v_m1, 3, '{"state":"break","games":[{"a":21,"b":18}],"cur":{"a":0,"b":0}}', '{"a":"0","b":"0","line":"Game break"}');
  perform lv_test.chk(v_res ->> 'state' = 'break' and (select state from public.tournament_live_scores where match_id = v_m1) = 'break',
                      'break state stored');
  perform lv_test.chk((select count(*) from realtime.messages where topic = 'live:' || v_code and (payload ->> 'seq') = '3') = 1,
                      'every applied push is broadcast once');
  perform pg_sleep(0.06);
  perform public.live_push_score(v_m1, 4, '{"state":"live","games":[{"a":21,"b":18}],"cur":{"a":2,"b":1}}', '{"a":"2","b":"1"}');

  -- ── projector board (anon): names + scores only
  perform lv_test.as_anon();
  v_board := public.get_live_board(v_code);
  perform lv_test.chk((v_board ->> 'active')::boolean and jsonb_array_length(v_board -> 'live') = 1, 'anon board shows the live match');
  perform lv_test.chk((v_board #>> '{live,0,a,name}') in ('P1','P2','P3','P4') and v_board #>> '{live,0,summary,a}' = '2', 'board has names + summary');
  perform lv_test.chk(v_board #>> '{live,0,court}' = 'Court 2' and v_board #>> '{live,0,module_name}' = 'Mens Singles', 'court + module shown by default');
  perform lv_test.chk(v_board::text !~ 'example\.com' and v_board::text !~ '03001234567' and v_board::text !~ 'Mens Singles-[0-9]',
                      'no email / phone / CMS id anywhere in the anon response');
  perform lv_test.chk(jsonb_array_length(v_board #> '{live,0,a,fields}') = 0 and v_board #> '{live,0,a}' ? 'profile_id' = false,
                      'school hidden + no profile id on the projector by default');

  -- ── display settings
  perform lv_test.as_user('stranger');
  perform lv_test.expect_err(format('select public.set_tournament_live_display(%L, %L::jsonb)', v_t, '{"show_school":true}'),
                             'NOT_ALLOWED', 'non-admin cannot change display');
  perform lv_test.as_user('admin');
  perform lv_test.expect_err(format('select public.set_tournament_live_display(%L, %L::jsonb)', v_t, '{"hack":true}'), 'FIELD_INVALID:live_display', 'unknown key rejected');
  perform lv_test.expect_err(format('select public.set_tournament_live_display(%L, %L::jsonb)', v_t, '{"layout":"circle"}'), 'FIELD_INVALID:layout', 'bad layout rejected');
  perform lv_test.expect_err(format('select public.set_tournament_live_display(%L, %L::jsonb)', v_t, '{"max_per_page":9}'), 'FIELD_INVALID:max_per_page', 'max_per_page > 8 rejected');
  perform lv_test.expect_err(format('select public.set_tournament_live_display(%L, %L::jsonb)', v_t, '{"final_hold_seconds":301}'), 'FIELD_INVALID:final_hold_seconds', 'hold > 300 rejected');
  perform lv_test.expect_err(format('select public.set_tournament_live_display(%L, %L::jsonb)', v_t, '{"courts":["Court 1","court 1"]}'), 'FIELD_INVALID:courts', 'duplicate courts rejected');
  perform lv_test.expect_err(format('select public.set_tournament_live_display(%L, %L::jsonb)', v_t, jsonb_build_object('courts', (select jsonb_agg('C' || g) from generate_series(1, 13) g))), 'FIELD_INVALID:courts', 'more than 12 courts rejected');
  perform lv_test.expect_err(format('select public.set_tournament_live_display(%L, %L::jsonb)', v_t, '{"title":"' || repeat('t', 61) || '"}'), 'FIELD_INVALID:title', 'title > 60 rejected');
  perform lv_test.expect_err(format('select public.set_tournament_live_display(%L, %L::jsonb)', v_t, jsonb_build_object('show_fields', jsonb_build_array(gen_random_uuid()))), 'FIELD_INVALID:show_fields', 'foreign / unknown field id rejected');
  perform lv_test.expect_err(format('select public.set_tournament_live_display(%L, %L::jsonb)', v_t,
                               jsonb_build_object('show_fields', jsonb_build_array((select id from public.tournament_entry_fields where tournament_id = v_t and key = 'phone')))),
                             'FIELD_INVALID:show_fields', 'private core field cannot be shown');
  perform lv_test.chk((public.set_tournament_live_display(v_t, '{"show_school":true,"title":"  Finals Day ","courts":["Court 1","Court 2","Court 3"],"layout":"row"}') ->> 'title') = 'Finals Day',
                      'valid display patch saved + merged with defaults');
  perform lv_test.chk((select live_display ->> 'show_up_next' from public.tournaments where id = v_t) is null, 'stored display keeps only patched keys');
  perform lv_test.as_anon();
  v_board := public.get_live_board(v_code);
  perform lv_test.chk(v_board #>> '{tournament,name}' = 'Finals Day', 'title override applied');
  perform lv_test.chk(v_board #>> '{live,0,a,fields,0,label}' = 'School' and (v_board #>> '{live,0,a,fields,0,value}') like 'School %', 'show_school adds the School field');
  perform lv_test.chk(v_board::text !~ 'example\.com' and v_board::text !~ '03001234567', 'still no private fields with school on');
  perform lv_test.as_user('admin');
  perform public.set_tournament_live_display(v_t, '{"show_module":false,"show_court":false,"show_school":false}');
  perform lv_test.as_anon();
  v_board := public.get_live_board(v_code);
  perform lv_test.chk(not (v_board #> '{live,0}' ? 'module_name') and not (v_board #> '{live,0}' ? 'court'), 'module + court omitted when switched off');
  perform lv_test.chk(jsonb_array_length(v_board #> '{live,0,a,fields}') = 0, 'school omitted when switched off');
  perform lv_test.as_user('admin');
  perform public.set_tournament_live_display(v_t, '{"show_up_next":false}');
  perform lv_test.as_anon();
  perform lv_test.chk(jsonb_array_length(public.get_live_board(v_code) -> 'up_next') = 0, 'up next omitted when switched off');
  perform lv_test.chk((select count(*) from realtime.messages where topic = 'live:' || v_code and event = 'config') >= 3, 'display changes broadcast a config event');

  -- ── app reads
  perform lv_test.as_user('stranger');
  v_board := public.get_live_tournament_board(v_t);
  perform lv_test.chk(jsonb_array_length(v_board -> 'live') = 1 and (v_board #>> '{live,0,court}') = 'Court 2', 'signed-in user sees live board in app (ignores projector display switches)');
  perform lv_test.chk(v_board::text !~ 'example\.com' and v_board::text !~ '03001234567', 'app board has no private fields either');
  perform lv_test.chk((public.get_live_match(v_m1) ->> 'seq')::int = 4 and public.get_live_match(v_m1) ? 'rules', 'get_live_match returns snapshot + rules');
  perform lv_test.chk(public.get_live_match(v_m2) is null, 'get_live_match = null when the match is not live');
  perform lv_test.chk((public.get_live_tournaments() #>> '{0,live_count}')::int = 1, 'get_live_tournaments lists the live tournament');
  perform lv_test.as_anon();
  perform lv_test.expect_err(format('select public.get_live_tournament_board(%L)', v_t), 'NOT_ALLOWED', 'anon cannot use the app board');
  perform lv_test.expect_err('select public.get_live_tournaments()', 'NOT_ALLOWED', 'anon cannot list live tournaments');
  perform lv_test.as_user('stranger');
  perform lv_test.expect_err(format('select public.get_live_tournament_board(%L)', v_draft), 'NOT_ALLOWED', 'draft tournament board not visible to a stranger');

  -- ── finish: knockout tie needs a winner, error leaves the live row intact
  perform lv_test.as_user('admin2');
  perform lv_test.expect_err(format('select public.live_finish_match(%L, 5, %L::jsonb, %L::jsonb, 1, 1, null, null, null)', v_m1, '{"state":"decided"}', v_sum),
                             'TIE_NEEDS_WINNER', 'level knockout score without winner is rejected');
  perform lv_test.chk((select state from public.tournament_live_scores where match_id = v_m1) = 'live'
                      and (select status from public.tournament_matches where id = v_m1) <> 'completed',
                      'failed finish leaves the live row live and the match undecided');
  select count(*) into v_n from public.tournament_matches where module_id = v_m and round_number = 2 and (entry_a_id is not null or entry_b_id is not null);
  v_res := public.live_finish_match(v_m1, 5, '{"state":"decided","games":[{"a":21,"b":18},{"a":21,"b":19}]}', '{"a":"2","b":"0","state_label":"FINAL"}',
                                    2, 0, '[{"a":21,"b":18},{"a":21,"b":19}]', null, null);
  perform lv_test.chk((select status from public.tournament_matches where id = v_m1) = 'completed', 'finish records the result through record_tournament_result');
  perform lv_test.chk((select score_a from public.tournament_matches where id = v_m1) = 2 and (select score_detail -> 0 ->> 'a' from public.tournament_matches where id = v_m1) = '21', 'score + per-game detail saved');
  perform lv_test.chk((select count(*) from public.tournament_matches where module_id = v_m and round_number = 2 and (entry_a_id is not null or entry_b_id is not null)) = v_n + 1,
                      'winner advanced to the next round exactly like a normal result');
  perform lv_test.chk((select state from public.tournament_live_scores where match_id = v_m1) = 'finished' and (select finished_at from public.tournament_live_scores where match_id = v_m1) is not null, 'live row finished');
  perform lv_test.chk(public.live_finish_match(v_m1, 6, '{"state":"decided"}', v_sum, 2, 0, null, null, null) is not null, 'finish retry is idempotent');
  perform lv_test.as_anon();
  v_board := public.get_live_board(v_code);
  perform lv_test.chk(jsonb_array_length(v_board -> 'live') = 0 and jsonb_array_length(v_board -> 'recent') = 1, 'finished match moves from live to recent');
  perform lv_test.as_user('admin');
  perform lv_test.expect_err(format('select public.live_start_match(%L, %L, false, null, %L::jsonb)', v_m1, 'dev-a', v_rules), 'INVALID_STATUS', 'cannot restart a finished match');

  -- ── old-build path: result recorded the normal way while a match is live → live row turns finished
  perform public.live_start_match(v_m2, 'dev-a', false, null, v_rules, v_snap, v_sum);
  perform public.record_tournament_result(v_m2, 2, 1, '[{"a":21,"b":10},{"a":15,"b":21},{"a":21,"b":19}]', null, null);
  perform lv_test.chk((select state from public.tournament_live_scores where match_id = v_m2) = 'finished', 'normal result sheet finishes the live row (old builds)');
  perform lv_test.chk((select count(*) from realtime.messages where topic = 'live:' || v_code and (payload ->> 'match_id') = v_m2::text and payload ->> 'state' = 'finished') >= 1, 'FINAL broadcast to viewers');
  perform public.reset_tournament_match(v_m2);
  perform lv_test.chk(not exists (select 1 from public.tournament_live_scores where match_id = v_m2), 'result reset removes the live row');

  -- ── abandon
  perform public.live_start_match(v_m2, 'dev-a', false, null, v_rules, v_snap, v_sum);
  perform lv_test.as_user('stranger');
  perform lv_test.expect_err(format('select public.live_abandon_match(%L)', v_m2), 'NOT_ALLOWED', 'non-admin cannot abandon');
  perform lv_test.as_user('admin');
  perform public.live_abandon_match(v_m2);
  perform lv_test.chk((select state from public.tournament_live_scores where match_id = v_m2) = 'abandoned', 'abandon marks the row');
  perform lv_test.chk((select count(*) from jsonb_array_elements(public.get_live_tournament_board(v_t) -> 'live')) = 0, 'abandoned match is off the board');
  perform lv_test.chk((public.live_start_match(v_m2, 'dev-a', false, null, v_rules, v_snap, v_sum) ->> 'state') = 'live', 'an abandoned match can be started again');

  -- ── link: custom code, reserved, taken, old code dead, projector toggle
  perform lv_test.as_user('stranger');
  perform lv_test.expect_err(format('select public.set_tournament_live_code(%L, %L)', v_t, 'seecs-open'), 'NOT_ALLOWED', 'non-admin cannot change the link');
  perform lv_test.as_user('admin');
  perform lv_test.expect_err(format('select public.set_tournament_live_code(%L, %L)', v_t, 'admin'), 'FIELD_INVALID:live_code', 'reserved word rejected');
  perform lv_test.expect_err(format('select public.set_tournament_live_code(%L, %L)', v_t, 'ab'), 'FIELD_INVALID:live_code', 'too short rejected');
  perform lv_test.expect_err(format('select public.set_tournament_live_code(%L, %L)', v_t, '-bad-code-'), 'FIELD_INVALID:live_code', 'leading/trailing dash rejected');
  perform lv_test.expect_err(format('select public.set_tournament_live_code(%L, %L)', v_t, 'has space'), 'FIELD_INVALID:live_code', 'spaces rejected');
  perform lv_test.chk((public.set_tournament_live_code(v_t2, 'SEECS-Open') ->> 'live_code') = 'seecs-open', 'custom code saved lower-cased');
  perform lv_test.expect_err(format('select public.set_tournament_live_code(%L, %L)', v_t, 'seecs-open'), 'LIVE_CODE_TAKEN', 'code already used by another tournament');
  perform lv_test.expect_err(format('select public.set_tournament_live_code(%L, %L)', v_t, 'SEECS-OPEN'), 'LIVE_CODE_TAKEN', 'uniqueness is case-insensitive');
  perform lv_test.chk(public.set_tournament_live_code(v_t, 'finals-day') ->> 'live_code' = 'finals-day', 'custom code applied');
  perform lv_test.as_anon();
  perform lv_test.chk((public.get_live_board(v_code) ->> 'active')::boolean = false, 'old code is dead immediately');
  perform lv_test.chk((public.get_live_board('FINALS-DAY') ->> 'active')::boolean = true, 'new code works (case-insensitive)');
  perform lv_test.chk(public._live_topic_readable('live:finals-day') and not public._live_topic_readable('live:' || v_code) and not public._live_topic_readable('chat:x'),
                      'realtime topic: new code readable, old code and other topics not');
  perform lv_test.chk((select count(*) from realtime.messages where topic = 'live:' || v_code and event = 'config') >= 1, 'old code topic told about the change');
  perform lv_test.as_user('admin');
  perform lv_test.chk(public.set_tournament_live_code(v_t, null) ->> 'live_code' ~ '^[a-hj-km-np-z2-9]{6}$', 'null = new random code');
  perform public.set_tournament_live_code(v_t, 'finals-day');
  perform lv_test.chk((public.set_tournament_live_public(v_t, false) ->> 'live_public')::boolean = false, 'projector switched off');
  perform lv_test.as_anon();
  perform lv_test.chk((public.get_live_board('finals-day') ->> 'active')::boolean = false, 'off => anon gets nothing');
  perform lv_test.chk(not public._live_topic_readable('live:finals-day'), 'off => anon cannot join the topic');
  perform lv_test.as_user('stranger');
  perform lv_test.chk(public._live_topic_readable('live:finals-day'), 'signed-in viewer can still join (can_view) while the projector is off');
  perform lv_test.chk(jsonb_array_length(public.get_live_tournament_board(v_t) -> 'live') >= 1, 'app board unaffected by the projector switch');
  perform lv_test.as_user('admin');
  perform public.set_tournament_live_public(v_t, true);
  update public.tournaments set status = 'draft' where id = v_t;
  perform lv_test.as_anon();
  perform lv_test.chk((public.get_live_board('finals-day') ->> 'active')::boolean = false, 'draft tournament => anon gets nothing');
  update public.tournaments set status = 'published' where id = v_t;

  -- ── settings read + rate limit
  perform lv_test.as_user('admin');
  perform lv_test.chk(public.get_tournament_live_settings(v_t) ->> 'base_url' = 'https://sportron-live-sigma.vercel.app', 'settings include base_url from remote_config');
  perform lv_test.as_user('stranger');
  perform lv_test.expect_err(format('select public.get_tournament_live_settings(%L)', v_t), 'NOT_ALLOWED', 'settings are admin-only');
  perform lv_test.as_user('admin');
  perform lv_test.chk((select count(*) from public.tournament_live_code_log where tournament_id = v_t) >= 3, 'code changes are logged');
  for v_next in 1..10 loop
    begin perform public.set_tournament_live_code(v_t, null); exception when others then exit; end;
  end loop;
  perform lv_test.expect_err(format('select public.set_tournament_live_code(%L, null)', v_t), 'RATE_LIMITED', 'max 10 code changes per day');

  -- ── a volleyball-style module keeps scoring_mode "score" but may use a sets family
  v_vm := lv_test.mk_module(v_t2, 'Volleyball', 'volleyball');
  perform lv_test.chk(public.set_module_live_rules(v_vm, '{"family":"sets","preset":"volleyball_25"}') is not null, 'score-mode module may use sets rules');
  perform lv_test.chk(public.set_module_live_rules(v_vm, '{"family":"timed","preset":"basketball_fiba"}') is not null, 'score-mode module may use timed rules');
  perform public.set_module_live_rules(v_vm, null);
  perform lv_test.chk((select live_rules from public.tournament_modules where id = v_vm) is null, 'rules can be cleared');

  -- ── cleanup job
  perform public.live_start_match(lv_test.match_of(v_vm, 1), 'dev-a', false, null, '{"family":"sets"}', v_snap, v_sum);
  update public.tournament_live_scores set updated_at = now() - interval '7 hours' where match_id = lv_test.match_of(v_vm, 1);
  perform public.live_cleanup();
  perform lv_test.chk((select state from public.tournament_live_scores where match_id = lv_test.match_of(v_vm, 1)) = 'abandoned', 'cleanup abandons live rows idle for 6 h');

  -- ── structural: realtime policy + no client privileges on the table
  perform lv_test.chk(exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'live_scores_read' and cmd = 'SELECT'),
                      'realtime read policy exists');
  perform lv_test.chk(not exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages' and cmd in ('INSERT', 'ALL') and policyname like 'live%'),
                      'no INSERT policy for clients on realtime.messages');
  perform lv_test.chk(not has_table_privilege('authenticated', 'public.tournament_live_scores', 'select')
                      and not has_table_privilege('anon', 'public.tournament_live_scores', 'select'), 'clients have no table access to live scores');
  perform lv_test.chk(has_function_privilege('anon', 'public.get_live_board(text)', 'execute')
                      and not has_function_privilege('anon', 'public.live_push_score(uuid,bigint,jsonb,jsonb)', 'execute')
                      and not has_function_privilege('anon', 'public.get_live_tournament_board(uuid)', 'execute')
                      and has_function_privilege('authenticated', 'public.live_push_score(uuid,bigint,jsonb,jsonb)', 'execute'),
                      'only get_live_board is anon-callable; writes are authenticated-only');

  raise exception 'ALL TESTS PASSED — rolled back, nothing saved';
end $$;

drop schema if exists lv_test cascade;
