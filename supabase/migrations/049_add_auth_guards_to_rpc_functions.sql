-- ============================================================
-- Migration 049: Add auth.uid() guards to SECURITY DEFINER RPCs
--
-- Migration 048 created 15 SECURITY DEFINER functions. Five had
-- no auth.uid() check, allowing ANY authenticated user to:
--   - enumerate community members (get_community_members)
--   - view pending join requests (get_join_requests)
--   - view pending invites (get_community_invites)
--   - view all session participants (get_session_commitments)
--   - fetch any session by ID (get_session_by_id)
--
-- This migration adds server-side auth checks so each function
-- only returns rows the caller is authorized to see.
-- ============================================================

-- -------------------------------------------------------
-- 1. get_community_members — caller must be an approved member
-- -------------------------------------------------------
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
  -- Guard: caller must be an approved member of this community
  SELECT
    m.community_id, m.profile_id, m.role, m.approval_status,
    m.matches_played, m.wins, m.losses, m.win_ratio, m.joined_at,
    p.username, p.display_name, p.avatar_url
  FROM public.community_members m
  LEFT JOIN public.profiles p ON p.id = m.profile_id
  WHERE m.community_id = p_community_id
    AND EXISTS (
      SELECT 1 FROM public.community_members self
      WHERE self.community_id = p_community_id
        AND self.profile_id = auth.uid()
        AND self.approval_status = 'approved'
    )
  ORDER BY
    CASE WHEN m.profile_id = auth.uid() THEN 0 ELSE 1 END,
    CASE WHEN m.role = 'admin' THEN 0 ELSE 1 END,
    m.joined_at;
$$;

-- -------------------------------------------------------
-- 2. get_join_requests — caller must be an admin of the community
-- -------------------------------------------------------
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
  -- Guard: caller must be an admin of this community
  SELECT
    r.id, r.community_id, r.user_id, r.status, r.created_at, r.updated_at,
    p.username, p.avatar_url
  FROM public.community_join_requests r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE r.community_id = p_community_id
    AND r.status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.community_members self
      WHERE self.community_id = p_community_id
        AND self.profile_id = auth.uid()
        AND self.role = 'admin'
        AND self.approval_status = 'approved'
    )
  ORDER BY r.created_at ASC;
$$;

-- -------------------------------------------------------
-- 3. get_community_invites — caller must be an admin of the community
-- -------------------------------------------------------
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
  -- Guard: caller must be an admin of this community
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
    AND EXISTS (
      SELECT 1 FROM public.community_members self
      WHERE self.community_id = p_community_id
        AND self.profile_id = auth.uid()
        AND self.role = 'admin'
        AND self.approval_status = 'approved'
    )
  ORDER BY i.created_at DESC;
$$;

-- -------------------------------------------------------
-- 4. get_session_commitments — caller must be the creator or an accepted/left participant
-- -------------------------------------------------------
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
  -- Guard: caller must be the session creator or an accepted/left participant
  SELECT
    c.id, c.session_id, c.user_id, c.status,
    c.feedback_status, c.feedback_provided_by,
    c.created_at, c.updated_at,
    p.username, p.avatar_url,
    p.completed_sessions, p.total_committed_sessions
  FROM public.commitments c
  LEFT JOIN public.profiles p ON p.id = c.user_id
  WHERE c.session_id = p_session_id
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = p_session_id
        AND (
          s.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.commitments self
            WHERE self.session_id = p_session_id
              AND self.user_id = auth.uid()
              AND self.status IN ('accepted', 'left')
          )
        )
    )
  ORDER BY c.created_at ASC;
$$;

-- -------------------------------------------------------
-- 5. get_session_by_id — open/full sessions are public (anyone
--     can view to decide whether to join); ended sessions are
--     restricted to the creator and participants.
-- -------------------------------------------------------
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
  accepted_count bigint
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
    COALESCE(cc.cnt, 0) AS accepted_count
  FROM public.sessions s
  LEFT JOIN public.profiles p ON p.id = s.created_by
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM public.commitments c
    WHERE c.session_id = s.id AND c.status = 'accepted'
  ) cc ON true
  WHERE s.id = p_session_id
    AND (
      -- Open/full sessions: any authenticated user can view (to decide to join)
      s.status IN ('open', 'full')
      -- Ended sessions: only the creator or a participant can view
      OR s.created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.commitments mc
        WHERE mc.session_id = p_session_id
          AND mc.user_id = auth.uid()
          AND mc.status IN ('accepted', 'left')
      )
    );
$$;
