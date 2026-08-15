import { supabase } from '@/lib/supabase';
import { formatSessionDisplayName } from '@/lib/date';
import { pushFcmToUsers } from './notifications';
import type { ChatMessageBase, ChatSender, CommunityChatMessage, SessionChatMessage } from '@/types';

export const MAX_CHAT_MESSAGE_LENGTH = 1000;

function isMessageOpen(status: string): boolean {
  return status === 'open' || status === 'full';
}

// Attaches the `sender` object from the snapshot columns stored at send time.
// Realtime payloads and raw rows don't carry joins, so callers use this to get
// a renderable sender without an extra fetch per message.
export function normalizeChatMessage<T extends ChatMessageBase>(message: T): T {
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

export type ReplyTargetInfo = {
  id: string;
  senderId: string | null;
  content: string;
};

type ChatReadTable = 'session_chat_read' | 'community_chat_read';
type ChatIdColumn = 'session_id' | 'community_id';
type ChatMessageTable = 'session_messages' | 'community_messages';

function readTableForIdColumn(idColumn: ChatIdColumn): ChatReadTable {
  return idColumn === 'session_id' ? 'session_chat_read' : 'community_chat_read';
}

// ---------------------------------------------------------------------------
// Read cursors (unread tracking) — shared by session + community chat
// ---------------------------------------------------------------------------

export async function fetchChatReadCursor(
  idColumn: ChatIdColumn,
  chatId: string,
  userId: string,
): Promise<string | null> {
  const readTable = readTableForIdColumn(idColumn);
  const { data, error } = await supabase
    .from(readTable)
    .select('last_read_at')
    .eq(idColumn, chatId)
    .eq('profile_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data?.last_read_at ?? null;
}

export async function upsertChatReadCursor(
  idColumn: ChatIdColumn,
  chatId: string,
  userId: string,
  lastReadAt = new Date().toISOString(),
): Promise<void> {
  const readTable = readTableForIdColumn(idColumn);
  const { error } = await supabase
    .from(readTable)
    .upsert(
      { [idColumn]: chatId, profile_id: userId, last_read_at: lastReadAt },
      { onConflict: `${idColumn},profile_id` },
    );

  if (error) throw error;
}

// Count of messages newer than the user's last-read cursor. When no cursor has
// ever been written, count = 0 (nothing is "unread" before their first read).
export async function fetchChatUnreadCount(
  messageTable: ChatMessageTable,
  idColumn: ChatIdColumn,
  chatId: string,
  userId: string,
  lastReadAt?: string | null,
): Promise<number> {
  if (lastReadAt === undefined) {
    lastReadAt = await fetchChatReadCursor(idColumn, chatId, userId);
  }
  if (!lastReadAt) return 0;

  const { count, error } = await supabase
    .from(messageTable)
    .select('*', { count: 'exact', head: true })
    .eq(idColumn, chatId)
    .gt('created_at', lastReadAt);

  if (error) throw error;
  return count ?? 0;
}

type InsertedMessage = {
  id: string;
};

// Shared insert path for both session and community chat. Writes the sender
// snapshot so realtime payloads/reads carry the display name with no join.
async function insertChatMessage(input: {
  table: 'session_messages' | 'community_messages';
  idColumn: 'session_id' | 'community_id';
  sourceId: string;
  userId: string;
  content: string;
  replyToId?: string | null;
}): Promise<{ messageId: string; sender: ChatSender }> {
  const { data: sender, error: senderError } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .eq('id', input.userId)
    .single();

  if (senderError) throw senderError;

  const { data: inserted, error } = await supabase
    .from(input.table)
    .insert({
      [input.idColumn]: input.sourceId,
      sender_id: input.userId,
      content: input.content,
      reply_to_id: input.replyToId ?? null,
      sender_username: sender?.username ?? null,
      sender_avatar_url: sender?.avatar_url ?? null,
    })
    .select('id')
    .single();

  if (error) throw error;

  return { messageId: (inserted as InsertedMessage).id, sender };
}

// ---------------------------------------------------------------------------
// Session chat
// ---------------------------------------------------------------------------

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

  const { messageId, sender } = await insertChatMessage({
    table: 'session_messages',
    idColumn: 'session_id',
    sourceId: sessionId,
    userId,
    content: trimmed,
    replyToId,
  });

  const message: SessionChatMessage = {
    id: messageId,
    session_id: sessionId,
    sender_id: userId,
    content: trimmed,
    created_at: new Date().toISOString(),
    reply_to_id: replyToId ?? null,
    sender_username: sender.username ?? null,
    sender_avatar_url: sender.avatar_url ?? null,
    sender,
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
    await notifyChatMembers(session, userId, sender.username ?? 'Someone', trimmed);
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
        `${sender.username ?? 'Someone'} replied to you: ${trimmed}`,
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

// ---------------------------------------------------------------------------
// Community chat
// ---------------------------------------------------------------------------

export async function fetchCommunityMessages(communityId: string): Promise<CommunityChatMessage[]> {
  const { data, error } = await supabase
    .from('community_messages')
    .select('*')
    .eq('community_id', communityId)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) throw error;
  return (data ?? []).map(normalizeChatMessage);
}

export async function sendCommunityMessage(
  communityId: string,
  userId: string,
  content: string,
  replyToId?: string | null,
  replyTarget?: ReplyTargetInfo | null,
): Promise<CommunityChatMessage | null> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error('Message cannot be empty.');
  if (trimmed.length > MAX_CHAT_MESSAGE_LENGTH) {
    throw new Error(`Message is too long (max ${MAX_CHAT_MESSAGE_LENGTH} characters).`);
  }

  const { data: community, error: communityError } = await supabase
    .from('communities')
    .select('id, name')
    .eq('id', communityId)
    .single();

  if (communityError) throw communityError;
  if (!community) throw new Error('Community not found');

  const { messageId, sender } = await insertChatMessage({
    table: 'community_messages',
    idColumn: 'community_id',
    sourceId: communityId,
    userId,
    content: trimmed,
    replyToId,
  });

  const message: CommunityChatMessage = {
    id: messageId,
    community_id: communityId,
    sender_id: userId,
    content: trimmed,
    created_at: new Date().toISOString(),
    reply_to_id: replyToId ?? null,
    sender_username: sender.username ?? null,
    sender_avatar_url: sender.avatar_url ?? null,
    sender,
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
    await notifyCommunityChatMembers(communityId, userId, sender.username ?? 'Someone', trimmed);
  } catch (e) {
    console.error('Failed to send community chat push notifications:', e);
  }

  // Notify the person whose message was replied to.
  const repliedToSenderId = replyTarget?.senderId;
  if (replyToId && repliedToSenderId && repliedToSenderId !== userId) {
    try {
      await pushFcmToUsers(
        [repliedToSenderId],
        community.name,
        `${sender.username ?? 'Someone'} replied to you: ${trimmed}`,
        { type: 'community_chat_reply', communityId, messageId: message.id },
      );
    } catch (e) {
      console.error('Failed to send community chat reply notification:', e);
    }
  }

  return message;
}

// Sends an FCM-only push (no in-app notification) to every approved member of
// the community, except the sender. One batched edge-function call.
async function notifyCommunityChatMembers(
  communityId: string,
  senderId: string,
  senderName: string,
  content: string,
): Promise<void> {
  const { data: members, error } = await supabase
    .from('community_members')
    .select('profile_id')
    .eq('community_id', communityId)
    .eq('approval_status', 'approved');

  if (error) throw error;

  const memberIds = new Set<string>();
  for (const m of members ?? []) memberIds.add(m.profile_id);
  memberIds.delete(senderId);

  if (memberIds.size === 0) return;

  const { data: community } = await supabase
    .from('communities')
    .select('name')
    .eq('id', communityId)
    .single();

  const pushData = { type: 'community_chat_message', communityId };

  await pushFcmToUsers(
    [...memberIds],
    community?.name ?? 'Community',
    `${senderName}: ${content}`,
    pushData,
  );
}
