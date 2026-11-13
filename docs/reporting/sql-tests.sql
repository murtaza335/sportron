-- docs/reporting/sql-tests.sql
-- DB tests for migrations 130 (reports) and 131 (username change limit). Same conventions as
-- docs/roadmap/sql-tests.sql: the DO block rolls itself back and ends with
-- "ALL TESTS PASSED — rolled back, nothing saved" (that error IS success).
drop schema if exists rp_test cascade;
create schema rp_test;
grant usage on schema rp_test to anon, authenticated;
create function rp_test.as_user(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', p::text, 'role', 'authenticated')::text, true); end $$;
create function rp_test.as_service() returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', '', true); end $$;
create function rp_test.chk(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAIL: %', p_msg; end if;
  raise notice 'PASS: %', p_msg;
end $$;
create function rp_test.expect_err(p_sql text, p_code text, p_msg text) returns void language plpgsql as $$
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
  v_ids uuid[]; v_sa uuid; v_mod uuid; v_author uuid; v_rep uuid; v_out uuid; v_rep2 uuid;
  v_comm uuid; v_pcomm uuid; v_sess uuid; v_sm uuid; v_cm uuid; v_post uuid; v_pc uuid; v_match uuid; v_mc uuid;
  v_t uuid; v_r1 uuid; v_r2 uuid; v_n int; v_d jsonb; v_i int; v_x uuid; v_hint text; v_detail text; v_msg text;
begin
  select array_agg(id) into v_ids from (select id from public.profiles where deleted_at is null order by created_at, id limit 6) s;
  v_sa := v_ids[1]; v_mod := v_ids[2]; v_author := v_ids[3]; v_rep := v_ids[4]; v_out := v_ids[5]; v_rep2 := v_ids[6];
  insert into public.platform_admins (profile_id, role) values (v_sa, 'super_admin'), (v_mod, 'moderator');

  -- fixtures: a restricted community (author + rep are approved members, `out` is not), a public one
  insert into public.communities (name, visibility, created_by) values ('Restricted', 'restricted', v_author) returning id into v_comm;
  insert into public.communities (name, visibility, created_by) values ('Open', 'public', v_author) returning id into v_pcomm;
  insert into public.community_members (community_id, profile_id, role) values
    (v_comm, v_author, 'admin'), (v_comm, v_rep, 'member'), (v_pcomm, v_author, 'admin');
  insert into public.community_messages (community_id, sender_id, content, sender_username, created_at)
    select v_comm, v_author, 'earlier ' || g, 'author', now() - make_interval(mins => 10 - g) from generate_series(1, 7) g;
  insert into public.community_messages (community_id, sender_id, content, sender_username)
    values (v_comm, v_author, 'bad message', 'author') returning id into v_cm;
  insert into public.community_posts (community_id, author_id, content, post_type) values (v_comm, v_author, 'bad post', 'text') returning id into v_post;
  insert into public.community_post_comments (post_id, profile_id, content) values (v_post, v_author, 'bad comment') returning id into v_pc;
  insert into public.community_matches (community_id, recorded_by, player_id, opponent_id, player_score, opponent_score)
    values (v_comm, v_author, v_author, v_rep, 11, 0) returning id into v_match;
  insert into public.community_match_comments (community_match_id, profile_id, content) values (v_match, v_author, 'bad mc') returning id into v_mc;
  insert into public.sessions (created_by, purpose, title, status) values (v_author, 'table_tennis', 'S1', 'closed') returning id into v_sess;
  insert into public.commitments (session_id, user_id, status) values (v_sess, v_rep, 'accepted');
  insert into public.session_messages (session_id, sender_id, content, sender_username) values (v_sess, v_author, 'session bad', 'author') returning id into v_sm;
  insert into public.tournaments (name, status) values ('Cup', 'published') returning id into v_t;

  -- ── 130 submit_report ──
  perform rp_test.as_user(v_rep);
  v_r1 := public.submit_report('community_message', v_cm, 'harassment', '  rude  ');
  perform rp_test.chk(v_r1 is not null, 'member reports a community message');
  perform rp_test.as_service();
  perform rp_test.chk((select snapshot->>'content' from public.reports where id = v_r1) = 'bad message', 'snapshot holds the content');
  perform rp_test.chk(jsonb_array_length((select snapshot->'context' from public.reports where id = v_r1)) = 5, 'snapshot holds 5 preceding messages');
  perform rp_test.chk((select details from public.reports where id = v_r1) = 'rude', 'details trimmed');
  perform rp_test.chk((select target_owner_id from public.reports where id = v_r1) = v_author, 'owner resolved server-side');
  perform rp_test.as_user(v_rep);
  perform rp_test.chk(public.submit_report('community_message', v_cm, 'spam') = v_r1, 'duplicate open report returns same id');
  perform rp_test.as_service();
  perform rp_test.chk((select count(*) from public.reports where target_id = v_cm) = 1, 'duplicate creates no second row');

  perform rp_test.as_user(v_out);
  perform rp_test.expect_err(format($q$select public.submit_report('community_message', %L, 'spam')$q$, v_cm), 'NOT_FOUND', 'non-member cannot report restricted chat');
  perform rp_test.expect_err(format($q$select public.submit_report('community_message', %L, 'spam')$q$, gen_random_uuid()), 'NOT_FOUND', 'missing target = same NOT_FOUND');
  perform rp_test.expect_err(format($q$select public.submit_report('community_post', %L, 'spam')$q$, v_post), 'NOT_FOUND', 'non-member cannot report restricted post');
  perform rp_test.expect_err(format($q$select public.submit_report('session_message', %L, 'spam')$q$, v_sm), 'NOT_FOUND', 'outsider cannot report session chat');
  perform rp_test.expect_err(format($q$select public.submit_report('session', %L, 'spam')$q$, v_sess), 'NOT_FOUND', 'ended session hidden from outsiders');
  perform rp_test.expect_err(format($q$select public.submit_report('community', %L, 'spam')$q$, v_comm), 'NOT_FOUND', 'restricted community hidden from outsiders');
  perform rp_test.expect_err(format($q$select public.submit_report('tournament', %L, 'bogus')$q$, v_t), 'INVALID_REASON', 'reason validated');
  perform rp_test.expect_err(format($q$select public.submit_report('nope', %L, 'spam')$q$, v_t), 'INVALID_TARGET', 'target type validated');
  perform rp_test.expect_err(format($q$select public.submit_report('tournament', %L, 'spam', %L)$q$, v_t, repeat('x', 501)), 'DETAILS_TOO_LONG', 'details capped');
  perform rp_test.chk(public.submit_report('community', v_pcomm, 'spam') is not null, 'public community reportable by anyone');
  perform rp_test.chk(public.submit_report('tournament', v_t, 'scam') is not null, 'published tournament reportable');
  perform rp_test.chk(public.submit_report('profile', v_author, 'impersonation') is not null, 'profile reportable');

  perform rp_test.as_user(v_rep);
  perform rp_test.chk(public.submit_report('community_post', v_post, 'spam') is not null, 'member reports post');
  perform rp_test.chk(public.submit_report('community_post_comment', v_pc, 'spam') is not null, 'member reports post comment');
  perform rp_test.chk(public.submit_report('community_match', v_match, 'fake_result') is not null, 'member reports match');
  perform rp_test.chk(public.submit_report('community_match_comment', v_mc, 'spam') is not null, 'member reports match comment');
  perform rp_test.chk(public.submit_report('session_message', v_sm, 'harassment') is not null, 'accepted participant reports session chat');

  -- session participant who LEFT: can report pre-leave messages, not newer ones
  perform rp_test.as_service();
  update public.commitments set status = 'left', updated_at = now() - interval '1 hour' where session_id = v_sess and user_id = v_rep;
  update public.session_messages set created_at = now() - interval '2 hours' where id = v_sm;
  insert into public.session_messages (session_id, sender_id, content, sender_username) values (v_sess, v_author, 'after leave', 'author') returning id into v_x;
  perform rp_test.as_user(v_rep);
  perform rp_test.chk(public.submit_report('session_message', v_sm, 'spam') is not null, 'left user can report a pre-leave message');
  perform rp_test.expect_err(format($q$select public.submit_report('session_message', %L, 'spam')$q$, v_x), 'NOT_FOUND', 'left user cannot report a post-leave message');

  perform rp_test.as_user(v_author);
  perform rp_test.expect_err(format($q$select public.submit_report('community_post', %L, 'spam')$q$, v_post), 'CANNOT_REPORT_SELF', 'self report blocked');
  perform rp_test.expect_err(format($q$select public.submit_report('profile', %L, 'spam')$q$, v_author), 'CANNOT_REPORT_SELF', 'self profile report blocked');

  -- rate limit: 20 / 24 h
  perform rp_test.as_service();
  delete from public.reports where reporter_id = v_rep2;
  for v_i in 1..20 loop
    insert into public.reports (reporter_id, target_type, target_id, reason, snapshot)
      values (v_rep2, 'tournament', gen_random_uuid(), 'spam', '{}');
  end loop;
  perform rp_test.as_user(v_rep2);
  perform rp_test.expect_err(format($q$select public.submit_report('tournament', %L, 'spam')$q$, v_t), 'RATE_LIMITED', '21st report in 24h blocked');

  -- sender deletes the message after it was reported: report + snapshot survive
  perform rp_test.as_user(v_author);
  delete from public.community_messages where id = v_cm;
  perform rp_test.as_service();
  perform rp_test.chk((select snapshot->>'content' from public.reports where id = v_r1) = 'bad message', 'report survives deletion of the target');

  -- privileges: no direct table access
  perform rp_test.as_user(v_rep);
  set local role authenticated;
  perform rp_test.expect_err('select * from public.reports', 'permission denied', 'authenticated cannot select reports');
  reset role;
  set local role anon;
  perform rp_test.expect_err('select * from public.reports', 'permission denied', 'anon cannot select reports');
  reset role;

  -- ── staff RPCs ──
  perform rp_test.as_user(v_rep);
  perform rp_test.expect_err($q$select * from public.admin_list_reports()$q$, 'NOT_ALLOWED', 'non-staff cannot list reports');
  perform rp_test.expect_err($q$select public.admin_report_stats()$q$, 'NOT_ALLOWED', 'non-staff cannot read stats');

  perform rp_test.as_user(v_mod);
  perform rp_test.chk((select count(*) from public.admin_list_reports()) > 0, 'moderator can list the queue');
  perform rp_test.chk((select open_count from public.admin_report_stats()) > 0, 'moderator can read stats');
  perform rp_test.expect_err($q$select public.admin_set_maintenance(true, 'x')$q$, 'NOT_ALLOWED', 'moderator cannot use other admin functions');
  perform rp_test.expect_err($q$select public.admin_list_platform_admins()$q$, 'NOT_ALLOWED', 'moderator cannot manage staff');
  perform rp_test.chk((select report_count from public.admin_list_reports() where target_id = v_post) = 1, 'grouped queue row per target');

  -- second reporter on the same post -> grouped count 2, top reason
  perform rp_test.as_service();
  insert into public.community_members (community_id, profile_id) values (v_comm, v_rep2);
  delete from public.reports where reporter_id = v_rep2;
  perform rp_test.as_user(v_rep2);
  perform public.submit_report('community_post', v_post, 'spam');
  perform rp_test.as_user(v_mod);
  perform rp_test.chk((select report_count from public.admin_list_reports('open', 'community_post') where target_id = v_post) = 2, 'two reports grouped on one target');
  perform rp_test.chk((select top_reason from public.admin_list_reports('open', 'community_post') where target_id = v_post) = 'spam', 'top reason computed');
  v_d := public.admin_get_report_target('community_post', v_post);
  perform rp_test.chk(jsonb_array_length(v_d->'reports') = 2 and (v_d->'live'->>'deleted')::boolean = false, 'target detail has reports + live content');
  perform rp_test.chk((v_d->'owner'->>'id')::uuid = v_author, 'target detail names the owner');

  -- remove content: deletes, resolves, logs
  perform rp_test.expect_err(format($q$select public.admin_remove_reported_content('community_match', %L)$q$, v_match), 'NOT_REMOVABLE', 'matches are not removable here');
  perform rp_test.chk(public.admin_remove_reported_content('community_post', v_post, 'abusive') = 2, 'remove content resolves both reports');
  perform rp_test.as_service();
  perform rp_test.chk(not exists (select 1 from public.community_posts where id = v_post), 'post row deleted');
  perform rp_test.chk(not exists (select 1 from public.community_post_comments where id = v_pc), 'post comments cascade');
  perform rp_test.chk((select count(*) from public.reports where target_id = v_post and status = 'actioned' and action_taken = 'content_removed') = 2, 'reports marked actioned/content_removed');
  perform rp_test.chk(exists (select 1 from public.audit_logs where action = 'REMOVE_REPORTED_CONTENT' and record_id = v_post), 'removal written to audit log');

  -- staff delete bypasses the 24 h / sender-only chat trigger
  perform rp_test.as_user(v_rep);
  insert into public.session_messages (session_id, sender_id, content, created_at)
    values (v_sess, v_author, 'old bad', now() - interval '3 days') returning id into v_x;
  perform rp_test.as_service();
  update public.commitments set status = 'accepted', updated_at = now() where session_id = v_sess and user_id = v_rep;
  perform rp_test.as_user(v_rep);
  perform public.submit_report('session_message', v_x, 'harassment');
  perform rp_test.as_user(v_mod);
  perform public.admin_remove_reported_content('session_message', v_x);
  perform rp_test.as_service();
  perform rp_test.chk(not exists (select 1 from public.session_messages where id = v_x), 'staff removes a >24h old chat message');

  -- a normal user still cannot delete someone else's message through the trigger
  perform rp_test.as_user(v_rep);
  perform rp_test.expect_err(format($q$delete from public.session_messages where id = %L$q$, v_sm), 'You can only delete your own messages', 'non-staff delete still blocked by trigger');

  -- resolve / dismiss
  perform rp_test.as_user(v_mod);
  perform rp_test.expect_err(format($q$select public.admin_resolve_reports('tournament', %L, 'open')$q$, v_t), 'INVALID_STATUS', 'status validated');
  perform rp_test.chk(public.admin_resolve_reports('tournament', v_t, 'dismissed', null, 'fine') = 1, 'dismiss resolves');
  perform rp_test.as_service();
  perform rp_test.chk((select action_taken from public.reports where target_type = 'tournament' and target_id = v_t and status = 'dismissed' limit 1) = 'none', 'dismissed => action none');

  -- role management accepts moderator
  perform rp_test.as_user(v_sa);
  perform public.admin_grant_platform_role(v_out, 'moderator');
  perform rp_test.chk((select role from public.platform_admins where profile_id = v_out) = 'moderator', 'super admin can grant moderator');

  raise exception 'ALL TESTS PASSED — rolled back, nothing saved';
end $$;
