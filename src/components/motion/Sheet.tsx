import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { webColumnStyle } from '@/components/WebFrame';
import {
  Modal,
  Platform,
  Pressable,
  useWindowDimensions,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  View,
  type DimensionValue,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  type SharedValue,
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

const DISMISS_FRACTION = 0.25;
const DISMISS_VELOCITY = 800;
const BACKDROP_MAX = 0.5;

const SheetScrollContext = createContext<SharedValue<number> | null>(null);

/**
 * Spread onto a ScrollView inside a Sheet (`<ScrollView {...useSheetScroll()} />`) so the sheet knows
 * when the list is at the top and a downward drag anywhere on the body should dismiss it.
 */
export function useSheetScroll() {
  const scrollY = useContext(SheetScrollContext);
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY?.set(e.nativeEvent.contentOffset.y);
    },
    [scrollY],
  );
  return { onScroll, scrollEventThrottle: 16 };
}

/** ScrollView that cooperates with the Sheet's drag-anywhere-to-dismiss. Use inside a Sheet. */
export function SheetScrollView({ ref, onScroll, ...rest }: ScrollViewProps & { ref?: React.Ref<ScrollView> }) {
  const sheetScroll = useSheetScroll();
  return (
    <ScrollView
      ref={ref}
      {...rest}
      scrollEventThrottle={sheetScroll.scrollEventThrottle}
      onScroll={(e) => {
        sheetScroll.onScroll(e);
        onScroll?.(e);
      }}
    />
  );
}

const HANDLE_ZONE = 48;
/** On web a mouse drag inside the body (e.g. selecting text) must not drag the sheet: handle only. */
const HANDLE_ONLY = Platform.OS === 'web';

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
 * Drag down from anywhere: scroll content scrolls first (see `useSheetScroll`); the handle zone always drags.
 */
export function Sheet({ visible, onClose, children, height, maxHeight = '85%', flush, style, avoidKeyboard = true, onClosed }: SheetProps) {
  const theme = useTheme();
  const { height: SCREEN_HEIGHT } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const sheetHeight = useSharedValue(SCREEN_HEIGHT * 0.5);
  const crossed = useSharedValue(false);
  const scrollY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
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
    [finishClose, reduced, translateY, SCREEN_HEIGHT],
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
    .manualActivation(true)
    .onTouchesDown((e) => {
      const t = e.allTouches[0];
      if (!t) return;
      startX.set(t.x);
      startY.set(t.y);
    })
    .onTouchesMove((e, state) => {
      const t = e.allTouches[0];
      if (!t) return;
      const dy = t.y - startY.get();
      const dx = t.x - startX.get();
      if (dy < -8 || (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy))) {
        state.fail();
      } else if (dy > 8) {
        // Handle zone always drags; elsewhere only once the inner list is scrolled to the top.
        if (startY.get() < HANDLE_ZONE || (!HANDLE_ONLY && scrollY.get() <= 0)) state.activate();
        else state.fail();
      }
    })
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
                webColumnStyle,
                { backgroundColor: theme.backgroundElement, maxHeight, ...(height != null ? { height } : null) },
                sheetStyle,
                style,
              ]}>
              <GestureDetector gesture={pan}>
                <View style={height != null ? styles.flex : styles.shrink}>
                  <View style={[styles.handleContainer, flush && styles.handleFlush]} hitSlop={{ top: 8, bottom: 8 }}>
                    <View style={[styles.handle, { backgroundColor: theme.textSecondary, opacity: 0.3 }]} />
                  </View>
                  <SheetScrollContext.Provider value={scrollY}>{children}</SheetScrollContext.Provider>
                </View>
              </GestureDetector>
            </Animated.View>
          </View>
        </KeyboardAvoider>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
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
