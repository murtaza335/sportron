# Sportron — Features, Versioning & Remote Management Guide

Owner's guide. Covers what the app does, how versions work, how to ship changes (store build vs. over-the-air vs. server-only), and how to control the app remotely from the admin panel.
Technical detail lives in `AGENTS.md`; the roadmap that produced this setup is `docs/roadmap/PLAN.md`.

---

## 1. The three ways a change reaches users

| Layer | What it is | Speed | Needs Play review? |
|---|---|---|---|
| **Server / admin panel** | Data and switches in Supabase, edited from the admin site | Instant | No |
| **OTA update (EAS Update)** | New JavaScript/UI pushed to installed apps | Minutes (applies on next app start) | No |
| **Store build (EAS Build → Play)** | New native binary (new native library, permissions, app icon, intent filters, Expo SDK upgrade) | Hours–days | Yes |

**Rule of thumb:** prefer the top row. Only build a store release when native code changes.

### What needs what

| I want to… | Use |
|---|---|
| Show a banner / pop-up / promo | Admin panel → **Announcements** (instant) |
| Push-notify a segment | Admin panel → **Broadcasts** (instant) |
| Turn a feature on/off, roll out to 10% of users | Admin panel → **Flags & config** |
| Add a sport to the "More" list, change a limit, edit tips / What's New | Admin panel → **Flags & config** (remote lists) |
| Put the app in maintenance, force or suggest an update | Admin panel → **Settings** |
| Create tournaments, add tournament admins, add a discount code | Admin panel → **Tournaments** |
| Fix a bug or change a screen / copy / logic in the app | **OTA update** |
| Add or change a database table / function | **Migration** (+ usually an OTA for the UI) |
| Change an edge function | `supabase functions deploy <name>` |
| Add a native package, change `app.json` native config, upgrade Expo SDK | **Store build** |
| Change the website (web app) | Web deploy (Vercel) |

---

## 2. Versioning — what each number means

| Number | Where | Meaning | Who changes it |
|---|---|---|---|
| **App version** (`1.0.1`) | `app.json` → `expo.version` | The user-facing version. Used by the **forced / soft update** checks, feature-flag `min_app_version` and announcement version targeting. | You, by hand, on **store releases** |
| **Android versionCode** | EAS (remote counter) | Internal build number Google requires to increase every upload. | **Automatic** (`appVersionSource: remote` + `autoIncrement` in `eas.json`) |
| **Runtime version** | `app.json` → `runtimeVersion: { policy: "fingerprint" }` | A hash of the app's native code. An OTA update is delivered **only** to builds with the same runtime version. | **Automatic** — changes whenever native code/config changes |
| **OTA update group** | EAS Update | One published JS bundle on a channel. | `eas update` |

### How the pieces fit
- Fingerprint runtime means **you cannot accidentally push JS to a build that lacks the native code it needs**: if you add a native package, the fingerprint changes, and the new JS only goes to the new store build. Older installs keep receiving updates built for *their* fingerprint (so keep publishing from the right git commit if you must patch an old build).
- **Channels** (`eas.json`): `production` (Play store build), `preview` (internal APK for testing), `development` (dev client). A build only listens to its own channel.
- **When to bump `expo.version`:** on every store release that users should notice (e.g. `1.0.1` → `1.1.0`). OTA updates do **not** change `expo.version`. Version rules: patch = fixes, minor = new features, major = big redesign.
- **Compatibility rule (mandatory):** every migration/edge-function change must keep working for already-installed builds (see `AGENTS.md → Backward Compatibility`). Server changes ship first and are additive; old builds simply ignore what they don't know.

### Controlling who must update (Admin → Settings)
- **Forced update** — `min_app_version`: builds below it see a blocking "Update required" screen with the store link. Use only for breaking server changes.
- **Soft update** — `recommended_app_version`: builds below it see a dismissible "Update available" banner.
- **Maintenance mode** — blocks the whole app with your message. Emergency SQL fallback: `maintainence-toggle.txt`.

---

## 3. Shipping changes — step by step

### 3.1 OTA update (most releases)
Prerequisite: the installed build contains `expo-updates` (it ships from the build that introduced it onward; older builds can't receive OTA).

```bash
# 1. Make sure the code is committed and checks pass
npx tsc --noEmit && npm run lint

# 2. Publish to production users
eas update --channel production --message "Fix chat unread badge"

# Test first on the preview APK:
eas update --channel preview --message "Test: discount codes"
```
- Users get it the **next time they open the app** (downloaded in the background, applied on the following start — `fallbackToCacheTimeout: 0` means the app never waits for it).
- Check what's live: `eas update:list --branch production`.
- **Roll back a bad update:** `eas update:republish --group <previous-group-id> --branch production` (re-publish a known-good group) — or `eas update:rollback` on newer CLI versions. Run `eas update --help` to confirm your CLI's options.
- If `eas update` warns the fingerprint matches no build, you changed native code → do a store build instead.

### 3.2 Store build (native changes)
```bash
# 1. Bump expo.version in app.json if users should see a new version
# 2. Build the Android App Bundle for Play
eas build -p android --profile production
# 3. Upload to Google Play
eas submit -p android --profile production     # or upload the .aab in Play Console
# Internal test APK instead:
eas build -p android --profile preview
```
After the new build is live, optionally set **Soft update** (or Forced, if required) in the admin panel so existing users move over.

### 3.3 Database migrations
1. Add `supabase/migrations/NNN_name.sql` (next free number — currently **130**). Additive only.
2. Run it in the Supabase SQL editor (or `supabase db push`).
3. Run the local test suite first if you touched tournaments/admin/roadmap functions: `docs/tournaments/local-db/run.sh`.
4. **Order of rollout for a new feature:** migration → (admin site if it has a page) → OTA/store build → enable the flag.

### 3.4 Edge functions
```bash
supabase functions deploy send-notification
supabase functions deploy send-chat-notification
```
Deployment is **separate** from app/web deploys. After deploying, send a real test push. (Broadcasts and discount codes need no edge-function change.)

### 3.5 Web app (Vercel)
```bash
npx expo export -p web
cp vercel.json dist/vercel.json
vercel ./dist --prod
```
(Same as `web-deploy-commands.txt`.) Shared links under `sportron.app` rely on this site + `assetlinks.json` for Android App Links.

### 3.6 Admin panel (Vercel, separate project)
Root directory `admin/`; deploys on push or `vercel --prod` from that folder. Env vars and first super-admin bootstrap: `admin/README.md`.

### 3.7 Safe-rollout recipe for a new feature
1. Ship the migration (additive).
2. Ship the code behind a **flag that is OFF** (OTA or store build).
3. In **Flags & config**, turn it on for 10% → check → 100%. Set `min_app_version` if older builds can't handle it. Kill switch = turn it off.

---

## 4. Remote management — the admin panel

Staff-only site (Google sign-in; the **database** enforces roles). Roles: `super_admin` (everything) and `tournament_manager` (tournaments only). Staff are added on the **Staff** page.

| Page | Who | What you control |
|---|---|---|
| **Tournaments** | both roles | Create/edit tournaments, publish/complete/cancel, assign tournament admins, reopen a finished module, **discount codes** (6-digit, per tournament, with reveal counts). Delete = super only. |
| **Announcements** | super | Banners and pop-ups: title, body, Cloudinary image, button + link, placement (app-open pop-up, home / tournaments / sessions banner), platform and version targeting, schedule, priority, dismissible, max shows, views/clicks stats. |
| **Broadcasts** | super | Push notification to everyone, one sport's followers, or one community. Preview count, confirm, 5,000-recipient cap, history. Tapping can open an in-app route or `https://` link. |
| **Flags & config** | super | Feature flags (on/off, rollout %, min version, platforms) and remote content: sports list, session "expire after" chips, limits, What's New, tips. |
| **Settings** | super | Maintenance mode, minimum (forced) version, recommended (soft) version. |
| **Staff** | super | Add / change / revoke staff. You can't change your own role. |

Every admin action is written to the audit log.

### 4.1 Feature flags
Fields: `key`, `enabled`, `min_app_version`, `rollout_percent` (0–100, stable per user), `platforms`. In app code: `useFlag('key', fallback)`. Seeded flags: `announcements` (read by the app) and `tournament_promos` (created for the discount-code card, **not yet read by the app** — the card currently shows whenever a promo exists; wire it with `useFlag('tournament_promos', true)` if you want a kill switch).

### 4.2 Remote config keys (Flags & config → remote lists)
| Key | Shape | Effect |
|---|---|---|
| `sports` | list of `{key,label,emoji,kind,tier, …}` | Sport pills; `tier: "more"` appear under **More** in the tournament module form (defaults: roster size, scoring mode, draws). Can't contain `other`; keys unique. Seeded More sports: futsal, chess, egaming, athletics. |
| `expire_options` | `[{label,value(min)}]` | "Expire after" chips when creating a session |
| `limits` | `{chat_max_length, session_max_days_ahead}` | Client limits (the **server still enforces its own** — raising a limit above the DB's has no effect) |
| `whats_new` | `{"version":"1.1.0","items":[{id,title,description,type}]}` | What's New sheet; changing `version` re-shows the dot to everyone |
| `tips` | object keyed by tip id | Onboarding / empty-state tips |
| `session_purposes` | list | Session purpose dropdown |

If remote values are missing or the call fails, the app falls back to the values bundled in the build, so nothing breaks offline.

---

## 5. Feature guide (what the app does today)

**Accounts** — Google sign-in; profile (username, bio, avatar); soft-delete + re-enable on next login; signed-out visitors opening a shared link are returned to it after login.

**Communities** — one sport each (an "Other" community must name the exact sport); public (instant join) or restricted (admin approves); invites; admin tools; pings (15-min cooldown); community feed of text/photo posts + approved matches with likes/comments; community chat; leaderboard stats. Creator can't be removed; delete only when empty.

**Matches** — recorded inside a community (racket: singles/doubles; team sports: team names); opponent approves or disputes. Not available for "Other" communities.

**Sessions (Find a match)** — create with title, purpose, time, capacity, expiry; apply → creator approves; session chat for creator + accepted players; post-session feedback (showed up / no-show); History view.

**Chats hub** — all community/session chats with unread badges; reply, edit (15 min), delete (24 h); FCM-only pushes.

**Activity inbox** — actionable items (applications, join requests, match approvals), invites, past activity; admin broadcasts also land here.

**Streaks** — daily activity flame, milestones, reminder / at-risk / retention pushes (cron).

**Tournaments** — tournament → modules (one sport each; "Other" or More sport with exact name; "how is a match won" setting) → entries (individual or team) → single elimination, league, groups + knockout, or double elimination. Live brackets, standings, schedules, results, champions, notifications. **Discount code** card (tap to reveal / visible / hidden-by-long-press-on-cover).

**Sharing & links** — share buttons on communities, matches, posts, sessions, tournaments, modules, profiles (`https://sportron.app/...`); Android App Links open the app directly.

**Notifications** — all server-side (DB trigger → edge function → FCM); per-type preferences + master toggle.

**Platform gates** — maintenance mode, forced update, soft update banner, What's New.

---

## 6. Release checklists

**Every OTA**
- [ ] `npx tsc --noEmit` and `npm run lint` clean
- [ ] Any needed migration already applied (server first)
- [ ] `eas update --channel preview` tested on the preview APK
- [ ] `eas update --channel production --message "…"`
- [ ] Update **What's New** in the admin panel if users should hear about it

**Every store build**
- [ ] Bump `expo.version` (if user-visible)
- [ ] `eas build -p android --profile production` → `eas submit` / upload to Play
- [ ] After approval: set **Soft update** (or Forced if the server change is breaking)
- [ ] Update What's New (remote) and the bundled fallback in `src/lib/whatsNew.ts`
- [ ] Update `AGENTS.md` if behaviour or structure changed

**Every migration / edge function**
- [ ] Additive and backward compatible with installed builds
- [ ] Tested locally (`docs/tournaments/local-db/run.sh`)
- [ ] Applied/deployed, then live-tested

---

## 7. Emergencies

| Situation | Action |
|---|---|
| A bad OTA update | Republish the previous good group (see 3.1) |
| A feature is misbehaving | Turn its flag off (Flags & config) |
| Backend problem | Admin → Settings → **Maintenance** on (fallback SQL: `maintainence-toggle.txt`) |
| Old builds can't work with a server change | Admin → Settings → raise **min app version** (forced update) |
| Unwanted announcement | Announcements → **End** |
| Pushes not arriving after a function change | Redeploy `send-notification` / `send-chat-notification`, check `FCM_SERVICE_ACCOUNT`, test live |
| Staff account compromised | Staff page → revoke role (takes effect on next request) |

---

## 8. Not built yet (decided to skip for now)
- Rich link previews (WhatsApp/Twitter) via a Vercel edge function.
- Crash reporting (Sentry) — needs a Sentry project/DSN and a store build.
- Per-user unique discount codes; Swiss-system tournaments; tournament chat.
