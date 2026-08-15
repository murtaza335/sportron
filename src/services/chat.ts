import { supabase } from '@/lib/supabase';
import { formatSessionDisplayName } from '@/lib/date';
import { pushFcmToUsers } from './notifications';
import type { SessionChatMessage } from '@/types';

export const MAX_CHAT_MESSAGE_LENGTH = 1000;

function isMessageOpen(status: string): boolean {
  return status === 'open' || status === 'full';
}

// Attaches the `sender` object from the snapshot columns stored at send time.
// Realtime payloads and raw rows don't carry joins, so callers use this to get
// a renderable sender without an extra fetch per message.
export function normalizeChatMessage(message: SessionChatMessage): SessionChatMessage {
  return {
    ...message,
    sender: message.sender_username
      ? {
          id: message.sender_id,
          username: message.sender_username,
          avatar_url: message.sender_avatar_url ?? null,
        }
      : (message.sender ?? null),
  };
}

export async function fetchSessionMessages(sessionId: string): Promise<SessionChatMessage[]> {
  const { data, error } = await supabase
    .from('session_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) throw error;
  return (data ?? []).map(normalizeChatMessage);
}

export type ReplyTargetInfo = {
  id: string;
  senderId: string | null;
  content: string;
};

export async function sendSessionMessage(
  sessionId: string,
  userId: string,
  content: string,
  replyToId?: string | null,
  replyTarget?: ReplyTargetInfo | null,
): Promise<SessionChatMessage | null> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error('Message cannot be empty.');
  if (trimmed.length > MAX_CHAT_MESSAGE_LENGTH) {
    throw new Error(`Message is too long (max ${MAX_CHAT_MESSAGE_LENGTH} characters).`);
  }

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, created_by, title, purpose, date_time, status')
    .eq('id', sessionId)
    .single();

  if (sessionError) throw sessionError;
  if (!session) throw new Error('Session not found');
  if (!isMessageOpen(session.status)) {
    throw new Error('This session is no longer accepting messages.');
  }

  const { data: sender, error: senderError } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .eq('id', userId)
    .single();

  if (senderError) throw senderError;

  const { data: inserted, error } = await supabase
    .from('session_messages')
    .insert({
      session_id: sessionId,
      sender_id: userId,
      content: trimmed,
      reply_to_id: replyToId ?? null,
      sender_username: sender?.username ?? null,
      sender_avatar_url: sender?.avatar_url ?? null,
    })
    .select('id')
    .single();

  if (error) throw error;

  const message: SessionChatMessage = {
    id: inserted.id,
    session_id: sessionId,
    sender_id: userId,
    content: trimmed,
    created_at: new Date().toISOString(),
    reply_to_id: replyToId ?? null,
    sender_username: sender?.username ?? null,
    sender_avatar_url: sender?.avatar_url ?? null,
    sender: { id: sender.id, username: sender.username, avatar_url: sender.avatar_url },
    reply_to: replyToId
      ? {
          id: replyToId,
          sender_id: replyTarget?.senderId ?? null,
          content: replyTarget?.content ?? '',
          sender: null,
        }
      : null,
  };

  try {
    await notifyChatMembers(session, userId, sender?.username ?? 'Someone', trimmed);
  } catch (e) {
    console.error('Failed to send chat push notifications:', e);
  }

  // Notify the person whose message was replied to.
  const repliedToSenderId = replyTarget?.senderId;
  if (replyToId && repliedToSenderId && repliedToSenderId !== userId) {
    try {
      const sessionName = formatSessionDisplayName(session.purpose, session.date_time, session.title);
      await pushFcmToUsers(
        [repliedToSenderId],
        sessionName,
        `${sender?.username ?? 'Someone'} replied to you: ${trimmed}`,
        { type: 'session_chat_reply', sessionId, messageId: message.id },
      );
    } catch (e) {
      console.error('Failed to send chat reply notification:', e);
    }
  }

  return message;
}

// Sends an FCM-only push (no in-app notification) to every member of the
// session (creator + accepted participants), except the sender. One batched
// edge-function call for all recipients.
async function notifyChatMembers(
  session: { id: string; created_by: string; purpose: string; date_time: string },
  senderId: string,
  senderName: string,
  content: string,
): Promise<void> {
  const { data: accepted, error } = await supabase
    .from('commitments')
    .select('user_id')
    .eq('session_id', session.id)
    .eq('status', 'accepted');

  if (error) throw error;

  const memberIds = new Set<string>([session.created_by]);
  for (const c of accepted ?? []) memberIds.add(c.user_id);
  memberIds.delete(senderId);

  if (memberIds.size === 0) return;

  const sessionName = formatSessionDisplayName(session.purpose, session.date_time);
  const pushData = { type: 'session_chat_message', sessionId: session.id };

  await pushFcmToUsers(
    [...memberIds],
    sessionName,
    `${senderName}: ${content}`,
    pushData,
  );
}
