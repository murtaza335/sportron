import { useIsFocused } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tint, type StatusTone } from '@/lib/tournamentFormat';

/** Small capsule: tinted background (~15%), coloured text (PLAN §11 status mapping). */
export function StatusPill({ tone, paused }: { tone: StatusTone; paused?: boolean }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const color = theme[tone.token];
  const live = tone.label.startsWith('●');
  const p = useSharedValue(1);

  // The only looping animation in lists: a pulsing live dot (ESPN/FotMob style), stopped when the
  // screen is unfocused / the pill is paused, and static under reduced motion.
  useEffect(() => {
    if (!live || reduced || paused || !focused) {
      p.set(1);
      return;
    }
    p.set(withRepeat(withTiming(0.4, { duration: 600, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => p.set(1);
  }, [live, reduced, paused, focused, p]);
  const dot = useAnimatedStyle(() => ({ opacity: p.value }));

  return (
    <View style={[styles.pill, { backgroundColor: tint(color) }, live && styles.livePill]}>
      {live && <Animated.View style={[styles.liveDot, { backgroundColor: color }, dot]} />}
      <ThemedText variant="caption" numberOfLines={1} style={[styles.text, { color }]}>
        {live ? tone.label.replace(/^●\s*/, '') : tone.label}
      </ThemedText>
    </View>
  );
}

/** Neutral capsule (sport names, counts). */
export function InfoPill({ label }: { label: string }) {
  const theme = useTheme();
  const isDark = theme.resolvedColorScheme === 'dark';
  return (
    <View style={[styles.pill, { backgroundColor: isDark ? 'rgba(0, 168, 181, 0.15)' : 'rgba(0, 168, 181, 0.1)' }]}>
      <ThemedText variant="caption" numberOfLines={1} style={[styles.text, { color: isDark ? '#2DD4BF' : '#00A8B5' }]}>
        {label}
      </ThemedText>
    </View>
  );
}

/** Role tag (ADMIN / PLAYING), same recipe as the community member tag. */
export function RoleTag({ label }: { label: string }) {
  const theme = useTheme();
  const isDark = theme.resolvedColorScheme === 'dark';
  return (
    <View style={[styles.pill, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)' }]}>
      <ThemedText variant="caption" numberOfLines={1} style={[styles.text, { color: isDark ? '#34D399' : '#10B981' }]}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  pill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  text: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
