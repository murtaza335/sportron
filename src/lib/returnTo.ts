import type { Href } from 'expo-router';
import { Platform } from 'react-native';

const KEY = 'auth-return-to';
let memory: string | null = null;

const SKIP = /^\/(login|onboarding|auth)(\/|$|\?)/;

/** Remember the page a signed-out visitor wanted, so sign-in can send them back to it. */
export function saveReturnTo(path: string) {
  if (!path || path === '/' || SKIP.test(path)) return;
  memory = path;
  if (Platform.OS === 'web') {
    try {
      window.sessionStorage.setItem(KEY, path);
    } catch {
      // private mode: memory fallback only (lost on full-page OAuth redirect)
    }
  }
}

/** Returns the saved page (once) and clears it. */
export function consumeReturnTo(): Href | null {
  let path = memory;
  memory = null;
  if (Platform.OS === 'web') {
    try {
      path = path ?? window.sessionStorage.getItem(KEY);
      window.sessionStorage.removeItem(KEY);
    } catch {
      // ignore
    }
  }
  return path && path.startsWith('/') && !path.startsWith('//') && !SKIP.test(path) ? (path as Href) : null;
}
