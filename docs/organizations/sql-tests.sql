-- docs/organizations/sql-tests.sql
-- Organizations (migrations 139+): two organizations, permissions, privacy, suspension, removal, hiding.
-- Run with docs/tournaments/local-db/run.sh (listed there), or paste into the SQL editor.
-- The final "ALL TESTS PASSED — rolled back, nothing saved" error IS success.
--
-- People: super (platform staff) · nadmin/nadmin2 (NUST admins) · norg/norg2 (NUST organizers) ·
-- mgr (sport manager, not in any org) · scorer · badmin (OrgB admin) · borg (OrgB organizer) · stranger

drop schema if exists og_test cascade;
create schema og_test;

create function og_test.put(p_k text, p_v text) returns void language plpgsql as $$
begin perform set_config('og.' || p_k, p_v, true); end $$;
create function og_test.ctx(p_k text) returns text language sql stable as
  $$ select nullif(current_setting('og.' || p_k, true), '') $$;
create function og_test.id(p_k text) returns uuid language sql stable as
  $$ select og_test.ctx(p_k)::uuid $$;
create function og_test.as_user(p_k text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', og_test.ctx(p_k), 'role', 'authenticated')::text, true);
end $$;
create function og_test.as_anon() returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', '', true); end $$;
create function og_test.chk(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAIL: %', p_msg; end if;
  raise notice 'PASS: %', p_msg;
end $$;
create function og_test.expect_err(p_sql text, p_code text, p_msg text) returns void language plpgsql as $$
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

create function og_test.mk_module(p_admin text, p_t uuid, p_name text) returns uuid language plpgsql as $$
declare v_m uuid; i int;
begin
  perform og_test.as_user(p_admin);
  v_m := public.create_tournament_module(p_t, p_name, 'badminton', null, null, null, null, null, false, 'manual');
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

create function og_test.match_of(p_m uuid, p_n int) returns uuid language sql stable as $$
  select id from public.tournament_matches
  where module_id = p_m and round_number = 1 and entry_a_id is not null and entry_b_id is not null
  order by match_number offset p_n - 1 limit 1
$$;

do $$
declare
  v_people constant text[] := array['super','nadmin','nadmin2','norg','norg2','mgr','scorer','badmin','borg','stranger'];
  v_k text; v_id uuid; v_nust uuid; v_orgb uuid;
  v_t uuid; v_t2 uuid; v_draft uuid; v_bt uuid; v_bdraft uuid; v_free uuid;
  v_m uuid; v_bm uuid; v_m1 uuid; v_n int; v_code text; v_json jsonb;
  v_rules constant jsonb := '{"family":"sets","preset":"badminton_21","bestOf":1}'::jsonb;
  v_snap constant jsonb := '{"state":"live"}'::jsonb;
  v_sum constant jsonb := '{"a":"0","b":"0"}'::jsonb;
begin
  foreach v_k in array v_people loop
    insert into public.profiles (username) values ('og_' || v_k) returning id into v_id;
    perform og_test.put(v_k, v_id::text);
  end loop;
  insert into public.platform_admins (profile_id, role) values (og_test.id('super'), 'super_admin');

  insert into public.organizations (name, short_name) values ('OG Test NUST', 'NUST') returning id into v_nust;
  insert into public.organizations (name, short_name) values ('OG Test Federation', 'PBF') returning id into v_orgb;
  perform og_test.put('nust', v_nust::text);
  perform og_test.put('orgb', v_orgb::text);
  insert into public.organization_members (organization_id, profile_id, role) values
    (v_nust, og_test.id('nadmin'), 'admin'), (v_nust, og_test.id('nadmin2'), 'admin'),
    (v_nust, og_test.id('norg'), 'organizer'), (v_nust, og_test.id('norg2'), 'organizer'),
    (v_orgb, og_test.id('badmin'), 'admin'), (v_orgb, og_test.id('borg'), 'organizer');

  insert into public.tournaments (name, status, organization_id) values ('NUST Cup', 'published', v_nust) returning id into v_t;
  insert into public.tournaments (name, status, organization_id) values ('NUST Cup Two', 'published', v_nust) returning id into v_t2;
  insert into public.tournaments (name, status, organization_id) values ('NUST Draft', 'draft', v_nust) returning id into v_draft;
  insert into public.tournaments (name, status, organization_id) values ('Fed Cup', 'published', v_orgb) returning id into v_bt;
  insert into public.tournaments (name, status, organization_id) values ('Fed Draft', 'draft', v_orgb) returning id into v_bdraft;
  insert into public.tournaments (name, status) values ('Sportron Cup', 'published') returning id into v_free;
  insert into public.tournament_admins (tournament_id, profile_id) values
    (v_t, og_test.id('norg')), (v_t2, og_test.id('norg2')), (v_draft, og_test.id('norg')),
    (v_bt, og_test.id('borg')), (v_bdraft, og_test.id('borg'));

  v_m := og_test.mk_module('norg', v_t, 'NUST Singles');
  v_bm := og_test.mk_module('borg', v_bt, 'Fed Singles');
  v_m1 := og_test.match_of(v_m, 1);
  perform og_test.as_user('norg');
  perform public.add_module_admin(v_m, og_test.id('mgr'));
  perform public.add_module_scorer(v_m, og_test.id('scorer'));

  -- ═══ B2: org admins hold tournament-admin powers over their organization only ═══
  perform og_test.as_user('nadmin');
  perform og_test.chk(public.is_tournament_admin(v_t) and public.is_tournament_admin(v_t2) and public.is_tournament_admin(v_draft),
                      'org admin administers every NUST tournament');
  perform og_test.chk(public.is_module_admin(v_m), 'org admin manages NUST sports');
  perform og_test.chk(not public.is_tournament_admin(v_bt) and not public.is_tournament_admin(v_free)
                      and not public.is_module_admin(v_bm), 'org admin has nothing outside NUST');
  perform og_test.chk(public.get_tournament_detail(v_t) ->> 'my_role' = 'tournament_admin', 'detail: org admin is tournament_admin (old builds show manage screens)');
  perform og_test.chk(public.get_tournament_detail(v_t) ->> 'my_org_role' = 'admin'
                      and public.get_tournament_detail(v_t) #>> '{tournament,organization_name}' = 'OG Test NUST', 'detail: organization info');
  perform og_test.chk((select my_role from public.get_tournaments('all') where id = v_draft) = 'tournament_admin', 'list: org admin sees NUST draft as admin');
  perform og_test.chk((select count(*) from public.get_tournaments('all') where id = v_bdraft) = 0, 'list: org admin cannot see other org draft');
  perform og_test.chk(public.get_module_detail(v_m) ->> 'my_role' = 'module_admin', 'module detail: org admin manages');
  perform public.update_tournament(v_t, '{"description":"by DD Sports"}');
  perform og_test.chk(exists (select 1 from public.get_module_entries(v_m) e where e.fields ? 'phone'), 'org admin sees private fields');
  perform og_test.chk(exists (select 1 from public.search_profiles_for_tournament('og_str')), 'org admin can search people');
  perform og_test.as_user('norg2');
  perform og_test.chk(exists (select 1 from public.search_profiles_for_tournament('og_str')), 'organizer can search people');
  perform og_test.as_user('stranger');
  perform og_test.expect_err('select * from public.search_profiles_for_tournament(''og_'')', 'NOT_ALLOWED', 'stranger cannot search people');

  -- ═══ organizers manage only their own / assigned ═══
  perform og_test.as_user('norg2');
  perform og_test.chk(not public.is_tournament_admin(v_t), 'organizer does not manage a colleague''s tournament');
  perform og_test.chk(not public.can_view_tournament(v_draft), 'organizer does not see a colleague''s draft');
  perform og_test.expect_err(format('select public.update_tournament(%L, ''{"description":"x"}'')', v_t), 'NOT_ALLOWED', 'organizer cannot edit it');
  perform og_test.chk(not exists (select 1 from public.get_module_entries(v_m) e where e.fields ? 'phone'), 'organizer gets no private fields there');
  insert into public.tournament_admins (tournament_id, profile_id) values (v_t, og_test.id('norg2'));
  perform og_test.chk(public.is_tournament_admin(v_t), '…until added as co-organizer');
  delete from public.tournament_admins where tournament_id = v_t and profile_id = og_test.id('norg2');

  -- ═══ cross-organization isolation (both directions) ═══
  foreach v_k in array array['badmin','borg'] loop
    perform og_test.as_user(v_k);
    perform og_test.chk(not public.can_view_tournament(v_draft), v_k || ': NUST draft invisible');
    perform og_test.chk(not public.is_tournament_admin(v_t) and not public.is_module_admin(v_m), v_k || ': no NUST rights');
    perform og_test.chk(not exists (select 1 from public.get_module_entries(v_m) e where e.fields ?| array['phone','email','cms_id']), v_k || ': no NUST private fields');
    perform og_test.expect_err(format('select public.update_tournament(%L, ''{"description":"x"}'')', v_t), 'NOT_ALLOWED', v_k || ': cannot edit NUST');
    perform og_test.expect_err(format('select public.add_module_admin(%L, %L)', v_m, og_test.id(v_k)), 'NOT_ALLOWED', v_k || ': cannot add themselves');
    perform og_test.expect_err(format('select public.add_module_scorer(%L, %L)', v_m, og_test.id(v_k)), 'NOT_ALLOWED', v_k || ': cannot add scorers');
  end loop;
  foreach v_k in array array['nadmin','norg'] loop
    perform og_test.as_user(v_k);
    perform og_test.chk(not public.can_view_tournament(v_bdraft) and not public.is_tournament_admin(v_bt), v_k || ': nothing in the federation');
    perform og_test.chk(not exists (select 1 from public.get_module_entries(v_bm) e where e.fields ?| array['phone','email','cms_id']), v_k || ': no federation private fields');
  end loop;

  -- ═══ creating your own tournament does not notify you ═══
  perform og_test.as_user('norg');
  delete from public.in_app_notifications where user_id = og_test.id('norg');
  insert into public.tournament_admins (tournament_id, profile_id) values (v_free, og_test.id('norg'));
  perform og_test.chk(not exists (select 1 from public.in_app_notifications where user_id = og_test.id('norg') and type = 'tournament_admin_assigned'), 'no self-notification');
  delete from public.tournament_admins where tournament_id = v_free and profile_id = og_test.id('norg');

  -- ═══ hidden tournaments ═══
  perform og_test.as_user('norg');
  perform public.set_tournament_live_public(v_t, true);
  select live_code into v_code from public.tournaments where id = v_t;
  update public.tournaments set hidden_at = now() where id = v_t;
  perform og_test.as_user('stranger');
  perform og_test.chk(not public.can_view_tournament(v_t) and not public.can_view_module(v_m), 'hidden: players cannot see it');
  perform og_test.chk((select count(*) from public.get_tournaments('all') where id = v_t) = 0, 'hidden: not listed');
  perform og_test.as_anon();
  perform og_test.chk((public.get_live_board(v_code) ->> 'active')::boolean = false, 'hidden: projector link inactive');
  perform og_test.chk(not public._live_topic_readable('live:' || v_code), 'hidden: no realtime for anonymous screens');
  foreach v_k in array array['norg','nadmin','mgr','scorer'] loop
    perform og_test.as_user(v_k);
    perform og_test.chk(public.can_view_tournament(v_t), 'hidden: still visible to ' || v_k);
  end loop;
  update public.tournaments set hidden_at = null where id = v_t;
  perform og_test.as_anon();
  perform og_test.chk((public.get_live_board(v_code) ->> 'active')::boolean, 'unhidden: projector link back');

  -- ═══ suspension freezes writes, keeps reads ═══
  update public.organizations set status = 'suspended' where id = v_nust;
  perform og_test.as_user('norg');
  perform og_test.expect_err(format('select public.update_tournament(%L, ''{"description":"x"}'')', v_t), 'ORG_SUSPENDED', 'suspended: edit refused');
  perform og_test.expect_err(format('select public.schedule_tournament_match(%L, now(), null, null)', v_m1), 'ORG_SUSPENDED', 'suspended: scheduling refused');
  perform og_test.expect_err(format('select public.add_module_scorer(%L, %L)', v_m, og_test.id('stranger')), 'ORG_SUSPENDED', 'suspended: scorers refused');
  perform og_test.expect_err(format('select public.record_tournament_result(%L, 2, 0)', v_m1), 'ORG_SUSPENDED', 'suspended: results refused');
  perform og_test.expect_err(format('select public.set_tournament_live_public(%L, false)', v_t), 'ORG_SUSPENDED', 'suspended: screen settings refused');
  perform og_test.expect_err(format('select public.create_tournament_module(%L, ''New'', ''badminton'', null, null, null, null, null, false, ''manual'')', v_t), 'ORG_SUSPENDED', 'suspended: new sport refused');
  perform og_test.as_user('scorer');
  perform og_test.expect_err(format('select public.live_start_match(%L, ''d'', false, null, %L::jsonb)', v_m1, v_rules), 'ORG_SUSPENDED', 'suspended: live scoring refused');
  perform og_test.as_user('stranger');
  perform og_test.chk(public.can_view_tournament(v_t) and public.get_tournament_detail(v_t) is not null, 'suspended: published stays viewable');
  perform og_test.as_user('nadmin');
  perform og_test.chk(not public.is_tournament_admin(v_t2) and public.get_tournament_detail(v_t) ->> 'my_org_role' is null, 'suspended: org roles give nothing');
  perform og_test.as_user('borg');
  perform public.update_tournament(v_bt, '{"description":"unaffected"}');
  perform og_test.chk(true, 'suspended: other organizations unaffected');
  perform og_test.as_user('super');
  perform public.admin_update_tournament(v_t, '{"description":"staff edit"}');
  perform og_test.chk(true, 'suspended: platform staff can still act');
  update public.organizations set status = 'active' where id = v_nust;
  perform og_test.as_user('norg');
  perform public.update_tournament(v_t, '{"description":"back"}');
  perform og_test.chk(true, 'reactivated: writes work again');

  -- ═══ removing an organizer ends access at once, tournaments stay ═══
  perform og_test.as_user('norg');
  perform public.live_start_match(v_m1, 'd-org', false, null, v_rules, v_snap, v_sum);
  perform og_test.as_user('nadmin');
  perform public._org_remove_member(v_nust, og_test.id('norg'));
  perform og_test.as_user('norg');
  perform og_test.chk(not public.is_tournament_admin(v_t) and not public.is_org_member(v_nust), 'removed organizer loses access');
  perform og_test.chk(not exists (select 1 from public.tournament_admins ta join public.tournaments t on t.id = ta.tournament_id
                                  where ta.profile_id = og_test.id('norg') and t.organization_id = v_nust), 'their admin rows are gone');
  perform og_test.chk((select scorer_id from public.tournament_live_scores where match_id = v_m1) is null, 'their live claim is released');
  perform og_test.chk(exists (select 1 from public.tournaments where id = v_t and organization_id = v_nust), 'tournament stays with NUST');
  perform og_test.chk(exists (select 1 from public.organization_members where profile_id = og_test.id('norg') and removed_at is not null), 'history kept');
  perform og_test.as_user('nadmin2');
  perform og_test.chk(public.is_tournament_admin(v_t), 'DD Sports still manages it');
  perform og_test.as_anon();
  perform og_test.chk(not public.is_org_admin(v_nust) and not public.is_tournament_admin(v_t), 'anon has no roles');

  -- ═══ privileges ═══
  perform og_test.chk(not has_table_privilege('authenticated', 'public.organizations', 'select')
                      and not has_table_privilege('authenticated', 'public.organization_members', 'select')
                      and not has_table_privilege('anon', 'public.organizations', 'select'), 'no direct table access');
  perform og_test.chk(not has_function_privilege('authenticated', 'public._org_remove_member(uuid,uuid)', 'execute')
                      and not has_function_privilege('authenticated', 'public._org_role(uuid,uuid)', 'execute'), 'internal helpers are internal');

  -- more checks are appended below by later migrations
  perform og_test.put('t', v_t::text);

  raise exception 'ALL TESTS PASSED — rolled back, nothing saved';
end $$;
