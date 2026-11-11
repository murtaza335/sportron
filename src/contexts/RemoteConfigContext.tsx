import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { fetchFeatureFlags, fetchRemoteConfig } from '@/services/remoteConfig';

type Value = {
  flags: Record<string, boolean>;
  config: Record<string, unknown>;
  loaded: boolean;
};

const CACHE_KEY = 'remote-config-cache-v1';
const Ctx = createContext<Value>({ flags: {}, config: {}, loaded: false });

/**
 * Server-driven flags + lists (B2/B4). Starts from the last cached copy (so the app works offline / on a
 * slow start), then refreshes once per sign-in. Every consumer passes its own bundled fallback, so a
 * missing row or failed request never breaks a screen.
 */
export function RemoteConfigProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [state, setState] = useState<Value>({ flags: {}, config: {}, loaded: false });

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(CACHE_KEY)
      .then((raw) => {
        if (!raw || cancelled) return;
        const cached = JSON.parse(raw) as Pick<Value, 'flags' | 'config'>;
        setState((s) => (s.loaded ? s : { ...cached, loaded: false }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const [flags, config] = await Promise.all([fetchFeatureFlags(), fetchRemoteConfig()]);
      if (cancelled) return;
      setState((s) => {
        const next = { flags: flags ?? s.flags, config: config ?? s.config, loaded: true };
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ flags: next.flags, config: next.config })).catch(() => {});
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const value = useMemo(() => state, [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** `useFlag('announcements', true)` — `fallback` applies until the server answers / when the flag row is missing. */
export function useFlag(key: string, fallback = false): boolean {
  const { flags } = useContext(Ctx);
  return key in flags ? flags[key] : fallback;
}

/** `useRemoteConfig('limits', { chat_max_length: 1000 })` — returns `fallback` when the key is missing. */
export function useRemoteConfig<T>(key: string, fallback: T): T {
  const { config } = useContext(Ctx);
  return key in config && config[key] != null ? (config[key] as T) : fallback;
}
