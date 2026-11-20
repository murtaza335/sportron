import type { Side } from './types';

const POINTS = ['0', '15', '30', '40'];

/** Tennis game score label for one side (0/15/30/40/AD), given both raw point counts. */
export function tennisPoint(mine: number, theirs: number, golden: boolean): string {
  if (mine >= 3 && theirs >= 3) {
    if (golden) return mine === theirs ? '40' : mine > theirs ? 'GP' : '40';
    if (mine === theirs) return '40';
    return mine > theirs ? 'AD' : '40';
  }
  return POINTS[Math.min(mine, 3)] ?? '40';
}

export const tennisIsDeuce = (a: number, b: number): boolean => a >= 3 && b >= 3 && a === b;

/** Cricket overs: 110 balls at 6 per over → "18.2". */
export function formatOvers(balls: number, ballsPerOver: number): string {
  return `${Math.floor(balls / ballsPerOver)}.${balls % ballsPerOver}`;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export const sideName = (s: Side, names?: { a: string; b: string }): string => (names ? names[s] : s.toUpperCase());

/** "4–2–1" pickleball call. */
export const sideOutCall = (serving: number, receiving: number, serverNumber: 1 | 2): string =>
  `${serving}–${receiving}–${serverNumber}`;
