import { other, type Pair, type Side, type TennisAction, type TennisRules, type TennisSnapshot } from '../types';

const isDecidingSet = (rules: TennisRules, setIndex: number): boolean => rules.bestOf > 1 && setIndex === rules.bestOf - 1;

/** The deciding set is a single super tiebreak when the rules say so. */
function tbModeAtSetStart(rules: TennisRules, setIndex: number): 'none' | 'super' {
  return isDecidingSet(rules, setIndex) && rules.finalSet === 'super_tiebreak' ? 'super' : 'none';
}

export function initTennis(rules: TennisRules, opts: { firstServer?: Side } = {}): TennisSnapshot {
  const server = opts.firstServer ?? 'a';
  const tb = tbModeAtSetStart(rules, 0);
  return {
    family: 'tennis',
    state: 'live',
    sets: [],
    games: { a: 0, b: 0 },
    points: { a: 0, b: 0 },
    tb,
    server,
    gameServer: server,
    tbFirst: tb === 'super' ? server : null,
    setsWon: { a: 0, b: 0 },
    setIndex: 0,
    winner: null,
  };
}

export const tennisSetsNeeded = (rules: TennisRules): number => Math.ceil(rules.bestOf / 2);

/** Tiebreak server: first server serves 1 point, then every 2 points alternate. */
function tbServer(first: Side, played: number): Side {
  return Math.floor((played + 1) / 2) % 2 === 0 ? first : other(first);
}

function gameWon(p: Pair, rules: TennisRules): Side | null {
  const hi = Math.max(p.a, p.b);
  const lo = Math.min(p.a, p.b);
  if (hi >= 4 && (rules.deuce === 'golden_point' || hi - lo >= 2)) return p.a > p.b ? 'a' : 'b';
  return null;
}

function tiebreakWon(p: Pair, target: number): Side | null {
  const hi = Math.max(p.a, p.b);
  const lo = Math.min(p.a, p.b);
  if (hi >= target && hi - lo >= 2) return p.a > p.b ? 'a' : 'b';
  return null;
}

function setWon(g: Pair, rules: TennisRules): Side | null {
  const hi = Math.max(g.a, g.b);
  const lo = Math.min(g.a, g.b);
  const gps = rules.gamesPerSet;
  if (hi >= gps && hi - lo >= 2) return g.a > g.b ? 'a' : 'b';
  // a tiebreak (when the rules have one) decides at gps-gps; the caller starts it
  return null;
}

function endSet(s: TennisSnapshot, rules: TennisRules, w: Side, set: Pair & { tb?: Pair }, nextGameServer: Side): TennisSnapshot {
  const setsWon = { ...s.setsWon, [w]: s.setsWon[w] + 1 };
  const done = setsWon[w] >= tennisSetsNeeded(rules);
  return {
    ...s,
    sets: [...s.sets, set],
    setsWon,
    games: { a: 0, b: 0 },
    points: { a: 0, b: 0 },
    tb: 'none',
    tbFirst: null,
    gameServer: nextGameServer,
    server: nextGameServer,
    state: done ? 'decided' : 'break',
    winner: done ? w : null,
  };
}

function startNextSet(s: TennisSnapshot, rules: TennisRules): TennisSnapshot {
  if (s.state !== 'break') return s;
  const setIndex = s.setIndex + 1;
  const tb = tbModeAtSetStart(rules, setIndex);
  return {
    ...s,
    state: 'live',
    setIndex,
    tb,
    tbFirst: tb === 'super' ? s.gameServer : null,
    server: s.gameServer,
  };
}

export function reduceTennis(s: TennisSnapshot, action: TennisAction, rules: TennisRules): TennisSnapshot {
  switch (action.t) {
    case 'nextSet':
      return startNextSet(s, rules);

    case 'setServer':
      if (s.tb === 'none') return { ...s, server: action.side, gameServer: action.side };
      return { ...s, tbFirst: action.side, server: action.side };

    case 'point': {
      if (s.state === 'decided') return s;
      let st = s.state === 'break' ? startNextSet(s, rules) : s;
      const points = { ...st.points, [action.side]: st.points[action.side] + 1 };

      if (st.tb !== 'none') {
        const target = st.tb === 'super' ? rules.superTiebreakPoints : rules.tiebreakPoints;
        const w = tiebreakWon(points, target);
        const first = st.tbFirst ?? st.gameServer;
        if (!w) {
          return { ...st, points, server: tbServer(first, points.a + points.b) };
        }
        // A normal tiebreak makes it 7-6 in games; a super tiebreak is recorded as a 1-0 "set".
        const set =
          st.tb === 'super'
            ? { a: w === 'a' ? 1 : 0, b: w === 'b' ? 1 : 0, tb: points }
            : { a: st.games.a + (w === 'a' ? 1 : 0), b: st.games.b + (w === 'b' ? 1 : 0), tb: points };
        return endSet(st, rules, w, set, other(first));
      }

      const gw = gameWon(points, rules);
      if (!gw) return { ...st, points };

      const games = { ...st.games, [gw]: st.games[gw] + 1 };
      const nextServer = other(st.gameServer);
      const sw = setWon(games, rules);
      if (sw) return endSet({ ...st, points }, rules, sw, games, nextServer);

      const gps = rules.gamesPerSet;
      const atTiebreak = games.a === gps && games.b === gps && !(isDecidingSet(rules, st.setIndex) && rules.finalSet === 'advantage');
      st = { ...st, games, points: { a: 0, b: 0 }, gameServer: nextServer, server: nextServer };
      if (atTiebreak) st = { ...st, tb: 'tiebreak', tbFirst: nextServer };
      return st;
    }
  }
}
