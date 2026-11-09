-- SEC-H1: get_community_matches / get_community_match_by_id / get_match_comments were
-- SECURITY DEFINER without any membership check and trusted the client-supplied p_user_id
-- (so another user's pending matches could be requested). Any user could read the matches and
-- comments of any community, including restricted ones.
--
-- Approach: keep the original implementations unchanged under *_impl names (execute revoked
-- from all client roles) and put thin guarded wrappers under the original names/signatures:
-- the caller must be an approved member of the community (via auth.uid()) and the impl is
-- invoked with auth.uid() instead of p_user_id. Return columns are identical, so installed
-- builds keep working.

alter function public.get_community_matches(uuid, int, int, uuid) rename to get_community_matches_impl;
alter function public.get_community_match_by_id(uuid, uuid) rename to get_community_match_by_id_impl;
alter function public.get_match_comments(uuid) rename to get_match_comments_impl;

revoke all on function public.get_community_matches_impl(uuid, int, int, uuid) from public, anon, authenticated;
revoke all on function public.get_community_match_by_id_impl(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_match_comments_impl(uuid) from public, anon, authenticated;

create or replace function public.get_community_matches(
  p_community_id uuid,
  p_page int default 1,
  p_page_size int default 20,
  p_user_id uuid default null
)
returns table (
  id uuid,
  community_id uuid,
  recorded_by uuid,
  player_id uuid,
  player_partner_id uuid,
  opponent_id uuid,
  opponent_partner_id uuid,
  sport text,
  custom_sport_name text,
  team_a_name text,
  team_b_name text,
  player_score int,
  opponent_score int,
  approval_status text,
  created_at timestamptz,
  updated_at timestamptz,
  recorder_username text,
  recorder_avatar_url text,
  player_username text,
  player_avatar_url text,
  player_partner_username text,
  player_partner_avatar_url text,
  opponent_username text,
  opponent_avatar_url text,
  opponent_partner_username text,
  opponent_partner_avatar_url text,
  likes_count bigint,
  comments_count bigint,
  is_liked_by_user boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not exists (
    select 1 from public.community_members cm
    where cm.community_id = p_community_id and cm.profile_id = auth.uid()
      and cm.approval_status = 'approved'
  ) then
    return;
  end if;
  return query select * from public.get_community_matches_impl(p_community_id, p_page, p_page_size, auth.uid());
end;
$$;

create or replace function public.get_community_match_by_id(
  p_match_id uuid,
  p_user_id uuid default null
)
returns table (
  id uuid,
  community_id uuid,
  recorded_by uuid,
  player_id uuid,
  player_partner_id uuid,
  opponent_id uuid,
  opponent_partner_id uuid,
  sport text,
  custom_sport_name text,
  team_a_name text,
  team_b_name text,
  player_score int,
  opponent_score int,
  approval_status text,
  created_at timestamptz,
  updated_at timestamptz,
  recorder_username text,
  recorder_avatar_url text,
  player_username text,
  player_avatar_url text,
  player_partner_username text,
  player_partner_avatar_url text,
  opponent_username text,
  opponent_avatar_url text,
  opponent_partner_username text,
  opponent_partner_avatar_url text,
  likes_count bigint,
  comments_count bigint,
  is_liked_by_user boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not exists (
    select 1 from public.community_matches m
    join public.community_members cm on cm.community_id = m.community_id
    where m.id = p_match_id and cm.profile_id = auth.uid() and cm.approval_status = 'approved'
  ) then
    return;
  end if;
  return query select * from public.get_community_match_by_id_impl(p_match_id, auth.uid());
end;
$$;

create or replace function public.get_match_comments(p_match_id uuid)
returns table (
  id uuid,
  community_match_id uuid,
  profile_id uuid,
  content text,
  created_at timestamptz,
  username text,
  avatar_url text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not exists (
    select 1 from public.community_matches m
    join public.community_members cm on cm.community_id = m.community_id
    where m.id = p_match_id and cm.profile_id = auth.uid() and cm.approval_status = 'approved'
  ) then
    return;
  end if;
  return query select * from public.get_match_comments_impl(p_match_id);
end;
$$;

revoke all on function public.get_community_matches(uuid, int, int, uuid) from public, anon;
revoke all on function public.get_community_match_by_id(uuid, uuid) from public, anon;
revoke all on function public.get_match_comments(uuid) from public, anon;
grant execute on function public.get_community_matches(uuid, int, int, uuid) to authenticated;
grant execute on function public.get_community_match_by_id(uuid, uuid) to authenticated;
grant execute on function public.get_match_comments(uuid) to authenticated;
