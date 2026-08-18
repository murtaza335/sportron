let totalUnread = 0;
const listeners = new Set<() => void>();

export function getChatUnreadCount(): number {
  return totalUnread;
}

export function setChatUnreadCount(next: number): void {
  if (next === totalUnread) return;
  totalUnread = Math.max(0, next);
  for (const listener of listeners) listener();
}

export function subscribeChatUnreadCount(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}