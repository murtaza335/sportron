import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { fetchEntryFields } from '@/services/tournaments';
import type { TournamentEntryField } from '@/types';

/** Entry-form field definitions for a tournament (non-archived unless `includeArchived`). */
export function useTournamentFields(tournamentId: string | undefined, includeArchived = false) {
  const [fields, setFields] = useState<TournamentEntryField[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tournamentId) return;
    try {
      setFields(await fetchEntryFields(tournamentId, includeArchived));
    } catch (e) {
      console.error('Failed to load entry fields:', e);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, includeArchived]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return { fields, loading, reload: load };
}
