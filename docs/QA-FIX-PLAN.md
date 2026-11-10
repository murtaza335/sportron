# QA Fix Plan — "QA report Sportron.pdf" (2026-11-09)

Source: [`docs/QA report Sportron.pdf`](QA%20report%20Sportron.pdf) — 17 bugs (pages 1–2) + 3 feature requests (page 3).
Each item below has: **root cause (verified in code)** → **fix** → **files** → **verify**. Items are grouped by shared
root cause, because several QA rows are the same bug showing up on different screens.

Constraints from AGENTS.md that apply throughout: backward compatibility with installed builds (additive
migrations/RPCs only), all motion values from `src/lib/motion.ts`, reduced-motion respected, next migration = **120**.

---

## 0. Triage summary

| # | QA item | Group | Severity | Effort |
|---|---|---|---|---|
| 1 | Save on Manage tournament → "Could not find the function public.update_tournament" | A. Server/env | **P0** (feature broken) | S |
| 2 | Tournament "Select cover image" → `unregistered ActivityResultLauncher` crash | B. Native | **P0** | S–M |
| 3 | Session stats shadow shows during screen transition (light theme) | C. Shadows | P1 | S |
| 4 | Post shows dark black shadow while appearing (light theme) | C. Shadows | P1 | (same fix) |
| 5 | Module Info tab card — same shadow issue | C. Shadows | P1 | (same fix) |
| 6 | Profile → community: push-notification card shadow during transition | C. Shadows | P1 | (same fix) |
| 7 | Pending matches: match-card animation "not good" | C. Shadows + D | P2 | S |
| 8 | Streak popup layout not correct | D. Layout/motion | P1 | XS |
| 9 | Discover: 2nd community overlaps 1st after animation | D. Layout/motion | P1 | S |
| 10 | Module page opens on Entries tab, then jumps to Bracket | D. Layout/motion | P1 | XS |
| 11 | Joined community: posts appear after matches | D. Layout/motion | P2 (mostly fixed in `76981b2`) | XS |
| 12 | Past Activity tab feels slow to switch | E. Perf | P2 | S |
| 13 | Post popup: comment field covered by the keyboard | F. Sheets | **P1** | S |
| 14 | Post popup: can only be dragged down by the small handle | F. Sheets | P2 | M |
| 15 | Chats tab badge doesn't update unless you're on a chat page | G. Chat badge | P1 | M |
| 16 | Discover: bare "No communities found" | H. Empty states | P2 | S |
| 17 | Community: "Share your first moment" isn't actionable | H. Empty states | P2 | XS |
| F1 | Discover sorted newest-first → popular / more appealing | I. Feature | — | M |
| F2 | Tutorials per screen/feature for new users | I. Feature | — | M–L |
| F3 | Notifications when someone wins a module | I. Feature | — | S–M |

Suggested order: **Group A → B → C → D → F → G → E → H → I**. A and B are blockers for tournament admins in production;
C fixes four QA rows with one change.

---

## A. `update_tournament` not found (QA #1) — P0

**Root cause.** The client calls `rpc('update_tournament', { p_tournament, p_set })`
([services/tournaments.ts:160](../src/services/tournaments.ts#L160)); the function exists with exactly that signature in
[`089_add_update_tournament_rpc.sql`](../supabase/migrations/089_add_update_tournament_rpc.sql). "Could not find the
function … in the schema (cache)" is PostgREST's `PGRST202`: the migration was **not applied on the environment QA used**,
or it was applied but PostgREST's schema cache was not reloaded. PROGRESS.md marks 084–097 as "needs owner: apply".

**Fix.**
1. Owner: on production, check which tournament objects exist:
   ```sql
   select p.proname, pg_get_function_identity_arguments(p.oid)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and (p.proname like '%tournament%' or p.proname like '%module%')
   order by 1;
   ```
   Apply every missing migration in order (089, and verify 090–119 too — see **Related R1**), then
   `notify pgrst, 'reload schema';`.
2. Run `docs/tournaments/sql-tests.sql` + `sql-tests-v2.sql` against prod-like data (or the local container) after applying.
3. Client hardening (ships with next build): in [`lib/tournamentErrors.ts`](../src/lib/tournamentErrors.ts) map
   `PGRST202` / "Could not find the function" to *"This action needs a server update. Please try again later."* instead of
   leaking the raw message. Optional graceful fallback in `updateTournament`: if PGRST202 **and** the patch only changes
   `name`, call the older `rename_tournament`.

**Verify.** Manage tournament → change name/description/dates/status/cover → Save → values persist after reload.

---

## B. Image picker crash on tournament cover (QA #2) — P0

**Symptom.** `ExponentImagePicker.launchImageLibraryAsync` rejected: *"Attempting to launch an unregistered
ActivityResultLauncher … You must ensure the ActivityResultLauncher is registered before calling launch()"*. The message
shows as "Uncaught (in promise)", i.e. the call is not wrapped in try/catch
([tournament/[id]/manage.tsx:86-94](../src/app/tournament/%5Bid%5D/manage.tsx#L86-L94)).

**Root-cause hypotheses (investigate in this order).** The JS call is identical to the four other pickers in the app
(ProfileForm, CreatePostModal, create-community, community edit), so the problem is native-side state, not this screen's code:
1. **Stale native project.** `android/` is gitignored (CNG) but present locally; if it was prebuilt before an Expo SDK /
   `expo-image-picker` upgrade, the picker's activity-contract registration can be out of sync with the JS module. →
   `npx expo install --check`, `npx expo-doctor`, `npx expo prebuild --clean`, rebuild.
2. **MainActivity was recreated** (process kept, activity recreated — e.g. returning from background under memory pressure,
   or "Don't keep activities" on the QA device) and the launcher registered on the old activity instance. → reproduce with
   *Developer options → Don't keep activities* ON.
3. **Dev-client only.** "Uncaught (in promise)" is the dev LogBox; reproduce on a **release** APK from EAS before
   concluding it affects users.

**Fix.**
1. Reproduce matrix: release vs dev build × (community edit, create community, profile avatar, tournament cover) ×
   (fresh launch, after background/resume, Don't-keep-activities ON). Record results in this file.
2. Clean prebuild + rebuild (hypothesis 1); bump `expo-image-picker` to the latest SDK-57 patch if a fix exists upstream.
3. Add a shared helper `src/lib/pickImage.ts` (`pickImage({ aspect?, quality })`) used by **all five** pickers:
   permission request, `try/catch` around `launchImageLibraryAsync`, one automatic retry after a short delay on the
   `ActivityResultLauncher` error, and a friendly `toast('Couldn't open your photos', 'Please try again.')` on failure.
   This removes 5 copies of the same code and guarantees no unhandled rejection anywhere.

**Verify.** All five pickers open the gallery on a release build, including after background → resume.

---

## C. Shadows "showing up" during transitions/animations (QA #3, #4, #5, #6, part of #7) — P1

**Root cause (one bug, four QA rows).** On Android, `elevation` shadows are drawn by the native render node **outside the
view's alpha**. When a parent animates opacity — the stack/tab **fade** transitions (`(tabs)/_layout.tsx` uses
`animation: 'fade'`, root stack uses fades), Reanimated `FadeIn` entering animations, `ScreenFadeIn` — the content is
semi-transparent but the shadow is painted at full strength, producing a dark grey/black "ghost" box. It is most visible in
light theme because the shadow contrasts with the white background.

Offenders matching each QA row:
| QA row | Element | Where |
|---|---|---|
| #3 Session stats | `statsRow` (`elevation: 3`) | [(tabs)/history.tsx:684-697](../src/app/(tabs)/history.tsx#L684-L697) |
| #4 Post dark shadow | `Card` → `Shadows.*.card` (`elevation: 2`) used by `PostCard` | [components/ui/Card.tsx](../src/components/ui/Card.tsx), [constants/theme.ts](../src/constants/theme.ts) |
| #5 Module Info card | `Card` in `ModuleInfoTab` | same |
| #6 Profile → community | "Push Notifications" row is a `Card` | [(tabs)/profile.tsx:296](../src/app/(tabs)/profile.tsx#L296) |
| #7 Pending matches | `MatchCard` is a `Card`, entering with `FadeIn` | [pending-matches.tsx:168-182](../src/app/community/%5Bid%5D/pending-matches.tsx#L168-L182) |

`Card` is used by 17 files (PostCard, MatchCard, SessionDetailPopup, ModuleCard, ModuleInfoTab, settings, profile, info,
join-requests…), so fixing it at the source fixes most screens at once.

**Fix.**
1. **Flat cards on Android.** In `constants/theme.ts`, `Shadows.light.card` / `Shadows.dark.card` → `elevation: 0` on
   Android (keep the iOS `shadow*` props and web `boxShadow`, which respect opacity). Cards are already bordered
   (`bordered` defaults to `true`), so the design keeps its separation. Same for in-flow surfaces with hand-written
   shadows: `history.tsx statsRow`, `profile.tsx webPrompt`, `create-community.tsx` / `community/[id]/edit.tsx` cover
   placeholders, the selected sport chip in `discover.tsx` (`elevation: 4`), the community empty-state badge in
   `community/[id].tsx:562` (`elevation: 6`).
2. **Keep elevation only for truly floating UI** that never fades with the screen: FAB (`index.tsx`, `FABMenu`,
   `community/[id].tsx fabButton`), `Toast`, chat popovers, `StreakModal` card, the centre tab bump.
   For these, if a fade is still visible, add `needsOffscreenAlphaCompositing` + `renderToHardwareTextureAndroid` on the
   animated wrapper so shadow and content fade together.
3. Add a `Shadows.floating` token for (2) and replace the raw `shadowColor/elevation` literals (≈20 sites, found with
   `grep -rn "elevation:" src`) with tokens, so the rule "in-flow = flat, floating = elevated" lives in one place.
   Document it in AGENTS.md → *Motion system*.

**Verify.** Light theme, Android release build: Sessions ↔ other tabs, Profile → Community, open a community with posts,
open module → Info tab, open Pending matches. No dark box appears at any point of the fade. Repeat in dark theme.

---

## D. Layout & motion glitches (QA #7, #8, #9, #10, #11)

### D1. Streak popup layout (QA #8) — XS
**Root cause.** [`CenterModal`](../src/components/motion/CenterModal.tsx) centres children with `alignItems: 'center'`
but its animated wrapper has **no width**, so the card's `width: '100%'` resolves against a shrink-wrapped parent: the
card collapses to intrinsic content width and the `flex: 1` rule text / stat columns lay out unpredictably (narrow card,
cramped "Current / Best" columns, wrapped text).
**Fix.** Give the animated wrapper `{ width: '100%', alignItems: 'center' }` in `CenterModal`; in `StreakModal` replace
the module-level `Dimensions.get('window')` maxWidth with a plain `maxWidth: 340` (the 24 px root padding already handles
small screens; module-level Dimensions also breaks on rotation/fold). Re-check spacing: header → stats → "resets in" →
rule → button; give `ruleCard` `alignItems: 'flex-start'` so a 2-line rule doesn't misalign the icon.
**Verify.** Small (360 dp) and large phones, streak 0 / 1 / 2-digit / 3-digit, with and without the "resets in" line.

### D2. Discover: 2nd community overlaps the 1st (QA #9) — S
**Root cause.** In [`discover.tsx:179-190`](../src/app/discover.tsx#L179-L190) every card has **both** `layout={LayoutShift}`
and an `entering` animation, and card heights change *after* mount: memberships are fetched in a **separate** request
(`fetchMyCommunityMemberships`) so the Admin/Member role tag pops in later, and focus-refresh can re-render the list. A
layout transition starting while the entering animation is still running leaves cards at stale offsets → overlap. It also
still uses `FadeInDown` (translate), which `900b1d6` removed everywhere else.
**Fix.** Use `FadeInItem` (fade-only, `layout` only for late inserts) like the other lists; drop `layout` on first load;
don't render the list until memberships have resolved (or reserve the tag row's height in `CommunityCard`). Longer term
the memberships come back inside the new discover RPC (see F1), which removes the second request entirely.
**Verify.** Open Discover 10× (cold and warm), toggle sport chips quickly, type in search — no overlap.

### D3. Module opens on Entries then jumps to Bracket (QA #10) — XS
**Root cause.** [`module/[moduleId].tsx:71-93`](../src/app/tournament/%5Bid%5D/module/%5BmoduleId%5D.tsx#L71-L93):
`useState<Tab>('entries')` + a `useEffect` that picks the real default *after* the first loaded render, so one frame of
Entries is painted before the switch.
**Fix.** Derive instead of syncing: `const [userTab, setUserTab] = useState<Tab | null>(null)`; compute
`defaultTab` from `m.module`/`m.matches`/`tabParam` during render; `tab = userTab ?? defaultTab`. Delete the effect and the
`defaulted` ref. While `m.loading`, render the skeleton (no tab content).
**Verify.** Open modules with/without fixtures, each format (single elim, round robin, groups stage 1/2, double elim),
and via a `?tab=` deep link from a notification.

### D4. Community feed — posts appear after matches (QA #11) — XS (verify)
**Status.** Commit `76981b2` (same day, before the report was committed) already gates the first reveal on both
`postsLoading` and `matchesInitialLoading` ([community/[id].tsx:368](../src/app/community/%5Bid%5D.tsx#L368)). QA most
likely tested an older build. **Remaining cause:** photo posts render through `FadeImage`, which fades the image in when
it finishes downloading — on slow networks a photo post still "appears" after text/match cards.
**Fix.** Re-test on a build ≥ `76981b2`. In `PostCard`, give photo posts a fixed aspect-ratio placeholder (skeleton
colour) so the card itself is present immediately and only the bitmap fades.

### D5. Pending matches card animation (QA #7) — S
**Root cause.** C (elevation under `FadeIn`) **plus** `layout` + `FadeIn` on every row on every refetch (approve/dispute
removes a row → `FadeOutRight` + layout shift of the rest).
**Fix.** After C, switch to `FadeInItem` (stagger on first load only, no entering on refetch); keep `FadeOutRight` +
`LayoutShift` only for the row that's removed.

---

## E. Past Activity tab feels slow (QA #12) — S

**Finding.** There is **no fetch on tab switch** — `updates.tsx` filters the already-loaded feed
(`NotificationsContext`, `limit(50)`). The lag is render cost: switching tabs re-keys
`<Animated.View key={activeTab}>`, which unmounts/remounts **up to 50 `ActivityCard`s in a non-virtualised `ScrollView`**,
each with its own `FadeInDown` entering + `LinearTransition` layout animation, all committed in the same render as the tab
label/underline change — so the tap appears to "wait".
**Fix.**
1. Make the tab change paint first: drive the underline/label from `activeTab`, and the list from
   `useDeferredValue(activeTab)` (or `startTransition`).
2. Replace the `ScrollView` with a `FlatList` per tab (`initialNumToRender≈8`, `windowSize≈5`, stable `keyExtractor`).
3. No per-row `entering` on tab switch — only a single container fade; keep `layout`/`exiting` for rows removed by an
   Accept/Decline action.
4. Optional: keep the three lists mounted (hide inactive) so revisiting a tab is instant.
**Verify.** With 50 notifications, tab switches feel instant on a low-end Android (enable the perf monitor; JS frame drops
should stay near zero).

---

## F. Bottom sheets: keyboard + drag (QA #13, #14)

### F1. Comment input hidden by the keyboard (QA #13) — S
**Root cause.** Android is edge-to-edge, so the OS doesn't resize windows; RN `<Modal>` is a separate window that the
root `KeyboardInsetView` can't reach. `PostDetailPopup` opens the `Sheet` with `avoidKeyboard={false}` and wraps **only
the input row** in a `KeyboardAvoidingView` inside a fixed-height (`85%`), `translateY`-animated sheet. KAV measures its
own frame against the keyboard; inside a transformed, fixed-height parent its padding is computed wrongly / squeezed, so
the input stays under the keyboard.
**Fix.** Handle the keyboard once, in [`Sheet`](../src/components/motion/Sheet.tsx): on Android use the existing
`useAndroidKeyboardHeight()` (already proven in the root layout) to add `paddingBottom: keyboardHeight` to the sheet root
(and cap the sheet with `maxHeight` so it shrinks rather than overflowing the status bar); on iOS keep KAV. Then remove the
inner `KeyboardAvoider` from `PostDetailPopup` and let it use the default `avoidKeyboard`. When the input focuses, scroll
the comments list to the end.
**Related (same pattern, check all):** every `Sheet` with a `TextInput` — `CreatePostModal`, `InviteMemberModal`,
`MatchDetailPopup` (comments), `MatchLineupSelector` (search), the ping sheet in `community/[id].tsx`.
**Verify.** Each of those sheets on Android (gesture nav + 3-button nav) and iOS: input sits right above the keyboard,
send button visible, dismissing the keyboard restores the layout.

### F2. Drag-to-dismiss from anywhere (QA #14) — M
**Root cause.** `Sheet` attaches its `Gesture.Pan()` only to the handle `View`
([Sheet.tsx:157-161](../src/components/motion/Sheet.tsx#L157-L161)), by design ("content stays free to scroll").
**Fix.** Standard scroll-aware sheet:
- Wrap the whole sheet body in the `GestureDetector`.
- Expose a `SheetScrollView` (or a `useSheetScroll()` hook) that reports `scrollY` to a shared value and is declared
  `simultaneousWithExternalGesture` with the sheet pan (pattern already used by `SlideUpModal`'s `DragContext`).
- Pan activates only for downward drags (`activeOffsetY([0, 10])`, `failOffsetX([-15, 15])`) **and** when the inner
  scroll is at the top (`scrollY <= 0`); otherwise the list scrolls.
- Keep the existing dismiss thresholds/haptics/velocity; don't capture drags that start inside the `TextInput`.
- Roll out to `PostDetailPopup` first, then other long sheets; short sheets (no scroll) get the whole-body drag for free.
**Verify.** Post popup: drag down on the image/body closes with animation; scrolling comments still scrolls; dragging
down when scrolled mid-list scrolls up first, then dismisses once at top. Reduced motion: timing close, no spring.

---

## G. Chats tab badge not updating off the chat screens (QA #15) — M

**Root cause.** The tab badge reads `chatUnreadStore`, which is only written by `useChats` (Chats hub load) and by an
open `useChat` thread. Nothing updates it while you're on Communities/Sessions/Activity.

**Fix (lightweight, no message content fetched).**
1. **Event-driven (native):** chat pushes already reach the app in the foreground via `messaging().onMessage`
   ([services/fcm.ts:273](../src/services/fcm.ts#L273)). In `useFCM`'s foreground handler, for
   `session_chat_message | community_chat_message | *_reply`, bump the store for that chat
   (`setChatUnreadCountFor(kind, id, current + 1)`) — zero network.
2. **Authoritative refresh:** add `refreshChatUnreadCounts()` in `useChats.ts` (or a tiny `ChatUnreadWatcher` mounted in
   `(tabs)/_layout.tsx`) that calls the existing counts-only RPC `get_chat_hub_stats('community')` /
   `('session')` (returns `chat_id, unread_count, last_message_at` — no message bodies) and calls
   `replaceChatUnreadCounts`. Trigger it on: app start after auth, `AppState → active`, focusing any tab (throttled to once
   per 30 s, sharing the existing 30 s SWR cache in `useChats`), and after a chat push (debounced 2 s).
3. **Web fallback** (no FCM receive): the same refresh on a 60 s interval while the document is visible.
4. Optional server-side: if the two RPC calls become a hot path, add `get_chat_unread_totals()` (migration 120,
   `RETURNS TABLE(kind text, chat_id uuid, unread_count bigint)`, `auth.uid()`-guarded, revoked from anon) returning both
   kinds in one call. Additive only.
**Verify.** Second account sends messages to a community and a session while the first account sits on Communities /
Activity → badge increments within ~1 s (native) / ≤ 60 s (web); opening the chat clears it; killing/reopening the app
shows the right count.

---

## H. Empty states (QA #16, #17)

### H1. Discover "No communities found" (QA #16) — S
Replace with a contextual, actionable empty state (reuse `EmptyReveal`):
- **Sport filter, no results:** sport icon + *"No {Sport} communities yet"* / *"Be the first — start one and the
  {sport} players around you can find and join it."* → primary button **Create a {Sport} community**.
- **Search, no results:** *"Nothing called "{query}" yet"* → **Create "{query}"**.
- **Both empty (no communities at all):** *"Start the first community in your area."*
The button routes to `/create-community?sport=…&name=…`; `create-community.tsx` reads `useLocalSearchParams` to
pre-select the sport / prefill the name (today it always defaults to `table_tennis`).

### H2. Community "Share your first moment" (QA #17) — XS
Make the empty card itself a `PressableScale` that opens `CreatePostModal` (`'write'` tab), and add two explicit
buttons: **Write a post** and **Record a match** (same handlers as the FAB menu). Non-members see *"Join to share posts
and matches"* with the Join button instead. Keep the decorative rings.

---

## I. Feature requests (page 3)

### I1. Discover: popular-first, more engaging (F1) — M
**Today:** `get_public_communities` (048) returns everything `ORDER BY created_at DESC`, and memberships are a 2nd request.
**Plan.**
- **Migration 120** `get_discover_communities()` (new RPC — keep `get_public_communities` for installed builds):
  same columns + `my_role text` (null if not a member) + `activity_14d bigint` (approved matches + posts in the last 14
  days) + `popularity numeric`. Suggested score:
  `ln(1 + member_count) * 2 + ln(1 + activity_14d) * 3 + (sport ∈ my sport_interests ? 1 : 0)` with a small recency boost
  for communities < 7 days old so new ones aren't buried. `SECURITY DEFINER`, `auth.uid()` guard, `RETURNS TABLE(...)`,
  revoke from public/anon. Check/add indexes on `community_posts(community_id, created_at)` and
  `community_matches(community_id, approval_status, created_at)`.
- **UI:** sort chip row **Popular · New · For you** (For you = matches my sports / organization / location); a
  horizontal **"Trending this week"** strip on top when there's no search; card shows "🔥 12 matches this week" when
  `activity_14d > 0`. Communities you already belong to sink below non-member ones in Popular (Discover is for finding new ones).
- Removes the separate `fetchMyCommunityMemberships` call (also fixes D2's late role tags).

### I2. Tutorials / feature guides (F2) — M–L
Prefer **inline, dismissible tip cards** over spotlight overlays (overlays need measured anchors and break with layout
changes / font scaling).
- `src/lib/tips.ts`: tip registry `{ id, screen, title, body, icon, cta? }` + seen flags in AsyncStorage, keyed per user
  (`tips_seen_<userId>`), with a version so new tips can be added later.
- `useTip(id)` → `{ visible, dismiss }`; `<TipCard>` component (themed, `Collapsible` enter/exit, "Got it" + optional CTA).
- First-run content, one tip per screen, shown once:
  Communities (what a community is, Discover), Community home (FAB: post / photo / record match / ping; matches need
  opponent approval), Sessions (create/join a session, New vs History, All/Joined/My), Tournaments (how modules & brackets
  work), Chats (community vs session chats), Activity (Action Required vs Invites), Streak modal (how streaks are kept).
- "Show tips again" toggle in Settings resets the flags. Respect reduced motion. Track nothing server-side for v1.
- Optional v2: a 3-card welcome carousel at the end of onboarding.

### I3. Notify when someone wins a module (F3) — S–M
**Today:** `trg_tournament_module_completed` (088, rewritten in 092) already sends `tournament_module_completed`
("🏆 X won …") — but **only** to that module's entrants, roster members and module admins, and **only while the
tournament is `published`**. If 088/092 aren't applied on prod (see A/R1) nobody gets anything, which is likely why QA
reports it as missing.
**Plan.**
1. First confirm 088/092 are applied (R1) and test a final being recorded on prod.
2. Migration 120/121 (`create or replace` the trigger function, additive):
   - Champion's profiles (entry profile + all linked roster members) get a personalised title
     *"🏆 You won {module}!"* instead of the generic one.
   - Also notify **tournament admins** and **entrants of the other modules in the same tournament** (the tournament
     audience), deduped.
   - Reuse the existing `tournament_module_completed` type (no check-constraint change needed). Only if a separate
     preference/copy for the champion is wanted, add a `tournament_module_won` type → must extend the
     `in_app_notifications.type` check constraint in the same migration + add to `NotificationType` + tap routing in
     `useFCM`.
3. Client: when a champion opens the module (or taps the notification), fire `celebrate()` once per module
   (AsyncStorage flag, same pattern as the streak milestone) and highlight the `ChampionsStrip`.
4. Add test cases to `docs/tournaments/sql-tests-v2.sql` (champion gets personalised notif; admin + other-module entrants
   notified once; draft tournament sends nothing).

---

## R. Related issues found while investigating (not in the QA report)

| # | Issue | Why it matters | Action |
|---|---|---|---|
| R1 | **Tournament migrations likely not (all) applied on prod** (A is the symptom) | Every v2 RPC (091–097) and the hardening migrations (098–119) would fail the same way; tournament notifications (088/092) silently missing | Run the `pg_proc` audit in A for all expected functions/triggers; apply in order; add a `docs/migrations-applied.md` checklist or a `select` script that fails loudly on missing objects |
| R2 | Raw PostgREST errors leak into the UI | "Could not find the function…" shown to users | Map `PGRST*` codes in `tournamentErrors.ts` and the generic `alert` paths |
| R3 | 5 duplicated image-picker implementations, none with try/catch | Any picker failure = unhandled rejection | Shared `pickImage()` (B.3) |
| R4 | Every `Sheet` with a `TextInput` has the keyboard problem from F1 | Same bug in Create post, Invite member, Match comments, Lineup search, Ping | Covered by fixing `Sheet` (F1) |
| R5 | `CenterModal` width bug affects any future dialog | Not just the streak modal | Fixed at the source (D1) |
| R6 | Discover still uses `FadeInDown` (translate) after `900b1d6` moved lists to fade-only | Inconsistent motion; contributes to D2 | D2 |
| R7 | Activity feed hard-capped at `limit(50)`, no pagination | Older notifications silently disappear; Past Activity grows | Add "Load more" (range pagination) when moving to FlatList (E) |
| R8 | Web never refreshes the chat badge | No FCM on web | G.3 interval refresh |
| R9 | Raw `shadow*/elevation` literals in ~20 places | Will keep re-introducing C | Tokens + AGENTS.md rule (C.3) |
| R10 | `StreakModal` (and others) read `Dimensions` at module load | Wrong sizes after rotation / foldables / split screen | Use `useWindowDimensions` or flex/maxWidth |

---

## Rollout

1. **Server first (no app release needed):** A.1–A.2 + R1 audit/apply on prod, then re-test QA #1 and F3 on the current
   store build.
2. **App build 1.0.2 (one EAS build):** B, C, D, E, F, G, H, R2–R10. Clean prebuild (B.1). Bump What's New
   (`CURRENT_VERSION` in the 3 places listed in AGENTS.md) only if user-visible features ship.
3. **Feature build:** I1 (needs migration 120), I2, I3 client part. Migrations are additive; old builds keep using
   `get_public_communities` and the existing notification type.
4. After each phase: `npx tsc --noEmit`, `npm run lint`, release APK on a low-end Android (light + dark theme, gesture
   nav), web smoke test, then hand back to QA with this table's rows marked resolved.
5. Update AGENTS.md: next migration number, shadow rule (C), `Sheet` keyboard/drag behaviour (F), chat badge refresh (G),
   tips system (I2).
