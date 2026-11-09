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

  // 3+ buttons cannot be expressed with window.confirm (OK/Cancel only) - render a small
  // in-page action sheet so every option stays reachable on web.
  if (buttons.length >= 3) {
    showWebActionSheet(title, message, buttons);
    return;
  }

  // 2 buttons: use window.confirm (OK = destructive/primary, Cancel = cancel)
  const cancelBtn = buttons.find((b) => b.style === 'cancel');
  const primaryBtn = buttons.find((b) => b !== cancelBtn) ?? buttons[buttons.length - 1];

  const confirmed = window.confirm(body);
  if (confirmed) {
    primaryBtn.onPress?.();
  } else {
    cancelBtn?.onPress?.();
  }
}

/** Minimal DOM action sheet for web (3+ choices). Backdrop click triggers the cancel button. */
function showWebActionSheet(title: string, message: string | undefined, buttons: AlertButton[]): void {
  const dark =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const colors = dark
    ? { bg: '#1c1c1e', text: '#ffffff', muted: '#a1a1aa', border: '#3a3a3c', danger: '#ff6b6b' }
    : { bg: '#ffffff', text: '#111111', muted: '#6b7280', border: '#e5e7eb', danger: '#dc2626' };

  const cancelBtn = buttons.find((b) => b.style === 'cancel');
  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:16px;';

  const close = (button?: AlertButton) => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    button?.onPress?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close(cancelBtn);
  };
  document.addEventListener('keydown', onKey);

  const card = document.createElement('div');
  card.style.cssText = `background:${colors.bg};color:${colors.text};border-radius:14px;max-width:360px;width:100%;overflow:hidden;font-family:inherit;box-shadow:0 10px 40px rgba(0,0,0,0.3);`;

  const head = document.createElement('div');
  head.style.cssText = 'padding:18px 18px 12px;text-align:center;';
  const titleEl = document.createElement('div');
  titleEl.textContent = title;
  titleEl.style.cssText = 'font-weight:700;font-size:17px;';
  head.appendChild(titleEl);
  if (message) {
    const msgEl = document.createElement('div');
    msgEl.textContent = message;
    msgEl.style.cssText = `margin-top:6px;font-size:14px;color:${colors.muted};white-space:pre-wrap;`;
    head.appendChild(msgEl);
  }
  card.appendChild(head);

  buttons.forEach((button) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = button.text;
    const isCancel = button.style === 'cancel';
    const color = button.style === 'destructive' ? colors.danger : colors.text;
    el.style.cssText = `display:block;width:100%;padding:14px;border:0;border-top:1px solid ${colors.border};background:transparent;color:${color};font-size:16px;font-weight:${isCancel ? '400' : '600'};cursor:pointer;font-family:inherit;`;
    el.addEventListener('click', () => close(button));
    card.appendChild(el);
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close(cancelBtn);
  });
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}
