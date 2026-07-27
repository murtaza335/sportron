-- Community Invites table for admin-initiated member invites
create table if not exists public.community_invites (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (community_id, invitee_id, status)
);

comment on table public.community_invites is 'Admin-initiated invites for community membership';

-- Indexes
create index if not exists idx_community_invites_community_id on public.community_invites(community_id);
create index if not exists idx_community_invites_invitee_id on public.community_invites(invitee_id);
create index if not exists idx_community_invites_invited_by on public.community_invites(invited_by);
create index if not exists idx_community_invites_status on public.community_invites(status);

-- Updated at trigger
drop trigger if exists community_invites_updated_at on public.community_invites;
create trigger community_invites_updated_at
  before update on public.community_invites
  for each row execute function public.handle_updated_at();

-- RLS
alter table public.community_invites enable row level security;

-- Users can view their own pending invites
drop policy if exists "Users can view their own invites" on public.community_invites;
create policy "Users can view their own invites"
  on public.community_invites for select
  using (invitee_id = auth.uid() and status = 'pending');

-- Admins can view all invites for their communities
drop policy if exists "Admins can view community invites" on public.community_invites;
create policy "Admins can view community invites"
  on public.community_invites for select
  using (
    exists (
      select 1 from public.community_members
      where community_id = community_invites.community_id
        and profile_id = auth.uid()
        and role = 'admin'
    )
  );

-- Admins can insert invites (inviting users to their community)
drop policy if exists "Admins can invite members" on public.community_invites;
create policy "Admins can invite members"
  on public.community_invites for insert
  with check (
    invited_by = auth.uid() and
    exists (
      select 1 from public.community_members
      where community_id = community_invites.community_id
        and profile_id = auth.uid()
        and role = 'admin'
    )
  );

-- Invitees can update their own invite status (accept/reject)
drop policy if exists "Invitees can respond to invites" on public.community_invites;
create policy "Invitees can respond to invites"
  on public.community_invites for update
  using (invitee_id = auth.uid() and status = 'pending')
  with check (invitee_id = auth.uid() and status in ('accepted', 'rejected'));

-- Admins can cancel/delete invites they sent
drop policy if exists "Admins can cancel invites" on public.community_invites;
create policy "Admins can cancel invites"
  on public.community_invites for delete
  using (
    invited_by = auth.uid() and
    exists (
      select 1 from public.community_members
      where community_id = community_invites.community_id
        and profile_id = auth.uid()
        and role = 'admin'
    )
  );

-- Function to create invite with duplicate checks
create or replace function public.create_community_invite(
  p_community_id uuid,
  p_invited_by uuid,
  p_invitee_id uuid
) returns public.community_invites
language plpgsql
security definer
as $$
declare
  v_invite public.community_invites;
  v_existing_member public.community_members;
  v_existing_request public.community_join_requests;
  v_existing_invite public.community_invites;
begin
  -- Check if user is already a member
  select * into v_existing_member
  from public.community_members
  where community_id = p_community_id and profile_id = p_invitee_id;
  
  if v_existing_member is not null then
    raise exception 'User is already a member of this community';
  end if;

  -- Check if there's a pending join request
  select * into v_existing_request
  from public.community_join_requests
  where community_id = p_community_id and user_id = p_invitee_id and status = 'pending';
  
  if v_existing_request is not null then
    raise exception 'User already has a pending join request for this community';
  end if;

  -- Check if there's a pending invite
  select * into v_existing_invite
  from public.community_invites
  where community_id = p_community_id and invitee_id = p_invitee_id and status = 'pending';
  
  if v_existing_invite is not null then
    raise exception 'User already has a pending invite for this community';
  end if;

  -- Create the invite
  insert into public.community_invites (community_id, invited_by, invitee_id, status)
  values (p_community_id, p_invited_by, p_invitee_id, 'pending')
  returning * into v_invite;

  return v_invite;
end;
$$;

-- Function to respond to a community invite (accept/reject)
create or replace function public.respond_to_community_invite(
  p_invite_id uuid,
  p_user_id uuid,
  p_accept boolean
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_community_id uuid;
  v_invited_by uuid;
  v_invitee_id uuid;
  v_member_id uuid;
begin
  -- Fetch the pending invite (strict raises no_data_found if no match)
  select community_id, invited_by, invitee_id
  into strict v_community_id, v_invited_by, v_invitee_id
  from public.community_invites
  where id = p_invite_id
    and invitee_id = p_user_id
    and status = 'pending';

  -- Update invite status
  update public.community_invites
  set status = case when p_accept then 'accepted' else 'rejected' end
  where id = p_invite_id;

  -- If accepting, add as member
  if p_accept then
    insert into public.community_members (community_id, profile_id, role, approval_status)
    values (v_community_id, p_user_id, 'member', 'approved')
    returning id into v_member_id;
  end if;

  return jsonb_build_object(
    'community_id', v_community_id,
    'invited_by', v_invited_by,
    'invitee_id', v_invitee_id
  );
exception
  when no_data_found then
    raise exception 'Invite not found or already responded';
end;
$$;