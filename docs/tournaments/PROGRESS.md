# Tournaments — Progress

> Read `AGENTS.md` → `docs/tournaments/PLAN.md` → this file before every session.
> Do **one step** per session. Update this file at the end of the session (PLAN.md §15).

Legend: ⬜ Not started · 🔄 In progress · 🟡 Written – awaiting owner (apply/verify) · ✅ Done · ⛔ Blocked

## Steps

| # | Phase | Step | Status | Date | Files / notes |
|---|---|---|---|---|---|
| 1 | A DB | Schema (084) | 🟡 | 2026-11-08 | `supabase/migrations/084_add_tournaments.sql` written; awaiting owner to apply |
| 2 | A DB | Read RPCs (085) | 🟡 | 2026-11-08 | `supabase/migrations/085_add_tournament_read_rpcs.sql` written (full `get_module_standings` included); awaiting owner apply |
| 3 | A DB | Admin write RPCs (086) | 🟡 | 2026-11-08 | `supabase/migrations/086_add_tournament_admin_rpcs.sql` written; awaiting owner apply |
| 4 | A DB | Bracket engine (087) | 🟡 | 2026-11-08 | `supabase/migrations/087_add_tournament_bracket_engine.sql` written; awaiting owner apply |
| 5 | A DB | SQL tests + owner SQL guide | 🟡 | 2026-11-08 | `docs/tournaments/sql-tests.sql`, `docs/tournaments/owner-sql.md` written; owner must run tests |
| 6 | B Client | Types + service + errors + format | ✅ | 2026-11-08 | Tournament types (re-exported from types/index), one service fn per RPC, RPC error-code → friendly message map, status/format/validation helpers |
| 7 | B Client | Hooks (+ realtime) | ✅ | 2026-11-08 | useTournaments (scope, 30s SWR cache, focus reload), useTournament, useTournamentModule (detail+entries+bracket+standings, realtime on tournament_matches, 400ms debounce) |
| 8 | B Client | Bracket layout lib | ✅ | 2026-11-08 | Pure bracket layout (nodes, connector paths, columns, 3rd-place under final) + devSelfCheck(). Sample output: size2 nodes=1 conn=0 w=196 h=104; size4 nodes=3 conn=2 w=432 h=196; size8 nodes=7 conn=6 w=668 h=380; size16 nodes=15 conn=14 w=904 h=748 |
| 9 | C Nav | Centre tab with bump + route registration | 🟡 | 2026-11-08 | Centre Tournaments tab with raised circular button + SVG bump background (icon only), all tournament stack screens/modals registered with placeholder bodies |
| 10 | D Public | Tournaments list | 🟡 | 2026-11-08 | Tournaments tab: Live/Upcoming/Past/Mine segmented scopes, TournamentCard (CommunityCard recipe, status pill, sport pills, role tag), empty/loading/pull-to-refresh. Added tournamentRoutes typed-href helper (generated route types lag new routes) |
| 11 | D Public | Tournament page (champions → modules → about) | 🟡 | 2026-11-08 | Tournament page: cover, status/date/org/location, Champions strip above Modules, module cards, admin gear + Add module, About with read-more + admins, cancelled banner, empty states |
| 12 | D Public | Module page shell + Info + Entries | 🟡 | 2026-11-08 | Module page shell (header, champion row, 5 scrollable segmented tabs, default tab Bracket-if-exists else Entries), Info tab, Entries tab with search + EntrySheet (view only; private fields only come from the server for admins/own entry). Bracket/Standings/Matches tabs are stubs until steps 13-15. Generic BottomSheet component added |
| 13 | D Public | Bracket view | 🟡 | 2026-11-08 | Bracket tab: absolutely-positioned 196x76 nodes from bracketLayout, SVG connectors, round pills that scroll to column, column headers with Bo-N, draft-bracket banner, own-path accent highlight, TBD/BYE/W/O/live-dot rendering, 3rd-place node under final, empty state. Realtime comes from useTournamentModule. Node tap handler is wired to the match sheet in step 15 |
| 14 | D Public | Standings table + chart | 🟡 | 2026-11-08 | Standings tab with Table/Chart toggle. Table: pinned # + Entry, scrollable P/W/L/+-/Reached, champion row warning tint, own row selected bg, alive dot, tap opens EntrySheet. Chart: Views-only horizontal bars with round ticks |
| 15 | D Public | Matches tab + match sheet (view) | 🟡 | 2026-11-08 | Matches tab grouped by round (plain Views, not SectionList, to avoid nested virtualization) with All/Upcoming/Results chips; read-only match sheet (round, Bo, time/venue/court, scores, game detail, note, advances-to line) opened from bracket nodes and match rows. Sheet takes a footer slot for admin actions (step 20). 'Recorded by' omitted — get_module_bracket does not return the recorder |
| 16 | E Admin | Tournament manage + entry form editor | ⬜ | | |
| 17 | E Admin | Module create/edit | ⬜ | | |
| 18 | E Admin | Module manage + module admins + entry form | ⬜ | | |
| 19 | E Admin | Seeding + rounds + generate/start | ⬜ | | |
| 20 | E Admin | Results (played / walkover / reset / schedule) | ⬜ | | |
| 21 | F Notifs | Notification triggers (088) | ⬜ | | |
| 22 | F Notifs | Client wiring (types, prefs, routing) | ⬜ | | |
| 23 | G Finish | Polish + AGENTS.md + privacy draft | ⬜ | | |
| 24 | G Finish | (optional) Tournament requests | ⬜ | | Only if owner confirms |

## Decisions (owner)

| Date | Decision |
|---|---|
| 2026-11-08 | Tournament = top entity, no sport. Modules inside are sport-linked. Hierarchy: owner → tournament admins → modules → module admins |
| 2026-11-08 | Tournaments created + tournament admins assigned by owner via SQL only; tournament admins can rename the tournament (only editable tournament field) |
| 2026-11-08 | No self-registration — module admins add entries |
| 2026-11-08 | Entry form: core required fields Name, CMS ID, School, Phone, Email; tournament admins can add/edit/remove custom fields |
| 2026-11-08 | Single elimination; 3rd-place match optional; walkovers recorded by module admins; admins enter all results |
| 2026-11-08 | Champions shown on tournament page before modules; non-draft tournaments public |
| 2026-11-08 | Centre tab in bottom bar with a raised circular bump |
| 2026-11-08 | Owner confirmed ALL assumptions A1–A6 as written in PLAN §1.3 |

## Open assumptions (PLAN.md §1.3) — confirm before the dependent step

| # | Assumption | Confirmed? |
|---|---|---|
| A1 | Tournament admins assign module admins | ✅ 2026-11-08 |
| A2 | Tournament admins have module-admin powers in all their modules | ✅ 2026-11-08 |
| A3 | Private: CMS ID, Phone, Email; Public: Name, School; custom fields default private | ✅ 2026-11-08 |
| A4 | CMS ID unique within a module | ✅ 2026-11-08 |
| A5 | Centre tab is icon-only (no label) | ✅ 2026-11-08 |
| A6 | Entries are name-only (no roster) in v1 | ✅ 2026-11-08 |

## Plan deviations

- No sport check existed on `communities.sport` (grep of migrations), so `tournament_modules.sport` uses an explicit `in (...)` list copied from the TS `Sport` union.
- Core-field delete guard allows the delete when the parent tournament is already gone, so `on delete cascade` of a tournament still works.
- Added `revoke insert/update/delete/truncate` from anon/authenticated on all 8 tables (defence in depth beyond "no write policies").
- `get_tournaments` scope `past` also includes `cancelled` tournaments (plan didn't say where they appear).
- `get_module_standings` is full (not a stub) and lives in 085; 087 need not redefine it. `rank_label` is `-` for entries still alive in an unfinished module.
- 086: all writes are blocked (INVALID_STATUS) when the parent tournament is `completed`/`cancelled` (PLAN §3.1: read-only except owner) via internal `_tournament_assert_writable`.
- 086: `update_tournament_module` also blocks changing `third_place_match` once a bracket is generated (would desync rounds); admin must go seeding→open first. `withdraw_tournament_entry` lives in 086 (reason goes to audit log; no column). `set_module_seeds` requires the full list of active entries.
- 087: `record_tournament_walkover` requires BOTH entries present (PLAN §5.4 allowed one empty slot). A one-sided walkover would let the still-undecided feeder match push an entry into the already-decided match. To handle a no-show, record the walkover on the match where the entrant faces an opponent.
- 087: module completion is a shared internal `_complete_tournament_module` called whenever a terminal match (final or 3rd place) is decided, so either order works. A 3rd-place match is skipped when the bracket has only 1 round (N=2).
- Added a few extra indexes (admins by profile, entries by profile, tournaments by status).

## Session log

### 2026-11-08 — Step 15: Matches tab + match sheet (view)
- **Done:** Matches tab grouped by round (plain Views, not SectionList, to avoid nested virtualization) with All/Upcoming/Results chips; read-only match sheet (round, Bo, time/venue/court, scores, game detail, note, advances-to line) opened from bracket nodes and match rows. Sheet takes a footer slot for admin actions (step 20). 'Recorded by' omitted — get_module_bracket does not return the recorder
- **Files:** src/components/tournaments/{TournamentMatchRow,ModuleMatchesTab,TournamentMatchSheet}.tsx, module page
- **Verified:** tsc ✅ · eslint ✅
- **Next action:** Step 16 tournament manage + entry form editor

### 2026-11-08 — Step 14: Standings table + chart
- **Done:** Standings tab with Table/Chart toggle. Table: pinned # + Entry, scrollable P/W/L/+-/Reached, champion row warning tint, own row selected bg, alive dot, tap opens EntrySheet. Chart: Views-only horizontal bars with round ticks
- **Files:** src/components/tournaments/{StandingsTable,StandingsChart,ModuleStandingsTab}.tsx
- **Verified:** tsc ✅ · eslint ✅ · needs owner: compare against sql-tests bracket
- **Next action:** Step 15 matches tab + match sheet

### 2026-11-08 — Step 13: Bracket view
- **Done:** Bracket tab: absolutely-positioned 196x76 nodes from bracketLayout, SVG connectors, round pills that scroll to column, column headers with Bo-N, draft-bracket banner, own-path accent highlight, TBD/BYE/W/O/live-dot rendering, 3rd-place node under final, empty state. Realtime comes from useTournamentModule. Node tap handler is wired to the match sheet in step 15
- **Files:** src/components/tournaments/{BracketView,BracketMatchNode,BracketConnectors}.tsx, module page
- **Verified:** tsc ✅ · eslint ✅ · needs owner: render 2/5/8/16-entry brackets on device + observe realtime update
- **Next action:** Step 14 standings

### 2026-11-08 — Step 12: Module page shell + Info + Entries
- **Done:** Module page shell (header, champion row, 5 scrollable segmented tabs, default tab Bracket-if-exists else Entries), Info tab, Entries tab with search + EntrySheet (view only; private fields only come from the server for admins/own entry). Bracket/Standings/Matches tabs are stubs until steps 13-15. Generic BottomSheet component added
- **Files:** src/app/tournament/[id]/module/[moduleId].tsx, src/components/tournaments/{BottomSheet,EntrySheet,ModuleEntriesTab,ModuleInfoTab}.tsx, src/hooks/useTournamentFields.ts
- **Verified:** tsc ✅ · eslint ✅ · needs owner: view against seeded data
- **Next action:** Step 13 bracket view

### 2026-11-08 — Step 11: Tournament page
- **Done:** Tournament page: cover, status/date/org/location, Champions strip above Modules, module cards, admin gear + Add module, About with read-more + admins, cancelled banner, empty states
- **Files:** src/app/tournament/[id].tsx, src/components/tournaments/{ChampionsStrip,ModuleCard}.tsx
- **Verified:** tsc ✅ · eslint ✅ · needs owner: view against seeded data
- **Next action:** Step 12 module page shell

### 2026-11-08 — Step 10: Tournaments list
- **Done:** Tournaments tab: Live/Upcoming/Past/Mine segmented scopes, TournamentCard (CommunityCard recipe, status pill, sport pills, role tag), empty/loading/pull-to-refresh. Added tournamentRoutes typed-href helper (generated route types lag new routes)
- **Files:** src/components/tournaments/{StatusPill,TournamentCard}.tsx, src/app/(tabs)/tournaments.tsx, src/lib/tournamentRoutes.ts
- **Verified:** tsc ✅ · eslint ✅ · needs owner: view against seeded data (published tournament + module)
- **Next action:** Step 11 tournament page

### 2026-11-08 — Step 9: Centre tab with bump + route registration
- **Done:** Centre Tournaments tab with raised circular button + SVG bump background (icon only), all tournament stack screens/modals registered with placeholder bodies
- **Files:** src/components/tournaments/{TabBarBumpBackground,TournamentTabBarButton,PlaceholderScreen}.tsx, src/app/(tabs)/_layout.tsx, src/app/(tabs)/tournaments.tsx, src/app/tournament/**, src/app/_layout.tsx
- **Verified:** tsc ✅ · lint no new errors ✅ · needs owner: device check (light/dark, Android 3-button/gesture nav, web, keyboard open, other tabs unaffected)
- **Next action:** Step 10 tournaments list

### 2026-11-08 — Step 8: Bracket layout lib
- **Done:** Pure bracket layout (nodes, connector paths, columns, 3rd-place under final) + devSelfCheck(). Sample output: size2 nodes=1 conn=0 w=196 h=104; size4 nodes=3 conn=2 w=432 h=196; size8 nodes=7 conn=6 w=668 h=380; size16 nodes=15 conn=14 w=904 h=748
- **Files:** src/lib/bracketLayout.ts
- **Verified:** tsc ✅ · eslint ✅ · self-check run via tsx ✅
- **Next action:** Step 9 centre tab

### 2026-11-08 — Step 7: Hooks
- **Done:** useTournaments (scope, 30s SWR cache, focus reload), useTournament, useTournamentModule (detail+entries+bracket+standings, realtime on tournament_matches, 400ms debounce)
- **Files:** src/hooks/useTournaments.ts, useTournament.ts, useTournamentModule.ts
- **Verified:** tsc ✅ · eslint ✅ (realtime untested — needs DB)
- **Next action:** Step 8 bracket layout

### 2026-11-08 — Step 6: Types + service + errors + format
- **Done:** Tournament types (re-exported from types/index), one service fn per RPC, RPC error-code → friendly message map, status/format/validation helpers
- **Files:** src/types/tournaments.ts, src/services/tournaments.ts, src/lib/tournamentErrors.ts, src/lib/tournamentFormat.ts
- **Verified:** tsc ✅ · eslint on new files ✅
- **Next action:** Step 7 hooks

### 2026-11-08 — Steps 4 + 5: Bracket engine (087) and SQL tests / owner guide
- **Done:** 087 with `generate_bracket`, `record_tournament_result`, `record_tournament_walkover`, `reset_tournament_match`, `schedule_tournament_match` and internal `_tournament_seed_order`, `_advance_tournament_match`, `_unadvance_tournament_match`, `_complete_tournament_module`. Tests cover core-field locks, permissions, entry validation/duplicates/PII, RLS write denial, brackets N=2/3/5/8/9/16 (+3rd place on 8 and 5), walkover/reset/edit/tie/downstream-locked, lifecycle guards. Owner guide has copy-paste SQL.
- **Files:** `supabase/migrations/087_add_tournament_bracket_engine.sql`, `docs/tournaments/sql-tests.sql`, `docs/tournaments/owner-sql.md`
- **Verified:** NOT run (no DB access). Needs owner: apply 084→087 in order, run `sql-tests.sql`, paste the result/first FAIL here.
- **Deviations:** see Plan deviations (087 bullets).
- **Next action:** after the owner reports test results (fix any failures), Phase B Step 6 (types + service + errors + format).

### 2026-11-08 — Step 3: Admin write RPCs (086)
- **Done:** 15 write RPCs (rename, entry-field upsert/archive/reorder, module create/update/delete, add/remove module admin, `set_module_status` per §3.2, entry upsert with field validation / delete / withdraw, `set_module_seeds`, `update_tournament_round`) + internal `_tournament_assert_writable`.
- **Files:** `supabase/migrations/086_add_tournament_admin_rpcs.sql`
- **Verified:** not run (cannot apply SQL). Needs owner: apply 084 → 085 → 086 in order and report any error text.
- **Deviations:** see Plan deviations (086 bullets).
- **Next action:** Step 4 (087 bracket engine: generate_bracket, record result/walkover, reset, schedule, `_advance_tournament_match`).

### 2026-11-08 — Step 2: Read RPCs (085)
- **Done:** wrote 8 read RPCs: `get_tournaments`, `get_tournament_detail`, `get_tournament_entry_fields`, `get_module_detail`, `get_module_entries` (PII stripped for non-admins), `get_module_bracket`, `get_module_standings`, `search_profiles_for_tournament`.
- **Files:** `supabase/migrations/085_add_tournament_read_rpcs.sql`
- **Verified:** not run (cannot apply SQL; syntax unchecked by a DB). Needs owner: apply 084 then 085; sample selects will come with the Step 5 test script.
- **Deviations:** see Plan deviations. A1–A6 confirmed by owner this session.
- **Next action:** Step 3 (086 admin write RPCs). Owner should confirm 084 and 085 applied without errors.

### 2026-11-08 — Step 1: Schema (084)
- **Done:** wrote migration 084: 8 tables, helpers `is_tournament_admin/is_module_admin/can_view_tournament/can_view_module`, SELECT-only RLS, core-field seed + lock triggers, updated_at + audit triggers, realtime on `tournament_matches`.
- **Files:** `supabase/migrations/084_add_tournaments.sql`
- **Verified:** SQL not run (cannot apply migrations). `tsc`/`lint` unaffected (no TS changes). Needs owner: apply in the Supabase SQL editor; then check that insert into `tournaments` creates 5 core fields, and that deleting a test tournament cascades cleanly.
- **Deviations:** see Plan deviations. A2, A3, A4, A6 were built in as written but are still **unconfirmed** by the owner.
- **Open questions:** confirm A2/A3/A4/A6 (cheap to change now, before step 2+).
- **Next action:** owner applies 084 and reports result; then Step 2 (085 read RPCs).

<!--
Template — copy for each session, newest on top:

### YYYY-MM-DD — Step N: <name>
- **Done:** …
- **Files:** …
- **Verified:** `npx tsc --noEmit` ✅/❌ · `npm run lint` ✅/❌ · device/DB: … (or "needs owner: …")
- **Deviations:** …
- **Open questions:** …
- **Next action:** …
-->
