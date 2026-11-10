# Animations Redone — Implementation Plan

> **Audience:** Sonnet, implementing this plan step by step in the T3Seecs (Sportron) Expo app.
> **Goal:** make the whole app feel premium through consistent, physics-based motion, press feedback, haptics, skeleton loading and polished transitions, without making it slower or noisier.
> Read `AGENTS.md` first. Work **phase by phase**, run `npx tsc --noEmit` and `npm run lint` after every phase, and commit once per phase (on `dev`, never `master`).

---

## 0. Ground rules (read before touching code)

1. **Restraint beats quantity.** Premium apps animate *state changes and spatial relationships*, not everything. Every animation in this plan must answer "what does this tell the user?" If it is only decoration, skip it.
2. **One motion system.** All durations, springs and easings come from `src/lib/motion.ts` (Phase 1). No magic numbers in components.
3. **Only animate `transform` and `opacity`** (and `backgroundColor`/`color` via interpolation where necessary). Never animate `width`, `height`, `margin`, `padding`, `top/left`. To grow or shrink something, use `scale` or a Reanimated layout transition.
4. **Use Reanimated 4 (`react-native-reanimated` 4.5.0 + `react-native-worklets` 0.10.0)** for all new work. Migrate legacy `Animated` from `react-native` when you touch a file (FABMenu already uses Reanimated; tabs `_layout.tsx`, `BottomSheet`, `SplashScreen`, `SegmentedControl`, `PostDetailPopup` and the popups use legacy `Animated`). Do not mix the two systems inside a single component.
   - Reanimated 4: `runOnJS` is deprecated, so use `scheduleOnRN` from `react-native-worklets`. Check the installed API before using it (`node_modules/react-native-worklets`).
5. **Interruptible.** Animations must never block input. A user tapping during an animation must get an immediate response (springs retarget; never `await` an animation before handling a press).
6. **Reduced motion is mandatory.** Respect the OS setting through `useReducedMotion()` from Reanimated. When it is on: no stagger, no overshoot, no looping animations; use instant changes or ≤150 ms opacity fades. Layout animation builders get `.reduceMotion(ReduceMotion.System)`.
7. **Platforms:** Android is primary, web is secondary, iOS is not live yet. Everything must work on all three. Haptics are a no-op on web. Guard with `Platform.OS !== 'web'` inside the haptics helper, not at every call site.
8. **Performance budget:** 60 fps on a mid-range Android. Never run looping animations on off-screen items. Never attach entering animations to every row of a long or paginated list (see §1.5).
9. **No behaviour changes.** This is purely a presentation pass. Do not touch services, hooks' data logic, RPCs or migrations. No backend work is required.
10. **New dependencies:** only `expo-haptics` (install with `npx expo install expo-haptics`). Do **not** add Lottie, Moti, Skia or other animation libraries. Reanimated plus gesture-handler cover everything below.

---

## 1. Research summary: what premium apps do

| Pattern | Who does it | What we take |
|---|---|---|
| **Press feedback: scale to ~0.96–0.97, spring back** | iOS system UI, Linear, Revolut, most "premium" app guides | Every tappable card/button/row gets `PressableScale`. The press-down is fast (~100 ms timing); the release is a spring. |
| **Springs over linear/eased timing** for spatial motion | Apple HIG, Material 3 *Expressive* (moved its motion system to spring tokens) | Springs for anything that moves or scales. Timed easing only for opacity/colour fades. |
| **Timing tiers** | Practitioner consensus | Micro feedback 100–160 ms · element transitions 200–300 ms · sheets/modals/screens 300–450 ms. Nothing over 500 ms except celebratory moments. |
| **Haptics on state change** | iOS, Duolingo, Revolut, Telegram | Light selection tick on tab/segment change, light impact on like/send, success notification on approve/record match, warning on destructive confirm. |
| **Skeletons instead of spinners** for predictable layouts | Facebook, Slack, LinkedIn, YouTube | Shimmering skeletons for lists/cards (communities, sessions, chats, feed, tournaments, profile). Keep spinners only inside buttons and for indeterminate one-off actions. |
| **Staggered list entrance** (~40–60 ms per item, first screenful only) | iOS App Store, Airbnb, Linear | Initial-load stagger on the first ~8 items, never on refresh/pagination. |
| **Like burst**: icon spring pop, ring pulse, small particle burst, rolling count | Twitter/X, Instagram, Threads | `LikeButton` component used by PostCard, PostDetailPopup, MatchCard, MatchDetailPopup. Double-tap-to-like with a centred big heart on photo posts (Instagram). |
| **Chat send**: bubble rises from the composer with a slight spring (response ~0.35 s, damping ~0.7), under 400 ms; translate+scale, never width/height | iMessage, WhatsApp (2026 bubble animation rollout), Telegram | New outgoing bubbles enter from below-right with scale 0.9 to 1 plus translateY. Incoming ones fade and slide in from the left. Clock to check mark crossfade. Swipe-to-reply gesture (WhatsApp/Telegram). |
| **Streak flame**: slow idle "breathing" loop; faster flicker when at risk; spring + burst on increment; big celebration only at milestones | Duolingo | `StreakHeader` idle loop, at-risk variant, increment pop. `StreakModal` count roll-up. Milestone confetti only at 7/30/100/365. |
| **Sheets**: drag-to-dismiss tracking the finger, velocity-aware fling, rubber-band when dragged up, backdrop opacity tied to sheet position | iOS sheets, Google Maps, Apple Maps | Rebuild `BottomSheet` on gesture-handler + Reanimated and reuse it for every popup. |
| **Number changes** roll or count rather than snap | Robinhood, Revolut, Strava | `AnimatedNumber` for scores, stats, unread badges, member counts, streak counts. |
| **Tab bar**: active icon spring-scales, indicator slides, haptic tick | Instagram, Spotify, Material 3 | Animated active state per tab. Centre Tournaments bump keeps its pulse but gets spring press. |
| **Celebration reserved for wins** | Duolingo, Strava | Confetti/burst only on match recorded/approved, tournament champion, streak milestones. |

Sources are listed at the bottom.

---

## 2. Phase 1 — Motion foundation (do this first; everything else depends on it)

### 2.1 `src/lib/motion.ts` (new): motion tokens

```ts
import { Easing, ReduceMotion } from 'react-native-reanimated';

export const Duration = {
  instant: 100,   // press-down, colour flips
  fast: 160,      // micro feedback, icon swaps, fades out
  base: 240,      // element enter/exit, crossfades
  slow: 320,      // sheets, larger moves
  screen: 350,    // stack screen transitions
  celebrate: 900, // confetti / milestone only
} as const;

export const Springs = {
  // snappy, no visible overshoot: buttons, toggles, segment indicator
  snappy: { damping: 22, stiffness: 320, mass: 1 },
  // default UI spring: cards, sheets settling, tab icons
  gentle: { damping: 18, stiffness: 180, mass: 1 },
  // playful overshoot: like pop, badge pop, streak increment, send bubble
  bouncy: { damping: 12, stiffness: 220, mass: 0.9 },
  // sheet open/close
  sheet: { damping: 26, stiffness: 260, mass: 1, overshootClamping: false },
} as const;

export const Easings = {
  standard: Easing.bezier(0.2, 0, 0, 1),        // M3 standard
  emphasizedDecel: Easing.bezier(0.05, 0.7, 0.1, 1), // entering
  emphasizedAccel: Easing.bezier(0.3, 0, 0.8, 0.15), // exiting
} as const;

export const PRESS_SCALE = 0.97;
export const PRESS_SCALE_SMALL = 0.92; // icon buttons
export const STAGGER_MS = 45;
export const STAGGER_MAX_ITEMS = 8;
export const RM = ReduceMotion.System;
```

Tune these numbers on a device once Phase 2 is visible. Change values **only** here.

### 2.2 `src/lib/haptics.ts` (new)
- Wrap `expo-haptics`: `haptics.selection()`, `haptics.light()`, `haptics.medium()`, `haptics.success()`, `haptics.warning()`, `haptics.error()`.
- No-op on web. Swallow errors. Respect a module-level `enabled` flag (future setting; default `true`).
- Haptic map (use exactly these):
  - tab change, segmented control change, chip/filter select, picker option: `selection`
  - like, send message, FAB open, pull-to-refresh trigger, sheet snap: `light`
  - record match submit success, approve (match/commitment/join request), invite accepted, session joined: `success`
  - destructive confirm shown (delete/leave/remove), dispute: `warning`
  - any failed action surfaced to the user: `error`

### 2.3 Primitive components (new, in `src/components/motion/`)

1. **`PressableScale.tsx`**: drop-in replacement for `Pressable` for cards/rows/buttons.
   - Props: all `PressableProps` + `scaleTo?` (default `PRESS_SCALE`), `haptic?: keyof haptics`, `disabled`.
   - Built with `Animated.createAnimatedComponent(Pressable)` + `useSharedValue`. On `onPressIn`: `withTiming(scaleTo, {duration: Duration.instant})`. On `onPressOut`: `withSpring(1, Springs.snappy)`. Optional opacity dip to 0.9.
   - Must preserve `style` as function or object (Button relies on `style(state)`).
   - Reduced motion: opacity dip only, no scale.
2. **`FadeInItem.tsx`**: wraps a list item. Props `index`, `animate` (bool). When `animate && index < STAGGER_MAX_ITEMS` uses `entering={FadeInDown.springify().damping(18).stiffness(180).delay(index * STAGGER_MS).reduceMotion(RM)}` with a small 12 px translate. Otherwise renders children plainly.
3. **`Skeleton.tsx`**: `Skeleton` (rect, `width/height/radius`), `SkeletonCircle`, `SkeletonText` (n lines, last line 60%). One shared shimmer: a single looping `withRepeat(withTiming(1, {duration: 1200}), -1)` shared value provided via context (`SkeletonProvider`), so 20 skeletons don't each run their own loop. The highlight is a translucent band moving left to right (use `expo-linear-gradient` only if already installed; otherwise animate opacity 0.5↔1, a "pulse" skeleton, which is acceptable). Colours: `theme.backgroundSelected` base, `theme.border` highlight. Reduced motion: static.
   - Also make **screen-specific skeletons** that mirror real layouts: `CommunityCardSkeleton`, `SessionCardSkeleton`, `ChatRowSkeleton`, `FeedItemSkeleton`, `TournamentCardSkeleton`, `ProfileHeaderSkeleton`, `NotificationRowSkeleton`. Put them next to the real component or in `src/components/skeletons/`.
4. **`AnimatedNumber.tsx`**: shows an integer; when the value changes, the old digits slide up and fade, and the new digits slide in from below (odometer per digit, `Springs.gentle`). Fallback for reduced motion: plain text. Used for like/comment counts, scores, stats, badges, streak.
5. **`AnimatedBadge.tsx`**: unread dot/count. Mount: scale 0 to 1 with `Springs.bouncy`. Count change: brief pop (1 → 1.2 → 1). Unmount: scale to 0 in `Duration.fast`. Replaces the ad-hoc red dots/badges (tab bar Activity dot, Chats tab badge, chat buttons in `community/[id].tsx` and `SessionDetailPopup`, `NotificationBell`, What's-New dot).
6. **`Collapsible.tsx`**: animated expand/collapse using Reanimated `LinearTransition` + `FadeIn/FadeOut` (layout transition, never animating height manually).
7. **`Confetti.tsx`**: lightweight burst of ~24 small coloured rectangles (Reanimated, absolute overlay, `pointerEvents="none"`), 900 ms, gravity + random rotation, self-unmounts. Colours from `accent`, `accentSecondary`, `warning`. Imperative API via a tiny store: `celebrate()` callable from anywhere; mount one `<ConfettiHost/>` in root `_layout.tsx`. Reduced motion: do nothing.
8. **`useEnterAnimation` / `ScreenFadeIn`**: wraps a screen's content root. On first focus, fade in + translateY 8 → 0 over `Duration.base`. Used by tab screens (tab switches have no native transition).

### 2.4 Upgrade the shared UI kit
- `ui/Button.tsx`: use `PressableScale` (keep the API identical). Add a `haptic` prop (default `light` for primary). Loading: crossfade label ↔ spinner (`FadeIn/FadeOut` with `Duration.fast`) instead of a hard swap, and keep the button width stable. Use `size="small"`; `size="large"` inside a 56 px button looks heavy.
- `ui/Card.tsx`: add an optional `onPress`. When present, render via `PressableScale` (scale 0.98).
- `ui/SegmentedControl.tsx`: migrate to Reanimated. The active pill slides with `Springs.snappy` (measure segment widths via `onLayout`). Label colour crossfades. `haptics.selection()` on change.
- `UserAvatar.tsx`: image fades in on load (`onLoad` → opacity 0 to 1, `Duration.base`) over the initials placeholder. This removes the "pop" of avatars appearing.

**Phase 1 acceptance:** tsc + lint clean; a scratch usage of each primitive renders on Android and web; reduced motion verified by toggling *Settings → Accessibility → Remove animations* on Android.

---

## 3. Phase 2 — Navigation & global transitions

### 3.1 Stack transitions (`src/app/_layout.tsx`)
- Currently **every screen uses `animationDuration: 50`**, which is effectively no transition and feels abrupt. Replace it with:
  - Push screens (`community/[id]`, `profile/[id]`, `settings`, `discover`, tournament screens, …): `animation: 'ios_from_right'` on Android/iOS (react-native-screens 4.x supports it on Android; verify in `node_modules/react-native-screens` types), `animationDuration: Duration.screen` (note: `animationDuration` is iOS-only in some versions, so check the types and don't rely on it on Android). Enable `gestureEnabled: true` and `fullScreenGestureEnabled: true` (iOS swipe-back from anywhere).
  - Modals (`add-match`, `create-community`, `create-session`, `chat`, module-form, entry-form): keep `slide_from_bottom` and remove the 50 ms override.
  - Auth flow (`login` → `onboarding` → `(tabs)`): `animation: 'fade'`.
  - Web: `animation: 'none'` or `'fade'` (native-stack on web ignores most of these, so just make sure nothing breaks).
- Define these as three option objects (`pushOptions`, `modalOptions`, `fadeOptions`) at the top of the file and spread them, instead of repeating per screen.
- ⚠️ The 50 ms value may have been a deliberate "snappy" choice by the owner. Keep the durations in `motion.ts` so they are trivially tunable, and call this out in the phase commit message.

### 3.2 Tab switches (`src/app/(tabs)/_layout.tsx`)
- If the installed `@react-navigation/bottom-tabs` (via expo-router v57) supports the `animation` screen option (`'fade' | 'shift'`), set `animation: 'shift'` (Material 3 style). Otherwise wrap each tab screen root in `ScreenFadeIn` (§2.3.8).
- Tab bar items (`HapticTab`/custom button, lines ~110–150): migrate legacy `Animated` to Reanimated. Active icon: scale 1 → 1.12 → 1.0 spring (`Springs.bouncy`) on becoming active, label/colour crossfade, `haptics.selection()`. Optional: a small 4 px indicator pill under the active icon that slides between tabs (`Springs.snappy`).
- Centre Tournaments button (`TournamentTabBarButton.tsx` + the pulse/glow loop at ~line 155): keep the glow but slow it to a calm 2.4 s breathing loop, pause it when the Tournaments tab is focused, and add spring press scale (0.9) plus a `light` haptic. Make sure the loop is stopped on unmount.
- Badges: replace with `AnimatedBadge`.
- Header streak flame + What's-New dot: see Phase 5 / `AnimatedBadge`.

### 3.3 Splash → app handoff
- `SplashScreen.tsx` was just redone (logo spring, per-letter "Sportron", underline). Migrate it to Reanimated for consistency, and replace the hard cut to the app with an **exit**: the logo scales to 1.08 and the whole splash fades out over `Duration.base` while the app mounts underneath (render the splash as an absolute overlay above the Stack instead of an early return, then unmount it after the fade). Total time from cold start to interactive must not increase.

### 3.4 Pull-to-refresh
- 14 screens use `RefreshControl`. Keep the native control (it is what Android users expect) but set `colors={[theme.accent]}`, `tintColor={theme.accent}`, `progressBackgroundColor={theme.backgroundElement}` everywhere, and fire `haptics.light()` when refresh starts. Create `src/components/motion/ThemedRefreshControl.tsx` and swap it in.

**Phase 2 acceptance:** push/back feels like a native iOS-style slide on Android; modals slide up; no double animations; swipe-back works on iOS; tab change gives a haptic tick; web navigation still works.

---

## 4. Phase 3 — Sheets, popups & modals

The app has ~14 `Modal`s with mixed animation styles (`none`, `fade`, `slide`, hand-rolled `PanResponder`). Unify them.

### 4.1 Rebuild `src/components/tournaments/BottomSheet.tsx` → move to `src/components/motion/Sheet.tsx`
(Keep re-exporting from the old path so imports don't break.)
- Gesture-handler `Gesture.Pan()` + Reanimated (no `PanResponder`).
- Open: translateY from screen height → 0 with `Springs.sheet`. Backdrop opacity is **derived from translateY** (`interpolate`), max 0.5.
- Drag: follows the finger 1:1 downward; upward drag beyond 0 rubber-bands (`dy * 0.2`).
- Release: dismiss if `dy > 25% of sheet height` or `velocityY > 800`; dismiss animation uses the release velocity (`withSpring(target, {...Springs.sheet, velocity})`); otherwise spring back. `haptics.light()` on dismiss threshold crossing (once).
- Close (backdrop tap / back button / programmatic): animate out *then* call `onClose` (keep the `Modal` mounted until the exit finishes: maintain internal `mounted` state).
- Scroll content inside: use `Gesture.Native()` + `simultaneousWithExternalGesture` so a scrolled list only drags the sheet when at scroll-top.
- Keyboard: keep the existing `KeyboardAvoider` behaviour.
- Props additions: `snapPoints?` (optional, e.g. `['50%','90%']`), `title?`, `onClosed?`.

### 4.2 Migrate popups onto `Sheet` (or a shared `CenterModal` for dialogs)
| Component | Current | Target |
|---|---|---|
| `MatchDetailPopup` | own PanResponder sheet | `Sheet` |
| `SessionDetailPopup` | `animationType="none"` + own anim | `Sheet` (snap 60%/92%) |
| `PostDetailPopup` | `fade` + legacy Animated | `Sheet` (full-height snap) |
| `SessionFeedbackPopup` | `slide` | `Sheet` |
| `CreatePostModal` | `slide` | `Sheet` full height, with the composer auto-focusing **after** open settles |
| `InviteMemberModal` | `slide` formSheet | `Sheet` |
| `MatchLineupSelector` picker | `none` | `Sheet` |
| `StreakModal` | `fade` | `CenterModal` (scale 0.92 → 1 + fade, `Springs.gentle`) |
| modals in `history.tsx`, `community/[id].tsx`, `members.tsx`, `profile.tsx` (theme picker) | `fade`/`none` | `Sheet` for action menus/pickers; `CenterModal` for confirmations |
| all tournament sheets (`EntrySheet`, `ResultEntrySheet`, `ScheduleSheet`, `TournamentMatchSheet`, `ProfilePickerSheet`, `EntryFieldEditorSheet`, `MemberSheet`) | already `BottomSheet` | get the upgrade for free; verify each |
| `ChatPopup` | `none` full-screen | keep full-screen, but slide up from bottom with `Springs.sheet` and add swipe-down-to-close from the header |

- `src/components/motion/CenterModal.tsx` (new): backdrop fade + content `scale 0.92→1` / `opacity 0→1` spring; exit `scale 0.96` + fade, `Duration.fast`.
- **Long-press action sheets** (chat message reply/edit/delete; member admin actions): use `Sheet` with a `medium` haptic when the long-press fires. For chat, also briefly scale the pressed bubble to 0.96 while the sheet opens (iMessage-style focus).
- `src/lib/alert.ts` (cross-platform alert): leave the native `Alert` on Android/iOS. Only if it renders a custom web dialog, give it `CenterModal` motion.

**Phase 3 acceptance:** every sheet opens/closes with the same physics; drag-to-dismiss works with velocity; inner lists scroll without fighting the sheet; Android back button closes with the exit animation; no popup flashes or double-animates.

---

## 5. Phase 4 — Lists, feeds & loading states (per screen)

General recipe for every list screen:
1. **Initial load:** replace the full-screen `ActivityIndicator` (35 files use it) with the matching skeleton (3–6 items). Crossfade skeleton → content (`FadeOut` on skeleton container, real list items use `FadeInItem` with `animate={isFirstLoad}`).
2. **Refresh / pagination / realtime updates:** no stagger. New items inserted at the top (realtime) enter with `FadeInDown` (single item, no delay) and the rest shift via `itemLayoutAnimation={LinearTransition.springify()}` on `Animated.FlatList`. Removed items use `FadeOut` + layout transition.
3. **Empty states:** fade + slight scale-in of the icon/illustration (`ZoomIn.springify()`), text fades 80 ms later.
4. **Errors / retry:** a small horizontal shake (translateX keyframes ±6 px, 300 ms) on the retry button when a retry fails, plus `haptics.error()`.
5. Every tappable card/row: `PressableScale`.

> ⚠️ For `FlatList`s with recycling/pagination (`chats.tsx`, `history.tsx`, `tournaments.tsx`, `members.tsx`, `ChatPopup`): keep `entering` only on the first `STAGGER_MAX_ITEMS` rows of the **first** load (track with a ref). Community-recommended practice warns that entering/exiting on every recycled row causes jank and replays. Test with 50+ items.

### 5.1 Communities (`(tabs)/index.tsx`, `CommunityCard.tsx`, `discover.tsx`)
- Skeleton: `CommunityCardSkeleton` (cover rect, title line, 2 meta lines).
- Cards: `PressableScale`; cover image fades in on load; first-load stagger.
- Discover: sport filter chips get spring press + selected-state colour crossfade + `selection` haptic; list cross-fades when filter/search changes (`LinearTransition` for reorder, `FadeIn` for new results). The search field focus animates its border colour (`interpolateColor`, `Duration.fast`).
- Join button: on success, morph label "Join" → check icon → "Joined" (crossfade + bouncy scale), `success` haptic. Restricted: "Requested" with the same morph.

### 5.2 Community home (`community/[id].tsx`, `PostCard`, `MatchCard`, `FABMenu`)
- **Collapsing header** (premium social-app pattern, e.g. Strava clubs/Twitter profiles): the cover image scales up on overscroll (pull-down stretch: `scale = 1 + max(0, -scrollY)/coverHeight`) and parallax-translates at 0.5× on scroll up. The title in the nav header fades in once the cover scrolls away (`interpolate(scrollY, [coverH-60, coverH], [0,1])`). Use `useAnimatedScrollHandler` on an `Animated.FlatList`/`ScrollView`.
- Feed: `FeedItemSkeleton`; posts/matches use first-load stagger; new posts (after `CreatePostModal` submit) enter at top with `FadeInDown.springify()` + layout shift.
- **FABMenu** (`FABMenu.tsx`): already Reanimated, but refine: replace the four copy-pasted `animatedStyleN` with one `FabItem` component taking `index`; items stagger out bottom-up (40 ms) with `Springs.bouncy`, scale 0.6→1 + translateY; labels slide in from the right 30 ms after their icon; backdrop dims (opacity 0→0.4) and blurs (`expo-blur` is installed) behind the menu; the "+" rotates 45° with `Springs.snappy`; `light` haptic on open. Hide the FAB (translateY + fade) while scrolling down, show on scroll up (Gmail/Material pattern). Remove the `runOnJS(() => …)()` misuse (it calls shared-value writes from the JS thread wrapped pointlessly) and write shared values directly.
- **Ping** button: on send, a radial "ripple" ring expands from the button (scale 1→2.2, opacity 0.5→0, 600 ms), `success` haptic. Cooldown state: a circular progress ring that drains (optional, nice-to-have).
- Chat button badge: `AnimatedBadge`.
- Pending matches screen (`pending-matches.tsx`): approve/dispute removes the row with `FadeOutRight`/`FadeOutLeft` + layout transition; `success`/`warning` haptic.

### 5.3 Likes & comments (`PostCard`, `PostDetailPopup`, `MatchCard`, `MatchDetailPopup`)
- New `src/components/motion/LikeButton.tsx` (Twitter/Instagram pattern):
  - Like: heart icon scales 1 → 0.8 (press) → 1.3 → 1 (`Springs.bouncy`), fill colour crossfades to red, a ring pulses outward (scale 0.5→1.6, opacity 0.6→0, 400 ms), 6–8 small dots burst radially (translate 0→14 px, fade, 450 ms). `light` haptic.
  - Unlike: quick scale 1 → 0.85 → 1 (`Springs.snappy`), no burst.
  - Count uses `AnimatedNumber` (rolls up/down).
  - Fully interruptible (spam-tapping must not queue animations; it is optimistic already).
- **Double-tap to like** on photo posts (`PostCard` image, `PostDetailPopup` image): use `Gesture.Tap().numberOfTaps(2)`. A big white heart pops in the centre of the image (scale 0→1.2→1, then fade out + scale 1.4 over 700 ms total), triggers like (never unlike) and the small LikeButton animation.
- Comments: a newly added comment enters with `FadeInDown` + layout shift; the comment count rolls; the input clears with a quick fade.

### 5.4 Match recording (`add-match.tsx`, `ScoreCounter.tsx`, `OpponentSelector`, `MatchLineupSelector`)
- `ScoreCounter`: +/− buttons get `PressableScale` (0.9) + `selection` haptic; the score digit uses `AnimatedNumber` (rolls up on +, down on −). Long-press +/− auto-repeats with an accelerating interval (nice-to-have).
- Format segmented control: animated pill (via SegmentedControl upgrade).
- Opponent/partner slot filled: the avatar pops in (`ZoomIn.springify()`), and the slot border crossfades to accent.
- Submit success: `success` haptic + `celebrate()` confetti **only when the user won** (fun, and rare enough to stay special), then dismiss the modal. On loss/draw, just the haptic.
- Validation error: shake the offending field + `error` haptic.

### 5.5 Sessions (`(tabs)/history.tsx`, `SessionDetailPopup`, `SessionFeedbackPopup`, `create-session.tsx`)
- Skeleton: `SessionCardSkeleton`.
- New ↔ History header toggle: the clock/X icon morphs with a 90° rotate + crossfade (`Springs.snappy`), and the list area cross-fades between views (`FadeIn`/`FadeOut`, `Duration.base`), not a hard swap.
- All/Joined/My segmented: animated pill; list cross-fades on scope change.
- Purpose dropdown: options sheet uses `Sheet`; selected chip pops.
- "Closes in X" countdown: when under 10 minutes, the text colour crossfades to `warning` and pulses gently once per minute (not continuously).
- Session card status pill changes (open → full) crossfade colours.
- `SessionDetailPopup`: applicant approve/reject removes/moves rows with layout transitions; the commitment count uses `AnimatedNumber`; the Join button morphs (Join → Pending… → Joined ✓) like §5.1 with `success` haptic on accept.
- `create-session.tsx`: "expire after" chips get a sliding selection highlight (like a segmented control) + `selection` haptic; date/time picker field focus animation; submit button loading crossfade.
- `SessionFeedbackPopup`: showed-up / no-show toggle per participant animates (thumb slides + colour) with `selection` haptic; on submit, rows check off with a staggered tick (`ZoomIn` check icons, 40 ms stagger) then the sheet closes.

### 5.6 Chats hub (`(tabs)/chats.tsx`)
- Skeleton: `ChatRowSkeleton` (circle + 2 lines).
- When a new message reorders the list, rows move with `LinearTransition.springify()` (Telegram/WhatsApp lists animate reorder).
- Unread badge: `AnimatedBadge` (pop on increment, shrink on read).
- Row press: `PressableScale` (0.98) with a subtle background highlight.

### 5.7 Chat (`ChatPopup.tsx`, used by session/community chat + `chat.tsx`)
Biggest premium win; follow iMessage/WhatsApp/Telegram:
- **Outgoing send:** the optimistic temp bubble enters with `translateY 24→0`, `scale 0.9→1`, `opacity 0→1`, origin bottom-right, `Springs.bouncy`, ≤ 350 ms. Animate transform only (never width/height; resizing reflows text). The input clears instantly; the send button does a small spring pop + `light` haptic. **Do not** animate if the user has scrolled up away from the bottom (WhatsApp only plays the animation when the list is at the bottom).
- **Incoming:** `FadeInLeft`-style: translateX −12→0 + fade, `Duration.base`. Only for realtime arrivals, never for the initial history load (initial load renders instantly and is already scrolled to the unread divider).
- **Status marks:** clock → check crossfades with a tiny scale pop (`ZoomIn`).
- **Send button:** when the input is empty, the button is dimmed/scaled 0.9; when text exists, it springs to 1 with accent colour (`interpolateColor`).
- **Swipe-to-reply** (WhatsApp/Telegram): `Gesture.Pan().activeOffsetX(15).failOffsetY([-10,10])` on each bubble; the bubble follows the finger up to 64 px, a reply arrow icon fades/scales in behind it, crossing 48 px fires `medium` haptic once; releasing past threshold sets the reply target, and the bubble springs back. Keep the existing long-press sheet as well.
- **Reply preview bar** above the composer: slides up (`FadeInDown` + layout transition on the composer), dismiss slides down.
- **Tap reply quote** → scroll to the original and flash-highlight it (background colour pulse, 2 × 400 ms).
- **Edit:** bubble content crossfades; the "Edited" mark fades in. **Delete:** bubble `FadeOut` + `ZoomOut` (scale 0.8) + the list closes the gap with a layout transition.
- **"New messages" divider + scroll-to-bottom FAB:** the FAB appears (scale+fade) when scrolled up more than one screen, shows an `AnimatedBadge` with unseen count, and hides when at bottom.
- **Keyboard:** make sure the composer moves with the keyboard smoothly. Check whether `react-native-keyboard-controller` is installed. If it is not, do **not** add it in this pass. Instead, verify the existing `KeyboardAvoider`/`KeyboardInsetView` doesn't jump, and note it as a follow-up.
- Performance: chat lists can be long. Entering animations apply only to messages whose id was not in the initial load set (track ids in a ref).

### 5.8 Activity (`(tabs)/updates.tsx`, `ActivityCard`, `InviteCard`, `NotificationBell`)
- Skeleton: `NotificationRowSkeleton`.
- Tabs (Action Required / Invites / Past): animated pill + content crossfade.
- Unread → read: the unread dot shrinks out and the card background crossfades from highlighted to normal (`interpolateColor`).
- Accept/Decline inline: the button pressed shows a check/✕ morph, then the card collapses and slides out (`FadeOutRight` + `LinearTransition`), `success`/`warning` haptic.
- "Mark all as read": dots shrink out in a quick stagger (30 ms) top to bottom.
- Realtime new notification: slides in at top with layout shift; bell icon (`NotificationBell`) does a short ring wiggle (rotate ±12° × 3, 500 ms) + badge pop.

### 5.9 Profile (`(tabs)/profile.tsx`, `profile/[id].tsx`, `ProfileForm`, `StreakDisplay`)
- Header: avatar scales in, then username/bio fade in (40 ms stagger); stats use `AnimatedNumber` counting up from 0 on first view only (Strava/Robinhood). `ProfileHeaderSkeleton` while loading.
- Collapsing header like §5.2 if the profile screen scrolls (avatar shrinks + moves into the nav bar is a stretch goal; at minimum fade the nav title in).
- Theme picker sheet: selecting a theme crossfades the whole app. Wrap the theme change so the root background colour transitions (`interpolateColor` on root view over `Duration.base`); if too invasive, skip and note it.
- Notification toggle: native `Switch` is fine (already premium on both platforms). Add `selection` haptic.
- Avatar upload: progress shown as a circular ring around the avatar; new avatar crossfades in.
- What's New entry dot: `AnimatedBadge`.

### 5.10 Streaks (`StreakHeader`, `StreakModal`, `StreakDisplay`) — Duolingo patterns
- `StreakHeader` flame: idle "breathing" loop (scale 1↔1.06, 2 s, `Easing.inOut(Easing.sin)`) **only when streak is active today**. **At-risk** (not extended today and after the at-risk window): faster flicker (1 s) + slight desaturate/grey tint. Zero streak: static grey. Pause loops when the screen is unfocused (`useIsFocused`).
- When the streak increments (detect `streak_count` increasing vs previous value): flame does a big spring pop (1 → 1.4 → 1, `Springs.bouncy`), the count rolls (`AnimatedNumber`), `success` haptic.
- `StreakModal`: opens via `CenterModal`; the flame drops in with a bounce, the number counts up from 0 → current (`Duration.slow` ≈ 600–800 ms here), "longest streak" fades in after. Milestones (7, 30, 100, 365 and multiples of 100): `celebrate()` confetti once per milestone (remember shown milestone in AsyncStorage per user).

### 5.11 Tournaments (`(tabs)/tournaments.tsx`, `tournament/[id].tsx`, module screens, `components/tournaments/*`)
- Skeleton: `TournamentCardSkeleton`, `ModuleCard` skeleton.
- Live/Upcoming/Past/Mine filter: animated pill + list crossfade.
- `StatusPill` "live": a pulsing red dot (opacity 1↔0.4, 1.2 s loop) like sports-score apps (ESPN/FotMob/SofaScore). This is the *only* looping animation in the list; stop it when off-screen (pass `paused` when the card isn't visible via `onViewableItemsChanged`).
- Module tabs (Entries/Matches/Standings/Info/Groups): animated underline indicator that slides between tabs + swipeable pages if the current implementation allows it cheaply (react-native-pager-view is **not** installed, so don't add it; just slide the indicator and crossfade content).
- **Bracket (`BracketView`, `BracketMatchNode`, `BracketConnectors`):** on first render, nodes fade in round by round (round index × 80 ms). When a realtime result arrives (`useTournamentModule` refresh), the winner's name in the next round fades/slides in and the decided node flashes the accent border once. Winner row: bold + check icon `ZoomIn`. Pinch-to-zoom/pan on the bracket canvas is a stretch goal (gesture-handler `Pinch` + `Pan`, clamp scale 0.5–2); only do it if the bracket already scrolls in 2D.
- `LeagueTable` / `StandingsTable`: when standings change, rows reorder with `LinearTransition.springify()` and changed cells flash (FotMob/SofaScore pattern).
- `StandingsChart`: bars grow from 0 on first view (scaleY with transform-origin bottom, i.e. translateY trick), 40 ms stagger.
- `ChampionsStrip` / module completed: champion card shimmers once (gold sweep) + `celebrate()` the first time a user sees a completed module they took part in.
- `ResultEntrySheet`: score inputs use `ScoreCounter`-style `AnimatedNumber`; submit success `success` haptic.
- Seeding screen (`seeding.tsx`): if reorder is drag-based, lifted item scales 1.03 + shadow; others shift with layout transitions. If it's button-based, just use layout transitions on reorder.

### 5.12 Forms (`create-community`, `create-session`, `community/[id]/edit`, `ProfileForm`, `onboarding`, tournament forms in `components/tournaments/form.tsx`)
- Input focus: border colour animates to `inputBorderFocus` (`interpolateColor`, `Duration.fast`); label (if floating) moves up and scales to 0.85.
- Validation error message: `FadeInDown` under the field + field shake + `error` haptic on submit.
- Sport pill selector (create-community): selected pill springs (scale 1.05 → 1) and colour crossfades; `selection` haptic.
- Visibility `PrivacyToggle`: sliding thumb with `Springs.snappy`.
- Cover photo pick: the image crossfades in with a slight scale 1.05 → 1 (Ken-Burns settle).
- Character counter (session title ≤ 40, chat 1000): turns `warning` near the limit with a colour crossfade.

### 5.13 Auth & gates (`login.tsx`, `onboarding.tsx`, `MaintenanceScreen`, `ForcedUpdateScreen`)
- Login: logo + "Sportron" use the same entrance language as the splash (so splash → login feels continuous); the Google button fades in 150 ms later and has `PressableScale`. While signing in, the button shows the loading crossfade.
- Onboarding: each field section enters with a gentle stagger; the "Continue" button springs to enabled state (opacity/colour) when the form becomes valid.
- Maintenance / Forced update: icon gently floats (translateY ±4 px, 3 s loop), text fades in.

### 5.14 Members & admin (`members.tsx`, `join-requests.tsx`, `info.tsx`, `InviteMemberModal`)
- Long-press member → `medium` haptic + row scales 0.97 while the action sheet opens.
- Role change (Make Admin): role tag crossfades + pops. Remove member: row `FadeOutLeft` + layout transition.
- Join request approve/reject: same as Activity (§5.8).
- Invite by username: search results crossfade as you type; "Invited ✓" morph on success.

---

## 6. Phase 5 — Global polish pass

1. **Toasts / inline feedback** (if the app shows success/error messages via `Alert` for non-blocking info): add `src/components/motion/Toast.tsx` (slides down from top under the status bar with `Springs.gentle`, auto-dismiss 2.5 s, swipe-up to dismiss) with a host in root `_layout.tsx`. Only swap **non-blocking** informational alerts (e.g. "Ping sent", "Invite sent", "Copied"). Confirmations stay as `Alert`.
2. **Image loading everywhere** (post photos, community covers, avatars, tournament covers): fade in on load over a `backgroundSelected` placeholder. Create `FadeImage.tsx` and swap in.
3. **Icon state swaps** (bell, chat, check, theme icons): crossfade + slight rotate/scale rather than hard swap; use a tiny `IconSwap` helper (`FadeIn/FadeOut` keyed by icon name).
4. **Scroll-linked header shadows:** on scrollable screens, the header gets a hairline border/shadow that fades in once `scrollY > 4` (iOS large-title pattern).
5. Audit every remaining `ActivityIndicator`: inside buttons → keep (small), full-screen loads → skeleton, inline section loads → small skeleton.
6. **Consistency audit:** grep for `animationType=`, `new Animated.Value`, `Animated.timing` from `react-native`, `withTiming(`/`withSpring(` with inline numbers, and `duration:` literals. Every hit should use `motion.ts` tokens or be justified in a comment.

---

## 7. Execution order & checkpoints

| Phase | Scope | Commit message prefix |
|---|---|---|
| 1 | `motion.ts`, `haptics.ts`, primitives, Button/Card/SegmentedControl/UserAvatar | `feat(motion): foundation` |
| 2 | Stack + tab transitions, splash exit, refresh control | `feat(motion): navigation transitions` |
| 3 | `Sheet`, `CenterModal`, migrate all popups | `feat(motion): unified sheets & modals` |
| 4a | Skeletons + list entrance for Communities, Sessions, Chats hub, Activity, Tournaments list | `feat(motion): skeletons & list motion` |
| 4b | Community home (header, feed, FAB, ping), likes/comments, match recording | `feat(motion): community & social interactions` |
| 4c | Chat | `feat(motion): chat` |
| 4d | Profile, streaks, tournaments detail/bracket, forms, auth, members | `feat(motion): profile, streaks, tournaments, forms` |
| 5 | Toast, FadeImage, IconSwap, header shadows, audit | `feat(motion): polish pass` |

After **each** phase:
- `npx tsc --noEmit` and `npm run lint` must pass.
- Smoke test on web (`npm run web`) for crashes (Reanimated layout animations and gesture-handler must not crash web).
- List anything that needs an on-device check (Android haptics, swipe gestures, 60 fps) in a short "needs device check" note in the commit body. Don't claim device verification you didn't do.
- Update `AGENTS.md`: add a short "Motion system" bullet under Key Conventions (tokens in `src/lib/motion.ts`, primitives in `src/components/motion/`, haptics map, reduced-motion rule) once Phase 1 lands, and keep it accurate.

## 8. Out of scope (don't do in this pass)
- Shared-element transitions between screens (Reanimated `sharedTransitionTag` is still experimental, so revisit later).
- New native libraries (Lottie, Skia, keyboard-controller, pager-view, FlashList).
- Any change to data fetching, services, Supabase, edge functions or migrations.
- Redesigning layouts, colours or typography. Motion only.

## 9. Open decisions for the owner (default in **bold**)
1. Stack transition duration: **~350 ms native iOS-style slide** vs keep the current near-instant 50 ms.
2. Haptics: **on by default** (add a toggle in Settings later) vs off.
3. Confetti on recording a won match: **yes** vs only for tournament champions/streak milestones.

---

## Sources
- [Micro animations that make apps feel premium](https://bloglab-65579.firebaseapp.com/blogs/mobile-development/micro-animations-that-make-apps-feel-premium.html)
- [Why your app feels cheap (it's not the colors)](https://levelup.gitconnected.com/why-your-app-feels-cheap-its-not-the-colors-b5e64c7529f8)
- [Why AI-built apps feel cheap (and how to fix it)](https://beto.vercel.app/videos/why-ai-built-apps-feel-cheap-and-how-to-fix-it-yh0qwd)
- [Emil Kowalski: design engineering skill](https://mcpservers.org/agent-skills/emilkowalski/emilkowalski-skills/emil-design-eng)
- [Interaction & motion design](https://skills.sh/phazurlabs/ux-ui-mastery/interaction-&-motion-design)
- [Motion design reference (impeccable)](https://git.secluded.site/agent-skills/blob/8abfe6e0277c770986eb0b330887cf8081a59697/vendor/impeccable/skill/reference/motion-design.md)
- [Reanimated: layout transitions (official docs)](https://docs.swmansion.com/react-native-reanimated/docs/layout-animations/layout-transitions)
- [Reanimated: entering/exiting animations (official docs)](https://docs.swmansion.com/react-native-reanimated/docs/3.x/layout-animations/entering-exiting-animations)
- [Reanimated in lists: best-practice rule](https://lykhoyda.github.io/rn-dev-agent/best-practices/rules/reanimated-in-lists)
- [React Native best practices (Software Mansion)](https://skillselion.com/skills/software-mansion-labs/react-native-skills/react-native-best-practices)
- [Animating React Native / Expo](https://skills.cat/skills/tristanmanchester/agent-skills/animating-react-native-expo)
- [Material 3 Expressive UI in Compose](https://medium.com/@androidlab/material-3-expressive-ui-in-compose-the-ultimate-guide-51c703e8e88a)
- [Why Google's Material 3 update turns motion into a theme](https://www.besthub.dev/articles/why-google-s-material-3-update-turns-motion-into-a-theme-it-s-not-about-the-bounce-9436fce4a345)
- [Material Design 3 motion skill](https://skills.sh/shelbeely/shelbeely-agent-skills/material-design-3-motion)
- [M3E motion tokens](https://matraic.github.io/m3e/styles/motion.html)
- [WhatsApp smooth message bubble animations (SammyFans)](https://www.sammyfans.com/2026/06/13/whatsapp-smooth-message-bubble-animations/?noamp=mobile)
- [WhatsApp new message animations on Android and iOS](https://www.sammyfans.com/2026/06/19/whatsapp-gets-new-message-animations-on-android-and-ios/)
- [WABetaInfo: WhatsApp beta for iOS 25.15.10.74](https://wabetainfo.com/whatsapp-beta-for-ios-25-15-10-74-whats-new/)
- [iMessage reply bubble physics (SwiftUI)](https://vp0.com/blogs/imessage-reply-bubble-physics-swiftui)
- [WhatsApp chat clone: animations](https://www.mintlify.com/thesmit/whatsapp-chat/customization/animations)
- [Skeleton screens vs loading screens](https://blog.openreplay.com/skeleton-screens-vs-loading-screens--a-ux-battle/)
- [Skeleton screens vs loading spinners](https://www.onething.design/post/skeleton-screens-vs-loading-spinners)
- [What you should know about skeleton screens](https://uxdesign.cc/what-you-should-know-about-skeleton-screens-a820c45a571a?gi=bd3aa11ba5d4)
- [Designing better loading/progress UX](https://smart-interface-design-patterns.com/articles/designing-better-loading-progress-ux/)
- [Duolingo: streak milestone design & animation](https://blog.duolingo.com/streak-milestone-design-animation)
- [Duolingo streak mechanics](https://duolingo.deconstructoroffun.com/mechanics/streaks)
- [Duolingo streak flame animation code](https://vp0.com/blogs/duolingo-streak-flame-animation-code)
- [How did they do that: the Twitter like animation](https://medium.com/@chrismabry/how-did-they-do-that-the-twitter-like-animation-2a473b658e43)
- [Recreating Twitter's like effect with mo.js](https://medium.com/@bmcilhen/recreating-twitters-like-effect-with-with-mo-js-86af491c25a1)
- [Twitter's first-like animation](https://www.iphoneincanada.ca/news/twitter-animation-first-like-tweet/)
- [Like Burst component](https://21st.dev/@ddoemonn/components/like-burst.md)
