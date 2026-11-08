import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, View, type KeyboardAvoidingViewProps } from 'react-native';

/**
 * Android is edge-to-edge (gradle `edgeToEdgeEnabled=true`), so the OS no longer resizes the
 * window when the keyboard opens (`softwareKeyboardLayoutMode` / `adjustResize` is ignored).
 * Keyboard avoidance must therefore be done in JS, at the layout level:
 *
 *  - `useAndroidKeyboardHeight()` + `<KeyboardInsetView>` is mounted ONCE in the root layout and
 *    shrinks the whole navigation tree, so every route screen is covered automatically.
 *  - `<KeyboardAvoider>` replaces `KeyboardAvoidingView` in screens. Inside the root tree on
 *    Android it is a plain View (root already handled it, avoiding double shifts). Inside an RN
 *    `<Modal>` (a separate native window the root padding can't reach) pass `modal`.
 */
export function useAndroidKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

export function KeyboardInsetView({ style, children }: { style?: any; children: React.ReactNode }) {
  const height = useAndroidKeyboardHeight();
  return <View style={[{ flex: 1 }, style, height > 0 && { paddingBottom: height }]}>{children}</View>;
}

type Props = KeyboardAvoidingViewProps & { modal?: boolean };

export function KeyboardAvoider({ modal, behavior, keyboardVerticalOffset, enabled, children, ...rest }: Props) {
  if (Platform.OS === 'android' && !modal) {
    return <View style={rest.style}>{children}</View>;
  }
  return (
    <KeyboardAvoidingView
      {...rest}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? keyboardVerticalOffset : 0}
      enabled={enabled}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
