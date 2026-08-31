-- Fix get_join_requests RPC to only return requests for restricted communities
-- Defense in depth: even if join requests somehow exist for public communities,
-- they won't be returned by this admin-only RPC

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
    -- Only return join requests for restricted communities
    AND EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = p_community_id
        AND c.visibility = 'restricted'
    )
  ORDER BY r.created_at ASC;
$$;