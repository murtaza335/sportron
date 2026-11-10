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
  // User id FCM was initialised for, and the listener cleanup returned by initialize().
  // Keyed per user (not once per process) so account switches re-register the token and the
  // previous user's listeners are removed (BUG-H8).
  const initializedForRef = useRef<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const lastResponse = Notifications.useLastNotificationResponse();
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      // Signed out: tear down listeners so they cannot save tokens for the old user.
      cleanupRef.current?.();
      cleanupRef.current = null;
      initializedForRef.current = null;
      return;
    }
    if (!profile || isLoading || initializedForRef.current === userId) return;

    cleanupRef.current?.();
    cleanupRef.current = null;
    initializedForRef.current = userId;

    initialize().then((cleanup) => {
      if (!cleanup) return;
      if (initializedForRef.current === userId) {
        cleanupRef.current = cleanup;
      } else {
        cleanup();
      }
    });
  }, [userId, profile, initialize, isLoading]);

  // Remove listeners when the component unmounts.
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

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
