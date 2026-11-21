// suggestUsername hand tests (src/lib/suggestUsername.ts). Plain node.
// Run:  npx tsc src/lib/suggestUsername.ts --ignoreConfig --outDir /tmp/gm-out --module commonjs --target es2020 --skipLibCheck \
//         && node docs/guest-mode/username-tests.cjs /tmp/gm-out/suggestUsername.js
const path = require('path');
const { suggestUsername } = require(path.resolve(process.argv[2] || '/tmp/gm-out/suggestUsername.js'));

let failed = 0;
const SERVER = /^[a-z0-9._-]{3,30}$/;   // migration 116
const CLIENT = /^[a-z0-9._-]{3,20}$/;   // ProfileForm
const RESERVED = ['admin', 'administrator', 'sportron', 'support', 'moderator', 'system', 't3s'];

function eq(meta, expected, msg) {
  const got = suggestUsername(meta);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(ok ? 'PASS:' : 'FAIL:', msg, ok ? '' : `(got "${got}", expected "${expected}")`);
}
function valid(meta, msg) {
  const got = suggestUsername(meta);
  const ok = CLIENT.test(got) && SERVER.test(got) && !RESERVED.includes(got);
  if (!ok) failed++;
  console.log(ok ? 'PASS:' : 'FAIL:', msg, `-> "${got}"`);
}

eq({ full_name: 'Murtaza Baig' }, 'murtaza_baig', 'full name -> snake case');
eq({ full_name: 'Zoë Müller' }, 'zoe_muller', 'accents stripped');
eq({ full_name: '  Ali   Khan  ' }, 'ali_khan', 'extra spaces collapsed');
eq({ full_name: 'A', name: 'Sara' }, 'sara', 'too-short full name falls back to name');
eq({ full_name: '', name: '', email: 'john.doe99@gmail.com' }, 'john.doe99', 'falls back to the email local part');
eq({ full_name: '日本語', email: 'x@y.com' }, 'player', 'non-latin with a 1-char email -> generic');
eq({}, 'player', 'no metadata -> generic');
eq(null, 'player', 'null metadata -> generic');
eq({ full_name: 'admin' }, 'admin_1', 'reserved word is not suggested');
eq({ full_name: 'Sportron' }, 'sportron_1', 'reserved brand word is not suggested');
eq({ full_name: 'A very very long name indeed here' }, 'a_very_very_long_nam', 'clipped to 20 chars');
eq({ full_name: 'ab' , email: 'cd@x.com' }, 'player', 'everything too short -> generic');
eq({ full_name: 'Name---With___Marks!!' }, 'name_with_marks', 'repeated separators collapsed, symbols dropped');
eq({ full_name: 123, email: 42 }, 'player', 'non-string metadata ignored');

for (const m of [{ full_name: 'Murtaza Baig' }, { full_name: '..--..' , email: 'q@q.com'}, { full_name: '___x___' }, { email: 'a.b@c.com' }, { full_name: 'T3S' }]) {
  valid(m, `always a valid username for ${JSON.stringify(m)}`);
}

console.log(failed ? `\n${failed} FAILED` : '\nALL TESTS PASSED');
process.exit(failed ? 1 : 0);
