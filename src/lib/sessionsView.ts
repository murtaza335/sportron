export type SessionsView = 'new' | 'history';

let currentView: SessionsView = 'new';
const listeners = new Set<() => void>();

export function getSessionsView(): SessionsView {
  return currentView;
}

export function setSessionsView(next: SessionsView): void {
  if (next === currentView) return;
  currentView = next;
  for (const listener of listeners) listener();
}

export function subscribeSessionsView(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
