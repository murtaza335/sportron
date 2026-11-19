import type { ClockState, SummaryClock } from './types';

export const newClock = (at = 0): ClockState => ({ running: false, elapsedMs: 0, ref: at });

/** Elapsed ms at local time `at`. */
export function clockElapsed(c: ClockState, at: number): number {
  return c.running ? c.elapsedMs + Math.max(0, at - c.ref) : c.elapsedMs;
}

export function clockStart(c: ClockState, at: number): ClockState {
  return c.running ? c : { running: true, elapsedMs: c.elapsedMs, ref: at };
}

export function clockStop(c: ClockState, at: number): ClockState {
  return { running: false, elapsedMs: clockElapsed(c, at), ref: at };
}

/** Re-baseline a running clock (sent to viewers every ~30 s so they resync). */
export function clockSync(c: ClockState, at: number): ClockState {
  return c.running ? { running: true, elapsedMs: clockElapsed(c, at), ref: at } : c;
}

export function clockSet(ms: number, at: number, running: boolean): ClockState {
  return { running, elapsedMs: Math.max(0, Math.round(ms)), ref: at };
}

/**
 * Viewer side: the summary clock was valid at the server time the row was updated; while running it has
 * advanced since. `serverNowMs` must already be corrected with the server_now offset.
 */
export function viewerElapsed(c: SummaryClock, serverNowMs: number, updatedAtMs: number): number {
  return c.running ? c.elapsed_ms + Math.max(0, serverNowMs - updatedAtMs) : c.elapsed_ms;
}

/** "12:34" (or "1:02:03" past an hour). Countdowns show the remaining time, floored at 0:00. */
export function formatClock(elapsedMs: number, dir: 'up' | 'down', limitMs: number | null): string {
  const ms = dir === 'down' && limitMs != null ? Math.max(0, limitMs - elapsedMs) : Math.max(0, elapsedMs);
  const total = dir === 'down' ? Math.ceil(ms / 1000) : Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  const over = dir === 'up' && limitMs != null && elapsedMs > limitMs ? '+' : '';
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}${over}` : `${m}:${ss}${over}`;
}
