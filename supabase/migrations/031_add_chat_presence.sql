-- Migration: Chat presence (who is actively reading a chat right now)
-- One row per (chat, user) holding the last time they were confirmed present
-- in that chat. This is SEPARATE from the read cursors (028) — the cursor is a
-- read position for unread counting; presence is a "am I looking at this chat"
-- signal used to suppress push notifications for active readers.
--
-- The client heartbeats last_seen_at every ~20s while the chat popup is open
-- and deletes its row on clean leave. If the app is killed, the row goes stale
-- and the edge function's TTL (60s) stops suppressing pushes.

create table if not exists public.chat_presence (
  chat_type text not null check (chat_type in ('session', 'community')),
  chat_id uuid not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (chat_type, chat_id, profile_id)
);

comment on table public.chat_presence is 'Per-conversation presence used to suppress chat pushes for active readers';

alter table public.chat_presence enable row level security;

-- SELECT: a user can only see their own presence row
create policy "chat presence visible to owner"
  on public.chat_presence for select
  to authenticated
  using (profile_id = auth.uid());

-- INSERT / UPDATE: only the owner writes their own row (required so
-- INSERT ... ON CONFLICT DO UPDATE works under RLS)
create policy "chat presence upsert by owner"
  on public.chat_presence for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "chat presence update by owner"
  on public.chat_presence for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- DELETE: owner clears presence when leaving the chat
create policy "chat presence delete by owner"
  on public.chat_presence for delete
  to authenticated
  using (profile_id = auth.uid());