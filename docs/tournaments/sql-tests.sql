-- docs/tournaments/sql-tests.sql
-- Tournament DB tests for migrations 084–088. Run in the Supabase SQL editor AFTER applying them.
--
-- HOW TO RUN (3 steps, in this order — each is one statement; running the whole file at once also works):
--   STEP 1  create the helper schema `tt_test`            (permanent until STEP 3)
--   STEP 2  run the single DO block                        (rolls ITSELF back: nothing is saved)
--   STEP 3  drop the helper schema `tt_test`               (run this even if STEP 2 failed)
--
-- STEP 2 ends by raising "ALL TESTS PASSED — rolled back, nothing saved". That "error" IS the success
-- message. Any other error is a failure: look for a message starting with "FAIL:" or the SQL error.
-- PASS lines are printed as notices (Messages panel / psql output) when your client shows them.
--
-- Needs >= 3 existing, non-deleted rows in public.profiles (tournament admin, module admin, plain user).
-- The helpers are in a real schema (not pg_temp) because some SQL runners use a different connection
-- per statement, which loses temp tables / temp functions.

-- ═══════════════════════════ STEP 1: helpers ═══════════════════════════
drop schema if exists tt_test cascade;
create schema tt_test;

create function tt_test.put(p_k text, p_v text) returns void language plpgsql as $$
begin
  perform set_config('tt.' || p_k, p_v, true);   -- transaction-local
end $$;

create function tt_test.ctx(p_k text) returns text language sql stable as
  $$ select nullif(current_setting('tt.' || p_k, true), '') $$;

create function tt_test.as_user(p_k text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', tt_test.ctx(p_k), 'role', 'authenticated')::text, true);
end $$;

create function tt_test.chk(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAIL: %', p_msg; end if;
  raise notice 'PASS: %', p_msg;
end $$;

-- run p_sql; it must raise an error whose message starts with p_code
create function tt_test.expect_err(p_sql text, p_code text, p_msg text) returns void language plpgsql as $$
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

-- build a module with n entries, move it to in_progress (bracket generated + started)
create function tt_test.mk_module(p_name text, p_n int, p_third boolean) returns uuid language plpgsql as $$
declare
  v_t uuid := tt_test.ctx('t')::uuid;
  v_m uuid;
  i int;
begin
  perform tt_test.as_user('admin');
  v_m := public.create_tournament_module(v_t, p_name, 'table_tennis', null, null, null, null, null, p_third, 'manual');
  perform public.set_module_status(v_m, 'open');
  for i in 1..p_n loop
    perform public.upsert_tournament_entry(v_m, null, 'P' || i, null,
      jsonb_build_object('cms_id', p_name || '-' || i, 'school', 'S' || (i % 3),
                         'phone', '03001234567', 'email', 'p' || i || '@example.com'));
  end loop;
  perform public.set_module_status(v_m, 'seeding');
  perform public.generate_bracket(v_m);
  perform public.set_module_status(v_m, 'in_progress');
  return v_m;
end $$;

-- play every playable match (side A wins 3–1) until nothing is left
create function tt_test.play_all(p_m uuid) returns void language plpgsql as $$
declare v_id uuid; guard int := 0;
begin
  perform tt_test.as_user('admin');
  loop
    select id into v_id from public.tournament_matches
    where module_id = p_m and status in ('pending','scheduled')
      and entry_a_id is not null and entry_b_id is not null
    order by is_third_place, round_number, match_number limit 1;
    exit when v_id is null;
    perform public.record_tournament_result(v_id, 3, 1, null, null, null);
    guard := guard + 1;
    if guard > 400 then raise exception 'FAIL: play_all runaway'; end if;
  end loop;
end $$;

-- ═══════════════════════════ STEP 2: the tests (single DO, self-rolling-back) ═══════════════════════════
do $$
begin
  -- ── section 0
  declare v_ids uuid[]; v_t uuid;
  begin
    select array_agg(id) into v_ids from (
      select id from public.profiles where deleted_at is null order by created_at limit 3) x;
    if coalesce(array_length(v_ids, 1), 0) < 3 then
      raise exception 'Need at least 3 profiles to run these tests';
    end if;
    perform tt_test.put('admin', v_ids[1]::text); perform tt_test.put('modadmin', v_ids[2]::text); perform tt_test.put('user', v_ids[3]::text);
  
    insert into public.tournaments (name, status) values ('SQL Test Cup', 'published') returning id into v_t;
    insert into public.tournament_admins (tournament_id, profile_id) values (v_t, v_ids[1]);
    perform tt_test.put('t', v_t::text);
  
    insert into public.tournaments (name, status) values ('Hidden Draft Cup', 'draft') returning id into v_t;
    perform tt_test.put('draft', v_t::text);
  
    perform tt_test.chk((select count(*) from public.tournament_entry_fields
                         where tournament_id = tt_test.ctx('t')::uuid and is_core) = 5,
                        'creating a tournament seeds 5 core entry fields');
  end;

  -- ── section 1
  declare v_t uuid := tt_test.ctx('t')::uuid; v_cms uuid; v_f jsonb;
  begin
    select id into v_cms from public.tournament_entry_fields where tournament_id = v_t and key = 'cms_id';
    perform tt_test.as_user('admin');
  
    perform tt_test.expect_err(format('select public.archive_tournament_entry_field(%L)', v_cms),
      'CORE_FIELD_LOCKED', 'core field cannot be archived');
  
    perform tt_test.expect_err(
      format('update public.tournament_entry_fields set is_required = false where id = %L', v_cms),
      'CORE_FIELD_LOCKED', 'core field required-flag is locked (trigger)');
  
    perform tt_test.expect_err(format('delete from public.tournament_entry_fields where id = %L', v_cms),
      'CORE_FIELD_LOCKED', 'core field cannot be deleted');
  
    v_f := public.upsert_tournament_entry_field(v_t, v_cms, null, 'Student ID', null, null, null, null, null, null);
    perform tt_test.chk(v_f->>'label' = 'Student ID' and v_f->>'key' = 'cms_id' and (v_f->>'is_required')::boolean,
                        'core field: label editable, key + required unchanged');
    perform public.upsert_tournament_entry_field(v_t, v_cms, null, 'CMS ID', null, null, null, null, null, null);
  
    v_f := public.upsert_tournament_entry_field(v_t, null, 'dept', 'Department', 'select',
                                                '["CS","EE"]'::jsonb, null, false, true, null);
    perform tt_test.chk(v_f->>'key' = 'dept' and (v_f->>'is_public')::boolean, 'custom select field created');
    perform tt_test.expect_err(
      format('select public.upsert_tournament_entry_field(%L,null,%L,%L,%L,null,null,false,false,null)',
             v_t, 'dept', 'Dup', 'text'),
      'DUPLICATE_FIELD_KEY', 'duplicate field key rejected');
  
    perform public.archive_tournament_entry_field((v_f->>'id')::uuid);
    perform tt_test.chk((select count(*) from public.get_tournament_entry_fields(v_t, false)) = 5,
                        'archived custom field hidden from the form');
    perform tt_test.chk((select count(*) from public.get_tournament_entry_fields(v_t, true)) = 6,
                        'admin can list archived fields');
  end;

  -- ── section 2
  declare v_t uuid := tt_test.ctx('t')::uuid; v_m uuid; v_other uuid;
  begin
    perform tt_test.as_user('user');
    perform tt_test.expect_err(
      format('select public.create_tournament_module(%L,%L,%L,null,null,null,null,null,false,%L)',
             v_t, 'Nope', 'tennis', 'manual'),
      'NOT_ALLOWED', 'plain user cannot create a module');
    perform tt_test.expect_err(format('select public.rename_tournament(%L,%L)', v_t, 'Hacked name'),
      'NOT_ALLOWED', 'plain user cannot rename a tournament');
  
    perform tt_test.as_user('admin');
    perform public.rename_tournament(v_t, 'SQL Test Cup');
    v_m := public.create_tournament_module(v_t, 'Perm Module', 'tennis', null, null, null, null, null, false, 'manual');
    v_other := public.create_tournament_module(v_t, 'Other Module', 'tennis', null, null, null, null, null, false, 'manual');
    perform public.add_module_admin(v_m, tt_test.ctx('modadmin')::uuid);
    perform tt_test.put('perm_m', v_m::text); perform tt_test.put('other_m', v_other::text);
    perform tt_test.chk(true, 'tournament admin created modules and assigned a module admin');
  
    perform tt_test.as_user('modadmin');
    perform tt_test.expect_err(format('select public.add_module_admin(%L,%L)', v_m, tt_test.ctx('user')::uuid),
      'NOT_ALLOWED', 'module admin cannot assign module admins');
    perform tt_test.expect_err(format('select public.set_module_status(%L,%L)', v_other, 'open'),
      'NOT_ALLOWED', 'module admin has no power over another module');
    perform public.set_module_status(v_m, 'open');
    perform tt_test.chk(true, 'module admin can change status of their own module');
  end;

  -- ── section 3
  declare v_m uuid := tt_test.ctx('perm_m')::uuid; v_e uuid;
  begin
    perform tt_test.as_user('modadmin');
    v_e := public.upsert_tournament_entry(v_m, null, 'Ali Raza', null,
      '{"cms_id":"24100123","school":"SBASSE","phone":"+92 300 1234567","email":"ali@example.com","junk":"x"}'::jsonb);
    perform tt_test.chk(not (select field_values ? 'junk' from public.tournament_entries where id = v_e),
                        'unknown field keys are stripped');
    perform tt_test.expect_err(format($q$select public.upsert_tournament_entry(%L,null,'Dup',null,
        '{"cms_id":"24100123","school":"X","phone":"03001234567","email":"d@example.com"}'::jsonb)$q$, v_m),
      'DUPLICATE_CMS_ID', 'duplicate CMS ID in a module rejected');
    perform tt_test.expect_err(format($q$select public.upsert_tournament_entry(%L,null,'NoMail',null,
        '{"cms_id":"1","school":"X","phone":"03001234567"}'::jsonb)$q$, v_m),
      'FIELD_REQUIRED:email', 'missing required email rejected');
    perform tt_test.expect_err(format($q$select public.upsert_tournament_entry(%L,null,'BadMail',null,
        '{"cms_id":"2","school":"X","phone":"03001234567","email":"nope"}'::jsonb)$q$, v_m),
      'FIELD_INVALID:email', 'invalid email rejected');
    perform tt_test.expect_err(format($q$select public.upsert_tournament_entry(%L,null,'BadPhone',null,
        '{"cms_id":"3","school":"X","phone":"abc","email":"a@b.co"}'::jsonb)$q$, v_m),
      'FIELD_INVALID:phone', 'invalid phone rejected');
  
    -- PII: plain user sees public fields only; admin sees everything
    perform tt_test.as_user('user');
    perform tt_test.chk((select fields ? 'school' and not (fields ? 'cms_id') and not (fields ? 'email')
                                and not (fields ? 'phone')
                         from public.get_module_entries(v_m) where id = v_e),
                        'non-admin sees school but NOT cms_id / phone / email');
    perform tt_test.as_user('modadmin');
    perform tt_test.chk((select fields ? 'cms_id' and fields ? 'email' from public.get_module_entries(v_m) where id = v_e),
                        'module admin sees private fields');
  
    perform tt_test.as_user('admin');
    perform public.withdraw_tournament_entry(v_e, 'test');
    perform tt_test.chk((select status = 'withdrawn' from public.tournament_entries where id = v_e),
                        'entry can be withdrawn while open');
  end;

  -- ── section 4
  declare v_n int;
  begin
    perform tt_test.as_user('user');
    set local role authenticated;
  
    begin
      insert into public.tournaments (name) values ('hacked');
      reset role;
      raise exception 'FAIL: authenticated user inserted into tournaments';
    exception when insufficient_privilege then
      raise notice 'PASS: authenticated users cannot INSERT into tournaments';
    end;
  
    begin
      update public.tournament_matches set score_a = 99;
      reset role;
      raise exception 'FAIL: authenticated user updated tournament_matches';
    exception when insufficient_privilege then
      raise notice 'PASS: authenticated users cannot UPDATE tournament_matches';
    end;
  
    select count(*) into v_n from public.tournaments where name = 'Hidden Draft Cup';
    if v_n <> 0 then reset role; raise exception 'FAIL: draft tournament visible to plain user'; end if;
    raise notice 'PASS: draft tournament hidden from plain user';
  
    select count(*) into v_n from public.tournament_entries;
    if v_n <> 0 then reset role; raise exception 'FAIL: plain user can read tournament_entries directly (% rows)', v_n; end if;
    raise notice 'PASS: tournament_entries not directly readable by plain user';
  
    reset role;
  end;

  -- ── section 5
  declare
    cfg record; v_m uuid; v_size int; v_rounds int; v_exp_matches int; v_byes int; n int;
    v_champ_seed int; v_runner_seed int;
  begin
    for cfg in
      select * from (values (2,false),(3,false),(5,false),(8,false),(9,false),(16,false),(8,true),(5,true))
        as x(n, third)
    loop
      n := cfg.n;
      v_m := tt_test.mk_module('B' || n || case when cfg.third then 't' else '' end, n, cfg.third);
  
      v_size := 2; v_rounds := 1;
      while v_size < n loop v_size := v_size * 2; v_rounds := v_rounds + 1; end loop;
      v_exp_matches := (v_size - 1) + case when cfg.third and v_rounds >= 2 then 1 else 0 end;
      v_byes := v_size - n;
  
      perform tt_test.chk((select count(*) from public.tournament_matches where module_id = v_m) = v_exp_matches,
        format('N=%s third=%s: %s matches generated', n, cfg.third, v_exp_matches));
      perform tt_test.chk((select count(*) from public.tournament_matches where module_id = v_m and status = 'bye') = v_byes,
        format('N=%s: %s byes', n, v_byes));
      perform tt_test.chk(not exists (
          select 1 from public.tournament_matches where module_id = v_m and status = 'bye'
            and (winner_entry_id is null)),
        format('N=%s: bye winners set', n));
      -- every bye winner already sits in its round-2 slot
      if v_rounds >= 2 then
        perform tt_test.chk(not exists (
            select 1 from public.tournament_matches b
            join public.tournament_matches nx on nx.id = b.next_match_id
            where b.module_id = v_m and b.status = 'bye'
              and ((b.next_slot = 'a' and nx.entry_a_id is distinct from b.winner_entry_id)
                or (b.next_slot = 'b' and nx.entry_b_id is distinct from b.winner_entry_id))),
          format('N=%s: bye winners advanced', n));
      end if;
  
      perform tt_test.play_all(v_m);
  
      perform tt_test.chk((select status from public.tournament_modules where id = v_m) = 'completed',
        format('N=%s third=%s: module auto-completes', n, cfg.third));
  
      select e.seed into v_champ_seed from public.tournament_modules m
        join public.tournament_entries e on e.id = m.champion_entry_id where m.id = v_m;
      select e.seed into v_runner_seed from public.tournament_modules m
        join public.tournament_entries e on e.id = m.runner_up_entry_id where m.id = v_m;
      perform tt_test.chk(v_champ_seed = 1 and v_runner_seed = 2,
        format('N=%s: champion is seed 1, runner-up seed 2 (A side always wins)', n));
  
      perform tt_test.chk((select count(*) from public.tournament_entries where module_id = v_m and final_rank = 1) = 1
                      and (select count(*) from public.tournament_entries where module_id = v_m and final_rank = 2) = 1,
        format('N=%s: exactly one rank 1 and one rank 2', n));
  
      if cfg.third and v_rounds >= 2 then
        perform tt_test.chk((select count(*) from public.tournament_entries where module_id = v_m and final_rank = 3) = 1
                        and (select count(*) from public.tournament_entries where module_id = v_m and final_rank = 4) = 1,
          format('N=%s: 3rd-place match gives ranks 3 and 4', n));
      elsif v_rounds >= 2 then
        perform tt_test.chk((select count(*) from public.tournament_entries where module_id = v_m and final_rank = 3) = case when n >= 4 then 2 else 1 end,
          format('N=%s: no 3rd-place match → semi-final losers share rank 3', n));
      end if;
  
      perform tt_test.chk((select count(*) from public.get_module_standings(v_m)) = n,
        format('N=%s: standings list every entry', n));
      perform tt_test.chk((select rank_label from public.get_module_standings(v_m) where rank = 1) = '1',
        format('N=%s: standings rank 1 label', n));
    end loop;
  end;

  -- ── section 6
  declare
    v_m uuid; q1 uuid; q2 uuid; q3 uuid; q4 uuid; s1 uuid; s2 uuid;
    qa uuid; qb uuid; r jsonb;
  begin
    v_m := tt_test.mk_module('WO8', 8, false);
    perform tt_test.as_user('admin');
  
    select id, entry_a_id, entry_b_id into q1, qa, qb from public.tournament_matches
      where module_id = v_m and round_number = 1 and match_number = 1;
    select id into q2 from public.tournament_matches where module_id = v_m and round_number = 1 and match_number = 2;
    select id into q3 from public.tournament_matches where module_id = v_m and round_number = 1 and match_number = 3;
    select id into q4 from public.tournament_matches where module_id = v_m and round_number = 1 and match_number = 4;
    select id into s1 from public.tournament_matches where module_id = v_m and round_number = 2 and match_number = 1;
    select id into s2 from public.tournament_matches where module_id = v_m and round_number = 2 and match_number = 2;
  
    -- walkover advances B and eliminates A
    perform public.record_tournament_walkover(q1, qb, null);
    perform tt_test.chk((select entry_a_id = qb from public.tournament_matches where id = s1),
                        'walkover: winner advanced into the next match');
    perform tt_test.chk((select eliminated_round = 1 from public.tournament_entries where id = qa),
                        'walkover: loser eliminated in round 1');
    perform tt_test.chk((select status = 'walkover' and result_note = 'Walkover' from public.tournament_matches where id = q1),
                        'walkover: status + default note');
  
    -- reset undoes it
    perform public.reset_tournament_match(q1);
    perform tt_test.chk((select entry_a_id is null from public.tournament_matches where id = s1),
                        'reset: winner removed from next match');
    perform tt_test.chk((select eliminated_round is null from public.tournament_entries where id = qa),
                        'reset: loser no longer eliminated');
    perform tt_test.chk((select status = 'pending' from public.tournament_matches where id = q1),
                        'reset: match back to pending');
  
    -- ties need a winner
    perform tt_test.expect_err(format('select public.record_tournament_result(%L,2,2,null,null,null)', q1),
      'TIE_NEEDS_WINNER', 'level score without winner rejected');
    perform public.record_tournament_result(q1, 2, 2, null, qb, 'Won on penalties');
    perform tt_test.chk((select winner_entry_id = qb from public.tournament_matches where id = q1),
                        'level score with explicit winner accepted');
  
    -- edit the winner (no downstream played yet) → next slot replaced
    perform public.record_tournament_result(q1, 5, 1, null, null, null);
    perform tt_test.chk((select entry_a_id = qa from public.tournament_matches where id = s1),
                        'editing a result swaps the advanced entry');
  
    -- play QF2, then SF1; QF1 is now locked
    perform public.record_tournament_result(q2, 3, 1, null, null, null);
    perform public.record_tournament_result(s1, 3, 0, null, null, null);
    perform tt_test.expect_err(format('select public.reset_tournament_match(%L)', q1),
      'DOWNSTREAM_PLAYED', 'cannot reset a match whose next match was played');
    perform tt_test.expect_err(format('select public.record_tournament_result(%L,0,3,null,null,null)', q1),
      'DOWNSTREAM_PLAYED', 'cannot edit a match whose next match was played');
  
    -- bye matches cannot be reset, and results need both entries
    perform tt_test.expect_err(format('select public.record_tournament_result(%L,1,0,null,null,null)', s2),
      'INVALID_STATUS', 'cannot score a match with an empty slot');
  
    -- scheduling
    r := public.schedule_tournament_match(q3, now() + interval '1 day', 'Hall A', 'Court 2');
    perform tt_test.chk(r->>'status' = 'scheduled' and r->>'court' = 'Court 2', 'scheduling sets status + court');
  end;

  -- ── section 7
  declare v_m uuid; v_t uuid := tt_test.ctx('t')::uuid;
  begin
    perform tt_test.as_user('admin');
    v_m := public.create_tournament_module(v_t, 'Life', 'squash', null, null, null, null, null, false, 'manual');
    perform tt_test.expect_err(format('select public.set_module_status(%L,%L)', v_m, 'seeding'),
      'INVALID_STATUS', 'draft → seeding not allowed');
    perform public.set_module_status(v_m, 'open');
    perform tt_test.expect_err(format('select public.set_module_status(%L,%L)', v_m, 'seeding'),
      'NOT_ENOUGH_ENTRIES', 'seeding needs >= 2 entries');
    perform public.upsert_tournament_entry(v_m, null, 'A', null,
      '{"cms_id":"a1","school":"s","phone":"03001234567","email":"a@x.co"}'::jsonb);
    perform public.upsert_tournament_entry(v_m, null, 'B', null,
      '{"cms_id":"b1","school":"s","phone":"03001234567","email":"b@x.co"}'::jsonb);
    perform public.set_module_status(v_m, 'seeding');
    perform tt_test.expect_err(format('select public.set_module_status(%L,%L)', v_m, 'in_progress'),
      'INVALID_STATUS', 'cannot start without a generated bracket');
    perform public.generate_bracket(v_m);
    perform public.set_module_status(v_m, 'open');
    perform tt_test.chk((select count(*) from public.tournament_matches where module_id = v_m) = 0,
                        'seeding → open deletes the generated bracket');
  
    -- finished tournaments are read-only for admins
    update public.tournaments set status = 'completed' where id = v_t;
    perform tt_test.expect_err(format('select public.rename_tournament(%L,%L)', v_t, 'Late rename'),
      'INVALID_STATUS', 'completed tournament is read-only for admins');
  end;

  raise exception 'ALL TESTS PASSED — rolled back, nothing saved';
end $$;

-- ═══════════════════════════ STEP 3: cleanup ═══════════════════════════
drop schema if exists tt_test cascade;
