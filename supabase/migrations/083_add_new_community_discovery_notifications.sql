-- ============================================================================
-- 083: New Community Discovery Notifications
-- ============================================================================
-- When a new community is created, send notifications to relevant users:
-- 1. Users who have the community's sport in their sport_interests
-- 2. Users with NO sport_interests specified (empty array) - send to all
-- Excludes: creator, existing members, deleted users
-- Limits to max 500 users per community to avoid spam
-- ============================================================================

create or replace function public.trg_handle_new_community_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_name text;
  v_community_sport text;
  v_community_org text;
  v_community_location text;
  v_creator_name text;
  v_sport_emoji text;
  v_sport_court text;
  v_sport_match text;
  v_target_users uuid[];
  v_user_id uuid;
  v_notif_count int := 0;
  v_max_notifications constant int := 500;
begin
  -- Only fire on INSERT for public communities
  if TG_OP <> 'INSERT' then
    return NEW;
  end if;

  -- Only notify for public communities (restricted ones are invite-only)
  if NEW.visibility <> 'public' then
    return NEW;
  end if;

  -- Get community details
  v_community_name := NEW.name;
  v_community_sport := NEW.sport;
  v_community_org := NEW.organization;
  v_community_location := NEW.location;

  -- Get creator username
  select p.username into v_creator_name
  from public.profiles p where p.id = NEW.created_by;

  -- Sport-specific terms
  case coalesce(v_community_sport, 'other')
    when 'table_tennis' then
      v_sport_emoji := '🏓'; v_sport_court := 'table'; v_sport_match := 'match';
    when 'badminton' then
      v_sport_emoji := '🏸'; v_sport_court := 'court'; v_sport_match := 'match';
    when 'tennis' then
      v_sport_emoji := '🎾'; v_sport_court := 'court'; v_sport_match := 'match';
    when 'squash' then
      v_sport_emoji := '🎾'; v_sport_court := 'court'; v_sport_match := 'match';
    when 'pickleball' then
      v_sport_emoji := '🏓'; v_sport_court := 'court'; v_sport_match := 'match';
    when 'football' then
      v_sport_emoji := '⚽'; v_sport_court := 'pitch'; v_sport_match := 'match';
    when 'cricket' then
      v_sport_emoji := '🏏'; v_sport_court := 'pitch'; v_sport_match := 'match';
    when 'volleyball' then
      v_sport_emoji := '🏐'; v_sport_court := 'court'; v_sport_match := 'match';
    when 'handball' then
      v_sport_emoji := '🤾'; v_sport_court := 'court'; v_sport_match := 'match';
    when 'basketball' then
      v_sport_emoji := '🏀'; v_sport_court := 'court'; v_sport_match := 'match';
    else
      v_sport_emoji := '🏓'; v_sport_court := 'court'; v_sport_match := 'game';
  end case;

  -- Find target users:
  -- 1. Users with matching sport_interests
  -- 2. OR users with NO sport_interests (empty array) - broad discovery
  -- Exclude: creator, existing members, deleted users
  -- Limit to 500 users
  select array_agg(p.id) into v_target_users
  from public.profiles p
  where p.deleted_at is null
    and p.id <> NEW.created_by
    and not exists (
      select 1 from public.community_members cm
      where cm.community_id = NEW.id and cm.profile_id = p.id
    )
    and (
      -- Match by sport interest
      v_community_sport = any(p.sport_interests)
      -- OR no interests specified (broadcast to everyone)
      or p.sport_interests = '{}'
    )
  limit v_max_notifications;

  -- Send notifications to each target user
  if v_target_users is not null then
    foreach v_user_id in array v_target_users
    loop
      if not public._notification_already_exists(
        v_user_id,
        'new_community',
        jsonb_build_object('communityId', NEW.id)
      ) then
        insert into public.in_app_notifications (user_id, type, title, body, data)
        values (
          v_user_id,
          'new_community',
          v_sport_emoji || ' New ' || initcap(v_community_sport) || ' Community: ' || v_community_name,
          'A new ' || v_community_sport || ' community "' || v_community_name || '" was created' ||
            case when v_community_location is not null then ' in ' || v_community_location else '' end ||
            case when v_community_org is not null then ' for ' || v_community_org else '' end ||
            '. Join now and start playing! ' || v_sport_emoji,
          jsonb_build_object(
            'communityId', NEW.id,
            'sport', v_community_sport,
            'location', v_community_location,
            'organization', v_community_org
          )
        );
        v_notif_count := v_notif_count + 1;
      end if;
    end loop;
  end if;

  raise notice 'New community notifications sent: % for community %', v_notif_count, NEW.id;

  return NEW;
end;
$$;

drop trigger if exists trg_handle_new_community_notifications on public.communities;
create trigger trg_handle_new_community_notifications
  after insert on public.communities
  for each row
  execute function public.trg_handle_new_community_notifications();