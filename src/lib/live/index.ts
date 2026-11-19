// Live scoring engine — pure TypeScript (see docs/live-match/PLAN.md §5). Safe to import from the app and from live/.
export * from './types';
export * from './clock';
export * from './format';
export * from './presets';
export * from './engine';
export * from './timeline';
export { summarize, type SummaryOptions } from './summary';
export { toResult, type ResultOptions } from './result';
export { isGamePoint, isMatchPoint, setsNotices, setsNeeded, gameTarget } from './families/sets';
export { tennisSetsNeeded } from './families/tennis';
export { periodName, periodLimitMs, shootoutNext, shootoutWinner, shootoutScore, inBonus, timedElapsed } from './families/timed';
export { runsNeeded, ballsLeft, maxBalls, inningsScore, inningsOvers, sideRuns } from './families/cricket';
