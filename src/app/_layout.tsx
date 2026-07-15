import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const theme = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const { session, profile, loading, profileLoading } = useAuth();

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

  if (loading || (session && profileLoading)) {
    return (
      <View style={[styles.loader, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.text} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="add-match"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
