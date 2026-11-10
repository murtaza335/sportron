import { Heart } from 'lucide-react-native';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { AnimatedNumber } from '@/components/motion/AnimatedNumber';
import { PressableScale } from '@/components/motion/PressableScale';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import { Duration, Springs } from '@/lib/motion';

const DOTS = 8;

function Dot({ index, p, color }: { index: number; p: SharedValue<number>; color: string }) {
  const angle = (index / DOTS) * Math.PI * 2;
  const style = useAnimatedStyle(() => ({
    opacity: p.value === 0 ? 0 : 1 - p.value,
    transform: [
      { translateX: Math.cos(angle) * 14 * p.value },
      { translateY: Math.sin(angle) * 14 * p.value },
      { scale: 1 - p.value * 0.4 },
    ],
  }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

type Props = {
  liked: boolean;
  count: number;
  onPress: () => void;
  disabled?: boolean;
  iconSize?: number;
  /** font size of the "N likes" label */
  fontSize?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Like action: heart pop + ring + particle burst on like, quick dip on unlike, rolling count.
 * Animation plays only from user presses (prop sync from the server never animates).
 */
export function LikeButton({ liked, count, onPress, disabled, iconSize = 16, fontSize = 12, style }: Props) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const ring = useSharedValue(0);
  const burst = useSharedValue(0);

  const handlePress = () => {
    const next = !liked;
    if (!reduced) {
      if (next) {
        scale.set(withSequence(withTiming(1.15, { duration: 80 }), withSpring(1, Springs.bouncy)));
        ring.set(0);
        ring.set(withTiming(1, { duration: 400, easing: Easing.out(Easing.quad) }));
        burst.set(0);
        burst.set(withTiming(1, { duration: 450, easing: Easing.out(Easing.quad) }));
      } else {
        scale.set(withSequence(withTiming(0.85, { duration: Duration.instant }), withSpring(1, Springs.snappy)));
      }
    }
    if (next) haptics.light();
    onPress();
  };

  const heart = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ring.value === 0 ? 0 : 0.6 * (1 - ring.value),
    transform: [{ scale: 0.5 + ring.value * 1.1 }],
  }));
  const filledStyle = useAnimatedStyle(() => ({ opacity: withTiming(liked ? 1 : 0, { duration: Duration.fast }) }), [liked]);

  const color = liked ? theme.error : theme.textSecondary;
  const labelStyle = { color, fontSize, fontWeight: '600' as const };

  return (
    <PressableScale onPress={handlePress} disabled={disabled} hitSlop={8} scaleTo={0.94} style={[styles.row, style]}>
      <View style={{ width: iconSize, height: iconSize, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: theme.error, width: iconSize + 8, height: iconSize + 8, borderRadius: (iconSize + 8) / 2 }, ringStyle]} />
        {Array.from({ length: DOTS }).map((_, i) => (
          <Dot key={i} index={i} p={burst} color={theme.error} />
        ))}
        <Animated.View style={heart}>
          <Heart size={iconSize} color={theme.textSecondary} fill="none" />
          <Animated.View style={[StyleSheet.absoluteFill, filledStyle]}>
            <Heart size={iconSize} color={theme.error} fill={theme.error} />
          </Animated.View>
        </Animated.View>
      </View>
      <View style={styles.label}>
        <AnimatedNumber value={count} style={labelStyle} />
        <Text style={labelStyle}> {count === 1 ? 'like' : 'likes'}</Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { flexDirection: 'row', alignItems: 'center' },
  ring: { position: 'absolute', borderWidth: 2 },
  dot: { position: 'absolute', width: 3, height: 3, borderRadius: 1.5 },
});
