import { useChat, type ChatThread } from '@/hooks/useChat';
import {
  deleteCommunityMessage,
  fetchCommunityMessages,
  sendCommunityMessage,
  updateCommunityMessage,
} from '@/services/chat';
import type { CommunityChatMessage } from '@/types';

type SenderProfile = { id: string; username: string; avatar_url: string | null };

export function useCommunityChat(
  communityId: string | null,
  userId?: string,
  subscribe = true,
  senderProfile?: SenderProfile | null,
): ChatThread<CommunityChatMessage> {
  return useChat<CommunityChatMessage>(
    {
      sourceId: communityId,
      table: 'community_messages',
      idColumn: 'community_id',
      channelPrefix: 'community-chat-',
      fetchMessages: fetchCommunityMessages,
      sendMessage: sendCommunityMessage,
      updateMessage: updateCommunityMessage,
      deleteMessage: deleteCommunityMessage,
    },
    userId,
    subscribe,
    senderProfile,
  );
}
