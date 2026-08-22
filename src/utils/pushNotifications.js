// utils/pushNotifications.js
import { Platform } from 'react-native';

let webMessagingInstance = null;
let webForegroundHandler = null;

/**
 * Request push permission and obtain FCM token for Web (PWA).
 * For native platforms, this is a placeholder – native FCM is handled elsewhere.
 */
export const requestPushPermissionAndGetToken = async () => {
  if (Platform.OS === 'web') {
    try {
      // Dynamically import Firebase modules to avoid bundling in native builds
      const { initializeApp } = await import('firebase/app');
      const { getMessaging, getToken, isSupported } = await import('firebase/messaging');

      const firebaseConfig = {
        apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'YOUR_API_KEY',
        authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'YOUR_AUTH_DOMAIN',
        projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'YOUR_PROJECT_ID',
        storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'YOUR_STORAGE_BUCKET',
        messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || 'YOUR_MESSAGING_SENDER_ID',
        appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || 'YOUR_APP_ID',
      };

      // Initialize Firebase app (will be a no‑op if already initialized)
      const app = initializeApp(firebaseConfig);
      const supported = await isSupported();
      if (!supported) {
        console.warn('Firebase messaging not supported in this browser');
        return null;
      }
      const messaging = getMessaging(app);
      webMessagingInstance = messaging;

      // Register the service worker for background messages (PWA)
      if (navigator.serviceWorker) {
        try {
          await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        } catch (e) {
          console.warn('Service worker registration failed:', e);
        }
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('Notification permission not granted');
        return null;
      }

      const token = await getToken(messaging, {
        vapidKey: process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY || 'YOUR_VAPID_PUBLIC_KEY',
      });

      return token;
    } catch (error) {
      console.error('Web push notification error:', error);
    }
  } else {
    // Native platforms use @react-native-firebase/messaging elsewhere
    // Placeholder for consistency
    return null;
  }
};

/**
 * Set up foreground message handler for web.
 * Call this after permission is granted to receive notifications while app is open.
 */
export const setupWebForegroundHandler = async (onMessageCallback) => {
  if (Platform.OS !== 'web' || !webMessagingInstance) return () => {};

  try {
    const { onMessage } = await import('firebase/messaging');
    webForegroundHandler = onMessage(webMessagingInstance, onMessageCallback);
    return () => {
      if (webForegroundHandler) {
        webForegroundHandler();
        webForegroundHandler = null;
      }
    };
  } catch (error) {
    console.error('Failed to setup web foreground handler:', error);
    return () => {};
  }
};

/**
 * Get the web messaging instance for token refresh, etc.
 */
export const getWebMessaging = () => webMessagingInstance;

/**
 * Set up token refresh listener for web.
 */
export const setupWebTokenRefreshListener = async (onTokenRefresh) => {
  if (Platform.OS !== 'web' || !webMessagingInstance) return () => {};

  try {
    const { onTokenRefresh: firebaseOnTokenRefresh } = await import('firebase/messaging');
    const unsubscribe = firebaseOnTokenRefresh(webMessagingInstance, onTokenRefresh);
    return unsubscribe;
  } catch (error) {
    console.error('Failed to setup web token refresh listener:', error);
    return () => {};
  }
};
