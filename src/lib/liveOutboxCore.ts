import type { LiveRules, LiveSnapshot, Summary, Timeline } from './live';

/**
 * Live-score outbox (docs/live-match/PLAN.md §6.8). Pure logic: the transport, storage and timers are injected so it
 * can be tested without React Native. The referee's screen NEVER awaits anything in here — `submit()` updates memory,
 * fires a storage write and wakes the sender; the sender uploads the LATEST snapshot in the background (one request in
 * flight per match, retry with backoff, survive app kills via storage).
 */

export interface PushArgs {
  matchId: string;
  seq: number;
  snapshot: LiveSnapshot;
  summary: Summary;
}

export interface FinishArgs extends PushArgs {
  scoreA: number;
  scoreB: number;
  scoreDetail: { a: number; b: number }[] | null;
  winnerEntryId: string | null;
  note: string | null;
}

export interface OutboxStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
}

export interface OutboxDeps {
  push(args: PushArgs): Promise<{ seq: number; state: string }>;
  finish(args: FinishArgs): Promise<void>;
  storage: OutboxStorage;
  now?: () => number;
  /** Retry delays (ms). Default 1 s, 2 s, 4 s, 8 s, 10 s cap. */
  backoffMs?: number[];
  /** Minimum gap between two uploads of the same match. */
  minGapMs?: number;
  /** Wait before resending when the server dropped a write (rate limit). */
  dropRetryMs?: number;
}

export type SyncPhase = 'synced' | 'syncing' | 'offline' | 'taken' | 'ended' | 'error';

export interface OutboxStatus {
  matchId: string;
  phase: SyncPhase;
  /** Changes not yet confirmed by the server. */
  pending: number;
  lastSentAt: number | null;
  finishQueued: boolean;
  /** A finish the server rejected (e.g. TIE_NEEDS_WINNER) — the screen shows it and lets the referee fix it. */
  finishError: string | null;
  /** The match was finished on the server (our finish, or another path). */
  finished: boolean;
  message: string | null;
}

export interface SlotMeta {
  tournamentId: string;
  moduleId: string;
  /** "Ali vs Bilal" — for the resume banner. */
  label: string;
}

interface Persisted extends SlotMeta {
  v: 1;
  matchId: string;
  seq: number;
  sentSeq: number;
  summary: Summary;
  rules: LiveRules;
  timeline: Timeline;
  finish: Omit<FinishArgs, 'matchId'> | null;
  savedAt: number;
}

interface Slot extends Persisted {
  pumping: boolean;
  failures: number;
  lastSentAt: number | null;
  lastFailureAt: number | null;
  taken: boolean;
  ended: boolean;
  finished: boolean;
  fatal: string | null;
  finishError: string | null;
  wake: (() => void) | null;
}

const KEY = 'live_outbox:';
const DEFAULT_BACKOFF = [1000, 2000, 4000, 8000, 10000];
const MAX_PAST_PERSISTED = 300;
const MAX_FUTURE_PERSISTED = 50;

/** Errors that will never succeed by retrying. */
const FATAL = /(NOT_ALLOWED|NOT_FOUND|INVALID_STATUS|FIELD_INVALID|STAGE_LOCKED)/;
const FINISH_REJECTED = /(TIE_NEEDS_WINNER|DOWNSTREAM_PLAYED|STAGE_LOCKED|FIELD_INVALID|INVALID_STATUS|NOT_ALLOWED)/;

const msgOf = (e: unknown): string => (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e));

export function createOutbox(deps: OutboxDeps) {
  const now = deps.now ?? (() => Date.now());
  const backoff = deps.backoffMs ?? DEFAULT_BACKOFF;
  const minGap = deps.minGapMs ?? 150;
  const dropRetry = deps.dropRetryMs ?? 250;
  const slots = new Map<string, Slot>();
  const listeners = new Map<string, Set<() => void>>();
  const anyListeners = new Set<() => void>();
  const statusCache = new Map<string, OutboxStatus>();

  const emit = (matchId: string) => {
    statusCache.delete(matchId);
    listeners.get(matchId)?.forEach((l) => l());
    anyListeners.forEach((l) => l());
  };

  function persistedOf(s: Slot): Persisted {
    const tl = s.timeline;
    return {
      v: 1,
      matchId: s.matchId,
      tournamentId: s.tournamentId,
      moduleId: s.moduleId,
      label: s.label,
      seq: s.seq,
      sentSeq: s.sentSeq,
      summary: s.summary,
      rules: s.rules,
      timeline: { ...tl, past: tl.past.slice(-MAX_PAST_PERSISTED), future: tl.future.slice(0, MAX_FUTURE_PERSISTED) },
      finish: s.finish,
      savedAt: now(),
    };
  }

  /** Fire-and-forget: a slow disk must never slow a tap. */
  function persist(s: Slot) {
    try {
      void deps.storage.set(KEY + s.matchId, JSON.stringify(persistedOf(s))).catch(() => {});
    } catch {
      // best effort
    }
  }

  function statusOf(s: Slot): OutboxStatus {
    const pending = Math.max(0, s.seq - s.sentSeq);
    let phase: SyncPhase;
    let message: string | null = null;
    if (s.finished) {
      phase = 'ended';
    } else if (s.taken) {
      phase = 'taken';
      message = 'Another admin took over scoring.';
    } else if (s.ended) {
      phase = 'ended';
      message = 'This match was ended elsewhere.';
    } else if (s.fatal) {
      phase = 'error';
      message = s.fatal;
    } else if (pending > 0 || s.finish) {
      phase = s.failures > 0 ? 'offline' : 'syncing';
      if (phase === 'offline') message = 'Offline — saved on this phone.';
    } else {
      phase = 'synced';
    }
    return {
      matchId: s.matchId,
      phase,
      pending,
      lastSentAt: s.lastSentAt,
      finishQueued: !!s.finish,
      finishError: s.finishError,
      finished: s.finished,
      message,
    };
  }

  function sleep(s: Slot, ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        s.wake = null;
        resolve();
      }, ms);
      s.wake = () => {
        clearTimeout(t);
        s.wake = null;
        resolve();
      };
    });
  }

  async function removePersisted(matchId: string) {
    try {
      await deps.storage.remove(KEY + matchId);
    } catch {
      // ignore
    }
  }

  async function pump(s: Slot): Promise<void> {
    if (s.pumping) return;
    s.pumping = true;
    try {
      for (;;) {
        if (s.taken || s.ended || s.finished || s.fatal) return;

        if (s.finish) {
          const f = s.finish;
          try {
            await deps.finish({ ...f, matchId: s.matchId });
            s.finish = null;
            s.finished = true;
            s.failures = 0;
            s.finishError = null;
            s.lastSentAt = now();
            await removePersisted(s.matchId);
            emit(s.matchId);
            return;
          } catch (e) {
            const m = msgOf(e);
            if (m.includes('LIVE_TAKEN')) {
              s.taken = true;
              emit(s.matchId);
              return;
            }
            if (FINISH_REJECTED.test(m)) {
              // The server refused the result (tie in a knockout, …). Keep the slot; the screen shows the reason.
              s.finish = null;
              s.finishError = m;
              persist(s);
              emit(s.matchId);
              return;
            }
            s.failures++;
            s.lastFailureAt = now();
            emit(s.matchId);
            await sleep(s, backoff[Math.min(s.failures - 1, backoff.length - 1)]);
            continue;
          }
        }

        if (s.seq <= s.sentSeq) return;

        const seq = s.seq;
        const snapshot = s.timeline.present;
        const summary = s.summary;
        try {
          const r = await deps.push({ matchId: s.matchId, seq, snapshot, summary });
          s.failures = 0;
          s.lastSentAt = now();
          if (r.state === 'finished' || r.state === 'abandoned') {
            s.ended = true;
            emit(s.matchId);
            return;
          }
          if (r.seq > seq) {
            // The server is ahead of this phone: somebody else scored in between. Stop instead of overwriting.
            s.taken = true;
            emit(s.matchId);
            return;
          }
          if (r.seq < seq) {
            // The server dropped the write (rate limit). Resend the latest shortly.
            emit(s.matchId);
            await sleep(s, dropRetry);
            continue;
          }
          s.sentSeq = Math.max(s.sentSeq, seq);
          persist(s);
          emit(s.matchId);
          if (s.seq > s.sentSeq) await sleep(s, minGap);
        } catch (e) {
          const m = msgOf(e);
          if (m.includes('LIVE_TAKEN')) {
            s.taken = true;
            emit(s.matchId);
            return;
          }
          if (FATAL.test(m)) {
            s.fatal = 'Live scoring stopped: ' + m;
            emit(s.matchId);
            return;
          }
          s.failures++;
          s.lastFailureAt = now();
          emit(s.matchId);
          await sleep(s, backoff[Math.min(s.failures - 1, backoff.length - 1)]);
        }
      }
    } finally {
      s.pumping = false;
      emit(s.matchId);
    }
  }

  function wake(s: Slot) {
    if (s.wake) {
      s.wake();
      return;
    }
    void pump(s);
  }

  function adopt(p: Persisted): Slot {
    const s: Slot = {
      ...p,
      pumping: false,
      failures: 0,
      lastSentAt: null,
      lastFailureAt: null,
      taken: false,
      ended: false,
      finished: false,
      fatal: null,
      finishError: null,
      wake: null,
    };
    slots.set(p.matchId, s);
    return s;
  }

  return {
    /**
     * Take (or resume) the slot for a match. `server` is the row returned by live_start_match. If this phone holds
     * newer unsent work than the server (app was killed mid-match) the local state wins.
     */
    async open(init: {
      matchId: string;
      meta: SlotMeta;
      rules: LiveRules;
      server: { seq: number; snapshot: LiveSnapshot; summary: Summary };
      /** Builds a fresh timeline from a snapshot (newTimeline). */
      freshTimeline: (snap: LiveSnapshot) => Timeline;
    }): Promise<{ timeline: Timeline; summary: Summary; seq: number; resumedLocal: boolean }> {
      const existing = slots.get(init.matchId);
      if (existing && existing.seq >= init.server.seq) {
        return { timeline: existing.timeline, summary: existing.summary, seq: existing.seq, resumedLocal: true };
      }
      let persisted: Persisted | null = null;
      try {
        const raw = await deps.storage.get(KEY + init.matchId);
        persisted = raw ? (JSON.parse(raw) as Persisted) : null;
      } catch {
        persisted = null;
      }
      if (persisted && persisted.v === 1 && persisted.seq >= init.server.seq) {
        const s = adopt(persisted);
        if (s.seq > s.sentSeq || s.finish) wake(s);
        return { timeline: s.timeline, summary: s.summary, seq: s.seq, resumedLocal: true };
      }
      const timeline = init.freshTimeline(init.server.snapshot);
      const s = adopt({
        v: 1,
        matchId: init.matchId,
        ...init.meta,
        seq: init.server.seq,
        sentSeq: init.server.seq,
        summary: init.server.summary,
        rules: init.rules,
        timeline,
        finish: null,
        savedAt: now(),
      });
      persist(s);
      emit(init.matchId);
      return { timeline: s.timeline, summary: s.summary, seq: s.seq, resumedLocal: false };
    },

    /** Record a new state. Synchronous and cheap: the screen never waits for the network. */
    submit(matchId: string, timeline: Timeline, summary: Summary): void {
      const s = slots.get(matchId);
      if (!s || s.finished) return;
      s.seq += 1;
      s.timeline = timeline;
      s.summary = summary;
      s.finishError = null;
      persist(s);
      emit(matchId);
      wake(s);
    },

    /** Queue the final result; uploaded in the background like any other change. */
    queueFinish(
      matchId: string,
      timeline: Timeline,
      summary: Summary,
      result: Pick<FinishArgs, 'scoreA' | 'scoreB' | 'scoreDetail' | 'winnerEntryId' | 'note'>,
    ): void {
      const s = slots.get(matchId);
      if (!s || s.finished) return;
      s.seq += 1;
      s.timeline = timeline;
      s.summary = summary;
      s.finishError = null;
      s.finish = { seq: s.seq, snapshot: timeline.present, summary, ...result };
      persist(s);
      emit(matchId);
      wake(s);
    },

    status(matchId: string): OutboxStatus | null {
      const cached = statusCache.get(matchId);
      if (cached) return cached;
      const s = slots.get(matchId);
      if (!s) return null;
      const st = statusOf(s);
      statusCache.set(matchId, st);
      return st;
    },

    subscribe(matchId: string, l: () => void): () => void {
      let set = listeners.get(matchId);
      if (!set) listeners.set(matchId, (set = new Set()));
      set.add(l);
      return () => set.delete(l);
    },

    subscribeAny(l: () => void): () => void {
      anyListeners.add(l);
      return () => anyListeners.delete(l);
    },

    /** Retry now (app foregrounded, network came back, user tapped the sync pill). */
    wake(matchId?: string): void {
      if (matchId) {
        const s = slots.get(matchId);
        if (s) wake(s);
        return;
      }
      slots.forEach(wake);
    },

    /** Drop a slot (finished, abandoned or discarded by the referee). */
    async discard(matchId: string): Promise<void> {
      const s = slots.get(matchId);
      if (s) {
        s.ended = true;
        s.wake?.();
      }
      slots.delete(matchId);
      await removePersisted(matchId);
      emit(matchId);
    },

    /** Unfinished matches stored on this phone (for the resume banner / app start). */
    async listPersisted(): Promise<(SlotMeta & { matchId: string; pending: number; hasFinish: boolean; savedAt: number })[]> {
      const out: (SlotMeta & { matchId: string; pending: number; hasFinish: boolean; savedAt: number })[] = [];
      try {
        for (const k of await deps.storage.keys(KEY)) {
          const raw = await deps.storage.get(k);
          if (!raw) continue;
          const p = JSON.parse(raw) as Persisted;
          if (p.v !== 1) continue;
          out.push({
            matchId: p.matchId,
            tournamentId: p.tournamentId,
            moduleId: p.moduleId,
            label: p.label,
            pending: Math.max(0, p.seq - p.sentSeq),
            hasFinish: !!p.finish,
            savedAt: p.savedAt,
          });
        }
      } catch {
        // ignore
      }
      return out;
    },

    /** App start: load every stored slot and keep uploading whatever was left unsent. */
    async resumeAll(): Promise<number> {
      let n = 0;
      try {
        for (const k of await deps.storage.keys(KEY)) {
          const matchId = k.slice(KEY.length);
          if (slots.has(matchId)) continue;
          const raw = await deps.storage.get(k);
          if (!raw) continue;
          const p = JSON.parse(raw) as Persisted;
          if (p.v !== 1) continue;
          const s = adopt(p);
          n++;
          if (s.seq > s.sentSeq || s.finish) wake(s);
        }
      } catch {
        // ignore
      }
      return n;
    },

    /** Current in-memory view (used by the screen after open()). */
    timelineOf(matchId: string): Timeline | null {
      return slots.get(matchId)?.timeline ?? null;
    },
  };
}

export type Outbox = ReturnType<typeof createOutbox>;
