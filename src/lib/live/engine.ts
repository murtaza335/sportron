import { initCricket, reduceCricket } from './families/cricket';
import { initSets, reduceSets } from './families/sets';
import { initSimple, reduceSimple } from './families/simple';
import { initTennis, reduceTennis } from './families/tennis';
import { initTimed, reduceTimed } from './families/timed';
import type {
  CricketAction,
  LiveAction,
  LiveRules,
  LiveSnapshot,
  SetsAction,
  SimpleAction,
  Side,
  TennisAction,
  TimedAction,
} from './types';

export interface InitOptions {
  /** Who serves first (sets, tennis). */
  firstServer?: Side;
  /** Who bats first (cricket). */
  firstBat?: Side;
  /** Local epoch ms (clock reference). */
  at?: number;
}

export function initSnapshot(rules: LiveRules, opts: InitOptions = {}): LiveSnapshot {
  switch (rules.family) {
    case 'sets':
      return initSets(rules, { firstServer: opts.firstServer });
    case 'tennis':
      return initTennis(rules, { firstServer: opts.firstServer });
    case 'timed':
      return initTimed(rules, opts.at);
    case 'cricket':
      return initCricket(rules, opts.firstBat);
    case 'simple':
      return initSimple(rules, opts.at);
  }
}

/** Pure reducer: returns the same object when the action changes nothing. Actions of another family are ignored. */
export function reduce(snap: LiveSnapshot, action: LiveAction, rules: LiveRules): LiveSnapshot {
  if (snap.family === 'sets' && rules.family === 'sets') return reduceSets(snap, action as SetsAction, rules);
  if (snap.family === 'tennis' && rules.family === 'tennis') return reduceTennis(snap, action as TennisAction, rules);
  if (snap.family === 'timed' && rules.family === 'timed') return reduceTimed(snap, action as TimedAction, rules);
  if (snap.family === 'cricket' && rules.family === 'cricket') return reduceCricket(snap, action as CricketAction, rules);
  if (snap.family === 'simple' && rules.family === 'simple') return reduceSimple(snap, action as SimpleAction, rules);
  return snap;
}

/** The engine thinks the match is won (the referee still taps Finish). */
export const isDecided = (snap: LiveSnapshot): boolean => snap.state === 'decided';
