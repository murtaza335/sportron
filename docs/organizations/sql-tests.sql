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

  -- ═══ B3: platform staff organization functions ═══
  perform og_test.as_user('nadmin2');
  perform og_test.expect_err('select * from public.admin_list_organizations()', 'NOT_ALLOWED', 'org admin has no admin panel access');
  perform og_test.expect_err(format('select public.admin_add_org_member(%L, %L, ''admin'')', v_nust, og_test.id('stranger')), 'NOT_ALLOWED', 'org admin cannot appoint admins');
  perform og_test.expect_err(format('select public.admin_set_organization_status(%L, ''suspended'')', v_nust), 'NOT_ALLOWED', 'org admin cannot suspend');
  perform og_test.as_user('super');
  v_id := public.admin_create_organization('OG Third Org', 'T3', '{"entry_fields":{"cms_id":"off"}}');
  perform og_test.chk(public.admin_get_organization(v_id) #>> '{settings,entry_fields,cms_id}' = 'off'
                      and public.admin_get_organization(v_id) #>> '{settings,entry_fields,phone}' = 'required'
                      and (public.admin_get_organization(v_id) #>> '{settings,brand_locked}')::boolean, 'create: defaults + patch');
  perform og_test.expect_err('select public.admin_create_organization(''og third org'')', 'DUPLICATE_ORGANIZATION', 'names are unique');
  perform og_test.expect_err(format('select public.admin_update_organization(%L, ''{"settings":{"nope":1}}'')', v_id), 'FIELD_INVALID', 'unknown setting refused');
  perform og_test.expect_err(format('select public.admin_update_organization(%L, ''{"settings":{"entry_fields":{"name":"off"}}}'')', v_id), 'FIELD_INVALID', 'name field cannot be switched off');
  perform public.admin_add_org_member(v_id, og_test.id('stranger'), 'organizer');
  perform public.admin_add_org_member(v_id, og_test.id('stranger'), 'admin');
  perform og_test.chk((select count(*) from public.organization_members where organization_id = v_id and removed_at is null) = 1, 'role change keeps one membership');
  perform og_test.chk(public.admin_remove_org_member(v_id, og_test.id('stranger')) = 0, 'last admin removable by staff, reports zero left');
  perform og_test.expect_err(format('select public.admin_remove_org_member(%L, %L)', v_id, og_test.id('stranger')), 'NOT_FOUND', 'removing twice');
  v_draft := public.admin_create_tournament(jsonb_build_object('name', 'Staff Made', 'organization_id', v_nust));
  perform og_test.chk((select organization_id = v_nust and organization = 'OG Test NUST' from public.tournaments where id = v_draft), 'staff creates for an organization');
  perform public.admin_set_tournament_organization(v_free, v_nust);
  perform og_test.chk(public.admin_get_tournament_organization(v_free) ->> 'organization_id' = v_nust::text, 'attach');
  perform public.admin_set_tournament_organization(v_free, null);
  perform og_test.chk(public.admin_get_tournament_organization(v_free) ->> 'organization_id' is null, 'detach');
  perform public.admin_set_tournament_hidden(v_free, true);
  perform og_test.chk((public.admin_get_tournament_organization(v_free) ->> 'hidden')::boolean, 'staff hide');
  perform public.admin_set_tournament_hidden(v_free, false);
  perform public.admin_update_organization(v_nust, '{"name":"OG Test NUST Renamed"}');
  perform og_test.chk((select organization from public.tournaments where id = v_draft) = 'OG Test NUST Renamed', 'rename updates card label');
  perform public.admin_update_organization(v_nust, '{"name":"OG Test NUST"}');
  perform og_test.chk(exists (select 1 from public.organization_activity where organization_id = v_nust), 'activity recorded');
  perform og_test.chk(not has_function_privilege('anon', 'public.admin_list_organizations()', 'execute'), 'anon cannot call admin functions');

  -- ═══ B4: organizers, activity, my work, notifications ═══
  delete from public.in_app_notifications where type = 'organization_role_assigned';
  perform og_test.as_user('nadmin');
  perform public.org_add_organizer(v_nust, og_test.id('stranger'));
  perform public.org_add_organizer(v_nust, og_test.id('stranger'));
  perform og_test.chk(exists (select 1 from public.org_list_members(v_nust) m where m.profile_id = og_test.id('stranger') and m.role = 'organizer'), 'admin adds an organizer');
  perform og_test.chk((select count(*) from public.in_app_notifications where type = 'organization_role_assigned' and user_id = og_test.id('stranger')) = 1, 'one notification');
  perform public.org_add_organizer(v_nust, og_test.id('nadmin2'));
  perform og_test.chk((select role from public.org_list_members(v_nust) m where m.profile_id = og_test.id('nadmin2')) = 'admin', 'adding an admin never downgrades');
  perform og_test.expect_err(format('select public.org_remove_member(%L, %L)', v_nust, og_test.id('nadmin2')), 'NOT_ALLOWED', 'admin cannot remove an admin');
  perform og_test.expect_err(format('select public.org_remove_member(%L, %L)', v_nust, og_test.id('nadmin')), 'CANNOT_REMOVE_SELF', 'no self removal');
  perform og_test.as_user('norg2');
  perform og_test.expect_err(format('select public.org_add_organizer(%L, %L)', v_nust, og_test.id('mgr')), 'NOT_ALLOWED', 'organizer cannot add organizers');
  perform og_test.expect_err(format('select * from public.org_get_activity(%L)', v_nust), 'NOT_ALLOWED', 'organizer cannot read activity');
  perform og_test.chk(jsonb_array_length(public.org_list_tournaments(v_nust)) = 1
                      and public.org_list_tournaments(v_nust) -> 0 ->> 'name' = 'NUST Cup Two', 'organizer lists only their own');
  perform og_test.as_user('borg');
  perform og_test.expect_err(format('select public.org_list_tournaments(%L)', v_nust), 'NOT_ALLOWED', 'other org: no list');
  perform og_test.expect_err(format('select * from public.org_list_members(%L)', v_nust), 'NOT_ALLOWED', 'other org: no members');
  perform og_test.as_user('badmin');
  perform og_test.expect_err(format('select public.org_add_organizer(%L, %L)', v_nust, og_test.id('badmin')), 'NOT_ALLOWED', 'other org admin cannot add');
  perform og_test.expect_err(format('select * from public.org_get_activity(%L)', v_nust), 'NOT_ALLOWED', 'other org admin: no activity');
  perform og_test.as_user('nadmin');
  perform og_test.chk(jsonb_array_length(public.org_list_tournaments(v_nust)) >= 3, 'admin lists all');
  perform public.org_remove_member(v_nust, og_test.id('stranger'));
  perform og_test.chk(exists (select 1 from public.org_get_activity(v_nust) a where a.summary = 'added @og_stranger as an organizer' and a.actor = '@og_nadmin'), 'activity: who did what');
  perform og_test.chk(exists (select 1 from public.org_get_activity(v_nust) a where a.actor = 'Sportron'), 'activity: staff shown as Sportron');
  perform public.add_module_scorer(v_m, og_test.id('stranger'));
  perform og_test.chk(exists (select 1 from public.org_get_activity(v_nust) a where a.summary like 'added scorer @og_stranger%'), 'activity: scorer added');
  perform og_test.chk(not exists (select 1 from public.org_get_activity(v_nust) a where a.summary ~* '0300|@example'), 'activity has no contact details');

  v_json := public.get_my_work();
  perform og_test.chk(v_json -> 'orgs' -> 0 ->> 'role' = 'admin' and (v_json -> 'orgs' -> 0 ->> 'tournament_count')::int >= 3, 'my work: admin');
  perform og_test.as_user('mgr');
  perform public.schedule_tournament_match(v_m1, now(), null, 'Court 9');
  v_json := public.get_my_work(date_trunc('day', now()));
  perform og_test.chk(jsonb_array_length(v_json -> 'orgs') = 0 and jsonb_array_length(v_json -> 'sports') = 1
                      and jsonb_array_length(v_json -> 'sports' -> 0 -> 'today') = 1
                      and (v_json -> 'sports' -> 0 ->> 'scorer_count')::int = 2, 'my work: sport manager with today''s match');
  perform og_test.as_user('stranger');
  v_json := public.get_my_work();
  perform og_test.chk(v_json = '{"orgs":[],"sports":[]}'::jsonb, 'my work: normal users get nothing');
  update public.organizations set status = 'suspended' where id = v_nust;
  perform og_test.as_user('nadmin');
  perform og_test.chk((public.get_my_work() -> 'orgs' -> 0 ->> 'suspended')::boolean, 'my work: suspension visible');
  perform og_test.expect_err(format('select * from public.org_list_members(%L)', v_nust), 'ORG_SUSPENDED', 'suspended: organize calls explain');
  update public.organizations set status = 'active' where id = v_nust;
  perform og_test.chk(not has_function_privilege('anon', 'public.get_my_work(timestamptz)', 'execute'), 'anon: no my work');

  -- ═══ C1: organizer lifecycle ═══
  perform og_test.as_user('stranger');
  perform og_test.expect_err(format('select public.org_create_tournament(%L, ''{"name":"Nope Cup"}'')', v_nust), 'NOT_ALLOWED', 'outsider cannot create');
  perform og_test.as_user('borg');
  perform og_test.expect_err(format('select public.org_create_tournament(%L, ''{"name":"Nope Cup"}'')', v_nust), 'NOT_ALLOWED', 'other org cannot create');
  perform og_test.as_user('norg2');
  v_id := public.org_create_tournament(v_nust, '{"name":"Organizer Open","organization":"Fake Label"}');
  perform og_test.chk((select status = 'draft' and organization_id = v_nust and organization = 'OG Test NUST' and created_by = og_test.id('norg2')
                       from public.tournaments where id = v_id), 'organizer creates a draft for the org');
  perform og_test.chk(public.is_tournament_admin(v_id), 'creator administers it');
  perform og_test.chk((public.get_publish_check(v_id) -> 'problems') ? 'Add at least one sport.'
                      and (public.get_publish_check(v_id) -> 'problems') ? 'Set a start date.', 'publish check lists problems');
  perform og_test.expect_err(format('select public.publish_tournament(%L)', v_id), 'NOT_READY', 'cannot publish when not ready');
  perform public.update_tournament(v_id, jsonb_build_object('starts_at', now()));
  perform og_test.expect_err(format('select public.org_create_tournament_modules(%L, ''[{"name":"Ok","sport":"badminton"},{"name":"Bad","sport":"nope"}]'')', v_id), 'FIELD_INVALID', 'bad sport rolls back the batch');
  perform og_test.chk((select count(*) from public.tournament_modules where tournament_id = v_id) = 0, 'nothing half-created');
  perform public.org_create_tournament_modules(v_id, '[
    {"name":"Badminton Men''s Singles","sport":"badminton","live_rules":{"family":"sets","preset":"badminton_21","bestOf":3}},
    {"name":"Badminton Doubles","sport":"badminton","settings":{"participant_type":"team","roster_min":2,"roster_max":2,"lineup_size":2}},
    {"name":"Basketball Men","sport":"basketball","settings":{"format":"round_robin"}}]');
  perform og_test.chk((select count(*) from public.tournament_modules where tournament_id = v_id) = 3
                      and (select participant_type from public.tournament_modules where tournament_id = v_id and name = 'Badminton Doubles') = 'team'
                      and (select format from public.tournament_modules where tournament_id = v_id and name = 'Basketball Men') = 'round_robin', 'wizard creates sports with settings');
  perform og_test.chk(jsonb_array_length(public.get_publish_check(v_id) -> 'warnings') = 3, 'warnings: no players yet');
  perform public.publish_tournament(v_id);
  perform og_test.chk((select status from public.tournaments where id = v_id) = 'published'
                      and not exists (select 1 from public.tournament_modules where tournament_id = v_id and status <> 'open'), 'publish opens the sports');
  perform og_test.expect_err(format('select public.publish_tournament(%L)', v_id), 'INVALID_STATUS', 'cannot publish twice');
  perform og_test.expect_err(format('select public.update_tournament(%L, ''{"status":"draft"}'')', v_id), 'INVALID_STATUS', 'organizer cannot unpublish');
  perform og_test.expect_err(format('select public.delete_draft_tournament(%L, ''Organizer Open'')', v_id), 'NOT_ALLOWED', 'published cannot be deleted');
  perform public.update_tournament(v_id, '{"organization":"Hacked"}');
  perform og_test.chk((select organization from public.tournaments where id = v_id) = 'OG Test NUST', 'organization label is locked');

  -- best-of comes from the sport's rules
  select id into v_bm from public.tournament_modules where tournament_id = v_id and name = 'Badminton Men''s Singles';
  for v_n in 1..4 loop
    perform public.upsert_tournament_entry(v_bm, null, 'W' || v_n, null,
      jsonb_build_object('cms_id', 'w' || v_n, 'school', 's', 'phone', '03001234567', 'email', 'w@x.com'));
  end loop;
  perform public.set_module_status(v_bm, 'seeding');
  perform public.generate_bracket(v_bm);
  perform og_test.chk((select bool_and(best_of = 3) from public.tournament_rounds where module_id = v_bm), 'rounds start at the sport''s best-of');

  -- co-organizers
  perform og_test.expect_err(format('select public.add_tournament_admin(%L, %L)', v_id, og_test.id('mgr')), 'NOT_ORG_MEMBER', 'co-organizer must be a member');
  perform og_test.expect_err(format('select public.add_tournament_admin(%L, %L)', v_id, og_test.id('borg')), 'NOT_ORG_MEMBER', 'other org member refused');
  perform public.org_create_tournament_modules(v_id, '[{"name":"Extra","sport":"volleyball"}]');
  perform public.add_tournament_admin(v_id, og_test.id('nadmin'));
  perform public.remove_tournament_admin(v_id, og_test.id('nadmin'));
  perform public.remove_tournament_admin(v_id, og_test.id('norg2'));
  perform og_test.chk(not public.is_tournament_admin(v_id), 'organizer can step out while an org admin exists');
  perform og_test.expect_err(format('select public.add_tournament_admin(%L, %L)', v_free, og_test.id('norg2')), 'NOT_ALLOWED', 'Sportron tournaments unchanged');

  -- hide
  perform og_test.as_user('norg');
  perform og_test.expect_err(format('select public.set_tournament_hidden(%L, true)', v_t2), 'NOT_ALLOWED', 'removed organizer cannot hide');
  perform og_test.as_user('norg2');
  perform og_test.expect_err(format('select public.set_tournament_hidden(%L, true)', v_t2), 'NOT_ALLOWED', 'organizer cannot hide');
  perform og_test.as_user('nadmin');
  perform public.set_tournament_hidden(v_t2, true);
  perform public.set_tournament_hidden(v_t2, false);
  perform og_test.expect_err(format('select public.set_tournament_hidden(%L, true)', v_bt), 'NOT_ALLOWED', 'cannot hide another org''s');

  -- reopen
  perform og_test.expect_err(format('select public.reopen_tournament_module(%L)', v_bm), 'NOT_COMPLETED', 'only finished sports reopen');
  perform public.set_module_status(v_bm, 'in_progress');
  for v_n in 1..3 loop
    select id into v_m1 from public.tournament_matches where module_id = v_bm and status in ('pending','scheduled')
      and entry_a_id is not null and entry_b_id is not null limit 1;
    perform public.record_tournament_result(v_m1, 2, 0);
  end loop;
  perform og_test.chk((select status from public.tournament_modules where id = v_bm) = 'completed', 'sport completes');
  perform public.reopen_tournament_module(v_bm, true);
  perform og_test.chk((select status = 'in_progress' and champion_entry_id is null from public.tournament_modules where id = v_bm), 'org admin reopens');
  perform og_test.as_user('scorer');
  perform og_test.expect_err(format('select public.reopen_tournament_module(%L)', v_bm), 'NOT_ALLOWED', 'scorer cannot reopen');

  -- cancel and delete draft
  perform og_test.as_user('nadmin');
  select id into v_m1 from public.tournament_matches where module_id = v_bm and entry_a_id is not null and entry_b_id is not null and status in ('pending','scheduled') limit 1;
  if v_m1 is not null then
    perform public.live_start_match(v_m1, 'd', false, null, v_rules || '{"bestOf":3}'::jsonb);
  end if;
  perform public.cancel_tournament(v_id, 'Venue closed');
  perform og_test.chk((select status from public.tournaments where id = v_id) = 'cancelled'
                      and not exists (select 1 from public.tournament_live_scores where tournament_id = v_id and state in ('live','break')), 'cancel stops live matches');
  v_id := public.org_create_tournament(v_nust, '{"name":"Throwaway"}');
  perform public.org_create_tournament_modules(v_id, '[{"name":"TT","sport":"table_tennis"}]');
  perform og_test.expect_err(format('select public.cancel_tournament(%L)', v_id), 'INVALID_STATUS', 'drafts are deleted, not cancelled');
  perform og_test.expect_err(format('select public.delete_draft_tournament(%L, ''wrong'')', v_id), 'CONFIRM_MISMATCH', 'name must match');
  perform public.delete_draft_tournament(v_id, 'Throwaway');
  perform og_test.chk(not exists (select 1 from public.tournaments where id = v_id)
                      and not exists (select 1 from public.tournament_modules where tournament_id = v_id), 'draft deleted with its sports');
  perform og_test.chk(exists (select 1 from public.org_get_activity(v_nust) a where a.summary = 'deleted “Throwaway”'), 'deletion is in the history');
  perform og_test.chk(not has_function_privilege('anon', 'public.org_create_tournament(uuid,jsonb)', 'execute')
                      and not has_function_privilege('authenticated', 'public._reopen_module_core(uuid,boolean)', 'execute'), 'privileges');

  -- more checks are appended below by later migrations
  perform og_test.put('t', v_t::text);

  raise exception 'ALL TESTS PASSED — rolled back, nothing saved';
end $$;
