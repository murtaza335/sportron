-- docs/admin-panel/sql-tests.sql
-- Admin panel DB tests for migrations 122–124. Run AFTER applying them (Supabase SQL editor or the
-- local harness docs/tournaments/local-db/run.sh).
--
-- STEP 1 creates helper schema `adm_test`; STEP 2 is one DO block that rolls ITSELF back and ends with
-- "ALL TESTS PASSED — rolled back, nothing saved" (that "error" IS the success message); STEP 3 drops
-- the helper schema (run it even if STEP 2 failed).
-- Needs >= 4 existing, non-deleted profiles. The test makes its own staff rows inside the rolled-back block.

-- ═══════════════════════════ STEP 1: helpers ═══════════════════════════
drop schema if exists adm_test cascade;
create schema adm_test;

create function adm_test.put(p_k text, p_v text) returns void language plpgsql as $$
begin perform set_config('adm.' || p_k, p_v, true); end $$;

create function adm_test.ctx(p_k text) returns text language sql stable as
  $$ select nullif(current_setting('adm.' || p_k, true), '') $$;

create function adm_test.as_user(p_k text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', adm_test.ctx(p_k), 'role', 'authenticated')::text, true);
end $$;

create function adm_test.as_nobody() returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', '', true); end $$;

create function adm_test.chk(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAIL: %', p_msg; end if;
  raise notice 'PASS: %', p_msg;
end $$;

-- run p_sql; it must raise an error whose message starts with p_code
create function adm_test.expect_err(p_sql text, p_code text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like p_code || '%' then
      raise notice 'PASS: % (got %)', p_msg, sqlerrm;
      return;
    end if;
    raise exception 'FAIL: % (expected %, got %)', p_msg, p_code, sqlerrm;
  end;
  raise exception 'FAIL: % (expected %, no error)', p_msg, p_code;
end $$;

-- ═══════════════════════════ STEP 2: tests ═══════════════════════════
do $$
declare
  v_ids uuid[];
  v_n int;
begin
  select array_agg(id) into v_ids from (
    select id from public.profiles where deleted_at is null order by created_at, id limit 4) s;
  if coalesce(array_length(v_ids, 1), 0) < 4 then raise exception 'need >= 4 profiles'; end if;
  perform adm_test.put('sa',   v_ids[1]::text);   -- super admin
  perform adm_test.put('tm',   v_ids[2]::text);   -- tournament manager
  perform adm_test.put('user', v_ids[3]::text);   -- normal user
  perform adm_test.put('other', v_ids[4]::text);  -- target of grants

  insert into public.platform_admins (profile_id, role) values (v_ids[1], 'super_admin'), (v_ids[2], 'tournament_manager');

  -- ── 122: roles ──
  perform adm_test.as_user('sa');
  perform adm_test.chk(public.get_my_platform_role() = 'super_admin', 'super admin sees own role');
  perform adm_test.as_user('tm');
  perform adm_test.chk(public.get_my_platform_role() = 'tournament_manager', 'tm sees own role');
  perform adm_test.as_user('user');
  perform adm_test.chk(public.get_my_platform_role() is null, 'normal user has no role');
  perform adm_test.as_nobody();
  perform adm_test.expect_err('select public.get_my_platform_role()', 'NOT_ALLOWED', 'no user: get_my_platform_role');

  -- every admin function refuses no-user and normal user
  perform adm_test.as_nobody();
  perform adm_test.expect_err('select * from public.admin_get_overview()', 'NOT_ALLOWED', 'no user: overview');
  perform adm_test.as_user('user');
  perform adm_test.expect_err('select * from public.admin_get_overview()', 'NOT_ALLOWED', 'user: overview');
  perform adm_test.expect_err($q$select * from public.admin_search_profiles('us', 5)$q$, 'NOT_ALLOWED', 'user: search');
  perform adm_test.expect_err('select * from public.admin_list_platform_admins()', 'NOT_ALLOWED', 'user: list staff');
  perform adm_test.expect_err(format('select public.admin_grant_platform_role(%L,%L)', adm_test.ctx('other'), 'super_admin'),
    'NOT_ALLOWED', 'user: grant');
  perform adm_test.expect_err(format('select public.admin_revoke_platform_role(%L)', adm_test.ctx('tm')),
    'NOT_ALLOWED', 'user: revoke');

  -- tournament manager: overview + search ok, staff management refused
  perform adm_test.as_user('tm');
  select count(*) into v_n from public.admin_get_overview();
  perform adm_test.chk(v_n = 1, 'tm: overview works');
  perform adm_test.chk((select count(*) from public.admin_search_profiles('u', 5)) = 0, 'search needs >= 2 chars');
  perform adm_test.chk((select count(*) from public.admin_search_profiles('%%', 5)) = 0, 'search escapes wildcards');
  perform adm_test.expect_err('select * from public.admin_list_platform_admins()', 'NOT_ALLOWED', 'tm: list staff');
  perform adm_test.expect_err(format('select public.admin_grant_platform_role(%L,%L)', adm_test.ctx('other'), 'tournament_manager'),
    'NOT_ALLOWED', 'tm: grant');
  perform adm_test.expect_err(format('select public.admin_revoke_platform_role(%L)', adm_test.ctx('sa')),
    'NOT_ALLOWED', 'tm: revoke');

  -- super admin: grant / self rules / revoke / re-grant
  perform adm_test.as_user('sa');
  perform adm_test.chk((select count(*) from public.admin_list_platform_admins()) = 2, 'super: lists 2 staff');
  perform adm_test.expect_err(format('select public.admin_grant_platform_role(%L,%L)', adm_test.ctx('other'), 'owner'),
    'INVALID_ROLE', 'bad role rejected');
  perform adm_test.expect_err(format('select public.admin_grant_platform_role(%L,%L)', adm_test.ctx('sa'), 'tournament_manager'),
    'CANNOT_CHANGE_SELF', 'cannot change own role');
  perform adm_test.expect_err(format('select public.admin_revoke_platform_role(%L)', adm_test.ctx('sa')),
    'CANNOT_CHANGE_SELF', 'cannot revoke self');
  perform adm_test.expect_err(format('select public.admin_grant_platform_role(%L,%L)', gen_random_uuid(), 'tournament_manager'),
    'NOT_FOUND', 'grant to unknown profile');
  perform public.admin_grant_platform_role(adm_test.ctx('other')::uuid, 'tournament_manager');
  perform adm_test.as_user('other');
  perform adm_test.chk(public.get_my_platform_role() = 'tournament_manager', 'granted user is tm');
  perform adm_test.as_user('sa');
  perform public.admin_revoke_platform_role(adm_test.ctx('other')::uuid);
  perform adm_test.as_user('other');
  perform adm_test.chk(public.get_my_platform_role() is null, 'revoked user loses role at once');
  perform adm_test.expect_err('select * from public.admin_get_overview()', 'NOT_ALLOWED', 'revoked user refused');
  perform adm_test.as_user('sa');
  perform adm_test.expect_err(format('select public.admin_revoke_platform_role(%L)', adm_test.ctx('other')),
    'NOT_FOUND', 'revoking twice -> NOT_FOUND');
  perform public.admin_grant_platform_role(adm_test.ctx('other')::uuid, 'super_admin');
  perform adm_test.as_user('other');
  perform adm_test.chk(public.get_my_platform_role() = 'super_admin', 're-grant re-activates (new role)');

  -- deleted profile loses its role
  update public.profiles set deleted_at = now() where id = adm_test.ctx('other')::uuid;
  perform adm_test.chk(public.get_my_platform_role() is null, 'deleted profile has no role');
  update public.profiles set deleted_at = null where id = adm_test.ctx('other')::uuid;

  -- audit rows flagged as admin actions
  select count(*) into v_n from public.audit_logs
   where metadata->>'admin' = 'true' and table_name = 'platform_admins';
  perform adm_test.chk(v_n >= 3, 'staff changes leave admin-flagged audit rows');

  -- ═══ 123: settings ═══
  perform adm_test.as_nobody();
  perform adm_test.expect_err('select * from public.admin_get_site_config()', 'NOT_ALLOWED', 'no user: site config');
  perform adm_test.as_user('user');
  perform adm_test.expect_err($q$select public.admin_set_maintenance(true, 'x')$q$, 'NOT_ALLOWED', 'user: maintenance');
  perform adm_test.as_user('tm');
  perform adm_test.expect_err('select * from public.admin_get_site_config()', 'NOT_ALLOWED', 'tm: site config');
  perform adm_test.expect_err($q$select public.admin_set_maintenance(true, 'x')$q$, 'NOT_ALLOWED', 'tm: maintenance');
  perform adm_test.expect_err($q$select public.admin_set_min_app_version('1.0.2', '', '')$q$, 'NOT_ALLOWED', 'tm: min version');

  perform adm_test.as_user('sa');
  perform adm_test.chk((select count(*) from public.admin_get_site_config()) = 2, 'super: reads both config rows');
  perform adm_test.expect_err($q$select public.admin_set_maintenance(true, '   ')$q$, 'FIELD_INVALID:message', 'message required when enabling');
  perform adm_test.expect_err(format('select public.admin_set_maintenance(true, %L)', repeat('a', 301)),
    'FIELD_INVALID:message', 'message max 300');
  perform public.admin_set_maintenance(true, ' Back soon ', 'planned');
  perform adm_test.chk((select value from public.site_config where key = 'maintenance')
    = '{"enabled": true, "message": "Back soon"}'::jsonb, 'maintenance JSON shape matches RootLayout');
  perform public.admin_set_maintenance(false, '');
  perform adm_test.chk((select value->>'enabled' from public.site_config where key = 'maintenance') = 'false',
    'maintenance can be disabled with empty message');
  perform adm_test.expect_err($q$select public.admin_set_min_app_version('1.0', '', '')$q$, 'FIELD_INVALID:min_version', 'bad semver');
  perform adm_test.expect_err($q$select public.admin_set_min_app_version('1.0.2', 'http://x.com', '')$q$, 'FIELD_INVALID:store_url', 'store url must be https');
  perform public.admin_set_min_app_version('1.2.3', 'https://play.google.com/x', 'Please update');
  perform adm_test.chk((select value from public.site_config where key = 'min_app_version')
    = '{"min_version": "1.2.3", "store_url": "https://play.google.com/x", "message": "Please update"}'::jsonb,
    'min version JSON shape matches RootLayout');
  perform adm_test.chk((select count(*) from public.audit_logs
    where table_name = 'site_config' and metadata->>'admin' = 'true') = 3, 'settings writes are audited');

  -- ═══ 124: tournaments ═══
  declare
    v_t uuid;
    v_t2 uuid;
    v_m uuid;
    v_e uuid;
  begin
    perform adm_test.as_nobody();
    perform adm_test.expect_err($q$select * from public.admin_list_tournaments()$q$, 'NOT_ALLOWED', 'no user: list tournaments');
    perform adm_test.as_user('user');
    perform adm_test.expect_err($q$select public.admin_create_tournament('{"name":"Hello"}')$q$, 'NOT_ALLOWED', 'user: create');
    perform adm_test.expect_err(format('select * from public.admin_get_tournament(%L)', gen_random_uuid()), 'NOT_ALLOWED', 'user: get');

    perform adm_test.as_user('tm');
    perform adm_test.expect_err($q$select public.admin_create_tournament('{"name":"ab"}')$q$, 'FIELD_INVALID:name', 'name too short');
    perform adm_test.expect_err($q$select public.admin_create_tournament('{}')$q$, 'FIELD_INVALID:name', 'name required on create');
    perform adm_test.expect_err($q$select public.admin_create_tournament('{"name":"Valid name","status":"published"}')$q$,
      'FIELD_INVALID:status', 'status not settable via patch');
    perform adm_test.expect_err($q$select public.admin_create_tournament('{"name":"Valid name","image_url":"http://evil.com/a.png"}')$q$,
      'INVALID_IMAGE_URL', 'cover must be Cloudinary');
    perform adm_test.expect_err($q$select public.admin_create_tournament('{"name":"Valid name","starts_at":"2026-05-02T10:00:00Z","ends_at":"2026-05-01T10:00:00Z"}')$q$,
      'FIELD_INVALID:ends_at', 'end before start');
    perform adm_test.expect_err($q$select public.admin_create_tournament('{"name":"Valid name","starts_at":"nonsense"}')$q$,
      'FIELD_INVALID:starts_at', 'unparseable date');
    v_t := public.admin_create_tournament(
      '{"name":"Admin Cup","organization":"Club","image_url":"https://res.cloudinary.com/x/a.jpg"}'::jsonb, 'first');
    perform adm_test.chk((select status = 'draft' and created_by = adm_test.ctx('tm')::uuid
      from public.tournaments where id = v_t), 'create: draft, created_by = caller');
    perform adm_test.chk((select count(*) from public.tournament_entry_fields where tournament_id = v_t and is_core) = 5,
      'create: 5 core entry fields seeded');
    perform adm_test.chk((select count(*) from public.admin_list_tournaments('draft', 'admin cup')) = 1, 'list: filter + search');
    perform adm_test.chk((select count(*) from public.admin_list_tournaments(null, '%')) = 0, 'list: wildcard escaped');
    perform adm_test.expect_err($q$select * from public.admin_list_tournaments('bogus')$q$, 'INVALID_STATUS', 'list: bad status');
    perform adm_test.chk((select created_by_username from public.admin_get_tournament(v_t)) is not distinct from
      (select username from public.profiles where id = adm_test.ctx('tm')::uuid), 'get: creator name');
    perform adm_test.expect_err(format('select * from public.admin_get_tournament(%L)', gen_random_uuid()), 'NOT_FOUND', 'get: unknown id');

    perform public.admin_update_tournament(v_t, '{"name":"Admin Cup 2","location":""}'::jsonb);
    perform adm_test.chk((select name = 'Admin Cup 2' and location is null and organization = 'Club'
      from public.tournaments where id = v_t), 'update: partial patch, empty string clears');
    perform adm_test.expect_err(format('select public.admin_update_tournament(%L, %L)', v_t, '{"status":"completed"}'),
      'FIELD_INVALID:status', 'update cannot change status');
    perform adm_test.expect_err(format('select public.admin_update_tournament(%L, %L)', gen_random_uuid(), '{"name":"abcd"}'),
      'NOT_FOUND', 'update: unknown id');

    -- status
    perform adm_test.expect_err(format('select public.admin_set_tournament_status(%L, %L)', v_t, 'live'), 'INVALID_STATUS', 'bad status');
    perform public.admin_set_tournament_status(v_t, 'published');
    perform public.admin_set_tournament_status(v_t, 'completed');
    perform public.admin_update_tournament(v_t, '{"description":"edited while completed"}'::jsonb);
    perform adm_test.chk((select description from public.tournaments where id = v_t) = 'edited while completed',
      'edit works on a completed tournament');
    perform public.admin_set_tournament_status(v_t, 'draft');

    -- admins
    perform public.admin_add_tournament_admin(v_t, adm_test.ctx('user')::uuid);
    perform public.admin_add_tournament_admin(v_t, adm_test.ctx('user')::uuid);
    perform adm_test.chk((select count(*) from public.admin_list_tournament_admins(v_t)) = 1, 'add admin is idempotent');
    perform adm_test.expect_err(format('select public.admin_add_tournament_admin(%L,%L)', v_t, gen_random_uuid()), 'NOT_FOUND', 'add unknown profile');
    perform public.admin_remove_tournament_admin(v_t, adm_test.ctx('user')::uuid);
    perform adm_test.expect_err(format('select public.admin_remove_tournament_admin(%L,%L)', v_t, adm_test.ctx('user')),
      'NOT_FOUND', 'remove non-admin');

    -- modules (created directly: the app creates them via other RPCs)
    insert into public.tournament_modules (tournament_id, name, sport, status)
      values (v_t, 'Singles', 'table_tennis', 'completed') returning id into v_m;
    insert into public.tournament_entries (module_id, tournament_id, name, final_rank)
      values (v_m, v_t, 'Champ', 1) returning id into v_e;
    update public.tournament_modules set champion_entry_id = v_e where id = v_m;
    perform adm_test.chk((select active_entries = 1 and champion_name = 'Champ'
      from public.admin_list_tournament_modules(v_t)), 'modules list: entries + champion');

    perform adm_test.expect_err(format('select public.admin_reopen_module(%L, true)', v_m), 'NOT_ALLOWED', 'tm: reopen refused');
    perform adm_test.expect_err(format('select public.admin_delete_tournament(%L, %L)', v_t, 'Admin Cup 2'), 'NOT_ALLOWED', 'tm: delete refused');

    perform adm_test.as_user('sa');
    perform adm_test.expect_err(format('select public.admin_reopen_module(%L, true)', gen_random_uuid()), 'NOT_FOUND', 'reopen unknown');
    perform public.admin_set_tournament_status(v_t, 'cancelled');
    perform adm_test.expect_err(format('select public.admin_reopen_module(%L, true)', v_m), 'TOURNAMENT_FINISHED', 'reopen blocked on finished tournament');
    perform public.admin_set_tournament_status(v_t, 'published');
    perform public.admin_reopen_module(v_m, true, 'fix score');
    perform adm_test.chk((select status = 'in_progress' and champion_entry_id is null from public.tournament_modules where id = v_m),
      'reopen: in_progress + champion cleared');
    perform adm_test.chk((select final_rank is null from public.tournament_entries where id = v_e), 'reopen: final ranks cleared');
    perform adm_test.expect_err(format('select public.admin_reopen_module(%L, false)', v_m), 'NOT_COMPLETED', 'reopen needs completed module');

    -- delete
    perform adm_test.expect_err(format('select public.admin_delete_tournament(%L, %L)', v_t, 'wrong'), 'CONFIRM_MISMATCH', 'delete needs exact name');
    perform public.admin_delete_tournament(v_t, 'Admin Cup 2', 'cleanup');
    perform adm_test.chk(not exists (select 1 from public.tournaments where id = v_t), 'delete removed the tournament');
    perform adm_test.chk(not exists (select 1 from public.tournament_modules where id = v_m), 'delete cascaded to modules');
    perform adm_test.chk((select count(*) from public.audit_logs
      where action = 'DELETE_TOURNAMENT' and record_id = v_t and old_data->>'name' = 'Admin Cup 2') = 1,
      'delete keeps the old row in the audit log');
    perform adm_test.chk((select count(*) from public.audit_logs
      where metadata->>'admin' = 'true' and table_name in ('tournaments', 'tournament_modules')) >= 8,
      'tournament writes are audited as admin actions');
  end;

  -- (more tests are inserted above this line)
  raise exception 'ALL TESTS PASSED — rolled back, nothing saved';
end $$;

-- ═══════════════════════════ STEP 3: cleanup ═══════════════════════════
drop schema if exists adm_test cascade;
