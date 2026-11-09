import { Platform } from 'react-native';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';

import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

const redirectTo = makeRedirectUri({
  scheme: 't3s',
  path: 'auth/callback',
});

// PKCE flow (SEC-M1): the OAuth redirect carries a one-time `code`, which is exchanged for a
// session using the code verifier stored locally by supabase-js. A forged deep link such as
// t3s://auth/callback#access_token=<attacker> is ignored, and a code that was not initiated
// by this client fails the verifier check.
let signInPending = false;
const exchangedCodes = new Map<string, Promise<void>>();

export function isSignInPending(): boolean {
  return signInPending;
}

/**
 * Exchange the `code` found in an OAuth redirect URL for a session. Safe to call from more than
 * one place for the same URL (e.g. openAuthSessionAsync result + deep-link callback screen):
 * each code is exchanged at most once. Ignores URLs when no sign-in was started by this app.
 */
export async function handleAuthRedirectUrl(url: string): Promise<void> {
  if (!signInPending) return;

  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) {
    throw new Error(errorCode);
  }

  const code = typeof params.code === 'string' ? params.code : undefined;
  if (!code) return;

  let exchange = exchangedCodes.get(code);
  if (!exchange) {
    exchange = supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) throw error;
    });
    exchangedCodes.set(code, exchange);
  }
  await exchange;
}

export async function signInWithGoogle() {
  if (Platform.OS === 'web') {
    // Full-page redirect: no popup (Safari blocks popups opened after an await, and an installed
    // iOS PWA loses the result). supabase-js (detectSessionInUrl) completes the PKCE exchange when
    // Google sends the browser back to /auth/callback.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
    return;
  }

  signInPending = true;
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      throw error;
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type === 'success') {
      await handleAuthRedirectUrl(result.url);
    }
  } finally {
    // Keep the flag briefly so a deep-link callback delivered right after the browser closes
    // can still reuse the (memoized) code exchange.
    setTimeout(() => {
      signInPending = false;
    }, 10_000);
  }
}

/**
 * Remove this device's FCM token from the signed-in user's profile so the next user of the
 * device does not receive the previous user's pushes. Never blocks sign-out.
 */
async function removeDeviceTokenBeforeSignOut(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;
    const messaging = (await import('@react-native-firebase/messaging')).default;
    const token = await messaging().getToken();
    if (token) {
      const { removeFCMToken } = await import('@/services/profiles');
      await removeFCMToken(userId, token);
    }
  } catch (e) {
    console.warn('Could not remove FCM token on sign-out:', e);
  }
}

export async function signOut() {
  await removeDeviceTokenBeforeSignOut();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}
