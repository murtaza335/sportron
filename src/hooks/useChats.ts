import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { setChatUnreadCount } from '@/lib/chatUnreadStore';
import { fetchChatLastMessageAt, fetchChatUnreadCounts } from '@/services/chat';
import { fetchMyCommunities } from '@/services/communities';
import { fetchJoinedSessions, fetchMySessions } from '@/services/sessions';
import type { Community, Session } from '@/types';

// Sorts chats by latest activity (most recent message first); chats with no
// messages fall to the bottom.
function sortByLastMessage<T extends { id: string }>(
  items: T[],
  lastMessageAt: Record<string, string | null>,
): T[] {
  return [...items].sort((a, b) => {
    const ta = lastMessageAt[a.id] ?? '';
    const tb = lastMessageAt[b.id] ?? '';
    return tb.localeCompare(ta);
  });
}

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

      const [commUnread, sessUnread, commLastAt, sessLastAt] = await Promise.all([
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
        fetchChatLastMessageAt(
          'community_messages',
          'community_id',
          comm.map((c) => c.id),
        ),
        fetchChatLastMessageAt(
          'session_messages',
          'session_id',
          sess.map((s) => s.id),
        ),
      ]);

      setCommunities(sortByLastMessage(comm, commLastAt));
      setSessions(sortByLastMessage(sess, sessLastAt));
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