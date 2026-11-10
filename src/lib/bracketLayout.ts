/**
 * Pure layout math for the knockout bracket (PLAN §9.4). No React.
 * Main-bracket matches are laid out in columns (one per round); the optional
 * 3rd-place match is placed under the final.
 */

export const NODE_W = 196;
export const NODE_H = 76;
export const COL_GAP = 40;
export const ROW_GAP = 16;
/** Vertical room above the nodes for column headers. */
export const HEADER_H = 28;
/** Vertical gap between the final and the 3rd-place node. */
const THIRD_GAP = 40;

export type LayoutMatch = {
  id: string;
  round_number: number;
  match_number: number;
  is_third_place: boolean;
  next_match_id: string | null;
};

export type LayoutNode = { matchId: string; x: number; y: number; round: number; isThird: boolean };
export type LayoutConnector = {
  /** SVG path */
  d: string;
  fromMatchId: string;
  toMatchId: string;
};
export type LayoutColumn = { round: number; x: number };
export type BracketLayout = {
  nodes: LayoutNode[];
  connectors: LayoutConnector[];
  columns: LayoutColumn[];
  width: number;
  height: number;
};

/**
 * Generalised tree layout (PLAN-v2 §8.3) for ONE section of a bracket (a single-elimination tree,
 * the winners bracket, the losers bracket, the grand final …). Columns are the rounds present, in order.
 *  - first column: stacked by match number
 *  - later columns: midpoint of the in-section feeders; a single feeder → that feeder's y;
 *    no feeder (e.g. the other source of a losers-bracket match lives in the winners bracket, or a dead
 *    match was removed) → stacked by match number at the previous column's pitch
 *  - overlapping nodes in a column are pushed down, so nothing ever overlaps
 * The optional 3rd-place match is placed under the final.
 */
export function layoutTree(matches: LayoutMatch[]): BracketLayout {
  const main = matches.filter((m) => !m.is_third_place);
  const third = matches.find((m) => m.is_third_place) ?? null;
  if (main.length === 0) {
    return { nodes: [], connectors: [], columns: [], width: 0, height: 0 };
  }

  const roundNumbers = [...new Set(main.map((m) => m.round_number))].sort((a, b) => a - b);
  const byRound = new Map<number, LayoutMatch[]>();
  for (const m of main) {
    const list = byRound.get(m.round_number) ?? [];
    list.push(m);
    byRound.set(m.round_number, list);
  }
  for (const list of byRound.values()) list.sort((a, b) => a.match_number - b.match_number);

  const colIndex = new Map(roundNumbers.map((r, i) => [r, i]));
  const x = (r: number) => (colIndex.get(r) ?? 0) * (NODE_W + COL_GAP);
  const yById = new Map<string, number>();
  const STEP = NODE_H + ROW_GAP;

  const first = byRound.get(roundNumbers[0]) ?? [];
  first.forEach((m, i) => yById.set(m.id, HEADER_H + i * STEP));

  let prevPitch = STEP;
  for (let ci = 1; ci < roundNumbers.length; ci++) {
    const r = roundNumbers[ci];
    const list = byRound.get(r) ?? [];
    const prevList = byRound.get(roundNumbers[ci - 1]) ?? [];
    for (const m of list) {
      // feeders from ANY earlier column of this section
      const feeders = main.filter((f) => f.next_match_id === m.id);
      const centres = feeders
        .map((f) => yById.get(f.id))
        .filter((v): v is number => v !== undefined)
        .map((fy) => fy + NODE_H / 2);
      if (centres.length > 0) {
        const mid = centres.reduce((a, b) => a + b, 0) / centres.length;
        yById.set(m.id, mid - NODE_H / 2);
      } else {
        yById.set(m.id, HEADER_H + (m.match_number - 1) * prevPitch);
      }
    }
    // never overlap inside a column
    let lastBottom = -Infinity;
    for (const m of list) {
      const y = Math.max(yById.get(m.id) ?? HEADER_H, lastBottom + ROW_GAP);
      yById.set(m.id, y);
      lastBottom = y + NODE_H;
    }
    // pitch used by orphans of the next column
    const ys = prevList.map((p) => yById.get(p.id) ?? 0).sort((a, b) => a - b);
    prevPitch = ys.length >= 2 ? Math.max((ys[ys.length - 1] - ys[0]) / (ys.length - 1), STEP) : STEP;
  }

  const nodes: LayoutNode[] = main.map((m) => ({
    matchId: m.id,
    x: x(m.round_number),
    y: yById.get(m.id) ?? HEADER_H,
    round: m.round_number,
    isThird: false,
  }));

  const nodeById = new Map(nodes.map((n) => [n.matchId, n]));
  const connectors: LayoutConnector[] = [];
  for (const m of main) {
    if (!m.next_match_id) continue;
    const from = nodeById.get(m.id);
    const to = nodeById.get(m.next_match_id);
    if (!from || !to) continue;
    const x1 = from.x + NODE_W;
    const y1 = from.y + NODE_H / 2;
    const x2 = to.x;
    const y2 = to.y + NODE_H / 2;
    const mx = x1 + COL_GAP / 2;
    connectors.push({
      d: `M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`,
      fromMatchId: m.id,
      toMatchId: m.next_match_id,
    });
  }

  const lastRound = roundNumbers[roundNumbers.length - 1];
  let height = Math.max(...nodes.map((n) => n.y + NODE_H));
  if (third) {
    const finalNode = nodes.find((n) => n.round === lastRound);
    const ty = (finalNode ? finalNode.y + NODE_H : height) + THIRD_GAP;
    nodes.push({ matchId: third.id, x: x(lastRound), y: ty, round: lastRound, isThird: true });
    height = Math.max(height, ty + NODE_H);
  }

  const columns: LayoutColumn[] = roundNumbers.map((r) => ({ round: r, x: x(r) }));

  return {
    nodes,
    connectors,
    columns,
    width: x(lastRound) + NODE_W,
    height,
  };
}

/** v1 entry point: a single-elimination tree. Same output as before the generalisation. */
export function layoutBracket(matches: LayoutMatch[]): BracketLayout {
  return layoutTree(matches);
}

/** Match ids on the path of an entry: every match that contains it (used for highlighting). */
export function entryPathMatchIds(
  matches: { id: string; entry_a_id?: string | null; entry_b_id?: string | null }[],
  entryId: string,
): Set<string> {
  const ids = new Set<string>();
  for (const m of matches) {
    if (m.entry_a_id === entryId || m.entry_b_id === entryId) ids.add(m.id);
  }
  return ids;
}

/** Dev self-check for bracket sizes 2/4/8/16 (run with `devSelfCheck()` from a dev console). */
export function devSelfCheck(): string[] {
  const out: string[] = [];
  for (const size of [2, 4, 8, 16]) {
    const rounds = Math.log2(size);
    const ms: LayoutMatch[] = [];
    const idOf = (r: number, m: number) => `r${r}m${m}`;
    for (let r = 1; r <= rounds; r++) {
      for (let m = 1; m <= size / 2 ** r; m++) {
        ms.push({
          id: idOf(r, m),
          round_number: r,
          match_number: m,
          is_third_place: false,
          next_match_id: r < rounds ? idOf(r + 1, Math.ceil(m / 2)) : null,
        });
      }
    }
    const l = layoutBracket(ms);
    const final = l.nodes.find((n) => n.round === rounds)!;
    out.push(
      `size ${size}: nodes=${l.nodes.length} connectors=${l.connectors.length} ` +
        `w=${l.width} h=${l.height} finalY=${final.y}`,
    );
    if (l.nodes.length !== size - 1) out.push(`  !! expected ${size - 1} nodes`);
    if (l.connectors.length !== Math.max(size - 2, 0)) {
      // each non-final match has one connector: size - 2
      out.push(`  !! expected ${size - 2} connectors`);
    }
  }
  // losers-bracket samples (PLAN-v2 §8.3): S=8 → 6 matches, S=16 → 14 matches, nothing overlaps
  for (const size of [8, 16]) {
    const k = Math.log2(size);
    const rounds = 2 * (k - 1);
    const ms: LayoutMatch[] = [];
    const idOf = (r: number, m: number) => `l${r}m${m}`;
    const countOf = (r: number) => size >> (Math.ceil(r / 2) + 1);
    for (let r = 1; r <= rounds; r++) {
      for (let m = 1; m <= countOf(r); m++) {
        const next =
          r === rounds ? null : r % 2 === 1 ? idOf(r + 1, m) : idOf(r + 1, Math.ceil(m / 2));
        ms.push({ id: idOf(r, m), round_number: r, match_number: m, is_third_place: false, next_match_id: next });
      }
    }
    const l = layoutTree(ms);
    out.push(`LB size ${size}: nodes=${l.nodes.length} connectors=${l.connectors.length} w=${l.width} h=${l.height}`);
    if (l.nodes.length !== size - 2) out.push(`  !! expected ${size - 2} nodes`);
    for (const col of l.columns) {
      const ys = l.nodes.filter((n) => n.x === col.x).map((n) => n.y).sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) {
        if (ys[i] < ys[i - 1] + NODE_H) out.push(`  !! overlapping nodes in LB round ${col.round}`);
      }
    }
  }
  return out;
}
