import { Heart } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptics } from '@/lib/haptics';
import { Springs } from '@/lib/motion';

/**
 * Instagram-style double-tap to like: a big white heart pops in the centre, then fades out.
 * Only ever likes (never unlikes); `onLike` is skipped when already liked but the heart still plays.
 */
export function DoubleTapLike({ liked, onLike, children }: { liked: boolean; onLike: () => void; children: ReactNode }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  const fire = () => {
    if (!liked) onLike();
    haptics.light();
  };

  const tap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onEnd((_e, success) => {
      if (!success) return;
      scheduleOnRN(fire);
      if (reduced) {
        opacity.set(withSequence(withTiming(1, { duration: 80 }), withDelay(300, withTiming(0, { duration: 160 }))));
        return;
      }
      scale.set(0);
      opacity.set(1);
      scale.set(withSequence(withSpring(1.1, Springs.bouncy), withSpring(1, Springs.snappy), withDelay(250, withTiming(1.4, { duration: 250 }))));
      opacity.set(withDelay(450, withTiming(0, { duration: 250 })));
    });

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: reduced ? 1 : scale.value }],
  }));

  return (
    <GestureDetector gesture={tap}>
      <View style={{ width: '100%', height: '100%' }}>
        {children}
        <View pointerEvents="none" style={styles.center}>
          <Animated.View style={style}>
            <Heart size={84} color="#fff" fill="#fff" />
          </Animated.View>
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill as object, alignItems: 'center', justifyContent: 'center' },
});
