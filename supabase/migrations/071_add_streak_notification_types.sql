-- Add streak notification types to the check constraint.
-- The streak-cron edge function inserts these rows but migration 034
-- did not include them.

DELETE FROM public.in_app_notifications
  WHERE type IN ('streak_reminder', 'streak_at_risk', 'streak_milestone');

ALTER TABLE public.in_app_notifications
  DROP CONSTRAINT IF EXISTS in_app_notifications_type_check;

ALTER TABLE public.in_app_notifications
  ADD CONSTRAINT in_app_notifications_type_check
  CHECK (type IN (
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
    'community_chat_reply',
    'streak_reminder',
    'streak_at_risk',
    'streak_milestone'
  ));
