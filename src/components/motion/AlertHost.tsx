import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { CenterModal } from '@/components/motion/CenterModal';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

export type AlertButton = {
  text: string;
  style?: 'cancel' | 'destructive' | 'default';
  onPress?: () => void;
};

type AlertItem = { id: number; title: string; message?: string; buttons: AlertButton[] };
type Listener = () => void;

// Module-level FIFO queue: alerts raised before the host mounts (or while another is open)
// wait their turn instead of being dropped or falling back to a browser dialog.
const queue: AlertItem[] = [];
const listeners = new Set<Listener>();
let nextId = 1;

/** Enqueue an in-app alert. Rendered by <AlertHost /> (mounted once in the root layout). */
export function showInAppAlert(title: string, message?: string, buttons?: AlertButton[]) {
  const list = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];
  if (list.some((b) => b.style === 'destructive')) haptics.warning();
  queue.push({ id: nextId++, title, message, buttons: list });
  listeners.forEach((l) => l());
}

export function AlertHost() {
  const theme = useTheme();
  const [current, setCurrent] = useState<AlertItem | null>(null);
  const [visible, setVisible] = useState(false);
  // Guards against double-firing a button (double click, Escape during the exit animation).
  const resolved = useRef(false);

  const pump = useCallback(() => {
    setCurrent((c) => {
      if (c) return c;
      const next = queue.shift() ?? null;
      if (next) {
        resolved.current = false;
        setVisible(true);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    listeners.add(pump);
    pump();
    return () => {
      listeners.delete(pump);
    };
  }, [pump]);

  const choose = useCallback(
    (button?: AlertButton) => {
      if (!current || resolved.current) return;
      resolved.current = true;
      setVisible(false);
      // Let the exit animation play, then free the slot and show the next queued alert.
      // The button callback runs first so an alert it raises lands behind any already queued.
      setTimeout(() => {
        button?.onPress?.();
        setCurrent(null);
        setTimeout(pump, 0);
      }, 150);
    },
    [current, pump],
  );

  const cancelBtn = current?.buttons.find((b) => b.style === 'cancel');
  const primaryBtn = current?.buttons.filter((b) => b.style !== 'cancel').pop();
  // Backdrop / Escape: cancel when there is one; a single-button notice just dismisses (runs its
  // button like the old window.alert path); a 2+ choice without cancel must be answered explicitly.
  const dismissTarget = current
    ? cancelBtn ?? (current.buttons.length === 1 ? current.buttons[0] : undefined)
    : undefined;
  const canDismiss = !!dismissTarget;

  const onClose = useCallback(() => {
    if (canDismiss) choose(dismissTarget);
  }, [canDismiss, choose, dismissTarget]);

  // Web keyboard: Escape = dismiss, Enter = primary action.
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible || !current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter' && primaryBtn) {
        e.preventDefault();
        choose(primaryBtn);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, current, onClose, choose, primaryBtn]);

  if (!current) return null;

  // Two buttons sit side by side (cancel left); one or 3+ stack vertically.
  const row = current.buttons.length === 2;
  const ordered = row && cancelBtn ? [cancelBtn, ...current.buttons.filter((b) => b !== cancelBtn)] : current.buttons;

  return (
    <CenterModal visible={visible} onClose={onClose}>
      <View
        accessibilityRole="alert"
        aria-modal
        style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
      >
        <View style={styles.head}>
          <ThemedText style={styles.title}>{current.title}</ThemedText>
          {current.message ? (
            <ThemedText variant="caption" muted style={styles.message}>
              {current.message}
            </ThemedText>
          ) : null}
        </View>
        <View style={[row ? styles.row : styles.column, { borderTopColor: theme.border }]}>
          {ordered.map((b, i) => {
            const isCancel = b.style === 'cancel';
            const color = b.style === 'destructive' ? theme.error : isCancel ? theme.text : theme.accent;
            return (
              <Pressable
                key={`${b.text}-${i}`}
                accessibilityRole="button"
                onPress={() => choose(b)}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  styles.button,
                  row && i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: theme.border },
                  !row && i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                  (pressed || hovered) && { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <ThemedText style={[styles.buttonText, { color, fontWeight: isCancel ? '400' : '600' }]}>
                  {b.text}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>
    </CenterModal>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    // Floating UI that never fades with a screen — elevation is allowed here.
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  head: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md, alignItems: 'center' },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '700', textAlign: 'center' },
  message: { marginTop: Spacing.xs, textAlign: 'center', fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  column: { flexDirection: 'column', borderTopWidth: StyleSheet.hairlineWidth },
  button: { flex: 1, paddingVertical: 14, paddingHorizontal: Spacing.md, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, lineHeight: 22, textAlign: 'center' },
});
