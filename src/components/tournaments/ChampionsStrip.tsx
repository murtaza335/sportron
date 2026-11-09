import { Trophy } from 'lucide-react-native';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { celebrate } from '@/components/motion/Confetti';
import { PressableScale } from '@/components/motion/PressableScale';
import { useAuth } from '@/contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { InfoPill } from '@/components/tournaments/StatusPill';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { sportLabel } from '@/lib/tournamentFormat';
import type { TournamentChampion } from '@/types';

/** One-shot gold sweep across a champion card. */
function GoldSweep({ delay }: { delay: number }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    p.set(withDelay(delay, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.cubic) })));
  }, [reduced, delay, p]);
  const style = useAnimatedStyle(() => ({
    opacity: p.value > 0 && p.value < 1 ? 0.35 : 0,
    transform: [{ translateX: -120 + p.value * 440 }, { rotate: '18deg' }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.sweep, style]} />;
}

/** Horizontal strip of module champions, shown above the module list (PLAN §12.3). */
export function ChampionsStrip({
  champions,
  onPressChampion,
}: {
  champions: TournamentChampion[];
  onPressChampion?: (moduleId: string) => void;
}) {
  const theme = useTheme();
  const { user } = useAuth();

  // Confetti the first time a user sees a completed module they took part in (remembered per user).
  useEffect(() => {
    if (!user?.id) return;
    const mine = champions.find((c) =>
      [c.champion, c.runner_up, c.third].some((e) => !!e && ((e as { profile_ids?: string[] }).profile_ids?.includes(user.id) || (e as { profile_id?: string }).profile_id === user.id)),
    );
    if (!mine) return;
    const key = `champion_seen_${user.id}_${mine.module_id}`;
    AsyncStorage.getItem(key)
      .then((seen) => {
        if (seen) return;
        celebrate();
        return AsyncStorage.setItem(key, '1');
      })
      .catch(() => {});
  }, [champions, user?.id]);

  if (champions.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {champions.map((c, i) => (
        <PressableScale
          key={c.module_id}
          scaleTo={0.97}
          style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
          onPress={() => onPressChampion?.(c.module_id)}
          accessibilityRole="button"
          accessibilityLabel={`${c.module_name} champion ${c.champion?.name ?? ''}`}
        >
          <GoldSweep delay={300 + i * 150} />
          <View style={styles.head}>
            <Trophy size={20} color={theme.warning} strokeWidth={2} />
            <InfoPill label={sportLabel(c.sport)} />
          </View>
          <ThemedText variant="caption" muted numberOfLines={1}>
            {c.module_name}
          </ThemedText>
          <ThemedText variant="body" style={styles.champ} numberOfLines={1}>
            {c.champion?.name ?? '—'}
          </ThemedText>
          {c.runner_up && (
            <ThemedText variant="caption" muted numberOfLines={1}>
              2nd {c.runner_up.name}
            </ThemedText>
          )}
          {c.third && (
            <ThemedText variant="caption" muted numberOfLines={1}>
              3rd {c.third.name}
            </ThemedText>
          )}
        </PressableScale>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.sm, paddingRight: Spacing.md },
  card: {
    width: 200,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: 2,
    overflow: 'hidden',
  },
  sweep: { position: 'absolute', top: -20, bottom: -20, width: 60, backgroundColor: '#F59E0B' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
  champ: { fontWeight: '700' },
});
