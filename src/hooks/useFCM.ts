import { useCallback, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import messaging from '@react-native-firebase/messaging';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
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

export function useFCM() {
  const { user, refreshProfile } = useAuth();
  const [notificationPermission, setNotificationPermission] = useState<Notifications.PermissionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handledResponseIdRef = useRef<string | null>(null);

  const navigateToNotification = useCallback(
    async (data: NotificationData) => {
      switch (data.type) {
        case 'ping': {
          if (data.pingId && data.communityId) {
            router.push({
              pathname: '/ping-response',
              params: {
                pingId: data.pingId,
                communityId: data.communityId,
                message: data.message ?? '',
                senderName: data.senderName ?? 'Someone',
              },
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
        case 'feedback_prompt':
        case 'session_chat_message':
        case 'session_chat_reply': {
          if (data.sessionId) {
            router.navigate({
              pathname: '/history',
              params: { sessionId: data.sessionId },
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
        case 'ping_response':
        case 'community_invite':
        case 'community_invite_accepted':
        case 'community_invite_rejected':
        case 'community_chat_message':
        case 'community_chat_reply': {
          if (data.communityId) {
            router.push({
              pathname: '/community/[id]',
              params: { id: data.communityId },
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
      await setupBackgroundMessageHandler();

      const unsubscribeForeground = setupForegroundMessageHandler(async (remoteMessage) => {
        const parsed = parseRemoteMessageForLocal(remoteMessage);
        if (parsed) {
          await scheduleLocalNotification(parsed.title, parsed.body, parsed.data);
        }
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

  return {
    initialize,
    requestPermissions,
    handleNotificationResponse,
    notificationPermission,
    isLoading,
  };
}