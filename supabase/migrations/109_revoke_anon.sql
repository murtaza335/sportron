-- SEC-H8: with only the public anon key (shipped in the web bundle) anyone could dump
-- public_profiles (a non-security-invoker view bypasses profiles RLS) and call every
-- SECURITY DEFINER RPC (e.g. spam close_expired_sessions). The app requires login before
-- any data access, so anon needs none of these.
--
-- 1. Views: revoke from anon, keep authenticated.
-- 2. Functions in public: revoke EXECUTE from PUBLIC and anon. To avoid breaking functions
--    whose authenticated/service_role access came only through the implicit PUBLIC grant,
--    those roles are granted explicitly first (only where they currently have access, so
--    previously locked-down functions such as get_chat_push_data stay locked).
-- 3. Future functions no longer default to anon-executable.
-- site_config (maintenance flag) is a table with its own policy and is left untouched.

do $$
declare
  v_view record;
  v_fn record;
begin
  for v_view in
    select schemaname, viewname from pg_views where schemaname = 'public'
  loop
    execute format('revoke all on %I.%I from anon', v_view.schemaname, v_view.viewname);
    execute format('grant select on %I.%I to authenticated', v_view.schemaname, v_view.viewname);
  end loop;

  for v_fn in
    select p.oid,
           p.oid::regprocedure as sig,
           has_function_privilege('authenticated', p.oid, 'execute') as auth_ok,
           has_function_privilege('service_role', p.oid, 'execute') as svc_ok
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and has_function_privilege('anon', p.oid, 'execute')
  loop
    if v_fn.auth_ok then
      execute format('grant execute on function %s to authenticated', v_fn.sig);
    end if;
    if v_fn.svc_ok then
      execute format('grant execute on function %s to service_role', v_fn.sig);
    end if;
    execute format('revoke execute on function %s from public, anon', v_fn.sig);
  end loop;
end $$;

alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from public;
