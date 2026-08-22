import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { removeFCMToken } from '@/services/profiles';
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
  parseRemoteMessageForLocal,
  NotificationData,
} from '@/services/fcm';
import { requestPushPermissionAndGetToken, setupWebForegroundHandler, setupWebTokenRefreshListener } from '@/utils/pushNotifications';

async function isNotificationsEnabled(): Promise<boolean> {
  const val = await AsyncStorage.getItem('notifications-enabled');
  return val !== 'false';
}

export function useFCM() {
  const { user, refreshProfile } = useAuth();
  const [notificationPermission, setNotificationPermission] = useState<Notifications.PermissionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handledResponseIdRef = useRef<string | null>(null);

  const navigateToNotification = useCallback(
    async (data: NotificationData) => {
      switch (data.type) {
        case 'ping': {
          if (data.communityId) {
            router.push({
              pathname: '/community/[id]',
              params: { id: data.communityId },
            });
          }
          return;
        }
        case 'match_pending':
        case 'match_approved':
        case 'match_rejected':
        case 'match_liked':
        case 'match_commented':
        case 'community_match_pending':
        case 'community_match_approved':
        case 'community_match_disputed': {
          const matchId = data.matchId;
          if (!matchId) return;
          let communityId = data.communityId;
          if (!communityId) {
            try {
              const { data: match } = await supabase
                .from('community_matches')
                .select('community_id')
                .eq('id', matchId)
                .maybeSingle();
              communityId = match?.community_id ?? undefined;
            } catch (e) {
              console.error('Failed to resolve match community:', e);
            }
          }
          if (communityId) {
            router.push({
              pathname: '/community/[id]',
              params: { id: communityId, matchId },
            });
          }
          return;
        }
        case 'session_application':
        case 'session_accepted':
        case 'session_rejected':
        case 'session_left':
        case 'session_reminder':
        case 'feedback_prompt': {
          if (data.sessionId) {
            router.navigate({
              pathname: '/history',
              params: { sessionId: data.sessionId },
            });
          }
          return;
        }
        case 'session_chat_message':
        case 'session_chat_reply': {
          if (data.sessionId) {
            router.push({
              pathname: '/chat',
              params: { type: 'session', id: data.sessionId },
            });
          }
          return;
        }
        case 'join_request':
        case 'join_approved':
        case 'join_rejected':
        case 'member_removed':
        case 'admin_transferred':
        case 'admin_promoted':
        case 'community_invite':
        case 'community_invite_accepted':
        case 'community_invite_rejected': {
          if (data.communityId) {
            router.push({
              pathname: '/community/[id]',
              params: { id: data.communityId },
            });
          }
          return;
        }
        case 'community_chat_message':
        case 'community_chat_reply': {
          if (data.communityId) {
            router.push({
              pathname: '/chat',
              params: { type: 'community', id: data.communityId },
            });
          }
          return;
        }
        default:
          return;
      }
    },
    []
  );

  const handleNotificationResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      const responseId = response.notification.request.identifier;
      if (handledResponseIdRef.current === responseId) return;
      handledResponseIdRef.current = responseId;

      const data = parseNotificationResponseData(response);
      if (data) {
        navigateToNotification(data);
      }
    },
    [navigateToNotification]
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
      if (Platform.OS === 'web') {
        // Web: set up foreground handler and token refresh listener
        // Only if notifications are enabled and permission is granted
        const pushEnabled = await isNotificationsEnabled();
        if (pushEnabled && Notification.permission === 'granted') {
          const unsubscribeForeground = await setupWebForegroundHandler(async (payload: unknown) => {
            if (!(await isNotificationsEnabled())) return;
            // Handle foreground notification on web
            // The payload from Firebase web SDK has a different structure
            console.log('Foreground notification (Web):', payload);
          });

          const unsubscribeTokenRefresh = await setupWebTokenRefreshListener(async (token: string) => {
            if (user?.id && (await isNotificationsEnabled())) {
              await saveFCMTokenToProfile(user.id, token);
            }
          });

          return () => {
            unsubscribeForeground();
            unsubscribeTokenRefresh();
          };
        }
      } else {
        // Native platforms
        await setupBackgroundMessageHandler();

        const unsubscribeForeground = setupForegroundMessageHandler(async (remoteMessage) => {
          if (!(await isNotificationsEnabled())) return;
          const parsed = parseRemoteMessageForLocal(remoteMessage);
          if (parsed) {
            await scheduleLocalNotification(parsed.title, parsed.body, parsed.data);
          }
        });

        const unsubscribeTokenRefresh = setupTokenRefreshListener(async (token) => {
          if (user?.id && (await isNotificationsEnabled())) {
            await saveFCMTokenToProfile(user.id, token);
          }
        });

        const cleanupListeners = setupNotificationListeners(
          handleNotificationReceived,
          handleNotificationResponse
        );

        const permission = await getNotificationPermissions();
        setNotificationPermission(permission);

        const pushEnabled = await isNotificationsEnabled();
        if (pushEnabled) {
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
        } else {
          // Notifications disabled: make sure this device's token is not
          // registered so the backend cannot push to it (off survives restarts).
          try {
            const fcmToken = await messaging().getToken();
            if (fcmToken && user?.id) {
              await removeFCMToken(user.id, fcmToken);
            }
          } catch {
            // ignore
          }
        }

        return () => {
          unsubscribeForeground();
          unsubscribeTokenRefresh();
          cleanupListeners();
        };
      }
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
      if (Platform.OS === 'web') {
        const token = await requestPushPermissionAndGetToken();
        if (token) {
          await saveFCMTokenToProfile(user.id, token);
          await refreshProfile();
        }
      } else {
        const fcmToken = await registerForPushNotificationsAsync();
        if (fcmToken) {
          await saveFCMTokenToProfile(user.id, fcmToken);
          await refreshProfile();
          const permission = await getNotificationPermissions();
          setNotificationPermission(permission);
        }
      }
    } catch (error) {
      console.error('Permission request error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, refreshProfile]);

  return {
    initialize,
    requestPermissions,
    handleNotificationResponse,
    notificationPermission,
    isLoading,
  };
}