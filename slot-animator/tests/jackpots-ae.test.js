// Jackpot boxes in the After Effects export: the script is run in the mock
// and its layers and expressions are checked against the preview's
// (core/jackpots.js jackpotValue, jackpotFx; the round's flight to the meter).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProject, jackpotsProject, slotHoldSpinProject } from '../src/js/core/defaults.js';
import { buildTimeline } from '../src/js/core/timeline.js';
import { computeLayout } from '../src/js/core/layout.js';
import { evalKeys } from '../src/js/core/keys.js';
import { buildAEData, buildAEScript, aeAssetFiles } from '../src/js/core/ae-export.js';
import { jackpotsConfig, jackpotValue, jackpotFx, JP_HOLD } from '../src/js/core/jackpots.js';
import { createAE, runScript } from './ae-mock.js';

const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

function exportAE(p) {
  const tl = buildTimeline(p);
  const L = computeLayout(p);
  const data = buildAEData(p, tl, L, { titleKeys: ['total', 'holdspin', 'grand', ...p.tiers.map((t) => t.id)], hasLogo: true });
  const files = [...aeAssetFiles(data)];
  const { env, log } = createAE({ files: new Set(files.map((f) => `/pkg/${f}`)) });
  runScript(buildAEScript([data]), env);
  assert.deepEqual(log.alerts, [], log.alerts.join('\n'));
  return { tl, L, data, log, files };
}

// The value a slider expression gives at time t, and a text expression
// reading SLOT CONTROL sliders by their expressions.
const evalAt = (expr, t, effect = () => () => ({ value: 0 })) => new Function('time', 'comp', 'thisComp', 'thisLayer', 'value', `return eval(${JSON.stringify(expr)})`)(t, () => ({ layer: () => ({ effect }) }), {}, { width: 100, height: 40 }, [0, 0]);
const sliderExpr = (log, name) => log.expressions.find((e) => e.layer === 'SLOT CONTROL' && e.prop.startsWith(name))?.expr;
const exprOf = (log, layer, prop) => log.expressions.filter((e) => e.layer === layer && e.prop === prop).pop()?.expr;
const money = (v, cur = '$', d = 2) => {
  const [i, f] = Math.max(0, v).toFixed(d).split('.');
  return cur + i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d > 0 ? `.${f}` : '');
};

test('After Effects: every box is a placeholder comp placed where the preview draws it, with its glow, light and value', () => {
  const p = jackpotsProject();
  const { L, data, log, files } = exportAE(p);
  const main = log.comps.find((c) => c.name === data.name);
  assert.equal(data.jackpots.items.length, 4);
  data.jackpots.items.forEach((it, i) => {
    const b = L.jackpots[i];
    assert.equal(it.name, ['Jackpot Grand', 'Jackpot Major', 'Jackpot Minor', 'Jackpot Mini'][i]);
    assert.ok(log.comps.some((c) => c.name === it.name), 'placeholder comp');
    assert.ok(files.includes(it.file), 'its plate ships');
    assert.ok(log.imports.includes(`/pkg/${it.file}`), 'and is imported');
    for (const name of [it.name, `${it.name} Glow`, `${it.name} Light`, `${it.name} Value`]) {
      const layer = main.layers.list.find((l) => l.name === name);
      assert.ok(layer, name);
      if (name === `${it.name} Value`) continue;
      const xy = layer.property('ADBE Transform Group').property('ADBE Position').value;
      assert.ok(near(xy[0], b.x, 0.01) && near(xy[1], b.y, 0.01), `${name} at the box`);
    }
  });
  // A shockwave at the box for every win, starting as it is won.
  for (const it of data.jackpots.items) {
    const at = main.layers.list.filter((l) => {
      if (l.name !== 'Shockwave') return false;
      const xy = l.property('ADBE Transform Group').property('ADBE Position').value;
      return near(xy[0], it.x, 0.01) && near(xy[1], it.y, 0.01);
    });
    assert.deepEqual(at.map((l) => l.startTime).sort((a, b) => a - b), it.hits.map((h) => h[0]), it.name);
  }
});

test('After Effects: the value follows jackpotValue (running, held after a win, then from the seed), formatted like the box', () => {
  const p = jackpotsProject();
  const { tl, data, log } = exportAE(p);
  const cfg = jackpotsConfig(p);
  const values = {};
  for (const it of data.jackpots.items) values[it.name] = sliderExpr(log, it.name);
  const effect = (name) => () => ({ value: evalAt(values[name], effect.t) });
  for (const [i, it] of data.jackpots.items.entries()) {
    const id = cfg.tiers[i].id;
    const ve = values[it.name];
    assert.ok(ve, `${it.name} slider`);
    const times = [0, 3.3, 20.1];
    for (const h of it.hits) times.push(h[0] - 0.4, h[0] + 0.05, h[0] + JP_HOLD * 0.5, h[0] + JP_HOLD + 0.07, h[0] + 5);
    const textE = exprOf(log, `${it.name} Value`, 'ADBE Text Document');
    for (const t of times) {
      const want = jackpotValue(cfg, tl.jackpots.hits, id, t);
      assert.ok(near(evalAt(ve, t), want, 1e-3), `${it.name} at ${t}: ${evalAt(ve, t)} vs ${want}`);
      effect.t = t;
      assert.equal(evalAt(textE, t, (n) => effect(n)), money(want), `${it.name} text at ${t}`);
    }
  }
  // A running box climbed, paid, held, then started again from its seed.
  const minor = data.jackpots.items[2];
  assert.ok(minor.hits.length === 1);
  const [ht, amount] = minor.hits[0];
  assert.ok(amount > cfg.tiers[2].base);
  assert.equal(evalAt(sliderExpr(log, minor.name), ht + 0.5), amount);
  assert.ok(near(evalAt(sliderExpr(log, minor.name), ht + JP_HOLD + 0.001), cfg.tiers[2].base, 0.01));
});

test('After Effects: fixed boxes never change and pay their seed', () => {
  const p = jackpotsProject();
  p.jackpots.running = false;
  const { tl, data, log } = exportAE(p);
  for (const it of data.jackpots.items) {
    const ve = sliderExpr(log, it.name);
    for (const t of [0, 8, 31, 40]) assert.equal(evalAt(ve, t), it.base, `${it.name} at ${t}`);
    for (const [, amount] of it.hits) assert.equal(amount, it.base);
  }
  assert.ok(tl.jackpots.hits.length >= 3);
});

test('After Effects: the pop, glow and light follow jackpotFx; the value pulses while the box holds a win', () => {
  const p = jackpotsProject();
  const { tl, data, log } = exportAE(p);
  const cfg = jackpotsConfig(p);
  for (const [i, it] of data.jackpots.items.entries()) {
    const id = cfg.tiers[i].id;
    const scale = exprOf(log, it.name, 'ADBE Scale');
    const glow = exprOf(log, `${it.name} Glow`, 'ADBE Opacity');
    const pulse = exprOf(log, `${it.name} Value`, 'ADBE Opacity');
    const times = [1, 15];
    for (const h of it.hits) times.push(h[0] + 0.07, h[0] + 0.4, h[0] + 1.3, h[0] + 2.2);
    for (const b of it.blinks) times.push(b + 0.13, b + 0.3);
    for (const t of times) {
      const fx = jackpotFx(tl.jackpots, id, t);
      const [sx, sy] = evalAt(scale, t);
      assert.ok(near(sx, 100 * fx.scale, 0.05) && near(sy, 100 * fx.scale, 0.05), `${it.name} scale at ${t}: ${sx} vs ${100 * fx.scale}`);
      assert.ok(near(evalAt(glow, t), 100 * Math.min(1, fx.glow), 0.05), `${it.name} glow at ${t}`);
      const o = evalAt(pulse, t);
      if (fx.held) assert.ok(o >= 50 && o <= 100);
      else assert.equal(o, 100);
    }
  }
  // A blink lights the box up as its coin lands.
  const major = data.jackpots.items[1];
  assert.ok(major.blinks.length, 'the Major coin landed');
  assert.ok(evalAt(exprOf(log, major.name, 'ADBE Scale'), major.blinks[0] + 0.3)[0] > 104);
});

test('After Effects: a round\'s jackpot flies from its box to the win meter, which counts it in', () => {
  const p = jackpotsProject();
  const { tl, L, data, log } = exportAE(p);
  const R = tl.rounds.find((r) => r.pres.jackpot);
  const RD = data.rounds[R.index];
  const j = RD.jackpot;
  assert.ok(j, 'round data');
  const it = data.jackpots.items[j.box];
  const comp = log.comps.find((c) => c.layers?.list.some((l) => l.name === `${it.name} Win`));
  assert.ok(comp, 'the flying amount is in the round comp');
  const fly = comp.layers.list.find((l) => l.name === `${it.name} Win`);
  const pe = fly.property('ADBE Transform Group').property('ADBE Position').expression;
  const rel = (t) => t - RD.start;
  const [x0, y0] = evalAt(pe, rel(j.fly[0]));
  const [x1, y1] = evalAt(pe, rel(j.fly[1]));
  const box = L.jackpots[j.box];
  assert.ok(near(x0, box.x, 0.01) && near(y0 - j.size * 0.36, box.y, 0.01), 'starts at the box');
  assert.ok(near(x1, L.hud.x + L.hud.w / 2, 0.01) && near(y1 - j.size * 0.36, L.hud.y + L.hud.h / 2, 0.01), 'lands on the meter');
  const [xm, ym] = evalAt(pe, rel((j.fly[0] + j.fly[1]) / 2));
  assert.ok(ym < (y0 + y1) / 2, 'arcs up');
  assert.ok(xm > Math.min(x0, x1) - 1 && xm < Math.max(x0, x1) + 1);
  // The meter (SLOT CONTROL "Meter") counts the amount in.
  const meter = log.keys.find((k) => k.layer === 'SLOT CONTROL' && k.prop.startsWith('Meter'));
  const pj = R.pres.jackpot;
  assert.ok(meter.keys.some((k) => near(k.t, pj.countEnd, 1e-3) && near(k.v, evalKeys(tl.meterKeys, pj.countEnd), 0.01)));
  assert.ok(near(evalKeys(tl.meterKeys, pj.countEnd) - evalKeys(tl.meterKeys, pj.countStart), pj.amount, 0.01));
});

test('After Effects: boxes split on both sides, running, through every format; no boxes when they are off', () => {
  const p = jackpotsProject();
  Object.assign(p.jackpots, { place: 'sides', running: true });
  for (const [w, h] of [[1920, 1080], [1080, 1920], [1080, 1080]]) {
    const q = { ...p, canvas: { ...p.canvas, width: w, height: h } };
    const { L, data } = exportAE(q);
    data.jackpots.items.forEach((it, i) => assert.ok(near(it.x, L.jackpots[i].x, 0.01) && near(it.y, L.jackpots[i].y, 0.01)));
  }
  const off = slotHoldSpinProject();
  const { data, log } = exportAE(off);
  assert.equal(data.jackpots, null);
  assert.ok(!log.comps.some((c) => /^Jackpot /.test(c.name)));
  assert.ok(![...aeAssetFiles(data)].some((f) => /jackpot_/.test(f)));
  // The wheel game never has boxes.
  const wq = defaultProject();
  wq.jackpots.enabled = true;
  wq.game = 'wheel';
  assert.equal(buildAEData(wq, buildTimeline(wq), computeLayout(wq), {}).jackpots, null);
});
