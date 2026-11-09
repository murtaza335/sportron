import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { PressableScale } from '@/components/motion/PressableScale';
import { Duration, Easings, STAGGER_MAX_ITEMS } from '@/lib/motion';

import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { TournamentRound, TournamentStanding } from '@/types';

const NAME_W = 92;
const BAR_STAGGER = 40;

/** Bar that grows from the left (scaleX, never width) on first view. */
function GrowBar({ fraction, color, index }: { fraction: number; color: string; index: number }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    p.set(withDelay(Math.min(index, STAGGER_MAX_ITEMS * 2) * BAR_STAGGER, withTiming(1, { duration: Duration.slow, easing: Easings.emphasizedDecel })));
  }, [reduced, index, p]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleX: p.value }] }));
  return <Animated.View style={[styles.fill, { width: `${fraction * 100}%`, backgroundColor: color, transformOrigin: 'left center' }, style]} />;
}

/** Horizontal bars showing how far each entry got (pure Views — no chart library). */
export function StandingsChart({
  standings,
  rounds,
  onSelect,
}: {
  standings: TournamentStanding[];
  rounds: TournamentRound[];
  onSelect: (entryId: string) => void;
}) {
  const theme = useTheme();
  const main = rounds.filter((r) => !r.is_third_place).sort((a, b) => a.round_number - b.round_number);
  const segments = main.length + 1; // one per round + trophy

  return (
    <View style={{ gap: Spacing.xs }}>
      <View style={styles.ticks}>
        <View style={{ width: NAME_W }} />
        <View style={styles.tickRow}>
          {main.map((r) => (
            <ThemedText key={r.id} variant="caption" muted numberOfLines={1} style={styles.tick}>
              {r.name.replace('Quarter-finals', 'QF').replace('Semi-finals', 'SF').replace('Round of ', 'R')}
            </ThemedText>
          ))}
          <ThemedText variant="caption" muted style={styles.tick}>🏆</ThemedText>
        </View>
      </View>

      {standings.map((s, index) => {
        const fraction = s.status === 'champion' ? 1 : Math.min((s.reached_round ?? 0) / segments, 1);
        const color =
          s.status === 'champion' ? theme.warning : s.status === 'alive' ? theme.accent : theme.textSecondary;
        const label =
          s.status === 'champion'
            ? 'Champion'
            : s.status === 'withdrawn'
              ? 'Withdrawn'
              : `${s.reached_label ?? '—'}${s.status === 'alive' ? ' · alive' : s.eliminated_by ? ` · lost to ${s.eliminated_by}` : ''}`;
        return (
          <PressableScale
            key={s.entry_id}
            onPress={() => onSelect(s.entry_id)}
            scaleTo={0.98}
            style={styles.row}
            accessibilityRole="button"
            accessibilityLabel={`${s.name}: ${label}`}
          >
            <ThemedText variant="caption" numberOfLines={1} style={{ width: NAME_W, fontWeight: '600' }}>
              {s.name}
            </ThemedText>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
                <GrowBar fraction={fraction} color={color} index={index} />
              </View>
              <ThemedText variant="caption" muted numberOfLines={1} style={{ fontSize: 11 }}>{label}</ThemedText>
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  ticks: { flexDirection: 'row', alignItems: 'center' },
  tickRow: { flex: 1, flexDirection: 'row' },
  tick: { flex: 1, textAlign: 'center', fontSize: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs, paddingVertical: 4 },
  track: { height: 10, borderRadius: Radius.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.full },
});
