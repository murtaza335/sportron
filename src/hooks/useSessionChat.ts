import { useChat, type ChatThread } from '@/hooks/useChat';
import {
  deleteSessionMessage,
  fetchSessionMessages,
  sendSessionMessage,
  updateSessionMessage,
} from '@/services/chat';
import type { SessionChatMessage } from '@/types';

type SenderProfile = { id: string; username: string; avatar_url: string | null };

export function useSessionChat(
  sessionId: string | null,
  userId?: string,
  subscribe = true,
  senderProfile?: SenderProfile | null,
): ChatThread<SessionChatMessage> {
  return useChat<SessionChatMessage>(
    {
      sourceId: sessionId,
      table: 'session_messages',
      idColumn: 'session_id',
      channelPrefix: 'session-chat-',
      fetchMessages: fetchSessionMessages,
      sendMessage: sendSessionMessage,
      updateMessage: updateSessionMessage,
      deleteMessage: deleteSessionMessage,
    },
    userId,
    subscribe,
    senderProfile,
  );
}
