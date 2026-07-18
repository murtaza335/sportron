# T3Seecs - Table Tennis Match Tracking App

**Expo + Supabase + TypeScript** mobile app for tracking table tennis matches with social features.

## Features

### Match Tracking
- Singles (1v1) and Doubles (2v2) match formats
- Team builder with visual slot cards
- Player picker with search + guest player free-text
- Score counter (+/-) with minimum 0
- Match visibility (public / private)
- Match approval workflow (pending → verified / disputed)

### Match History
- Global feed of public matches + personal match history
- Pull-to-refresh with auto-refresh on tab focus
- Match cards showing teams, score, format badges, and win/loss/draw
- Social: Like (heart) and comment count with optimistic UI
- Bottom sheet details with full match info + comments thread

### Home Dashboard
- Stats cards: Total matches, Wins, Losses
- Quick "Add Match" button

### Authentication
- Google OAuth via Supabase
- Auto profile creation on first login → onboarding flow

### Profile & Settings
- Profile view/edit (name, bio, role, avatar)
- Theme picker (Light / Dark / System)
- **Push notification master toggle** (on/off)
- **Advanced Settings page** with per-type notification preferences:
  - Match Pending
  - Match Approved
  - Match Rejected
  - Likes
  - Comments

### Notifications
- Firebase Cloud Messaging (FCM) push notifications
- Real-time in-app notification updates via Supabase Realtime
- Notification list with mark-read, mark-all-read, and delete
- Per-type notification preferences persisted to Supabase

## Tech Stack

- **Framework**: Expo Router (v57) with React Native 0.86
- **Backend**: Supabase (PostgreSQL + Auth + Realtime + Edge Functions)
- **Language**: TypeScript (strict)
- **Styling**: Custom theme system with light/dark mode, CSS-in-JS (StyleSheet)
- **Auth**: Google OAuth via Supabase
- **Push Notifications**: Firebase Cloud Messaging (FCM) via `@react-native-firebase/messaging` + `expo-notifications`

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
│   │   └── profile.tsx     # Profile view/edit + notification master toggle + sign out
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
│   ├── AuthContext.tsx     # Supabase auth + profile state
│   └── ThemeContext.tsx    # Theme provider with light/dark/system
├── hooks/
│   ├── useMatches.ts       # Fetch global/my matches
│   ├── useMatchStats.ts    # Win/loss stats
│   ├── use-theme.ts        # Theme context wrapper
│   ├── use-color-scheme.ts # System theme detection
│   ├── useFCM.ts           # FCM initialization and permissions
│   └── useNotifications.ts # In-app notification state + realtime
├── services/
│   ├── auth.ts             # Google OAuth flow
│   ├── matches.ts          # CRUD + likes + comments + stats
│   ├── profiles.ts         # Profile CRUD + notification prefs + FCM token management
│   ├── fcm.ts              # Core FCM service (token, listeners, scheduling)
│   └── notifications.ts    # Push notification dispatch helpers
├── lib/
│   └── supabase.ts         # Supabase client (AsyncStorage/web fallback)
├── types/
│   └── index.ts            # Shared TypeScript types
└── constants/theme.ts      # Design tokens (colors, spacing, radius)
```

## Getting Started

1. Install dependencies
   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your Supabase credentials:
   ```
   EXPO_PUBLIC_SUPABASE_URL=...
   EXPO_PUBLIC_SUPABASE_ANON_KEY=...
   ```

3. Start the app
   ```bash
   npx expo start
   ```

## Development Commands

```bash
npm start          # Expo dev server
npm run android    # Android emulator
npm run ios        # iOS simulator
npm run web        # Web build
npm run lint       # Expo lint (ESLint)
```
