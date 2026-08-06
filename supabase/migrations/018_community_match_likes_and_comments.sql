-- ============================================================
-- 1. COMMUNITY MATCH LIKES
-- ============================================================
create table if not exists public.community_match_likes (
  community_match_id uuid not null references public.community_matches(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (community_match_id, profile_id)
);

comment on table public.community_match_likes is 'Likes on community matches (actually 'love' reactions in the app)';

-- ============================================================
-- 2. COMMUNITY MATCH COMMENTS
-- ============================================================
create table if not exists public.community_match_comments (
  id uuid primary key default gen_random_uuid(),
  community_match_id uuid not null references public.community_matches(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (btrim(content) <> ''),
  created_at timestamptz not null default now()
);

comment on table public.community_match_comments is 'Comments on community matches';

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_community_match_likes_profile_id
  on public.community_match_likes (profile_id);

create index if not exists idx_community_match_likes_created_at
  on public.community_match_likes (created_at desc);

create index if not exists idx_community_match_comments_match_id
  on public.community_match_comments (community_match_id, created_at);

create index if not exists idx_community_match_comments_profile_id
  on public.community_match_comments (profile_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.community_match_likes enable row level security;
alter table public.community_match_comments enable row level security;

-- ============================================================
-- RLS POLICIES — Community Match Likes
-- ============================================================
create policy "Community match likes viewable by community members"
  on public.community_match_likes for select
  to authenticated
  using (
    exists (
      select 1 from public.community_matches cm
      where cm.id = community_match_likes.community_match_id
        and cm.community_id in (
          select community_id from public.community_members
          where profile_id = auth.uid()
        )
    )
  );

create policy "Community members can like community matches"
  on public.community_match_likes for insert
  to authenticated
  with check (
    auth.uid() = profile_id
    and exists (
      select 1 from public.community_matches cm
      where cm.id = community_match_likes.community_match_id
        and cm.community_id in (
          select community_id from public.community_members
          where profile_id = auth.uid()
        )
    )
  );

create policy "Users can unlike their own community match likes"
  on public.community_match_likes for delete
  to authenticated
  using (auth.uid() = profile_id);

-- ============================================================
-- RLS POLICIES — Community Match Comments
-- ============================================================
create policy "Community match comments viewable by community members"
  on public.community_match_comments for select
  to authenticated
  using (
    exists (
      select 1 from public.community_matches cm
      where cm.id = community_match_comments.community_match_id
        and cm.community_id in (
          select community_id from public.community_members
          where profile_id = auth.uid()
        )
    )
  );

create policy "Community members can comment on community matches"
  on public.community_match_comments for insert
  to authenticated
  with check (
    auth.uid() = profile_id
    and exists (
      select 1 from public.community_matches cm
      where cm.id = community_match_comments.community_match_id
        and cm.community_id in (
          select community_id from public.community_members
          where profile_id = auth.uid()
        )
    )
  );

create policy "Users can delete their own community match comments"
  on public.community_match_comments for delete
  to authenticated
  using (auth.uid() = profile_id);