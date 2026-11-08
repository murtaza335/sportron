# Tournaments — Progress

> Read `AGENTS.md` → `docs/tournaments/PLAN.md` → this file before every session.
> Do **one step** per session. Update this file at the end of the session (PLAN.md §15).

Legend: ⬜ Not started · 🔄 In progress · 🟡 Written – awaiting owner (apply/verify) · ✅ Done · ⛔ Blocked

## Steps

| # | Phase | Step | Status | Date | Files / notes |
|---|---|---|---|---|---|
| 1 | A DB | Schema (084) | ✅ | 2026-11-08 | `supabase/migrations/084_add_tournaments.sql` written; awaiting owner to apply |
| 2 | A DB | Read RPCs (085) | ✅ | 2026-11-08 | `supabase/migrations/085_add_tournament_read_rpcs.sql` written (full `get_module_standings` included); awaiting owner apply |
| 3 | A DB | Admin write RPCs (086) | ✅ | 2026-11-08 | `supabase/migrations/086_add_tournament_admin_rpcs.sql` written; awaiting owner apply |
| 4 | A DB | Bracket engine (087) | ✅ | 2026-11-08 | `supabase/migrations/087_add_tournament_bracket_engine.sql` written; awaiting owner apply |
| 5 | A DB | SQL tests + owner SQL guide | ✅ | 2026-11-08 | `docs/tournaments/sql-tests.sql`, `docs/tournaments/owner-sql.md` written; owner must run tests |
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
| 16 | E Admin | Tournament manage + entry form editor | 🟡 | 2026-11-08 | Tournament manage (inline rename, entry-form link, module list + add, read-only admins) and entry-form editor (locked core rows editable for label/placeholder only, custom fields add/edit/archive with confirm, ↑/↓ reorder, field editor sheet with type pills, select options, required/public switches). Shared form primitives (FormField, TextField, PillSelect, SwitchRow, ModalHeader) |
| 17 | E Admin | Module create/edit | 🟡 | 2026-11-08 | Module create/edit modal (name, sport pills locked once bracket exists, venue, start date/time, max entries, description, rules, 3rd-place switch, seeding pills). DateTimeField: native date→time pickers, web datetime-local input (datetimepicker has no web support). After create → module manage |
| 18 | E Admin | Module manage + module admins + entry form | 🟡 | 2026-11-08 | Module manage (status machine buttons incl. reopen entries, checklist, links, module admins add/remove for tournament admins, danger zone with confirm), entry form modal rendered from entry fields (client validation mirrors server, inline field errors, duplicate CMS ID shown under CMS ID, link app user, Save & add another), EntrySheet admin actions (Edit / Withdraw / Delete with confirms; withdraw in progress prompts to record a walkover). Module page accepts ?tab= |
| 19 | E Admin | Seeding + rounds + generate/start | 🟡 | 2026-11-08 | Seeding screen (entries → N-slot bracket, byes info, ↑/↓ reorder, shuffle unseeded, Save seeds, Generate/Regenerate with confirm, auto-saves unsaved order before generating, Preview) and Rounds screen (expandable rows: name, best-of pills, start, notes, save per row; empty copy before bracket exists) |
| 20 | E Admin | Results (played / walkover / reset / schedule) | 🟡 | 2026-11-08 | Admin match actions in the match sheet: Enter/Edit result (Played: per-game rows for racket sports with games-won auto-count + detail; single score row for team sports; winner pick only when level; Walkover mode with winner pick + default note), Schedule sheet (date/time, venue, court), Reset with confirm. Server errors mapped (TIE_NEEDS_WINNER, DOWNSTREAM_PLAYED…) |
| 21 | F Notifs | Notification triggers (088) | 🟡 | 2026-11-08 | Constraint widened with the 6 tournament types (082 list copied); triggers: tournament_admins insert, module_admins insert, entry added (insert / profile_id set), match scheduled + result (linked profiles of both entries), module completed (entrants + module admins). All except admin-assigned only fire while the tournament is published; deduped with _notification_already_exists. No edge-function change (trg_fcm_push → send-notification handles delivery) |
| 22 | F Notifs | Client wiring (types, prefs, routing) | 🟡 | 2026-11-08 | 6 tournament types added to NotificationType (+ fcm NotificationType/NotificationData incl. tournamentId/moduleId); tournament_updates pref (optional key, default true); push tap (useFCM) routes to module or tournament; Activity cards show a trophy icon and route on tap; all tournament_* land in Past Activity (not actionable) |
| 23 | G Finish | Polish + AGENTS.md + privacy draft | 🟡 | 2026-11-08 | AGENTS.md updated (structure, feature section 10, data model, routing, notification count 43, next migration 089, history, remaining work); privacy-policy draft text written to docs/tournaments/privacy-draft.md (NOT applied to PRIVACY_POLICY.md); tournaments list got a load-error state; deviations recorded; accessibility labels on interactive controls |
| 24 | G Finish | (optional) Tournament requests | ⬜ | | Only if owner confirms |

## v2 — Rosters & formats (see `PLAN-v2.md` §13)

| # | Phase | Step | Status | Date | Files / notes |
|---|---|---|---|---|---|
| 25 | H Rosters | Roster schema (090) | 🟡 | 2026-11-08 | 090_add_tournament_rosters.sql: module roster cols, tournament_entry_members (+RLS select-only, indexes, updated_at/audit triggers), helpers _entry_profile_ids/is_entry_participant/is_module_participant. Owner decisions recorded (see Decisions). Needs owner: apply 090, run sql-tests.sql (Ask owner B1–B8 + PLAN-v2 Ground Rule 3 question first) |
| 26 | H Rosters | Roster RPCs + reads (091) | 🟡 | 2026-11-08 | 091_add_tournament_roster_rpcs.sql (_validate_entry_field_values, update_tournament_module_settings [roster keys], upsert_team_entry, team guard in upsert_tournament_entry, set_module_status roster check, get_module_entries drop+create, get_module_bracket profile_ids, get_module_detail, entrant role patch) + docs/tournaments/sql-tests-v2.sql. Needs owner: apply 091, run sql-tests.sql then sql-tests-v2.sql |
| 27 | H Rosters | Roster notifications (092) | 🟡 | 2026-11-08 | 092_update_tournament_notifications_for_rosters.sql: trg_tournament_member_added, match events + module completed notify entry+member profiles; tests section R3. Needs owner: apply 092, run tests |
| 28 | H Rosters | Client foundation (rosters) | 🟡 | 2026-11-08 | types (ParticipantType/TournamentFormat/BracketSide, members, profile_ids, TeamMemberInput, ModuleSettingsPatch), services upsertTeamEntry/updateModuleSettings + members mapping, tournamentErrors @i parsing + roster codes, tournamentFormat roster helpers. tsc ✅ |
| 29 | H Rosters | Module form: players section | 🟡 | 2026-11-08 | module-form: PLAYERS section (Singles/Doubles/Teams, roster steppers, sport defaults, lock rules), NumberStepper in form.tsx, save via updateModuleSettings (stays in edit mode if 2nd call fails). tsc ✅ lint ✅. Needs owner: device check |
| 30 | H Rosters | Team entry form + roster display | 🟡 | 2026-11-08 | TeamEntryForm + MemberSheet (doubles uses 2 fixed rows opening the sheet, not inline-expanding cards), entry-form team variant, Entries tab team rows/warning/search by member, EntrySheet roster, own-path highlight via profile_ids/ownEntryIds. tsc ✅ lint ✅. Needs owner: device check (12-player football team, stranger account) |
| 31 | H Rosters | Manage checklist + end-to-end | ⬜ | | |
| 32 | I League | Formats schema (093) | ⬜ | | |
| 33 | I League | Engine refactor + round-robin + draws (094) | ⬜ | | Run v1 sql-tests on the refactor before adding RR code |
| 34 | I League | Client: formats foundation + league table | ⬜ | | |
| 35 | I League | Module form: format section | ⬜ | | |
| 36 | I League | RR matches + results + seeding copy | ⬜ | | |
| 37 | J Groups | Group stage engine (095) | ⬜ | | |
| 38 | J Groups | Knockout stage engine (096) | ⬜ | | |
| 39 | J Groups | Double-elim engine (097) | ⬜ | | |
| 40 | J Groups | Client: groups tab + seeding groups mode | ⬜ | | |
| 41 | J Groups | Client: knockout builder | ⬜ | | |
| 42 | K DE | Bracket layout generalisation | ⬜ | | v1 layout output must stay identical |
| 43 | K DE | DE bracket UI + standings | ⬜ | | |
| 44 | K Finish | Polish & docs | ⬜ | | |

v2 open assumptions (PLAN-v2 §1.3): B1–B17. Record answers in Decisions below before the dependent step.

## Decisions (owner)

| Date | Decision |
|---|---|
| 2026-11-08 | v2 Ground Rule 3: tournaments never released → v1 tournament RPCs may be drop+recreated |
| 2026-11-08 | v2 assumptions B1–B17 use the PLAN-v2 §1.3 recommended defaults |
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
- Client: score entry uses a compact `MiniStepper` (−/value/+ with numeric input) instead of the hero `ScoreCounter` (144px tall, unusable for per-game rows); same icons/tokens.
- Client: tournament hrefs go through `src/lib/tournamentRoutes.ts` (casts) because expo-router's generated route types don't know the new routes until the dev server regenerates them.
- Client: matches tab uses plain grouped Views instead of `SectionList` (nested in the module ScrollView), which avoids nested-virtualization warnings; ≤127 matches per module.
- Client: 'Shuffle unseeded' only appears while some entries have no saved seed; 'Recorded by' is not shown in the match sheet (bracket RPC doesn't return the recorder).
- Added a few extra indexes (admins by profile, entries by profile, tournaments by status).

## Session log

### 2026-11-08 — Phase A verified by owner
- **Result:** owner ran migrations 084–087 and `sql-tests.sql` (single self-rolling-back DO block) → `ALL TESTS PASSED — rolled back, nothing saved`. Steps 1–5 are ✅.
- **Not covered by the tests:** 088 notification triggers (step 21), realtime, and all client screens (steps 9–23 still need device checks).
- **Next action:** owner applies 088, then does the on-device checks listed per step.

### 2026-11-08 — Step 23: Polish + AGENTS.md + privacy draft
- **Done:** AGENTS.md updated (structure, feature section 10, data model, routing, notification count 43, next migration 089, history, remaining work); privacy-policy draft text written to docs/tournaments/privacy-draft.md (NOT applied to PRIVACY_POLICY.md); tournaments list got a load-error state; deviations recorded; accessibility labels on interactive controls
- **Files:** AGENTS.md, docs/tournaments/privacy-draft.md, src/app/(tabs)/tournaments.tsx (error state)
- **Verified:** tsc ✅ · npm run lint: 21 problems both before and after my changes (all pre-existing, none in tournament files) · dark mode/web/device audit needs owner
- **Next action:** Owner sign-off; step 24 optional (not started: needs owner confirmation)

### 2026-11-08 — Step 22: Client wiring
- **Done:** 6 tournament types added to NotificationType (+ fcm NotificationType/NotificationData incl. tournamentId/moduleId); tournament_updates pref (optional key, default true); push tap (useFCM) routes to module or tournament; Activity cards show a trophy icon and route on tap; all tournament_* land in Past Activity (not actionable)
- **Files:** src/types/index.ts, src/services/fcm.ts, src/hooks/useFCM.ts, src/components/ActivityCard.tsx
- **Verified:** tsc ✅ · eslint ✅ · needs owner: device push tap test after applying 088
- **Next action:** Step 23 polish + docs

### 2026-11-08 — Step 21: Notification triggers (088)
- **Done:** Constraint widened with the 6 tournament types (082 list copied); triggers: tournament_admins insert, module_admins insert, entry added (insert / profile_id set), match scheduled + result (linked profiles of both entries), module completed (entrants + module admins). All except admin-assigned only fire while the tournament is published; deduped with _notification_already_exists. No edge-function change (trg_fcm_push → send-notification handles delivery)
- **Files:** supabase/migrations/088_add_tournament_notifications.sql
- **Verified:** SQL not run — needs owner: apply 088, then create test rows and check in_app_notifications
- **Next action:** Step 22 client wiring

### 2026-11-08 — Step 20: Results
- **Done:** Admin match actions in the match sheet: Enter/Edit result (Played: per-game rows for racket sports with games-won auto-count + detail; single score row for team sports; winner pick only when level; Walkover mode with winner pick + default note), Schedule sheet (date/time, venue, court), Reset with confirm. Server errors mapped (TIE_NEEDS_WINNER, DOWNSTREAM_PLAYED…)
- **Files:** src/components/tournaments/{ResultEntrySheet,ScheduleSheet}.tsx, module page (match sheet footer actions)
- **Verified:** tsc ✅ · eslint ✅ · needs owner: full module run end-to-end on device (module auto-completes, champion shows on tournament page)
- **Next action:** Step 21 notification triggers (088)

### 2026-11-08 — Step 19: Seeding + rounds + generate/start
- **Done:** Seeding screen (entries → N-slot bracket, byes info, ↑/↓ reorder, shuffle unseeded, Save seeds, Generate/Regenerate with confirm, auto-saves unsaved order before generating, Preview) and Rounds screen (expandable rows: name, best-of pills, start, notes, save per row; empty copy before bracket exists)
- **Files:** src/app/tournament/[id]/module/[moduleId]/{seeding,rounds}.tsx
- **Verified:** tsc ✅ · eslint ✅ · needs owner: generate + start from the app (needs migrations applied)
- **Next action:** Step 20 results

### 2026-11-08 — Step 18: Module manage + module admins + entry form
- **Done:** Module manage (status machine buttons incl. reopen entries, checklist, links, module admins add/remove for tournament admins, danger zone with confirm), entry form modal rendered from entry fields (client validation mirrors server, inline field errors, duplicate CMS ID shown under CMS ID, link app user, Save & add another), EntrySheet admin actions (Edit / Withdraw / Delete with confirms; withdraw in progress prompts to record a walkover). Module page accepts ?tab=
- **Files:** src/app/tournament/[id]/module/[moduleId]/{manage,entry-form}.tsx, src/components/tournaments/{ProfilePickerSheet,EntryFieldControl}.tsx, module page
- **Verified:** tsc ✅ · eslint ✅ · needs owner: duplicate CMS ID friendly copy on device
- **Next action:** Step 19 seeding + rounds + generate/start

### 2026-11-08 — Step 17: Module create/edit
- **Done:** Module create/edit modal (name, sport pills locked once bracket exists, venue, start date/time, max entries, description, rules, 3rd-place switch, seeding pills). DateTimeField: native date→time pickers, web datetime-local input (datetimepicker has no web support). After create → module manage
- **Files:** src/app/tournament/[id]/module-form.tsx, src/components/tournaments/DateTimeField.tsx
- **Verified:** tsc ✅ · eslint ✅ · needs owner: device check of date pickers
- **Next action:** Step 18 module manage + entry form

### 2026-11-08 — Step 16: Tournament manage + entry form editor
- **Done:** Tournament manage (inline rename, entry-form link, module list + add, read-only admins) and entry-form editor (locked core rows editable for label/placeholder only, custom fields add/edit/archive with confirm, ↑/↓ reorder, field editor sheet with type pills, select options, required/public switches). Shared form primitives (FormField, TextField, PillSelect, SwitchRow, ModalHeader)
- **Files:** src/app/tournament/[id]/{manage,fields}.tsx, src/components/tournaments/{form,EntryFieldEditorSheet}.tsx
- **Verified:** tsc ✅ · eslint ✅ · needs owner: core fields locked server-side (sql-tests) + on device
- **Next action:** Step 17 module create/edit

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
