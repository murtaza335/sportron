import { clockElapsed } from './clock';
import { inningsOvers, inningsScore, runsNeeded, ballsLeft } from './families/cricket';
import { isGamePoint, isMatchPoint, setsNotices } from './families/sets';
import { inBonus, periodLimitMs, periodName, shootoutScore } from './families/timed';
import { sideName, sideOutCall, tennisIsDeuce, tennisPoint } from './format';
import type {
  ClockState,
  CricketRules,
  CricketSnapshot,
  LiveRules,
  LiveSnapshot,
  Names,
  SetsRules,
  SetsSnapshot,
  SimpleRules,
  SimpleSnapshot,
  Summary,
  SummaryClock,
  TennisRules,
  TennisSnapshot,
  TimedRules,
  TimedSnapshot,
} from './types';

export interface SummaryOptions {
  names?: Names;
  /** Local epoch ms used to freeze running clocks into `elapsed_ms` (defaults to the clock's own reference). */
  at?: number;
}

const FINAL = 'FINAL';

function clockSummary(clock: ClockState, mode: 'up' | 'down' | 'none', limitMs: number | null, at?: number): SummaryClock | null {
  if (mode === 'none') return null;
  return { running: clock.running, elapsed_ms: clockElapsed(clock, at ?? clock.ref), dir: mode, limit_ms: limitMs };
}

function summarizeSets(s: SetsSnapshot, rules: SetsRules, names?: Names): Summary {
  const decided = s.state === 'decided';
  const parts: string[] = [];
  if (decided) {
    parts.push('Final');
  } else {
    parts.push(`Game ${s.state === 'break' ? s.gameIndex + 2 : s.gameIndex + 1}`);
    if (s.state === 'live') {
      for (const side of ['a', 'b'] as const) {
        if (isMatchPoint(s, rules, side)) parts.push(`Match point ${sideName(side, names)}`);
        else if (isGamePoint(s, rules, side)) parts.push(`Game point ${sideName(side, names)}`);
      }
    }
    const n = setsNotices(s, rules);
    if (n.changeEnds) parts.push('Change ends');
    if (n.interval) parts.push('Interval');
  }
  if (rules.serve === 'side_out' && s.state === 'live' && s.server) {
    const serving = s.cur[s.server];
    const receiving = s.cur[s.server === 'a' ? 'b' : 'a'];
    parts.push(rules.doubles ? sideOutCall(serving, receiving, s.serverNumber) : `${serving}–${receiving}`);
  }
  return {
    a: decided ? String(s.setsWon.a) : String(s.cur.a),
    b: decided ? String(s.setsWon.b) : String(s.cur.b),
    a_mid: decided ? null : String(s.setsWon.a),
    b_mid: decided ? null : String(s.setsWon.b),
    a_sub: s.games.map((g) => String(g.a)),
    b_sub: s.games.map((g) => String(g.b)),
    line: parts.join(' · '),
    server: s.state === 'live' && rules.serve !== 'none' ? s.server : null,
    clock: null,
    state_label: decided ? FINAL : s.state === 'break' ? 'Game break' : 'LIVE',
  };
}

function summarizeTennis(s: TennisSnapshot, rules: TennisRules, names?: Names): Summary {
  const decided = s.state === 'decided';
  const golden = rules.deuce === 'golden_point';
  const live = s.state === 'live';
  const label = (mine: number, theirs: number) =>
    s.tb !== 'none' ? String(mine) : tennisPoint(mine, theirs, golden);
  const parts: string[] = [];
  if (decided) {
    parts.push('Final');
  } else {
    parts.push(`Set ${s.state === 'break' ? s.setIndex + 2 : s.setIndex + 1}`);
    if (s.tb === 'super') parts.push('Super tiebreak');
    else if (s.tb === 'tiebreak') parts.push('Tiebreak');
    else if (live && golden && tennisIsDeuce(s.points.a, s.points.b)) parts.push('Deciding point');
    else if (live && tennisIsDeuce(s.points.a, s.points.b)) parts.push('Deuce');
  }
  void names;
  const showGames = !decided && s.state === 'live';
  return {
    a: decided ? String(s.setsWon.a) : label(s.points.a, s.points.b),
    b: decided ? String(s.setsWon.b) : label(s.points.b, s.points.a),
    a_mid: decided ? null : showGames ? String(s.games.a) : String(s.setsWon.a),
    b_mid: decided ? null : showGames ? String(s.games.b) : String(s.setsWon.b),
    a_sub: s.sets.map((x) => String(x.a)),
    b_sub: s.sets.map((x) => String(x.b)),
    line: parts.join(' · '),
    server: live ? s.server : null,
    clock: null,
    state_label: decided ? FINAL : s.state === 'break' ? 'Set break' : 'LIVE',
  };
}

function timedStateLabel(s: TimedSnapshot, rules: TimedRules): string {
  if (s.state === 'decided') return FINAL;
  if (s.phase === 'shootout') return rules.shootout === 'seven_metre' ? '7 m throws' : 'Penalties';
  if (s.state === 'break') {
    if (rules.periods === 2 && s.period === 1) return 'Half-time';
    if (rules.periods === 4 && s.period === 2) return 'Half-time';
    if (s.period >= rules.periods) return 'Break before extra time';
    return 'Break';
  }
  return s.phase === 'overtime' ? 'Overtime' : 'LIVE';
}

function summarizeTimed(s: TimedSnapshot, rules: TimedRules, opts: SummaryOptions): Summary {
  const so = s.shootout;
  const decided = s.state === 'decided';
  const finished = s.byPeriod.slice(0, decided || s.state === 'break' ? s.byPeriod.length : s.period - 1);
  const parts: string[] = [];
  if (s.phase === 'shootout' && so) {
    const sc = shootoutScore(so);
    parts.push(`${rules.shootout === 'seven_metre' ? '7 m throws' : 'Penalties'} ${sc.a}–${sc.b}`);
  } else if (decided) {
    parts.push('Final');
  } else {
    parts.push(periodName(rules, s.period));
    if (s.addedMinutes > 0) parts.push(`+${s.addedMinutes}'`);
    if (s.phase === 'overtime' && rules.otTarget) parts.push(`First to ${rules.otTarget}`);
    for (const side of ['a', 'b'] as const) {
      if (inBonus(s, rules, side)) parts.push(`Bonus ${sideName(side, opts.names)}`);
    }
  }
  const mark = (v: boolean) => (v ? '✓' : '✗');
  const inShootout = s.phase === 'shootout' && so;
  const sc = so ? shootoutScore(so) : null;
  return {
    a: String(s.scores.a),
    b: String(s.scores.b),
    a_mid: inShootout && sc ? String(sc.a) : null,
    b_mid: inShootout && sc ? String(sc.b) : null,
    a_sub: inShootout && so ? so.kicks.a.map(mark) : finished.map((p) => String(p.a)),
    b_sub: inShootout && so ? so.kicks.b.map(mark) : finished.map((p) => String(p.b)),
    line: parts.join(' · '),
    server: null,
    clock: inShootout || decided ? null : clockSummary(s.clock, rules.clock, periodLimitMs(rules, s.period), opts.at),
    state_label: timedStateLabel(s, rules),
  };
}

function summarizeCricket(s: CricketSnapshot, rules: CricketRules, opts: SummaryOptions): Summary {
  const names = opts.names;
  const cur = s.innings[s.current];
  const mine = (side: 'a' | 'b') => s.innings.find((i) => i.batting === side);
  const scoreOf = (side: 'a' | 'b') => {
    const i = mine(side);
    return i ? inningsScore(i) : '—';
  };
  const oversOf = (side: 'a' | 'b') => {
    const i = mine(side);
    return i ? inningsOvers(i, rules) : null;
  };
  const parts: string[] = [];
  if (s.state === 'decided') {
    const w = s.winner ? sideName(s.winner, names) : null;
    parts.push(s.tied ? 'Match tied' : `${w} ${s.resultText}`);
  } else if (s.state === 'break') {
    parts.push(`Innings break · target ${s.target ?? '—'}`);
  } else {
    parts.push(`${s.current === 0 ? '1st' : '2nd'} innings · ${inningsOvers(cur, rules)}/${rules.overs} ov`);
    const need = runsNeeded(s);
    if (need != null) parts.push(`need ${need} off ${ballsLeft(s, rules)}`);
  }
  const sub = (side: 'a' | 'b') => (s.state === 'live' && cur.batting === side ? cur.thisOver : []);
  return {
    a: scoreOf('a'),
    b: scoreOf('b'),
    a_mid: oversOf('a'),
    b_mid: oversOf('b'),
    a_sub: sub('a'),
    b_sub: sub('b'),
    line: parts.join(' · '),
    server: s.state === 'live' ? cur.batting : null,
    clock: null,
    state_label: s.state === 'decided' ? FINAL : s.state === 'break' ? 'Innings break' : 'LIVE',
  };
}

function summarizeSimple(s: SimpleSnapshot, rules: SimpleRules, opts: SummaryOptions): Summary {
  return {
    a: String(s.scores.a),
    b: String(s.scores.b),
    a_sub: [],
    b_sub: [],
    line: s.state === 'decided' ? 'Final' : rules.target != null ? `First to ${rules.target}` : '',
    server: null,
    clock: s.state === 'decided' ? null : clockSummary(s.clock, rules.clock, rules.minutes > 0 ? rules.minutes * 60000 : null, opts.at),
    state_label: s.state === 'decided' ? FINAL : 'LIVE',
  };
}

/** One family-independent view of a snapshot — what list cards, the projector and the DB `summary` column carry. */
export function summarize(snap: LiveSnapshot, rules: LiveRules, opts: SummaryOptions = {}): Summary {
  if (snap.family === 'sets' && rules.family === 'sets') return summarizeSets(snap, rules, opts.names);
  if (snap.family === 'tennis' && rules.family === 'tennis') return summarizeTennis(snap, rules, opts.names);
  if (snap.family === 'timed' && rules.family === 'timed') return summarizeTimed(snap, rules, opts);
  if (snap.family === 'cricket' && rules.family === 'cricket') return summarizeCricket(snap, rules, opts);
  if (snap.family === 'simple' && rules.family === 'simple') return summarizeSimple(snap, rules, opts);
  throw new Error(`live: snapshot family ${snap.family} does not match rules family ${rules.family}`);
}
