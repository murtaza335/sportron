# Guest mode: removing the mandatory sign-up

**Status:** implemented in code (steps 1-5 below), **switch OFF by default, migration 134 not yet applied** · **Date:** 2026-11-21 · **Migration:** 134 (next = 135)

## 1. Verdict

**Yes, it can be done, and safely.** The recommended approach is **"look around first, sign in to take part"**:

- A new user opens the app and can **browse straight away**: tournaments (brackets, standings, live scores), public communities, and links people share.
- The **Google sign-in appears only when they try to do something** (join, post, record a match, chat, apply to a session), shown as an in-app sheet that explains why ("Sign in to join *Lahore TT Club*"). After signing in they land back on the same screen.

You can't remove sign-in completely. Almost everything in Sportron is social (matches need an opponent who confirms, sessions need someone to approve, chat and pings need a name). What we *can* remove is the **wall at the front door**, and that is where people drop off.

The main technical decision: **do not use Supabase "anonymous sign-in"** for this. Use a small set of new, read-only "guest" database functions instead (reasons in §4).

---

## 2. How sign-in is enforced today (findings)

Sign-in is required at **three separate layers**. Removing the screen alone would only show empty pages and errors.

| Layer | Where | What it does |
|---|---|---|
| 1. App redirect | [src/app/_layout.tsx:132-137](../../src/app/_layout.tsx#L132-L137) | Without a session, *every* route except `login` / `onboarding` / `auth` is sent to `/login`. The marketing redirectors (`/get`, `/android`) are caught too. |
| 2. Database role | [109_revoke_anon.sql](../../supabase/migrations/109_revoke_anon.sql) | The `anon` role (not signed in) can't execute **any** function in `public` or read any view. The default for new functions is also "no anon". |
| 3. Function guards | e.g. `get_tournaments` (085), `get_discover_communities` (120/126), community post reads (102), `can_view_tournament` (084: `auth.uid() is not null and …`) | Many read functions start with `if auth.uid() is null then raise 'NOT_ALLOWED'`. Tournament visibility itself requires a user. |

**Exceptions that already work without login:**
- `site_config` (maintenance / forced update), read before any provider mounts.
- `get_live_board(p_code)` (133), the projector website. This is a good **example to copy**: anon-callable, guarded by `published AND live_public`, and it never returns CMS ID / phone / email.

### What already helps

- **Return-to-link already exists** (`src/lib/returnTo.ts`). A shared link is saved before the redirect and reopened after sign-in. The same mechanism can reopen the screen a guest was on.
- **The client already treats the user as optional in most places.** 37 files call `useAuth()`, almost all of them via `user?.id`, with only 3 forced non-null uses. Hooks like `useMyCommunities(user?.id)` and `useSessionFeed(user?.id)` already accept "no user".
- **Sign-in is already one tap** (Google only). The friction is *being asked before seeing anything*, followed by onboarding (pick a username with a "you can only change this once every 30 days" warning).
- **Tournaments are public by nature.** Results are already shown to anyone in the room on the projector site.

---

## 3. What a guest could see

| Area | Guest access | Notes |
|---|---|---|
| Tournaments tab: list, detail, modules, brackets, standings, schedule, live | ✅ **Read-only** | Published tournaments only. Entries show public fields only (Name, School). **Never** CMS ID / phone / email, stripped server-side as `get_module_entries` already does for non-admins. This is the strongest "wow, this is useful" surface. |
| Discover: public + restricted community cards | ✅ Read-only | Name, sport, member count, organisation, location, creator username. Same data as a card today. |
| Community home (public communities) | 🟡 **Preview** | Header/description/member count plus the latest few posts and approved matches. Recommended: show it, since it sells joining. Can be cut to the header only if you prefer more privacy. Restricted communities: header only. |
| Sessions "New" feed | 🟡 Decide | Shows location + time of real meet-ups. Suggestion: show the list (sport, title, time, area) and hide the creator's name and exact location until sign-in. |
| Public profiles `/profile/[id]` | ❌ Sign-in | Keeps `public_profiles` closed to scrapers (the reason for 109). |
| Chats, Activity, own profile, settings | ❌ Sign-in | The tab shows a friendly "Sign in to see your chats" card, not a redirect. |
| Any write (join, apply, post, like, comment, record match, ping, report, create, score live) | ❌ Sign-in sheet | One shared helper, see §5 phase 3. |

---

## 4. Options compared

### A. Supabase anonymous sign-in (`signInAnonymously`): **not recommended**
An anonymous Supabase user still gets the **`authenticated` role** and a real `auth.uid()`. Every existing guard (74 write policies, ~79 functions granted to `authenticated`, most checking only `auth.uid() is not null`) would **let guests write**: posting, recording matches, joining, pinging, reporting, creating communities. Making that safe means adding an `is_anonymous` check to every write path, and missing one is a hole. It also fills `auth.users` with throwaway rows and invites spam.
*(It only becomes useful if, later, you want guests to keep data such as "followed tournaments" before signing in.)*

### B. Read-only "guest" functions for the `anon` role: **recommended**
Add a handful of new `guest_*` functions, each `SECURITY DEFINER`, `grant execute … to anon`, returning only published / public data with no private fields. Migration 109 stays intact, existing functions are untouched (so installed builds keep the same behaviour), and the whole guest surface fits in one reviewable migration. It follows the pattern `get_live_board` already uses.

### C. Keep the wall, make it softer (landing screen with screenshots, "Continue with Google" after)
Cheap, but it doesn't remove the resistance. Users still can't see real content. At most an interim step.

---

## 5. Plan (option B)

### Phase 0: decide and measure (before code)
- Confirm the scope table in §3 (especially community preview and sessions).
- Note the current funnel if Play Console / Vercel analytics has it: installs → sign-in → onboarding complete. That's the baseline to compare against.

### Phase 1: database (migration `134_guest_read_access.sql`, additive only)
- New functions, all read-only, all returning `RETURNS TABLE (...)` / jsonb like the existing ones:
  - `guest_get_tournaments(p_scope)`: published only (`live`, `upcoming`, `past`; no `mine`), `my_role` always null.
  - `guest_get_tournament_detail(p_tournament)`: published tournament, its non-draft modules.
  - `guest_get_module_matches`, `guest_get_module_standings`, `guest_get_module_groups`, `guest_get_module_entries` (public fields only, never private entry values or linked profile ids beyond what the bracket shows), `guest_get_tournament_schedule`.
  - `guest_get_live_tournaments` (+ reuse `_live_board(id, true)`, already the "public" variant).
  - `guest_get_communities()`: card fields only.
  - `guest_get_community_preview(p_community)`: header + latest N posts/approved matches for **public** communities, header only for restricted.
  - (optional) `guest_get_open_sessions()`: reduced columns per §3.
- Each function: `revoke all … from public; grant execute … to anon, authenticated;`
- A guest version of the feature-flag read (or a `site_config` row such as `guest_mode {enabled}`), because `get_feature_flags` / `get_remote_config` are signed-in only today.
- Tests in `docs/guest-mode/sql-tests.sql` (run via `docs/tournaments/local-db/run.sh`): as `anon`, each guest function returns only published/public rows and **no** private field; every existing function still refuses `anon`; draft tournaments and restricted-community posts are invisible.

### Phase 2: app, browsing without a session
- `AuthContext`: add `isGuest = !session`.
- Root gate ([_layout.tsx:132](../../src/app/_layout.tsx#L132)): replace "no session → `/login`" with a **guest allow-list**: `(tabs)` (index, tournaments, history), `tournament/**`, `discover`, `community/[id]` (preview), `get`, `android`. Anything else still saves return-to and goes to `/login`.
- First launch as a guest lands on **Tournaments** (or Discover if nothing is live). The Communities tab shows "Discover communities" instead of "My communities".
- Services pick the guest function when there is no session (e.g. `fetchTournaments` → `guest_get_tournaments`). Realtime subscriptions (`useTournamentModule`) fall back to the existing polling for guests, since anon can't subscribe to those tables.
- Header: the avatar becomes a **"Sign in"** pill. Chats / Activity tabs show a sign-in card. No push for guests (FCM needs a profile).
- Providers that assume a user (`NotificationsProvider`, `ReportHost`, announcements, live outbox) already check `session && profile`. Verify each one stays quiet for guests.

### Phase 3: "sign in to continue" sheet
- One helper, e.g. `requireAuth({ reason: 'join this community', resume })`, wired into every write button (join, apply, post, like, comment, record match, ping, report, create community/session, FAB menu).
- It opens a **themed in-app sheet** (per the "no native dialogs" rule) with the reason, the Google button and the Terms/Privacy links, so `/login` is no longer the first thing people see.
- After sign-in (+ onboarding for new users), use `returnTo` to reopen the same screen. Optionally re-run the pending action (e.g. open the Join confirmation again). Don't auto-perform it silently.

### Phase 4: lighter onboarding
- Prefill the username from the Google name (e.g. `murtaza_b`, checked for availability) so most people just tap **Continue**.
- Keep bio and avatar optional. Soften the 30-day warning to one muted line.
- Optional sport-interest chips (they already drive new-community notifications) can be skipped.

### Phase 5: rollout
- Ship behind the `guest_mode` switch (anon-readable, see phase 1). Turn it on for web first: shared tournament links on WhatsApp stop hitting a login wall, which is the cheapest win. Then turn it on for Android.
- Order: migration 134 first, then the app update. **Old builds are unaffected**: they still force login and never call `guest_*`.
- Client-only + SQL, no native modules, so it **can ship OTA** (verify the fingerprint as was done for live scoring).
- Add `vercel.json` rewrites only if new routes are added (none planned).

### Phase 6: measure
- Compare the Phase 0 funnel. Also track: guest → sign-in conversion and which action prompted it (the `reason` passed to `requireAuth`).

---

## 6. Risks and how they are handled

| Risk | Mitigation |
|---|---|
| **Data exposure.** The anon key ships in the web bundle, so anyone can call `guest_*` directly. | Only published / public data, private fields dropped **server-side**, no `public_profiles` exposure, SQL tests that assert it. Same stance as the projector board. |
| **Scraping / free-plan cost.** | Read-only, paginated, small payloads; guests poll instead of holding sockets; `guest_mode` doubles as a kill switch. |
| **Fewer push-enabled users** (push is the main retention hook). | Gentle nudges: "Sign in to get notified when this match goes live" on tournament/module screens. |
| **Guests never convert.** | Every meaningful action leads to the sign-in sheet with a clear reason; measure and adjust. |
| **Regressions for signed-in users.** | Existing functions are untouched; guest code paths only run when `isGuest`. |
| **iOS launch later.** | This is a plus: Apple's review guideline 5.1.1 expects non-account features to be usable without an account. |

## 7. Rough effort

| Phase | Size |
|---|---|
| 1. Migration 134 + SQL tests | ~1–2 days |
| 2. Guest browsing (gate, services, tabs, header) | ~2–3 days |
| 3. Sign-in sheet + wiring every write button | ~1–2 days |
| 4. Onboarding polish | ~0.5 day |
| 5–6. Switch, rollout, device check, metrics | ~1 day |

## 8. Decisions (taken while building)

1. **Community preview = the card only** (cover, sport, members, description, creator) plus a locked "what joining unlocks" list. *Not* recent posts/matches. Reason: a signed-in non-member cannot read that content today (migrations 102/107), so showing it to a guest would widen what the app reveals. Revisit only as a deliberate product decision.
2. **Sessions for guests = reduced list**: sport, title, time, spots. Venue, description and creator are hidden server-side and shown as "Sign in to see the venue".
3. **Guest landing tab = Tournaments** (first screen of a guest visit).
4. **Roll out web first, then Android**, behind the server switch. Since the switch is server-side and read at launch, both get it the moment it is turned on *and* the new build/web deploy is live; old builds ignore it.

## 9. What was built (one commit per step)

| Step | What | Where |
|---|---|---|
| 1 | Database: `guest_get_*` read-only wrappers, `site_config.guest_mode` switch (OFF), `admin_set/get_guest_mode` | `supabase/migrations/134_guest_read_access.sql`, `docs/guest-mode/sql-tests.sql` |
| 2a | App plumbing: guest store, route allow-list, rpc routing that fails closed | `src/lib/guestMode.ts`, `AuthContext`, `_layout.tsx`, services, `docs/guest-mode/route-tests.cjs` |
| 3 | The "sign in to continue" prompt (sheet + inline card), `requireAuth()` | `src/lib/requireAuth.ts`, `src/lib/signInReasons.ts`, `src/components/SignInSheet.tsx` |
| 2b | Guest screens: Communities, community card, Sessions, Chats / Activity cards, header Sign-in pill | `src/components/GuestViews.tsx`, tabs |
| 4 | Lighter onboarding (username pre-filled), keeps the return-to destination | `src/lib/suggestUsername.ts`, `src/app/onboarding.tsx` |
| 5 | Admin panel switch + this write-up | `admin/src/pages/Settings.tsx` |

### Security model in one paragraph
Migration 109 is untouched, so `anon` still cannot run any existing function. Each `guest_get_*` function runs the existing, reviewed read function as a **stranger** (all-zero user id: no profile, memberships, admin or entry rows), so a guest sees at most what a random signed-in stranger already sees; private entry fields stay stripped server-side. Writes are never wrapped. Every guest function first checks the `guest_mode` switch, so turning it off is a real kill switch. `docs/guest-mode/sql-tests.sql` proves this under the real `anon` role, including an allow-list assertion that `anon` can execute nothing but `guest_get_*` and `get_live_board`.

## 10. Owner rollout checklist (nothing below has been done yet)

1. **Apply migration 134** to Supabase (SQL editor or `supabase db push`). Safe: the switch seeds OFF, nothing changes for anyone.
2. Run the checks in `docs/guest-mode/sql-tests.sql` (or via `docs/tournaments/local-db/run.sh`) - each ends with `ALL TESTS PASSED`.
3. **Ship the app change**: web (`npx expo export -p web` + `vercel ./dist --prod`, see `web-deploy-commands.txt`) and/or an OTA update (client-only + SQL, no native modules; verify the fingerprint is unchanged first, as for live scoring). Deploy the admin panel if you want the toggle.
4. **Test with the switch still OFF**: behaviour must be exactly as before (everyone lands on Login).
5. **Turn it on**: Admin panel > Settings > *Guest browsing*, or `select public.admin_set_guest_mode(true);` as a super admin. Takes effect at each app launch.
6. **Walk through as a guest** (fresh browser / signed-out): lands on Tournaments; open a tournament, a module, live courts; Communities > a community card > Join opens the sign-in sheet naming the community; Chats / Activity show the inline card; header shows *Sign in*; sign in with a **new** Google account: onboarding shows a suggested username, finishing returns to the community page you were on.
7. If anything looks wrong: **turn the switch off** (instant for new launches, no deploy).
8. Measure (Phase 6): Play Console / Vercel funnel vs the Phase 0 baseline; consider logging which `requireAuth` reason led to a sign-in.

### Known limits / follow-ups
- Guests have no realtime: the bracket polls every 30 s; the live-courts screen falls back to its polling path.
- Tournament promo codes are signed-in only (a natural reason to sign in).
- Push notifications need an account by nature; consider an in-app nudge on tournament pages later.
- Pending-action resume (auto-running the join after sign-in) is intentionally not done: the person lands back on the same page and taps once.
