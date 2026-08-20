-- Migration: performance indexes for the session/community list queries that
-- power the Chats hub, community lists, and session feeds. Composite indexes
-- replace single-column lookups that previously scanned/residual-filtered.

-- fetchMyCommunities + fetchMyCommunityMemberships:
--   community_members where profile_id = X and approval_status = 'approved'
create index if not exists idx_community_members_profile_status
  on public.community_members (profile_id, approval_status);

-- fetchOpenSessions (Sessions "All" feed):
--   sessions where status in ('open','full') order by date_time
create index if not exists idx_sessions_status_date_time
  on public.sessions (status, date_time);

-- fetchJoinedSessions / fetchChatSessions commitment lookups:
--   commitments where user_id = X and status = 'accepted'
create index if not exists idx_commitments_user_status
  on public.commitments (user_id, status);