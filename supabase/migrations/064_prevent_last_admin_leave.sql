-- Prevent the creator from being removed from their community
-- Creator is identified by communities.created_by and must stay forever

CREATE OR REPLACE FUNCTION public.prevent_creator_leave()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_creator boolean;
BEGIN
  SELECT (c.created_by = OLD.profile_id) INTO v_is_creator
  FROM public.communities c
  WHERE c.id = OLD.community_id;

  IF v_is_creator THEN
    RAISE EXCEPTION 'The community creator cannot leave. Delete the community instead.';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_last_admin_leave ON public.community_members;
CREATE TRIGGER trg_prevent_creator_leave
  BEFORE DELETE ON public.community_members
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_creator_leave();