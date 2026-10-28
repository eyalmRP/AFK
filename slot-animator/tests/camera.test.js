import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProject, cellsProject, newRound } from '../src/js/core/defaults.js';
import { buildTimeline } from '../src/js/core/timeline.js';
import { computeLayout } from '../src/js/core/layout.js';
import { buildAEData, buildAEScript } from '../src/js/core/ae-export.js';
import { cameraAt, focusPoint } from '../src/js/core/camera.js';
import { createAE, runScript } from './ae-mock.js';

function teaseProject() {
  const p = defaultProject();
  p.rounds = [newRound('none', { seed: 1 }), newRound('nearmiss', { seed: 2 }), newRound('none', { seed: 3, antic: [2, 4] })];
  return p;
}

test('camera: pushes in on the teased reel, follows the tease and eases back out', () => {
  const p = teaseProject();
  const tl = buildTimeline(p);
  const L = computeLayout(p);
  assert.ok(tl.camera.length >= 2, 'a window per teasing round');
  for (const w of tl.camera) {
    const f0 = focusPoint(L, w.foci[0]);
    const mid = cameraAt(tl.camera, (w.start + w.foci[0].t) / 2 + 0.45, L, 0.2);
    assert.ok(mid.z > 1.15 && Math.abs(mid.x - f0.x) < 1e-6, 'zoomed on the first teased reel');
    assert.equal(cameraAt(tl.camera, w.start - 0.01, L, 0.2).z, 1);
    assert.equal(cameraAt(tl.camera, w.end + 0.7, L, 0.2).z, 1, 'back out after the landing');
    if (w.foci.length > 1) {
      const last = w.foci[w.foci.length - 1];
      const at = cameraAt(tl.camera, last.t + 0.4, L, 0.2);
      assert.ok(Math.abs(at.x - focusPoint(L, last).x) < 1e-6, 'pans to the next teased reel');
    }
  }
  // Two picked reels in one round share one window.
  const R = tl.rounds[2];
  const own = tl.camera.filter((w) => w.start >= R.t0 && w.start < R.next);
  assert.equal(own.length, 1);
  assert.deepEqual(own[0].foci.map((f) => f.c), [2, 4]);
  // Off: no camera at all.
  p.spin.zoomOn = false;
  assert.deepEqual(buildTimeline(p).camera, []);
});

test('camera: per-cell spins zoom on the teased cell', () => {
  const p = cellsProject();
  p.rounds = [newRound('nearmiss', { seed: 9 })];
  const tl = buildTimeline(p);
  const L = computeLayout(p);
  assert.ok(tl.camera.length >= 1);
  const f = tl.camera[0].foci[0];
  assert.ok(f.r != null);
  const m = L.cellCenter(f.c, f.r);
  const at = cameraAt(tl.camera, f.t + 0.39, L, 0.3);
  assert.ok(Math.abs(at.x - m.x) < 1e-6 && Math.abs(at.y - m.y) < 1e-6);
});

test('camera: After Effects CAMERA null zooms like the preview, with the Zoom % control', () => {
  const p = teaseProject();
  const tl = buildTimeline(p);
  const L = computeLayout(p);
  const data = buildAEData(p, tl, L, { titleKeys: [] });
  const { env, log } = createAE({ files: new Set() });
  runScript(buildAEScript([data]), env);
  const main = log.comps.find((c) => c.name === p.name);
  const cam = main.layers.list.find((l) => l.name === 'CAMERA');
  assert.ok(cam, 'CAMERA null');
  const shake = main.layers.list.find((l) => l.name === 'SCREEN SHAKE');
  assert.equal(shake.parent, cam);
  const tr = cam.property('ADBE Transform Group');
  for (const pct of [100, 50]) {
    const comp = () => ({ layer: () => ({ effect: () => () => ({ value: pct, valueOf: () => pct }) }) });
    const ev = (expr, time) => new Function('time', 'comp', `return eval(${JSON.stringify(expr)})`)(time, comp);
    for (const w of tl.camera) {
      for (const t of [w.start + 0.2, w.start + 0.6, (w.start + w.end) / 2, w.end + 0.3, w.end + 0.9]) {
        const want = cameraAt(tl.camera, t, L, data.camera.amount * (pct / 100));
        const s = ev(tr.property('ADBE Scale').expression, t);
        assert.ok(Math.abs(s[0] / 100 - want.z) < 1e-6, `zoom at ${t}`);
        const xy = ev(tr.property('ADBE Position').expression, t);
        // A child at world point C maps to F + z (C - F): check the null's own spot.
        assert.ok(Math.abs(xy[0] - (want.x * (1 - want.z) + (L.W / 2) * want.z)) < 1e-3 && Math.abs(xy[1] - (want.y * (1 - want.z) + (L.H / 2) * want.z)) < 1e-3, `pan at ${t}`);
      }
    }
  }
  // No anticipation, no camera.
  const q = defaultProject();
  q.rounds = [newRound('small', { seed: 1 })];
  const d2 = buildAEData(q, buildTimeline(q), computeLayout(q), { titleKeys: [] });
  assert.equal(d2.camera, null);
});
