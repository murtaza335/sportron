// src/lib/firebase.ts
import { Platform } from 'react-native';

let firebaseApp: any = null;
let analytics: any = null;

export const initFirebase = () => {
  if (Platform.OS !== 'web') return; // Only initialize on web

  // Lazy load Firebase to avoid bundling in native builds
  import('firebase/app').then(({ initializeApp }) => {
    const firebaseConfig = {
      apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'YOUR_API_KEY',
      authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'YOUR_AUTH_DOMAIN',
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'YOUR_PROJECT_ID',
      storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'YOUR_STORAGE_BUCKET',
      messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || 'YOUR_MESSAGING_SENDER_ID',
      appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || 'YOUR_APP_ID',
      measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || 'YOUR_MEASUREMENT_ID',
    };

    firebaseApp = initializeApp(firebaseConfig);

    // Initialize Analytics if available
    import('firebase/analytics').then(({ getAnalytics }) => {
      try {
        analytics = getAnalytics(firebaseApp);
      } catch (e) {
        console.warn('Firebase Analytics initialization failed:', e);
      }
    });
  });
};

export { firebaseApp, analytics };
