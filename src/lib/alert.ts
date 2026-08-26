import { Alert, Platform } from 'react-native';

type AlertButton = {
  text: string;
  style?: 'cancel' | 'destructive' | 'default';
  onPress?: () => void;
};

/**
 * Cross-platform replacement for React Native's Alert.alert.
 * On native it delegates to Alert.alert; on web it uses window.confirm / window.alert
 * so that dialogs actually appear in the browser.
 */
export function alert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }

  const body = message ? `${title}\n\n${message}` : title;

  if (!buttons || buttons.length === 0) {
    window.alert(body);
    return;
  }

  if (buttons.length === 1) {
    window.alert(body);
    buttons[0].onPress?.();
    return;
  }

  // 2+ buttons: use window.confirm (OK = destructive/primary, Cancel = cancel)
  const cancelBtn = buttons.find((b) => b.style === 'cancel');
  const primaryBtn = buttons.find((b) => b !== cancelBtn) ?? buttons[buttons.length - 1];

  const confirmed = window.confirm(body);
  if (confirmed) {
    primaryBtn.onPress?.();
  } else {
    cancelBtn?.onPress?.();
  }
}
