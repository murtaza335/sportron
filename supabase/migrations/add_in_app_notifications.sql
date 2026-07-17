-- Migration: Add in_app_notifications table for in-app notifications
-- Run this in your Supabase SQL Editor

-- Create the in_app_notifications table
CREATE TABLE IF NOT EXISTS in_app_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('match_pending', 'match_approved', 'match_rejected', 'match_liked', 'match_commented')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_id ON in_app_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_created_at ON in_app_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_unread ON in_app_notifications(user_id, read) WHERE read = FALSE;

-- Enable Row Level Security
ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own notifications
CREATE POLICY "Users can view own notifications"
  ON in_app_notifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
  ON in_app_notifications
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
  ON in_app_notifications
  FOR DELETE
  USING (auth.uid() = user_id);

-- Policy: Service role can insert notifications for any user
CREATE POLICY "Service role can insert notifications"
  ON in_app_notifications
  FOR INSERT
  WITH CHECK (true);

-- Create function to update updated_at timestamp (if needed)
-- Not needed since we only have created_at