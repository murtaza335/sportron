import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { fetchMyCommunities, fetchPublicCommunities } from '@/services/communities';
import type { Community } from '@/types';

export function useCommunities() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchPublicCommunities();
      setCommunities(data);
    } catch (e) {
      console.error('Failed to load communities:', e);
    } finally {
      setLoading(false);
    }
  }, []);

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

  return { communities, loading, refreshing, refresh };
}

export function useMyCommunities(userId: string | undefined) {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await fetchMyCommunities(userId);
      setCommunities(data);
    } catch (e) {
      console.error('Failed to load my communities:', e);
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

  return { communities, loading, refreshing, refresh };
}
