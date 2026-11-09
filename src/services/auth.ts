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

async function createSessionFromUrl(url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url);

  if (errorCode) {
    throw new Error(errorCode);
  }

  const { access_token, refresh_token } = params;

  if (!access_token) {
    return;
  }

  const { error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });

  if (error) {
    throw error;
  }
}

export async function signInWithGoogle() {
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
    await createSessionFromUrl(result.url);
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
