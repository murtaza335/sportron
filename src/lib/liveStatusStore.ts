import { useSyncExternalStore } from 'react';

/**
 * Which matches are live right now, per tournament — filled by the screens that already poll the live board, read by
 * rows and bracket nodes (a LIVE pill) without threading props through every component.
 */
let live = new Set<string>();
const byTournament = new Map<string, Set<string>>();
const listeners = new Set<() => void>();

function rebuild() {
  const all = new Set<string>();
  byTournament.forEach((s) => s.forEach((id) => all.add(id)));
  live = all;
  listeners.forEach((l) => l());
}

export function setLiveMatchIds(tournamentId: string, ids: string[]): void {
  const next = new Set(ids);
  const cur = byTournament.get(tournamentId);
  if (cur && cur.size === next.size && ids.every((i) => cur.has(i))) return;
  byTournament.set(tournamentId, next);
  rebuild();
}

export function clearLiveMatchIds(tournamentId: string): void {
  if (byTournament.delete(tournamentId)) rebuild();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useIsLive(matchId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => live.has(matchId),
    () => false,
  );
}
