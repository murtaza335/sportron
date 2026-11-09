import { Platform } from 'react-native';

/** True on web with a mouse/trackpad (desktop). Phone browsers keep Enter = newline. */
export function isFinePointer(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: fine)').matches;
}

type KeyEvent = {
  nativeEvent: { key?: string; shiftKey?: boolean };
  preventDefault?: () => void;
  stopPropagation?: () => void;
};

/**
 * `onKeyPress` for multiline inputs on desktop web: Enter sends, Shift+Enter is a newline.
 * `onEscape` returns true when it consumed the key (e.g. cancelled a reply), so the modal stays open.
 */
export function enterToSend(onSend: () => void, onEscape?: () => boolean) {
  return (e: KeyEvent) => {
    if (!isFinePointer()) return;
    const { key, shiftKey } = e.nativeEvent;
    if (key === 'Enter' && !shiftKey) {
      e.preventDefault?.();
      onSend();
    } else if (key === 'Escape' && onEscape?.()) {
      e.preventDefault?.();
      e.stopPropagation?.();
    }
  };
}
