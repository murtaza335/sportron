# Tournaments — Progress

> Read `AGENTS.md` → `docs/tournaments/PLAN.md` → this file before every session.
> Do **one step** per session. Update this file at the end of the session (PLAN.md §15).

Legend: ⬜ Not started · 🔄 In progress · 🟡 Written – awaiting owner (apply/verify) · ✅ Done · ⛔ Blocked

## Steps

| # | Phase | Step | Status | Date | Files / notes |
|---|---|---|---|---|---|
| 1 | A DB | Schema (084) | ⬜ | | |
| 2 | A DB | Read RPCs (085) | ⬜ | | |
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

## Open assumptions (PLAN.md §1.3) — confirm before the dependent step

| # | Assumption | Confirmed? |
|---|---|---|
| A1 | Tournament admins assign module admins | ⬜ |
| A2 | Tournament admins have module-admin powers in all their modules | ⬜ |
| A3 | Private: CMS ID, Phone, Email; Public: Name, School; custom fields default private | ⬜ |
| A4 | CMS ID unique within a module | ⬜ |
| A5 | Centre tab is icon-only (no label) | ⬜ |
| A6 | Entries are name-only (no roster) in v1 | ⬜ |

## Plan deviations

_None yet._

## Session log

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
