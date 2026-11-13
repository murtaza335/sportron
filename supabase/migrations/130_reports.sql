-- 130_reports.sql
-- In-app reporting (docs/reporting/PLAN.md §3–§4): `reports` table, `submit_report` (client), staff
-- moderation RPCs (`admin_*`), and a `moderator` platform role.
-- ADDITIVE ONLY. The one redefinition of an existing function (chat-message delete triggers, 039/043)
-- keeps their exact behaviour and only adds a bypass for platform staff. Old app builds are unaffected.
--
-- Seed the feature flag OFF (ship dark, enable from the admin panel):
--   insert into public.feature_flags (key, enabled, description)
--   values ('reports', false, 'In-app reporting') on conflict do nothing;

-- ── 1. Table ───────────────────────────────────────────────────────────────

create table if not exists public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references public.profiles(id) on delete cascade,
  target_type      text not null check (target_type in (
                     'session_message','community_message',
                     'community_post','community_post_comment',
                     'community_match','community_match_comment',
                     'profile','community','session','tournament')),
  target_id        uuid not null,                 -- polymorphic, no FK: a report outlives its target
  target_owner_id  uuid,                          -- author/creator, resolved server-side
  community_id     uuid,
  session_id       uuid,
  reason           text not null check (reason in (
                     'spam','harassment','hate','sexual','violence',
                     'impersonation','fake_result','scam','other')),
  details          text check (char_length(details) <= 500),
  snapshot         jsonb not null,                -- copy of the content at report time (server-built)
  status           text not null default 'open' check (status in ('open','actioned','dismissed')),
  action_taken     text check (action_taken in ('none','content_removed','warned','other')),
  resolution_note  text,
  resolved_by      uuid references public.profiles(id) on delete set null,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- One open report per (reporter, target): re-reporting is idempotent
create unique index if not exists reports_open_unique
  on public.reports (reporter_id, target_type, target_id) where status = 'open';
create index if not exists reports_queue_idx  on public.reports (status, created_at desc);
create index if not exists reports_target_idx on public.reports (target_type, target_id);
create index if not exists reports_owner_idx  on public.reports (target_owner_id);
create index if not exists reports_reporter_recent_idx on public.reports (reporter_id, created_at desc);

alter table public.reports enable row level security;   -- no policies: no direct client access
revoke all on public.reports from anon, authenticated;

-- Audit trail (045 pattern)
create or replace function public.audit_reports()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    perform public.log_audit_event('INSERT', 'reports', NEW.id, null, to_jsonb(NEW));
    return NEW;
  elsif TG_OP = 'UPDATE' then
    perform public.log_audit_event('UPDATE', 'reports', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  elsif TG_OP = 'DELETE' then
    perform public.log_audit_event('DELETE', 'reports', OLD.id, to_jsonb(OLD), null);
    return OLD;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_audit_reports on public.reports;
create trigger trg_audit_reports
  after insert or update or delete on public.reports
  for each row execute function public.audit_reports();

-- ── 2. `moderator` platform role (additive widening of the 122 check) ──────

alter table public.platform_admins drop constraint if exists platform_admins_role_check;
alter table public.platform_admins
  add constraint platform_admins_role_check
  check (role in ('super_admin', 'tournament_manager', 'moderator'));

-- Same body as 122 with 'moderator' accepted
create or replace function public.admin_grant_platform_role(p_profile uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.platform_admins;
begin
  perform public.assert_platform_role(array['super_admin']);
  if p_role is null or p_role not in ('super_admin', 'tournament_manager', 'moderator') then
    raise exception 'INVALID_ROLE';
  end if;
  if p_profile = auth.uid() then
    raise exception 'CANNOT_CHANGE_SELF';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile and deleted_at is null) then
    raise exception 'NOT_FOUND';
  end if;

  select * into v_old from public.platform_admins where profile_id = p_profile;

  insert into public.platform_admins (profile_id, role, granted_by, granted_at, revoked_at)
  values (p_profile, p_role, auth.uid(), now(), null)
  on conflict (profile_id) do update
    set role = excluded.role, granted_by = excluded.granted_by,
        granted_at = excluded.granted_at, revoked_at = null;

  perform public.log_admin_action(
    'GRANT_ROLE', 'platform_admins', p_profile,
    case when v_old.profile_id is null then null else to_jsonb(v_old) end,
    jsonb_build_object('profile_id', p_profile, 'role', p_role), null
  );
end;
$$;

revoke all on function public.admin_grant_platform_role(uuid, text) from public, anon;
grant execute on function public.admin_grant_platform_role(uuid, text) to authenticated;

-- ── 3. Chat-message delete triggers: let platform staff remove reported messages ──
-- 039/043 only let the sender (≤24 h) or the community/session creator delete. Staff removal runs
-- as a definer function with auth.uid() = the staff member, so the triggers must recognise staff.
-- Made SECURITY DEFINER so they can call platform_role (not executable by clients). The RLS DELETE
-- policy (sender only) is unchanged, so staff still cannot delete via a direct client DELETE.

create or replace function public.enforce_community_message_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.platform_role(auth.uid()) is not null then
    return old;
  end if;
  -- (043) bypass for the community creator / community deletion cascade
  if not exists (
    select 1 from public.communities
    where id = old.community_id and created_by <> auth.uid()
  ) then
    return old;
  end if;
  if old.sender_id <> auth.uid() then
    raise exception 'You can only delete your own messages';
  end if;
  if old.created_at < now() - interval '24 hours' then
    raise exception 'Messages can only be deleted within 24 hours of sending';
  end if;
  return old;
end $$;

create or replace function public.enforce_session_message_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.platform_role(auth.uid()) is not null then
    return old;
  end if;
  -- (043) bypass for the session creator / session deletion cascade
  if not exists (
    select 1 from public.sessions
    where id = old.session_id and created_by <> auth.uid()
  ) then
    return old;
  end if;
  if old.sender_id <> auth.uid() then
    raise exception 'You can only delete your own messages';
  end if;
  if old.created_at < now() - interval '24 hours' then
    raise exception 'Messages can only be deleted within 24 hours of sending';
  end if;
  return old;
end $$;

-- ── 4. Internal helpers (definer-only) ─────────────────────────────────────

-- Resolves a target: owner, context ids and a content snapshot built from the LIVE row.
-- is_found = false when the row doesn't exist. Never takes content from the client.
create or replace function public._report_target_info(p_type text, p_id uuid)
returns table (is_found boolean, owner_id uuid, community_id uuid, session_id uuid, content jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
begin
  is_found := false; owner_id := null; community_id := null; session_id := null; content := null;

  if p_type = 'session_message' then
    select m.*, 'x' as _x into r from public.session_messages m where m.id = p_id;
    if r.id is not null then
      is_found := true; owner_id := r.sender_id; session_id := r.session_id;
      content := jsonb_build_object(
        'content', r.content, 'sender_username', r.sender_username, 'sender_avatar_url', r.sender_avatar_url,
        'created_at', r.created_at, 'edited_at', r.edited_at,
        'context', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'sender_username', c.sender_username, 'content', c.content, 'created_at', c.created_at)
                 order by c.created_at)
          from (
            select x.sender_username, x.content, x.created_at
            from public.session_messages x
            where x.session_id = r.session_id and x.created_at < r.created_at
            order by x.created_at desc limit 5
          ) c), '[]'::jsonb));
    end if;

  elsif p_type = 'community_message' then
    select m.*, 'x' as _x into r from public.community_messages m where m.id = p_id;
    if r.id is not null then
      is_found := true; owner_id := r.sender_id; community_id := r.community_id;
      content := jsonb_build_object(
        'content', r.content, 'sender_username', r.sender_username, 'sender_avatar_url', r.sender_avatar_url,
        'created_at', r.created_at, 'edited_at', r.edited_at,
        'context', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'sender_username', c.sender_username, 'content', c.content, 'created_at', c.created_at)
                 order by c.created_at)
          from (
            select x.sender_username, x.content, x.created_at
            from public.community_messages x
            where x.community_id = r.community_id and x.created_at < r.created_at
            order by x.created_at desc limit 5
          ) c), '[]'::jsonb));
    end if;

  elsif p_type = 'community_post' then
    select po.*, pr.username as _uname into r
      from public.community_posts po left join public.profiles pr on pr.id = po.author_id
     where po.id = p_id;
    if r.id is not null then
      is_found := true; owner_id := r.author_id; community_id := r.community_id;
      content := jsonb_build_object(
        'content', r.content, 'image_url', r.image_url, 'post_type', r.post_type,
        'author_username', r._uname, 'created_at', r.created_at);
    end if;

  elsif p_type = 'community_post_comment' then
    select c.*, po.community_id as _cid, pr.username as _uname into r
      from public.community_post_comments c
      join public.community_posts po on po.id = c.post_id
      left join public.profiles pr on pr.id = c.profile_id
     where c.id = p_id;
    if r.id is not null then
      is_found := true; owner_id := r.profile_id; community_id := r._cid;
      content := jsonb_build_object(
        'content', r.content, 'author_username', r._uname, 'post_id', r.post_id, 'created_at', r.created_at);
    end if;

  elsif p_type = 'community_match' then
    select m.*, pr.username as _rec_name, pl.username as _player_name, op.username as _opp_name into r
      from public.community_matches m
      left join public.profiles pr on pr.id = m.recorded_by
      left join public.profiles pl on pl.id = m.player_id
      left join public.profiles op on op.id = m.opponent_id
     where m.id = p_id;
    if r.id is not null then
      is_found := true; owner_id := r.recorded_by; community_id := r.community_id;
      content := jsonb_build_object(
        'sport', r.sport, 'custom_sport_name', r.custom_sport_name,
        'team_a_name', r.team_a_name, 'team_b_name', r.team_b_name,
        'player_username', r._player_name, 'opponent_username', r._opp_name, 'recorded_by_username', r._rec_name,
        'player_score', r.player_score, 'opponent_score', r.opponent_score,
        'approval_status', r.approval_status, 'created_at', r.created_at);
    end if;

  elsif p_type = 'community_match_comment' then
    select c.*, m.community_id as _cid, pr.username as _uname into r
      from public.community_match_comments c
      join public.community_matches m on m.id = c.community_match_id
      left join public.profiles pr on pr.id = c.profile_id
     where c.id = p_id;
    if r.id is not null then
      is_found := true; owner_id := r.profile_id; community_id := r._cid;
      content := jsonb_build_object(
        'content', r.content, 'author_username', r._uname,
        'match_id', r.community_match_id, 'created_at', r.created_at);
    end if;

  elsif p_type = 'profile' then
    select p.* into r from public.profiles p where p.id = p_id and p.deleted_at is null;
    if r.id is not null then
      is_found := true; owner_id := r.id;
      content := jsonb_build_object('username', r.username, 'bio', r.bio, 'avatar_url', r.avatar_url);
    end if;

  elsif p_type = 'community' then
    select c.*, 'x' as _x into r from public.communities c where c.id = p_id;
    if r.id is not null then
      is_found := true; owner_id := r.created_by; community_id := r.id;
      content := jsonb_build_object(
        'name', r.name, 'description', r.description, 'organization', r.organization,
        'location', r.location, 'image_url', r.image_url, 'visibility', r.visibility);
    end if;

  elsif p_type = 'session' then
    select s.*, 'x' as _x into r from public.sessions s where s.id = p_id;
    if r.id is not null then
      is_found := true; owner_id := r.created_by; session_id := r.id;
      content := jsonb_build_object(
        'title', r.title, 'purpose', r.purpose, 'description', r.description,
        'location', r.location, 'date_time', r.date_time, 'status', r.status);
    end if;

  elsif p_type = 'tournament' then
    select t.*, 'x' as _x into r from public.tournaments t where t.id = p_id;
    if r.id is not null then
      is_found := true; owner_id := r.created_by;
      content := jsonb_build_object(
        'name', r.name, 'description', r.description, 'organization', r.organization,
        'location', r.location, 'image_url', r.image_url, 'status', r.status);
    end if;
  end if;

  return next;
end;
$$;

-- Can p_uid see this target the way the app lets them see it? Used so submit_report can't probe
-- hidden content. Same result (NOT_FOUND) for "missing" and "hidden".
create or replace function public._report_can_view(
  p_uid uuid, p_type text, p_id uuid, p_community uuid, p_session uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_uid is null then return false; end if;

  if p_type = 'session_message' then
    return exists (
      select 1
      from public.session_messages m
      join public.sessions s on s.id = m.session_id
      where m.id = p_id
        and (
          s.created_by = p_uid
          or exists (select 1 from public.commitments c
                      where c.session_id = s.id and c.user_id = p_uid and c.status = 'accepted')
          or exists (select 1 from public.commitments c
                      where c.session_id = s.id and c.user_id = p_uid and c.status = 'left'
                        and m.created_at <= c.updated_at)
        ));

  elsif p_type = 'community_message' then
    return exists (select 1 from public.community_members cm
                    where cm.community_id = p_community and cm.profile_id = p_uid
                      and cm.approval_status = 'approved');

  elsif p_type in ('community_post','community_post_comment','community_match','community_match_comment') then
    return exists (select 1 from public.community_members cm
                    where cm.community_id = p_community and cm.profile_id = p_uid
                      and cm.approval_status = 'approved')
        or exists (select 1 from public.communities c
                    where c.id = p_community and c.visibility = 'public');

  elsif p_type = 'profile' then
    return exists (select 1 from public.public_profiles pp where pp.id = p_id);

  elsif p_type = 'community' then
    return exists (select 1 from public.communities c where c.id = p_id and c.visibility = 'public')
        or exists (select 1 from public.community_members cm
                    where cm.community_id = p_id and cm.profile_id = p_uid
                      and cm.approval_status = 'approved');

  elsif p_type = 'session' then
    -- mirrors get_session_by_id (049): open/full are public; ended sessions are creator/participants only
    return exists (
      select 1 from public.sessions s
      where s.id = p_id
        and (
          s.status in ('open', 'full')
          or s.created_by = p_uid
          or exists (select 1 from public.commitments c where c.session_id = s.id and c.user_id = p_uid)
        ));

  elsif p_type = 'tournament' then
    return public.can_view_tournament(p_id);
  end if;

  return false;
end;
$$;

revoke all on function public._report_target_info(text, uuid) from public, anon, authenticated;
revoke all on function public._report_can_view(uuid, text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public._report_target_info(text, uuid) to service_role;
grant execute on function public._report_can_view(uuid, text, uuid, uuid, uuid) to service_role;

-- ── 5. Client RPC ──────────────────────────────────────────────────────────

create or replace function public.submit_report(
  p_target_type text,
  p_target_id   uuid,
  p_reason      text,
  p_details     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_details text;
  v_info    record;
  v_id      uuid;
begin
  if v_uid is null then
    raise exception 'NOT_ALLOWED';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and deleted_at is null) then
    raise exception 'NOT_ALLOWED';
  end if;

  if p_target_type is null or p_target_type not in (
       'session_message','community_message','community_post','community_post_comment',
       'community_match','community_match_comment','profile','community','session','tournament') then
    raise exception 'INVALID_TARGET';
  end if;
  if p_reason is null or p_reason not in (
       'spam','harassment','hate','sexual','violence','impersonation','fake_result','scam','other') then
    raise exception 'INVALID_REASON';
  end if;

  v_details := nullif(btrim(coalesce(p_details, '')), '');
  if v_details is not null and char_length(v_details) > 500 then
    raise exception 'DETAILS_TOO_LONG';
  end if;

  select * into v_info from public._report_target_info(p_target_type, p_target_id);
  if not v_info.is_found
     or not public._report_can_view(v_uid, p_target_type, p_target_id, v_info.community_id, v_info.session_id) then
    raise exception 'NOT_FOUND';
  end if;

  if v_info.owner_id is not distinct from v_uid then
    raise exception 'CANNOT_REPORT_SELF';
  end if;

  -- Idempotent: an existing open report by this reporter on this target is returned as-is
  select r.id into v_id from public.reports r
   where r.reporter_id = v_uid and r.target_type = p_target_type
     and r.target_id = p_target_id and r.status = 'open';
  if v_id is not null then
    return v_id;
  end if;

  if (select count(*) from public.reports r
       where r.reporter_id = v_uid and r.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'RATE_LIMITED';
  end if;

  insert into public.reports (
    reporter_id, target_type, target_id, target_owner_id, community_id, session_id,
    reason, details, snapshot
  ) values (
    v_uid, p_target_type, p_target_id, v_info.owner_id, v_info.community_id, v_info.session_id,
    p_reason, v_details, v_info.content
  )
  on conflict (reporter_id, target_type, target_id) where status = 'open' do nothing
  returning id into v_id;

  if v_id is null then   -- lost a race with a concurrent identical report
    select r.id into v_id from public.reports r
     where r.reporter_id = v_uid and r.target_type = p_target_type
       and r.target_id = p_target_id and r.status = 'open';
  end if;
  return v_id;
end;
$$;

revoke all on function public.submit_report(text, uuid, text, text) from public, anon;
grant execute on function public.submit_report(text, uuid, text, text) to authenticated;

-- ── 6. Staff RPCs (super_admin + moderator) ────────────────────────────────

-- Queue grouped by target (one row per target) for one status
create or replace function public.admin_list_reports(
  p_status text default 'open',
  p_target_type text default null,
  p_limit int default 50,
  p_before timestamptz default null
)
returns table (
  target_type text,
  target_id uuid,
  report_count bigint,
  reporter_count bigint,
  top_reason text,
  first_reported timestamptz,
  last_reported timestamptz,
  snapshot jsonb,
  owner_id uuid,
  owner_username text,
  community_id uuid,
  session_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  perform public.assert_platform_role(array['super_admin', 'moderator']);
  if p_status is null or p_status not in ('open', 'actioned', 'dismissed') then
    raise exception 'INVALID_STATUS';
  end if;

  return query
  select
    r.target_type,
    r.target_id,
    count(*)::bigint,
    count(distinct r.reporter_id)::bigint,
    mode() within group (order by r.reason),
    min(r.created_at),
    max(r.created_at),
    (array_agg(r.snapshot order by r.created_at desc))[1],
    (array_agg(r.target_owner_id order by r.created_at desc))[1],
    (select p.username from public.profiles p
      where p.id = (array_agg(r.target_owner_id order by r.created_at desc))[1]),
    (array_agg(r.community_id order by r.created_at desc))[1],
    (array_agg(r.session_id order by r.created_at desc))[1]
  from public.reports r
  where r.status = p_status
    and (p_target_type is null or r.target_type = p_target_type)
  group by r.target_type, r.target_id
  having p_before is null or max(r.created_at) < p_before
  order by count(*) desc, max(r.created_at) desc
  limit v_limit;
end;
$$;

-- Everything staff need to judge one target
create or replace function public.admin_get_report_target(p_target_type text, p_target_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_info  record;
  v_owner uuid;
  v_reports jsonb;
  v_snapshot jsonb;
begin
  perform public.assert_platform_role(array['super_admin', 'moderator']);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'reporter_id', r.reporter_id, 'reporter_username', p.username,
           'reason', r.reason, 'details', r.details, 'status', r.status,
           'action_taken', r.action_taken, 'resolution_note', r.resolution_note,
           'created_at', r.created_at, 'resolved_at', r.resolved_at)
         order by r.created_at desc), '[]'::jsonb),
         (array_agg(r.snapshot order by r.created_at desc))[1],
         (array_agg(r.target_owner_id order by r.created_at desc))[1]
    into v_reports, v_snapshot, v_owner
    from public.reports r
    left join public.profiles p on p.id = r.reporter_id
   where r.target_type = p_target_type and r.target_id = p_target_id;

  if jsonb_array_length(v_reports) = 0 then
    raise exception 'NOT_FOUND';
  end if;

  select * into v_info from public._report_target_info(p_target_type, p_target_id);

  return jsonb_build_object(
    'target_type', p_target_type,
    'target_id', p_target_id,
    'reports', v_reports,
    'snapshot', v_snapshot,
    'live', jsonb_build_object(
      'deleted', not coalesce(v_info.is_found, false),
      'content', case when coalesce(v_info.is_found, false) then v_info.content else null end),
    'owner', (
      select jsonb_build_object(
               'id', p.id, 'username', p.username, 'avatar_url', p.avatar_url,
               'deleted', p.deleted_at is not null, 'created_at', p.created_at)
        from public.profiles p where p.id = v_owner),
    'owner_history', (
      select jsonb_build_object(
               'open',      count(*) filter (where r.status = 'open'),
               'actioned',  count(*) filter (where r.status = 'actioned'),
               'dismissed', count(*) filter (where r.status = 'dismissed'))
        from public.reports r where r.target_owner_id = v_owner)
  );
end;
$$;

-- Resolve ALL open reports on a target at once. Returns how many were resolved.
create or replace function public.admin_resolve_reports(
  p_target_type text,
  p_target_id   uuid,
  p_status      text,
  p_action      text default null,
  p_note        text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
  v_action text;
  v_count  int;
begin
  perform public.assert_platform_role(array['super_admin', 'moderator']);
  if p_status is null or p_status not in ('actioned', 'dismissed') then
    raise exception 'INVALID_STATUS';
  end if;
  v_action := case when p_status = 'dismissed' then 'none' else coalesce(p_action, 'other') end;
  if v_action not in ('none', 'content_removed', 'warned', 'other') then
    raise exception 'INVALID_ACTION';
  end if;
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'FIELD_INVALID:note';
  end if;

  update public.reports
     set status = p_status, action_taken = v_action, resolution_note = v_note,
         resolved_by = auth.uid(), resolved_at = now(), updated_at = now()
   where target_type = p_target_type and target_id = p_target_id and status = 'open';
  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'NOT_FOUND';
  end if;

  perform public.log_admin_action(
    'RESOLVE_REPORTS', 'reports', p_target_id, null,
    jsonb_build_object('target_type', p_target_type, 'status', p_status, 'action', v_action, 'count', v_count),
    v_note);
  return v_count;
end;
$$;

-- Delete the reported content (deletable types only) then resolve its open reports.
-- Runs as definer, so it bypasses the 24 h sender-delete window. Returns resolved report count.
create or replace function public.admin_remove_reported_content(
  p_target_type text,
  p_target_id   uuid,
  p_note        text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_info  record;
  v_count int;
begin
  perform public.assert_platform_role(array['super_admin', 'moderator']);

  if p_target_type not in ('session_message', 'community_message', 'community_post',
                           'community_post_comment', 'community_match_comment') then
    raise exception 'NOT_REMOVABLE';
  end if;
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'FIELD_INVALID:note';
  end if;

  -- The reports must exist; the content may already be gone (then we just resolve)
  if not exists (select 1 from public.reports
                  where target_type = p_target_type and target_id = p_target_id and status = 'open') then
    raise exception 'NOT_FOUND';
  end if;

  select * into v_info from public._report_target_info(p_target_type, p_target_id);

  if coalesce(v_info.is_found, false) then
    if p_target_type = 'session_message' then
      delete from public.session_messages where id = p_target_id;
    elsif p_target_type = 'community_message' then
      delete from public.community_messages where id = p_target_id;
    elsif p_target_type = 'community_post' then
      delete from public.community_posts where id = p_target_id;
    elsif p_target_type = 'community_post_comment' then
      delete from public.community_post_comments where id = p_target_id;
    elsif p_target_type = 'community_match_comment' then
      delete from public.community_match_comments where id = p_target_id;
    end if;
    perform public.log_admin_action(
      'REMOVE_REPORTED_CONTENT', 'reports', p_target_id, v_info.content,
      jsonb_build_object('target_type', p_target_type), v_note);
  end if;

  update public.reports
     set status = 'actioned', action_taken = 'content_removed', resolution_note = v_note,
         resolved_by = auth.uid(), resolved_at = now(), updated_at = now()
   where target_type = p_target_type and target_id = p_target_id and status = 'open';
  get diagnostics v_count = row_count;

  perform public.log_admin_action(
    'RESOLVE_REPORTS', 'reports', p_target_id, null,
    jsonb_build_object('target_type', p_target_type, 'status', 'actioned',
                       'action', 'content_removed', 'count', v_count),
    v_note);
  return v_count;
end;
$$;

create or replace function public.admin_report_stats()
returns table (open_count bigint, opened_last_24h bigint, oldest_open timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_platform_role(array['super_admin', 'moderator']);
  return query
  select
    (select count(distinct (r.target_type, r.target_id)) from public.reports r where r.status = 'open'),
    count(*) filter (where r.created_at > now() - interval '24 hours'),
    min(r.created_at)
  from public.reports r
  where r.status = 'open';
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'admin_list_reports(text, text, int, timestamptz)',
    'admin_get_report_target(text, uuid)',
    'admin_resolve_reports(text, uuid, text, text, text)',
    'admin_remove_reported_content(text, uuid, text)',
    'admin_report_stats()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
