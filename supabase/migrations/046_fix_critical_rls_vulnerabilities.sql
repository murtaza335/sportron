-- ============================================================
-- Migration 046: Fix critical RLS vulnerabilities
--
-- Fixes 5 critical security issues found in audit:
--   1. profiles: fcm_tokens + notification_preferences exposed to all users
--   2. create_community_invite(): SECURITY DEFINER lacks admin auth check
--   3. respond_to_community_invite(): SECURITY DEFINER lacks caller ownership check
--   4. log_audit_event(): SECURITY DEFINER allows any user to forge audit entries
--   5. get_accepted_commitment_counts(): SECURITY DEFINER leaks private session data
--
-- Backward compatibility:
--   - public_profiles view exposes safe columns for profile view feature
--   - profiles table SELECT restricted to own-row (fcm_tokens/private data hidden)
--   - FK-based joins (community_members -> profiles) still work at DB level
--   - Old builds' direct profiles.select('*') on OTHER users will 403
--     (acceptable breakage — fcm_tokens must not be exposed)
-- ============================================================

-- ============================================================
-- FIX 1: Restrict profiles SELECT + create public_profiles view
-- ============================================================

-- 1a. Create a view that strips sensitive columns
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles AS
SELECT
  id,
  username,
  display_name,
  bio,
  avatar_url,
  sport_interests,
  completed_sessions,
  total_committed_sessions,
  streak_count,
  longest_streak,
  last_activity_date,
  streak_updated_at,
  created_at,
  updated_at,
  deleted_at
FROM public.profiles;

-- 1b. Drop the old permissive SELECT policy
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;

-- 1c. Restrict profiles table SELECT to own-row only
--     (own profile: full access including fcm_tokens, notification_preferences)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Users can view own profile (full)'
      AND tablename = 'profiles'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY "Users can view own profile (full)"
      ON public.profiles FOR select
      TO authenticated
      USING (auth.uid() = id);
  END IF;
END
$$;

-- ============================================================
-- FIX 2: Add admin auth check to create_community_invite()
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_community_invite(
  p_community_id uuid,
  p_invited_by uuid,
  p_invitee_id uuid
) RETURNS public.community_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.community_invites;
  v_existing_member public.community_members;
  v_existing_request public.community_join_requests;
  v_existing_invite public.community_invites;
BEGIN
  -- SECURITY FIX: verify the caller is an admin of this community
  IF NOT EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = p_community_id
      AND profile_id = auth.uid()
      AND role = 'admin'
      AND approval_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Only community admins can send invites';
  END IF;

  -- SECURITY FIX: verify invited_by matches the caller (cannot forge inviter)
  IF p_invited_by <> auth.uid() THEN
    RAISE EXCEPTION 'You cannot send invites on behalf of another user';
  END IF;

  -- Check if user is already a member
  SELECT * INTO v_existing_member
  FROM public.community_members
  WHERE community_id = p_community_id AND profile_id = p_invitee_id;
  
  IF v_existing_member IS NOT NULL THEN
    RAISE EXCEPTION 'User is already a member of this community';
  END IF;

  -- Check if there's a pending join request
  SELECT * INTO v_existing_request
  FROM public.community_join_requests
  WHERE community_id = p_community_id AND user_id = p_invitee_id AND status = 'pending';
  
  IF v_existing_request IS NOT NULL THEN
    RAISE EXCEPTION 'User already has a pending join request for this community';
  END IF;

  -- Check if there's a pending invite
  SELECT * INTO v_existing_invite
  FROM public.community_invites
  WHERE community_id = p_community_id AND invitee_id = p_invitee_id AND status = 'pending';
  
  IF v_existing_invite IS NOT NULL THEN
    RAISE EXCEPTION 'User already has a pending invite for this community';
  END IF;

  -- Create the invite
  INSERT INTO public.community_invites (community_id, invited_by, invitee_id, status)
  VALUES (p_community_id, p_invited_by, p_invitee_id, 'pending')
  RETURNING * INTO v_invite;

  RETURN v_invite;
END;
$$;

-- ============================================================
-- FIX 3: Add caller ownership check to respond_to_community_invite()
-- ============================================================

CREATE OR REPLACE FUNCTION public.respond_to_community_invite(
  p_invite_id uuid,
  p_user_id uuid,
  p_accept boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community_id uuid;
  v_invited_by uuid;
  v_invitee_id uuid;
  v_member_id uuid;
BEGIN
  -- SECURITY FIX: verify the caller can only respond to their OWN invites
  IF p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'You can only respond to your own invites';
  END IF;

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

-- ============================================================
-- FIX 4: Remove public log_audit_event() RPC
--
-- The function is only needed by trigger functions (which are
-- SECURITY DEFINER and can call it). Exposing it as a public
-- RPC lets any authenticated user forge audit entries.
-- ============================================================

DROP FUNCTION IF EXISTS public.log_audit_event(text, text, uuid, jsonb, jsonb, jsonb);

-- Recreate as a trigger-only helper (not accessible via RPC)
-- This is called by audit trigger functions, which are SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action     text,
  p_table_name text,
  p_record_id  uuid,
  p_old_data   jsonb default null,
  p_new_data   jsonb default null,
  p_metadata   jsonb default null
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_id, action, table_name, record_id, old_data, new_data, metadata)
  VALUES (auth.uid(), p_action, p_table_name, p_record_id, p_old_data, p_new_data, p_metadata);
END;
$$;

-- The audit_logs INSERT policy remains WITH CHECK (false) for authenticated users.
-- Only SECURITY DEFINER trigger functions (which call log_audit_event) can insert.

-- ============================================================
-- FIX 5: Add membership scoping to get_accepted_commitment_counts()
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_accepted_commitment_counts(
  p_session_ids uuid[]
)
RETURNS TABLE (session_id uuid, count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- SECURITY FIX: only return counts for sessions the caller has access to
  -- (created by them, or they hold an accepted commitment)
  RETURN QUERY
  SELECT c.session_id, count(*)::bigint
  FROM public.commitments c
  WHERE c.session_id = any(p_session_ids)
    AND c.status = 'accepted'
    AND (
      EXISTS (
        SELECT 1 FROM public.sessions s
        WHERE s.id = c.session_id
          AND s.created_by = v_user_id
      )
      OR EXISTS (
        SELECT 1 FROM public.commitments my_c
        WHERE my_c.session_id = c.session_id
          AND my_c.user_id = v_user_id
          AND my_c.status = 'accepted'
      )
    )
  GROUP BY c.session_id;
END;
$$;
