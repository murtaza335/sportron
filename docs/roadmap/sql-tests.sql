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
  v_ids uuid[]; v_sa uuid; v_user uuid; v_ann uuid; v_n int;
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

  -- (more tests are inserted above this line)
  raise exception 'ALL TESTS PASSED — rolled back, nothing saved';
end $$;

drop schema if exists rm_test cascade;
