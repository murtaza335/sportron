# Sportron Live — projector screen

A tiny, sign-in-free website for **venue screens**: it shows the live scores of a tournament, one tile per court, side by
side. Players and spectators follow matches **inside the Sportron app**; this page is only for the projector.

- URL: `https://live.sportron.app/<code>` — the code (and what the screen shows) is set by the tournament organiser in the
  app (*Tournament → Manage → Projector screen*).
- `?court=Court 1,Court 2` only those courts (one projector per hall) · `?module=<id>` one module · `?match=<id>` one
  match · `?layout=row|grid|auto` · `?max=3` tiles per screen.
- `/demo` shows a made-up tournament built with the real scoring engine (no backend needed) — handy to test a projector.
- Open it on the venue PC and press **F11**. It reconnects by itself, keeps the screen awake, hides the cursor and reloads
  itself every 6 hours.

## How it works
- First load: `get_live_board(code)` (the only anon-callable function, migration 133). Live updates: the tournament's
  private realtime channel `live:<code>` (receive-only). If the socket drops it polls every ~5 s, so it never shows an
  error page.
- The scoring engine, layout rules and board logic are shared with the app: `../src/lib/live` via the `@live-engine` alias.
- Privacy: the server only sends what the organiser switched on (names + scores by default; never phone / email / CMS id).

## Develop / deploy
```bash
cp .env.example .env     # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (public by design)
npm install
npm run dev              # http://localhost:5175/demo
npm run build            # dist/  (legacy build for old browsers: ≈ Chrome 64 / Firefox 60 / Safari 12)
```
Vercel: new project with **root directory `live/`**, add the domain `live.sportron.app`
(DNS: `CNAME live → cname.vercel-dns.com`), set the two env vars. The root directory must be able to read `../src/lib/live`
— enable *Include source files outside of the Root Directory* in the project settings.
To move the page to another domain later, deploy it there and change the remote-config key `live_projector_base_url`.
