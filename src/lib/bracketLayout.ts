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

export function layoutBracket(matches: LayoutMatch[]): BracketLayout {
  const main = matches.filter((m) => !m.is_third_place);
  const third = matches.find((m) => m.is_third_place) ?? null;
  if (main.length === 0) {
    return { nodes: [], connectors: [], columns: [], width: 0, height: 0 };
  }

  const rounds = Math.max(...main.map((m) => m.round_number));
  const byRound = new Map<number, LayoutMatch[]>();
  for (const m of main) {
    const list = byRound.get(m.round_number) ?? [];
    list.push(m);
    byRound.set(m.round_number, list);
  }
  for (const list of byRound.values()) list.sort((a, b) => a.match_number - b.match_number);

  const x = (r: number) => (r - 1) * (NODE_W + COL_GAP);
  const yById = new Map<string, number>();

  const first = byRound.get(1) ?? [];
  first.forEach((m, i) => yById.set(m.id, HEADER_H + i * (NODE_H + ROW_GAP)));

  for (let r = 2; r <= rounds; r++) {
    const list = byRound.get(r) ?? [];
    for (const m of list) {
      const feeders = (byRound.get(r - 1) ?? []).filter((f) => f.next_match_id === m.id);
      const centres = feeders
        .map((f) => yById.get(f.id))
        .filter((v): v is number => v !== undefined)
        .map((fy) => fy + NODE_H / 2);
      if (centres.length > 0) {
        const mid = centres.reduce((a, b) => a + b, 0) / centres.length;
        yById.set(m.id, mid - NODE_H / 2);
      } else {
        // fallback: spread evenly
        const idx = list.indexOf(m);
        const span = (first.length * (NODE_H + ROW_GAP)) / Math.max(list.length, 1);
        yById.set(m.id, HEADER_H + idx * span + span / 2 - NODE_H / 2 - ROW_GAP / 2);
      }
    }
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

  let height = Math.max(...nodes.map((n) => n.y + NODE_H));
  if (third) {
    const finalNode = nodes.find((n) => n.round === rounds);
    const ty = (finalNode ? finalNode.y + NODE_H : height) + THIRD_GAP;
    nodes.push({
      matchId: third.id,
      x: x(rounds),
      y: ty,
      round: rounds,
      isThird: true,
    });
    height = Math.max(height, ty + NODE_H);
  }

  const columns: LayoutColumn[] = [];
  for (let r = 1; r <= rounds; r++) columns.push({ round: r, x: x(r) });

  return {
    nodes,
    connectors,
    columns,
    width: x(rounds) + NODE_W,
    height,
  };
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
  return out;
}
