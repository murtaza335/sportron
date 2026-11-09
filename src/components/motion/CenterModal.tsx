import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Duration, Springs } from '@/lib/motion';

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
};

/** Dialog-style modal: backdrop fades, content scales 0.92→1 with a spring; exit scales to 0.96. */
export function CenterModal({ visible, onClose, children }: Props) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      if (reduced) progress.set(withTiming(1, { duration: Duration.fast }));
      else progress.set(withSpring(1, Springs.gentle));
    } else if (mounted) {
      progress.set(
        withTiming(0, { duration: Duration.fast }, (finished) => {
          if (finished) scheduleOnRN(setMounted, false);
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const request = useCallback(() => onClose(), [onClose]);

  const backdrop = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, progress.value)) * 0.5 }));
  const content = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, progress.value)),
    transform: [{ scale: reduced ? 1 : 0.92 + 0.08 * progress.value }],
  }));

  if (!mounted && !visible) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={request} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]} pointerEvents="none" />
        <Pressable style={StyleSheet.absoluteFill} onPress={request} accessibilityLabel="Close" />
        <Animated.View style={content}>{children}</Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  backdrop: { backgroundColor: '#000' },
});
