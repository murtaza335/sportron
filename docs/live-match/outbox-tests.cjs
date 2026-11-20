// Tests for the live-score outbox core (src/lib/liveOutboxCore.ts) with a fake network + storage.
//   npx tsc --ignoreConfig --ignoreDeprecations 6.0 --strict --target es2020 --module commonjs --moduleResolution node \
//       --skipLibCheck --outDir /tmp/live-out src/lib/live/index.ts src/lib/liveOutboxCore.ts
//   node docs/live-match/outbox-tests.cjs /tmp/live-out
const path = require('path');
const dir = path.resolve(process.argv[2] || '/tmp/live-out');
const L = require(path.join(dir, 'live', 'index.js'));
const { createOutbox } = require(path.join(dir, 'liveOutboxCore.js'));

let passed = 0;
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } passed++; };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(cond, msg, ms = 3000) {
  const t = Date.now();
  while (!cond()) { if (Date.now() - t > ms) { console.error('FAIL (timeout):', msg); process.exit(1); } await sleep(5); }
  passed++;
}

const rules = L.PRESETS.badminton_21;
const fresh = (snap) => L.newTimeline(snap);
const META = { tournamentId: 't1', moduleId: 'm1', label: 'Ali vs Bilal' };

function memStorage() {
  const m = new Map();
  return {
    m,
    get: async (k) => (m.has(k) ? m.get(k) : null),
    set: async (k, v) => { m.set(k, v); },
    remove: async (k) => { m.delete(k); },
    keys: async (p) => [...m.keys()].filter((k) => k.startsWith(p)),
  };
}

/** a fake server that mimics live_push_score */
function fakeServer(o = {}) {
  const srv = { seq: o.seq ?? 1, state: 'live', pushes: [], finishes: [], down: 0, delay: 0, hang: false, takenFor: null, failWith: null, finishFail: null, dropNext: 0, aheadBy: 0 };
  Object.assign(srv, o);
  srv.push = async (a) => {
    if (srv.hang) return new Promise(() => {});
    if (srv.delay) await sleep(srv.delay);
    if (srv.down > 0) { srv.down--; throw new Error('Network request failed'); }
    if (srv.failWith) throw new Error(srv.failWith);
    srv.pushes.push(a.seq);
    if (srv.dropNext > 0) { srv.dropNext--; return { seq: srv.seq, state: srv.state }; }
    if (srv.aheadBy) return { seq: a.seq + srv.aheadBy, state: srv.state };
    if (a.seq > srv.seq) { srv.seq = a.seq; srv.snapshot = a.snapshot; }
    return { seq: srv.seq, state: srv.state };
  };
  srv.finish = async (a) => {
    if (srv.down > 0) { srv.down--; throw new Error('Network request failed'); }
    if (srv.finishFail) { const e = srv.finishFail; throw new Error(e); }
    srv.finishes.push(a);
  };
  return srv;
}

const mk = (srv, storage) => createOutbox({ push: srv.push, finish: srv.finish, storage, backoffMs: [10, 20, 40], minGapMs: 5, dropRetryMs: 10 });

async function openSlot(ob, id, server) {
  const snap = L.initSnapshot(rules);
  return ob.open({ matchId: id, meta: META, rules, server: { seq: server, snapshot: snap, summary: L.summarize(snap, rules) }, freshTimeline: fresh });
}

const tap = (ob, id, tl) => {
  const next = L.applyAction(tl, { t: 'point', side: 'a' }, rules);
  ob.submit(id, next, L.summarize(next.present, rules));
  return next;
};

(async () => {
  // 1 ── submit never waits and bursts coalesce
  {
    const srv = fakeServer({ delay: 40 }); const st = memStorage(); const ob = mk(srv, st);
    let { timeline: tl } = await openSlot(ob, 'm', 1);
    const t0 = Date.now();
    for (let i = 0; i < 20; i++) tl = tap(ob, 'm', tl);
    ok(Date.now() - t0 < 30, '20 taps return instantly (no awaiting the network)');
    eq(ob.status('m').pending, 20, '20 changes pending right after the burst');
    await until(() => ob.status('m').phase === 'synced', 'burst syncs');
    ok(srv.pushes.length <= 3, `burst of 20 became ${srv.pushes.length} request(s)`);
    eq(srv.pushes.at(-1), 21, 'the latest seq reached the server');
    ok(srv.pushes.every((s, i, a) => i === 0 || s > a[i - 1]), 'seq only increases');
    eq(srv.snapshot.cur.a, 20, 'server holds the latest score');
  }
  // 2 ── hanging network: the app keeps working, state is persisted locally
  {
    const srv = fakeServer({ hang: true }); const st = memStorage(); const ob = mk(srv, st);
    let { timeline: tl } = await openSlot(ob, 'm', 1);
    const t0 = Date.now();
    for (let i = 0; i < 15; i++) tl = tap(ob, 'm', tl);
    ok(Date.now() - t0 < 50, 'taps are instant even when the network hangs forever');
    await sleep(20);
    const saved = JSON.parse(st.m.get('live_outbox:m'));
    eq(saved.timeline.present.cur.a, 15, 'score persisted on the phone while the network hangs');
    eq(saved.seq - saved.sentSeq, 15, 'persisted pending count');
  }
  // 3 ── offline then back: retries with backoff, ends synced with the newest score
  {
    const srv = fakeServer({ seq: 1 }); srv.down = 3; const st = memStorage(); const ob = mk(srv, st);
    let { timeline: tl } = await openSlot(ob, 'm', 1);
    tl = tap(ob, 'm', tl);
    await until(() => ob.status('m').phase === 'offline', 'goes offline after a failure');
    eq(ob.status('m').message, 'Offline — saved on this phone.', 'offline message');
    for (let i = 0; i < 5; i++) tl = tap(ob, 'm', tl);
    await until(() => ob.status('m').phase === 'synced', 'recovers by itself');
    eq(srv.snapshot.cur.a, 6, 'newest score uploaded after the outage');
  }
  // 4 ── takeover: LIVE_TAKEN stops sending for good
  {
    const srv = fakeServer(); srv.failWith = 'LIVE_TAKEN'; const st = memStorage(); const ob = mk(srv, st);
    let { timeline: tl } = await openSlot(ob, 'm', 1);
    tl = tap(ob, 'm', tl);
    await until(() => ob.status('m').phase === 'taken', 'taken detected');
    srv.failWith = null; tap(ob, 'm', tl); await sleep(40);
    eq(srv.pushes.length, 0, 'nothing is sent after being taken over');
    eq(ob.status('m').message, 'Another admin took over scoring.', 'taken message');
  }
  // 5 ── server ahead of us (someone else scored): stop instead of overwriting
  {
    const srv = fakeServer(); srv.aheadBy = 5; const st = memStorage(); const ob = mk(srv, st);
    let { timeline: tl } = await openSlot(ob, 'm', 1); tap(ob, 'm', tl);
    await until(() => ob.status('m').phase === 'taken', 'server ahead → stop');
  }
  // 6 ── dropped write (rate limit) is resent
  {
    const srv = fakeServer(); srv.dropNext = 2; const st = memStorage(); const ob = mk(srv, st);
    let { timeline: tl } = await openSlot(ob, 'm', 1); tap(ob, 'm', tl);
    await until(() => ob.status('m').phase === 'synced', 'dropped writes are resent');
    eq(srv.pushes.length, 3, 'two drops + the success');
  }
  // 7 ── match ended elsewhere
  {
    const srv = fakeServer(); srv.state = 'finished'; const ob = mk(srv, memStorage());
    let { timeline: tl } = await openSlot(ob, 'm', 1); tap(ob, 'm', tl);
    await until(() => ob.status('m').phase === 'ended', 'server says finished → ended');
  }
  // 8 ── fatal server error is surfaced, not retried forever
  {
    const srv = fakeServer(); srv.failWith = 'NOT_FOUND'; const ob = mk(srv, memStorage());
    let { timeline: tl } = await openSlot(ob, 'm', 1); tap(ob, 'm', tl);
    await until(() => ob.status('m').phase === 'error', 'fatal error stops sending');
    ok(ob.status('m').message.includes('NOT_FOUND'), 'error message kept');
  }
  // 9 ── app killed: a new outbox on the same storage resumes unsent work
  {
    const st = memStorage(); const srv1 = fakeServer({ hang: true }); const ob1 = mk(srv1, st);
    let { timeline: tl } = await openSlot(ob1, 'm', 1);
    for (let i = 0; i < 7; i++) tl = tap(ob1, 'm', tl);
    await sleep(20);
    const pend = await ob1.listPersisted();
    eq([pend.length, pend[0].pending, pend[0].label], [1, 7, 'Ali vs Bilal'], 'unfinished match listed for the resume banner');
    const srv2 = fakeServer({ seq: 1 }); const ob2 = mk(srv2, st);        // "restart"
    eq(await ob2.resumeAll(), 1, 'one slot restored on app start');
    await until(() => ob2.status('m').phase === 'synced', 'restored slot uploads');
    eq(srv2.snapshot.cur.a, 7, 'the score survived the kill');
    // reopening the screen continues from the local state, not the stale server row
    const re = await openSlot(ob2, 'm', 1);
    eq([re.timeline.present.cur.a, re.resumedLocal], [7, true], 'open() keeps newer local state');
    ok(L.canUndo(re.timeline), 'undo history survived');
  }
  // 9b ── peek(): resume offline from storage alone
  {
    const st = memStorage(); const srv1 = fakeServer({ hang: true }); const ob1 = mk(srv1, st);
    let { timeline: tl } = await openSlot(ob1, 'm', 1); for (let i = 0; i < 4; i++) tl = tap(ob1, 'm', tl);
    await sleep(20);
    const ob2 = mk(fakeServer({ hang: true }), st);
    const p = await ob2.peek('m');
    eq([p.timeline.present.cur.a, p.rules.preset, p.seq], [4, 'badminton_21', 5], 'peek restores rules + timeline + seq without the network');
    eq(await ob2.peek('nope'), null, 'peek of an unknown match is null');
  }
  // 10 ── open(): server newer than local → server wins
  {
    const st = memStorage(); const srv = fakeServer(); const ob = mk(srv, st);
    let { timeline: tl } = await openSlot(ob, 'm', 1); for (let i = 0; i < 3; i++) tl = tap(ob, 'm', tl);
    await until(() => ob.status('m').phase === 'synced', 'synced');
    const ob2 = mk(srv, st);
    const snap = L.reduce(L.initSnapshot(rules), { t: 'point', side: 'b' }, rules);
    const r = await ob2.open({ matchId: 'm', meta: META, rules, server: { seq: 99, snapshot: snap, summary: L.summarize(snap, rules) }, freshTimeline: fresh });
    eq([r.resumedLocal, r.seq, r.timeline.present.cur], [false, 99, { a: 0, b: 1 }], 'a newer server row beats stale local state');
  }
  // 11 ── finish: queued offline, rejected, fixed, accepted
  {
    const srv = fakeServer(); srv.down = 2; const st = memStorage(); const ob = mk(srv, st);
    let { timeline: tl } = await openSlot(ob, 'm', 1);
    tl = tap(ob, 'm', tl);
    const result = { scoreA: 2, scoreB: 0, scoreDetail: [{ a: 21, b: 5 }], winnerEntryId: null, note: null };
    ob.queueFinish('m', tl, L.summarize(tl.present, rules), result);
    eq(ob.status('m').finishQueued, true, 'finish queued locally');
    await until(() => srv.finishes.length === 1, 'finish uploaded after the outage');
    await until(() => ob.status('m').finished, 'finished flag');
    eq(srv.finishes[0].scoreA, 2, 'result delivered');
    eq(await ob.listPersisted(), [], 'storage cleared after finish');
    // rejected
    const srv2 = fakeServer(); srv2.finishFail = 'TIE_NEEDS_WINNER'; const ob2 = mk(srv2, memStorage());
    let { timeline: t2 } = await openSlot(ob2, 'x', 1); t2 = tap(ob2, 'x', t2);
    ob2.queueFinish('x', t2, L.summarize(t2.present, rules), { scoreA: 1, scoreB: 1, scoreDetail: null, winnerEntryId: null, note: null });
    await until(() => ob2.status('x').finishError, 'server rejection is surfaced');
    ok(ob2.status('x').finishError.includes('TIE_NEEDS_WINNER'), 'error text');
    eq(ob2.status('x').finishQueued, false, 'rejected finish is not retried');
    srv2.finishFail = null;
    ob2.queueFinish('x', t2, L.summarize(t2.present, rules), { scoreA: 1, scoreB: 1, scoreDetail: null, winnerEntryId: 'w', note: null });
    await until(() => srv2.finishes.length === 1, 'fixed finish accepted');
    eq(srv2.finishes[0].winnerEntryId, 'w', 'winner sent');
  }
  // 12 ── discard
  {
    const st = memStorage(); const ob = mk(fakeServer(), st);
    await openSlot(ob, 'm', 1); await ob.discard('m'); await sleep(10);
    eq([ob.status('m'), (await ob.listPersisted()).length], [null, 0], 'discard removes memory + storage');
  }
  // 13 ── status object is stable between changes (useSyncExternalStore requirement)
  {
    const ob = mk(fakeServer(), memStorage()); await openSlot(ob, 'm', 1);
    ok(ob.status('m') === ob.status('m'), 'status() returns a cached object until something changes');
    let hits = 0; const off = ob.subscribe('m', () => hits++);
    const { timeline } = await openSlot(ob, 'm', 1); tap(ob, 'm', timeline); off();
    ok(hits > 0, 'subscribers are notified');
  }
  console.log(`outbox tests: ${passed} checks passed`);
  process.exit(0);
})();
