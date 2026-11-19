import {
  initSnapshot,
  reduce,
  resolveRules,
  summarize,
  type LiveAction,
  type LiveBoard,
  type LiveMatch,
  type LiveRules,
  type LiveSnapshot,
  type Side,
} from '@live-engine';

/** A made-up tournament built with the real scoring engine: lets organisers preview the wall (/demo) without any data. */
const pts = (side: Side, n: number): LiveAction[] => Array.from({ length: n }, () => ({ t: 'point', side }));

function row(
  id: string,
  court: string,
  moduleName: string,
  round: string,
  a: string,
  b: string,
  rules: LiveRules,
  snap: LiveSnapshot,
  now: number,
  extra: Partial<LiveMatch> = {},
): LiveMatch {
  const names = { a, b };
  return {
    match_id: id,
    module_id: moduleName,
    module_name: moduleName,
    sport: rules.family,
    custom_sport_name: null,
    scoring_mode: 'games',
    stage_number: 1,
    bracket_side: 'main',
    round_number: 1,
    match_number: 1,
    round_name: round,
    code: null,
    status: 'scheduled',
    scheduled_at: null,
    venue: null,
    court,
    a: { id: `${id}a`, name: a, fields: [{ label: 'School', value: 'SEECS' }] },
    b: { id: `${id}b`, name: b, fields: [{ label: 'School', value: 'NBS' }] },
    state: 'live',
    family: rules.family,
    summary: summarize(snap, rules, { names, at: now }),
    snapshot: snap,
    seq: 10,
    updated_at: new Date(now).toISOString(),
    started_at: new Date(now - 600000).toISOString(),
    finished_at: null,
    ...extra,
  };
}

export function makeDemoBoard(): LiveBoard {
  const now = Date.now();
  const run = (rules: LiveRules, s: LiveSnapshot, actions: LiveAction[]) => actions.reduce((x, a) => reduce(x, a, rules), s);

  const bd = resolveRules({ sport: 'badminton', matchBestOf: 3 });
  let b1 = initSnapshot(bd, { firstServer: 'a' });
  // game 1: 21–14, game 2: 18–21, now 17–15
  const mix = (a: number, b: number): LiveAction[] => {
    const out: LiveAction[] = [];
    let x = 0,
      y = 0;
    while (x < a || y < b) {
      if (x < a) (out.push(...pts('a', 1)), x++);
      if (y < b) (out.push(...pts('b', 1)), y++);
    }
    return out;
  };
  b1 = run(bd, b1, [...mix(21, 14), ...mix(18, 21), ...mix(17, 15)]);

  const tt = resolveRules({ sport: 'table_tennis', matchBestOf: 5 });
  let t1 = initSnapshot(tt, { firstServer: 'b' });
  t1 = run(tt, t1, [...mix(11, 7), ...mix(9, 11), ...mix(11, 4)]);

  const bb = resolveRules({ sport: 'basketball' });
  let k1 = initSnapshot(bb, { at: now });
  k1 = run(bb, k1, [
    { t: 'score', side: 'a', value: 3 }, { t: 'score', side: 'b', value: 2 }, { t: 'score', side: 'a', value: 2 },
    { t: 'endPeriod', at: now }, { t: 'nextPeriod' }, { t: 'score', side: 'b', value: 3 }, { t: 'score', side: 'b', value: 2 },
    { t: 'endPeriod', at: now }, { t: 'nextPeriod' }, { t: 'score', side: 'a', value: 2 },
    { t: 'clockSet', ms: 2 * 60_000 + 48_000, at: now }, { t: 'clockStart', at: now },
  ]);

  const fb = resolveRules({ sport: 'football' });
  let f1 = initSnapshot(fb, { at: now });
  f1 = run(fb, f1, [{ t: 'score', side: 'a', value: 1 }, { t: 'score', side: 'b', value: 1 }, { t: 'clockSet', ms: 63 * 60_000, at: now }, { t: 'clockStart', at: now }]);

  const done = run(tt, initSnapshot(tt), [...pts('a', 11), { t: 'nextGame' }, ...pts('a', 11), { t: 'nextGame' }, ...pts('a', 11)]);

  const live = [
    row('m1', 'Court 1', "Men's Singles", 'Quarter-final', 'Ali Khan', 'Usman Tariq', bd, b1, now),
    row('m2', 'Court 2', "Women's Singles", 'Semi-final', 'Sara Malik', 'Hina Riaz', tt, t1, now),
    row('m3', 'Court 3', 'Basketball', 'Final', 'Lakers', 'Bulls', bb, k1, now),
    row('m4', 'Court 4', 'Football', 'Group A', 'Falcons', 'Rangers', fb, f1, now),
  ];
  const recent = [
    row('m5', 'Court 2', 'Mixed', 'Round 2', 'Zain Ali', 'Omar Sheikh', tt, done, now, { state: 'finished', started_at: new Date(now - 1_800_000).toISOString(), finished_at: new Date(now - 20_000).toISOString() }),
  ];
  const next = (id: string, court: string, mins: number, a: string, b: string): LiveMatch => ({
    ...row(id, court, 'Next', 'R1', a, b, tt, initSnapshot(tt), now),
    state: undefined,
    summary: undefined,
    snapshot: undefined,
    scheduled_at: new Date(now + mins * 60_000).toISOString(),
  });
  return {
    active: true,
    server_now: new Date(now).toISOString(),
    tournament: { id: 'demo', name: 'SEECS Open 2026', location: 'Islamabad', live_code: 'demo', status: 'published' },
    display: {
      show_school: true, show_fields: [], show_module: true, show_court: true, show_up_next: true, show_recent: true,
      show_app_promo: true, title: null, courts: ['Court 1', 'Court 2', 'Court 3', 'Court 4'], layout: 'auto', max_per_page: 6, final_hold_seconds: 60,
    },
    app_link: 'https://sportron.app/get',
    live,
    recent,
    up_next: [next('n1', 'Court 1', 12, 'Hamza Raza', 'Faraz Ahmed'), next('n2', 'Court 2', 25, 'Ayesha Noor', 'Noor Fatima')],
  };
}
