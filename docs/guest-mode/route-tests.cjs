// Guest route allow-list + rpc routing tests (src/lib/guestMode.ts). Plain node, no framework.
// Run:  npx tsc src/lib/guestMode.ts --ignoreConfig --outDir /tmp/gm-out --module commonjs --target es2020 --skipLibCheck --esModuleInterop \
//         && NODE_PATH=$PWD/node_modules node docs/guest-mode/route-tests.cjs /tmp/gm-out/guestMode.js
const path = require('path');
const gm = require(path.resolve(process.argv[2] || '/tmp/gm-out/guestMode.js'));

let failed = 0;
function check(ok, msg) {
  if (ok) console.log('PASS:', msg);
  else { failed++; console.log('FAIL:', msg); }
}

// ── routes a guest MAY open
const allowed = [
  [['(tabs)'], 'communities tab (index)'],
  [['(tabs)', 'history'], 'sessions tab'],
  [['(tabs)', 'tournaments'], 'tournaments tab'],
  [['(tabs)', 'chats'], 'chats tab (shows a sign-in card)'],
  [['(tabs)', 'updates'], 'activity tab (shows a sign-in card)'],
  [['tournament', '[id]'], 'tournament page'],
  [['tournament', '[id]', 'module', '[moduleId]'], 'module page'],
  [['tournament', '[id]', 'live'], 'live courts'],
  [['tournament', '[id]', 'live', '[matchId]'], 'live match'],
  [['discover'], 'discover'],
  [['community', '[id]'], 'community card'],
  [['get'], 'marketing redirect /get'],
  [['android'], 'marketing redirect /android'],
];
for (const [segs, name] of allowed) check(gm.isGuestRoute(segs) === true, `guest may open: ${name}`);

// ── routes that must STILL require an account
const blocked = [
  [['score'], 'to-score list'],
  [['(tabs)', 'profile'], 'own profile'],
  [['profile', '[id]'], 'public profile'],
  [['settings'], 'settings'],
  [['add-match'], 'record match'],
  [['create-community'], 'create community'],
  [['create-session'], 'create session'],
  [['chat'], 'chat'],
  [['community', '[id]', 'members'], 'community members'],
  [['community', '[id]', 'info'], 'community info'],
  [['community', '[id]', 'edit'], 'community edit'],
  [['community', '[id]', 'join-requests'], 'join requests'],
  [['community', '[id]', 'pending-matches'], 'pending matches'],
  [['tournament', '[id]', 'manage'], 'tournament manage'],
  [['tournament', '[id]', 'fields'], 'entry form fields'],
  [['tournament', '[id]', 'module-form'], 'module form'],
  [['tournament', '[id]', 'module', '[moduleId]', 'manage'], 'module manage'],
  [['tournament', '[id]', 'module', '[moduleId]', 'seeding'], 'seeding'],
  [['tournament', '[id]', 'module', '[moduleId]', 'rounds'], 'rounds'],
  [['tournament', '[id]', 'module', '[moduleId]', 'entry-form'], 'entry form'],
  [['tournament', '[id]', 'module', '[moduleId]', 'score', '[matchId]'], 'live SCORING (referee)'],
  [['tournament', '[id]', 'live', '[matchId]', 'extra'], 'unknown deeper live path'],
  [['login', 'x'], 'unknown deeper path'],
  [['tournament'], 'bare tournament folder'],
  [['discover', 'x'], 'discover sub path'],
  [['onboarding'], 'onboarding (handled by the auth group, not the guest list)'],
  [[], 'empty'],
];
for (const [segs, name] of blocked) check(gm.isGuestRoute(segs) === false, `guest is sent to sign in for: ${name}`);

// ── rpc routing
gm.setSignedIn(true);
check(gm.resolveRpc('get_tournaments') === 'get_tournaments', 'signed in: regular function used');
check(gm.resolveRpc('record_tournament_result') === 'record_tournament_result', 'signed in: any rpc passes through');
check(gm.isGuestSession() === false, 'signed in: not a guest');
gm.setSignedIn(false);
check(gm.isGuestSession() === true, 'signed out: guest');
check(gm.resolveRpc('get_tournaments') === 'guest_get_tournaments', 'guest: tournaments -> guest twin');
check(gm.resolveRpc('get_module_entries') === 'guest_get_module_entries', 'guest: entries -> guest twin');
check(gm.resolveRpc('get_live_match') === 'guest_get_live_match', 'guest: live match -> guest twin');
for (const fn of ['record_tournament_result', 'upsert_tournament_entry', 'get_tournament_promos', 'reveal_tournament_promo',
                  'live_push_score', 'get_tournament_entry_fields', 'submit_report', 'get_feature_flags']) {
  let threw = null;
  try { gm.resolveRpc(fn); } catch (e) { threw = e.message; }
  check(threw === 'NOT_ALLOWED', `guest: ${fn} has no guest twin -> fails closed (NOT_ALLOWED)`);
}

// ── store
let calls = 0;
gm.setGuestModeEnabled(false);
check(gm.isGuestBrowsingEnabled() === false, 'switch defaults OFF');
gm.setGuestModeEnabled(true);
check(gm.isGuestBrowsingEnabled() === true, 'switch ON');

console.log(failed ? `\n${failed} FAILED` : '\nALL TESTS PASSED');
process.exit(failed ? 1 : 0);
