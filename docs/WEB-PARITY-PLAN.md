# Web Parity Plan — make the web build as easy to use as the Android app (2026-11-09)

Scope: the web build (`npx expo export -p web` → Vercel), used two ways:
**phone browser** (touch, small screen) and **desktop browser** (mouse, keyboard, wide window, refresh/back/URL bar).
Android is the reference ("works fine"). Each item: **what's wrong (verified in code)** → **fix** → **files** → **verify**.
Items marked *needs browser check* are strongly suggested by the code but I could not run them in a browser.

Constraints (AGENTS.md): backward compatible with installed builds, motion values from `src/lib/motion.ts`,
no native regressions — every fix below is `Platform.OS === 'web'`-gated or platform-neutral.

---

## 0. Triage summary

| # | Problem | Who hits it | Severity | Effort |
|---|---|---|---|---|
| W1 | Sideways chip rows can't be scrolled with a mouse (sport picker, filters, tabs) | Desktop | **P0** | S |
| W2 | Close/back buttons do nothing after a page refresh or when opened from a link | All web | **P0** | S |
| W3 | Sign-in throws away the link you opened (always lands on `/`) | All web | P1 | S |
| W4 | Turning notifications **off on web turns them off on the user's phone too** | All web | **P0** (cross-device bug) | XS |
| W5 | Web push is half-wired: tokens never removed on sign-out, no foreground handler | All web | P1 (privacy on shared PCs) | M (or XS to disable) |
| W6 | The shipped `index.html` has no manifest, icons, theme colour or title, so the in-app "Add to Home Screen" prompt doesn't work properly | Phone web | P1 | XS |
| W7 | Actions that need a long-press can't be found with a mouse (member admin, info, chat message menu) | Desktop | P1 | S |
| W8 | Enter doesn't send a chat message; Esc doesn't cancel reply/edit | Desktop | P1 | XS |
| W9 | Pull-to-refresh doesn't exist on web (15 screens) | All web | P2 | S |
| W10 | Google sign-in popup can be blocked (Safari/iOS); possible double code exchange | All web | P1 *needs browser check* | S |
| W11 | Screen size is read once when a module loads, so sheets/FAB/popups stay the old size after the window is resized or rotated | All web | P2 | S |
| W12 | Wide screens: some screens and all sheets stretch edge-to-edge | Desktop | P2 | S |
| W13 | Image picker: permission call can break Safari file dialog; crop is ignored on web | All web | P2 *needs browser check* | XS |
| W14 | Dragging the mouse inside a sheet (e.g. selecting text) can close the sheet | Desktop | P3 | XS |
| W15 | No notification signal on web at all — add unread count to tab title | All web | P3 (enhancement) | XS |
| W16 | App is **not installable as a PWA**; add an "Install the app" prompt on first web visit | All web | P1 (feature) | M |

Already fine on web (checked, no action): alerts (`lib/alert.ts` has `confirm` + a DOM action sheet for 3+ buttons),
date/time pickers (`datetime-local` in `create-session.tsx` / `DateTimeField.tsx`), mouse-wheel in the inverted chat list
(react-native-web 0.21 has `invertedWheelEventHandler`), Cloudinary upload (blob path), Esc closes `Sheet`/`SlideUpModal`/`CenterModal`
(RNW `Modal.onRequestClose`), chat send button doesn't steal focus, stack animations disabled on web, `/get` + `/android` redirectors.

---

## W1 — Horizontal chip rows can't be scrolled with a mouse  (P0)

**Cause.** Every horizontal `ScrollView` sets `showsHorizontalScrollIndicator={false}`. With touch you swipe it,
but a mouse wheel only scrolls vertically and there's no scrollbar to drag. Anything past the right edge can't be reached.
Worst case: **`create-community.tsx` sport picker** — 11 sports won't fit in the 600 px content column, so on desktop you
can't pick e.g. basketball or handball. Same for the session purpose picker.

**Where:** `create-community.tsx:252`, `create-session.tsx:213` + `:453`, `discover.tsx:137`, `(tabs)/history.tsx:296`,
`tournament/[id]/module/[moduleId].tsx:305` (module tab strip), `ModuleMatchesTab.tsx:89`, `BracketView.tsx:122` (round pills),
`ChampionsStrip.tsx:64`, `LeagueTable.tsx:133`, `StandingsTable.tsx:89` (wide tables).

**Fix.** One shared `src/components/HScrollView.tsx` that renders a normal `ScrollView horizontal` on native.
On web it also:
1. adds a `wheel` listener on `getScrollableNode()`: when `|deltaY| > |deltaX|`, `scrollLeft += deltaY` and `preventDefault()`
   (only if it can actually scroll that way, so the page still scrolls at the ends);
2. shows a thin scrollbar on pointer devices (`showsHorizontalScrollIndicator` true when `matchMedia('(pointer: fine)')`).
Replace the 11 call sites. For the two **pickers** (sport/purpose) consider `flexWrap: 'wrap'` on web instead — all options
visible at once is simply better on a wide screen.

**Verify.** Desktop Chrome + Firefox: wheel over each row scrolls it sideways; create a *basketball* community; phone web swipe unchanged.

---

## W2 — Close / back buttons are dead after refresh or a direct link  (P0)

**Cause.** 19 places call `router.back()` with no fallback. On web, refreshing `/add-match`, `/create-session`,
`/community/abc/members`, `/profile/xyz` … (or opening one from a shared link or new tab) leaves no history,
so the X / ← does nothing ("GO_BACK was not handled"). Only `chat.tsx:76` handles this (`canGoBack()` → `replace('/chats')`).

**Where:** `create-community.tsx:86,98`, `create-session.tsx:160,172`, `add-match.tsx:134,146`, `community/[id].tsx:809`,
`community/[id]/members.tsx:180`, `info.tsx:245`, `edit.tsx:117`, `join-requests.tsx:104`, `pending-matches.tsx:116`,
`profile/[id].tsx:86`, `tournament/[id]/module-form.tsx:52,66`, `tournament/.../entry-form.tsx:64,75,84`.

**Fix.** `src/lib/nav.ts`: `goBack(router, fallback: Href)` → `router.canGoBack() ? router.back() : router.replace(fallback)`.
Fallbacks: modals → the tab they came from (`/`, `/history`); `community/[id]/*` → `/community/[id]`; `community/[id]` → `/`;
`profile/[id]` → `/`; tournament sub-screens → the parent tournament/module route (`tournamentRoutes`). Also make the native
header back button use it: `headerLeft` only when `!canGoBack()` on web.

**Verify.** For each screen: open the URL in a fresh tab → X/← goes somewhere sensible. Native: unchanged.

---

## W3 — Sign-in throws away the link you opened  (P1)

**Cause.** `_layout.tsx` auth gate: no session → `router.replace('/login')`; after sign-in → `router.replace('/')`, and
`auth/callback.tsx` also does `replace('/')`. On web, links are the main way in (a shared community link, a tournament link),
and a signed-out visitor always ends up on Home.

**Fix.** Before redirecting to `/login`, save the current pathname (+ search) in `sessionStorage` (web) / memory (native) as
`returnTo` (skip auth routes). After `session && profile`, `replace(returnTo ?? '/')` and clear it. Onboarding finishes the same way.

**Verify.** Signed out, open `/community/<id>` → log in → land on that community.

---

## W4 — Turning notifications off on web turns them off on the phone  (P0)

**Cause.** `(tabs)/profile.tsx:68-106` (and the same toggle in `settings.tsx`) writes **account-wide**
`notification_preferences` (all false). Since migration 108/the push edge functions, "master-off ⇒ no push at all".
A user who switches it off on web — because web push doesn't really work — silently loses every push on their Android phone.
The toggle state itself is per-device (`AsyncStorage 'notifications-enabled'`), so the two devices then disagree.

**Fix (XS).** On web, don't write `notification_preferences` from the master toggle. Either hide the toggle on web and show
"Notifications are delivered to the Sportron Android app" (recommended until W5 is decided), or make it only add/remove
this browser's token. Keep native behaviour unchanged.

**Verify.** Toggle off on web → send a ping from another account → Android still gets the push.

---

## W5 — Web push is half-wired  (P1)

**What exists:** `utils/pushNotifications.js` gets a web FCM token, `public/firebase-messaging-sw.js` shows background
messages, `useFCM.requestPermissions()` saves the token into `profiles.fcm_tokens`, and the edge functions push to **every**
token. **What's missing:**
- `FCMInitializer` isn't mounted on web (`_layout.tsx`), so `useFCM.initialize()` — the web foreground handler — never runs:
  nothing shows while the tab is focused.
- `services/auth.ts removeDeviceTokenBeforeSignOut()` returns early on web, and the profile toggle-off skips web, so a
  **web token is never removed**. On a shared/lab computer, the previous user keeps getting their notifications on that
  browser after signing out (privacy).
- Notification clicks in the service worker don't route anywhere (no `notificationclick` handler).
- `EnablePushNotificationsButton` is unused; AGENTS.md says "web has no push receive".

**Decision needed (yours):**
- **Option A — Turn web push off cleanly (XS, recommended for now):** never request or save web tokens, remove the
  web branch in the toggle, add a one-off cleanup of saved web tokens (a web token is identifiable — store it in localStorage
  when saved), and keep W15 as the web signal.
- **Option B — Support it properly (M):** mount a web-only initializer (foreground `onMessage` → `toast`), store the token
  in localStorage and remove it on sign-out/toggle-off, add `notificationclick` → `clients.openWindow(route)` using `data.type`
  (reuse the routing in `useFCM.navigateToNotification`), and make the push payload include a `webpush.fcm_options.link`.
  iOS needs an installed PWA (depends on W6). Edge function changes ⇒ **redeploy `send-notification` and `send-chat-notification`**.

**Verify.** Sign in on web, enable, sign out → push to that account → that browser shows nothing.

---

## W6 — The shipped HTML has no manifest, icons or meta tags  (P1)

**Cause.** There is no `src/app/+html.tsx`, so Expo's default document is used. `dist/index.html` has **no `<link>` tags at all**:
no `manifest.json`, no `apple-touch-icon`, no `theme-color`, and the `<title>` is empty until JS runs (so link previews in
WhatsApp etc. show nothing). The files are in `public/` but never linked. Meanwhile `(tabs)/profile.tsx:149` tells phone-web
users to "Add to Home Screen" — they get a generic icon and a browser frame instead of a standalone app.

**Fix.** Add `src/app/+html.tsx` (Expo Router root HTML) with: manifest link, apple-touch-icon, `theme-color`,
`apple-mobile-web-app-capable`, `viewport-fit=cover`, title/description/OG tags (`og:image` = icon-512).
Hide the profile "Add to Home Screen" prompt when already installed (`matchMedia('(display-mode: standalone)')` / `navigator.standalone`).

**Verify.** Rebuild, `grep manifest dist/index.html`; Chrome DevTools → Application → Manifest is installable; iOS add-to-home opens standalone.

---

## W7 — Actions that need a long-press can't be found with a mouse  (P1)

**Cause.** Some actions are only reachable by long-press: **members.tsx:257** (Make admin / Remove member),
**info.tsx:414**, and the chat message menu (`ChatPopup.tsx:721`, long-press or double-tap; swipe-to-reply is a drag).
react-native-web does fire long-press on a held mouse click, but nobody on a desktop does that; right-click opens the browser's
own menu, and double-click also selects the text.

**Fix (web only).**
- Shared helper `webContextMenuProps(handler)` → `{ onContextMenu: e => { e.preventDefault(); handler(e) } }`, spread on those
  Pressables, so right-click opens the same menu (the chat menu already takes `pageX/pageY`).
- Member rows (admin view): a visible "⋯" button on web that opens the same sheet.
- Chat bubbles: on hover (`Pressable` `onHoverIn/Out`) show a small reply/⋯ button next to the bubble; set `userSelect: 'text'` only
  on the message text so double-click doesn't fight the menu.

**Verify.** Desktop: right-click a member → admin menu; hover a message → reply works; Android unchanged.

---

## W8 — Enter doesn't send a chat message  (P1)

**Cause.** The chat input is `multiline` (`ChatPopup.tsx:1054`), so Enter adds a new line; desktop users expect it to send.
The same applies to the comment input in `PostDetailPopup.tsx`.

**Fix.** On web with a fine pointer only (`matchMedia('(pointer: fine)')`, so phone-web keyboards keep newline):
`onKeyPress` → `Enter` without Shift → `preventDefault()` + `handleSend()`; `Escape` → cancel reply/edit if one is active
(otherwise let the modal close). Shift+Enter = newline. Add the hint "Enter to send · Shift+Enter for new line" as the placeholder suffix on desktop.

**Verify.** Desktop: Enter sends once (no double send, no leftover newline), Shift+Enter breaks the line, Esc clears reply.

---

## W9 — No way to refresh lists on web  (P2)

**Cause.** `RefreshControl` (via `ThemedRefreshControl`, 15 screens) does nothing on react-native-web. On phone browsers,
pulling down reloads the **whole page** (full splash, maintenance check, auth). Data reloads on focus, but not while
you stay on a tab (e.g. waiting for a session applicant).

**Fix.** Web-only: `overscroll-behavior-y: contain` on the root (stops the page-reload pull on phones), plus a small
refresh icon in the header of the main list screens (Communities, Sessions, Tournaments, Chats, Activity, community home)
that calls the same `refresh()`. Optionally reload on `visibilitychange → visible` (pattern already in `useChatUnreadWatcher.ts:15`).

**Verify.** Phone web: pulling down no longer reloads the page; desktop: the refresh icon updates the list.

---

## W10 — Google sign-in popup on web  (P1, needs browser check)

**Cause.** `services/auth.ts signInWithGoogle()` `await`s `signInWithOAuth`, *then* `WebBrowser.openAuthSessionAsync` opens a
popup. Safari (desktop + iOS) blocks popups that aren't opened directly by the click. Also, the popup loads the full app at
`/auth/callback?code=…` with `detectSessionInUrl: true` (`lib/supabase.ts`), so the popup's client may exchange the PKCE code
**and** the opener tries the same code via `handleAuthRedirectUrl` → one fails → a possible "Sign in failed" alert even though sign-in worked.

**Fix.** On web, skip the popup: `signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/auth/callback' } })`
(full-page redirect, no `skipBrowserRedirect`). `detectSessionInUrl` finishes the exchange; `auth/callback.tsx` on web just waits for
`onAuthStateChange` → `replace(returnTo ?? '/')` (W3). Native code unchanged. Check the Supabase Auth redirect allow-list includes the web origin.

**Verify.** Sign in on Safari macOS, iOS Safari, Chrome, Firefox; no error alert; lands on `returnTo`.

---

## W11 — Window size is read once at module load  (P2)

**Cause.** `Dimensions.get('window')` at module level in `Sheet.tsx:35`, `SlideUpModal.tsx:16`, `SessionDetailPopup.tsx:28`,
`MatchDetailPopup.tsx:28`, `FABMenu.tsx:44` (the overlay is sized to the *initial* window), `ChatPopup.tsx:59`. Browser windows get
resized and phones rotate, so overlays end up the wrong size or slide in from the wrong place.

**Fix.** Read `useWindowDimensions()` inside the components (store the height in a shared value for the worklets); make the FAB overlay `StyleSheet.absoluteFill`.

**Verify.** Desktop: open the FAB menu, resize the window, open it again → it covers the whole window.

---

## W12 — Wide screens  (P2)

**Cause.** `MaxContentWidth` (600) is applied per screen and only on some (tabs, forms, discover, settings). Not on
`community/[id]` (feed), tournament screens, `profile/[id]`, and **sheets/popups span the full desktop width**.

**Fix (one change, keeps "same layout as phone").** On web, when the window is wider than ~760 px, centre the app in a phone-like column
(≈ 520–600 px, hairline borders, page background around it) at the root in `_layout.tsx` — tab bar, headers, FAB and sheets then all line up.
Add `maxWidth` + `alignSelf: 'center'` to `Sheet`/`SlideUpModal` content so the modals that render outside that column match it.
Brackets/tables keep scrolling horizontally inside the column (W1).

**Verify.** 1440 px and 1920 px windows: no stretched cards, sheets centred; phone web unchanged.

---

## W13 — Image picker on web  (P2, needs browser check)

**Cause.** `lib/pickImage.ts` awaits `requestMediaLibraryPermissionsAsync()` before `launchImageLibraryAsync()`. On web the permission
call is pointless, and the `await` can make Safari refuse to open the file dialog (it needs the click). `allowsEditing`/`aspect` cropping is
ignored on web, so avatars and covers upload uncropped (they still display with `cover`, just with more pixels than needed).

**Fix.** Skip the permission request on web. Optionally centre-crop to `aspect` with `expo-image-manipulator` on web before upload.

**Verify.** Safari: change avatar / community cover / photo post opens the file dialog on first click.

---

## W14 — Sheet drag fights the mouse  (P3)

**Cause.** `Sheet.tsx` pan activates on any downward drag when the content is at the top — a mouse drag to select text in a sheet
(e.g. the comment box) drags the sheet and can close it.

**Fix.** On web, only drag from the handle zone (`startY < HANDLE_ZONE`); backdrop click + Esc already close it.

---

## W15 — Unread count in the tab title  (P3, enhancement)

Web users get no notifications (unless W5 option B). Cheap signal: set `document.title` to `(N) Sportron` from
`NotificationsContext.unreadCount` + the chat unread store, so a background tab shows activity.

---

## W16 — Make the web app an installable PWA + prompt users to install it  (P1, feature)

### Current state (checked 2026-11-09): **not a PWA**

| PWA requirement | Status | Evidence |
|---|---|---|
| Served over HTTPS | ✅ | Vercel |
| Web app manifest exists | ⚠️ exists but **not linked** | `public/manifest.json` is copied to `dist/`, but `dist/index.html` has zero `<link>` tags (no `+html.tsx`, see W6) |
| Manifest fields (name, short_name, start_url, display, 192 + 512 icons, maskable) | ✅ mostly | missing `id`, `scope`, `orientation`, `screenshots` (Android's richer install sheet), dark `background_color` (splash is `#000000`, manifest says `#FFFFFF` → white flash on launch) |
| Icons | ✅ | 192/512 (+ maskable), apple-touch-icon 180 — all valid PNGs |
| App service worker | ❌ | the only SW is `firebase-messaging-sw.js`, registered **only** when the user enables web push (`utils/pushNotifications.js:40`); it has no `fetch` handler, so nothing works offline (not even an offline page) |
| iOS meta (`apple-mobile-web-app-capable`, status-bar style, title, touch icon link) | ❌ | not in the HTML |
| Install prompt | ❌ (only a manual hint) | `(tabs)/profile.tsx:149` shows an "Add to Home Screen" card, but only on the hidden Profile tab, only for phone user agents, dismissal is `useState` (comes back every visit), and it appears even when already installed. No `beforeinstallprompt` handling anywhere |

Today Chrome/Edge won't offer "Install app" at all, because the manifest isn't linked.

### Steps

**1. Installable (depends on W6).**
- `src/app/+html.tsx`: `<link rel="manifest" href="/manifest.json">`, `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
  `<meta name="theme-color">` (light + dark via `media`), `apple-mobile-web-app-capable=yes`, `apple-mobile-web-app-status-bar-style=black-translucent`,
  `apple-mobile-web-app-title=Sportron`, `viewport-fit=cover`.
- `public/manifest.json`: add `"id": "/"`, `"scope": "/"`, `"orientation": "portrait"`, `"background_color": "#000000"` (matches the splash),
  2–3 phone `screenshots` (`form_factor: "narrow"`) + one `wide`, and `"categories": ["sports", "social"]`.
  Add `"related_applications": [{ "platform": "play", "url": "https://play.google.com/store/apps/details?id=com.murtazabaig.T3S", "id": "com.murtazabaig.T3S" }]`
  with `"prefer_related_applications": false`. Keep it `false`: `true` would stop Chrome offering the PWA install anywhere, including on desktop.
  Optional: with the Android app's `assetlinks.json` hosted at `/.well-known/assetlinks.json`,
  `navigator.getInstalledRelatedApps()` can tell us the native app is already installed, and the card can then be hidden on that phone.

**2. One service worker for the whole site.**
Only one SW can control scope `/`, so the current Firebase SW must not be a second, separate registration. Create `public/sw.js` that:
- precaches a tiny app shell (`/offline.html`, icons) on `install` and claims clients on `activate` (versioned cache name, old caches deleted);
- `fetch`: **network-first for navigations**, falling back to `/offline.html` ("You're offline — Sportron needs a connection");
  cache-first for `/_expo/static/*` (hashed bundles, safe forever); **never** cache Supabase, Cloudinary or `/auth/*` requests;
- `importScripts` the Firebase messaging code, only if W5 option B is chosen; otherwise leave push out.
Register it once on web at startup (in `+html.tsx` or a web-only effect in `_layout.tsx`), not only when push is enabled. Update
`utils/pushNotifications.js` to reuse that registration (`getToken(messaging, { serviceWorkerRegistration })`) instead of registering `/firebase-messaging-sw.js`.
**Migration:** browsers that already registered `/firebase-messaging-sw.js` keep it; keep the file in place (it can `importScripts('/sw.js')`)
so existing registrations update cleanly instead of breaking.
- `vercel.json`: `Cache-Control: no-cache` for `/sw.js` and `/manifest.json` (otherwise users get stuck on an old SW);
  `Content-Type: application/manifest+json` for the manifest. The existing `Permissions-Policy` / `X-Frame-Options` headers are fine.

**3. The install prompt — `src/components/InstallPrompt.tsx` (web only, mounted once in the root layout after sign-in).**
- Decide what can be shown:
  - `isStandalone` = `matchMedia('(display-mode: standalone)').matches || navigator.standalone` → **never** show it.
  - **Chrome / Edge / Android:** listen for `beforeinstallprompt` (capture it early, in `+html.tsx` or at module load, because it fires before React mounts),
    `preventDefault()`, keep the event, and show our own card with an **Install** button → `event.prompt()` → read `userChoice`.
  - **iOS Safari:** there's no API — show a card with instructions ("Tap Share ⬆︎ → Add to Home Screen") plus a small illustration.
    On iOS in a non-Safari browser (Chrome/Firefox on iOS), say "Open in Safari to install".
  - **Desktop Firefox / unsupported browsers:** don't show it.
  - **Android phones (decided 2026-11-09: yes, offer the Play Store app):** the card's **main** button is "Get it on Google Play"
    (`https://play.google.com/store/apps/details?id=com.murtazabaig.T3S`, same URL as `get.tsx`; open with `window.open(url, '_blank')`).
    The PWA install is the secondary action ("or install the web app"), shown only when `beforeinstallprompt` has fired.
    The same dismissal rules apply to both. Android tablets and ChromeOS get the same card.
- When to show it: on the first web visit after sign-in, as a non-blocking bottom card (reuse `Sheet` or a `Toast`-style card,
  with motion from `lib/motion.ts`), not a modal over login. "Not now" → hide for 7 days; "Don't ask again" → never again.
  Store this in `localStorage` (`pwa-install-dismissed-until`), wrapped in try/catch (private mode).
- Listen for `appinstalled` → hide the card, `toast('Sportron installed')`.
- Replace the existing Profile-tab card (`profile.tsx:149`) with this component, or keep a small "Install app" row in
  Settings for people who dismissed it (only when installable and not already installed).

**4. Fixes that installed (standalone) mode needs.**
- **Sign-in:** an installed iOS PWA opens OAuth popups in a separate Safari window, and the session never comes back to the app.
  The W10 full-page redirect is **required** for this to work.
- **W2 is required too:** a PWA has no browser back button, so every screen needs a working X/← even when there's no history.
- Safe areas: with `viewport-fit=cover` + `black-translucent`, check that `react-native-safe-area-context` insets (headers, tab bar, FAB)
  are respected on notched iPhones.
- External links (`login.tsx` Terms/Privacy, `ForcedUpdateScreen` store link) should open in a new tab (`window.open(url, '_blank')`),
  not navigate the PWA away from the app.
- Forced update / maintenance gate: still works (it reads `site_config` on every launch); the SW must not serve a cached `index.html` that is
  older than the bundle (network-first handles this).

**Verify.**
- Chrome DevTools → Application → Manifest: no errors, "Installable". Lighthouse PWA/installability check passes.
- Android Chrome: the card shows "Get it on Google Play" (opens the Play listing) and the secondary "install the web app" →
  the home-screen icon opens standalone with a dark splash, and login works.
- iOS Safari: the instructions card → Add to Home Screen → opens standalone, the notch is respected, Google login completes inside the app.
- Desktop Chrome/Edge: install from the card or the address-bar icon; the app opens in its own window.
- Already installed → the card never shows. Dismissed → doesn't come back for 7 days. Offline → offline page, not a blank screen.
- Deploy a new build → an installed PWA picks it up on the next launch (no stale SW).

---

## Suggested order

1. **Quick wins (≈ half a day):** W4, W2, W6, W8, W13 — small, web-gated, no backend changes.
2. **Desktop usability:** W1, W7, W12, W11, W14.
3. **Entry flow:** W3 + W10 together (both touch the auth redirect).
4. **PWA (W16):** steps 1–2 right after W6; the prompt (step 3) only once W2 + W10 are done, otherwise installed users hit dead back buttons and broken iOS login.
5. **Decide W5** (A = remove web push, B = support it; B also merges Firebase into the W16 service worker). Then W9, W15.

Test matrix after each phase: Chrome desktop, Firefox desktop, Safari macOS, Chrome Android, Safari iOS — plus one Android
native smoke test (everything is web-gated, but the shared components like `HScrollView`, `Sheet` and `goBack` also run on native).
