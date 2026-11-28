-- 142_organization_member_rpcs.sql
-- Organizations Phase 1, step B4 (docs/organizations/PLAN.md §5.5, §5.7, §7.1): what the app needs —
-- "my work", organizers, the organization's tournament list, activity history and notifications.
-- ADDITIVE ONLY apart from widening the notification type constraint.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Guard: an active member (optionally an admin); suspended members get ORG_SUSPENDED
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public._assert_org_role(p_org uuid, p_admin_only boolean default false)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'NOT_ALLOWED';
  end if;
  select m.role, o.status into v_role, v_status
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.organization_id = p_org and m.profile_id = auth.uid() and m.removed_at is null;
  if v_role is null or (p_admin_only and v_role <> 'admin') then
    raise exception 'NOT_ALLOWED';
  end if;
  if v_status <> 'active' then
    raise exception 'ORG_SUSPENDED';
  end if;
  return v_role;
end;
$$;
revoke all on function public._assert_org_role(uuid, boolean) from public, anon, authenticated;

-- History lines older than a year are dropped as new ones arrive.
create or replace function public._org_log(p_org uuid, p_action text, p_tournament uuid, p_summary text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_org is null then
    return;
  end if;
  insert into public.organization_activity (organization_id, actor_id, action, tournament_id, summary)
  values (p_org, auth.uid(), p_action, p_tournament, left(p_summary, 200));
  delete from public.organization_activity
   where organization_id = p_org and created_at < now() - interval '365 days';
exception when others then
  null;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Organizers
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.org_list_members(p_org uuid)
returns table (profile_id uuid, username text, avatar_url text, role text, added_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public._assert_org_role(p_org);
  return query
  select p.id, p.username, p.avatar_url, m.role, m.added_at
  from public.organization_members m
  join public.public_profiles p on p.id = m.profile_id
  where m.organization_id = p_org and m.removed_at is null and p.deleted_at is null
  order by (m.role = 'admin') desc, lower(p.username);
end;
$$;

create or replace function public.org_add_organizer(p_org uuid, p_profile uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  perform public._assert_org_role(p_org, true);
  select p.username into v_username from public.public_profiles p
   where p.id = p_profile and p.deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  -- already a member (organizer or admin): nothing to do, never a downgrade
  if exists (select 1 from public.organization_members
              where organization_id = p_org and profile_id = p_profile and removed_at is null) then
    return;
  end if;
  insert into public.organization_members (organization_id, profile_id, role, added_by)
  values (p_org, p_profile, 'organizer', auth.uid());
  perform public._org_log(p_org, 'member_added', null,
                          'added @' || coalesce(v_username, '?') || ' as an organizer');
end;
$$;

-- Organization admins remove organizers. Admins are managed by platform staff.
create or replace function public.org_remove_member(p_org uuid, p_profile uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  perform public._assert_org_role(p_org, true);
  if p_profile = auth.uid() then
    raise exception 'CANNOT_REMOVE_SELF';
  end if;
  select role into v_role from public.organization_members
   where organization_id = p_org and profile_id = p_profile and removed_at is null;
  if v_role is null then
    raise exception 'NOT_FOUND';
  end if;
  if v_role = 'admin' then
    raise exception 'NOT_ALLOWED';
  end if;
  perform public._org_remove_member(p_org, p_profile);
  perform public._org_log(p_org, 'member_removed', null, 'removed @' ||
    coalesce((select username from public.public_profiles where id = p_profile), '?') || ' from the organizers');
end;
$$;

create or replace function public.org_get_activity(p_org uuid, p_before bigint default null, p_limit int default 50)
returns table (id bigint, actor text, summary text, tournament_id uuid, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  perform public._assert_org_role(p_org, true);
  return query
  select a.id,
         case
           when a.actor_id is not null and public.platform_role(a.actor_id) is not null
                and not exists (select 1 from public.organization_members m
                                 where m.organization_id = p_org and m.profile_id = a.actor_id) then 'Sportron'
           else coalesce('@' || p.username, 'Someone')
         end,
         a.summary, a.tournament_id, a.created_at
  from public.organization_activity a
  left join public.public_profiles p on p.id = a.actor_id
  where a.organization_id = p_org and (p_before is null or a.id < p_before)
  order by a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. The organization's tournaments the caller manages (admins: all; organizers: theirs)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.org_list_tournaments(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public._assert_org_role(p_org);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', t.id, 'name', t.name, 'status', t.status, 'hidden', t.hidden_at is not null,
             'starts_at', t.starts_at, 'ends_at', t.ends_at, 'image_url', t.image_url,
             'module_count', (select count(*) from public.tournament_modules m where m.tournament_id = t.id),
             'entry_count', (select count(*) from public.tournament_entries e
                              where e.tournament_id = t.id and e.status = 'active'),
             'created_by_username', (select p.username from public.public_profiles p where p.id = t.created_by))
           order by (t.status in ('completed','cancelled')), t.starts_at asc nulls last, t.created_at desc)
    from public.tournaments t
    where t.organization_id = p_org
      and (v_role = 'admin' or exists (select 1 from public.tournament_admins ta
                                        where ta.tournament_id = t.id and ta.profile_id = auth.uid()))
  ), '[]'::jsonb);
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. "My work": everything the Tournaments-tab cards need, in one cheap call
-- ───────────────────────────────────────────────────────────────────────────
-- p_day_start = the device's local midnight, so "today" means the user's today.
create or replace function public.get_my_work(p_day_start timestamptz default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_from timestamptz := coalesce(p_day_start, date_trunc('day', now()));
  v_orgs jsonb;
  v_sports jsonb;
begin
  if v_uid is null then
    raise exception 'NOT_ALLOWED';
  end if;
  begin
    perform public._usage_track('my_work', null);
  exception when undefined_function then
    null;
  end;

  -- suspended organizations are listed (the app explains why nothing works)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'name', o.name, 'short_name', o.short_name, 'role', m.role,
           'suspended', o.status = 'suspended',
           'tournament_count', (select count(*) from public.tournaments t
              where t.organization_id = o.id and t.status in ('draft', 'published')
                and (m.role = 'admin' or exists (select 1 from public.tournament_admins ta
                      where ta.tournament_id = t.id and ta.profile_id = v_uid)))
         ) order by lower(o.name)), '[]'::jsonb)
    into v_orgs
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.profile_id = v_uid and m.removed_at is null;

  -- sports I was made manager of, in tournaments that are not over
  select coalesce(jsonb_agg(x.j order by x.starts nulls last, x.name), '[]'::jsonb)
    into v_sports
  from (
    select t.starts_at as starts, m.name,
           jsonb_build_object(
             'tournament_id', t.id, 'tournament_name', t.name, 'tournament_status', t.status,
             'module_id', m.id, 'module_name', m.name, 'sport', m.sport,
             'custom_sport_name', m.custom_sport_name, 'status', m.status,
             'entry_count', (select count(*) from public.tournament_entries e
                              where e.module_id = m.id and e.status = 'active'),
             'scorer_count', (select count(*) from public.tournament_module_scorers s where s.module_id = m.id),
             'has_draw', m.bracket_generated_at is not null,
             'today', coalesce((
                select jsonb_agg(jsonb_build_object(
                         'match_id', tm.id, 'a_name', ea.name, 'b_name', eb.name,
                         'scheduled_at', tm.scheduled_at, 'court', tm.court, 'status', tm.status)
                       order by tm.scheduled_at)
                from public.tournament_matches tm
                left join public.tournament_entries ea on ea.id = tm.entry_a_id
                left join public.tournament_entries eb on eb.id = tm.entry_b_id
                where tm.module_id = m.id and tm.scheduled_at >= v_from
                  and tm.scheduled_at < v_from + interval '1 day'
                  and tm.status not in ('bye', 'cancelled')), '[]'::jsonb)
           ) as j
    from public.tournament_module_admins a
    join public.tournament_modules m on m.id = a.module_id
    join public.tournaments t on t.id = m.tournament_id
    where a.profile_id = v_uid
      and t.status in ('draft', 'published') and m.status not in ('completed', 'cancelled')
    limit 50
  ) x;

  return jsonb_build_object('orgs', v_orgs, 'sports', v_sports);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'org_list_members(uuid)',
    'org_add_organizer(uuid, uuid)',
    'org_remove_member(uuid, uuid)',
    'org_get_activity(uuid, bigint, integer)',
    'org_list_tournaments(uuid)',
    'get_my_work(timestamptz)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Activity history for organization tournaments (written by triggers, so no path is missed)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public._org_activity_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(OLD) end;
  v_t public.tournaments;
  v_m text;
  v_user text;
begin
  if auth.uid() is null then
    return null;
  end if;

  if tg_table_name = 'tournaments' then
    if (v_row ->> 'organization_id') is null then
      return null;
    end if;
    if tg_op = 'INSERT' then
      perform public._org_log((v_row ->> 'organization_id')::uuid, 'tournament_created',
                              (v_row ->> 'id')::uuid, 'created “' || (v_row ->> 'name') || '”');
    elsif tg_op = 'DELETE' then
      perform public._org_log((v_row ->> 'organization_id')::uuid, 'tournament_deleted', null,
                              'deleted “' || (v_row ->> 'name') || '”');
    else
      if v_row ->> 'status' is distinct from v_old ->> 'status' then
        perform public._org_log((v_row ->> 'organization_id')::uuid, 'tournament_status', (v_row ->> 'id')::uuid,
          case v_row ->> 'status'
            when 'published' then 'published “' when 'cancelled' then 'cancelled “'
            when 'completed' then 'marked completed: “' else 'moved back to draft: “'
          end || (v_row ->> 'name') || '”');
      end if;
      if (v_row ->> 'hidden_at' is null) is distinct from (v_old ->> 'hidden_at' is null) then
        perform public._org_log((v_row ->> 'organization_id')::uuid, 'tournament_hidden', (v_row ->> 'id')::uuid,
          case when v_row ->> 'hidden_at' is null then 'showed “' else 'hid “' end || (v_row ->> 'name') || '”');
      end if;
    end if;
    return null;
  end if;

  if tg_table_name in ('tournament_admins', 'tournament_modules') then
    select * into v_t from public.tournaments where id = (v_row ->> 'tournament_id')::uuid;
  else
    select t.* into v_t from public.tournament_modules m join public.tournaments t on t.id = m.tournament_id
     where m.id = (v_row ->> 'module_id')::uuid;
    select name into v_m from public.tournament_modules where id = (v_row ->> 'module_id')::uuid;
  end if;
  if v_t.id is null or v_t.organization_id is null then
    return null;           -- not an organization tournament, or its parent is being deleted
  end if;

  if tg_table_name = 'tournament_modules' then
    perform public._org_log(v_t.organization_id, 'sport_' || lower(tg_op), v_t.id,
      case when tg_op = 'INSERT' then 'added the sport “' else 'removed the sport “' end
      || (v_row ->> 'name') || '” ' || case when tg_op = 'INSERT' then 'to “' else 'from “' end || v_t.name || '”');
    return null;
  end if;

  -- people: creating your own tournament is already covered by "created"
  if tg_op = 'INSERT' and (v_row ->> 'profile_id')::uuid = auth.uid() then
    return null;
  end if;
  select coalesce(username, '?') into v_user from public.public_profiles where id = (v_row ->> 'profile_id')::uuid;
  perform public._org_log(v_t.organization_id, 'role_' || lower(tg_op), v_t.id,
    case when tg_op = 'INSERT' then 'added ' else 'removed ' end
    || case tg_table_name
         when 'tournament_admins' then 'co-organizer'
         when 'tournament_module_admins' then 'sport manager'
         else 'scorer'
       end
    || ' @' || coalesce(v_user, '?') || case when tg_op = 'INSERT' then ' to ' else ' from ' end
    || coalesce('“' || v_m || '” in ', '') || '“' || v_t.name || '”');
  return null;
end;
$$;
revoke all on function public._org_activity_trigger() from public, anon, authenticated;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('tournaments', 'insert or update or delete'),
      ('tournament_modules', 'insert or delete'),
      ('tournament_admins', 'insert or delete'),
      ('tournament_module_admins', 'insert or delete'),
      ('tournament_module_scorers', 'insert or delete')
    ) as x(tbl, ops)
  loop
    execute format('drop trigger if exists trg_org_activity on public.%I', r.tbl);
    execute format('create trigger trg_org_activity after %s on public.%I for each row '
                   'execute function public._org_activity_trigger()', r.ops, r.tbl);
  end loop;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Notification: "you are now an organizer / admin"
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.in_app_notifications
  DROP CONSTRAINT IF EXISTS in_app_notifications_type_check;

ALTER TABLE public.in_app_notifications
  ADD CONSTRAINT in_app_notifications_type_check
  CHECK (type IN (
    'match_pending', 'match_approved', 'match_rejected', 'match_liked', 'match_commented',
    'session_application', 'session_accepted', 'session_rejected', 'session_left',
    'session_reminder', 'feedback_prompt', 'ping', 'join_request', 'join_approved',
    'join_rejected', 'match_approval_request', 'match_approved_community', 'match_disputed',
    'member_removed', 'admin_transferred', 'admin_promoted', 'community_match_pending',
    'community_match_approved', 'community_match_disputed', 'community_invite',
    'community_invite_accepted', 'community_invite_rejected', 'session_chat_message',
    'session_chat_reply', 'community_chat_message', 'community_chat_reply',
    'streak_reminder', 'streak_at_risk', 'streak_milestone', 'community_post_created',
    'community_post_liked', 'community_post_commented', 'member_joined',
    'community_engagement', 'new_community', 'tournament_admin_assigned',
    'tournament_module_admin_assigned', 'tournament_entry_added', 'tournament_match_scheduled',
    'tournament_match_result', 'tournament_module_completed',
    'admin_broadcast', 'tournament_scorer_assigned', 'organization_role_assigned'
  ));

create or replace function public.trg_organization_role_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if NEW.removed_at is not null or NEW.profile_id = auth.uid()
     or (tg_op = 'UPDATE' and NEW.role = OLD.role) then
    return NEW;
  end if;
  select name into v_name from public.organizations where id = NEW.organization_id;
  perform public._tournament_notify(
    NEW.profile_id,
    'organization_role_assigned',
    case when NEW.role = 'admin' then 'You''re an organization admin' else 'You''re an organizer' end,
    case when NEW.role = 'admin' then 'You now manage ' else 'You can now organize tournaments for ' end
      || coalesce(v_name, 'an organization') || '.',
    jsonb_build_object('organizationId', NEW.organization_id, 'role', NEW.role)
  );
  return NEW;
end;
$$;
revoke all on function public.trg_organization_role_assigned() from public, anon, authenticated;

drop trigger if exists trg_organization_role_assigned on public.organization_members;
create trigger trg_organization_role_assigned
  after insert or update on public.organization_members
  for each row execute function public.trg_organization_role_assigned();
