-- Replies: a message can reference the message it replies to.
-- WhatsApp-style swipe-to-reply support in the session chat.
ALTER TABLE public.session_messages
  ADD COLUMN reply_to_id uuid REFERENCES public.session_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_session_messages_reply_to
  ON public.session_messages (reply_to_id);

COMMENT ON COLUMN public.session_messages.reply_to_id
  IS 'Id of the message this one is replying to (optional)';
