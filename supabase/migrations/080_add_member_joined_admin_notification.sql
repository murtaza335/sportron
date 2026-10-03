-- ============================================================================
-- 080: Community Member Join Trigger - Notify Admins (Sport-Specific)
-- ============================================================================
-- When a new member joins a community (INSERT on community_members with
-- approval_status = 'approved'), notify all community admins with
-- sport-specific messaging. Uses the existing _notification_already_exists
-- dedup guard.
-- ============================================================================

create or replace function public.trg_handle_member_joined_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_name text;
  v_community_sport text;
  v_new_member_name text;
  v_admin record;
  v_sport_emoji text;
  v_sport_court text;
  v_sport_players text;
begin
  -- Only fire on INSERT of approved members
  if TG_OP <> 'INSERT' then
    return NEW;
  end if;

  -- Only notify for approved members (not pending join requests)
  if NEW.approval_status <> 'approved' then
    return NEW;
  end if;

  -- Get community name and sport
  select c.name, c.sport into v_community_name, v_community_sport
  from public.communities c where c.id = NEW.community_id;

  -- Get new member username
  select p.username into v_new_member_name
  from public.profiles p where p.id = NEW.profile_id;

  -- Sport-specific terms
  case coalesce(v_community_sport, 'other')
    when 'table_tennis' then
      v_sport_emoji := '🏓'; v_sport_court := 'table'; v_sport_players := 'players';
    when 'badminton' then
      v_sport_emoji := '🏸'; v_sport_court := 'court'; v_sport_players := 'players';
    when 'tennis' then
      v_sport_emoji := '🎾'; v_sport_court := 'court'; v_sport_players := 'players';
    when 'squash' then
      v_sport_emoji := '🎾'; v_sport_court := 'court'; v_sport_players := 'players';
    when 'pickleball' then
      v_sport_emoji := '🏓'; v_sport_court := 'court'; v_sport_players := 'players';
    when 'football' then
      v_sport_emoji := '⚽'; v_sport_court := 'pitch'; v_sport_players := 'players';
    when 'cricket' then
      v_sport_emoji := '🏏'; v_sport_court := 'pitch'; v_sport_players := 'players';
    when 'volleyball' then
      v_sport_emoji := '🏐'; v_sport_court := 'court'; v_sport_players := 'players';
    when 'handball' then
      v_sport_emoji := '🤾'; v_sport_court := 'court'; v_sport_players := 'players';
    when 'basketball' then
      v_sport_emoji := '🏀'; v_sport_court := 'court'; v_sport_players := 'players';
    else
      v_sport_emoji := '🏓'; v_sport_court := 'court'; v_sport_players := 'members';
  end case;

  -- Notify all approved admins except the joining member (in case admin joins)
  for v_admin in
    select cm.profile_id from public.community_members cm
    where cm.community_id = NEW.community_id
      and cm.approval_status = 'approved'
      and cm.role = 'admin'
      and cm.profile_id <> NEW.profile_id
  loop
    if not public._notification_already_exists(
      v_admin.profile_id,
      'member_joined',
      jsonb_build_object('communityId', NEW.community_id, 'memberId', NEW.profile_id)
    ) then
      insert into public.in_app_notifications (user_id, type, title, body, data)
      values (
        v_admin.profile_id,
        'member_joined',
        v_sport_emoji || ' New ' || initcap(v_sport_players) || ' Joined ' || coalesce(v_community_name, 'Your Community'),
        coalesce(v_new_member_name, 'Someone') || ' just joined the ' || v_sport_court || '! Welcome them to the community! ' || v_sport_emoji,
        jsonb_build_object('communityId', NEW.community_id, 'memberId', NEW.profile_id, 'sport', v_community_sport)
      );
    end if;
  end loop;

  return NEW;
end;
$$;

drop trigger if exists trg_handle_member_joined_notifications on public.community_members;
create trigger trg_handle_member_joined_notifications
  after insert on public.community_members
  for each row
  execute function public.trg_handle_member_joined_notifications();