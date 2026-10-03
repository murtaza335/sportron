import * as Font from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Constants from 'expo-constants';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { NotificationsProvider } from '@/contexts/NotificationsContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { FCMInitializer } from '@/components/FCMInitializer';
import { ForcedUpdateScreen } from '@/components/ForcedUpdateScreen';
import { MaintenanceScreen } from '@/components/MaintenanceScreen';
import { isVersionSatisfied } from '@/services/config';
import { supabase } from '@/lib/supabase';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const theme = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const { session, profile, loading, profileLoading } = useAuth();
  const [fontsLoaded, setFontsLoaded] = useState(false);

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

    if (session && !profile && segments[0] !== 'onboarding') {
      router.replace('/onboarding');
      return;
    }

    if (session && profile && inAuthGroup) {
      router.replace('/');
    }
  }, [session, profile, loading, profileLoading, segments, router]);

  if (!fontsLoaded || loading) {
    return (
      <View style={[styles.loader, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.text} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {Platform.OS !== 'web' && <FCMInitializer />}
      <StatusBar style={theme.resolvedColorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{
        headerShown: false,
        animationDuration: 50,
        contentStyle: { backgroundColor: theme.background },
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerTitleStyle: { color: theme.text, fontWeight: '600' },
      }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="add-match"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
            animationDuration: 50,
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            headerShown: true,
            title: 'Settings',
            animation: 'slide_from_right',
            animationDuration: 50,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: theme.background },
          }}
        />
        <Stack.Screen
          name="community/[id]"
          options={{
            headerShown: true,
            title: 'Community',
            animation: 'slide_from_right',
            animationDuration: 50,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: theme.background },
          }}
        />
        <Stack.Screen
          name="community/[id]/members"
          options={{
            headerShown: true,
            title: 'Members',
            animation: 'slide_from_right',
            animationDuration: 50,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: theme.background },
          }}
        />
        <Stack.Screen
          name="community/[id]/info"
          options={{
            headerShown: true,
            title: 'Community Info',
            animation: 'slide_from_right',
            animationDuration: 50,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: theme.background },
          }}
        />
        <Stack.Screen
          name="community/[id]/pending-matches"
          options={{
            headerShown: true,
            title: 'Pending Matches',
            animation: 'slide_from_right',
            animationDuration: 50,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: theme.background },
          }}
        />
        <Stack.Screen
          name="community/[id]/edit"
          options={{
            headerShown: true,
            title: 'Edit Community',
            animation: 'slide_from_right',
            animationDuration: 50,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: theme.background },
          }}
        />
        <Stack.Screen
          name="create-community"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
            animationDuration: 50,
          }}
        />
        <Stack.Screen
          name="discover"
          options={{
            headerShown: true,
            title: 'Discover',
            animation: 'slide_from_right',
            animationDuration: 50,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: theme.background },
          }}
        />
        <Stack.Screen
          name="create-session"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
            animationDuration: 50,
          }}
        />
        <Stack.Screen
          name="chat"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
            animationDuration: 50,
          }}
        />
        <Stack.Screen
          name="profile/[id]"
          options={{
            headerShown: true,
            animation: 'slide_from_right',
            animationDuration: 50,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: theme.background },
          }}
        />
      </Stack>
    </View>
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
      // Single query for both config rows
      const { data } = await supabase
        .from('site_config')
        .select('key, value')
        .in('key', ['maintenance', 'min_app_version']);

      if (!active) return;

      const rows = data ?? [];
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

  // While checking — render nothing (no flash of any screen)
  if (maintenanceActive === null) {
    return <View style={styles.container} />;
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
            <RootNavigator />
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
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});