# FCM (Firebase Cloud Messaging) Implementation Guide

## Overview
This guide documents the push notification setup for the **T3Seecs / Sportron** app using Firebase Cloud Messaging (FCM) with Expo and Supabase Edge Functions.

Push delivery is **100% server-side**. When a row is inserted into `in_app_notifications` (match pending, pings, join requests, session apps, invites, ...) or into `session_messages` / `community_messages` (FCM-only chat), a Postgres trigger fires an async `pg_net.http_post` to an edge function that sends the FCM push. The client only inserts rows — it never calls the edge functions. Web can therefore always **send** pushes to app users (even though web cannot receive them).

## Current Configuration (app.json)

```json
{
  "expo": {
    "name": "Sportron",
    "slug": "T3S",
    "version": "1.0.0",
    "scheme": "t3s",
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/images/icon.png",
          "color": "#000000"
        }
      ],
      "@react-native-firebase/app",
      "@react-native-firebase/messaging",
      "@react-native-community/datetimepicker"
    ],
    "ios": {
      "icon": "./assets/images/icon.png",
      "googleServicesFile": "./GoogleService-Info.plist"
    },
    "android": {
      "package": "com.murtazabaig.T3S",
      "googleServicesFile": "./google-services.json"
    }
  }
}
```

## Firebase Console Setup

### 1. Create Firebase Project
- Go to [Firebase Console](https://console.firebase.google.com)
- Create a project (or reuse the existing one)

### 2. Add Apps
#### Android
- Package name: `com.murtazabaig.T3S` (must match `app.json`)
- Download `google-services.json` and place it in project root
- Reference it in `app.json` under `expo.android.googleServicesFile`

#### iOS
- Bundle ID must match whatever is set for the iOS build (set `ios.bundleIdentifier` in `app.json` and keep it synced with the Apple Developer account)
- Download `GoogleService-Info.plist` and place it in the project root
- Reference it in `app.json` under `expo.ios.googleServicesFile`

### 3. Configure APNs (iOS)
- Firebase Console > Project Settings > Cloud Messaging > iOS app configuration
- Upload an APNs Auth Key (from Apple Developer Console) or an APNs certificate

## Code Implementation

### Notification Types
Live union (in `src/types/index.ts`):

```
match_pending, match_approved, match_rejected, match_liked, match_commented,
session_application, session_accepted, session_rejected, session_left,
session_reminder, feedback_prompt, ping, ping_response,
join_request, join_approved, join_rejected,
match_approval_request, match_approved_community, match_disputed,
member_removed, admin_transferred, admin_promoted,
community_match_pending, community_match_approved, community_match_disputed,
community_invite, community_invite_accepted, community_invite_rejected
```

### Notification Data Payload
`NotificationData` in `src/services/fcm.ts` carries semantic IDs so taps can deep-link:
```
type, matchId, senderId, senderName, commentId, sessionId, communityId,
pingId, message, response, respondentName
```

### Sending a Push
1. A feature action calls a typed helper in `src/services/notifications.ts` (e.g. `notifyCommunityMatchApproved`)
2. `createNotification({ userId, type, title, body, data })` inserts via the `insert_notification` RPC — that's it. No FCM call on the client.
3. The `trg_fcm_push` trigger (migration 035) fires `pg_net.http_post` to `/functions/v1/send-notification` with `{ notification_id }`.
4. The `send-notification` edge function reads the notification row, fetches the recipient's `fcm_tokens`, signs a JWT with the Firebase service account, exchanges it for an OAuth token, and POSTs to the Firebase HTTP v1 API.

Chat messages work the same way: the `trg_session_chat_fcm_push` / `trg_community_chat_fcm_push` triggers fire `/functions/v1/send-chat-notification`, which computes recipients + titles from the DB and fans out.

### One-time setup (required for pushes to fire)
The triggers read the Supabase URL and service role key from Vault secrets. Run once in the SQL editor:

```sql
create extension if not exists supabase_vault;
select vault.create_secret('<YOUR_SUPABASE_URL>', 'supabase_url');
select vault.create_secret('<YOUR_SERVICE_ROLE_KEY>', 'service_role_key');
```

The triggers skip (with a notice) until these exist, and the edge functions require the `FCM_SERVICE_ACCOUNT` secret and a `service_role` bearer token.

## Database Schema

```sql
-- fcm_tokens stored on profiles (from add_fcm_to_profiles.sql)
ALTER TABLE profiles ADD COLUMN fcm_tokens TEXT[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN notification_preferences JSONB;

-- in-app notification row
CREATE TABLE in_app_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT,
  title TEXT,
  body TEXT,
  data JSONB,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## Supabase Edge Functions

### `send-notification` (in-app notifications)

File: `supabase/functions/send-notification/index.ts`

- Triggered by `trg_fcm_push` (migration 035) after an `in_app_notifications` INSERT — never called by the client
- Requires a `service_role` bearer token (verified via `SUPABASE_JWT_SECRET`). Accepts `{ notification_id }`.
- Reads the notification row, fetches `profiles.fcm_tokens` for the recipient, signs an RS256 JWT (iss = `client_email`, scope `https://www.googleapis.com/auth/firebase.messaging`), exchanges it for an OAuth token
- Sends to each token via the FCM HTTP v1 API; message includes `notification {title, body}`, stringified `data` (row data + `type` for tap-routing), `android {priority:'high'}`, `apns {aps {alert, sound:'default', badge:1}}`
- Responds `{ sent, failed, total }`
- Deploy: `supabase functions deploy send-notification` and store the secret `FCM_SERVICE_ACCOUNT`

### `send-chat-notification` (FCM-only chat pushes)

File: `supabase/functions/send-chat-notification/index.ts`

- Triggered by `trg_session_chat_fcm_push` / `trg_community_chat_fcm_push` after a `session_messages` / `community_messages` INSERT
- Requires a `service_role` bearer token. Accepts `{ chat_type, chat_id, message_id }`.
- Computes recipients itself (session creator + accepted participants, or community approved members, minus the sender), the chat title, and the body (`<sender>: <content>`)
- Skips active readers via `chat_presence` (60s TTL) and builds per-recipient Android summary bodies from the read-cursor tables (migrations 028 / 031)
- Handles `session_chat_reply` / `community_chat_reply` pushes when `reply_to_id` is set
- Deploy: `supabase functions deploy send-chat-notification`

### Shared plumbing

File: `supabase/functions/_shared/fcm.ts` — OAuth token caching (single-flight, 5-min refresh margin), service-role auth check, FCM HTTP v1 message building + fan-out, chat table resolution.

## Client Integration

### Core module: `src/services/fcm.ts`
- `registerForPushNotificationsAsync()` — Android channels (default, match-updates), permission request, `messaging().getToken()`
- `saveFCMTokenToProfile` / `removeFCMTokenFromProfile` — deduplicated array updates on `profiles.fcm_tokens`
- `setupBackgroundMessageHandler()` — data-only messages schedule a local notification
- `setupForegroundMessageHandler()` — `messaging().onMessage`
- `setupTokenRefreshListener()` — refetch on token refresh
- `scheduleLocalNotification()`, `getNotificationPermissions()`, `parseNotificationData/ResponseData()`
- Sets the global `Notifications.setNotificationHandler` (alerts/sound/badge/banner)

### Hook: `src/hooks/useFCM.ts`
- `initialize()`: registers token, wires listeners (foreground/background/token refresh), persists to Supabase
- `handleNotificationResponse()`: routes a tapped notification's data to the right screen — ping → `/ping-response`; community match → `/community/[id]` (+ auto-opens the match popup via `matchId`); session → `/history` (+ auto-opens the session popup via `sessionId`); community events → `/community/[id]`
- `requestPermissions()`

### Init mount: `src/components/FCMInitializer.tsx`
- Mounts `useFCM().initialize()` once a session is available
- Uses `Notifications.useLastNotificationResponse()` to catch taps that launched the app (cold start / background) and navigates, then calls `clearLastNotificationResponse()`

## Testing Checklist

- [ ] Development build on a physical device (FCM does not work on simulators/emulators)
- [ ] Permissions granted
- [ ] Token registered in `profiles.fcm_tokens`
- [ ] Test each notification type (session application/accept/reject, join request, ping, ping response, community match pending/approved/disputed, invite, etc.)
- [ ] Test foreground / background / terminated behavior

## Production Deployment

1. Build with EAS: `eas build --platform all`
2. Submit to Google Play Console / App Store
3. Configure the production Firebase project
4. Deploy the edge functions (`send-notification`, `send-chat-notification`) with the `FCM_SERVICE_ACCOUNT` secret
5. Add the Vault secrets `supabase_url` and `service_role_key` (see "One-time setup" above) and run migration 035
6. Verify pushes fire by triggering any action that inserts a notification or chat message

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Token not received | Verify `google-services.json` / `GoogleService-Info.plist` match the app IDs |
| iOS not receiving | Ensure APNs key uploaded + "Push Notifications" entitlement |
| Edge function 401/403 | Check the `FCM_SERVICE_ACCOUNT` secret is correct JSON with a valid private key |
| Notifications only shown on tap | Check priority / OAuth scope |

## Resources
- [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [React Native Firebase Messaging](https://rnfirebase.io/messaging/)
- [FCM HTTP v1](https://firebase.google.com/docs/cloud-messaging/migrate-v1)