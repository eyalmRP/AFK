import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TIPS, tipEntries } from '../src/js/ui/tips.js';
import { DEMOS, demoPlan, demoAt, DEMO_LOOP, STILL_HOLD } from '../src/js/ui/demos.js';
import { searchFeatures, buildIndex } from '../src/js/ui/search.js';
import { buildTimeline } from '../src/js/core/timeline.js';
import { SPIN_TYPES } from '../src/js/core/defaults.js';

const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

test('tooltips point at controls and sections that exist, and their demos exist', () => {
  const app = readFileSync(new URL('../src/js/ui/app.js', import.meta.url), 'utf8');
  const ids = new Set([...app.matchAll(/id: '([a-z0-9-]+)'/g)].map((m) => m[1]));
  for (const t of SPIN_TYPES) ids.add(`spin-type-${t.id}`);
  for (const m of app.matchAll(/id: `([a-z-]+)\$\{/g)) ids.add(`${m[1]}*`);
  // Sections made with section('Title', …) or with their own h3 title.
  const titles = new Set([...app.matchAll(/section\(\s*'([^']+)'/g), ...app.matchAll(/h\('h3', null, '([^']+)'\)/g)].map((m) => slug(m[1])));
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
      // A still is one moment; an animation a stretch.
      if (s.still) assert.ok(Number.isFinite(s.a) && s.a >= 0 && s.b === s.a && s.a <= s.tl.duration, `${name}: still at ${s.a} in 0..${s.tl.duration}`);
      else assert.ok(Number.isFinite(s.a) && s.a >= 0 && s.b > s.a && s.b <= s.tl.duration + 1e-6, `${name}: ${s.a}..${s.b} in 0..${s.tl.duration}`);
      assert.equal(s.still, plan[0].still, `${name}: all variants stills, or none`);
      // A spot lies on the frame, smaller than it.
      if (s.spot) {
        const r = s.spot;
        assert.ok(r.w > 4 && r.h > 4 && r.x < 480 && r.y < 270 && r.x + r.w > 0 && r.y + r.h > 0, `${name}: spot ${JSON.stringify(r)}`);
        assert.ok(r.w * r.h < 480 * 270 * 0.9, `${name}: the spot leaves something to darken`);
      }
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

test('a demo with variants plays each in turn; a still shows each for a moment', () => {
  const plan = demoPlan('shake');
  assert.deepEqual(plan.map((s) => s.label), ['Off', 'On']);
  const lens = plan.map((s) => (s.b - s.a) / s.speed);
  assert.equal(demoAt(plan, 0).i, 0);
  assert.equal(demoAt(plan, lens[0] + 0.01).i, 1);
  assert.equal(demoAt(plan, lens[0] + lens[1] + 0.01).i, 0);
  const at = demoAt(plan, lens[0] * 0.5);
  assert.ok(at.t > plan[0].a && at.t < plan[0].b);
  // Stills: the dim off, then on, each held STILL_HOLD seconds.
  const dim = demoPlan('dim');
  assert.ok(dim.every((s) => s.still));
  assert.equal(dim[0].project.effects.dim, 0);
  assert.ok(dim[1].project.effects.dim > 0.5);
  assert.deepEqual([0.1, STILL_HOLD + 0.1, 2 * STILL_HOLD + 0.1].map((e) => demoAt(dim, e).i), [0, 1, 0]);
  assert.equal(demoAt(dim, STILL_HOLD + 0.1).t, dim[1].a);
  // The highlighted cells show at that moment.
  assert.ok(dim[1].tl.rounds[0].pres.steps[0].start < dim[1].a && dim[1].a < dim[1].tl.rounds[0].pres.steps[0].end);
});

test('spots and stills: layouts are stills with their subject lit; the cluster demo shows a cluster', () => {
  for (const id of ['jp-above', 'jp-left', 'jp-sizing', 'jp-padding', 'title', 'pots-size', 'pay-mode']) {
    const plan = demoPlan(id);
    assert.ok(plan.every((s) => s.still), `${id} is a still`);
  }
  for (const id of ['jp-above', 'jp-sizing', 'jp-values', 'end-bounce', 'antic-time', 'pay-mode']) assert.ok(demoPlan(id).every((s) => s.spot), `${id} lights its subject`);
  // Running jackpot values: close on one box, animated.
  const [, running] = demoPlan('jp-values');
  assert.ok(!running.still && running.project.canvas.width / 480 > 2, 'zoomed in on one box');
  // The cluster variant pays a cluster: touching cells, at least five.
  const cl = demoPlan('pay-mode').find((s) => s.label === 'Clusters');
  assert.equal(cl.project.machine.payMode, 'cluster');
  const cells = cl.tl.rounds[0].pres.steps[0].cells;
  assert.ok(cells.length >= 5);
  const key = (c, r) => `${c},${r}`;
  const set = new Set(cells.map(([c, r]) => key(c, r)));
  const seen = new Set([key(...cells[0])]);
  const todo = [cells[0]];
  while (todo.length) {
    const [c, r] = todo.pop();
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = key(c + dc, r + dr);
      if (set.has(k) && !seen.has(k)) {
        seen.add(k);
        todo.push([c + dc, r + dr]);
      }
    }
  }
  assert.equal(seen.size, set.size, 'one connected group');
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
