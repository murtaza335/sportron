import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Calls `onForeground` whenever the app returns to the foreground (background/inactive -> active).
 * Realtime events missed while the app was backgrounded are otherwise lost until the next screen
 * focus, leaving stale badges and lists.
 */
export function useAppForeground(onForeground: () => void, enabled: boolean = true): void {
  const callbackRef = useRef(onForeground);

  useEffect(() => {
    callbackRef.current = onForeground;
  });

  useEffect(() => {
    if (!enabled) return;
    let previous: AppStateStatus = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if (previous !== 'active' && next === 'active') {
        callbackRef.current();
      }
      previous = next;
    });
    return () => subscription.remove();
  }, [enabled]);
}
