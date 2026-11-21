-- docs/usage-analytics/sql-tests.sql
-- Usage analytics DB tests (migrations 135+). Run AFTER applying migrations (docs/tournaments/local-db/run.sh does it).
-- The DO block ends by raising "ALL TESTS PASSED — rolled back, nothing saved": that "error" IS success.

do $$
declare
  v_u1 uuid; v_u2 uuid; v_c uuid := gen_random_uuid();
  v_zero constant uuid := '00000000-0000-0000-0000-000000000000';
  v_n numeric; v_d date := (now() at time zone public._usage_tz())::date;
  v_ok boolean;
begin
  select id into v_u1 from public.profiles order by username limit 1;
  select id into v_u2 from public.profiles order by username offset 1 limit 1;
  insert into public.communities (id, name, created_by) values (v_c, 'usage-test', v_u1);

  -- 1. clients can read / write none of the tables, nor run the internals
  set local role authenticated;
  begin perform 1 from public.usage_views limit 1; raise exception 'FAIL: authenticated read usage_views';
  exception when insufficient_privilege then raise notice 'PASS: authenticated cannot read usage_views'; end;
  begin perform public._usage_track('x', null); raise exception 'FAIL: authenticated ran _usage_track';
  exception when insufficient_privilege then raise notice 'PASS: authenticated cannot run _usage_track'; end;
  begin perform public.usage_tick(); raise exception 'FAIL: authenticated ran usage_tick';
  exception when insufficient_privilege then raise notice 'PASS: authenticated cannot run usage_tick'; end;
  set local role anon;
  begin perform 1 from public.usage_daily limit 1; raise exception 'FAIL: anon read usage_daily';
  exception when insufficient_privilege then raise notice 'PASS: anon cannot read usage_daily'; end;
  reset role;

  -- 2. tracking: counts, per-hour bucketing, guest sentinel, kill switch
  perform set_config('request.jwt.claims', json_build_object('sub', v_u1)::text, true);
  perform public._usage_track('community', v_c);
  perform public._usage_track('community', v_c);
  select hits into v_n from public.usage_views where user_id = v_u1 and view = 'community' and target_id = v_c;
  if v_n is distinct from 2 then raise exception 'FAIL: expected 2 hits, got %', v_n; end if;
  raise notice 'PASS: repeated views in one hour = one row, hits counted';

  perform set_config('request.jwt.claims', '', true);
  perform public._usage_track('discover', null);
  if not exists (select 1 from public.usage_views where user_id = v_zero and view = 'discover' and target_id = v_zero) then
    raise exception 'FAIL: guest view not stored with sentinel user'; end if;
  raise notice 'PASS: guest views use the sentinel user';

  update public.site_config set value = '{"enabled": false}' where key = 'usage_tracking';
  perform public._usage_track('kill', null);
  if exists (select 1 from public.usage_views where view = 'kill') then raise exception 'FAIL: tracked while disabled'; end if;
  perform public.usage_tick();
  raise notice 'PASS: kill switch stops tracking and usage_tick';
  update public.site_config set value = '{"enabled": true}' where key = 'usage_tracking';

  -- 3. rollup: platform + per-community numbers
  insert into public.community_messages (community_id, sender_id, content) values (v_c, v_u1, 'a'), (v_c, v_u1, 'b'), (v_c, v_u2, 'c');
  insert into public.community_posts (community_id, author_id, content) values (v_c, v_u1, 'p');
  perform public._usage_snapshot();
  perform public._usage_rollup_day(v_d);
  perform public._usage_rollup_chat(now() - interval '2 hours', now() + interval '1 hour');
  select value into v_n from public.usage_daily where day = v_d and metric = 'messages_community';
  if v_n < 3 then raise exception 'FAIL: messages_community = %', v_n; end if;
  select value into v_n from public.usage_daily where day = v_d and metric = 'dau';
  if v_n < 1 then raise exception 'FAIL: dau = % (view should mark the user active)', v_n; end if;
  raise notice 'PASS: daily metrics + dau from views';

  select (messages = 3 and chatters = 2 and posts = 1 and views = 2 and viewers = 1) into v_ok
  from public.usage_community_daily where day = v_d and community_id = v_c;
  if v_ok is not true then raise exception 'FAIL: community rollup wrong: %',
    (select row_to_json(x) from public.usage_community_daily x where day = v_d and community_id = v_c); end if;
  raise notice 'PASS: per-community rollup (messages/chatters/posts/views/viewers)';

  select (messages = 3 and senders = 2) into v_ok from public.usage_chat_hourly
  where chat_type = 'community' and chat_id = v_c;
  if v_ok is not true then
    raise notice 'NOTE: chat hourly row missing/wrong (stub reply_to_id?)'; raise exception 'FAIL: chat hourly'; end if;
  raise notice 'PASS: chat hourly';

  -- idempotent
  perform public._usage_rollup_day(v_d);
  select messages into v_n from public.usage_community_daily where day = v_d and community_id = v_c;
  if v_n <> 3 then raise exception 'FAIL: rollup not idempotent (%)', v_n; end if;
  raise notice 'PASS: rollup is idempotent';

  -- 4. auth.sessions snapshot → platform split
  insert into auth.sessions (user_id, refreshed_at, user_agent) values
    (v_u2, now() at time zone 'utc', 'okhttp/4.12'), (v_u1, now() at time zone 'utc', 'Mozilla/5.0 Chrome');
  perform public._usage_snapshot();
  if not exists (select 1 from public.usage_user_days where user_id = v_u2 and day = v_d and 'android' = any (platforms)) then
    raise exception 'FAIL: android session not recorded'; end if;
  if not exists (select 1 from public.usage_user_days where user_id = v_u1 and day = v_d and 'web' = any (platforms)) then
    raise exception 'FAIL: web session not recorded'; end if;
  raise notice 'PASS: sessions snapshot with platform detection';

  -- 5. migration 136: read RPCs are wrapped (same signature, volatile) and count a visit
  if not exists (select 1 from pg_proc where proname = '_usage_inner_get_tournaments') then
    raise exception 'FAIL: get_tournaments was not instrumented'; end if;
  if (select provolatile from pg_proc where proname = 'get_tournaments') <> 'v' then
    raise exception 'FAIL: wrapper must be volatile'; end if;
  if pg_get_function_result((select oid from pg_proc where proname = 'get_tournaments'))
     is distinct from pg_get_function_result((select oid from pg_proc where proname = '_usage_inner_get_tournaments')) then
    raise exception 'FAIL: wrapper result type differs from the original'; end if;
  raise notice 'PASS: get_tournaments wrapped, volatile, same result type';

  perform set_config('request.jwt.claims', json_build_object('sub', v_u1)::text, true);
  set local role authenticated;
  perform * from public.get_tournaments('all');
  begin perform * from public._usage_inner_get_tournaments('all'); raise exception 'FAIL: inner callable by authenticated';
  exception when insufficient_privilege then raise notice 'PASS: inner function not callable by clients'; end;
  reset role;
  if not exists (select 1 from public.usage_views where user_id = v_u1 and view = 'tournaments_list') then
    raise exception 'FAIL: get_tournaments did not record a visit'; end if;
  raise notice 'PASS: get_tournaments records a visit';

  set local role anon;
  begin perform * from public.get_tournaments('all'); raise exception 'FAIL: anon ran get_tournaments';
  exception when insufficient_privilege then raise notice 'PASS: anon still cannot run get_tournaments'; end;
  reset role;

  raise exception 'ALL TESTS PASSED — rolled back, nothing saved';
end $$;
