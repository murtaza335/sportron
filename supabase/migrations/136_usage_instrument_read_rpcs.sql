-- 136_usage_instrument_read_rpcs.sql
-- Usage analytics, step 2 (docs/usage-analytics/PLAN.md §4): count screen visits inside the read RPCs
-- the app already calls. No app change, no new request.
--
-- HOW (and why it is backward compatible): for each target function the ORIGINAL is renamed to
-- _usage_inner_<name> (body untouched, so whichever migration defined it last stays the logic) and a thin
-- VOLATILE wrapper with the SAME name, argument list, defaults and result type is created. PostgREST runs STABLE
-- functions in a read-only transaction, which cannot write the counter; the wrapper is VOLATILE for that reason.
-- Installed app builds call the same name with the same arguments and get the same rows. The wrapper calls
-- _usage_track(), which never raises, then returns whatever the inner function returns.
--
-- Targets that do not exist in a given database are skipped; re-running is a no-op (idempotent).
-- Only the outermost client-facing function is wrapped. Guest wrappers (guest_get_*, 134) call these by name,
-- so guest visits are counted too (as the all-zero "guest" user).
--
-- Inner functions are service_role-only: clients can only reach the logic through the wrapper.

do $$
declare
  t record;
  f record;
  v_inner text;
  v_args text;
  v_call text;
  v_result text;
  v_track text;
  v_body text;
  v_names text[];
  v_has_names boolean;
  v_types oid[];
  v_n int := 0;
begin
  for t in
    select * from (values
      ('get_my_communities',          'communities_list',     false),
      ('get_public_communities',       'discover',             false),
      ('get_community_by_id',          'community',            true),
      ('get_community_posts',          'community_feed',       true),
      ('get_open_sessions',            'sessions_open',        false),
      ('get_my_sessions',              'sessions_my',          false),
      ('get_joined_sessions',          'sessions_joined',      false),
      ('get_my_accessible_sessions',   'sessions_accessible',  false),
      ('get_session_history',          'sessions_history',     false),
      ('get_session_by_id',            'session',              true),
      ('get_chat_hub_stats',           'chats_hub',            false),
      ('get_tournaments',              'tournaments_list',     false),
      ('get_tournament_detail',        'tournament',           true),
      ('get_module_matches',           'module',               true),
      ('get_live_tournament_board',    'live',                 true),
      ('get_live_match',               'live_match',           true),
      ('get_tournament_schedule',      'tournament_today',     true)
    ) as x(fname, vkey, want_target)
  loop
    for f in
      select p.oid, p.proname, p.proargnames, p.proargtypes, p.proretset, p.prorettype
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = t.fname
        and p.prokind = 'f'
    loop
      v_inner := '_usage_inner_' || f.proname;
      v_types := coalesce(nullif(string_to_array(f.proargtypes::text, ' '), '{}')::oid[], '{}');

      -- already wrapped (this overload): an inner function with the same argument types exists
      if exists (
        select 1 from pg_proc p2
        where p2.pronamespace = 'public'::regnamespace and p2.proname = v_inner
          and p2.proargtypes = f.proargtypes
      ) then
        continue;
      end if;

      v_args := pg_get_function_arguments(f.oid);
      v_result := pg_get_function_result(f.oid);
      v_names := coalesce(f.proargnames, '{}');
      v_has_names := (cardinality(v_types) = 0)
                     or (cardinality(v_names) >= cardinality(v_types)
                         and not exists (select 1 from unnest(v_names) nm where nm = ''));
      if not v_has_names then
        raise notice 'usage: % skipped (unnamed arguments)', f.proname;
        continue;
      end if;

      -- positional call list: p_a, p_b, ...
      select coalesce(string_agg(quote_ident(nm), ', ' order by ord), '')
        into v_call
      from unnest(v_names[1:cardinality(v_types)]) with ordinality as u(nm, ord);

      -- target id = first argument when it is a uuid
      if t.want_target
         and cardinality(v_types) >= 1
         and v_types[1] = 'uuid'::regtype then
        v_track := format('perform public._usage_track(%L, %I);', t.vkey, v_names[1]);
      else
        v_track := format('perform public._usage_track(%L, null);', t.vkey);
      end if;

      if f.proretset or v_result like 'TABLE(%' then
        v_body := format('begin %s return query select * from public.%I(%s); end;', v_track, v_inner, v_call);
      else
        v_body := format('begin %s return public.%I(%s); end;', v_track, v_inner, v_call);
      end if;

      execute format('alter function public.%I(%s) rename to %I',
                     f.proname, pg_get_function_identity_arguments(f.oid), v_inner);
      execute format('revoke all on function public.%I(%s) from public, anon, authenticated',
                     v_inner, pg_get_function_identity_arguments(f.oid));
      execute format('grant execute on function public.%I(%s) to service_role',
                     v_inner, pg_get_function_identity_arguments(f.oid));

      execute format(
        'create function public.%I(%s) returns %s language plpgsql volatile security definer set search_path = public as %L',
        f.proname, v_args, v_result, v_body);
      execute format('revoke all on function public.%I(%s) from public, anon',
                     f.proname, pg_get_function_identity_arguments(f.oid));
      execute format('grant execute on function public.%I(%s) to authenticated, service_role',
                     f.proname, pg_get_function_identity_arguments(f.oid));
      v_n := v_n + 1;
    end loop;
  end loop;
  raise notice 'usage: % read function(s) instrumented', v_n;
end $$;
