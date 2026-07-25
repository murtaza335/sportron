-- Migration: Add ping_responses table + ping_response notification type

create table if not exists public.ping_responses (
  id uuid primary key default gen_random_uuid(),
  ping_id uuid not null references public.pings(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  respondent_id uuid not null references public.profiles(id) on delete cascade,
  response text not null check (response in ('coming', 'busy')),
  created_at timestamptz not null default now(),
  unique(ping_id, respondent_id)
);

create index if not exists idx_ping_responses_ping_id on public.ping_responses(ping_id);
create index if not exists idx_ping_responses_respondent_id on public.ping_responses(respondent_id);

alter table public.ping_responses enable row level security;

-- Ping responses viewable by community members
create policy "Ping responses viewable by community members"
  on public.ping_responses for select
  to authenticated
  using (
    community_id in (
      select community_id from public.community_members where profile_id = auth.uid()
    )
  );

-- Authenticated users can insert their own responses
create policy "Users can insert own ping responses"
  on public.ping_responses for insert
  to authenticated
  with check (auth.uid() = respondent_id);

-- Add ping_response to notification type constraint
ALTER TABLE in_app_notifications
DROP CONSTRAINT IF EXISTS in_app_notifications_type_check;

ALTER TABLE in_app_notifications
ADD CONSTRAINT in_app_notifications_type_check
CHECK (type IN (
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
  'community_match_pending',
  'community_match_approved',
  'community_match_disputed',
  'admin_promoted',
  'community_invite',
  'community_invite_accepted',
  'community_invite_rejected'
));
