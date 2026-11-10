import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { refreshChatUnreadCounts } from '@/lib/chatUnreadRefresh';

/** Keeps the Chats tab badge fresh: on sign-in, app foreground, and (web) a 60 s poll while visible. */
export function useChatUnreadWatcher(userId: string | undefined): void {
  useEffect(() => {
    if (!userId) return;
    void refreshChatUnreadCounts(true);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refreshChatUnreadCounts();
    });
    let timer: ReturnType<typeof setInterval> | undefined;
    if (Platform.OS === 'web') {
      timer = setInterval(() => {
        if (typeof document === 'undefined' || document.visibilityState === 'visible') {
          void refreshChatUnreadCounts(true);
        }
      }, 60_000);
    }
    return () => {
      sub.remove();
      if (timer) clearInterval(timer);
    };
  }, [userId]);
}
