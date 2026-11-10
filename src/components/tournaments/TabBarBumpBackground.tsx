import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

/** Height of the semicircular bump above the bar's top edge. */
export const TAB_BUMP_HEIGHT = 18;
/** Half-width of the bump at its base. */
const BUMP_HALF_WIDTH = 46;

/**
 * Tab-bar background: flat bar with a semicircular bump in the top border,
 * centred behind the raised Tournaments button (PLAN §12.1).
 */
export function TabBarBumpBackground() {
  const theme = useTheme();
  const [size, setSize] = useState({ w: 0, h: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  };

  const { w, h } = size;
  const cx = w / 2;
  const b = TAB_BUMP_HEIGHT;
  const half = BUMP_HALF_WIDTH;
  const k = half * 0.55; // control-point reach for a rounded arc

  // y = b is the bar's top edge; y = 0 is the top of the bump.
  const line =
    `M 0 ${b} H ${cx - half} ` +
    `C ${cx - half + k} ${b} ${cx - k} 0 ${cx} 0 ` +
    `C ${cx + k} 0 ${cx + half - k} ${b} ${cx + half} ${b} H ${w}`;
  const fill = `${line} V ${h + b} H 0 Z`;

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'visible' }]} onLayout={onLayout} pointerEvents="none">
      {w > 0 && (
        <Svg
          width={w}
          height={h + b}
          style={{ position: 'absolute', top: -b, left: 0 }}
        >
          <Path d={fill} fill={theme.tabBar} />
          <Path d={line} fill="none" stroke={theme.border} strokeWidth={1} />
        </Svg>
      )}
    </View>
  );
}
