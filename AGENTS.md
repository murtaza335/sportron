# T3Seecs - Multi-Sport Community & Match Tracking App

**Expo + Supabase + TypeScript** mobile app (display name "Sportron") for organizing pick-up sports through communities and sessions, and tracking played matches.

## Tech Stack
- **Framework**: Expo Router (v57) with React Native 0.86
- **Backend**: Supabase (PostgreSQL + Auth + Realtime + Edge Functions)
- **Language**: TypeScript (strict)
- **Styling**: Custom theme system with light/dark/system mode, CSS-in-JS (StyleSheet)
- **Auth**: Google OAuth via Supabase
- **Images**: Cloudinary (profile avatars + community cover photos)
- **Push Notifications**: Firebase Cloud Messaging (FCM) via `@react-native-firebase/messaging` + `expo-notifications`

---

## Project Structure

```
src/
├── app/                        # Expo Router file-based routing
│   ├── _layout.tsx             # Root stack + auth gating + providers
│   ├── login.tsx               # Google OAuth login
│   ├── onboarding.tsx          # Profile setup after first login
│   ├── add-match.tsx           # Record community match (modal)
│   ├── create-community.tsx    # New community (modal)
│   ├── create-session.tsx      # New session (modal)
│   ├── discover.tsx            # Browse/search public communities
│   ├── ping-response.tsx       # Respond "coming"/"busy" to a ping
│   ├── settings.tsx            # Notification prefs, about, delete account
│   ├── auth/callback.tsx       # OAuth deep-link handler (t3s://auth/callback)
│   ├── community/[id].tsx      # Community home: matches feed, ping, join
│   ├── community/[id]/info.tsx         # Community info + edit/leave/delete
│   ├── community/[id]/members.tsx      # Member list + admin actions + invite
│   ├── community/[id]/join-requests.tsx # Admin review of join requests
│   ├── profile/[id].tsx        # Public profile view
│   └── (tabs)/
│       ├── _layout.tsx         # 4 tabs: Communities / Sessions / Activity / Profile
│       ├── index.tsx           # My communities (home)
│       ├── history.tsx         # Sessions: new (All/Joined/My) or history view + cards
│       ├── updates.tsx         # Activity - in-app notifications inbox
│       └── profile.tsx         # Profile view/edit + theme + notification toggle
├── components/
│   ├── MatchCard.tsx           # Community match card (likes/comments, win badge)
│   ├── MatchDetailPopup.tsx    # Bottom sheet: full match + approve/dispute + comments
│   ├── MatchLineupSelector.tsx # Visual team builder for record match
│   ├── ScoreCounter.tsx        # +/- score input
│   ├── SessionDetailPopup.tsx  # Session detail: applicants, approve/reject, join/leave
│   ├── SessionChatPopup.tsx    # Full-screen live chat for a session (creator + accepted members)
│   ├── ActivityCard.tsx        # Notification row with accept/decline actions
│   ├── InviteCard.tsx          # Community invite accept/decline
│   ├── InviteMemberModal.tsx   # Admin invite-by-username modal
│   ├── CommunityCard.tsx       # Community list card
│   ├── ProfileForm.tsx         # Username/bio/role form + avatar upload
│   ├── FCMInitializer.tsx      # Wires FCM once a session exists
│   └── ui/                     # Button, Card, SegmentedControl, Text
├── contexts/
│   ├── AuthContext.tsx              # Supabase auth + profile state + account re-enable
│   ├── NotificationsContext.tsx     # Shared notifications feed + unread badge + realtime (INSERT/UPDATE/DELETE)
│   └── ThemeContext.tsx             # Theme provider (light/dark/system, persisted)
├── hooks/
│   ├── useCommunities.ts            # Fetch public / my communities
│   ├── useCommunity.ts              # Single community detail + membership state
│   ├── useSessions.ts               # Session feeds by scope (all/joined/my) + history
│   ├── useSessionChat.ts            # Session chat: optimistic send + realtime dedupe
│   ├── useNotifications.ts          # Wraps NotificationsContext (shared feed + unreadCount)
│   ├── useFCM.ts                    # FCM init, permissions, notification navigation
│   ├── use-theme.ts                 # Theme context wrapper
│   └── use-color-scheme.ts          # System theme detection (native + web)
├── services/
│   ├── auth.ts                 # Google OAuth flow
│   ├── chat.ts                 # Session chat: fetch/send + sender snapshot + batched FCM push
│   ├── profiles.ts             # Profile CRUD, prefs, FCM tokens, soft delete
│   ├── communities.ts          # Communities, members, matches, pings, invites
│   ├── sessions.ts             # Session CRUD + commitments (approve/reject/leave)
│   ├── notifications.ts        # In-app notification insert + typed notify helpers + batched FCM
│   └── fcm.ts                  # FCM token management + listeners + local notifications
├── lib/
│   ├── supabase.ts             # Supabase client (AsyncStorage/web fallback)
│   ├── cloudinary.ts           # Image upload with progress
│   ├── date.ts                 # formatRelativeTime + formatSessionDisplayName
│   └── sessionsView.ts         # 'new' | 'history' toggle store (useSyncExternalStore)
├── types/
│   └── index.ts                # Shared TypeScript types + sport constants
└── constants/theme.ts          # Design tokens (colors, spacing, radius)
```

---

## Core Features

### 1. Authentication
- **Google OAuth** via Supabase + expo-auth-session
- Deep link callback: `t3s://auth/callback`
- Auto-creates profile on first login → redirects to onboarding
- **Soft delete / re-enable**: `softDeleteAccount()` clears bio/avatar/tokens/prefs and sets `deleted_at`; logging back in re-enables the account

### 2. Multi-Sport Support
- `Sport` union: table_tennis, badminton, tennis, squash, pickleball (racket) + football, cricket, volleyball, handball, basketball (team) + other
- `isRacketSport()` / `isTeamSport()` helpers drive match creation UI
- Communities are **linked to a single sport** (not changeable after creation)

### 3. Communities
- **Create**: name, description, **organization (optional, e.g. uni/club)**, **location/city (optional)**, cover photo (Cloudinary), sport pill selector, visibility (public / restricted)
- **Name uniqueness**: a user cannot create (or rename into) a community with a name they already own — enforced DB-side by `idx_communities_name_created_by` (case-insensitive); two different users may share a name. `createCommunity`/`updateCommunity` map the unique violation to a friendly error
- **Discover**: browse all public communities with name search + horizontal sport filter chips; shows admin/member role tags
- **Cards** (My Communities + Discover): show sport/visibility/member count, **"Created by <username>"** and **organization (if present)**
- **Join**: public → `joinCommunity()` (instant); restricted → `requestToJoinCommunity()` (admin approves)
- **Leave** / **Edit** (admin: name, description, organization, location, cover, visibility, transfer admin by username) / **Delete**
- **Details** (`community/[id]/info.tsx` + home card): description, organization, location, creator info shown to non-members before joining
- **Members**: sorted me → admins → members; admin long-press for Make Admin / Remove; pending-invite section
- **Invite Members**: admin can invite by typing username (public or restricted); invitees accept/reject via Invite tab
- **Join requests**: admin review screen with approve/reject
- **Pings**: any member can ping the whole community; members respond "Coming"/"Busy" (realtime live responses)

### 4. Community Matches
- Recorded **within a community**, opponents limited to community members
- **Racket sports**: singles / doubles (1v1 / 2v2)
- **Team sports**: team names + opponent captain
- **Format**: `recordCommunityMatch()` with match format segmented control
- **Score**: +/- stepper with direct numeric input, min 0
- **Approval workflow**: pending → opponent approves (approved) or disputes (disputed)
- **Feed**: Approved / Pending tabs share tabs in the community; paginated "Load More"
- **Social**: likes + comments with optimistic UI, real-time counts
- **Win/Loss/Draw**: badges on match cards when user participated

### 5. Sessions (Find a Match)
- **Create**: purpose (sport), **title (required short name ≤ 40 chars)**, location, date/time, max participants, "expire after" chips (15m/30m/1hr), description
- Constraints: max 7 days in the future; time-conflict check (±30 min on created + committed sessions)
- **Statuses**: open / full / closed / completed / cancelled; expired sessions auto-closed
- **Commitments**: apply (pending) → creator approves (accepted) or rejects; can leave and re-apply
- **Delete**: allowed only while no member has `accepted` status
- **Views** (`history.tsx`): a header clock/X button toggles between **New** (open play) and **History** (ended sessions); the shared view lives in `src/lib/sessionsView.ts` (a tiny `useSyncExternalStore` store) so the header and tab stay in sync. New view has an **All / Joined / My** segmented control + a purpose (sport) dropdown filter
- **Feeds**: `useSessionFeed(userId, scope)` with `SessionScope` = `all` | `joined` | `my` and `useSessionHistory(userId)`; backed by `fetchOpenSessions`/`fetchMySessions`/`fetchJoinedSessions`/`fetchSessionHistory` in `sessions.ts`, which sort active (open/full) sessions first
- Session cards show title (falls back to purpose), "closes in X" countdown, commitment count, creator name

### 6. Session Chat
- Live text chat per session, realtime via Postgres Changes on `session_messages` (`supabase.channel('session-chat-<id>')`, INSERT filtered on `session_id`)
- Scoped to the session **creator + accepted participants** only (RLS enforces both read and write)
- Users who **left** a session can still read history up to the moment they left (`created_at <=` their commitment's `updated_at`) but cannot send; the client skips its realtime subscription and shows a "you left" banner, and they receive no further FCM pushes
- Chat button sits in the `SessionDetailPopup` header (next to close); opens a full-screen `SessionChatPopup`
- Text only, max 1000 chars, permanent (no delete/edit); sending disabled once a session is closed/completed/cancelled
- **Optimistic UI** (`src/hooks/useSessionChat.ts`): sending adds a temp bubble instantly with a **clock** (sending) → **check** (delivered) mark, then swaps to the real row with **no refetch**. Failure removes the temp and restores the draft + reply. A realtime INSERT for your own just-sent message is matched to the temp (by content + `reply_to_id`) and upgrades its id in place — never a second bubble, never a lost mark
- **My avatar** renders on the right of your own bubbles (from `useAuth().profile`)
- **Swipe-to-reply** (WhatsApp-style): right-swipe any message (PanResponder) to open a "Replying to <name>" bar above the input; replies store `reply_to_id` (migration 025) and render a preview block (quoted name/content) inside the bubble
- **No joins / no per-message refetch**: `sender_username`/`sender_avatar_url` are snapshotted on the row at insert (migration 026), so realtime payloads and the initial fetch carry the display name without a join. Reply previews/names resolve client-side from the already-loaded list (`resolveReplyPreview`), so replying to your own message shows your own name. This removed the self-join (`!reply_to_id`) entirely, along with the PGRST200 schema-cache dependency and one extra round-trip per message
- **Push**: each message sends an FCM-only push (no in-app notification, so it does **not** appear in the Activity inbox) to every member except the sender — title = session name, body = `<sender>: <content>`. `notifyChatMembers` fans out via **one batched edge-function call** (`pushFcmToUsers`) instead of one HTTP call per recipient. Replying sends a `session_chat_reply` push to the replied-to author ("<sender> replied to you: …")

### 7. Activity (Notifications Inbox)
- Tabs: **Action Required** (`session_application`, `join_request`, `community_match_pending`), **Invites** (`community_invite`), **Past Activity**
- Inline Accept / Decline via `ActivityCard` / `InviteCard` — after an action the notification row is updated (type → resolved type, `read = true`) so it leaves the actionable tab permanently; invites become `community_invite_accepted`/`community_invite_rejected`
- **Resolution lives in the services too**: `approveCommitment`/`rejectCommitment`, `respondToJoinRequest`, and `approveCommunityMatch`/`disputeCommunityMatch` each resolve the matching pending notification (matched via `data->>sessionId/applicantId`, `data->>communityId/requesterId`, `data->>matchId`), so acting from a session/community popup also clears the Action Required inbox — not just from the Activity tab
- `session_application` notifications carry `applicantId` in `data` so a notification maps to one specific applicant
- **Shared state**: `NotificationsProvider` (mounted in root `_layout.tsx`) owns the feed + realtime subscription (INSERT/UPDATE/DELETE) on `in_app_notifications`; `useNotifications()` just reads the context, so the tab badge and inbox always agree
- Tapping any card marks it read (`markAsRead`); **Mark all as read** button clears the rest (`markAllAsRead`)
- Unread badge (red dot) on the Activity tab = derived `unreadCount` from the shared feed

### 8. Push Notifications (FCM)
- FCM token registered per device (`profiles.fcm_tokens`)
- `send-notification` Edge Function delivers via Firebase HTTP v1; accepts `user_ids[]` for **batched fan-out** (one invocation, one profiles `.in()` query, N FCM sends) and **caches the OAuth access token** with a single-flight promise (one JWT per hour per warm instance)
- `pushFcmToUsers(userIds, ...)` batches a whole fan-out in a single edge call; `pushFcmToUser` is a thin wrapper for single recipients
- Foreground/background/terminated handling; background data-only messages → local notification
- `session_chat_message` / `session_chat_reply` pushes are **FCM-only** (sent via `pushFcmToUsers`, never inserted into `in_app_notifications`)

### 9. Profile & Settings
- **Profile**: view/edit username, bio, role (student/teacher), avatar upload; profile for other users via `/profile/[id]`
- **Theme picker**: Light / Dark / System (bottom sheet, persisted)
- **Push notification master toggle** + per-type preferences in Advanced Settings
- **Delete account** (soft delete); re-enabled on re-login

---

## Data Model (Supabase)

Current live tables (legacy `matches`/`match_likes`/`match_comments` were dropped by migrations 003/019):

```sql
-- Already implemented tables
profiles
  id, username (unique, was renamed from display_name), bio, avatar_url, role,
  fcm_tokens text[], notification_preferences jsonb,
  sport_interests text[], completed_sessions, total_committed_sessions,
  deleted_at, created_at, updated_at

sessions
  id, created_by, purpose (renamed from sport, migration 023),
  title (optional short name ≤ 40, migration 024), location, date_time,
  expires_at, max_participants, description,
  status (open|full|closed|completed|cancelled), created_at, updated_at

commitments
  id, session_id (fk), user_id (fk), status (pending|accepted|rejected|left),
  feedback_status, feedback_provided_by, created_at, updated_at
  -- partial unique index `commitments_active_unique WHERE status != 'left'`

session_messages
  id, session_id (fk, cascade), sender_id (fk, cascade), content,
  reply_to_id (self fk, ON DELETE SET NULL, migration 025),
  created_at
  -- sender snapshot: sender_username, sender_avatar_url (migration 026) — written
  -- at insert so realtime payloads/reads carry the display name with no join
  -- live text chat; readable/writable only by the session creator + accepted
  -- participants (RLS); added to the supabase_realtime publication (migration 021)

communities
  id, name, description, organization, location, image_url,
  visibility (public|restricted), sport, created_by, created_at, updated_at
  -- unique index `idx_communities_name_created_by (lower(name), created_by)`
  --   allows two users to share a name but blocks one user creating a duplicate
  --   (case-insensitive); enforced by migration 020

community_members
  community_id (fk), profile_id (fk), role (admin|member),
  approval_status (approved|pending|rejected), matches_played, wins, losses,
  win_ratio, joined_at
  -- pk (community_id, profile_id)

community_matches
  id, community_id, recorded_by, player_id, player_partner_id, opponent_id,
  opponent_partner_id, sport, custom_sport_name, team_a_name, team_b_name,
  player_score, opponent_score, approval_status (pending|approved|disputed),
  created_at, updated_at

community_match_likes / community_match_comments
  community_match_id (fk), profile_id (fk), content, created_at

community_join_requests
  id, community_id, user_id, status (pending|approved|rejected), created_at, updated_at
  -- trigger blocks join request when a pending invite exists

community_invites
  id, community_id, invited_by, invitee_id, status (pending|accepted|rejected),
  created_at, updated_at

pings
  id, community_id, sender_id, message, created_at

ping_responses
  id, ping_id (fk, cascade), community_id (fk), respondent_id (fk),
  response (coming|busy), created_at, unique (ping_id, respondent_id)

in_app_notifications
  id, user_id (fk, cascade), type, title, body, data, read, created_at
  -- inserted via SECURITY DEFINER RPC `insert_notification`

-- View: community_leaderboard (per-community rank by win_ratio)
-- RPCs: get_accepted_commitment_counts, close_expired_sessions,
--        create_community_invite, respond_to_community_invite
```

### Notification Types
See `NotificationType` in `src/types/index.ts` (all 30 types, from `match_pending` to `session_chat_reply`; `session_chat_message`/`session_chat_reply` are FCM-only and never stored in `in_app_notifications`).

---

## Key Conventions

### Routing (expo-router v57)
- Tabs: `/` (Communities), `/history` (Sessions), `/updates` (Activity), `/profile`
- Stack screens with `headerShown`: `/settings`, `/discover`, `/community/[id]`, `/community/[id]/members`, `/community/[id]/info`, `/profile/[id]`, `/ping-response`
- Modals (`fullScreenModal` + slide_from_bottom): `/add-match`, `/create-community`, `/create-session`
- Auth screens: `/login`, `/onboarding`, `/auth/callback`
- Registration of `notifications` route in `_layout.tsx` is currently dangling (no backing screen)

### Theme
- `useTheme()` returns `{ ...Colors[resolvedColorScheme], colorScheme(from origin), resolvedColorScheme, toggleTheme, setTheme }`
- Colors: `background`, `text`, `backgroundElement`, `border`, `textSecondary`, `tabBar`, `tabBarActive`, `tabBarInactive`, `backgroundSelected`
- `Colors.light` / `Colors.dark` in `src/constants/theme.ts`

### State & Data Patterns
- All Supabase calls go through `src/services/*` (return `{ data, error }`, throw on error)
- Hooks wrap service calls, expose `{ data, loading, refreshing, refresh }`, reload on focus
- `useCommunity(communityId, userId)` exposes community, membership, joinRequests + setters
- Real-time: `supabase.channel` for `ping_responses` (community screen), `session_messages` (session chat), and `in_app_notifications` (`NotificationsProvider`)
- Cross-screen state is shared via React Context (`AuthContext`, `ThemeContext`, `NotificationsContext`) — consume through the matching `use*` hook, never instantiate a fresh copy per screen
- Tiny external stores via `useSyncExternalStore` for state the header and tabs must agree on: `src/lib/sessionsView.ts` (`'new' | 'history'` toggle)

---

## Development Commands

```bash
npm start          # Expo dev server
npm run android    # Android emulator
npm run ios        # iOS simulator
npm run web        # Web build
npm run lint       # Expo lint (ESLint)
npx tsc --noEmit   # TypeScript check
npx expo install   # Install dependencies matching SDK 57
```

### Environment
Create `.env` from `.env.example` (see README) — includes Supabase + Cloudinary creds.

---

## Key Decisions / Notes

- **No external global state library** — state is managed via React Context + hooks
- **Sport union** is the source of truth for "which sports work" (`RACKET_SPORTS` vs `TEAM_SPORTS`)
- **Matches live only inside communities** — no global "record match" without a community (enforced by `add-match.tsx`)
- **Approval**: join requests and community matches both go through an approve/reject flow; notification types are user-facing and update after action
- **Notification state**: actionable notifications are resolved in-place (type → resolved type + `read = true`) both by the `ActivityCard`/`InviteCard` components and by the underlying service actions (`approveCommitment`/`rejectCommitment`, `respondToJoinRequest`, `approveCommunityMatch`/`disputeCommunityMatch`), so the inbox, tab badge, and "Action Required"/"Invites" tabs stay consistent no matter where the action was taken — no local-only UI hacks
- **Soft delete** keeps a deleted `profiles` row; on next login with the same Google account the profile is re-enabled
- **Supabase RLS** protects all tables (see `supabase/schema.sql`); the `insert_notification` RPC is SECURITY DEFINER so clients can send push for other users
- **Session chat has no joins / no per-message refetch** — sender name/avatar are snapshotted on the row at insert (migration 026) and reply previews resolve from the already-loaded message list; this removes the self-join (and its PGRST200 schema-cache dependency) plus one extra round-trip per message
- **FCM fan-out is batched** — `sendSessionMessage` fans out via a single `send-notification` call for all recipients (`pushFcmToUsers`); the edge function caches its OAuth token (single-flight promise, 5-min refresh margin) so a message costs one JWT, not one per recipient
- **Chat is FCM-only** — chat pushes never touch `in_app_notifications`, so they don't pollute the Activity inbox or drive its unread badge

---

## Project History
- Originally a table-tennis match tracker with global feed
- Expanded to **multi-sport**, **communities**, **sessions**, **community matches**, **pings**, and **invites** based on commits such as:
  - "implemented: allow admin to add members ... #45" (6448529)
  - "feat: community match likes/comments + remove legacy match implementation" (25b1b49)
  - "pinng response implemented" (26a33ff)
  - "pings implemented" (recent pings/commits)
  - "fix: shared notifications feed via `NotificationsContext` so unread badge clears on read / after actions (#68, #93)"
  - "sessions: optional title + required purpose, New/History header toggle, All/Joined/My scopes, active-first sorting"
  - "feat: session chat — optimistic sends (clock → checked), own avatar, WhatsApp-style swipe-to-reply + reply pushes, batched FCM fan-out (single edge call), sender snapshots with no per-message refetch"