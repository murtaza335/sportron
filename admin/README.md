# Sportron Admin

Staff-only website (Vite + React + TypeScript) that replaces the SQL runbooks: tournaments, maintenance
mode, minimum app version and staff roles. Plan: [`../docs/admin-panel/PLAN.md`](../docs/admin-panel/PLAN.md).

- Talks to the same Supabase project as the app with the **anon key + the staff member's own JWT**.
  Everything goes through `admin_*` SQL functions (migrations 122–124). **The database is the gate**:
  the site only presents a UI. The service_role key must never be used here (the build fails if a
  `VITE_*SERVICE_ROLE*` variable exists).
- Not part of the Expo build (excluded from the root `tsconfig.json` / ESLint).

## Develop

```bash
cd admin
cp .env.example .env      # Supabase URL + anon key, Cloudinary cloud + unsigned preset
npm install
npm run dev               # http://localhost:5174
npm run typecheck
```

Sign in needs `http://localhost:5174/auth/callback` in Supabase → Auth → URL configuration → Redirect URLs.

## Deploy (Vercel, separate project)

1. New Vercel project, **Root Directory = `admin`**, framework Vite (`npm run build`, output `dist`).
2. Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET`.
3. Domain: `sportron-admin.vercel.app`.
4. Supabase → Auth → URL configuration → add `https://sportron-admin.vercel.app/auth/callback` to the redirect allowlist (the app's own redirects stay untouched).
5. Apply migrations 122–124, then bootstrap the first super admin (one-time SQL):

```sql
insert into public.platform_admins (profile_id, role)
select id, 'super_admin' from public.profiles where username = '<your username>';
```

Everyone after that is added from the **Staff** page. Optional extra layer: Vercel password protection.
Staff Google accounts should use 2-step verification; a revoked role stops working on the next request.

## Tests

DB tests: [`../docs/admin-panel/sql-tests.sql`](../docs/admin-panel/sql-tests.sql), run by the local harness
(`../docs/tournaments/local-db/run.sh`) and then on the real project before relying on the panel.
