-- Validate community_matches participants are community members
-- and recorded_by is one of the participants

CREATE OR REPLACE FUNCTION public.validate_community_match_participants()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- recorded_by must be one of the participants
  IF NEW.recorded_by NOT IN (
    NEW.player_id,
    NEW.player_partner_id,
    NEW.opponent_id,
    NEW.opponent_partner_id
  ) THEN
    RAISE EXCEPTION 'Only match participants can record this match';
  END IF;

  -- player_id must be an approved member
  IF NOT EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = NEW.community_id
      AND profile_id = NEW.player_id
      AND approval_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Player is not a member of this community';
  END IF;

  -- opponent_id must be an approved member
  IF NOT EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = NEW.community_id
      AND profile_id = NEW.opponent_id
      AND approval_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Opponent is not a member of this community';
  END IF;

  -- player_partner_id (if provided) must be an approved member
  IF NEW.player_partner_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = NEW.community_id
      AND profile_id = NEW.player_partner_id
      AND approval_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Player partner is not a member of this community';
  END IF;

  -- opponent_partner_id (if provided) must be an approved member
  IF NEW.opponent_partner_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = NEW.community_id
      AND profile_id = NEW.opponent_partner_id
      AND approval_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Opponent partner is not a member of this community';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_community_match_participants ON public.community_matches;
CREATE TRIGGER trg_validate_community_match_participants
  BEFORE INSERT ON public.community_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_community_match_participants();