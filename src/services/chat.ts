import { supabase } from '@/lib/supabase';
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

export type ChatHubStats = {
  unread: Record<string, number>;
  lastMessageAt: Record<string, string | null>;
};

// Batched unread counts + most-recent-message timestamps for every chat the
// caller belongs to (approved communities / sessions they created or were
// accepted onto). One RPC per chat type instead of one query per chat; rows
// are scoped to auth.uid() server-side.
export async function fetchChatHubStats(
  chatType: 'community' | 'session',
): Promise<ChatHubStats> {
  const { data, error } = await supabase.rpc('get_chat_hub_stats', {
    p_chat_type: chatType,
  });

  if (error) throw error;

  const unread: Record<string, number> = {};
  const lastMessageAt: Record<string, string | null> = {};
  for (const row of (data ?? []) as {
    chat_id: string;
    unread_count: number;
    last_message_at: string | null;
  }[]) {
    if (row.unread_count > 0) unread[row.chat_id] = row.unread_count;
    lastMessageAt[row.chat_id] = row.last_message_at;
  }
  return { unread, lastMessageAt };
}

// ---------------------------------------------------------------------------
// Chat presence (active-reader heartbeat) — separate from read cursors
// ---------------------------------------------------------------------------

// The push trigger moved server-side (migration 035 + send-chat-notification),
// which reads this presence table to skip active readers. The client still
// heartbeats the row while the chat is open and deletes it on clean leave.

export async function upsertChatPresence(
  chatType: 'session' | 'community',
  chatId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('chat_presence')
    .upsert(
      { chat_type: chatType, chat_id: chatId, profile_id: userId, last_seen_at: new Date().toISOString() },
      { onConflict: 'chat_type,chat_id,profile_id' },
    );

  if (error) throw error;
}

export async function deleteChatPresence(
  chatType: 'session' | 'community',
  chatId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('chat_presence')
    .delete()
    .eq('chat_type', chatType)
    .eq('chat_id', chatId)
    .eq('profile_id', userId);

  if (error) throw error;
}

// Count of messages newer than the user's last-read cursor. When no cursor has
// ever been written, count = ALL messages (standard never-read semantics).
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

  let query = supabase
    .from(messageTable)
    .select('*', { count: 'exact', head: true })
    .eq(idColumn, chatId)
    // Own messages never count as unread (see fetchChatUnreadCounts).
    .neq('sender_id', userId);
  if (lastReadAt) {
    query = query.gt('created_at', lastReadAt);
  }

  const { count, error } = await query;

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
// Chat messages (paged, newest-first fetch; returned ascending)
// ---------------------------------------------------------------------------

export const CHAT_PAGE_SIZE = 50;

export type ChatPageOptions = {
  beforeCreatedAt?: string | null;
  pageSize?: number;
};

export type ChatPage<T> = {
  messages: T[];
  hasMore: boolean;
};

async function fetchMessagePage<T extends ChatMessageBase>(
  table: ChatMessageTable,
  idColumn: ChatIdColumn,
  chatId: string,
  opts: ChatPageOptions = {},
): Promise<ChatPage<T>> {
  const pageSize = opts.pageSize ?? CHAT_PAGE_SIZE;
  let query = supabase
    .from(table)
    .select('*')
    .eq(idColumn, chatId)
    .order('created_at', { ascending: false })
    // Deterministic tie-break so pages that share the same created_at boundary
    // message come back in the same order every time.
    .order('id', { ascending: false })
    .limit(pageSize + 1);

  if (opts.beforeCreatedAt) {
    // INCLUSIVE cursor: paginating on created_at alone can SKIP messages when
    // several share the exact timestamp at the page boundary (paging lt() drops
    // every message stamped equal to the cursor). Going <= keeps all boundary
    // messages reachable; the caller (useChat.loadOlder) dedupes the overlap by
    // id, so a shared timestamp can never cause a skipped or duplicate bubble.
    query = query.lte('created_at', opts.beforeCreatedAt);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const hasMore = rows.length > pageSize;
  // Slice off the probe row, then reverse to ascending order for display.
  return { messages: rows.slice(0, pageSize).reverse().map(normalizeChatMessage), hasMore };
}

export async function fetchSessionMessages(
  sessionId: string,
  opts?: ChatPageOptions,
): Promise<ChatPage<SessionChatMessage>> {
  return fetchMessagePage<SessionChatMessage>('session_messages', 'session_id', sessionId, opts);
}

export async function fetchCommunityMessages(
  communityId: string,
  opts?: ChatPageOptions,
): Promise<ChatPage<CommunityChatMessage>> {
  return fetchMessagePage<CommunityChatMessage>(
    'community_messages',
    'community_id',
    communityId,
    opts,
  );
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
    .select('id, status')
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

  // FCM pushes are triggered server-side by the insert (migration 035 →
  // send-chat-notification edge function), so nothing else happens here.

  return message;
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
    .select('id')
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

  // FCM pushes are triggered server-side by the insert (migration 035 →
  // send-chat-notification edge function), so nothing else happens here.

  return message;
}
