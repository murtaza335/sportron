# Organizations Phase 1: rollout, rehearsal and handover

Status: **built and tested locally; nothing is applied or deployed.** Do the steps in order.

## 1. Database (Supabase SQL editor or CLI), one file at a time, in this order
- [ ] `138_add_tournament_scorers.sql`
- [ ] `139_add_organizations.sql`
- [ ] `140_organization_permissions.sql`
- [ ] `141_admin_organizations.sql`
- [ ] `142_organization_member_rpcs.sql`
- [ ] `143_organizer_tournament_lifecycle.sql`
- [ ] `144_flexible_core_entry_fields.sql`
- [ ] `145_organization_screens_brand.sql`

Each file is safe to run again. Files 138, 140 and 145 edit some existing functions in place and **stop with a
"patch … not found" error** if a function differs from what is expected: stop there and look, do not force it.

- [ ] Optional but recommended: run `docs/organizations/sql-tests-scorers.sql` and `sql-tests.sql` in the SQL
  editor (they roll themselves back; the final "ALL TESTS PASSED" error is success).
- [ ] Smoke test with an installed app: open a tournament, score nothing, confirm it looks as before.

No edge function needs a redeploy (the two new notification types are delivered by the existing path).

## 2. Websites (safe before the app)
- [ ] Projector: deploy `live/` to Vercel (screen links `/s/<code>`, waiting page, Sportron mark).
- [ ] Admin panel: deploy `admin/` to Vercel (Organizations pages).

## 3. App
- [ ] Check the update can ship over the air: `package.json`, `app.json` and native folders are unchanged by
  this work; still compare `npx @expo/fingerprint` with the live build before publishing.
- [ ] EAS Update (flag still OFF).
- [ ] Web: `npx expo export -p web` then deploy (`web-deploy-commands.txt`). `vercel.json` has a new rewrite.

## 4. Set up NUST (admin panel)
- [ ] Organizations → create **NUST** (short name NUST). Defaults: discount codes off, brand locked, all
  sign-up fields required. Change the sign-up fields to what NUST agreed.
- [ ] Add DD Sports as organization admin(s).
- [ ] Attach existing NUST tournaments if wanted (tournament page → Organization).
- [ ] Flags: `live_scoring` ON and `organizations` ON. Installed apps without the update ignore the flag, so no
  minimum version is needed.
- [ ] In the app (as DD Sports): Organize → Screens → add **Old Gym TV**; open its link on the TV computer, F11.
- [ ] Owner task, not code: written data agreement with NUST about player contacts.

## 5. Rehearsal at Old Gym (step H)
- [ ] TV opens `/s/<code>` once and is left running all day.
- [ ] DD Sports assigns a tournament → TV switches within ~20 s untouched; assigning another asks "Replace?"
  with the right name.
- [ ] Two sports at once on different courts; try "Courts on this screen".
- [ ] Two scorers, two courts, 30 minutes of real points.
- [ ] **Dead phone**: switch off scorer A mid-game → scorer B takes over after confirming → score continues.
- [ ] **Lost internet**: scorer phone offline 5 minutes, keep scoring, reconnect → server and TV catch up.
  Cut the TV's internet → it keeps the last picture and recovers.
- [ ] Scorer finishes → bracket advances; scorer cannot reset; manager can.
- [ ] Remove a scorer mid-match → their phone is refused; another scorer takes over.
- [ ] Scoring rules on a real phone: badminton doubles serve/court, table tennis doubles order, basketball
  clock stopping at 0:00 and timeouts, volleyball timeouts.
- [ ] Waiting page after the tournament completes or is cleared.
- [ ] Watch Supabase usage (realtime connections and messages) against the plan limits.

## 6. Usability test (handover gate)
Someone from DD Sports, **without help**: creates a tournament, adds players, makes a draw, appoints a scorer.
Watch, note every stop, simplify, repeat with a second person. Hand out the guides in `guides/`
(`python3 -I docs/organizations/guides/build-pdf.py` rebuilds the PDFs).
Start with one real tournament and one or two organizers.

## Turning it off
`organizations` flag OFF hides every new screen at once. Database rules stay (they only affect organization
tournaments). Pausing NUST (admin panel) makes its tournaments read-only.

## Known limits (as built)
- Not tried on a physical device or against a real Supabase project: database tests run on a local Postgres
  with stubs, app code is type-checked, linted and web-exported.
- A scorer's rules are checked on the server against the sport's preset, saved settings and the round's
  best-of; preset details the sport never saved are resolved by the app.
- Doubles serving shows "player 1 / player 2", not names.
- Screen links are shared or typed; the app shows no QR code for them.
- Offline: Organize screens show saved lists with a notice; create / publish buttons are not greyed out, they
  fail with a message.
- Removing someone from the organization does not remove sport-manager or scorer assignments (those are
  separate and can be given to anyone).
- The older "Save changes" server function can still publish an organization tournament without the publish
  checks (the app does not do that); it cannot move it back to draft.
- Server-written notification texts still say "module".
- Release: bump the version and What's New only when you cut a store build (see `whats-new-draft.md`).
