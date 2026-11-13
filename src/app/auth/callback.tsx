import { useEffect, useCallback } from 'react';
import { ActivityIndicator, Platform, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';

import { peekReturnTo } from '@/lib/returnTo';
import { handleAuthRedirectUrl } from '@/services/auth';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';

export default function AuthCallback() {
  const theme = useTheme();
  const router = useRouter();
  const url = Linking.useURL();

  const handleRedirect = useCallback(async (urlStr: string) => {
    try {
      // Only an OAuth `code` from a sign-in this app started is accepted (PKCE, SEC-M1).
      await handleAuthRedirectUrl(urlStr);
      // On web the root layout's auth gate takes over once the session exists and sends the user
      // to the page they originally asked for (see lib/returnTo).
      // Native: go back to the link the user opened before signing in (if any). A brand-new user
      // without a profile is sent to onboarding by the root gate, which keeps the saved link.
      if (Platform.OS !== 'web') router.replace(peekReturnTo() ?? '/');
    } catch (e) {
      console.error('[T3S] Error handling auth callback:', e);
      router.replace(Platform.OS === 'web' ? '/login' : '/');
    }
  }, [router]);

  // Web: supabase-js finishes the code exchange on page load and the root auth gate then redirects.
  // If no session shows up, don't leave the user on a spinner.
  const { session } = useAuth();
  useEffect(() => {
    if (Platform.OS !== 'web' || session) return;
    const t = setTimeout(() => router.replace('/login'), 10_000);
    return () => clearTimeout(t);
  }, [session, router]);

  useEffect(() => {
    if (url) {
      handleRedirect(url);
    } else {
      const checkInitialUrl = async () => {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) {
          handleRedirect(initialUrl);
        }
      };
      checkInitialUrl();
    }
  }, [url, handleRedirect]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ActivityIndicator size="large" color={theme.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});