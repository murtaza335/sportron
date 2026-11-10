import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase';
import {
  fetchModuleDetail,
  fetchModuleEntries,
  fetchModuleGroups,
  fetchModuleMatches,
  fetchModuleStandingsV2,
} from '@/services/tournaments';
import type {
  ModuleDetail,
  ModuleGroup,
  StandingsV2,
  TournamentEntry,
  TournamentMatch,
  TournamentStanding,
} from '@/types';

const REALTIME_DEBOUNCE_MS = 400;

const NO_STANDINGS: TournamentStanding[] = [];

/**
 * Module detail + entries + matches + standings (v2: any format).
 * Subscribes to `tournament_matches` changes for the module and refetches matches,
 * standings and detail (debounced) so everything updates live.
 *
 * `matches` = every match of the module; `bracket` = the main-side knockout matches
 * (what the v1 bracket components expect); `standings` = the knockout rows (v1 shape).
 */
export function useTournamentModule(moduleId: string | undefined) {
  const [detail, setDetail] = useState<ModuleDetail | null>(null);
  const [entries, setEntries] = useState<TournamentEntry[]>([]);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [standingsV2, setStandingsV2] = useState<StandingsV2 | null>(null);
  const [groups, setGroups] = useState<ModuleGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!moduleId) return null;
    const [d, e, mt, st] = await Promise.all([
      fetchModuleDetail(moduleId),
      fetchModuleEntries(moduleId),
      fetchModuleMatches(moduleId),
      fetchModuleStandingsV2(moduleId),
    ]);
    // Group draw before any match is played is only visible through get_module_groups.
    let g: ModuleGroup[] = [];
    if (d.module.format === 'groups_knockout' && mt.length > 0) {
      try {
        g = await fetchModuleGroups(moduleId);
      } catch {
        g = [];
      }
    }
    return { d, e, mt, st, g };
  }, [moduleId]);

  const loadAll = useCallback(async () => {
    if (!moduleId) return;
    try {
      const r = await fetchAll();
      if (r) {
        setDetail(r.d);
        setEntries(r.e);
        setMatches(r.mt);
        setStandingsV2(r.st);
        setGroups(r.g);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load module');
      console.error('Failed to load tournament module:', e);
    } finally {
      setLoading(false);
    }
  }, [moduleId, fetchAll]);

  const loadLive = useCallback(async () => {
    if (!moduleId) return;
    try {
      const r = await fetchAll();
      if (r) {
        setDetail(r.d);
        setEntries(r.e);
        setMatches(r.mt);
        setStandingsV2(r.st);
        setGroups(r.g);
      }
    } catch (e) {
      console.error('Failed to refresh tournament module:', e);
    }
  }, [moduleId, fetchAll]);

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
    // Unique topic per hook instance: the module screen and its manage/seeding/rounds screens are
    // mounted simultaneously in the stack, and supabase.channel() returns the SAME (already
    // subscribed) channel for a repeated topic, making .on() throw.
    const channel = supabase
      .channel(`tournament-module-${moduleId}-${Math.random().toString(36).slice(2)}`)
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
  const bracket = matches.filter((x) => x.bracket_side === 'main');
  const standings = standingsV2?.kind === 'knockout' ? (standingsV2.rows ?? NO_STANDINGS) : NO_STANDINGS;
  return {
    module: detail?.module ?? null,
    tournament: detail?.tournament ?? null,
    rounds: detail?.rounds ?? [],
    admins: detail?.admins ?? [],
    counts: detail?.counts ?? null,
    entries,
    matches,
    bracket,
    standings,
    standingsV2,
    groups,
    myRole,
    isModuleAdmin: myRole === 'module_admin' || myRole === 'tournament_admin',
    loading,
    refreshing,
    error,
    refresh,
  };
}
