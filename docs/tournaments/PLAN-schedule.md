# Tournament match schedule — plan

Status: **Phase 1 + Phase 2 implemented** (Phase 1 JS-only/OTA; Phase 2 adds additive migration 132 — apply it, the client hides the section until then). Needs on-device check (§7). Owner decisions taken: new RPC (B), default-to-Today, "My matches" toggle added.

## 1. Problem

Admins can already give every tournament match an optional date/time, venue and court
(`schedule_tournament_match`, migration 087; `ScheduleSheet`). The time is shown on the bracket
node, the match row and the match sheet, and linked players get a `tournament_match_scheduled`
push.

What is missing is a way to **read the schedule**:

- The Matches tab (`ModuleMatchesTab`) groups by round/group and sorts by `match_number`, never by time.
- There is no "what is on today" view — a player at the venue has to scan every round.
- There is no cross-module view on the tournament screen ("today at this tournament").

## 2. Goals

1. **Today** view in a module: every match scheduled for the viewer's local today, in time order,
   including ones already played today (with their result).
2. **Schedule** view in a module: all scheduled matches grouped by day ("Today", "Tomorrow",
   "Sat 21 Nov"), time-ordered within a day, plus a "Not scheduled yet" bucket.
3. *(Phase 2)* **Today across the tournament**: a "Today's matches" section on the tournament
   screen covering all modules.

Non-goals: automatic scheduling / order-of-play generation, court allocation, bulk scheduling,
calendar export. (Bulk scheduling is a natural follow-up — §9.)

## 3. Phase 1 — module Schedule & Today (client only, OTA-able)

No migration, no RPC change, no edge function. `get_module_matches` already returns
`scheduled_at`, `venue`, `court`, `status`, scores and entries; `useTournamentModule` already
keeps `m.matches` live via realtime, so the new views update on their own when an admin schedules
or records a match.

### 3.1 Date helpers — `src/lib/tournamentFormat.ts`

Pure functions (easy to unit-check by hand / in a scratch script):

| Helper | Returns |
|---|---|
| `localDayKey(iso)` | `'2026-11-17'` in **device local time**, `null` for null/invalid |
| `isTodayLocal(iso, now = new Date())` | boolean — replaces the private `isToday` in `BracketMatchNode.tsx` (move it here, import it there) |
| `dayHeader(dayKey, now)` | `'Today · Tue 17 Nov'`, `'Tomorrow · Wed 18 Nov'`, `'Yesterday · Mon 16 Nov'`, else `'Sat 21 Nov'` (adds year only if not the current year) |
| `formatClock(iso)` | `'5:00 PM'` — the row shows only the time when the section header already gives the day |
| `matchContextLabel(m)` | `'Group A · Round 2'` / `'Quarter-final'` / `'W-R1 · M3'` — reuses `matchSectionTitle` + `code` so a day-grouped row still says which stage it is |

### 3.2 Matches tab filters — `src/components/tournaments/ModuleMatchesTab.tsx`

Chips become: **All · Today · Schedule · Upcoming · Results** (the chip row moves into the existing
`HScrollView` so it never overflows at 360 px).

- **Today**: `scheduled_at` on local today, any status except `bye`/`cancelled`. Sorted by
  `scheduled_at`, then `court`, then `match_number`. Played matches keep their score and winner
  (the existing row handles that). One flat list — no round sections.
  - Empty state: "No matches scheduled today". If a future scheduled day exists, show
    "Next: Sat 21 Nov · 4 matches" with a button that switches to **Schedule**.
- **Schedule**: sections per `localDayKey`, ascending by day; inside a day the same sort as Today.
  - Days **before today** are folded behind one "Show earlier days (N matches)" row (using the
    existing `Collapsible`) so the list opens on today/upcoming.
  - Final section **"Not scheduled yet"**: matches that are not decided, have no `scheduled_at`,
    and are not `bye`/`cancelled`, in their usual round/`match_number` order. Hidden when empty.
- The **group filter** keeps applying to all chips (groups + knockout).
- **All / Upcoming / Results** are unchanged.

**Default chip**: stays **All**, except when the module is `in_progress` and has at least one match
today; then it opens on **Today**. A tap on any chip is kept for the session (local state, as now).

### 3.3 Match row — `src/components/tournaments/TournamentMatchRow.tsx`

Add an optional `mode?: 'round' | 'time'` prop (default `'round'` = today's behaviour, so the
bracket/other callers don't change). In `'time'` mode:

- Right column: `formatClock(scheduled_at)` + court (`5:00 PM · T2`) for undecided matches; the
  status/score for decided ones as today.
- A small muted line above the two sides with `matchContextLabel(m)` (and the venue when the
  module has matches at more than one venue).
- A matches-today row whose time has already passed but has no result stays plain (no "late"
  badge in v1).

### 3.4 "Today" changes at midnight

`now` is captured in state and refreshed on `AppState` → `active` and on screen focus
(`useFocusEffect`), so a screen left open overnight (or a backgrounded app) shows the new day when
it comes back. No timers.

### 3.5 Timezone note

Grouping uses the **device's local time**, matching what `formatMatchTime` already shows. The
`tournament_match_scheduled` push text is rendered server-side in `Asia/Karachi`. For the current
user base (Pakistan) these agree; a traveller would see the push in PKT and the app in local time.
This is acceptable for v1 and documented here rather than changed.

### 3.6 Deep link

Support `?tab=matches&view=today|schedule` on the module route (read with the existing
`useLocalSearchParams`, same pattern as `?tab=`). Lets the Phase 2 section and a future push
open straight on Today. No new route → no `vercel.json` / `HeaderBack` change.

## 4. Phase 2 — "Today's matches" on the tournament screen

A section on `tournament/[id].tsx` above the module cards, shown only when the tournament has
matches today: up to 5 rows (time · module · players · court), "See all" opens a
full list grouped by module, each row tapping through to the module's match sheet via
`?tab=matches&view=today`.

Two ways to get the data:

| Option | How | Pros | Cons |
|---|---|---|---|
| **A. Client fan-out** | call existing `fetchModuleMatches` for each visible module in parallel, filter to today | no migration, ships OTA | N requests (N = modules, usually 1–6); no realtime unless we subscribe per module |
| **B. New RPC** `get_tournament_schedule(p_tournament uuid, p_from timestamptz, p_to timestamptz)` — migration **132** | one call, server filters by time window and `can_view_module` | one request, scales, reusable for a future tournament-wide Schedule | needs migration + SQL tests; old builds unaffected (additive) |

**Recommendation: B.** It follows the "reads go through RPCs" convention and is small. Rules for
the migration:

- `SECURITY DEFINER`, starts with the `auth.uid()` guard, `RETURNS TABLE (...)` with explicit
  columns (module id/name/sport, match id, round/group/code, entries as the same jsonb shape
  `get_module_matches` uses, scores, status, `scheduled_at`, venue, court).
- Only modules the caller can see (`can_view_module`), only rows with `scheduled_at` in
  `[p_from, p_to)`, cap the window at 7 days.
- `revoke all … from public, anon; grant execute … to authenticated`.
- Tests appended to `docs/tournaments/sql-tests-v2.sql` (visibility of a draft module, window
  bounds, non-admin sees same rows as `get_module_matches`), run via `local-db/run.sh`.
- Client passes local-midnight → next local-midnight as the window (so "today" is still the
  device's day).

## 5. Files

Phase 1
- `src/lib/tournamentFormat.ts` — helpers (§3.1)
- `src/components/tournaments/ModuleMatchesTab.tsx` — chips, Today/Schedule sections, empty states
- `src/components/tournaments/TournamentMatchRow.tsx` — `mode="time"`
- `src/components/tournaments/BracketMatchNode.tsx` — import shared `isTodayLocal`
- `src/app/tournament/[id]/module/[moduleId].tsx` — pass module status, `view` param

Phase 2
- `supabase/migrations/132_add_tournament_schedule_rpc.sql`, `docs/tournaments/sql-tests-v2.sql`
- `src/services/tournaments.ts` (`fetchTournamentSchedule`), `src/types/tournaments.ts`
- `src/hooks/useTournamentSchedule.ts`, a `TodayMatchesSection` component, `src/app/tournament/[id].tsx`
- `AGENTS.md` (next migration → 133, section 10), `docs/tournaments/PROGRESS.md`

## 6. Steps

1. Helpers + move `isToday` (no UI change yet). `npx tsc --noEmit`.
2. `TournamentMatchRow` `mode="time"`.
3. `ModuleMatchesTab` Today + Schedule chips, sorting, sections, empty states, earlier-days fold.
4. Default-to-Today rule, midnight refresh, `?view=` param.
5. Manual test (§7) on Android + web; `npm run lint`.
6. *(Phase 2)* migration 132 + SQL tests → service/hook → tournament screen section → docs.

## 7. Test cases (manual)

- Module with no scheduled matches: Today shows empty state without "Next:", Schedule shows only
  "Not scheduled yet".
- Matches today at 10:00 and 09:00 on courts T2/T1 → listed 09:00 then 10:00; same time → by court.
- A match played today still appears under Today with its score.
- Byes and cancelled matches never appear in Today/Schedule.
- Groups + knockout: group filter "Group B" + Today shows only group B matches today.
- Past day matches folded; expand shows them, oldest first.
- Admin reschedules a match from tomorrow to today with the tab open → it moves into Today live
  (realtime).
- Leave the app on Today across midnight, reopen → "Today" is the new day.
- Web build at 360 px: chip row scrolls, no horizontal page scroll; dark mode.
- Reduced motion: no new animations beyond the existing tab fade.

## 8. Decisions for the owner

1. Default chip: open on **Today** automatically when there are matches today (proposed), or always **All**?
2. Phase 2 data source: **new RPC (recommended)** or client fan-out?
3. Should Today/Schedule also offer a **"My matches"** toggle (only matches the viewer is in)?
   Cheap to add — `TournamentMatchRow` already knows `viewerId`.

## 9. Follow-ups (not in this plan)

- Bulk scheduling (pick several matches → same day, staggered times / courts).
- Push reminder N minutes before a scheduled match (needs a cron + notification type → migration).
- Manual draw edits / swap two entries after generation (separate plan).
