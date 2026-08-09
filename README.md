# T3Seecs - Multi-Sport Community & Match Tracking App

**Expo + Supabase + TypeScript** mobile app for organizing pickup sports through communities and sessions, and tracking played matches. The app displays as **Sportron**.

## Features

### Communities
- **Create communities** linked to a single sport (table tennis, badminton, tennis, squash, pickleball, football, cricket, volleyball, handball, basketball, other)
- Cover photo upload, description, public/restricted visibility
- **Discover**: browse public communities with name search + sport filter chips, admin/member role tags
- **Join**: instant for public, admin-approval for restricted
- Admin tools: edit info, transfer admin, delete, promote/remove members, review join requests, invite members by username
- **Pings**: notify the whole community; members respond "Coming"/"Busy" live

### Community Matches
- Record matches within a community; opponents limited to community members
- Racket sports: singles (1v1) / doubles (2v2)
- Team sports: team names + opponent captain
- Score counter (+/-) with direct numeric input, min 0
- **Approval workflow**: pending → opponent approves (verified) or disputes
- Likes + comments, win/loss badges

### Sessions (Find a Match)
- Create sessions for any sport with location, date/time, max participants, expiry (15m/30m/1hr)
- Max 7 days in the future; time-conflict check (±30 min)
- **Commitments**: apply, creator approves/rejects, leave and re-apply
- Expired sessions auto-close; session cards show countdown + commitment count

### Activity (Notifications Inbox)
- Tabs: Action Required / Invites / Past Activity
- Inline Accept/Decline for session applications, join requests, community match approvals, community invites
- Real-time updates + unread badge on tab

### Push Notifications
- FCM push notifications via Supabase Edge Function
- Foreground/background/terminated handling
- Per-type preferences toggleable in settings

### Profile & Settings
- Profile view/edit: username, bio, role (student/teacher), avatar upload
- Theme picker (Light / Dark / System)
- Push notification master toggle + per-type preferences vs advanced settings
- Delete account (soft delete)

## Tech Stack

- **Framework**: Expo Router (v57) with React Native 0.86
- **Backend**: Supabase (PostgreSQL + Auth + Realtime + Edge Functions)
- **Language**: TypeScript (strict)
- **Styling**: Custom theme system (light/dark/system), CSS-in-JS (StyleSheet)
- **Auth**: Google OAuth via Supabase
- **Images**: Cloudinary (avatars + community cover photos)
- **Push Notifications**: Firebase Cloud Messaging (FCM)

## Project Structure

```
src/
├── app/                        # Expo Router file-based routing
│   ├── _layout.tsx             # Root stack + auth gating + providers
│   ├── login.tsx / onboarding.tsx / auth/callback.tsx
│   ├── add-match.tsx           # Record community match (modal)
│   ├── create-community.tsx    # New community (modal)
│   ├── create-session.tsx      # New session (modal)
│   ├── discover.tsx            # Browse public communities
│   ├── ping-response.tsx       # Respond to a ping
│   ├── settings.tsx            # Notification prefs, about, delete account
│   ├── community/[id].tsx      # Community detail + match feed
│   ├── community/[id]/info.tsx # Community info + edit/delete
│   ├── community/[id]/members.tsx
│   ├── community/[id]/join-requests.tsx
│   ├── profile/[id].tsx        # Public profile
│   └── (tabs)/
│       ├── _layout.tsx         # 4 tabs: Communities / Sessions / Activity / Profile
│       ├── index.tsx           # My communities
│       ├── history.tsx         # Find a Match (open sessions)
│       ├── updates.tsx         # Activity (notifications)
│       └── profile.tsx         # Profile + settings
├── components/                 # MatchCard, MatchDetailPopup, MatchLineupSelector,
│                               # ScoreCounter, SessionDetailPopup, ActivityCard,
│                               # InviteCard, InviteMemberModal, CommunityCard,
│                               # ProfileForm, FCMInitializer, ui/*
├── contexts/                   # AuthContext, ThemeContext
├── hooks/                      # useCommunities, useCommunity, useSessions,
│                               # useNotifications, useFCM, use-theme
├── services/                   # auth, profiles, communities, sessions,
│                               # notifications, fcm
├── lib/                        # supabase, cloudinary, date
├── types/ index.ts             # Shared types + sport constants
└── constants/ theme.ts         # Design tokens
```

## Getting Started

1. Install dependencies
   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in credentials:
   ```
   EXPO_PUBLIC_SUPABASE_URL=...
   EXPO_PUBLIC_SUPABASE_ANON_KEY=...
   EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME=...
   EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET=...
   ```

3. Apply the Supabase schema (see `supabase/schema.sql` + `supabase/migrations/`)

4. Start the app
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

See `AGENTS.md` for architecture details, data model, notifications, and contribution conventions. See `FCM_IMPLEMENTATION_GUIDE.md` for push notification setup.