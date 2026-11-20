import { other, type Pair, type SetsAction, type SetsRules, type SetsSnapshot, type Side } from '../types';

export function initSets(rules: SetsRules, opts: { firstServer?: Side | null } = {}): SetsSnapshot {
  const first = rules.serve === 'none' ? null : (opts.firstServer ?? 'a');
  return {
    family: 'sets',
    state: 'live',
    games: [],
    cur: { a: 0, b: 0 },
    gameIndex: 0,
    setsWon: { a: 0, b: 0 },
    winner: null,
    firstServer: first,
    server: first,
    serverNumber: rules.serve === 'side_out' && rules.doubles ? 2 : 1,
    lastGameWinner: null,
  };
}

export const setsNeeded = (rules: SetsRules): number => Math.ceil(rules.bestOf / 2);

export function isDecidingGame(rules: SetsRules, gameIndex: number): boolean {
  return rules.bestOf > 1 && gameIndex === rules.bestOf - 1;
}

/** Points needed to win the current game. */
export function gameTarget(rules: SetsRules, gameIndex: number): number {
  return isDecidingGame(rules, gameIndex) && rules.deciderPoints != null ? rules.deciderPoints : rules.pointsToWin;
}

export function gameWinner(cur: Pair, rules: SetsRules, gameIndex: number): Side | null {
  const hi = Math.max(cur.a, cur.b);
  const lo = Math.min(cur.a, cur.b);
  const capped = rules.cap != null && hi >= rules.cap;
  if (capped || (hi >= gameTarget(rules, gameIndex) && hi - lo >= rules.winBy)) {
    return cur.a > cur.b ? 'a' : cur.b > cur.a ? 'b' : null;
  }
  return null;
}

/** Would one more point for `side` win the game right now? */
export function isGamePoint(s: SetsSnapshot, rules: SetsRules, side: Side): boolean {
  if (s.state !== 'live') return false;
  const next = { ...s.cur, [side]: s.cur[side] + 1 };
  return gameWinner(next, rules, s.gameIndex) === side;
}

export function isMatchPoint(s: SetsSnapshot, rules: SetsRules, side: Side): boolean {
  return isGamePoint(s, rules, side) && s.setsWon[side] + 1 >= setsNeeded(rules);
}

/** Reminder flags derived from the score (shown as banners, never forced). */
export function setsNotices(s: SetsSnapshot, rules: SetsRules): { changeEnds: boolean; interval: boolean } {
  if (s.state !== 'live') return { changeEnds: false, interval: false };
  const hi = Math.max(s.cur.a, s.cur.b);
  return {
    changeEnds: rules.changeEndsAt != null && isDecidingGame(rules, s.gameIndex) && hi === rules.changeEndsAt,
    interval: rules.intervalAt != null && hi === rules.intervalAt && Math.min(s.cur.a, s.cur.b) < rules.intervalAt,
  };
}

/** Table-tennis style serving derived from the score so undo / manual edits stay consistent. */
function derivedServer(s: SetsSnapshot, rules: SetsRules, cur: Pair, firstServer: Side): Side {
  const every = rules.serve === 'alternate_5' ? 5 : 2;
  const n = cur.a + cur.b;
  const deuceAt = gameTarget(rules, s.gameIndex) - 1;
  let flips: number;
  if (Math.min(cur.a, cur.b) >= deuceAt) {
    const base = 2 * deuceAt;
    flips = Math.floor(base / every) + (n - base);
  } else {
    flips = Math.floor(n / every);
  }
  return flips % 2 === 0 ? firstServer : other(firstServer);
}

function withServer(s: SetsSnapshot, rules: SetsRules): SetsSnapshot {
  if ((rules.serve === 'alternate_2' || rules.serve === 'alternate_5') && s.firstServer) {
    return { ...s, server: derivedServer(s, rules, s.cur, s.firstServer) };
  }
  return s;
}

function startNextGame(s: SetsSnapshot, rules: SetsRules): SetsSnapshot {
  if (s.state !== 'break') return s;
  let first: Side | null = s.firstServer;
  if (rules.serve === 'alternate_2' || rules.serve === 'alternate_5' || rules.serve === 'side_out') {
    first = s.firstServer ? other(s.firstServer) : 'a';
  } else if (rules.serve === 'rally_winner') {
    first = s.lastGameWinner ?? s.firstServer;
  }
  return withServer(
    {
      ...s,
      state: 'live',
      gameIndex: s.gameIndex + 1,
      cur: { a: 0, b: 0 },
      firstServer: first,
      server: first,
      serverNumber: rules.serve === 'side_out' && rules.doubles ? 2 : 1,
    },
    rules,
  );
}

function finishGameIfWon(s: SetsSnapshot, rules: SetsRules): SetsSnapshot {
  const w = gameWinner(s.cur, rules, s.gameIndex);
  if (!w) return s;
  const setsWon = { ...s.setsWon, [w]: s.setsWon[w] + 1 };
  const games = [...s.games, s.cur];
  const done = setsWon[w] >= setsNeeded(rules);
  return {
    ...s,
    games,
    setsWon,
    cur: { a: 0, b: 0 },
    state: done ? 'decided' : 'break',
    winner: done ? w : null,
    lastGameWinner: w,
  };
}

export function reduceSets(s: SetsSnapshot, action: SetsAction, rules: SetsRules): SetsSnapshot {
  switch (action.t) {
    case 'nextGame':
      return startNextGame(s, rules);

    case 'setServer': {
      if (rules.serve === 'none') return s;
      if ((rules.serve === 'alternate_2' || rules.serve === 'alternate_5') && s.firstServer) {
        const cur = derivedServer(s, rules, s.cur, s.firstServer);
        const firstServer = cur === action.side ? s.firstServer : other(s.firstServer);
        return withServer({ ...s, firstServer }, rules);
      }
      return { ...s, server: action.side };
    }

    case 'point': {
      if (s.state === 'decided') return s;
      let st = s.state === 'break' ? startNextGame(s, rules) : s;
      const side = action.side;

      if (rules.serve === 'side_out') {
        const serving = st.server ?? 'a';
        if (side !== serving) {
          // Rally won by the receiving side: second server, or side out.
          if (rules.doubles && st.serverNumber === 1) {
            st = { ...st, serverNumber: 2 };
          } else {
            st = { ...st, server: other(serving), serverNumber: 1 };
          }
          return st;
        }
        st = { ...st, cur: { ...st.cur, [side]: st.cur[side] + 1 } };
        return finishGameIfWon(st, rules);
      }

      st = { ...st, cur: { ...st.cur, [side]: st.cur[side] + 1 } };
      if (rules.serve === 'rally_winner') st = { ...st, server: side };
      st = withServer(st, rules);
      return finishGameIfWon(st, rules);
    }

    case 'unpoint': {
      // Manual correction of the running game only (Undo is the normal way to take a point back).
      if (s.state !== 'live' || s.cur[action.side] <= 0) return s;
      return withServer({ ...s, cur: { ...s.cur, [action.side]: s.cur[action.side] - 1 } }, rules);
    }
  }
}
