-- Sessions are no longer sport-only: they carry a "purpose" which can be a
-- sport, walk, chit-chat, other, etc. Rename the column to reflect that.
ALTER TABLE public.sessions RENAME COLUMN sport TO purpose;

DROP INDEX IF EXISTS public.idx_sessions_sport;
CREATE INDEX IF NOT EXISTS idx_sessions_purpose ON public.sessions(purpose);

COMMENT ON COLUMN public.sessions.purpose IS 'What the session is for — a sport, walk, chit chat, other...';