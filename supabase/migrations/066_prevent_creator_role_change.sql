-- Prevent changing the creator's role in community_members
-- Creator is identified by communities.created_by
-- Creator must always remain an admin

CREATE OR REPLACE FUNCTION public.prevent_creator_role_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_creator boolean;
BEGIN
  -- Check if this user is the community creator
  SELECT (c.created_by = NEW.profile_id) INTO v_is_creator
  FROM public.communities c
  WHERE c.id = NEW.community_id;

  IF v_is_creator AND OLD.role != NEW.role THEN
    RAISE EXCEPTION 'The community creator''s role cannot be changed.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_creator_role_change ON public.community_members;
CREATE TRIGGER trg_prevent_creator_role_change
  BEFORE UPDATE ON public.community_members
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_creator_role_change();