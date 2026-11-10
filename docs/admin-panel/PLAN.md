# Sportron Admin Panel — v1 Plan: replace the SQL runbooks

Status: **implemented in code (migrations 122–124 + `admin/` site); not yet deployed or applied to the live project.** Next migration number: **125**.

v1 is a small, separate website (`admin.sportron.app`) where the Sportron team does what it currently
does by pasting SQL into the Supabase editor. Nothing more. Moderation (reports, bans) comes later
(§11) and isn't part of this plan.

---

## 1. What v1 replaces

Every manual SQL operation we run today, and where it moves:

| Runbook today | Source | v1 panel |
|---|---|---|
| Find a user's id by username | `owner-sql.md` | User picker (search by username) wherever a person is chosen |
| Create a tournament | `owner-sql.md` | **Tournaments → New** |
| Assign / remove a tournament admin | `owner-sql.md` | **Tournament → Admins** |
| Publish / complete / cancel / back to draft | `owner-sql.md` | **Tournament → Status** |
| Edit details (also when completed/cancelled, which the app can't do) | `owner-sql.md` | **Tournament → Details** |
| Inspect tournaments + modules with entry counts | `owner-sql.md` | **Tournaments** list + **Tournament → Modules** (read-only) |
| Fix a finished module (back to `in_progress`, clear champion/ranks) | `owner-sql.md` | **Tournament → Modules → Reopen** (super admin) |
| Delete a tournament | `owner-sql.md` | **Tournament → Danger zone** (super admin, type the name) |
| Maintenance on / off + message | `maintainence-toggle.txt` | **Settings → Maintenance** |
| Force an update (`min_app_version`) | AGENTS.md §6e | **Settings → Minimum app version** |
| Make someone staff | *(new)* | **Staff** page (only the very first super admin is created by SQL, §9) |

**Done when** nobody on the team needs the SQL editor for any row above. `owner-sql.md` and
`maintainence-toggle.txt` stay in the repo as an emergency fallback, with a note pointing to the panel.

**Not in v1:** reports, bans, user directory, audit-log viewer, metrics, editing modules, entries or
matches (tournament and module admins keep doing that in the app), and any change to the mobile app.

---

## 2. Architecture

```
admin.sportron.app  (Vite + React SPA, its own Vercel project, code in admin/)
   │  Google sign-in, same Supabase project, PKCE
   │  anon key + the staff member's own JWT. The service_role key never reaches the browser
   └── supabase.rpc('admin_*')  ──►  SECURITY DEFINER functions (migrations 122–124)
                                        1. assert the caller's platform role
                                        2. validate + write
                                        3. write an audit row tagged as an admin action
```

- **No edge functions and no app release.** Everything is SQL functions plus the website.
- **The database is the gate.** The site only presents a UI. A non-staff user who opens it, or calls
  the functions directly, gets `NOT_ALLOWED`.
- **Same accounts.** Staff sign in with the Google account behind their normal Sportron profile. The
  site never creates profiles: no profile, or no staff role, means "Not authorized" and sign-out.
- **Existing app behaviour is unchanged.** Tournament admins keep their in-app powers; notification
  triggers (e.g. "You're a tournament admin", migration 088) fire exactly as they do for SQL inserts.

---

## 3. Roles (v1)

| Capability | `super_admin` | `tournament_manager` |
|---|:-:|:-:|
| Sign in, Overview | ✓ | ✓ |
| Tournaments: list, create, edit details, status, admins, view modules | ✓ | ✓ |
| Reopen a finished module | ✓ | |
| Delete a tournament | ✓ | |
| Maintenance mode, minimum app version | ✓ | |
| Manage staff | ✓ | |

Rules, enforced in the database:
- You can't change or revoke your own role. So a super admin can only be removed by another super
  admin, and there's always at least one left.
- A staff role grants **no** in-app powers. Being staff doesn't make you a community admin or a
  tournament admin.
- Adding `moderator` later is an additive change to the role check constraint.

---

## 4. Database (migrations 122–124)

Conventions for every new function (from AGENTS.md):
- `security definer`, `set search_path = public`, and an `auth.uid()` guard first.
- `revoke all … from public, anon`, then grant explicitly: `authenticated` for `admin_*`, `service_role`
  only for internal helpers.
- Reads `RETURNS TABLE (…)` with explicit columns.
- Errors are short codes (`NOT_ALLOWED`, `NOT_FOUND`, `FIELD_INVALID:<field>`, …).
- All migrations are additive: no existing table, column or function changes.

### 122 — `platform_admins`, helpers, staff management
```sql
create table public.platform_admins (
  profile_id  uuid primary key references public.profiles(id) on delete cascade,
  role        text not null check (role in ('super_admin','tournament_manager')),
  granted_by  uuid references public.profiles(id) on delete set null,
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz                       -- soft revoke keeps the history
);
alter table public.platform_admins enable row level security;    -- no client policies
revoke all on public.platform_admins from anon, authenticated;
```

| Function | Who | Notes |
|---|---|---|
| `platform_role(uid) → text` | internal | Active role, or null. A soft-deleted profile has no role |
| `assert_platform_role(roles text[]) → text` | internal | Raises `NOT_ALLOWED`; first line of every `admin_*` |
| `log_admin_action(action, table, record uuid, old jsonb, new jsonb, note text)` | internal | Calls the existing trigger-only `log_audit_event` with `metadata = {admin: true, role, note}` |
| `get_my_platform_role() → text` | any signed-in user | The site calls this right after login; null means not staff |
| `admin_get_overview()` | staff | Tournament counts by status, maintenance on/off, current minimum version |
| `admin_search_profiles(query, limit) → table` | staff | Username `ilike` (with `%`/`_` escaped, at least 2 chars) or exact id; skips deleted profiles; returns id, username, avatar, staff role |
| `admin_list_platform_admins() → table` | super | Active staff with who granted them and when |
| `admin_grant_platform_role(profile, role)` | super | Upsert (also re-activates a revoked row); `CANNOT_CHANGE_SELF`, `INVALID_ROLE`, `NOT_FOUND` |
| `admin_revoke_platform_role(profile)` | super | Sets `revoked_at`; `CANNOT_CHANGE_SELF`, `NOT_FOUND` |

Notes:
- `log_audit_event` was made trigger-only in 046. These definer functions can call it, but clients
  still can't, and `audit_logs` stays unreadable for clients (062).
- `audit_logs.record_id` is a `uuid`. For rows that don't have one (`platform_admins` uses its
  `profile_id`; `site_config` has a text key) we use the profile id, or a stable `md5('site_config:'||key)::uuid`.

### 123 — Platform settings
| Function | Who | Notes |
|---|---|---|
| `admin_get_site_config() → table(key, value, updated_at)` | super | Both rows |
| `admin_set_maintenance(enabled bool, message text)` | super | Message ≤ 300 chars, **required when enabling**; writes `{enabled, message}`, the exact shape `RootLayout` reads today |
| `admin_set_min_app_version(min_version, store_url, message)` | super | `^\d+\.\d+\.\d+$`; `store_url` empty or `https://…`; message ≤ 300; same `{min_version, store_url, message}` shape |

- `site_config` has no audit trigger, so each setter logs old and new values itself.
- Updates the existing row; inserts it if it's missing (it's seeded by 047, so this is a safety net).
- Takes effect for app users on their next launch, since the app only checks at startup, the same as
  the SQL today.

### 124 — Tournament operations
| Function | Who | Replaces |
|---|---|---|
| `admin_list_tournaments(status?, search?, limit, offset) → table` | super, tm | "Inspect" list: includes drafts, with module and admin counts |
| `admin_get_tournament(id) → table` | super, tm | Single row + `created_by` username |
| `admin_list_tournament_modules(id) → table` | super, tm | "Inspect" modules: name, sport, format, status, active entries, champion name |
| `admin_list_tournament_admins(id) → table` | super, tm | Current admins (username, avatar, added_at) |
| `admin_create_tournament(set jsonb) → uuid` | super, tm | "Create": always `draft`, `created_by = auth.uid()`; the core-field seed trigger runs as it does today |
| `admin_update_tournament(id, set jsonb)` | super, tm | "Edit details", works on completed/cancelled too |
| `admin_set_tournament_status(id, status)` | super, tm | Publish / complete / cancel / draft |
| `admin_add_tournament_admin(id, profile)` | super, tm | Idempotent; the existing 088 trigger sends "You're a tournament admin" |
| `admin_remove_tournament_admin(id, profile)` | super, tm | `NOT_FOUND` if not an admin |
| `admin_reopen_module(module, clear_results bool)` | super | "Fix a mistake": module must be `completed` (`NOT_COMPLETED`), tournament must not be completed/cancelled (`TOURNAMENT_FINISHED`, reopen the tournament first). Sets `in_progress`; when `clear_results`, nulls champion/runner-up/third and the entries' `final_rank` |
| `admin_delete_tournament(id, confirm_name)` | super | Exact name match (`CONFIRM_MISMATCH`), then delete (cascades) |

- **Validation matches `update_tournament` (089):** name 3–80; description ≤ 2000; organization ≤ 80;
  location ≤ 120; `ends_at ≥ starts_at`. It lives in one internal helper used by both create and
  update so the two can't drift apart. The image URL must be a Cloudinary URL (same rule as migration 113).
- Status changes don't go through `set jsonb`, only through `admin_set_tournament_status`, so the
  status buttons have one code path.
- Tournament tables already have audit triggers (084) that record the staff member as actor.
  `log_admin_action` adds a second row flagged as an admin action with the note.

---

## 5. Website

### Stack
| Concern | Choice |
|---|---|
| Build | Vite + React 19 + TypeScript (strict), in `admin/` with its own `package.json` (not part of the Expo build) |
| Routing | React Router |
| Data | `@supabase/supabase-js` v2 (`flowType: 'pkce'`) + one typed wrapper per RPC in `admin/src/lib/rpc.ts` |
| Styling | Plain CSS with light/dark tokens, no UI kit. The site is a handful of forms and tables |
| Images | Cloudinary unsigned upload for tournament covers (same cloud and preset as the app) |

### Pages
| Route | Who | Contents |
|---|---|---|
| `/login`, `/auth/callback` | all | Google sign-in → `get_my_platform_role()` → null shows "Not authorized" + sign out |
| `/` | staff | Overview: tournaments by status, maintenance banner if on, current minimum version |
| `/tournaments` | super, tm | Table with status filter + search; "New tournament" |
| `/tournaments/new` | super, tm | Form: name, description, organization, location, cover, start/end. Creates a draft and opens it |
| `/tournaments/:id` | super, tm | Sections: **Details** (same form), **Status** (buttons with a confirm), **Admins** (user picker + remove), **Modules** (read-only table; Reopen for super), **Danger zone** (super: delete) |
| `/settings` | super | **Maintenance** switch + message + a preview of what users see; **Minimum app version** form |
| `/staff` | super | Staff table; Add (user picker + role), change role, revoke |

### UX rules
- No `window.alert` / `confirm` / `prompt`. One in-site `ConfirmDialog` (red button for destructive
  actions) and a `Toast` for results, the same rule as the app.
- **Typed confirmation** for the risky ones: delete a tournament (type its name), turn on maintenance,
  raise the minimum version.
- The minimum-version form shows the version in this repo's `app.json` (read at build time) and warns
  if the new minimum is higher: *"Users below this version are locked out until the Play Store update
  is live."*
- Optional "note" field on every write, stored in the audit row.
- One file maps error codes to messages (`admin/src/lib/errors.ts`).
- Desktop-first, but usable on a phone for an urgent maintenance toggle.

### Layout
```
admin/
├── index.html · vite.config.ts · tsconfig.json · package.json · vercel.json · .env.example · public/robots.txt
└── src/
    ├── main.tsx · router.tsx · styles.css
    ├── lib/        supabase.ts · rpc.ts · errors.ts · cloudinary.ts
    ├── auth/       AuthProvider.tsx · RequireRole.tsx
    ├── components/ Layout · Table · ConfirmDialog · Toast · UserPicker · StatusBadge · Field
    └── pages/      Login · AuthCallback · NotAuthorized · Overview · Tournaments · TournamentNew ·
                    TournamentDetail · Settings · Staff
```

---

## 6. Hosting and security

- A separate Vercel project, root directory `admin/`, domain `admin.sportron.app`.
- Supabase → Auth → URL configuration: add `https://admin.sportron.app/auth/callback` and
  `http://localhost:5174/auth/callback` to the redirect allowlist. The app's own redirects are untouched.
- `vercel.json`:
  - SPA rewrite;
  - CSP (self, Supabase URL, Cloudinary, Google);
  - `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`.

  Add `robots.txt` disallowing everything.
- Env is limited to `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CLOUDINARY_CLOUD_NAME` and
  `VITE_CLOUDINARY_UPLOAD_PRESET`. A build-time check fails the build if a variable containing
  `SERVICE_ROLE` is present.
- Optional extra layer: Vercel password protection on the project.
- Keep the staff list small and make sure staff Google accounts use 2-step verification. A revoked role
  stops working on the very next request, because every function re-checks it.

---

## 7. Steps

1. **Migration 122**, plus SQL tests for roles and the self-change rule.
2. **Migrations 123–124**, plus SQL tests for every function × {no user, normal user, tm, super}.
3. **Site skeleton:** Vite app, Supabase client, Google login, role gate, layout, Overview.
4. **Settings page.**
5. **Tournaments** list, new and detail pages (details, status, admins, modules, danger zone).
6. **Staff page.**
7. **Deploy:** Vercel project, domain, Auth redirect allowlist, bootstrap the first super admin (§9).
8. **Docs:**
   - point `owner-sql.md` and `maintainence-toggle.txt` to the panel;
   - add an "Admin panel" section to AGENTS.md (roles, `admin_*` convention, next migration number);
   - add `admin/README.md` (dev + deploy).

---

## 8. Testing

- `docs/admin-panel/sql-tests.sql` in `begin … rollback`, run against the local Postgres harness
  (`docs/tournaments/local-db/`, extended with a `site_config` stub and migrations 122–124), then on
  the real project. It covers:
  - every `admin_*` function as no user / a normal user (`NOT_ALLOWED`) / tournament_manager / super_admin, per §3;
  - the self-change rules, re-granting a revoked role, and that a deleted profile loses its role;
  - maintenance and minimum-version validation, and that the stored JSON shape is exactly what `RootLayout` reads;
  - tournament create/update validation matching 089, status changes, and idempotent admin add;
  - the reopen preconditions + clearing, and the delete name check + cascade;
  - that each write leaves an `audit_logs` row with `metadata.admin = true`.
- Site: `tsc --noEmit` + lint, then a manual pass through §1's table on the real project. The
  definitive check is doing each runbook row in the panel and seeing the result in the app.

---

## 9. Bootstrap (one-time SQL, the last runbook)

```sql
-- after applying 122
insert into public.platform_admins (profile_id, role)
select id, 'super_admin' from public.profiles where username = '<your username>';
```

---

## 10. Risks

- **A wrong minimum version locks everyone out.** The form warns and asks for typed confirmation;
  the SQL in this plan's history remains the emergency undo.
- **Deleting a tournament is irreversible.** It's super-admin only, needs the name typed, and the audit
  log keeps the deleted row's data.
- **A compromised staff account** is the main threat. Keep the list small, require 2-step verification,
  and revoke quickly.

---

## 11. Later (not in this plan)

Separate plans when we get there:
- moderation: in-app reporting, a reports queue, content removal;
- account bans (DB write block + Supabase Auth ban via an edge function);
- a user directory;
- an audit-log viewer;
- user-to-user blocking (Google Play expects reporting and blocking for apps with user content);
- metrics.

The v1 role table and `admin_*` conventions are built so these slot in without reworking v1.

## 12. Open questions

1. Domain: is `admin.sportron.app` OK?
2. Who are the first staff, and which role does each get?
3. Should `tournament_manager` also be able to delete tournaments, or keep that super-admin only?
