import type { CricketRules, LiveRules, SetsRules, SimpleRules, TennisRules, TimedRules } from './types';

// ─── Preset factories ────────────────────────────────────────────────────────

const sets = (preset: string, o: Partial<SetsRules>): SetsRules => ({
  family: 'sets',
  preset,
  pointsToWin: 21,
  winBy: 2,
  cap: null,
  bestOf: 3,
  deciderPoints: null,
  serve: 'rally_winner',
  changeEndsAt: null,
  intervalAt: null,
  doubles: false,
  ...o,
});

const tennis = (preset: string, o: Partial<TennisRules>): TennisRules => ({
  family: 'tennis',
  preset,
  bestOf: 3,
  gamesPerSet: 6,
  deuce: 'advantage',
  tiebreakPoints: 7,
  finalSet: 'tiebreak',
  superTiebreakPoints: 10,
  ...o,
});

const timed = (preset: string, o: Partial<TimedRules>): TimedRules => ({
  family: 'timed',
  preset,
  periods: 2,
  periodSeconds: 2700,
  clock: 'up',
  buttons: [1],
  label: 'Goal',
  overtime: 'none',
  otPeriods: 0,
  otSeconds: 0,
  shootout: 'none',
  shootoutRounds: 5,
  target: null,
  drawAllowed: false,
  counters: [],
  foulsReset: 'never',
  bonusAt: null,
  timeoutsPerHalf: null,
  ...o,
});

const cricket = (preset: string, o: Partial<CricketRules>): CricketRules => ({
  family: 'cricket',
  preset,
  overs: 20,
  ballsPerOver: 6,
  wickets: 10,
  wideRuns: 1,
  noBallRuns: 1,
  ...o,
});

const simple = (preset: string, o: Partial<SimpleRules>): SimpleRules => ({
  family: 'simple',
  preset,
  buttons: [1],
  target: null,
  clock: 'none',
  minutes: 0,
  drawAllowed: false,
  ...o,
});

// ─── Presets (docs/live-match/PLAN.md §5.3) ──────────────────────────────────

export const PRESET_LIST: { id: string; label: string; sports: string[]; rules: LiveRules }[] = [
  // rally sets
  { id: 'table_tennis_11', label: 'Table tennis · 11 points', sports: ['table_tennis'], rules: sets('table_tennis_11', { pointsToWin: 11, bestOf: 5, serve: 'alternate_2', changeEndsAt: 5 }) },
  { id: 'table_tennis_21', label: 'Table tennis · 21 points', sports: ['table_tennis'], rules: sets('table_tennis_21', { pointsToWin: 21, bestOf: 3, serve: 'alternate_5' }) },
  { id: 'badminton_21', label: 'Badminton · 21 points', sports: ['badminton'], rules: sets('badminton_21', { pointsToWin: 21, cap: 30, bestOf: 3, intervalAt: 11, changeEndsAt: 11 }) },
  { id: 'badminton_15', label: 'Badminton · 15 points', sports: ['badminton'], rules: sets('badminton_15', { pointsToWin: 15, cap: 21, bestOf: 3, intervalAt: 8, changeEndsAt: 8 }) },
  { id: 'squash_11', label: 'Squash · 11 points', sports: ['squash'], rules: sets('squash_11', { pointsToWin: 11, bestOf: 5 }) },
  { id: 'squash_15', label: 'Squash · 15 points', sports: ['squash'], rules: sets('squash_15', { pointsToWin: 15, bestOf: 5 }) },
  { id: 'pickleball_11_sideout', label: 'Pickleball · side-out, 11', sports: ['pickleball'], rules: sets('pickleball_11_sideout', { pointsToWin: 11, bestOf: 3, serve: 'side_out', doubles: true }) },
  { id: 'pickleball_rally_11', label: 'Pickleball · rally, 11', sports: ['pickleball'], rules: sets('pickleball_rally_11', { pointsToWin: 11, bestOf: 3 }) },
  { id: 'pickleball_rally_15', label: 'Pickleball · rally, 15', sports: ['pickleball'], rules: sets('pickleball_rally_15', { pointsToWin: 15, bestOf: 1 }) },
  { id: 'pickleball_rally_21', label: 'Pickleball · rally, 21', sports: ['pickleball'], rules: sets('pickleball_rally_21', { pointsToWin: 21, bestOf: 1 }) },
  { id: 'volleyball_25', label: 'Volleyball · best of 5', sports: ['volleyball'], rules: sets('volleyball_25', { pointsToWin: 25, bestOf: 5, deciderPoints: 15, changeEndsAt: 8 }) },
  { id: 'volleyball_25_bo3', label: 'Volleyball · best of 3', sports: ['volleyball'], rules: sets('volleyball_25_bo3', { pointsToWin: 25, bestOf: 3, deciderPoints: 15, changeEndsAt: 8 }) },
  { id: 'beach_volleyball_21', label: 'Beach volleyball · 21', sports: ['volleyball', 'beach_volleyball'], rules: sets('beach_volleyball_21', { pointsToWin: 21, bestOf: 3, deciderPoints: 15, changeEndsAt: 7 }) },
  // tennis
  { id: 'tennis_bo3', label: 'Tennis · best of 3', sports: ['tennis', 'padel'], rules: tennis('tennis_bo3', {}) },
  { id: 'tennis_bo3_stb', label: 'Tennis · best of 3, super tiebreak', sports: ['tennis', 'padel'], rules: tennis('tennis_bo3_stb', { finalSet: 'super_tiebreak' }) },
  { id: 'tennis_short_sets', label: 'Tennis · short sets', sports: ['tennis', 'padel'], rules: tennis('tennis_short_sets', { gamesPerSet: 4, deuce: 'golden_point' }) },
  { id: 'tennis_pro_set_8', label: 'Tennis · pro set to 8', sports: ['tennis', 'padel'], rules: tennis('tennis_pro_set_8', { bestOf: 1, gamesPerSet: 8 }) },
  { id: 'tennis_bo5', label: 'Tennis · best of 5', sports: ['tennis'], rules: tennis('tennis_bo5', { bestOf: 5 }) },
  // timed
  { id: 'basketball_fiba', label: 'Basketball · FIBA 4 × 10', sports: ['basketball'], rules: timed('basketball_fiba', { periods: 4, periodSeconds: 600, clock: 'down', buttons: [1, 2, 3], label: 'Point', overtime: 'repeat_until_winner', otPeriods: 1, otSeconds: 300, counters: ['team_fouls', 'timeouts'], foulsReset: 'period', bonusAt: 5, timeoutsPerHalf: 3 }) },
  { id: 'basketball_nba', label: 'Basketball · NBA 4 × 12', sports: ['basketball'], rules: timed('basketball_nba', { periods: 4, periodSeconds: 720, clock: 'down', buttons: [1, 2, 3], label: 'Point', overtime: 'repeat_until_winner', otPeriods: 1, otSeconds: 300, counters: ['team_fouls', 'timeouts'], foulsReset: 'period', bonusAt: 5, timeoutsPerHalf: 3 }) },
  { id: 'basketball_school', label: 'Basketball · school 4 × 8', sports: ['basketball'], rules: timed('basketball_school', { periods: 4, periodSeconds: 480, clock: 'down', buttons: [1, 2, 3], label: 'Point', overtime: 'repeat_until_winner', otPeriods: 1, otSeconds: 180, counters: ['team_fouls'], foulsReset: 'period', bonusAt: 5 }) },
  { id: 'basketball_3x3', label: 'Basketball · 3x3 to 21', sports: ['basketball'], rules: timed('basketball_3x3', { periods: 1, periodSeconds: 600, clock: 'down', buttons: [1, 2], label: 'Point', target: 21, overtime: 'golden_goal', otPeriods: 1, otSeconds: 120, counters: ['team_fouls'], foulsReset: 'never' }) },
  { id: 'football_11', label: 'Football · 2 × 45', sports: ['football'], rules: timed('football_11', { periods: 2, periodSeconds: 2700, clock: 'up', overtime: 'extra_time', otPeriods: 2, otSeconds: 900, shootout: 'penalties', counters: ['cards'] }) },
  { id: 'football_school', label: 'Football · 2 × 30', sports: ['football'], rules: timed('football_school', { periods: 2, periodSeconds: 1800, clock: 'up', shootout: 'penalties', counters: ['cards'] }) },
  { id: 'football_7', label: 'Football · 7-a-side 2 × 25', sports: ['football'], rules: timed('football_7', { periods: 2, periodSeconds: 1500, clock: 'up', shootout: 'penalties' }) },
  { id: 'futsal', label: 'Futsal · 2 × 20', sports: ['futsal'], rules: timed('futsal', { periods: 2, periodSeconds: 1200, clock: 'down', overtime: 'extra_time', otPeriods: 2, otSeconds: 300, shootout: 'penalties', counters: ['team_fouls', 'timeouts'], foulsReset: 'half', bonusAt: 6, timeoutsPerHalf: 1 }) },
  { id: 'handball', label: 'Handball · 2 × 30', sports: ['handball'], rules: timed('handball', { periods: 2, periodSeconds: 1800, clock: 'up', overtime: 'extra_time', otPeriods: 2, otSeconds: 300, shootout: 'seven_metre', counters: ['timeouts'], timeoutsPerHalf: 2 }) },
  { id: 'hockey_field', label: 'Hockey · 4 × 15', sports: ['hockey'], rules: timed('hockey_field', { periods: 4, periodSeconds: 900, clock: 'up', shootout: 'shootout', counters: ['cards'] }) },
  // cricket
  { id: 'cricket_t20', label: 'Cricket · T20', sports: ['cricket'], rules: cricket('cricket_t20', {}) },
  { id: 'cricket_t10', label: 'Cricket · T10', sports: ['cricket'], rules: cricket('cricket_t10', { overs: 10 }) },
  { id: 'cricket_6_over', label: 'Cricket · 6 overs', sports: ['cricket'], rules: cricket('cricket_6_over', { overs: 6, wickets: 6 }) },
  { id: 'cricket_custom', label: 'Cricket · custom overs', sports: ['cricket'], rules: cricket('cricket_custom', {}) },
  // fallback
  { id: 'simple', label: 'Simple counter', sports: ['other'], rules: simple('simple', {}) },
];

export const PRESETS: Record<string, LiveRules> = Object.fromEntries(PRESET_LIST.map((p) => [p.id, p.rules]));

const DEFAULT_PRESET: Record<string, string> = {
  table_tennis: 'table_tennis_11',
  badminton: 'badminton_21',
  squash: 'squash_11',
  pickleball: 'pickleball_11_sideout',
  tennis: 'tennis_bo3',
  volleyball: 'volleyball_25',
  basketball: 'basketball_fiba',
  football: 'football_11',
  handball: 'handball',
  cricket: 'cricket_t20',
  // "More" sports (module sport = other + sport_key)
  padel: 'tennis_bo3',
  beach_volleyball: 'beach_volleyball_21',
  futsal: 'futsal',
  hockey: 'hockey_field',
};

/** Module sport (+ `sport_key` for "More" sports) → default preset id. Unknown sports fall back to the simple counter. */
export function defaultPresetId(sport: string, sportKey?: string | null): string {
  if (sport === 'other' && sportKey && DEFAULT_PRESET[sportKey]) return DEFAULT_PRESET[sportKey];
  return DEFAULT_PRESET[sport] ?? 'simple';
}

/** Presets for a sport first, then everything else. */
export function presetsForSport(sport: string, sportKey?: string | null) {
  const key = sport === 'other' && sportKey ? sportKey : sport;
  const mine = PRESET_LIST.filter((p) => p.sports.includes(key));
  const rest = PRESET_LIST.filter((p) => !p.sports.includes(key));
  return { mine, rest };
}

// ─── Resolving ───────────────────────────────────────────────────────────────

export interface ResolveOptions {
  sport: string;
  sportKey?: string | null;
  /** The module's saved rules: `{ preset?, ...overrides }`. */
  liveRules?: Record<string, unknown> | null;
  /** The round's best-of for this match (1/3/5/7); authoritative for sets / tennis. */
  matchBestOf?: number | null;
  /** The match may end level (module allows draws and this is a league / group match). */
  drawAllowed?: boolean;
}

const sameKind = (a: unknown, b: unknown): boolean =>
  a === null || b === null || (typeof a === typeof b && Array.isArray(a) === Array.isArray(b));

/** Preset → module overrides → the match's best-of → draw flag. Always returns a complete, valid rules object. */
export function resolveRules(opts: ResolveOptions): LiveRules {
  const saved = opts.liveRules ?? {};
  const presetId = typeof saved.preset === 'string' && PRESETS[saved.preset] ? saved.preset : defaultPresetId(opts.sport, opts.sportKey);
  const base = { ...(PRESETS[presetId] ?? PRESETS.simple) } as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(saved)) {
    if (k === 'family' || k === 'preset' || !(k in base)) continue;
    if (sameKind(base[k], v)) base[k] = v;
  }
  const rules = base as unknown as LiveRules;

  if (rules.family === 'sets' || rules.family === 'tennis') {
    const n = opts.matchBestOf;
    if (n != null && n >= 1 && n % 2 === 1) rules.bestOf = rules.family === 'tennis' ? Math.min(n, 5) : n;
  }
  if (rules.family === 'timed' || rules.family === 'simple') {
    rules.drawAllowed = !!opts.drawAllowed;
  }
  return rules;
}

const mins = (s: number) => `${Math.round(s / 60)} min`;

/** One plain line for the start sheet and the rules editor. */
export function describeRules(r: LiveRules): string {
  switch (r.family) {
    case 'sets': {
      const bits = [`Best of ${r.bestOf}`, `games to ${r.pointsToWin}`];
      if (r.cap) bits.push(`cap ${r.cap}`);
      if (r.deciderPoints && r.deciderPoints !== r.pointsToWin) bits.push(`decider to ${r.deciderPoints}`);
      bits.push(r.serve === 'side_out' ? 'side-out scoring' : 'rally scoring');
      return bits.join(' · ');
    }
    case 'tennis': {
      const bits = [r.bestOf === 1 ? `One set to ${r.gamesPerSet}` : `Best of ${r.bestOf}`, `sets to ${r.gamesPerSet}`];
      bits.push(r.deuce === 'golden_point' ? 'golden point' : 'advantage');
      if (r.finalSet === 'super_tiebreak' && r.bestOf > 1) bits.push('super tiebreak decider');
      return bits.join(' · ');
    }
    case 'timed': {
      const bits = [`${r.periods} × ${mins(r.periodSeconds)}`];
      if (r.target) bits.push(`first to ${r.target}`);
      if (r.overtime === 'repeat_until_winner') bits.push(`overtime ${mins(r.otSeconds)}`);
      else if (r.overtime === 'extra_time') bits.push(`extra time ${r.otPeriods} × ${mins(r.otSeconds)}`);
      else if (r.overtime === 'golden_goal') bits.push('golden goal');
      if (r.shootout !== 'none') bits.push(r.shootout === 'seven_metre' ? '7 m throws' : r.shootout === 'shootout' ? 'shoot-out' : 'penalties');
      return bits.join(' · ');
    }
    case 'cricket':
      return `${r.overs} overs · ${r.wickets} wickets · ${r.ballsPerOver} balls per over`;
    case 'simple':
      return r.target ? `First to ${r.target}` : 'Two counters';
  }
}
