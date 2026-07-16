import { useEffect, useCallback, useState } from 'react';
import * as Notifications from 'expo-notifications';
import messaging from '@react-native-firebase/messaging';
import { useAuth } from '@/contexts/AuthContext';
import {
  registerForPushNotificationsAsync,
  saveFCMTokenToProfile,
  setupNotificationListeners,
  setupBackgroundMessageHandler,
  setupForegroundMessageHandler,
  setupTokenRefreshListener,
  getNotificationPermissions,
  scheduleLocalNotification,
  parseNotificationResponseData,
  NotificationData,
  NotificationType,
} from '@/services/fcm';

export function useFCM() {
  const { user, profile, refreshProfile } = useAuth();
  const [notificationPermission, setNotificationPermission] = useState<Notifications.PermissionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleNotificationResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      const data = parseNotificationResponseData(response);
      if (!data) return;

      switch (data.type) {
        case 'match_pending':
        case 'match_approved':
        case 'match_rejected':
          if (data.matchId) {
            console.log('Navigate to match:', data.matchId);
          }
          break;
        case 'match_liked':
        case 'match_commented':
          if (data.matchId) {
            console.log('Navigate to match:', data.matchId);
          }
          break;
        default:
          break;
      }
    },
    []
  );

  const handleNotificationReceived = useCallback(
    (notification: Notifications.Notification) => {
      console.log('Notification received in foreground:', notification);
    },
    []
  );

  const initialize = useCallback(async () => {
    if (!user?.id) return;

    setIsLoading(true);

    try {
      await setupBackgroundMessageHandler();

      const unsubscribeForeground = setupForegroundMessageHandler((remoteMessage) => {
        console.log('Foreground FCM message:', remoteMessage);
      });

      const unsubscribeTokenRefresh = setupTokenRefreshListener(async (token) => {
        if (user?.id) {
          await saveFCMTokenToProfile(user.id, token);
        }
      });

      const cleanupListeners = setupNotificationListeners(
        handleNotificationReceived,
        handleNotificationResponse
      );

      const permission = await getNotificationPermissions();
      setNotificationPermission(permission);

      if (permission !== 'granted') {
        const fcmToken = await registerForPushNotificationsAsync();
        if (fcmToken && user?.id) {
          await saveFCMTokenToProfile(user.id, fcmToken);
        }
        const newPermission = await getNotificationPermissions();
        setNotificationPermission(newPermission);
      } else {
        const fcmToken = await messaging().getToken();
        if (fcmToken && user?.id) {
          await saveFCMTokenToProfile(user.id, fcmToken);
        }
      }

      return () => {
        unsubscribeForeground();
        unsubscribeTokenRefresh();
        cleanupListeners();
      };
    } catch (error) {
      console.error('FCM initialization error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, handleNotificationReceived, handleNotificationResponse]);

  const requestPermissions = useCallback(async () => {
    if (!user?.id) return;

    setIsLoading(true);
    try {
      const fcmToken = await registerForPushNotificationsAsync();
      if (fcmToken) {
        await saveFCMTokenToProfile(user.id, fcmToken);
        await refreshProfile();
        const permission = await getNotificationPermissions();
        setNotificationPermission(permission);
      }
    } catch (error) {
      console.error('Permission request error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, refreshProfile]);

  const sendTestNotification = useCallback(async (type: NotificationType = 'match_liked') => {
    if (!user?.id) return;

    const notificationData: NotificationData = {
      type,
      matchId: 'test-match-id',
      senderId: user.id,
      senderName: profile?.display_name || 'Test User',
    };

    const notificationTitles: Record<NotificationType, string> = {
      match_pending: 'Match Pending Approval',
      match_approved: 'Match Approved!',
      match_rejected: 'Match Rejected',
      match_liked: 'New Like on Your Match',
      match_commented: 'New Comment on Your Match',
    };

    const notificationBodies: Record<NotificationType, string> = {
      match_pending: 'A match needs your approval',
      match_approved: 'Your match has been approved!',
      match_rejected: 'Your match was disputed',
      match_liked: `${profile?.display_name || 'Someone'} liked your match`,
      match_commented: `${profile?.display_name || 'Someone'} commented on your match`,
    };

    await scheduleLocalNotification(
      notificationTitles[type],
      notificationBodies[type],
      notificationData
    );
  }, [user, profile]);

  return {
    initialize,
    requestPermissions,
    sendTestNotification,
    notificationPermission,
    isLoading,
  };
}

export function useNotificationNavigation() {
  const handleNotificationResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      const data = parseNotificationResponseData(response);
      if (!data) return;

      // This would be implemented with your router/navigation
      console.log('Navigation needed for:', data);
    },
    []
  );

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    return () => subscription.remove();
  }, [handleNotificationResponse]);
}