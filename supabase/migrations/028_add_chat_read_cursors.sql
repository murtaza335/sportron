-- Migration: Chat read cursors
-- One row per (chat, user) holding the last-read timestamp. This is O(participants)
-- not O(messages) — no per-message read receipts. Unread counts and the "scroll to
-- first unread" point are computed with a single timestamp compare on created_at.

create table if not exists public.session_chat_read (
  session_id uuid not null references public.sessions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (session_id, profile_id)
);

create table if not exists public.community_chat_read (
  community_id uuid not null references public.communities(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (community_id, profile_id)
);

comment on table public.session_chat_read is 'Last-read cursor per (session, member) for session chat unread tracking';
comment on table public.community_chat_read is 'Last-read cursor per (community, member) for community chat unread tracking';

alter table public.session_chat_read enable row level security;
alter table public.community_chat_read enable row level security;

-- SELECT: a user can only see their own cursor
create policy "session chat read visible to owner"
  on public.session_chat_read for select
  to authenticated
  using (profile_id = auth.uid());

create policy "community chat read visible to owner"
  on public.community_chat_read for select
  to authenticated
  using (profile_id = auth.uid());

-- INSERT / UPDATE: a user can only upsert their own cursor. Both policies are
-- required so INSERT ... ON CONFLICT DO UPDATE works under RLS.
create policy "session chat read upsert by owner"
  on public.session_chat_read for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "session chat read update by owner"
  on public.session_chat_read for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "community chat read upsert by owner"
  on public.community_chat_read for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "community chat read update by owner"
  on public.community_chat_read for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());