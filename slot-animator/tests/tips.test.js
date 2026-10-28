import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TIPS, tipEntries } from '../src/js/ui/tips.js';
import { DEMOS, demoWindow, DEMO_LOOP } from '../src/js/ui/demos.js';
import { searchFeatures, buildIndex } from '../src/js/ui/search.js';
import { buildTimeline } from '../src/js/core/timeline.js';
import { SPIN_TYPES } from '../src/js/core/defaults.js';

const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

test('tooltips point at controls and sections that exist, and their demos exist', () => {
  const app = readFileSync(new URL('../src/js/ui/app.js', import.meta.url), 'utf8');
  const ids = new Set([...app.matchAll(/id: '([a-z0-9-]+)'/g)].map((m) => m[1]));
  for (const t of SPIN_TYPES) ids.add(`spin-type-${t.id}`);
  for (const m of app.matchAll(/id: `([a-z-]+)\$\{/g)) ids.add(`${m[1]}*`);
  const titles = new Set([...app.matchAll(/section\(\s*'([^']+)'/g)].map((m) => slug(m[1])));
  for (const [key, tip] of Object.entries(TIPS)) {
    assert.ok(tip.title && tip.text, key);
    if (tip.demo) assert.ok(DEMOS[tip.demo], `${key}: demo ${tip.demo}`);
    if (key.startsWith('sec:')) {
      assert.ok(titles.has(key.split('/')[1]), `section ${key}`);
      continue;
    }
    // A control, a segmented option ("<id>-<value>") or a prefixed id.
    const ok = ids.has(key) || [...ids].some((x) => key.startsWith(`${x.replace(/\*$/, '')}-`) || (x.endsWith('*') && key.startsWith(x.slice(0, -1))));
    assert.ok(ok, `control #${key}`);
  }
});

test('every demo builds and loops a short stretch of its own timeline', () => {
  for (const [id, d] of Object.entries(DEMOS)) {
    const p = d.make();
    assert.equal(p.canvas.width, 480, id);
    const tl = buildTimeline(p);
    const w = demoWindow(id, tl);
    assert.ok(Number.isFinite(w.a) && w.a >= 0 && w.b > w.a && w.b <= tl.duration + 1e-6, `${id}: ${w.a}..${w.b}`);
    assert.ok((w.b - w.a) / w.speed <= DEMO_LOOP + 1e-9, `${id} plays within ${DEMO_LOOP} s`);
  }
});

test('feature search reads the tooltip texts', () => {
  const index = buildIndex(tipEntries());
  const top = (q) => searchFeatures(q, index).slice(0, 3).map((r) => r.feature.title);
  assert.ok(top('pull back before they spin').includes('Wind-up start'));
  assert.ok(top('wobbles before it settles').includes('Elastic stop'));
  assert.ok(top('creeps into the next peg').includes('Almost slips'));
  assert.ok(top('symbols fall out').includes('Cascade drop'));
});
