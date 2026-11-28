// Hand tests for the guided tournament flow defaults (src/lib/organizeSports.ts). Plain node.
//   npx tsc --ignoreConfig --ignoreDeprecations 6.0 --strict --target es2020 --module commonjs \
//       --moduleResolution node --skipLibCheck --rootDir src/lib --outDir /tmp/wiz-out src/lib/organizeSports.ts
//   node docs/organizations/wizard-tests.cjs /tmp/wiz-out
const path = require('path');
const W = require(path.resolve(process.argv[2] || '/tmp/wiz-out', 'organizeSports.js'));

let passed = 0;
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } passed++; };

const names = W.WIZARD_OPTIONS.map((o) => o.name);
ok(new Set(names).size === names.length, 'module names are unique');
ok(names.every((n) => n.length >= 2 && n.length <= 60), 'names fit the 2–60 rule');
ok(names.includes("Badminton Men's Singles"), 'badminton name');
ok(names.includes("Table Tennis Women's Doubles"), 'table tennis name');
ok(names.includes('Basketball Men') && names.includes('Volleyball Women'), 'team sport names');

const [ms] = W.buildModules(['badminton:ms']);
ok(ms.sport === 'badminton' && Object.keys(ms.settings).length === 0, 'singles: no settings');
ok(ms.live_rules.preset === 'badminton_21' && ms.live_rules.bestOf === 3 && !ms.live_rules.doubles, 'badminton best of 3');
const [tt] = W.buildModules(['table_tennis:md']);
ok(tt.live_rules.bestOf === 5 && tt.live_rules.doubles === true, 'table tennis doubles: best of 5, doubles on');
ok(tt.settings.participant_type === 'team' && tt.settings.roster_min === 2 && tt.settings.roster_max === 2, 'doubles = team of two');
const [bb] = W.buildModules(['basketball:men']);
ok(bb.settings.format === 'round_robin' && bb.settings.roster_min === 5 && bb.live_rules.preset === 'basketball_fiba', 'basketball defaults');
const [vb] = W.buildModules(['volleyball:women'], { 'volleyball:women': 'single_elimination' });
ok(vb.settings.format === 'single_elimination' && vb.live_rules.preset === 'volleyball_25', 'format override');
ok(W.buildModules([]).length === 0, 'nothing chosen, nothing built');

console.log(`wizard tests: ${passed} checks passed`);
