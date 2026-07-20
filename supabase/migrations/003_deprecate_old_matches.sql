-- ============================================================
-- Migration 003: Deprecate old T3Seecs match tables
--
-- Removes the v1 matches, match_likes, and match_comments
-- tables which have been superseded by:
--   - sessions + commitments (Find a Match)
--   - community_matches (recorded matches within communities)
--
-- The old social features (likes, comments) are being replaced
-- by the in-app notification system and community-based
-- interactions.
-- ============================================================

-- First drop dependent RLS policies
drop policy if exists "Users can delete their own likes" on public.match_likes;
drop policy if exists "Users can insert their own likes" on public.match_likes;
drop policy if exists "Likes are viewable by authenticated users" on public.match_likes;

drop policy if exists "Users can delete their own comments" on public.match_comments;
drop policy if exists "Users can update their own comments" on public.match_comments;
drop policy if exists "Users can insert their own comments" on public.match_comments;
drop policy if exists "Comments are viewable by authenticated users" on public.match_comments;

drop policy if exists "Users can delete their own matches" on public.matches;
drop policy if exists "Users can update matches they created or participated in as opponents" on public.matches;
drop policy if exists "Users can insert their own matches" on public.matches;
drop policy if exists "Public matches are viewable by authenticated users" on public.matches;

-- Drop tables (order matters for FK constraints)
drop table if exists public.match_comments;
drop table if exists public.match_likes;
drop table if exists public.matches;
