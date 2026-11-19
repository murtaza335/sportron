// Hand tests for the live scoring engine (src/lib/live). No test runner in this repo, so:
//   npx tsc --ignoreConfig --ignoreDeprecations 6.0 --strict --target es2020 --module commonjs \
//       --moduleResolution node --skipLibCheck --outDir /tmp/live-out src/lib/live/index.ts
//   node docs/live-match/engine-tests.cjs /tmp/live-out
const path = require('path');
const L = require(path.resolve(process.argv[2] || '/tmp/live-out', 'index.js'));

let passed = 0;
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  passed++;
}
function eq(actual, expected, msg) {
  ok(JSON.stringify(actual) === JSON.stringify(expected), `${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const rules = (id, o = {}) => ({ ...L.PRESETS[id], ...o });
const run = (r, snap, actions) => actions.reduce((s, a) => L.reduce(s, a, r), snap);
const pts = (side, n) => Array.from({ length: n }, () => ({ t: 'point', side }));
/** alternate points so both sides reach a given score without anyone winning early */
const scoreTo = (a, b) => {
  const out = [];
  let x = 0, y = 0;
  while (x < a || y < b) {
    if (x < a) { out.push({ t: 'point', side: 'a' }); x++; }
    if (y < b) { out.push({ t: 'point', side: 'b' }); y++; }
  }
  return out;
};

// ── Table tennis 11 ──────────────────────────────────────────────────────────
{
  const r = rules('table_tennis_11', { bestOf: 5 });
  let s = L.initSnapshot(r, { firstServer: 'a' });
  eq(s.server, 'a', 'TT first server');
  s = run(r, s, scoreTo(1, 0)); eq(s.server, 'a', 'TT server after 1 point');
  s = run(r, s, scoreTo(2, 0).slice(1)); // 2-0 total
  eq(s.cur, { a: 2, b: 0 }, 'TT 2-0');
  eq(s.server, 'b', 'TT server changes after 2 points');
  s = run(r, L.initSnapshot(r), scoreTo(10, 10));
  eq(s.cur, { a: 10, b: 10 }, 'TT deuce reached');
  eq(s.server, 'a', 'TT at 10-10 (20 pts) server back to first');
  s = run(r, s, [{ t: 'point', side: 'a' }]);
  eq(s.server, 'b', 'TT at deuce server alternates every point');
  eq(s.state, 'live', 'TT 11-10 is not a game');
  s = run(r, s, [{ t: 'point', side: 'a' }]);
  eq(s.state, 'break', 'TT 12-10 wins the game');
  eq(s.games, [{ a: 12, b: 10 }], 'TT game recorded');
  eq(s.setsWon, { a: 1, b: 0 }, 'TT games won');
  s = run(r, s, [{ t: 'point', side: 'b' }]);
  eq(s.cur, { a: 0, b: 1 }, 'a point in the break starts the next game automatically');
  eq(s.firstServer, 'b', 'TT first server alternates between games');
  // win 3 games
  let m = L.initSnapshot(r);
  for (let g = 0; g < 3; g++) m = run(r, m, [...pts('a', 11), { t: 'nextGame' }]);
  eq(m.state, 'decided', 'TT best of 5 decided after 3 games');
  eq(m.winner, 'a', 'TT winner');
  eq(run(r, m, pts('b', 3)), m, 'no scoring after decided');
  const res = L.toResult(m, r);
  eq([res.scoreA, res.scoreB, res.winner, res.decided], [3, 0, 'a', true], 'TT result mapping');
  eq(res.detail.length, 3, 'TT result detail has the games');
  // manual server correction
  const c = L.reduce(L.initSnapshot(r), { t: 'setServer', side: 'b' }, r);
  eq(c.server, 'b', 'TT manual serve fix');
  const c2 = run(r, c, scoreTo(2, 0));
  eq(c2.server, 'a', 'TT serve continues from the fixed server');
}

// ── Badminton ────────────────────────────────────────────────────────────────
{
  const r = rules('badminton_21');
  let s = run(r, L.initSnapshot(r), scoreTo(20, 20));
  s = run(r, s, pts('a', 1));
  eq(s.state, 'live', 'badminton 21-20 not won');
  s = run(r, s, pts('a', 1));
  eq(s.state, 'break', 'badminton 22-20 won');
  s = run(r, L.initSnapshot(r), scoreTo(29, 29));
  s = run(r, s, pts('b', 1));
  eq(s.state, 'break', 'badminton cap: 30-29 wins');
  eq(s.games[0], { a: 29, b: 30 }, 'badminton cap score');
  eq(s.lastGameWinner, 'b', 'badminton rally winner recorded');
  s = run(r, s, [{ t: 'nextGame' }]);
  eq(s.server, 'b', 'badminton: winner of the last game serves first');
  s = run(r, s, pts('a', 1));
  eq(s.server, 'a', 'badminton: server follows the rally winner');
  const sum = L.summarize(run(r, L.initSnapshot(r), scoreTo(20, 5)), r);
  ok(/Game point A/.test(sum.line), 'badminton summary shows game point');
  const n = L.setsNotices(run(r, L.initSnapshot(r), scoreTo(11, 3)), r);
  eq(n.interval, true, 'badminton interval notice at 11');
}

// ── Volleyball decider to 15 ─────────────────────────────────────────────────
{
  const r = rules('volleyball_25', { bestOf: 5 });
  let s = L.initSnapshot(r);
  for (const w of ['a', 'b', 'a', 'b']) s = run(r, s, [...pts(w, 25), { t: 'nextGame' }]);
  eq(s.setsWon, { a: 2, b: 2 }, 'volleyball 2-2 after four sets');
  eq(s.gameIndex, 4, 'fifth set');
  s = run(r, s, scoreTo(14, 14));
  s = run(r, s, pts('a', 1));
  eq(s.state, 'live', 'volleyball 15-14 in the decider is not a win');
  s = run(r, s, pts('a', 1));
  eq(s.state, 'decided', 'volleyball 16-14 wins the decider (target 15, win by 2)');
  const early = run(r, L.initSnapshot(r), scoreTo(24, 24));
  eq(run(r, early, pts('a', 1)).state, 'live', 'volleyball 25-24 not won');
  eq(L.setsNotices(run(r, L.initSnapshot(r, {}), []), r).changeEnds, false, 'no change-ends notice outside the decider');
  const d = run(r, { ...L.initSnapshot(r), gameIndex: 4, setsWon: { a: 2, b: 2 } }, scoreTo(8, 3));
  eq(L.setsNotices(d, r).changeEnds, true, 'volleyball change-ends notice at 8 in the decider');
  const bo3 = L.resolveRules({ sport: 'volleyball', matchBestOf: 3 });
  eq(bo3.bestOf, 3, 'matchBestOf overrides the preset');
}

// ── Pickleball side-out (doubles) ────────────────────────────────────────────
{
  const r = rules('pickleball_11_sideout');
  let s = L.initSnapshot(r, { firstServer: 'a' });
  eq([s.server, s.serverNumber], ['a', 2], 'pickleball starts with server 2');
  s = run(r, s, pts('a', 2));
  eq(s.cur, { a: 2, b: 0 }, 'only the serving side scores');
  s = run(r, s, pts('b', 1));
  eq([s.server, s.serverNumber, s.cur], ['b', 1, { a: 2, b: 0 }], 'receiver wins rally against server 2 → side out');
  s = run(r, s, pts('b', 1));
  eq(s.cur, { a: 2, b: 1 }, 'new server scores');
  s = run(r, s, pts('a', 1));
  eq([s.server, s.serverNumber], ['b', 2], 'first fault → second server');
  s = run(r, s, pts('a', 1));
  eq([s.server, s.serverNumber], ['a', 1], 'second fault → side out');
  eq(L.summarize(s, r).line.includes('2–1–1'), true, 'pickleball call shown');
  const single = rules('pickleball_11_sideout', { doubles: false });
  let t = L.initSnapshot(single, { firstServer: 'a' });
  t = run(single, t, pts('b', 1));
  eq([t.server, t.serverNumber], ['b', 1], 'singles: any fault is a side out');
  let w = L.initSnapshot(r, { firstServer: 'a' });
  for (let i = 0; i < 11; i++) w = run(r, w, pts('a', 1));
  eq(w.state, 'break', 'pickleball game to 11 with serving-side scoring');
}

// ── Squash / pickleball rally / beach volleyball ─────────────────────────────
{
  const sq = rules('squash_11');
  eq(run(sq, L.initSnapshot(sq), scoreTo(11, 9)).state, 'break', 'squash 11-9');
  eq(run(sq, L.initSnapshot(sq), scoreTo(11, 10)).state, 'live', 'squash 11-10 continues');
  const bv = rules('beach_volleyball_21');
  eq(run(bv, L.initSnapshot(bv), pts('a', 21)).state, 'break', 'beach volleyball to 21');
}

// ── Tennis ───────────────────────────────────────────────────────────────────
{
  const r = rules('tennis_bo3');
  let s = L.initSnapshot(r, { firstServer: 'a' });
  const label = (snap) => [L.summarize(snap, r).a, L.summarize(snap, r).b];
  s = run(r, s, pts('a', 1)); eq(label(s), ['15', '0'], '15-0');
  s = run(r, s, scoreTo(3, 3).slice(1)); // reach 3-3 total points → 40-40
  eq(label(s), ['40', '40'], '40-40');
  eq(L.summarize(s, r).line.includes('Deuce'), true, 'deuce flagged');
  s = run(r, s, pts('a', 1)); eq(label(s), ['AD', '40'], 'advantage');
  s = run(r, s, pts('b', 1)); eq(label(s), ['40', '40'], 'back to deuce');
  s = run(r, s, pts('a', 2));
  eq(s.games, { a: 1, b: 0 }, 'game won from deuce');
  eq(s.server, 'b', 'server alternates each game');
  // golden point
  const g = rules('tennis_short_sets');
  let gs = run(g, L.initSnapshot(g), scoreTo(3, 3));
  eq(L.summarize(gs, g).line.includes('Deciding point'), true, 'golden point flagged');
  gs = run(g, gs, pts('b', 1));
  eq(gs.games, { a: 0, b: 1 }, 'golden point wins the game');
  // set to 6-4, then a tiebreak set
  let t = L.initSnapshot(r, { firstServer: 'a' });
  const game = (w) => pts(w, 4);
  t = run(r, t, [...game('a'), ...game('b'), ...game('a'), ...game('b'), ...game('a'), ...game('b'), ...game('a'), ...game('b'), ...game('a'), ...game('b'), ...game('a'), ...game('b')]);
  eq(t.tb, 'tiebreak', '6-6 starts a tiebreak');
  eq(t.tbFirst, 'a', 'tiebreak first server is the next server');
  t = run(r, t, pts('a', 1));
  eq(t.server, 'b', 'tiebreak: first server serves one point, then the other');
  t = run(r, t, pts('b', 1));
  eq(t.server, 'b', 'tiebreak: two points each turn');
  t = run(r, t, pts('b', 1));
  eq(t.server, 'a', 'tiebreak serve rotates after two');
  t = run(r, t, [...pts('a', 5), ...pts('b', 0)]);
  const done = run(r, t, pts('a', 1));
  eq([done.state, done.sets[0]], ['break', { a: 7, b: 6, tb: { a: 7, b: 2 } }], 'tiebreak 7-2 gives the set 7-6 with the tiebreak recorded');
  eq(done.server, 'b', 'after a tiebreak the other player serves first');
  // match: two straight sets
  let m = L.initSnapshot(r);
  const setTo = (w) => Array.from({ length: 6 }, () => pts(w, 4)).flat();
  m = run(r, m, [...setTo('a'), ...setTo('a')]);
  eq([m.state, m.winner, m.setsWon], ['decided', 'a', { a: 2, b: 0 }], 'tennis bo3 straight sets');
  const res = L.toResult(m, r);
  eq([res.scoreA, res.scoreB, res.detail], [2, 0, [{ a: 6, b: 0 }, { a: 6, b: 0 }]], 'tennis result detail');
  // super tiebreak decider
  const st = rules('tennis_bo3_stb');
  let sm = L.initSnapshot(st);
  const stSet = (w) => Array.from({ length: 6 }, () => pts(w, 4)).flat();
  sm = run(st, sm, [...stSet('a'), ...stSet('b')]);
  eq([sm.setIndex, sm.state], [1, 'break'], 'in break after set 2');
  sm = run(st, sm, [{ t: 'nextSet' }]);
  eq(sm.tb, 'super', 'third set is a super tiebreak');
  sm = run(st, sm, scoreTo(9, 9)); sm = run(st, sm, pts('a', 1));
  eq(sm.state, 'live', 'super tiebreak 10-9 not won');
  sm = run(st, sm, pts('a', 1));
  eq([sm.state, sm.winner], ['decided', 'a'], 'super tiebreak 11-9 wins the match');
  eq(L.toResult(sm, st).detail.at(-1), { a: 1, b: 0 }, 'super tiebreak recorded as 1-0');
  // pro set
  const ps = rules('tennis_pro_set_8');
  let p = L.initSnapshot(ps);
  p = run(ps, p, Array.from({ length: 8 }, () => pts('a', 4)).flat());
  eq(p.state, 'decided', 'pro set to 8');
  // advantage final set: no tiebreak
  const adv = rules('tennis_bo3', { finalSet: 'advantage' });
  let a = { ...L.initSnapshot(adv), setIndex: 2, setsWon: { a: 1, b: 1 } };
  const alt = Array.from({ length: 6 }, () => [...game('a'), ...game('b')]).flat();
  a = run(adv, a, alt);
  eq([a.tb, a.games], ['none', { a: 6, b: 6 }], 'advantage final set has no tiebreak at 6-6');
}

// ── Basketball ───────────────────────────────────────────────────────────────
{
  const r = rules('basketball_fiba');
  let s = L.initSnapshot(r, { at: 0 });
  s = run(r, s, [{ t: 'score', side: 'a', value: 3 }, { t: 'score', side: 'b', value: 2 }, { t: 'score', side: 'a', value: 1 }]);
  eq(s.scores, { a: 4, b: 2 }, 'basketball scoring');
  s = run(r, s, [{ t: 'score', side: 'b', value: -1 }]);
  eq(s.scores.b, 1, 'basketball −1 correction');
  s = run(r, s, [{ t: 'score', side: 'b', value: -5 }]);
  eq(s.scores.b, 0, 'score never below 0');
  // clock
  s = run(r, s, [{ t: 'clockStart', at: 1000 }]);
  eq(L.timedElapsed(s, 6000), 5000, 'clock runs');
  s = run(r, s, [{ t: 'clockStop', at: 11000 }]);
  eq(L.timedElapsed(s, 99999), 10000, 'clock stops');
  const sm = L.summarize(s, r, { at: 11000 });
  eq([sm.clock.dir, sm.clock.limit_ms, sm.clock.elapsed_ms, sm.clock.running], ['down', 600000, 10000, false], 'summary clock');
  eq(L.formatClock(sm.clock.elapsed_ms, sm.clock.dir, sm.clock.limit_ms), '9:50', 'countdown format');
  // fouls reset each period, timeouts counted
  s = run(r, s, [{ t: 'counter', side: 'a', key: 'fouls', delta: 1 }, { t: 'counter', side: 'a', key: 'fouls', delta: 1 }, { t: 'counter', side: 'a', key: 'timeouts', delta: 1 }]);
  eq(s.counters.a.fouls, 2, 'team fouls');
  s = run(r, s, [{ t: 'endPeriod', at: 12000 }]);
  eq([s.state, s.period], ['break', 1], 'end of Q1 → break');
  s = run(r, s, [{ t: 'nextPeriod' }]);
  eq([s.period, s.counters.a.fouls, s.counters.a.timeouts, s.byPeriod.length], [2, 0, 1, 2], 'next period: fouls reset, timeouts kept, new period row');
  // finish regulation level → overtime repeats until a winner
  let g = L.initSnapshot(r, { at: 0 });
  g = run(r, g, [{ t: 'score', side: 'a', value: 2 }, { t: 'score', side: 'b', value: 2 }]);
  for (let p = 1; p <= 3; p++) g = run(r, g, [{ t: 'endPeriod', at: 0 }, { t: 'nextPeriod' }]);
  g = run(r, g, [{ t: 'endPeriod', at: 0 }]);
  eq([g.state, g.period], ['break', 4], 'level after Q4 → overtime next');
  g = run(r, g, [{ t: 'nextPeriod' }]);
  eq([g.phase, g.period, L.periodName(r, g.period)], ['overtime', 5, 'OT'], 'overtime period');
  eq(L.summarize(g, r).clock.limit_ms, 300000, 'overtime is 5 minutes');
  g = run(r, g, [{ t: 'endPeriod', at: 0 }, { t: 'nextPeriod' }]);
  eq(L.periodName(r, g.period), 'OT2', 'a second overtime when still level');
  g = run(r, g, [{ t: 'score', side: 'b', value: 3 }, { t: 'endPeriod', at: 0 }]);
  eq([g.state, g.winner], ['decided', 'b'], 'overtime winner decides');
  const res = L.toResult(g, r);
  eq([res.scoreA, res.scoreB, res.winner, res.needsWinner], [2, 5, 'b', false], 'basketball result incl. overtime');
  eq(res.detail.length, 6, 'one detail row per period incl. OT');
  // 3x3 to 21
  const x = rules('basketball_3x3');
  let h = L.initSnapshot(x);
  h = run(x, h, [{ t: 'score', side: 'a', value: 2 }, { t: 'score', side: 'b', value: 1 }]);
  for (let i = 0; i < 9; i++) h = run(x, h, [{ t: 'score', side: 'a', value: 2 }]);
  eq(h.state, 'live', '3x3 20 points not over');
  h = run(x, h, [{ t: 'score', side: 'a', value: 1 }]);
  eq([h.state, h.winner], ['decided', 'a'], '3x3 first to 21 ends the match at once');
  // bonus indicator
  let b = L.initSnapshot(r);
  b = run(r, b, Array.from({ length: 5 }, () => ({ t: 'counter', side: 'a', key: 'fouls', delta: 1 })));
  eq(L.inBonus(b, r, 'b'), true, 'opponent in the bonus after 5 team fouls');
}

// ── Football ─────────────────────────────────────────────────────────────────
{
  const r = rules('football_11');
  let s = L.initSnapshot(r, { at: 0 });
  s = run(r, s, [{ t: 'score', side: 'a', value: 1 }, { t: 'endPeriod', at: 0 }]);
  eq(s.state, 'break', 'half-time');
  eq(L.summarize(s, r).state_label, 'Half-time', 'half-time label');
  s = run(r, s, [{ t: 'nextPeriod' }, { t: 'score', side: 'b', value: 1 }, { t: 'endPeriod', at: 0 }]);
  eq(s.state, 'break', 'level after 90 → extra time (knockout)');
  s = run(r, s, [{ t: 'nextPeriod' }]);
  eq([L.periodName(r, s.period), s.phase], ['Extra time 1', 'overtime'], 'extra time 1');
  s = run(r, s, [{ t: 'endPeriod', at: 0 }, { t: 'nextPeriod' }, { t: 'endPeriod', at: 0 }]);
  eq([s.phase, s.state], ['shootout', 'live'], 'level after extra time → penalties');
  const kick = (v) => ({ t: 'kick', scored: v });
  // a: ✓ ✓ ✓ ✓ ✓ ; b: ✓ ✓ ✗ ✗ ✗ → a wins early?
  let k = s;
  const seq = [true, true, true, true, true, false, false, true, false, false]; // a b a b ...
  const expectedNext = ['a', 'b', 'a', 'b'];
  eq(L.shootoutNext(k.shootout), 'a', 'a kicks first');
  for (let i = 0; i < 4; i++) k = run(r, k, [kick(seq[i])]);
  eq(k.state, 'live', 'not decided after 2 kicks each');
  k = run(r, k, [kick(true), kick(false), kick(true), kick(false)]); // a3 ✓ b3 ✗ a4 ✓ b4 ✗
  eq([k.state, k.winner], ['decided', 'a'], 'early finish: a 4–2 with one kick left each can’t be caught');
  const res = L.toResult(k, r);
  eq([res.scoreA, res.scoreB, res.winner, res.note, res.needsWinner], [1, 1, 'a', 'Pens 4–2', false], 'penalties: level score, shootout winner, note');
  // sudden death
  let sd = s;
  for (let i = 0; i < 10; i++) sd = run(r, sd, [kick(true)]);
  eq(sd.state, 'live', '5–5 after five rounds goes to sudden death');
  sd = run(r, sd, [kick(true), kick(false)]);
  eq([sd.state, sd.winner], ['decided', 'a'], 'sudden death decided after an equal round');
  // league: draw allowed
  const lg = { ...r, drawAllowed: true };
  let d = run(lg, L.initSnapshot(lg), [{ t: 'endPeriod', at: 0 }, { t: 'nextPeriod' }, { t: 'endPeriod', at: 0 }]);
  eq([d.state, d.winner], ['decided', null], 'league: level full time is a draw, no extra time');
  const dr = L.toResult(d, lg);
  eq([dr.draw, dr.needsWinner], [true, false], 'draw flagged in the result');
  // football_school: straight to penalties
  const sc = rules('football_school');
  let q = run(sc, L.initSnapshot(sc), [{ t: 'endPeriod', at: 0 }, { t: 'nextPeriod' }, { t: 'endPeriod', at: 0 }]);
  eq(q.phase, 'shootout', 'school football: level → penalties directly');
  // no shootout, no draw → referee picks
  const bare = rules('football_7', { shootout: 'none' });
  let b2 = run(bare, L.initSnapshot(bare), [{ t: 'endPeriod', at: 0 }, { t: 'nextPeriod' }, { t: 'endPeriod', at: 0 }]);
  eq([b2.state, L.toResult(b2, bare).needsWinner], ['decided', true], 'level without any tie-break needs the referee to pick');
  // added time shown
  const at = run(r, L.initSnapshot(r), [{ t: 'addedTime', minutes: 3 }]);
  eq(L.summarize(at, r).line.includes("+3'"), true, 'added time shown');
  // upward clock past the limit shows "+"
  eq(L.formatClock(2700000 + 61000, 'up', 2700000), '46:01+', 'up-clock past the limit');
}

// ── Handball ─────────────────────────────────────────────────────────────────
{
  const r = rules('handball');
  let s = L.initSnapshot(r);
  s = run(r, s, [{ t: 'score', side: 'a', value: 1 }, { t: 'endPeriod', at: 0 }, { t: 'nextPeriod' }, { t: 'score', side: 'b', value: 1 }, { t: 'endPeriod', at: 0 }, { t: 'nextPeriod' }]);
  eq(L.periodName(r, s.period), 'Extra time 1', 'handball extra time');
  s = run(r, s, [{ t: 'endPeriod', at: 0 }, { t: 'nextPeriod' }, { t: 'endPeriod', at: 0 }]);
  eq(s.phase, 'shootout', 'handball: 7 m throws after extra time');
  eq(L.summarize(s, r).state_label, '7 m throws', '7 m label');
  const t = run(r, s, [{ t: 'kick', scored: true }, { t: 'kick', scored: false }]);
  eq(L.toResult({ ...t, state: 'decided', winner: 'a' }, r).note, '7 m 1–0', 'handball 7 m note');
}

// ── Cricket ──────────────────────────────────────────────────────────────────
{
  const r = rules('cricket_t20');
  const ball = (runs, kind = 'normal') => ({ t: 'ball', runs, kind });
  let s = L.initCricket ? null : null;
  s = L.initSnapshot(r, { firstBat: 'a' });
  s = run(r, s, [ball(4), ball(6), ball(1, 'wide'), ball(0), { t: 'wicket', runs: 0 }, ball(2), ball(1)]);
  eq(s.innings[0].runs, 4 + 6 + 2 + 2 + 1, 'runs incl. wide (1 + 1 run)');
  eq(s.innings[0].thisOver, ['4', '6', '2Wd', '0', 'W', '2', '1'], 'over strip tokens');
  eq(s.innings[0].balls, 6, 'wide does not count as a ball: 7 deliveries, 6 legal');
  eq(s.innings[0].wickets, 1, 'wicket');
  eq(s.innings[0].overDone, true, 'over complete');
  eq(L.inningsOvers(s.innings[0], r), '1.0', 'overs shown as 1.0');
  eq(L.summarize(s, r).a, '15/1', 'summary score 15/1');
  s = run(r, s, [ball(0, 'noball')]);
  eq(s.innings[0].balls, 6, 'no-ball not counted');
  eq(s.innings[0].runs, 16, 'no-ball adds a run');
  eq(s.innings[0].thisOver.at(-1), 'Nb', 'no-ball token');
  s = run(r, s, [ball(1, 'bye'), ball(2, 'legbye')]);
  eq([s.innings[0].extras.b, s.innings[0].extras.lb, s.innings[0].balls], [1, 2, 8], 'byes and leg byes count as balls');
  // end innings 1 by overs
  let t = L.initSnapshot(rules('cricket_6_over'), { firstBat: 'b' });
  const r6 = rules('cricket_6_over');
  t = run(r6, t, Array.from({ length: 36 }, () => ball(1)));
  eq([t.state, t.target, t.innings[0].ended], ['break', 37, true], 'innings ends after 6 overs with target runs+1');
  t = run(r6, t, [{ t: 'nextInnings' }]);
  eq([t.current, t.innings[1].batting], [1, 'a'], 'other side bats second');
  eq(L.summarize(t, r6).line.includes('need 37 off 36'), true, 'chase line');
  // chase won by wickets
  t = run(r6, t, Array.from({ length: 6 }, () => ball(6)).concat(ball(1)));
  eq([t.state, t.winner, t.resultText], ['decided', 'a', 'won by 6 wickets'], 'chase won: result text');
  const res = L.toResult(t, r6, { names: { a: 'Lions', b: 'Tigers' } });
  eq([res.scoreA, res.scoreB, res.winner], [37, 36, 'a'], 'cricket result runs');
  ok(res.note.includes('Tigers 36/0') && res.note.includes('Lions won by 6 wickets'), 'cricket note has both innings + result');
  // defend by runs: all out
  let u = L.initSnapshot(r6, { firstBat: 'a' });
  u = run(r6, u, [ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6), ball(6)]);
  u = run(r6, u, [{ t: 'nextInnings' }, ball(1), ...Array.from({ length: 6 }, () => ({ t: 'wicket', runs: 0 }))]);
  eq([u.state, u.winner, u.resultText], ['decided', 'a', 'won by 215 runs'], 'defended: all out');
  // tie
  let v = L.initSnapshot(r6, { firstBat: 'a' });
  v = run(r6, v, [ball(1), { t: 'endInnings' }, { t: 'nextInnings' }, ball(1)]);
  eq(v.target, 2, 'target after a 1-run innings');
  v = run(r6, v, [{ t: 'endInnings' }]);
  eq([v.state, v.tied, v.winner], ['decided', true, null], 'equal runs when the chase innings ends = tied');
  let w = L.initSnapshot(r6, { firstBat: 'a' });
  w = run(r6, w, [ball(2), { t: 'endInnings' }, { t: 'nextInnings' }, ball(1), ball(1)]);
  eq(w.state, 'live', 'two runs against a target of three: still on');
  w = run(r6, w, [ball(1)]);
  eq(w.state, 'decided', 'chase reaching the target ends it');
  let x = L.initSnapshot(r6, { firstBat: 'a' });
  x = run(r6, x, [ball(2), { t: 'endInnings' }, { t: 'nextInnings' }, ball(1), { t: 'endInnings' }]);
  eq([x.tied, x.winner, x.resultText], [false, 'a', 'won by 1 run'], 'singular run');
  let y = L.initSnapshot(r6, { firstBat: 'a' });
  y = run(r6, y, [ball(2), { t: 'endInnings' }, { t: 'nextInnings' }, ball(2)]);
  eq(y.state, 'live', 'level with the first innings but below the target: the chase goes on');
}

// ── Simple ───────────────────────────────────────────────────────────────────
{
  const r = rules('simple', { target: 5, buttons: [1, 5] });
  let s = L.initSnapshot(r);
  s = run(r, s, [{ t: 'score', side: 'a', value: 1 }, { t: 'score', side: 'b', value: 4 }]);
  eq(s.scores, { a: 1, b: 4 }, 'simple counters');
  s = run(r, s, [{ t: 'score', side: 'b', value: 1 }]);
  eq([s.state, s.winner], ['decided', 'b'], 'simple target reached');
  const open = L.initSnapshot(rules('simple'));
  const res = L.toResult(run(rules('simple'), open, [{ t: 'score', side: 'a', value: 2 }, { t: 'score', side: 'b', value: 2 }]), rules('simple'), { drawAllowed: false });
  eq([res.needsWinner, res.draw], [true, false], 'simple level → needs winner');
  eq(L.toResult(run(rules('simple'), open, []), rules('simple'), { drawAllowed: true }).draw, true, 'simple level with draws allowed');
}

// ── Timeline: undo / redo ────────────────────────────────────────────────────
{
  const r = rules('badminton_21');
  let tl = L.newTimeline(L.initSnapshot(r));
  const A = (a) => (tl = L.applyAction(tl, a, r, { a: 'Ali', b: 'Bilal' }));
  A({ t: 'point', side: 'a' }); A({ t: 'point', side: 'b' });
  eq(L.undoLabel(tl), 'Undo +1 Bilal', 'undo label names what it undoes');
  tl = L.undo(tl, 0);
  eq(tl.present.cur, { a: 1, b: 0 }, 'undo');
  eq(L.redoLabel(tl), 'Redo +1 Bilal', 'redo label');
  tl = L.redo(tl, 0);
  eq(tl.present.cur, { a: 1, b: 1 }, 'redo');
  tl = L.undo(tl, 0);
  A({ t: 'point', side: 'a' });
  eq(L.canRedo(tl), false, 'a new action clears redo');
  // undo across a game boundary reopens the game
  let g = L.newTimeline(L.initSnapshot(r));
  for (let i = 0; i < 21; i++) g = L.applyAction(g, { t: 'point', side: 'a' }, r);
  eq(g.present.state, 'break', 'game ended');
  g = L.undo(g, 0);
  eq([g.present.state, g.present.cur, g.present.games.length], ['live', { a: 20, b: 0 }, 0], 'undo reopens the finished game');
  // no-ops do not create history
  const before = g.past.length;
  g = L.applyAction(g, { t: 'unpoint', side: 'b' }, r);
  eq(g.past.length, before, 'no-op creates no undo entry');
  // clock actions are not history; undo keeps a running clock
  const br = rules('basketball_fiba');
  let c = L.newTimeline(L.initSnapshot(br, { at: 0 }));
  c = L.applyAction(c, { t: 'score', side: 'a', value: 2 }, br);
  c = L.applyAction(c, { t: 'clockStart', at: 1000 }, br);
  eq(c.past.length, 1, 'clock start is not an undo step');
  c = L.applyAction(c, { t: 'score', side: 'b', value: 3 }, br);
  c = L.undo(c, 5000);
  eq([c.present.scores, c.present.clock.running], [{ a: 2, b: 0 }, true], 'undo a score keeps the running clock');
  // undoing end-of-period stops a running clock instead of rewinding it
  let p = L.newTimeline(L.initSnapshot(br, { at: 0 }));
  p = L.applyAction(p, { t: 'clockStart', at: 0 }, br);
  p = L.applyAction(p, { t: 'endPeriod', at: 600000 }, br);
  p = L.undo(p, 601000);
  eq([p.present.state, p.present.clock.running], ['live', false], 'undo of end-of-period leaves the clock stopped');
  // history cap
  let h = L.newTimeline(L.initSnapshot(rules('simple')));
  for (let i = 0; i < L.MAX_HISTORY + 50; i++) h = L.applyAction(h, { t: 'score', side: 'a', value: 1 }, rules('simple'));
  eq(h.past.length, L.MAX_HISTORY, 'history capped');
}

// ── Presets / resolveRules ───────────────────────────────────────────────────
{
  eq(L.defaultPresetId('table_tennis'), 'table_tennis_11', 'default TT');
  eq(L.defaultPresetId('other', 'padel'), 'tennis_bo3', 'More sport: padel');
  eq(L.defaultPresetId('other', 'kabaddi'), 'simple', 'unmapped More sport → simple');
  eq(L.defaultPresetId('other', null), 'simple', 'Other → simple');
  const r = L.resolveRules({ sport: 'badminton', liveRules: { preset: 'badminton_15', cap: 25, bogus: 1, pointsToWin: 'x' }, matchBestOf: 1 });
  eq([r.pointsToWin, r.cap, r.bestOf, r.preset, 'bogus' in r], [15, 25, 1, 'badminton_15', false], 'overrides applied, junk ignored, match best-of wins');
  eq(L.resolveRules({ sport: 'football', drawAllowed: true }).drawAllowed, true, 'draw flag from the module');
  eq(L.resolveRules({ sport: 'tennis', matchBestOf: 7 }).bestOf, 5, 'tennis best-of clamped to 5');
  eq(L.resolveRules({ sport: 'cricket', liveRules: { overs: 12 } }).overs, 12, 'cricket custom overs');
  const lists = L.presetsForSport('basketball');
  ok(lists.mine.length === 4 && lists.rest.length > 10, 'sport presets listed first');
  ok(L.describeRules(L.PRESETS.badminton_21).includes('cap 30'), 'describeRules');
  for (const p of L.PRESET_LIST) {
    const snap = L.initSnapshot(p.rules, { at: 0 });
    const sm = L.summarize(snap, p.rules);
    ok(typeof sm.a === 'string' && typeof sm.state_label === 'string', `summary works for preset ${p.id}`);
    ok(JSON.stringify(snap).length < 2000, `fresh snapshot of ${p.id} is small`);
  }
}

console.log(`engine tests: ${passed} checks passed`);
