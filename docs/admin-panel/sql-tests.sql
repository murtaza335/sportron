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

  -- (more tests for 123/124 are inserted above this line)
  raise exception 'ALL TESTS PASSED — rolled back, nothing saved';
end $$;

-- ═══════════════════════════ STEP 3: cleanup ═══════════════════════════
drop schema if exists adm_test cascade;
