# FCM (Firebase Cloud Messaging) Implementation Guide

## Overview
This guide covers implementing push notifications using Firebase Cloud Messaging (FCM) with Expo for the T3Seecs table tennis app.

## Prerequisites
1. Firebase Project at https://console.firebase.google.com
2. Expo project configured with EAS
3. Google Services configuration files

## Firebase Console Setup

### 1. Create Firebase Project
- Go to Firebase Console
- Create new project or select existing
- Enable "Google Analytics" (optional but recommended)

### 2. Add Apps
#### iOS App
- Bundle ID: `com.yourcompany.t3seecs` (match your app.json)
- Download `GoogleService-Info.plist`
- Place in project root

#### Android App
- Package name: `com.yourcompany.t3seecs` (match your app.json)
- Download `google-services.json`
- Place in project root

### 3. Enable Cloud Messaging
- In Firebase Console > Project Settings > Cloud Messaging
- Note down **Server Key** (legacy) or use **Firebase Admin SDK** for server-side

### 4. Configure APNs (iOS)
- In Firebase Console > Project Settings > Cloud Messaging > iOS app configuration
- Upload APNs Auth Key (from Apple Developer Console)
- Or upload APNs Certificate

## Expo Configuration

### 1. Install Dependencies
```bash
npx expo install expo-notifications expo-device expo-constants
npx expo install @react-native-firebase/app @react-native-firebase/messaging
```

### 2. app.json / app.config.js
```json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#000000",
          "defaultChannel": "default"
        }
      ],
      [
        "@react-native-firebase/app",
        {
          "ios": "./GoogleService-Info.plist",
          "android": "./google-services.json"
        }
      ],
      "@react-native-firebase/messaging"
    ],
    "ios": {
      "bundleIdentifier": "com.yourcompany.t3seecs",
      "googleServicesFile": "./GoogleService-Info.plist"
    },
    "android": {
      "package": "com.yourcompany.t3seecs",
      "googleServicesFile": "./google-services.json"
    }
  }
}
```

### 3. eas.json (for build)
```json
{
  "build": {
    "preview": {
      "ios": {
        "simulator": false
      }
    },
    "production": {}
  }
}
```

## Code Implementation

### 1. FCM Service (`src/services/fcm.ts`)
- Token registration and storage
- Foreground/background message handlers
- Notification permission handling

### 2. Notification Types
```typescript
type NotificationType = 
  | 'match_pending'      // Match needs approval
  | 'match_approved'     // Match was approved
  | 'match_rejected'     // Match was rejected
  | 'match_liked'        // Someone liked your match
  | 'match_commented';   // Someone commented on your match
```

### 3. Server-Side (Supabase Edge Functions or Backend)
- Store FCM tokens in `profiles` table
- Trigger notifications on database changes
- Use Firebase Admin SDK to send notifications

## Database Schema Updates

```sql
-- Add to profiles table
ALTER TABLE profiles ADD COLUMN fcm_tokens TEXT[] DEFAULT '{}';

-- Optional: notification preferences
ALTER TABLE profiles ADD COLUMN notification_preferences JSONB DEFAULT '{
  "match_pending": true,
  "match_approved": true,
  "match_rejected": true,
  "match_liked": true,
  "match_commented": true
}';
```

## Supabase Edge Function for Notifications

Create `supabase/functions/send-notification/index.ts`:
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const admin = require('firebase-admin');

serve(async (req) => {
  const { userIds, title, body, data, type } = await req.json();
  
  // Get FCM tokens for users
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  
  const { data: profiles } = await supabase
    .from('profiles')
    .select('fcm_tokens')
    .in('id', userIds);
  
  const tokens = profiles?.flatMap(p => p.fcm_tokens || []) || [];
  
  // Send via Firebase Admin SDK
  const messaging = admin.messaging();
  await messaging.sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: { ...data, type },
  });
  
  return new Response(JSON.stringify({ success: true }));
});
```

## Client Integration

### 1. Initialize in `_layout.tsx`
```typescript
import { useEffect } from 'react';
import { useFCM } from '@/hooks/useFCM';

export default function RootLayout() {
  const { initialize } = useFCM();
  
  useEffect(() => {
    initialize();
  }, []);
  
  return <ThemeProvider>...</ThemeProvider>;
}
```

### 2. Handle Incoming Notifications
```typescript
// In useFCM hook
messaging().onMessage(async (remoteMessage) => {
  // Show local notification when app is in foreground
  await Notifications.scheduleNotificationAsync({
    content: {
      title: remoteMessage.notification?.title,
      body: remoteMessage.notification?.body,
      data: remoteMessage.data,
    },
    trigger: null,
  });
});

// Handle notification tap
Notifications.addNotificationResponseReceivedListener((response) => {
  const data = response.notification.request.content.data;
  // Navigate based on data.type
  navigateToMatch(data.matchId);
});
```

## Testing Checklist

- [ ] Development build on physical device (not simulator)
- [ ] Permissions granted for notifications
- [ ] FCM token registered in database
- [ ] Test each notification type:
  - [ ] Match pending approval
  - [ ] Match approved
  - [ ] Match rejected
  - [ ] Match liked
  - [ ] Match commented
- [ ] Test foreground/background/terminated states
- [ ] Test deep linking from notification tap

## Production Deployment

1. Build with EAS: `eas build --platform all`
2. Submit to App Store / Play Store
3. Configure production Firebase project
4. Set up monitoring in Firebase Console

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Token not received | Check GoogleService-Info.plist / google-services.json |
| Notifications not showing | Verify APNs key, check notification permissions |
| Duplicate tokens | Deduplicate in database, handle token refresh |
| iOS not receiving | Ensure "Push Notifications" capability in Xcode |

## Resources
- [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [React Native Firebase Messaging](https://rnfirebase.io/messaging/)
- [FCM REST API](https://firebase.google.com/docs/cloud-messaging/http-server-protocol)