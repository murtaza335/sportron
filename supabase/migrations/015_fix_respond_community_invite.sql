-- Fix respond_to_community_invite function (column "id" does not exist error)
-- Run this migration to replace the buggy function

DROP FUNCTION IF EXISTS public.respond_to_community_invite(uuid, uuid, boolean);

CREATE OR REPLACE FUNCTION public.respond_to_community_invite(
  p_invite_id uuid,
  p_user_id uuid,
  p_accept boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_community_id uuid;
  v_invited_by uuid;
  v_invitee_id uuid;
BEGIN
  -- Fetch the pending invite (INTO STRICT raises no_data_found if no match)
  SELECT community_id, invited_by, invitee_id
  INTO STRICT v_community_id, v_invited_by, v_invitee_id
  FROM public.community_invites
  WHERE id = p_invite_id
    AND invitee_id = p_user_id
    AND status = 'pending';

  -- Update invite status
  UPDATE public.community_invites
  SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END
  WHERE id = p_invite_id;

  -- If accepting, add as member (composite PK: community_id, profile_id - NO id column)
  IF p_accept THEN
    INSERT INTO public.community_members (community_id, profile_id, role, approval_status)
    VALUES (v_community_id, p_user_id, 'member', 'approved')
    ON CONFLICT (community_id, profile_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'community_id', v_community_id,
    'invited_by', v_invited_by,
    'invitee_id', v_invitee_id
  );
EXCEPTION
  WHEN no_data_found THEN
    RAISE EXCEPTION 'Invite not found or already responded';
END;
$$;