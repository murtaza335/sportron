import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { LayoutShift } from '@/lib/motion';

import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tint } from '@/lib/tournamentFormat';
import type { LeagueRow } from '@/types';

const ROW_H = 48;
const ROW_LAYOUT = LayoutShift;

/** A stat cell that flashes (FotMob/SofaScore style) when its value changes after first render. */
function StatCell({ w, text, bold, dim: isDim }: { w: number; text: string | number; bold?: boolean; dim?: boolean }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const flash = useSharedValue(0);
  const prev = useRef(text);
  useEffect(() => {
    if (prev.current !== text && !reduced) {
      flash.set(withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 900 })));
    }
    prev.current = text;
  }, [text, reduced, flash]);
  const overlay = useAnimatedStyle(() => ({ opacity: flash.value * 0.35 }));
  return (
    <View style={{ width: w, alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center' }}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.accent }, overlay]} />
      <ThemedText variant="caption" style={[bold && { fontWeight: '700' }, isDim && { color: theme.textSecondary }]}>
        {text}
      </ThemedText>
    </View>
  );
}
const RANK_W = 44;
const ENTRY_W = 150;
const STAT_W = 38;
const FORM_W = 84;

function Header({ children, w, align = 'center' }: { children: string; w?: number; align?: 'left' | 'center' }) {
  return (
    <View style={{ width: w, justifyContent: 'center', height: 36 }}>
      <ThemedText variant="caption" muted style={{ fontWeight: '700', textAlign: align }}>{children}</ThemedText>
    </View>
  );
}

/**
 * League / group table (PLAN-v2 §9.5). `#` and team are pinned, the stats scroll sideways.
 * - racket sports hide D (draws) and read "Games +/-"
 * - `advance`: rows inside the top N get a green left bar (groups) — `qualified` overrides it once known
 * - `compact`: # Team P Pts +/- only (used inside group cards)
 */
export function LeagueTable({
  rows,
  viewerId,
  hideDraws,
  compact,
  advance,
  champion,
  pointsHint,
  onSelect,
}: {
  rows: LeagueRow[];
  viewerId: string | undefined;
  hideDraws?: boolean;
  compact?: boolean;
  advance?: number;
  /** Highlight the rank-1 row (completed league). */
  champion?: boolean;
  pointsHint?: string;
  onSelect: (entryId: string) => void;
}) {
  const theme = useTheme();
  const mine = (r: LeagueRow) => !!viewerId && r.profile_ids.includes(viewerId);
  const rowBg = (r: LeagueRow) =>
    champion && r.rank === 1 ? tint(theme.warning) : mine(r) ? theme.backgroundSelected : 'transparent';
  const dim = (r: LeagueRow) => r.status === 'withdrawn';
  const advances = (r: LeagueRow) =>
    r.qualified != null ? r.qualified : advance != null ? r.rank <= advance : false;
  const dotColor = (f: string) => (f === 'W' ? theme.success : f === 'D' ? theme.warning : theme.error);
  const sign = (n: number) => (n > 0 ? `+${n}` : String(n));

  const stat = (w: number, text: string | number, bold?: boolean, d?: boolean) => (
    <StatCell w={w} text={text} bold={bold} dim={d} />
  );

  return (
    <View>
      <View style={[styles.table, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <View>
          <View style={[styles.headRow, { borderColor: theme.border }]}>
            <Header w={RANK_W}>#</Header>
            <Header w={ENTRY_W} align="left">Team</Header>
          </View>
          {rows.map((r) => (
            <Animated.View key={r.entry_id} layout={ROW_LAYOUT}>
            <Pressable
              onPress={() => onSelect(r.entry_id)}
              style={[styles.row, { backgroundColor: rowBg(r), borderColor: theme.border }]}
              accessibilityRole="button"
              accessibilityLabel={`${r.name}, position ${r.rank}, ${r.points} points`}
            >
              {advances(r) && <View style={[styles.bar, { backgroundColor: theme.success }]} />}
              <View style={{ width: RANK_W, alignItems: 'center' }}>
                <ThemedText variant="caption" style={{ fontWeight: '700' }}>{r.rank}</ThemedText>
              </View>
              <View style={[styles.entryCell, { width: ENTRY_W }]}>
                <ThemedText
                  numberOfLines={1}
                  style={[{ fontWeight: '600', flexShrink: 1 }, dim(r) && { color: theme.textSecondary }]}
                >
                  {r.name}
                </ThemedText>
                {r.status === 'withdrawn' && (
                  <ThemedText variant="caption" style={{ fontSize: 9, fontWeight: '700', color: theme.error }}>W/D</ThemedText>
                )}
              </View>
            </Pressable>
            </Animated.View>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          <View>
            <View style={[styles.headRow, { borderColor: theme.border }]}>
              <Header w={STAT_W}>P</Header>
              {!compact && <Header w={STAT_W}>W</Header>}
              {!compact && !hideDraws && <Header w={STAT_W}>D</Header>}
              {!compact && <Header w={STAT_W}>L</Header>}
              <Header w={STAT_W + 8}>{hideDraws ? 'Gm +/-' : '+/-'}</Header>
              <Header w={STAT_W + 4}>Pts</Header>
              {!compact && <Header w={FORM_W} align="left">Form</Header>}
            </View>
            {rows.map((r) => (
              <Animated.View key={r.entry_id} layout={ROW_LAYOUT}>
              <Pressable
                onPress={() => onSelect(r.entry_id)}
                style={[styles.row, { backgroundColor: rowBg(r), borderColor: theme.border }]}
              >
                {stat(STAT_W, r.played, false, dim(r))}
                {!compact && stat(STAT_W, r.won, false, dim(r))}
                {!compact && !hideDraws && stat(STAT_W, r.drawn, false, dim(r))}
                {!compact && stat(STAT_W, r.lost, false, dim(r))}
                {stat(STAT_W + 8, sign(r.score_diff), false, dim(r))}
                {stat(STAT_W + 4, r.points, true, dim(r))}
                {!compact && (
                  <View style={[styles.form, { width: FORM_W }]}>
                    {r.form.map((f, i) => (
                      <View key={i} style={[styles.formDot, { backgroundColor: dotColor(f) }]} />
                    ))}
                  </View>
                )}
              </Pressable>
              </Animated.View>
            ))}
          </View>
        </ScrollView>
      </View>
      <ThemedText variant="caption" muted style={{ marginTop: Spacing.xs }}>
        P played · {hideDraws ? 'W won · L lost' : 'W won · D drawn · L lost'} · Pts points{pointsHint ? ` (${pointsHint})` : ''}
        {advance != null ? ' · green bar = qualifies for the knockout' : ''}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  table: { flexDirection: 'row', borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden' },
  headRow: { flexDirection: 'row', height: 36, borderBottomWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', height: ROW_H, borderBottomWidth: StyleSheet.hairlineWidth },
  entryCell: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: Spacing.sm },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  form: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  formDot: { width: 8, height: 8, borderRadius: 4 },
});
