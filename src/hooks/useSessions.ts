import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import {
  fetchOpenSessions,
  fetchMySessions,
  fetchJoinedSessions,
  fetchSessionHistory,
} from '@/services/sessions';
import type { Session } from '@/types';

export type SessionScope = 'all' | 'joined' | 'my';

export function useSessionFeed(userId?: string, scope: SessionScope = 'all') {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    if (!userId) {
      setSessions([]);
      setLoading(false);
      return;
    }
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
    } catch (e) {
      console.error('Failed to load sessions:', e);
    } finally {
      setLoading(false);
    }
  }, [userId, scope]);

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

  return { sessions, loading, refreshing, refresh };
}

export function useSessionHistory(userId?: string) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    if (!userId) {
      setSessions([]);
      setLoading(false);
      return;
    }
    try {
      const data = await fetchSessionHistory(userId);
      setSessions(data);
    } catch (e) {
      console.error('Failed to load session history:', e);
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

  return { sessions, loading, refreshing, refresh };
}
