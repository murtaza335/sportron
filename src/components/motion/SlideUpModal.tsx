import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { webColumnStyle } from '@/components/WebFrame';
import { Modal, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView, type GestureType } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptics } from '@/lib/haptics';
import { Duration, Springs } from '@/lib/motion';

const DragContext = createContext<GestureType | null>(null);

/** Wrap a header (or any region) so dragging it down dismisses the surrounding SlideUpModal. */
export function SlideUpDragZone({ children }: { children: ReactNode }) {
  const gesture = useContext(DragContext);
  if (!gesture) return <>{children}</>;
  return <GestureDetector gesture={gesture}>{children}</GestureDetector>;
}

type Props = { visible: boolean; onClose: () => void; children: ReactNode };

/** Full-screen modal that springs up from the bottom and can be swiped down from a `SlideUpDragZone`. */
export function SlideUpModal({ visible, onClose, children }: Props) {
  const { height: SCREEN_HEIGHT } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  const translateY = useSharedValue(SCREEN_HEIGHT);

  const finish = useCallback(() => setMounted(false), []);

  useEffect(() => {
    if (visible) {
      translateY.set(SCREEN_HEIGHT);
      translateY.set(reduced ? withTiming(0, { duration: Duration.fast }) : withSpring(0, Springs.sheet));
    } else if (mounted) {
      translateY.set(
        withSpring(SCREEN_HEIGHT, Springs.sheet, (done) => {
          if (done) scheduleOnRN(finish);
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const dismiss = useCallback(() => {
    translateY.set(
      withSpring(SCREEN_HEIGHT, Springs.sheet, (done) => {
        if (done) {
          scheduleOnRN(finish);
          scheduleOnRN(onClose);
        }
      }),
    );
  }, [finish, onClose, translateY, SCREEN_HEIGHT]);

  const pan = Gesture.Pan()
    .activeOffsetY(10)
    .onUpdate((e) => {
      translateY.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY > SCREEN_HEIGHT * 0.2 || e.velocityY > 900) {
        scheduleOnRN(haptics.light);
        translateY.set(
          withSpring(SCREEN_HEIGHT, { ...Springs.sheet, velocity: e.velocityY }, (done) => {
            if (done) {
              scheduleOnRN(finish);
              scheduleOnRN(onClose);
            }
          }),
        );
      } else {
        translateY.set(withSpring(0, { ...Springs.sheet, velocity: e.velocityY }));
      }
    });

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  if (!mounted && !visible) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={dismiss} statusBarTranslucent>
      <GestureHandlerRootView style={styles.flex}>
        <DragContext.Provider value={pan}>
          <Animated.View style={[styles.flex, webColumnStyle, style]}>
            <View style={styles.flex}>{children}</View>
          </Animated.View>
        </DragContext.Provider>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
