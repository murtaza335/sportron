-- Fix: allow re-requests after a join request is approved/rejected
--
-- Problem: unique (community_id, user_id) on community_join_requests blocks
-- new requests even after the old one is resolved (approved/rejected).
--
-- Solution: replace the full unique constraint with a partial unique index
-- that only enforces uniqueness for pending requests. Resolved rows are
-- cleaned up by the data migration below.

-- 1. Drop the existing unique constraint
ALTER TABLE public.community_join_requests
  DROP CONSTRAINT IF EXISTS community_join_requests_community_id_user_id_key;

-- 2. Partial unique index: only one pending request per user per community
CREATE UNIQUE INDEX idx_community_join_requests_pending_unique
  ON public.community_join_requests (community_id, user_id)
  WHERE status = 'pending';

-- 3. Clean up existing resolved rows that block re-requests
DELETE FROM public.community_join_requests
WHERE status IN ('approved', 'rejected');