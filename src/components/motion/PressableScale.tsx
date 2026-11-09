import { forwardRef, useState } from 'react';
import { Pressable, type PressableProps, type PressableStateCallbackType, type View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { haptics, type HapticKind } from '@/lib/haptics';
import { Duration, PRESS_SCALE, Springs } from '@/lib/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = PressableProps & {
  scaleTo?: number;
  haptic?: HapticKind;
};

/** Drop-in Pressable with spring press feedback. `style` may be an object or a function. */
export const PressableScale = forwardRef<View, PressableScaleProps>(function PressableScale(
  { scaleTo = PRESS_SCALE, haptic, style, onPressIn, onPressOut, onPress, disabled, ...rest },
  ref,
) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const dip = useSharedValue(1);
  // Reanimated drops function-valued `style`, so resolve it here with our own pressed state.
  const [pressed, setPressed] = useState(false);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: dip.value,
  }));

  return (
    <AnimatedPressable
      ref={ref}
      disabled={disabled}
      onPressIn={(e) => {
        setPressed(true);
        if (!reduced) scale.set(withTiming(scaleTo, { duration: Duration.instant }));
        dip.set(withTiming(0.9, { duration: Duration.instant }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        scale.set(withSpring(1, Springs.snappy));
        dip.set(withTiming(1, { duration: Duration.fast }));
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) haptics[haptic]();
        onPress?.(e);
      }}
      style={[typeof style === 'function' ? style({ pressed } as PressableStateCallbackType) : style, animatedStyle] as never}
      {...rest}
    />
  );
});
