# Follow live match — plan

Status: **Draft 5 for owner review — nothing built.** Next migration number: **133**.
Remaining owner questions are in §16; every other decision below is what the build follows unless
the owner overrides it.

**Owner decisions so far**
- Players and spectators follow live matches **inside the app**. The separate website
  (`live.sportron.app`) is **only for the projector**. (draft 2)
- Any signed-in user who can see a tournament can watch its live matches. (draft 3)
- What the projector shows is **switchable by the organiser**; the projector link can **change**
  (new code, and the base URL is remote config). (draft 3)
- Many courts are shown **side by side** on one projector screen. (draft 4)
- The projector link is **on by default**, as long as it adds no overhead (it doesn't — §10). (draft 5)
- **Only admins score** in v1 (module admins + tournament admins, who already hold module-admin
  powers). (draft 5)
- The project is on the **Supabase Free plan** → the design must fit Free quotas (§10). (draft 5)
- **Every sport gets a proper scoring system** — rally sets, tennis, basketball, football, volleyball,
  handball, cricket, and a configurable one for other sports (§5). (draft 5)
- Scoring must be **easy to use**, and the current result-entry popup is **replaced by a full-screen
  screen** with clear + / − and undo (§6, §7). (draft 5)

---

## 1. What we are building

An admin acting as referee scores a tournament match **live, point by point (or goal by goal, ball by
ball)** in the Sportron app. The score shows up within about a second on:

1. **The app — for every player and spectator.** A **Live** screen per tournament (all live
   courts, up next, recent results), a full live match screen, a *Live now* section on the
   tournament screen, a *Live now* strip on the Tournaments tab, and LIVE pills on match rows and
   bracket nodes. Signed-in users only, like the rest of the app.
2. **A projector-only website** at `live.sportron.app/<code>`, no sign-in: for a big screen in a
   gym — several courts side by side, huge numbers, no interaction, recovers by itself if the
   connection drops.

Also in scope: the **full-screen result entry** that replaces today's bottom-sheet popup for
entering a final score without live scoring (§7).

**Hard requirement:** the referee's screen must **never wait for the network**. A tap changes the
score on screen in the same frame; sending it to the cloud happens in the background, survives bad
Wi-Fi, airplane mode and the app being killed, and catches up on its own.

**Ships as an OTA update** (JS only, no new native modules), plus one additive migration and one
small new website.

### Non-goals (v1)
- Volunteer scorers without admin powers (phase 2, §14).
- Per-player stats (who scored, fouls per player, batting/bowling cards). Scores are per side.
- Cricket: DLS, super-over engine, multi-day / two-innings matches, batter/bowler tracking.
- A "match is live" push notification (needs a new notification type → check-constraint migration;
  phase 2).
- Live scoring for **community** matches.
- Video, commentary, chat on the live screens.

---

## 2. Key decisions

| # | Decision | Choice | Why (short) |
|---|---|---|---|
| D1 | Where live scores are stored | **New table `tournament_live_scores`**, one row per live match. `tournament_matches` is **not touched** until the match is finished | Old app builds subscribe to `tournament_matches` and refetch the whole module on every change; a write per point would hammer every viewer's app. Bracket, standings and notifications stay exactly as they are |
| D2 | How a match ends | Referee taps **Finish** → one RPC records the final result through the **existing** `record_tournament_result` logic | No second copy of advancement logic |
| D3 | What the referee sends | **Whole-state snapshots** with a per-match increasing `seq`, never "+1" events | Only the latest matters, retries are safe, out-of-order arrivals can't corrupt the score |
| D4 | Referee latency | **Local-first**: a pure scoring engine updates the screen; a persisted **outbox** sends the latest snapshot in the background | Meets the "never wait" rule |
| D5 | How viewers get updates | **Realtime Broadcast sent by the database** (`realtime.send` from a trigger) on **one private topic per tournament, keyed by the projector code** (`live:<code>`), receive-only for clients | One message per update for app *and* projector (Free-plan friendly), nobody can fake a score, changing the code cuts off old projectors |
| D6 | First load / fallback | App: signed-in RPCs (`get_live_tournament_board`, `get_live_match`). Projector: one anon RPC `get_live_board(p_code)` | App stays inside normal access rules; the projector RPC is the only, narrow anon exception |
| D7 | Projector link default | **On by default** (`tournaments.live_public default true`), organiser can turn it off. The code is created lazily — the first time a match goes live or the organiser opens the card | Owner choice; costs nothing when no projector is open (§10). Default display is names + scores only |
| D8 | Who can score | **Admins only** (module admins; tournament admins are module admins of all their modules) | Owner choice; no new permissions |
| D9 | Two referees on one match | **One active scorer per match** (a claim); another admin must tap **Take over** | Two phones never fight over the score |
| D10 | Where players watch | **In the app** (native + sportron.app web build), never a separate site | One place, existing sign-in and permissions |
| D11 | The projector page | **Separate tiny Vite app `live/`** (like `admin/`), own Vercel project, projector layout only | The Expo web build is heavy and forces sign-in |
| D12 | Projector link | `<base>/<code>`; `<base>` from remote config (`live_projector_base_url`), `<code>` changeable (random or custom) | Domain can move without an app release; leaked links can be killed |
| D13 | What the projector shows | Organiser switches (`tournaments.live_display`); hidden data is **removed on the server** | The public wall never receives what it shouldn't show |
| D14 | Scoring rules | **One shared, pure scoring engine** (`src/lib/live/`) with **rule families** and **per-sport presets**, used by the referee screen, the in-app viewers, the projector and the result-entry screen | Every surface agrees on what "40–30", "Q3 4:12" or "145/6 (18.3)" means |
| D15 | Rule settings | Per module (`tournament_modules.live_rules`, preset + overrides), copied onto each live match at start | Organisers rarely touch rules; changing them mid-day never corrupts a running match |
| D16 | Game/set/period ends | **Automatic, with an undo banner** — not a confirm dialog | Fewer taps, no blocking pop-ups; a wrong tap is one Undo away |
| D17 | Match clock | Runs **on the referee phone**; viewers get start/stop events and tick locally — **never a message per second** | Clock works offline and costs almost no Realtime messages |
| D18 | Result entry | The bottom-sheet `ResultEntrySheet` is **replaced** by a full-screen **Enter result** screen sharing the scoring screen's frame | Owner request; consistent controls |
| D19 | Rollout | Behind feature flag `live_scoring` (127), OFF by default | Ship dark, try at one event, then turn on |

---

## 3. Architecture

```
 Referee phone (app)                     Supabase                               Viewers
 ───────────────────                     ────────                               ───────
 tap ─► scoring engine ─► screen (same frame)
          │
          ▼
   outbox (AsyncStorage, latest snapshot per match, coalesced)
          │  background · 1 request in flight · retry with backoff
          ▼
   rpc live_push_score(match, seq, snapshot) ─► tournament_live_scores (row per match)
                                                   │ AFTER INSERT/UPDATE trigger
                                                   ▼
                                  realtime.send(payload, 'score', 'live:<code>', private)
                                                   │   (one message per update)
                         ┌─────────────────────────┴───────────────────────┐
                         ▼                                                 ▼
          app (signed in; topic allowed by can_view)       projector live.sportron.app/<code>
          Live screen · live match screen                   (anon; topic allowed when published
          (Live now section / strip / pills poll instead)    and live_public)

 first load / reconnect / fallback poll:
   app       → get_live_tournament_board(tournament) · get_live_match(match) · get_live_tournaments()
   projector → get_live_board(code)

 Finish ─► live_finish_match ─► record_tournament_result logic ─► tournament_matches
                                 (bracket advance, standings, existing pushes, existing realtime)
```

---

## 4. Database — migration `133_add_live_match_scoring.sql`

All **additive**. No column on an existing table becomes NOT NULL without a default, nothing is
renamed or dropped, `tournament_matches.status` gets **no new value**.

### 4.1 New columns
**`tournaments`**

| Column | Type | Notes |
|---|---|---|
| `live_public` | `boolean not null default true` | Projector link on/off (D7). Existing tournaments become "on" but have **no code** until first needed, so nothing is reachable until then |
| `live_code` | `text`, unique index on `lower(live_code)` | Random: 6 chars, unambiguous alphabet (no `0/o/1/l/i`) — ~730 M combinations, not guessable. Custom: 4–24 chars `[a-z0-9-]`, no leading/trailing `-`, not reserved (`admin`, `api`, `live`, `www`, `projector`, …). Created by `_ensure_live_code()` on first live start or first settings read; replaced only by `set_tournament_live_code` |
| `live_display` | `jsonb not null default '{}'` | Projector display settings (§4.9). Missing keys = defaults |

**`tournament_modules`**

| Column | Type | Notes |
|---|---|---|
| `live_rules` | `jsonb` (nullable) | `{ "preset": "badminton_21", ...overrides }` (§5.3). `null` = sport default preset |

### 4.2 New table `tournament_live_scores`
| Column | Type | Notes |
|---|---|---|
| `match_id` | `uuid primary key references tournament_matches(id) on delete cascade` | |
| `module_id`, `tournament_id` | `uuid not null` (fk, cascade) | For filtering and the topic |
| `state` | `text not null check in ('live','break','finished','abandoned')` | `break` = between games/sets/periods, half-time, innings break |
| `family` | `text not null check in ('sets','tennis','timed','cricket','simple')` | Rule family (§5.1) |
| `rules` | `jsonb not null` | Resolved rules **copied at start** (D15) — later module edits don't affect this match |
| `snapshot` | `jsonb not null` | The family's full state (§5.2). ≤ 8 KB |
| `summary` | `jsonb not null` | Small, family-independent view for lists and the projector: `{a, b, a_sub, b_sub, line, server, clock}` (§5.2) — keeps viewers simple and payloads tiny |
| `seq` | `bigint not null default 0` | Highest snapshot applied (D3) |
| `scorer_id` | `uuid` fk profiles | Current scorer (D9) |
| `scorer_device` | `text` ≤ 64 | Random id per app install (resume on the same phone) |
| `started_at`, `updated_at`, `finished_at` | `timestamptz` | Server-set; phone clocks are never trusted for ordering |

- RLS **on**, **no policies**, privileges revoked from `anon` and `authenticated`. Access only via the
  functions below.
- **Not** in the `supabase_realtime` publication (we broadcast instead).
- Finished rows are **kept** (a few KB per match) — they are the match's detailed record (per-set
  points, quarter scores, innings) shown on the live match screen after FINAL. Only `abandoned`
  rows are deleted after 7 days.

### 4.3 Functions
All `SECURITY DEFINER`, `set search_path = public`, `revoke … from public, anon`, explicit grants.

| Function | Who | What |
|---|---|---|
| `live_start_match(p_match, p_device, p_takeover bool default false, p_court text default null, p_rules jsonb default null)` | module admin | Checks: module `in_progress`, tournament writable, both entries set, match not `completed/walkover/bye/cancelled`. Resolves rules (module `live_rules` → sport preset) and applies `p_rules` (per-match tweaks from the start sheet, validated like module rules). Writes `p_court` to `tournament_matches.court` (≤ 40). Ensures the tournament has a `live_code`. Creates the row (or returns the existing one). Another scorer active < 2 min ago → `LIVE_TAKEN` unless `p_takeover` (takeover keeps score + `seq`). Returns the row |
| `live_push_score(p_match, p_seq, p_snapshot jsonb, p_summary jsonb)` | current scorer | Not the scorer → `LIVE_TAKEN`. `p_seq <= seq` → **no error**, returns current `seq`. Validates size (≤ 8 KB), numbers 0..9999, known `state`; bad → `FIELD_INVALID:live_state`. More than ~20 writes/s per match → silently returns current `seq`. Returns `{seq}` |
| `live_finish_match(p_match, p_seq, p_snapshot, p_summary, p_score_a int, p_score_b int, p_score_detail jsonb, p_winner uuid default null, p_note text default null)` | current scorer | One transaction: applies the last snapshot, calls the `record_tournament_result` logic with the mapped result (§5.5) so all existing checks run (`TIE_NEEDS_WINNER`, `STAGE_LOCKED`, `DOWNSTREAM_PLAYED`…), then `state = 'finished'`. On error the live row stays `live` |
| `live_abandon_match(p_match)` | module admin | `state = 'abandoned'`; match untouched |
| `set_module_live_rules(p_module, p_rules jsonb)` | module admin | Validates against the family schema (§5.3); unknown preset/key → `FIELD_INVALID:live_rules`; family must match the module's `scoring_mode` (`games` ↔ sets/tennis, `score` ↔ timed/cricket/simple) → `FIELD_INVALID:live_rules_family`. Returns resolved rules |
| `set_tournament_live_public(p_tournament, p_on bool)` | tournament admin | Toggle D7. Returns `{live_public, live_code, live_display}` |
| `set_tournament_live_code(p_tournament, p_code text default null)` | tournament admin | `null` → new random code; text → custom (`LIVE_CODE_TAKEN`, `FIELD_INVALID:live_code`). Max 10/day (`RATE_LIMITED`). Audited |
| `set_tournament_live_display(p_tournament, p_patch jsonb)` | tournament admin | Merge-patch `live_display` (§4.9); private/archived/foreign field ids → `FIELD_INVALID:show_fields` |
| `get_tournament_live_settings(p_tournament)` | tournament admin | `{live_public, live_code, live_display, base_url}` (ensures a code) |
| `get_live_board(p_code text)` | **anon** (projector) | §4.4. Only when `status = 'published'` and `live_public` |
| `get_live_tournament_board(p_tournament)` | authenticated | Same rows for the app, `can_view_tournament` guard, ignores `live_public`; includes `live_code` (to join the topic) |
| `get_live_match(p_match)` | authenticated | One match incl. `snapshot` + `rules` (detail view, also after FINAL) |
| `get_live_tournaments()` | authenticated | Viewable tournaments with ≥ 1 match `live`/`break`: id, name, cover, live count |

**Deliberate exception to the `auth.uid()` guard rule** (049/109): only `get_live_board` runs without
a user; its guard is *published AND live_public*. Documented in the migration header and AGENTS.md.

### 4.4 What the board reads return (and nothing more)
`RETURNS TABLE` (explicit columns):
- Tournament: name (or `title` override), location, `live_code`, resolved display settings,
  `app_link` (remote config), `server_now` (for clock offset, §5.4).
- Per row: match id, module name, sport (+ custom sport name), family, round/section label inputs
  (`stage_number`, `bracket_side`, `round_number`, `code`), `scheduled_at`, venue, court.
- Sides: entry **display name** always. **Projector:** only the extra fields switched on in
  `live_display`, as `[{label, value}]` — anything off is **not in the response**. **App:** the
  public fields the app shows elsewhere. Never CMS ID, phone, email or private custom fields; team
  entries show the team name only.
- Live part: `state`, `summary`, `seq`, `updated_at`. (The projector also gets `snapshot` — needed
  for set/period chips — it contains only numbers.)
- Scope: `live`/`break` rows, `finished` ones from the last 30 min, and **up next** (≤ 6
  undecided matches scheduled today, by `scheduled_at`). Projector parts switched off are omitted.

### 4.5 Broadcast trigger (one message per update)
`AFTER INSERT OR UPDATE ON tournament_live_scores FOR EACH ROW`:

```sql
perform realtime.send(
  jsonb_build_object('match_id', new.match_id, 'seq', new.seq, 'state', new.state,
                     'summary', new.summary, 'snapshot', new.snapshot, 'updated_at', new.updated_at),
  'score', 'live:' || lower(v_live_code), true);   -- private topic, keyed by the projector code
```

- **One topic** for app and projector → one message per score change, not two (§10).
- Payload is numbers only (no names, no entry fields); unknown `match_id` → viewer refetches the
  board.
- Wrapped in `begin … exception when others then null` — a Realtime hiccup can never fail a score
  write.
- Code change: the trigger in §4.9 sends a `config` event on the **old** topic; the app refetches the
  board, learns the new code and resubscribes; old projectors go to "not active" and can't rejoin.

### 4.6 Who may listen — policy on `realtime.messages`
```sql
create policy live_scores_read on realtime.messages
  for select to anon, authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and public._live_topic_readable(realtime.topic())
    -- topic 'live:<code>' where <code> is a tournament's CURRENT live_code, and
    --   anon:          tournament published AND live_public
    --   authenticated: can_view_tournament(tournament)  (independent of live_public)
  );
-- No INSERT policy → no client can send on these topics. Only the DB trigger can.
```

> **Verify first (build step 1):** private channels with RLS on `realtime.messages` and
> `realtime.send` are available on the project. If not, everything falls back to polling the board
> RPCs every 3–5 s (slower, still works). Nothing else in the plan changes.

### 4.7 Keeping live rows honest
Trigger on `tournament_matches AFTER UPDATE`:
- status → `completed`/`walkover` by another path (e.g. an admin on an **old build**) → live row
  `finished`.
- result reset or entries change → live row deleted.

Cron (reuse the 5-minute job from 119): `live` rows with no update for 6 h → `abandoned`;
`abandoned` rows older than 7 days → deleted.

### 4.8 SQL tests
`docs/live-match/sql-tests.sql` (run via `docs/tournaments/local-db/run.sh`): permission matrix
(anon / member / module admin / tournament admin / other admin), `LIVE_TAKEN` + takeover, stale
`seq` ignored, size/shape limits, rules validation per family + family ↔ `scoring_mode`, per-match
`p_rules`, finish mapping per family (§5.5) → bracket advanced exactly like
`record_tournament_result`, finish on a knockout tie without winner → `TIE_NEEDS_WINNER` and row
stays `live`, PII never in `get_live_board`, every `live_display` switch removes its data, custom
code rules, old code dead after a change, `live_public = false` / draft → anon gets nothing,
realtime policy denies INSERT and denies anon on the old code.

### 4.9 Projector display settings (`tournaments.live_display`)
| Key | Type | Default | Effect |
|---|---|---|---|
| `show_school` | bool | `false` | Core *School* field under names |
| `show_fields` | uuid[] ≤ 2 | `[]` | Extra **public** custom entry fields |
| `show_module` | bool | `true` | Module name on tiles |
| `show_court` | bool | `true` | Court / venue on tiles |
| `show_up_next` | bool | `true` | Up next strip |
| `show_recent` | bool | `true` | Recent results |
| `show_app_promo` | bool | `true` | "Follow live in the Sportron app" + QR |
| `title` | text ≤ 60 | tournament name | Heading |
| `courts` | text[] ≤ 12 | `[]` | Pinned courts in screen order (§9.3) |
| `layout` | `auto`/`row`/`grid` | `auto` | §9.3 |
| `max_per_page` | 1–8 | `6` | Pages rotate above this |
| `final_hold_seconds` | 0–300 | `60` | FINAL stays in its court tile this long |

Default is **names + scores only**. Validated on change (no `CHECK`). `AFTER UPDATE OF live_public,
live_code, live_display ON tournaments` → `realtime.send({}, 'config', 'live:<old code>', true)`
(and the new code) → open projectors refetch within a second.

---

## 5. The scoring engine (all sports)

`src/lib/live/` — **pure TypeScript, no React / React Native imports**, so the same files are used by
the app (referee, viewers, result entry) and the projector site (`live/` imports them through a Vite
alias `@live-engine` → `../src/lib/live`). One place defines every sport's rules and how a score is
displayed.

```
src/lib/live/
  types.ts        LiveRules, Snapshot per family, Summary, Action
  presets.ts      per-sport presets (§5.3) + sport → default preset map
  engine.ts       reduce(snapshot, action, rules) → snapshot   (dispatches on family)
  families/sets.ts · tennis.ts · timed.ts · cricket.ts · simple.ts
  summary.ts      snapshot → Summary (one shape for every family)
  result.ts       snapshot → {score_a, score_b, score_detail, winner?, note}   (§5.5)
  clock.ts        clock maths (§5.4)
  format.ts       "40–AD", "Q3 · 4:12", "145/6 (18.3)", set chips
```

Every action is reversible through **undo history** (§6.4); the engine never mutates.

### 5.1 Rule families
| Family | Used by | Shape |
|---|---|---|
| `sets` | table tennis, badminton, squash, pickleball, volleyball (indoor + beach) | Points → games/sets, best-of |
| `tennis` | tennis (and padel via "More" sports) | 0/15/30/40/AD → games → sets, tiebreaks |
| `timed` | basketball, football (+ futsal), handball, hockey via "More" | Periods with a clock, scoring buttons with values, overtime, shootout |
| `cricket` | cricket | Runs / wickets / overs per innings, target |
| `simple` | "Other" sports and the fallback for anything | Two counters, optional target and clock |

### 5.2 Snapshot & summary
Each family has its own `snapshot` (stored as-is). Every family also produces the same **summary**,
which is all a list card needs:

```ts
type Summary = {
  a: string; b: string;          // big numbers: "17", "40", "AD", "68", "145/6"
  a_sub: string[]; b_sub: string[]; // small chips: finished sets ["21","18"], or ["Q1 18","Q2 22"]
  line: string;                  // context: "Game 3", "Set 2 · Tiebreak", "Q3", "2nd half +3'", "18.3 ov · need 12 off 9"
  server: 'a' | 'b' | null;
  clock: null | { running: boolean; elapsed_ms: number; synced_at: string; dir: 'up'|'down'; limit_ms: number | null };
  state_label: string;           // "LIVE", "Game break", "Half-time", "Innings break", "Penalties", "FINAL"
};
```

### 5.3 Presets per sport (defaults; organisers can override in module settings)

All presets set `best_of` from the round (`tournament_rounds.best_of`, 1/3/5/7) when the family uses
it; the start sheet shows the summary ("Best of 3 · 21 pts · cap 30") with **Change** for that match.

#### Family `sets` — rule keys
`points_to_win`, `win_by` (2), `cap` (null = none), `best_of`, `decider_points` (last set's target,
null = same), `serve` (`alternate_2` / `rally_winner` / `side_out` / `none`), `first_server`
(chosen at start), `change_ends_at` (points in the deciding set, null = none), `interval_at`
(informational break), `side_out_doubles` (pickleball server number 1/2).

| Preset | Points | Win by / cap | Best of | Decider | Serve | Notes |
|---|---|---|---|---|---|---|
| `table_tennis_11` (default TT) | 11 | 2 / — | round (3/5/7) | 11 | 2 each; at 10–10 one each | Change ends at 5 in the deciding game |
| `table_tennis_21` | 21 | 2 / — | round | 21 | 5 each; at 20–20 one each | Old-style / casual |
| `badminton_21` (default) | 21 | 2 / 30 | 3 | 21 | rally winner | Interval at 11; change ends at 11 in game 3 |
| `badminton_15` | 15 | 2 / 21 | 3 | 15 | rally winner | Short format for school events |
| `squash_11` (default) | 11 | 2 / — | 5 (or round) | 11 | rally winner | PAR scoring |
| `squash_15` | 15 | 2 / — | 5 | 15 | rally winner | Older PAR-15 |
| `pickleball_11_sideout` (default) | 11 | 2 / — | 3 (or 1) | 11 | side-out; doubles server 1/2, first server rule | Only the serving side scores (§6.5) |
| `pickleball_rally_11` / `_15` / `_21` | 11/15/21 | 2 / — | 1 or 3 | same | rally winner | Rally scoring variant |
| `volleyball_25` (default) | 25 | 2 / — | 5 (or 3) | 15 | rally winner | No cap; change ends at 8 in the deciding set |
| `volleyball_25_bo3` | 25 | 2 / — | 3 | 15 | rally winner | Common school format |
| `beach_volleyball_21` | 21 | 2 / — | 3 | 15 | rally winner | Change ends every 7 points (every 5 in the decider) — banner reminder |

Behaviour:
- A set/game **ends automatically** when a side reaches the target with the margin (or the cap);
  a banner "Game to Ali 21–17 · **Undo**" stays 5 s; the next game starts at 0–0 after a short
  break state (tap anywhere to start the next game early; auto after 3 s).
- Match point / set point indicator in the line ("Match point Ali").
- Match won (sets majority) → **Finish** screen opens (§6.6), nothing is submitted automatically.
- Serve indicator follows the rule; the referee can tap the serve dot to correct it.
- Change-of-ends reminders are banners only (they never swap the screen by themselves; **Swap
  ends** is one tap).

#### Family `tennis` — rule keys
`best_of` (3/5), `games_per_set` (6; 4 for short sets), `deuce` (`advantage` / `golden_point`),
`tiebreak_at` (games each, default = `games_per_set`), `tiebreak_points` (7), `final_set`
(`tiebreak` / `super_tiebreak_10` / `advantage`), `pro_set` (single set to 8 or 10, tiebreak at
8–8 / 10–10).

| Preset | Description |
|---|---|
| `tennis_bo3` (default) | Best of 3, sets to 6, tiebreak at 6–6 to 7, advantage |
| `tennis_bo3_stb` | Best of 3, third set = super tiebreak to 10 |
| `tennis_short_sets` | Best of 3, sets to 4, tiebreak at 4–4, golden point (school events) |
| `tennis_pro_set_8` | One set to 8, tiebreak at 8–8 |
| `tennis_bo5` | Best of 5, sets to 6, tiebreak in all sets |

Behaviour: tap a side = point to that side. Display: big **0 / 15 / 30 / 40 / AD** (or tiebreak
numbers), games of the current set, set chips. Games and sets end automatically (undo banner). Serve
alternates each game; in tiebreaks 1 then 2-2 (shown with the serve dot); change-ends reminder after
odd games and every 6 tiebreak points. Golden point shows "Deciding point — receiver chooses side"
banner.

#### Family `timed` — rule keys
`periods` (count), `period_minutes`, `clock` (`down` / `up` / `none`), `stoppage` (`stop` = clock
stops on whistle, referee starts/stops; `running` = runs continuously), `buttons` (values per side,
e.g. `[1,2,3]` or `[1]`), `labels` (`"Goal"`, `"Point"`), `overtime` (`none` / `extra_time` /
`repeat_until_winner` / `golden_goal`), `ot_periods`, `ot_minutes`, `shootout` (`none` /
`penalties` / `seven_metre` / `shootout`), `shootout_rounds` (5, then sudden death), `target`
(first to N ends the game, e.g. 3x3 basketball 21), `counters` (optional side counters shown small:
`team_fouls` with `bonus_at`, `timeouts` with per-half allowance, `cards` yellow/red, `corners`),
`allow_added_time` (football).

| Preset | Periods | Clock | Buttons | Overtime / shootout | Counters |
|---|---|---|---|---|---|
| `basketball_fiba` (default) | 4 × 10 min | down, stops | +1 +2 +3 | 5-min OT repeated until a winner (no draws) | team fouls per quarter (bonus at 5th), timeouts 2 / 3 per half |
| `basketball_nba` | 4 × 12 | down, stops | +1 +2 +3 | 5-min OT repeated | team fouls (bonus at 5th), timeouts |
| `basketball_school` | 4 × 8 (or 2 × 20 halves) | down, stops | +1 +2 +3 | 3-min OT repeated | team fouls |
| `basketball_3x3` | 1 × 10 | down, stops | +1 +2 | first to 21 wins; level at time → OT, first to 2 points | team fouls |
| `football_11` (default) | 2 × 45 | up, running | Goal | knockout: extra time 2 × 15, then penalties (5 + sudden death); league: draw allowed | yellow/red cards (optional), added time "+N" |
| `football_school` | 2 × 30 (configurable) | up, running | Goal | penalties directly (no ET) | cards optional |
| `football_7` | 2 × 25 | up, running | Goal | penalties | — |
| `futsal` | 2 × 20 | down, stops | Goal | ET 2 × 5, penalties | accumulated fouls per half (6th = 10 m kick note), timeouts 1 per half |
| `handball` (default) | 2 × 30 | up, stops on timeout only | Goal | ET 2 × 5 (twice), then 7 m throws (5 + sudden death) | team timeouts (3, max 2 per half) |
| `hockey_field` (via "More") | 4 × 15 | up, running | Goal | shoot-out (5 + sudden death) | cards (green/yellow/red) |

Behaviour:
- **Clock** (§5.4) is a big **Start / Stop** control in the middle; period end is **not** automatic
  when the clock hits zero — the screen flashes "End of Q2?" with **End period** (one tap) so the
  referee follows the real buzzer/whistle; up-counting clocks show "45:00 +" and the referee adds
  added time with a "+1 min" chip if they want it shown.
- Breaks (quarter/half-time) are `break` state with a break timer shown on viewers.
- **Draw handling at the end of regulation**: level score → if the match can draw (league/group
  with `allow_draws`) offer **Finish as draw**; otherwise move to the preset's overtime, then
  shootout.
- **Shootout screen**: per side a row of kick circles (✓ scored / ✗ missed); the engine knows when
  it's decided ("Lions win 4–3 on penalties"); sudden death continues automatically.
- Counters are optional chips under each side (tap + / long-press −). They are display only.

#### Family `cricket` — rule keys
`overs` (20 for T20, 10, 6, 5, custom 1–50), `balls_per_over` (6; 8 allowed), `wickets` (10;
fewer for short-format teams), `wide_runs` (1), `no_ball_runs` (1), `free_hit` (bool, info only),
`extras_rebowl` (wide/no-ball don't count as a ball, default true), `tie` (`tie` / `super_over_manual`
— v1 records a tie and lets the admin pick the winner if knockout).

| Preset | Overs | Wickets |
|---|---|---|
| `cricket_t20` (default) | 20 | 10 |
| `cricket_t10` | 10 | 10 |
| `cricket_6_over` | 6 | 6 (tape-ball / indoor) |
| `cricket_custom` | 1–50 | 1–10 |

Behaviour:
- Start sheet asks **who bats first** (toss).
- Ball keypad: **0 · 1 · 2 · 3 · 4 · 6**, **Wd** (wide), **Nb** (no-ball; then pick runs off the bat),
  **B / LB** (byes / leg byes; pick runs), **W** (wicket; optional "runs before out" 0–3), **+5**
  (penalty runs) in a "More" row.
- Display: batting side big **145/6**, overs **18.3**, this over strip `1 4 Wd 0 W 2`, target and
  **need 12 off 9** in the second innings, run rate / required rate small.
- Innings end automatically at overs done or all out (undo banner) → `Innings break` → second
  innings; the match ends automatically when the target is reached, the overs run out or all out.
- Result text generated: "Tigers won by 5 wickets" / "by 12 runs" / "Match tied".

#### Family `simple`
Rule keys: `buttons` (default `[1]`, e.g. `[1, 5]`), `target` (null = none), `clock` (none / up /
down with minutes), `allow_draw` (follows module). Default for **Other** sports and any custom
"More" sport without a mapped preset. Two big counters with + and −.

#### Sport → default preset
`table_tennis → table_tennis_11`, `badminton → badminton_21`, `squash → squash_11`,
`pickleball → pickleball_11_sideout`, `tennis → tennis_bo3`, `volleyball → volleyball_25`
(best of 3 when the round says 3), `basketball → basketball_fiba`, `football → football_11`,
`handball → handball`, `cricket → cricket_t20`, `other → simple`. "More" sports (`sport_key`, 126):
`padel → tennis_bo3`, `beach_volleyball → beach_volleyball_21`, `futsal → futsal`,
`hockey → hockey_field`, `kabaddi/netball/… → simple` until a preset exists (adding a preset later is
a client-only change).

### 5.4 Clock
- The referee phone owns the clock: state `{running, elapsed_ms, period}`; ticking is local (works
  offline). Start/Stop is instant on the phone.
- A snapshot is pushed on every start/stop/period change and **once every 30 s while running**
  (resync), never per second.
- The snapshot's `clock.elapsed_ms` is the value at the moment of the push; the server stamps
  `synced_at` (server time). Viewers display `elapsed_ms + (now − synced_at)` while running, with
  `now` corrected by the `server_now` offset from their last board read. Drift ≤ ~1 s; a delayed
  upload (bad Wi-Fi) just means viewers jump to the right time when it arrives.
- Countdown clocks show tenths in the last minute on the referee screen only (viewers show seconds).

### 5.5 Mapping to the final tournament result
`live_finish_match` → existing `record_tournament_result(score_a, score_b, score_detail, winner, note)`:

| Family | `score_a` / `score_b` | `score_detail` (`[{a,b}]`) | `winner` / `note` |
|---|---|---|---|
| `sets` | sets won | points per set | winner from sets |
| `tennis` | sets won | games per set (tiebreak points only in the live row) | winner from sets |
| `timed` | final score incl. overtime, **excluding** shootout | per period, incl. OT periods | level + shootout → winner = shootout winner, note "Pens 4–3" / "7 m 5–4"; level + draw allowed → draw |
| `cricket` | runs | `null` | winner by runs; note "Tigers 145/6 (20) · Lions 140/9 (20) · Tigers won by 5 runs"; tie in knockout → referee picks winner (super over played offline), note "Tied · won super over" |
| `simple` | totals | `null` | from totals; level → draw if allowed, else pick winner |

Old app builds show `score_detail` as "21-18 · 15-21 · 21-19" — that reads correctly for sets and is
acceptable for periods ("18-20 · 22-19 · …"). The module's `scoring_mode` (`games`/`score`) stays the
authority for standings, so nothing in standings changes.

---

## 6. Scorer experience (full screen, easy to use)

### 6.1 Ease-of-use rules (apply to every scoring screen)
1. **Two taps to start**: Match → **Start live scoring** → start sheet (pre-filled) → **Start**.
2. **Everything pre-filled** from the sport preset and the match; the referee never configures rules
   unless they want to (**Change** link on the summary line).
3. **Big targets**: primary scoring areas fill the screen halves; secondary buttons ≥ 56 dp; nothing
   important in the top corners on phones.
4. **Same place, every time**: Undo bottom-left, Finish/⋯ bottom-right, side A always left (or
   top) until **Swap ends**. Side colours (A = blue, B = orange from the theme) are the same on the
   referee screen, the app viewers and the projector.
5. **Undo is always one tap, never asks, and says what it undoes**: "Undo +2 Lakers". Unlimited for
   the current match. **Redo** appears right after an undo until the next new action.
6. **No pop-up dialogs during play.** Only Finish, Abandon, Leave and Take over use an in-app confirm
   sheet (AGENTS.md alert rules). Everything else is banners with an inline action.
7. **Every action is visible**: a last-action line ("+1 Ali · 18–15") and a brief flash on the
   number that changed; haptic tick per score, stronger on game/period end.
8. **Accident-proof without slowing down**: taps on the *same* button closer than 150 ms are treated
   as one (double-tap bounce), **Lock** button (hold 1 s to unlock) for when the phone goes in a
   pocket between games, swipe-down / back gestures disabled while live.
9. **Works one-handed in portrait, roomy in landscape**, and on tablets / laptop (web) with keyboard
   shortcuts (§6.7).
10. **Never blocked by the network**: sync status is a small pill, never a spinner over the score.
11. **First-time help**: three short `TipCard` hints on first use ("Tap a side to add a point",
    "Undo is always here", "Swap ends to match the court"), dismissible forever.
12. **Accessible**: every control has a label that reads the result ("Point to Ali, 18–15"),
    reduced motion turns off flashes, text scales up to 130 % without breaking the layout.

### 6.2 Start sheet
Bottom sheet from **Start live scoring** (match sheet / live match screen / "Next on Court 2"):
- Both sides with names (tap to swap left/right to match the physical court).
- **Court** chips (pinned courts + courts used today + "Other…") — skippable.
- **Rules summary** line + **Change** (opens the rules editor for this match only).
- Family-specific: **who serves first** (sets/tennis), **who bats first** (cricket), nothing for
  timed (clock starts paused).
- **Start** (big). If the match is already live: **Resume** (same scorer) or **Take over** (confirm).

### 6.3 Screen frame — `src/app/tournament/[id]/module/[moduleId]/score/[matchId].tsx`
`fullScreenModal`, keep-awake on, status bar hidden in landscape.

```
┌────────────────────────────────────────────────┐
│ ✕   QF · Court 2 · Best of 3        ● Synced  ⋯│  top bar (⋯ = Swap ends, Rules, Lock, Abandon, Help)
├───────────────────────┬────────────────────────┤
│                       │                        │
│   ALI KHAN        ●   │   USMAN TARIQ          │
│   21 · 14             │   18 · 21              │  finished sets (small)
│                       │                        │
│        17             │        15              │  current game (huge) — tap anywhere in the half = +1
│                       │                        │
│      [ − ]            │      [ − ]             │  correction, small, bottom of each half
├───────────────────────┴────────────────────────┤
│ Last: +1 Ali · 17–15          Game 3 · Match pt │
│ [↶ Undo +1 Ali]                      [Finish ▸]│  bottom bar
└────────────────────────────────────────────────┘
```

### 6.4 Undo / history
- The engine keeps the action history for the match (array of snapshots; capped at 2,000 entries,
  older ones compacted). Undo/redo produce a new snapshot with a higher `seq` (D3), so viewers
  simply see the corrected score.
- History is persisted with the outbox, so undo still works after the app was killed.
- Undo across a game/set/period/innings boundary is allowed (it reopens the previous one) — the
  banner says so ("Undo — reopens Game 2").

### 6.5 Per-family controls
| Family | Scoring area | Extra controls |
|---|---|---|
| `sets` | Tap a half = +1 for that side. Small **−** per side | Serve dot (tap to fix), Swap ends, interval/ends banners. **Pickleball side-out**: the halves read "Point" on the serving side and "Side out" on the receiving side; the line shows the call "4–2–1" |
| `tennis` | Tap a half = point to that side; big 0/15/30/40/AD | Serve dot, games + set chips, tiebreak shown in place of points |
| `timed` | Per side a column of big buttons, one per value (**+1 +2 +3** basketball, **GOAL** football/handball); small **−1** | Big centre **clock** (tap = start/stop; shows period "Q3"), **End period**, "+1 min" added-time chip (football), counters row (fouls / timeouts / cards) as small tap chips, **Shootout** mode when reached |
| `cricket` | Batting side's score big at top; **keypad** 3 × 4: `0 1 2 3 / 4 6 W Wd / Nb B LB More` | This-over strip, target / need line, **End innings** (manual, for declarations or rain) |
| `simple` | Two big **+** areas (one per side), **−** each, optional extra value chips | Optional clock |

### 6.6 Finish
- When the engine detects the match is decided, a full-width **Finish match** bar appears
  ("Ali wins 2–1 · 21–17 18–21 21–19"); also available any time from the bottom bar (e.g. retirement).
- Finish sheet: final summary, winner (preselected; tie cases ask — shootout winner, cricket super
  over, retirement), optional note (e.g. "Retired hurt"), **Save result** (destructive-style confirm
  not needed; it's the expected action, but the sheet is the confirmation).
- Saving goes through the outbox (§6.8): works offline — "Result saved on this phone, uploading…".
  When it lands: success haptic, "Result saved — bracket updated", screen closes to the live match
  screen in FINAL state with **Next match on Court 2 →** (one tap to start the next one).

### 6.7 Keyboard (web / laptop / tablet with keyboard)
`A` / `L` = point/+1 left/right (`Shift` + `A`/`L` = −1), `1/2/3` + `A`/`L` = basketball values,
`Space` = clock start/stop, `Z` = undo, `Y` = redo, cricket keypad on the number row + `w` `d` `n`
`b`. Shortcuts are shown in ⋯ → Help.

### 6.8 Outbox — `src/lib/liveOutbox.ts`
- One **slot per match** holding the latest snapshot + summary + `seq` + history → a burst of taps on
  bad Wi-Fi becomes 1–2 requests.
- Every change: update memory → **fire-and-forget** `AsyncStorage.setItem('live_outbox:<id>')` →
  wake the sender. The tap handler awaits nothing.
- Sender: **one request in flight per match**; when it returns, send again if `seq` moved on; min gap
  150 ms. Failure → backoff 1 s, 2 s, 4 s, 8 s, cap 10 s; flush on `AppState` active and on any
  success. No NetInfo (no new native module); connectivity is learned from request results.
- `LIVE_TAKEN` → stop, banner "Another admin took over scoring", screen read-only, nothing lost.
- **Finish is queued** as the slot's final op; server rejection (e.g. `TIE_NEEDS_WINNER`) is shown the
  next time the screen is open, with the fix inline.
- `seq = max(serverSeq, localSeq) + 1`; resume/takeover reads the row first.
- Device id: random UUID in AsyncStorage (`live_device_id`).
- Sync pill: `● Synced` / `Syncing…` / `Offline — saved on this phone` (tap → "last sent 12 s ago").
- **Resume banner** on the tournament screen and the Tournaments tab when an unfinished slot exists
  ("You're scoring Ali vs Usman — Resume").

---

## 7. Full-screen result entry (replaces the current popup)

Today an admin enters a final result in `ResultEntrySheet` (a bottom sheet with small steppers,
validation via `alert()`). It becomes a **full-screen Enter result screen** — the same route as live
scoring with `?mode=result` — sharing the frame, colours and components, so admins learn one screen.

- **Open from** the match sheet's **Enter result / Edit result** (same place as today). The old
  sheet component is deleted in the OTA; old builds keep their own sheet, and both write through the
  same RPCs.
- **Tabs at the top**: **Result** · **Walkover**.
- **Sets / tennis**: one row per set/game, sized to the best-of (e.g. 3 rows). Each row: set label,
  and for each side a large stepper **[ − ] 21 [ + ]** (≥ 56 dp buttons; tap the number to type it with
  the number pad; long-press + / − repeats). Tennis rows hold games (and an optional tiebreak score
  that appears when a row is 7–6). **+ Add set** / remove last set (when best-of allows). The running
  outcome is shown live at the top: "Ali wins 2–1".
- **Timed**: two big totals steppers (one per side), optional **Add period breakdown** (rows per
  period; totals then follow the rows), **Penalties** block appears when the totals are level in a
  knockout.
- **Cricket**: per side Runs / Wickets / Overs (`18.3` format) steppers + "won by" generated.
- **Simple**: two big steppers.
- **Validation inline, never `alert()`**: red text under the row for impossible results ("A set can't
  end level"); amber, non-blocking hints for unusual ones ("21–20 isn't a finished badminton game —
  save anyway?"), so real-world exceptions (retirements) are still possible. **Save** is disabled
  only for impossible input, and the reason is written under the button.
- **Undo / Redo / Clear** in the bottom bar for the form (each change is a step), so a slip of the
  thumb is one tap to fix; **Clear** asks inline ("Clear all scores? Clear · Cancel").
- **Winner picker** appears only when the score can't decide it (level in a knockout) — two big name
  buttons.
- **Note** field (≤ 200) collapsed under "Add note".
- **Save** (sticky, full width) goes through the same outbox final-op as live scoring → works on bad
  Wi-Fi, shows "Saved on this phone, uploading…" until confirmed; server errors map through
  `friendlyTournamentError` and show inline.
- **Edit result** pre-fills from the match (and from the live row's detail when it exists).

---

## 8. Player & spectator experience — in the app

Works on Android and the sportron.app web build; independent of the projector toggle.

### 8.1 Where you find live matches
- **Tournaments tab**: *Live now* strip (from `get_live_tournaments`, polled every 60 s while the tab
  is focused) → tap → that tournament's Live screen. Hidden when nothing is live.
- **Tournament screen**: *Live now* section above *Today's matches* (compact cards; polled every 20 s
  while focused) + **See all live**. Hidden when nothing is live or the RPC is missing.
- **LIVE pill** on match rows and bracket nodes (from the same polled board); tap → live match
  screen (admins still reach the match sheet via its button).
- Polling instead of sockets on these three surfaces is deliberate (§10): they are glanceable, and
  only the two "watching" screens below hold a realtime connection.

### 8.2 Live screen — `src/app/tournament/[id]/live/index.tsx`
- **Live** — card per match, ordered by court then start: round label, court, both sides (name +
  public fields, avatar for linked profiles), the family's summary (sets chips / quarter / innings),
  big current numbers, serve dot, running clock, state label. Changed numbers flash.
- **Up next** and **Recent results** (30 min).
- Module and court filter chips; pull to refresh; "waiting for scorer" after 90 s without updates
  (timed family: not while the clock is running).
- On tablets / wide web windows: 2–3 columns of cards.

### 8.3 Live match screen — `src/app/tournament/[id]/live/[matchId].tsx`
- Large score in the family's format, full detail from `snapshot` (all set scores, quarter-by-quarter
  table, cricket innings with this-over strip, shootout circles), clock, round, court, venue.
- After FINAL: winner highlighted, detail kept, **View in bracket**.
- Header **Share** (in-app link `https://sportron.app/tournament/<id>/live/<matchId>`); admins see
  **Score this match** / **Resume scoring**.

### 8.4 Data hooks
`useLiveBoard(tournamentId, { realtime })` / `useLiveMatch(matchId)` / `useLiveTournaments()`:
first load via RPC → (realtime screens only) `supabase.channel('live:<code>', { config: { private:
true } })` event `score` → apply if `payload.seq > held.seq`; unknown match → refetch board
(debounced 500 ms); `config` event → refetch + resubscribe if the code changed; reconnect or
`AppState` active → refetch; socket down → poll every 10 s. Unsubscribe on blur. One shared channel
per tournament (ref-counted registry). `useTournamentModule` is unchanged; finishing a match updates
the bracket through its existing subscription.

### 8.5 Organiser controls — `tournament/[id]/manage.tsx` → **Projector screen** card
1. **Projector link** switch (on by default). Turning it **off** asks for confirmation ("Screens using
   the link will stop showing scores").
2. **Link**: `<base_url>/<code>` with Copy / Share, the code in large letters, per-court hint, and
   **Change link** (new random / custom, confirm "The old link stops working").
3. **What the screen shows**: switches (§4.9), Title, preview.
4. **Courts & layout**: pinned courts (add / rename / reorder / remove, "Add Court 1–3"), layout,
   tiles per screen, keep FINAL for; 16:9 miniature preview.

Module manage screen (`module/[moduleId]/manage.tsx`) gets a **Scoring rules** row: preset picker
(sport's presets first) + the family's settings form, with a one-line plain summary ("Best of 3 ·
games to 21 · cap 30 · rally scoring"). Changes apply to matches started afterwards.

---

## 9. Projector website — `live/` → `live.sportron.app`

### 9.1 Why separate
The Expo web build forces sign-in, runs the maintenance gate, ships the whole app and is built for
phones. A gym projector is often an old PC on slow Wi-Fi, open for hours, nobody signed in. `live/`
mirrors `admin/` (Vite + React + `@supabase/supabase-js`, own `package.json`, own Vercel project,
excluded from root tsconfig/ESLint) and imports the scoring engine via `@live-engine`.

### 9.2 Routes
| Path | Content |
|---|---|
| `/:code` | All courts at once, one tile per court, side by side (§9.3); footer Up next + app promo QR (`app_link`) — each part per `live_display` |
| `/:code?court=Court 1,Court 2` | Only these courts, in this order |
| `/:code?layout=row&max=3` | Override layout for this screen |
| `/:code?match=<id>` | One match full screen |
| `/:code?module=<id>` | One module |
| `/` | "Enter the code from the organiser" |
| Unknown / off code | Calm "This screen isn't active" page, retries every 30 s |

### 9.3 Many courts on one screen
```
┌──────────────────────── SEECS Open 2026 · Badminton ───────────────────────────┐
│ ┌─ COURT 1 ─────────┐  ┌─ COURT 2 ─────────┐  ┌─ COURT 3 ─────────┐            │
│ │ ● LIVE  Men's S QF│  │ ● LIVE  Women's SF│  │ Game break  MD R1 │            │
│ │ Ali Khan       ●  │  │ Sara Malik        │  │ Ahmed / Bilal     │            │
│ │ 21  ·  14         │  │ 19                │  │ 21  ·  18         │            │
│ │        17         │  │        12         │  │         0         │            │
│ │ ───────────────── │  │ ───────────────── │  │ ───────────────── │            │
│ │ Usman Tariq       │  │ Hina Riaz      ●  │  │ Zain / Omar       │            │
│ │ 18  ·  21         │  │ 21                │  │ 16  ·  21         │            │
│ │        15         │  │        10         │  │         0         │            │
│ └───────────────────┘  └───────────────────┘  └───────────────────┘            │
│ Up next · C1 4:30 Hamza vs Faraz · C2 4:40 Ayesha vs Noor        ● [QR] app    │
└────────────────────────────────────────────────────────────────────────────────┘
```
- **Tile per court** (court name, case-insensitive); a live match without a court gets its own tile
  after the courts. Start sheet asks for the court (skippable). Two live matches on one court → both
  shown with a note.
- **Stable order**: pinned courts → natural sort ("Court 2" < "Court 10") → unnamed by start time.
  A score change never moves a tile. Pinned courts keep their tile all day: FINAL for
  `final_hold_seconds`, then "Next on Court 2 · 4:40 · Ayesha vs Noor" or "Court 2 · free".
  Unpinned tiles appear/disappear with a 5 s settle + cross-fade.
- **Layout (auto, 16:9)**: 1 = full · 2 = side by side · **3 = side by side** · 4 = side by side on
  ≥ 1.9 : 1 else 2 × 2 · 5–6 = 3 × 2 · 7–8 = 4 × 2 · more = pages rotating every 15 s. `row` /
  `grid` override; portrait screens stack.
- **Inside a tile**: arrangement from the tile's own size (narrow → A above B; wide → A left, B
  right), measured with `ResizeObserver` (no container queries for old browsers). Font sizes from tile
  height; names fit-to-width then ellipsis. Each tile renders its family: sets chips + points;
  tennis 40–AD + games; **basketball/football tile with the clock and period under the score**;
  cricket "145/6 (18.3)" + need line; shootout circles. Tiles of different sports sit side by side.
- Header/footer shrink at ≥ 5 tiles. Changed numbers flash.
- **Performance**: one subscription; a score event re-renders only its tile (memoised by match id);
  the clock ticks with one shared `requestAnimationFrame`/1 s timer for all tiles; system fonts with
  tabular numerals; no images except the optional QR.

### 9.4 Projector rules
Dark, very high contrast; no interaction needed (auto-reconnect, cursor hidden after 3 s, self-hiding
Fullscreen button); Screen Wake Lock where available; socket down → poll every 5 s with jitter;
reload once every 6 h; tiny status dot; "waiting for scorer" after 90 s idle (not while a clock
runs); states LIVE / Game break / Half-time / Innings break / Penalties / FINAL / Match ended;
`@vitejs/plugin-legacy` (≈ Chrome 64 / Firefox 60 / Safari 12).

### 9.5 Deploy
Vercel project root `live/`, SPA rewrite `/(.*) → /index.html`, same security headers as the main
site. Domain `live.sportron.app` (DNS CNAME `live` → `cname.vercel-dns.com`). Env
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Moving domains later = deploy on the new domain +
update `remote_config.live_projector_base_url`; keep the old domain attached for a while. Migration
133 seeds `live_projector_base_url` (`https://live.sportron.app`) and `live_app_link`
(`https://sportron.app/get`).

---

## 10. Free plan: overhead and limits

> Limits below are Supabase **Free** plan Realtime quotas as last known — **confirm in the dashboard
> (Settings → Usage / Realtime) in build step 1**: ~**200 concurrent connections**, ~**2 million
> messages / month**, ~**100 messages / second**, ~100 channel joins / second. Database 500 MB,
> egress 5 GB / month.

### 10.1 Why "projector on by default" adds no overhead
- No code exists until a match actually goes live, so nothing is reachable for tournaments that never
  use live scoring.
- The broadcast goes to **one topic** that the app and projectors share (D5) — turning the projector
  on doesn't add a second message per update.
- A message is only delivered to clients that are subscribed; with no projector open, the projector
  costs nothing. The database work per update is identical either way (one row update + one
  `realtime.send`).

### 10.2 Keeping message volume low
- **Messages delivered ≈ score updates × live subscribers.** Subscribers are only: open projectors,
  and app users on the **Live screen** or a **live match screen** (focused). Everything glanceable
  (Tournaments strip, tournament section, pills) polls (§8.1).
- Snapshots are coalesced on the referee phone (≤ ~6/s worst case, typically one per rally).
- Clocks send ~2 messages per minute while running (resync every 30 s), **not** 60 (D17).
- Payload ≤ 2 KB (numbers only).

### 10.3 Budget example
3 badminton courts × 8 h × ~200 updates/h = **4,800 updates/day**. With **30** live subscribers
(2 projectors + 28 app users watching) → **~144,000 messages/day**; a 3-day event ≈ **430,000** (≈ 22 %
of 2 M/month). Peak rate ≈ 3 courts × 0.3 updates/s × 30 = **~27 messages/s** (< 100/s).
Basketball adds clock resyncs: +2/min per running court. **Rule of thumb on Free: up to ~150
simultaneous watchers is safe at peak; beyond that, rates near 100/s become possible.**

### 10.4 Graceful degradation + kill switch
- If a channel join fails (connection cap) or Realtime errors, clients fall back to polling the board
  every 5 s (projector) / 10 s (app). Users still see scores, just a few seconds later.
- Remote config `live_realtime` (`true` default) → set `false` from the admin panel to put every
  client on polling instantly if the month's quota gets close; `live_poll_seconds` tunes the interval.
- Polling cost: each poll is one small indexed RPC (~2–5 KB). 100 app pollers at 10 s ≈ 10 req/s —
  fine for the Free database; egress ≈ 4 GB/month only if that ran 24/7, so it's a fallback, not the
  normal path.
- Owner checklist before a big event: check Realtime messages used this month, consider Pro for a
  large event (it raises connections to 500 and messages to 5 M).

---

## 11. Feature flag, OTA and backward compatibility

### 11.1 Flag
`live_scoring` inserted OFF in 133. Gates **Start live scoring**, the projector card, module
**Scoring rules**, the resume banner. **Viewing** surfaces aren't flagged (they appear only when
something is live). The new **Enter result** screen is gated by the same flag: flag off → the current
sheet behaviour (kept until the flag is on everywhere, then deleted in a later OTA).

### 11.2 OTA rules
- `runtimeVersion.policy = "fingerprint"`: run `npx @expo/fingerprint .` before and after; the hash
  must be **identical** or the feature needs a store build.
- Allowed: pure-JS packages (QR encoder `qrcode-generator`), modules already in the build
  (`expo-keep-awake` via `expo`, `react-native-svg`, `expo-haptics`, AsyncStorage, Reanimated).
- Not allowed in v1: NetInfo, `expo-screen-orientation`, new config plugins or native `app.json`
  fields.
- After a `package.json` change: npm 10 lock regeneration + both `npm ci --dry-run` checks.
- Publish: `eas update --channel preview` → test → `eas update --channel production`.

### 11.3 Backward-compatibility checklist
- [ ] Migration 133 only adds (defaulted / nullable columns, one table, functions, triggers, one
      realtime policy, flag + remote-config rows).
- [ ] `tournament_matches` and `record_tournament_result` unchanged; old builds' result sheet keeps
      working and §4.7 keeps live rows consistent.
- [ ] `get_tournaments`, `get_tournament_detail`, `get_module_matches` shapes unchanged (live data
      comes from new RPCs; `live_rules` read via a new RPC or appended column only).
- [ ] New OTA on a DB without 133: live RPCs "not found" → all live UI hides (schedule-style).
- [ ] No edge function changes; no new notification types.
- [ ] Every new `SECURITY DEFINER` function: revoke from public/anon, explicit grants.

---

## 12. Security & privacy
- **No fake scores**: clients can only receive on `live:*`; only the DB trigger sends; writes only via
  `live_push_score` by the current scorer (an admin).
- In-app viewing uses normal `can_view_tournament` rules; the projector is the only no-sign-in surface
  and shows names + scores unless the organiser switches more on; private fields are never sent.
- Codes are random (unguessable) unless the organiser picks a custom one; changing the code cuts off
  old screens immediately.
- `live_push_score` rate-limited per match; anon RPC is a cheap indexed read.

---

## 13. Routing & web rules
- New routes: `/tournament/[id]/live`, `/tournament/[id]/live/[matchId]`,
  `/tournament/[id]/module/[moduleId]/score/[matchId]` (`fullScreenModal`, `slide_from_bottom`;
  `?mode=result` for result entry).
- `HeaderBack`: `/tournament/<id>/module/<mid>/score` → add to `NON_SCREEN_PARENTS` (fallback the
  module screen). `/live` is a real screen.
- `vercel.json` rewrites for all three (most specific first); check that web login returns to the
  original path.
- `tournamentRoutes.ts`: `liveBoard`, `liveMatch`, `scoreMatch`, `enterResult`.

---

## 14. Phase 2
1. Volunteer **scorer role** (no other admin powers).
2. **"Match is live" push** (`tournament_match_live`, check-constraint migration).
3. Per-player events (goal scorers, cards per player, basketball points per player, cricket
   batting/bowling cards).
4. Point-by-point event log → momentum charts.
5. Cricket super-over engine, DLS.
6. Live for community matches.
7. Sponsor/organiser logo on the projector.

---

## 15. Build order (each step leaves everything working)

| # | Step | Files | Ships via |
|---|---|---|---|
| 1 | Verify private channels + `realtime.send`; read Free-plan Realtime quotas in the dashboard (§10) | — | owner |
| 2 | Migration 133 + `docs/live-match/sql-tests.sql` passing on local DB | `supabase/migrations/133_add_live_match_scoring.sql` | owner applies |
| 3 | Scoring engine: types, presets, families, summary, result mapping, clock, formatting + scratch tests per sport (TT deuce, badminton cap 30, volleyball 5th set 15, pickleball side-out, tennis deuce/golden/tiebreak/super-tiebreak, basketball OT, football ET + penalties, handball 7 m, cricket chase/all-out/tie, simple) | `src/lib/live/**` | OTA |
| 4 | Types + services + error codes | `src/types/tournaments.ts`, `src/services/tournaments.ts`, `lib/tournamentErrors.ts` | OTA |
| 5 | Outbox + device id + resume banner | `src/lib/liveOutbox.ts` | OTA |
| 6 | Scoring screen frame + per-family control panels + start sheet + finish sheet + keyboard + routes/HeaderBack/rewrites | `score/[matchId].tsx`, `components/live/**` | OTA |
| 7 | Full-screen **Enter result** (§7), flag-gated, match sheet wiring | `score/[matchId].tsx?mode=result`, `components/live/result/**`, `TournamentMatchSheet.tsx`, `module/[moduleId].tsx` | OTA |
| 8 | Module **Scoring rules** editor | `module/[moduleId]/manage.tsx`, `components/live/RulesEditor.tsx` | OTA |
| 9 | Viewers: hooks, Live screen, live match screen, Live now section + strip, LIVE pills | `hooks/useLive*.ts`, `tournament/[id]/live/**`, `tournament/[id].tsx`, `(tabs)/tournaments.tsx`, `TournamentMatchRow.tsx`, `BracketMatchNode.tsx` | OTA + web deploy |
| 10 | Projector card in manage | `ProjectorLinkCard.tsx`, `ProjectorDisplaySettings.tsx`, `ChangeLiveCodeSheet.tsx` | OTA |
| 11 | `live/` projector site (tiles per family, layout engine, self-healing, legacy build), Vercel + DNS | `live/**` | Vercel |
| 12 | Fingerprint check → preview OTA → hall test (§17) → production; flag on for one tournament | — | owner |
| 13 | Docs: AGENTS.md (section, tables, RPCs, anon exception, `live/` app, `src/lib/live`, next migration 134), PROGRESS, What's New | docs | — |

---

## 16. Questions for the owner

Answered: in-app watching ✔ · projector info switchable ✔ · projector link changeable ✔ · courts side
by side ✔ · projector on by default ✔ · admins only ✔ · Free plan ✔ · all sports ✔ · full-screen result
entry ✔.

1. **Custom links** — allow readable codes (`seecs-open`), or random only?
2. **Domain** — `live.sportron.app` OK, and do you control the DNS?
3. **Presets** — are the defaults in §5.3 right for your events? In particular: volleyball best of 3
   or 5, football duration for university matches (2 × 45 or shorter), basketball FIBA 4 × 10 or a
   shorter school format, cricket overs (T20, 10 or 6).
4. **Cricket depth** — runs/wickets/overs per side (planned) enough, or do you need batter/bowler
   names in v1?
5. **Counters** — show fouls/timeouts/cards on viewers and the projector, or keep them on the referee
   screen only?

---

## 17. Test script (before turning the flag on)

1. Score 20 points fast on good Wi-Fi: app viewer and projector follow within ~1 s, never backwards.
2. Airplane mode, score 15 points, undo 2: no stutter, pill *Offline*; back online → viewers jump to
   the right score.
3. Kill the app mid-game → resume banner → same score and history (undo still works).
4. Second admin: **Take over**; first phone stops with a banner.
5. Finish a knockout football match level after ET → penalties → winner recorded, note "Pens 4–3",
   bracket advances, existing result push arrives.
6. Old build admin records the result while live → live card turns FINAL.
7. **Each sport once** on a phone and a tablet: TT 5-game match with deuce; badminton to 30–29;
   pickleball side-out doubles; volleyball 5th set to 15; tennis with deuce, a tiebreak and a super
   tiebreak; basketball with OT and fouls; football with added time; handball 7 m; cricket chase won
   by wickets and a tie; "Other" simple counter.
8. Clock: start/stop basketball on the referee phone while offline 30 s → viewers resync within one
   update after reconnect; drift ≤ 1 s.
9. **Three courts at once** on the projector: three tiles side by side, independent updates, no tile
   moves; finish Court 2 → FINAL → "Next on Court 2". Mixed sports (badminton + TT) side by side. Read
   from the back of the hall.
10. Projector on an old laptop for 2 h, Wi-Fi off/on twice → recovers alone.
11. Projector link off → "not active"; on → comes back. Change link → old screen dies, new one works.
    Display switches update the open projector within ~1 s.
12. Full-screen Enter result: every family, undo/redo/clear, impossible vs unusual validation, offline
    save, edit an existing result.
13. Ease-of-use check with someone who has never seen it: start a match and score a game without help
    in under a minute.
14. Set `live_realtime = false` → all clients keep working by polling.
15. Web: hard reload of `/tournament/<id>/live/<matchId>` works; keyboard shortcuts work.

---

## 18. Build log — deviations from the plan

**Step 2 (migration 133 + tests) — done.**
- Board / settings reads return **one jsonb document** (`active`, `server_now`, `tournament`, `display`, `app_link`, `live`, `recent`, `up_next`) instead of `RETURNS TABLE` — one round trip and additive growth. `get_live_board` returns `{active:false}` for unknown/off/draft (no existence leak).
- **Rules are resolved by the client engine** (single source of truth for presets). The server validates only the envelope (object, ≤ 4 KB, known `family`) and `family ↔ scoring mode`: a `games` module must use `sets`/`tennis`; a `score` module may use any family (volleyball keeps `scoring_mode = 'score'` and uses sets rules). `live_start_match` therefore needs `p_rules` (or the module's saved `live_rules`) and also takes the initial `p_snapshot` / `p_summary`.
- `live_push_score` accepts snapshot `state` ∈ `live | break | decided`; the row state is `live`/`break` (`decided` = engine says the match is won, still live until **Finish**). When two pushes land < 50 ms apart the second is **not applied and not an error**: the response carries the old `seq`, so the **outbox must resend when the returned `seq` < the `seq` it sent** (after ~250 ms).
- One broadcast topic `live:<code>` for app **and** projector (D5); deletes broadcast `{match_id, removed:true}`; `config` events go to the old and new code.
- Local test stand-in for Realtime added to `docs/tournaments/local-db/stubs.sql`; `docs/live-match/sql-tests.sql` is wired into `run.sh`.

**Step 3 (scoring engine `src/lib/live/`) — done.** Pure TS, strict-clean, lint-clean. `docs/live-match/engine-tests.cjs` (231 checks; compile + run command in its header) covers TT deuce + serve rotation, badminton cap 30, volleyball decider to 15, pickleball side-out (doubles + singles), squash, tennis (deuce, golden point, tiebreak serving, super tiebreak, pro set, advantage final set), basketball (clock, fouls reset, repeated overtime, 3x3 target), football (extra time, penalties incl. early finish + sudden death, league draw), handball 7 m, cricket (wides/no-balls/byes, over strip, chase, all out, tie), simple counter, undo/redo (across game boundaries, clock preserved), presets/resolveRules.
- `Summary` gained optional `a_mid` / `b_mid` (sets won · games in the current set · overs · shootout goals) next to `a_sub` / `b_sub`.
- Clock: the snapshot holds `{running, elapsedMs, ref}` (local epoch); `summarize(snap, rules, {at})` freezes it into `summary.clock.elapsed_ms`, and viewers add `server_now − updated_at` (`viewerElapsed`). The row's `updated_at` plays the role of `synced_at` — no extra column.
- Swap-ends is a pure UI concern (not an engine action). Round `best_of` is authoritative for sets/tennis, exactly like the existing result sheet.

**Step 4 (types + services) — done.** `src/types/live.ts` (board / match / settings shapes, exported from `@/types`), `src/services/tournamentsLive.ts` (one wrapper per RPC + `isLiveUnavailable()` for the "migration not applied yet" case), friendly copy for `LIVE_TAKEN`, `LIVE_CODE_TAKEN`, `RATE_LIMITED` and the new `FIELD_INVALID:*` keys in `lib/tournamentErrors.ts`, projector display defaults in `src/lib/live/display.ts`. `setModuleLiveRules` takes the **full resolved rules object** (the server requires `family`).

**Step 5 (outbox) — done.** `src/lib/liveOutboxCore.ts` is pure (transport / storage injected) and tested by `docs/live-match/outbox-tests.cjs` (44 checks: 20-tap burst → ≤ 3 requests, taps return instantly while the network hangs, offline → backoff → recovery, `LIVE_TAKEN`, server-ahead conflict, dropped write resent, ended elsewhere, fatal errors surfaced, kill + restart resumes unsent work with undo history, `open()` prefers whichever side is newer, finish queued / rejected / fixed, discard, stable status object). `src/lib/liveOutbox.ts` binds it to Supabase + AsyncStorage (+ `AppState` foreground retry, `getLiveDeviceId()`); `src/hooks/useLiveSync.ts` exposes `useLiveSync(matchId)` (sync pill) and `usePendingLive()` (resume banner).
- A finish the server rejects (tie in a knockout, downstream played…) is **not retried**: the slot keeps the live state, `status.finishError` carries the code, and the screen shows the fix inline.
- Unsent work survives an app kill: the slot (latest snapshot + last 300 undo steps) is persisted on every change; `startLiveOutbox()` (to be called once from the root layout in step 6) reloads and uploads it.

**Step 6 (referee screen) — done, needs the on-device check (§17).** Route `/tournament/<id>/module/<mid>/score/<matchId>` (full-screen modal, gesture-back off, registered in the root stack, `vercel.json` rewrite, `HeaderBack` fallback to the module, `tournamentRoutes.score`). Flow: flag + admin + match checks → **resume from this phone** (`liveOutbox.peek`, works offline) → server row (resume as the same scorer, or **Take over** confirm when another admin scored < 2 min ago) → **Start sheet** (pre-filled rules summary + Change, who serves / bats first, court chips) → scoring.
- Files: `src/hooks/useLiveScorer.ts` (state + outbox glue, clock resync every 30 s), `src/components/live/` (`parts.tsx` sync pill / big tappable halves / buttons / banners, `RallyPanel` sets + tennis, `TimedPanel` clock + counters + shootout, `CricketPanel` keypad, `SimplePanel`, `StartSheet`, `FinishSheet`, `ResumeBanner`), `src/constants/liveColors.ts` (A blue / B orange).
- Ease-of-use rules implemented: big tap halves, − under each side, Undo/Redo bottom bar naming what it undoes, banners instead of dialogs, 150 ms bounce guard, lock screen (hold 1 s), keep-awake, Android back asks before leaving, keyboard shortcuts on web (A / L, Shift = −1, Z, Y, Space).
- Entry points: **Live scoring** button in the match sheet (flag-gated, admins, undecided matches) and a *Resume scoring* banner on the tournament + module screens; `startLiveOutbox()` runs from the root layout once signed in.
- `docs/live-match/outbox-tests.cjs` now also covers `peek()` (46 checks).
- Not yet visually verified: layouts were typechecked, linted and bundled (web export OK) but not run on a device.

**Step 7 (full-screen Enter result) — done, needs the on-device check.** Same route as live scoring with `?mode=result` (`tournamentRoutes.score(id, moduleId, matchId, 'result')`); the module screen's **Enter result / Edit result** opens it when the `live_scoring` flag is on, otherwise the old sheet (`ResultEntrySheet` stays until the flag is on everywhere). Logic is pure and tested: `src/lib/live/resultForm.ts` (blocking errors vs amber hints per family, outcome text, note composition, form undo / redo) — 266 engine checks. UI: `src/components/live/ResultEntry.tsx` (big − / + steppers with tap-to-type and hold-to-repeat, one row per game / set / period, totals for timed / cricket / simple, optional period breakdown, penalties when a knockout is level, cricket wickets + overs for the note, winner picker only when the score can't decide, Undo / Redo / Clear with an inline confirm, Walkover tab).
- **Deviation:** plain result entry calls `record_tournament_result` directly (inline error + retry, form kept) instead of going through the outbox. Only live scoring has the offline-first guarantee; a result entered after the match can simply be retried. An offline queue for plain results can be added later without server changes.

**Step 8 (module scoring rules) — done.** `src/components/live/RulesEditor.tsx` → `ModuleRulesSection` on the module manage screen (flag-gated): plain-language summary of the current rules, a sheet with the sport's formats first (formats that don't fit a `games`-mode module are hidden), a settings form generated per family (points / cap / serve / deuce / periods / overtime / shootout / counters / overs / wickets / …), **Save rules** (`set_module_live_rules`, stores the full resolved rules) and **Use the sport's standard rules** (clears). "Best of" is deliberately not edited here — it comes from each round, like the existing result sheet. Changes apply to matches started afterwards.

**Step 9 (viewers in the app) — done, needs the on-device check.**
- Data: `src/lib/liveChannels.ts` (one ref-counted private channel `live:<code>` per tournament, 3 s keep-alive — `supabase.channel()` returns the same channel for a repeated topic, so screens must share it), `src/hooks/useLiveBoard.ts` (+ `useLiveTournaments`), `src/hooks/useLiveMatch.ts`: first load by RPC → apply broadcasts only when `seq` is newer → refetch for anything that moves lists → poll while the socket is down or when remote config `live_realtime` is `false` (the Free-plan kill switch; `live_poll_seconds` tunes it). Glanceable surfaces never open a socket (polling: tournament screen + module screen 20 s, Tournaments-tab strip 60 s). Pure board logic (`applyScoreEvent`, `courtKey`, `compareCourts`, `isStale`) lives in `src/lib/live/boardState.ts` with 13 more checks (279 engine checks).
- UI: `/tournament/<id>/live` (all live courts as cards, module + court filter chips, Up next, Recent results, pull to refresh, 2–3 columns on wide screens), `/tournament/<id>/live/<matchId>` (big score, per-sport detail: game / set table, quarter table, fouls / timeouts / cards, cricket innings, shootout kicks, clock, stale note, View in bracket, Resume scoring for the current scorer, Share = in-app link), **Live now** section on the tournament screen, **Live now** strip on the Tournaments tab, **LIVE** pills on match rows and bracket nodes (`src/lib/liveStatusStore.ts` fed by the polling hook), **Watch live** button in the match sheet.
- Registered: stack screens in the root layout, `vercel.json` rewrites for both routes (before `/tournament/:id`); web export builds. Colour constant renamed `SideColors` (the `LiveSide` name is now the board type).
