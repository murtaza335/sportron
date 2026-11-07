import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase';
import {
  fetchModuleBracket,
  fetchModuleDetail,
  fetchModuleEntries,
  fetchModuleStandings,
} from '@/services/tournaments';
import type {
  ModuleDetail,
  TournamentEntry,
  TournamentMatch,
  TournamentStanding,
} from '@/types';

const REALTIME_DEBOUNCE_MS = 400;

/**
 * Module detail + entries + bracket + standings.
 * Subscribes to `tournament_matches` changes for the module and refetches the
 * bracket, standings and detail (debounced) so the bracket updates live.
 */
export function useTournamentModule(moduleId: string | undefined) {
  const [detail, setDetail] = useState<ModuleDetail | null>(null);
  const [entries, setEntries] = useState<TournamentEntry[]>([]);
  const [bracket, setBracket] = useState<TournamentMatch[]>([]);
  const [standings, setStandings] = useState<TournamentStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!moduleId) return;
    try {
      const [d, e, b, s] = await Promise.all([
        fetchModuleDetail(moduleId),
        fetchModuleEntries(moduleId),
        fetchModuleBracket(moduleId),
        fetchModuleStandings(moduleId),
      ]);
      setDetail(d);
      setEntries(e);
      setBracket(b);
      setStandings(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load module');
      console.error('Failed to load tournament module:', e);
    } finally {
      setLoading(false);
    }
  }, [moduleId]);

  const loadLive = useCallback(async () => {
    if (!moduleId) return;
    try {
      const [d, b, s, e] = await Promise.all([
        fetchModuleDetail(moduleId),
        fetchModuleBracket(moduleId),
        fetchModuleStandings(moduleId),
        fetchModuleEntries(moduleId),
      ]);
      setDetail(d);
      setBracket(b);
      setStandings(s);
      setEntries(e);
    } catch (e) {
      console.error('Failed to refresh tournament module:', e);
    }
  }, [moduleId]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll]),
  );

  const liveRef = useRef(loadLive);
  useEffect(() => {
    liveRef.current = loadLive;
  }, [loadLive]);

  useEffect(() => {
    if (!moduleId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`tournament-module-${moduleId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tournament_matches',
          filter: `module_id=eq.${moduleId}`,
        },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => liveRef.current(), REALTIME_DEBOUNCE_MS);
        },
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [moduleId]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const myRole = detail?.my_role ?? null;
  return {
    module: detail?.module ?? null,
    tournament: detail?.tournament ?? null,
    rounds: detail?.rounds ?? [],
    admins: detail?.admins ?? [],
    counts: detail?.counts ?? null,
    entries,
    bracket,
    standings,
    myRole,
    isModuleAdmin: myRole === 'module_admin' || myRole === 'tournament_admin',
    loading,
    refreshing,
    error,
    refresh,
  };
}
