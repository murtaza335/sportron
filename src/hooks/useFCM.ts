import { useEffect, useCallback, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
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
  parseRemoteMessageForLocal,
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
        case 'match_liked':
        case 'match_commented':
        case 'community_match_pending':
        case 'community_match_approved':
        case 'community_match_disputed':
          if (data.matchId) {
            console.log('Navigate to match:', data.matchId);
          }
          break;
        case 'session_application':
        case 'session_accepted':
        case 'session_rejected':
        case 'session_reminder':
        case 'session_chat_message':
          if (data.sessionId) {
            console.log('Navigate to session:', data.sessionId);
          }
          break;
        case 'ping':
          if (data.pingId && data.communityId) {
            const params = new URLSearchParams({
              pingId: data.pingId,
              communityId: data.communityId,
              message: data.message ?? '',
              senderName: data.senderName ?? 'Someone',
            });
            router.push(`/ping-response?${params.toString()}`);
          }
          break;
        case 'ping_response':
        case 'join_request':
        case 'join_approved':
        case 'join_rejected':
        case 'member_removed':
        case 'admin_transferred':
          if (data.communityId) {
            console.log('Navigate to community:', data.communityId);
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

  const sendTestNotification = useCallback(async (type: NotificationType = 'match_liked') => {
    if (!user?.id) return;

    const notificationData: NotificationData = {
      type,
      matchId: 'test-match-id',
      senderId: user.id,
      senderName: profile?.username || 'Test User',
    };

    const notificationTitles: Record<NotificationType, string> = {
      match_pending: 'Match Pending Approval',
      match_approved: 'Match Approved!',
      match_rejected: 'Match Rejected',
      match_liked: 'New Like on Your Match',
      match_commented: 'New Comment on Your Match',
      session_application: 'New Session Applicant',
      session_accepted: 'Session Application Accepted',
      session_rejected: 'Session Application Declined',
      session_reminder: 'Upcoming Session Reminder',
      feedback_prompt: 'Session Feedback',
      ping: 'Ping from Community',
      ping_response: 'Ping Response',
      join_request: 'New Join Request',
      join_approved: 'Join Request Approved',
      join_rejected: 'Join Request Declined',
      match_approval_request: 'Match Approval Request',
      match_approved_community: 'Match Approved',
      match_disputed: 'Match Disputed',
      member_removed: 'Removed from Community',
      admin_transferred: 'Admin Rights Transferred',
      admin_promoted: 'Promoted to Admin',
      community_match_pending: 'Match Pending Approval',
      community_match_approved: 'Match Approved',
      community_match_disputed: 'Match Disputed',
      session_chat_message: 'Session Chat',
    };

    const notificationBodies: Record<NotificationType, string> = {
      match_pending: 'A match needs your approval',
      match_approved: 'Your match has been approved!',
      match_rejected: 'Your match was disputed',
      match_liked: `${profile?.username || 'Someone'} liked your match`,
      match_commented: `${profile?.username || 'Someone'} commented on your match`,
      session_application: `${profile?.username || 'Someone'} applied to your session`,
      session_accepted: 'You were accepted into the session',
      session_rejected: 'Your session application was declined',
      session_reminder: 'Your session is coming up soon',
      feedback_prompt: 'Please provide feedback for your session',
      ping: `${profile?.username || 'Someone'} pinged the community`,
      ping_response: `${profile?.username || 'Someone'} responded to your ping`,
      join_request: `${profile?.username || 'Someone'} wants to join your community`,
      join_approved: 'You were accepted into the community',
      join_rejected: 'Your request to join was declined',
      match_approval_request: 'A match needs your approval',
      match_approved_community: 'Your match was approved',
      match_disputed: 'Your match was disputed',
      member_removed: 'You were removed from the community',
      admin_transferred: 'Admin rights were transferred to you',
      admin_promoted: `You were promoted to admin by ${profile?.username || 'an admin'}`,
      community_match_pending: 'A community match needs your approval',
      community_match_approved: 'Your community match was approved',
      community_match_disputed: 'Your community match was disputed',
      session_chat_message: 'New message in a session',
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