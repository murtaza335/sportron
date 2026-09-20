-- Community Posts Feed Feature
-- Run this SQL in your Supabase SQL Editor (Dashboard → SQL → New query)

-- Community Posts table
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text,
  image_url text,
  post_type text not null default 'text' check (post_type in ('text', 'photo', 'match')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists community_posts_community_created_idx 
  on public.community_posts (community_id, created_at desc);
create index if not exists community_posts_author_idx 
  on public.community_posts (author_id);

-- RLS
alter table public.community_posts enable row level security;

-- Policies: members can read, members can insert, author/admin can delete
create policy "Members can view community posts"
  on public.community_posts for select
  to authenticated
  using (
    exists (
      select 1 from public.community_members 
      where community_id = community_posts.community_id 
      and profile_id = auth.uid() 
      and approval_status = 'approved'
    )
  );

create policy "Members can create posts"
  on public.community_posts for insert
  to authenticated
  with check (
    auth.uid() = author_id and
    exists (
      select 1 from public.community_members 
      where community_id = community_posts.community_id 
      and profile_id = auth.uid() 
      and approval_status = 'approved'
    )
  );

create policy "Author or admin can delete posts"
  on public.community_posts for delete
  to authenticated
  using (
    auth.uid() = author_id or
    exists (
      select 1 from public.community_members 
      where community_id = community_posts.community_id 
      and profile_id = auth.uid() 
      and approval_status = 'approved'
      and role = 'admin'
    )
  );

-- Community Post Likes
create table if not exists public.community_post_likes (
  post_id uuid references public.community_posts(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

alter table public.community_post_likes enable row level security;

create policy "Likes are viewable by authenticated users"
  on public.community_post_likes for select
  to authenticated
  using (true);

create policy "Users can insert their own likes"
  on public.community_post_likes for insert
  to authenticated
  with check (auth.uid() = profile_id);

create policy "Users can delete their own likes"
  on public.community_post_likes for delete
  to authenticated
  using (auth.uid() = profile_id);

-- Community Post Comments
create table if not exists public.community_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.community_posts(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists community_post_comments_post_created_idx 
  on public.community_post_comments (post_id, created_at asc);

alter table public.community_post_comments enable row level security;

create policy "Comments are viewable by authenticated users"
  on public.community_post_comments for select
  to authenticated
  using (true);

create policy "Users can insert their own comments"
  on public.community_post_comments for insert
  to authenticated
  with check (auth.uid() = profile_id);

create policy "Users can update their own comments"
  on public.community_post_comments for update
  to authenticated
  using (auth.uid() = profile_id);

create policy "Users can delete their own comments"
  on public.community_post_comments for delete
  to authenticated
  using (auth.uid() = profile_id);

-- Auto-update updated_at on community_posts
create trigger community_posts_updated_at
  before update on public.community_posts
  for each row execute function public.handle_updated_at();

-- Add to realtime publication for live feed
alter publication supabase_realtime add table public.community_posts;
alter publication supabase_realtime add table public.community_post_likes;
alter publication supabase_realtime add table public.community_post_comments;

-- RPC: get_community_posts
create or replace function public.get_community_posts(
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
    select 1 from public.community_members 
    where community_id = p_community_id 
    and profile_id = p_user_id 
    and approval_status = 'approved'
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

-- RPC: get_community_post_by_id
create or replace function public.get_community_post_by_id(
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
    select 1 from public.community_members 
    where community_id = v_community_id 
    and profile_id = p_user_id 
    and approval_status = 'approved'
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

-- RPC: get_community_post_comments
create or replace function public.get_community_post_comments(
  p_post_id uuid
)
returns setof record
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