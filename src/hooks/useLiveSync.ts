import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { liveOutbox } from '@/lib/liveOutbox';
import type { OutboxStatus } from '@/lib/liveOutboxCore';

/** Sync status of one match's outbox slot (null until the slot is opened). */
export function useLiveSync(matchId: string | null | undefined): OutboxStatus | null {
  const subscribe = useCallback(
    (cb: () => void) => (matchId ? liveOutbox.subscribe(matchId, cb) : () => {}),
    [matchId],
  );
  const get = useCallback(() => (matchId ? liveOutbox.status(matchId) : null), [matchId]);
  return useSyncExternalStore(subscribe, get, get);
}

export interface PendingLive {
  matchId: string;
  tournamentId: string;
  moduleId: string;
  label: string;
  pending: number;
  hasFinish: boolean;
}

/** Unfinished live matches stored on this phone — drives the "Resume scoring" banner. */
export function usePendingLive(): PendingLive[] {
  const [list, setList] = useState<PendingLive[]>([]);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      const rows = await liveOutbox.listPersisted();
      if (alive) setList(rows);
    };
    void load();
    // Every tap emits; re-reading storage at most twice a second is plenty for a banner.
    const off = liveOutbox.subscribeAny(() => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void load();
      }, 500);
    });
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      off();
    };
  }, []);
  return list;
}
