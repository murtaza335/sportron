-- Migration: Drop ping_responses + ping_response notification type
-- The "reply to a ping" (Coming/Busy) feature was removed. Pings themselves
-- (sending + notification) remain, but responses no longer exist.

drop table if exists public.ping_responses;

-- Remove the ping_response notification type. Delete any leftover rows so the
-- re-added check constraint cannot fail.
delete from public.in_app_notifications where type = 'ping_response';

alter table public.in_app_notifications
  drop constraint if exists in_app_notifications_type_check;

alter table public.in_app_notifications
  add constraint in_app_notifications_type_check
  check (type in (
    'match_pending',
    'match_approved',
    'match_rejected',
    'match_liked',
    'match_commented',
    'session_application',
    'session_accepted',
    'session_rejected',
    'session_left',
    'session_reminder',
    'feedback_prompt',
    'ping',
    'join_request',
    'join_approved',
    'join_rejected',
    'match_approval_request',
    'match_approved_community',
    'match_disputed',
    'member_removed',
    'admin_transferred',
    'admin_promoted',
    'community_match_pending',
    'community_match_approved',
    'community_match_disputed',
    'community_invite',
    'community_invite_accepted',
    'community_invite_rejected',
    'session_chat_message',
    'session_chat_reply',
    'community_chat_message',
    'community_chat_reply'
  ));