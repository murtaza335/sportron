import { useCallback, useEffect, useState } from 'react';

import { fetchGlobalMatches, fetchMyMatches } from '@/services/matches';
import type { MatchWithProfiles } from '@/types';

export function useMatches(userId: string | undefined, mode: 'global' | 'mine') {
  const [matches, setMatches] = useState<MatchWithProfiles[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data =
        mode === 'global' ? await fetchGlobalMatches(userId) : await fetchMyMatches(userId!);
      setMatches(data);
    } catch (error) {
      console.error('Failed to load matches:', error);
      setMatches([]);
    }
  }, [mode, userId]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    if (mode === 'mine' && !userId) {
      setTimeout(() => {
        setMatches([]);
        setLoading(false);
      }, 0);
      return;
    }

    setTimeout(() => {
      setLoading(true);
      load().finally(() => setLoading(false));
    }, 0);
  }, [load, mode, userId]);

  return { matches, loading, refreshing, refresh };
}
