import type { LiveBoard, LiveMatch, LiveScoreEvent } from './boardTypes';

/** Pure helpers shared by the app hooks and the projector page. */

export interface ApplyResult {
  board: LiveBoard;
  /** The event can't be applied in place (unknown match, finished, removed) — refetch the board. */
  refetch: boolean;
}

/**
 * Apply one broadcast to a board: only newer `seq` wins; a live → break / live change is applied in place;
 * anything that moves a match between lists (finished, removed, not on the board yet) asks for a refetch.
 */
export function applyScoreEvent(board: LiveBoard, ev: LiveScoreEvent): ApplyResult {
  if (ev.removed) return { board, refetch: true };
  const idx = board.live.findIndex((m) => m.match_id === ev.match_id);
  if (idx < 0) return { board, refetch: true };
  const cur = board.live[idx];
  if (ev.seq != null && cur.seq != null && ev.seq <= cur.seq) return { board, refetch: false };
  if (ev.state === 'finished' || ev.state === 'abandoned') return { board, refetch: true };
  const next: LiveMatch = {
    ...cur,
    state: ev.state ?? cur.state,
    summary: ev.summary ?? cur.summary,
    snapshot: ev.snapshot ?? cur.snapshot,
    seq: ev.seq ?? cur.seq,
    updated_at: ev.updated_at ?? cur.updated_at,
  };
  const live = board.live.slice();
  live[idx] = next;
  return { board: { ...board, live }, refetch: false };
}

/** Same single-match version for the live match screen. */
export function applyScoreToMatch(cur: LiveMatch, ev: LiveScoreEvent): { match: LiveMatch; refetch: boolean } {
  if (ev.match_id !== cur.match_id) return { match: cur, refetch: false };
  if (ev.removed) return { match: cur, refetch: true };
  if (ev.seq != null && cur.seq != null && ev.seq <= cur.seq) return { match: cur, refetch: false };
  const next: LiveMatch = {
    ...cur,
    state: ev.state ?? cur.state,
    summary: ev.summary ?? cur.summary,
    snapshot: ev.snapshot ?? cur.snapshot,
    seq: ev.seq ?? cur.seq,
    updated_at: ev.updated_at ?? cur.updated_at,
    finished_at: ev.state === 'finished' ? (cur.finished_at ?? ev.updated_at ?? null) : cur.finished_at,
  };
  return { match: next, refetch: false };
}

// ─── Courts (projector tiles, app filters) ───────────────────────────────────

/** "Court 2" and " court 2 " are the same court. */
export const courtKey = (court: string | null | undefined): string => (court ?? '').trim().toLowerCase();

/** Natural order: "Court 2" before "Court 10". */
export function compareCourts(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** A viewer's staleness note: a live match with no update for this long shows "waiting for scorer". */
export const STALE_MS = 90_000;

export function isStale(m: LiveMatch, serverNowMs: number): boolean {
  if (m.state !== 'live' || !m.updated_at) return false;
  if (m.summary?.clock?.running) return false;
  return serverNowMs - new Date(m.updated_at).getTime() > STALE_MS;
}
