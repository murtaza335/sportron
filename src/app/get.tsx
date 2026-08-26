import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from '@/components/ui/Text';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.murtazabaig.T3S';
const WEB_FALLBACK_URL = 'https://sportron.app';
// const APP_STORE_URL = 'https://apps.apple.com/app/idYOUR_APP_ID';

export default function GetAppScreen() {
  const theme = useTheme();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const ua = navigator.userAgent;
    const isAndroid = /Android/.test(ua);
    const isIOS = /iPad|iPhone|iPod/.test(ua);

    let targetUrl: string;

    if (isAndroid) {
      targetUrl = PLAY_STORE_URL;
    } else if (isIOS) {
      targetUrl = WEB_FALLBACK_URL;
      // targetUrl = APP_STORE_URL; // Uncomment when iOS app is live
    } else {
      targetUrl = WEB_FALLBACK_URL;
    }

    window.location.replace(targetUrl);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ActivityIndicator size="large" color={theme.text} />
      <ThemedText variant="body" style={styles.message}>
        Redirecting...
      </ThemedText>
      <ThemedText variant="caption" muted style={styles.link}>
        Click here if you are not redirected automatically.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  message: {
    marginTop: 16,
    textAlign: 'center',
  },
  link: {
    marginTop: 8,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});