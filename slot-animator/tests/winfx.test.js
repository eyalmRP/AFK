import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProject, candyProject, newRound } from '../src/js/core/defaults.js';
import { buildTimeline } from '../src/js/core/timeline.js';
import { computeLayout } from '../src/js/core/layout.js';
import { evalKeys } from '../src/js/core/keys.js';
import { buildAEData, buildAEScript } from '../src/js/core/ae-export.js';
import { flightAt, flightPath, jumpTarget, mergeTarget, winStyleOf } from '../src/js/core/winfx.js';
import { createAE, runScript } from './ae-mock.js';

function project(style, extra = {}) {
  const p = defaultProject();
  p.rounds = [newRound('medium', { seed: 5 }), newRound('small', { seed: 1 })];
  Object.assign(p.winfx, { style, ...extra });
  return p;
}

test('winning symbols: jump flies every winner into the score and counts each landing', () => {
  const p = project('jump');
  const tl = buildTimeline(p);
  for (const R of tl.rounds) {
    for (const st of R.pres.steps) {
      const f = st.fx;
      assert.equal(f.style, 'jump');
      assert.equal(f.launch.length, st.cells.length);
      assert.ok(f.launch.every((t, i) => t > st.start && f.arrive[i] > t && f.arrive[i] < st.end), 'flights fit in the step');
      // The meter climbs with the landings and ends on the step's total.
      const before = evalKeys(tl.meterKeys, f.arrive[0] - 0.01);
      const after = evalKeys(tl.meterKeys, f.arrive[f.arrive.length - 1] + 0.2);
      assert.ok(Math.abs(after - st.cum) < 1e-6, `meter ${after} vs ${st.cum}`);
      assert.ok(before < after);
      assert.equal(tl.sfx.filter((e) => e.type === 'scoreHit' && e.t >= st.start && e.t <= st.end).length, st.cells.length);
    }
  }
  // The flight lands on the target and fades out there.
  const L = computeLayout(p);
  const st = tl.rounds[0].pres.steps[0];
  const goal = jumpTarget(p, L, st);
  assert.ok(L.hud && Math.abs(goal.y - (L.hud.y + L.hud.h * 0.6)) < 1e-9, 'lands in the win meter');
  const path = flightPath('jump', L.cellCenter(...st.cells[0]), goal, L);
  const end = flightAt(path, st.fx.launch[0], st.fx.arrive[0], st.fx.arrive[0] - 1e-4);
  assert.ok(Math.hypot(end.x - goal.x, end.y - goal.y) < 1);
  assert.equal(flightAt(path, st.fx.launch[0], st.fx.arrive[0], st.fx.arrive[0] + 0.01).a, 0);
  // Custom spots are fractions of the screen.
  const q = project('jump', { target: 'custom', jx: 0.1, jy: 0.2 });
  const g2 = jumpTarget(q, L, st);
  assert.deepEqual([g2.x, g2.y], [L.W * 0.1, L.H * 0.2]);
});

test('winning symbols: merge pulls the winners together, then one big symbol counts the win', () => {
  const p = project('merge', { point: 'center' });
  const tl = buildTimeline(p);
  const L = computeLayout(p);
  for (const R of tl.rounds) {
    for (const st of R.pres.steps) {
      const f = st.fx;
      assert.equal(f.style, 'merge');
      assert.ok(f.arrive.every((t) => t === f.mergeAt));
      assert.ok(f.mergeAt + 1 <= st.end + 1e-9, 'the big symbol has time to show');
      assert.ok(evalKeys(tl.meterKeys, f.mergeAt) <= st.cum - st.amount + 1e-6, 'counting waits for the merge');
      assert.ok(tl.sfx.some((e) => e.type === 'merge' && Math.abs(e.t - f.mergeAt) < 1e-9));
      const g = mergeTarget(p, L, st);
      const path = flightPath('merge', L.cellCenter(...st.cells[0]), g, L);
      const at = flightAt(path, f.launch[0], f.mergeAt, f.mergeAt - 1e-4);
      assert.ok(Math.hypot(at.x - L.W / 2, at.y - L.H / 2) < 1);
    }
  }
  // Tumbles merge every step of the chain.
  const c = candyProject();
  c.winfx.style = 'merge';
  const ct = buildTimeline(c);
  assert.ok(ct.rounds.flatMap((R) => R.pres.steps).every((st) => st.fx && st.fx.style === 'merge'));
});

test('winning symbols: merge from all at once to one by one, and the three flight paths', () => {
  const p = project('merge', { mergeSeq: 1 });
  const tl = buildTimeline(p);
  const st = tl.rounds[0].pres.steps[0];
  const f = st.fx;
  // One by one: each arrives on its own, then waits at the point until the merge.
  for (let i = 1; i < f.arrive.length; i++) assert.ok(f.arrive[i] - f.arrive[i - 1] > 0.15, 'arrivals spread out');
  assert.ok(f.until.every((u) => u === f.mergeAt));
  assert.ok(f.mergeAt > f.arrive[f.arrive.length - 1]);
  assert.equal(tl.sfx.filter((e) => e.type === 'scoreHit' && e.t >= st.start && e.t <= st.end).length, st.cells.length, 'a tick as each joins');
  const L = computeLayout(p);
  const goal = mergeTarget(p, L, st);
  const p0 = L.cellCenter(...st.cells[0]);
  const waiting = flightAt(flightPath('merge', p0, goal, L, 'line'), f.launch[0], f.arrive[0], (f.arrive[0] + f.mergeAt) / 2, f.until[0]);
  assert.ok(Math.hypot(waiting.x - goal.x, waiting.y - goal.y) < 1 && waiting.a === 1, 'waits on the pile');
  // Paths: the wind-up first moves away from the target, the arc rises above both ends.
  const back = flightPath('jump', p0, goal, L, 'back');
  const early = flightAt(back, 0, 1, 0.35);
  const away = Math.hypot(early.x - goal.x, early.y - goal.y) > Math.hypot(p0.x - goal.x, p0.y - goal.y);
  assert.ok(away, 'wind-up pulls back first');
  const arc = flightPath('merge', p0, goal, L, 'arc');
  assert.ok(flightAt(arc, 0, 1, 0.6).y < Math.min(p0.y, goal.y), 'arc rises');
  const line = flightPath('jump', p0, goal, L, 'line');
  const mid = flightAt(line, 0, 1, 0.5);
  const cross = (goal.x - p0.x) * (mid.y - p0.y) - (goal.y - p0.y) * (mid.x - p0.x);
  assert.ok(Math.abs(cross) < 1e-6 * Math.hypot(goal.x - p0.x, goal.y - p0.y) ** 2 + 1e-6, 'line stays on the line');
  // The project setting picks the path for the timeline.
  const q = project('jump', { jumpPath: 'back' });
  assert.equal(buildTimeline(q).rounds[0].pres.steps[0].fx.path, 'back');
});

test('winning symbols: rounds can pick their own style; pop keeps the classic timing', () => {
  const p = project('pop');
  const tlPop = buildTimeline(p);
  assert.ok(tlPop.rounds.every((R) => R.pres.steps.every((st) => st.fx === null)));
  p.rounds[1].winStyle = 'merge';
  assert.equal(winStyleOf(p, p.rounds[1]), 'merge');
  assert.equal(winStyleOf(p, p.rounds[0]), 'pop');
  const tl = buildTimeline(p);
  assert.equal(tl.rounds[1].pres.steps[0].fx.style, 'merge');
  assert.equal(tl.rounds[0].pres.steps[0].fx, null);
  // The pop round keeps its timing.
  assert.equal(tl.rounds[0].pres.steps[0].end - tl.rounds[0].pres.steps[0].start, tlPop.rounds[0].pres.steps[0].end - tlPop.rounds[0].pres.steps[0].start);
});

test('winning symbols: After Effects flies the same paths and grows the merged symbol', () => {
  for (const [style, extra] of [['jump', {}], ['merge', {}], ['jump', { jumpPath: 'back' }], ['jump', { jumpPath: 'line' }], ['merge', { mergePath: 'arc', mergeSeq: 1 }], ['merge', { mergePath: 'back', mergeSeq: 0.5 }]]) {
    const p = project(style, extra);
    const tl = buildTimeline(p);
    const L = computeLayout(p);
    const data = buildAEData(p, tl, L, { titleKeys: [] });
    const { env, log } = createAE({ files: new Set() });
    runScript(buildAEScript([data]), env);
    const R = data.rounds[0];
    const st = R.steps[0];
    const comp = log.comps.find((c) => /^R01 /.test(c.name));
    const movers = comp.layers.list.filter((l) => l.name.startsWith(style === 'jump' ? 'Jump ' : 'Pull ')).reverse();
    assert.equal(movers.length, st.cells.length);
    const ev = (expr, time) => new Function('time', `return eval(${JSON.stringify(expr)})`)(time);
    movers.forEach((Ly, i) => {
      const q = st.fx.paths[i];
      const path = { style, kind: st.fx.kind, x0: q[0], y0: q[1], cx: q[2], cy: q[3], x1: q[4], y1: q[5] };
      for (const f of [0.2, 0.5, 0.8, 1.3]) {
        const t = st.fx.launch[i] + (st.fx.arrive[i] - st.fx.launch[i]) * f;
        const want = flightAt(path, st.fx.launch[i], st.fx.arrive[i], t, st.fx.until[i]);
        const tr = Ly.property('ADBE Transform Group');
        const xy = ev(tr.property('ADBE Position').expression, t - R.start);
        assert.ok(Math.hypot(xy[0] - want.x, xy[1] - want.y) < 0.05, `${style} #${i} position`);
        assert.ok(Math.abs(ev(tr.property('ADBE Scale').expression, t - R.start)[0] - want.s * 100) < 0.01);
        assert.ok(Math.abs(ev(tr.property('ADBE Opacity').expression, t - R.start) - want.a * 100) < 0.05);
      }
    });
    if (style === 'merge') assert.ok(comp.layers.list.some((l) => /^Merged /.test(l.name)), 'merged symbol');
    else assert.equal(comp.layers.list.filter((l) => l.name === 'Shockwave').length >= st.cells.length, true);
  }
});
