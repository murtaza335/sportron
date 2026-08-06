-- Allow community admins to insert members into community_members.
--
-- The existing insert policy "Users can request to join (insert self)"
-- only permits a user to insert their own membership row
-- (with check (auth.uid() = profile_id)). Approving a join request from the
-- client (respondToJoinRequest -> insert into community_members) therefore
-- failed with "new row violates row-level security policy for table
-- community_members" because the row's profile_id is the requester, not the
-- admin performing the insert.
--
-- This mirrors the existing "Admins can manage community members" update
-- policy so admins can also add members (approve join requests) directly.

drop policy if exists "Admins can add community members" on public.community_members;
create policy "Admins can add community members"
  on public.community_members for insert
  to authenticated
  with check (
    exists (
      select 1 from public.community_members admins
      where admins.community_id = community_members.community_id
        and admins.profile_id = auth.uid()
        and admins.role = 'admin'
    )
  );
