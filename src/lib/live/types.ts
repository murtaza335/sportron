/**
 * Live scoring engine — shared types. PURE TypeScript: no React / React Native imports, so the app and the
 * projector site (live/, via the `@live-engine` alias) use the same files. See docs/live-match/PLAN.md §5.
 */

export type Side = 'a' | 'b';
export type Pair = { a: number; b: number };
export type Family = 'sets' | 'tennis' | 'timed' | 'cricket' | 'simple';
/** `decided` = the engine says the match is won; it stays live until the referee taps Finish. */
export type Phase = 'live' | 'break' | 'decided';

export const other = (s: Side): Side => (s === 'a' ? 'b' : 'a');

// ─── Rules ───────────────────────────────────────────────────────────────────

export interface SetsRules {
  family: 'sets';
  preset: string;
  pointsToWin: number;
  winBy: number;
  /** Hard cap: first to reach it wins regardless of the margin (badminton 30). null = none. */
  cap: number | null;
  bestOf: number;
  /** Target of the deciding game (volleyball 15). null = same as pointsToWin. */
  deciderPoints: number | null;
  serve: 'alternate_2' | 'alternate_5' | 'rally_winner' | 'side_out' | 'none';
  /** Reminder only: change ends when a side reaches this many points in the deciding game. */
  changeEndsAt: number | null;
  /** Reminder only: interval when a side reaches this many points (badminton 11). */
  intervalAt: number | null;
  /** Pickleball side-out scoring: doubles has server 1 / 2. Badminton / table tennis: track who serves. */
  doubles: boolean;
  /** Which service-order rules to show: badminton service courts, or the table-tennis doubles rotation. */
  serveOrder?: 'badminton' | 'table_tennis' | null;
  /** Timeouts each side may take per set (volleyball 2). null = not counted. */
  timeoutsPerSet?: number | null;
}

export interface TennisRules {
  family: 'tennis';
  preset: string;
  bestOf: number;
  gamesPerSet: number;
  deuce: 'advantage' | 'golden_point';
  tiebreakPoints: number;
  /** What the deciding set looks like when bestOf > 1. */
  finalSet: 'tiebreak' | 'super_tiebreak' | 'advantage';
  superTiebreakPoints: number;
}

export type TimedCounter = 'team_fouls' | 'timeouts' | 'cards' | 'corners';

export interface TimedRules {
  family: 'timed';
  preset: string;
  periods: number;
  periodSeconds: number;
  clock: 'down' | 'up' | 'none';
  /** Value buttons per side (basketball [1,2,3], football [1]). */
  buttons: number[];
  /** What a button counts: "Point", "Goal". */
  label: string;
  overtime: 'none' | 'extra_time' | 'repeat_until_winner' | 'golden_goal';
  otPeriods: number;
  otSeconds: number;
  shootout: 'none' | 'penalties' | 'seven_metre' | 'shootout';
  shootoutRounds: number;
  /** First to N ends the match at once (3x3 basketball 21). */
  target: number | null;
  /** A level score after regular time is a draw (league / group match with draws on). Set from the module. */
  drawAllowed: boolean;
  counters: TimedCounter[];
  /** Team fouls reset every period or every half. */
  foulsReset: 'period' | 'half' | 'never';
  bonusAt: number | null;
  timeoutsPerHalf: number | null;
  /** Timeouts that differ by half (FIBA: 2, then 3, then 1 per overtime). Wins over timeoutsPerHalf. */
  timeoutLimits?: { firstHalf: number; secondHalf: number; overtime: number } | null;
  /** Overtime is untimed and ends when a side scores this many points in it (3x3 basketball: 2). */
  otTarget?: number | null;
}

export interface CricketRules {
  family: 'cricket';
  preset: string;
  overs: number;
  ballsPerOver: number;
  wickets: number;
  wideRuns: number;
  noBallRuns: number;
}

export interface SimpleRules {
  family: 'simple';
  preset: string;
  buttons: number[];
  target: number | null;
  clock: 'none' | 'up' | 'down';
  minutes: number;
  drawAllowed: boolean;
}

export type LiveRules = SetsRules | TennisRules | TimedRules | CricketRules | SimpleRules;

// ─── Clock ───────────────────────────────────────────────────────────────────

/** `elapsedMs` is valid at the local epoch time `ref`; while `running` it advances with the wall clock. */
export interface ClockState {
  running: boolean;
  elapsedMs: number;
  ref: number;
}

// ─── Snapshots ───────────────────────────────────────────────────────────────

export interface SetsSnapshot {
  family: 'sets';
  state: Phase;
  /** Finished games. */
  games: Pair[];
  cur: Pair;
  gameIndex: number;
  setsWon: Pair;
  winner: Side | null;
  /** Who served first in this game (alternating serve modes derive the server from it). */
  firstServer: Side | null;
  server: Side | null;
  /** Pickleball doubles: 1 or 2. */
  serverNumber: 1 | 2;
  lastGameWinner: Side | null;
  // The next three are optional so snapshots from older app builds still load.
  /** Badminton doubles: which player (1 or 2) of each pair stands in the right service court. */
  rightPlayer?: { a: 1 | 2; b: 1 | 2 };
  /** Table-tennis doubles, deciding game: the pair that swapped its order at the change of ends. */
  swappedPair?: Side | null;
  /** Timeouts taken in the current set. */
  timeouts?: Pair;
}

export interface TennisSet extends Pair {
  tb?: Pair;
}

export interface TennisSnapshot {
  family: 'tennis';
  state: Phase;
  sets: TennisSet[];
  games: Pair;
  /** Raw points in the current game (0,1,2,3,4…) or tiebreak points. */
  points: Pair;
  tb: 'none' | 'tiebreak' | 'super';
  server: Side;
  /** Server of the current regular game. */
  gameServer: Side;
  tbFirst: Side | null;
  setsWon: Pair;
  setIndex: number;
  winner: Side | null;
}

export interface Shootout {
  first: Side;
  kicks: { a: boolean[]; b: boolean[] };
}

export interface CounterSet {
  fouls: number;
  timeouts: number;
  yellow: number;
  red: number;
  corners: number;
}

export interface TimedSnapshot {
  family: 'timed';
  state: Phase;
  period: number;
  phase: 'regular' | 'overtime' | 'shootout';
  scores: Pair;
  /** Score per period (index = period − 1), including the running one. */
  byPeriod: Pair[];
  clock: ClockState;
  counters: { a: CounterSet; b: CounterSet };
  shootout: Shootout | null;
  winner: Side | null;
  /** Added time in minutes (football), display only. */
  addedMinutes: number;
}

export interface Innings {
  batting: Side;
  runs: number;
  wickets: number;
  /** Legal balls bowled. */
  balls: number;
  extras: { wd: number; nb: number; b: number; lb: number; pen: number };
  thisOver: string[];
  overDone: boolean;
  ended: boolean;
}

export interface CricketSnapshot {
  family: 'cricket';
  state: Phase;
  innings: Innings[];
  current: number;
  firstBat: Side;
  target: number | null;
  winner: Side | null;
  resultText: string | null;
  tied: boolean;
}

export interface SimpleSnapshot {
  family: 'simple';
  state: Phase;
  scores: Pair;
  clock: ClockState;
  winner: Side | null;
}

export type LiveSnapshot = SetsSnapshot | TennisSnapshot | TimedSnapshot | CricketSnapshot | SimpleSnapshot;

// ─── Actions ─────────────────────────────────────────────────────────────────

export type ClockAction =
  | { t: 'clockStart'; at: number }
  | { t: 'clockStop'; at: number }
  | { t: 'clockSync'; at: number }
  | { t: 'clockSet'; ms: number; at: number };

export type SetsAction =
  | { t: 'point'; side: Side }
  | { t: 'unpoint'; side: Side }
  | { t: 'nextGame' }
  | { t: 'setServer'; side: Side }
  | { t: 'timeout'; side: Side; delta: number };

export type TennisAction = { t: 'point'; side: Side } | { t: 'nextSet' } | { t: 'setServer'; side: Side };

export type TimedAction =
  | ClockAction
  | { t: 'score'; side: Side; value: number; at?: number }
  | { t: 'endPeriod'; at: number }
  | { t: 'nextPeriod' }
  | { t: 'kick'; scored: boolean }
  | { t: 'counter'; side: Side; key: keyof CounterSet; delta: number }
  | { t: 'addedTime'; minutes: number }
  | { t: 'startShootout' };

export type CricketBall = 'normal' | 'wide' | 'noball' | 'bye' | 'legbye';

export type CricketAction =
  | { t: 'ball'; kind: CricketBall; runs: number }
  | { t: 'wicket'; runs: number }
  | { t: 'penalty'; runs: number }
  | { t: 'endInnings' }
  | { t: 'nextInnings' };

export type SimpleAction = ClockAction | { t: 'score'; side: Side; value: number; at?: number };

export type LiveAction = SetsAction | TennisAction | TimedAction | CricketAction | SimpleAction;

// ─── Summary (one family-independent shape for lists, cards and the projector) ──

export interface SummaryClock {
  running: boolean;
  /** Elapsed ms at the moment the snapshot was pushed (viewers add the time since). */
  elapsed_ms: number;
  dir: 'up' | 'down';
  /** Period length (ms) for countdowns / "45:00+" display. */
  limit_ms: number | null;
}

export interface Summary {
  /** Big numbers: "17", "40", "AD", "68", "145/6". */
  a: string;
  b: string;
  /** Mid-size number: sets won (rally sports), games in the current set (tennis), overs (cricket), shootout goals. */
  a_mid?: string | null;
  b_mid?: string | null;
  /** Small chips: finished games / sets / quarters / shootout kicks. */
  a_sub: string[];
  b_sub: string[];
  /** Context line: "Game 3 · Match point", "Q3", "18.3 ov · need 12 off 9". */
  line: string;
  server: Side | null;
  clock: SummaryClock | null;
  /** "LIVE" · "Game break" · "Half-time" · "Innings break" · "Penalties" · "FINAL". */
  state_label: string;
}

export interface MatchResult {
  scoreA: number;
  scoreB: number;
  detail: Pair[] | null;
  winner: Side | null;
  draw: boolean;
  /** True when the match is level and the format needs the referee to pick a winner. */
  needsWinner: boolean;
  /** The engine considers the match decided. */
  decided: boolean;
  note: string | null;
}

/** Names used in labels and result text. */
export interface Names {
  a: string;
  b: string;
}
