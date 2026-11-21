# Sportron Usage Analytics — Plan (draft)

Status: **implemented in code (migrations 135–137 + `admin/src/pages/usage/*`); not yet applied to the live project or deployed.** Next migration number: **138**.

### As built — differences from the draft below
- **Open questions decided**: tracking seeded **ON**; **super_admin only** (no analyst role); **no per-user lookup page**; API-log cron (§5) **skipped**.
- **Rollups run hourly** (today + yesterday + last 48 h of chat) from one pg_cron job `usage-tick` every 15 min, not nightly — so "today" needs no live merge.
- **Wrapping method (§4)**: original RPCs are renamed to `_usage_inner_<name>` and wrapped by a same-signature VOLATILE function (done in a DO block that works for any language / whichever migration defined the function last), instead of re-creating each body.
- **Leaves** are not tracked (no record of them besides audit logs); communities show joins only.
- **Charts** are dependency-free SVG (`admin/src/components/charts.tsx`), no Recharts (no lock-file change).
- Sessions: filled rate and no-show rate come from `sessions.status` / `commitments.feedback_status`.
- Not built: §6.7 user lookup, §5 API logs, §9 app-version header.

### Rollout checklist
1. Apply migrations 135, 136, 137 (SQL editor, in order). Check `select * from cron.job where jobname = 'usage-tick'`.
2. Smoke test the app: Communities / Sessions / Tournaments / Chats tabs still load (wrapped RPCs).
3. Deploy the admin site, open **Usage**, press *Rebuild history from …* once (messages, posts, matches, sessions back to day one). Screen visits and active users start from the day of step 1.
4. If anything looks wrong: *Usage → Tracking → Turn tracking off* (or `update site_config set value='{"enabled": false}' where key='usage_tracking'`).

---


Goal: see real usage of the app on the admin panel — who is active, when, which communities are
alive, how much people chat, which screens get opened — **without adding any new API call to the
app.** Everything is measured on the Supabase side from data the app already sends.

---

## 1. Can it be done server-side only? Mostly yes

| Want to see | Server-side source (no app change) | Quality |
|---|---|---|
| Everything people **do** (chat, posts, likes, comments, matches, sessions, joins, pings, tournaments) | The rows themselves (`created_at` on every table) + `audit_logs` (triggers on 18 tables) | Exact |
| Active users (DAU / WAU / MAU), when people are online | `auth.sessions` (token refresh ≈ every hour while the app is open; `refreshed_at`, `user_agent`) | Good, hour-level |
| Platform split (Android app vs web) | `auth.sessions.user_agent`, and the `x-client-info` header supabase-js already sends on every request | Good |
| New sign-ups, onboarding finished, first action | `auth.users.created_at`, `profiles.created_at`, first row in any activity table | Exact |
| Push reach / notification engagement | `profiles.fcm_tokens`, `in_app_notifications.read`, `notification_preferences` | Exact |
| Who has a chat open right now | `chat_presence.last_seen_at` (heartbeat the app already sends) | Exact |
| **Page / screen visits** ("which community was opened, when") | The read RPCs the app already calls per screen (`get_community_by_id`, `get_my_communities`, `get_open_sessions`, `get_tournament_detail`, …) — count them inside the function | Good proxy, see §4 |
| Raw request volume per endpoint | Supabase API logs (Logflare), pulled by a cron | Optional, see §5 |

What we **can't** get without an app change: exact screen time, taps that don't hit the server,
screens that load from cache only (e.g. Chats hub within its 30 s cache), app version.
(App version could later be added as a *header* on the existing client — still no new call — §9.)

---

## 2. Architecture

```
app (unchanged) ──existing requests──► Supabase
                                         │
     ┌───────────────────────────────────┼────────────────────────────────────┐
     │ 1. existing tables (messages, posts, matches, sessions, …)  — already there │
     │ 2. view counters inside existing read RPCs  → usage_views (hourly rollup)    │
     │ 3. pg_cron every 15 min: snapshot auth.sessions → usage_user_days            │
     │ 4. pg_cron nightly: roll everything up → usage_daily, usage_community_daily  │
     └───────────────────────────────────┬────────────────────────────────────┘
                                         │ admin_usage_* RPCs (SECURITY DEFINER, staff only)
                                         ▼
                              admin panel → new "Usage" section
```

- Same pattern as the rest of the admin panel: **the database is the gate**, every `admin_usage_*`
  function starts with `assert_platform_role('super_admin')`, `revoke … from public, anon`.
- Dashboard reads **rollup tables**, never scans the big tables live (keeps it fast and cheap on the
  free plan). "Today" is computed live from the last few hours only.
- **Kill switch**: `site_config` row `usage_tracking` `{enabled}` read by the counters and crons.
  Off = nothing is recorded, app behaviour identical.

---

## 3. New tables (migration 135, all additive, no client access)

RLS on, all privileges revoked from `anon`/`authenticated` (like `reports`, `audit_logs`).

| Table | Rows | Purpose |
|---|---|---|
| `usage_user_days` | (user_id, day) → first_seen, last_seen, active_hours bitmask (24 bits), platform(s) | DAU/WAU/MAU, retention, hour-of-day heatmap. Fed by the 15-min `auth.sessions` snapshot. Needed because `auth.sessions` rows disappear on sign-out/expiry |
| `usage_views` | (bucket_hour, user_id, view, target_id) → count | Screen-visit proxy from read RPCs (§4). One row per user/screen/target/hour, `on conflict do update count = count + 1` |
| `usage_daily` | (day, metric) → value | Platform-wide daily numbers (DAU, new users, messages, posts, matches, sessions, …) |
| `usage_community_daily` | (day, community_id) → views, unique_viewers, messages, chatters, posts, likes, comments, matches, pings, joins, leaves | The per-community activity table |
| `usage_chat_hourly` | (hour, chat_type, chat_id) → messages, senders | Chat frequency + "when do people chat" |

Retention: `usage_views` and `usage_user_days` raw rows kept **90 days** (nightly prune); daily
rollups kept forever (tiny). Backfill: the nightly rollup can be run once over history for everything
derived from existing tables (messages, posts, matches… back to day one). Active-user and view
history start on the day this ships.

---

## 4. Screen-visit counters (the "page visits" part)

The app's screens each call one main read RPC. We add one line to those functions:

```sql
perform public._usage_track('community', p_community_id);   -- or ('communities_list', null), …
```

`_usage_track` (internal, revoked from clients) reads `auth.uid()` + the `x-client-info` header,
checks the kill switch, and upserts the hourly row. Wrapped in `exception when others then null` so
tracking can **never** break a read.

| Screen | RPC to instrument | view key |
|---|---|---|
| Communities tab | `get_my_communities` | `communities_list` |
| Community home | `get_community_by_id` | `community` + id |
| Community posts feed | `get_community_posts` | `community_feed` + id |
| Discover | `get_public_communities` | `discover` |
| Sessions tab | `get_open_sessions` / `get_my_sessions` / `get_joined_sessions` / `get_session_history` | `sessions_*` |
| Session detail | `get_session_by_id` | `session` + id |
| Chats hub | `get_chat_hub_stats` | `chats_hub` |
| Tournaments tab | `get_tournaments` | `tournaments_list` |
| Tournament / module | `get_tournament_detail`, `get_module_matches` | `tournament` / `module` + id |
| Live | `get_live_tournament_board`, `get_live_match` | `live` + id |
| Profile of someone | (reads `public_profiles` view — not an RPC) | not tracked in v1 |
| Guest mode | `guest_get_*` wrappers | same keys, `user_id = null`, flagged `guest` |

**Important technical catch (must be handled in the migration):** these RPCs are declared `STABLE`.
PostgREST runs STABLE functions in a **read-only transaction**, so an insert inside them fails. Each
instrumented function is re-created as `VOLATILE` with the **same signature and return shape**
(old builds see no difference; supabase-js calls RPCs via POST, and the app never uses `get: true`).
Any STABLE function that *calls* an instrumented one (e.g. a `*_impl` wrapper chain) must be checked
too — instrument only the outermost client-facing function. Verify with a grep over `supabase/` and
the SQL tests, per the backward-compat rules.

Cost: one small upsert per screen load. With hourly bucketing a user scrolling a community 20 times
in an hour is still one row.

---

## 5. Optional: Supabase API logs (phase 3)

Supabase already logs every API request (path, status, timing, user id in the JWT). A scheduled edge
function `usage-logs-cron` could pull the last hour through the Management API analytics endpoint and
store per-endpoint counts + error rates + slow calls in `usage_api_hourly`.

- Pros: covers every request, including table reads and failures (error-rate panel).
- Cons: needs a personal access token in edge-function secrets, log retention is only 1 day on the
  free plan (so the cron must not miss runs), RPC arguments aren't in the logs (no community id).
- Recommendation: **skip for v1**; §4 covers the screens we care about. Add later if we want an
  API health / error-rate page.

---

## 6. Admin panel: new "Usage" section (super admin only)

All pages have a date range picker (7 / 30 / 90 days / custom), times in PKT.

**6.1 Overview**
- Tiles: DAU, WAU, MAU, DAU/MAU (stickiness), new users today/7d, online now (active in last 15 min)
- Line chart: daily active users + new users
- Heatmap: activity by weekday × hour (from `active_hours` + message/post timestamps)
- Platform split: Android app vs web
- Top 5 communities, top 5 chats this week (links to 6.2 / 6.3)

**6.2 Communities**
- Table: name, sport, members, active members (7d), views, unique viewers, messages, posts,
  matches, pings, last activity, trend arrow vs previous period. Sortable, searchable.
- Community detail: daily chart of views / messages / posts / matches, hour-of-day chart,
  member growth (joins vs leaves), most active members (count only), "dead community" flag
  (no activity in 14 days).

**6.3 Chat**
- Messages per day (community vs session chats), unique chatters, avg messages per active chat
- Busiest chats table, busiest hours chart, reply rate (`reply_to_id` share), edits/deletes
- **No message content is shown** — counts only. (Content review stays in Reports.)

**6.4 Screens (page visits)**
- Views per screen per day, unique viewers per screen
- Funnel-ish ordering: Communities → Community → Feed/Chat; Tournaments → Tournament → Module → Live
- Guest vs signed-in views (when guest mode is on)

**6.5 Users & retention**
- Sign-up → onboarding → joined a community → first action (post/message/match/session) funnel
- Weekly cohort retention grid (week of sign-up × weeks later still active)
- Distribution: messages / posts / matches per active user
- Push reachability: users with an FCM token, push master off, notification read rate
- Streak stats: users with streak ≥ 3 / 7 / 30, longest streak

**6.6 Sessions & tournaments**
- Sessions created / joined / filled / no-show rate per day, by sport
- Tournament views, live viewers (from `live` view key), matches recorded per day

**6.7 User lookup (optional, super admin, audited)**
- Search a username → their active days and counts per area. Every lookup writes
  `log_admin_action('usage_user_lookup', …)`. Decide whether we want this at all (privacy, §8).

---

## 7. Admin RPCs (one per page, return one jsonb document, like `admin_overview`)

`admin_usage_overview(p_from, p_to)`, `admin_usage_communities(p_from, p_to, p_search, p_sort)`,
`admin_usage_community(p_id, p_from, p_to)`, `admin_usage_chat(p_from, p_to)`,
`admin_usage_screens(p_from, p_to)`, `admin_usage_retention(p_weeks)`,
`admin_usage_sessions_tournaments(p_from, p_to)`, `admin_usage_user(p_user_id, p_from, p_to)`,
`admin_usage_backfill(p_from)` (super admin, runs the rollup over history once).

All read rollups; "today" merges the rollup with a live query over the current day only.

---

## 8. Privacy & safety rules

- Counts and timestamps only. No message/post text, no IP addresses stored, no location.
- `user_agent` reduced to a platform label (`android` / `web` / `ios`) before storing.
- Staff-only, `super_admin` role. Never exposed to the app or to `anon`.
- 90-day retention for per-user raw rows; aggregates are not per-user.
- Privacy policy line: "we record which parts of the app you use to improve it" (check the store
  listing's data-safety form still matches — "app activity" category).

---

## 9. Later (would need an app OTA, but still no new API call)

- Send `x-app-version` (+ OTA update id) as a **global header** on the existing Supabase client →
  version adoption chart, "who is still on an old build" before raising `min_app_version`.
- Track profile views by moving `public_profiles` reads behind an RPC.

---

## 10. Build steps

1. **Migration 135**: tables (§3), `usage_tracking` kill switch (seeded ON or OFF — decide),
   `_usage_track`, 15-min `auth.sessions` snapshot cron, nightly rollup + prune cron.
2. **Migration 136**: re-create the §4 read RPCs as VOLATILE with the tracking line (same
   signatures). SQL tests: every instrumented RPC still returns identical results; `anon` still
   can't run anything new; tracking failure doesn't fail the read.
3. **Migration 137**: `admin_usage_*` RPCs + backfill function. Run backfill once.
4. **Admin panel**: `Usage` nav item, pages 6.1 → 6.6 (chart library: e.g. Recharts in `admin/`
   only — not in the Expo bundle).
5. Optional: §5 log cron, §6.7 user lookup, §9 version header.

Tests in `docs/usage-analytics/sql-tests.sql`, run via `docs/tournaments/local-db/run.sh`
(`stubs.sql` needs a minimal `auth.sessions`).

---

## 11. Open questions

1. Kill switch default after deploy: **ON** (start collecting immediately) or OFF until the panel is ready?
2. Do we want per-user lookup (6.7) at all, or aggregates only?
3. Who sees Usage: `super_admin` only, or also a new read-only `analyst` role?
4. Phase-3 API-log cron (§5): worth it now for an error-rate page, or later?
