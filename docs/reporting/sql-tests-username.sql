-- docs/reporting/sql-tests-username.sql — migration 131 (username change limit).
-- Ends with "ALL TESTS PASSED — rolled back, nothing saved" (that error IS success).
drop schema if exists un_test cascade;
create schema un_test;
create function un_test.as_user(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', p::text, 'role', 'authenticated')::text, true); end $$;
create function un_test.as_service() returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', '', true); end $$;
create function un_test.chk(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAIL: %', p_msg; end if;
  raise notice 'PASS: %', p_msg;
end $$;

do $$
declare
  v_u uuid; v_hint text; v_detail text; v_msg text; v_stamp timestamptz;
begin
  -- onboarding INSERT: free, no stamp
  insert into public.profiles (username) values ('fresh_user') returning id into v_u;
  perform un_test.chk((select username_changed_at from public.profiles where id = v_u) is null, 'insert leaves username_changed_at null');

  perform un_test.as_user(v_u);
  -- 1st rename ok + stamped
  update public.profiles set username = 'renamed_one' where id = v_u;
  v_stamp := (select username_changed_at from public.profiles where id = v_u);
  perform un_test.chk(v_stamp is not null, '1st rename allowed and stamped');

  -- 2nd rename blocked with hint + ISO detail + readable message
  begin
    update public.profiles set username = 'renamed_two' where id = v_u;
    raise exception 'FAIL: second rename should be blocked';
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint, v_detail = pg_exception_detail, v_msg = message_text;
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  perform un_test.chk(v_hint = 'USERNAME_CHANGE_LIMIT', '2nd rename: hint = USERNAME_CHANGE_LIMIT');
  perform un_test.chk(v_msg like 'You can change your username only once every 30 days. You can change it again on %', '2nd rename: readable message');
  perform un_test.chk(v_detail ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$', '2nd rename: ISO date in detail');
  perform un_test.chk((v_detail::timestamptz) = date_trunc('second', v_stamp + interval '30 days') or abs(extract(epoch from (v_detail::timestamptz - (v_stamp + interval '30 days')))) < 1, 'detail = stamp + 30 days');
  perform un_test.chk((select username from public.profiles where id = v_u) = 'renamed_one', 'blocked rename left username unchanged');

  -- changing back to the old name inside the window is also a change
  begin
    update public.profiles set username = 'fresh_user' where id = v_u;
    raise exception 'FAIL: rename-back should be blocked';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  -- bio / avatar / unrelated updates inside the window are fine
  update public.profiles set bio = 'hello' where id = v_u;
  update public.profiles set avatar_url = 'https://res.cloudinary.com/x/y.png' where id = v_u;
  perform un_test.chk((select bio from public.profiles where id = v_u) = 'hello', 'bio-only update inside window ok');

  -- same name, different case / spaces: not a change
  update public.profiles set username = '  RENAMED_One ', bio = 'again' where id = v_u;
  perform un_test.chk((select username_changed_at from public.profiles where id = v_u) = v_stamp, 'case/space-only difference does not restamp');

  -- clients cannot clear/set the stamp
  update public.profiles set username_changed_at = null where id = v_u;
  perform un_test.chk((select username_changed_at from public.profiles where id = v_u) = v_stamp, 'client cannot clear the stamp');
  update public.profiles set username_changed_at = now() + interval '1 year' where id = v_u;
  perform un_test.chk((select username_changed_at from public.profiles where id = v_u) = v_stamp, 'client cannot set the stamp');

  -- service role (no auth.uid) is exempt
  perform un_test.as_service();
  update public.profiles set username = 'staff_fixed' where id = v_u;
  perform un_test.chk((select username from public.profiles where id = v_u) = 'staff_fixed', 'service role can rename inside the window');

  -- after 30 days: allowed again
  update public.profiles set username_changed_at = now() - interval '31 days' where id = v_u;
  perform un_test.as_user(v_u);
  update public.profiles set username = 'after_window' where id = v_u;
  perform un_test.chk((select username from public.profiles where id = v_u) = 'after_window'
                      and (select username_changed_at from public.profiles where id = v_u) > now() - interval '1 minute', 'rename allowed 31 days later and restamped');

  raise exception 'ALL TESTS PASSED — rolled back, nothing saved';
end $$;
