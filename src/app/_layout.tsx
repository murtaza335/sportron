import * as Font from 'expo-font';
import { Stack, ThemeProvider as NavThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SystemUI from 'expo-system-ui';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SplashScreen as AnimatedSplashScreen } from '@/components/SplashScreen';
import Constants from 'expo-constants';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { NotificationsProvider } from '@/contexts/NotificationsContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { KeyboardInsetView } from '@/components/KeyboardAvoider';
import { FCMInitializer } from '@/components/FCMInitializer';
import { ForcedUpdateScreen } from '@/components/ForcedUpdateScreen';
import { MaintenanceScreen } from '@/components/MaintenanceScreen';
import { WebFrame } from '@/components/WebFrame';
import { Duration } from '@/lib/motion';
import { ConfettiHost } from '@/components/motion/Confetti';
import { ToastHost } from '@/components/motion/Toast';
import { isVersionSatisfied } from '@/services/config';
import { supabase } from '@/lib/supabase';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const theme = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const { session, profile, loading, profileLoading, profileError, refreshProfile } = useAuth();
  const [fontsLoaded, setFontsLoaded] = useState(false);

  // Navigation + native window backgrounds must match the theme, otherwise the default (white) shows
  // through during screen/tab transitions in dark mode.
  const navTheme = useMemo(
    () => ({
      dark: theme.resolvedColorScheme === 'dark',
      colors: {
        primary: theme.tabBarActive,
        background: theme.background,
        card: theme.background,
        text: theme.text,
        border: theme.border,
        notification: theme.error,
      },
      fonts: {
        regular: { fontFamily: 'System', fontWeight: '400' as const },
        medium: { fontFamily: 'System', fontWeight: '500' as const },
        bold: { fontFamily: 'System', fontWeight: '700' as const },
        heavy: { fontFamily: 'System', fontWeight: '800' as const },
      },
    }),
    [theme.resolvedColorScheme, theme.tabBarActive, theme.background, theme.text, theme.border, theme.error],
  );
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.background).catch(() => {});
  }, [theme.background]);

  // Shared screen option sets (durations live in lib/motion). NOTE: these replace the previous
  // near-instant `animationDuration: 50`; revert by setting `animation: 'none'` if the old feel is preferred.
  const web = Platform.OS === 'web';
  const pushOptions = {
    headerShown: true,
    animation: web ? ('none' as const) : ('ios_from_right' as const),
    animationDuration: Duration.slow,
    gestureEnabled: true,
    fullScreenGestureEnabled: true,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: theme.background },
    contentStyle: { backgroundColor: theme.background },
  };
  const modalOptions = {
    presentation: 'fullScreenModal' as const,
    contentStyle: { backgroundColor: theme.background },
    animation: web ? ('none' as const) : ('slide_from_bottom' as const),
    animationDuration: Duration.slow,
  };
  const fadeOptions = {
    animation: web ? ('none' as const) : ('fade' as const),
    animationDuration: Duration.fast,
  };
  const [showSplash, setShowSplash] = useState(true);
  const handleSplashComplete = useCallback(() => setShowSplash(false), []);

  useEffect(() => {
    const loadFonts = async () => {
      try {
        await Font.loadAsync({
          // Load any custom fonts here if needed
        });
        setFontsLoaded(true);
      } catch (error) {
        console.warn('Font loading failed:', error);
        setFontsLoaded(true);
      }
    };
    loadFonts();
  }, []);

  useEffect(() => {
    if (loading || profileLoading) {
      return;
    }

    SplashScreen.hideAsync();

    const firstSegment = segments[0] as string;
    const inAuthGroup = firstSegment === 'login' || firstSegment === 'onboarding' || firstSegment === 'auth';

    if (!session && !inAuthGroup) {
      router.replace('/login');
      return;
    }

    // Only a SUCCESSFUL fetch that returned no profile means "new user". A failed fetch
    // (offline / 5xx) shows a retry screen below instead of sending the user to onboarding.
    if (session && !profile && !profileError && segments[0] !== 'onboarding') {
      router.replace('/onboarding');
      return;
    }

    if (session && profile && inAuthGroup) {
      router.replace('/');
    }
  }, [session, profile, loading, profileLoading, profileError, segments, router]);

  const appReady = fontsLoaded && !loading;
  const splash = showSplash ? <AnimatedSplashScreen ready={appReady} onComplete={handleSplashComplete} /> : null;

  let content: React.ReactNode;
  if (!appReady) {
    content = <View style={[styles.container, { backgroundColor: theme.background }]} />;
  } else if (session && !profile && profileError) {
    content = (
      <View style={[styles.container, styles.retryContainer, { backgroundColor: theme.background }]}>
        <ThemedText variant="body" style={{ textAlign: 'center', marginBottom: 16 }}>
          Could not load your profile. Check your connection and try again.
        </ThemedText>
        <Button label="Retry" onPress={() => { refreshProfile(); }} loading={profileLoading} />
      </View>
    );
  } else {
    content = (
    <KeyboardInsetView style={[styles.container, { backgroundColor: theme.background }]}>
      {Platform.OS !== 'web' && <FCMInitializer />}
      <StatusBar style={theme.resolvedColorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerTitleStyle: { color: theme.text, fontWeight: '600' },
      }}>
        <Stack.Screen name="login" options={fadeOptions} />
        <Stack.Screen name="onboarding" options={fadeOptions} />
        <Stack.Screen name="(tabs)" options={fadeOptions} />
        <Stack.Screen name="add-match" options={modalOptions} />
        <Stack.Screen name="create-community" options={modalOptions} />
        <Stack.Screen name="create-session" options={modalOptions} />
        <Stack.Screen name="chat" options={modalOptions} />
        <Stack.Screen name="settings" options={{ ...pushOptions, title: 'Settings' }} />
        <Stack.Screen name="community/[id]" options={{ ...pushOptions, title: 'Community' }} />
        <Stack.Screen name="community/[id]/members" options={{ ...pushOptions, title: 'Members' }} />
        <Stack.Screen name="community/[id]/info" options={{ ...pushOptions, title: 'Community Info' }} />
        <Stack.Screen name="community/[id]/pending-matches" options={{ ...pushOptions, title: 'Pending Matches' }} />
        <Stack.Screen name="community/[id]/edit" options={{ ...pushOptions, title: 'Edit Community' }} />
        <Stack.Screen name="discover" options={{ ...pushOptions, title: 'Discover' }} />
        <Stack.Screen name="tournament/[id]" options={{ ...pushOptions, title: 'Tournament' }} />
        <Stack.Screen name="tournament/[id]/manage" options={{ ...pushOptions, title: 'Manage tournament' }} />
        <Stack.Screen name="tournament/[id]/fields" options={{ ...pushOptions, title: 'Entry form' }} />
        <Stack.Screen name="tournament/[id]/module-form" options={modalOptions} />
        <Stack.Screen name="tournament/[id]/module/[moduleId]" options={{ ...pushOptions, title: 'Module' }} />
        <Stack.Screen name="tournament/[id]/module/[moduleId]/manage" options={{ ...pushOptions, title: 'Manage module' }} />
        <Stack.Screen name="tournament/[id]/module/[moduleId]/entry-form" options={modalOptions} />
        <Stack.Screen name="tournament/[id]/module/[moduleId]/seeding" options={{ ...pushOptions, title: 'Seeding & bracket' }} />
        <Stack.Screen name="tournament/[id]/module/[moduleId]/knockout" options={{ ...pushOptions, title: 'Build knockout' }} />
        <Stack.Screen name="tournament/[id]/module/[moduleId]/rounds" options={{ ...pushOptions, title: 'Rounds' }} />
        <Stack.Screen name="profile/[id]" options={pushOptions} />
      </Stack>
      <ConfettiHost />
      <ToastHost />
    </KeyboardInsetView>
    );
  }

  // The splash stays at a stable position so its intro never restarts when the app mounts beneath it.
  return (
    <NavThemeProvider value={navTheme}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {content}
        {splash}
      </View>
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  const [maintenanceActive, setMaintenanceActive] = useState<boolean | null>(null);
  const [versionOk, setVersionOk] = useState(true);
  const [storeUrl, setStoreUrl] = useState('');
  const [updateMessage, setUpdateMessage] = useState('');

  useEffect(() => {
    let active = true;

    (async () => {
      // Single query for both config rows. Fail open on error / timeout (5 s) so a hung request
      // can never leave the user on the splash screen forever.
      let rows: { key: string; value: unknown }[] = [];
      try {
        const result = await Promise.race([
          supabase
            .from('site_config')
            .select('key, value')
            .in('key', ['maintenance', 'min_app_version']),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]);
        rows = (result?.data ?? []) as { key: string; value: unknown }[];
      } catch {
        rows = [];
      }

      if (!active) return;

      const maintenanceRow = rows.find((r) => r.key === 'maintenance');
      const maintenanceValue = (maintenanceRow?.value ?? {}) as Record<string, unknown>;
      const maintenanceEnabled = Boolean(maintenanceValue.enabled);

      if (maintenanceEnabled) {
        setMaintenanceActive(true);
        return;
      }

      // Maintenance off — check version
      const currentVersion = Constants.expoConfig?.version ?? '0.0.0';
      const versionRow = rows.find((r) => r.key === 'min_app_version');
      const versionValue = (versionRow?.value ?? {}) as Record<string, unknown>;
      const minVersion = typeof versionValue.min_version === 'string' ? versionValue.min_version : '0.0.0';
      const storeUrl = typeof versionValue.store_url === 'string' ? versionValue.store_url : '';
      const updateMessage = typeof versionValue.message === 'string' ? versionValue.message : '';

      if (!isVersionSatisfied(currentVersion, minVersion)) {
        setVersionOk(false);
        setStoreUrl(storeUrl);
        setUpdateMessage(updateMessage);
      }

      setMaintenanceActive(false);
    })();

    return () => { active = false; };
  }, []);

  // The native splash is normally hidden by RootNavigator, which is not mounted for the
  // maintenance / forced-update screens - hide it here so those screens are actually visible.
  const gateScreenShown = maintenanceActive === true || !versionOk;
  useEffect(() => {
    if (gateScreenShown) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [gateScreenShown]);

  // While checking — render a splash-coloured view (no white flash, no flash of any screen)
  if (maintenanceActive === null) {
    return <View style={[styles.container, { backgroundColor: '#000000' }]} />;
  }

  // Maintenance on — show the screen directly, no providers needed
  if (maintenanceActive) {
    return (
      <GestureHandlerRootView style={styles.container}>
        <MaintenanceScreen />
      </GestureHandlerRootView>
    );
  }

  // Version too old — forced update screen, no providers needed
  if (!versionOk) {
    return (
      <GestureHandlerRootView style={styles.container}>
        <ForcedUpdateScreen message={updateMessage} storeUrl={storeUrl} />
      </GestureHandlerRootView>
    );
  }

  // Normal — full provider tree
  return (
    <GestureHandlerRootView style={styles.container}>
      <ThemeProvider>
        <AuthProvider>
          <NotificationsProvider>
            <WebFrame>
              <RootNavigator />
            </WebFrame>
          </NotificationsProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  retryContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});