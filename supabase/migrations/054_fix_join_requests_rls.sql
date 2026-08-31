-- Fix RLS policies for community_join_requests
--
-- Issues addressed:
-- 1. Join requests should only be creatable for restricted (private) communities
-- 2. Join requests must be created with status = 'pending' (not approved/rejected)
--    The table has a default of 'pending' but a malicious client could override it

-- Drop the existing insert policy
drop policy if exists "Users can create join requests" on public.community_join_requests;

-- Create new insert policy with proper checks
create policy "Users can create join requests for restricted communities"
  on public.community_join_requests for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and exists (
      select 1 from public.communities
      where id = community_join_requests.community_id
        and visibility = 'restricted'
    )
  );