# Tournaments — Progress

> Read `AGENTS.md` → `docs/tournaments/PLAN.md` → this file before every session.
> Do **one step** per session. Update this file at the end of the session (PLAN.md §15).

Legend: ⬜ Not started · 🔄 In progress · 🟡 Written – awaiting owner (apply/verify) · ✅ Done · ⛔ Blocked

## Steps

| # | Phase | Step | Status | Date | Files / notes |
|---|---|---|---|---|---|
| 1 | A DB | Schema (084) | 🟡 | 2026-11-08 | `supabase/migrations/084_add_tournaments.sql` written; awaiting owner to apply |
| 2 | A DB | Read RPCs (085) | 🟡 | 2026-11-08 | `supabase/migrations/085_add_tournament_read_rpcs.sql` written (full `get_module_standings` included); awaiting owner apply |
| 3 | A DB | Admin write RPCs (086) | ⬜ | | |
| 4 | A DB | Bracket engine (087) | ⬜ | | |
| 5 | A DB | SQL tests + owner SQL guide | ⬜ | | |
| 6 | B Client | Types + service + errors + format | ⬜ | | |
| 7 | B Client | Hooks (+ realtime) | ⬜ | | |
| 8 | B Client | Bracket layout lib | ⬜ | | |
| 9 | C Nav | Centre tab with bump + route registration | ⬜ | | |
| 10 | D Public | Tournaments list | ⬜ | | |
| 11 | D Public | Tournament page (champions → modules → about) | ⬜ | | |
| 12 | D Public | Module page shell + Info + Entries | ⬜ | | |
| 13 | D Public | Bracket view | ⬜ | | |
| 14 | D Public | Standings table + chart | ⬜ | | |
| 15 | D Public | Matches tab + match sheet (view) | ⬜ | | |
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
- Added a few extra indexes (admins by profile, entries by profile, tournaments by status).

## Session log

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
