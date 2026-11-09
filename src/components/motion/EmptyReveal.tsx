import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { Duration, RM } from '@/lib/motion';

/** Empty state: icon springs in, text fades in 80ms later. */
export function EmptyReveal({ icon, style, children }: { icon: ReactNode; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <View style={style}>
      <Animated.View entering={ZoomIn.duration(Duration.fast).reduceMotion(RM)}>{icon}</Animated.View>
      <Animated.View
        entering={FadeIn.delay(80).duration(Duration.base).reduceMotion(RM)}
        style={{ alignItems: 'center', gap: 8 }}>
        {children}
      </Animated.View>
    </View>
  );
}
