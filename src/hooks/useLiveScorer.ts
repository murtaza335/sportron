import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  applyAction,
  canRedo,
  canUndo,
  redo as redoTimeline,
  redoLabel,
  summarize,
  undo as undoTimeline,
  undoLabel,
  type LiveAction,
  type LiveRules,
  type LiveSnapshot,
  type Names,
  type Summary,
  type Timeline,
} from '@/lib/live';
import { liveOutbox } from '@/lib/liveOutbox';

/** While a clock runs, viewers get a fresh baseline this often (never a message per second). */
const CLOCK_RESYNC_MS = 30_000;

export interface LiveScorer {
  timeline: Timeline;
  snap: LiveSnapshot;
  summary: Summary;
  act: (action: LiveAction) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  /** What the last scoring action was ("+1 Ali") — shown in the bottom bar. */
  lastLabel: string | null;
}

/**
 * Local-first scorer: every action updates React state in the same frame, then hands the new state to the outbox
 * (synchronous and cheap — the upload happens in the background). Nothing here awaits the network.
 */
export function useLiveScorer(matchId: string, rules: LiveRules, names: Names, initial: Timeline): LiveScorer {
  const [timeline, setTimeline] = useState(initial);
  const ref = useRef(initial);
  const namesRef = useRef(names);
  useEffect(() => {
    namesRef.current = names;
  }, [names]);

  const commit = useCallback(
    (next: Timeline) => {
      if (next === ref.current) return;
      ref.current = next;
      setTimeline(next);
      const sum = summarize(next.present, rules, { names: namesRef.current, at: Date.now() });
      liveOutbox.submit(matchId, next, sum);
    },
    [matchId, rules],
  );

  const act = useCallback((action: LiveAction) => commit(applyAction(ref.current, action, rules, namesRef.current)), [commit, rules]);
  const undo = useCallback(() => commit(undoTimeline(ref.current, Date.now())), [commit]);
  const redo = useCallback(() => commit(redoTimeline(ref.current, Date.now())), [commit]);

  const snap = timeline.present;
  const running = (snap.family === 'timed' || snap.family === 'simple') && snap.clock.running;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => commit(applyAction(ref.current, { t: 'clockSync', at: Date.now() }, rules)), CLOCK_RESYNC_MS);
    return () => clearInterval(id);
  }, [running, commit, rules]);

  // Display only: the clock part of the summary is drawn by ClockCard from the snapshot itself.
  const summary = useMemo(() => summarize(snap, rules, { names }), [snap, rules, names]);

  return {
    timeline,
    snap,
    summary,
    act,
    undo,
    redo,
    canUndo: canUndo(timeline),
    canRedo: canRedo(timeline),
    undoLabel: undoLabel(timeline),
    redoLabel: redoLabel(timeline),
    lastLabel: timeline.lastLabel,
  };
}
