-- Site-wide configuration table (e.g. maintenance mode, min version).
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

-- Seed maintenance config (disabled by default)
INSERT INTO site_config (key, value) VALUES
  ('maintenance', '{"enabled": false, "message": "We are currently down for maintenance. Please check back soon."}');

-- Seed minimum app version config
-- min_version : semver string the device must meet or exceed
-- store_url   : deep-link to the store listing (opened by the Update button)
-- message     : optional user-facing message shown on the update screen
INSERT INTO site_config (key, value) VALUES
  ('min_app_version', '{"min_version": "1.0.0", "store_url": "", "message": "A newer version of this app is required. Please update to continue."}');
