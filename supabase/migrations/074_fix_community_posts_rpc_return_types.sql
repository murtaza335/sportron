-- Fix RPC return types for community posts
-- Run this after migration 073 (which created the tables)
-- This updates the RPC functions to use RETURNS TABLE with explicit columns
-- instead of RETURNS SETOF RECORD (which causes "materialize mode required" error)
-- Must DROP first because Postgres doesn't allow changing return type

drop function if exists public.get_community_posts(uuid, uuid, int, int);
drop function if exists public.get_community_post_by_id(uuid, uuid);

-- RPC: get_community_posts (with explicit return table)
create function public.get_community_posts(
  p_community_id uuid,
  p_user_id uuid default null,
  p_page int default 1,
  p_page_size int default 20
)
returns table (
  id uuid,
  community_id uuid,
  author_id uuid,
  content text,
  image_url text,
  post_type text,
  created_at timestamptz,
  updated_at timestamptz,
  author_username text,
  author_avatar_url text,
  likes_count bigint,
  comments_count bigint,
  is_liked_by_user boolean
)
language plpgsql
security definer
as $$
declare
  v_offset int;
  v_is_member boolean;
begin
  -- Check membership
  select exists (
    select 1 from public.community_members cm 
    where cm.community_id = p_community_id 
    and cm.profile_id = p_user_id 
    and cm.approval_status = 'approved'
  ) into v_is_member;

  if not v_is_member and p_user_id is not null then
    return;
  end if;

  v_offset := (p_page - 1) * p_page_size;

  return query
  select 
    cp.id,
    cp.community_id,
    cp.author_id,
    cp.content,
    cp.image_url,
    cp.post_type,
    cp.created_at,
    cp.updated_at,
    p.username as author_username,
    p.avatar_url as author_avatar_url,
    (
      select count(*) from public.community_post_likes cpl 
      where cpl.post_id = cp.id
    ) as likes_count,
    (
      select count(*) from public.community_post_comments cpc 
      where cpc.post_id = cp.id
    ) as comments_count,
    (
      case when p_user_id is not null then
        exists (
          select 1 from public.community_post_likes cpl 
          where cpl.post_id = cp.id and cpl.profile_id = p_user_id
        )
      else false end
    ) as is_liked_by_user
  from public.community_posts cp
  join public.profiles p on p.id = cp.author_id
  where cp.community_id = p_community_id
  order by cp.created_at desc
  limit p_page_size offset v_offset;
end;
$$;

-- RPC: get_community_post_by_id (with explicit return table)
create function public.get_community_post_by_id(
  p_post_id uuid,
  p_user_id uuid default null
)
returns table (
  id uuid,
  community_id uuid,
  author_id uuid,
  content text,
  image_url text,
  post_type text,
  created_at timestamptz,
  updated_at timestamptz,
  author_username text,
  author_avatar_url text,
  likes_count bigint,
  comments_count bigint,
  is_liked_by_user boolean
)
language plpgsql
security definer
as $$
declare
  v_is_member boolean;
  v_community_id uuid;
begin
  select community_id into v_community_id from public.community_posts where id = p_post_id;
  
  if v_community_id is null then
    return;
  end if;

  select exists (
    select 1 from public.community_members cm 
    where cm.community_id = v_community_id 
    and cm.profile_id = p_user_id 
    and cm.approval_status = 'approved'
  ) into v_is_member;

  if not v_is_member and p_user_id is not null then
    return;
  end if;

  return query
  select 
    cp.id,
    cp.community_id,
    cp.author_id,
    cp.content,
    cp.image_url,
    cp.post_type,
    cp.created_at,
    cp.updated_at,
    p.username as author_username,
    p.avatar_url as author_avatar_url,
    (
      select count(*) from public.community_post_likes cpl 
      where cpl.post_id = cp.id
    ) as likes_count,
    (
      select count(*) from public.community_post_comments cpc 
      where cpc.post_id = cp.id
    ) as comments_count,
    (
      case when p_user_id is not null then
        exists (
          select 1 from public.community_post_likes cpl 
          where cpl.post_id = cp.id and cpl.profile_id = p_user_id
        )
      else false end
    ) as is_liked_by_user
  from public.community_posts cp
  join public.profiles p on p.id = cp.author_id
  where cp.id = p_post_id;
end;
$$;