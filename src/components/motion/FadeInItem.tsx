import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { RM, STAGGER_MAX_ITEMS, STAGGER_MS } from '@/lib/motion';

type Props = {
  index: number;
  /** true only on the first load of a list (never on refresh/pagination) */
  animate: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

export function FadeInItem({ index, animate, style, children }: Props) {
  if (!animate || index >= STAGGER_MAX_ITEMS) return <Animated.View style={style}>{children}</Animated.View>;
  return (
    <Animated.View
      style={style}
      entering={FadeInDown.springify().damping(18).stiffness(180).delay(index * STAGGER_MS).reduceMotion(RM)}>
      {children}
    </Animated.View>
  );
}
