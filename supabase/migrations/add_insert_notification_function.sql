-- Migration: Add SECURITY DEFINER function for inserting notifications
-- This allows the client (anon key) to insert notifications for any user
-- without giving direct INSERT access to the table.

CREATE OR REPLACE FUNCTION insert_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_data JSONB DEFAULT NULL
)
RETURNS SETOF in_app_notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO in_app_notifications (user_id, type, title, body, data, read)
  VALUES (p_user_id, p_type, p_title, p_body, p_data, false)
  RETURNING *;
END;
$$;
