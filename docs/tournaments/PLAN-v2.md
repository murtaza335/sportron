# Tournaments v2 — Rosters, Round-Robin, Groups + Knockout, Double Elimination

> **Audience:** the implementing agent (Claude Sonnet) and the project owner.
> **Status:** PLAN — nothing implemented. Branch: `dev`. Builds on v1 (`PLAN.md`, migrations 084–089).
> **Before every work session:** read `AGENTS.md` → `PLAN.md` (v1, for context and design rules) → **this file** → `PROGRESS.md`. Do **one step** from §13, then update `PROGRESS.md` (v2 table). Never do several steps in one session.

---

## 0. Ground Rules (in addition to PLAN.md §0, which still applies in full)

1. **v1 single elimination must keep working exactly as it does now.** Every v2 migration must leave the v1 behaviour unchanged for `format = 'single_elimination'` + `participant_type = 'individual'`. The v1 test script `docs/tournaments/sql-tests.sql` is the regression suite: the owner runs it again after every v2 DB step and it must still print `ALL TESTS PASSED`.
2. **Next migration number is 090.** Check `supabase/migrations/` first; if 090 is taken use the next free number and record it under *Plan deviations*.
3. **Changing v1 tournament RPCs.** Tournaments are **not** in any released build (`master` contains no tournament files). So, unlike the rest of the app, a v1 tournament RPC whose `RETURNS TABLE` shape must change may be `drop function … ; create function …` in the same migration. **Before the first such step, ask the owner:** "Has a web build with tournaments been deployed to Vercel, or an APK with tournaments shared with testers?" If yes, add a new RPC instead (suffix `_v2`) and leave the old one alone. Record the answer under *Decisions*.
4. **New settings go through a jsonb patch RPC** (`update_tournament_module_settings(p_module, p_set jsonb)`, pattern of `update_tournament` in 089). Do **not** add parameters to `create_tournament_module` / `update_tournament_module`: a second overload with defaults makes PostgREST calls ambiguous.
5. **No new notification types.** v2 reuses the six `tournament_*` types, so the `in_app_notifications.type` check constraint does not change. If you find you need a new type, stop and ask (it needs a constraint migration, AGENTS.md).
6. **No edge-function changes.** Everything still flows `in_app_notifications` → `trg_fcm_push` → `send-notification`.
7. The **design language rules in PLAN.md §11 are binding.** Reuse the v1 tournament components (`BottomSheet`, `form.tsx` primitives, `StatusPill`, `StandingsTable` styles, `MiniStepper` in `ResultEntrySheet`, `EntryFieldControl`, `ProfilePickerSheet`).
8. Each DB step adds its tests to **`docs/tournaments/sql-tests-v2.sql`** using the same harness as v1 (helper schema `tt_test`, one self-rolling-back `DO` block that ends by raising `ALL TESTS PASSED — rolled back, nothing saved`). Copy the v1 helpers; add new ones as needed.

---

## 1. Scope

### 1.1 What v2 adds
| # | Feature | Summary |
|---|---|---|
| F1 | **Rosters (teams)** | A module is either **individual** (v1: one person per entry) or **team**. In a team module every entry is a team with **members**. Doubles = a team of exactly 2. Team sports = a squad of e.g. 11–18 (starters + substitutes). |
| F2 | **Round-robin (league)** | Everyone plays everyone (1 or 2 legs). Draws allowed where the sport allows. League table with points. |
| F3 | **Groups + knockout** | Entries are drawn into groups. Each group is a round-robin. The top *k* of each group go into a single-elimination knockout. |
| F4 | **Double elimination** | Winners bracket + losers bracket + grand final (with optional reset match). You are out after two losses. |

Self-registration stays **out of scope** (entries and rosters are still added by module admins only).

### 1.2 Still out of scope after v2
Self-registration · per-match lineups / who started / substitutions made · per-player stats (goals, points, MVP) · player-reported scores · "best third-placed teams" qualification · Swiss system · automatic scheduling (admins still schedule each match) · tournament chat · community-hosted tournaments.

### 1.3 Assumptions — confirm with the owner before the step that depends on them
Record each answer in `PROGRESS.md` → *Decisions*. Defaults below are the recommendation; build them as written unless the owner says otherwise.

| # | Assumption (recommended default) | Steps |
|---|---|---|
| B1 | In a **team** module, the tournament's entry form (Name, CMS ID, School, Phone, Email + custom fields) is filled **per member**. The team entry itself only has a **team name** (`tournament_entries.name`) and empty `field_values`. | 25, 26, 30 |
| B2 | **Doubles** = team module with `roster_min = roster_max = 2`. Team sports default roster sizes per sport (table in §3.1), editable by the admin (1–40). | 25, 29 |
| B3 | **Racket sports** pick *Singles* (individual) or *Doubles* (team, 2). **Team sports** are always *Teams*. **Other** can pick *Individual* or *Teams*. | 26, 29 |
| B4 | A person can be on **only one team per module** (member CMS ID and linked profile are unique per module). They can play in other modules. | 25, 26 |
| B5 | Rosters stay **editable until the module is completed**: add, edit, remove members while ≤ `roster_max`. From `seeding` onwards a roster may not go below `roster_min`. Teams themselves can only be added or deleted in `draft`/`open`, as in v1. | 26 |
| B6 | Incomplete rosters (< `roster_min`) can be saved while `draft`/`open`, with a warning. They block `open → seeding` (`ROSTER_INCOMPLETE`). | 26, 31 |
| B7 | **Captain** is optional, at most one per team. **Squad number** is optional (team sports only), 0–99, unique within the team. | 25, 30 |
| B8 | Every **linked member** gets the notifications their team gets. A linked member sees their **own** private fields only (not their teammates'). | 26, 27 |
| B9 | **Draws** are possible only in league / group matches, and only when the module has `allow_draws = true`. Default: on for team sports, off (and not allowed) for racket sports. Knockout matches can never end drawn (v1 `TIE_NEEDS_WINNER`). | 33, 36 |
| B10 | League points default **3 / 1 / 0** (win / draw / loss), editable 0–10. | 33 |
| B11 | League tiebreakers, in order: **points → head-to-head points among the tied entries → score difference → score for → wins → seed → name**. No manual override in v2. | 34 |
| B12 | Groups are drawn by **snake seeding**. In `seeding` the admin can move an entry to another group. Every group sends the **same number** of entries to the knockout. | 38 |
| B13 | The knockout after groups is **single elimination** (3rd-place match optional). The admin builds it explicitly once **all** group matches are decided. Pairing is cross-group and avoids same-group first-round meetings. The admin may reorder the qualifiers before building. | 38, 41 |
| B14 | **Double elimination**: true double elimination with an optional grand-final reset (default **on**). No 3rd-place match (the losers-bracket final loser is 3rd). Needs **≥ 3** entries. | 39, 42 |
| B15 | Round-robin legs: **1 or 2**. | 33 |
| B16 | Entry limits per format: league ≤ 20, groups ≤ 128 total with 2–8 per group, double elimination ≤ 64, single elimination ≤ 128 (v1). | 33, 38, 39 |
| B17 | An entry withdrawn during a league / group stage keeps its played results. The admin records walkovers for its remaining matches (no auto-forfeit), consistent with v1. | 36 |

---

## 2. Concepts & Vocabulary

| Term | Meaning |
|---|---|
| **participant_type** | `individual` (v1) or `team` |
| **member** | A row in `tournament_entry_members`: one player in a team entry |
| **format** | `single_elimination` (v1) · `round_robin` · `groups_knockout` · `double_elimination` |
| **stage** | `stage_number` on rounds/matches (column already exists, always 1 in v1). Groups+knockout: stage 1 = groups, stage 2 = knockout. All other formats: stage 1 only |
| **bracket_side** | Which part of the structure a round/match belongs to: `main` (single-elim / knockout), `winners`, `losers`, `grand_final` (double-elim), `league` (round-robin), `group` (group stage) |
| **slot label** | Text shown in an empty bracket slot: `A1` (winner of group A), `B2`, `Loser W2-1`, `Winner L3-1` — stored in `entry_a_label` / `entry_b_label` |
| **match code** | Short id for a match shown in the UI: `F`, `SF1`, `QF3`, `R1-5`; `W1-3`, `L2-1`, `GF`, `GF2`; `M12` (league); `A3` (group A, 3rd match) |
| **auto-bye** | Double-elim only: a losers-bracket match that can only ever receive one entry (its other feeder was a first-round bye). It resolves itself as soon as that entry arrives |

---

## 3. Data Model

### 3.1 Migration `090_add_tournament_rosters.sql`

```sql
-- module: who plays
alter table public.tournament_modules
  add column if not exists participant_type text not null default 'individual'
    check (participant_type in ('individual','team')),
  add column if not exists roster_min int check (roster_min between 1 and 40),
  add column if not exists roster_max int check (roster_max between 1 and 40),
  add column if not exists lineup_size int check (lineup_size between 1 and 40),   -- informational ("11-a-side")
  add constraint tm_roster_range check (
    participant_type = 'individual'
    or (roster_min is not null and roster_max is not null and roster_min <= roster_max));

create table public.tournament_entry_members (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.tournament_entries(id) on delete cascade,
  module_id uuid not null references public.tournament_modules(id) on delete cascade,     -- denormalised
  tournament_id uuid not null references public.tournaments(id) on delete cascade,      -- denormalised
  name text not null check (char_length(btrim(name)) between 1 and 60),
  profile_id uuid references public.profiles(id) on delete set null,
  field_values jsonb not null default '{}'::jsonb,
  is_captain boolean not null default false,
  squad_number int check (squad_number between 0 and 99),
  sort_order int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.tournament_entry_members (entry_id, sort_order);
create index on public.tournament_entry_members (profile_id) where profile_id is not null;
-- B4: one team per person per module
create unique index tem_cms_unique on public.tournament_entry_members
  (module_id, lower(field_values->>'cms_id')) where coalesce(field_values->>'cms_id','') <> '';
create unique index tem_profile_unique on public.tournament_entry_members
  (module_id, profile_id) where profile_id is not null;
-- B7
create unique index tem_one_captain on public.tournament_entry_members (entry_id) where is_captain;
create unique index tem_squad_number on public.tournament_entry_members (entry_id, squad_number)
  where squad_number is not null;
```
Notes:
- Members of a **withdrawn** team still occupy their CMS ID/profile in that module. This is intentional: a withdrawn player can't reappear on another team mid-tournament. If the owner disagrees, the fix is to delete the members on withdraw.
- RLS on `tournament_entry_members`: enable; **SELECT** policy `is_module_admin(module_id) or profile_id = auth.uid()`; no write policies; `revoke insert, update, delete, truncate … from anon, authenticated` (same as v1 deviation).
- Attach `tournament_set_updated_at()` and `audit_tournament_table()` (from 084) to the new table.
- **Default roster sizes** live in the client (`tournamentFormat.ts`, §8.3) and are sent by the module form. The DB only stores the result.

| sport | roster_min | roster_max | lineup_size |
|---|---|---|---|
| table_tennis, badminton, tennis, squash, pickleball (doubles) | 2 | 2 | 2 |
| football | 11 | 18 | 11 |
| cricket | 11 | 15 | 11 |
| volleyball | 6 | 12 | 6 |
| basketball | 5 | 12 | 5 |
| handball | 7 | 14 | 7 |
| other (teams) | 2 | 20 | — |

New SQL helpers (`stable security definer`, `search_path = public`, not granted to clients unless stated):
- `_entry_profile_ids(p_entry uuid) returns uuid[]`: the distinct non-null set of `tournament_entries.profile_id` ∪ `tournament_entry_members.profile_id` for that entry.
- `is_entry_participant(p_entry uuid) returns boolean`: `auth.uid() = any(_entry_profile_ids(p_entry))`.
- `is_module_participant(p_module uuid) returns boolean`: any active-or-withdrawn entry of the module where the caller is the entry's profile or a member.

### 3.2 Migration `093_add_tournament_formats_schema.sql`

```sql
-- widen format (drop + re-add the auto-named check; look the name up in pg_constraint inside a DO block)
--   format in ('single_elimination','round_robin','groups_knockout','double_elimination')

alter table public.tournament_modules
  add column if not exists allow_draws boolean not null default false,
  add column if not exists points_win  int not null default 3 check (points_win  between 0 and 10),
  add column if not exists points_draw int not null default 1 check (points_draw between 0 and 10),
  add column if not exists points_loss int not null default 0 check (points_loss between 0 and 10),
  add column if not exists rr_legs int not null default 1 check (rr_legs in (1,2)),
  add column if not exists group_count int check (group_count between 2 and 16),
  add column if not exists advance_per_group int check (advance_per_group between 1 and 4),
  add column if not exists grand_final_reset boolean not null default true,
  add column if not exists current_stage int not null default 1 check (current_stage in (1,2));

create table public.tournament_groups (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.tournament_modules(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 20),   -- 'Group A'
  letter text not null check (letter ~ '^[A-P]$'),
  sort_order int not null default 0,
  unique (module_id, letter)
);
create table public.tournament_group_entries (
  group_id uuid not null references public.tournament_groups(id) on delete cascade,
  entry_id uuid not null references public.tournament_entries(id) on delete cascade,
  module_id uuid not null references public.tournament_modules(id) on delete cascade,
  final_position int,              -- set when the group stage is finalised
  qualified boolean,               -- set when the knockout is built
  primary key (group_id, entry_id),
  unique (module_id, entry_id)     -- an entry is in exactly one group
);

alter table public.tournament_rounds
  add column if not exists bracket_side text not null default 'main'
    check (bracket_side in ('main','winners','losers','grand_final','league','group'));

alter table public.tournament_matches
  add column if not exists bracket_side text not null default 'main'
    check (bracket_side in ('main','winners','losers','grand_final','league','group')),
  add column if not exists group_id uuid references public.tournament_groups(id) on delete cascade,
  add column if not exists code text check (char_length(code) <= 12),
  add column if not exists entry_a_label text check (char_length(entry_a_label) <= 24),
  add column if not exists entry_b_label text check (char_length(entry_b_label) <= 24),
  add column if not exists is_draw boolean not null default false,
  add column if not exists auto_bye boolean not null default false;

alter table public.tournament_entries
  add column if not exists eliminated_side text
    check (eliminated_side in ('main','winners','losers','grand_final','league','group'));
```
**Unique constraints must be replaced**, because winners/losers rounds and group matches share `(stage, round, match)` numbers:
- `tournament_rounds`: drop `unique (module_id, stage_number, round_number, is_third_place)` → `create unique index tr_unique_v2 on tournament_rounds (module_id, stage_number, bracket_side, round_number, is_third_place)`.
- `tournament_matches`: drop `unique (module_id, stage_number, round_number, match_number, is_third_place)` → `create unique index tmatch_unique_v2 on tournament_matches (module_id, stage_number, bracket_side, round_number, match_number, is_third_place)`. Group matches use **one running `match_number` per round across all groups**, so `group_id` is not needed in the key.
- The constraint names were auto-generated (and possibly truncated). Find them with `select conname from pg_constraint where conrelid = 'public.tournament_rounds'::regclass and contype = 'u'` inside a `DO` block, and drop by the name found. Don't hard-code it.

RLS: `tournament_groups` and `tournament_group_entries` get SELECT `can_view_module(module_id)` and no write policies (+ revoke writes). Audit + updated_at triggers are not needed (no updated_at column), but attach the audit trigger to `tournament_group_entries`.

**Back-fill:** none needed. Existing rows default to `bracket_side = 'main'`, `stage 1`, and that is exactly the v1 meaning.

---

## 4. Rosters — RPCs & Rules (migrations 091, 092)

### 4.1 `091_add_tournament_roster_rpcs.sql`

**`update_tournament_module_settings(p_module uuid, p_set jsonb) returns void`**, the patch RPC for every v2 module setting. Guard: `is_module_admin`, `_tournament_assert_writable`, module not `completed`/`cancelled`. Allowed keys and rules:

| key | rule |
|---|---|
| `participant_type` | `individual`/`team`. Changeable only in `draft`/`open` **with 0 entries** (`INVALID_STATUS`). Racket sports: both. Team sports: must be `team` (`FIELD_INVALID:participant_type`). `other`: both |
| `roster_min`, `roster_max`, `lineup_size` | team only; 1–40; min ≤ max. Lowering `roster_max` below an existing team's member count → `ROSTER_TOO_LARGE`. Raising `roster_min` above an existing team's count is allowed in draft/open (B6). From `seeding` onwards it is blocked (`INVALID_STATUS`) |
| `format` | any of the 4. Only in `draft`/`open` and no bracket generated |
| `allow_draws` | only for `round_robin`/`groups_knockout`; racket sports must be `false` (`FIELD_INVALID:allow_draws`). Only before `in_progress` |
| `points_win/draw/loss` | 0–10; `win > draw ≥ loss` (`FIELD_INVALID:points`). Only before `in_progress` |
| `rr_legs` | 1/2; `round_robin`/`groups_knockout`; before bracket generation |
| `group_count`, `advance_per_group` | `groups_knockout`; before bracket generation |
| `grand_final_reset` | `double_elimination`; before `in_progress` |

Unknown keys → `FIELD_INVALID:<key>`. The client always sends the whole v2 settings object from the module form after `create_tournament_module` / `update_tournament_module`. Format consistency checks (e.g. `third_place_match` must be false for double-elim, group config must be present for groups) run at `open → seeding` (§5.6), not here, so the form can be saved in any order.

**`upsert_team_entry(p_module uuid, p_entry uuid, p_name text, p_members jsonb) returns uuid`**
- Guard: module admin; writable; module `participant_type = 'team'` else `WRONG_PARTICIPANT_TYPE`.
- Creating (`p_entry` null) only in `draft`/`open`, respecting `max_entries` (`MAX_ENTRIES`). Editing in `draft`/`open`/`seeding`/`in_progress` (B5); the entry must be `active`.
- `p_name`: team name, trimmed, 1–60 (`FIELD_REQUIRED:name` / `FIELD_INVALID:name`).
- `p_members`: a jsonb array of `{ id?: uuid, name, profile_id?: uuid, field_values: {}, is_captain?: bool, squad_number?: int }`. It is the **full roster**: existing members whose id is absent are deleted, ids present are updated, and rows without an id are inserted. An `id` that belongs to another entry → `NOT_FOUND`.
- Each member's `field_values` is validated with **exactly the v1 rules** from `upsert_tournament_entry` (non-archived fields, required, email/phone/number/select regexes, 200-char cap, strip unknown keys, keep archived answers on edit). **Refactor first:** move that loop into an internal `_validate_entry_field_values(p_tournament uuid, p_in jsonb, p_keep jsonb) returns jsonb` and make `upsert_tournament_entry` call it too (`create or replace`, same signature, same behaviour). Errors carry the member index: `FIELD_REQUIRED:cms_id@2`, `FIELD_INVALID:email@0` (0-based index into `p_members`). The member's `name` is the core Name field.
- Count rules: `count > roster_max` → `ROSTER_TOO_LARGE`; in `seeding`/`in_progress`, `count < roster_min` → `ROSTER_INCOMPLETE`. More than one captain → `FIELD_INVALID:is_captain`. A duplicate squad number inside the payload → `DUPLICATE_SQUAD_NUMBER`. Squad numbers on racket-sport modules are ignored (stored null).
- Check duplicates **inside the payload** before writing (same CMS ID / profile twice → `DUPLICATE_MEMBER_CMS_ID@i` / `DUPLICATE_MEMBER_PROFILE@i`). Then map unique-index violations: `tem_cms_unique` → `DUPLICATE_MEMBER_CMS_ID`, `tem_profile_unique` → `DUPLICATE_MEMBER_PROFILE` (the index can't be known from the violation; the in-payload check covers the common case).
- `profile_id` must exist in `public_profiles` with `deleted_at is null` (`NOT_FOUND`).
- The team entry row: `name = p_name`, `profile_id = null`, `field_values = '{}'`.
- Returns the entry id.

**`upsert_tournament_entry`** (v1): add a guard at the top: `participant_type = 'team'` → `WRONG_PARTICIPANT_TYPE`.

**`set_module_status`** (`create or replace`, same signature): keep every v1 rule and add the following on `open → seeding`:
- Team modules: every active entry has `roster_min ≤ members ≤ roster_max`, else `ROSTER_INCOMPLETE`.
- The format checks in §5.6.

**Read RPC changes** (same migration):
- `get_module_entries`: **drop + recreate** (see Ground Rule 3) with two extra trailing columns: `member_count int` and `members jsonb`. `members` is an array ordered by `is_captain desc, squad_number nulls last, sort_order, created_at`, each item `{ id, name, is_captain, squad_number, profile: {id,username,avatar_url}|null, fields }`. `fields` follows the v1 PII rule **per member**: everything for module admins and for the member themselves (`profile_id = auth.uid()`); otherwise only public, non-archived keys (B8). For individual modules `members = '[]'` and `member_count = 0`. Also: the v1 entry-level "own entry" rule becomes `e.profile_id = v_uid` (unchanged). Teammates do **not** see each other's private fields.
- `get_tournaments`, `get_tournament_detail`, `get_module_detail`: the `'entrant'` role check becomes `e.profile_id = v_uid or exists (member of e with profile_id = v_uid)`. `get_tournaments`/`get_module_detail` return jsonb or TABLE. Only the WHERE logic changes, so `create or replace` works. `get_module_detail` returns the full module row via `to_jsonb(v_m)`, so the new columns appear automatically.
- `get_module_bracket` (v1, kept for now) and the new `get_module_matches` (§6.2): entry refs gain `profile_ids uuid[]` (= `_entry_profile_ids`) so the client can highlight "my team's path". Keep `profile_id` too.

Grants: `revoke all … from public, anon; grant execute … to authenticated` for public RPCs; internal `_…` helpers get no grants.

### 4.2 `092_update_tournament_notifications_for_rosters.sql`
`create or replace` the 088 trigger functions; no new types and no constraint change:
- New trigger `trg_tournament_member_added` **after insert or update of profile_id on `tournament_entry_members`** → `tournament_entry_added` to the member's profile: title `You're on <team>`, body `You were added to <team> in <module> · <tournament>.`, data `{tournamentId, moduleId, entryId, memberId}`. Only while the tournament is `published` (same as v1). Dedupe with `_notification_already_exists`.
- `trg_tournament_match_events`: the recipients become `_entry_profile_ids(entry_a) ∪ _entry_profile_ids(entry_b)` instead of the two `profile_id`s.
- `trg_tournament_module_completed`: the recipient set also unions members of all the module's entries.
- Test: a team of 3 with 2 linked members gets 2 rows per match result. A member linked while the tournament is draft gets nothing.

---

## 5. Formats — Engine (migrations 094–097)

### 5.0 Refactor first (start of 094)
Split the v1 `generate_bracket` without changing its behaviour:
- `_build_single_elim(p_module uuid, p_stage int, p_ordered uuid[], p_third_place boolean, p_labels text[] default null) returns void`: creates rounds and matches for `p_stage` with `bracket_side = 'main'`, places `p_ordered[i]` as seed *i* using `_tournament_seed_order`, fills `entry_a_label/entry_b_label` from `p_labels[seed]` when given, resolves first-round byes and advances them. It does **not** touch `tournament_entries.seed` (the knockout stage of groups has its own order). Match codes: `F`, `SF1..2`, `QF1..4`, else `R<round>-<n>`. The 3rd-place match code is `3P`.
- `generate_bracket(p_module)` (`create or replace`, same signature, still the only public "generate" entry point) keeps the v1 guards and the v1 seed write-back, then **dispatches on `format`**:
  - `single_elimination` → wipe stage 1 + `_build_single_elim(p_module, 1, <entries by seed>, third_place_match)`.
  - `round_robin` → §5.2.
  - `groups_knockout` → §5.3 (stage 1 only).
  - `double_elimination` → §5.4.
- "Wipe" for every format = delete rounds (cascade matches) and groups of the module, reset `eliminated_round`, `eliminated_side`, `final_rank`, the champion/runner-up/third ids, and set `current_stage = 1`.
- Run v1 `sql-tests.sql` after this refactor alone. It must pass before you write any new format code.

### 5.1 Shared engine changes
- **`_downstream_blocked(p_match uuid) returns boolean`**: true if any match reachable through `next_match_id` / `loser_next_match_id` is `completed`/`walkover`. **Auto-bye matches are looked through** (recurse into their own next). Replace the three inline `DOWNSTREAM_PLAYED` checks in `record_tournament_result`, `record_tournament_walkover` and `reset_tournament_match` with it.
- **`_advance_tournament_match`** additions:
  1. After filling a slot of the next match (winner path or loser path): if that next match has `auto_bye = true` and now has exactly one entry → mark it `status = 'bye'`, `winner_entry_id = that entry`, `completed_at = now()`, and **recurse** `_advance_tournament_match(next)`.
  2. Grand final logic (§5.4).
  3. Elimination bookkeeping is per format (§5.2–5.4). Set `eliminated_side` together with `eliminated_round`.
  4. The completion call is now `_complete_tournament_module(module)` after **every** decided match. It dispatches per format and returns early when the module isn't finished (cheap `exists` checks).
- **`_unadvance_tournament_match`** additions: when removing an entry from a next match that is an **auto-bye already resolved**, first un-advance that auto-bye match recursively, then reset it to `pending`, `winner null`. Grand final logic (§5.4).
- **League / group matches** have `next_match_id = null`, so the v1 rule "a match with `next_match_id is null` is terminal" **no longer holds**. Replace every use of that rule with an explicit check on `bracket_side` (`main` final = `round_number = max main round and not is_third_place`, etc.). Grep 087 and 085 for `next_match_id is null`.
- **Draws** in `record_tournament_result`: if `p_score_a = p_score_b` **and** the match's `bracket_side in ('league','group')` **and** the module has `allow_draws` → `status = 'completed'`, `is_draw = true`, `winner_entry_id = null`, and no `p_winner` needed (ignore it if sent). Otherwise the v1 tie rule applies (`TIE_NEEDS_WINNER`). On any non-draw result set `is_draw = false`. `_advance` with a null winner on a league/group match does nothing except the completion check, so skip the v1 `raise 'INVALID_STATUS'` for that case only.
- **Edit/reset of league & group matches**: no downstream, so always allowed while the module is `in_progress` and (groups) `current_stage = 1`. Once the knockout is built, group matches are locked: `STAGE_LOCKED`.
- **Walkover** in league/group: allowed (v1 rules; counts as a win/loss, scores null).
- **Schedule**: unchanged.

### 5.2 Round-robin (`format = 'round_robin'`)
`_build_round_robin(p_module, p_stage int, p_side text, p_group uuid, p_entries uuid[], p_legs int, p_match_offset int[]) `: shared with groups.

**Circle method**, which is deterministic and testable:
1. `L` = entry ids in seed order. If `len(L)` is odd append `null` (a rest slot). `n = len(L)`, `R = n − 1` rounds per leg.
2. For round `r = 0 … R−1`: pairs `i = 0 … n/2 − 1`: `home = L[i]`, `away = L[n−1−i]`. If `i = 0` and `r` is odd, swap home/away (this balances the fixed entry). Skip pairs that contain `null` (that entry rests this round).
3. Rotate: keep `L[0]` fixed and move the last element to position 1.
4. Leg 2 (if `p_legs = 2`): repeat rounds 1…R with home/away swapped, round numbers `R+1 … 2R`.
5. Rounds: `bracket_side = 'league'` (or `'group'`), round name `Matchday <r>`, `best_of 1` (editable via the existing rounds screen). Matches: `entry_a = home`, `entry_b = away`, `status 'pending'`, no next links. Code `M<running number>` (league) or `<letter><running number within group>` (group).

Generation guards: `2 ≤ N ≤ 20` (B16) else `NOT_ENOUGH_ENTRIES` / `TOO_MANY_ENTRIES`. Expected match count = `legs × N(N−1)/2` (test it).

**Completion** (`_complete_tournament_module`, round_robin branch): when every league match is `completed`/`walkover` → compute the table (§6.1) → `final_rank` = table rank (strictly 1..N after tiebreakers), `champion = rank 1`, `runner_up = rank 2`, `third_place = rank 3` (if N ≥ 3) → status `completed`. **Re-opening**: if a league match is reset/edited after completion, that is impossible anyway (module `completed` = read-only, v1 rule).

### 5.3 Groups + knockout (`format = 'groups_knockout'`)
**Setup guards (at `open → seeding`)**: `group_count` and `advance_per_group` set; `N ≥ 2 × group_count`; each group will have 2–8 entries (`ceil(N / group_count) ≤ 8`); `group_count × advance_per_group ≥ 2`; `advance_per_group < floor(N / group_count)` (every group must eliminate at least one) else `FIELD_INVALID:advance_per_group`.

**Generate (stage 1)**:
1. Entries in seed order (v1 seed write-back first).
2. Create groups `A, B, …` (`name 'Group A'`).
3. **Snake draw**: seed 1→A, 2→B, …, g→last, g+1→last, … back to A, and so on.
4. For each group, `_build_round_robin(…, 'group', group_id, members_by_seed, rr_legs)`. Round numbers are shared ("Matchday 1" holds matchday 1 of every group). `match_number` runs across groups within a round (group A's matches first).
5. `current_stage = 1`.

**`move_group_entry(p_entry uuid, p_group uuid) returns void`**: module admin; module `seeding`; target group of the same module; both groups keep ≥ 2 entries after the move. It deletes and re-creates the fixtures of the **two affected groups only** (and then renumbers `match_number` across the round so the unique index holds; simplest: rebuild all group fixtures in letter order).

**Group finished?** All stage-1 matches decided. The module stays `in_progress` with `current_stage = 1`. The UI then shows "Build knockout".

**`preview_knockout_qualifiers(p_module) returns table (entry_id uuid, name text, group_letter text, position int, label text, suggested_seed int)`**: module admin. Requires every group match to be decided (`GROUPS_NOT_FINISHED`). For each group, take the table (§6.1) top `advance_per_group`. **Suggested order:**
1. Sort qualifiers by `position asc`, then across groups by `points desc, score_diff desc, score_for desc, group letter asc`. That gives `suggested_seed 1..Q`.
2. **Avoid same-group first-round meetings**: compute the first-round pairs with `_tournament_seed_order(next_pow2(Q))`. For each pair whose two entries share a group, swap the lower-seeded entry with the next lower seed of the **same position** whose swap creates no new conflict. Repeat until there are no conflicts or no candidates left; a conflict that can't be resolved is allowed.
3. `label` = `<letter><position>` (e.g. `A1`).

**`build_knockout_stage(p_module uuid, p_entry_ids uuid[] default null) returns int`**: module admin; `in_progress`; `current_stage = 1`; groups finished. `p_entry_ids` null → use the preview order. Otherwise it must be exactly the qualifier set (`FIELD_INVALID:entry_ids`). It writes `tournament_group_entries.final_position` (all) and `qualified` (true/false). Non-qualifiers get `eliminated_side = 'group'`, `eliminated_round = null`. It calls `_build_single_elim(p_module, 2, p_entry_ids, third_place_match, labels)` and sets `current_stage = 2`. Returns the match count.

**`reset_knockout_stage(p_module) returns void`**: module admin; `current_stage = 2`; no stage-2 match `completed`/`walkover` (byes are fine). It deletes stage-2 rounds, clears `qualified`/`final_position`/the non-qualifiers' `eliminated_side`, and sets `current_stage = 1`.

**Completion** (groups branch): stage 2 final (and 3rd place if present) decided. Final ranks:
- Qualifiers: v1 single-elim rule computed on stage 2 (`2^(R − eliminated_round) + 1`, 3rd-place handling).
- Non-qualifiers: `Q + 1 + (number of non-qualifiers with a better group position)`, shared within the same position. Example: 4 groups, top 2 through: all 3rd-placed share rank 9 (`T-9`), all 4th-placed share rank 13.

### 5.4 Double elimination (`format = 'double_elimination'`)
Guards: `3 ≤ N ≤ 64` (B16). `third_place_match` must be false (enforced at `open → seeding`: `FIELD_INVALID:third_place_match`).

Let `S = next power of two ≥ N`, `k = log2(S)` (k ≥ 2).

**Winners bracket (WB)**: `_build_single_elim(p_module, 1, ordered, false)` with `bracket_side = 'winners'` (add a `p_side` parameter to `_build_single_elim`, default `'main'`). WB rounds `1..k`. Names: `WB Round 1` …, `WB Quarter-finals`, `WB Semi-finals`, `WB Final`. Codes `W<round>-<n>`.

**Losers bracket (LB)**: `2(k − 1)` rounds. Matches in LB round `r` = `S / 2^(ceil(r/2) + 1)`.
- S=4: LB R1 = 1, R2 = 1. S=8: 2, 2, 1, 1. S=16: 4, 4, 2, 2, 1, 1.
- Names `LB Round <r>`, last one `LB Final`. Codes `L<r>-<n>`. `bracket_side = 'losers'`.

**Links** (`loser_next_*` on WB matches, `next_*` on LB matches):
| From | Goes to |
|---|---|
| WB R1 match *m* — **loser** | LB R1 match `ceil(m/2)`, slot `a` if *m* odd else `b` |
| WB R(j+1) match *m*, j ≥ 1 — **loser** | LB R(2j) match `m'`, slot `b`, where `m' = (count − m + 1)` if *j* is odd, else `m`. `count` = matches in that LB round. The reversal reduces rematches |
| LB R(2j−1) match *m* — **winner** | LB R(2j) match *m*, slot `a` |
| LB R(2j) match *m* (not the last LB round) — **winner** | LB R(2j+1) match `ceil(m/2)`, slot `a` if *m* odd else `b` |
| LB last round — **winner** | Grand Final, slot `b` |
| WB Final — **winner** | Grand Final, slot `a` |
| WB Final — **loser** | LB last round match 1, slot `b` (this is the j = k−1 row above) |

Check on S=8: WB R2 losers (2) → LB R2 (2 matches); WB R3 (final) loser → LB R4 slot b. ✓

**Grand final**: round `bracket_side = 'grand_final'`, round 1 `Grand Final` (code `GF`). If `grand_final_reset` there is a second round `Grand Final — Reset` (code `GF2`), and GF1 has `next_match_id = GF2`. GF2 is created `pending` with empty slots.

**Byes and auto-byes** (resolved at generation, after links exist):
1. WB R1 pairs with one empty slot become `bye` and advance (v1 behaviour). A bye match **has no loser**: set its `loser_next_match_id = null` and remember the target LB slot as **dead**.
2. Loop until stable: an LB match whose two slots are both dead is **deleted**, and the slot it would have fed becomes dead. An LB match with exactly one dead slot gets `auto_bye = true`, and its `entry_x_label` for the dead slot = `BYE`.
3. Auto-byes resolve at runtime (§5.1). Because only WB R1 can contain byes (standard seeding) and every later WB match has two real entries, dead slots exist only in LB R1/R2. Generation can compute them fully.

**Slot labels**: for every empty slot fed by a match, set `entry_x_label` = `Winner <code>` or `Loser <code>`. Recompute them at generation only (they stay valid; the UI shows the label only while the slot is empty).

**Advancement specifics** (`_advance`):
- A WB loss (not the WB final) → the loser goes to the LB. **Not eliminated.**
- An LB loss → `eliminated_side = 'losers'`, `eliminated_round = r`.
- GF1 decided:
  - Winner = slot `a` (WB champion) → champion = a, runner-up = b (`eliminated_side 'grand_final'`). If GF2 exists, set its status `cancelled`. Complete.
  - Winner = slot `b` and reset on → GF2 `entry_a = GF1.a`, `entry_b = GF1.b` (status `scheduled` if it has a time, else `pending`). Not complete yet.
  - Winner = slot `b` and reset off → champion = b, runner-up = a. Complete.
- GF2 decided → champion = winner, runner-up = loser. Complete.
- `_unadvance` of GF1: clear GF2 entries and set GF2 back to `pending` (allowed only if GF2 isn't decided, via `_downstream_blocked`, which must treat a `cancelled` GF2 as not blocking). Clear the champion/runner-up.

**Final ranks** (DE): champion 1, runner-up 2. Then entries eliminated in LB round `r`: `rank = 3 + (number of entries eliminated in LB rounds > r)`, shared within the same round. S=8 example: LB R4 loser 3, R3 loser 4, R2 losers T-5, R1 losers T-7.

**Withdrawn entries**: v1 rule (the admin records walkovers).

### 5.5 Engine summary — public RPCs after v2
| RPC | Status |
|---|---|
| `generate_bracket(p_module)` | same signature; dispatches by format |
| `record_tournament_result(...)` | same signature; draws |
| `record_tournament_walkover`, `reset_tournament_match`, `schedule_tournament_match` | same signatures; shared helpers |
| `move_group_entry(p_entry, p_group)` | **new** (095) |
| `preview_knockout_qualifiers(p_module)` | **new** (096) |
| `build_knockout_stage(p_module, p_entry_ids uuid[] default null)` | **new** (096) |
| `reset_knockout_stage(p_module)` | **new** (096) |

### 5.6 Status-machine additions (`set_module_status`, in 094)
`open → seeding` additionally requires:
| format | check | error |
|---|---|---|
| all team modules | rosters complete | `ROSTER_INCOMPLETE` |
| `round_robin` | 2 ≤ N ≤ 20 | `NOT_ENOUGH_ENTRIES` / `TOO_MANY_ENTRIES` |
| `groups_knockout` | §5.3 setup guards | `FIELD_INVALID:group_count` / `…advance_per_group` |
| `double_elimination` | 3 ≤ N ≤ 64, `third_place_match = false` | `NOT_ENOUGH_ENTRIES` / `TOO_MANY_ENTRIES` / `FIELD_INVALID:third_place_match` |
| `single_elimination` | v1 (N ≥ 2) | — |

`seeding → open` also deletes groups (wipe, §5.0). `seeding → in_progress` stays as in v1 ("structure generated"). For groups, "structure" = stage 1 matches exist.

---

## 6. Read RPCs (migration 094; groups parts in 095/096)

### 6.1 `_league_table(p_module uuid, p_group uuid) returns table (...)` (internal)
Rows for entries in the league (`p_group` null) or in that group. Matches considered: `bracket_side in ('league','group')`, matching `group_id`, status `completed`/`walkover`.

| column | definition |
|---|---|
| `played, won, drawn, lost` | walkover = W/L; draws only from `is_draw` |
| `score_for, score_against, score_diff` | completed non-walkover matches only (v1 rule) |
| `points` | `won × points_win + drawn × points_draw + lost × points_loss` |
| `h2h_points` | points earned **only in matches against entries with the same `points`** (single-pass mini-league) |
| `form` | `text[]` of the last 5 results by `completed_at`: `'W'`/`'D'`/`'L'` |
| `rank` | `row_number()` ordered by B11: `points desc, h2h_points desc, score_diff desc, score_for desc, won desc, seed asc nulls last, name` |
| `status` | `'withdrawn'` if the entry is withdrawn, else `'active'` |

### 6.2 `get_module_matches(p_module uuid) returns table (...)` (public; supersedes `get_module_bracket` for the v2 client)
Every column of `get_module_bracket` **plus**: `stage_number, bracket_side, group_id, group_letter, code, entry_a_label, entry_b_label, loser_next_match_id, loser_next_slot, is_draw, auto_bye, can_draw boolean` (`= module.allow_draws and bracket_side in ('league','group')`). Entry refs include `profile_ids uuid[]`. Order: `stage_number, bracket_side order (winners, losers, grand_final, main, group, league), is_third_place, round_number, match_number`. Keep `get_module_bracket` as is (v1 client path; don't delete it in v2).

### 6.3 `get_module_standings_v2(p_module uuid) returns jsonb` (public)
```jsonc
{
  "kind": "knockout" | "league" | "groups",
  // knockout (single_elimination, double_elimination; groups after stage 2 also returns it under "knockout"):
  "rows": [ /* same row shape as v1 get_module_standings, plus "eliminated_side" */ ],
  // league:
  "table": [ { "rank", "entry_id", "name", "seed", "profile_ids", "played", "won", "drawn", "lost",
               "score_for", "score_against", "score_diff", "points", "form", "status" } ],
  // groups:
  "groups": [ { "id", "letter", "name", "advance": 2,
                "table": [ /* league row */ + "qualified": bool|null, "final_position": int|null ] } ],
  "knockout": [ /* knockout rows, only when current_stage = 2 */ ],
  "final": [ { "rank", "rank_label", "entry_id", "name" } ]   // only when module completed (all formats)
}
```
- For double elimination the knockout `rows` use: `reached_label` = furthest round name with side prefix ("WB Semi-finals", "LB Round 3", "Grand Final"); `status` = `alive` / `eliminated` / `champion` / `withdrawn`; and a new field `losses` (0/1/2) shown as "1 loss" in the UI.
- The v1 `get_module_standings` stays as it is for v1 single-elim (the v1 client).

### 6.4 `get_module_groups(p_module uuid) returns jsonb` (095, public)
`[{ id, letter, name, entries: [{entry_id, name, seed}] }]`, used by the seeding screen before any match is played. (Standings v2 covers the rest.)

### 6.5 `get_module_detail`
No change needed beyond §4.1: `to_jsonb(module)` already returns the new columns. Add `counts.rosters_incomplete` (team modules: active entries with `members < roster_min`) and `counts.groups_finished boolean` (groups format).

---

## 7. Notifications (in 092 and 094)
- 092: rosters (§4.2).
- 094: `trg_tournament_match_events` result body for draws: `<A> drew with <B> <x>–<x> · <round> · <module>`. Grand-final reset: no special notification (GF2 gets the normal "scheduled"/"result" ones). Auto-byes and `cancelled` GF2 never notify (status `bye`/`cancelled` is not in the trigger's list; verify).
- 096: building the knockout sends **no extra notification**; qualifiers hear about their next match when it is scheduled. (A "You qualified" push would need a new type → constraint migration → stop and ask.)

---

## 8. Client

### 8.1 Types (`src/types/tournaments.ts`)
```ts
export type ParticipantType = 'individual' | 'team';
export type TournamentFormat = 'single_elimination' | 'round_robin' | 'groups_knockout' | 'double_elimination';
export type BracketSide = 'main' | 'winners' | 'losers' | 'grand_final' | 'league' | 'group';

// TournamentModule gains:
//   format: TournamentFormat; participant_type: ParticipantType;
//   roster_min/roster_max/lineup_size: number | null; allow_draws: boolean;
//   points_win/points_draw/points_loss: number; rr_legs: 1 | 2;
//   group_count/advance_per_group: number | null; grand_final_reset: boolean; current_stage: 1 | 2;

export type TournamentEntryMember = { id: string; name: string; is_captain: boolean;
  squad_number: number | null; profile: ProfileLite | null; fields: Record<string, string> };
// TournamentEntry gains: member_count: number; members: TournamentEntryMember[];

// BracketEntryRef gains: profile_ids: string[];
// TournamentMatch gains: stage_number; bracket_side: BracketSide; group_id: string | null;
//   group_letter: string | null; code: string | null; entry_a_label/entry_b_label: string | null;
//   loser_next_match_id: string | null; loser_next_slot: 'a'|'b'|null; is_draw: boolean;
//   auto_bye: boolean; can_draw: boolean;

export type LeagueRow = { rank: number; entry_id: string; name: string; seed: number | null;
  profile_ids: string[]; played: number; won: number; drawn: number; lost: number;
  score_for: number; score_against: number; score_diff: number; points: number;
  form: ('W'|'D'|'L')[]; status: 'active' | 'withdrawn'; qualified?: boolean | null; final_position?: number | null };
export type StandingsV2 = { kind: 'knockout' | 'league' | 'groups'; rows?: TournamentStanding[];
  table?: LeagueRow[]; groups?: { id: string; letter: string; name: string; advance: number; table: LeagueRow[] }[];
  knockout?: TournamentStanding[]; final?: { rank: number; rank_label: string; entry_id: string; name: string }[] };
export type KnockoutQualifier = { entry_id: string; name: string; group_letter: string; position: number;
  label: string; suggested_seed: number };
export type ModuleSettingsPatch = Partial<Pick<TournamentModule, 'participant_type' | 'roster_min' |
  'roster_max' | 'lineup_size' | 'format' | 'allow_draws' | 'points_win' | 'points_draw' | 'points_loss' |
  'rr_legs' | 'group_count' | 'advance_per_group' | 'grand_final_reset'>>;
export type TeamMemberInput = { id?: string; name: string; profile_id: string | null;
  field_values: Record<string, string>; is_captain: boolean; squad_number: number | null };
```
`TournamentStanding` gains optional `eliminated_side?: BracketSide | null` and `losses?: number`. Write everything fully typed (no `any`).

### 8.2 Services (`src/services/tournaments.ts`, one fn per RPC, house style)
`updateModuleSettings(moduleId, patch)` · `upsertTeamEntry(moduleId, entryId|null, name, members)` · `fetchModuleMatches(moduleId)` (replaces `fetchModuleBracket` in the hook) · `fetchModuleStandingsV2(moduleId)` · `fetchModuleGroups(moduleId)` · `moveGroupEntry(entryId, groupId)` · `previewKnockoutQualifiers(moduleId)` · `buildKnockoutStage(moduleId, entryIds|null)` · `resetKnockoutStage(moduleId)`.

### 8.3 Lib
- `tournamentFormat.ts`: `FORMAT_LABEL` (`Knockout`, `League`, `Groups + knockout`, `Double elimination`) + `FORMAT_HINT` one-liners; `participantLabel(module)` → `Singles`, `Doubles`, `Teams (11–18 players)`; `DEFAULT_ROSTER: Record<Sport, {min,max,lineup}|null>` (§3.1 table); `allowedParticipantTypes(sport)` (B3); `defaultAllowDraws(sport)`; `sideLabel(side)`; `formatLine(module)` for the module header (`Groups + knockout · Teams · 4 groups, top 2`).
- `tournamentErrors.ts`: new codes + the `@<index>` suffix parser (→ "Player 3: CMS ID is required."):
  `WRONG_PARTICIPANT_TYPE` "This module takes teams, not individual entries." (and vice versa) · `ROSTER_INCOMPLETE` "Some teams don't have enough players yet." · `ROSTER_TOO_LARGE` "This team has more players than allowed." · `DUPLICATE_MEMBER_CMS_ID` "A player with this CMS ID is already on a team in this module." · `DUPLICATE_MEMBER_PROFILE` "This user is already on a team in this module." · `DUPLICATE_SQUAD_NUMBER` "Two players have the same squad number." · `TOO_MANY_ENTRIES` "Too many entries for this format." · `GROUPS_NOT_FINISHED` "Finish all group matches first." · `STAGE_LOCKED` "The knockout has been built — group results are locked. Undo the knockout first."
- `bracketLayout.ts`: generalise `layoutBracket` into `layoutTree(matches, opts)` where a node's y is: round 1 (or the first round present) stacked; later rounds → midpoint of its **in-section** feeders (matches of the same `bracket_side` whose `next_match_id` points to it); one feeder → the feeder's y; none (a deleted dead LB match) → stacked position by `match_number` using the previous round's pitch. Keep `layoutBracket` as a thin wrapper so v1 call sites and `devSelfCheck()` keep their output. Add self-checks for an LB of S=8 and S=16 (node counts 6 and 14; no overlapping nodes).

### 8.4 Hook `useTournamentModule`
Fetch `fetchModuleMatches` + `fetchModuleStandingsV2` (instead of bracket + v1 standings) and, for `groups_knockout` in `seeding`, `fetchModuleGroups`. Realtime is unchanged (`tournament_matches`, debounce 400 ms → refetch matches + standings). Expose `matches`, `standings: StandingsV2 | null`, `groups`, and derived `bySide` maps. Keep the existing return fields (`bracket` = `matches` filtered to the current knockout side) so the untouched v1 components keep compiling.

---

## 9. Screens (wireframes; phone width; design rules in PLAN.md §11)

### 9.1 Module form, `module-form.tsx` (Step 29)
After the SPORT pills add two sections. Changing sport re-applies the defaults (only while it's still editable).
```
 FORMAT *
 ( Knockout )( League )( Groups + knockout )( Double elim )     PillSelect, wraps
 Lose once and you're out.                                       caption muted = FORMAT_HINT
 ── format-specific ──────────────────────────────
 League / Groups:   LEGS ( Once )( Home & away )
                    DRAWS ALLOWED                       [toggle]   hidden for racket sports
                    POINTS  Win [3]  Draw [1]  Loss [0]           MiniStepper ×3 (0–10)
 Groups only:       GROUPS [4]   ADVANCE PER GROUP [2]           MiniStepper
                    "16 entries → 4 groups of 4 · top 2 → 8-team knockout"  (live caption)
 Knockout / Groups: 3RD-PLACE MATCH [toggle]                      (existing)
 Double elim:       GRAND FINAL RESET [toggle]  "If the losers-bracket team wins the final, play once more."
 ─────────────────────────────────────────────────
 PLAYERS *
 Racket:  ( Singles )( Doubles )        Team sports: "Teams" (static row)     Other: ( Individual )( Teams )
 Teams:   SQUAD SIZE  min [11]  max [18]   PLAYERS ON FIELD [11]
          "Each team needs 11–18 players before seeding."
```
- PLAYERS is locked (disabled look + caption "Can't change after entries are added") when `entry_count > 0` or the status is past `open`. FORMAT is locked once a bracket exists.
- Save = `createModule`/`updateModule`, then `updateModuleSettings(full v2 object)`. If the second call fails on create, show the error and stay on the form in **edit** mode (the module already exists).
- Seeding pills stay. For league formats they read "Seeding decides the fixture order and the last tiebreak".

### 9.2 Entries tab + EntrySheet (Step 30)
```
 Search [ team or player name      ]          matches team names AND member names
 8 teams
 ┌────────────────────────────────┐
 │ (1)  Thunder FC        14 👥   │  member count chip (caption, Users icon 12)
 │      Captain: Ali R.           │  caption muted
 │                 (7/11 ⚠)      │  admins only: incomplete roster → warning pill
 └────────────────────────────────┘
 Doubles row: "(3) Ali R. / Omar F."  second line = schools of both (public fields)
```
EntrySheet for teams: team name, status, then **ROSTER (14)**, one row per member: `UserAvatar 24` (if linked) · name · `©` captain badge · `#10` squad number · public fields caption. Admins see private fields with 🔒, the member sees their own. Tap a linked member → `/profile/[id]`. Admin actions are unchanged (Edit → team entry form, Withdraw, Delete).

### 9.3 Team entry form, `entry-form.tsx` renders the team variant when `participant_type = 'team'` (Step 30)
```
┌────────────────────────────────────┐
│ ×           Add Team               │  "Edit Team"
├────────────────────────────────────┤
│ TEAM NAME *    [ Thunder FC      ] │  doubles: auto-fills "P1 / P2" from the names until edited
│ PLAYERS  7 / 11–18                 │  label muted; ⚠ warning colour when below min
│ ┌────────────────────────────────┐ │
│ │ 1  Ali Raza   © #10   [edit][×]│ │  tap row → MemberSheet
│ │ 2  Omar F.        #7  [edit][×]│ │
│ └────────────────────────────────┘ │
│ [ + Add player ]   (secondary)     │  hidden at roster_max
│ [         Save team          ]     │
│ [ Save & add another ] (create)    │
└────────────────────────────────────┘
 Doubles: no list; two fixed cards "PLAYER 1" / "PLAYER 2", each expanding the member fields inline.
```
**MemberSheet** (`BottomSheet`, `src/components/tournaments/MemberSheet.tsx`): the entry fields rendered with `EntryFieldControl` (the same field order and validation mirror as the individual entry form), LINK APP USER (`ProfilePickerSheet`), CAPTAIN switch (turning it on clears it on the others), SQUAD NUMBER (team sports only, numeric 0–99), [Done]. Members live in local state until **Save team**, which sends the whole roster once. Server errors with `@i` focus the sheet of player *i* and show the inline field error.

### 9.4 Module page tabs per format (Steps 34, 37, 40)
| format | tabs (SegmentedControl compact, scrollable) | default |
|---|---|---|
| single_elimination | Bracket · Standings · Matches · Entries · Info (v1) | Bracket if exists else Entries |
| round_robin | **Table** · Matches · Entries · Info | Table if fixtures exist else Entries |
| groups_knockout | **Groups** · Bracket · Matches · Entries · Info | Groups if fixtures exist; Bracket once `current_stage = 2` |
| double_elimination | Bracket · Standings · Matches · Entries · Info | Bracket if exists |

The header caption uses `formatLine(module)`.

### 9.5 League table, `LeagueTable.tsx` (Step 34)
```
┌───┬──────────────────┬──┬──┬──┬──┬────┬───┬───────────┐
│ # │ Team             │P │W │D │L │+/- │Pts│ Form      │   # and Team pinned; rest scrolls (StandingsTable recipe)
├───┼──────────────────┼──┼──┼──┼──┼────┼───┼───────────┤
│ 1 │ Thunder FC       │5 │4 │1 │0 │+9  │13 │ ●●●◐●     │   form dots: W success, D warning, L error (8px)
│ 2 │ Lions            │5 │3 │0 │2 │+2  │ 9 │ ●○●●○     │
└───┴──────────────────┴──┴──┴──┴──┴────┴───┴───────────┘
 P played · W won · D drawn · L lost · Pts points (W 3 · D 1 · L 0)
```
- Racket sports hide **D** and the +/- header reads "Games +/-".
- The completed league shows the champion row in a warning tint (v1 recipe); own row uses `backgroundSelected` (match `profile_ids`).
- Groups: `qualified` rows (or, while the stage is running, rows inside the top `advance`) get a 3px `theme.success` left bar. Below the tables: legend "■ Qualifies for the knockout".

### 9.6 Groups tab, `ModuleGroupsTab.tsx` (Step 40)
One `Card` per group: header `Group A` (body 600) + "Top 2 advance" (caption muted) → `LeagueTable compact` (# Team P Pts +/-) → collapsible "Matches (6)" list of `TournamentMatchRow`. Admin banner when every group match is decided and `current_stage = 1`: `theme.success` tint "Group stage complete" + [Build knockout ▸] → knockout screen.

### 9.7 Knockout builder, `tournament/[id]/module/[moduleId]/knockout.tsx` (Step 41; register as a stack screen like `seeding`, add a route to `tournamentRoutes`)
```
┌────────────────────────────────────┐
│ ←  Build knockout                  │
├────────────────────────────────────┤
│ 8 qualifiers → 8-team bracket      │
│  1  A1  Thunder FC        [↑][↓]   │  label pill (A1) + name
│  2  B1  Lions             [↑][↓]   │
│  …                                 │
│ ⚠ A1 meets A2 in round 1           │  live conflict warnings (computed client-side with the seed order)
│ ( Reset to suggested order )       │  ghost
│ [  Build knockout bracket  ]       │  primary → confirm "Group results will be locked."
└────────────────────────────────────┘
```
Module manage gets an "Undo knockout" ghost button while it's allowed (`reset_knockout_stage`, confirm).

### 9.8 Seeding screen (Step 40)
For `groups_knockout`: the existing seed list + [Draw groups & fixtures] (= `generateBracket`). After generation the screen shows the groups (from `fetchModuleGroups`). Tapping an entry opens a sheet "Move to group" with group pills → `moveGroupEntry`. Copy: "12 entries → 4 groups of 3 · 12 group matches". For round-robin: the button reads [Generate fixtures], with copy "8 entries · 7 matchdays · 28 matches". For double elimination: [Generate bracket], with copy "6 entries → 8-slot winners bracket · 2 byes".

### 9.9 Double-elimination bracket (Step 43)
`BracketView` gets a `side` prop. On DE modules the Bracket tab shows `( Winners )( Losers )( Final )` (SegmentedControl compact) above the round pills, and renders `layoutTree` for that side only. Final = GF1 (+ GF2 to its right, with the caption "Only played if the losers-bracket team wins" while pending, or "Not needed" when `cancelled`).
- Empty slots show `entry_x_label` (italic `textSecondary`, e.g. "Loser W2-1") instead of "TBD". Auto-bye matches render a single entry and a `BYE` caption.
- Own-path highlight uses `profile_ids`, across both sides.
- Standings tab (DE): the v1 table with a **Losses** column (0/1/2) instead of Reached when the module is running, and "Reached" with the side prefix when it's completed.

### 9.10 Matches tab + Result sheet (Steps 36, 40, 43)
- Group the sections by `stage → side → round` with headers such as `MATCHDAY 3`, `GROUP A · MATCHDAY 1`, `WB SEMI-FINALS · BEST OF 3`, `LB ROUND 2`, `GRAND FINAL`. Groups format: extra chips row `(All)(A)(B)(C)…`.
- `TournamentMatchRow` / sheet title prefix: the match `code`.
- `ResultEntrySheet`: when `match.can_draw` and the scores are level → no winner picker; show the caption "Recorded as a draw". Otherwise v1 behaviour. A drawn match renders as `1 – 1 · Draw` (no ✓).

### 9.11 Module manage (Steps 31, 41)
Checklist additions: `✓ Rosters complete (8/8 teams)` / `○ 2 teams need more players` (tap → Entries tab filtered). Groups: `○ Group stage (18/24 matches)` → `✓` + [Build knockout]. Status button copy for league formats: seeding → "Start league" / "Start group stage".

---

## 10. Backward-Compatibility & Safety Checklist
- [ ] v1 `sql-tests.sql` passes after **every** v2 DB step.
- [ ] No existing non-tournament table, RPC, trigger or edge function is touched.
- [ ] v1 tournament RPCs: same signatures (except the agreed drop+recreate of `get_module_entries`, Ground Rule 3). `get_module_bracket` and `get_module_standings` are untouched.
- [ ] No new notification types; the check constraint is unchanged.
- [ ] PII: a member's private fields are visible only to module admins and that member (test with a teammate account and a stranger account).
- [ ] RLS: authenticated users cannot write `tournament_entry_members`, `tournament_groups`, `tournament_group_entries` (test).
- [ ] `PRIVACY_POLICY.md` draft (owner approves): team rosters store the same participant details per player.
- [ ] `AGENTS.md` updated at the end (structure, data model, formats, rosters, next migration number).

---

## 11. Test Matrix (`docs/tournaments/sql-tests-v2.sql`)
Each DB step adds its block. Required cases:

**Rosters (steps 25–27)**: create a doubles module and a football module (roster 3–5 for test speed); team with 0/2/5/6 members (6 → `ROSTER_TOO_LARGE`); `open → seeding` with an incomplete team → `ROSTER_INCOMPLETE`; same CMS ID on two teams → `DUPLICATE_MEMBER_CMS_ID`; same profile twice in one payload → `DUPLICATE_MEMBER_PROFILE@1`; two captains → error; duplicate squad number → error; edit roster in `in_progress` down to below min → `ROSTER_INCOMPLETE`; `upsert_tournament_entry` on a team module → `WRONG_PARTICIPANT_TYPE`; member field validation errors carry `@i`; PII: stranger sees no private member fields, member sees own only, admin sees all; `my_role = 'entrant'` for a linked member in `get_tournaments`/`get_module_detail`; notifications: linked members get `tournament_entry_added` (published only) and match results; a full single-elim run with teams completes.

**Round-robin (steps 32–33)**: N = 2, 3, 4, 5, 6, 7 × legs 1, 2: match count = `legs·N(N−1)/2`; each pair meets exactly `legs` times; no entry appears twice in a matchday; odd N: each entry rests exactly `legs` times. Draws: allowed when `allow_draws`, `TIE_NEEDS_WINNER` when not, and never allowed for racket sports (settings RPC rejects). Points/tiebreak: build a 4-entry league with a crafted 2-way tie on points broken by H2H, and a 3-way tie broken by score diff. Assert the exact ranks. Completion: final ranks 1..N, champion/runner-up/third set, status completed; edits are blocked after completion.

**Groups (steps 37–38)**: N = 8 (2 groups, top 2), 10 (3 groups uneven, top 1 → 3 qualifiers → bye), 16 (4 groups, top 2). Snake assignment exact; `move_group_entry` keeps ≥ 2 per group and rebuilds fixtures; `preview_knockout_qualifiers` before all matches are decided → `GROUPS_NOT_FINISHED`; suggested order has no same-group R1 pair for the 16/4/2 case; build → stage 2 exists, group match edit → `STAGE_LOCKED`; `reset_knockout_stage` works before a knockout match is played and fails after; full run completes with non-qualifier shared ranks (`T-9` for 3rd-placed in 16/4/2).

**Double elimination (steps 39, 42)**: N = 3, 4, 5, 6, 7, 8, 9, 12, 16. For each, play every playable match (random winner) until completion and assert: the module completes; the champion has 0 or 1 losses; every other entry has exactly 2 losses (walkovers count); no entry plays in two undecided matches at once; LB match count = `S − 2 − (deleted dead matches)`. Grand final: case WB champion wins GF1 → GF2 `cancelled`; case LB champion wins GF1 → GF2 filled → decide → complete; reset off → completes after GF1. Reset/edit: reset a WB R1 result whose loser went into an auto-bye that already advanced → cascade reverts cleanly; `DOWNSTREAM_PLAYED` when a real downstream match is decided. Ranks for S=8 match §5.4.

**Regression**: v1 `sql-tests.sql` unchanged and passing.

---

## 12. Error Codes Added in v2
`WRONG_PARTICIPANT_TYPE`, `ROSTER_INCOMPLETE`, `ROSTER_TOO_LARGE`, `DUPLICATE_MEMBER_CMS_ID[@i]`, `DUPLICATE_MEMBER_PROFILE[@i]`, `DUPLICATE_SQUAD_NUMBER`, `FIELD_REQUIRED:<key>@i`, `FIELD_INVALID:<key>@i`, `TOO_MANY_ENTRIES`, `GROUPS_NOT_FINISHED`, `STAGE_LOCKED`, plus `FIELD_INVALID:` variants for the new settings keys.

---

## 13. Step-by-Step Breakdown (continues v1 numbering; one step per session)

Order: **rosters first** (independent, smallest), then **round-robin** (introduces draws and league tables), then **groups + knockout** (reuses round-robin and single-elim), then **double elimination** (most complex engine work). Each phase is DB → owner applies + runs tests → client.

### Phase H — Rosters
| # | Step | Deliverables | Done when |
|---|---|---|---|
| 25 | **Roster schema** | `090_add_tournament_rosters.sql` (§3.1): module columns, `tournament_entry_members`, indexes, RLS, triggers, helpers `_entry_profile_ids` / `is_entry_participant` / `is_module_participant`. Ask the owner B1–B8 + Ground Rule 3 question first | Owner applied; v1 tests still pass |
| 26 | **Roster RPCs + reads** | `091_add_tournament_roster_rpcs.sql` (§4.1): `_validate_entry_field_values` refactor, `update_tournament_module_settings` (roster keys only for now; format keys are added in step 32), `upsert_team_entry`, guards in `upsert_tournament_entry` and `set_module_status`, `get_module_entries` drop+recreate, `my_role` changes, `profile_ids` in `get_module_bracket` entry refs (jsonb, no shape change). Roster tests in `sql-tests-v2.sql` | Owner applied; v1 + v2 roster tests pass |
| 27 | **Roster notifications** | `092_update_tournament_notifications_for_rosters.sql` (§4.2) + tests | Applied; rows created for linked members |
| 28 | **Client foundation (rosters)** | types, services, `tournamentFormat` roster helpers, error codes incl. `@i` parsing, hook fields | `tsc` + lint pass |
| 29 | **Module form: players section** | §9.1 PLAYERS part (+ sport defaults, lock rules), save via `updateModuleSettings` | Doubles + football module created on device |
| 30 | **Team entry form + roster display** | §9.2, §9.3: team variant of `entry-form.tsx`, `MemberSheet`, Entries tab, EntrySheet roster | Football team with 12 players saved; private fields hidden for a stranger account |
| 31 | **Manage checklist + end-to-end** | §9.11 rosters line; verify a doubles single-elim module end-to-end (bracket shows team names, own-path highlight via `profile_ids`, members get pushes) | Owner device check |

### Phase I — Round-robin
| # | Step | Deliverables | Done when |
|---|---|---|---|
| 32 | **Formats schema** | `093_add_tournament_formats_schema.sql` (§3.2) incl. constraint swaps; extend `update_tournament_module_settings` with the format keys (`create or replace`) | Applied; v1 tests pass |
| 33 | **Engine refactor + round-robin + draws** | `094_add_tournament_engine_v2.sql`: §5.0 refactor (run v1 tests on the refactor **before** adding RR code, in the same step), §5.1 shared changes, §5.2, §5.6, `_league_table`, `get_module_matches`, `get_module_standings_v2` (knockout + league kinds), draw notification body. RR tests | Applied; v1 + RR tests pass |
| 34 | **Client: formats foundation + league table** | types/services/hook switch to `get_module_matches` + standings v2 (v1 tabs keep working); `LeagueTable`; RR tab set (§9.4) | `tsc` + lint; v1 single-elim module still renders the same |
| 35 | **Module form: format section** | §9.1 FORMAT part (all four, with format-specific fields) | Each format can be created and saved |
| 36 | **RR matches + results + seeding copy** | §9.10 (matchday grouping, draws in the result sheet), §9.8 RR copy, status button copy | Full league played on device; table matches the SQL |

### Phase J — Groups + knockout
| # | Step | Deliverables | Done when |
|---|---|---|---|
| 37 | **Group stage engine** | `095_add_tournament_group_stage.sql`: generation (§5.3), `move_group_entry`, `get_module_groups`, groups kind in standings v2, `counts.groups_finished` | Applied; group tests pass |
| 38 | **Knockout stage engine** | `096_add_tournament_knockout_stage.sql`: `preview_knockout_qualifiers`, `build_knockout_stage`, `reset_knockout_stage`, `STAGE_LOCKED`, groups completion + ranks. Tests | Applied; full groups tests pass |
| 39 | **Double-elim engine** | `097_add_tournament_double_elimination.sql`: §5.4 incl. dead-slot resolution, auto-byes, GF/GF2, DE ranks, DE standings rows; `_downstream_blocked` auto-bye look-through. DE tests | Applied; DE tests pass for every N in §11 |
| 40 | **Client: groups tab + seeding groups mode** | §9.6, §9.8 groups part, Matches tab group chips | Groups drawn, moved and played on device |
| 41 | **Client: knockout builder** | §9.7 screen + route + manage "Build/Undo knockout" | Knockout built from the app; bracket tab shows stage 2 with `A1`/`B2` labels |

> Step 39 sits here (before the DE client) so the owner can apply and test all format SQL in one sitting if they prefer. It doesn't depend on 40–41.

### Phase K — Double elimination client + finish
| # | Step | Deliverables | Done when |
|---|---|---|---|
| 42 | **Bracket layout generalisation** | `layoutTree` (§8.3) + self-checks; `layoutBracket` output unchanged (compare the v1 sample numbers in PROGRESS step 8) | Self-check passes; v1 bracket renders identically |
| 43 | **DE bracket UI + standings** | §9.9, §9.10 DE parts | 6- and 9-entry DE played to completion on device, incl. GF reset |
| 44 | **Polish & docs** | empty/loading/error/dark-mode audit of the new screens, accessibility labels, `AGENTS.md` (tournaments section: formats, rosters, new tables/RPCs, next migration number), `PLAN.md` §1.4 updated, What's New entry draft, privacy draft addition | Owner sign-off |

---

## 14. Progress Tracking
Same rules as `PLAN.md` §15. The v2 steps live in `PROGRESS.md` under **"v2 — Rosters & formats"**. Record every B-assumption answer under *Decisions* before the step that needs it. Record every migration-number shift or file split under *Plan deviations*, and edit the affected section of this file.
