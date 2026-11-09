import { useEffect, useCallback } from 'react';
import { ActivityIndicator, Platform, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';

import { handleAuthRedirectUrl } from '@/services/auth';
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
      if (Platform.OS !== 'web') router.replace('/');
    } catch (e) {
      console.error('[T3S] Error handling auth callback:', e);
      router.replace(Platform.OS === 'web' ? '/login' : '/');
    }
  }, [router]);

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