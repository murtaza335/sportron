-- 134_guest_read_access.sql
-- Guest mode, step 1 (plan: docs/guest-mode/PLAN.md). ADDITIVE ONLY.
--
-- Lets people who are NOT signed in browse tournaments, communities and the open-sessions feed.
--
-- Security model (read this before changing anything):
--   * Migration 109 stays exactly as it is: `anon` still cannot execute any pre-existing function
--     and still cannot read any table or view. Nothing existing is touched or re-granted.
--   * Every guest function below is a THIN READ-ONLY WRAPPER. It runs the existing, already-reviewed
--     read function as an unprivileged "stranger": a user id that cannot exist (the all-zero uuid is
--     not in auth.users, so it has no profile, no membership, no admin or entry rows). So a guest sees
--     AT MOST what a random signed-in stranger sees today: published tournaments only, entry-form
--     private values (CMS id / phone / email) stripped server-side, no drafts, my_role = null.
--     Because the wrappers delegate, they follow any future change to those functions automatically.
--   * The stranger identity is set with set_config(..., is_local => true): it lasts only for the
--     current transaction and is reset before the wrapper returns. No write function is wrapped, and
--     every wrapper is allow-listed below by name.
--   * Kill switch: every guest function first checks site_config 'guest_mode'. OFF by default, so
--     applying this migration changes nothing until a super admin turns it on.
--   * Community CONTENT (posts, matches, members, chat) is deliberately NOT exposed: non-members cannot
--     read it when signed in (102/107), so guests cannot either. Guests get the community card only.
--   * Open sessions are reduced for guests: no creator identity, no venue, no description.

-- ── 1. Switch (world-readable like the other site_config rows; written only by service role / admin RPC)
insert into public.site_config (key, value)
values ('guest_mode', '{"enabled": false}'::jsonb)
on conflict (key) do nothing;

create or replace function public._guest_mode_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value ->> 'enabled')::boolean from public.site_config where key = 'guest_mode'), false);
$$;

-- ── 2. Stranger identity helpers (internal; service_role only)
create or replace function public._guest_begin()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_stranger constant text := '00000000-0000-0000-0000-000000000000';
begin
  if not public._guest_mode_enabled() then
    raise exception 'GUEST_DISABLED';
  end if;
  -- auth.uid() reads either of these depending on the Supabase version: set both, transaction-local.
  perform set_config('request.jwt.claim.sub', v_stranger, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
end;
$$;

create or replace function public._guest_end()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- ── 3. Tournaments (list, detail, modules, brackets, standings, schedule, live)
-- Table-returning functions are wrapped to a jsonb ARRAY of row objects: the same JSON the client
-- already receives from PostgREST for a table-returning rpc(), and it never goes stale when the
-- underlying function gains a column.
create or replace function public.guest_get_tournaments(p_scope text default 'upcoming')
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v jsonb;
begin
  -- 'mine' is meaningless for a guest; reject rather than silently returning everything
  if p_scope is null or p_scope not in ('live', 'upcoming', 'past', 'all') then
    raise exception 'INVALID_SCOPE';
  end if;
  perform public._guest_begin();
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v from public.get_tournaments(p_scope) t;
  perform public._guest_end();
  return v;
end $$;

create or replace function public.guest_get_tournament_detail(p_tournament uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v jsonb;
begin
  perform public._guest_begin();
  v := public.get_tournament_detail(p_tournament);
  perform public._guest_end();
  return v;
end $$;

create or replace function public.guest_get_module_detail(p_module uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v jsonb;
begin
  perform public._guest_begin();
  v := public.get_module_detail(p_module);
  perform public._guest_end();
  return v;
end $$;

create or replace function public.guest_get_module_entries(p_module uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v jsonb;
begin
  perform public._guest_begin();
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v from public.get_module_entries(p_module) t;
  perform public._guest_end();
  return v;
end $$;

create or replace function public.guest_get_module_matches(p_module uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v jsonb;
begin
  perform public._guest_begin();
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v from public.get_module_matches(p_module) t;
  perform public._guest_end();
  return v;
end $$;

create or replace function public.guest_get_module_standings_v2(p_module uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v jsonb;
begin
  perform public._guest_begin();
  v := public.get_module_standings_v2(p_module);
  perform public._guest_end();
  return v;
end $$;

create or replace function public.guest_get_module_groups(p_module uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v jsonb;
begin
  perform public._guest_begin();
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v from public.get_module_groups(p_module) t;
  perform public._guest_end();
  return v;
end $$;

create or replace function public.guest_get_tournament_schedule(p_tournament uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v jsonb;
begin
  perform public._guest_begin();
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v from public.get_tournament_schedule(p_tournament, p_from, p_to) t;
  perform public._guest_end();
  return v;
end $$;

create or replace function public.guest_get_live_tournaments()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v jsonb;
begin
  perform public._guest_begin();
  v := public.get_live_tournaments();
  perform public._guest_end();
  return v;
end $$;

create or replace function public.guest_get_live_tournament_board(p_tournament uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v jsonb;
begin
  perform public._guest_begin();
  v := public.get_live_tournament_board(p_tournament);
  perform public._guest_end();
  return v;
end $$;

create or replace function public.guest_get_live_match(p_match uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v jsonb;
begin
  perform public._guest_begin();
  v := public.get_live_match(p_match);
  perform public._guest_end();
  return v;
end $$;

-- ── 4. Communities: the CARD only (same columns a signed-in stranger sees in Discover)
create or replace function public.guest_get_discover_communities()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v jsonb;
begin
  perform public._guest_begin();
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v from public.get_discover_communities() t;
  perform public._guest_end();
  return v;
end $$;

create or replace function public.guest_get_community(p_community uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v jsonb;
begin
  perform public._guest_begin();
  select to_jsonb(t) into v from public.get_community_by_id(p_community) t limit 1;
  perform public._guest_end();
  return v;  -- null when the community does not exist
end $$;

-- ── 5. Open sessions, reduced: when/what/how many, but no creator, venue or description
create or replace function public.guest_get_open_sessions()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v jsonb;
begin
  perform public._guest_begin();
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'purpose', s.purpose,
           'title', s.title,
           'date_time', s.date_time,
           'expires_at', s.expires_at,
           'max_participants', s.max_participants,
           'status', s.status,
           'commitment_count', s.commitment_count
         ) order by s.date_time), '[]'::jsonb)
    into v
  from public.get_open_sessions() s
  where s.status in ('open', 'full');
  perform public._guest_end();
  return v;
end $$;

-- ── 6. Super-admin switch (same pattern as admin_set_maintenance, 123)
create or replace function public.admin_set_guest_mode(p_enabled boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  perform public.assert_platform_role(array['super_admin']);
  if p_enabled is null then
    raise exception 'FIELD_INVALID:enabled';
  end if;
  select value into v_old from public.site_config where key = 'guest_mode';
  v_new := jsonb_build_object('enabled', p_enabled);
  insert into public.site_config (key, value, updated_at)
  values ('guest_mode', v_new, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public.log_admin_action(
    'SET_GUEST_MODE', 'site_config', md5('site_config:guest_mode')::uuid, v_old, v_new, p_note
  );
end $$;

-- ── 7. Grants. Explicit allow-list; everything else keeps the 109 lock-down.
do $$
declare
  f text;
begin
  -- internal helpers: nobody but the database itself (SECURITY DEFINER callers run as owner)
  foreach f in array array[
    '_guest_mode_enabled()', '_guest_begin()', '_guest_end()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;

  -- guest reads: callable without signing in
  foreach f in array array[
    'guest_get_tournaments(text)',
    'guest_get_tournament_detail(uuid)',
    'guest_get_module_detail(uuid)',
    'guest_get_module_entries(uuid)',
    'guest_get_module_matches(uuid)',
    'guest_get_module_standings_v2(uuid)',
    'guest_get_module_groups(uuid)',
    'guest_get_tournament_schedule(uuid, timestamptz, timestamptz)',
    'guest_get_live_tournaments()',
    'guest_get_live_tournament_board(uuid)',
    'guest_get_live_match(uuid)',
    'guest_get_discover_communities()',
    'guest_get_community(uuid)',
    'guest_get_open_sessions()'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated, service_role', f);
  end loop;

  execute 'revoke all on function public.admin_set_guest_mode(boolean, text) from public, anon';
  execute 'grant execute on function public.admin_set_guest_mode(boolean, text) to authenticated';
end $$;
