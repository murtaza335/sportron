-- ============================================================
-- Migration 004: Add 'left' status to commitments
--
-- Tracks when a user leaves a session (instead of deleting
-- the record) so the session creator can see who left.
-- Also updates the unique constraint to allow re-joining
-- after leaving.
-- ============================================================

-- Add 'left' to the check constraint
alter table public.commitments
  drop constraint if exists commitments_status_check;

alter table public.commitments
  add constraint commitments_status_check
  check (status in ('pending', 'accepted', 'rejected', 'left'));

-- Drop the full unique constraint on (session_id, user_id)
-- and replace with a partial index that excludes 'left' records,
-- so a user can re-join after leaving.
alter table public.commitments
  drop constraint if exists commitments_session_id_user_id_key;

create unique index if not exists commitments_active_unique
  on public.commitments (session_id, user_id)
  where status != 'left';

comment on column public.commitments.status is 'pending → accepted/rejected/left';
