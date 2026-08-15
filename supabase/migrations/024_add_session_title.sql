-- Sessions get a short title shown in cards for UI consistency.
ALTER TABLE public.sessions ADD COLUMN title text;

COMMENT ON COLUMN public.sessions.title IS 'Short title displayed in session cards and headers';

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_title_length_check CHECK (char_length(title) <= 40);
