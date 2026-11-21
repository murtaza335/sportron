-- docs/guest-mode/sql-tests.sql
-- Guest read access DB tests (migration 134). Run AFTER applying migrations 084..134 (docs/tournaments/local-db/run.sh does it).
-- The single DO block ends by raising "ALL TESTS PASSED — rolled back, nothing saved": that "error" IS success.
-- Unlike the other suites, the guest calls here run under the REAL `anon` / `authenticated` roles (set local role),
-- so grants are exercised, not just the function guards.

drop schema if exists gt_test cascade;
create schema gt_test;
grant usage on schema gt_test to anon, authenticated;

create function gt_test.put(p_k text, p_v text) returns void language plpgsql as $$
begin perform set_config('gt.' || p_k, p_v, true); end $$;

create function gt_test.ctx(p_k text) returns text language sql stable as
  $$ select nullif(current_setting('gt.' || p_k, true), '') $$;

create function gt_test.as_user(p_k text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', gt_test.ctx(p_k), 'role', 'authenticated')::text, true);
end $$;

create function gt_test.chk(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAIL: %', p_msg; end if;
  raise notice 'PASS: %', p_msg;
end $$;

create function gt_test.expect_err(p_sql text, p_code text, p_msg text) returns void language plpgsql as $$
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

grant execute on all functions in schema gt_test to anon, authenticated;

-- a module in progress with 4 entries (phone / email / cms id are PRIVATE entry-form fields)
create function gt_test.mk_module(p_t uuid, p_name text) returns uuid language plpgsql as $$
declare v_m uuid; i int;
begin
  perform gt_test.as_user('admin');
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

do $$
declare
  v_ids uuid[]; v_t uuid; v_draft uuid; v_m uuid; v_dm uuid; v_s uuid; v_c uuid;
  v jsonb; v_txt text;
begin
  -- the old sessions read may not exist in the local harness (migration 048 is not replayed there): stand-in
  if to_regprocedure('public.get_open_sessions()') is null then
    execute $f$
      create function public.get_open_sessions() returns table (
        id uuid, created_by uuid, purpose text, title text, location text, date_time timestamptz,
        expires_at timestamptz, max_participants int, description text, status text, created_at timestamptz,
        updated_at timestamptz, creator_username text, creator_avatar_url text, commitment_count bigint)
      language sql stable security definer set search_path = public as $g$
        select s.id, s.created_by, s.purpose, s.title, s.location, s.date_time, null::timestamptz, null::int,
               s.description, s.status, null::timestamptz, null::timestamptz, p.username, p.avatar_url, 0::bigint
        from public.sessions s left join public.profiles p on p.id = s.created_by $g$
    $f$;
    -- production state after migration 109: the old read is NOT callable by anon
    revoke all on function public.get_open_sessions() from public, anon;
    grant execute on function public.get_open_sessions() to authenticated;
  end if;

  -- ── setup: an admin, a published tournament with a module, a draft tournament, a session, a community
  insert into public.profiles (username) select 'gt_user_' || g from generate_series(1, 3) g;
  select array_agg(id) into v_ids from (select id from public.profiles where username like 'gt_user_%' order by username) x;
  perform gt_test.put('admin', v_ids[1]::text);
  perform gt_test.put('stranger', v_ids[2]::text);

  insert into public.tournaments (name, status) values ('Guest Test Cup', 'published') returning id into v_t;
  insert into public.tournaments (name, status) values ('Hidden Draft Cup', 'draft') returning id into v_draft;
  insert into public.tournament_admins (tournament_id, profile_id) values (v_t, v_ids[1]), (v_draft, v_ids[1]);
  v_m := gt_test.mk_module(v_t, 'Mens Singles');

  insert into public.sessions (created_by, purpose, title, location, date_time, description, status)
  values (v_ids[1], 'badminton', 'Evening smash', 'Secret Court 7, Block C', now() + interval '3 hours',
          'call me on 0300 1234567', 'open')
  returning id into v_s;
  insert into public.communities (name, description, created_by, visibility)
  values ('Guest Test Club', 'A club', v_ids[1], 'public') returning id into v_c;

  -- ── 1. switch is OFF by default, and a fresh migration changes nothing for guests
  perform gt_test.chk((select (value ->> 'enabled')::boolean from public.site_config where key = 'guest_mode') = false,
                      'guest_mode seeded OFF');
  set local role anon;
  perform gt_test.expect_err('select public.guest_get_tournaments(''all'')', 'GUEST_DISABLED', 'switch OFF -> guest tournaments refused');
  perform gt_test.expect_err('select public.guest_get_open_sessions()', 'GUEST_DISABLED', 'switch OFF -> guest sessions refused');
  reset role;

  -- ── 2. the lock-down is intact: anon still cannot call ANY pre-existing read function
  perform gt_test.chk(not has_function_privilege('anon', 'public.get_tournaments(text)', 'execute'), 'anon cannot call get_tournaments');
  perform gt_test.chk(not has_function_privilege('anon', 'public.get_tournament_detail(uuid)', 'execute'), 'anon cannot call get_tournament_detail');
  perform gt_test.chk(not has_function_privilege('anon', 'public.get_module_entries(uuid)', 'execute'), 'anon cannot call get_module_entries');
  perform gt_test.chk(not has_function_privilege('anon', 'public.get_module_matches(uuid)', 'execute'), 'anon cannot call get_module_matches');
  perform gt_test.chk(not has_function_privilege('anon', 'public.get_live_tournaments()', 'execute'), 'anon cannot call get_live_tournaments');
  -- allow-list: among every function this feature set could expose, anon may run ONLY the guest reads + the projector board
  perform gt_test.chk(not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f'
        and (p.proname like 'get\_%' or p.proname like 'admin\_%' or p.proname like 'live\_%' or p.proname like 'upsert\_%'
             or p.proname like 'create\_%' or p.proname like 'record\_%' or p.proname like 'set\_%' or p.proname like 'submit\_%'
             or p.proname like 'reveal\_%' or p.proname like 'generate\_%' or p.proname like 'reset\_%' or p.proname like 'update\_%'
             or p.proname like 'delete\_%' or p.proname like 'build\_%' or p.proname like 'schedule\_%')
        and has_function_privilege('anon', p.oid, 'execute')
        and p.proname <> 'get_live_board'
        and p.proname not like 'guest\_get\_%'),
    'anon can execute nothing but guest_get_* and get_live_board (writes, admin and regular reads stay closed)');
  perform gt_test.chk(not has_function_privilege('anon', 'public.admin_set_guest_mode(boolean,text)', 'execute')
                      and not has_function_privilege('anon', 'public.admin_get_guest_mode()', 'execute'), 'anon cannot read or flip the switch');
  perform gt_test.chk(not has_function_privilege('anon', 'public._guest_begin()', 'execute')
                      and not has_function_privilege('authenticated', 'public._guest_begin()', 'execute')
                      and not has_function_privilege('anon', 'public._guest_end()', 'execute')
                      and not has_function_privilege('anon', 'public._guest_mode_enabled()', 'execute'),
                      'identity helpers are not callable by clients');

  -- ── 3. only a super admin can flip the switch (a normal user is refused)
  perform gt_test.as_user('stranger');
  set local role authenticated;
  perform gt_test.expect_err('select public.admin_set_guest_mode(true)', 'NOT_ALLOWED', 'normal user cannot turn guest mode on');
  perform gt_test.expect_err('select public.admin_get_guest_mode()', 'NOT_ALLOWED', 'normal user cannot read the admin switch view');
  reset role;

  -- ── 4. turn it on (as the table owner, standing in for a super admin) and browse as a real anon role
  update public.site_config set value = '{"enabled": true}' where key = 'guest_mode';
  set local role anon;

  -- tournaments list: published only, never the draft, never a role
  v := public.guest_get_tournaments('all');
  perform gt_test.chk(jsonb_typeof(v) = 'array', 'list is a json array');
  perform gt_test.chk(exists (select 1 from jsonb_array_elements(v) e where e ->> 'name' = 'Guest Test Cup'), 'published tournament visible to a guest');
  perform gt_test.chk(not exists (select 1 from jsonb_array_elements(v) e where e ->> 'name' = 'Hidden Draft Cup'), 'DRAFT tournament hidden from a guest');
  perform gt_test.chk(not exists (select 1 from jsonb_array_elements(v) e where e ->> 'my_role' is not null), 'guest has no role in any tournament');
  perform gt_test.expect_err('select public.guest_get_tournaments(''mine'')', 'INVALID_SCOPE', '"mine" is rejected for guests');
  perform gt_test.expect_err('select public.guest_get_tournaments(null)', 'INVALID_SCOPE', 'null scope rejected');

  -- detail: published ok, draft refused
  v := public.guest_get_tournament_detail(v_t);
  perform gt_test.chk(v #>> '{tournament,name}' = 'Guest Test Cup' or v ->> 'name' = 'Guest Test Cup', 'guest can open a published tournament');
  perform gt_test.chk(coalesce(v ->> 'my_role', '') = '', 'guest detail has no role');
  perform gt_test.expect_err(format('select public.guest_get_tournament_detail(%L)', v_draft), 'NOT_ALLOWED', 'guest cannot open a draft tournament');
  perform gt_test.expect_err('select public.guest_get_tournament_detail(gen_random_uuid())', 'NOT_ALLOWED', 'unknown tournament id looks the same as a hidden one');

  -- entries: public fields only, NEVER cms id / phone / email
  v := public.guest_get_module_entries(v_m);
  v_txt := v::text;
  perform gt_test.chk(jsonb_array_length(v) = 4, 'guest sees the 4 entrants');
  perform gt_test.chk(v_txt like '%School 1%', 'public field (school) is visible');
  perform gt_test.chk(v_txt not like '%0300123%' and v_txt not like '%@example.com%' and v_txt not like '%Mens Singles-%',
                      'PRIVATE entry fields (phone / email / cms id) are NOT in the guest payload');

  -- bracket / standings / groups / schedule
  v := public.guest_get_module_matches(v_m);
  perform gt_test.chk(jsonb_typeof(v) = 'array' and jsonb_array_length(v) >= 3, 'guest can read the bracket');
  perform gt_test.chk(v::text not like '%0300123%' and v::text not like '%@example.com%', 'no private data in the bracket payload');
  perform gt_test.chk(public.guest_get_module_standings_v2(v_m) is not null, 'guest can read standings');
  perform gt_test.chk(jsonb_typeof(public.guest_get_module_groups(v_m)) = 'array', 'groups call returns an array');
  perform gt_test.chk(public.guest_get_module_detail(v_m) is not null, 'guest can read module detail');
  perform gt_test.chk(public.guest_get_tournament_schedule(v_t, now() - interval '1 day', now() + interval '2 days') is not null, 'schedule readable');
  perform gt_test.chk(jsonb_typeof(public.guest_get_live_tournaments()) = 'array', 'live strip readable');

  -- draft internals stay hidden too
  perform gt_test.expect_err(format('select public.guest_get_module_entries(%L)', gen_random_uuid()), 'NOT_ALLOWED', 'unknown module refused');

  -- the stranger identity does not leak past the call
  perform gt_test.chk(auth.uid() is null, 'auth.uid() is null again after a guest call');

  -- sessions: reduced
  v := public.guest_get_open_sessions();
  perform gt_test.chk(jsonb_array_length(v) >= 1 and (v -> 0 ->> 'title') = 'Evening smash', 'guest sees the open session');
  perform gt_test.chk(v::text not like '%Secret Court%' and v::text not like '%0300 1234567%'
                      and v::text not like '%gt_user_%' and v::text not like '%created_by%',
                      'venue, description and creator are NOT in the guest session payload');

  -- community: card only
  v := public.guest_get_community(v_c);
  perform gt_test.chk(v ->> 'name' = 'Guest Test Club', 'guest can see a community card');
  perform gt_test.chk(public.guest_get_community(gen_random_uuid()) is null, 'unknown community -> null');
  perform gt_test.chk(jsonb_typeof(public.guest_get_discover_communities()) = 'array', 'discover list readable');

  -- guests still cannot call anything outside the allow-list
  perform gt_test.expect_err('select * from public.get_tournaments(''all'')', 'permission denied', 'the regular tournaments rpc is still closed to anon');
  perform gt_test.expect_err('select public.get_module_entries(gen_random_uuid())', 'permission denied', 'the regular entries rpc is still closed to anon');
  reset role;

  -- ── 5. signed-in users are unaffected: the regular functions still work and still know who they are
  perform gt_test.as_user('admin');
  set local role authenticated;
  perform gt_test.chk(exists (select 1 from public.get_tournaments('all') t where t.name = 'Hidden Draft Cup'),
                      'a tournament admin still sees their draft through the regular rpc');
  perform gt_test.chk(exists (select 1 from public.get_tournaments('all') t where t.name = 'Guest Test Cup' and t.my_role = 'tournament_admin'),
                      'regular rpc still reports my_role');
  reset role;

  -- ── 6. kill switch: OFF again -> everything refuses
  update public.site_config set value = '{"enabled": false}' where key = 'guest_mode';
  set local role anon;
  perform gt_test.expect_err(format('select public.guest_get_module_entries(%L)', v_m), 'GUEST_DISABLED', 'kill switch closes entries');
  perform gt_test.expect_err('select public.guest_get_discover_communities()', 'GUEST_DISABLED', 'kill switch closes communities');
  reset role;

  raise exception 'ALL TESTS PASSED — rolled back, nothing saved';
end $$;

drop schema if exists gt_test cascade;
