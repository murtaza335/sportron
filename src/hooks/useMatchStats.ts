import { useCallback, useEffect, useState } from 'react';

import { fetchMatchStats } from '@/services/matches';

export function useMatchStats(userId: string | undefined) {
  const [stats, setStats] = useState({ total: 0, wins: 0, losses: 0 });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setStats({ total: 0, wins: 0, losses: 0 });
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await fetchMatchStats(userId);
      setStats(data);
    } catch (error) {
      console.error('Failed to load match stats:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { stats, loading, refresh };
}
