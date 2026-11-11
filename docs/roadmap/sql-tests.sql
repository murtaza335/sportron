-- docs/roadmap/sql-tests.sql
-- DB tests for roadmap migrations 125–128. Same conventions as docs/admin-panel/sql-tests.sql:
-- STEP 2 rolls itself back and ends with "ALL TESTS PASSED — rolled back, nothing saved" (that error IS success).
drop schema if exists rm_test cascade;
create schema rm_test;
create function rm_test.as_user(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', p::text, 'role', 'authenticated')::text, true); end $$;
create function rm_test.chk(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAIL: %', p_msg; end if;
  raise notice 'PASS: %', p_msg;
end $$;
create function rm_test.expect_err(p_sql text, p_code text, p_msg text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm like p_code || '%' then raise notice 'PASS: % (got %)', p_msg, sqlerrm; return; end if;
    raise exception 'FAIL: % (expected %, got %)', p_msg, p_code, sqlerrm;
  end;
  raise exception 'FAIL: % (expected %, no error)', p_msg, p_code;
end $$;

do $$
declare
  v_ids uuid[]; v_sa uuid; v_user uuid; v_ann uuid; v_n int; v_t uuid; v_m uuid; v_m2 uuid; v_d jsonb; v_c uuid; v_p uuid; v_p2 uuid;
begin
  select array_agg(id) into v_ids from (select id from public.profiles where deleted_at is null order by created_at, id limit 3) s;
  v_sa := v_ids[1]; v_user := v_ids[2];
  insert into public.platform_admins (profile_id, role) values (v_sa, 'super_admin');

  -- ── 125 announcements ──
  perform rm_test.as_user(v_user);
  perform rm_test.expect_err($q$select public.admin_create_announcement('{"title":"x"}')$q$, 'NOT_ALLOWED', 'user cannot create announcement');
  perform rm_test.as_user(v_sa);
  perform rm_test.expect_err($q$select public.admin_create_announcement('{"title":""}')$q$, 'FIELD_INVALID:title', 'title required');
  perform rm_test.expect_err($q$select public.admin_create_announcement('{"title":"a","placement":"nope"}')$q$, 'FIELD_INVALID:placement', 'placement validated');
  perform rm_test.expect_err($q$select public.admin_create_announcement('{"title":"a","image_url":"http://evil/x.png"}')$q$, 'FIELD_INVALID:image_url', 'cloudinary-only image');
  v_ann := public.admin_create_announcement('{"title":"Hello","placement":"home_banner","platforms":["android"],"min_app_version":"1.0.2"}');
  perform rm_test.as_user(v_user);
  select count(*) into v_n from public.get_active_announcements('android', '1.0.1');
  perform rm_test.chk(v_n = 0, 'version below min hides announcement');
  select count(*) into v_n from public.get_active_announcements('android', '1.0.10');
  perform rm_test.chk(v_n = 1, 'matching platform + version shows it (1.0.10 > 1.0.2 numerically)');
  select count(*) into v_n from public.get_active_announcements('web', '1.0.10');
  perform rm_test.chk(v_n = 0, 'other platform hides it');
  perform public.record_announcement_event(v_ann, 'view');
  perform rm_test.as_user(v_sa);
  perform rm_test.chk((select views from public.admin_list_announcements() where id = v_ann) = 1, 'view counted');
  perform public.admin_end_announcement(v_ann);
  perform rm_test.as_user(v_user);
  select count(*) into v_n from public.get_active_announcements('android', '1.0.10');
  perform rm_test.chk(v_n = 0, 'ended announcement disappears');

  -- ── 127 flags + remote config ──
  perform rm_test.as_user(v_user);
  perform rm_test.expect_err($q$select public.admin_upsert_feature_flag('x_flag', true)$q$, 'NOT_ALLOWED', 'user cannot set flags');
  perform rm_test.chk((select enabled from public.get_feature_flags('android','1.0.1') where key = 'announcements'), 'seeded flag readable and on');
  perform rm_test.as_user(v_sa);
  perform public.admin_upsert_feature_flag('beta_x', true, 100, '1.0.5', array['android'], 'test');
  perform rm_test.as_user(v_user);
  perform rm_test.chk(not (select enabled from public.get_feature_flags('android','1.0.4') where key = 'beta_x'), 'flag off below min version');
  perform rm_test.chk((select enabled from public.get_feature_flags('android','1.0.5') where key = 'beta_x'), 'flag on at min version');
  perform rm_test.chk(not (select enabled from public.get_feature_flags('web','1.0.9') where key = 'beta_x'), 'flag off on other platform');
  perform rm_test.as_user(v_sa);
  perform public.admin_upsert_feature_flag('beta_x', true, 0);
  perform rm_test.as_user(v_user);
  perform rm_test.chk(not (select enabled from public.get_feature_flags('android','1.0.9') where key = 'beta_x'), 'rollout 0% = off');
  perform rm_test.chk((select count(*) from public.get_remote_config() where key = 'sports') = 1, 'sports config readable');
  perform rm_test.chk((select jsonb_array_length(value) from public.get_remote_config() where key = 'sports') = 14, 'sports seeded (10 + 4 more)');
  perform rm_test.as_user(v_sa);
  perform rm_test.expect_err($q$select public.admin_set_remote_config('sports', '[{"key":"other","label":"x","kind":"team","tier":"more"}]')$q$, 'FIELD_INVALID:sports', 'sports cannot define other');
  perform rm_test.expect_err($q$select public.admin_set_remote_config('nope', '{}')$q$, 'FIELD_INVALID:key', 'config key allowlist');
  perform public.admin_set_remote_config('limits', '{"chat_max_length":800}');
  perform public.admin_set_recommended_app_version('1.0.9', 'https://play.google.com/x', 'Update!');
  perform rm_test.chk((select value->>'version' from public.site_config where key = 'recommended_app_version') = '1.0.9', 'recommended version saved');

  -- ── 126 custom sport names + scoring mode ──
  perform rm_test.as_user(v_sa);
  v_t := public.admin_create_tournament('{"name":"Roadmap Cup"}'::jsonb);
  perform public.admin_add_tournament_admin(v_t, v_user);
  perform rm_test.as_user(v_user);
  -- old-style 10-arg call still works (named params, no new ones)
  v_m := public.create_tournament_module(p_tournament => v_t, p_name => 'Old style', p_sport => 'other', p_description => null,
    p_rules_text => null, p_venue => null, p_starts_at => null, p_max_entries => null, p_third_place => false, p_seeding_method => 'manual');
  perform rm_test.chk((select custom_sport_name is null from public.tournament_modules where id = v_m), 'old client: Other module without a name is allowed (switch off)');
  v_m2 := public.create_tournament_module(p_tournament => v_t, p_name => 'Chess open', p_sport => 'other', p_description => null,
    p_rules_text => null, p_venue => null, p_starts_at => null, p_max_entries => null, p_third_place => false, p_seeding_method => 'manual',
    p_custom_sport_name => '  Chess  ', p_sport_key => 'chess');
  perform rm_test.chk((select custom_sport_name = 'Chess' and sport_key = 'chess' from public.tournament_modules where id = v_m2), 'name trimmed, key stored');
  perform rm_test.expect_err(format($q$select public.create_tournament_module(%L, 'Long', 'other', null, null, null, null, null, false, 'manual', %L, null)$q$, v_t, repeat('x', 31)),
    'FIELD_INVALID:custom_sport_name', 'name max 30');
  perform rm_test.expect_err(format($q$select public.create_tournament_module(%L, 'Bad key', 'other', null, null, null, null, null, false, 'manual', 'x', 'Bad Key!')$q$, v_t),
    'FIELD_INVALID:sport_key', 'sport_key format');
  -- known sport drops any name/key
  perform public.update_tournament_module(v_m2, 'Chess open', 'tennis', null, null, null, null, null, false, 'manual', 'ignored', 'chess');
  perform rm_test.chk((select sport = 'tennis' and custom_sport_name is null and sport_key is null from public.tournament_modules where id = v_m2), 'known sport clears name + key');
  -- scoring_mode through the settings RPC
  perform public.update_tournament_module_settings(v_m, '{"scoring_mode":"games","allow_draws":false}'::jsonb);
  perform rm_test.chk((select scoring_mode = 'games' and allow_draws = false from public.tournament_modules where id = v_m), 'scoring_mode set + other keys delegated');
  perform rm_test.expect_err(format($q$select public.update_tournament_module_settings(%L, '{"scoring_mode":"bogus"}'::jsonb)$q$, v_m), 'FIELD_INVALID:scoring_mode', 'scoring_mode validated');
  perform rm_test.chk(public.get_module_detail(v_m) -> 'module' ->> 'scoring_mode' = 'games', 'get_module_detail returns scoring_mode');
  v_d := public.get_tournament_detail(v_t);
  perform rm_test.chk(jsonb_array_length(v_d -> 'modules') = 2 and (v_d -> 'modules' -> 0) ? 'custom_sport_name' and (v_d -> 'modules' -> 0) ? 'scoring_mode', 'tournament detail modules carry new keys');
  -- server-side "required" switch
  perform rm_test.as_user(v_sa);
  perform public.admin_set_require_custom_sport_name(true);
  perform rm_test.as_user(v_user);
  perform rm_test.expect_err(format($q$select public.create_tournament_module(%L, 'Strict', 'other', null, null, null, null, null, false, 'manual')$q$, v_t),
    'CUSTOM_SPORT_REQUIRED', 'required once switched on');
  -- communities
  insert into public.communities (name, sport, created_by, custom_sport_name) values ('Padel crew', 'other', v_user, ' Padel ') returning id into v_c;
  perform rm_test.chk((select custom_sport_name = 'Padel' from public.communities where id = v_c), 'community name trimmed');
  perform rm_test.expect_err($q$insert into public.communities (name, sport, created_by) values ('NoName', 'other', null)$q$, 'CUSTOM_SPORT_REQUIRED', 'community Other needs name once on');
  perform rm_test.as_user(v_sa);
  perform public.admin_set_require_custom_sport_name(false);
  insert into public.community_members (community_id, profile_id, role) values (v_c, v_user, 'admin');
  perform rm_test.as_user(v_user);
  perform rm_test.chk((select custom_sport_name from public.get_community_by_id(v_c)) = 'Padel', 'get_community_by_id returns custom_sport_name');
  perform rm_test.chk(exists (select 1 from public.get_my_communities() where id = v_c and custom_sport_name = 'Padel'), 'get_my_communities returns it');
  perform rm_test.expect_err(format($q$insert into public.community_matches (community_id) values (%L)$q$, v_c), 'NOT_ALLOWED', 'no matches in Other communities');

  -- ── 128 tournament promos ──
  perform rm_test.as_user(v_ids[3]);
  perform rm_test.expect_err(format($q$select public.upsert_tournament_promo(%L, null, '{"title":"x","code":"123456"}')$q$, v_t), 'NOT_ALLOWED', 'non-admin cannot create promo');
  perform rm_test.as_user(v_user);
  insert into public.tournament_admins (tournament_id, profile_id) values (v_t, v_user) on conflict do nothing;
  perform rm_test.expect_err(format($q$select public.upsert_tournament_promo(%L, null, '{"title":"x","code":"12345"}')$q$, v_t), 'PROMO_CODE_INVALID', 'code must be 6 digits');
  perform rm_test.expect_err(format($q$select public.upsert_tournament_promo(%L, null, '{"title":"x","code":"12345a"}')$q$, v_t), 'PROMO_CODE_INVALID', 'digits only');
  perform rm_test.expect_err(format($q$select public.upsert_tournament_promo(%L, null, '{"title":"","code":"123456"}')$q$, v_t), 'FIELD_INVALID:title', 'title required');
  perform rm_test.expect_err(format($q$select public.upsert_tournament_promo(%L, null, '{"title":"x","code":"123456","cta_url":"http://a.b"}')$q$, v_t), 'FIELD_INVALID:cta_url', 'https cta only');
  v_p := public.upsert_tournament_promo(v_t, null, '{"title":"10% off entry","code":"482913","partner_name":"Cafe X"}');
  perform rm_test.chk((select code is null and not revealed from public.get_tournament_promos(v_t) where id = v_p), 'reveal mode withholds the code');
  perform rm_test.chk((select reveal_count = 0 from public.get_tournament_promos_manage(v_t) where id = v_p), 'manage view starts at 0 reveals');
  perform rm_test.chk(public.reveal_tournament_promo(v_p) = '482913', 'reveal returns the code');
  perform public.reveal_tournament_promo(v_p);
  perform rm_test.chk((select code = '482913' and revealed from public.get_tournament_promos(v_t) where id = v_p), 'code visible after reveal');
  perform rm_test.chk((select reveal_count = 1 from public.get_tournament_promos_manage(v_t) where id = v_p), 'reveal counted once per user');
  perform public.upsert_tournament_promo(v_t, v_p, '{"display_mode":"visible"}');
  perform rm_test.chk((select display_mode = 'visible' and code = '482913' from public.get_tournament_promos(v_t) where id = v_p), 'visible mode shows code, patch keeps other fields');
  perform public.upsert_tournament_promo(v_t, v_p, '{"ends_at":"2000-01-01T00:00:00Z"}');
  perform rm_test.chk((select count(*) = 0 from public.get_tournament_promos(v_t)), 'expired promo hidden from players');
  perform rm_test.expect_err(format($q$select public.reveal_tournament_promo(%L)$q$, v_p), 'NOT_FOUND', 'cannot reveal an expired promo');
  perform public.upsert_tournament_promo(v_t, v_p, '{"ends_at":null}');
  perform public.end_tournament_promo(v_p);
  perform rm_test.chk((select count(*) = 0 from public.get_tournament_promos(v_t)), 'ended promo hidden from players');
  perform rm_test.chk((select not is_active from public.get_tournament_promos_manage(v_t) where id = v_p), 'ended promo still listed for admins');
  perform rm_test.as_user(v_ids[3]);
  perform rm_test.expect_err(format($q$select * from public.get_tournament_promos_manage(%L)$q$, v_t), 'NOT_ALLOWED', 'other users cannot read the manage view');
  perform rm_test.as_user(v_user);
  perform rm_test.expect_err($q$select * from public.admin_list_tournament_promos(null)$q$, 'NOT_ALLOWED', 'platform RPC needs staff role');
  perform rm_test.as_user(v_sa);
  v_p2 := public.admin_upsert_tournament_promo(v_t, null, '{"title":"Staff promo","code":"000111"}', 'test');
  perform rm_test.chk(exists (select 1 from public.admin_list_tournament_promos(v_t) where id = v_p2 and code = '000111'), 'staff can create + list');
  perform public.admin_end_tournament_promo(v_p2);
  perform rm_test.chk((select not is_active from public.admin_list_tournament_promos(v_t) where id = v_p2), 'staff can end');

  -- (more tests are inserted above this line)
  raise exception 'ALL TESTS PASSED — rolled back, nothing saved';
end $$;

drop schema if exists rm_test cascade;
