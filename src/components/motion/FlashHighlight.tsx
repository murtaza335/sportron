import { useEffect, type ReactNode } from 'react';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

/** Pulses a background colour twice (400ms each) when `active` turns true. */
export function FlashHighlight({ active, color, children }: { active: boolean; color: string; children: ReactNode }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (!active) return;
    p.set(withRepeat(withSequence(withTiming(1, { duration: 200 }), withTiming(0, { duration: 200 })), reduced ? 1 : 2, false));
  }, [active, reduced, p]);
  const overlay = useAnimatedStyle(() => ({ opacity: p.value * 0.25 }));
  return (
    <Animated.View>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: color, borderRadius: 12 }, overlay]} />
      {children}
    </Animated.View>
  );
}
