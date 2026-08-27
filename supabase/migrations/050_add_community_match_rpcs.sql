-- ============================================================
-- Migration 050: Community match RPCs with server-side joins
--
-- fetchCommunityMatches / fetchCommunityMatchById use FK joins
-- to profiles (recorded_by, player_id, etc.) which now return
-- null for other users due to RLS restricting profiles to
-- own-row SELECT. These RPCs join to public_profiles server-side
-- and aggregate likes/comments in one round-trip.
-- ============================================================

-- Paginated community matches with profiles + likes/comments
CREATE OR REPLACE FUNCTION public.get_community_matches(
  p_community_id uuid,
  p_page int DEFAULT 1,
  p_page_size int DEFAULT 20,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  community_id uuid,
  recorded_by uuid,
  player_id uuid,
  player_partner_id uuid,
  opponent_id uuid,
  opponent_partner_id uuid,
  sport text,
  custom_sport_name text,
  team_a_name text,
  team_b_name text,
  player_score int,
  opponent_score int,
  approval_status text,
  created_at timestamptz,
  updated_at timestamptz,
  recorder_username text,
  recorder_avatar_url text,
  player_username text,
  player_avatar_url text,
  player_partner_username text,
  player_partner_avatar_url text,
  opponent_username text,
  opponent_avatar_url text,
  opponent_partner_username text,
  opponent_partner_avatar_url text,
  likes_count bigint,
  comments_count bigint,
  is_liked_by_user boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    m.id, m.community_id, m.recorded_by,
    m.player_id, m.player_partner_id,
    m.opponent_id, m.opponent_partner_id,
    m.sport, m.custom_sport_name,
    m.team_a_name, m.team_b_name,
    m.player_score, m.opponent_score,
    m.approval_status, m.created_at, m.updated_at,
    rp.username AS recorder_username,
    rp.avatar_url AS recorder_avatar_url,
    pp.username AS player_username,
    pp.avatar_url AS player_avatar_url,
    ppp.username AS player_partner_username,
    ppp.avatar_url AS player_partner_avatar_url,
    op.username AS opponent_username,
    op.avatar_url AS opponent_avatar_url,
    opp.username AS opponent_partner_username,
    opp.avatar_url AS opponent_partner_avatar_url,
    COALESCE(lk.cnt, 0) AS likes_count,
    COALESCE(cm.cnt, 0) AS comments_count,
    CASE WHEN p_user_id IS NOT NULL THEN EXISTS (
      SELECT 1 FROM public.community_match_likes ml
      WHERE ml.community_match_id = m.id AND ml.profile_id = p_user_id
    ) ELSE false END AS is_liked_by_user
  FROM public.community_matches m
  LEFT JOIN public.profiles rp ON rp.id = m.recorded_by
  LEFT JOIN public.profiles pp ON pp.id = m.player_id
  LEFT JOIN public.profiles ppp ON ppp.id = m.player_partner_id
  LEFT JOIN public.profiles op ON op.id = m.opponent_id
  LEFT JOIN public.profiles opp ON opp.id = m.opponent_partner_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM public.community_match_likes lk
    WHERE lk.community_match_id = m.id
  ) lk ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM public.community_match_comments cc
    WHERE cc.community_match_id = m.id
  ) cm ON true
  WHERE m.community_id = p_community_id
    -- Filter out pending matches not involving the current user
    AND (
      m.approval_status != 'pending'
      OR m.recorded_by = p_user_id
      OR m.opponent_id = p_user_id
    )
  ORDER BY m.created_at DESC
  LIMIT p_page_size
  OFFSET (p_page - 1) * p_page_size;
$$;

-- Single community match by ID with profiles + likes/comments
CREATE OR REPLACE FUNCTION public.get_community_match_by_id(
  p_match_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  community_id uuid,
  recorded_by uuid,
  player_id uuid,
  player_partner_id uuid,
  opponent_id uuid,
  opponent_partner_id uuid,
  sport text,
  custom_sport_name text,
  team_a_name text,
  team_b_name text,
  player_score int,
  opponent_score int,
  approval_status text,
  created_at timestamptz,
  updated_at timestamptz,
  recorder_username text,
  recorder_avatar_url text,
  player_username text,
  player_avatar_url text,
  player_partner_username text,
  player_partner_avatar_url text,
  opponent_username text,
  opponent_avatar_url text,
  opponent_partner_username text,
  opponent_partner_avatar_url text,
  likes_count bigint,
  comments_count bigint,
  is_liked_by_user boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    m.id, m.community_id, m.recorded_by,
    m.player_id, m.player_partner_id,
    m.opponent_id, m.opponent_partner_id,
    m.sport, m.custom_sport_name,
    m.team_a_name, m.team_b_name,
    m.player_score, m.opponent_score,
    m.approval_status, m.created_at, m.updated_at,
    rp.username AS recorder_username,
    rp.avatar_url AS recorder_avatar_url,
    pp.username AS player_username,
    pp.avatar_url AS player_avatar_url,
    ppp.username AS player_partner_username,
    ppp.avatar_url AS player_partner_avatar_url,
    op.username AS opponent_username,
    op.avatar_url AS opponent_avatar_url,
    opp.username AS opponent_partner_username,
    opp.avatar_url AS opponent_partner_avatar_url,
    COALESCE(lk.cnt, 0) AS likes_count,
    COALESCE(cc.cnt, 0) AS comments_count,
    CASE WHEN p_user_id IS NOT NULL THEN EXISTS (
      SELECT 1 FROM public.community_match_likes ml
      WHERE ml.community_match_id = m.id AND ml.profile_id = p_user_id
    ) ELSE false END AS is_liked_by_user
  FROM public.community_matches m
  LEFT JOIN public.profiles rp ON rp.id = m.recorded_by
  LEFT JOIN public.profiles pp ON pp.id = m.player_id
  LEFT JOIN public.profiles ppp ON ppp.id = m.player_partner_id
  LEFT JOIN public.profiles op ON op.id = m.opponent_id
  LEFT JOIN public.profiles opp ON opp.id = m.opponent_partner_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM public.community_match_likes lk
    WHERE lk.community_match_id = m.id
  ) lk ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM public.community_match_comments cc
    WHERE cc.community_match_id = m.id
  ) cc ON true
  WHERE m.id = p_match_id;
$$;

-- ============================================================
-- MEMBER SEARCH (for match recording + invite flows)
-- ============================================================

-- Search community members by username prefix.
-- SECURITY DEFINER bypasses community_members RLS so the search
-- works for any approved member regardless of row-level policy.
CREATE OR REPLACE FUNCTION public.search_community_members(
  p_community_id uuid,
  p_query text
)
RETURNS TABLE (
  community_id uuid,
  profile_id uuid,
  role text,
  approval_status text,
  matches_played int,
  wins int,
  losses int,
  win_ratio numeric,
  joined_at timestamptz,
  username text,
  display_name text,
  avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  -- Guard: caller must be an approved member of this community
  SELECT
    m.community_id, m.profile_id, m.role, m.approval_status,
    m.matches_played, m.wins, m.losses, m.win_ratio, m.joined_at,
    p.username, p.display_name, p.avatar_url
  FROM public.community_members m
  LEFT JOIN public.profiles p ON p.id = m.profile_id
  WHERE m.community_id = p_community_id
    AND m.approval_status = 'approved'
    AND p.username ILIKE '%' || p_query || '%'
    AND EXISTS (
      SELECT 1 FROM public.community_members self
      WHERE self.community_id = p_community_id
        AND self.profile_id = auth.uid()
        AND self.approval_status = 'approved'
    )
  ORDER BY p.username
  LIMIT 20;
$$;
