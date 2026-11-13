# Roadmap Plan — sheet items + long-term stability

> Status: **draft / not started**. Drafted 2026-11-11.
> All migrations must be additive and backward-compatible with installed builds (see AGENTS.md → Backward Compatibility). Next migration number: **125**.

---

## Part A — Sheet items

### A1. Deep links + sharing (community, match, session, tournament, profile)

**Today:** only the `t3s://` scheme exists (used for the OAuth callback). `t3s://` links pasted in WhatsApp etc. are not clickable.

**Plan**
- **Use https links** — `https://<web-domain>/community/<id>`, `/tournament/<id>`, `/profile/<id>`, etc. The web build already serves these routes (`vercel.json` rewrites every path to `index.html`).
- **Android App Links** — add `intentFilters` with `autoVerify: true` in `app.json` + publish `/.well-known/assetlinks.json` on Vercel (SHA-256 of the Play signing key) so the installed app opens the link directly. Without the app, the web build opens with a "Get the app" banner (reuse `get.tsx`).
- **Share buttons** on: community header + info, `MatchDetailPopup`, `PostDetailPopup`, `SessionDetailPopup`, tournament + module screens, profile. Native: `Share.share()`; web: `navigator.share` with copy-to-clipboard + `toast()` fallback.
- **Compelling copy** from a single helper `src/lib/share.ts`:
  - Community: *"🏓 Join **NUST TT Club** on Sportron — 42 players, weekly sessions, live leaderboard. Tap to join: …"*
  - Match: *"Ali beat Murtaza 11–7 in NUST TT Club 🔥 Think you can do better? …"*
  - Tournament: *"🏆 Spring Open is LIVE — follow the bracket: …"*
  - Session: *"Need 2 more for badminton at 6 PM today 🏸 Join: …"*
- **Rich previews (optional, phase 2)** — WhatsApp/Twitter previews need server-rendered OG tags. A Vercel edge function on short paths (`/c/:id`, `/m/:id`, `/t/:id`) reads the entity from Supabase, returns OG meta, then redirects to the real route.
- **Signed-out users** — the auth gate in `_layout.tsx` must remember the intended path and redirect there after login/onboarding.
- **Release:** needs one store release (intent filters + share buttons).

### A3. Announcement / promo banner (remote-controlled)

- **Migration 125:** `announcements`
  - `id, title, body, image_url (Cloudinary), cta_label, cta_url` (in-app route or external URL)
  - `placement` — `app_open_modal | home_banner | tournaments_banner | sessions_banner`
  - audience — `platforms text[]`, `min_app_version`, `max_app_version`, `sport_interests text[]`, `audience` (`all | new_users`)
  - `starts_at, ends_at, priority, dismissible, max_shows, is_active, created_by, created_at`
- `announcement_events (announcement_id, profile_id, event 'view'|'click'|'dismiss', created_at)` for basic analytics.
- **Read path:** `get_active_announcements(p_platform text, p_app_version text)` — SECURITY DEFINER, `auth.uid()` guard, RETURNS TABLE. Dismissals/show counts tracked per device in AsyncStorage.
- **Client:** `<AnnouncementHost placement="…" />` — modal variant appears once after maintenance/forced-update gates + splash; banner variants at the top of the home / tournaments / sessions lists. CTA uses the generic `openTarget(url)` (B8).
- **Admin panel:** new *Announcements* page — create, schedule, preview, end; views/clicks per announcement. RPCs `admin_list/create/update/end_announcement` with `assert_platform_role` + `log_admin_action`.

### A4. Sport "Other" → exact sport name required (tournament modules + communities), plus a "More" sports list

#### A4.1 Tournament module form — "More" sports dropdown

**Goal:** organisers should rarely need "Other". The module form keeps today's sport pills (table tennis, badminton, tennis, squash, pickleball, football, cricket, volleyball, handball, basketball) and adds a **More** pill that opens a searchable dropdown/sheet of extra sports. **Other** stays as the last resort.

**Extra sports list:** the sports from the reference image that the app doesn't support yet.
Chosen from the reference image (only common sports the app lacks), seeded as `tier = 'more'` rows in the remote `sports` config (B4):

| Key | Label | Who plays | How a match is won | Draws |
|---|---|---|---|---|
| `futsal` | Futsal | teams (5–10) | final score | on |
| `chess` | Chess | players | final score | on |
| `egaming` | Egaming | players or teams | best-of games | off |
| `athletics` | Athletics (sprints & runs) | players | final score | off |

Left out for now (niche; can be added from the admin panel with no release): Arm Wrestling, Tug of War, Throwball.

**Where the list comes from**
- **If B4 (remote lists) is implemented:** do **not** hardcode the list. The More options come from the remote `sports` config (key, label, icon/emoji, `kind` racket/team, default roster min/max, `tier` primary | more, `enabled_for` tournaments/communities). The bundled fallback is just today's sports, so new sports can be added from the admin panel with no release.
- **Only if B4 isn't built first:** add the extra sports as a hardcoded `MORE_SPORTS` array in `src/types/index.ts`, and delete it once B4 lands.

**How they're stored (backward compatibility)**
- Old builds have a fixed `Sport` union and maps keyed by it (labels, `DEFAULT_ROSTER`, icons). A module stored with an unknown key such as `sport = 'padel'` could show blank labels or crash their module screens, and `tournament_modules.sport` also has a CHECK list (084).
- **Recommended:** store a "More" sport as `sport = 'other'` + `custom_sport_name = '<label>'` + a new nullable `sport_key` column (e.g. `padel`). Old builds see a valid "Other" module, while new builds read `sport_key` and show the proper name, icon and roster defaults. No CHECK change is needed.
- Participant type, roster defaults, scoring mode and draw defaults come from the list entry (see A4.4), not from `isRacketSport` / `isTeamSport`.

#### A4.2 Tournament module with "Other" → mandatory sport name

- **Migration 126 (part):** `tournament_modules.custom_sport_name text` + `sport_key text` (both nullable, additive). `create_tournament_module` / `update_tournament_module` accept the optional params and raise `CUSTOM_SPORT_REQUIRED` when `sport = 'other'` and the name is blank (trimmed, max 30 chars). Read RPCs (`get_tournament_detail`, module reads) return both columns.
- **Client:** `module-form.tsx` shows a required "Sport name" field when **Other** is picked (hidden for More sports, which fill it automatically). `ModuleCard`, module headers, notifications and the admin panel show the custom name instead of "Other". Map the new code in `lib/tournamentErrors.ts`.
- **Notification copy** (088/121 triggers) uses the custom name when present.

#### A4.3 Community creation with "Other" → exact sport name

- **Migration 126 (part):** `communities.custom_sport_name text` (nullable, additive). It's validated by a trigger **on change only** (not a CHECK): required when `sport = 'other'` on insert, trimmed, max 30 chars. Existing Other communities stay valid with a null name. Return the column from `get_my_communities`, `get_public_communities`, `get_community_by_id`, and the discover RPCs.
- **Client:** `create-community.tsx` shows a required "What sport exactly?" field when **Other** is picked, and `community/[id]/edit.tsx` lets admins set or fix it (the sport itself stays locked). Community cards, Discover, the community header and info show the custom name, falling back to "Other".

#### A4.4 Match rules for unseen sports ("how it's played", not "which sport it resembles")

**Decision:** a new or unknown sport (e.g. e-gaming) is **not** mapped onto an existing sport. The bracket/fixture engine is already sport-agnostic; the sport only drives defaults. A module's rules are described by three sport-independent settings:

| Setting | Exists today? |
|---|---|
| **Who plays:** players or teams (+ team size; 2 = duo/doubles), via `participant_type` + roster min/max/lineup | ✅ Yes. Other already allows both. |
| **Can matches draw:** `allow_draws` toggle | ✅ Yes |
| **How a match is won:** best-of games/sets/maps vs one final score | ❌ **No.** It's decided only by `isRacketSport(sport)` in `ResultEntrySheet.tsx`, so Other is always single final score |

**Where the values come from**
- **Known sports:** exactly as today, nothing changes.
- **"More" sports (remote list, A4.1/B4):** each entry carries defaults for `kind` (players/teams), roster sizes, `scoring_mode` and draws. Examples:
  - FIFA: players, final score, draws on.
  - Valorant: teams of 5, best-of maps, no draws.
  - Chess: players, final score, draws on.
- **Other:** the module form asks "Who plays?" (Players / Teams, existing control) and **"How is a match won?"** (Best of games/sets/maps / Final score, new). Draws keep the existing toggle. Defaults: players + final score.
- Admins can change all of these until the bracket is generated (same lock as today).

**To build (only the missing piece)**
- **Migration 126 (part):** `tournament_modules.scoring_mode text` (nullable, `games` | `score`, validated by trigger on change). Settable through `update_tournament_module_settings` (jsonb patch) with the same "no bracket yet" lock; return it from module reads.
- **Client:** helper `moduleScoringMode(module)` = `scoring_mode ?? (isRacketSport(sport) ? 'games' : 'score')`. Use it in `ResultEntrySheet` (instead of `isRacketSport`), in `ModuleGroupsTab`'s `hideDraws`, and for `defaultAllowDraws`. Show the "How is a match won?" control in `module-form.tsx` for Other and More sports.
- **Labels:** "Games" works for racket sports; for best-of in Other/More use neutral copy ("Game 1, Game 2…", or the list entry's `unit_label`, e.g. "Map").
- **Old builds:** an empty `scoring_mode` keeps today's behaviour. An admin on an old build entering a result for a best-of Other module gets the single-score sheet; the result still saves (winner + score), just without per-game detail. Acceptable; raise `min_app_version` if needed.

### A5. Community linked to "Other" → no match recording

**Today (`src/app/add-match.tsx` ~L88–103):** for `other`, neither the racket lineup selector nor the team selector renders, so no opponent can be picked. `canSave` still passes, then `handleSave` fails with "Invalid Opponent". The flow is broken.

**Plan:** matches aren't supported for Other communities.
- `FABMenu` hides **Record match** when `community.sport === 'other'`, leaving Write post / Photo post / Ping.
- `add-match.tsx` guards the route: if the community is Other (e.g. an old link or deep link), it shows a short "Matches aren't available for this community" message and goes back.
- Hide match-only UI for Other communities (the pending-matches entry and per-community match stats on profiles). Already-approved old matches, if any, still show in the feed.
- **Server-side (optional):** trigger on `community_matches` INSERT rejecting rows whose community sport is `other` (`NOT_ALLOWED`). Old builds already can't complete this flow, so this only hardens against direct API calls.
- Still fix the `canSave` / `handleSave` mismatch for other sports, so save is never enabled without a valid opponent.

### A6. Back button invisible in dark mode on web

**Likely cause:** the stack sets `headerTintColor: theme.text`, but on react-native-web the default back icon is a PNG tinted via `tintColor`, which doesn't apply reliably. A few screens also define their own `headerLeft` (6 files).

**Fix:** one shared `<HeaderBack fallback="…" />` component (lucide `ChevronLeft`, `color={theme.text}`, `goBack(router, fallback)` from `lib/nav`). Set it as the default `headerLeft` in `pushOptions` in `_layout.tsx`; replace the custom ones. Verify every stack screen in dark mode on web.

### A7. "Pending invites" has no back button on web

**Likely cause:** the screen is reached with no navigation history (refresh / direct URL / opened from a notification), so the header back button is hidden or does nothing.

**Fix:** covered by A6 — `HeaderBack` always renders and falls back to a known parent route when history is empty. Give every pushed screen an explicit fallback. This also fixes screens opened from shared links (A1).

> **To confirm:** which screen — Activity → *Invites* tab, or the pending-invite section on *Members*?

### A8. Tournament discount code (6 digits, found on the tournament page)

> **Status: implemented** (migration 128, `PromoCodeCard`, `PromoManageSection`, admin panel *Discount codes*). Per-promo `display_mode` = `reveal` (default) | `visible` | `hidden` (long-press the cover). The code is withheld by `get_tournament_promos` until `reveal_tournament_promo` is called.

**Goal:** a 6-digit code (e.g. `482913`) shown somewhere on the tournament page that players can find and use to get a discount (entry fee, sponsor shop, café, kit partner…). The app only **displays** the code; redemption happens off-app (at the desk / partner), so no payment logic is needed.

**Data — migration 128 (additive)**
- `tournament_promos`: `id, tournament_id fk cascade, code text` (exactly 6 digits, validated by trigger), `title` ("10% off entry fee"), `description` / terms, `partner_name`, `cta_url` (optional), `starts_at, ends_at, is_active, created_by, created_at`.
- Separate table rather than a column on `tournaments`, so a tournament can have more than one offer later and old RPC shapes stay untouched.
- Not directly readable by clients (RLS: no SELECT). Read through `get_tournament_promos(p_tournament_id)`: SECURITY DEFINER, `auth.uid()` guard, returns only active, in-window promos for tournaments the caller `can_view_tournament`. Signed-in users only, so the code isn't scraped from public links.
- Optional `tournament_promo_reveals (promo_id, profile_id, revealed_at)`, PK `(promo_id, profile_id)`. This counts how many people found/revealed it and shows in the admin panel.

**Who sets it**
- Tournament admins: new "Discount code" section in `tournament/[id]/manage` → `upsert_tournament_promo` / `end_tournament_promo` RPCs (`is_tournament_admin` check, error codes `PROMO_CODE_INVALID`, `NOT_ALLOWED`). A "Generate" button creates a random 6-digit code; admins can also type one.
- Platform admins: same controls on the admin panel tournament detail page (`admin_*` RPCs + `log_admin_action`), plus the reveal count.

**How players find it** (pick one style, or make it a per-promo setting `display_mode`):
1. **Visible card** (simplest): a ticket-style card on the tournament overview below the info, with the partner name and offer title, and a code with a **Copy** button (`toast("Code copied")`).
2. **Tap to reveal**: the card shows `• • • • • •` with "Tap to reveal your discount"; tapping reveals the code with a small `celebrate()` and records a reveal. Gives reveal analytics.
3. **Hidden / easter egg**: no card. The code is unlocked by a hidden interaction (e.g. long-press the tournament cover, or a small 🎁 icon tucked into the info tab), and organisers hint about it at the venue / on socials. Fun, but some users will never find it.

Recommendation: **tap to reveal** by default with `display_mode` supporting all three, since this is server-driven and you can switch per tournament without a release.

**Client**
- `services/tournaments.ts`: `fetchTournamentPromos`, `recordPromoReveal`; `useTournament` loads promos alongside detail.
- `components/tournaments/PromoCodeCard.tsx` (ticket/coupon look, themed for light/dark, Reanimated reveal respecting reduced motion, haptics.success on reveal).
- Hidden when there's no active promo, so old and new tournaments look unchanged.

**Optional later**
- Per-user unique codes (each player gets their own 6-digit code) so codes can't be shared and redemptions can be checked off by the organiser. More work: a code pool + a "mark redeemed" screen for admins.
- Push/announcement (A3) when a new promo goes live for a tournament you follow.

---

## Part B — Release less often (server-driven app)

Principle: **the server decides what the app shows; the app renders it.**

| # | Addition | What it buys |
|---|---|---|
| **B1** | **EAS Update (OTA)** — add `expo-updates`, `runtimeVersion: { policy: "fingerprint" }`, channels `production` / `preview` | **Biggest win.** Any JS/UI change (fixes, screens, copy) ships with `eas update` in minutes, no Play review. Store releases only when native code changes. `expo-updates` is **not installed yet** — must be in the next store build. |
| B2 | **Feature flags** — `feature_flags` (key, enabled, min_app_version, rollout_percent, platforms) + `useFlag('announcements')` hook, cached with fallback | Ship code dark, enable from the admin panel; kill switch; gradual rollout. |
| B3 | **Remote What's New** — move `WHATS_NEW_CONTENT` to the DB | Today it needs `CURRENT_VERSION` bumped in 3 places + a release. |
| B4 | **Remote lists & limits** — sports list (incl. the A4.1 "More" sports), session purposes, "expire after" chips, chat length, max days ahead served from config, bundled values as fallback | Add a sport or tweak a limit with no release (server still enforces). |
| B5 | **Server-driven tips / empty states** (`lib/tips.ts` → DB) | Onboarding hints, seasonal tips without a release. |
| B6 | **Soft update prompt** — `recommended_app_version` in `site_config` → dismissible "Update available" banner | Nudge without blocking (forced update already exists). |
| B7 | **Admin broadcast push** — admin page inserts notifications for a segment (all / sport / community) | Announce events instantly via the existing trigger → FCM path. Needs a new notification type in the check constraint. |
| B8 | **Generic deep-link router** — `openTarget(url)` used by every CTA, push and banner | New campaigns can point anywhere without new code. |
| B9 | **Crash/error reporting** (Sentry) | Know what broke before users report it; with OTA, fix same day. |

---

## Suggested order

1. **Quick fixes (next OTA/release):** A6 + A7 (shared `HeaderBack`), A5 (hide Record match for Other communities + add-match guard).
2. **Foundation store build:** B1 (expo-updates), A1 App Links + share buttons, B2 flags, A3 announcement host. After this, most work can ship over the air.
3. **Mostly OTA + migrations:** B4 remote sports list → A4 (More sports dropdown, Other sport name for modules + communities), A8 tournament discount code, A1 OG previews, B3, B5–B8.

> B4's sports list should land **before** A4.1 so the More list never needs to be hardcoded.

## Migrations

| # | Contents |
|---|---|
| 125 | `announcements`, `announcement_events`, read RPC, admin RPCs |
| 126 | `tournament_modules.custom_sport_name` + `sport_key` + `scoring_mode`, `communities.custom_sport_name` (+ on-change validation trigger), RPC updates, optional `community_matches` insert guard for Other communities |
| 127 | `feature_flags` + remote lists config (sports list for B4/A4.1) + read RPCs + admin RPCs (+ `recommended_app_version` row) |
| 128 | `tournament_promos` (+ optional `tournament_promo_reveals`), read/upsert/end RPCs, admin RPCs |

## Open decisions

- [ ] Ship B1 (OTA updates) in the very next store build? (recommended)
- [ ] Which screen is "pending invites" (A7)?
- [ ] Web domain to use in share links (Vercel domain vs `sportron.app`)?
- [x] A4.1: "More" list chosen: Futsal, Chess, Egaming, Athletics.
- [x] Decided: share domain `sportron.app`; ship OTA (B1) in the next store build; discount code = tap to reveal, one shared code per tournament.
- [ ] Discount code (A8): visible card, tap to reveal, or hidden easter egg? One shared code per tournament or unique per user?
