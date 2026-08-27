import { AppState, type AppStateStatus } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { fetchMaintenanceMode, type MaintenanceConfig } from '@/services/config';

const POLL_INTERVAL_MS = 30_000;

type MaintenanceContextValue = {
  isMaintenanceMode: boolean;
  message: string;
  loading: boolean;
  retry: () => Promise<void>;
};

const MaintenanceContext = createContext<MaintenanceContextValue | null>(null);

export function MaintenanceProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<MaintenanceConfig>({ enabled: false, message: '' });
  const [loading, setLoading] = useState(true);
  const appState = useRef(AppState.currentState);

  const check = useCallback(async () => {
    const next = await fetchMaintenanceMode();
    setConfig(next);
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval>;

    (async () => {
      await check();
      if (active) setLoading(false);
    })();

    timer = setInterval(() => {
      if (active) check();
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [check]);

  // Re-fetch when app comes back to foreground
  useEffect(() => {
    const handleAppState = (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        check();
      }
      appState.current = next;
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [check]);

  const retry = useCallback(async () => {
    setLoading(true);
    await check();
    setLoading(false);
  }, [check]);

  const value = useMemo(
    () => ({
      isMaintenanceMode: config.enabled,
      message: config.message,
      loading,
      retry,
    }),
    [config.enabled, config.message, loading, retry],
  );

  return <MaintenanceContext.Provider value={value}>{children}</MaintenanceContext.Provider>;
}

export function useMaintenance() {
  const context = useContext(MaintenanceContext);
  if (!context) {
    throw new Error('useMaintenance must be used within MaintenanceProvider');
  }
  return context;
}
