-- Site-wide configuration table (e.g. maintenance mode toggle).
-- Readable by everyone (anon + authenticated) so the app can check
-- even when the user is logged out.  Only service_role (dashboard
-- SQL editor) can insert / update / delete rows — no client write
-- policies are created.

CREATE TABLE site_config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE site_config ENABLE ROW LEVEL SECURITY;

-- Allow anon and authenticated users to read all rows
CREATE POLICY "site_config_select_all"
  ON site_config
  FOR SELECT
  USING (true);

-- Seed the maintenance config row (disabled by default)
INSERT INTO site_config (key, value) VALUES
  ('maintenance', '{"enabled": false, "message": "We are currently down for maintenance. Please check back soon."}');
