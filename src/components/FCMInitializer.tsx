import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useFCM } from '@/hooks/useFCM';
import { useAuth } from '@/contexts/AuthContext';

// All hooks are called unconditionally (rules-of-hooks).
// On web, useLastNotificationResponse is a no-op so it is safe to call.
export function FCMInitializer() {
  const { session, profile } = useAuth();
  const { initialize, handleNotificationResponse, isLoading } = useFCM();
  const initializedRef = useRef(false);
  const lastResponse = Notifications.useLastNotificationResponse();

  // Initialize FCM once when we have a valid session/profile.
  useEffect(() => {
    if (session && profile && !initializedRef.current && !isLoading) {
      initializedRef.current = true;
      initialize();
    }
  }, [session, profile, initialize, isLoading]);

  // Handle notification taps (native only; lastResponse is null on web).
  useEffect(() => {
    if (lastResponse && session && profile) {
      handleNotificationResponse(lastResponse);
      if (Platform.OS !== 'web') {
        Notifications.clearLastNotificationResponse();
      }
    }
  }, [lastResponse, session, profile, handleNotificationResponse]);

  return null;
}
