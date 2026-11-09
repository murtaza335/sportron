import { CheckCircle2, AlertCircle } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import { Duration, Springs } from '@/lib/motion';

type ToastItem = { id: number; title: string; message?: string; kind: 'success' | 'error' };
type Listener = (t: ToastItem) => void;

const listeners = new Set<Listener>();
let nextId = 1;
const AUTO_DISMISS_MS = 2500;

/** Non-blocking feedback ("Ping sent"). Requires <ToastHost /> in the root layout. Confirmations stay as alert(). */
export function toast(title: string, message?: string, kind: 'success' | 'error' = 'success') {
  const item = { id: nextId++, title, message, kind };
  if (listeners.size === 0) return;
  if (kind === 'success') haptics.success();
  listeners.forEach((l) => l(item));
}

function ToastView({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const y = useSharedValue(-120);
  const opacity = useSharedValue(0);
  const closing = useSharedValue(false);

  const dismiss = useCallback(() => {
    if (closing.get()) return;
    closing.set(true);
    y.set(withTiming(-120, { duration: Duration.base }, (fin) => {
      if (fin) scheduleOnRN(onDone);
    }));
    opacity.set(withTiming(0, { duration: Duration.base }));
  }, [onDone, y, opacity, closing]);

  useEffect(() => {
    if (reduced) {
      y.set(0);
      opacity.set(withTiming(1, { duration: Duration.fast }));
    } else {
      y.set(withSpring(0, Springs.gentle));
      opacity.set(withTiming(1, { duration: Duration.fast }));
    }
    const t = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [dismiss, reduced, y, opacity]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
    .onUpdate((e) => {
      y.set(Math.min(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY < -20 || e.velocityY < -500) scheduleOnRN(dismiss);
      else y.set(withSpring(0, Springs.snappy));
    }),
    [dismiss, y],
  );

  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: y.value }] }));
  const Icon = item.kind === 'success' ? CheckCircle2 : AlertCircle;
  const color = item.kind === 'success' ? theme.success : theme.error;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        accessibilityLiveRegion="polite"
        style={[
          styles.toast,
          { top: insets.top + Spacing.sm, backgroundColor: theme.backgroundElement, borderColor: theme.border },
          style,
        ]}
      >
        <Icon size={20} color={color} strokeWidth={2} />
        <View style={{ flex: 1 }}>
          <ThemedText style={{ fontWeight: '600' }}>{item.title}</ThemedText>
          {item.message ? <ThemedText variant="caption" muted>{item.message}</ThemedText> : null}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

export function ToastHost() {
  const [current, setCurrent] = useState<ToastItem | null>(null);

  useEffect(() => {
    const l: Listener = (t) => setCurrent(t);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  if (!current) return null;
  return <ToastView key={current.id} item={current} onDone={() => setCurrent((c) => (c?.id === current.id ? null : c))} />;
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    zIndex: 1000,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
});
