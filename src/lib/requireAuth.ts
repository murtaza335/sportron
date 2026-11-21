import { useSyncExternalStore } from 'react';

import { isGuestSession } from '@/lib/guestMode';
import type { SignInContext, SignInReason } from '@/lib/signInReasons';

/**
 * Gate for every action that needs an account (join, post, record a match, chat ...).
 *
 *   if (!requireAuth('join_community', { name: community.name, count: community.member_count })) return;
 *
 * Signed in -> returns true and does nothing. Guest -> opens the sign-in sheet (SignInHost, mounted once
 * in the root layout) and returns false so the caller stops. Same shape as lib/reportStore.
 */
export type SignInPrompt = { reason: SignInReason; ctx: SignInContext };

let current: SignInPrompt | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function requireAuth(reason: SignInReason = 'generic', ctx: SignInContext = {}): boolean {
  if (!isGuestSession()) return true;
  current = { reason, ctx };
  emit();
  return false;
}

export function closeSignIn() {
  if (current === null) return;
  current = null;
  emit();
}

export function useSignInPrompt(): SignInPrompt | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => null,
  );
}
