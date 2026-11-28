import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { fetchMyScoringMatches } from '@/services/tournaments';
import type { ScoringMatch } from '@/types';

// Shared 30 s stale-while-revalidate cache so the Tournaments-tab card and the list agree.
let cache: { userId: string; rows: ScoringMatch[]; at: number } | null = null;
const TTL_MS = 30_000;

/** Matches the signed-in person can score. `enabled` false = never calls the server. Reloads on focus. */
export function useScoringMatches(enabled: boolean) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<{ rows: ScoringMatch[] | null; error: string | null }>(() => ({
    rows: cache && cache.userId === userId ? cache.rows : null,
    error: null,
  }));
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const rows = await fetchMyScoringMatches();
      cache = { userId, rows, at: Date.now() };
      setState({ rows, error: null });
    } catch (e) {
      // keep whatever is on screen (offline), only report the problem
      setState((s) => ({ rows: s.rows, error: friendlyTournamentError(e) }));
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled || !userId) return;
      if (cache && cache.userId === userId) {
        setState({ rows: cache.rows, error: null });
        if (Date.now() - cache.at < TTL_MS) return;
      }
      void load();
    }, [enabled, userId, load]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return {
    matches: enabled && userId ? state.rows : null,
    error: state.error,
    loading: enabled && !!userId && state.rows === null && !state.error,
    refreshing,
    refresh,
  };
}
