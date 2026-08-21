-- Streak tracking for daily engagement
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS streak_count INT DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS longest_streak INT DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_activity_date DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS streak_updated_at TIMESTAMPTZ;

-- Index for efficient streak-at-risk queries (find users who haven't been active in 22+ hours)
CREATE INDEX IF NOT EXISTS idx_profiles_streak_at_risk 
  ON profiles (last_activity_date) 
  WHERE streak_count > 0 AND deleted_at IS NULL;

-- Comment for documentation
COMMENT ON COLUMN profiles.streak_count IS 'Current consecutive days with qualifying activity';
COMMENT ON COLUMN profiles.longest_streak IS 'All-time highest streak achieved';
COMMENT ON COLUMN profiles.last_activity_date IS 'Date of last qualifying activity (UTC)';
COMMENT ON COLUMN profiles.streak_updated_at IS 'Timestamp when streak was last recomputed';