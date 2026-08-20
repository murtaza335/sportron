-- Run this SQL in your Supabase SQL Editor (Dashboard → SQL → New query)

-- Profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
   username text not null,
  bio text,
  role text check (role in ('student', 'teacher')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Matches
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  player_partner_id uuid references public.profiles (id) on delete set null,
  opponent_id uuid references public.profiles (id) on delete set null,
  opponent_partner_id uuid references public.profiles (id) on delete set null,
  opponent_guest_name text,
  match_format text not null default 'doubles' check (match_format in ('singles', 'doubles')),
  sport text not null default 'table_tennis',
  custom_sport_name text,
  team_a_name text,
  team_b_name text,
  player_score integer not null default 0 check (player_score >= 0),
  opponent_score integer not null default 0 check (opponent_score >= 0),
  is_public boolean not null default true,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'disputed')),
  created_at timestamptz not null default now(),
  constraint opponent_specified check (
    opponent_id is not null or (opponent_guest_name is not null and length(trim(opponent_guest_name)) > 0)
  )
);

create index if not exists matches_created_by_idx on public.matches (created_by);
create index if not exists matches_is_public_idx on public.matches (is_public);
create index if not exists matches_created_at_idx on public.matches (created_at desc);

create unique index if not exists profiles_username_idx on public.profiles (username);

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.matches enable row level security;

-- Profiles policies
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- Matches policies
create policy "Public matches are viewable by authenticated users"
  on public.matches for select
  to authenticated
  using (
    is_public = true 
    or created_by = auth.uid() 
    or player_id = auth.uid() 
    or player_partner_id = auth.uid() 
    or opponent_id = auth.uid() 
    or opponent_partner_id = auth.uid()
  );

create policy "Users can insert their own matches"
  on public.matches for insert
  to authenticated
  with check (auth.uid() = created_by and auth.uid() = player_id);

create policy "Users can update matches they created or participated in as opponents"
  on public.matches for update
  to authenticated
  using (
    auth.uid() = created_by 
    or auth.uid() = opponent_id 
    or auth.uid() = opponent_partner_id
  );

create policy "Users can delete their own matches"
  on public.matches for delete
  to authenticated
  using (auth.uid() = created_by);

-- Auto-update updated_at on profiles
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- Match Likes
create table if not exists public.match_likes (
  match_id uuid references public.matches(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, profile_id)
);

-- Match Comments
create table if not exists public.match_comments (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references public.matches(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.match_likes enable row level security;
alter table public.match_comments enable row level security;

-- Policies for match_likes
create policy "Likes are viewable by authenticated users"
  on public.match_likes for select
  to authenticated
  using (true);

create policy "Users can insert their own likes"
  on public.match_likes for insert
  to authenticated
  with check (auth.uid() = profile_id);

create policy "Users can delete their own likes"
  on public.match_likes for delete
  to authenticated
  using (auth.uid() = profile_id);

-- Policies for match_comments
create policy "Comments are viewable by authenticated users"
  on public.match_comments for select
  to authenticated
  using (true);

create policy "Users can insert their own comments"
  on public.match_comments for insert
  to authenticated
  with check (auth.uid() = profile_id);

-- Auto-update comments policies
create policy "Users can update their own comments"
  on public.match_comments for update
  to authenticated
  using (auth.uid() = profile_id);

create policy "Users can delete their own comments"
  on public.match_comments for delete
  to authenticated
  using (auth.uid() = profile_id);

