import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { CommunityChatPopup } from '@/components/CommunityChatPopup';
import { SessionChatPopup } from '@/components/SessionChatPopup';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunityChat } from '@/hooks/useCommunityChat';
import { useSessionChat } from '@/hooks/useSessionChat';
import { fetchCommunityById } from '@/services/communities';
import { fetchSessionById } from '@/services/sessions';
import type { Community, Session } from '@/types';

type ChatType = 'community' | 'session';

export default function ChatScreen() {
  const params = useLocalSearchParams<{ type?: string; id?: string | string[] }>();
  const chatType: ChatType | null =
    params.type === 'session' ? 'session' : params.type === 'community' ? 'community' : null;
  const chatId = typeof params.id === 'string' ? params.id : null;
  const { user, profile } = useAuth();

  const [community, setCommunity] = useState<Community | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!chatType || !chatId) {
      return () => {
        cancelled = true;
      };
    }
    const load = async () => {
      try {
        if (chatType === 'community') {
          const c = await fetchCommunityById(chatId);
          if (!cancelled) setCommunity(c);
        } else {
          const s = await fetchSessionById(chatId, user?.id);
          if (!cancelled) setSession(s);
        }
      } catch (e) {
        console.error('Failed to load chat details:', e);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [chatType, chatId, user?.id]);

  const communityChat = useCommunityChat(
    chatType === 'community' ? chatId : null,
    user?.id,
    chatType === 'community',
    profile,
  );

  const myCommitmentStatus = session?.my_commitment?.status;
  const isCreator = session?.created_by === user?.id;
  const canViewChat = !!(
    chatType === 'session' &&
    chatId &&
    session &&
    (isCreator || myCommitmentStatus === 'accepted' || myCommitmentStatus === 'left')
  );
  const sessionSubscribe = canViewChat && myCommitmentStatus !== 'left';

  const sessionChat = useSessionChat(
    chatType === 'session' ? chatId : null,
    user?.id,
    sessionSubscribe,
    profile,
  );

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/chats');
    }
  };

  if (chatType === 'session') {
    const canSend = !!(chatId && (isCreator || myCommitmentStatus === 'accepted') && session && (session.status === 'open' || session.status === 'full'));
    return (
      <SessionChatPopup
        sessionId={chatId}
        visible
        onClose={handleClose}
        currentUserId={user?.id}
        session={session}
        canSend={canSend}
        hasLeft={myCommitmentStatus === 'left'}
        chat={sessionChat}
      />
    );
  }

  return (
    <CommunityChatPopup
      communityId={chatId}
      visible
      onClose={handleClose}
      currentUserId={user?.id}
      community={community}
      chat={communityChat}
    />
  );
}