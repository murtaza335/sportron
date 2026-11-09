import { replaceChatUnreadCounts } from '@/lib/chatUnreadStore';
import { fetchChatHubStats } from '@/services/chat';

const THROTTLE_MS = 30_000;
let lastRun = 0;
let inFlight: Promise<void> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Refreshes the Chats tab badge from the counts-only `get_chat_hub_stats` RPC (no message bodies),
 * so it stays correct while the user is on any screen — not just the Chats hub / an open chat.
 * Throttled to once per 30 s unless `force`.
 */
export function refreshChatUnreadCounts(force = false): Promise<void> {
  if (inFlight) return inFlight;
  if (!force && Date.now() - lastRun < THROTTLE_MS) return Promise.resolve();
  lastRun = Date.now();
  inFlight = Promise.all([
    fetchChatHubStats('community')
      .then((s) => replaceChatUnreadCounts('community', s.unread))
      .catch(() => undefined),
    fetchChatHubStats('session')
      .then((s) => replaceChatUnreadCounts('session', s.unread))
      .catch(() => undefined),
  ]).then(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Call after a chat push arrives in the foreground (debounced 2 s, bypasses the throttle). */
export function scheduleChatUnreadRefresh(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void refreshChatUnreadCounts(true);
  }, 2000);
}
