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

function valid(path: string | null): Href | null {
  return path && path.startsWith('/') && !path.startsWith('//') && !SKIP.test(path) ? (path as Href) : null;
}

/** Returns the saved page WITHOUT clearing it (native OAuth callback). */
export function peekReturnTo(): Href | null {
  return valid(memory);
}

/** Forget any saved page (called once the user is signed in and settled in the app). */
export function clearReturnTo() {
  memory = null;
  if (Platform.OS === 'web') {
    try {
      window.sessionStorage.removeItem(KEY);
    } catch {
      // ignore
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
  return valid(path);
}
