import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { fetchTournamentSchedule } from '@/services/tournaments';
import type { TournamentScheduleMatch } from '@/types';

/**
 * The tournament's matches scheduled for the device's local today (all modules the viewer can see).
 * Reloads on focus and when the app returns to the foreground, so "today" follows the clock.
 * Failures (e.g. the backend migration is not applied yet) resolve to an empty list — the UI
 * simply hides the section.
 */
export function useTournamentSchedule(tournamentId: string | undefined) {
  const [matches, setMatches] = useState<TournamentScheduleMatch[]>([]);

  const load = useCallback(async () => {
    if (!tournamentId) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    try {
      setMatches(await fetchTournamentSchedule(tournamentId, start, end));
    } catch (e) {
      setMatches([]);
      console.warn('Failed to load tournament schedule:', e);
    }
  }, [tournamentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') load();
    });
    return () => sub.remove();
  }, [load]);

  return { matches, reload: load };
}
