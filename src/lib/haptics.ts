import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

let enabled = true;

function run(fn: () => Promise<void>) {
  if (!enabled || Platform.OS === 'web') return;
  try {
    fn().catch(() => {});
  } catch {
    // haptics are best-effort
  }
}

/**
 * Haptic map:
 *  selection – tab/segment/chip/picker change
 *  light     – like, send, FAB open, refresh, sheet snap
 *  medium    – long-press fired, swipe thresholds
 *  success   – match recorded, approve, invite accepted, session joined
 *  warning   – destructive confirm shown, dispute
 *  error     – failed action surfaced to the user
 */
export const haptics = {
  selection: () => run(() => Haptics.selectionAsync()),
  light: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  setEnabled: (value: boolean) => {
    enabled = value;
  },
};

export type HapticKind = Exclude<keyof typeof haptics, 'setEnabled'>;
