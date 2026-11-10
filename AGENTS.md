# T3Seecs - Multi-Sport Community & Match Tracking App

**Expo + Supabase + TypeScript** app (display name "Sportron", app `version` 1.0.1, Android package `com.murtazabaig.T3S`, deep-link scheme `t3s`) for organizing pick-up sports through communities and sessions, tracking played matches, and keeping a community social feed + daily activity streaks. **In production** (Google Play; web build on Vercel; iOS not live yet). Native Android is the primary target; the web build is a secondary client with no push *receive* support.

## Tech Stack
- **Framework**: Expo Router (v57) with React Native 0.86
- **Backend**: Supabase (PostgreSQL + Auth + Realtime + Edge Functions)
- **Language**: TypeScript (strict)
- **Styling**: Custom theme system with light/dark/system mode, CSS-in-JS (StyleSheet)
- **Auth**: Google OAuth via Supabase
- **Images**: Cloudinary (profile avatars + community cover photos)
- **Push Notifications**: Firebase Cloud Messaging (FCM) via `@react-native-firebase/messaging` + `expo-notifications` (native only — `FCMInitializer` is not mounted on web)
- **Icons**: `lucide-react-native`; animations: `react-native-reanimated` v4
- **Deploy**: EAS Build (Android APK/AAB) · web via `npx expo export -p web` + `vercel ./dist --prod` (see `web-deploy-commands.txt`) · edge functions via `supabase functions deploy <name>`

---

## Project Structure

```
src/
├── app/                        # Expo Router file-based routing
│   ├── _layout.tsx             # Root: maintenance/min-version gate (queries site_config BEFORE providers) → providers → Stack + auth gating
│   ├── login.tsx               # Google OAuth login
│   ├── onboarding.tsx          # Profile setup after first login
│   ├── add-match.tsx           # Record community match (modal)
│   ├── create-community.tsx    # New community (modal)
│   ├── create-session.tsx      # New session (modal)
│   ├── discover.tsx            # Browse/search public communities
│   ├── chat.tsx                # Full-screen chat opened from chat push notifications (modal)
│   ├── settings.tsx            # Push toggle, version, delete account
│   ├── get.tsx / android.tsx   # Web-only redirectors to Play Store / sportron.app (marketing links)
│   ├── auth/callback.tsx       # OAuth deep-link handler (t3s://auth/callback)
│   ├── community/[id].tsx      # Community home: unified posts+matches feed, FAB menu, chat, join
│   ├── community/[id]/info.tsx          # Community info + leave/delete
│   ├── community/[id]/edit.tsx          # Admin edit (name/desc/org/location/cover/visibility)
│   ├── community/[id]/members.tsx       # Member list + admin actions + invite
│   ├── community/[id]/join-requests.tsx # Admin review of join requests
│   ├── community/[id]/pending-matches.tsx # Pending community matches awaiting approval
│   ├── profile/[id].tsx        # Public profile view (+ per-community stats, streak)
│   ├── tournament/[id].tsx (+ /manage, /fields, /module-form, /module/[moduleId] (+ /manage, /seeding, /rounds, /entry-form))   # Tournaments (see section 10)
│   └── (tabs)/
│       ├── _layout.tsx         # 5 visible tabs: Communities / Sessions / **Tournaments (centre, raised bump button, icon only)** / Chats / Activity; `profile` is a hidden tab (href: null) opened from the header avatar. Header: streak flame (left, Communities), What's-New dot
│       ├── index.tsx           # My communities (home)
│       ├── history.tsx         # Sessions: New (All/Joined/My + purpose filter) or History view; also pops the post-session feedback popup
│       ├── tournaments.tsx     # Tournaments list (Live / Upcoming / Past / Mine) — centre tab
│       ├── chats.tsx           # Chats hub: community/session chat rows with unread badges
│       ├── updates.tsx         # Activity - in-app notifications inbox
│       └── profile.tsx         # Profile view/edit + theme + notification toggle + What's New
├── components/
│   ├── MatchCard.tsx / MatchDetailPopup.tsx / MatchLineupSelector.tsx / OpponentSelector.tsx / ScoreCounter.tsx   # community matches
│   ├── PostCard.tsx / PostDetailPopup.tsx / CreatePostModal.tsx   # community posts (text/photo) + likes/comments
│   ├── FABMenu.tsx             # Community FAB: Write post / Photo post / Record match / Ping
│   ├── SessionDetailPopup.tsx  # Session detail: applicants, approve/reject, join/leave, chat button
│   ├── SessionFeedbackPopup.tsx # Post-session "showed up / no-show" marking by the creator
│   ├── SessionChatPopup.tsx / CommunityChatPopup.tsx / ChatPopup.tsx   # chat UIs (ChatPopup is the shared one)
│   ├── ActivityCard.tsx / InviteCard.tsx / InviteMemberModal.tsx / NotificationBell.tsx
│   ├── CommunityCard.tsx / ProfileForm.tsx / UserAvatar.tsx / PrivacyToggle.tsx (public/restricted)
│   ├── StreakDisplay.tsx / StreakHeader.tsx / StreakModal.tsx    # streak UI
│   ├── FCMInitializer.tsx / EnablePushNotificationsButton.tsx    # push wiring (native) / permission prompt (web)
│   ├── MaintenanceScreen.tsx / ForcedUpdateScreen.tsx / SplashScreen.tsx
│   └── ui/                     # Button, Card, SegmentedControl, Text
├── components/tournaments/       # TournamentCard, ModuleCard, ChampionsStrip, Bracket{View,MatchNode,Connectors}, Standings{Table,Chart}, Module{Entries,Info,Matches,Standings}Tab, EntrySheet, TournamentMatchSheet, ResultEntrySheet, ScheduleSheet, ProfilePickerSheet, EntryFieldEditorSheet, DateTimeField, BottomSheet, form primitives, StatusPill, TournamentTabBarButton, TabBarBumpBackground
├── contexts/
│   ├── AuthContext.tsx              # Supabase auth + profile state + account re-enable
│   ├── NotificationsContext.tsx     # Shared notifications feed + unread badge + realtime (INSERT/UPDATE/DELETE)
│   ├── ThemeContext.tsx             # Theme provider (light/dark/system, persisted)
│   └── MaintenanceContext.tsx       # Exists but the root layout does its own site_config check; not in the provider tree
├── hooks/
│   ├── useTournaments.ts / useTournament.ts / useTournamentModule.ts / useTournamentFields.ts   # tournaments (list SWR cache, detail, module + realtime bracket, entry-form fields)
│   ├── useCommunities.ts / useCommunity.ts / useCommunityPosts.ts
│   ├── useSessions.ts               # Session feeds by scope (all/joined/my) + history
│   ├── useChat.ts                   # Generic chat thread (optimistic send + realtime dedupe)
│   ├── useSessionChat.ts / useCommunityChat.ts   # thin wrappers over useChat
│   ├── useChats.ts                  # Chats hub data (batched stats RPC + 30s SWR cache)
│   ├── useNotifications.ts          # Wraps NotificationsContext
│   ├── useStreak.ts                 # Streak state for the signed-in user
│   ├── useFCM.ts                    # FCM init, permissions, notification-tap navigation
│   └── use-theme.ts / use-color-scheme(.web).ts
├── services/                   # ALL Supabase calls (RPC-first reads, see Conventions)
│   ├── auth.ts, profiles.ts (CRUD, prefs, FCM tokens, soft delete)
│   ├── communities.ts          # Communities, members, matches, pings, invites, join requests, posts (+likes/comments)
│   ├── sessions.ts             # Session CRUD, commitments, conflicts, expiry, post-session feedback
│   ├── chat.ts                 # Session + community chat: fetch/send, read cursors, presence, hub stats, edit/delete
│   ├── notifications.ts        # READ-ONLY inbox ops (fetch/mark read/delete) — notifications are CREATED by DB triggers
│   ├── streak.ts               # compute/update streak (match_recorded | session_joined | session_created)
│   ├── config.ts               # site_config: maintenance flag + min app version
│   ├── tournaments.ts          # tournament RPC wrappers (one fn per RPC; throw raw RPC message, mapped by lib/tournamentErrors)
│   ├── audit.ts                # Read helpers for audit_logs (table is not client-readable — see migration 062)
│   └── fcm.ts                  # FCM token management + listeners + local notifications
├── lib/
│   ├── bracketLayout.ts / tournamentFormat.ts / tournamentErrors.ts / tournamentRoutes.ts   # tournaments: bracket math, status/format helpers, RPC error-code → copy, typed hrefs
│   ├── supabase.ts, cloudinary.ts, firebase.ts (web), date.ts, alert.ts (cross-platform alert)
│   ├── sessionsView.ts         # 'new' | 'history' toggle store (useSyncExternalStore)
│   ├── chatUnreadStore.ts      # Tab-badge chat unread store
│   └── whatsNew.ts             # What's-New content + viewed-version flag (AsyncStorage); bump CURRENT_VERSION in 3 places (whatsNew.ts, tabs/_layout.tsx, tabs/profile.tsx)
├── types/index.ts              # Shared TS types + sport/purpose constants + NotificationType
├── utils/pushNotifications.js  # Web push helper
└── constants/theme.ts          # Design tokens (colors, spacing, radius)

supabase/
├── migrations/                 # 002 … 121 (next = 125) + a few un-numbered early files. schema.sql is STALE (only a few tables) — migrations are the source of truth
└── functions/                  # send-notification, send-chat-notification, streak-cron, community-engagement-cron, _shared/fcm.ts (cloudinary-destroy is an empty folder)
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
- **Leave** / **Edit** (admin: name, description, organization, location, cover, visibility) / **Delete** (creator only; any non-creator member incl. promoted admins can **Leave**)
- **Details** (`community/[id]/info.tsx` + home card): description, organization, location, creator info shown to non-members before joining
- **Members**: sorted me → admins → members; admin long-press for Make Admin / Remove; pending-invite section
- **Invite Members**: admin can invite by typing username (public or restricted); invitees accept/reject via Invite tab
- **Join requests**: admin review screen with approve/reject
- **Pings**: any member can ping the whole community (notification to all members). Server-enforced **15-min cooldown per (community, sender)** (migration 029); admins can switch member pings off via `communities.pings_enabled` (030; admins can always ping). The "reply Coming/Busy" feature and `ping_responses` table were removed (migration 034) — there is no `ping-response` screen
- **Membership guards (DB-enforced)**: the creator can never be removed or demoted from admin (064/066); only the creator can delete a community and only when no other members remain (065); join requests only for *restricted* communities and not for existing members (054/060), re-requests allowed after a resolved one (058); invites blocked for existing members (059)
- **Home feed** (`community/[id].tsx`): one unified chronological feed of **posts + approved matches**, with a **FAB menu** (`FABMenu`): Write post / Photo post / Record match / Ping. A *Pending matches* screen (`pending-matches.tsx`) lists matches awaiting approval; chat button + unread badge sit in the header

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
- **Create**: purpose (sport), **title (required short name ≤ 40 chars)**, location, date/time, max participants, "expire after" chips (30 min … 6 hr), description
- Constraints: max 7 days in the future; time-conflict check (±30 min on created + committed sessions)
- **Statuses**: open / full / closed / completed / cancelled; expired sessions auto-closed
- **Commitments**: apply (pending) → creator approves (accepted) or rejects; can leave and re-apply
- **Delete**: allowed only while no member has `accepted` status
- **Views** (`history.tsx`): a header clock/X button toggles between **New** (open play) and **History** (ended sessions); the shared view lives in `src/lib/sessionsView.ts` (a tiny `useSyncExternalStore` store) so the header and tab stay in sync. New view has an **All / Joined / My** segmented control + a purpose (sport) dropdown filter
- **Feeds**: `useSessionFeed(userId, scope)` with `SessionScope` = `all` | `joined` | `my` and `useSessionHistory(userId)`; backed by `fetchOpenSessions`/`fetchMySessions`/`fetchJoinedSessions`/`fetchSessionHistory` in `sessions.ts`, which sort active (open/full) sessions first
- Session cards show title (falls back to purpose), "closes in X" countdown, commitment count, creator name

### 6. Session & Community Chat
- **Shared implementation**: `ChatPopup.tsx` renders a full-screen live chat; `useChat.ts` is a generic hook (optimistic send + realtime dedupe) parameterized by a `ChatSourceConfig` (table, id column, channel prefix, fetch/send functions). `SessionChatPopup`/`useSessionChat` and `CommunityChatPopup`/`useCommunityChat` are thin wrappers over the shared pieces
- **Live text chat, realtime via Postgres Changes** on `session_messages` / `community_messages` (`supabase.channel('session-chat-<id>')` / `'community-chat-<id>'`, INSERT filtered on `session_id`/`community_id`)
- **Session scope**: session **creator + accepted participants** only (RLS enforces both read and write). Users who **left** can still read history up to the moment they left (`created_at <=` their commitment's `updated_at`) but cannot send; the client skips its realtime subscription and shows a "you left" banner, and they receive no further FCM pushes
- **Community scope**: any **approved community member** (RLS enforces both read and write); the chat button sits next to the ping button on the community screen and opens `CommunityChatPopup`
- Chat button sits in the `SessionDetailPopup` header (next to close); opens a full-screen `SessionChatPopup`
- Text only, max 1000 chars; sending disabled once a session is closed/completed/cancelled. **Own-message edit + delete**: the sender can edit content within 15 minutes of sending (bubble shows an *Edited* mark, stamped via `edited_at` by a DB trigger, migration 039) and hard-delete within 24 hours (bubble disappears for everyone via realtime DELETE). Both are enforced server-side by RLS + triggers on `session_messages`/`community_messages`, and the client applies them optimistically with revert (see `useChat`)
- **Optimistic UI** (`src/hooks/useChat.ts`): sending adds a temp bubble instantly with a **clock** (sending) → **check** (delivered) mark, then swaps to the real row with **no refetch**. Failure removes the temp and restores the draft + reply. A realtime INSERT for your own just-sent message is matched to the temp (by content + `reply_to_id`) and upgrades its id in place — never a second bubble, never a lost mark
- **My avatar** renders on the right of your own bubbles (from `useAuth().profile`)
- **Long-press to reply**: long-press any message to open a bottom-sheet "Reply to <name>" option; replies store `reply_to_id` (migration 025) and render a preview block (quoted name/content) inside the bubble
- **No joins / no per-message refetch**: `sender_username`/`sender_avatar_url` are snapshotted on the row at insert (migrations 026 / 027), so realtime payloads and the initial fetch carry the display name without a join. Reply previews/names resolve client-side from the already-loaded list (`resolveReplyPreview`), so replying to your own message shows your own name. This removed the self-join (`!reply_to_id`) entirely, along with the PGRST200 schema-cache dependency and one extra round-trip per message
- **Push** (server-side, migration 035): each message sends an FCM-only push (no in-app notification, so it does **not** appear in the Activity inbox) to every recipient except the sender — title = session name / community name, body = `<sender>: <content>`. A Postgres trigger on `session_messages` / `community_messages` fires the **`send-chat-notification`** edge function via pg_net, which computes recipients (creator + accepted participants / approved members), skips active readers via `chat_presence`, and fans out in one call. Chat pushes are **hybrid**: they carry both a `notification` block (so the OS/GMS auto-displays them even when the app process is dead — the fix for "no notifs when the app isn't running") and `data`. The body is the **server-accumulated list of ALL unread messages** for that recipient (computed from `*_chat_read` cursors, newest last — every unread message readable in one banner), never a "N new messages" count. Replacement is dual-path: `android.notification.tag` / `apns-collapse-id` handle it at the OS level (background/terminated), and when the app is running the JS re-posts under a **stable per-chat identifier (`chat_room_<id>`)**. Replying sends a `session_chat_reply` / `community_chat_reply` push to the replied-to author ("<sender> replied to you: …"). No client code triggers chat pushes — this works identically from web, which has no FCM but can still cause app users to receive pushes
- **Unread tracking** (migration 028): one row per (chat, user) in `session_chat_read` / `community_chat_read` holding `last_read_at` — O(participants), no per-message receipts. `fetchChatUnreadCount` counts `created_at > last_read_at` (0 when no cursor yet); `fetchChatReadCursor`/`upsertChatReadCursor` read/write the cursor. `useChat` exposes `unreadCount`, `firstUnreadIndex` (index of the oldest unread in the ascending list), and `markRead()` (upsert cursor → now, resets count). `ChatPopup` scrolls to the oldest unread with a "New messages" divider on open, marks read on open + debounced on scroll-end, and skips auto-pin-to-bottom while unread remain; realtime INSERTs from others bump `unreadCount` live so the badge updates even while closed. Unread badges show on the chat button in `community/[id].tsx` (members only) and on the session chat button in `SessionDetailPopup` (`canViewChat`). The `chat` thread is owned by the parent screen and passed into `SessionChatPopup`/`CommunityChatPopup` (no internal hook), so the badge and popup share one subscription

### 6b. Community Posts (migration 073–078)
- `community_posts` (post_type `text` | `photo` | `match`; `match` is reserved/not created from UI), `community_post_likes`, `community_post_comments`; photos upload to Cloudinary (`image_url`)
- Members read/create; author or community admin can delete. Reads via RPCs `get_community_posts`, `get_community_post_by_id`, `get_community_post_comments` (074/076 — RETURNS TABLE, not SETOF RECORD); service fns `fetchCommunityPosts`/`createCommunityPost`/`deleteCommunityPost`/`toggleCommunityPostLike`/`addCommunityPostComment`; hook `useCommunityPosts`
- Notifications (`community_post_created|liked|commented`) are created by DB triggers (075/078), not the client; UI: `PostCard`, `PostDetailPopup`, `CreatePostModal`

### 6c. Streaks (migrations 041, 042, 071, 072)
- `profiles.streak_count / longest_streak / last_activity_date / streak_updated_at`; **UTC-day based**. `updateStreak(userId, 'match_recorded' | 'session_joined' | 'session_created')` is called client-side from `recordCommunityMatch`, `approveCommitment`, `createSession`
- UI: flame in the Communities header (`StreakHeader`/`StreakModal`), `StreakDisplay` on profiles
- **`streak-cron`** edge function (pg_cron: hourly at-risk check, daily 05:00 UTC reminder, and a **daily 01:00 UTC / 6 AM PKT retention nudge** to users with FCM tokens) inserts `streak_reminder` / `streak_at_risk` / `streak_milestone` notifications → normal push path

### 6d. Session Feedback
- After a session ends (closed/completed/cancelled), the **creator** gets `SessionFeedbackPopup` on the Sessions tab (`fetchPendingFeedbackSessions`) to mark each accepted participant `showed_up` / `no_show` (`submitSessionFeedback` → `commitments.feedback_status`); a DB trigger updates `profiles.completed_sessions` (migration 032 fixed it). `total_committed_sessions` increments when a participant is **accepted** (033), counted once per session

### 6e. Platform Gates & Ops
- **Maintenance mode + forced update**: `RootLayout` reads `site_config` (rows `maintenance`, `min_app_version` — migration 047, world-readable, service_role-write-only) *before* mounting any provider; shows `MaintenanceScreen` or `ForcedUpdateScreen` (`isVersionSatisfied` vs `expoConfig.version`). Toggle with SQL in `maintainence-toggle.txt`; bump `min_app_version` (`min_version`, `store_url`, `message`) to force an update
- **What's New**: `src/lib/whatsNew.ts` content + a dot on the profile entry until viewed (AsyncStorage, keyed by version `1.0.1`)
- **Audit logging** (045, 062): triggers write every change on critical tables to `audit_logs`; clients cannot read or write it directly (service_role only)
- **Community admin engagement cron** (081, `community-engagement-cron` edge function, every 4 days 10:00 UTC) nudges admins; **new-community discovery notifications** (083, to users whose `sport_interests` match or are empty) and **admin "member joined"** notifications (080) are DB triggers

### 7. Activity (Notifications Inbox)
- Tabs: **Action Required** (`session_application`, `join_request`, `community_match_pending`), **Invites** (`community_invite`), **Past Activity**
- Inline Accept / Decline via `ActivityCard` / `InviteCard` — after an action the notification row is updated (type → resolved type, `read = true`) so it leaves the actionable tab permanently; invites become `community_invite_accepted`/`community_invite_rejected`
- **Resolution lives in the services too**: `approveCommitment`/`rejectCommitment`, `respondToJoinRequest`, and `approveCommunityMatch`/`disputeCommunityMatch` each resolve the matching pending notification (matched via `data->>sessionId/applicantId`, `data->>communityId/requesterId`, `data->>matchId`), so acting from a session/community popup also clears the Action Required inbox — not just from the Activity tab. Join-request and invite resolution is additionally enforced by DB triggers (migration 052), so it holds for any client (web, API)
- `session_application` notifications carry `applicantId` in `data` so a notification maps to one specific applicant
- **Shared state**: `NotificationsProvider` (mounted in root `_layout.tsx`) owns the feed + realtime subscription (INSERT/UPDATE/DELETE) on `in_app_notifications`; `useNotifications()` just reads the context, so the tab badge and inbox always agree
- Tapping any card marks it read (`markAsRead`); **Mark all as read** button clears the rest (`markAllAsRead`)
- Unread badge (red dot) on the Activity tab = derived `unreadCount` from the shared feed

### 8. Push Notifications (FCM)
- **In-app notification rows are created by Postgres triggers (migration 068)** on commitments, community_join_requests, pings, community_matches, community_members, community_posts (+likes/comments), etc. — **the client no longer inserts notifications**. `insert_notification` RPC is locked to `service_role` (069; old builds still call it inside try/catch, so they fail silently). `src/services/notifications.ts` is read/mark-read/delete only
- FCM token registered per device (`profiles.fcm_tokens`)
- **Push delivery is 100% server-side (migration 035) — no client code triggers FCM.** A Postgres trigger on `in_app_notifications` INSERT fires `pg_net.http_post` to the **`send-notification`** edge function with `{ notification_id }`; the function reads the row (recipient, title, body, data) and delivers via Firebase HTTP v1. A trigger on `session_messages` / `community_messages` INSERT fires the **`send-chat-notification`** edge function for FCM-only chat fan-out (see section 6). Both functions require a **service_role** bearer token (sent from Vault by the trigger, verified via `SUPABASE_JWT_SECRET`) and share the FCM plumbing in `supabase/functions/_shared/fcm.ts` (batched fan-out, cached OAuth token with a single-flight promise — one JWT per hour per warm instance)
- Web cannot **receive** FCM, but it can always **send**: every action on web inserts the DB row, which fires the same server-side push — app users never know the sender was on web
- Foreground/background/terminated handling; background data-only messages → local notification
- `session_chat_message` / `session_chat_reply` / `community_chat_message` / `community_chat_reply` pushes are **FCM-only** (server-triggered, never inserted into `in_app_notifications`). FCM payloads for in-app notifications carry `type` + the row's `data` for tap-routing

### 9. Profile & Settings
- **Profile** (`(tabs)/profile`, a hidden tab reached via the Communities header avatar): view/edit username, bio, avatar upload; other users via `/profile/[id]` (reads the `public_profiles` view; shows per-community stats + streak)
- **Theme picker**: Light / Dark / System (bottom sheet, persisted)
- **Push notification master toggle** (profile + `/settings`); per-type preferences exist in `profiles.notification_preferences` (`NotificationPreferences`, 33 keys) with defaults in `DEFAULT_NOTIFICATION_PREFERENCES`. Web shows `EnablePushNotificationsButton`
- **Delete account** (soft delete); re-enabled on re-login

### 10. Tournaments (migrations 084–097; specs in [`docs/tournaments/PLAN.md`](docs/tournaments/PLAN.md) (v1) and [`PLAN-v2.md`](docs/tournaments/PLAN-v2.md) (v2), status in [`PROGRESS.md`](docs/tournaments/PROGRESS.md))
- **Hierarchy**: Tournament (no sport; created + admins assigned by the owner via SQL — [`owner-sql.md`](docs/tournaments/owner-sql.md)) → **Modules** (one sport each, created by tournament admins) → **entries** (added by module admins only, no self-registration) → a **bracket / fixture list** in one of four **formats**: single elimination (optional 3rd-place match, byes, walkovers), round-robin **league**, **groups + knockout**, **double elimination**. Tournament admins can edit all tournament settings (name, description, organization, location, cover image, dates, status via `update_tournament`, migration 089), edit the entry form, create modules and assign module admins; they also hold module-admin powers in all their modules
- **v2 — participants**: a module is `participant_type = 'individual'` (v1) or `'team'` (`roster_min/max/lineup_size`; doubles = team of exactly 2). Team entries own `tournament_entry_members` rows (name, optional linked profile, per-member entry-form answers, captain, squad number); the entry form is filled **per member**. Written only through `upsert_team_entry` (full-roster payload; errors carry the member index, `FIELD_REQUIRED:cms_id@2`); private member fields follow the same PII rule (admin + the member themselves). Helpers `_entry_profile_ids` / `is_entry_participant` / `is_module_participant`; notifications go to every linked member
- **v2 — formats** (`tournament_modules.format`, settings via the jsonb patch RPC `update_tournament_module_settings`): `round_robin` (circle-method fixtures, 1–2 legs, optional draws, points W/D/L, tiebreakers points → head-to-head → diff → score for → wins → seed), `groups_knockout` (snake-drawn groups = round-robins on `bracket_side='group'`, then the admin builds a stage-2 single-elimination knockout via `preview_/build_/reset_knockout_stage`; group results lock as `STAGE_LOCKED`), `double_elimination` (winners + losers + grand final with optional reset; dead slots/auto-byes for non-power-of-two fields). Rounds/matches carry `stage_number`, `bracket_side`, `code`, slot labels (`entry_a_label`); engine entry points are unchanged (`generate_bracket`, `record_tournament_result`, …) and dispatch on format. Reads: `get_module_matches`, `get_module_standings_v2` (`kind` knockout | league | groups), `get_module_groups`. Client: `LeagueTable`, `ModuleGroupsTab`, `TeamEntryForm`/`MemberSheet`, `knockout.tsx` builder, `BracketView` sections for double elimination, `layoutTree` in `lib/bracketLayout.ts`
- **Entry form** is per tournament: 5 locked core fields (Name, CMS ID, School, Phone, Email; Name+School public, CMS ID/Phone/Email private) + custom fields (archived instead of deleted). Entry values live in `tournament_entries.field_values`; private values are stripped for non-admins **server-side** by `get_module_entries`
- **All writes go through SECURITY DEFINER RPCs** (clients have no INSERT/UPDATE/DELETE on any tournament table); reads through `get_tournaments`, `get_tournament_detail`, `get_module_*`; engine in 087 (`generate_bracket`, `record_tournament_result`, `record_tournament_walkover`, `reset_tournament_match`, `schedule_tournament_match`); errors are short codes (`NOT_ALLOWED`, `DUPLICATE_CMS_ID`, `TIE_NEEDS_WINNER`, `DOWNSTREAM_PLAYED`…) mapped client-side
- **Walkover requires both entries present** (deviation from the original plan, see PROGRESS). Module auto-completes (final ranks + `completed`) when the final / 3rd-place match is decided
- **Realtime**: `useTournamentModule` subscribes to `tournament_matches` (module filter, 400 ms debounce) so the bracket updates live
- **Notifications** (088): 6 `tournament_*` types created by triggers (only while the tournament is `published`, except admin-assigned); push via the existing `trg_fcm_push`; tap → module/tournament screen. Optional pref `tournament_updates`
- **Admin UI**: gear on tournament/module pages → manage screens (entry-form editor, module form, seeding, rounds); results via the match sheet (Enter/Edit result, Schedule, Reset)

### 11. Admin panel (migrations 122–124; plan in [`docs/admin-panel/PLAN.md`](docs/admin-panel/PLAN.md))
- Separate staff-only website in `admin/` (Vite + React SPA, own Vercel project, NOT part of the Expo build; excluded from root tsconfig/ESLint). Replaces the owner SQL runbooks (`owner-sql.md`, `maintainence-toggle.txt` are now emergency fallbacks)
- **The database is the gate**: `platform_admins` (122; roles `super_admin` | `tournament_manager`, soft revoke, no client policies) + internal `platform_role` / `assert_platform_role` / `log_admin_action`. Every `admin_*` function (SECURITY DEFINER, `revoke … from public, anon`, `grant … to authenticated`) starts with `assert_platform_role(...)`. Staff roles grant **no** in-app powers; you can't change/revoke your own role
- 123: `admin_get_site_config` / `admin_set_maintenance` / `admin_set_min_app_version` (same JSON shapes `RootLayout` reads). 124: tournament ops (`admin_list/get/create/update_tournament`, `admin_set_tournament_status`, add/remove admin, `admin_reopen_module`, `admin_delete_tournament` — super only). Writes log via `log_admin_action` (`metadata.admin = true`)
- Tests: `docs/admin-panel/sql-tests.sql` (run via `docs/tournaments/local-db/run.sh`). Adding a role (e.g. `moderator`) = additive change to the role check constraint

---

## Data Model (Supabase)

Current live tables (legacy `matches`/`match_likes`/`match_comments` were dropped by migrations 003/019):

```sql
-- Already implemented tables
profiles
  id, username (unique, was renamed from display_name), bio, avatar_url,
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
  edited_at (set by the edit trigger, migration 039),
  created_at
  -- sender snapshot: sender_username, sender_avatar_url (migration 026) — written
  -- at insert so realtime payloads/reads carry the display name with no join
  -- live text chat; readable/writable only by the session creator + accepted
  -- participants (RLS); added to the supabase_realtime publication (migration 021);
  -- UPDATE restricted to the sender within 15 min, DELETE within 24 h (RLS + triggers, migration 039)

community_messages
  id, community_id (fk, cascade), sender_id (fk, cascade), content,
  reply_to_id (self fk, ON DELETE SET NULL), sender_username, sender_avatar_url,
  edited_at (set by the edit trigger, migration 039),
  created_at
  -- live text chat; readable/writable only by approved community members (RLS);
  -- composite index (community_id, created_at); added to the supabase_realtime
  -- publication (migration 027);
  -- UPDATE restricted to the sender within 15 min, DELETE within 24 h (RLS + triggers, migration 039)

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

in_app_notifications
  id, user_id (fk, cascade), type, title, body, data, read, created_at
  -- inserted via SECURITY DEFINER RPC `insert_notification`
  -- INSERT trigger `trg_fcm_push` → pg_net → `send-notification` edge function (migration 035)

session_messages
  -- INSERT trigger `trg_session_chat_fcm_push` → pg_net → `send-chat-notification` (migration 035)

community_messages
  -- INSERT trigger `trg_community_chat_fcm_push` → pg_net → `send-chat-notification` (migration 035)

session_chat_read
  session_id (fk, cascade), profile_id (fk, cascade), last_read_at
  -- pk (session_id, profile_id); owner-only RLS (select/insert/update)

community_chat_read
  community_id (fk, cascade), profile_id (fk, cascade), last_read_at
  -- pk (community_id, profile_id); owner-only RLS (select/insert/update)

community_posts / community_post_likes / community_post_comments   -- migration 073
  community_posts: id, community_id, author_id, content, image_url, post_type (text|photo|match), created_at, updated_at

audit_logs   -- migration 045: id, actor_id, action, table_name, record_id, old_data, new_data, metadata, created_at (not client-readable, 062)
site_config  -- migration 047: key, value jsonb  ('maintenance' {enabled,message}, 'min_app_version' {min_version,store_url,message})
chat_presence -- migration 031: heartbeat rows used to skip pushes for active readers


tournaments / tournament_admins / tournament_entry_fields / tournament_modules / tournament_module_admins /
tournament_entries / tournament_rounds / tournament_matches   -- migration 084 (see PLAN §4)
  -- RLS SELECT-only; helpers is_tournament_admin / is_module_admin / can_view_tournament / can_view_module;
  -- core entry fields seeded + locked by triggers; tournament_matches is in the supabase_realtime publication

-- profiles additionally: streak_count, longest_streak, last_activity_date, streak_updated_at (041);
--   display_name (nullable), `role` made nullable and unused (040). Other users' profiles are read via the
--   `public_profiles` VIEW (safe columns only); the profiles table itself is own-row SELECT (046)
-- communities additionally: pings_enabled (030)
-- View: public_profiles (046); community_leaderboard (per-community rank by win_ratio)
-- RPCs (048/049/050 — SECURITY DEFINER, auth.uid()-guarded, server-side joins; the client reads through these):
--        get_public_communities, get_my_communities, get_community_by_id, get_community_members,
--        search_community_members, get_join_requests, get_community_invites, get_my_pending_invites,
--        get_community_matches, get_community_match_by_id, get_match_comments, get_open_sessions,
--        get_my_sessions, get_joined_sessions, get_my_accessible_sessions, get_session_by_id,
--        get_session_history, get_session_commitments, get_community_admin_ids (057),
--        get_chat_push_data (051/067, edge-function only), community-post RPCs (074/076)
-- RPCs: get_accepted_commitment_counts, close_expired_sessions,
--        create_community_invite, respond_to_community_invite,
--        get_chat_hub_stats (migration 036: batched unread counts +
--        last-message timestamps for the Chats hub, scoped via auth.uid())
```

### Notification Types
See `NotificationType` in `src/types/index.ts` (43 types, `match_pending` … `tournament_module_completed`; `session_chat_message`/`session_chat_reply`/`community_chat_message`/`community_chat_reply` are FCM-only and never stored in `in_app_notifications`). The DB `in_app_notifications.type` check constraint (migrations 008/014/034/071/077/079/082/088) is the source of truth for stored types and also allows `member_joined`, `community_engagement` and `new_community`, which are **not** in the TS union yet — **adding any new notification type requires a migration extending that check constraint** (a past bug: streak types were inserted before the constraint allowed them, fixed in 071).

---

## Key Conventions

### Backward Compatibility (mandatory)
- **Every new migration, feature, and Supabase edge function change must keep backward compatibility with already-installed app builds** (in stores/Play) and already-deployed infrastructure in mind.
- **Migrations**: never make a column NOT NULL or drop/rename a column or RPC/function that deployed clients still send/read. When a type/not-null constraint would block a change the client no longer sends (e.g. dropping a field from a form), make the column nullable with a documented migration instead. New columns/RPCs must be additive; old clients using `select('*')` must still work. If existing DB objects (views, RPCs, triggers, functions) depend on a column you change, update or drop them in the migration too — verify with a grep across `supabase/`.
- **Edge functions**: deployment is separate from the app — a stale deployed function vs. new/old client payload = silent 400s. Keep payload/response contracts backward-compatible with all installed app versions, and never remove request fields or change response shapes that older clients rely on. (See also "Edge Functions (Supabase)" below.)
- **Client changes**: when removing a feature (e.g. the profile role), the old code path is gone in the new build but old builds still send/read the old fields — the server/schema must tolerate both.

### Data Access & Security (since migrations 046–050)
- **Reads go through RPCs** (`supabase.rpc('get_…')`) that join server-side; direct FK embeds to `profiles` return null for other users because of RLS. For other users' profile data use the `public_profiles` view (`select('id, username, avatar_url')`), never `profiles` (own-row only; `fcm_tokens` and prefs are private)
- Every `SECURITY DEFINER` function must start with an `auth.uid()` guard (049). New RPCs: `RETURNS TABLE (...)` with explicit columns, not `SETOF RECORD` (074/076 fixed "materialize mode required")
- Defense in depth lives in DB triggers/RLS, not just UI (e.g. 044 closed a self-promote-to-admin hole, 061 validates match participants, 063 forces session `expires_at`). Don't rely on client checks
- Migration `056_future_restrict_community_members_rls.sql` is intentionally **not applied** until all installed builds use `get_community_admin_ids`
- `supabase/schema.sql` is stale — use the numbered migrations as the schema history. Next migration number: **125**

### Server-side hardening (migrations 098–119 — see `bugreport.md`)
- **Guards live in the DB, silently or loudly**: `guard_commitment_write` (100: state machine + capacity + feedback rules, error codes `SESSION_FULL`/`NOT_ALLOWED`/…), `guard_community_match_update` + forced-pending inserts (101), `guard_session_write` (110: date/participant limits, no delete with accepted participants), `guard_profile_protected_columns` (105: streak/completed counters are **trigger-owned**, client writes are silently reverted — `updateStreak()` now just calls `record_streak_activity`), `guard_community_member_stats` (112), chat sender snapshot/identity triggers (106) and reply/length rules (111), username/bio rules (116) and Cloudinary-only image URLs (113) validated **on change only** — never add a `CHECK` (even `NOT VALID`) on legacy-capable columns: it is evaluated on every UPDATE of the row and would block unrelated updates.
- **Membership checks use `auth.uid()` and `approval_status = 'approved'`** (107; read RPCs 102/103; post likes/comments 104). `get_community_matches` & co. are thin wrappers over `*_impl` functions (revoked from clients).
- **Privileges**: `anon` has no access to views/functions in `public` (109); internal functions (`get_chat_push_data`, `prune_fcm_tokens`, `_apply_streak_activity`, …) are `service_role` only. New `SECURITY DEFINER` functions must `revoke … from public, anon` and grant explicitly.
- **FCM tokens**: `claim_fcm_token` (108) moves a token to the caller and removes it from other profiles; sign-out removes the device token; push edge functions prune `UNREGISTERED` tokens and honour `notification_preferences` (master-off ⇒ no push at all, chat included) — **redeploy `send-notification` and `send-chat-notification` after these changes**.
- **Auth**: Supabase client uses **PKCE**; `handleAuthRedirectUrl` (services/auth) only accepts an OAuth `code` while a sign-in started by this app is pending.
- Session `full`/`open` is maintained by trigger (114); expired sessions are closed by pg_cron every 5 min (119); stats are symmetric on approve/un-approve (115/117); `completed_sessions` is symmetric (118).

### Alerts & confirmations (mandatory)
- **Never use browser-native dialogs** — no `window.alert` / `window.confirm` / `window.prompt` (and no bare `Alert.alert` in screens). Every alert, validation message and confirmation must be an **in-app, custom-made component** (themed sheet/modal for confirmations, `toast()` for non-blocking messages) that works identically on native and web.
- Native dialogs block the whole page on web (they freeze the tab, can't be styled, can't be dismissed by automation/tests, and look foreign). On web, `alert()` from `src/lib/alert.ts` renders the themed in-app dialog `<AlertHost />` (`src/components/motion/AlertHost.tsx`, mounted once in the root layout, web only): queued FIFO, cancel button on the left / destructive in red, Escape or backdrop = cancel (or dismiss for a single-button notice), Enter = primary. Native still uses `Alert.alert`. Always call `alert()` from `@/lib/alert` — never `window.*` dialogs or bare `Alert.alert`.
- Validation errors → inline field error or `toast()`; destructive/irreversible actions (delete, reset, generate bracket, cancel) → in-app confirm sheet with an explicit destructive button.
- The former web offenders (`docs/tournaments/BUGREPORT-web-testing.md` TB-02, TB-06: result validation, reset result, delete entry, generate bracket/fixtures, cancel/delete module) all go through `alert()`, so they now get the in-app dialog on web.

### Motion system (see `animations_redone_plan.md`)
- All durations/springs/easings live in `src/lib/motion.ts` (`Duration`, `Springs`, `Easings`, `RM`) — no magic numbers in components. Animate only `transform`/`opacity` (+ colour via interpolation); use Reanimated, never mix with legacy `Animated` in one component.
- Primitives in `src/components/motion/`: `PressableScale`, `FadeInItem` (first-load stagger only), `Skeleton*` (one shared pulse via `SkeletonProvider`), `AnimatedNumber`, `AnimatedBadge`, `Collapsible`, `ScreenFadeIn`, `Confetti` (`celebrate()` + `<ConfettiHost/>` in root layout), `Toast` (`toast(title, msg?)` + `<ToastHost/>` in root layout — non-blocking feedback only; confirmations use an in-app confirm sheet, never browser-native dialogs — see "Alerts & confirmations"), `FadeImage` (content images).
- Haptics via `src/lib/haptics.ts` (no-op on web): selection = tab/segment/chip change; light = like/send/FAB/refresh; medium = long-press/swipe threshold; success = approve/record/join; warning = destructive/dispute; error = failed action.
- **Shadow rule**: in-flow surfaces (cards, stat rows, chips) are **flat on Android** (`elevation: 0`; `Shadows.*.card` already is) because Android elevation ignores parent opacity and ghosts as a dark box during fade transitions. Keep `elevation` only for floating UI that never fades with a screen (FAB, Toast, chat popovers, modal cards, tab bump).
- **Sheets** (`motion/Sheet.tsx`): handle Android keyboard padding themselves; drag down anywhere dismisses (use `SheetScrollView` for scrollable bodies so the list scrolls first). **Image pickers** go through `lib/pickImage.ts`. **Chats tab badge** is refreshed by `useChatUnreadWatcher` + `lib/chatUnreadRefresh.ts`. **Tips** live in `lib/tips.ts` + `<TipCard id=…/>`.
- Reduced motion is mandatory (`useReducedMotion()` / `.reduceMotion(RM)`): no stagger/overshoot/loops.

### Routing (expo-router v57)
- Tabs: `/` (Communities), `/history` (Sessions), `/tournaments` (Tournaments, centre), `/chats` (Chats), `/updates` (Activity); `/profile` is a hidden tab (`href: null`)
- Tournament stack screens (`headerShown`): `/tournament/[id]`, `/tournament/[id]/manage`, `/tournament/[id]/fields`, `/tournament/[id]/module/[moduleId]` (+ `/manage`, `/seeding`, `/rounds`); modals: `/tournament/[id]/module-form`, `/tournament/[id]/module/[moduleId]/entry-form`. Use `tournamentRoutes` (`src/lib/tournamentRoutes.ts`) for hrefs (generated route types lag new routes)
- Stack screens with `headerShown`: `/settings`, `/discover`, `/community/[id]`, `/community/[id]/members`, `/community/[id]/info`, `/community/[id]/edit`, `/community/[id]/pending-matches`, `/profile/[id]` (`/community/[id]/join-requests` is auto-registered, no explicit options)
- Modals (`fullScreenModal` + slide_from_bottom): `/add-match`, `/create-community`, `/create-session`, `/chat`
- `src/app/chat.tsx` reads `{ type: 'community' | 'session', id }` and renders the matching `CommunityChatPopup` / `SessionChatPopup` full screen. Chat **push notification** taps (`session_chat_message`/`session_chat_reply`/`community_chat_message`/`community_chat_reply`) navigate here directly via `useFCM.navigateToNotification` (previously they opened the community/history screen).
- Auth screens: `/login`, `/onboarding`, `/auth/callback`

### Theme
- `useTheme()` returns `{ ...Colors[resolvedColorScheme], colorScheme(from origin), resolvedColorScheme, toggleTheme, setTheme }`
- Colors: `background`, `text`, `backgroundElement`, `border`, `textSecondary`, `tabBar`, `tabBarActive`, `tabBarInactive`, `backgroundSelected`
- `Colors.light` / `Colors.dark` in `src/constants/theme.ts`

### Edge Functions (Supabase)
- Edge functions live in `supabase/functions/` and deploy **separately** from the app — a Vercel deploy does NOT deploy them. They are never deployed automatically by committing code.
- **CRITICAL**: any change to an edge function — payload/response contract, request fields, response shape, secrets/env (`FCM_SERVICE_ACCOUNT`), or the function body — takes effect **only after** `supabase functions deploy <name>`. Keep deployed functions backward-compatible with installed app versions; a stale deployed function vs. new client payload = silent 400s = push broken for everyone.
- **Edge functions are NOT called by the client anymore.** `send-notification` and `send-chat-notification` are only invoked by Postgres triggers via pg_net (migration 035) after a chat/notification row is inserted, so web-sent actions push to app users identically to native. Both require a `service_role` bearer token; the trigger reads the service role key + Supabase URL from Vault secrets (`vault.create_secret('...', 'service_role_key')` and `'supabase_url'`).
- **Whenever an edge function is edited, the AI must explicitly instruct the user to redeploy it** (e.g. `supabase functions deploy send-notification`) and remind them to verify with a live test afterward.

- **Deployed functions**: `send-notification`, `send-chat-notification` (FCM, pg_net-triggered), `streak-cron` (modes `daily` 05:00 UTC, `at-risk` hourly, retention 01:00 UTC; pg_cron 042/072), `community-engagement-cron` (pg_cron 081). Cron migrations embed the service-role key placeholder — never commit a real key. The cron functions `assertServiceRole` too. `cloudinary-destroy/` is an empty directory (nothing to deploy)

### State & Data Patterns
- All Supabase calls go through `src/services/*` (return `{ data, error }`, throw on error)
- Hooks wrap service calls, expose `{ data, loading, refreshing, refresh }`, reload on focus
- `useCommunity(communityId, userId)` exposes community, membership, joinRequests + setters
- Real-time: `supabase.channel` for `session_messages` / `community_messages` (session + community chat), and `in_app_notifications` (`NotificationsProvider`)
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
supabase functions deploy <name>  # Deploy a changed edge function (e.g. send-notification)
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
- **Supabase RLS** protects all tables (policies live in the numbered migrations; `schema.sql` is stale). Notifications are created by DB triggers (068); `insert_notification` is service_role-only (069)
- **Chats hub is fast by construction** — unread counts + last-message timestamps come from one batched `get_chat_hub_stats` RPC per chat type (migration 036, scoped via `auth.uid()`), not N+1 per-chat counts; the hub renders community/session rows first and hydrates badges/sort after; a 30s stale-while-revalidate module cache (`src/hooks/useChats.ts`) makes tab revisits instant. Session rows come from the lean `fetchChatSessions` (no commitment embeds / count RPC / expiry RPC). `closeExpiredSessions` is client-side debounced (15s) to collapse the repeated RPC across screens; composite list indexes were added in migration 037.
- **Session/community chat has no joins / no per-message refetch** — sender name/avatar are snapshotted on the row at insert (migration 026 / 027) and reply previews resolve from the already-loaded message list; this removes the self-join (and its PGRST200 schema-cache dependency) plus one extra round-trip per message
- **FCM fan-out is batched server-side** — the `send-chat-notification` edge function computes all recipients (creator + accepted participants / approved members, minus sender) in one invocation and sends N FCM messages; it caches its OAuth token (single-flight promise, 5-min refresh margin) so a message costs one JWT, not one per recipient. `send-notification` handles in-app notifications one row at a time (single recipient).
- **Chat is FCM-only** — chat pushes never touch `in_app_notifications`, so they don't pollute the Activity inbox or drive its unread badge
- **No client-side FCM trigger remains** — `src/services/chat.ts` only inserts chat rows and notification rows come from DB triggers (068); migration 035 + the `send-notification`/`send-chat-notification` edge functions (invoked by pg_net triggers) handle delivery. This keeps web (which has no FCM send capability beyond the fetch it used to make) from ever blocking app users' pushes.

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
  - "feat: session chat — optimistic sends (clock → checked), own avatar, long-press reply sheets + reply pushes, batched FCM fan-out (single edge call), sender snapshots with no per-message refetch"
  - "feat: community chat — same shared chat implementation as sessions, scoped to approved community members, FCM-only pushes, chat button next to ping button in community home"
  - "feat: server-side push — all FCM delivery moved out of the client into pg_net triggers (migration 035) + `send-notification`/`send-chat-notification` edge functions, so web sends push to app users identically to native"
  - "perf: chats hub — batched `get_chat_hub_stats` RPC (migration 036), stale-while-revalidate cache + render-first hydration in `useChats`, lean `fetchChatSessions` for the hub, debounced `closeExpiredSessions`, composite list indexes (migration 037)"
  - "feat: security hardening — audit logs (045), RLS fixes (044/046/054), auth-guarded RPCs (048–050), `public_profiles` view, DB-level community guards (059–066)"
  - "feat: server-side notification creation via triggers (068/069) — client no longer inserts in_app_notifications"
  - "feat: daily streaks + streak/retention cron pushes (041/042/071/072), session feedback (showed up / no-show)"
  - "feat: community posts feed (text + photo, likes, comments) merged with matches, FAB menu (073–078)"
  - "feat: maintenance mode + forced-update gate via `site_config` (047), What's New, web push permission prompt, new-community discovery + admin engagement notifications (079–083)"
  - "feat: tournaments — SQL schema/RPCs/bracket engine/notifications (084–088), centre Tournaments tab, bracket/standings/matches, admin management screens"

---

## Tournaments — remaining work
Implemented in code (v1 steps 1–23 of [`PLAN.md`](docs/tournaments/PLAN.md) §14 and v2 steps 25–44 of [`PLAN-v2.md`](docs/tournaments/PLAN-v2.md)); **database steps need the owner to apply migrations 084–097 and run [`docs/tournaments/sql-tests.sql`](docs/tournaments/sql-tests.sql) then [`sql-tests-v2.sql`](docs/tournaments/sql-tests-v2.sql)** (both also pass against a local Postgres container — see [`docs/tournaments/local-db/`](docs/tournaments/local-db/README.md)), and the screens need an on-device check (see PROGRESS.md "needs owner" notes). Not built: tournament requests (step 24, optional), self-registration, Swiss system / best third-placed qualification, per-match lineups and player stats, tournament chat, community-hosted tournaments (`tournaments.community_id` exists unused). Adding more tournament notification types needs another migration extending the `in_app_notifications.type` check constraint.
