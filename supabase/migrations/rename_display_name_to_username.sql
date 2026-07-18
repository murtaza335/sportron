-- IMPORTANT: Before running this, check for duplicate display_name values:
--   SELECT display_name, COUNT(*) FROM profiles GROUP BY display_name HAVING COUNT(*) > 1;
-- If duplicates exist, resolve them first (e.g., append numbers).

ALTER TABLE profiles RENAME COLUMN display_name TO username;

ALTER TABLE profiles ADD CONSTRAINT profiles_username_key UNIQUE (username);

CREATE INDEX profiles_username_idx ON profiles (username);
