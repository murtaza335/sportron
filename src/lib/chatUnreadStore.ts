// Global, network-free source of truth for the Chats tab badge. Holds the
// per-chat unread count (keyed "<kind>:<chatId>") so ANY active chat thread can
// publish its own count (reads via markRead, live realtime bumps, + a hub stats
// refresh) and the tab badge always reflects the freshest value — no extra
// network calls, no full-state overwrites on tab return.
//
// Semantics:
//  - setChatUnreadCountFor(..., 0) KEEPS a 0 entry: a "just read" marker so a
//    stale cache render can't resurrect the count. Pruned only by an
//    authoritative replaceChatUnreadCounts() from fresh DB stats.
//  - replaceChatUnreadCounts(kind, counts) replaces every entry of a kind with
//    a fresh DB snapshot (0s dropped) — used by the Chats hub load.
type ChatKey = `${'community' | 'session'}:${string}`;

const unreadByKey = new Map<ChatKey, number>();
const listeners = new Set<() => void>();

let totalUnread = 0;

function keyOf(kind: 'community' | 'session', chatId: string): ChatKey {
  return `${kind}:${chatId}`;
}

function recomputeTotal(): void {
  let total = 0;
  for (const n of unreadByKey.values()) {
    total += n;
  }
  totalUnread = total;
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function getChatUnreadCount(): number {
  return totalUnread;
}

export function getChatUnreadCountFor(
  kind: 'community' | 'session',
  chatId: string,
): number | undefined {
  return unreadByKey.get(keyOf(kind, chatId));
}

// E.g. { communityId: 3 }. Includes 0 "just read" entries so callers can tell
// a cleared chat apart from one never seen.
export function getChatUnreadCountsByKind(kind: 'community' | 'session'): Record<string, number> {
  const out: Record<string, number> = {};
  const prefix = `${kind}:`;
  for (const [k, n] of unreadByKey) {
    if (k.startsWith(prefix)) out[k.slice(prefix.length)] = n;
  }
  return out;
}

export function setChatUnreadCountFor(
  kind: 'community' | 'session',
  chatId: string,
  count: number,
): void {
  const key = keyOf(kind, chatId);
  const clamped = Math.max(0, count);
  if (unreadByKey.get(key) === clamped) return;
  unreadByKey.set(key, clamped);
  recomputeTotal();
  notify();
}

// Replaces the whole kind with a fresh, authoritative DB snapshot. Entries not
// present are removed (including their 0 "read" markers) because the fresh
// stats already reflect what was read.
export function replaceChatUnreadCounts(
  kind: 'community' | 'session',
  counts: Record<string, number>,
): void {
  const prefix = `${kind}:`;
  let changed = false;
  for (const k of [...unreadByKey.keys()]) {
    if (k.startsWith(prefix)) {
      unreadByKey.delete(k);
      changed = true;
    }
  }
  for (const [chatId, count] of Object.entries(counts)) {
    if (count > 0) {
      unreadByKey.set(keyOf(kind, chatId), count);
      changed = true;
    }
  }
  if (!changed) return;
  recomputeTotal();
  notify();
}

export function resetChatUnreadCounts(): void {
  if (unreadByKey.size === 0 && totalUnread === 0) return;
  unreadByKey.clear();
  totalUnread = 0;
  notify();
}

export function subscribeChatUnreadCount(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}