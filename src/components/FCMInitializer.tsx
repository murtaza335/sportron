import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useFCM } from '@/hooks/useFCM';
import { useAuth } from '@/contexts/AuthContext';

function FCMInitializerNative() {
  const { session, profile } = useAuth();
  const { initialize, handleNotificationResponse } = useFCM();
  const initializedRef = useRef(false);
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (session && profile && !initializedRef.current) {
      initializedRef.current = true;
      initialize();
    }
  }, [session, profile, initialize]);

  useEffect(() => {
    if (lastResponse && session && profile) {
      handleNotificationResponse(lastResponse);
      Notifications.clearLastNotificationResponse();
    }
  }, [lastResponse, session, profile, handleNotificationResponse]);

  return null;
}

export function FCMInitializer() {
  if (Platform.OS === 'web') {
    return null;
  }

  return <FCMInitializerNative />;
}
