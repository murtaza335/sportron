-- ============================================================
-- Migration 002: WhosIn Enhanced Schema
-- 
-- This migration evolves the T3Seecs schema to the WhosIn v1.0.0
-- data model as defined in the SRS, adding:
--   1. Profiles enhancements (display_name, sport_interests,
--      completed_sessions, total_committed_sessions)
--   2. Sessions (Find a Match — marketplace match requests)
--   3. Commitments ("I'm in" — user commitment to a session)
--   4. Communities (user-created groups)
--   5. Community Members (junction with role, stats, approval)
--   6. Community Matches (recorded matches w/ approval flow)
--   7. Pings (broadcast notifications within a community)
--   8. Community Join Requests (approval flow for restricted)
--   9. In-App Notifications (expanded type check constraint)
--
-- All existing tables (matches, match_likes, match_comments)
-- are preserved for backward compatibility.
-- ============================================================

-- ============================================================
-- 1. PROFILES ENHANCEMENTS
-- ============================================================
alter table public.profiles
  add column if not exists display_name text,
  add column if not exists sport_interests text[] not null default '{}',
  add column if not exists completed_sessions int not null default 0,
  add column if not exists total_committed_sessions int not null default 0;

comment on column public.profiles.display_name is 'User''s real/display name';
comment on column public.profiles.sport_interests is 'Preferred sports selected during onboarding';
comment on column public.profiles.completed_sessions is 'Count of sessions the user actually completed';
comment on column public.profiles.total_committed_sessions is 'Count of sessions the user committed to';

-- ============================================================
-- 2. SESSIONS (Find a Match — marketplace match requests)
-- ============================================================
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  sport text not null,
  location text not null,
  date_time timestamptz not null,
  max_participants int not null default 2,
  description text,
  status text not null default 'open'
    check (status in ('open', 'full', 'closed', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.sessions is 'Find a Match — marketplace-style match request posts';
comment on column public.sessions.max_participants is 'Capped number of participants for this session';
comment on column public.sessions.status is 'Lifecycle: open → full/completed/cancelled';

-- ============================================================
-- 3. COMMITMENTS ("I'm in")
-- ============================================================
create table if not exists public.commitments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  feedback_status text
    check (feedback_status in ('showed_up', 'no_show')),
  feedback_provided_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, user_id)
);

comment on table public.commitments is 'Tracks "I''m in" — user commitment to a session';
comment on column public.commitments.feedback_status is 'Post-session feedback: showed_up or no_show';
comment on column public.commitments.feedback_provided_by is 'Who provided the feedback (session creator or opponent)';

-- FAM-3: A user can be actively committed to only one session at a time
create unique index if not exists idx_commitments_one_active_per_user
  on public.commitments (user_id)
  where status = 'accepted';

-- ============================================================
-- 4. COMMUNITIES
-- ============================================================
create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  image_url text,
  visibility text not null default 'public'
    check (visibility in ('public', 'restricted')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.communities is 'User-created groups for social play and/or informal leagues';

-- ============================================================
-- 5. COMMUNITY MEMBERS (junction table)
-- ============================================================
create table if not exists public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member'
    check (role in ('admin', 'member')),
  approval_status text not null default 'approved'
    check (approval_status in ('approved', 'pending', 'rejected')),
  matches_played int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  win_ratio numeric(5,2) not null default 0,
  joined_at timestamptz not null default now(),
  primary key (community_id, profile_id)
);

comment on table public.community_members is 'Junction table: profiles <-> communities with role and per-community stats';
comment on column public.community_members.approval_status is 'For restricted communities, tracks join request approval state';
comment on column public.community_members.matches_played is 'Number of approved matches within this community';
comment on column public.community_members.win_ratio is 'Wins / (Wins + Losses) * 100, auto-computed';

-- ============================================================
-- 6. COMMUNITY MATCHES (recorded matches w/ approval)
-- ============================================================
create table if not exists public.community_matches (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  recorded_by uuid not null references public.profiles(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  player_partner_id uuid references public.profiles(id) on delete set null,
  opponent_id uuid not null references public.profiles(id) on delete cascade,
  opponent_partner_id uuid references public.profiles(id) on delete set null,
  sport text not null default 'table_tennis',
  custom_sport_name text,
  team_a_name text,
  team_b_name text,
  player_score int not null default 0 check (player_score >= 0),
  opponent_score int not null default 0 check (opponent_score >= 0),
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'disputed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.community_matches is 'Matches recorded within a community, requiring opponent approval for leaderboard inclusion';
comment on column public.community_matches.approval_status is 'pending → approved (counts toward leaderboard) / disputed (does not count)';

-- ============================================================
-- 7. PINGS
-- ============================================================
create table if not exists public.pings (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

comment on table public.pings is 'Broadcast notifications sent by a community member to all other members';

-- ============================================================
-- 8. COMMUNITY JOIN REQUESTS
-- ============================================================
create table if not exists public.community_join_requests (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (community_id, user_id)
);

comment on table public.community_join_requests is 'Join requests for restricted/approval-required communities';

-- ============================================================
-- 9. EXPAND IN-APP NOTIFICATION TYPES
-- ============================================================
-- Drop old constraint and re-create with new types
alter table public.in_app_notifications
  drop constraint if exists in_app_notifications_type_check;

alter table public.in_app_notifications
  add constraint in_app_notifications_type_check
  check (type in (
    -- Existing T3Seecs types
    'match_pending', 'match_approved', 'match_rejected',
    'match_liked', 'match_commented',
    -- WhosIn Find a Match types
    'session_application', 'session_accepted', 'session_rejected',
    'session_reminder', 'feedback_prompt',
    -- WhosIn Community types
    'ping', 'join_request', 'join_approved', 'join_rejected',
    'match_approval_request', 'match_approved_community',
    'match_disputed', 'member_removed', 'community_deleted',
    'admin_transferred'
  ));

-- ============================================================
-- INDEXES
-- ============================================================

-- Sessions
create index if not exists idx_sessions_created_by on public.sessions(created_by);
create index if not exists idx_sessions_status on public.sessions(status);
create index if not exists idx_sessions_date_time on public.sessions(date_time);
create index if not exists idx_sessions_sport on public.sessions(sport);

-- Commitments
create index if not exists idx_commitments_session_id on public.commitments(session_id);
create index if not exists idx_commitments_user_id on public.commitments(user_id);
create index if not exists idx_commitments_status on public.commitments(status);

-- Communities
create index if not exists idx_communities_created_by on public.communities(created_by);
create index if not exists idx_communities_visibility on public.communities(visibility);

-- Community Members
create index if not exists idx_community_members_community_id on public.community_members(community_id);
create index if not exists idx_community_members_profile_id on public.community_members(profile_id);
create index if not exists idx_community_members_role on public.community_members(role);
create index if not exists idx_community_members_win_ratio on public.community_members(win_ratio desc);

-- Community Matches
create index if not exists idx_community_matches_community_id on public.community_matches(community_id);
create index if not exists idx_community_matches_recorded_by on public.community_matches(recorded_by);
create index if not exists idx_community_matches_approval_status on public.community_matches(approval_status);
create index if not exists idx_community_matches_created_at on public.community_matches(created_at desc);

-- Pings
create index if not exists idx_pings_community_id on public.pings(community_id);
create index if not exists idx_pings_sender_id on public.pings(sender_id);
create index if not exists idx_pings_created_at on public.pings(created_at desc);

-- Community Join Requests
create index if not exists idx_community_join_requests_community_id on public.community_join_requests(community_id);
create index if not exists idx_community_join_requests_user_id on public.community_join_requests(user_id);
create index if not exists idx_community_join_requests_status on public.community_join_requests(status);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.sessions enable row level security;
alter table public.commitments enable row level security;
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.community_matches enable row level security;
alter table public.pings enable row level security;
alter table public.community_join_requests enable row level security;

-- ============================================================
-- RLS POLICIES — Sessions
-- ============================================================
create policy "Sessions are viewable by authenticated users"
  on public.sessions for select
  to authenticated
  using (true);

create policy "Users can create sessions"
  on public.sessions for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "Creators can update their sessions"
  on public.sessions for update
  to authenticated
  using (auth.uid() = created_by);

create policy "Creators can delete their sessions"
  on public.sessions for delete
  to authenticated
  using (auth.uid() = created_by);

-- ============================================================
-- RLS POLICIES — Commitments
-- ============================================================
create policy "Users can view their own commitments or session creator can view"
  on public.commitments for select
  to authenticated
  using (
    auth.uid() = user_id
    or auth.uid() in (
      select created_by from public.sessions where id = session_id
    )
  );

create policy "Users can commit to sessions"
  on public.commitments for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own commitments"
  on public.commitments for update
  to authenticated
  using (auth.uid() = user_id);

create policy "Session creators can update commitments (accept/reject/feedback)"
  on public.commitments for update
  to authenticated
  using (
    auth.uid() in (
      select created_by from public.sessions where id = session_id
    )
  );

create policy "Users can delete their own commitments"
  on public.commitments for delete
  to authenticated
  using (auth.uid() = user_id);

-- ============================================================
-- RLS POLICIES — Communities
-- ============================================================
create policy "Communities are viewable by authenticated users"
  on public.communities for select
  to authenticated
  using (true);

create policy "Users can create communities"
  on public.communities for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "Admins can update their communities"
  on public.communities for update
  to authenticated
  using (
    exists (
      select 1 from public.community_members
      where community_id = communities.id
        and profile_id = auth.uid()
        and role = 'admin'
    )
  );

create policy "Creator can delete their communities"
  on public.communities for delete
  to authenticated
  using (auth.uid() = created_by);

-- ============================================================
-- RLS POLICIES — Community Members
-- ============================================================
create policy "Community members are viewable by authenticated users"
  on public.community_members for select
  to authenticated
  using (true);

create policy "Users can request to join (insert self)"
  on public.community_members for insert
  to authenticated
  with check (auth.uid() = profile_id);

create policy "Admins can manage community members"
  on public.community_members for update
  to authenticated
  using (
    exists (
      select 1 from public.community_members admins
      where admins.community_id = community_members.community_id
        and admins.profile_id = auth.uid()
        and admins.role = 'admin'
    )
  );

create policy "Admins can remove community members"
  on public.community_members for delete
  to authenticated
  using (
    exists (
      select 1 from public.community_members admins
      where admins.community_id = community_members.community_id
        and admins.profile_id = auth.uid()
        and admins.role = 'admin'
    )
  );

create policy "Users can leave (delete themselves)"
  on public.community_members for delete
  to authenticated
  using (auth.uid() = profile_id);

-- ============================================================
-- RLS POLICIES — Community Matches
-- ============================================================
create policy "Community matches are viewable by community members"
  on public.community_matches for select
  to authenticated
  using (
    community_id in (
      select community_id from public.community_members where profile_id = auth.uid()
    )
  );

create policy "Community members can record matches"
  on public.community_matches for insert
  to authenticated
  with check (
    community_id in (
      select community_id from public.community_members where profile_id = auth.uid()
    )
    and auth.uid() = recorded_by
  );

create policy "Match participants can update approval status"
  on public.community_matches for update
  to authenticated
  using (
    auth.uid() = opponent_id
    or auth.uid() = opponent_partner_id
    or auth.uid() = recorded_by
  );

-- ============================================================
-- RLS POLICIES — Pings
-- ============================================================
create policy "Pings are viewable by community members"
  on public.pings for select
  to authenticated
  using (
    community_id in (
      select community_id from public.community_members where profile_id = auth.uid()
    )
  );

create policy "Community members can send pings"
  on public.pings for insert
  to authenticated
  with check (
    community_id in (
      select community_id from public.community_members where profile_id = auth.uid()
    )
    and auth.uid() = sender_id
  );

-- ============================================================
-- RLS POLICIES — Community Join Requests
-- ============================================================
create policy "Users can view their own join requests or admins can view"
  on public.community_join_requests for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.community_members
      where community_id = community_join_requests.community_id
        and profile_id = auth.uid()
        and role = 'admin'
    )
  );

create policy "Users can create join requests"
  on public.community_join_requests for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Admins can update join requests (approve/reject)"
  on public.community_join_requests for update
  to authenticated
  using (
    exists (
      select 1 from public.community_members
      where community_id = community_join_requests.community_id
        and profile_id = auth.uid()
        and role = 'admin'
    )
  );

-- ============================================================
-- TRIGGERS — Auto-update updated_at
-- ============================================================
create trigger sessions_updated_at
  before update on public.sessions
  for each row execute function public.handle_updated_at();

create trigger commitments_updated_at
  before update on public.commitments
  for each row execute function public.handle_updated_at();

create trigger communities_updated_at
  before update on public.communities
  for each row execute function public.handle_updated_at();

create trigger community_matches_updated_at
  before update on public.community_matches
  for each row execute function public.handle_updated_at();

create trigger community_join_requests_updated_at
  before update on public.community_join_requests
  for each row execute function public.handle_updated_at();

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- ----------------------------------------------------------
-- Auto-compute win_ratio when wins/losses change
-- ----------------------------------------------------------
create or replace function public.compute_win_ratio()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (new.wins + new.losses) > 0 then
    new.win_ratio = round(
      (new.wins::numeric / (new.wins + new.losses)) * 100, 2
    );
  else
    new.win_ratio = 0;
  end if;
  return new;
end;
$$;

create trigger trg_community_members_compute_win_ratio
  before insert or update of wins, losses, matches_played
  on public.community_members
  for each row
  execute function public.compute_win_ratio();

-- ----------------------------------------------------------
-- Update community member stats when a community match
-- is approved
-- ----------------------------------------------------------
create or replace function public.handle_approved_community_match()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_winner_id uuid;
  v_loser_id uuid;
  v_winner_partner_id uuid;
  v_loser_partner_id uuid;
begin
  if new.approval_status = 'approved' and old.approval_status != 'approved' then
    -- Determine winner
    if new.player_score > new.opponent_score then
      v_winner_id := new.player_id;
      v_loser_id := new.opponent_id;
      v_winner_partner_id := new.player_partner_id;
      v_loser_partner_id := new.opponent_partner_id;
    elsif new.opponent_score > new.player_score then
      v_winner_id := new.opponent_id;
      v_loser_id := new.player_id;
      v_winner_partner_id := new.opponent_partner_id;
      v_loser_partner_id := new.player_partner_id;
    else
      return new; -- Draw — no stat changes
    end if;

    -- Update winner(s)
    update public.community_members
    set
      matches_played = matches_played + 1,
      wins = wins + 1
    where
      community_id = new.community_id
      and profile_id = v_winner_id;

    -- If doubles, update partner too
    if v_winner_partner_id is not null then
      update public.community_members
      set
        matches_played = matches_played + 1,
        wins = wins + 1
      where
        community_id = new.community_id
        and profile_id = v_winner_partner_id;
    end if;

    -- Update loser(s)
    update public.community_members
    set
      matches_played = matches_played + 1,
      losses = losses + 1
    where
      community_id = new.community_id
      and profile_id = v_loser_id;

    if v_loser_partner_id is not null then
      update public.community_members
      set
        matches_played = matches_played + 1,
        losses = losses + 1
      where
        community_id = new.community_id
        and profile_id = v_loser_partner_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_community_matches_after_approval
  after update of approval_status
  on public.community_matches
  for each row
  when (new.approval_status = 'approved')
  execute function public.handle_approved_community_match();

-- ----------------------------------------------------------
-- Update profiles.completed_sessions / total_committed_sessions
-- when a commitment's feedback_status is set
-- ----------------------------------------------------------
create or replace function public.handle_commitment_feedback()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.feedback_status is not null then
    -- Always increment total_committed (first time feedback given)
    if old.feedback_status is null then
      update public.profiles
      set total_committed_sessions = total_committed_sessions + 1
      where id = new.user_id;
    end if;

    -- Increment completed if showed_up
    if new.feedback_status = 'showed_up' then
      if old.feedback_status is distinct from 'showed_up' then
        update public.profiles
        set completed_sessions = completed_sessions + 1
        where id = new.user_id;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_commitments_feedback
  after insert or update of feedback_status
  on public.commitments
  for each row
  execute function public.handle_commitment_feedback();

-- ----------------------------------------------------------
-- Insert notification helper (extends existing RPC with new types)
-- ----------------------------------------------------------
create or replace function public.insert_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb default null
)
returns setof public.in_app_notifications
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  insert into public.in_app_notifications (user_id, type, title, body, data, read)
  values (p_user_id, p_type, p_title, p_body, p_data, false)
  returning *;
end;
$$;

-- ============================================================
-- COMPUTED COLUMN HELPERS (views for convenience)
-- ============================================================

-- Leaderboard view per community
create or replace view public.community_leaderboard as
select
  cm.community_id,
  cm.profile_id,
  p.username,
  p.display_name,
  p.avatar_url,
  cm.matches_played,
  cm.wins,
  cm.losses,
  cm.win_ratio,
  cm.joined_at,
  row_number() over (
    partition by cm.community_id
    order by cm.win_ratio desc, cm.wins desc, cm.matches_played desc
  ) as rank
from public.community_members cm
join public.profiles p on p.id = cm.profile_id
where cm.role = 'member' or cm.role = 'admin';

-- User's completed vs committed ratio helper view
create or replace view public.user_session_stats as
select
  id as profile_id,
  username,
  display_name,
  completed_sessions,
  total_committed_sessions,
  case
    when total_committed_sessions > 0
    then round((completed_sessions::numeric / total_committed_sessions) * 100, 1)
    else 0
  end as completion_percentage
from public.profiles;
