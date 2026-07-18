# T3Seecs - Table Tennis Match Tracking App

**Expo + Supabase + TypeScript** mobile app for tracking table tennis matches with social features.

## Tech Stack
- **Framework**: Expo Router (v57) with React Native 0.86
- **Backend**: Supabase (PostgreSQL + Auth + Realtime + Edge Functions)
- **Language**: TypeScript (strict)
- **Styling**: Custom theme system with light/dark mode, CSS-in-JS (StyleSheet)
- **Auth**: Google OAuth via Supabase
- **State**: React Context + hooks (no external state lib)
- **Push Notifications**: Firebase Cloud Messaging (FCM) via `@react-native-firebase/messaging` + `expo-notifications`

---

## Project Structure

```
src/
├── app/                    # Expo Router file-based routing
│   ├── _layout.tsx         # Root stack + auth gating
│   ├── login.tsx           # Google OAuth login
│   ├── onboarding.tsx      # Profile setup after first login
│   ├── add-match.tsx       # Match creation modal
│   ├── notifications.tsx   # In-app notification list
│   ├── settings.tsx        # App settings (notification preferences, about)
│   ├── (tabs)/
│   │   ├── _layout.tsx     # 3 tabs: Home / History / Profile
│   │   ├── index.tsx       # Home - stats + add match button
│   │   ├── history.tsx     # Match feed with Global/My tabs
│   │   └── profile.tsx     # Profile view/edit + sign out + notification toggle
├── components/
│   ├── MatchCard.tsx       # Match list card with likes/comments
│   ├── MatchDetailPopup.tsx # Bottom sheet with full details + comments
│   ├── MatchLineupSelector.tsx # Visual team builder for add-match
│   ├── OpponentSelector.tsx    # Player search + guest picker
│   ├── ProfileForm.tsx     # Name/bio/role form
│   ├── ScoreCounter.tsx    # +/- score input
│   ├── PrivacyToggle.tsx   # Public/private toggle
│   └── ui/                 # Reusable UI primitives
├── contexts/
│   └── AuthContext.tsx     # Supabase auth + profile state
├── hooks/
│   ├── useMatches.ts       # Fetch global/my matches
│   ├── useMatchStats.ts    # Win/loss stats
│   ├── use-theme.ts        # Theme context
│   └── use-color-scheme.ts # System theme detection
├── services/
│   ├── auth.ts             # Google OAuth flow
│   ├── matches.ts          # CRUD + likes + comments + stats
│   └── profiles.ts         # Profile CRUD
├── lib/
│   └── supabase.ts         # Supabase client (AsyncStorage/web fallback)
├── types/
│   └── index.ts            # Shared TypeScript types
└── constants/theme.ts      # Design tokens (colors, spacing, radius)
```

---

## Core Features

### 1. Authentication
- **Google OAuth** via Supabase + expo-auth-session
- Deep link callback: `t3s://auth/callback`
- Auto-creates profile on first login → redirects to onboarding

### 2. Match Tracking
- **Formats**: Singles (1v1) or Doubles (2v2)
- **Team builder**: Visual slot cards for Player 1 (locked to you), Player 2 (partner), Opponent 1, Opponent 2
- **Player picker**: Searchable list from profiles + "Guest player" free-text
- **Score counter**: +/- buttons, min 0
- **Visibility**: Public (global feed) or Private (my matches only)
- **Guest opponents**: Free-text name for non-registered players

### 3. Match History (History Tab)
- **Two modes**: "All Matches" (public) / "My Matches" (where you participated)
- **Pull-to-refresh** + auto-refresh on tab focus
- **MatchCard**: Shows teams, score, format badge, public/private, Win/Loss/Draw badge for participants
- **Social**: Like (heart) + comment count with optimistic UI
- **Bottom sheet** (MatchDetailPopup): Full match details, comments thread, add comment, like button

### 4. Home Dashboard
- **Stats cards**: Total matches, Wins, Losses (computed from matches where user participated)
- **Big "Add Match" button** → opens add-match modal

### 5. Profile
- **View mode**: Name, role badge (Student/Teacher), bio
- **Edit mode**: ProfileForm with name, bio, role selector
- **Sign out** button

### 6. Social Features
- **Likes**: Optimistic toggle on MatchCard + DetailPopup, persists to `match_likes`
- **Comments**: Threaded list in DetailPopup, real-time count updates
- **Feed refresh**: `onRefreshFeed` callback propagates like/comment changes to list

### 7. Settings & Notification Preferences
- **Profile page**: Master toggle for push notifications + "Advanced Settings" link
- **Settings page** (`/settings`): Per-type notification toggles (pending, approved, rejected, likes, comments)
- **Master toggle**: Stored locally in AsyncStorage; toggles FCM registration on/off
- **Per-type toggles**: Persisted to `profiles.notification_preferences` via `updateNotificationPreferences()`

---

## Data Model (Supabase)

```sql
profiles
  id (uuid, pk, references auth.users)
  display_name (text)
  bio (text, nullable)
  role (student|teacher)
  created_at, updated_at

matches
  id (uuid, pk)
  created_by (uuid, fk profiles)
  player_id (uuid, fk profiles)        -- Team A player 1 (creator)
  player_partner_id (uuid, fk, nullable) -- Team A player 2
  opponent_id (uuid, fk, nullable)     -- Team B player 1
  opponent_partner_id (uuid, fk, nullable) -- Team B player 2
  opponent_guest_name (text, nullable) -- Guest name if opponent not registered
  match_format (singles|doubles)
  player_score (int)
  opponent_score (int)
  is_public (bool)
  created_at

match_likes
  match_id (fk matches)
  profile_id (fk profiles)
  pk (match_id, profile_id)

match_comments
  id (uuid, pk)
  match_id (fk matches)
  profile_id (fk profiles)
  content (text)
  created_at
```

---

## Key Conventions

### Routing (expo-router v57)
- Tabs: `/` (home), `/history`, `/profile`
- Stack: `/notifications`, `/settings` (slide_from_right)
- Modal: `/add-match` (fullScreenModal, slide_from_bottom)
- Auth stack: `/login`, `/onboarding`, `/auth/callback`

### Theme
```ts
// src/constants/theme.ts
Colors.light / Colors.dark  // full palette
Spacing.xs...xxl            // 4..48
Radius.sm...full            // 8..999
MaxContentWidth = 600       // centered content max-width
```

Use `useTheme()` hook → `{ theme: Colors[colorScheme] }`

### Auth Flow (AuthContext)
```
load session → if no session → /login
if session but no profile → /onboarding
if session + profile + on auth route → /
```

### Services Pattern
- All Supabase calls in `src/services/*.ts`
- Types in `src/types/index.ts`
- Throw on error (caller handles Alert)

### Hooks Pattern
- `useMatches(userId, mode)` → `{ matches, loading, refreshing, refresh }`
- `useMatchStats(userId)` → `{ stats: {total,wins,losses}, loading, refresh }`
- Return stable `refresh` callback for pull-to-refresh + focus effects

### Components
- `ThemedText` for all text (variants: hero/title/heading/body/label/caption)
- `Card` wrapper with theme-aware background/border
- `Button` variants: primary/secondary/ghost
- `SegmentedControl` for tab-like toggles

---

## Development Commands

```bash
npm start          # Expo dev server
npm run android    # Android emulator
npm run ios        # iOS simulator
npm run web        # Web build
npm run lint       # Expo lint (ESLint)
npx expo install   # Install native deps matching SDK 57
```

### Environment
Create `.env` from `.env.example`:
```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## Common Tasks

### Add a new screen
1. Create `src/app/(tabs)/new-screen.tsx`
2. Add `<Tabs.Screen name="new-screen" />` in `src/app/(tabs)/_layout.tsx`

### Add a new Supabase query
1. Add function to `src/services/...ts`
2. Add types to `src/types/index.ts`
3. Create hook in `src/hooks/` if reusable

### Modify theme
Edit `src/constants/theme.ts` → `Palette`, `Colors`, `Spacing`, `Radius`

### Add social feature
- Likes: `toggleLike(matchId, userId, like)` in `matches.ts`
- Comments: `fetchComments` / `addComment` in `matches.ts`
- Optimistic UI: update local state → call API → revert on error

---

## Push Notifications (FCM)

### Overview
Push notifications implemented using Firebase Cloud Messaging (FCM) with Expo Notifications.

### Notification Types
1. **match_pending** - Match needs approval (sent to opponent)
2. **match_approved** - Match was approved by opponent
3. **match_rejected** - Match was disputed/rejected
4. **match_liked** - Someone liked your match
5. **match_commented** - Someone commented on your match

### Implementation Files
- `src/services/fcm.ts` - Core FCM service (token management, listeners, scheduling)
- `src/hooks/useFCM.ts` - React hook for FCM initialization and permissions
- `src/services/profiles.ts` - Profile CRUD + notification preferences + FCM token management
- `supabase/functions/send-notification/index.ts` - Edge Function for sending notifications
- `supabase/migrations/add_fcm_to_profiles.sql` - Database migration

### Database Schema Updates
```sql
profiles
  ...
  fcm_tokens (text[]) - Array of FCM device tokens
  notification_preferences (jsonb) - User preferences per notification type
```

### Key Services
```ts
// fcm.ts
registerForPushNotificationsAsync() // Get FCM token + request permissions
saveFCMTokenToProfile(userId, token) // Store token in Supabase
setupNotificationListeners() // Foreground/background handlers
scheduleLocalNotification() // For testing

// profiles.ts
updateNotificationPreferences(userId, prefs) // Update user notification settings
addFCMToken(userId, token) // Add token to user profile
removeFCMToken(userId, token) // Remove token on logout
```

### Usage
```tsx
// In _layout.tsx or root component
import { useFCM } from '@/hooks/useFCM';

export default function RootLayout() {
  const { initialize } = useFCM();
  useEffect(() => { initialize(); }, []);
  // ...
}
```

### Testing
```tsx
const { sendTestNotification } = useFCM();
sendTestNotification('match_liked'); // Sends test notification
```

### Firebase Console Setup
1. Create Firebase project
2. Add iOS/Android apps with bundle IDs
3. Download `GoogleService-Info.plist` (iOS) and `google-services.json` (Android)
4. Place in project root
5. Configure APNs key in Firebase Console for iOS
6. Build with EAS: `eas build --platform all`

### Required Environment
- `EXPO_PUBLIC_FIREBASE_API_KEY` (optional, for web)
- Firebase project with Cloud Messaging enabled

---

## File References for Quick Navigation

| Feature | Key Files |
|---------|-----------|
| Auth flow | `src/contexts/AuthContext.tsx`, `src/services/auth.ts`, `src/app/login.tsx` |
| Add match | `src/app/add-match.tsx`, `src/components/MatchLineupSelector.tsx`, `src/components/OpponentSelector.tsx` |
| Match list | `src/app/(tabs)/history.tsx`, `src/components/MatchCard.tsx` |
| Match detail | `src/components/MatchDetailPopup.tsx` |
| Stats | `src/hooks/useMatchStats.ts`, `src/services/matches.ts` |
| Profile | `src/app/(tabs)/profile.tsx`, `src/components/ProfileForm.tsx` |
| Settings | `src/app/settings.tsx` |
| Theme | `src/constants/theme.ts`, `src/hooks/use-theme.ts` |
| Types | `src/types/index.ts` |