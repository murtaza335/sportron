import { sideRuns, inningsOvers, inningsScore } from './families/cricket';
import { shootoutScore } from './families/timed';
import { sideName } from './format';
import type { LiveRules, LiveSnapshot, MatchResult, Names, Pair, Side } from './types';

export interface ResultOptions {
  names?: Names;
  /** The match may end level (league / group with draws on). Defaults to the rules' own flag where they have one. */
  drawAllowed?: boolean;
}

const cmp = (p: Pair): Side | null => (p.a > p.b ? 'a' : p.b > p.a ? 'b' : null);
const nonEmpty = (p: Pair) => p.a !== 0 || p.b !== 0;

/**
 * Map a live snapshot to what the existing `record_tournament_result` RPC takes
 * (docs/live-match/PLAN.md §5.5): scores, per-game detail, winner, note.
 */
export function toResult(snap: LiveSnapshot, rules: LiveRules, opts: ResultOptions = {}): MatchResult {
  const names = opts.names;
  const decided = snap.state === 'decided';

  if (snap.family === 'sets') {
    const detail = [...snap.games, ...(!decided && nonEmpty(snap.cur) ? [snap.cur] : [])];
    const winner = snap.winner ?? cmp(snap.setsWon);
    return {
      scoreA: snap.setsWon.a,
      scoreB: snap.setsWon.b,
      detail: detail.length ? detail : null,
      winner,
      draw: !winner && !!opts.drawAllowed,
      needsWinner: !winner && !opts.drawAllowed,
      decided,
      note: null,
    };
  }

  if (snap.family === 'tennis') {
    const cur = { a: snap.games.a, b: snap.games.b };
    const detail: Pair[] = [...snap.sets.map((x) => ({ a: x.a, b: x.b })), ...(!decided && nonEmpty(cur) ? [cur] : [])];
    const winner = snap.winner ?? cmp(snap.setsWon);
    return {
      scoreA: snap.setsWon.a,
      scoreB: snap.setsWon.b,
      detail: detail.length ? detail : null,
      winner,
      draw: !winner && !!opts.drawAllowed,
      needsWinner: !winner && !opts.drawAllowed,
      decided,
      note: null,
    };
  }

  if (snap.family === 'timed' && rules.family === 'timed') {
    const draws = opts.drawAllowed ?? rules.drawAllowed;
    let winner: Side | null = snap.winner ?? cmp(snap.scores);
    let note: string | null = null;
    if (snap.shootout) {
      const so = shootoutScore(snap.shootout);
      if (nonEmpty(so)) {
        const tag = rules.shootout === 'seven_metre' ? '7 m' : rules.shootout === 'shootout' ? 'S/O' : 'Pens';
        const w = cmp(so);
        note = `${tag} ${so.a}–${so.b}`;
        if (snap.scores.a === snap.scores.b && w) winner = snap.winner ?? w;
      }
    }
    const level = snap.scores.a === snap.scores.b && !winner;
    return {
      scoreA: snap.scores.a,
      scoreB: snap.scores.b,
      detail: snap.byPeriod.some(nonEmpty) ? snap.byPeriod : null,
      winner,
      draw: level && draws,
      needsWinner: level && !draws,
      decided,
      note,
    };
  }

  if (snap.family === 'cricket' && rules.family === 'cricket') {
    const runs = sideRuns(snap);
    const winner = snap.winner ?? cmp(runs);
    const bits = snap.innings.map((i) => `${sideName(i.batting, names)} ${inningsScore(i)} (${inningsOvers(i, rules)})`);
    if (decided) bits.push(snap.tied ? 'Match tied' : `${sideName(snap.winner as Side, names)} ${snap.resultText}`);
    const level = runs.a === runs.b && !winner;
    return {
      scoreA: runs.a,
      scoreB: runs.b,
      detail: null,
      winner,
      draw: level && !!opts.drawAllowed,
      needsWinner: level && !opts.drawAllowed,
      decided,
      note: bits.join(' · ').slice(0, 200) || null,
    };
  }

  if (snap.family === 'simple' && rules.family === 'simple') {
    const draws = opts.drawAllowed ?? rules.drawAllowed;
    const winner = snap.winner ?? cmp(snap.scores);
    return {
      scoreA: snap.scores.a,
      scoreB: snap.scores.b,
      detail: null,
      winner,
      draw: !winner && draws,
      needsWinner: !winner && !draws,
      decided,
      note: null,
    };
  }

  throw new Error('live: snapshot family does not match rules family');
}
