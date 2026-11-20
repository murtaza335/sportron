import { gameWinner } from './families/sets';
import type { LiveRules, Names, Pair, Side } from './types';

/**
 * Pure logic behind the full-screen "Enter result" form (docs/live-match/PLAN.md §7): what the form holds, what
 * the result means, which input is impossible (blocks Save) and which is merely unusual (amber hint only).
 */

export interface ResultForm {
  /** Games (sets / tennis: games per set) or per-period scores (timed, when `periodBreakdown`). */
  rows: Pair[];
  /** Totals: timed / simple scores, cricket runs. */
  a: number;
  b: number;
  pensA: number;
  pensB: number;
  wktA: number;
  wktB: number;
  oversA: string;
  oversB: string;
  periodBreakdown: boolean;
  winner: Side | null;
  note: string;
}

export interface FormHint {
  /** Row index the hint belongs to, or null for the whole form. */
  row: number | null;
  text: string;
}

export interface FormEval {
  scoreA: number;
  scoreB: number;
  detail: Pair[] | null;
  /** Scores level and the format can't end level without help. */
  needsWinner: boolean;
  draw: boolean;
  /** The side that wins from the numbers entered (or the shootout), if any. */
  winner: Side | null;
  autoNote: string | null;
  /** Blocking problems — impossible input. */
  errors: string[];
  /** Non-blocking: unusual but possible (retirements, shortened matches). */
  hints: FormHint[];
  /** "Ali wins 2–1", "Level — pick the winner", "Draw". */
  outcome: string;
}

const nonEmpty = (p: Pair) => p.a !== 0 || p.b !== 0;
const clamp = (n: number) => Math.max(0, Math.min(999, Math.round(n || 0)));

/** Most rows the form can have for this rules object. */
export function maxRows(rules: LiveRules): number {
  if (rules.family === 'sets' || rules.family === 'tennis') return Math.max(1, rules.bestOf);
  if (rules.family === 'timed') return rules.periods + (rules.overtime !== 'none' ? Math.max(1, rules.otPeriods) : 0);
  return 0;
}

/** Rows shown from the start: the games needed to win (a best-of-3 starts with 2 rows). */
export function startRows(rules: LiveRules): number {
  if (rules.family === 'sets' || rules.family === 'tennis') return Math.ceil(rules.bestOf / 2);
  if (rules.family === 'timed') return rules.periods;
  return 0;
}

export function emptyForm(rules: LiveRules): ResultForm {
  return {
    rows: Array.from({ length: startRows(rules) }, () => ({ a: 0, b: 0 })),
    a: 0,
    b: 0,
    pensA: 0,
    pensB: 0,
    wktA: 0,
    wktB: 0,
    oversA: '',
    oversB: '',
    periodBreakdown: false,
    winner: null,
    note: '',
  };
}

/** Pre-fill when editing an existing result. */
export function formFromMatch(
  rules: LiveRules,
  m: { score_a: number | null; score_b: number | null; score_detail: Pair[] | null; result_note: string | null; winnerSide: Side | null },
): ResultForm {
  const f = emptyForm(rules);
  const detail = m.score_detail ?? [];
  if (rules.family === 'sets' || rules.family === 'tennis') {
    if (detail.length) f.rows = detail.map((r) => ({ a: clamp(r.a), b: clamp(r.b) }));
  } else if (rules.family === 'timed') {
    f.a = clamp(m.score_a ?? 0);
    f.b = clamp(m.score_b ?? 0);
    if (detail.length) {
      f.rows = detail.map((r) => ({ a: clamp(r.a), b: clamp(r.b) }));
      f.periodBreakdown = true;
    }
  } else {
    f.a = clamp(m.score_a ?? 0);
    f.b = clamp(m.score_b ?? 0);
  }
  f.winner = m.winnerSide;
  f.note = m.result_note && m.result_note !== 'Walkover' ? m.result_note : '';
  return f;
}

const outcomeText = (winner: Side | null, names: Names, a: number, b: number, draw: boolean, needsWinner: boolean): string => {
  if (draw) return `Draw ${a}–${b}`;
  if (needsWinner) return 'Level — pick the winner';
  if (!winner) return `${a}–${b}`;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return `${names[winner]} wins ${hi}–${lo}`;
};

const validTennisSet = (g: Pair, gps: number): boolean => {
  const hi = Math.max(g.a, g.b);
  const lo = Math.min(g.a, g.b);
  return (hi >= gps && hi - lo >= 2) || (hi === gps + 1 && lo === gps);
};

export function evaluateForm(form: ResultForm, rules: LiveRules, opts: { names: Names; drawAllowed: boolean }): FormEval {
  const errors: string[] = [];
  const hints: FormHint[] = [];
  const { names } = opts;
  let scoreA = 0;
  let scoreB = 0;
  let detail: Pair[] | null = null;
  let autoNote: string | null = null;
  let shootoutWinner: Side | null = null;

  if (rules.family === 'sets' || rules.family === 'tennis') {
    const played = form.rows.filter(nonEmpty);
    detail = played.length ? played : null;
    if (played.length === 0) errors.push(rules.family === 'sets' ? 'Add at least one game score.' : 'Add at least one set score.');
    const unit = rules.family === 'sets' ? 'game' : 'set';
    let wonA = 0;
    let wonB = 0;
    const need = Math.ceil(rules.bestOf / 2);
    let decidedAt = -1;
    form.rows.forEach((r, i) => {
      if (!nonEmpty(r)) return;
      if (r.a === r.b) {
        errors.push(`${unit[0].toUpperCase()}${unit.slice(1)} ${i + 1} can’t end level — fix the score.`);
        return;
      }
      if (decidedAt >= 0) {
        hints.push({ row: i, text: `The match was already decided after ${unit} ${decidedAt + 1}.` });
      }
      const w: Side = r.a > r.b ? 'a' : 'b';
      if (w === 'a') wonA++;
      else wonB++;
      const finished =
        rules.family === 'sets'
          ? gameWinner(r, rules, i) !== null
          : validTennisSet(r, rules.gamesPerSet);
      if (!finished) {
        hints.push({ row: i, text: `${r.a}–${r.b} isn’t a finished ${unit} — fine if the match ended early.` });
      }
      if (decidedAt < 0 && (wonA >= need || wonB >= need)) decidedAt = i;
    });
    if (played.length > 0 && wonA < need && wonB < need) {
      hints.push({ row: null, text: `Nobody has won ${need} ${unit}${need === 1 ? '' : 's'} yet — saving this as a shortened match.` });
    }
    scoreA = wonA;
    scoreB = wonB;
  } else if (rules.family === 'timed') {
    if (form.periodBreakdown) {
      const rows = form.rows.filter(nonEmpty);
      detail = rows.length ? rows : null;
      scoreA = form.rows.reduce((s, r) => s + r.a, 0);
      scoreB = form.rows.reduce((s, r) => s + r.b, 0);
    } else {
      scoreA = form.a;
      scoreB = form.b;
    }
    if (scoreA === scoreB && !opts.drawAllowed && (form.pensA !== form.pensB)) {
      shootoutWinner = form.pensA > form.pensB ? 'a' : 'b';
      const tag = rules.shootout === 'seven_metre' ? '7 m' : rules.shootout === 'shootout' ? 'S/O' : 'Pens';
      autoNote = `${tag} ${form.pensA}–${form.pensB}`;
    }
    if (rules.target != null && Math.max(scoreA, scoreB) > rules.target + 3) {
      hints.push({ row: null, text: `Higher than the usual ${rules.target}-point limit — check the scores.` });
    }
  } else if (rules.family === 'cricket') {
    scoreA = form.a;
    scoreB = form.b;
    if (form.wktA > rules.wickets || form.wktB > rules.wickets) errors.push(`A side can lose at most ${rules.wickets} wickets.`);
    const bit = (n: string, r: number, w: number, o: string) => `${n} ${r}/${w}${o.trim() ? ` (${o.trim()})` : ''}`;
    autoNote = `${bit(names.a, form.a, form.wktA, form.oversA)} · ${bit(names.b, form.b, form.wktB, form.oversB)}`;
    const bad = (o: string) => o.trim() !== '' && !/^\d{1,2}(\.[0-9])?$/.test(o.trim());
    if (bad(form.oversA) || bad(form.oversB)) errors.push('Overs look like 18 or 18.3.');
  } else {
    scoreA = form.a;
    scoreB = form.b;
  }

  const level = scoreA === scoreB && !shootoutWinner;
  const draw = level && opts.drawAllowed && errors.length === 0;
  const needsWinner = level && !opts.drawAllowed && (rules.family !== 'sets' && rules.family !== 'tennis' ? true : detail != null);
  const numericWinner: Side | null = scoreA > scoreB ? 'a' : scoreB > scoreA ? 'b' : shootoutWinner;
  const winner = numericWinner ?? (needsWinner ? form.winner : null);
  if (needsWinner && !form.winner && errors.length === 0) {
    // not an error: the form asks for the winner, and Save stays disabled until it is picked
  }
  if (rules.family === 'timed' && scoreA === 0 && scoreB === 0 && !opts.drawAllowed && !form.periodBreakdown) {
    hints.push({ row: null, text: 'Both scores are 0 — pick the winner below if the match was decided another way.' });
  }
  return {
    scoreA,
    scoreB,
    detail,
    needsWinner,
    draw,
    winner,
    autoNote,
    errors,
    hints,
    outcome: errors.length ? 'Fix the highlighted scores' : outcomeText(winner, names, scoreA, scoreB, draw, needsWinner && !form.winner),
  };
}

/** Why Save is disabled (shown under the button), or null when it is allowed. */
export function saveBlocker(ev: FormEval, form: ResultForm): string | null {
  if (ev.errors.length) return ev.errors[0];
  if (ev.needsWinner && !form.winner) return 'Scores are level — pick the winner.';
  return null;
}

export const NOTE_MAX = 200;

/** Final note: the generated part (shootout, cricket innings) + the referee's own words. */
export function composeNote(ev: FormEval, form: ResultForm): string | null {
  const own = form.note.trim();
  const parts = [ev.autoNote, own].filter((x): x is string => !!x);
  return parts.length ? parts.join(' · ').slice(0, NOTE_MAX) : null;
}

// ─── Form history (undo / redo / clear) ──────────────────────────────────────

export interface FormHistory {
  past: ResultForm[];
  present: ResultForm;
  future: ResultForm[];
}

export const newFormHistory = (f: ResultForm): FormHistory => ({ past: [], present: f, future: [] });

export function pushForm(h: FormHistory, next: ResultForm): FormHistory {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-200), present: next, future: [] };
}

/** Text edits (the note) change the form without becoming undo steps. */
export const replaceForm = (h: FormHistory, next: ResultForm): FormHistory => ({ ...h, present: next });

export const undoForm = (h: FormHistory): FormHistory =>
  h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h;

export const redoForm = (h: FormHistory): FormHistory =>
  h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h;
