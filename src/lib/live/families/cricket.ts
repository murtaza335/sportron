import { formatOvers } from '../format';
import { other, type CricketAction, type CricketRules, type CricketSnapshot, type Innings, type Side } from '../types';

const newInnings = (batting: Side): Innings => ({
  batting,
  runs: 0,
  wickets: 0,
  balls: 0,
  extras: { wd: 0, nb: 0, b: 0, lb: 0, pen: 0 },
  thisOver: [],
  overDone: false,
  ended: false,
});

export function initCricket(_rules: CricketRules, firstBat: Side = 'a'): CricketSnapshot {
  return {
    family: 'cricket',
    state: 'live',
    innings: [newInnings(firstBat)],
    current: 0,
    firstBat,
    target: null,
    winner: null,
    resultText: null,
    tied: false,
  };
}

export const maxBalls = (rules: CricketRules): number => rules.overs * rules.ballsPerOver;

/** Runs still needed in the chase, or null outside a chase. */
export function runsNeeded(s: CricketSnapshot): number | null {
  if (s.current !== 1 || s.target == null) return null;
  return Math.max(0, s.target - s.innings[1].runs);
}

export function ballsLeft(s: CricketSnapshot, rules: CricketRules): number {
  return Math.max(0, maxBalls(rules) - s.innings[s.current].balls);
}

function inningsOver(i: Innings, rules: CricketRules, target: number | null): boolean {
  return i.balls >= maxBalls(rules) || i.wickets >= rules.wickets || (target != null && i.runs >= target);
}

function setInnings(s: CricketSnapshot, i: Innings): CricketSnapshot {
  const innings = s.innings.map((x, idx) => (idx === s.current ? i : x));
  return { ...s, innings };
}

/** After every ball: end the innings (and the match) when the rules say so. */
function settle(s: CricketSnapshot, rules: CricketRules): CricketSnapshot {
  const i = s.innings[s.current];
  if (i.ended || !inningsOver(i, rules, s.current === 1 ? s.target : null)) return s;
  const ended = setInnings(s, { ...i, ended: true });
  if (s.current === 0) {
    return { ...ended, state: 'break', target: i.runs + 1 };
  }
  return finishMatch(ended, rules);
}

function finishMatch(s: CricketSnapshot, rules: CricketRules): CricketSnapshot {
  const first = s.innings[0];
  const second = s.innings[1];
  if (!second) return s;
  if (second.runs > first.runs) {
    const wk = Math.max(0, rules.wickets - second.wickets);
    return { ...s, state: 'decided', winner: second.batting, tied: false, resultText: `won by ${wk} wicket${wk === 1 ? '' : 's'}` };
  }
  if (second.runs < first.runs) {
    const by = first.runs - second.runs;
    return { ...s, state: 'decided', winner: first.batting, tied: false, resultText: `won by ${by} run${by === 1 ? '' : 's'}` };
  }
  return { ...s, state: 'decided', winner: null, tied: true, resultText: 'Match tied' };
}

export function reduceCricket(s: CricketSnapshot, action: CricketAction, rules: CricketRules): CricketSnapshot {
  if (action.t === 'nextInnings') {
    if (s.state !== 'break' || s.current !== 0) return s;
    return { ...s, state: 'live', current: 1, innings: [...s.innings, newInnings(other(s.innings[0].batting))] };
  }
  if (s.state !== 'live') return s;
  const i = s.innings[s.current];
  if (i.ended) return s;

  switch (action.t) {
    case 'endInnings': {
      const ended = setInnings(s, { ...i, ended: true });
      return s.current === 0 ? { ...ended, state: 'break', target: i.runs + 1 } : finishMatch(ended, rules);
    }

    case 'penalty':
      return settle(setInnings(s, { ...i, runs: i.runs + action.runs, extras: { ...i.extras, pen: i.extras.pen + action.runs } }), rules);

    case 'ball':
    case 'wicket': {
      const runs = Math.max(0, action.runs);
      const kind = action.t === 'ball' ? action.kind : 'normal';
      let add = 0;
      let legal = true;
      let token: string;
      const extras = { ...i.extras };
      if (action.t === 'wicket') {
        add = runs;
        token = runs > 0 ? `${runs}W` : 'W';
      } else if (kind === 'wide') {
        add = rules.wideRuns + runs;
        extras.wd += add;
        legal = false;
        token = add > 1 ? `${add}Wd` : 'Wd';
      } else if (kind === 'noball') {
        add = rules.noBallRuns + runs;
        extras.nb += rules.noBallRuns;
        legal = false;
        token = runs > 0 ? `${runs}Nb` : 'Nb';
      } else if (kind === 'bye') {
        add = runs;
        extras.b += runs;
        token = `${runs}B`;
      } else if (kind === 'legbye') {
        add = runs;
        extras.lb += runs;
        token = `${runs}Lb`;
      } else {
        add = runs;
        token = String(runs);
      }
      // The first delivery after a completed over (legal or not) starts a fresh over strip.
      const thisOver = [...(i.overDone ? [] : i.thisOver), token];
      const balls = i.balls + (legal ? 1 : 0);
      const next: Innings = {
        ...i,
        runs: i.runs + add,
        wickets: i.wickets + (action.t === 'wicket' ? 1 : 0),
        balls,
        extras,
        thisOver,
        overDone: legal ? balls % rules.ballsPerOver === 0 : false,
      };
      return settle(setInnings(s, next), rules);
    }
  }
}

/** "145/6" for an innings. */
export const inningsScore = (i: Innings): string => `${i.runs}/${i.wickets}`;

export const inningsOvers = (i: Innings, rules: CricketRules): string => formatOvers(i.balls, rules.ballsPerOver);

/** Runs of each side across the match (a side bats once). */
export function sideRuns(s: CricketSnapshot): { a: number; b: number } {
  const out = { a: 0, b: 0 };
  for (const i of s.innings) out[i.batting] += i.runs;
  return out;
}
