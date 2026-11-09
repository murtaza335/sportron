import { Flame } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '@/lib/haptics';
import { Springs } from '@/lib/motion';

export type FlameState = 'idle' | 'atRisk' | 'cold';

type Props = {
  size: number;
  color: string;
  state: FlameState;
  /** Streak count; an increase vs the previous value triggers the pop. */
  count?: number;
  /** Pause loops (screen unfocused / modal closed). */
  paused?: boolean;
  /** Play a one-shot drop-in with bounce on mount (modal). */
  dropIn?: boolean;
};

/**
 * Duolingo-style flame: slow breathing loop when the streak is active today, faster flicker + dimmed
 * when at risk, static when cold. Pops (1 -> 1.4 -> 1) when `count` increases. Loops are skipped under
 * reduced motion and while `paused`.
 */
export function AnimatedFlame({ size, color, state, count, paused, dropIn }: Props) {
  const reduced = useReducedMotion();
  const breathe = useSharedValue(0);
  const pop = useSharedValue(dropIn ? 0 : 1);
  const prev = useRef(count);

  useEffect(() => {
    if (reduced || paused || state === 'cold') {
      breathe.set(withTiming(0, { duration: 160 }));
      return;
    }
    const duration = state === 'atRisk' ? 500 : 1000; // half-cycle: 1s flicker / 2s breathe
    breathe.set(withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => breathe.set(0);
  }, [state, reduced, paused, breathe]);

  useEffect(() => {
    if (dropIn) pop.set(reduced ? 1 : withSpring(1, Springs.bouncy));
  }, [dropIn, reduced, pop]);

  useEffect(() => {
    if (prev.current !== undefined && count !== undefined && count > prev.current) {
      if (!reduced) {
        pop.set(withSequence(withTiming(1.4, { duration: 140 }), withSpring(1, Springs.bouncy)));
      }
      haptics.success();
    }
    prev.current = count;
  }, [count, reduced, pop]);

  const style = useAnimatedStyle(() => ({
    opacity: state === 'atRisk' ? 0.65 + 0.35 * breathe.value : 1,
    transform: [
      { scale: (1 + breathe.value * (state === 'atRisk' ? 0.1 : 0.06)) * pop.value },
      { translateY: dropIn ? (1 - Math.min(1, pop.value)) * -24 : 0 },
    ],
  }));

  return (
    <Animated.View style={style}>
      <Flame size={size} color={color} fill={color} strokeWidth={0} />
    </Animated.View>
  );
}
