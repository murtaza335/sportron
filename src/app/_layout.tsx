import * as Font from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { NotificationsProvider } from '@/contexts/NotificationsContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { FCMInitializer } from '@/components/FCMInitializer';

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
      <StatusBar style="auto" />
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
          name="notifications"
          options={{
            headerShown: true,
            title: 'Notifications',
            animation: 'slide_from_right',
            animationDuration: 50,
            headerShadowVisible: false,
            headerStyle: { backgroundColor: theme.background },
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
        <Stack.Screen
          name="ping-response"
          options={{
            headerShown: true,
            title: 'Ping Reply',
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