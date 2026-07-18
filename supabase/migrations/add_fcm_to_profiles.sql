-- Migration: Add FCM tokens and notification preferences to profiles table
-- Run this in your Supabase SQL Editor

-- Add FCM tokens column
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS fcm_tokens TEXT[] DEFAULT '{}';

-- Add notification preferences column
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{
  "match_pending": true,
  "match_approved": true,
  "match_rejected": true,
  "match_liked": true,
  "match_commented": true
}';

-- Create index for FCM tokens for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_fcm_tokens ON profiles USING GIN (fcm_tokens);

-- Optional: Add comments for documentation
COMMENT ON COLUMN profiles.fcm_tokens IS 'Array of FCM device tokens for push notifications';
COMMENT ON COLUMN profiles.notification_preferences IS 'User preferences for push notification types';