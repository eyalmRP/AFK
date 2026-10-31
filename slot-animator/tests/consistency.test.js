// The editor's help stays complete and consistent as features are added:
// every section has an icon and a tooltip card, every demo is shown by a
// card, links and search point at real tabs and Asset Bank filters, and
// removing is a trash can (an X only closes, or takes a chip off).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TIPS } from '../src/js/ui/tips.js';
import { DEMOS } from '../src/js/ui/demos.js';
import { FEATURES } from '../src/js/ui/search.js';

const app = readFileSync(new URL('../src/js/ui/app.js', import.meta.url), 'utf8');
const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const titles = [...new Set([...app.matchAll(/section\(\s*'([^']+)'/g), ...app.matchAll(/h\('h3', null, '([^']+)'\)/g)].map((m) => slug(m[1])))];
const TABS = ['machine', 'spin', 'wins', 'effects', 'features', 'wheel', 'sound', 'export'];
const BANK = [...app.match(/const BANK_FILTERS = \[([\s\S]*?)\];/)[1].matchAll(/\['([a-z]+)'/g)].map((m) => m[1]);

test('every section has an icon and a tooltip card', () => {
  const icons = new Set([...app.match(/const SECTION_ICONS = \{([\s\S]*?)\};/)[1].matchAll(/'?([a-z0-9-]+)'?:/g)].map((m) => m[1]));
  const cards = new Set(Object.keys(TIPS).filter((k) => k.startsWith('sec:')).map((k) => k.split('/')[1]));
  assert.ok(titles.length > 40);
  for (const t of titles) {
    assert.ok(icons.has(t), `section "${t}" has no icon in SECTION_ICONS`);
    assert.ok(cards.has(t), `section "${t}" has no sec:<tab>/${t} tooltip in ui/tips.js`);
  }
});

test('every demo is shown by a tooltip card', () => {
  const used = new Set(Object.values(TIPS).map((t) => t.demo).filter(Boolean));
  for (const d of Object.keys(DEMOS)) assert.ok(used.has(d), `demo "${d}" is not used by any tooltip`);
});

test('links and search point at real tabs and Asset Bank filters', () => {
  for (const m of app.matchAll(/moreLink\('[^']*', \{ (tab|bank): '([a-z]+)'/g)) assert.ok((m[1] === 'tab' ? TABS : BANK).includes(m[2]), `moreLink to ${m[1]} "${m[2]}"`);
  for (const f of FEATURES) {
    if (f.go.tab) assert.ok(TABS.includes(f.go.tab), `${f.title}: tab ${f.go.tab}`);
    if (f.go.bank) assert.ok(BANK.includes(f.go.bank), `${f.title}: bank ${f.go.bank}`);
  }
  for (const [key, t] of Object.entries(TIPS)) if (t.tab.startsWith('bank:')) assert.ok(BANK.includes(t.tab.slice(5)), `${key}: bank ${t.tab}`);
});

test('removing is a trash can; an X only closes or takes a chip off', () => {
  for (const m of app.matchAll(/\{ class: '([^']*)', icon: 'x', (?:id: [^,]+, )?title: [`']((?:Remove|Take|Delete)[^`']*)/g)) assert.ok(/\bchip\b/.test(m[1]), `"${m[2]}" uses an X; use the trash icon`);
  for (const m of app.matchAll(/icon: 'x', title: [`']((?:Remove|Take|Delete)[^`']*)/g)) assert.fail(`"${m[1]}" uses an X; use the trash icon`);
});
