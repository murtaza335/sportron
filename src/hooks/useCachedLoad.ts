import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { friendlyTournamentError } from '@/lib/tournamentErrors';

// Small stale-while-revalidate cache: screens show the last data at once (also when offline) and
// refresh in the background when it is older than the TTL.
const cache = new Map<string, { data: unknown; at: number }>();
const TTL_MS = 30_000;

export function invalidateCached(prefix: string) {
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}

type State<T> = { key: string | null; data: T | null; error: string | null };

/** `key` null = disabled (never calls the server). The key must include the user id. */
export function useCachedLoad<T>(key: string | null, loader: () => Promise<T>) {
  const [state, setState] = useState<State<T>>({ key: null, data: null, error: null });
  const [refreshing, setRefreshing] = useState(false);
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });

  const load = useCallback(async () => {
    if (!key) return;
    try {
      const data = await loaderRef.current();
      cache.set(key, { data, at: Date.now() });
      setState({ key, data, error: null });
    } catch (e) {
      const saved = (cache.get(key)?.data ?? null) as T | null;
      setState({ key, data: saved, error: friendlyTournamentError(e) });
    }
  }, [key]);

  useFocusEffect(
    useCallback(() => {
      if (!key) return;
      const hit = cache.get(key);
      if (hit) {
        setState({ key, data: hit.data as T, error: null });
        if (Date.now() - hit.at < TTL_MS) return;
      }
      void load();
    }, [key, load]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const current = state.key === key ? state : null;
  const saved = key ? (cache.get(key)?.data as T | undefined) : undefined;
  const data = current?.data ?? saved ?? null;
  return {
    data,
    error: current?.error ?? null,
    loading: !!key && data === null && !current?.error,
    refreshing,
    refresh,
  };
}
