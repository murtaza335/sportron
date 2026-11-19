import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/ui/Text';
import { Radius } from '@/constants/theme';
import { LiveStatus } from '@/constants/liveColors';

/** Small red "● LIVE" pill; the dot pulses (not under reduced motion). `label` overrides the text (Half-time, …). */
export function LivePill({ label = 'LIVE', compact }: { label?: string; compact?: boolean }) {
  const reduced = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    o.set(withRepeat(withTiming(0.25, { duration: 800 }), -1, true));
  }, [reduced, o]);
  const dot = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <View style={[styles.pill, compact && styles.compact]} accessibilityRole="text" accessibilityLabel={label === 'LIVE' ? 'Live now' : label}>
      <Animated.View style={[styles.dot, dot]} />
      <ThemedText style={styles.text}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: LiveStatus.live, borderRadius: Radius.full, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' },
  compact: { paddingHorizontal: 7, paddingVertical: 2 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  text: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
});
