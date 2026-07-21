-- Add sport support to matches and community_matches tables

-- ============================================================
-- 1. MATCHES TABLE
-- ============================================================
alter table if exists public.matches
  add column if not exists sport text not null default 'table_tennis',
  add column if not exists custom_sport_name text,
  add column if not exists team_a_name text,
  add column if not exists team_b_name text;

-- ============================================================
-- 2. COMMUNITY MATCHES TABLE
-- ============================================================
alter table if exists public.community_matches
  add column if not exists sport text not null default 'table_tennis',
  add column if not exists custom_sport_name text,
  add column if not exists team_a_name text,
  add column if not exists team_b_name text;

-- ============================================================
-- 3. INDEXES
-- ============================================================
create index if not exists matches_sport_idx on public.matches (sport);
create index if not exists community_matches_sport_idx on public.community_matches (sport);
