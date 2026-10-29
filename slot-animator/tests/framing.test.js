// Framing: the title can be switched off (the machine takes its room), and a
// zoom scales the machine, its pots, title and win meter together.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProject, potsProject, portraitProject } from '../src/js/core/defaults.js';
import { computeLayout } from '../src/js/core/layout.js';
import { buildTimeline } from '../src/js/core/timeline.js';
import { buildAEData, buildAEScript, aeAssetFiles } from '../src/js/core/ae-export.js';
import { createAE, runScript } from './ae-mock.js';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);
// Everything that sits on screen, as numbers, for comparing two layouts.
const plain = (L) => JSON.stringify(L, (k, v) => (typeof v === 'function' || k === 'wheel' ? undefined : v));

test('zoom 100% and a title on leave the layout exactly as it was', () => {
  for (const make of [defaultProject, potsProject, portraitProject]) {
    const p = make();
    const a = plain(computeLayout(p));
    delete p.machine.zoom;
    delete p.machine.showTitle;
    assert.equal(plain(computeLayout(p)), a);
  }
});

test('without a title the machine grows into its room, below the free spins strip', () => {
  const p = defaultProject();
  const on = computeLayout(p);
  p.machine.showTitle = false;
  const off = computeLayout(p);
  assert.ok(off.cellW > on.cellW, 'bigger machine');
  assert.ok(off.frame.y < on.frame.y, 'it rises');
  assert.ok(off.frame.y >= p.canvas.height * 0.09, 'room left for the ribbon');
  assert.ok(off.ribbonY > 0 && off.ribbonY < off.frame.y);
});

test('zoom scales the machine, pots and win meter together about their middle', () => {
  for (const make of [defaultProject, potsProject, portraitProject]) {
    const p = make();
    const a = computeLayout(p);
    const top = (L) => (L.pots ? Math.min(...L.pots.map((pt) => pt.top)) : L.logo.cy - L.logo.h / 2);
    const bottom = (L) => L.hud.y + L.hud.h;
    for (const z of [0.7, 1.3]) {
      p.machine.zoom = z;
      const b = computeLayout(p);
      near(b.cellW, a.cellW * z, 1, `${p.name} cell at ${z}`);
      near(b.frame.w, a.frame.w * z, 12, `${p.name} frame width at ${z}`);
      near(b.frame.x + b.frame.w / 2, a.frame.x + a.frame.w / 2, 1, 'stays centred across');
      // Zoomed in, pots that reach the top of the screen stop there.
      if (a.pots && z > 1) continue;
      near((top(b) + bottom(b)) / 2, (top(a) + bottom(a)) / 2, 6, `${p.name} group middle at ${z}`);
      near(bottom(b) - top(b), (bottom(a) - top(a)) * z, 14, `${p.name} group height at ${z}`);
      if (a.pots && z < 1) near(b.pots[0].size, a.pots[0].size * z, 1, 'the pots scale too');
    }
  }
});

test('zoomed out, tall pots get room above them; zoomed in, the top of the screen still stops them', () => {
  const p = potsProject();
  p.pots.size = 1.8;
  const full = computeLayout(p);
  const top = (L) => Math.min(...L.pots.map((pt) => pt.top));
  p.machine.zoom = 0.7;
  const out = computeLayout(p);
  assert.ok(top(out) > top(full) + 60, 'room above the pots');
  near(out.pots[0].size / out.frame.w, full.pots[0].size / full.frame.w, 0.01, 'same size beside the machine');
  p.machine.zoom = 1.5;
  assert.ok(top(computeLayout(p)) >= 0, 'zoomed in, they stop at the top');
});

test('After Effects follows: no title layer when it is off, a smaller machine when zoomed out', () => {
  const p = defaultProject();
  p.machine.showTitle = false;
  p.machine.zoom = 0.8;
  const L = computeLayout(p);
  const tl = buildTimeline(p);
  const data = buildAEData(p, tl, L, { hasLogo: false });
  assert.equal(data.assets.logo, '');
  near(data.winW, L.winW, 0.5, 'reel window width');
  const { env, log } = createAE({ files: new Set([...aeAssetFiles(data)].map((f) => `/pkg/${f}`)) });
  runScript(buildAEScript([data]), env);
  assert.deepEqual(log.alerts, []);
  assert.ok(!log.comps.some((c) => /logo/i.test(c.name)), 'no logo comp');
});
