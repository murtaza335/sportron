-- SEC-C5: the community post RPCs checked membership against the client-supplied p_user_id
-- and skipped the check entirely when it was null, so anyone could read every post (and the
-- comments RPC had no check at all). Membership is now derived from auth.uid().
-- Signatures and return columns are unchanged (installed builds keep working); p_user_id is
-- accepted but ignored for authorization and for is_liked_by_user.

create or replace function public.get_community_posts(
  p_community_id uuid,
  p_user_id uuid default null,
  p_page int default 1,
  p_page_size int default 20
)
returns table (
  id uuid, community_id uuid, author_id uuid, content text, image_url text, post_type text,
  created_at timestamptz, updated_at timestamptz, author_username text, author_avatar_url text,
  likes_count bigint, comments_count bigint, is_liked_by_user boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offset int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not exists (
    select 1 from public.community_members cm
    where cm.community_id = p_community_id
      and cm.profile_id = auth.uid()
      and cm.approval_status = 'approved'
  ) then
    return;
  end if;

  v_offset := (greatest(p_page, 1) - 1) * p_page_size;

  return query
  select
    cp.id, cp.community_id, cp.author_id, cp.content, cp.image_url, cp.post_type,
    cp.created_at, cp.updated_at,
    p.username as author_username,
    p.avatar_url as author_avatar_url,
    (select count(*) from public.community_post_likes cpl where cpl.post_id = cp.id) as likes_count,
    (select count(*) from public.community_post_comments cpc where cpc.post_id = cp.id) as comments_count,
    exists (
      select 1 from public.community_post_likes cpl
      where cpl.post_id = cp.id and cpl.profile_id = auth.uid()
    ) as is_liked_by_user
  from public.community_posts cp
  join public.profiles p on p.id = cp.author_id
  where cp.community_id = p_community_id
  order by cp.created_at desc
  limit p_page_size offset v_offset;
end;
$$;

create or replace function public.get_community_post_by_id(
  p_post_id uuid,
  p_user_id uuid default null
)
returns table (
  id uuid, community_id uuid, author_id uuid, content text, image_url text, post_type text,
  created_at timestamptz, updated_at timestamptz, author_username text, author_avatar_url text,
  likes_count bigint, comments_count bigint, is_liked_by_user boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select cp0.community_id into v_community_id from public.community_posts cp0 where cp0.id = p_post_id;
  if v_community_id is null then
    return;
  end if;

  if not exists (
    select 1 from public.community_members cm
    where cm.community_id = v_community_id
      and cm.profile_id = auth.uid()
      and cm.approval_status = 'approved'
  ) then
    return;
  end if;

  return query
  select
    cp.id, cp.community_id, cp.author_id, cp.content, cp.image_url, cp.post_type,
    cp.created_at, cp.updated_at,
    p.username as author_username,
    p.avatar_url as author_avatar_url,
    (select count(*) from public.community_post_likes cpl where cpl.post_id = cp.id) as likes_count,
    (select count(*) from public.community_post_comments cpc where cpc.post_id = cp.id) as comments_count,
    exists (
      select 1 from public.community_post_likes cpl
      where cpl.post_id = cp.id and cpl.profile_id = auth.uid()
    ) as is_liked_by_user
  from public.community_posts cp
  join public.profiles p on p.id = cp.author_id
  where cp.id = p_post_id;
end;
$$;

create or replace function public.get_community_post_comments(p_post_id uuid)
returns table (
  id uuid, post_id uuid, profile_id uuid, content text, created_at timestamptz,
  username text, avatar_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select cp.community_id into v_community_id from public.community_posts cp where cp.id = p_post_id;
  if v_community_id is null then
    return;
  end if;

  if not exists (
    select 1 from public.community_members cm
    where cm.community_id = v_community_id
      and cm.profile_id = auth.uid()
      and cm.approval_status = 'approved'
  ) then
    return;
  end if;

  return query
  select cpc.id, cpc.post_id, cpc.profile_id, cpc.content, cpc.created_at, p.username, p.avatar_url
  from public.community_post_comments cpc
  join public.profiles p on p.id = cpc.profile_id
  where cpc.post_id = p_post_id
  order by cpc.created_at asc;
end;
$$;

revoke all on function public.get_community_posts(uuid, uuid, int, int) from public, anon;
revoke all on function public.get_community_post_by_id(uuid, uuid) from public, anon;
revoke all on function public.get_community_post_comments(uuid) from public, anon;
grant execute on function public.get_community_posts(uuid, uuid, int, int) to authenticated;
grant execute on function public.get_community_post_by_id(uuid, uuid) to authenticated;
grant execute on function public.get_community_post_comments(uuid) to authenticated;
