-- Enforce consistency between pending invites and join requests.
--
-- The invite path is already guarded: create_community_invite (013) rejects an
-- invite when the user already has a pending join request or a pending invite.
-- The request path was NOT guarded: requestToJoinCommunity inserts directly
-- into community_join_requests with only an RLS self-insert policy, so a user
-- could create a join request even while holding a pending invite, leaving both
-- rows in the DB.
--
-- This trigger blocks creating a join request while a pending invite exists,
-- making the two flows symmetric at the database level.

create or replace function public.block_join_request_if_pending_invite()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.community_invites
    where community_id = new.community_id
      and invitee_id = new.user_id
      and status = 'pending'
  ) then
    raise exception 'You already have a pending invite to join this community';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_community_join_requests_block_pending_invite on public.community_join_requests;
create trigger trg_community_join_requests_block_pending_invite
  before insert on public.community_join_requests
  for each row execute function public.block_join_request_if_pending_invite();
