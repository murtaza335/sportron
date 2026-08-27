-- CRITICAL FIX: Prevent privilege escalation via community_members INSERT
--
-- The original self-join INSERT policy "Users can request to join (insert self)"
-- only checked auth.uid() = profile_id without restricting the role column.
-- Any authenticated user could insert themselves as admin of any community
-- via a direct REST API call, then use the admin UPDATE policy to rename
-- or modify the community.
--
-- Fix: replace the single permissive policy with three restricted policies
-- that enforce role = 'member' for self-joins, and role = 'admin' only for
-- community creators.

drop policy if exists "Users can request to join (insert self)" on public.community_members;

-- Public community instant-join: role must be member, status approved
create policy "Users can join public communities"
  on public.community_members for insert
  to authenticated
  with check (
    auth.uid() = profile_id
    and role = 'member'
    and approval_status = 'approved'
  );

-- Restricted community request: role must be member, status pending
create policy "Users can request to join restricted communities"
  on public.community_members for insert
  to authenticated
  with check (
    auth.uid() = profile_id
    and role = 'member'
    and approval_status = 'pending'
  );

-- Community creator can insert themselves as admin (for createCommunity flow)
create policy "Community creator can add self as admin"
  on public.community_members for insert
  to authenticated
  with check (
    auth.uid() = profile_id
    and role = 'admin'
    and approval_status = 'approved'
    and exists (
      select 1 from public.communities
      where communities.id = community_members.community_id
        and communities.created_by = auth.uid()
    )
  );

-- Fix: restrict in_app_notifications INSERT to service_role only
-- (the insert_notification RPC is SECURITY DEFINER and still works for authenticated callers)
drop policy if exists "Service role can insert notifications" on public.in_app_notifications;
create policy "Only service role can insert notifications"
  on public.in_app_notifications for insert
  to service_role
  with check (true);
