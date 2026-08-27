-- ============================================================
-- Migration 048: Production RPC functions with server-side joins
--
-- Replaces the two-step client pattern (fetch data → fetch profiles → merge)
-- with single-query SECURITY DEFINER functions that join server-side.
--
-- Benefits:
--   - One HTTP round-trip instead of two
--   - No client-side merge logic
--   - Server-side join is faster (no serialization of full rows)
--   - SECURITY DEFINER bypasses RLS but auth.uid() scopes every row
--   - Backward compatible: old builds still work via direct table queries
-- ============================================================

-- ============================================================
-- COMMUNITIES
-- ============================================================

-- Public communities list (discover page)
CREATE OR REPLACE FUNCTION public.get_public_communities()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  organization text,
  location text,
  image_url text,
  visibility text,
  sport text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  pings_enabled boolean,
  member_count bigint,
  creator_username text,
  creator_avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    c.id, c.name, c.description, c.organization, c.location,
    c.image_url, c.visibility, c.sport, c.created_by,
    c.created_at, c.updated_at, c.pings_enabled,
    COALESCE(cm.cnt, 0) AS member_count,
    p.username AS creator_username,
    p.avatar_url AS creator_avatar_url
  FROM public.communities c
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM public.community_members m
    WHERE m.community_id = c.id AND m.approval_status = 'approved'
  ) cm ON true
  LEFT JOIN public.profiles p ON p.id = c.created_by
  ORDER BY c.created_at DESC;
$$;

-- Communities the current user belongs to (my communities)
CREATE OR REPLACE FUNCTION public.get_my_communities()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  organization text,
  location text,
  image_url text,
  visibility text,
  sport text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  pings_enabled boolean,
  member_count bigint,
  creator_username text,
  creator_avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    c.id, c.name, c.description, c.organization, c.location,
    c.image_url, c.visibility, c.sport, c.created_by,
    c.created_at, c.updated_at, c.pings_enabled,
    COALESCE(cm.cnt, 0) AS member_count,
    p.username AS creator_username,
    p.avatar_url AS creator_avatar_url
  FROM public.communities c
  INNER JOIN public.community_members member
    ON member.community_id = c.id
    AND member.profile_id = auth.uid()
    AND member.approval_status = 'approved'
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM public.community_members m
    WHERE m.community_id = c.id AND m.approval_status = 'approved'
  ) cm ON true
  LEFT JOIN public.profiles p ON p.id = c.created_by
  ORDER BY c.created_at DESC;
$$;

-- Single community by ID (community home page)
CREATE OR REPLACE FUNCTION public.get_community_by_id(p_community_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  organization text,
  location text,
  image_url text,
  visibility text,
  sport text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  pings_enabled boolean,
  member_count bigint,
  creator_username text,
  creator_avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    c.id, c.name, c.description, c.organization, c.location,
    c.image_url, c.visibility, c.sport, c.created_by,
    c.created_at, c.updated_at, c.pings_enabled,
    COALESCE(cm.cnt, 0) AS member_count,
    p.username AS creator_username,
    p.avatar_url AS creator_avatar_url
  FROM public.communities c
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM public.community_members m
    WHERE m.community_id = c.id AND m.approval_status = 'approved'
  ) cm ON true
  LEFT JOIN public.profiles p ON p.id = c.created_by
  WHERE c.id = p_community_id;
$$;

-- Community members with profiles (members list, info page)
CREATE OR REPLACE FUNCTION public.get_community_members(p_community_id uuid)
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
  SELECT
    m.community_id, m.profile_id, m.role, m.approval_status,
    m.matches_played, m.wins, m.losses, m.win_ratio, m.joined_at,
    p.username, p.display_name, p.avatar_url
  FROM public.community_members m
  LEFT JOIN public.profiles p ON p.id = m.profile_id
  WHERE m.community_id = p_community_id
  ORDER BY
    CASE WHEN m.profile_id = auth.uid() THEN 0 ELSE 1 END,
    CASE WHEN m.role = 'admin' THEN 0 ELSE 1 END,
    m.joined_at;
$$;

-- Join requests with requester profiles (admin review page)
CREATE OR REPLACE FUNCTION public.get_join_requests(p_community_id uuid)
RETURNS TABLE (
  id uuid,
  community_id uuid,
  user_id uuid,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  username text,
  avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    r.id, r.community_id, r.user_id, r.status, r.created_at, r.updated_at,
    p.username, p.avatar_url
  FROM public.community_join_requests r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE r.community_id = p_community_id
    AND r.status = 'pending'
  ORDER BY r.created_at ASC;
$$;

-- Match comments with commenter profiles
CREATE OR REPLACE FUNCTION public.get_match_comments(p_match_id uuid)
RETURNS TABLE (
  id uuid,
  community_match_id uuid,
  profile_id uuid,
  content text,
  created_at timestamptz,
  username text,
  avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    c.id, c.community_match_id, c.profile_id, c.content, c.created_at,
    p.username, p.avatar_url
  FROM public.community_match_comments c
  LEFT JOIN public.profiles p ON p.id = c.profile_id
  WHERE c.community_match_id = p_match_id
  ORDER BY c.created_at ASC;
$$;

-- Pending invites for a community (admin view)
CREATE OR REPLACE FUNCTION public.get_community_invites(p_community_id uuid)
RETURNS TABLE (
  id uuid,
  community_id uuid,
  invited_by uuid,
  invitee_id uuid,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  community_name text,
  community_image_url text,
  inviter_username text,
  inviter_avatar_url text,
  invitee_username text,
  invitee_avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    i.id, i.community_id, i.invited_by, i.invitee_id,
    i.status, i.created_at, i.updated_at,
    c.name AS community_name, c.image_url AS community_image_url,
    ip.username AS inviter_username, ip.avatar_url AS inviter_avatar_url,
    iep.username AS invitee_username, iep.avatar_url AS invitee_avatar_url
  FROM public.community_invites i
  LEFT JOIN public.communities c ON c.id = i.community_id
  LEFT JOIN public.profiles ip ON ip.id = i.invited_by
  LEFT JOIN public.profiles iep ON iep.id = i.invitee_id
  WHERE i.community_id = p_community_id
    AND i.status = 'pending'
  ORDER BY i.created_at DESC;
$$;

-- Pending invites for the current user (invite tab)
CREATE OR REPLACE FUNCTION public.get_my_pending_invites()
RETURNS TABLE (
  id uuid,
  community_id uuid,
  invited_by uuid,
  invitee_id uuid,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  community_name text,
  community_image_url text,
  inviter_username text,
  inviter_avatar_url text,
  invitee_username text,
  invitee_avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    i.id, i.community_id, i.invited_by, i.invitee_id,
    i.status, i.created_at, i.updated_at,
    c.name AS community_name, c.image_url AS community_image_url,
    ip.username AS inviter_username, ip.avatar_url AS inviter_avatar_url,
    iep.username AS invitee_username, iep.avatar_url AS invitee_avatar_url
  FROM public.community_invites i
  LEFT JOIN public.communities c ON c.id = i.community_id
  LEFT JOIN public.profiles ip ON ip.id = i.invited_by
  LEFT JOIN public.profiles iep ON iep.id = i.invitee_id
  WHERE i.invitee_id = auth.uid()
    AND i.status = 'pending'
  ORDER BY i.created_at DESC;
$$;

-- ============================================================
-- SESSIONS
-- ============================================================

-- Open sessions (new/discover feed)
CREATE OR REPLACE FUNCTION public.get_open_sessions()
RETURNS TABLE (
  id uuid,
  created_by uuid,
  purpose text,
  title text,
  location text,
  date_time timestamptz,
  expires_at timestamptz,
  max_participants int,
  description text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  creator_username text,
  creator_avatar_url text,
  commitment_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    s.id, s.created_by, s.purpose, s.title, s.location,
    s.date_time, s.expires_at, s.max_participants, s.description,
    s.status, s.created_at, s.updated_at,
    p.username AS creator_username,
    p.avatar_url AS creator_avatar_url,
    COALESCE(cc.cnt, 0) AS commitment_count
  FROM public.sessions s
  LEFT JOIN public.profiles p ON p.id = s.created_by
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM public.commitments c
    WHERE c.session_id = s.id AND c.status = 'accepted'
  ) cc ON true
  WHERE s.status IN ('open', 'full')
  ORDER BY s.date_time ASC;
$$;

-- Sessions created by the current user
CREATE OR REPLACE FUNCTION public.get_my_sessions()
RETURNS TABLE (
  id uuid,
  created_by uuid,
  purpose text,
  title text,
  location text,
  date_time timestamptz,
  expires_at timestamptz,
  max_participants int,
  description text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  creator_username text,
  creator_avatar_url text,
  commitment_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    s.id, s.created_by, s.purpose, s.title, s.location,
    s.date_time, s.expires_at, s.max_participants, s.description,
    s.status, s.created_at, s.updated_at,
    p.username AS creator_username,
    p.avatar_url AS creator_avatar_url,
    COALESCE(cc.cnt, 0) AS commitment_count
  FROM public.sessions s
  LEFT JOIN public.profiles p ON p.id = s.created_by
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM public.commitments c
    WHERE c.session_id = s.id AND c.status = 'accepted'
  ) cc ON true
  WHERE s.created_by = auth.uid()
  ORDER BY
    CASE WHEN s.status IN ('open', 'full') THEN 0 ELSE 1 END,
    CASE WHEN s.status IN ('open', 'full') THEN s.date_time END ASC,
    CASE WHEN s.status NOT IN ('open', 'full') THEN s.date_time END DESC;
$$;

-- Sessions the current user has joined (accepted commitment)
CREATE OR REPLACE FUNCTION public.get_joined_sessions()
RETURNS TABLE (
  id uuid,
  created_by uuid,
  purpose text,
  title text,
  location text,
  date_time timestamptz,
  expires_at timestamptz,
  max_participants int,
  description text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  creator_username text,
  creator_avatar_url text,
  commitment_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    s.id, s.created_by, s.purpose, s.title, s.location,
    s.date_time, s.expires_at, s.max_participants, s.description,
    s.status, s.created_at, s.updated_at,
    p.username AS creator_username,
    p.avatar_url AS creator_avatar_url,
    COALESCE(cc.cnt, 0) AS commitment_count
  FROM public.sessions s
  INNER JOIN public.commitments my_c
    ON my_c.session_id = s.id
    AND my_c.user_id = auth.uid()
    AND my_c.status = 'accepted'
  LEFT JOIN public.profiles p ON p.id = s.created_by
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM public.commitments c
    WHERE c.session_id = s.id AND c.status = 'accepted'
  ) cc ON true
  ORDER BY
    CASE WHEN s.status IN ('open', 'full') THEN 0 ELSE 1 END,
    CASE WHEN s.status IN ('open', 'full') THEN s.date_time END ASC,
    CASE WHEN s.status NOT IN ('open', 'full') THEN s.date_time END DESC;
$$;

-- Session history (ended sessions the user was part of)
CREATE OR REPLACE FUNCTION public.get_session_history()
RETURNS TABLE (
  id uuid,
  created_by uuid,
  purpose text,
  title text,
  location text,
  date_time timestamptz,
  expires_at timestamptz,
  max_participants int,
  description text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  creator_username text,
  creator_avatar_url text,
  commitment_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    s.id, s.created_by, s.purpose, s.title, s.location,
    s.date_time, s.expires_at, s.max_participants, s.description,
    s.status, s.created_at, s.updated_at,
    p.username AS creator_username,
    p.avatar_url AS creator_avatar_url,
    COALESCE(cc.cnt, 0) AS commitment_count
  FROM public.sessions s
  LEFT JOIN public.profiles p ON p.id = s.created_by
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM public.commitments c
    WHERE c.session_id = s.id AND c.status = 'accepted'
  ) cc ON true
  WHERE s.status IN ('closed', 'completed', 'cancelled')
    AND (
      s.created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.commitments mc
        WHERE mc.session_id = s.id
          AND mc.user_id = auth.uid()
          AND mc.status IN ('accepted', 'left')
      )
    )
  ORDER BY s.date_time DESC;
$$;

-- Single session by ID
CREATE OR REPLACE FUNCTION public.get_session_by_id(p_session_id uuid)
RETURNS TABLE (
  id uuid,
  created_by uuid,
  purpose text,
  title text,
  location text,
  date_time timestamptz,
  expires_at timestamptz,
  max_participants int,
  description text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  creator_username text,
  creator_avatar_url text,
  commitment_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    s.id, s.created_by, s.purpose, s.title, s.location,
    s.date_time, s.expires_at, s.max_participants, s.description,
    s.status, s.created_at, s.updated_at,
    p.username AS creator_username,
    p.avatar_url AS creator_avatar_url,
    COALESCE(cc.cnt, 0) AS commitment_count
  FROM public.sessions s
  LEFT JOIN public.profiles p ON p.id = s.created_by
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM public.commitments c
    WHERE c.session_id = s.id AND c.status = 'accepted'
  ) cc ON true
  WHERE s.id = p_session_id;
$$;

-- Session commitments with profiles (session detail popup)
CREATE OR REPLACE FUNCTION public.get_session_commitments(p_session_id uuid)
RETURNS TABLE (
  id uuid,
  session_id uuid,
  user_id uuid,
  status text,
  feedback_status text,
  feedback_provided_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  username text,
  avatar_url text,
  completed_sessions int,
  total_committed_sessions int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    c.id, c.session_id, c.user_id, c.status,
    c.feedback_status, c.feedback_provided_by,
    c.created_at, c.updated_at,
    p.username, p.avatar_url,
    p.completed_sessions, p.total_committed_sessions
  FROM public.commitments c
  LEFT JOIN public.profiles p ON p.id = c.user_id
  WHERE c.session_id = p_session_id
  ORDER BY c.created_at ASC;
$$;

-- All sessions the user can access (for chats hub / conflict checks)
-- Combines "created by me" + "accepted on" in one query
CREATE OR REPLACE FUNCTION public.get_my_accessible_sessions()
RETURNS TABLE (
  id uuid,
  created_by uuid,
  purpose text,
  title text,
  location text,
  date_time timestamptz,
  expires_at timestamptz,
  max_participants int,
  description text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  creator_username text,
  creator_avatar_url text,
  commitment_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT DISTINCT
    s.id, s.created_by, s.purpose, s.title, s.location,
    s.date_time, s.expires_at, s.max_participants, s.description,
    s.status, s.created_at, s.updated_at,
    p.username AS creator_username,
    p.avatar_url AS creator_avatar_url,
    COALESCE(cc.cnt, 0) AS commitment_count
  FROM public.sessions s
  LEFT JOIN public.profiles p ON p.id = s.created_by
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM public.commitments c
    WHERE c.session_id = s.id AND c.status = 'accepted'
  ) cc ON true
  WHERE s.created_by = auth.uid()
     OR EXISTS (
       SELECT 1 FROM public.commitments mc
       WHERE mc.session_id = s.id
         AND mc.user_id = auth.uid()
         AND mc.status = 'accepted'
     )
  ORDER BY s.date_time ASC;
$$;
