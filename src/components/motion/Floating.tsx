import { useEffect, type ReactNode } from 'react';
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Duration, RM } from '@/lib/motion';

/** Gentle idle float (translateY ±4px, 3s loop). Static under reduced motion. */
export function Floating({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    y.set(withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => y.set(0);
  }, [reduced, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -4 + y.value * 8 }] }));
  return (
    <Animated.View entering={FadeIn.duration(Duration.base).reduceMotion(RM)} style={style}>
      {children}
    </Animated.View>
  );
}
