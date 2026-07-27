-- Drop the partial unique index that limits users to one active commitment.
-- Time-conflict validation is now handled at the application layer in commitToSession
-- via checkTimeConflicts (±30 min window), so users can join multiple sessions
-- as long as times don't overlap.
drop index if exists idx_commitments_one_active_per_user;
