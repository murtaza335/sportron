-- Migration: Add new notification types for sessions, communities, pings, etc.
-- Run this in your Supabase SQL Editor

-- Drop the old CHECK constraint and add updated one
ALTER TABLE in_app_notifications
DROP CONSTRAINT IF EXISTS in_app_notifications_type_check;

ALTER TABLE in_app_notifications
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
  'community_match_pending',
  'community_match_approved',
  'community_match_disputed'
));

-- Update the insert_notification function (no change needed, it accepts any text)
