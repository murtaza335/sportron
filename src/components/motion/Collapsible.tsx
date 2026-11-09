import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { Duration, RM } from '@/lib/motion';

type Props = { open: boolean; style?: StyleProp<ViewStyle>; children: ReactNode };

/** Layout-transition based expand/collapse (never animates height manually). */
export function Collapsible({ open, style, children }: Props) {
  return (
    <Animated.View layout={LinearTransition.springify().reduceMotion(RM)} style={style}>
      {open ? (
        <Animated.View
          entering={FadeIn.duration(Duration.base).reduceMotion(RM)}
          exiting={FadeOut.duration(Duration.fast).reduceMotion(RM)}>
          {children}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}
