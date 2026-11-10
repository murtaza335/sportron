import { useState } from 'react';
import { StyleSheet, Text, View, type TextStyle, type StyleProp } from 'react-native';
import Animated, { FadeInDown, FadeOutUp, useReducedMotion } from 'react-native-reanimated';

import { Duration, RM } from '@/lib/motion';

type Props = {
  value: number;
  style?: StyleProp<TextStyle>;
  /** fontSize + lineHeight needed to clip the roll; derived from style when omitted */
  lineHeight?: number;
};

/** Number that rolls (old slides out, new slides in) when it changes. */
export function AnimatedNumber({ value, style, lineHeight }: Props) {
  const reduced = useReducedMotion();
  const flat = StyleSheet.flatten(style) ?? {};
  const fontSize = (flat.fontSize as number | undefined) ?? 14;
  const lh = lineHeight ?? (flat.lineHeight as number | undefined) ?? Math.round(fontSize * 1.25);
  // `changed` flips on the first value change so the initial mount never animates
  const [prev, setPrev] = useState(value);
  const [changed, setChanged] = useState(false);
  if (prev !== value) {
    setPrev(value);
    setChanged(true);
  }

  if (reduced) return <Text style={style}>{value}</Text>;

  const dir = FadeInDown.duration(Duration.base).reduceMotion(RM);
  return (
    <View style={{ height: lh, overflow: 'hidden', justifyContent: 'center' }}>
      <Animated.Text
        key={value}
        entering={changed ? dir : undefined}
        exiting={FadeOutUp.duration(Duration.fast).reduceMotion(RM)}
        style={[style, { lineHeight: lh }]}>
        {value}
      </Animated.Text>
    </View>
  );
}
