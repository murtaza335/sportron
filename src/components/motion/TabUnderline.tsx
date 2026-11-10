import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';

import { Duration, Springs } from '@/lib/motion';

export type TabLayout = { x: number; width: number };

/**
 * Underline that slides between tabs. Width is animated with scaleX of a 1px bar (never layout width).
 * Place inside the tab row (position: relative); `layouts[i]` come from each tab's onLayout.
 */
export function TabUnderline({
  layouts,
  index,
  color,
  height = 2,
}: {
  layouts: (TabLayout | undefined)[];
  index: number;
  color: string;
  height?: number;
}) {
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const ready = useSharedValue(false);
  const target = layouts[index];

  useEffect(() => {
    if (!target) return;
    const cfg = reduced ? { x: withTiming, w: withTiming } : null;
    const nextX = target.x + target.width / 2;
    if (!ready.get()) {
      x.set(nextX);
      w.set(target.width);
      ready.set(true);
      return;
    }
    if (cfg) {
      x.set(withTiming(nextX, { duration: Duration.fast }));
      w.set(withTiming(target.width, { duration: Duration.fast }));
    } else {
      x.set(withSpring(nextX, Springs.snappy));
      w.set(withSpring(target.width, Springs.snappy));
    }
  }, [target, reduced, x, w, ready]);

  const style = useAnimatedStyle(() => ({
    opacity: ready.value ? 1 : 0,
    transform: [{ translateX: x.value - 0.5 }, { scaleX: Math.max(w.value, 0.0001) }],
  }));

  return <Animated.View pointerEvents="none" style={[styles.bar, { height, backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({ bar: { position: 'absolute', bottom: 0, left: 0, width: 1 } });
