import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Duration, RM } from '@/lib/motion';

/** Wrap a screen root: fades in with a tiny rise on mount. */
export function ScreenFadeIn({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <Animated.View
      style={[{ flex: 1 }, style]}
      entering={FadeInDown.duration(Duration.base).withInitialValues({ opacity: 0, transform: [{ translateY: 8 }] }).reduceMotion(RM)}>
      {children}
    </Animated.View>
  );
}
