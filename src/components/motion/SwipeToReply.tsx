import { Reply } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import { Springs } from '@/lib/motion';

const MAX_DRAG = 64;
const THRESHOLD = 48;

type Props = { enabled?: boolean; onReply: () => void; children: ReactNode };

/**
 * WhatsApp/Telegram style swipe-right-to-reply. The row follows the finger (max 64px) with a reply
 * arrow fading in behind it; crossing 48px fires a medium haptic once; releasing past it triggers
 * `onReply` and the row springs back. Vertical movement fails the gesture so lists still scroll.
 */
export function SwipeToReply({ enabled = true, onReply, children }: Props) {
  const theme = useTheme();
  const x = useSharedValue(0);
  const crossed = useSharedValue(false);

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX(15)
    .failOffsetX(-15)
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      const dx = Math.max(0, e.translationX);
      // light resistance past the threshold
      const next = dx < THRESHOLD ? dx : THRESHOLD + (dx - THRESHOLD) * 0.3;
      x.set(Math.min(MAX_DRAG, next));
      const past = dx >= THRESHOLD;
      if (past !== crossed.get()) {
        crossed.set(past);
        if (past) scheduleOnRN(haptics.medium);
      }
    })
    .onEnd(() => {
      if (crossed.get()) scheduleOnRN(onReply);
      crossed.set(false);
      x.set(withSpring(0, Springs.snappy));
    })
    .onFinalize(() => {
      x.set(withSpring(0, Springs.snappy));
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const iconStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, x.value / THRESHOLD),
    transform: [{ scale: 0.5 + Math.min(1, x.value / THRESHOLD) * 0.5 }],
  }));

  return (
    <View>
      <Animated.View pointerEvents="none" style={[styles.icon, iconStyle]}>
        <View style={[styles.iconCircle, { backgroundColor: theme.backgroundSelected }]}>
          <Reply size={16} color={theme.textSecondary} strokeWidth={2.5} />
        </View>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { position: 'absolute', left: 8, top: 0, bottom: 0, justifyContent: 'center' },
  iconCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
