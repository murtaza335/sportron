import { useSyncExternalStore } from 'react';

/**
 * Guest mode (docs/guest-mode/PLAN.md): people who are not signed in can browse tournaments, public
 * communities and open sessions; signing in is asked for only when they try to DO something.
 *
 * Two facts live here (a tiny external store, like lib/sessionsView.ts) because services need them
 * synchronously and the root layout / header need to re-render when they change:
 *  - `enabled`  - the server switch `site_config.guest_mode` (OFF = the old "sign in first" behaviour).
 *  - `signedIn` - whether a Supabase session exists. Set by AuthContext BEFORE `loading` turns false.
 *
 * Pure and RN-free on purpose (the route allow-list is unit-tested from plain node).
 */

type State = { enabled: boolean; signedIn: boolean };

let state: State = { enabled: false, signedIn: false };
const listeners = new Set<() => void>();

function update(patch: Partial<State>) {
  const next = { ...state, ...patch };
  if (next.enabled === state.enabled && next.signedIn === state.signedIn) return;
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setGuestModeEnabled(enabled: boolean) {
  update({ enabled });
}

export function setSignedIn(signedIn: boolean) {
  update({ signedIn });
}

/** True while there is no session. Services use this to pick the guest read functions. */
export function isGuestSession(): boolean {
  return !state.signedIn;
}

export function isGuestBrowsingEnabled(): boolean {
  return state.enabled;
}

/** Re-renders when the user signs in / out. */
export function useIsGuest(): boolean {
  return useSyncExternalStore(subscribe, () => !state.signedIn, () => !state.signedIn);
}

/** Re-renders when the server switch changes (it is read once at startup). */
export function useGuestBrowsingEnabled(): boolean {
  return useSyncExternalStore(subscribe, () => state.enabled, () => state.enabled);
}

// ── Route allow-list ──────────────────────────────────────────────────────────────────────────────
// Expo Router segments, e.g. ['(tabs)', 'history'], ['tournament', '[id]', 'module', '[moduleId]'].
// Anything not listed still requires sign-in (the root gate sends it to /login and remembers it).
const GUEST_TABS = new Set(['history', 'tournaments', 'chats', 'updates']);

export function isGuestRoute(segments: readonly string[]): boolean {
  const [first, second, third, fourth, fifth] = segments;
  switch (first) {
    case '(tabs)':
      // index (Communities) has no second segment. `profile` (own profile) needs an account.
      return segments.length === 1 || (segments.length === 2 && GUEST_TABS.has(second));
    case 'tournament':
      if (second !== '[id]') return false;
      if (segments.length === 2) return true; // /tournament/<id>
      if (third === 'module') return segments.length === 4 && fourth === '[moduleId]'; // read-only module page only
      if (third === 'live') return segments.length === 3 || (segments.length === 4 && fourth === '[matchId]' && fifth === undefined);
      return false; // manage, fields, module-form, score, seeding, rounds, entry-form ... are admin screens
    case 'discover':
    case 'get':
    case 'android':
      return segments.length === 1;
    case 'community':
      return second === '[id]' && segments.length === 2; // the card/preview only; members, chat, admin screens need an account
    default:
      return false;
  }
}

// ── Read functions: signed-in name -> guest name (migration 134) ───────────────────────────────────
const GUEST_RPC: Record<string, string> = {
  get_tournaments: 'guest_get_tournaments',
  get_tournament_detail: 'guest_get_tournament_detail',
  get_module_detail: 'guest_get_module_detail',
  get_module_entries: 'guest_get_module_entries',
  get_module_matches: 'guest_get_module_matches',
  get_module_standings_v2: 'guest_get_module_standings_v2',
  get_module_groups: 'guest_get_module_groups',
  get_tournament_schedule: 'guest_get_tournament_schedule',
  get_live_tournaments: 'guest_get_live_tournaments',
  get_live_tournament_board: 'guest_get_live_tournament_board',
  get_live_match: 'guest_get_live_match',
};

/**
 * The RPC to call right now. Signed in -> `fn` unchanged. Guest -> its guest_* twin, or a NOT_ALLOWED
 * error for anything that has no guest twin (so a missed screen fails closed instead of hitting the
 * server with a call it cannot make).
 */
export function resolveRpc(fn: string): string {
  if (!isGuestSession()) return fn;
  const guest = GUEST_RPC[fn];
  if (!guest) throw new Error('NOT_ALLOWED');
  return guest;
}
