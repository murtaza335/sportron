import { useEffect, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { scheduleOnRN } from 'react-native-worklets';
import { Easing, useAnimatedReaction, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { Duration } from '@/lib/motion';

/** Counts from 0 to `value` once on mount (e.g. profile stats, streak modal). Static under reduced motion. */
export function CountUp({
  value,
  duration = Duration.slow * 2,
  delay = 0,
  style,
}: {
  value: number;
  duration?: number;
  delay?: number;
  style?: StyleProp<TextStyle>;
}) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (reduced) return;
    p.set(0);
    p.set(withDelay(delay, withTiming(value, { duration, easing: Easing.out(Easing.cubic) })));
  }, [value, duration, delay, reduced, p]);

  useAnimatedReaction(
    () => Math.round(p.value),
    (cur, prev) => {
      if (cur !== prev) scheduleOnRN(setShown, cur);
    },
  );

  return <Text style={style}>{reduced ? value : shown}</Text>;
}
