import { supabase } from '@/lib/supabase';
import { formatSessionDisplayName } from '@/lib/date';
import { pushFcmToUser } from './notifications';
import type { SessionChatMessage } from '@/types';

export const MAX_CHAT_MESSAGE_LENGTH = 1000;

const SENDER_JOIN = 'sender:profiles!session_messages_sender_id_fkey (id, username, avatar_url)';

function isMessageOpen(status: string): boolean {
  return status === 'open' || status === 'full';
}

export async function fetchSessionMessages(sessionId: string): Promise<SessionChatMessage[]> {
  const { data, error } = await supabase
    .from('session_messages')
    .select(`*, ${SENDER_JOIN}`)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) throw error;
  return (data ?? []) as SessionChatMessage[];
}

export async function fetchSessionMessageById(
  messageId: string,
): Promise<SessionChatMessage | null> {
  const { data, error } = await supabase
    .from('session_messages')
    .select(`*, ${SENDER_JOIN}`)
    .eq('id', messageId)
    .maybeSingle();

  if (error) return null;
  return (data ?? null) as SessionChatMessage | null;
}

export async function sendSessionMessage(
  sessionId: string,
  userId: string,
  content: string,
): Promise<SessionChatMessage> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error('Message cannot be empty.');
  if (trimmed.length > MAX_CHAT_MESSAGE_LENGTH) {
    throw new Error(`Message is too long (max ${MAX_CHAT_MESSAGE_LENGTH} characters).`);
  }

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, created_by, sport, date_time, status')
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

  const { data, error } = await supabase
    .from('session_messages')
    .insert({ session_id: sessionId, sender_id: userId, content: trimmed })
    .select()
    .single();

  if (error) throw error;

  try {
    await notifyChatMembers(session, userId, sender?.username ?? 'Someone', trimmed);
  } catch (e) {
    console.error('Failed to send chat push notifications:', e);
  }

  return { ...(data as SessionChatMessage), sender };
}

// Sends an FCM-only push (no in-app notification) to every member of the
// session (creator + accepted participants), except the sender.
async function notifyChatMembers(
  session: { id: string; created_by: string; sport: string; date_time: string },
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

  const sessionName = formatSessionDisplayName(session.sport, session.date_time);
  const pushData = { type: 'session_chat_message', sessionId: session.id };

  await Promise.allSettled(
    [...memberIds].map(async (userId) => {
      if (userId === senderId) return;
      await pushFcmToUser(userId, sessionName, `${senderName}: ${content}`, pushData);
    }),
  );
}
