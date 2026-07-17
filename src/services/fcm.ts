import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import messaging, { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import { supabase } from '@/lib/supabase';
import { PermissionStatus } from 'expo-modules-core';

export type NotificationType =
  | 'match_pending'
  | 'match_approved'
  | 'match_rejected'
  | 'match_liked'
  | 'match_commented';

export interface NotificationData {
  type: NotificationType;
  matchId?: string;
  senderId?: string;
  senderName?: string;
  commentId?: string;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let finalStatus: PermissionStatus = PermissionStatus.DENIED;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#000000',
    });

    await Notifications.setNotificationChannelAsync('match-updates', {
      name: 'Match Updates',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#000000',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
      android: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    finalStatus = status;
  } else {
    finalStatus = existingStatus;
  }

  if (finalStatus !== 'granted') {
    console.warn('Failed to get push token for push notification!');
    return null;
  }

  try {
    const fcmToken = await messaging().getToken();
    console.log('FCM Token:', fcmToken);
    return fcmToken;
  } catch (error) {
    console.error('Error getting FCM token:', error);
    return null;
  }
}

export async function saveFCMTokenToProfile(userId: string, fcmToken: string): Promise<void> {
  try {
    const { data: existingProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('fcm_tokens')
      .eq('id', userId)
      .single();

    if (fetchError) {
      console.error('Error fetching profile for FCM token:', fetchError);
      return;
    }

    const existingTokens = existingProfile?.fcm_tokens || [];
    const updatedTokens = [...new Set([...existingTokens, fcmToken])];

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ fcm_tokens: updatedTokens })
      .eq('id', userId);

    if (updateError) {
      console.error('Error saving FCM token:', updateError);
    }
  } catch (error) {
    console.error('Error in saveFCMTokenToProfile:', error);
  }
}

export async function removeFCMTokenFromProfile(userId: string, fcmToken: string): Promise<void> {
  try {
    const { data: existingProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('fcm_tokens')
      .eq('id', userId)
      .single();

    if (fetchError) {
      console.error('Error fetching profile for FCM token removal:', fetchError);
      return;
    }

    const existingTokens = existingProfile?.fcm_tokens || [];
    const updatedTokens = existingTokens.filter((token: string) => token !== fcmToken);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ fcm_tokens: updatedTokens })
      .eq('id', userId);

    if (updateError) {
      console.error('Error removing FCM token:', updateError);
    }
  } catch (error) {
    console.error('Error in removeFCMTokenFromProfile:', error);
  }
}

export function setupNotificationListeners(
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void
) {
  const foregroundSubscription = Notifications.addNotificationReceivedListener(
    onNotificationReceived || (() => {})
  );

  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    onNotificationResponse || (() => {})
  );

  return () => {
    foregroundSubscription.remove();
    responseSubscription.remove();
  };
}

export async function setupBackgroundMessageHandler(): Promise<void> {
  messaging().setBackgroundMessageHandler(async (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
    console.log('Background message received:', remoteMessage);
  });
}

export function setupForegroundMessageHandler(
  onMessage: (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => void
): () => void {
  const unsubscribe = messaging().onMessage(onMessage);
  return unsubscribe;
}

export function setupTokenRefreshListener(
  onTokenRefresh: (token: string) => void
): () => void {
  const unsubscribe = messaging().onTokenRefresh(onTokenRefresh);
  return unsubscribe;
}

export async function getNotificationPermissions(): Promise<Notifications.PermissionStatus> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: NotificationData
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: data as Record<string, unknown> | undefined,
      sound: true,
    },
    trigger: null,
  });
}

export function parseNotificationData(notification: Notifications.Notification): NotificationData | null {
  const data = notification.request.content.data as NotificationData | undefined;
  return data ?? null;
}

export function parseNotificationResponseData(response: Notifications.NotificationResponse): NotificationData | null {
  const data = response.notification.request.content.data as NotificationData | undefined;
  return data ?? null;
}