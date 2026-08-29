-- Only the creator can delete their community
-- Community can only be deleted if no other members remain (creator only)

CREATE OR REPLACE FUNCTION public.guard_community_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_member_count int;
BEGIN
  -- Count approved members excluding the creator
  SELECT count(*) INTO v_member_count
  FROM public.community_members
  WHERE community_id = OLD.id
    AND profile_id != OLD.created_by
    AND approval_status = 'approved';

  IF v_member_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete community with % other members. Remove all members first.', v_member_count;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_community_delete_if_many_members ON public.communities;
CREATE TRIGGER trg_guard_community_delete
  BEFORE DELETE ON public.communities
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_community_delete();