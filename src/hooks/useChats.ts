import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import {
  getChatUnreadCountsByKind,
  replaceChatUnreadCounts,
  resetChatUnreadCounts,
  setChatUnreadCountFor,
} from '@/lib/chatUnreadStore';
import { fetchChatHubStats, type ChatHubStats } from '@/services/chat';
import { fetchMyCommunities } from '@/services/communities';
import { fetchChatSessions } from '@/services/sessions';
import type { Community, Session } from '@/types';

export type ChatKind = 'community' | 'session';

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

type ChatHubCache = {
  userId: string;
  communities: Community[];
  sessions: Session[];
  communityUnread: Record<string, number>;
  sessionUnread: Record<string, number>;
  communityLastAt: Record<string, string | null>;
  sessionLastAt: Record<string, string | null>;
  fetchedAt: number;
};

// Stale-while-revalidate cache shared across tab focuses: revisits render the
// last seen data instantly while a background load quietly refreshes it when it
// goes stale. Kept in sync with in-screen updates (chat popup reads + messages)
// so a fast revisit can never revert them.
let chatsCache: ChatHubCache | null = null;

const CHATS_CACHE_TTL_MS = 30_000;

function buildCache(
  userId: string,
  communities: Community[],
  sessions: Session[],
  commStats: ChatHubStats,
  sessStats: ChatHubStats,
): ChatHubCache {
  return {
    userId,
    communities,
    sessions,
    communityUnread: commStats.unread,
    sessionUnread: sessStats.unread,
    communityLastAt: commStats.lastMessageAt,
    sessionLastAt: sessStats.lastMessageAt,
    fetchedAt: Date.now(),
  };
}

// Loads the Chats hub data: communities I'm a member of + sessions I created
// or am accepted on, each with an unread chat-message count. Pushes the total
// unread count into the chatUnread external store so the tab badge stays in
// sync while the screen is focused.
export function useChats(userId: string | undefined) {
  const initial = chatsCache && chatsCache.userId === userId ? chatsCache : null;

  const [communities, setCommunities] = useState<Community[]>(initial?.communities ?? []);
  const [sessions, setSessions] = useState<Session[]>(initial?.sessions ?? []);
  const [communityUnread, setCommunityUnread] = useState<Record<string, number>>(
    initial?.communityUnread ?? {},
  );
  const [sessionUnread, setSessionUnread] = useState<Record<string, number>>(
    initial?.sessionUnread ?? {},
  );
  const [communityLastAt, setCommunityLastAt] = useState<Record<string, string | null>>(
    initial?.communityLastAt ?? {},
  );
  const [sessionLastAt, setSessionLastAt] = useState<Record<string, string | null>>(
    initial?.sessionLastAt ?? {},
  );
  const [loading, setLoading] = useState(!initial);
  const [refreshing, setRefreshing] = useState(false);
  const loadInFlight = useRef(false);

  const showCache = useCallback((cache: ChatHubCache) => {
    setCommunities(cache.communities);
    setSessions(cache.sessions);
    // The cache may predate a read done in a chat opened elsewhere (e.g. via
    // /chat or a community popup). Those reads live in the per-chat store, so
    // overlay them on top of the cached snapshot — a "0" entry keeps a cleared
    // chat cleared instead of resurrecting the stale count.
    setCommunityUnread({ ...cache.communityUnread, ...getChatUnreadCountsByKind('community') });
    setSessionUnread({ ...cache.sessionUnread, ...getChatUnreadCountsByKind('session') });
    setCommunityLastAt(cache.communityLastAt);
    setSessionLastAt(cache.sessionLastAt);
    // NB: do NOT touch the store here — a stale cache render must never revert
    // a fresher per-chat count that the badge is already showing.
    setLoading(false);
  }, []);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!userId) {
        chatsCache = null;
        setCommunities([]);
        setSessions([]);
        setCommunityUnread({});
        setSessionUnread({});
        setCommunityLastAt({});
        setSessionLastAt({});
        resetChatUnreadCounts();
        setLoading(false);
        return;
      }
      if (loadInFlight.current) return;
      loadInFlight.current = true;
      try {
        // Rows first: communities/sessions render as soon as they arrive.
        const [comm, sess] = await Promise.all([
          fetchMyCommunities(userId),
          // Lean session rows — no commitment embeds or count RPC (~2 queries,
          // vs ~7 from fetchMySessions + fetchJoinedSessions).
          fetchChatSessions(userId),
        ]);

        setCommunities(comm);
        setSessions(sess);
        setLoading(false);

        // Badges + "latest activity" hydrate as each batched RPC lands; a
        // failed kind keeps whatever the cache already had (and leaves the
        // store's per-chat counts untouched).
        const [commStats, sessStats] = await Promise.all([
          fetchChatHubStats('community')
            .then((s) => {
              setCommunityUnread(s.unread);
              setCommunityLastAt(s.lastMessageAt);
              replaceChatUnreadCounts('community', s.unread);
              return s;
            })
            .catch((e) => {
              console.error('Failed to load community chat stats:', e);
              return null;
            }),
          fetchChatHubStats('session')
            .then((s) => {
              setSessionUnread(s.unread);
              setSessionLastAt(s.lastMessageAt);
              replaceChatUnreadCounts('session', s.unread);
              return s;
            })
            .catch((e) => {
              console.error('Failed to load session chat stats:', e);
              return null;
            }),
        ]);

        const effCommStats: ChatHubStats = commStats ?? {
          unread: chatsCache?.communityUnread ?? {},
          lastMessageAt: chatsCache?.communityLastAt ?? {},
        };
        const effSessStats: ChatHubStats = sessStats ?? {
          unread: chatsCache?.sessionUnread ?? {},
          lastMessageAt: chatsCache?.sessionLastAt ?? {},
        };

        chatsCache = buildCache(userId, comm, sess, effCommStats, effSessStats);
      } catch (e) {
        console.error('Failed to load chats:', e);
      } finally {
        if (!opts?.silent) setLoading(false);
        loadInFlight.current = false;
      }
    },
    [userId],
  );

  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        chatsCache = null;
        return;
      }
      const cached = chatsCache && chatsCache.userId === userId ? chatsCache : null;
      if (cached) {
        showCache(cached);
        if (Date.now() - cached.fetchedAt >= CHATS_CACHE_TTL_MS) {
          load({ silent: true });
        }
      } else {
        setLoading(true);
        load();
      }
    }, [userId, showCache, load]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Opt-in "most recent message" update used while a chat popup is open on top
  // of the hub. When a message is sent/arrives in the chat we are reading, its
  // thread re-orders instantly without a refetch — so the chat pops to the top
  // the moment we close the popup (no spinner).
  const touchLastMessage = useCallback((kind: ChatKind, chatId: string, at: string) => {
    const setter = kind === 'community' ? setCommunityLastAt : setSessionLastAt;
    const cacheKey = kind === 'community' ? 'communityLastAt' : 'sessionLastAt';
    setter((prev) => {
      const existing = prev[chatId];
      if (existing && existing >= at) return prev;
      const next = { ...prev, [chatId]: at };
      if (chatsCache) {
        chatsCache = { ...chatsCache, [cacheKey]: next };
      }
      return next;
    });
  }, []);

  // Keeps a per-chat badge in sync with the thread currently being read:
  // clears when markRead fires (badge disappears on return), bumps live while
  // incoming messages land.
  const setChatUnread = useCallback((kind: ChatKind, chatId: string, count: number) => {
    const setter = kind === 'community' ? setCommunityUnread : setSessionUnread;
    const cacheKey = kind === 'community' ? 'communityUnread' : 'sessionUnread';
    setter((prev) => {
      const next = { ...prev, [chatId]: count };
      if (chatsCache) {
        chatsCache = { ...chatsCache, [cacheKey]: next };
      }
      return next;
    });
    // Publish into the shared store too so the tab badge reacts the moment a
    // chat is read (or bumps while a realtime message lands) — no refetch.
    setChatUnreadCountFor(kind, chatId, count);
  }, []);

  const sortedCommunities = useMemo(
    () => sortByLastMessage(communities, communityLastAt),
    [communities, communityLastAt],
  );
  const sortedSessions = useMemo(
    () => sortByLastMessage(sessions, sessionLastAt),
    [sessions, sessionLastAt],
  );

  return {
    communities: sortedCommunities,
    sessions: sortedSessions,
    communityUnread,
    sessionUnread,
    loading,
    refreshing,
    refresh,
    touchLastMessage,
    setChatUnread,
  };
}