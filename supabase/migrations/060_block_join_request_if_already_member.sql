-- Block community join request if user is already a member
--
-- Defense in depth: prevents a user from creating a join request for a
-- community they're already an approved member of.

CREATE OR REPLACE FUNCTION public.block_join_request_if_already_member()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = NEW.community_id
      AND profile_id = NEW.user_id
      AND approval_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'You are already a member of this community';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_join_request_if_already_member ON public.community_join_requests;
CREATE TRIGGER trg_block_join_request_if_already_member
  BEFORE INSERT ON public.community_join_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.block_join_request_if_already_member();