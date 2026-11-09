import type { StyleProp, TextStyle } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';
import { Duration } from '@/lib/motion';

/** "n/max characters" that crossfades to the warning colour as the limit nears (>= 85%). */
export function CharCounter({ count, max, suffix = ' characters', style }: { count: number; max: number; suffix?: string; style?: StyleProp<TextStyle> }) {
  const theme = useTheme();
  const near = count >= max * 0.85;
  const animated = useAnimatedStyle(
    () => ({ color: withTiming(near ? theme.warning : theme.textSecondary, { duration: Duration.fast }) }),
    [near, theme.warning, theme.textSecondary],
  );
  return (
    <Animated.Text style={[{ fontSize: 12 }, style, animated]}>
      {count}/{max}
      {suffix}
    </Animated.Text>
  );
}
