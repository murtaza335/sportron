-- SEC-C2: the self-insert policy for approved members never checked community visibility,
-- so any user could insert themselves as an approved member of a RESTRICTED community.
--
-- Allowed self-inserts as 'approved' member now:
--   * the community is public, or
--   * the user holds an invite to that community (legacy respondToInvite path in installed
--     builds updates the invite to accepted first, then inserts the member row).
-- The newer respond_to_community_invite RPC is SECURITY DEFINER and is unaffected.

drop policy if exists "Users can join public communities" on public.community_members;
create policy "Users can join public communities"
  on public.community_members for insert
  to authenticated
  with check (
    auth.uid() = profile_id
    and role = 'member'
    and approval_status = 'approved'
    and (
      exists (
        select 1 from public.communities c
        where c.id = community_members.community_id
          and c.visibility = 'public'
      )
      or exists (
        select 1 from public.community_invites i
        where i.community_id = community_members.community_id
          and i.invitee_id = auth.uid()
          and i.status in ('pending', 'accepted')
      )
    )
  );

-- Audit helper for the owner (read-only; run manually, nothing is deleted automatically):
--   select cm.* from community_members cm join communities c on c.id = cm.community_id
--   where c.visibility = 'restricted' and cm.profile_id <> c.created_by
--     and not exists (select 1 from community_join_requests r where r.community_id = cm.community_id
--                     and r.user_id = cm.profile_id and r.status = 'approved')
--     and not exists (select 1 from community_invites i where i.community_id = cm.community_id
--                     and i.invitee_id = cm.profile_id and i.status = 'accepted');
