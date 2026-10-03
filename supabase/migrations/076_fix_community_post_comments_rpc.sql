-- Fix RPC return type for get_community_post_comments
-- Change from RETURNS SETOF RECORD to RETURNS TABLE with explicit columns
-- to avoid "materialize mode required" error

drop function if exists public.get_community_post_comments(uuid);

create function public.get_community_post_comments(
  p_post_id uuid
)
returns table (
  id uuid,
  post_id uuid,
  profile_id uuid,
  content text,
  created_at timestamptz,
  username text,
  avatar_url text
)
language plpgsql
security definer
as $$
begin
  return query
  select 
    cpc.id,
    cpc.post_id,
    cpc.profile_id,
    cpc.content,
    cpc.created_at,
    p.username,
    p.avatar_url
  from public.community_post_comments cpc
  join public.profiles p on p.id = cpc.profile_id
  where cpc.post_id = p_post_id
  order by cpc.created_at asc;
end;
$$;
