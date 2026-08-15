-- Sender snapshot: stores the sender's username/avatar at send time so realtime
-- payloads carry the display name without a join (removes per-message refetch).

ALTER TABLE public.session_messages
  ADD COLUMN sender_username text,
  ADD COLUMN sender_avatar_url text;

-- Backfill existing rows so historical messages keep showing their sender.
UPDATE public.session_messages m
SET sender_username = p.username,
    sender_avatar_url = p.avatar_url
FROM public.profiles p
WHERE p.id = m.sender_id
  AND m.sender_username IS NULL;

COMMENT ON COLUMN public.session_messages.sender_username
  IS 'Snapshot of the sender username at send time (avoids a join for realtime payloads)';
COMMENT ON COLUMN public.session_messages.sender_avatar_url
  IS 'Snapshot of the sender avatar at send time';
