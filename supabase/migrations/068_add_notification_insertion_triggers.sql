-- ============================================================
-- 068: Server-side notification creation triggers
-- ============================================================
-- Moves ALL in-app notification INSERT logic from the client into
-- Postgres triggers. Every relevant DB event (INSERT/UPDATE/DELETE)
-- on commitments, community_join_requests, pings, community_matches,
-- community_match_likes, community_match_comments, community_members,
-- community_invites, and profiles now automatically creates the
-- corresponding in_app_notifications row.
--
-- Backward compatibility:
--   - The insert_notification RPC gets a dedup guard so old client
--     builds that still call it won't create duplicates (the trigger
--     already inserted the row during the DB event).
--   - Old client resolution calls (UPDATE in_app_notifications) are
--     idempotent — the trigger may have already done the same UPDATE.
--
-- FCM push is unchanged: the existing trg_fcm_push on in_app_notifications
-- fires pg_net → send-notification edge function after each INSERT.


-- ============================================================================
-- HELPER: dedup guard
-- ============================================================================

create or replace function public._notification_already_exists(
  p_user_id uuid,
  p_type text,
  p_data jsonb,
  p_window_seconds int default 10
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.in_app_notifications
    where user_id = p_user_id
      and type = p_type
      and data is not distinct from p_data
      and created_at > now() - (p_window_seconds || ' seconds')::interval
  );
end;
$$;


-- ============================================================================
-- HELPER: session display name (mirrors formatSessionDisplayName on client)
-- ============================================================================

create or replace function public._session_display_name(
  p_title text,
  p_purpose text
)
returns text
language sql
immutable
as $$
  select coalesce(p_title, coalesce(p_purpose, 'session') || ' session')
$$;


-- ============================================================================
-- 1. COMMITMENTS — session_application / session_accepted / session_rejected / session_left
-- ============================================================================

create or replace function public.trg_handle_commitment_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_creator uuid;
  v_session_name text;
  v_applicant_name text;
  v_actor_name text;
begin
  -- Fetch session details
  select created_by, public._session_display_name(title, purpose)
    into v_session_creator, v_session_name
  from public.sessions
  where id = NEW.session_id;

  if v_session_creator is null then
    return NEW;
  end if;

  -- ─── INSERT: new application (status = pending) ───
  if TG_OP = 'INSERT' and NEW.status = 'pending' then
    -- Don't notify the session creator if they applied to their own session
    if v_session_creator = NEW.user_id then
      return NEW;
    end if;

    select username into v_applicant_name
    from public.profiles where id = NEW.user_id;

    if not public._notification_already_exists(
      v_session_creator,
      'session_application',
      jsonb_build_object('sessionId', NEW.session_id, 'applicantId', NEW.user_id)
    ) then
      insert into public.in_app_notifications (user_id, type, title, body, data)
      values (
        v_session_creator,
        'session_application',
        'New Session Application',
        coalesce(v_applicant_name, 'Someone') || ' applied to join ' || v_session_name,
        jsonb_build_object('sessionId', NEW.session_id, 'applicantId', NEW.user_id)
      );
    end if;

    return NEW;
  end if;

  -- ─── UPDATE: status changed ───
  if TG_OP = 'UPDATE' and OLD.status is distinct from NEW.status then

    -- accepted → resolve creator's pending notification + notify applicant
    if NEW.status = 'accepted' then
      update public.in_app_notifications
      set type = 'session_accepted', read = true
      where type = 'session_application'
        and user_id = v_session_creator
        and (data->>'sessionId') = NEW.session_id::text
        and (data->>'applicantId') = NEW.user_id::text
        and read = false;

      select username into v_actor_name
      from public.profiles where id = v_session_creator;

      if not public._notification_already_exists(
        NEW.user_id,
        'session_accepted',
        jsonb_build_object('sessionId', NEW.session_id)
      ) then
        insert into public.in_app_notifications (user_id, type, title, body, data)
        values (
          NEW.user_id,
          'session_accepted',
          'Session Application Accepted',
          coalesce(v_actor_name, 'Session host') || ' accepted you into ' || v_session_name,
          jsonb_build_object('sessionId', NEW.session_id)
        );
      end if;

    -- rejected → resolve creator's pending notification + notify applicant
    elsif NEW.status = 'rejected' then
      update public.in_app_notifications
      set type = 'session_rejected', read = true
      where type = 'session_application'
        and user_id = v_session_creator
        and (data->>'sessionId') = NEW.session_id::text
        and (data->>'applicantId') = NEW.user_id::text
        and read = false;

      select username into v_actor_name
      from public.profiles where id = v_session_creator;

      if not public._notification_already_exists(
        NEW.user_id,
        'session_rejected',
        jsonb_build_object('sessionId', NEW.session_id)
      ) then
        insert into public.in_app_notifications (user_id, type, title, body, data)
        values (
          NEW.user_id,
          'session_rejected',
          'Session Application Declined',
          coalesce(v_actor_name, 'Session host') || ' declined your request for ' || v_session_name,
          jsonb_build_object('sessionId', NEW.session_id)
        );
      end if;

    -- left → notify session creator
    elsif NEW.status = 'left' then
      select username into v_applicant_name
      from public.profiles where id = NEW.user_id;

      if not public._notification_already_exists(
        v_session_creator,
        'session_left',
        jsonb_build_object('sessionId', NEW.session_id)
      ) then
        insert into public.in_app_notifications (user_id, type, title, body, data)
        values (
          v_session_creator,
          'session_left',
          'Participant Left',
          coalesce(v_applicant_name, 'Someone') || ' left ' || v_session_name,
          jsonb_build_object('sessionId', NEW.session_id)
        );
      end if;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_handle_commitment_notifications on public.commitments;
create trigger trg_handle_commitment_notifications
  after insert or update on public.commitments
  for each row
  execute function public.trg_handle_commitment_notifications();


-- ============================================================================
-- 2. COMMUNITY_JOIN_REQUESTS — join_request (fan-out) / join_approved / join_rejected
--    Replaces 052's trg_resolve_join_request_notification (resolution only).
--    This trigger does BOTH resolution AND new notification insertion.
-- ============================================================================

drop trigger if exists trg_resolve_join_request_notification on public.community_join_requests;

create or replace function public.trg_handle_join_request_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_name text;
  v_requester_name text;
  v_new_type text;
begin
  -- ─── INSERT: new join request → fan-out to all admins ───
  if TG_OP = 'INSERT' then
    select name into v_community_name
    from public.communities where id = NEW.community_id;

    select username into v_requester_name
    from public.profiles where id = NEW.user_id;

    insert into public.in_app_notifications (user_id, type, title, body, data)
    select
      cm.profile_id,
      'join_request',
      'New Join Request',
      coalesce(v_requester_name, 'Someone') || ' requested to join ' || coalesce(v_community_name, 'your community'),
      jsonb_build_object('communityId', NEW.community_id, 'requesterId', NEW.user_id)
    from public.community_members cm
    where cm.community_id = NEW.community_id
      and cm.role = 'admin'
      and cm.approval_status = 'approved'
      and cm.profile_id != NEW.user_id  -- don't notify self
      and not public._notification_already_exists(
            cm.profile_id,
            'join_request',
            jsonb_build_object('communityId', NEW.community_id, 'requesterId', NEW.user_id)
          );

    return NEW;
  end if;

  -- ─── UPDATE: status changed from pending → resolved ───
  if TG_OP = 'UPDATE' and OLD.status = 'pending' and NEW.status in ('approved', 'rejected') then
    v_new_type := case when NEW.status = 'approved' then 'join_approved' else 'join_rejected' end;

    -- Resolve all pending join_request notifications for this request
    update public.in_app_notifications
    set type = v_new_type, read = true
    where type = 'join_request'
      and (data->>'communityId') = NEW.community_id::text
      and (data->>'requesterId') = NEW.user_id::text
      and read = false;

    -- Notify the requester with a new notification
    select name into v_community_name
    from public.communities where id = NEW.community_id;

    if not public._notification_already_exists(
      NEW.user_id,
      v_new_type,
      jsonb_build_object('communityId', NEW.community_id)
    ) then
      insert into public.in_app_notifications (user_id, type, title, body, data)
      values (
        NEW.user_id,
        v_new_type,
        case when NEW.status = 'approved' then 'Join Request Approved' else 'Join Request Declined' end,
        case when NEW.status = 'approved'
          then 'You were accepted into ' || coalesce(v_community_name, 'the community')
          else 'Your request to join ' || coalesce(v_community_name, 'the community') || ' was declined'
        end,
        jsonb_build_object('communityId', NEW.community_id)
      );
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_handle_join_request_notifications on public.community_join_requests;
create trigger trg_handle_join_request_notifications
  after insert or update on public.community_join_requests
  for each row
  execute function public.trg_handle_join_request_notifications();


-- ============================================================================
-- 3. PINGS — ping (fan-out to all members except sender)
-- ============================================================================

create or replace function public.trg_handle_ping_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_name text;
  v_sender_name text;
begin
  select name into v_community_name
  from public.communities where id = NEW.community_id;

  select username into v_sender_name
  from public.profiles where id = NEW.sender_id;

  insert into public.in_app_notifications (user_id, type, title, body, data)
  select
    cm.profile_id,
    'ping',
    'Ping from ' || coalesce(v_community_name, 'a community'),
    coalesce(v_sender_name, 'Someone') || ': ' || coalesce(NEW.message, ''),
    jsonb_build_object('communityId', NEW.community_id, 'senderName', coalesce(v_sender_name, 'Someone'), 'message', coalesce(NEW.message, ''))
  from public.community_members cm
  where cm.community_id = NEW.community_id
    and cm.approval_status = 'approved'
    and cm.profile_id != NEW.sender_id
    and not public._notification_already_exists(
          cm.profile_id,
          'ping',
          jsonb_build_object('communityId', NEW.community_id, 'senderName', coalesce(v_sender_name, 'Someone'), 'message', coalesce(NEW.message, ''))
        );

  return NEW;
end;
$$;

drop trigger if exists trg_handle_ping_notifications on public.pings;
create trigger trg_handle_ping_notifications
  after insert on public.pings
  for each row
  execute function public.trg_handle_ping_notifications();


-- ============================================================================
-- 4. COMMUNITY_MATCHES — community_match_pending / approved / disputed
-- ============================================================================

create or replace function public.trg_handle_community_match_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_name text;
  v_recorder_name text;
  v_actor_name text;
  v_opponent_id uuid;
begin
  -- ─── INSERT: new match → notify opponent (skip self) ───
  if TG_OP = 'INSERT' then
    -- Determine opponent: for singles use opponent_id, for doubles use opponent_id + opponent_partner_id
    -- We only send to opponent_id (the captain), not the partner
    v_opponent_id := NEW.opponent_id;

    if v_opponent_id is not null and v_opponent_id != NEW.recorded_by then
      select name into v_community_name
      from public.communities where id = NEW.community_id;

      select username into v_recorder_name
      from public.profiles where id = NEW.recorded_by;

      if not public._notification_already_exists(
        v_opponent_id,
        'community_match_pending',
        jsonb_build_object('matchId', NEW.id, 'communityId', NEW.community_id)
      ) then
        insert into public.in_app_notifications (user_id, type, title, body, data)
        values (
          v_opponent_id,
          'community_match_pending',
          'Match Pending Approval',
          coalesce(v_recorder_name, 'Someone') || ' recorded a match in ' || coalesce(v_community_name, 'your community') || ' for your approval',
          jsonb_build_object('matchId', NEW.id, 'communityId', NEW.community_id)
        );
      end if;
    end if;

    return NEW;
  end if;

  -- ─── UPDATE: approval status changed ───
  if TG_OP = 'UPDATE' and OLD.approval_status is distinct from NEW.approval_status
     and NEW.approval_status in ('approved', 'disputed') then

    -- Resolve the opponent's pending notification
    update public.in_app_notifications
    set type = case when NEW.approval_status = 'approved' then 'community_match_approved' else 'community_match_disputed' end,
        read = true
    where type = 'community_match_pending'
      and (data->>'matchId') = NEW.id::text
      and read = false;

    -- Notify the recorder (skip if recorder is the actor — i.e., self-approval is rare but handle it)
    if NEW.recorded_by is not null then
      select name into v_community_name
      from public.communities where id = NEW.community_id;

      -- Fetch the actor's name (whoever updated the status)
      -- We use recorded_by's perspective: the notification goes TO the recorder
      -- The actor could be the opponent or an admin
      if not public._notification_already_exists(
        NEW.recorded_by,
        case when NEW.approval_status = 'approved' then 'community_match_approved' else 'community_match_disputed' end,
        jsonb_build_object('matchId', NEW.id, 'communityId', NEW.community_id)
      ) then
        insert into public.in_app_notifications (user_id, type, title, body, data)
        values (
          NEW.recorded_by,
          case when NEW.approval_status = 'approved' then 'community_match_approved' else 'community_match_disputed' end,
          case when NEW.approval_status = 'approved' then 'Match Approved' else 'Match Disputed' end,
          case when NEW.approval_status = 'approved'
            then 'The match in ' || coalesce(v_community_name, 'your community') || ' was approved'
            else 'The match in ' || coalesce(v_community_name, 'your community') || ' was disputed'
          end,
          jsonb_build_object('matchId', NEW.id, 'communityId', NEW.community_id)
        );
      end if;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_handle_community_match_notifications on public.community_matches;
create trigger trg_handle_community_match_notifications
  after insert or update on public.community_matches
  for each row
  execute function public.trg_handle_community_match_notifications();


-- ============================================================================
-- 5. COMMUNITY_MATCH_LIKES — match_liked (skip self)
-- ============================================================================

create or replace function public.trg_handle_match_like_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_owner uuid;
  v_community_id uuid;
  v_liker_name text;
begin
  select recorded_by, community_id into v_match_owner, v_community_id
  from public.community_matches where id = NEW.community_match_id;

  -- Skip self-notification
  if v_match_owner is null or v_match_owner = NEW.profile_id then
    return NEW;
  end if;

  select username into v_liker_name
  from public.profiles where id = NEW.profile_id;

  if not public._notification_already_exists(
    v_match_owner,
    'match_liked',
    jsonb_build_object('matchId', NEW.community_match_id, 'communityId', v_community_id)
  ) then
    insert into public.in_app_notifications (user_id, type, title, body, data)
    values (
      v_match_owner,
      'match_liked',
      'New Like on Your Match',
      coalesce(v_liker_name, 'Someone') || ' liked your match',
      jsonb_build_object('matchId', NEW.community_match_id, 'communityId', v_community_id)
    );
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_handle_match_like_notifications on public.community_match_likes;
create trigger trg_handle_match_like_notifications
  after insert on public.community_match_likes
  for each row
  execute function public.trg_handle_match_like_notifications();


-- ============================================================================
-- 6. COMMUNITY_MATCH_COMMENTS — match_commented (skip self)
-- ============================================================================

create or replace function public.trg_handle_match_comment_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_owner uuid;
  v_community_id uuid;
  v_commenter_name text;
begin
  select recorded_by, community_id into v_match_owner, v_community_id
  from public.community_matches where id = NEW.community_match_id;

  -- Skip self-notification
  if v_match_owner is null or v_match_owner = NEW.profile_id then
    return NEW;
  end if;

  select username into v_commenter_name
  from public.profiles where id = NEW.profile_id;

  if not public._notification_already_exists(
    v_match_owner,
    'match_commented',
    jsonb_build_object('matchId', NEW.community_match_id, 'communityId', v_community_id, 'commentId', NEW.id)
  ) then
    insert into public.in_app_notifications (user_id, type, title, body, data)
    values (
      v_match_owner,
      'match_commented',
      'New Comment on Your Match',
      coalesce(v_commenter_name, 'Someone') || ' commented on your match',
      jsonb_build_object('matchId', NEW.community_match_id, 'communityId', v_community_id, 'commentId', NEW.id)
    );
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_handle_match_comment_notifications on public.community_match_comments;
create trigger trg_handle_match_comment_notifications
  after insert on public.community_match_comments
  for each row
  execute function public.trg_handle_match_comment_notifications();


-- ============================================================================
-- 7. COMMUNITY_MEMBERS — member_removed / admin_promoted / admin_transferred
-- ============================================================================

create or replace function public.trg_handle_community_member_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_name text;
  v_actor_name text;
begin
  select name into v_community_name
  from public.communities where id = (case when TG_OP = 'DELETE' then OLD.community_id else NEW.community_id end);

  -- ─── DELETE: member removed ───
  if TG_OP = 'DELETE' then
    if not public._notification_already_exists(
      OLD.profile_id,
      'member_removed',
      jsonb_build_object('communityId', OLD.community_id)
    ) then
      insert into public.in_app_notifications (user_id, type, title, body, data)
      values (
        OLD.profile_id,
        'member_removed',
        'Removed from Community',
        'You were removed from ' || coalesce(v_community_name, 'the community'),
        jsonb_build_object('communityId', OLD.community_id)
      );
    end if;

    return OLD;
  end if;

  -- ─── UPDATE: role changes ───
  if TG_OP = 'UPDATE' and OLD.role is distinct from NEW.role then

    -- member → admin: promotion
    if OLD.role = 'member' and NEW.role = 'admin' then
      if not public._notification_already_exists(
        NEW.profile_id,
        'admin_promoted',
        jsonb_build_object('communityId', NEW.community_id)
      ) then
        insert into public.in_app_notifications (user_id, type, title, body, data)
        values (
          NEW.profile_id,
          'admin_promoted',
          'Promoted to Admin',
          'You were promoted to admin in ' || coalesce(v_community_name, 'the community'),
          jsonb_build_object('communityId', NEW.community_id)
        );
      end if;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_handle_community_member_notifications on public.community_members;
create trigger trg_handle_community_member_notifications
  after insert or update or delete on public.community_members
  for each row
  execute function public.trg_handle_community_member_notifications();


-- ============================================================================
-- 8. COMMUNITY_INVITES — community_invite / community_invite_accepted / community_invite_rejected
--    Replaces 052's trg_resolve_community_invite_notification.
--    This trigger does BOTH resolution AND new notification insertion.
-- ============================================================================

drop trigger if exists trg_resolve_community_invite_notification on public.community_invites;

create or replace function public.trg_handle_community_invite_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_name text;
  v_inviter_name text;
  v_invitee_name text;
  v_new_type text;
begin
  -- ─── INSERT: new invite → notify invitee ───
  if TG_OP = 'INSERT' then
    select name into v_community_name
    from public.communities where id = NEW.community_id;

    select username into v_inviter_name
    from public.profiles where id = NEW.invited_by;

    if not public._notification_already_exists(
      NEW.invitee_id,
      'community_invite',
      jsonb_build_object('communityId', NEW.community_id, 'inviteId', NEW.id)
    ) then
      insert into public.in_app_notifications (user_id, type, title, body, data)
      values (
        NEW.invitee_id,
        'community_invite',
        'Community Invitation',
        coalesce(v_inviter_name, 'An admin') || ' invited you to join ' || coalesce(v_community_name, 'a community'),
        jsonb_build_object('communityId', NEW.community_id, 'inviteId', NEW.id)
      );
    end if;

    return NEW;
  end if;

  -- ─── UPDATE: status changed from pending → accepted/rejected ───
  if TG_OP = 'UPDATE' and OLD.status = 'pending' and NEW.status in ('accepted', 'rejected') then
    v_new_type := case when NEW.status = 'accepted' then 'community_invite_accepted' else 'community_invite_rejected' end;

    -- Mark the invitee's community_invite notification as read (don't change
    -- its type — the invitee's notification should remain 'community_invite',
    -- just no longer actionable. The 'community_invite_accepted'/'rejected'
    -- type belongs on the NEW notification going to the inviter.)
    update public.in_app_notifications
    set read = true
    where type = 'community_invite'
      and (data->>'inviteId') = NEW.id::text
      and read = false;

    -- Notify the inviter with a new notification
    select name into v_community_name
    from public.communities where id = NEW.community_id;

    select username into v_invitee_name
    from public.profiles where id = NEW.invitee_id;

    if not public._notification_already_exists(
      NEW.invited_by,
      v_new_type,
      jsonb_build_object('communityId', NEW.community_id)
    ) then
      insert into public.in_app_notifications (user_id, type, title, body, data)
      values (
        NEW.invited_by,
        v_new_type,
        case when NEW.status = 'accepted' then 'Invitation Accepted' else 'Invitation Declined' end,
        coalesce(v_invitee_name, 'Someone') || ' ' || case when NEW.status = 'accepted' then 'accepted' else 'declined' end || ' your invitation to ' || coalesce(v_community_name, 'the community'),
        jsonb_build_object('communityId', NEW.community_id)
      );
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_handle_community_invite_notifications on public.community_invites;
create trigger trg_handle_community_invite_notifications
  after insert or update on public.community_invites
  for each row
  execute function public.trg_handle_community_invite_notifications();


-- ============================================================================
-- 9. PROFILES — streak_milestone
-- ============================================================================

create or replace function public.trg_handle_streak_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_milestone constant int[] := array[3, 7, 14, 30, 60, 100];
  v_count constant int[] := array[6, 8, 15, 31, 61, 101];  -- length check helper
begin
  -- Only fire when streak_count increases and hits a milestone
  if NEW.streak_count > coalesce(OLD.streak_count, 0)
     and NEW.streak_count = any(v_milestone)
  then
    if not public._notification_already_exists(
      NEW.id,
      'streak_milestone',
      jsonb_build_object('streakCount', NEW.streak_count)
    ) then
      insert into public.in_app_notifications (user_id, type, title, body, data)
      values (
        NEW.id,
        'streak_milestone',
        'Streak Milestone!',
        case NEW.streak_count
          when 3  then '3-day streak! You''re building a habit!'
          when 7  then 'Week warrior! 7 days straight!'
          when 14 then 'Two weeks strong! Consistency is key!'
          when 30 then '30 days! You''re a streak legend!'
          when 60 then '60 days! Unstoppable!'
          when 100 then 'CENTURY! 100-day streak achieved!'
          else NEW.streak_count || '-day streak!'
        end,
        jsonb_build_object('streakCount', NEW.streak_count)
      );
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_handle_streak_notifications on public.profiles;
create trigger trg_handle_streak_notifications
  after update on public.profiles
  for each row
  execute function public.trg_handle_streak_notifications();


-- ============================================================================
-- 10. Dedup guard on insert_notification RPC (prevents duplicates during
--     transition when old client builds still call it alongside triggers)
-- ============================================================================

create or replace function public.insert_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb default null
)
returns setof public.in_app_notifications
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Dedup: skip if the same notification was already created within the last
  -- 10 seconds (by a trigger firing on the same DB event). This prevents
  -- duplicates during the transition period when old client builds still call
  -- this RPC alongside the new server-side triggers.
  if public._notification_already_exists(p_user_id, p_type, p_data) then
    return;
  end if;

  return query
  insert into public.in_app_notifications (user_id, type, title, body, data, read)
  values (p_user_id, p_type, p_title, p_body, p_data, false)
  returning *;
end;
$$;
