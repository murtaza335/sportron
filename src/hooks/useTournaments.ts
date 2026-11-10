import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { fetchTournaments } from '@/services/tournaments';
import type { TournamentListItem, TournamentScope } from '@/types';

const CACHE_TTL_MS = 30_000;
const cache = new Map<TournamentScope, { at: number; data: TournamentListItem[] }>();

/** Drop cached lists (e.g. after the user's role could have changed). */
export function invalidateTournamentsCache() {
  cache.clear();
}

/** Tournaments by scope: stale-while-revalidate (30s cache), reloads on focus. */
export function useTournaments(scope: TournamentScope) {
  const cached = cache.get(scope);
  const [tournaments, setTournaments] = useState<TournamentListItem[]>(cached?.data ?? []);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(
    async (force = false) => {
      const hit = cache.get(scope);
      if (hit) {
        setTournaments(hit.data);
        setLoading(false);
        if (!force && Date.now() - hit.at < CACHE_TTL_MS) return;
      } else {
        setTournaments([]);
        setLoading(true);
      }
      const id = ++requestId.current;
      try {
        const data = await fetchTournaments(scope);
        cache.set(scope, { at: Date.now(), data });
        if (id === requestId.current) {
          setTournaments(data);
          setError(null);
        }
      } catch (e) {
        if (id === requestId.current) {
          setError(e instanceof Error ? e.message : 'Failed to load tournaments');
        }
        console.error('Failed to load tournaments:', e);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [scope],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  return { tournaments, loading, refreshing, error, refresh };
}
