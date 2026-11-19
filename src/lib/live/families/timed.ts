import { clockElapsed, clockStart, clockStop, clockSync, clockSet, newClock } from '../clock';
import {
  other,
  type CounterSet,
  type Pair,
  type Shootout,
  type Side,
  type TimedAction,
  type TimedRules,
  type TimedSnapshot,
} from '../types';

const emptyCounters = (): CounterSet => ({ fouls: 0, timeouts: 0, yellow: 0, red: 0, corners: 0 });

export function initTimed(rules: TimedRules, at = 0): TimedSnapshot {
  return {
    family: 'timed',
    state: 'live',
    period: 1,
    phase: 'regular',
    scores: { a: 0, b: 0 },
    byPeriod: [{ a: 0, b: 0 }],
    clock: newClock(at),
    counters: { a: emptyCounters(), b: emptyCounters() },
    shootout: null,
    winner: null,
    addedMinutes: 0,
  };
}

/** Length of a period in ms (regular or overtime); null when the format has no clock. */
export function periodLimitMs(rules: TimedRules, period: number): number | null {
  if (rules.clock === 'none') return null;
  return (period > rules.periods ? rules.otSeconds : rules.periodSeconds) * 1000;
}

export function periodName(rules: TimedRules, period: number): string {
  if (period > rules.periods) {
    const n = period - rules.periods;
    if (rules.overtime === 'extra_time') return `Extra time ${n}`;
    if (rules.overtime === 'golden_goal') return n > 1 ? `Golden goal ${n}` : 'Golden goal';
    return n > 1 ? `OT${n}` : 'OT';
  }
  if (rules.periods === 4) return `Q${period}`;
  if (rules.periods === 2) return period === 1 ? '1st half' : '2nd half';
  if (rules.periods === 3) return `P${period}`;
  if (rules.periods === 1) return 'Match';
  return `Period ${period}`;
}

// ─── Shootout maths ──────────────────────────────────────────────────────────

export const shootoutNext = (so: Shootout): Side => {
  const na = so.kicks.a.length;
  const nb = so.kicks.b.length;
  if (na === nb) return so.first;
  return na < nb ? 'a' : 'b';
};

/** Who has won the shootout, if decided: best-of-N with early finish, then sudden death in equal rounds. */
export function shootoutWinner(so: Shootout, rounds: number): Side | null {
  const na = so.kicks.a.length;
  const nb = so.kicks.b.length;
  const ga = so.kicks.a.filter(Boolean).length;
  const gb = so.kicks.b.filter(Boolean).length;
  if (na >= rounds && nb >= rounds) {
    return na === nb && ga !== gb ? (ga > gb ? 'a' : 'b') : null;
  }
  if (ga > gb + (rounds - nb)) return 'a';
  if (gb > ga + (rounds - na)) return 'b';
  return null;
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

const isHalfBoundary = (rules: TimedRules, period: number): boolean => rules.periods >= 2 && period === rules.periods / 2 + 1;

function periodStartCounters(s: TimedSnapshot, rules: TimedRules, newPeriod: number): TimedSnapshot['counters'] {
  const resetFouls =
    rules.foulsReset === 'period' || (rules.foulsReset === 'half' && (isHalfBoundary(rules, newPeriod) || newPeriod > rules.periods));
  const resetTimeouts = rules.timeoutsPerHalf != null && (isHalfBoundary(rules, newPeriod) || newPeriod === rules.periods + 1);
  const next = (c: CounterSet): CounterSet => ({
    ...c,
    fouls: resetFouls ? 0 : c.fouls,
    timeouts: resetTimeouts ? 0 : c.timeouts,
  });
  return { a: next(s.counters.a), b: next(s.counters.b) };
}

function shootoutEnabled(rules: TimedRules): boolean {
  return rules.shootout !== 'none';
}

function enterShootout(s: TimedSnapshot, first: Side = 'a'): TimedSnapshot {
  return { ...s, phase: 'shootout', state: 'live', shootout: { first, kicks: { a: [], b: [] } } };
}

/** What happens when a period's time is up. */
function afterTime(s: TimedSnapshot, rules: TimedRules): TimedSnapshot {
  const { a, b } = s.scores;
  const inRegular = s.period <= rules.periods;
  if (inRegular && s.period < rules.periods) return { ...s, state: 'break' };       // quarter / half-time
  if (a !== b) return { ...s, state: 'decided', winner: a > b ? 'a' : 'b' };

  if (inRegular && rules.drawAllowed) return { ...s, state: 'decided', winner: null }; // a draw is a result

  // Level after regular time (or an overtime period) and no draw allowed.
  const otDone = s.period - rules.periods;
  if (rules.overtime === 'repeat_until_winner') return { ...s, state: 'break' };
  if ((rules.overtime === 'extra_time' || rules.overtime === 'golden_goal') && otDone < rules.otPeriods) {
    return { ...s, state: 'break' };
  }
  if (shootoutEnabled(rules)) return enterShootout(s);
  return { ...s, state: 'decided', winner: null };                                      // referee picks the winner
}

function applyScore(s: TimedSnapshot, rules: TimedRules, side: Side, value: number, at?: number): TimedSnapshot {
  if (s.phase === 'shootout' || s.state === 'decided') return s;
  const next = Math.max(0, s.scores[side] + value);
  if (next === s.scores[side]) return s;
  const scores = { ...s.scores, [side]: next };
  const byPeriod = s.byPeriod.map((p, i) => (i === s.period - 1 ? { ...p, [side]: Math.max(0, p[side] + (next - s.scores[side])) } : p));
  let st: TimedSnapshot = { ...s, scores, byPeriod };
  if (value > 0) {
    const decided =
      (rules.target != null && next >= rules.target) ||
      (rules.overtime === 'golden_goal' && st.period > rules.periods);
    if (decided) {
      st = { ...st, state: 'decided', winner: side, clock: clockStop(st.clock, at ?? st.clock.ref) };
    }
  }
  return st;
}

export function reduceTimed(s: TimedSnapshot, action: TimedAction, rules: TimedRules): TimedSnapshot {
  switch (action.t) {
    case 'clockStart':
      if (s.state !== 'live' || s.phase === 'shootout') return s;
      return { ...s, clock: clockStart(s.clock, action.at) };
    case 'clockStop':
      return { ...s, clock: clockStop(s.clock, action.at) };
    case 'clockSync':
      return { ...s, clock: clockSync(s.clock, action.at) };
    case 'clockSet':
      return { ...s, clock: clockSet(action.ms, action.at, s.clock.running) };

    case 'score':
      return applyScore(s, rules, action.side, action.value, action.at);

    case 'endPeriod': {
      if (s.state !== 'live' || s.phase === 'shootout') return s;
      const stopped: TimedSnapshot = { ...s, clock: clockStop(s.clock, action.at) };
      return afterTime(stopped, rules);
    }

    case 'nextPeriod': {
      if (s.state !== 'break') return s;
      const period = s.period + 1;
      return {
        ...s,
        state: 'live',
        period,
        phase: period > rules.periods ? 'overtime' : 'regular',
        byPeriod: [...s.byPeriod, { a: 0, b: 0 }],
        clock: newClock(s.clock.ref),
        counters: periodStartCounters(s, rules, period),
        addedMinutes: 0,
      };
    }

    case 'startShootout':
      if (!shootoutEnabled(rules) || s.phase === 'shootout') return s;
      return enterShootout({ ...s, clock: clockStop(s.clock, s.clock.ref) });

    case 'kick': {
      if (s.phase !== 'shootout' || !s.shootout || s.state === 'decided') return s;
      const side = shootoutNext(s.shootout);
      const kicks = { ...s.shootout.kicks, [side]: [...s.shootout.kicks[side], action.scored] };
      const shootout: Shootout = { ...s.shootout, kicks };
      const w = shootoutWinner(shootout, rules.shootoutRounds);
      return { ...s, shootout, state: w ? 'decided' : 'live', winner: w };
    }

    case 'counter': {
      const cur = s.counters[action.side];
      const val = Math.max(0, cur[action.key] + action.delta);
      return { ...s, counters: { ...s.counters, [action.side]: { ...cur, [action.key]: val } } };
    }

    case 'addedTime':
      return { ...s, addedMinutes: Math.max(0, Math.min(30, action.minutes)) };
  }
}

/** Elapsed ms in the current period at local time `at`. */
export const timedElapsed = (s: TimedSnapshot, at: number): number => clockElapsed(s.clock, at);

/** Team fouls ≥ bonusAt → the opponent is in the bonus. */
export const inBonus = (s: TimedSnapshot, rules: TimedRules, side: Side): boolean =>
  rules.bonusAt != null && s.counters[other(side)].fouls >= rules.bonusAt;

export const shootoutScore = (so: Shootout): Pair => ({
  a: so.kicks.a.filter(Boolean).length,
  b: so.kicks.b.filter(Boolean).length,
});
