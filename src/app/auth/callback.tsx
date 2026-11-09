import { useEffect, useCallback } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
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
    } catch (e) {
      console.error('[T3S] Error handling auth callback:', e);
    } finally {
      router.replace('/');
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