-- Migration: Add avatar_url column to profiles table
-- Run this in your Supabase SQL Editor

-- Add avatar_url column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS avatar_url TEXT NULL;

-- Optional: Add a comment for documentation
COMMENT ON COLUMN profiles.avatar_url IS 'URL to user profile picture (Cloudinary)';