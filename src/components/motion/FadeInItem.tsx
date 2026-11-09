import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Duration, RM, STAGGER_MAX_ITEMS, STAGGER_MS, LayoutShift } from '@/lib/motion';

type Props = {
  index: number;
  /** true only on the first load of a list (never on refresh/pagination) */
  animate: boolean;
  /** Rows mounted after first load (new post, pagination) get a plain quick fade + spring layout shift. */
  lateFade?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

export function FadeInItem({ index, animate, lateFade, style, children }: Props) {
  if (!animate || index >= STAGGER_MAX_ITEMS) {
    if (lateFade) {
      return (
        <Animated.View
          style={style}
          layout={LayoutShift}
          entering={FadeIn.duration(Duration.base).reduceMotion(RM)}>
          {children}
        </Animated.View>
      );
    }
    return <Animated.View style={style}>{children}</Animated.View>;
  }
  return (
    <Animated.View
      style={style}
      entering={FadeInDown.delay(index * STAGGER_MS).duration(Duration.base).withInitialValues({ opacity: 0, transform: [{ translateY: 8 }] }).reduceMotion(RM)}>
      {children}
    </Animated.View>
  );
}
