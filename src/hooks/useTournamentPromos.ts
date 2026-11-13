import { useCallback, useEffect, useState } from 'react';

import { fetchTournamentPromos, revealTournamentPromo } from '@/services/tournaments';
import type { TournamentPromo } from '@/types';

/**
 * Active discount codes for a tournament (A8). Failures are swallowed: a missing/old server just
 * means "no promo", the tournament page must look unchanged.
 */
export function useTournamentPromos(tournamentId: string | undefined) {
  const [promos, setPromos] = useState<TournamentPromo[]>([]);

  const load = useCallback(async () => {
    if (!tournamentId) return;
    try {
      setPromos(await fetchTournamentPromos(tournamentId));
    } catch {
      setPromos([]);
    }
  }, [tournamentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  /** Ask the server for the code (records the reveal) and update the local row. */
  const reveal = useCallback(async (promoId: string): Promise<string | null> => {
    try {
      const code = await revealTournamentPromo(promoId);
      setPromos((prev) => prev.map((p) => (p.id === promoId ? { ...p, code, revealed: true } : p)));
      return code;
    } catch {
      return null;
    }
  }, []);

  return { promos, reload: load, reveal };
}
