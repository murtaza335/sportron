-- SEC-H6: 'pending' community_members rows (insertable by anyone into any community) granted
-- read access to matches/pings and let the user ping the whole community, because several
-- policies only checked row existence. Access now requires approval_status = 'approved', and
-- admin checks require an approved admin row. The legacy self-insert of 'pending' member rows
-- is removed: join requests live in community_join_requests (no current client inserts
-- pending member rows).

drop policy if exists "Users can request to join restricted communities" on public.community_members;

-- pings
drop policy if exists "Pings are viewable by community members" on public.pings;
create policy "Pings are viewable by community members"
  on public.pings for select to authenticated
  using (community_id in (
    select community_id from public.community_members
    where profile_id = auth.uid() and approval_status = 'approved'));

drop policy if exists "Community members can send pings" on public.pings;
create policy "Community members can send pings"
  on public.pings for insert to authenticated
  with check (
    auth.uid() = sender_id
    and community_id in (
      select community_id from public.community_members
      where profile_id = auth.uid() and approval_status = 'approved'));

-- community_matches
drop policy if exists "Community matches are viewable by community members" on public.community_matches;
create policy "Community matches are viewable by community members"
  on public.community_matches for select to authenticated
  using (community_id in (
    select community_id from public.community_members
    where profile_id = auth.uid() and approval_status = 'approved'));

drop policy if exists "Community members can record matches" on public.community_matches;
create policy "Community members can record matches"
  on public.community_matches for insert to authenticated
  with check (
    auth.uid() = recorded_by
    and community_id in (
      select community_id from public.community_members
      where profile_id = auth.uid() and approval_status = 'approved'));

-- match likes / comments
drop policy if exists "Community match likes viewable by community members" on public.community_match_likes;
create policy "Community match likes viewable by community members"
  on public.community_match_likes for select to authenticated
  using (exists (
    select 1 from public.community_matches cm
    join public.community_members m on m.community_id = cm.community_id
    where cm.id = community_match_likes.community_match_id
      and m.profile_id = auth.uid() and m.approval_status = 'approved'));

drop policy if exists "Community members can like community matches" on public.community_match_likes;
create policy "Community members can like community matches"
  on public.community_match_likes for insert to authenticated
  with check (
    auth.uid() = profile_id
    and exists (
      select 1 from public.community_matches cm
      join public.community_members m on m.community_id = cm.community_id
      where cm.id = community_match_likes.community_match_id
        and m.profile_id = auth.uid() and m.approval_status = 'approved'));

drop policy if exists "Community match comments viewable by community members" on public.community_match_comments;
create policy "Community match comments viewable by community members"
  on public.community_match_comments for select to authenticated
  using (exists (
    select 1 from public.community_matches cm
    join public.community_members m on m.community_id = cm.community_id
    where cm.id = community_match_comments.community_match_id
      and m.profile_id = auth.uid() and m.approval_status = 'approved'));

drop policy if exists "Community members can comment on community matches" on public.community_match_comments;
create policy "Community members can comment on community matches"
  on public.community_match_comments for insert to authenticated
  with check (
    auth.uid() = profile_id
    and exists (
      select 1 from public.community_matches cm
      join public.community_members m on m.community_id = cm.community_id
      where cm.id = community_match_comments.community_match_id
        and m.profile_id = auth.uid() and m.approval_status = 'approved'));

-- admin checks: require an approved admin row
drop policy if exists "Admins can update their communities" on public.communities;
create policy "Admins can update their communities"
  on public.communities for update to authenticated
  using (exists (
    select 1 from public.community_members m
    where m.community_id = communities.id and m.profile_id = auth.uid()
      and m.role = 'admin' and m.approval_status = 'approved'));

drop policy if exists "Admins can invite members" on public.community_invites;
create policy "Admins can invite members"
  on public.community_invites for insert to authenticated
  with check (
    invited_by = auth.uid()
    and exists (
      select 1 from public.community_members m
      where m.community_id = community_invites.community_id and m.profile_id = auth.uid()
        and m.role = 'admin' and m.approval_status = 'approved'));

drop policy if exists "Admins can view community invites" on public.community_invites;
create policy "Admins can view community invites"
  on public.community_invites for select to authenticated
  using (exists (
    select 1 from public.community_members m
    where m.community_id = community_invites.community_id and m.profile_id = auth.uid()
      and m.role = 'admin' and m.approval_status = 'approved'));

drop policy if exists "Admins can cancel invites" on public.community_invites;
create policy "Admins can cancel invites"
  on public.community_invites for delete to authenticated
  using (
    invited_by = auth.uid()
    and exists (
      select 1 from public.community_members m
      where m.community_id = community_invites.community_id and m.profile_id = auth.uid()
        and m.role = 'admin' and m.approval_status = 'approved'));

drop policy if exists "Users can view their own join requests or admins can view" on public.community_join_requests;
create policy "Users can view their own join requests or admins can view"
  on public.community_join_requests for select to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.community_members m
      where m.community_id = community_join_requests.community_id and m.profile_id = auth.uid()
        and m.role = 'admin' and m.approval_status = 'approved'));

drop policy if exists "Admins can update join requests (approve/reject)" on public.community_join_requests;
create policy "Admins can update join requests (approve/reject)"
  on public.community_join_requests for update to authenticated
  using (exists (
    select 1 from public.community_members m
    where m.community_id = community_join_requests.community_id and m.profile_id = auth.uid()
      and m.role = 'admin' and m.approval_status = 'approved'));
