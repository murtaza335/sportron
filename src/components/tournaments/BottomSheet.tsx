import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const SCREEN_HEIGHT = Dimensions.get('window').height;

/** Bottom sheet using the MatchDetailPopup recipe: own slide animation, drag handle, pan-to-dismiss. */
export function BottomSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  const [translateY] = useState(() => new Animated.Value(SCREEN_HEIGHT));
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  const [panHandlers, setPanHandlers] = useState<ReturnType<typeof PanResponder.create>['panHandlers'] | null>(null);

  useEffect(() => {
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 8,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 120 || g.vy > 0.4) {
          Animated.timing(translateY, { toValue: SCREEN_HEIGHT, duration: 220, useNativeDriver: true }).start(
            () => closeRef.current(),
          );
        } else {
          Animated.spring(translateY, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }).start();
        }
      },
    });
    setPanHandlers(responder.panHandlers);
  }, [translateY]);

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }).start();
    } else {
      translateY.setValue(SCREEN_HEIGHT);
    }
  }, [visible, translateY]);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
          <Animated.View
            style={[styles.sheet, { backgroundColor: theme.backgroundElement, transform: [{ translateY }] }]}
          >
            <View style={styles.handleContainer} {...(panHandlers ?? {})}>
              <View style={[styles.handle, { backgroundColor: theme.textSecondary, opacity: 0.3 }]} />
            </View>
            {children}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingBottom: Platform.OS === 'ios' ? Spacing.lg + 10 : Spacing.md,
    maxHeight: '85%',
    gap: Spacing.xs,
  },
  handleContainer: { width: '100%', paddingVertical: Spacing.sm, alignItems: 'center' },
  handle: { width: 32, height: 4, borderRadius: Radius.full },
});
