import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { setChatUnreadCount } from '@/lib/chatUnreadStore';
import { fetchChatUnreadCounts } from '@/services/chat';
import { fetchMyCommunities } from '@/services/communities';
import { fetchJoinedSessions, fetchMySessions } from '@/services/sessions';
import type { Community, Session } from '@/types';

// Loads the Chats hub data: communities I'm a member of + sessions I created
// or am accepted on, each with an unread chat-message count. Pushes the total
// unread count into the chatUnread external store so the tab badge stays in
// sync while the screen is focused.
export function useChats(userId: string | undefined) {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [communityUnread, setCommunityUnread] = useState<Record<string, number>>({});
  const [sessionUnread, setSessionUnread] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setCommunities([]);
      setSessions([]);
      setCommunityUnread({});
      setSessionUnread({});
      setChatUnreadCount(0);
      setLoading(false);
      return;
    }

    try {
      const [comm, mine, joined] = await Promise.all([
        fetchMyCommunities(userId),
        fetchMySessions(userId),
        fetchJoinedSessions(userId),
      ]);

      const sessMap = new Map<string, Session>();
      for (const session of [...joined, ...mine]) sessMap.set(session.id, session);
      const sess = [...sessMap.values()];

      const [commUnread, sessUnread] = await Promise.all([
        fetchChatUnreadCounts(
          'community_messages',
          'community_id',
          comm.map((c) => c.id),
          userId,
        ),
        fetchChatUnreadCounts(
          'session_messages',
          'session_id',
          sess.map((s) => s.id),
          userId,
        ),
      ]);

      setCommunities(comm);
      setSessions(sess);
      setCommunityUnread(commUnread);
      setSessionUnread(sessUnread);

      const total =
        Object.values(commUnread).reduce((sum, n) => sum + n, 0) +
        Object.values(sessUnread).reduce((sum, n) => sum + n, 0);
      setChatUnreadCount(total);
    } catch (e) {
      console.error('Failed to load chats:', e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return { communities, sessions, communityUnread, sessionUnread, loading, refreshing, refresh };
}