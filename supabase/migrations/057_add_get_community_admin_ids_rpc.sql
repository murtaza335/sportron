-- Add get_community_admin_ids RPC for join request notifications
--
-- The current RLS policy on community_members allows all authenticated users
-- to SELECT, which is kept for backward compatibility with existing app builds.
-- This RPC provides admin IDs for notification purposes without requiring membership.

CREATE OR REPLACE FUNCTION public.get_community_admin_ids(p_community_id uuid)
RETURNS TABLE (profile_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT cm.profile_id
  FROM public.community_members cm
  WHERE cm.community_id = p_community_id
    AND cm.role = 'admin'
    AND cm.approval_status = 'approved';
$$;