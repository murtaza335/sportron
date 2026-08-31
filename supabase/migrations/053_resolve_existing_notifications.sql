-- ============================================================
-- Script to resolve existing in-app notifications for already-processed
-- community join requests and community invites
-- ============================================================
-- Run this ONCE after deploying migration 052 to clean up historical data
-- ============================================================

-- -----------------------------------------------------------------------------
-- 1. Resolve join request notifications for already approved/rejected requests
-- -----------------------------------------------------------------------------
-- Find all community_join_requests that are not 'pending' and have corresponding
-- unread 'join_request' notifications, then update those notifications.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_request RECORD;
  v_updated_count INT := 0;
BEGIN
  FOR v_request IN
    SELECT id, community_id, user_id, status
    FROM public.community_join_requests
    WHERE status IN ('approved', 'rejected')
  LOOP
    UPDATE public.in_app_notifications
    SET type = CASE
                 WHEN v_request.status = 'approved' THEN 'join_approved'
                 ELSE 'join_rejected'
               END,
        read = true
    WHERE type = 'join_request'
      AND (data->>'communityId') = v_request.community_id::text
      AND (data->>'requesterId') = v_request.user_id::text
      AND read = false;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count > 0 THEN
      RAISE NOTICE 'Resolved % join_request notification(s) for request % (status: %)',
        v_updated_count, v_request.id, v_request.status;
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Resolve community invite notifications for already accepted/rejected invites
-- -----------------------------------------------------------------------------
-- Find all community_invites that are not 'pending' and have corresponding
-- unread 'community_invite' notifications, then update those notifications.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_invite RECORD;
  v_updated_count INT := 0;
BEGIN
  FOR v_invite IN
    SELECT id, community_id, invitee_id, status
    FROM public.community_invites
    WHERE status IN ('accepted', 'rejected')
  LOOP
    UPDATE public.in_app_notifications
    SET type = CASE
                 WHEN v_invite.status = 'accepted' THEN 'community_invite_accepted'
                 ELSE 'community_invite_rejected'
               END,
        read = true
    WHERE type = 'community_invite'
      AND (data->>'inviteId') = v_invite.id::text
      AND read = false;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count > 0 THEN
      RAISE NOTICE 'Resolved % community_invite notification(s) for invite % (status: %)',
        v_updated_count, v_invite.id, v_invite.status;
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Verification queries - run these to confirm cleanup
-- -----------------------------------------------------------------------------

-- Check remaining unread join_request notifications (should be 0 or only for truly pending requests)
SELECT
  njr.type,
  njr.id,
  njr.user_id,
  njr.data,
  njr.read,
  njr.created_at,
  cjr.status as request_status
FROM public.in_app_notifications njr
LEFT JOIN public.community_join_requests cjr
  ON (njr.data->>'communityId') = cjr.community_id::text
  AND (njr.data->>'requesterId') = cjr.user_id::text
WHERE njr.type = 'join_request'
  AND njr.read = false
ORDER BY njr.created_at DESC;

-- Check remaining unread community_invite notifications (should be 0 or only for truly pending invites)
SELECT
  nci.type,
  nci.id,
  nci.user_id,
  nci.data,
  nci.read,
  nci.created_at,
  ci.status as invite_status
FROM public.in_app_notifications nci
LEFT JOIN public.community_invites ci
  ON (nci.data->>'inviteId') = ci.id::text
WHERE nci.type = 'community_invite'
  AND nci.read = false
ORDER BY nci.created_at DESC;

-- Summary counts
SELECT
  'join_request' as notification_type,
  COUNT(*) as unread_count
FROM public.in_app_notifications
WHERE type = 'join_request' AND read = false

UNION ALL

SELECT
  'community_invite' as notification_type,
  COUNT(*) as unread_count
FROM public.in_app_notifications
WHERE type = 'community_invite' AND read = false;