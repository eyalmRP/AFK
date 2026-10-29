import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TIPS, tipEntries } from '../src/js/ui/tips.js';
import { DEMOS, demoPlan, demoAt, DEMO_LOOP } from '../src/js/ui/demos.js';
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
  for (const id of Object.keys(DEMOS)) {
    const plan = demoPlan(id);
    assert.ok(plan.length >= 1, id);
    for (const s of plan) {
      const name = `${id}${s.label ? ` (${s.label})` : ''}`;
      if (plan.length > 1) assert.ok(s.label, `${name}: a variant has a label`);
      assert.ok(Number.isFinite(s.a) && s.a >= 0 && s.b > s.a && s.b <= s.tl.duration + 1e-6, `${name}: ${s.a}..${s.b} in 0..${s.tl.duration}`);
      assert.ok((s.b - s.a) / s.speed <= DEMO_LOOP + 1e-9, `${name} plays within ${DEMO_LOOP} s`);
      assert.ok(s.speed > 0 && s.speed <= Math.max(1, (s.b - s.a) / DEMO_LOOP) + 1e-9, `${name}: speed ${s.speed}`);
      // A focus lies on the 480x270 canvas, keeps its shape, and the view
      // onto the bigger scene stays inside it.
      if (s.focus) {
        const f = s.focus;
        assert.ok(f.x >= -1e-6 && f.y >= -1e-6 && f.x + f.w <= 480 + 1e-6 && f.y + f.h <= 270 + 1e-6, `${name}: focus ${JSON.stringify(f)}`);
        assert.ok(Math.abs(f.w / f.h - 16 / 9) < 0.01, `${name}: focus is 16:9`);
        assert.ok(s.view && s.view.x >= 0 && s.view.y >= 0 && s.view.x + 480 <= s.project.canvas.width + 1 && s.view.y + 270 <= s.project.canvas.height + 1, `${name}: view ${JSON.stringify(s.view)}`);
        assert.ok(s.project.canvas.width / 480 <= 3.01, `${name}: zoom`);
      } else {
        assert.equal(s.project.canvas.width, 480, name);
        assert.equal(s.view, null, name);
      }
    }
  }
});

test('every demo belongs to a tooltip', () => {
  const used = new Set(Object.values(TIPS).map((t) => t.demo));
  for (const id of Object.keys(DEMOS)) assert.ok(used.has(id), `${id} is shown by some tip`);
});

test('a demo with variants plays each in turn', () => {
  const plan = demoPlan('dim');
  assert.deepEqual(plan.map((s) => s.label), ['Off', 'On']);
  assert.equal(plan[0].project.effects.dim, 0);
  assert.ok(plan[1].project.effects.dim > 0.5);
  const lens = plan.map((s) => (s.b - s.a) / s.speed);
  assert.equal(demoAt(plan, 0).i, 0);
  assert.equal(demoAt(plan, lens[0] + 0.01).i, 1);
  assert.equal(demoAt(plan, lens[0] + lens[1] + 0.01).i, 0);
  const at = demoAt(plan, lens[0] * 0.5);
  assert.ok(at.t > plan[0].a && at.t < plan[0].b);
});

test('demos show only their subject', () => {
  // Win particles, paylines, shake and flashes stay off unless they are the point.
  for (const id of ['winfx-pop', 'winfx-jump', 'beam-collect', 'wild-mult', 'spin-classic', 'end-bounce']) {
    for (const s of demoPlan(id)) {
      const fx = s.project.effects;
      assert.equal(fx.coins, 0, `${id}: no particles`);
      assert.equal(fx.showLines, false, `${id}: no paylines`);
      assert.equal(fx.shake, 0, `${id}: no shake`);
      assert.equal(s.project.machine.marquee, false, `${id}: no marquee`);
    }
  }
  // Spin styles end before any win.
  for (const id of ['spin-classic', 'spin-stagger', 'spin-turbo', 'end-bounce', 'end-hard']) {
    const [s] = demoPlan(id);
    assert.equal(s.tl.rounds[0].pres.steps?.length || 0, 0, `${id}: no win`);
  }
  // Tips that share an option's picture no longer share a demo.
  const demoOf = (k) => TIPS[k].demo;
  assert.notEqual(demoOf('fx-dim'), demoOf('wf-style-pop'));
  assert.notEqual(demoOf('fx-pop'), demoOf('wf-style-pop'));
  assert.notEqual(demoOf('w-pointer-top'), demoOf('w-landing-center'));
  assert.notEqual(demoOf('w-framing-full'), demoOf('w-landing-center'));
  assert.notEqual(demoOf('m-pots-plates'), demoOf('m-pots-collect'));
  assert.notEqual(demoOf('fx-line'), demoOf('fx-lines-on'));
});

test('feature search reads the tooltip texts', () => {
  const index = buildIndex(tipEntries());
  const top = (q) => searchFeatures(q, index).slice(0, 3).map((r) => r.feature.title);
  assert.ok(top('pull back before they spin').includes('Wind-up start'));
  assert.ok(top('wobbles before it settles').includes('Elastic stop'));
  assert.ok(top('creeps into the next peg').includes('Almost slips'));
  assert.ok(top('symbols fall out').includes('Cascade drop'));
});
