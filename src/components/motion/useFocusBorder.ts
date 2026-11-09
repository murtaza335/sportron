import { useCallback } from 'react';
import { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Duration } from '@/lib/motion';

/**
 * Animates a field's border colour between `idle` and `focused`.
 * Spread `handlers` on the TextInput and apply `style` to the (Animated) wrapper that owns the border.
 */
export function useFocusBorder(idle: string, focused: string) {
  const p = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ borderColor: interpolateColor(p.value, [0, 1], [idle, focused]) }));
  const onFocus = useCallback(() => p.set(withTiming(1, { duration: Duration.fast })), [p]);
  const onBlur = useCallback(() => p.set(withTiming(0, { duration: Duration.fast })), [p]);
  return { style, handlers: { onFocus, onBlur } };
}
