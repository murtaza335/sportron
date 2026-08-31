-- FUTURE: Restrict community_members SELECT to only community members/admins
--
-- DO NOT APPLY until all app builds in stores use the get_community_admin_ids RPC
-- (migration 057) instead of querying community_members directly.
--
-- Current RLS: "Community members are viewable by authenticated users" allows all
-- authenticated users to SELECT — kept for backward compatibility.
--
-- This migration replaces that policy with a member-only SELECT.
-- Apply only when ready to enforce the restriction server-side.

DROP POLICY IF EXISTS "Community members are viewable by authenticated users" ON public.community_members;

CREATE POLICY "Community members are viewable by community members"
  ON public.community_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.community_id = community_members.community_id
        AND cm.profile_id = auth.uid()
        AND cm.approval_status = 'approved'
    )
  );