import { reduce } from './engine';
import { sideName } from './format';
import type { LiveAction, LiveRules, LiveSnapshot, Names } from './types';

/** Undo / redo history for one match. Pure — the screen keeps it in state, the outbox persists it. */
export interface TimelineEntry {
  snap: LiveSnapshot;
  /** What the action that LEFT this snapshot was ("+1 Ali") — shown as "Undo +1 Ali". */
  label: string;
}

export interface Timeline {
  present: LiveSnapshot;
  past: TimelineEntry[];
  future: TimelineEntry[];
  /** Label of the action that produced `present`. */
  lastLabel: string | null;
}

export const MAX_HISTORY = 2000;

export const newTimeline = (snap: LiveSnapshot): Timeline => ({ present: snap, past: [], future: [], lastLabel: null });

/** Clock moves are not scoring steps: they update the present without an undo entry. */
const isClockAction = (a: LiveAction): boolean =>
  a.t === 'clockStart' || a.t === 'clockStop' || a.t === 'clockSync' || a.t === 'clockSet';

export function actionLabel(action: LiveAction, rules: LiveRules, names?: Names): string {
  const n = (s: 'a' | 'b') => sideName(s, names);
  switch (action.t) {
    case 'point':
      return rules.family === 'sets' && rules.serve === 'side_out' ? `Rally ${n(action.side)}` : `+1 ${n(action.side)}`;
    case 'unpoint':
      return `−1 ${n(action.side)}`;
    case 'score':
      return `${action.value >= 0 ? '+' : '−'}${Math.abs(action.value)} ${n(action.side)}`;
    case 'nextGame':
    case 'nextSet':
      return 'Start next game';
    case 'nextPeriod':
      return 'Start next period';
    case 'endPeriod':
      return 'End period';
    case 'kick':
      return action.scored ? 'Kick scored' : 'Kick missed';
    case 'startShootout':
      return 'Start shootout';
    case 'counter':
      return `${action.key} ${action.delta >= 0 ? '+' : '−'}1 ${n(action.side)}`;
    case 'addedTime':
      return `Added time ${action.minutes}'`;
    case 'setServer':
      return `Serve ${n(action.side)}`;
    case 'timeout':
      return `Timeout ${action.delta >= 0 ? '+' : '−'}1 ${n(action.side)}`;
    case 'ball':
      return action.kind === 'normal' ? `${action.runs} run${action.runs === 1 ? '' : 's'}` : `${action.kind} ${action.runs}`;
    case 'wicket':
      return 'Wicket';
    case 'penalty':
      return `Penalty ${action.runs}`;
    case 'endInnings':
      return 'End innings';
    case 'nextInnings':
      return 'Start 2nd innings';
    default:
      return 'Action';
  }
}

export function applyAction(tl: Timeline, action: LiveAction, rules: LiveRules, names?: Names): Timeline {
  const next = reduce(tl.present, action, rules);
  if (next === tl.present) return tl;
  if (isClockAction(action)) return { ...tl, present: next };
  const label = actionLabel(action, rules, names);
  const past = [...tl.past, { snap: tl.present, label }];
  if (past.length > MAX_HISTORY) past.splice(0, past.length - MAX_HISTORY);
  return { present: next, past, future: [], lastLabel: label };
}

/** An undone snapshot must not rewind a running clock: keep the live clock when the period is unchanged. */
function keepClock(restored: LiveSnapshot, current: LiveSnapshot, at: number): LiveSnapshot {
  if (restored.family === 'simple' && current.family === 'simple') return { ...restored, clock: current.clock };
  if (restored.family === 'timed' && current.family === 'timed') {
    if (restored.period === current.period) return { ...restored, clock: current.clock };
    return { ...restored, clock: { running: false, elapsedMs: restored.clock.elapsedMs, ref: at } };
  }
  return restored;
}

export const canUndo = (tl: Timeline): boolean => tl.past.length > 0;
export const canRedo = (tl: Timeline): boolean => tl.future.length > 0;

/** "Undo +1 Ali" — or null when there is nothing to undo. */
export const undoLabel = (tl: Timeline): string | null => (tl.past.length ? `Undo ${tl.past[tl.past.length - 1].label}` : null);
export const redoLabel = (tl: Timeline): string | null => (tl.future.length ? `Redo ${tl.future[0].label}` : null);

export function undo(tl: Timeline, at: number): Timeline {
  const last = tl.past[tl.past.length - 1];
  if (!last) return tl;
  return {
    present: keepClock(last.snap, tl.present, at),
    past: tl.past.slice(0, -1),
    future: [{ snap: tl.present, label: last.label }, ...tl.future],
    lastLabel: tl.past.length > 1 ? tl.past[tl.past.length - 2].label : null,
  };
}

export function redo(tl: Timeline, at: number): Timeline {
  const first = tl.future[0];
  if (!first) return tl;
  return {
    present: keepClock(first.snap, tl.present, at),
    past: [...tl.past, { snap: tl.present, label: first.label }],
    future: tl.future.slice(1),
    lastLabel: first.label,
  };
}
