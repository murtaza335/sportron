import { useEffect, useState } from 'react';

/**
 * True only for the first load of a list: items mounted while this is true get a staggered entrance,
 * anything mounted later (refresh, pagination, realtime) renders plainly. Flips off shortly after
 * `loading` becomes false so already-mounted rows are never replayed.
 */
export function useFirstLoad(loading: boolean, settleMs = 800): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (loading || settled) return;
    const id = setTimeout(() => setSettled(true), settleMs);
    return () => clearTimeout(id);
  }, [loading, settled, settleMs]);
  return !settled;
}
