-- Migration: Community chat
-- Live text chat scoped to a community's approved members. Mirrors the session
-- chat architecture for scalability:
--   * sender username/avatar are snapshotted on the row at insert (no join)
--   * replies store reply_to_id (self FK, ON DELETE SET NULL)
--   * composite index (community_id, created_at) serves the ordered fetch
--   * RLS scopes read/write to approved community members
--   * messages are text-only and permanent (no update/delete)

create table if not exists public.community_messages (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  reply_to_id uuid references public.community_messages(id) on delete set null,
  sender_username text,
  sender_avatar_url text,
  created_at timestamptz not null default now()
);

comment on table public.community_messages is 'Text chat for a community — visible to approved members only';

create index if not exists idx_community_messages_community_created
  on public.community_messages (community_id, created_at);

create index if not exists idx_community_messages_reply_to
  on public.community_messages (reply_to_id);

comment on column public.community_messages.sender_username
  is 'Snapshot of the sender username at send time (avoids a join for realtime payloads)';
comment on column public.community_messages.sender_avatar_url
  is 'Snapshot of the sender avatar at send time';

alter table public.community_messages enable row level security;

-- SELECT: approved community members only
create policy "Community messages readable by approved members"
  on public.community_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.community_members cm
      where cm.community_id = community_messages.community_id
        and cm.profile_id = auth.uid()
        and cm.approval_status = 'approved'
    )
  );

-- INSERT: the sender must be an approved member of the community
create policy "Community messages inserted by approved members"
  on public.community_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.community_members cm
      where cm.community_id = community_messages.community_id
        and cm.profile_id = auth.uid()
        and cm.approval_status = 'approved'
    )
  );

-- Realtime: push new messages to open community chat channels
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'community_messages'
  ) then
    alter publication supabase_realtime add table public.community_messages;
  end if;
end $$;

-- Add community chat notification types (FCM-only, used for pushes; never stored
-- in in_app_notifications, but kept in the constraint so the enum stays complete)
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
    'session_chat_message',
    'session_chat_reply',
    'community_chat_message',
    'community_chat_reply'
  ));
