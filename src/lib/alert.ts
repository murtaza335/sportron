import { Alert, Platform } from 'react-native';

import { showInAppAlert, type AlertButton } from '@/components/motion/AlertHost';

export type { AlertButton };

/**
 * Cross-platform replacement for React Native's Alert.alert.
 * - Native: delegates to Alert.alert.
 * - Web: renders the themed in-app dialog (<AlertHost /> in the root layout). Browser-native
 *   window.alert / window.confirm / window.prompt are never used — they freeze the tab, can't
 *   be styled and block automation (see AGENTS.md "Alerts & confirmations").
 *
 * Button callbacks fire asynchronously after the user chooses (same as native).
 */
export function alert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  showInAppAlert(title, message, buttons);
}
