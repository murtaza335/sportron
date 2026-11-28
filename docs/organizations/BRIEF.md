# Planning brief: organizations on Sportron (Phase 1, NUST)

Prepared 2026-11-28 from a discussion between the product owner and Claude.

## 0. Your task

Write a Phase 1 implementation plan for this brief. **Plan only: do not change code, migrations or deployments.** The owner approves the plan before any build.

- Read `AGENTS.md` first. Its backward-compatibility, security and UI rules are mandatory.
- Verify every code fact in section 8 against the current code before relying on it.
- Treat the labels below strictly:
  - **CONFIRMED**: the owner said it.
  - **PROPOSED**: recommended in discussion, not yet accepted.
  - **OPEN**: undecided.
- Ask the owner about PROPOSED and OPEN items that change the design. Do not silently decide them.
- Write for an owner who wants plain language and a simple product.

## 1. Background

- Sportron is in production (Expo + Supabase; Google Play and web). It already has tournaments, live match scoring and a projector website. See `AGENTS.md` sections 10, 11, 15 and 16.
- **CONFIRMED:** The owner wants to keep the Sportron brand identity across the NUST campus.
- **CONFIRMED:** The people at Old Gym have agreed to use Sportron for scoring.
- **CONFIRMED:** Old Gym is a **venue** inside NUST. The only screen today is at Old Gym. Tournaments are also played at other NUST venues.
- The owner has discussed a demo with the Pakistan Basketball Federation and sees multi-tenant potential. That is **later** (section 9).
- **CONFIRMED:** Work now is Phase 1 only.

## 2. Goal

NUST runs its own tournaments and live scoring inside Sportron **without the super admin in the daily loop**, and non-technical people can use it easily.

## 3. Structure (CONFIRMED)

```
Super admin (the owner)
└── Organization: NUST
    ├── Organization admin: DD Sports
    ├── Organizers: appointed by DD Sports
    ├── Venues: Old Gym and others (places, not organizations)
    └── Tournaments: created by organizers
        └── Modules (one sport competition each)
            ├── Sport manager  (= today's module admin)
            └── Scorers        (new role)
```

- **CONFIRMED:** NUST is the organization. Old Gym must not be modelled as one.
- **CONFIRMED:** DD Sports is the organization admin and assigns organizers.
- **CONFIRMED:** Organizers create and manage tournaments, holding all tournament-related powers that today only the super admin (platform staff) has, limited to their organization.
- **CONFIRMED:** "Sport manager" is the name for a module admin. A module is one competition, so "Badminton Men's Singles" and "Badminton Women's Singles" are two modules. One person can manage both but is assigned to each.
- Use the spelling "organizer" in the product.

An earlier idea (Old Gym as the organization, shown as "Old Gym · NUST") is **superseded**.

## 4. Permissions

The structure is confirmed. The detailed cells are **PROPOSED**.

| Action | Super admin | DD Sports | Organizer | Sport manager | Scorer |
|---|:-:|:-:|:-:|:-:|:-:|
| Create or suspend the organization, set or replace its admin | Yes | No | No | No | No |
| Add or remove organizers | Yes | Yes | No | No | No |
| Create, edit, publish, cancel tournaments | Yes | Yes | Yes | No | No |
| Add co-organizers to a tournament | Yes | Yes | Yes | No | No |
| Create modules, appoint sport managers | Yes | Yes | Yes | No | No |
| Reopen a finished module | Yes | Yes | Yes | No | No |
| Players, draw, schedule, venue, results, walkovers, rules | Yes | Yes | Yes | Own module | No |
| Appoint scorers | Yes | Yes | Yes | Own module | No |
| Score and finish live matches | Yes | Yes | Yes | Own module | Assigned only |
| See players' private fields (phone, email, CMS ID) | See note | Yes | Yes | Own module | No |

- **PROPOSED:** DD Sports manages all NUST tournaments. An organizer manages only those they created or were added to. (This replaced an earlier "all organizers manage all tournaments" suggestion.)
- **PROPOSED:** Organizers can delete drafts. They can only cancel published tournaments. DD Sports or the super admin can hide one. Permanent deletion of published tournaments stays with the super admin.
- **PROPOSED:** Removing a person ends their access immediately. Their tournaments stay with NUST.
- **PROPOSED:** App-wide controls (maintenance, forced update, broadcasts, reports, feature flags, usage analytics) stay with the super admin.
- Note: the admin panel's tournament pages do not appear to show player private fields today. The super admin would get them by being added as a tournament admin (logged), and as database owner can technically access everything.

## 5. Scorer role (PROPOSED unless noted)

- Enforced server-side, not only by hiding buttons.
- Assigned **per module**.
- Can pick court and first server, score, and finish. A finished result counts immediately, with no approval step.
- Cannot undo after finishing, change match rules, reset results, give walkovers or manage players.
- Can take over another scorer's match after a confirmation (dead phone).
- Sees names, time, venue and score only.
- Has a "To score" list and should reach a match in about two taps.
- Managers can see who scored each match.

## 6. Screens and venues

- **PROPOSED:** Two kinds of link.
  - **Tournament link** (exists today): one per tournament, shows only that tournament. For sharing and temporary projectors at other venues.
  - **Screen link** (new): one permanent link per physical screen, owned by NUST, for example the Old Gym TV. It shows whichever tournament is assigned to it, so nobody has to touch the TV between events.
- **PROPOSED:** Venues stay plain places (free text today). A screen is not required for every venue.
- **PROPOSED rules:** DD Sports creates screens and can change any assignment; organizers assign only their own tournaments; a busy screen asks "Replace?" and names who assigned the current one; one tournament per screen in Phase 1; an unassigned or finished screen shows a NUST and Sportron waiting page; each screen can show all courts or selected courts.
- **OPEN:** Will two tournaments ever run at Old Gym at the same time? If often, combined display belongs in Phase 1.

## 7. Brand, simplicity and safety

**Brand (PROPOSED)**
- Lock the "Follow live in the Sportron app" promo on live screens and add a small permanent Sportron mark. Today a tournament admin can switch the promo off.
- Organizers keep control of tournament name, cover image, courts and screen layout.
- Discount codes off for NUST.

**Simplicity** (CONFIRMED requirement: easy for non-technical people. Ideas below are PROPOSED.)
- Normal users see no change. Each role sees only its own job:
  - DD Sports: Organizers, Tournaments, Screens
  - Organizer: My tournaments, Create (an "Organize" card on the Tournaments tab)
  - Sport manager: My sports, today's matches
  - Scorer: Matches to score
- Guided creation: name and dates, pick sports, publish.
- Sensible defaults per sport; advanced options hidden; show the next step ("Add players", then "Create draw").
- Plain words: "Sport" instead of "module", "Draw" instead of "seeding".
- One person may hold several roles. Small events can run with an organizer plus scorers.
- A one-page guide per role.
- Before handover, someone from DD Sports creates a tournament, adds players, makes a draw and appoints a scorer **without help**. Simplify wherever they stop.
- Start with one real tournament and one or two organizers.

**Safety (PROPOSED)**
- Tournaments start as drafts, with preview and confirmation before publishing.
- Clear warnings on reset and rebuild; keep blocking changes that would disturb later played matches.
- A simple activity history for DD Sports.
- A written data agreement with NUST about player contacts.
- One organization must never be able to manage, or read private data from, another's tournaments.

## 8. Current system (verify before use)

**Roles and permissions**
- No organization entity exists. `tournaments.organization` is a free-text label. `tournaments.community_id` is unused. Recommended: do not reuse communities as organizations.
- Tournaments are created by platform staff (admin panel, `admin_create_tournament`, migration 124) or SQL. Tournament admins are added by platform staff (`admin_add_tournament_admin`); no client function for it was found. There is no in-app create screen. Management screens exist.
- Platform roles: `super_admin`, `tournament_manager`, `moderator`. `tournament_manager` can act on **all** tournaments, so it must not be given to NUST.
- `tournament_admins` and `tournament_module_admins` back the two in-app roles. `is_module_admin` includes tournament admins. Some reads query these tables directly (for example `get_tournaments` role detection, `can_view_tournament`), so check every path when adding organization rights.
- There is no scorer-only role. `live_start_match` (migration 133) requires `is_module_admin`, which also grants entry editing, resets and private player fields.

**Tournaments and data**
- Published tournaments are visible to all signed-in users (and to guests when guest mode is on). There is no private or unlisted option.
- `admin_set_tournament_status` accepts draft, published, completed and cancelled. Check what "hide" should map to.
- Core sign-up fields (Name, CMS ID, School, Phone, Email) are locked and required (migration 084). Only labels and order are editable.
- Venue exists as text on modules and matches; court on matches.

**Live scoring and projector**
- Behind the `live_scoring` feature flag, OFF by default.
- The live-match plan lists the referee screen as still needing an on-device check.
- `tournaments.live_code` is per tournament, unique, and editable by a tournament admin. Realtime topic is `live:<code>`. A screen link needs a design that works with this, including the shared URL space and the anonymous read function `get_live_board`.
- The projector (`live/`) supports title, courts, layout and field visibility. It has no organization logo or colours.
- Projector data must stay filtered server-side: never phone, email or CMS ID.
- `docs/live-match/PLAN.md` notes about 200 concurrent connections and 2 million messages a month on the free plan. Check current Supabase limits.

**Scoring gaps** (found by reading code, not tested on a device)
- Table tennis and badminton: no doubles serving order or service court.
- Volleyball: no timeouts, substitutions, rotation or libero.
- Basketball: no player points or fouls, no shot clock or possession arrow; timeouts are 3 per half (FIBA: 2 first half, 3 second, 1 per overtime); the 3x3 preset ends overtime on the first score (the rule, and the plan, say first to 2 points). Whether the clock stops itself at 0:00 is unconfirmed.

## 9. Scope

**In Phase 1.** Suggested build order:
1. Scorer role and "To score" list
2. Organization, org admin and organizers, plus a super admin page to manage organizations
3. "Organize" area and in-app tournament creation
4. Screen links and brand lock
5. Rehearsal at Old Gym (including a dead phone and lost internet) and the usability test

If the event date is close, ship the scorer role first and let the super admin create that one tournament.

Include sport scoring fixes only for sports NUST will actually run.

**Later, not Phase 1**
- Pakistan Basketball Federation demo (basketball rule fixes, player points and fouls, their logo with "Powered by Sportron", shot clock decision)
- Organization branding, private or unlisted events, custom sign-up forms
- Billing, usage limits, custom domains, white label, separate databases

**Architecture direction (PROPOSED):** one shared app and database, each tournament tagged with its organization. Make changes additive so installed app versions keep working; existing tournaments may have no organization. Design so that more organizations can be added later without rework.

## 10. Open questions for the owner

1. Which sports will NUST run first, and on what date?
2. Do organizers manage only their own and assigned tournaments?
3. Is the delete rule accepted?
4. Is per-module scorer assignment enough?
5. Do tournaments publish immediately, without super admin approval? (Recommended: yes.)
6. Should there be a limit on active tournaments? (Suggested earlier: adjustable, such as 5.)
7. Are discount codes off for NUST?
8. Can outsiders compete? If so, CMS ID must become optional.
9. Are both screen and tournament links accepted, and can two tournaments run at Old Gym at once?
10. Can there be more than one organization admin, in case DD Sports is away or changes?
11. Must co-organizers already be NUST organizers? Must sport managers and scorers belong to NUST?
12. Does DD Sports manage things in the app, the web app, or both? (Platform admin panel access is not intended.)

## 11. What the plan should contain

- Data model and migrations (check the next free number), with RLS and function privileges
- A permission matrix mapped to each existing and new server function
- Screens per role, with navigation and empty, error and offline states
- Behaviour on role removal, organization suspension and tournament cancellation
- Backward compatibility, feature flag and rollout order (migrations, edge functions, web, app update)
- Whether the work can ship over the air
- Tests (SQL tests like the existing ones, permission tests across two organizations, rehearsal checklist)
- Build steps small enough to review one at a time, with risks and effort
