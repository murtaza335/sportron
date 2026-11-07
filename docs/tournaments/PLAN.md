# Tournaments — Implementation Plan (v1)

> **Audience:** the implementing agent (Claude Sonnet) and the project owner.
> **Status:** PLAN — nothing implemented. Branch: `dev`.
> **Before every work session:** read `AGENTS.md` → this file → `docs/tournaments/PROGRESS.md`. Do **one step** from §14, then update `PROGRESS.md` (see §15). Never do several phases in one go.

---

## 0. Ground Rules for the Implementer

1. **Follow `AGENTS.md`** — especially *Backward Compatibility (mandatory)*, *Data Access & Security*, and *Edge Functions*. This plan never overrides those rules.
2. **Design language must be identical to the current app** (§11). No new UI libraries, fonts, colour values, or component styles. Reuse `ThemedText`, `Button`, `Card`, `SegmentedControl`, `UserAvatar`, `ScoreCounter`, `alert()` and the existing sheet/modal/header patterns. If something new is needed, build it from theme tokens and match the closest existing screen.
3. **Additive only.** New tables, functions, columns on *new* tables. Never alter/drop existing tables, columns or RPCs. Next migration number is **084** (check `supabase/migrations/` first — if 084 is taken, use the next free number and note it in `PROGRESS.md`).
4. **Reads through RPCs**, writes through RPCs. Every `SECURITY DEFINER` function starts with an `auth.uid()` guard, uses `SET search_path = public`, and returns `RETURNS TABLE (...)` / scalar / `jsonb` (never `SETOF RECORD`).
5. **You cannot apply migrations to the database.** Write the migration + a test script, then ask the owner to run them (Supabase SQL editor). Record "written / applied / verified" separately in `PROGRESS.md`. Never point anything at production data destructively; test scripts must run inside `BEGIN; … ROLLBACK;`.
6. **Verification each step:** `npx tsc --noEmit` and `npm run lint` must pass with no new errors. State in `PROGRESS.md` what you could not verify (e.g. visual check needs a device).
7. **No commits/pushes unless the owner asks.** Don't touch unrelated code. If a step turns out bigger than expected, split it and record the split in `PROGRESS.md`.
8. **When unsure, stop and ask** — don't invent product rules. Open assumptions are listed in §1.3.

---

## 1. Product Scope

### 1.1 Hierarchy

```
Platform owner (you — SQL editor / service_role only)
│   creates Tournaments, sets their status, assigns Tournament Admins
│
└── TOURNAMENT  (top-level entity — NOT linked to any sport)
    │   e.g. "LUMS Sports Gala 2026"
    │   Tournament Admins (many, assigned by owner in DB)
    │     • rename the tournament (only editable tournament field)
    │     • manage the tournament's ENTRY FORM fields
    │     • create / edit / delete MODULES
    │     • assign / remove MODULE ADMINS
    │     • have full module-admin powers in every module of their tournament
    │
    ├── Champions (shown on the tournament page ABOVE the module list)
    │
    └── MODULE  (a "channel" — linked to exactly ONE sport)
        │   e.g. "Table Tennis — Men's Singles", "Football 5-a-side"
        │   Module Admins (many, assigned by tournament admins)
        │     • configure the module (rules, 3rd-place match, seeding, rounds)
        │     • ADD / edit / withdraw ENTRIES (no self-registration)
        │     • seed, generate bracket, start
        │     • schedule matches, enter ALL results, record WALKOVERS
        │
        ├── ENTRIES   (participants; generic form: Name, CMS ID, School, Phone, Email + custom fields)
        ├── ROUNDS    (Round of 16 … Final, + optional 3rd-place; per-round best-of / notes / schedule)
        └── MATCHES   (single-elimination bracket; winners auto-advance)
```

### 1.2 Decided (owner answers)
| Topic | Decision |
|---|---|
| Tournament creation | Owner only, via SQL. No in-app creation |
| Tournament admins | Owner assigns via SQL. Tournament admins **cannot** add tournament admins |
| Tournament edits by tournament admins | **Name only** (+ entry-form fields, modules, module admins) |
| Sport link | Tournament has **no sport**. Each **module** has exactly one sport. Several modules may share a sport (e.g. Men's / Women's singles) |
| Community link | None in v1. `tournaments.community_id` nullable column is added for later |
| Format | **Single elimination** per module |
| Entries | **Added by module admins only. No self-registration.** Optionally linked to an app user (for notifications + "Mine") |
| Entry form | Generic. **Mandatory core fields: Name, CMS ID, School, Phone, Email** (cannot be removed or made optional). Tournament admins can **add / edit / remove custom fields**. Form is per tournament, shared by all its modules |
| Results | Module admins (and tournament admins) enter all results |
| Walkover | Available. Module admin records it; bracket advances automatically |
| 3rd-place match | Optional, per module (default off) |
| Champions | Displayed on the tournament page **before** the modules list |
| Visibility | All non-draft tournaments are public to signed-in users |
| Navigation | New **centre tab** in the bottom bar with a **raised circular bump** in the bar's top border (§12.1) |
| Requests | "Request a tournament" (from the first brief) is **deferred** to an optional final step (§14, step 24) |

### 1.3 Assumptions (confirm with the owner before the step that depends on it)
| # | Assumption | Affects step |
|---|---|---|
| A1 | Tournament admins (not the owner) assign module admins | 3, 18 |
| A2 | Tournament admins automatically have module-admin powers in all modules of their tournament | 1 |
| A3 | Private core fields: **CMS ID, Phone, Email** — visible only to tournament/module admins. **Name, School** are public. Custom fields have a public/private toggle (default private) | 1, 2, 17 |
| A4 | CMS ID must be unique **within a module** (the same student can play several modules) | 1 |
| A5 | The centre tab shows the icon only (no label under it); header title is "Tournaments" | 9 |
| A6 | Entries are **individuals or teams by name only** — no roster/members list in v1 (the generic form replaces the earlier roster idea) | 1 |

### 1.4 Out of scope (v1)
Self-registration, round-robin/groups/double-elim, player-reported scores, in-app tournament creation, tournament/module chat, payments, community-hosted tournaments, team rosters, check-in flow, profile badges for champions.

---

## 2. Roles & Permissions Matrix

| Action | Owner (SQL) | Tournament admin | Module admin | Linked entrant | Any signed-in user |
|---|:-:|:-:|:-:|:-:|:-:|
| Create tournament / change status / description / cover / dates | ✅ | – | – | – | – |
| Assign tournament admins | ✅ | – | – | – | – |
| Rename tournament | ✅ | ✅ | – | – | – |
| Edit entry-form fields | ✅ | ✅ | – | – | – |
| Create / edit / delete module | ✅ | ✅ | – | – | – |
| Assign / remove module admins | ✅ | ✅ | – | – | – |
| Edit module settings & rounds, change module status | ✅ | ✅ | ✅ | – | – |
| Add / edit / withdraw entries, seed, generate bracket | ✅ | ✅ | ✅ | – | – |
| Schedule, record result / walkover, reset match | ✅ | ✅ | ✅ | – | – |
| See private entry fields (CMS ID, phone, email, private custom) | ✅ | ✅ | ✅ | own entry only | – |
| View published tournament, modules, bracket, standings, public entry fields | ✅ | ✅ | ✅ | ✅ | ✅ |
| View **draft** tournament | ✅ | ✅ | ✅ (their tournament) | – | – |
| View **draft** module | ✅ | ✅ | ✅ (that module) | – | – |

SQL helpers (all `STABLE SECURITY DEFINER`, `search_path = public`):
- `is_tournament_admin(p_tournament uuid) → boolean`
- `is_module_admin(p_module uuid) → boolean` — true if in `tournament_module_admins` **or** tournament admin of the parent (A2)
- `can_view_tournament(p_tournament uuid) → boolean` — `status <> 'draft'` or tournament admin or module admin of any module in it
- `can_view_module(p_module uuid) → boolean` — `can_view_tournament(parent)` and (`module.status <> 'draft'` or `is_module_admin`)

---

## 3. Lifecycles

### 3.1 Tournament (owner-controlled, SQL)
`draft` → `published` → `completed` · any → `cancelled`

| Status | Visible to | Notes |
|---|---|---|
| `draft` | its admins | admins can set up fields, modules, entries before going public |
| `published` | everyone | normal running state |
| `completed` | everyone | read-only for everyone except owner; champions section is the hero |
| `cancelled` | everyone | read-only banner "Cancelled" |

### 3.2 Module (module admin)
```
[draft] ⇄ [open] ⇄ [seeding] ──► [in_progress] ──► [completed]
   └─────────── any state except completed ─────────────► [cancelled]
```
| Status | Meaning | Allowed admin actions | Transition rule (`set_module_status`) |
|---|---|---|---|
| `draft` | hidden from public | everything | → `open` any time |
| `open` | public; entries list visible | add/edit/withdraw/delete entries, settings, rounds preview | → `seeding` needs ≥ 2 active entries; → `draft` allowed |
| `seeding` | entries frozen; seeds editable; draft bracket visible with banner | set seeds, (re)generate bracket, edit rounds | → `in_progress` needs a generated bracket; → `open` **deletes the generated bracket** (confirm dialog) |
| `in_progress` | bracket locked | schedule, results, walkovers, resets, withdraw entry | → `completed` is **automatic** when the final (and 3rd-place, if enabled) is decided |
| `completed` | final | none (owner can fix via SQL) | — |
| `cancelled` | stopped | none | — |

Tournament `draft`/`cancelled` overrides module visibility (a published module inside a draft tournament is still hidden).

---

## 4. Data Model — Migration `084_add_tournaments.sql`

All new objects. RLS enabled on every table. **Authenticated users get no INSERT/UPDATE/DELETE policies** — all writes via RPCs (§6). SELECT policies are listed per table.

```sql
-- ── tournaments ─────────────────────────────────────────────────────────────
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 3 and 80),
  description text check (char_length(description) <= 2000),
  organization text check (char_length(organization) <= 80),
  location text check (char_length(location) <= 120),
  image_url text,                                    -- Cloudinary cover (owner sets via SQL)
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft','published','completed','cancelled')),
  community_id uuid references public.communities(id) on delete set null,   -- FUTURE, unused in v1
  created_by uuid references public.profiles(id) on delete set null,       -- null when created via SQL
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- SELECT policy: can_view_tournament(id)

-- ── tournament_admins ───────────────────────────────────────────────────────
create table public.tournament_admins (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (tournament_id, profile_id)
);
-- SELECT policy: can_view_tournament(tournament_id). Writes: service_role only (owner).

-- ── tournament_entry_fields  (the generic entry form, per tournament) ──────
create table public.tournament_entry_fields (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,39}$'),   -- slug used in entries.field_values
  label text not null check (char_length(btrim(label)) between 1 and 40),
  field_type text not null default 'text'
    check (field_type in ('text','email','phone','number','select')),
  options jsonb,                       -- select only: ["Male","Female"]  (array of ≤ 20 strings)
  placeholder text check (char_length(placeholder) <= 60),
  is_required boolean not null default false,
  is_public boolean not null default false,
  is_core boolean not null default false,  -- core fields: cannot be archived, required forced true
  sort_order int not null default 0,
  archived_at timestamptz,             -- "removed" fields are archived, values kept
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, key)
);
-- SELECT policy: can_view_tournament(tournament_id)
-- TRIGGER after insert on tournaments → seed the 5 core fields:
--   key       label     type   required public core sort
--   name      Name      text   true     true   true 10    (value stored in entries.name, not field_values)
--   cms_id    CMS ID    text   true     false  true 20
--   school    School    text   true     true   true 30
--   phone     Phone     phone  true     false  true 40
--   email     Email     email  true     false  true 50
-- TRIGGER before update/delete on tournament_entry_fields: for is_core rows block delete, block
--   archiving, block changing key/field_type/is_required/is_public/is_core (label/placeholder editable).

-- ── tournament_modules  (sport channels) ───────────────────────────────────
create table public.tournament_modules (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  sport text not null,                 -- same allowed values as communities.sport (Sport union)
  description text check (char_length(description) <= 1000),
  rules_text text check (char_length(rules_text) <= 2000),
  venue text check (char_length(venue) <= 120),
  starts_at timestamptz,
  format text not null default 'single_elimination' check (format in ('single_elimination')),
  status text not null default 'draft'
    check (status in ('draft','open','seeding','in_progress','completed','cancelled')),
  third_place_match boolean not null default false,
  seeding_method text not null default 'manual' check (seeding_method in ('manual','random')),
  max_entries int check (max_entries between 2 and 128),
  bracket_generated_at timestamptz,
  champion_entry_id uuid,              -- FK added after tournament_entries exists
  runner_up_entry_id uuid,
  third_place_entry_id uuid,
  sort_order int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.tournament_modules (tournament_id, sort_order);
-- SELECT policy: can_view_module(id)

-- ── tournament_module_admins ───────────────────────────────────────────────
create table public.tournament_module_admins (
  module_id uuid not null references public.tournament_modules(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (module_id, profile_id)
);
-- SELECT policy: can_view_module(module_id)

-- ── tournament_entries ──────────────────────────────────────────────────────
create table public.tournament_entries (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.tournament_modules(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,  -- denormalised
  name text not null check (char_length(btrim(name)) between 1 and 60),
  profile_id uuid references public.profiles(id) on delete set null,   -- optional linked app user
  field_values jsonb not null default '{}'::jsonb,   -- { "cms_id": "...", "school": "...", ... }
  seed int check (seed >= 1),
  status text not null default 'active' check (status in ('active','withdrawn')),
  eliminated_round int,
  final_rank int,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.tournament_entries (module_id, status);
create unique index tournament_entries_cms_unique
  on public.tournament_entries (module_id, lower(field_values->>'cms_id'))
  where status = 'active' and coalesce(field_values->>'cms_id','') <> '';          -- A4
create unique index tournament_entries_profile_unique
  on public.tournament_entries (module_id, profile_id)
  where profile_id is not null and status = 'active';
-- SELECT policy: is_module_admin(module_id) OR profile_id = auth.uid()
--   (public reads go ONLY through get_module_entries / get_module_bracket, which strip private fields)

alter table public.tournament_modules
  add constraint tm_champion_fk  foreign key (champion_entry_id)  references public.tournament_entries(id) on delete set null,
  add constraint tm_runner_fk    foreign key (runner_up_entry_id) references public.tournament_entries(id) on delete set null,
  add constraint tm_third_fk     foreign key (third_place_entry_id) references public.tournament_entries(id) on delete set null;

-- ── tournament_rounds ───────────────────────────────────────────────────────
create table public.tournament_rounds (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.tournament_modules(id) on delete cascade,
  stage_number int not null default 1,       -- future multi-stage formats; always 1 in v1
  round_number int not null,                 -- 1 = first round … N = final (3rd-place uses N too)
  is_third_place boolean not null default false,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  best_of int not null default 1 check (best_of in (1,3,5,7)),
  rules_text text check (char_length(rules_text) <= 500),
  scheduled_start timestamptz,
  unique (module_id, stage_number, round_number, is_third_place)
);
-- SELECT policy: can_view_module(module_id)

-- ── tournament_matches ──────────────────────────────────────────────────────
create table public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.tournament_modules(id) on delete cascade,
  round_id uuid not null references public.tournament_rounds(id) on delete cascade,
  stage_number int not null default 1,
  round_number int not null,
  match_number int not null,                 -- 1-based, top → bottom within the round
  is_third_place boolean not null default false,
  entry_a_id uuid references public.tournament_entries(id) on delete set null,
  entry_b_id uuid references public.tournament_entries(id) on delete set null,
  next_match_id uuid references public.tournament_matches(id) on delete set null,
  next_slot text check (next_slot in ('a','b')),
  loser_next_match_id uuid references public.tournament_matches(id) on delete set null,  -- SF → 3rd place
  loser_next_slot text check (loser_next_slot in ('a','b')),
  status text not null default 'pending'
    check (status in ('pending','scheduled','completed','walkover','bye','cancelled')),
  scheduled_at timestamptz,
  venue text check (char_length(venue) <= 120),
  court text check (char_length(court) <= 40),
  score_a int check (score_a >= 0),
  score_b int check (score_b >= 0),
  score_detail jsonb,                        -- [{"a":11,"b":7}, …] per game/set, or null
  winner_entry_id uuid references public.tournament_entries(id) on delete set null,
  result_note text check (char_length(result_note) <= 200),   -- "Won on penalties 4–3", "Walkover: no-show"
  recorded_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (module_id, stage_number, round_number, match_number, is_third_place)
);
create index on public.tournament_matches (module_id, round_number, match_number);
-- SELECT policy: can_view_module(module_id)
-- alter publication supabase_realtime add table public.tournament_matches;   (live bracket)
```

Also in 084:
- `updated_at` triggers on all tables (reuse the project's existing updated_at trigger function if one exists — grep `supabase/migrations` for `updated_at` triggers; otherwise create `tournament_set_updated_at()`).
- Audit triggers: attach the existing audit trigger function from migration 045 to `tournaments`, `tournament_modules`, `tournament_entries`, `tournament_matches` (grep 045 for the function name and how it is attached).
- `sport` check on `tournament_modules`: copy the exact check used for `communities.sport` (grep migration 007/020).

---

## 5. Bracket Engine (SQL, inside migration `087`)

### 5.1 `generate_bracket(p_module uuid)`
Guard: `is_module_admin`, module status = `seeding`.
1. Delete existing rounds/matches of the module (cascade).
2. `entries` = active entries ordered by `seed nulls last, created_at`. If `seeding_method = 'random'`: shuffle entries that have no seed, keep seeded ones first. Write the final order back as `seed = 1..N`.
3. `size` = next power of two ≥ N (N ≥ 2). `R = log2(size)` rounds. `byes = size − N`.
4. Seed positions use the standard order so seeds 1 and 2 can only meet in the final:
   `order(2) = [1,2]`; `order(2k)` = for each `s` in `order(k)`: `[s, 2k+1−s]`.
   e.g. size 8 → `[1,8,4,5,2,7,3,6]` → R1 pairs (1v8)(4v5)(2v7)(3v6). Seed numbers > N are byes.
5. Rounds: `round_number 1..R`, names by entrants remaining `size / 2^(r−1)`: 2 → "Final", 4 → "Semi-finals", 8 → "Quarter-finals", else "Round of {n}". If `third_place_match`: extra round `round_number = R, is_third_place = true, name = '3rd Place'`. Default `best_of = 1` (admin edits later).
6. Matches: round r has `size / 2^r` matches. Match m in round r → `next_match_id` = match `ceil(m/2)` in round r+1, `next_slot = 'a'` if m odd else `'b'`. Semi-final matches get `loser_next_match_id` → 3rd-place match (`'a'` from SF1, `'b'` from SF2).
7. Fill round 1 slots from the seed order. A pair with one bye → `status = 'bye'`, winner = present entry, advance immediately (step 5.3). (With standard ordering a pair is never bye-vs-bye.)
8. `bracket_generated_at = now()`. Return the number of matches created.

### 5.2 `record_tournament_result(p_match, p_score_a, p_score_b, p_score_detail, p_winner, p_note)`
Guard: `is_module_admin`; module `in_progress`; both entries present; match not `bye`/`cancelled`.
- Winner = higher score. **Equal scores → `p_winner` required** (penalties/super-over/tiebreak), else raise `'TIE_NEEDS_WINNER'`.
- If the match was already decided (edit): allowed only if `next_match` (and `loser_next_match`) are not `completed`/`walkover`; otherwise raise `'DOWNSTREAM_PLAYED'`. If the winner changed, replace the advanced entry in the next match slot (and the loser in the 3rd-place slot).
- Set `status = 'completed'`, scores, detail, note, `recorded_by = auth.uid()`, `completed_at = now()`.
- Advance (5.3). Return the updated match row.

### 5.3 Advancement (shared internal function `_advance_tournament_match(p_match)`)
- Put winner into `next_match_id.next_slot`; if the next match now has both entries and has `scheduled_at`, set its status to `scheduled`, else leave `pending`.
- Put loser into `loser_next_match_id.loser_next_slot` if set.
- Loser: `eliminated_round = round_number` (not for SF losers when 3rd-place match is on — they are eliminated when the 3rd-place match resolves).
- If the match is the final (`next_match_id is null and not is_third_place`): set `champion_entry_id`, `runner_up_entry_id`. If 3rd-place exists, wait for it; set `third_place_entry_id` from it. When all terminal matches are decided → compute `final_rank` for every active entry (§7) and set module `status = 'completed'`.

### 5.4 `record_tournament_walkover(p_match, p_winner, p_note)`
Guard same as 5.2, but allowed when only **one** slot is filled *or* both are filled. `p_winner` must be one of the present entries. Status `walkover`, scores null, note defaults to `'Walkover'`. Advance (5.3). If neither side shows, the admin still picks one (v1 has no double walkover — show helper text in the UI).

### 5.5 `reset_tournament_match(p_match)`
Guard: admin, `in_progress`, next match (and loser-next) not decided. Clears scores/winner/note, status → `scheduled` if `scheduled_at` else `pending`, removes the advanced entries from next/loser-next slots, clears the loser's `eliminated_round`. Byes cannot be reset.

### 5.6 `schedule_tournament_match(p_match, p_at, p_venue, p_court)`
Guard: admin; module `seeding` or `in_progress`. Sets fields; status `scheduled` if both entries present and not decided.

### 5.7 `withdraw_tournament_entry(p_entry, p_reason)`
Allowed in `open` (just sets `withdrawn`), and `in_progress` (sets `withdrawn`; **does not** auto-resolve matches — the UI then prompts the admin to record a walkover for that entry's pending match). In `draft`/`open` the admin may also hard-delete via `delete_tournament_entry`.

---

## 6. RPC Catalogue

All `SECURITY DEFINER`, `SET search_path = public`, first line guards `auth.uid() is not null`, then permission helper. Reads return `jsonb` or `RETURNS TABLE`. Errors are raised with short codes (`'NOT_ALLOWED'`, `'INVALID_STATUS'`, `'FIELD_REQUIRED:cms_id'`, `'DUPLICATE_CMS_ID'`, `'TIE_NEEDS_WINNER'`, `'DOWNSTREAM_PLAYED'`, …) so the client can map them to friendly messages (§10.3).

### 6.1 Reads — migration `085_add_tournament_read_rpcs.sql`
| RPC | Returns |
|---|---|
| `get_tournaments(p_scope text)` | rows: tournament fields + `module_count`, `sports text[]`, `live_module_count`, `my_role` (`'tournament_admin'|'module_admin'|'entrant'|null`). Scopes: `live` (published, ≥1 module in_progress), `upcoming` (published, no module in_progress, not all completed), `past` (completed, or published with all modules completed), `mine` (any role), `all`. Hides what `can_view_tournament` hides |
| `get_tournament_detail(p_tournament)` | `jsonb`: `{ tournament, admins:[{id,username,avatar_url}], my_role, champions:[{module_id, module_name, sport, champion:{id,name}, runner_up:{…}, third:{…}}], modules:[{id,name,sport,status,entry_count,starts_at,venue,current_round_name, my_role}] }` |
| `get_tournament_entry_fields(p_tournament, p_include_archived bool default false)` | rows of fields ordered by `sort_order` |
| `get_module_detail(p_module)` | `jsonb`: module + rounds + module admins + `my_role` + counts |
| `get_module_entries(p_module)` | rows: `id, name, seed, status, eliminated_round, final_rank, profile:{id,username,avatar_url}|null, fields jsonb` — **`fields` contains only public, non-archived keys for non-admins; all keys for admins and for the linked entrant viewing their own entry** |
| `get_module_bracket(p_module)` | rows: every match + `entry_a/entry_b` as `{id,name,seed,profile_id}` + round name/best_of |
| `get_module_standings(p_module)` | rows per §7 |
| `search_profiles_for_tournament(p_query text)` | reuse pattern of `search_community_members` but over `public_profiles` (username ilike, limit 20) — used to link entrants and pick module admins. Guard: caller is a tournament or module admin of something |

### 6.2 Admin writes — migration `086_add_tournament_admin_rpcs.sql`
| RPC | Guard | Notes |
|---|---|---|
| `rename_tournament(p_tournament, p_name)` | tournament admin | trims; 3–80 chars |
| `upsert_tournament_entry_field(p_tournament, p_id uuid null, p_key, p_label, p_type, p_options, p_placeholder, p_required, p_public, p_sort)` | tournament admin | core rows: only label/placeholder/sort change; key immutable after create; key auto-slugged from label client-side |
| `archive_tournament_entry_field(p_field)` | tournament admin | blocked for core |
| `reorder_tournament_entry_fields(p_tournament, p_ids uuid[])` | tournament admin | |
| `create_tournament_module(p_tournament, p_name, p_sport, p_description, p_rules_text, p_venue, p_starts_at, p_max_entries, p_third_place, p_seeding_method)` | tournament admin | returns id; status `draft` |
| `update_tournament_module(p_module, …same fields…)` | module admin | `sport` changeable only in `draft`/`open` with 0 matches; `third_place_match`/`seeding_method` only before `in_progress` |
| `delete_tournament_module(p_module)` | tournament admin | only `draft`/`open`/`cancelled` |
| `add_module_admin(p_module, p_profile)` / `remove_module_admin(p_module, p_profile)` | tournament admin (A1) | |
| `set_module_status(p_module, p_status)` | module admin | enforces §3.2 |
| `upsert_tournament_entry(p_module, p_entry uuid null, p_name, p_profile uuid null, p_field_values jsonb)` | module admin | module `draft`/`open`; validates against **non-archived** fields: required present & non-blank; `email` regex `^[^@\s]+@[^@\s]+\.[^@\s]+$`; `phone` `^\+?[0-9\s-]{7,20}$`; `number` numeric; `select` ∈ options; strips unknown keys; respects `max_entries`; maps unique violations → `DUPLICATE_CMS_ID` / `DUPLICATE_PROFILE` |
| `delete_tournament_entry(p_entry)` | module admin | only `draft`/`open` |
| `withdraw_tournament_entry(p_entry, p_reason)` | module admin | §5.7 |
| `set_module_seeds(p_module, p_entry_ids uuid[])` | module admin | `open`/`seeding`; seeds 1..n in given order |
| `update_tournament_round(p_round, p_name, p_best_of, p_rules_text, p_scheduled_start)` | module admin | not after `completed` |

### 6.3 Engine — migration `087_add_tournament_bracket_engine.sql`
`generate_bracket`, `record_tournament_result`, `record_tournament_walkover`, `reset_tournament_match`, `schedule_tournament_match`, `get_module_standings` (if not in 085), plus the internal `_advance_tournament_match` (not granted to `authenticated`).

Grants: `revoke all on function … from public, anon; grant execute … to authenticated;` for every public RPC. Internal helpers: no grant.

---

## 7. Standings (single elimination)

`get_module_standings(p_module)` → one row per **active or withdrawn** entry that is in the bracket:

| column | definition |
|---|---|
| `rank` | from `final_rank` when completed; while running, provisional: alive entries first, then by `eliminated_round desc` |
| `rank_label` | `'1'`, `'2'`, `'3'`, `'T-3'`, `'T-5'`, `'T-9'` … (shared rank when eliminated in the same round) |
| `entry_id, name, seed, profile_id` | |
| `played, won, lost` | completed + walkover matches; **byes are not counted**; walkover counts as W for winner, L for loser |
| `score_for, score_against, score_diff` | sum of own/opponent score over completed (non-walkover) matches |
| `reached_round, reached_label` | furthest round reached: `'Champion'`, `'Final'`, `'Semi-finals'`, … ; `'3rd Place'` winner gets `'3rd'` |
| `status` | `'champion'`, `'alive'`, `'eliminated'`, `'withdrawn'` |
| `eliminated_by` | name of the entry that beat them (null if alive/champion) |

**Final rank**: champion 1, runner-up 2; with 3rd-place match: winner 3, loser 4; without: both SF losers 3 (`T-3`). Then QF losers 5 (`T-5`, or 5 if alone), R16 losers 9, etc. — rank = `2^(R − eliminated_round) + 1`.
**Order within a shared rank**: `score_diff desc`, `score_for desc`, `seed asc`.

---

## 8. Notifications — migration `088_add_tournament_notifications.sql` (Phase F)

Same pipeline as everything else: trigger inserts into `in_app_notifications` → existing `trg_fcm_push` → `send-notification`. **No edge-function change.**

| Type | Recipient | Fired when | data |
|---|---|---|---|
| `tournament_admin_assigned` | the new tournament admin | insert into `tournament_admins` | `tournamentId` |
| `tournament_module_admin_assigned` | the new module admin | insert into `tournament_module_admins` | `tournamentId, moduleId` |
| `tournament_entry_added` | linked profile | entry inserted with `profile_id`, or `profile_id` set later | `tournamentId, moduleId, entryId` |
| `tournament_match_scheduled` | linked profiles of both entries | `scheduled_at` set/changed while both entries present | `tournamentId, moduleId, matchId` |
| `tournament_match_result` | linked profiles of both entries | match → `completed`/`walkover` | same |
| `tournament_module_completed` | linked profiles of all entries + module admins | module → `completed` ("🏆 {champion} won {module} — {tournament}") | `tournamentId, moduleId` |

Only notify when the **tournament is published** (skip while draft — except the two *admin_assigned* types). Use the existing `_notification_already_exists` dedupe helper (grep migration 068/080).

Must also:
1. Extend the `in_app_notifications` type check constraint — copy the **latest** constraint definition (migration 082) and add the 6 types (drop + recreate constraint in the same migration, as 082 did).
2. `src/types/index.ts`: add the 6 types to `NotificationType`; add `tournament_updates: boolean` to `NotificationPreferences` + `DEFAULT_NOTIFICATION_PREFERENCES` (true).
3. `useFCM.navigateToNotification`: route `tournament_*` → `/tournament/[tournamentId]/module/[moduleId]` when `moduleId` present, else `/tournament/[tournamentId]`.
4. `updates.tsx` / `ActivityCard`: tap routing the same way; none of these types are actionable (Past Activity).
5. Old builds: verified that unknown types land in Past Activity and the tap handler hits `default: return` — safe.

---

## 9. Client Architecture

### 9.1 Files
```
src/types/tournaments.ts                 # all tournament types (re-export from src/types/index.ts)
src/services/tournaments.ts              # one function per RPC; throw on error (house style)
src/lib/tournamentErrors.ts              # RPC error code → friendly message
src/lib/bracketLayout.ts                 # pure layout math for the bracket (no React)
src/lib/tournamentFormat.ts              # status labels/colours, round labels, rank labels, field validation mirror
src/hooks/useTournaments.ts              # list by scope, reload on focus, 30s SWR cache (pattern: useChats.ts)
src/hooks/useTournament.ts               # tournament detail
src/hooks/useTournamentModule.ts         # module detail + bracket + standings + entries + realtime
src/components/tournaments/
  TournamentCard.tsx          TournamentStatusPill.tsx     ChampionsStrip.tsx
  ModuleCard.tsx              ModuleStatusPill.tsx (or shared StatusPill with a `kind` prop)
  BracketView.tsx             BracketMatchNode.tsx         BracketConnectors.tsx
  StandingsTable.tsx          StandingsChart.tsx           TournamentMatchRow.tsx
  TournamentMatchSheet.tsx    ResultEntrySheet.tsx         EntrySheet.tsx
  EntryFieldInput.tsx         ProfilePickerSheet.tsx       TournamentTabBarButton.tsx
  TabBarBumpBackground.tsx
src/app/(tabs)/tournaments.tsx
src/app/tournament/[id].tsx
src/app/tournament/[id]/manage.tsx
src/app/tournament/[id]/fields.tsx
src/app/tournament/[id]/module-form.tsx                 # modal; ?moduleId= for edit
src/app/tournament/[id]/module/[moduleId].tsx
src/app/tournament/[id]/module/[moduleId]/manage.tsx
src/app/tournament/[id]/module/[moduleId]/entry-form.tsx  # modal; ?entryId= for edit
src/app/tournament/[id]/module/[moduleId]/seeding.tsx
src/app/tournament/[id]/module/[moduleId]/rounds.tsx
```

### 9.2 Types (`src/types/tournaments.ts`)
```ts
export type TournamentStatus = 'draft' | 'published' | 'completed' | 'cancelled';
export type ModuleStatus = 'draft' | 'open' | 'seeding' | 'in_progress' | 'completed' | 'cancelled';
export type TournamentRole = 'tournament_admin' | 'module_admin' | 'entrant' | null;
export type EntryFieldType = 'text' | 'email' | 'phone' | 'number' | 'select';
export type TournamentMatchStatus = 'pending' | 'scheduled' | 'completed' | 'walkover' | 'bye' | 'cancelled';
export type TournamentScope = 'live' | 'upcoming' | 'past' | 'mine' | 'all';

export type Tournament = { id; name; description; organization; location; image_url; starts_at; ends_at;
  status: TournamentStatus; community_id: string | null; created_at; updated_at; };
export type TournamentListItem = Tournament & { module_count: number; sports: Sport[];
  live_module_count: number; my_role: TournamentRole; };
export type TournamentEntryField = { id; tournament_id; key; label; field_type: EntryFieldType;
  options: string[] | null; placeholder: string | null; is_required; is_public; is_core; sort_order; archived_at; };
export type TournamentModule = { id; tournament_id; name; sport: Sport; description; rules_text; venue; starts_at;
  format: 'single_elimination'; status: ModuleStatus; third_place_match: boolean; seeding_method: 'manual' | 'random';
  max_entries: number | null; bracket_generated_at: string | null; champion_entry_id; runner_up_entry_id;
  third_place_entry_id; sort_order: number; };
export type TournamentRound = { id; module_id; round_number; is_third_place; name; best_of: 1|3|5|7;
  rules_text; scheduled_start; };
export type TournamentEntry = { id; module_id; name; seed: number | null; status: 'active' | 'withdrawn';
  eliminated_round: number | null; final_rank: number | null;
  profile: Pick<Profile,'id'|'username'|'avatar_url'> | null; fields: Record<string, string>; };
export type BracketEntryRef = { id: string; name: string; seed: number | null; profile_id: string | null };
export type TournamentMatch = { id; module_id; round_id; round_number; match_number; is_third_place;
  entry_a: BracketEntryRef | null; entry_b: BracketEntryRef | null; next_match_id; next_slot;
  status: TournamentMatchStatus; scheduled_at; venue; court; score_a: number | null; score_b: number | null;
  score_detail: { a: number; b: number }[] | null; winner_entry_id: string | null; result_note: string | null;
  completed_at: string | null; round_name: string; best_of: number; };
export type TournamentStanding = { rank: number; rank_label: string; entry_id; name; seed; profile_id;
  played; won; lost; score_for; score_against; score_diff; reached_round; reached_label;
  status: 'champion' | 'alive' | 'eliminated' | 'withdrawn'; eliminated_by: string | null; };
export type TournamentChampion = { module_id; module_name; sport: Sport;
  champion: { id: string; name: string } | null; runner_up: {…} | null; third: {…} | null; };
```
(Write them fully typed — the `;`-only fields above are shorthand for `string` / `string | null` as appropriate.)

### 9.3 Hooks
- `useTournaments(scope)` → `{ tournaments, loading, refreshing, refresh }`; reload on focus (`useFocusEffect`), module-level 30 s cache keyed by scope.
- `useTournament(id)` → `{ detail, loading, refreshing, refresh, isTournamentAdmin }`.
- `useTournamentModule(moduleId)` → `{ module, rounds, entries, bracket, standings, myRole, isModuleAdmin, loading, refreshing, refresh }`. Subscribes to `supabase.channel('tournament-module-<id>')` Postgres changes on `tournament_matches` filtered `module_id=eq.<id>`; on any event, **debounce 400 ms** then refetch `bracket` + `standings` only. Unsubscribe on unmount.

### 9.4 `bracketLayout.ts` (pure, testable)
Input: matches of the main rounds (exclude 3rd place), number of rounds `R`. Constants: `NODE_W = 196`, `NODE_H = 76`, `COL_GAP = 40`, `ROW_GAP = 16`.
- `x(r) = (r − 1) × (NODE_W + COL_GAP)`
- Round 1: `y(1, m) = (m − 1) × (NODE_H + ROW_GAP)`
- Round r > 1: `y(r, m)` = midpoint of its two feeder nodes' centres − `NODE_H / 2`.
- Connector path for feeder → next: from feeder right-centre, horizontal `COL_GAP/2`, vertical to next node's centre-y, horizontal into next node's left edge.
- Output: `{ nodes: {matchId, x, y}[], connectors: {d: string, highlighted: boolean}[], width, height }`. 3rd-place node is placed under the final, labelled.

---

## 10. Cross-Cutting Behaviour

### 10.1 Loading / empty / error (every screen)
- First load: `ActivityIndicator color={theme.text}` centred (as `(tabs)/index.tsx`) or the skeleton style used in `community/[id].tsx` feed.
- Pull-to-refresh: `RefreshControl tintColor={theme.text}`.
- Empty: centred lucide icon (48, `theme.textSecondary`) + `ThemedText variant="heading"` + `ThemedText muted` line (copy in §12).
- Error: `alert('Something went wrong', friendlyMessage)` from `src/lib/alert.ts`; screen keeps previous data.

### 10.2 Permissions in UI
Hide (don't disable) admin controls for non-admins. Always rely on the server guard; UI hiding is cosmetic.

### 10.3 Error codes → copy (`src/lib/tournamentErrors.ts`)
`NOT_ALLOWED` "You don't have permission to do that." · `INVALID_STATUS` "That isn't possible at this stage." · `FIELD_REQUIRED:<key>` "<Label> is required." · `FIELD_INVALID:<key>` "<Label> looks invalid." · `DUPLICATE_CMS_ID` "An entry with this CMS ID already exists in this module." · `DUPLICATE_PROFILE` "This user already has an entry in this module." · `MAX_ENTRIES` "This module is full." · `TIE_NEEDS_WINNER` "Scores are level — pick the winner." · `DOWNSTREAM_PLAYED` "The next match has already been played. Reset it first." · `NOT_ENOUGH_ENTRIES` "Add at least 2 entries first." · `CORE_FIELD_LOCKED` "Core fields can't be removed." · fallback: error message.

### 10.4 Dates
Use existing `src/lib/date.ts` helpers; show local time; format like sessions (`ddd D MMM · h:mm A` style used there — reuse, don't add a date library).

---

## 11. Design Language (MUST match the current app exactly)

Source of truth: `src/constants/theme.ts`, `src/components/ui/*`, and the screens referenced below. **Copy styles from the referenced file rather than re-inventing.**

| Element | Rule | Reference |
|---|---|---|
| Colours | Only `useTheme()` tokens: `background`, `backgroundElement`, `backgroundSelected`, `border`, `borderMuted`, `text`, `textSecondary`, `accent`, `accentSecondary`, `success`, `warning`, `error`, `info`, `input*`, `placeholder`. The only literal allowed is `'#fff'` for text/icons on an `accent`/`success`/`error` fill (existing pattern) | `constants/theme.ts`, tabs `_layout.tsx` badges |
| Spacing / radius | `Spacing.xs…xxxl` (4/8/16/24/32/48/64), `Radius.sm/md/lg/full` (8/12/16/pill). Screen side padding `Spacing.lg` on forms, `Spacing.md` on lists; content `maxWidth: MaxContentWidth` (600) centred | `create-community.tsx`, `(tabs)/index.tsx` |
| Text | `ThemedText` variants only: `hero/title/heading/body/caption/label` + `muted`. Card titles: `body` + `fontWeight '600'`. Meta: `caption` muted or 11–12px weight 500 | `ui/Text.tsx`, `CommunityCard.tsx` |
| Buttons | `Button` (`primary` = `theme.text` fill / `theme.background` label, `secondary`, `ghost`), min height 56, `Radius.md` | `ui/Button.tsx` |
| Cards | `Card` or the `CommunityCard` recipe: `backgroundElement`, 1px `border`, `Radius.lg`, cover image with the same aspect ratio constant, `info` padding `Spacing.md` | `ui/Card.tsx`, `CommunityCard.tsx` |
| Pills / chips | `Radius.full`, 1px `border`, caption 13 / weight 700; selected = `theme.text` fill + `theme.background` text. Small status pills: paddingH `Spacing.sm`, paddingV 3, font 10–11 weight 700 | `create-community.tsx` sport pills, `CommunityCard.tsx` sportPill |
| Segmented tabs | `SegmentedControl` (use `compact` for in-screen sub-tabs) | `ui/SegmentedControl.tsx` |
| Bottom sheets | RN `Modal transparent animationType="none"` + own slide animation; backdrop `rgba(0,0,0,0.4)`; sheet `borderTopLeft/RightRadius: Radius.lg`, `paddingHorizontal: Spacing.md`, `maxHeight '85%'`; drag handle 32×4 `textSecondary` @ 0.3 opacity with pan-to-dismiss | `MatchDetailPopup.tsx` |
| Full-screen modals | `SafeAreaView edges={['top']}`, header row: `X` (24, strokeWidth 2) left · `ThemedText variant="heading"` centre · 24px spacer right; `borderBottomWidth 1 theme.border`, padding `Spacing.lg / Spacing.md` | `create-community.tsx` |
| Stack headers | registered in root `_layout.tsx` with the same options block as `community/[id]` (headerShown, `slide_from_right`, `animationDuration: 50`, `headerShadowVisible: false`, `headerStyle.backgroundColor = theme.background`) | `src/app/_layout.tsx` |
| Inputs | `borderRadius Radius.md`, 1px `inputBorder` (focus `inputBorderFocus`), bg `inputBackground`, paddings `Spacing.md`, font 16 / lh 24, `placeholderTextColor theme.placeholder`; labels `ThemedText variant="label" muted` with `marginLeft: Spacing.xs` | `create-community.tsx` |
| Icons | `lucide-react-native`; strokeWidth 2.2 in tab bar, 2 elsewhere; sizes 16 (inline), 20–24 (actions) | everywhere |
| Score input | `ScoreCounter` | `components/ScoreCounter.tsx` |
| Avatars | `UserAvatar` | `components/UserAvatar.tsx` |
| Dialogs | `alert()` from `src/lib/alert.ts` (works on web) — never `Alert.alert` directly | `lib/alert.ts` |
| Press feedback | `pressed && { opacity: 0.6 }` for icons/links; Button handles its own scale/opacity | everywhere |
| Shadows | `Shadows[light|dark].card/elevated` only | `constants/theme.ts` |
| Dark mode | Every screen must be checked in light **and** dark | — |

**Status pill mapping** (`tournamentFormat.ts`), background = token at ~15% opacity (`color + '26'` hex alpha, same technique used for sport pills — check `CommunityCard.tsx`), text = token:
| status | label | token |
|---|---|---|
| tournament `draft` / module `draft` | DRAFT | `textSecondary` |
| module `open` | OPEN | `info` |
| module `seeding` | SEEDING | `warning` |
| module `in_progress` / tournament with live modules | ● LIVE | `success` |
| `completed` | COMPLETED | `text` |
| `cancelled` | CANCELLED | `error` |
| tournament `published` without live modules | UPCOMING | `accent` |

---

## 12. Screen Designs

Wireframes are phone-width (~360dp). `[ ]` = input/button, `( )` = pill/segment, `▸` = navigation row.

### 12.1 Bottom tab bar — centre Tournaments tab with bump (Step 9)

```
            ╭───────╮
 ───────────╯  🏆   ╰───────────        ← 1px theme.border line with a semicircular bump
  👥         📅   ( ● )   💬      ⚡       (fill theme.tabBar, radius ≈ 36, bump height ≈ 18)
 Communities Sessions      Chats  Updates  ← centre: 56×56 circle, theme.accent fill, Trophy 26 '#fff',
                                            raised ~20dp above bar, Shadows.elevated
```
Implementation:
- `(tabs)/_layout.tsx`: add `<Tabs.Screen name="tournaments" …/>` **between `history` and `chats`**. Options: `title: 'Tournaments'`, `headerTitle: () => <DefaultHeaderTitle title="Tournaments" />`, `tabBarLabel: () => null` (A5), `tabBarAccessibilityLabel: 'Tournaments'`, `tabBarButton: (props) => <TournamentTabBarButton {...props} />`.
- `TournamentTabBarButton`: wraps the default press handling; renders the raised circle (`marginTop: -20`), `theme.accent` fill, icon `'#fff'`; focused state adds a 3px `theme.background` ring + slightly larger scale (spring 1 → 1.06, reanimated, as FABMenu animations); unfocused keeps accent (it's the hero action). Press feedback scale 0.96.
- `TabBarBumpBackground`: passed via `tabBarBackground` in `screenOptions`. `react-native-svg` `<Path>` spanning full width: flat line at y = bumpHeight, semicircular arc centred horizontally rising to y = 0; `fill={theme.tabBar}`, `stroke={theme.border}`, `strokeWidth={1}`. Measure width with `onLayout`. Positioned absolutely with `top: -bumpHeight` and `tabBarStyle.overflow: 'visible'`.
- Keep all existing `tabBarStyle` values (height/padding/insets). The hidden `profile` tab stays hidden.
- Verify: Android (gesture + 3-button nav), iOS safe area, web, light/dark, keyboard open (bar hides — `softwareKeyboardLayoutMode: resize` is set), badges on Chats/Updates unaffected.

### 12.2 Tournaments tab — `(tabs)/tournaments.tsx` (Step 10)
```
┌────────────────────────────────────┐
│            Tournaments             │
├────────────────────────────────────┤
│ ( Live )( Upcoming )( Past )( Mine )│  SegmentedControl compact
├────────────────────────────────────┤
│ ┌────────────────────────────────┐ │  TournamentCard (CommunityCard recipe)
│ │ [ cover image / placeholder  ] │ │   placeholder: backgroundSelected + Trophy 32 textSecondary
│ │ LUMS Sports Gala 2026  (● LIVE)│ │   name: body 600 · status pill
│ │ 🏢 LUMS · 📍 Lahore            │ │   caption muted, icons 12
│ │ 🏓 🏸 ⚽ +2 · 5 modules         │ │   sport pills (max 3 + "+n")
│ │ 12–20 Nov            (ADMIN)   │ │   role tag like Discover's admin/member tag
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │ …                              │ │
└────────────────────────────────────┘
```
- `FlatList`, gap `Spacing.md`, padding `Spacing.md`, pull-to-refresh, focus reload.
- Role tag: `ADMIN` for tournament/module admin, `PLAYING` for entrant.
- Empty copy — Live: "Nothing live right now" / "Live tournaments show up here." · Upcoming: "No upcoming tournaments" · Past: "No past tournaments" · Mine: "You're not part of any tournament yet" / "When an admin adds you, it will show up here."
- Tap → `/tournament/[id]`.

### 12.3 Tournament page — `tournament/[id].tsx` (Step 11)
```
┌────────────────────────────────────┐
│ ←  Tournament                 [⚙]  │  ⚙ only for tournament admins → /manage
├────────────────────────────────────┤
│ [        cover image             ] │
│ LUMS Sports Gala 2026              │  heading
│ (● LIVE)  12–20 Nov                │
│ 🏢 LUMS Sports Society · 📍 Lahore │
├────────────────────────────────────┤
│ CHAMPIONS                          │  label muted — section hidden if none
│ ┌──────────┐ ┌──────────┐ ┌──────  │  horizontal ChampionsStrip
│ │ 🏆        │ │ 🏆        │ │ 🏆     │   card: backgroundElement, border, Radius.lg, w 200
│ │ TT Men's │ │ Badminton│ │ Footb  │   module name caption muted + sport pill
│ │ Ali R.   │ │ Sara K.  │ │ Thund  │   champion: body 700
│ │ 2nd Omar │ │ 2nd Hina │ │ 2nd …  │   runner-up caption muted; 3rd if present
│ └──────────┘ └──────────┘ └──────  │   Trophy 20 in theme.warning (gold-ish token)
├────────────────────────────────────┤
│ MODULES                     5      │  label muted + count
│ ┌────────────────────────────────┐ │  ModuleCard (Card)
│ │ 🏓 TT — Men's Singles  (● LIVE)│ │   sport pill · name body 600 · status
│ │ 16 entries · Quarter-finals    │ │   caption muted
│ │ 📍 Main Hall · Nov 12   (ADMIN)│ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │ ⚽ Football 5-a-side    (OPEN) │ │
│ │ 6 entries · starts Nov 15      │ │
│ └────────────────────────────────┘ │
│  (admins) [+ Add module]           │  Button secondary → module-form modal
├────────────────────────────────────┤
│ ABOUT                              │
│ Annual inter-department gala …     │  body muted; "Read more" if > 4 lines
│ ADMINS  [av] Murtaza  [av] Sara    │  UserAvatar 24 + caption
└────────────────────────────────────┘
```
- Order is fixed: **header → Champions → Modules → About**.
- Draft modules visible only to admins, with DRAFT pill. Cancelled tournament: `theme.error` banner under header.
- Empty modules — public: "Modules coming soon" · admin: "Add your first module" + button.

### 12.4 Module page — `tournament/[id]/module/[moduleId].tsx` (Steps 12–15)
```
┌────────────────────────────────────┐
│ ←  TT — Men's Singles         [⚙]  │  ⚙ module admins → module manage
├────────────────────────────────────┤
│ 🏓 Table Tennis  (● LIVE)          │
│ 16 entries · Single elimination    │  caption muted
│ 📍 Main Hall · 12 Nov 4:00 PM      │
│ 🏆 Champion: Ali R.                │  only when completed (warning-tinted row)
├────────────────────────────────────┤
│ (Bracket)(Standings)(Matches)(Entries)(Info) │ SegmentedControl compact, horizontally scrollable
├────────────────────────────────────┤
│  … tab content …                   │
└────────────────────────────────────┘
```
Default tab: **Bracket** if a bracket exists, else **Entries**.

**Info tab**: description, rules_text, format line ("Single elimination · 3rd-place match on"), rounds list (name · best of · scheduled start · notes), module admins.

**Entries tab** (Step 12):
```
 Search [ name or school          ]       ← client-side filter
 16 entries
 ┌────────────────────────────────┐
 │ (1)  Ali Raza          [av]    │  seed badge (circle 24, backgroundSelected, caption 700)
 │      LUMS · SBASSE             │  public fields (school + public custom) caption muted
 ├────────────────────────────────┤
 │ (2)  Omar Farooq               │
 │      FCC                (OUT)  │  status: OUT (eliminated, textSecondary) / WITHDRAWN (error)
 └────────────────────────────────┘
 (admins) [+ Add entry]  — visible in draft/open
```
Tap → `EntrySheet` (bottom sheet): name, linked user (avatar + @username → `/profile/[id]`), all visible fields as label/value rows (admins see private ones with a small 🔒 icon `textSecondary`), path (results so far). Admin actions in sheet: **Edit** (→ entry-form), **Withdraw** (in_progress/open, confirm), **Delete** (draft/open, confirm).

**Bracket tab** (Step 13) — this is the "standings chart" for knockout:
```
 ( R16 )( QF )[ SF ]( Final )               ← round pills; tap scrolls to that column
┌─────────────────────────────────────────────────────────┐
│ Quarter-finals · Bo3     Semi-finals · Bo5    Final · Bo5│  column headers: label muted
│ ┌──────────────────┐                                    │
│ │(1) Ali R.     2 ✓│─┐                                  │  BracketMatchNode 196×76, Card style
│ │(8) Usman K.   0  │ │  ┌──────────────────┐            │   winner row: text 700 + ✓ success
│ └──────────────────┘ ├─▶│(1) Ali R.     3 ✓│─┐          │   loser row: textSecondary
│ ┌──────────────────┐ │  │(4) Zain M.    1  │ │          │   score right-aligned, tabular
│ │(4) Zain M.    2 ✓│─┘  └──────────────────┘ │ ┌──────┐ │
│ │(5) Bilal S.   1  │                         ├▶│(1) Ali│ │
│ └──────────────────┘                         │ │ TBD   │ │  TBD = textSecondary italic
│ ┌──────────────────┐                         │ └──────┘ │
│ │(3) Hamza K.   –  │─┐  ┌──────────────────┐ │          │  scheduled: "Sat 4:30 · T2" caption
│ │(6) Saad A.    –  │ ├─▶│ TBD              │─┘  3rd ┌──┐│  3rd-place node under the Final
│ │ Sat 4:30 · T2    │ │  │ TBD              │        └──┘│
│ └──────────────────┘ │  └──────────────────┘           │
│ ┌──────────────────┐ │                                  │
│ │(2) Omar F.   BYE │─┘                                  │  BYE: caption, no score
│ └──────────────────┘                                    │
└─────────────────────────────────────────────────────────┘
```
- `ScrollView horizontal` wrapping `ScrollView` vertical; nodes absolutely positioned from `bracketLayout`; one `Svg` layer for connectors (`stroke theme.border`, 1.5px; highlighted path `theme.accent` 2px).
- Highlight: the viewer's own entry (linked profile) path in `theme.accent`; walkover shows "W/O" instead of score; live (scheduled & today) node gets a small `success` dot.
- `seeding` status: banner `theme.warning` tint "Draft bracket — may change". No bracket yet: empty state "Bracket not generated yet" / admins: "Generate it from Manage → Seeding".
- Tap node → `TournamentMatchSheet`.

**Standings tab** (Step 14) — toggle `( Table )( Chart )` (`SegmentedControl compact`):

Table:
```
┌─────┬──────────────────┬───┬───┬───┬────┬─────────────┐
│  #  │ Entry            │ P │ W │ L │ +/-│ Reached     │  header: caption 700 textSecondary
├─────┼──────────────────┼───┼───┼───┼────┼─────────────┤
│  1  │ 🏆 Ali R.        │ 4 │ 4 │ 0 │ +9 │ Champion    │  champion row: warning-tinted bg
│  2  │ Omar F.          │ 3 │ 2 │ 1 │ +2 │ Final       │
│ T-3 │ Zain M.          │ 3 │ 2 │ 1 │ +1 │ Semi-finals │
│ T-3 │ Hamza K.         │ 3 │ 2 │ 1 │ -1 │ Semi-finals │
│ T-5 │ Bilal S.         │ 2 │ 1 │ 1 │ +1 │ Quarters    │  eliminated: textSecondary
│  –  │ Saad A.   ● alive│ 2 │ 2 │ 0 │ +4 │ Semi-finals │  alive dot success
└─────┴──────────────────┴───┴───┴───┴────┴─────────────┘
 P played · W won · L lost · +/- score difference
```
- Columns `#` (44) and `Entry` (flex, min 140) pinned; the rest in a horizontal `ScrollView` if width < 420. Optional columns SF/SA shown when width allows.
- Row height 48, separator 1px `border`, own row `backgroundSelected`. Tap → `EntrySheet`.

Chart (`StandingsChart`, SVG horizontal bars = how far each entry got):
```
                 R16    QF     SF    Final   🏆
 Ali R.      ██████████████████████████████████  Champion
 Omar F.     ███████████████████████████▌        Final
 Zain M.     ████████████████████▌               SF · lost to Ali 1–3
 Saad A.     ████████████████████  ●             SF · alive
 Bilal S.    █████████████▌                      QF
```
- One row per entry (sorted like the table), bar track `backgroundSelected` `Radius.full`, height 10; fill: alive `theme.accent`, champion `theme.warning`, eliminated `theme.textSecondary`; round tick labels caption muted on top; right label caption.
- Pure `react-native-svg` + `View`s — no chart library.

**Matches tab** (Step 15): `SectionList` grouped by round (section header: `label` muted "QUARTER-FINALS · BEST OF 3"). `TournamentMatchRow`: two entries stacked with scores, right side status/time ("Sat 4:30 PM · T2", "W/O", "BYE", "Final"). Filter chips: `(All)(Upcoming)(Results)`. Tap → `TournamentMatchSheet`.

### 12.5 Match sheet + result entry (Steps 15, 20)
```
┌────────────────────────────────────┐   ┌────────────────────────────────────┐
│ ─────                              │   │ ─────                              │
│ Semi-final 1 · Best of 5           │   │ Enter result · SF 1 · Bo5          │
│ Sat 13 Nov · 5:00 PM · Table 1     │   │ ( Played )( Walkover )             │  SegmentedControl compact
│                                    │   │                                    │
│ (1) Ali R.                 3  ✓    │   │          Ali R.      Zain M.       │
│ (4) Zain M.                1       │   │ Game 1   [−11+]  –   [− 7+]        │  ScoreCounter pairs
│ 11-7 · 9-11 · 11-5 · 11-8          │   │ Game 2   [− 9+]  –   [−11+]        │  rows = best_of (racket sports)
│ Ali R. advances to the Final       │   │ Game 3   [−11+]  –   [− 5+]        │  "+ Add game" up to best_of
│ Recorded by @sara · 2h ago         │   │ Games:   3 – 1 (auto)              │  team sports: single score row
│                                    │   │ Winner  (● Ali R.)( Zain M.)       │  required only if tie
│ ── admins ──────────────────────── │   │ Note    [ optional              ]  │
│ [ Enter result ]  (primary)        │   │ [        Save result         ]     │
│ [ Schedule ]  [ Reset ]            │   └────────────────────────────────────┘
└────────────────────────────────────┘
 Walkover mode: pick winner (present entries only), note defaults "Walkover", [Record walkover].
```
- Racket sports (`isRacketSport`): per-game rows → `score_a/score_b` = games won, `score_detail` = rows. Team sports & `other`: one score row, no detail; note recommended on ties.
- Validation client-side mirrors §5.2; server errors mapped via §10.3.
- **Schedule** opens a small sheet: date/time (`@react-native-community/datetimepicker`, as `create-session.tsx`), venue, court.
- **Reset** → `alert` confirm "Reset this result? The winner will be removed from the next match."

### 12.6 Tournament manage — `tournament/[id]/manage.tsx` (Steps 16–18)
```
┌────────────────────────────────────┐
│ ←  Manage tournament               │
├────────────────────────────────────┤
│ NAME                               │
│ [ LUMS Sports Gala 2026      ] [✓] │  inline save (rename_tournament)
│ Other details are managed by the   │  caption muted
│ Sportron team.                     │
├────────────────────────────────────┤
│ ▸ Entry form          5 core · 2   │  → /tournament/[id]/fields
│ ▸ Modules             5            │  list below with drag/↑↓ order (optional)
│   🏓 TT — Men's Singles   (LIVE) ▸ │  → module manage
│   ⚽ Football 5-a-side    (OPEN) ▸ │
│   [+ Add module]                   │  → module-form modal
├────────────────────────────────────┤
│ TOURNAMENT ADMINS                  │  read-only list (assigned by owner)
│ [av] @murtaza  [av] @sara          │
└────────────────────────────────────┘
```

### 12.7 Entry form editor — `tournament/[id]/fields.tsx` (Step 16)
```
┌────────────────────────────────────┐
│ ←  Entry form                      │
├────────────────────────────────────┤
│ CORE FIELDS (required for all)     │
│ 🔒 Name        Text   · Public     │  core rows: lock icon, tap → edit label/placeholder only
│ 🔒 CMS ID      Text   · Private    │
│ 🔒 School      Text   · Public     │
│ 🔒 Phone       Phone  · Private    │
│ 🔒 Email       Email  · Private    │
├────────────────────────────────────┤
│ CUSTOM FIELDS                      │
│ ≡ Department   Select · Public  ⋯  │  ⋯ → Edit / Remove (archive)
│ ≡ T-shirt size Select · Private ⋯  │  ≡ reorder (↑/↓ buttons acceptable)
│ [+ Add field]                      │
└────────────────────────────────────┘
Field editor (bottom sheet):
 Label [ Department      ]   Type ( Text )( Number )( Email )( Phone )( Select )
 Options (select): [ SBASSE ][×] [ SDSB ][×] [+ option]
 Placeholder [            ]
 Required  [toggle]     Visible to everyone  [toggle]  ("Off = only admins and the entrant")
 [ Save field ]
```
Removing a field: confirm "Existing answers are kept but hidden." → archive.

### 12.8 Module form (create/edit) — `tournament/[id]/module-form.tsx` modal (Step 17)
```
┌────────────────────────────────────┐
│ ×        New Module                │  "Edit Module" when ?moduleId
├────────────────────────────────────┤
│ NAME *        [ TT — Men's Singles ]│
│ SPORT *       (TT)(Badminton)(Tennis)…│ sport pills, horizontal (create-community recipe);
│                                    │  locked (disabled look) once bracket exists
│ VENUE         [ Main Hall        ] │
│ STARTS        [ 12 Nov, 4:00 PM  ] │
│ MAX ENTRIES   [ 16 ]               │
│ DESCRIPTION   [                  ] │
│ RULES         [                  ] │  multiline
│ 3RD-PLACE MATCH            [ off ] │  Switch, trackColor accent
│ SEEDING     ( Manual )( Random )   │
│ [        Create module        ]    │
└────────────────────────────────────┘
```

### 12.9 Module manage — `tournament/[id]/module/[moduleId]/manage.tsx` (Steps 18–19)
```
┌────────────────────────────────────┐
│ ←  Manage module                   │
├────────────────────────────────────┤
│ STATUS  (OPEN)                     │
│ [ Close entries & start seeding ▸ ]│  primary Button = next valid transition
│ ( Back to draft )                  │  ghost, when allowed
├────────────────────────────────────┤
│ CHECKLIST                          │
│ ✓ Details set                      │  ✓ success / ○ textSecondary
│ ✓ 12 entries added (max 16)        │
│ ○ Seeds set                        │
│ ○ Bracket generated                │
├────────────────────────────────────┤
│ ▸ Edit details                     │  → module-form?moduleId
│ ▸ Entries            12            │  → module page Entries tab
│ ▸ Rounds & schedule                │  → rounds
│ ▸ Seeding & bracket                │  → seeding
├────────────────────────────────────┤
│ MODULE ADMINS   (tournament admins)│
│ [av] @sara      [remove]           │
│ [+ Add admin]                      │  → ProfilePickerSheet (search_profiles_for_tournament)
├────────────────────────────────────┤
│ DANGER ZONE                        │
│ [ Cancel module ]  [ Delete ]      │  error-coloured ghost buttons + confirm
└────────────────────────────────────┘
```
Status button labels: draft→"Publish module" · open→"Close entries & start seeding" · seeding→"Start tournament" (disabled until bracket) · in_progress→(none; "Completes automatically after the final").

### 12.10 Entry form — `tournament/[id]/module/[moduleId]/entry-form.tsx` modal (Step 18)
```
┌────────────────────────────────────┐
│ ×          Add Entry               │  "Edit Entry"
├────────────────────────────────────┤
│ NAME *            [ Ali Raza     ] │  rendered from get_tournament_entry_fields
│ CMS ID *  🔒      [ 24100123     ] │  🔒 = private field hint
│ SCHOOL *          [ SBASSE       ] │
│ PHONE *   🔒      [ +92 300 …    ] │  keyboardType phone-pad
│ EMAIL *   🔒      [ ali@lums…    ] │  keyboardType email-address, autoCapitalize none
│ DEPARTMENT        ( CS )( EE )…    │  select → pills
│ LINK APP USER (optional)           │
│ [ Search username…            ]    │  → ProfilePickerSheet; shows [av] @ali  [×]
│ "Linked users get match notifications."│ caption muted
│ [         Save entry          ]    │
│ [ Save & add another ]  (secondary)│  create mode only — resets form, keeps focus on Name
└────────────────────────────────────┘
```
`EntryFieldInput` picks the control by `field_type`. Inline field errors under inputs in `theme.error` caption.

### 12.11 Seeding — `…/seeding.tsx` (Step 19)
```
┌────────────────────────────────────┐
│ ←  Seeding & bracket               │
├────────────────────────────────────┤
│ 12 entries → 16-slot bracket       │
│ 4 byes go to seeds 1–4             │  caption muted
│ Order  [↑][↓] or ( Shuffle unseeded)│
│  1  Ali Raza            [↑][↓]     │
│  2  Omar Farooq         [↑][↓]     │
│  …                                 │
│ [ Save seeds ]          (secondary)│
│ [ Generate bracket ]    (primary)  │  status must be seeding; regenerate asks to confirm
│ Preview → opens module Bracket tab │
└────────────────────────────────────┘
```
Drag-and-drop is optional polish; ↑/↓ buttons are required (work on web).

### 12.12 Rounds — `…/rounds.tsx` (Step 19)
List of rounds (after bracket generation; before that: "Rounds are created when you generate the bracket"). Each row expands: name input, best-of pills `(1)(3)(5)(7)`, start date/time, notes. Save per row.

---

## 13. Backward-Compatibility & Safety Checklist
- [ ] Migrations 084–088 create only new objects (+ widen the notification check constraint).
- [ ] No change to existing RPCs/tables/edge functions. If one must change, stop and ask.
- [ ] Old builds: no tournaments tab; tournament notifications appear in Past Activity; taps no-op (verified).
- [ ] PII: CMS ID/phone/email never returned to non-admins (test with a non-admin account — §14 step 5).
- [ ] RLS: authenticated users cannot `insert/update/delete` any tournament table directly (test).
- [ ] `PRIVACY_POLICY.md`: owner to add "tournament participant details (name, CMS ID, school, phone, email, custom fields) entered by organisers" — implementer drafts, owner approves.
- [ ] `AGENTS.md` updated at the end (structure, data model, notification types, conventions).

---

## 14. Step-by-Step Breakdown

Each step = one session. **Do steps in order** unless the owner says otherwise. "Owner action" means stop and ask the owner to do it, then record the result.

### Phase A — Database
| # | Step | Deliverables | Done when |
|---|---|---|---|
| 1 | **Schema** | `supabase/migrations/084_add_tournaments.sql`: tables (§4), indexes, helpers (§2), RLS select policies, core-field seed trigger + core-field lock trigger, updated_at + audit triggers, realtime publication | File written; owner applied it (owner action); `PROGRESS.md` notes any deviations |
| 2 | **Read RPCs** | `085_add_tournament_read_rpcs.sql` (§6.1, incl. `get_module_standings` stub or full) | Applied; owner ran sample selects from §14 step 5 script |
| 3 | **Admin write RPCs** | `086_add_tournament_admin_rpcs.sql` (§6.2) incl. field validation | Applied |
| 4 | **Bracket engine** | `087_add_tournament_bracket_engine.sql` (§5, §7) | Applied |
| 5 | **SQL tests + owner guide** | `docs/tournaments/sql-tests.sql` (inside `BEGIN … ROLLBACK`): create tournament, set auth via `set local request.jwt.claims`, add admins, modules, entries for N = 2, 3, 5, 8, 9, 16; generate; record results + walkover + reset; verify advancement, byes, 3rd place, final ranks, PII stripping for non-admin, RLS write denial. `docs/tournaments/owner-sql.md`: copy-paste snippets — create tournament, publish, assign/remove tournament admin, complete/cancel | Owner ran tests; all pass; results pasted in `PROGRESS.md` |

### Phase B — Client foundation
| # | Step | Deliverables | Done when |
|---|---|---|---|
| 6 | **Types + service + errors** | `src/types/tournaments.ts` (re-exported from `types/index.ts`), `src/services/tournaments.ts` (every RPC), `src/lib/tournamentErrors.ts`, `src/lib/tournamentFormat.ts` | `tsc` + lint pass |
| 7 | **Hooks** | `useTournaments`, `useTournament`, `useTournamentModule` (with realtime + debounce) | `tsc` + lint pass |
| 8 | **Bracket layout lib** | `src/lib/bracketLayout.ts` (§9.4) + a small self-check `scripts/check-bracket-layout.ts` *or* inline `__DEV__` assertions for sizes 2/4/8/16 | `tsc` pass; sample output recorded in PROGRESS |

### Phase C — Navigation
| # | Step | Deliverables | Done when |
|---|---|---|---|
| 9 | **Centre tab with bump** | `TournamentTabBarButton`, `TabBarBumpBackground`, `(tabs)/tournaments.tsx` placeholder, register tab (§12.1); register all tournament stack screens + modals in root `_layout.tsx` with placeholder files | Owner verified on device: light/dark, Android nav modes, web; other tabs unaffected |

### Phase D — Public screens
| # | Step | Deliverables | Done when |
|---|---|---|---|
| 10 | **Tournaments list** | §12.2 with `TournamentCard`, status pill, scopes, empty states | Works against seeded data |
| 11 | **Tournament page** | §12.3 incl. `ChampionsStrip`, `ModuleCard`, admin ⚙ entry point | Champions appear above modules |
| 12 | **Module page shell + Info + Entries** | §12.4 header, segmented tabs, Info tab, Entries tab, `EntrySheet` (view only) | Private fields hidden for non-admin |
| 13 | **Bracket view** | `BracketView`, `BracketMatchNode`, `BracketConnectors`, round pills, draft banner, highlight own path | Renders 2/5/8/16-entry brackets correctly; realtime update observed |
| 14 | **Standings** | `StandingsTable` + `StandingsChart` + toggle | Matches §7 for the test bracket |
| 15 | **Matches tab + match sheet (view)** | `TournamentMatchRow`, `TournamentMatchSheet` (read-only part) | |

### Phase E — Admin screens
| # | Step | Deliverables | Done when |
|---|---|---|---|
| 16 | **Tournament manage + entry form editor** | §12.6, §12.7 | Core fields locked in UI and server |
| 17 | **Module create/edit** | §12.8 | |
| 18 | **Module manage + module admins + entry form** | §12.9 (status, checklist, admins, danger zone), §12.10, `ProfilePickerSheet`, entry edit/withdraw/delete actions in `EntrySheet` | Duplicate CMS ID error shows friendly copy |
| 19 | **Seeding + rounds + generate/start** | §12.11, §12.12 | Bracket generated and started from the app |
| 20 | **Results** | `ResultEntrySheet` (played + walkover), schedule sheet, reset (§12.5) | Full module run end-to-end on device; module auto-completes; champion shows on tournament page |

### Phase F — Notifications
| # | Step | Deliverables | Done when |
|---|---|---|---|
| 21 | **Notification triggers** | `088_add_tournament_notifications.sql` (§8) | Applied; rows created in test |
| 22 | **Client wiring** | types/prefs, `useFCM` routing, Activity tap routing | Push tap opens the right module (device test) |

### Phase G — Finish
| # | Step | Deliverables | Done when |
|---|---|---|---|
| 23 | **Polish & docs** | empty/loading/error audit, dark-mode audit, web check, accessibility labels, `AGENTS.md` update (structure, data model, notification types, conventions, history), privacy-policy draft text for owner | Owner sign-off |
| 24 | *(optional)* **Tournament requests** | `tournament_requests` table + submit RPC + "Request a tournament" modal from the tab header `+`; owner reviews in DB | Only if owner confirms it's still wanted |

---

## 15. Progress Tracking — `docs/tournaments/PROGRESS.md`

`PROGRESS.md` already exists (created with this plan). Rules:
1. **Start of session:** read it; pick the first step whose status is not ✅; confirm any §1.3 assumption that step depends on.
2. **During:** keep a short scratch list in your head/todo tool; don't edit PROGRESS mid-step except to mark 🔄.
3. **End of session:** update the step row (status, date, files), add a log entry (what was done, what was verified and how, deviations from the plan, open questions, exact next action). If a migration was written but not applied, status = 🟡 *Written – awaiting owner*.
4. Never mark ✅ without the "Done when" condition from §14 being met. If verification needs the owner (device / DB), mark 🟡 and say exactly what to check.
5. Record every decision the owner makes in the **Decisions** table so later sessions don't re-ask.
6. If you change the plan (split a step, rename a file, different migration number), note it under **Plan deviations** and edit this PLAN.md section it affects.

Status legend: ⬜ Not started · 🔄 In progress · 🟡 Written – awaiting owner (apply/verify) · ✅ Done · ⛔ Blocked
