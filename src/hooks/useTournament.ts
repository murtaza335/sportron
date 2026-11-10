import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { fetchTournamentDetail } from '@/services/tournaments';
import type { TournamentDetail } from '@/types';

/** Tournament detail (champions, modules, admins). Reloads on focus. */
export function useTournament(tournamentId: string | undefined) {
  const [detail, setDetail] = useState<TournamentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const data = await fetchTournamentDetail(tournamentId);
      setDetail(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tournament');
      console.error('Failed to load tournament:', e);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

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

  return {
    detail,
    loading,
    refreshing,
    error,
    refresh,
    isTournamentAdmin: detail?.my_role === 'tournament_admin',
  };
}
