/**
 * Projector tile layout (docs/live-match/PLAN.md §9.3). Pure: used by the projector site and by the organiser's
 * preview in the app, so what they see in the app is what the hall shows.
 */
export type LayoutMode = 'auto' | 'row' | 'grid';

export interface Grid {
  cols: number;
  rows: number;
}

/** Grid for `n` tiles on one page. `aspect` = screen width / height. */
export function gridFor(n: number, mode: LayoutMode, aspect: number): Grid {
  const count = Math.max(1, n);
  if (aspect < 1) {
    // portrait: stack
    const cols = count <= 3 ? 1 : 2;
    return { cols, rows: Math.ceil(count / cols) };
  }
  if (mode === 'row') {
    const cols = Math.min(count, 4);
    return { cols, rows: Math.ceil(count / cols) };
  }
  if (count === 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count === 3) return mode === 'grid' ? { cols: 2, rows: 2 } : { cols: 3, rows: 1 };
  if (count === 4) return mode === 'auto' && aspect >= 1.9 ? { cols: 4, rows: 1 } : { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  return { cols: 4, rows: Math.ceil(count / 4) };
}

export interface Pages<T> {
  pages: T[][];
  perPage: number;
}

/** Split tiles into rotating pages of at most `maxPerPage` (1–8). Keeps the order, so pinned courts keep their page. */
export function paginate<T>(items: T[], maxPerPage: number): Pages<T> {
  const perPage = Math.max(1, Math.min(8, Math.round(maxPerPage) || 6));
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage));
  return { pages: pages.length ? pages : [[]], perPage };
}

export interface CourtTile<M> {
  /** Stable key: the court (case-insensitive) or `match:<id>` for matches without a court. */
  key: string;
  court: string | null;
  pinned: boolean;
  matches: M[];
}

/**
 * Tiles in screen order: pinned courts first (their order), then other courts (natural sort), then court-less matches
 * by start time. A pinned court always has a tile even when idle.
 */
export function buildTiles<M extends { match_id: string; court?: string | null; started_at?: string }>(
  live: M[],
  pinned: string[],
  courtKeyFn: (c: string | null | undefined) => string,
  compare: (a: string, b: string) => number,
): CourtTile<M>[] {
  const byKey = new Map<string, M[]>();
  const names = new Map<string, string>();
  const loose: M[] = [];
  for (const m of live) {
    const k = courtKeyFn(m.court);
    if (!k) {
      loose.push(m);
      continue;
    }
    byKey.set(k, [...(byKey.get(k) ?? []), m]);
    if (!names.has(k)) names.set(k, (m.court ?? '').trim());
  }
  const tiles: CourtTile<M>[] = [];
  const used = new Set<string>();
  for (const p of pinned) {
    const k = courtKeyFn(p);
    if (!k || used.has(k)) continue;
    used.add(k);
    tiles.push({ key: k, court: p.trim(), pinned: true, matches: newestFirst(byKey.get(k) ?? []) });
  }
  const rest = [...byKey.keys()].filter((k) => !used.has(k)).sort((a, b) => compare(names.get(a) ?? a, names.get(b) ?? b));
  for (const k of rest) tiles.push({ key: k, court: names.get(k) ?? k, pinned: false, matches: newestFirst(byKey.get(k) ?? []) });
  loose
    .slice()
    .sort((a, b) => (a.started_at ?? '').localeCompare(b.started_at ?? ''))
    .forEach((m) => tiles.push({ key: `match:${m.match_id}`, court: null, pinned: false, matches: [m] }));
  return tiles;
}

function newestFirst<M extends { started_at?: string }>(list: M[]): M[] {
  return list.slice().sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''));
}
