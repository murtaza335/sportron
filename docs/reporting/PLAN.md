# Reporting (content & user reports) + username change limit — Plan

Status: **implemented in code (steps 1–11 of §9); rollout (§8) pending — needs the owner**. Target delivery: **migrations + admin-panel deploy + EAS Update (OTA)** — no new store build.

This release has two parts:
- **Part A: Reporting** (§1–§11)
- **Part B: Username change limit.** A user may change their username **only once every 30 days** (§12). Both parts follow the same OTA rules (§2).

## 1. Goal

Let any signed-in user report something objectionable anywhere it appears in the app (chat message, post, comment, match, profile, community, session, tournament), and give staff a queue in the admin panel to review and act on reports.

Why now:
- Google Play's User Generated Content policy requires in-app reporting for apps with posts, comments and chat. The App Store has the same rule (guideline 1.2), and it will apply once iOS launches.
- Today a bad post or message can only be removed by its author or a community admin. Platform staff have no visibility at all.

Non-goals for v1 (see §10 for later phases): blocking users, account suspension, automatic hiding, notifying the reporter of the outcome, reporting from the web-only marketing pages.

---

## 2. OTA constraints (this drives every decision below)

The app uses `expo-updates` with `runtimeVersion: { policy: "fingerprint" }`. An OTA bundle only reaches installed builds whose native fingerprint matches the one published from this commit.

| Rule | Why |
|---|---|
| **No new native dependencies.** Build only with what is already installed: `react-native-reanimated`, `lucide-react-native`, `motion/Sheet`, `expo-haptics`, AsyncStorage. | A new native module changes the fingerprint, and the update would then only reach a new store build. |
| **Don't touch `app.json`, `eas.json`, config plugins, `android/`, or `package.json` deps.** Don't bump `expo.version` (an OTA doesn't change it; see the release guide). | Config feeds the fingerprint. |
| **Before publishing**, check that the fingerprint matches the production build: `eas update --channel preview` must not warn *"no compatible builds"*. Optionally compare with `npx expo-fingerprint fingerprint:generate --platform android` against the runtime version shown in `eas build:list`. | Catches an accidental native change before users are affected. |
| **Database first, JS second.** Apply the migration and deploy the admin panel *before* `eas update`. | An updated client must never call an RPC that doesn't exist yet. |
| **Ship behind the `reports` feature flag, OFF**, with `useFlag('reports', false)`. | Lets us publish the OTA, test on real devices, then switch it on (or off as a kill switch) without another update. |
| **Don't rely on the flag's `min_app_version`** to target OTA'd clients. | OTA doesn't change `expo.version`, so a 1.0.2 build with and without the update look the same. The client code itself is the gate: only bundles that contain it can show the UI. |
| **Additive schema only**; no edge-function changes. | Old builds keep working untouched. No redeploy of `send-notification` / `send-chat-notification` is needed. |
| **Adoption is gradual.** `fallbackToCacheTimeout: 0` means the update downloads in the background and applies on the *next* cold start. | Expect a day or two before most active users have it. Not an issue, because nothing server-side depends on clients updating. |

Old builds that never receive the OTA simply don't show a Report button. Nothing breaks.

---

## 3. Data model — migration `130_reports.sql`

(Next free number is **130**, per `docs/GUIDE-features-and-releases.md`. The "125" in `AGENTS.md` is out of date.)

```sql
create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references public.profiles(id) on delete cascade,
  target_type      text not null check (target_type in (
                     'session_message','community_message',
                     'community_post','community_post_comment',
                     'community_match','community_match_comment',
                     'profile','community','session','tournament')),
  target_id        uuid not null,
  target_owner_id  uuid,            -- author/creator of the target, resolved server-side
  community_id     uuid,            -- context for filtering in the panel (nullable)
  session_id       uuid,
  reason           text not null check (reason in (
                     'spam','harassment','hate','sexual','violence',
                     'impersonation','fake_result','scam','other')),
  details          text check (char_length(details) <= 500),
  snapshot         jsonb not null,  -- copy of the content at report time (server-built)
  status           text not null default 'open'
                     check (status in ('open','actioned','dismissed')),
  action_taken     text check (action_taken in ('none','content_removed','warned','other')),
  resolution_note  text,
  resolved_by      uuid references public.profiles(id),
  resolved_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- One open report per (reporter, target): re-reporting is idempotent
create unique index reports_open_unique
  on public.reports (reporter_id, target_type, target_id) where status = 'open';
create index reports_queue_idx  on public.reports (status, created_at desc);
create index reports_target_idx on public.reports (target_type, target_id);
create index reports_owner_idx  on public.reports (target_owner_id);

alter table public.reports enable row level security;   -- no policies: no direct client access
revoke all on public.reports from anon, authenticated;
```

Notes:
- **Why a snapshot?** Chat messages can be hard-deleted by the sender within 24 h, and posts and comments can be deleted at any time. Without a copy, a harasser could delete the message and leave staff with nothing to review. The snapshot is built **inside the RPC** from the live row, never from client input. It holds the content, image URL, sender username, timestamps, and for chat the 5 preceding messages for context.
- `target_id` is polymorphic (no FK), so a report survives deletion of its target.
- Add the existing audit trigger (045) to `reports`, so staff actions are logged.
- **Platform role:** extend the `platform_admins.role` check with `'moderator'`, which is additive as planned in 122. `moderator` gets the report functions only. `super_admin` gets everything.

---

## 4. RPCs

All are `SECURITY DEFINER`, `set search_path = public`, start with the `auth.uid()` guard, return explicit `RETURNS TABLE`/`jsonb`, `revoke … from public, anon`, `grant execute … to authenticated`. Errors are short codes, matching the tournament convention.

### 4.1 Client: `submit_report(p_target_type text, p_target_id uuid, p_reason text, p_details text default null) returns uuid`

1. `auth.uid()` is not null, and the caller's profile is not soft-deleted.
2. Validate `p_target_type` and `p_reason`; trim `p_details` (empty → null; >500 → `DETAILS_TOO_LONG`).
3. **Resolve the target and check the caller can actually see it**, reusing existing visibility rules so the RPC can't be used to probe hidden content:
   - `session_message`: caller is the session creator or an accepted participant (or a former participant reading pre-leave history; same rule as the RLS in 021/028).
   - `community_message` / `community_post*` / `community_match*`: caller is an approved member of the community (or, for public communities, posts and matches visible through the existing read RPCs).
   - `profile`: must exist in `public_profiles`.
   - `community`: public, or the caller is a member.
   - `session`: visible through `get_session_by_id` rules.
   - `tournament`: `can_view_tournament(id)`.
   - Not found or not visible → `NOT_FOUND` (same code for both, to avoid leaking existence).
4. `target_owner_id = auth.uid()` → `CANNOT_REPORT_SELF`.
5. **Rate limit:** more than 20 reports by this reporter in the last 24 h → `RATE_LIMITED`.
6. Build `snapshot` (§3), then `insert … on conflict (reporter_id, target_type, target_id) where status = 'open' do nothing`. If a row already existed, return its id. The client treats both cases as "Thanks, we got it", so repeated taps are harmless.
7. Return the report id.

Optional `get_my_reports()` (the reporter's own reports with status only, never the resolution note). Not used by v1 UI; it can be added later without a new build.

### 4.2 Admin panel (`assert_platform_role(array['super_admin','moderator'])`)

| Function | Purpose |
|---|---|
| `admin_list_reports(p_status text default 'open', p_target_type text default null, p_limit int default 50, p_before timestamptz default null)` | Queue **grouped by target**: one row per `(target_type, target_id)` with `report_count`, distinct reporters, top reason, first/last reported, latest snapshot, owner username. Sorted by `report_count desc, last_reported desc`. |
| `admin_get_report_target(p_target_type, p_target_id)` | Every report on that target (reporter username, reason, details, time), the latest snapshot, **current live content** (or `deleted: true`), the owner's profile summary, and the owner's **prior report history** (counts by status). |
| `admin_resolve_reports(p_target_type, p_target_id, p_status, p_action, p_note)` | Resolves **all open reports on that target** at once (`actioned` / `dismissed`). Logs via `log_admin_action`. |
| `admin_remove_reported_content(p_target_type, p_target_id, p_note)` | Deletes the target row for the deletable types (`*_message`, `community_post`, `*_comment`). Matches, profiles, communities, sessions and tournaments are **not** deleted from here in v1; staff use existing tools or SQL for those. Then resolves the reports as `actioned / content_removed`. Runs as definer, so it bypasses the 24 h sender-delete window. The realtime DELETE event removes the bubble from open chats on every client, old builds included. |
| `admin_report_stats()` | Open count, opened in the last 24 h, and oldest open report, for the Overview card and nav badge. |

Server-side deletes go through the existing cascade/trigger paths (post deletion already cascades likes and comments). Verify with a grep across `supabase/` that no trigger assumes `auth.uid()` is the author when deleting; this is the same check as for admin deletes in 124.

---

## 5. Client (React Native + web) — ships via OTA

### 5.1 New files

| File | Contents |
|---|---|
| `src/services/reports.ts` | `submitReport({ targetType, targetId, reason, details })` → `supabase.rpc('submit_report', …)`; throws the raw RPC message. |
| `src/lib/reports.ts` | `ReportTargetType` and `ReportReason` unions, reason labels and short descriptions, **which reasons show per target type** (for example `fake_result` only for matches; `impersonation` only for profiles and communities), and an error-code → copy map (`RATE_LIMITED` → "You've sent a lot of reports today. Try again tomorrow."). |
| `src/lib/reportStore.ts` | Tiny external store, like `toast()` and `celebrate()`: `openReport(target)` / `closeReport()`. Any component can open the sheet with one call and no prop drilling. |
| `src/components/ReportSheet.tsx` + `<ReportHost/>` | Mounted once in `src/app/_layout.tsx`, next to `<ToastHost/>` and `<AlertHost/>`. Built on `motion/Sheet` + `SheetScrollView`: title "Report <thing>", a radio list of reasons, an optional details field with `CharCounter` (500), a muted note ("Reports are anonymous. The person won't know who reported them."), and a Submit button (disabled until a reason is picked). On success: close, `haptics.success()`, `toast('Thanks for reporting', 'Our team will review it.')`. On error: inline message, keep the draft. Handles reduced motion. Uses the theme tokens. |
| `src/components/ReportButton.tsx` | Small icon button (`Flag` from lucide) for headers. Renders `null` when the flag is off or the target is the viewer's own. |
| `src/hooks/useCanReport.ts` | `useCanReport(ownerId)` → `useFlag('reports', false) && !!user && ownerId !== user.id`. One place for the gate. |

### 5.2 Entry points

Each entry point is a one-line `openReport({ type, id, label })` call, wrapped in `useCanReport`.

| # | Surface | File | Placement | Target type |
|---|---|---|---|---|
| 1 | Session & community chat messages | `src/components/ChatPopup.tsx` (long-press options, ~line 516) | Add **Report** for **other people's** messages, after Reply. Both chats are covered because they share `ChatPopup`. Chat source config passes the type (`session_message` / `community_message`). | `*_message` |
| 2 | Posts | `PostCard.tsx` and `PostDetailPopup.tsx` | `⋯` overflow on others' posts (Report; Delete for author/admin if it already exists), or a long-press sheet on the card. | `community_post` |
| 3 | Post comments | `PostDetailPopup.tsx` | Long-press a comment → Report | `community_post_comment` |
| 4 | Matches | `MatchDetailPopup.tsx` | Header next to `ShareButton` → `ReportButton`. Reasons include *Fake / wrong result*. | `community_match` |
| 5 | Match comments | `MatchDetailPopup.tsx` | Long-press a comment → Report | `community_match_comment` |
| 6 | Profiles | `src/app/profile/[id].tsx` | Header next to `ShareButton` (not on your own profile) | `profile` |
| 7 | Communities | `src/app/community/[id]/info.tsx` | Bottom of the info screen, a muted "Report community" row (above Leave) | `community` |
| 8 | Sessions | `SessionDetailPopup.tsx` | Header next to `ShareButton`, hidden for the creator | `session` |
| 9 | Tournaments | `src/app/tournament/[id].tsx` | Header overflow, low priority, last | `tournament` |

The screens in rows 4, 6, 7, 8 and 9 already import `ShareButton` (commit a879c91), so the header slot already exists.

### 5.3 Rules

- Follow `AGENTS.md` alerts: no `window.confirm` and no bare `Alert.alert`. The sheet itself is the confirmation; errors go inline or through `toast()`.
- Haptics: `selection` on reason pick, `success` on submit, `error` on failure.
- No change to tab layouts, routes or `vercel.json` (no new route). The sheet is an overlay.
- No new notification type, so no `in_app_notifications` constraint migration and no change to `NotificationType`.
- Leave `WHATS_NEW_VERSION` unchanged unless you want a What's New entry. Remote What's New (127) can announce it from the admin panel instead, with no code.

---

## 6. Admin panel (`admin/`, separate Vercel deploy)

| Change | Details |
|---|---|
| `admin/src/pages/Reports.tsx` | Tabs **Open / Actioned / Dismissed**, a target-type filter, and a grouped queue table (target, count, top reason, owner, last reported). Clicking a row opens a detail panel: snapshot (chat context rendered as bubbles, image thumbnail), live state (deleted? edited?), each reporter's reason and details, the owner's history. Actions: **Dismiss**, **Remove content** (deletable types), **Mark actioned** (with an action dropdown) + note. All destructive actions go through `ConfirmDialog`. |
| `admin/src/router.tsx` + `components/Layout.tsx` | Nav item "Reports" with an open-count badge, gated by `RequireRole(['super_admin','moderator'])`. |
| `admin/src/pages/Overview.tsx` | "Open reports" card from `admin_report_stats()`. |
| `admin/src/pages/Staff.tsx` | Allow assigning the new `moderator` role. |
| `admin/src/lib/errors.ts` | Map the new error codes. |

Reporter usernames are visible to staff only, never to the reported user.

---

## 7. Testing

**SQL** (`docs/reporting/sql-tests.sql`, run with `docs/tournaments/local-db/run.sh`):
- Report each target type as a permitted viewer → succeeds, and the snapshot contains the content.
- Non-member reports a restricted community's post or message → `NOT_FOUND`. A user who left a session can report a message from before they left, but not one sent after (if any exist).
- Self-report → `CANNOT_REPORT_SELF`. Duplicate open report → same id returned, one row. The 21st report in 24 h → `RATE_LIMITED`.
- Sender deletes the chat message after it was reported → the report and snapshot survive.
- `anon` and `authenticated` cannot `select` from `reports`. A non-staff user calling `admin_*` → `NOT_ALLOWED`. A `moderator` can use the report functions but not other `admin_*` functions (for example `admin_set_maintenance`).
- `admin_remove_reported_content` deletes the row (and cascades), resolves all open reports on it, and writes an audit/admin log entry.

**Client:**
- `npx tsc --noEmit`, `npm run lint`.
- `npm run web`: open the sheet from every entry point, check light/dark themes, the keyboard in the details field, and Escape/backdrop dismiss.
- Preview APK on the **preview** channel (§8 step 4): long-press in both chats, posts, comments, matches, profile, community, session. Turn the flag off in the admin panel and confirm every entry point disappears after the next config refresh.
- Admin panel: full review flow on a test report; removing a chat message makes the bubble disappear live on a device that has the chat open.

---

## 8. Rollout (order matters)

1. **Migration**: run `130_reports.sql` in the Supabase SQL editor, then the SQL tests locally first. Seed the flag OFF:
   `insert into feature_flags (key, enabled, description) values ('reports', false, 'In-app reporting') on conflict do nothing;`
   Also run `131_username_change_limit.sql` (§12). It takes effect for **every** client immediately (old builds, web, the new OTA), so apply it once you're happy with the copy in its error message.
2. **Admin panel**: deploy `admin/` and assign yourself (or a moderator). Confirm the empty Reports page loads.
3. **Web app**: `npx expo export -p web` → copy `vercel.json` + `404.html` → `vercel ./dist --prod` (per `web-deploy-commands.txt`). It's safe while the flag is off.
4. **OTA to preview**: `eas update --channel preview --message "Reporting (flag off)"`. Install or open the preview APK, enable the flag for your account's testing (or briefly globally at a low rollout %), and run the §7 device checks.
5. **OTA to production**: `eas update --channel production --message "In-app reporting"`. If it warns that no compatible build exists, **stop**: something native changed (§2).
6. Wait about 24–48 h for adoption (applies on the 2nd cold start), then in **Flags & config** set `reports` to ON at 10% → check the queue and errors → 100%.
7. Optionally post a remote What's New or an Announcement.

**Rollback:** turn the `reports` flag off (instant, no update). For a broken bundle, `eas update:republish --group <previous-group-id> --branch production`. The table and RPCs can stay; they're inert without callers.

---

## 9. Implementation steps (checklist)

1. [x] Migration 130: `reports` table, indexes, RLS lock-down, audit trigger, `moderator` role.
2. [x] `submit_report` with per-type visibility checks, snapshot builder, rate limit.
3. [x] Admin RPCs: list / get target / resolve / remove content / stats.
4. [x] SQL tests; run on the local container.
5. [x] `src/lib/reports.ts`, `src/services/reports.ts`, `src/lib/reportStore.ts`, `useCanReport`.
6. [x] `ReportSheet` + `<ReportHost/>` mounted in the root layout.
7. [x] Entry points 1–9 (chat first, since it's the highest abuse risk; tournaments last).
8. [x] Admin panel: Reports page, nav + badge, Overview card, `moderator` role in Staff.
9. [x] `tsc` + lint + web pass; verify `git diff --stat` touches no `app.json` / `package.json` / native files.
10. [x] **Username limit (§12):** migration 131 + SQL tests; `username_changed_at` on the `Profile` type; profile edit form (helper text, locked state, confirm sheet); onboarding hint; error mapping.
11. [x] Update `AGENTS.md`: new section "14. Reporting", the 30-day username rule under Profile, `reports` + `profiles.username_changed_at` in the data model, next migration number (132).
12. [ ] Rollout §8.

Rough size: migration ~350 lines SQL, client ~500 lines, admin page ~400 lines.

---

## 10. Later phases (each still OTA-friendly unless noted)

- **Auto-hide threshold**: when ≥ N distinct reporters flag a post or comment, mark it hidden and filter it out in the read RPCs and chat RLS. This is server-only, so it protects **old builds too**. Needs brigading safeguards (weight by reporter account age, staff can restore).
- **Notify the reporter of the outcome**: new `report_resolved` notification type (migration extending the check constraint). Old builds would show it in Past Activity and ignore the tap, like `admin_broadcast`.
- **Block user**: `user_blocks` table, then filter blocked users from chat, feed, sessions and invites in the RPCs, plus a "Blocked users" list in Settings. Apple requires blocking for UGC apps, so this must land before the iOS launch. It's larger and should get its own plan.
- **Suspension**: `profiles.suspended_until`, enforced in DB guards on every write path (posts, chat, sessions, matches). This works without client changes; the client would just see `NOT_ALLOWED` errors, plus a friendlier banner in a later OTA.
- **Retention**: pg_cron job that nulls `snapshot` on resolved reports older than 180 days.

---

## 11. Open questions for the owner

1. Should a **moderator** role exist from day one, or are reports `super_admin` only for now?
2. Is the **20 reports / 24 h** limit and the reason list right for this community size?
3. Should **Block user** be pulled into v1, given Apple's requirement before iOS goes live?
4. Should reporting cover **tournaments** in v1, or only community and session content?

---

## 12. Part B — Username change limit (once every 30 days)

### 12.1 The rule

> **A user can change their username only once every 30 days.**

- "30 days" is a rolling window: 30 × 24 h from the moment of the last change (UTC), not calendar months.
- **Picking a username during onboarding does not count.** Onboarding *inserts* the profile row (`createProfile`), and the rule only applies to *updates*. A new user can change their name once right away, then waits 30 days.
- Existing users start with no recorded change, so their **first change is always allowed**.
- Changing back to the old name inside the window counts as a change, so it's blocked too.
- Bio and avatar are unaffected and can be edited any time.
- Staff and server jobs (no `auth.uid()`, service role) are exempt, so staff can still fix an offensive or impersonating username, for example after a report from Part A.
- Soft delete and re-enable don't touch the username, so they don't affect the window.

Why: frequent renames let someone dodge reports, impersonate others, and confuse members who know them by name. It also makes the Part A reports less useful, because the name in a snapshot would no longer match the profile.

### 12.2 Database: migration `131_username_change_limit.sql`

```sql
alter table public.profiles add column if not exists username_changed_at timestamptz;  -- nullable, additive

create or replace function public.enforce_username_change_limit()
returns trigger language plpgsql as $$
declare v_next timestamptz;
begin
  if auth.uid() is null then            -- staff / service role / cron: exempt
    return new;
  end if;

  -- Column is server-owned: clients can never set or clear it themselves
  new.username_changed_at := old.username_changed_at;

  if lower(btrim(new.username)) is distinct from old.username then
    if old.username_changed_at is not null
       and old.username_changed_at > now() - interval '30 days' then
      v_next := old.username_changed_at + interval '30 days';
      raise exception using
        message = format('You can change your username only once every 30 days. You can change it again on %s.',
                         to_char(v_next at time zone 'UTC', 'DD Mon YYYY')),
        hint    = 'USERNAME_CHANGE_LIMIT',
        detail  = to_char(v_next at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    end if;
    new.username_changed_at := now();
  end if;
  return new;
end $$;

revoke all on function public.enforce_username_change_limit() from public, anon, authenticated;

create trigger trg_username_change_limit          -- BEFORE UPDATE only (onboarding INSERT is free)
  before update on public.profiles
  for each row execute function public.enforce_username_change_limit();
```

Details to get right:
- **Readable message for old builds.** Installed builds that don't get the OTA show `error.message` raw in the "Update failed" dialog (`(tabs)/profile.tsx`). The message is written as the final user-facing sentence, and the machine code sits in `hint`. Old builds then show a clear explanation with no code change, and the new client reads `error.hint` / `error.details`.
- **Trigger order.** Postgres runs BEFORE triggers in name order, so `trg_username_change_limit` runs before `trg_validate_profile_text` (116), which lowercases the name. That's why the comparison uses `lower(btrim(...))`. The column-protection line means a client sending `username_changed_at` is silently reverted, matching the `guard_profile_protected_columns` style (105).
- **Atomic saves.** Old builds send username + bio + avatar in one update. If the username is blocked, the whole save fails, bio changes included. The new client avoids this by locking the username field (§12.3). For old builds this is acceptable, and the message explains it.
- **Reads.** The own profile is read with `select('*')`, so the new column comes through automatically. `public_profiles` is unchanged; other users don't see the date.
- Add an `AGENTS.md` note: "never add a CHECK for this", per the hardening rules (it's trigger-based and only fires on change).

### 12.3 App: tell the user clearly, before they try

Ships in the same OTA. It doesn't need the `reports` flag, but can sit behind its own flag `username_limit_ui` if you want to stage it.

| Where | What the user sees |
|---|---|
| **Profile → Edit**, under the username field (always) | Helper text: **"You can change your username once every 30 days."** |
| Same field, **when locked** (`username_changed_at` within 30 days) | Field is read-only with a lock icon and the text **"You changed your username on 2 Nov 2026. You can change it again on 2 Dec 2026."** Bio and avatar stay editable, and the save sends no `username`. |
| **Save** with a changed username | In-app confirm via `alert()` from `@/lib/alert` (no native dialogs): title **"Change username to @newname?"**, body **"You can only change your username once every 30 days. You won't be able to change it again until 14 Dec 2026."** Buttons: *Cancel* / *Change username*. |
| **Onboarding**, under the username field | **"Choose carefully: after this you can change your username once every 30 days."** |
| Server rejects anyway (race, another device, web tab open) | Map `hint === 'USERNAME_CHANGE_LIMIT'` to an inline field error with the date from `details`. Otherwise fall back to the server message, which is already readable. |
| Web | Same component (`ProfileForm`), so web gets the same text and behaviour. |

Files: `src/types/index.ts` (`Profile.username_changed_at?: string | null`), `src/components/ProfileForm.tsx` (helper, locked state, new `usernameChangedAt` prop), `src/app/(tabs)/profile.tsx` (confirm + omit unchanged username from the update + error mapping), `src/app/onboarding.tsx` (hint), and a `nextUsernameChangeDate()` helper in `src/lib/date.ts`.

Optionally announce it through remote What's New or an Announcement: "Usernames can now be changed once every 30 days."

### 12.4 Tests

SQL (`docs/reporting/sql-tests.sql`):
- Insert a profile (onboarding) → `username_changed_at` is null.
- 1st rename → OK and stamped. 2nd rename the same day → error with `hint = USERNAME_CHANGE_LIMIT`, readable message, ISO date in `detail`.
- Set the stamp to 31 days ago → rename OK.
- Bio-only and avatar-only updates inside the window → OK.
- Saving the same username in a different case or with spaces → not counted as a change.
- Client tries `update profiles set username_changed_at = null` → silently kept.
- Service role rename inside the window → OK.
- Unrelated updates (fcm_tokens, streak trigger paths) → unaffected.

Device and web: the locked state shows correct dates, the confirm appears only when the name actually changed, and an old build (without the OTA) shows the readable message in its existing dialog.
