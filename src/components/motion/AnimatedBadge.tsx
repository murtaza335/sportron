import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';
import { Duration, Springs } from '@/lib/motion';

type Props = {
  /** number shows a count; undefined shows a plain dot */
  count?: number;
  visible?: boolean;
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/** Unread dot/count: pops in, pops on change, shrinks out. */
export function AnimatedBadge({ count, visible = true, color, size, style }: Props) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const shown = visible && (count === undefined || count > 0);
  // start hidden when there is nothing to show, so zero-count badges never flash on mount
  const scale = useSharedValue(shown ? 1 : 0);
  const lastCount = useRef(count);

  useEffect(() => {
    if (reduced) {
      scale.set(withTiming(shown ? 1 : 0, { duration: Duration.fast }));
      return;
    }
    scale.set(shown ? withSpring(1, Springs.bouncy) : withTiming(0, { duration: Duration.fast }));
  }, [shown, reduced, scale]);

  useEffect(() => {
    if (!reduced && shown && lastCount.current !== count && lastCount.current !== undefined) {
      scale.set(withSequence(withTiming(1.1, { duration: 70 }), withSpring(1, Springs.bouncy)));
    }
    lastCount.current = count;
  }, [count, shown, reduced, scale]);

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: scale.value > 0.01 ? 1 : 0,
  }));

  const bg = color ?? theme.error;
  if (count === undefined) {
    const d = size ?? 10;
    return <Animated.View pointerEvents="none" style={[{ width: d, height: d, borderRadius: d / 2, backgroundColor: bg }, animated, style]} />;
  }
  const d = size ?? 18;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.count, { minWidth: d, height: d, borderRadius: d / 2, backgroundColor: bg }, animated, style]}>
      <Text style={styles.countText}>{count > 99 ? '99+' : count}</Text>
    </Animated.View>
  );
}

// kept for layout helpers needing a wrapper
export const BadgeAnchor = View;

const styles = StyleSheet.create({
  count: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  countText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
