/** Web has no pull-to-refresh: the focused screen's refresh handler is parked here for <WebRefreshButton />. */
let current: (() => void) | null = null;
const listeners = new Set<() => void>();

export function registerWebRefresh(fn: () => void): () => void {
  current = fn;
  listeners.forEach((l) => l());
  return () => {
    if (current === fn) {
      current = null;
      listeners.forEach((l) => l());
    }
  };
}

export const getWebRefresh = () => current;

export function subscribeWebRefresh(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
