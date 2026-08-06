-- ============================================================
-- Migration 019: Remove legacy non-community match tables
--
-- The app now only supports matches recorded within communities
-- (community_matches). These legacy tables, if present, are dropped:
--   - matches
--   - match_likes
--   - match_comments
--
-- Their functionality (likes/comments) is superseded by the
-- community_match_likes / community_match_comments tables (migration 018).
-- ============================================================

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

drop table if exists public.match_comments;
drop table if exists public.match_likes;
drop table if exists public.matches;