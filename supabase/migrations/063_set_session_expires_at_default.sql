-- Set expires_at to date_time + 30 minutes if NULL on insert
-- Defense in depth: prevents direct API calls from creating sessions that never expire

CREATE OR REPLACE FUNCTION public.set_session_expires_at_default()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NEW.date_time + interval '30 minutes';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_session_expires_at ON public.sessions;
CREATE TRIGGER trg_set_session_expires_at
  BEFORE INSERT ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_session_expires_at_default();