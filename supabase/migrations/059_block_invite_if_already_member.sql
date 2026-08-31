-- Block community invite if invitee is already a member/admin
--
-- The create_community_invite RPC (013) already checks this, but a direct
-- INSERT via the API could bypass the RPC. This trigger enforces it at the
-- database level as defense in depth.

CREATE OR REPLACE FUNCTION public.block_invite_if_already_member()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = NEW.community_id
      AND profile_id = NEW.invitee_id
      AND approval_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'User is already a member of this community';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_invite_if_already_member ON public.community_invites;
CREATE TRIGGER trg_block_invite_if_already_member
  BEFORE INSERT ON public.community_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.block_invite_if_already_member();