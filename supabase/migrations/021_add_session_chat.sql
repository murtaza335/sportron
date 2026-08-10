-- Migration: Session chat
-- Live text chat scoped to a session's creator + accepted participants.
-- Messages are text-only and permanent (no update/delete).

create table if not exists public.session_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

comment on table public.session_messages is 'Text chat for a session — visible to the creator and accepted participants only';

create index if not exists idx_session_messages_session_created
  on public.session_messages (session_id, created_at);

alter table public.session_messages enable row level security;

-- SELECT: creator OR accepted participant can read messages. Users who left
-- can still read the history up to the moment they left (created_at <= the
-- time their commitment was marked 'left'), but never newer messages.
create policy "Chat messages readable by session members"
  on public.session_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_messages.session_id
        and (
          s.created_by = auth.uid()
          or exists (
            select 1 from public.commitments c
            where c.session_id = s.id
              and c.user_id = auth.uid()
              and c.status = 'accepted'
          )
          or exists (
            select 1 from public.commitments c
            where c.session_id = s.id
              and c.user_id = auth.uid()
              and c.status = 'left'
              and session_messages.created_at <= c.updated_at
          )
        )
    )
  );

-- INSERT: same scope (creator OR accepted participant) and the sender must be
-- the caller. Users who left cannot send messages.
create policy "Chat messages inserted by session members"
  on public.session_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.sessions s
      where s.id = session_messages.session_id
        and (
          s.created_by = auth.uid()
          or exists (
            select 1 from public.commitments c
            where c.session_id = s.id
              and c.user_id = auth.uid()
              and c.status = 'accepted'
          )
        )
    )
  );

-- Realtime: push new messages to open chat channels
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'session_messages'
  ) then
    alter publication supabase_realtime add table public.session_messages;
  end if;
end $$;

-- Add session_chat_message notification type (used for FCM-only chat pushes)
alter table public.in_app_notifications
  drop constraint if exists in_app_notifications_type_check;

alter table public.in_app_notifications
  add constraint in_app_notifications_type_check
  check (type in (
    'match_pending',
    'match_approved',
    'match_rejected',
    'match_liked',
    'match_commented',
    'session_application',
    'session_accepted',
    'session_rejected',
    'session_left',
    'session_reminder',
    'feedback_prompt',
    'ping',
    'ping_response',
    'join_request',
    'join_approved',
    'join_rejected',
    'match_approval_request',
    'match_approved_community',
    'match_disputed',
    'member_removed',
    'admin_transferred',
    'admin_promoted',
    'community_match_pending',
    'community_match_approved',
    'community_match_disputed',
    'community_invite',
    'community_invite_accepted',
    'community_invite_rejected',
    'session_chat_message'
  ));
