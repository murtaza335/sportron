import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase';
import {
  fetchOpenSessions,
  fetchMySessions,
  fetchJoinedSessions,
  fetchSessionHistory,
} from '@/services/sessions';
import type { Session } from '@/types';

export type SessionScope = 'all' | 'joined' | 'my';

type SessionFeedCache = {
  userId: string;
  scope: SessionScope;
  sessions: Session[];
  fetchedAt: number;
};

type SessionHistoryCache = {
  userId: string;
  sessions: Session[];
  fetchedAt: number;
};

let sessionFeedCache: SessionFeedCache | null = null;
let sessionHistoryCache: SessionHistoryCache | null = null;

const SESSIONS_CACHE_TTL_MS = 30_000;

export function useSessionFeed(userId?: string, scope: SessionScope = 'all') {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadInFlight = useRef(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!userId) {
        setSessions([]);
        setLoading(false);
        return;
      }
      if (loadInFlight.current) return;
      loadInFlight.current = true;
      try {
        let data: Session[] = [];
        if (scope === 'all') {
          data = await fetchOpenSessions(userId);
        } else if (scope === 'joined') {
          data = await fetchJoinedSessions(userId);
        } else {
          data = await fetchMySessions(userId);
        }
        setSessions(data);
        sessionFeedCache = { userId, scope, sessions: data, fetchedAt: Date.now() };
      } catch (e) {
        console.error('Failed to load sessions:', e);
      } finally {
        if (!opts?.silent) setLoading(false);
        loadInFlight.current = false;
      }
    },
    [userId, scope],
  );

  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        setSessions([]);
        setLoading(false);
        return;
      }
      const cached = sessionFeedCache && sessionFeedCache.userId === userId && sessionFeedCache.scope === scope ? sessionFeedCache : null;
      if (cached) {
        setSessions(cached.sessions);
        setLoading(false);
        if (Date.now() - cached.fetchedAt >= SESSIONS_CACHE_TTL_MS) {
          load({ silent: true });
        }
      } else {
        setLoading(true);
        load();
      }
    }, [userId, scope, load]),
  );

  // Realtime: listen for session changes (new sessions, status updates, commitment count changes)
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`session-feed-${userId}-${scope}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sessions',
          filter: `created_by=eq.${userId}`,
        },
        () => {
          load();
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'commitments',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          load();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, scope, load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const silentRefresh = useCallback(() => {
    load({ silent: true });
  }, [load]);

  return { sessions, loading, refreshing, refresh, silentRefresh };
}

export function useSessionHistory(userId?: string) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadInFlight = useRef(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!userId) {
        setSessions([]);
        setLoading(false);
        return;
      }
      if (loadInFlight.current) return;
      loadInFlight.current = true;
      try {
        const data = await fetchSessionHistory(userId);
        setSessions(data);
        sessionHistoryCache = { userId, sessions: data, fetchedAt: Date.now() };
      } catch (e) {
        console.error('Failed to load session history:', e);
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
        setSessions([]);
        setLoading(false);
        return;
      }
      const cached = sessionHistoryCache && sessionHistoryCache.userId === userId ? sessionHistoryCache : null;
      if (cached) {
        setSessions(cached.sessions);
        setLoading(false);
        if (Date.now() - cached.fetchedAt >= SESSIONS_CACHE_TTL_MS) {
          load({ silent: true });
        }
      } else {
        setLoading(true);
        load();
      }
    }, [userId, load]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const silentRefresh = useCallback(() => {
    load({ silent: true });
  }, [load]);

  return { sessions, loading, refreshing, refresh, silentRefresh };
}
