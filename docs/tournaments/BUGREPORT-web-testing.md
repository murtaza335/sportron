# Tournament web testing — bug report

Running log of problems found while testing the tournament features on the
test site (https://sportron-test.vercel.app/). Add new findings at the bottom
of each section; change **Status** as they get fixed.

- First test pass: 2026-11-10, browser (web build), signed in as the tournament admin
- Test tournament: "Seecs Sports Gala 2026" (5 modules)
- Statuses: `open` · `fixed` · `wontfix` · `needs-confirm`

## Summary

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| TB-01 | High | Direct/reloaded tournament URLs return Vercel 404 | open (reproduced 2nd pass) |
| TB-02 | Medium | Web validation errors use blocking `window.alert` | open |
| TB-03 | Low | Result form layout jumps after entering a score | open |
| TB-04 | Low | Schedule sheet silently drops an incomplete/invalid date | open |
| TB-05 | Low | Tournament stays "Upcoming" while its modules are Live/Completed | fixed/by design (see below) |
| TB-10 | Low | League manage screen says "Completes automatically after the final" | open |
| TB-11 | Low | Team form title "Add Team" vs "Add pair" wording | open |
| TB-12 | Medium | Groups+knockout form accepts a setup the server rejects (4 entries, 2 groups, top 2) | open |
| TB-13 | Low | Result sheet: first typed score shifts layout; and sheet needs ~2s before inputs accept typing | open |
| TB-06 | Medium | "Generate bracket/fixtures" uses a native `confirm` that freezes the page | open |
| TB-07 | Low | "Save & add another" keeps the form's scroll position | open |
| TB-08 | Low | League seeding screen still titled "Seeding & bracket" | open |
| TB-09 | Low | No Edit/Reset on matches once the module is Completed | needs-confirm |

---

## TB-01 — Direct/reloaded tournament URLs return Vercel 404
- **Severity:** High (breaks reload, shared links, and web push-tap deep links)
- **Status:** needs-confirm
- **Steps to reproduce**
  1. Open the app and navigate to any tournament, then a module (works).
  2. Copy that URL, or reload the page, or open it in a new tab:
     `/tournament/<id>` or `/tournament/<id>/module/<id>`.
- **Expected:** the app loads the tournament / module screen.
- **Actual:** Vercel page "404: NOT_FOUND — This page doesn't exist".
- **Notes**
  - `/tournaments` (list) loads fine when opened directly; only dynamic detail routes fail.
  - `vercel.json` in the repo has a catch-all rewrite (`/:path*` → `/index.html`), so the
    repo config looks correct. Suspected cause: the test deploy was made without
    `cp vercel.json dist/` (see `web-deploy-commands.txt`), or a different Vercel project
    config. Not verified. Check whether production behaves the same.
  - Check other dynamic routes too (`/community/<id>`, `/profile/<id>`).
  - 2nd pass: reproduced on a direct load of a module URL; `/community/<id>` also 404s, while
    static `/discover` and `/tournaments` load. So it affects all dynamic routes, not just tournaments.
- **Suggested fix:** redeploy using the documented steps and confirm
  `dist/vercel.json` is present; re-test a hard reload on a tournament module URL.

## TB-02 — Web validation errors use blocking `window.alert`
- **Severity:** Medium (bad web UX; also freezes browser automation until dismissed)
- **Status:** open
- **Steps to reproduce**
  1. Tournament → module (Live) → tap a match → Enter result.
  2. Leave scores at 0–0 and tap *Save result*.
- **Expected:** a non-blocking inline message or toast ("Add at least one game score").
- **Actual:** a native browser alert ("Enter a score — Add at least one game score.") that blocks
  the page until dismissed. Same for "Pick the winner — Choose who advances." (walkover
  with no winner) and the reset confirmation.
- **Where:** `src/lib/alert.ts` — on web it calls `window.alert` / `window.confirm`.
- **Suggested fix:** on web, render validation messages with the in-app `toast()` or an inline
  error; keep confirmations (destructive reset) as an in-page sheet rather than `window.confirm`.

## TB-03 — Result form layout jumps after entering a score
- **Severity:** Low
- **Status:** open
- **Steps to reproduce**
  1. Enter result on a match; tied 0–0 shows a "Winner (scores are level)" row.
  2. Type a score in the first player's box.
- **Expected:** the second score box stays where it is.
- **Actual:** the winner row disappears, the form shifts up, and the next tap on the second
  score box can miss.
- **Suggested fix:** reserve the winner row's height, or animate it, so fields don't move.

## TB-04 — Schedule sheet silently drops an incomplete/invalid date
- **Severity:** Low
- **Status:** open
- **Steps to reproduce**
  1. Live module → tap an upcoming match → Schedule.
  2. Enter a malformed or incomplete date/time (e.g. date without a time), plus a venue and court.
  3. Tap *Save schedule*.
- **Expected:** an error asking for a complete date/time, or the date is kept.
- **Actual:** the sheet closes with no message; venue and court are saved but the match shows
  no date ("Upcoming · Old gym · Court 2"). The admin is not told the date was ignored.
- **Suggested fix:** validate the date field before saving and show an inline message; on web,
  note the native date input's segment-by-segment typing makes partial entries easy.

## TB-05 — Tournament stays "Upcoming" while modules are Live/Completed
- **Severity:** Low
- **Status:** fixed/by design — 3rd pass: after QA League was started the tournament moved to
  LIVE and appeared in the Live tab (Upcoming became empty). Earlier "Upcoming" was likely stale
  until a module went Live. Re-check once if a tournament should go Live from dates alone.
- **Observed:** "Seecs Sports Gala 2026" is labelled UPCOMING (12–20 Nov) while modules are
  Live/Completed and champions are shown. The Live tab in the Tournaments list was empty because
  of this. Confirm whether the status/label should follow dates or module activity.

## TB-06 — Generate bracket/fixtures uses a native `confirm`
- **Severity:** Medium (same root cause as TB-02; hard-freezes the tab)
- **Status:** open
- **Steps:** Module in Seeding → Seeding screen → *Generate bracket* (knockout) or *Generate fixtures* (league).
- **Actual:** a native browser confirm opens. While it is open the page cannot be scripted or
  screenshotted; in the 2nd pass the league confirm could not be dismissed by automation at all.
- **Fix:** same as TB-02 — use an in-app sheet/confirm on web instead of `window.confirm`
  (`src/lib/alert.ts`). Likely also affects Delete entry, Reset result, Cancel/Delete module.

## TB-07 — "Save & add another" keeps the form's scroll position
- **Severity:** Low
- **Status:** open
- **Steps:** Add entry → fill all fields → scroll down → *Save & add another*.
- **Actual:** the form clears but stays scrolled down, so the first field (Name) is off-screen
  and the user lands mid-form. **Expected:** reset scroll to top and focus Name.

## TB-08 — League seeding screen title
- **Severity:** Low (copy). **Status:** open
- The league module's seeding screen header reads "Seeding & bracket" although the button and
  manage screen say "Seeding & fixtures" / "Generate fixtures".

## TB-09 — No Edit/Reset on matches once the module is Completed
- **Severity:** Low. **Status:** needs-confirm (may be by design)
- On a Completed module neither the final nor a semi-final offers Edit result / Reset, so a wrongly
  entered result cannot be corrected. Confirm whether admins are meant to be able to reopen.

## TB-10 — League manage screen copy
- Low, open. Live league shows "Completes automatically after the final" — leagues have no final
  (should say e.g. "after the last match").

## TB-11 — Team form wording
- Low, open. Doubles module list says "pairs / Add pair" but the form is titled "Add Team" and
  the button "Save team". Pick one term ("pair") for doubles.
- Also: a module named "Table Tennis Doubles (Males)" is configured as Singles — test data
  mismatch, not an app bug.

## TB-12 — Groups + knockout: form/server validation mismatch
- **Severity:** Medium
- **Status:** open
- **Steps:** New module → Groups + knockout, Groups 2, Advance per group 2, add 4 entries,
  publish, tap *Close entries & start seeding*.
- **Form says:** "4 entries → 2 groups of 2 · top 2 → 4-slot knockout" (and "needs at least 4 entries").
- **Actual:** a native alert "advance per group looks invalid" (blocking, see TB-06) and the module
  stays Open. With 8 entries (2 groups of 4, top 2) the same step works.
- **Fix:** validate on the form (advance per group must be smaller than the smallest group size,
  or whatever the real rule is) and show the message inline; surface the same rule in the hint text.
  Also: the failed transition is silent unless the alert is read, so use in-app error text.

## TB-13 — Result sheet quirks
- Low. Typing the first score removes the "Winner (scores are level)" row, so the form shifts up
  (TB-03). Also, inputs typed in the first ~1 s after the sheet opens are dropped (scores stayed 0–0,
  Save then showed the native "enter a score" alert).

---

## Verified working (no bug)
- 4th pass: **Double elimination** full run (4 entries): winners bracket, losers bracket, Grand Final
  and Grand Final — Reset sections render; losers drop into the right slots (W1 losers → L1-1, WB
  final loser → LB final); GF won by the losers-bracket team populated the reset match (GF2);
  GF2 result completed the module, champion shown; tabs Winners / Losers / Final work
- 4th pass: Groups+knockout config form (legs, points, groups, advance per group, live hint);
  with 8 entries the seeding screen shows "2 groups of 4 · 12 group matches"
- 3rd pass: League — Squash/League module creation; 4 entries; seeds shuffle; fixtures = 3 matchdays /
  6 matches (circle method, correct pairings); Start league; Table tab updates after result
  (P/W/L, game diff, Pts 3-0, form dots); Matches tab grouped by matchday with All/Upcoming/Results
- 3rd pass: Tournament status auto-moves to LIVE when a module goes Live
- 3rd pass: Doubles module — Create (Doubles + 3rd-place toggle), "pairs" wording, team form with
  per-player sheet (5 core fields, link-user), pair name auto-filled "A1 / A2", duplicate CMS ID
  inside the same team reported inline on the right player, roster detail sheet (roster 2/2, private
  fields locked)
- 2nd pass: Add entry (all 5 core fields), duplicate CMS ID blocked with an inline error,
  edit entry (rename saved), Entry detail sheet shows private fields to admin
- 2nd pass: module lifecycle Draft → Open (Publish) → Seeding → Live → Completed; Seeding locked
  in Draft with a hint; manual reorder + Save seeds; Shuffle unseeded; bracket 1v4 / 2v3
- 2nd pass: Rounds & schedule saves Best-of-3 and notes (toast "Saved"); Bo3 flows into the
  match sheet ("Semi-finals · Bo3"), score entry per game, 2–0 winner advances
- 2nd pass: Edit module details (venue saved, shown on module page); sport/format/players hints
- 2nd pass: Create module (League / Squash) lands on its manage screen; league seeding shows
  "3 matchdays · 6 matches"
- 2nd pass: Seeding UI hides Edit/Reset when the next match is already played (guard visible in UI)
- 2nd pass: tournament notifications in Activity; tapping routes to the module
- Tournaments list tabs (Live / Upcoming / Past / Mine), tournament detail, module list, champions strip
- Draft bracket with BYE and 3rd-place match (7 entries)
- Start tournament (Seeding → Live)
- Enter played result: winner advances, bracket updates without refresh
- Validation messages: no score, walkover without winner
- Walkover (W/O label, winner advances)
- Reset result (winner removed from next match)
- Matches / Standings / Entries tabs agree with the bracket
- Schedule: venue and court saved and shown on the match sheet
- Full 7-entry knockout played to the end (QF → SF → Final + 3rd place): losers drop correctly
  into the 3rd-place match, module auto-completes with "Champion: hsjwkwk"
- Final standings correct (1 hsjwkwk, 2 mzcache, 3 jojo, 4 muzu, T-5 for the three QF losers);
  standings Chart view and Info tab render
- Tournament page champions strip updates with the new module's top 3
- Browser tab title shows an unread count "(1)" after the module finished
- Activity inbox (2nd pass): Past Activity lists tournament notifications ("hsjwkwk won badminton
  singles (Male) — Seecs Sports Gala 2026", "You can now manage …") with an unread dot; tapping the
  champion notification opens the correct module screen
- Manage tournament screen loads (cover, name, description, organization, location, dates,
  status Draft/Published/Completed/Cancelled, entry form, module list, admins)

## Not yet tested (browser extension disconnected mid-run)
- Edit result on a *live* module's finished match (Completed modules show no Edit — TB-09)
- Entry-form field editor (custom fields); delete entry (native confirm, see TB-06)
- Doubles knockout played to the end (QA Doubles has 1 pair; needs ≥2 more) and doubles result flow
- Remaining league matches (5 of 6 unplayed), draws setting, tiebreakers, module auto-complete
- Groups + knockout: draw groups, group results, stage-2 knockout builder (QA Groups KO has 8
  entries, in Seeding, draw pending the native confirm)
- Saving changes on Manage tournament; status changes; admin assignment
- Tournaments list tabs after status change (Live / Past)

## Test data changed
- Badminton singles (Male) is now COMPLETED: all matches played (QF3 was a walkover for mzcache;
  QF2 was recorded, reset, then recorded again). Champion hsjwkwk.
- QF2 has venue "Old gym" / court "Court 2" saved.
- Tennis Singles (Males): 4 test entries (TT Player One–Four, CMS 900001–900004), played to
  completion; champion TT Player Four; venue "Main Hall"; semi-final round set to Bo3 with a note.
- New module "QA League" (Squash, League, singles) with entries Squash A–D (CMS 910001–910004);
  now LIVE with fixtures generated; M1 recorded (Squash D beat Squash A 3–1), 5 matches unplayed.
- New module "QA Doubles" (Table Tennis, Knockout, Doubles, 3rd-place on) with 1 pair
  (Dbl A1 / Dbl A2, CMS 920001/920002); still Draft.
- Tournament status is now LIVE.
- New module "QA Double Elim" (Badminton, double elimination, GF reset on): DE One–Four, played to
  completion, champion DE One.
- New module "QA Groups KO" (Table Tennis, Groups + knockout, 2 groups, top 2): 8 entries GK One–Eight
  (CMS 940001–940008), in Seeding. (Initially created with 4 entries; see TB-12.)
