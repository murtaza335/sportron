import { clockSet, clockStart, clockStop, clockSync, newClock } from '../clock';
import type { SimpleAction, SimpleRules, SimpleSnapshot } from '../types';

export function initSimple(_rules: SimpleRules, at = 0): SimpleSnapshot {
  return { family: 'simple', state: 'live', scores: { a: 0, b: 0 }, clock: newClock(at), winner: null };
}

export function reduceSimple(s: SimpleSnapshot, action: SimpleAction, rules: SimpleRules): SimpleSnapshot {
  switch (action.t) {
    case 'clockStart':
      return s.state === 'decided' ? s : { ...s, clock: clockStart(s.clock, action.at) };
    case 'clockStop':
      return { ...s, clock: clockStop(s.clock, action.at) };
    case 'clockSync':
      return { ...s, clock: clockSync(s.clock, action.at) };
    case 'clockSet':
      return { ...s, clock: clockSet(action.ms, action.at, s.clock.running) };
    case 'score': {
      if (s.state === 'decided') return s;
      const next = Math.max(0, s.scores[action.side] + action.value);
      if (next === s.scores[action.side]) return s;
      const scores = { ...s.scores, [action.side]: next };
      const hit = rules.target != null && action.value > 0 && next >= rules.target;
      return hit
        ? { ...s, scores, state: 'decided', winner: action.side, clock: clockStop(s.clock, action.at ?? s.clock.ref) }
        : { ...s, scores };
    }
  }
}
