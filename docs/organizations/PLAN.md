# Organizations on Sportron: Phase 1 plan (NUST)

Status: **draft for owner approval**. Plan only: no code, migration or deployment has been changed.
Source: [`BRIEF.md`](BRIEF.md) (2026-11-28) + the owner's answers below. Next migration number: **138**.

---

## 0. In one page (plain language)

**What we are building.** NUST becomes an *organization* inside Sportron. DD Sports (the organization admin) appoints *organizers*. Organizers create and run NUST tournaments in the app or the web app, appoint *sport managers* for each sport, and sport managers appoint *scorers*. Scorers only score. The Old Gym TV gets a permanent *screen link* that shows whichever NUST tournament is assigned to it. The owner (super admin) creates the organization once, picks its admins and is no longer needed day to day.

**What normal users see.** Nothing changes. Organize / To score cards only appear for people who hold a role.

**Order of work** (each step ships on its own and is useful on its own):

| # | Step | What it gives you | Effort |
|---|---|---|---|
| A | Scorer role + "To score" list | Volunteers can score without seeing phone numbers or resetting results | M |
| B | Organization, DD Sports, organizers + super admin "Organizations" page | You stop being needed to set people up | L |
| C | "Organize" area + guided tournament creation in the app | Organizers create and publish tournaments themselves | L |
| D | Flexible sign-up fields | CMS ID / School / Phone / Email can be made optional per tournament | S |
| E | Screen links + Sportron brand lock + discount codes off | Old Gym TV never needs touching; Sportron always visible | M |
| F | Scoring fixes for badminton, table tennis, basketball, volleyball | Rules match what NUST plays | M |
| G | Plain words, next-step hints, one-page guides | Non-technical people manage without help | M |
| H | Rehearsal at Old Gym + usability test with DD Sports | Proof it works before handover | S |

Everything except the projector website and the admin panel reaches phones **over the air** (no Play Store update), behind a feature flag that stays off until the rehearsal passes.

---

## 1. Decisions

### 1.1 Owner answers (2026-11-28) — now CONFIRMED

| # | Question | Answer |
|---|---|---|
| 1 | Sports first | **Badminton, basketball, table tennis, volleyball.** Date: not a factor; plan the whole of Phase 1 |
| 2 / 11 | Organizer scope | **Own tournaments only** (created or added to). DD Sports manages all NUST tournaments. Co-organizers must be NUST organizers; sport managers and scorers can be any Sportron user |
| 3 | Delete rule | **Accepted.** Organizers delete drafts only; published ones can only be cancelled; DD Sports or super admin can hide; only super admin deletes published ones permanently |
| 4 | Scorer | **Accepted as proposed** (brief §5): per sport (module), result counts at once, no undo/reset/walkover, take over after confirmation, no private fields |
| 5 / 6 | Publishing / limits | **Publish freely, no limit** on active tournaments |
| 7 | Brand | **Discount codes off for NUST; Sportron promo + small Sportron mark locked on** on live screens |
| 8 | Outsiders / CMS ID | **Make all sign-up fields configurable**, because more organizations will come. See §6 |
| 9 | Links / Old Gym | **Both links.** Two sports (modules) of one tournament may run at Old Gym at once (already supported: one screen shows all courts of one tournament). Two tournaments at once: no → **combined display is not Phase 1**; one tournament per screen |
| 10 | Org admins | **Several**, all equal |
| 12 | Where | **App and web app**, same screens. No admin-panel access for NUST |
| — | Suspension | **Freeze, stay visible**: published tournaments stay viewable; nobody at NUST can change or score until unsuspended |

### 1.2 Remaining PROPOSED items I took as accepted (say if not)
- Removing a person ends access immediately; their tournaments stay with NUST (§8).
- App-wide controls (maintenance, forced update, broadcasts, reports, feature flags, usage analytics) stay with the super admin.
- Tournaments start as drafts, with a preview and a confirm before publishing.
- Simple activity history for DD Sports.
- One organization can never manage or read private data of another's tournaments.
- **Not code:** a written data agreement with NUST about player contacts must be signed before handover (owner task).

### 1.3 Interpretations I made (please check)
- **"Hide"** is a new switch on a tournament (`hidden_at`), not a new status. Old app builds know only four statuses; a fifth could break them. Hidden = invisible to players, guests and screens; still visible to its admins, DD Sports and you.
- **"Configurable fields"** = per tournament, an organizer can make CMS ID, School, Phone and Email optional or turn them off; Name is always required. Phone, Email and CMS ID stay **private** (no switch to make them public). The organization keeps a default set so every new NUST tournament starts the same way (§6).
- **Scorer and sport manager are per module**, so "Badminton Men's Singles" and "Badminton Women's Singles" each need the person added. To make that painless, the add sheet has "Also add to: [other sports in this tournament]" checkboxes.

---

## 2. Verified current system (brief §8 checked against code)

All facts in brief §8 hold. Extra findings that shape this plan:

| Finding | Where | Consequence |
|---|---|---|
| Three helper functions are the permission choke points: `is_tournament_admin`, `is_module_admin` (includes tournament admins), `can_view_tournament` | 084 | Organization rights are added **inside these helpers**, so ~60 existing functions pick them up with no change |
| Direct table reads bypass the helpers: `get_tournaments` role column, `get_tournament_detail` role/admin list, `search_profiles_for_tournament` gate, winner notifications | 085, 121 | Each is redefined in step B (listed in §5) |
| `get_tournaments` and `get_tournament_detail` are wrapped by usage analytics | 136 | Edit `_usage_inner_get_tournaments` / `_usage_inner_get_tournament_detail`, **not** the wrapper |
| App decides "show admin tools" from `my_role` = `'tournament_admin'` / `'module_admin'` | `useTournament.ts:46`, `useTournamentModule.ts:182`, `score/[matchId].tsx:99` | DD Sports must get `my_role = 'tournament_admin'` so **old builds** already show them the manage screens. New role `'scorer'` is ignored by old builds (`roleTag` returns null) |
| `_tournament_assert_writable` is called by every tournament write and live function (10 migrations) | 086 … 133 | One place to add the "organization suspended" freeze |
| Live scoring already has take-over: `live_start_match(p_takeover)` raises `LIVE_TAKEN` if another person scored in the last 2 minutes | 133:505 | Scorer take-over reuses it; only the permission changes |
| `live_push_score` / `live_finish_match` check only "you are the current scorer", not "you still have the role" | 133:556, 610 | Must add a role check, or a removed scorer keeps scoring a match they already started |
| `live_finish_match` calls `record_tournament_result`, which requires `is_module_admin` | 133:638, 094:915 | Split the engine into an internal core + the public wrapper (step A) |
| `tournament_matches.recorded_by` exists and is set on result | 084:195, 087 | "Who scored" needs no new column |
| Live codes are 4–24 chars, one path segment (`/<code>`) | 133:767, `live/src/App.tsx:68` | Screen links use `/s/<code>`; no live code can ever be `s`, so the URL spaces never clash |
| Realtime read policy is `_live_topic_readable`, only for `live:` topics | 133:1036 | Extended for `screen:` topics |
| Projector shows the promo when `show_app_promo` is on; tournament admins can switch it off via `set_tournament_live_display` | 133:121, `Wall.tsx:82` | Brand lock enforced in `_live_display_clean` (server) + projector |
| Platform roles: `super_admin`, `tournament_manager`, `moderator` | 122, 130 | No change; NUST gets **no** platform role |
| Feature flags support minimum app version | 127 `get_feature_flags(p_platform, p_app_version)` | Flag `organizations` can require the OTA that contains the screens |
| Push preferences: `pushPrefKeyFor(type)` in `_shared/fcm.ts` | edge | New notification types push by default; mapping them to `tournament_updates` needs an edge redeploy (optional) |
| Free plan limits in the live plan: ~200 concurrent connections, ~2 M messages / month | `docs/live-match/PLAN.md` §748 | A screen link adds **one** connection per TV. Recheck the current numbers in the Supabase dashboard in step E |

---

## 3. Roles and permissions

### 3.1 Who is who

| Role | How you get it | Stored in |
|---|---|---|
| Super admin | Exists (owner) | `platform_admins` |
| Organization admin (DD Sports; several allowed) | Super admin adds, in the admin panel | `organization_members.role = 'admin'` (new) |
| Organizer | An org admin adds them | `organization_members.role = 'organizer'` (new) |
| Tournament admin ("co-organizer" in the UI) | Creating a tournament, or added by its organizers / org admin (must be an org member) | `tournament_admins` (exists) |
| Sport manager | Added by a tournament admin; any Sportron user | `tournament_module_admins` (exists) |
| Scorer | Added by a sport manager or above; any Sportron user | `tournament_module_scorers` (new) |

An org admin is treated as a tournament admin of **every** tournament of their organization, computed (no rows copied), so adding or removing DD Sports takes effect instantly everywhere.

### 3.2 Matrix (final)

| Action | Super | Org admin | Organizer (own) | Sport mgr (own module) | Scorer (own module) |
|---|:-:|:-:|:-:|:-:|:-:|
| Create / suspend organization, add or remove org admins | ✔ | – | – | – | – |
| Add / remove organizers | ✔ | ✔ | – | – | – |
| Create tournament for the organization | ✔ | ✔ | ✔ | – | – |
| Edit, publish, cancel tournament | ✔ | ✔ | ✔ | – | – |
| Delete **draft** | ✔ | ✔ | ✔ | – | – |
| Hide / unhide | ✔ | ✔ | – | – | – |
| Delete published permanently | ✔ | – | – | – | – |
| Add / remove co-organizers (org members only) | ✔ | ✔ | ✔ | – | – |
| Create sports (modules), appoint sport managers | ✔ | ✔ | ✔ | – | – |
| Reopen a finished sport | ✔ | ✔ | ✔ | – | – |
| Players, draw, schedule, venue, results, walkovers, resets, rules | ✔ | ✔ | ✔ | ✔ | – |
| Appoint / remove scorers | ✔ | ✔ | ✔ | ✔ | – |
| Start, score, finish live matches; take over after confirm | ✔ | ✔ | ✔ | ✔ | ✔ |
| Abandon a live match (stop without result) | ✔ | ✔ | ✔ | ✔ | own match only |
| See private fields (phone, email, CMS ID) | via tournament admin (logged) | ✔ | ✔ | ✔ | – |
| Create screens, edit any screen assignment | ✔ | ✔ | – | – | – |
| Assign own tournament to a free screen / replace after "Replace?" | ✔ | ✔ | ✔ | – | – |
| Discount codes | ✔ (staff only) | – | – | – | – |
| Switch off Sportron promo / mark on screens | – (locked by org setting; super can unlock) | – | – | – | – |
| See organization activity history | ✔ | ✔ | – | – | – |

"Super" acts through the admin panel (`admin_*`) as today; it does not appear as an in-app role.

---

## 4. Data model (migrations 138–146)

All additive. RLS **on** for every new table, all client privileges revoked, reads and writes through SECURITY DEFINER functions that start with an `auth.uid()` guard, `revoke … from public, anon`, `grant execute … to authenticated` (only the screen board is anon). Audit trigger `audit_tournament_table` attached to every new table.

### 4.1 New tables

```sql
organizations
  id uuid pk, name text (3–80) unique (lower), short_name text (≤ 20, e.g. 'NUST'),
  status text check in ('active','suspended') default 'active',
  settings jsonb not null default '{}'   -- see 4.3
  suspended_at, suspended_reason (≤ 200), created_by, created_at, updated_at

organization_members
  organization_id fk cascade, profile_id fk cascade,
  role text check in ('admin','organizer'),
  added_by, added_at, removed_at, removed_by          -- soft removal = history kept
  unique (organization_id, profile_id) where removed_at is null

tournament_module_scorers
  module_id fk cascade, profile_id fk cascade, added_by, added_at
  pk (module_id, profile_id)                          -- hard delete on removal (history is in activity)

organization_screens
  id uuid pk, organization_id fk, name text (2–40, 'Old Gym TV'), venue text (≤ 120),
  code text unique (lower) check '^[a-z0-9][a-z0-9-]{2,22}[a-z0-9]$',
  tournament_id fk null on delete set null, assigned_by, assigned_at,
  courts text[] null (null = all courts), layout text null (null = tournament's),
  archived_at, created_by, created_at, updated_at

organization_activity                                 -- plain-language history for DD Sports
  id bigserial, organization_id, actor_id, action text, tournament_id null,
  summary text (≤ 200, no player PII), created_at
  index (organization_id, created_at desc); pruned after 365 days
```

### 4.2 New columns on existing tables (nullable, no defaults that touch old rows)
- `tournaments.organization_id uuid null references organizations on delete set null` + index. Existing tournaments stay `null` = "Sportron-run" and behave exactly as today.
- `tournaments.hidden_at timestamptz null`, `tournaments.hidden_by uuid null`.
- `tournaments.community_id` and `tournaments.organization` (free text) stay untouched. On create for an organization, `organization` text is filled with the org name so old builds show "NUST" on cards.

### 4.3 `organizations.settings` (validated by a function, unknown keys rejected)
```json
{
  "promos_enabled": false,
  "brand_locked": true,
  "entry_fields": { "cms_id": "required", "school": "required", "phone": "required", "email": "required" }
}
```
`entry_fields` values: `required` | `optional` | `off`. Only the super admin edits settings (admin panel). NUST: as above.

### 4.4 Helper functions (internal unless stated)
- `org_role(p_org, p_uid) → text|null` (active member + org active; null when suspended).
- `is_org_admin(p_org)`, `is_org_member(p_org)` — granted to authenticated (cheap booleans).
- `tournament_org(p_tournament) → uuid`.
- `is_module_scorer(p_module)`, `can_score_match(p_match)` = `is_module_admin(module) or is_module_scorer(module)`.
- `_org_log(p_org, p_action, p_tournament, p_summary)` — never raises.

---

## 5. Server functions: every existing and new function mapped

### 5.1 Redefined helpers (step B) — changes ripple to all callers

| Function | New rule |
|---|---|
| `is_tournament_admin(t)` | today's rule **or** (`t.organization_id` not null **and** caller is an active org admin of an active org) |
| `is_module_admin(m)` | unchanged text; inherits via `is_tournament_admin` (rewrite to call it) |
| `can_view_tournament(t)` | today's rule, **plus**: if `hidden_at` is not null → only tournament admins, module admins, scorers of it; drafts also visible to org admins; scorers see drafts of their modules too (so they can prepare) |
| `can_view_module(m)` | today's rule, plus scorers of that module see it while draft |
| `_tournament_assert_writable(t)` | today's rule, plus `ORG_SUSPENDED` when the tournament's org is suspended. Not called by `admin_*`, so the super admin can still act |

### 5.2 Existing functions that read role tables directly (redefined in step B)

| Function | Change |
|---|---|
| `_usage_inner_get_tournaments` | `my_role` = `'tournament_admin'` also for org admins; `'scorer'` when only a scorer. New scope `'org'` is **not** added here (separate RPC) |
| `_usage_inner_get_tournament_detail` | same `my_role` change; admin list unchanged; new optional fields `organization_id`, `organization_name`, `hidden`, `can_organize` (additive json keys / extra columns at the end — check return type: if `RETURNS TABLE`, adding columns needs drop + recreate of inner **and** re-creating the usage wrapper with the same signature; else add keys to json) |
| `get_module_detail` | `my_role` adds `'scorer'` |
| `search_profiles_for_tournament` | gate also allows org members and scorers-to-be pickers (org admins/organizers) |
| 121 winner notifications | unchanged (org admins aren't notified of every winner; avoids spam) |
| 088 `trg_tournament_admin_assigned` | skip when the inserted profile is the caller (creating your own tournament must not notify you) |

### 5.3 Functions that need **no change** (pick up org rights via helpers)
All of 086/087/089/091/093–096/126 tournament writes (`update_tournament`, modules, entries, seeds, rounds, `generate_bracket`, results, walkovers, resets, schedule, knockout stage, rosters), live organiser RPCs (`set_tournament_live_*`, `set_module_live_rules`, `get_tournament_live_settings`), all reads (`get_module_*`, schedule, live board). **Build step B includes a grep pass** (`grep -n "tournament_admins\|tournament_module_admins" supabase/migrations`) to confirm nothing else reads the tables directly.

### 5.4 Live + result functions (step A)

| Function | Change |
|---|---|
| `record_tournament_result` (094) | body moved to internal `_record_tournament_result_core(..., p_actor)`; the public function keeps its signature and `is_module_admin` check and calls the core. **Behaviour identical for old builds** |
| `live_start_match` | permission `is_module_admin` → `can_score_match`; scorer may set court and first server; **a scorer may not pass `p_rules`** (rules come from the module) → `NOT_ALLOWED` if given and different |
| `live_push_score` | add `can_score_match` check (removed scorer stops immediately → `NOT_ALLOWED`; app shows "You are no longer a scorer for this sport") |
| `live_finish_match` | `can_score_match`; calls the core directly. Scorer: only if the match has **no** result yet (no re-recording) |
| `live_abandon_match` | admins as today; scorer only on a match where they are the current scorer |
| `record_tournament_walkover`, `reset_tournament_match`, `schedule_tournament_match`, entries, rules | unchanged = module admin only, so scorers are refused by the server |

### 5.5 New functions

**Scorers (step A)** — all `authenticated`, module admin required for writes:
- `add_module_scorer(p_module, p_profile)`, `remove_module_scorer(p_module, p_profile)`, `get_module_scorers(p_module)` (names + avatars only).
- `get_my_scoring_matches()` → jsonb: matches in modules where I score (or manage), not finished, both sides known, ordered: live now (mine first) → scheduled today → next. Fields: match id, module, sport, names, scheduled time, venue, court, live state, current scorer name. **No private fields.**

**Organizations (step B)**
- In-app: `get_my_work()` → one jsonb for the Tournaments tab: `{orgs:[{id,name,role}], organizing:[tournaments I admin], sports:[modules I manage + today's count], to_score:{count, next}}`. Returns empty lists fast for normal users.
- `org_list_members(p_org)` (org members only), `org_add_organizer(p_org, p_profile)`, `org_remove_member(p_org, p_profile)` (org admin; cannot remove admins — that is super admin; cannot remove self).
- `org_get_activity(p_org, p_before, p_limit)` (org admin).
- Admin panel (`assert_platform_role(['super_admin'])`, logged via `log_admin_action`): `admin_list_organizations`, `admin_get_organization`, `admin_create_organization`, `admin_update_organization` (name, settings), `admin_set_organization_status` (suspend / reactivate + reason), `admin_add_org_admin`, `admin_remove_org_admin` (last admin removable only by super admin; warns), `admin_set_tournament_organization(p_tournament, p_org|null)` (attach existing tournaments), and `admin_create_tournament` accepts an optional `organization_id` in `p_set`.

**Tournament lifecycle for organizers (step C)**
- `org_create_tournament(p_org, p_set jsonb)` — org admin or organizer; creates a **draft** with `organization_id`, `organization` text, `created_by`; inserts caller into `tournament_admins`; applies org `entry_fields` defaults; `live_public = true`. Returns id.
- `org_create_tournament_modules(p_tournament, p_modules jsonb)` — batch for the wizard (wraps `create_tournament_module` logic, applies sport defaults §7.2).
- `publish_tournament(p_tournament)` — runs `preview` checks (≥1 sport, dates set, name) → `published`. Returns warnings list for the confirm sheet (e.g. "Badminton Men's Singles has no players yet").
- `cancel_tournament(p_tournament, p_reason)` — published → cancelled (confirm in UI).
- `delete_draft_tournament(p_tournament, p_confirm_name)` — tournament admin; draft only, else `NOT_ALLOWED`.
- `set_tournament_hidden(p_tournament, p_hidden)` — org admin only.
- `add_tournament_admin(p_tournament, p_profile)` / `remove_tournament_admin(...)` — tournament admin; target must be an active member of the same org (`NOT_ORG_MEMBER`); cannot remove the last one unless an org admin exists (always true for org tournaments).
- `reopen_tournament_module(p_module, p_clear_results)` — tournament admin; same engine as `admin_reopen_module` (refactor its body into an internal function).

**Sign-up fields (step D)** — see §6.

**Screens (step E)**
- `org_list_screens(p_org)` (org members), `org_upsert_screen(p_org, p_screen, p_set)` and `org_archive_screen` (org admin), `assign_screen(p_screen, p_tournament, p_replace boolean)`:
  - org admin: any NUST tournament; organizer: only tournaments they admin.
  - tournament must be **published**, not hidden, same org, `live_public = true` (else `LIVE_NOT_PUBLIC` — the UI offers to switch it on).
  - screen busy with another **active** tournament and `p_replace` false → `SCREEN_BUSY` with `detail` = `{tournament, assigned_by_name, assigned_at}` for the "Replace?" sheet.
- `unassign_screen(p_screen)`, `set_screen_display(p_screen, p_patch)` (`courts`, `layout`).
- `get_screen_board(p_code)` — **anon + authenticated**, the second anon function ever. Returns `{screen:{name,venue,courts,layout}, org:{name,short_name}, live_code|null, board|null, waiting:true|false, server_now}`. `board` = `_live_board(t, true)` (already PII-free) with the screen's court filter applied **server-side**. Waiting when: no tournament, tournament completed/cancelled/hidden/not public, or org suspended.
- Trigger on `organization_screens` update → `realtime.send` `assigned` event on topic `screen:<code>`; `_live_topic_readable` accepts `screen:<code>` when the screen exists and is not archived.

**Brand (step E)**
- `_live_display_clean` forces `show_app_promo = true` when the tournament's org has `brand_locked`; `_live_board` adds `brand:{locked:true}`; `get_tournament_live_settings` returns `promo_locked: true` so the app shows the switch disabled with "Always on for NUST events".
- `upsert_tournament_promo` / `get_tournament_promos_manage` refuse with `PROMOS_DISABLED` when `promos_enabled` is false (staff `admin_*_tournament_promo` unaffected).

### 5.6 Error codes (mapped in `lib/tournamentErrors.ts`, plain words)
`ORG_SUSPENDED` "NUST's account is paused. Contact Sportron." · `NOT_ORG_MEMBER` "Only NUST organizers can be co-organizers." · `SCREEN_BUSY` (sheet, not error) · `LIVE_NOT_PUBLIC` · `PROMOS_DISABLED` · `CANNOT_REMOVE_SELF` · `LAST_ORG_ADMIN` · existing `NOT_ALLOWED`, `LIVE_TAKEN`, `INVALID_STATUS`.

### 5.7 Notifications (migration extends `in_app_notifications_type_check`)
New types: `organization_role_assigned` (you are now an organizer / admin of NUST), `tournament_scorer_assigned` (you can score Badminton Men's Singles). Created by triggers on `organization_members` / `tournament_module_scorers` insert (skip self). Add both to `NotificationType`; tap → `/organize` and `/score`. Optional: map both to pref `tournament_updates` in `pushPrefKeyFor` → **redeploy `send-notification` and `send-chat-notification`** and live-test a push.

---

## 6. Flexible sign-up fields (step D)

Today the five core fields are locked, all required (084 `guard_tournament_core_fields`).

- Allow, for core fields **except `name`**: `is_required` true/false and `archived_at` (off). Keep `is_public` locked (CMS ID, Phone, Email always private; School public).
- Redefine `guard_tournament_core_fields` to allow exactly those two changes, by tournament admins, through `upsert_tournament_entry_field` / `archive_tournament_entry_field` (already exist). **Verify in the build** that `upsert_tournament_entry` and `upsert_team_entry` read `is_required` / `archived_at` from the field rows rather than hard-coding the five keys; fix if they hard-code.
- The CMS-ID uniqueness index already ignores empty values, so optional CMS IDs work.
- New tournaments in an organization start from `organizations.settings.entry_fields`; Sportron tournaments (no org) keep today's defaults.
- Existing entries are untouched; making a field required later does **not** invalidate old entries (checked only on create/edit of an entry).
- UI: the existing entry-form editor shows each core field with *Required / Optional / Off* (Name shows "Always required").

---

## 7. Screens per role (app + web, same code)

### 7.1 Navigation
```
Tournaments tab (centre)
├── [card] Organize — NUST            (org admin / organizer)  → /organize
├── [card] My sports · 3 matches today (sport manager)          → /organize/sports
├── [card] To score · 2 matches        (scorer or manager)       → /score
└── existing Live / Upcoming / Past / Mine list (unchanged)
```
Cards come from one `get_my_work()` call, cached 30 s like `useChats`. Normal users: no card, no extra wait (the list renders first, cards hydrate).

| Route (new) | Who | Content |
|---|---|---|
| `/organize` | org admin, organizer | Org admin: three segments **Tournaments · Organizers · Screens** + "Activity" row. Organizer: **My tournaments** + big "Create tournament" |
| `/organize/new` | both | 3-step guided create (§7.2) — fullScreenModal |
| `/organize/organizers` | org admin | list, "Add organizer" (username search), long-press → Remove (confirm sheet) |
| `/organize/screens` and `/organize/screens/[screenId]` | org admin (organizers see read-only + "Show my tournament here") | screen list with what each shows now; detail: name, venue, link + QR + copy, assigned tournament, courts chips, layout, "Change" |
| `/organize/activity` | org admin | day-grouped plain sentences ("Ali created *Inter-School Badminton*", "Sara added scorer Hamza to *TT Singles*") |
| `/organize/sports` | sport manager | my modules with today's matches and the next step hint |
| `/score` | scorer / manager | "To score": Live now (mine), Today, Later. Tap a match → existing `score/[matchId]` = **2 taps** from the tab |

Existing screens, additions:
- **Tournament manage**: Publish (preview sheet with warnings → confirm), Cancel (destructive confirm, reason), Delete draft (type-the-name confirm), Hide (org admin), **Co-organizers** section, **Show on screen** row (pick screen → "Replace?" sheet naming who assigned the current one).
- **Module manage**: **Scorers** section (add by username + "Also add to" other sports, remove), match sheet shows "Scored by Hamza" (`recorded_by` / live scorer).
- **Score screen** for scorers: shows Start (court, first server), scoring, Finish; hides rules editor, reset, walkover, edit result. Take-over: on `LIVE_TAKEN` a confirm sheet "Hamza is scoring this match. Take over? Their phone will stop scoring." (existing `p_takeover`).
- **ProjectorCard**: promo switch disabled with note when locked; shows "Old Gym TV is showing this" if assigned.

Every new route: add to `HeaderBack` `NON_SCREEN_PARENTS`/`parentOf` (`/organize/screens/[id]` → `/organize/screens`; `/organize/*` → `/organize`), add `vercel.json` rewrite for `/organize/screens/:id`, **not** in `isGuestRoute` (guests are sent to sign-in), and `route-tests.cjs` updated.

### 7.2 Guided creation (`/organize/new`)
1. **Name and dates** — name, start/end date, location (default "NUST, Islamabad"), optional cover. "Next".
2. **Pick sports** — chips: Badminton, Table tennis, Basketball, Volleyball, + Other. For each chip, quick rows: *Men's singles / Women's singles / Doubles / Team* (racket) or *Men / Women* (team); each row = one module with a sensible default name ("Badminton Men's Singles"), format and live rules preset.
3. **Review** — summary + "Save as draft" (default) or "Save and publish" (confirm sheet).
Then land on the tournament with a **next-step banner**: "Add players" → "Create draw" → "Appoint scorers" → "Show on Old Gym TV".

Defaults per sport (advanced options collapsed under "More options"): badminton/TT knockout, best of 3 / best of 5; basketball & volleyball groups + knockout off by default → league if ≤ 6 teams, else knockout; 3rd-place match off.

### 7.3 States
- **Empty**: Organize with no tournaments → illustration + "Create your first tournament"; To score empty → "No matches to score. Your sport manager adds you to a sport."; Screens empty (org admin) → "Add your first screen (e.g. Old Gym TV)".
- **Error**: inline retry card; server codes in plain words (§5.6). Suspended org → a banner on every Organize screen and disabled buttons.
- **Offline**: lists show last cached data with "Offline — showing saved data"; create/publish/assign buttons disabled with "Needs internet"; **scoring keeps working offline** via the existing outbox; a scorer removed while offline gets the rejection when back online and the match shows "Ask a sport manager to finish this match" (state kept in outbox for the manager to take over).
- **Loading**: skeletons (`Skeleton*`), no spinners on full screens.
- All confirmations via `alert()` / confirm sheets — never `window.*` dialogs.

### 7.4 Projector (`live/`)
- New path `/s/<code>`: polls `get_screen_board` (20 s, faster than the 60 s TV reload) and listens on `screen:<code>` + `live:<live_code>`; on `assigned` it re-reads and swaps boards without reload.
- **Waiting page**: org name ("NUST") + "Sportron" + "Next on this screen: …" if a published future tournament is assigned; else "No live event right now".
- **Permanent Sportron mark** (small corner logo) on every page, all organizations; promo forced on when `brand.locked`.
- Existing `/<code>` tournament links unchanged.

---

## 8. Removal, suspension, cancellation

| Event | Effect |
|---|---|
| Organizer removed from NUST | Loses org role at once. Their `tournament_admins` rows on NUST tournaments are **deleted in the same transaction** (else they would keep admin rights). Tournaments stay with NUST; DD Sports already manages them. Logged |
| Org admin removed (super admin) | Loses all computed admin rights instantly (no rows to clean) |
| Sport manager / scorer removed | Next server call refused; a live match they were scoring keeps its last score; another scorer takes over (no 2-minute wait for a removed scorer's claim) |
| Organization suspended | All writes on its tournaments raise `ORG_SUSPENDED` (including live scoring). Published tournaments stay visible in the app; screens show the waiting page; org roles return null so Organize shows the suspension banner. Reactivation restores everything |
| Tournament cancelled | Existing behaviour (read-only, `INVALID_STATUS` on writes); screen assigned to it switches to the waiting page; live rows abandoned by `live_cleanup` |
| Tournament hidden | Disappears for players, guests, Live lists and screens; admins still see it with a "Hidden" pill |
| Profile soft-deleted | Existing cascade rules; org membership row stays but `org_role` ignores deleted profiles |

---

## 9. Scoring fixes (step F) — only the four NUST sports

Engine = `src/lib/live/` (pure TS, also bundled by `live/`). All new snapshot fields **optional**, so older referee builds and old snapshots still load.

| Sport | Fix | In Phase 1 |
|---|---|---|
| Badminton | Doubles: serving side from score (even = right court), server rotation, display "serve from right/left" | Yes, if doubles modules are run |
| Table tennis | Doubles serving order (A1→B1→A2→B2, swap each game, change at 5 in deciding game) | Yes, if doubles are run |
| Basketball | FIBA timeouts: 2 first half, 3 second half, 1 per overtime; 3x3 overtime ends at **first to 2 points**; confirm and enforce clock stop at 0:00 | Yes |
| Volleyball | Timeouts: 2 per set counter | Yes. Substitutions, rotation, libero: later |
| Basketball player points/fouls, shot clock | — | Later (Pakistan Basketball Federation) |

Tests: extend `docs/live-match/engine-tests.cjs` per fix (e.g. 3x3 OT 21–21 → +1 → still running, +2 → ends).

---

## 10. Backward compatibility, flag, rollout, OTA

**Compatibility rules applied**
- Only new tables/columns/functions; no column made NOT NULL, nothing renamed or dropped. Existing tournaments (`organization_id` null) behave exactly as before; there is a SQL test for it.
- Public function signatures unchanged (`record_tournament_result`, `live_*`, `get_tournaments`, `get_tournament_detail`); only extra JSON keys / trailing columns.
- Old app builds: DD Sports and organizers see manage screens through `my_role = 'tournament_admin'`; scorers on old builds simply see nothing new (they need the OTA). Old builds cannot create tournaments — that only needs the new screens.
- `anon` gets exactly one new function (`get_screen_board`); `docs/guest-mode/sql-tests.sql` allow-list updated.
- Usage analytics: add `get_my_work` and `get_my_scoring_matches` to the wrapper list in the same migration (rule 17).

**Feature flag** `organizations` (OFF, min app version = the OTA's version). Gates: Tournaments-tab cards, `/organize`, `/score`, scorer UI. Server functions are already gated by roles (nobody has an org role until you create one), so the flag is the client kill switch. The live scoring flag `live_scoring` must also be ON for scorers.

**Rollout order**
1. Migrations 138–146 on local DB → all SQL tests pass → apply to production in order (each is safe alone).
2. Edge functions: **no required change.** Optional push-pref mapping → `supabase functions deploy send-notification` + `send-chat-notification`, then a live push test.
3. Projector `live/` → Vercel (`/s/<code>`, mark, brand lock). Safe before the app.
4. Admin panel → Vercel (Organizations page).
5. App: EAS Update (OTA) with flag OFF → web export + Vercel (with new `vercel.json` rewrites).
6. Super admin creates NUST, adds DD Sports, creates Old Gym TV screen; flag ON for staff test accounts (or turn on and rely on roles) → rehearsal (step H) → leave ON.

**Can it ship over the air?** Yes for the app: JS-only changes (new routes, components, engine). No new native modules expected (QR display already exists in `live/`; in-app QR for screen links reuses an existing component or a JS-only one). **Check the fingerprint** before publishing the update, as was done for live scoring; if it changes, it needs a store build.

---

## 11. Tests

**SQL** — new `docs/organizations/sql-tests.sql`, run with `docs/tournaments/local-db/run.sh`. Fixture: two orgs (NUST, OrgB), one Sportron tournament (no org), personas: super, nust_admin1, nust_admin2, nust_org1, nust_org2, sport_mgr, scorer, orgB_admin, orgB_org, stranger, anon.
- Matrix: every cell of §3.2 as an allow and a deny assertion.
- **Cross-org**: OrgB admin/organizer cannot read private fields, edit, add admins, assign screens, see drafts or hidden tournaments of NUST — and vice versa.
- Organizer A cannot manage organizer B's tournament until added; co-organizer must be an org member.
- Scorer: can start/push/finish; refused for walkover, reset, rules, entries, re-recording a finished match; private fields stripped in `get_module_entries`; removed scorer refused mid-match; take-over works.
- Suspension: every write raises `ORG_SUSPENDED`; reads still work; screen goes to waiting; `admin_*` still work.
- Removal: organizer removal deletes their `tournament_admins` rows.
- Hide, cancel, delete-draft rules. Brand lock cannot be switched off; promos refused.
- Flexible fields: optional CMS ID entries accepted; Name cannot be made optional; private flag cannot be changed.
- Screen board: never contains phone/email/CMS ID (assert key absence on the full JSON); court filter server-side; `SCREEN_BUSY` detail.
- Regression: rerun `docs/tournaments/sql-tests*.sql`, `docs/live-match/sql-tests.sql`, `docs/guest-mode/sql-tests.sql`, `docs/admin-panel/sql-tests.sql` — Sportron-run tournaments unchanged.

**Client** — `route-tests.cjs` (new routes not guest routes, parents valid), engine tests (§9), outbox tests (rejected-scorer path), `npx tsc --noEmit`, `npm run lint`.

**Rehearsal checklist at Old Gym (step H)**
- [ ] TV opens `/s/<code>` once, left running all day.
- [ ] DD Sports assigns a tournament → TV switches within 20 s without anyone touching it; reassign shows "Replace?" with the right name.
- [ ] Two sports running at once on different courts; screen court filter.
- [ ] Two scorers, two courts, 30 minutes of real points.
- [ ] **Dead phone**: kill scorer A's phone mid-game → scorer B takes over after confirm → score continues from the last point.
- [ ] **Lost internet**: turn Wi-Fi/data off on a scorer phone for 5 minutes, keep scoring, reconnect → server catches up, TV catches up; TV with internet cut shows last state and recovers.
- [ ] Scorer finishes → bracket advances; scorer cannot reset; manager can.
- [ ] Waiting page after tournament completes.
- [ ] Watch Supabase usage (connections, messages) during the rehearsal.

**Usability test (handover gate)**: someone from DD Sports, with no help, creates a tournament, adds players, makes a draw and appoints a scorer. We watch, note every stop, simplify, repeat with a second person.

---

## 12. Build steps (one review each)

| Step | Content | Size | Risk |
|---|---|---|---|
| **A1** | Migration 138: `tournament_module_scorers`, `is_module_scorer`, `can_score_match`, scorer RPCs, `get_my_scoring_matches`, result core split, live function changes, `get_module_detail` role, notification type | M | Engine split must keep exact behaviour → run all v1/v2/live SQL tests |
| A2 | App: Scorers section, To score screen + tab card, score screen in scorer mode, take-over sheet, error copy | M | Score screen assumes admin in places — audit every `isAdmin` use |
| **B1** | Migration 139: `organizations`, `organization_members`, `organization_activity`, `tournaments.organization_id/hidden_*`, org helpers | S | — |
| B2 | Migration 140: helper redefinitions (§5.1) + direct-read fixes (§5.2) + suspension in `_tournament_assert_writable` | M | **Highest risk**: touches every permission path. Two-org SQL tests written **before** this step |
| B3 | Migration 141: `admin_*` organization functions; admin panel Organizations page + tournament org picker | M | — |
| B4 | Migration 142: `get_my_work`, org member RPCs, activity log, notifications | S | — |
| **C1** | Migration 143: create / publish / cancel / delete draft / hide / co-organizers / reopen | M | Delete-draft cascade: confirm nothing outside tournaments references it |
| C2 | App: `/organize`, organizers, activity, guided create, tournament manage additions, next-step banner, routes + rewrites | L | Wizard simplicity — iterate after usability test |
| **D** | Migration 144 + entry-form editor: flexible core fields | S | Entry RPCs hard-coding required keys |
| **E1** | Migration 145: screens, `get_screen_board`, topic policy, brand lock, promos off | M | New anon function → PII assertion test |
| E2 | `live/` `/s/<code>`, waiting page, mark; app screens UI + "Show on screen" | M | Realtime limits; polling fallback |
| **F** | Engine fixes (§9) + tests | M | Snapshot compatibility with old referee builds |
| **G** | Plain words in UI ("Sport", "Draw", "Co-organizer"), collapsed advanced options, one-page guides per role (`docs/organizations/guides/*.md` → PDF) | M | Wording changes in shared tournament screens also reach non-NUST users (fine, same product) |
| **H** | Rehearsal + usability test + fixes | S–M | Real-world surprises |
| Docs | AGENTS.md section 18, rollout checklist, What's New entry | S | — |

Migration numbers are indicative (138 → 145/146); recheck the next free number at each step.

---

## 13. Later, not Phase 1
Combined display of two tournaments on one screen · organization logo/colours ("Powered by Sportron") · private / unlisted events · custom sign-up forms beyond on/off · Pakistan Basketball Federation: player points/fouls, shot clock, their branding · billing, usage limits, custom domains, white label, separate databases · volleyball substitutions/rotation/libero · organizations hosting communities.
