-- SEC-M5: community admins could (a) insert ANY user as a member without consent or any
-- request/invite, and (b) edit the win/loss statistics of any member through the broad
-- "Admins can manage community members" UPDATE policy.
--
--  * Admin INSERT now requires: role 'member', status 'approved', an approved admin row, and an
--    existing join request (pending/approved) from that user - exactly what the app does when
--    approving a request. Invites are accepted by the invitee (or the SECURITY DEFINER RPC).
--  * A guard trigger keeps matches_played / wins / losses / win_ratio immutable for direct
--    client updates (silently reverted, never raises, so installed builds keep working). Writes
--    from other triggers (match approval; depth > 1) and the service role pass through.

drop policy if exists "Admins can add community members" on public.community_members;
create policy "Admins can add community members"
  on public.community_members for insert
  to authenticated
  with check (
    role = 'member'
    and approval_status = 'approved'
    and exists (
      select 1 from public.community_members admins
      where admins.community_id = community_members.community_id
        and admins.profile_id = auth.uid()
        and admins.role = 'admin'
        and admins.approval_status = 'approved'
    )
    and exists (
      select 1 from public.community_join_requests r
      where r.community_id = community_members.community_id
        and r.user_id = community_members.profile_id
        and r.status in ('pending', 'approved')
    )
  );

drop policy if exists "Admins can manage community members" on public.community_members;
create policy "Admins can manage community members"
  on public.community_members for update
  to authenticated
  using (
    exists (
      select 1 from public.community_members admins
      where admins.community_id = community_members.community_id
        and admins.profile_id = auth.uid()
        and admins.role = 'admin'
        and admins.approval_status = 'approved'
    )
  )
  with check (
    exists (
      select 1 from public.community_members admins
      where admins.community_id = community_members.community_id
        and admins.profile_id = auth.uid()
        and admins.role = 'admin'
        and admins.approval_status = 'approved'
    )
  );

drop policy if exists "Admins can remove community members" on public.community_members;
create policy "Admins can remove community members"
  on public.community_members for delete
  to authenticated
  using (
    exists (
      select 1 from public.community_members admins
      where admins.community_id = community_members.community_id
        and admins.profile_id = auth.uid()
        and admins.role = 'admin'
        and admins.approval_status = 'approved'
    )
  );

create or replace function public.guard_community_member_stats()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return new;
  end if;
  new.matches_played := old.matches_played;
  new.wins := old.wins;
  new.losses := old.losses;
  new.win_ratio := old.win_ratio;
  return new;
end;
$$;

revoke all on function public.guard_community_member_stats() from public, anon, authenticated;

drop trigger if exists trg_a_guard_community_member_stats on public.community_members;
create trigger trg_a_guard_community_member_stats
  before update on public.community_members
  for each row execute function public.guard_community_member_stats();
