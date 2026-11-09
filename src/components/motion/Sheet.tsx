import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { KeyboardAvoider, useAndroidKeyboardHeight } from '@/components/KeyboardAvoider';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import { Duration, Springs } from '@/lib/motion';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const DISMISS_FRACTION = 0.25;
const DISMISS_VELOCITY = 800;
const BACKDROP_MAX = 0.5;

export type SheetProps = {
  visible: boolean;
  /** Called after the exit animation finishes (backdrop tap, back button, swipe-down). */
  onClose: () => void;
  children: ReactNode;
  /** Fixed sheet height (e.g. '92%'). Omit to size to content, capped at `maxHeight`. */
  height?: DimensionValue;
  maxHeight?: DimensionValue;
  /** Remove the default horizontal padding (for edge-to-edge content). */
  flush?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Set false when the content already handles the keyboard itself (default true). */
  avoidKeyboard?: boolean;
  /** Called once the sheet has fully animated out and unmounted. */
  onClosed?: () => void;
};

/**
 * Unified bottom sheet: spring open, finger-tracking drag with velocity-aware dismiss, rubber-band
 * when dragged up, backdrop opacity derived from sheet position, exit animation before unmount.
 * Drag from the handle area; the content stays free to scroll.
 */
export function Sheet({ visible, onClose, children, height, maxHeight = '85%', flush, style, avoidKeyboard = true, onClosed }: SheetProps) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const sheetHeight = useSharedValue(SCREEN_HEIGHT * 0.5);
  const crossed = useSharedValue(false);
  // Android is edge-to-edge and a <Modal> is its own window: pad by the keyboard height ourselves.
  const androidKb = useAndroidKeyboardHeight();
  const kbPad = avoidKeyboard && Platform.OS === 'android' && androidKb > 0 ? androidKb : 0;

  const finishClose = useCallback(() => {
    setMounted(false);
    onClosed?.();
  }, [onClosed]);

  const animateOut = useCallback(
    (then?: () => void) => {
      const done = (finished?: boolean) => {
        'worklet';
        if (finished) {
          scheduleOnRN(finishClose);
          if (then) scheduleOnRN(then);
        }
      };
      if (reduced) {
        translateY.set(withTiming(SCREEN_HEIGHT, { duration: Duration.fast }, done));
      } else {
        translateY.set(withSpring(SCREEN_HEIGHT, Springs.sheet, done));
      }
    },
    [finishClose, reduced, translateY],
  );

  // Open / programmatic close driven by `visible`.
  useEffect(() => {
    if (visible) {
      translateY.set(SCREEN_HEIGHT);
      if (reduced) translateY.set(withTiming(0, { duration: Duration.fast }));
      else translateY.set(withSpring(0, Springs.sheet));
    } else if (mounted) {
      animateOut();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const requestClose = useCallback(() => {
    animateOut(onClose);
  }, [animateOut, onClose]);

  const pan = Gesture.Pan()
    .onStart(() => {
      crossed.set(false);
    })
    .onUpdate((e) => {
      const dy = e.translationY;
      translateY.set(dy > 0 ? dy : dy * 0.2);
      const past = dy > sheetHeight.get() * DISMISS_FRACTION;
      if (past !== crossed.get()) {
        crossed.set(past);
        if (past) scheduleOnRN(haptics.light);
      }
    })
    .onEnd((e) => {
      const shouldDismiss = e.translationY > sheetHeight.get() * DISMISS_FRACTION || e.velocityY > DISMISS_VELOCITY;
      if (shouldDismiss) {
        translateY.set(
          withSpring(SCREEN_HEIGHT, { ...Springs.sheet, velocity: e.velocityY }, (finished) => {
            if (finished) {
              scheduleOnRN(finishClose);
              scheduleOnRN(onClose);
            }
          }),
        );
      } else {
        translateY.set(withSpring(0, { ...Springs.sheet, velocity: e.velocityY }));
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, sheetHeight.value], [BACKDROP_MAX, 0], 'clamp'),
  }));

  if (!mounted && !visible) return null;

  return (
    <Modal transparent visible={mounted || visible} animationType="none" onRequestClose={requestClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.flex}>
        <KeyboardAvoider modal enabled={avoidKeyboard && Platform.OS === 'ios'} style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.root, kbPad > 0 && { paddingBottom: kbPad }]}>
            <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} pointerEvents="none" />
            <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} accessibilityLabel="Close" />
            <Animated.View
              onLayout={(e) => sheetHeight.set(e.nativeEvent.layout.height)}
              style={[
                styles.sheet,
                flush ? null : styles.padded,
                { backgroundColor: theme.backgroundElement, maxHeight, ...(height != null ? { height } : null) },
                sheetStyle,
                style,
              ]}>
              <GestureDetector gesture={pan}>
                <View style={[styles.handleContainer, flush && styles.handleFlush]} hitSlop={{ top: 8, bottom: 8 }}>
                  <View style={[styles.handle, { backgroundColor: theme.textSecondary, opacity: 0.3 }]} />
                </View>
              </GestureDetector>
              {children}
            </Animated.View>
          </View>
        </KeyboardAvoider>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: '#000' },
  sheet: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingBottom: Platform.OS === 'ios' ? Spacing.lg + 10 : Spacing.md,
    gap: Spacing.xs,
    overflow: 'hidden',
  },
  padded: { paddingHorizontal: Spacing.md },
  handleContainer: { width: '100%', paddingVertical: Spacing.sm, alignItems: 'center' },
  handleFlush: { paddingVertical: Spacing.sm },
  handle: { width: 32, height: 4, borderRadius: Radius.full },
});
