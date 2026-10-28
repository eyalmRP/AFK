// Pots above the machine: where they stand, boosters (the pots fire beams
// that upgrade cells) and beaming winners up into the pots; and that the
// After Effects rig plays the same thing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProject, candyProject, newRound, potsProject } from '../src/js/core/defaults.js';
import { buildTimeline, heldCells, BOOST } from '../src/js/core/timeline.js';
import { computeLayout } from '../src/js/core/layout.js';
import { evalKeys } from '../src/js/core/keys.js';
import { makeContext } from '../src/js/core/outcomes.js';
import { lineRuns, waysWins, anywhereWins, clusterWins } from '../src/js/core/grid.js';
import { potFor, potBump, potCharge, beamState, beamCurve, beamPoints, pointAlong, beamSide } from '../src/js/core/pots.js';
import { buildAEData, buildAEScript } from '../src/js/core/ae-export.js';
import { createAE, runScript } from './ae-mock.js';

const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

// What strip s shows in its window at time t (top row first).
function visible(tl, s, t, rows) {
  const P = Math.round(evalKeys(tl.stripKeys[s], t));
  const col = [];
  for (let k = 0; k < rows; k++) col[tl.dir > 0 ? rows - 1 - k : k] = tl.strips[s][P + k];
  return col;
}

function withPots(p, patch = {}) {
  p.pots.enabled = true;
  Object.assign(p.pots, patch);
  return p;
}

function exportAE(p) {
  const tl = buildTimeline(p);
  const L = computeLayout(p);
  const data = buildAEData(p, tl, L, { titleKeys: ['total'] });
  const files = new Set();
  for (const [k, v] of Object.entries(data.assets)) if (k === 'titles') Object.values(v).forEach((x) => files.add(`/pkg/${x}`));
  else if (v) files.add(`/pkg/${v}`);
  data.symbols.forEach((s) => files.add(`/pkg/${s.file}`));
  data.wheel.icons.forEach((i) => files.add(`/pkg/${i.file}`));
  data.particles.assets.forEach((a) => a.files.forEach((x) => files.add(`/pkg/${x}`)));
  (data.pots?.items || []).forEach((it) => files.add(`/pkg/${it.file}`));
  const { env, log } = createAE({ files });
  runScript(buildAEScript([data]), env);
  assert.deepEqual(log.alerts, [], log.alerts.join('\n'));
  return { tl, L, data, log };
}

const ev = (expr, t) => new Function('time', 'comp', 'thisComp', `return eval(${JSON.stringify(expr)})`)(t, () => ({ layer: () => ({ effect: () => () => ({ valueAtTime: () => 1 }) }) }), {});
const exprOf = (log, layer, prop) => log.expressions.find((e) => e.layer === layer && e.prop === prop)?.expr;

test('pots: off by default; on, they stand on the frame in a band above it and the machine scales down', () => {
  const p = defaultProject();
  const L0 = computeLayout(p);
  assert.equal(L0.pots, null);
  withPots(p);
  const L = computeLayout(p);
  assert.equal(L.pots.length, 3);
  assert.ok(L.cellW < L0.cellW, 'the machine is smaller');
  assert.ok(L.frame.y > L0.frame.y, 'and lower');
  assert.ok(L.pots[0].x < L.pots[1].x && L.pots[1].x < L.pots[2].x);
  assert.ok(near(L.pots[1].x, L.W / 2), 'centred');
  for (const pt of L.pots) {
    assert.ok(pt.top >= 0, 'inside the screen');
    assert.ok(pt.bottom > L.frame.y, 'its foot is behind the frame');
    assert.ok(pt.mouth.y < L.frame.y, 'its mouth shows above it');
  }
  assert.ok(L.ribbonY < Math.min(...L.pots.map((pt) => pt.top)), 'the free spins ribbon goes above them');
  // Bigger, closer, more room, fewer.
  const big = computeLayout(withPots(defaultProject(), { size: 1.4, spacing: 0.8 })).pots;
  assert.ok(big[0].size > L.pots[0].size);
  assert.ok(big[2].x - big[0].x < (L.pots[2].x - L.pots[0].x) * 1.4 * 0.95);
  assert.ok(computeLayout(withPots(defaultProject(), { band: 0.4 })).cellW < L.cellW);
  assert.equal(computeLayout(withPots(defaultProject(), { count: 2 })).pots.length, 2);
  // Only the slot game has pots.
  const hs = withPots(defaultProject());
  hs.game = 'holdspin';
  assert.equal(computeLayout(hs).pots, null);
});

test('which pot serves a reel: nearest by zone, in turns, or one pot', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((c) => potFor('nearest', 3, c, 5, 0)), [0, 0, 1, 2, 2]);
  assert.deepEqual([0, 1, 2].map((c) => potFor('nearest', 3, c, 3, 0)), [0, 1, 2]);
  assert.deepEqual([0, 1, 2, 3].map((i) => potFor('turns', 3, 4, 5, i)), [0, 1, 2, 0]);
  assert.equal(potFor('2', 2, 0, 5, 0), 1, 'a missing pot falls back to the last');
  assert.equal(potFor('nearest', 1, 4, 5, 0), 0);
});

test('boosters: cells land as low symbols and turn into a wild, the win symbol or a multiplier wild as each beam hits', () => {
  const p = withPots(defaultProject());
  p.rounds = [newRound('medium', { seed: 52, lines: [1], count: 4, boosts: [{ kind: 'wild' }, { kind: 'upgrade' }, { kind: 'mult', value: 3 }] })];
  const tl = buildTimeline(p);
  const R = tl.rounds[0];
  const B = R.pres.boost;
  const rows = p.grid.rows;
  assert.equal(B.items.length, 3);
  assert.deepEqual(B.items.map((it) => it.kind).sort(), ['mult', 'upgrade', 'wild']);
  const win = new Set(R.win.cells.map(([c, r]) => `${c},${r}`));
  const wild = p.symbols.findIndex((s) => s.role === 'wild');
  for (const [j, it] of B.items.entries()) {
    assert.ok(win.has(`${it.c},${it.r}`), 'on a cell of the win');
    assert.notEqual(it.from, it.to);
    assert.equal(R.grid[it.c][it.r], it.to, 'the win pays on the upgraded cell');
    if (it.kind !== 'upgrade') assert.equal(it.to, wild);
    else assert.equal(it.to, R.win.symbol);
    assert.equal(p.symbols[it.from].tier, 'low', 'it lands as a low symbol');
    assert.equal(visible(tl, it.c, R.spinEnd, rows)[it.r], it.from);
    assert.equal(visible(tl, it.c, it.hit + 0.05, rows)[it.r], it.to, 'the beam upgrades it');
    assert.ok(heldCells(tl, it.hit).some((h) => h.c === it.c && h.r === it.r), 'cut out of its reel while it upgrades');
    assert.ok(!heldCells(tl, it.hit + BOOST.pop + 0.01).some((h) => h.c === it.c && h.r === it.r));
    assert.ok(near(it.hit - it.fire, p.pots.beam.travel));
    assert.ok(it.fire >= B.chargeEnd - 1e-9);
    assert.equal(it.pot, potFor('nearest', 3, it.c, p.grid.reels, j));
  }
  // One after another, sweeping across the machine.
  for (let j = 1; j < B.items.length; j++) assert.ok(B.items[j].c >= B.items[j - 1].c && B.items[j].fire > B.items[j - 1].fire);
  const m = B.items.find((it) => it.kind === 'mult');
  assert.equal(R.mult[m.c][m.r], 3);
  assert.equal(R.win.multSum, 3, 'the multiplier wild multiplies the win');
  assert.ok(R.pres.mult, 'and flies in after it');
  assert.ok(R.pres.steps[0].start >= B.end - 1e-9, 'the win shows once the beams are done');
  // Beams down from the pots; each pot charges, then kicks as it fires.
  assert.deepEqual(R.pres.beams.map((b) => [b.up, b.pot, b.c, b.r]), B.items.map((it) => [false, it.pot, it.c, it.r]));
  assert.equal(tl.pots.hits.filter((h) => h[2] === 1).length, 3);
  for (const it of B.items) assert.ok(tl.pots.charges.some(([a, b, pot]) => pot === it.pot && a <= B.start + 1e-9 && b >= it.fire - 1e-9));
  assert.ok(tl.sfx.some((e) => e.type === 'potCharge') && tl.sfx.filter((e) => e.type === 'beam').length === 3 && tl.sfx.filter((e) => e.type === 'upgrade').length === 3);
});

test('boosters without a win upgrade free cells and nothing pays; boosted cash goes to the collector', () => {
  const p = withPots(defaultProject());
  p.rounds = [newRound('none', { seed: 8, boosts: [{ kind: 'upgrade' }, { kind: 'wild' }, { kind: 'cash', value: 10 }], cash: [5], collector: true })];
  const tl = buildTimeline(p);
  const R = tl.rounds[0];
  assert.equal(R.pres.boost.items.length, 3);
  assert.equal((R.pres.steps || []).length, 0);
  const ctx = makeContext(p, tl.paylines);
  assert.deepEqual(lineRuns(R.grid, ctx, (c, r) => ctx.wildSet.has(R.grid[c][r])), [], 'the upgrades do not make a win');
  assert.equal(R.win.collected, 15);
  assert.equal(R.win.amount, 15);
  assert.ok(R.pres.collector.start >= R.pres.boost.end - 1e-9, 'the collector comes after the beams');
  const cash = R.pres.boost.items.find((it) => it.kind === 'cash');
  assert.equal(cash.value, 10);
  assert.ok(R.pres.collector.items.some((it) => it.c === cash.c && it.r === cash.r && it.value === 10));
});

test('a spin that is not meant to win never pays, whatever wilds, boosters and mystery blocks it lands', () => {
  for (const mode of ['lines', 'ways', 'anywhere', 'cluster']) {
    for (let seed = 1; seed <= 25; seed++) {
      const p = withPots(defaultProject());
      p.machine.payMode = mode;
      p.rounds = [newRound('none', { seed, extraWilds: 3, mystery: 2, boosts: [{ kind: 'upgrade' }, { kind: 'wild' }, { kind: 'upgrade' }, { kind: 'mult', value: 2 }] })];
      const tl = buildTimeline(p);
      const ctx = makeContext(p, tl.paylines);
      const g = tl.rounds[0].grid;
      const wildAt = (c, r) => ctx.wildSet.has(g[c][r]);
      const wins = mode === 'lines' ? lineRuns(g, ctx, wildAt) : mode === 'ways' ? waysWins(g, ctx, wildAt) : mode === 'anywhere' ? anywhereWins(g, ctx, ctx.minAnywhere) : clusterWins(g, ctx, ctx.minCluster, wildAt);
      assert.deepEqual(wins, [], `${mode} seed ${seed}`);
      assert.equal(tl.rounds[0].pres.boost.items.length, 4, `${mode} seed ${seed}: every booster found a cell`);
    }
  }
});

test('boosters need the pots, and tumbles, cells and drops all upgrade', () => {
  const off = defaultProject();
  off.rounds = [newRound('medium', { seed: 52, lines: [1], count: 4, boosts: [{ kind: 'wild' }] })];
  assert.equal(buildTimeline(off).rounds[0].pres.boost, undefined);
  assert.deepEqual(buildTimeline(off).rounds[0].win.boosts, []);
  // A drop: the landing symbol is an actor that hands over to the new one.
  const candy = withPots(candyProject());
  candy.rounds = [newRound('small', { seed: 411, count: 8, chain: [{ symbol: 'auto', count: 8 }], boosts: [{ kind: 'mult', value: 5 }, { kind: 'upgrade' }] })];
  const tl = buildTimeline(candy);
  const R = tl.rounds[0];
  const items = R.pres.boost.items;
  assert.equal(items.length, 2);
  const bomb = items.find((it) => it.kind === 'mult');
  assert.equal(bomb.to, tl.lay.orbSym, 'in a tumble a multiplier lands as a bomb');
  assert.ok(R.win.multSum >= 5);
  for (const it of items) {
    const at = (t) => R.actors.filter((a) => a.c === it.c && t >= a.tIn && t < a.tOut && !a.old && Math.abs(evalKeys(a.keys, t) - it.r) < 0.01);
    assert.equal(at(it.hit - 0.05)[0]?.sym, it.from);
    assert.equal(at(it.hit + 0.05)[0]?.sym, it.to);
  }
});

test('beam to the pots: winners fire beams up to their pots; the meter and the nameplates count each catch in', () => {
  const p = withPots(defaultProject());
  p.winfx.style = 'collect';
  p.rounds = [newRound('medium', { seed: 52, lines: [1, 2], count: 4 }), newRound('none', { seed: 3 })];
  const tl = buildTimeline(p);
  const R = tl.rounds[0];
  const st = R.pres.steps[0];
  const f = st.fx;
  const n = st.cells.length;
  assert.equal(f.style, 'collect');
  assert.equal(R.pres.beams.length, n);
  R.pres.beams.forEach((b, j) => {
    assert.equal(b.up, true);
    assert.deepEqual([b.c, b.r], st.cells[j]);
    assert.equal(b.pot, potFor('nearest', 3, b.c, p.grid.reels, j));
    assert.ok(near(f.arrive[j] - f.launch[j], p.pots.beam.travel));
    if (j) assert.ok(near(f.launch[j] - f.launch[j - 1], p.pots.beam.stagger));
  });
  const done = f.arrive[n - 1] + 0.11;
  assert.ok(near(evalKeys(tl.meterKeys, done), st.amount, 1e-6), 'the meter has counted every catch');
  assert.ok(near(evalKeys(tl.meterKeys, f.arrive[0] - 0.01), 0, 1e-6));
  const plates = tl.pots.valueKeys.map((k) => evalKeys(k, done));
  assert.ok(near(plates.reduce((a, b) => a + b, 0), st.amount, 1e-6), 'the nameplates share the win');
  for (let pot = 0; pot < 3; pot++) {
    const mine = f.pots.filter((x) => x === pot).length;
    assert.ok(near(plates[pot], (st.amount * mine) / n, 1e-6));
    const show = tl.pots.show.filter((s) => s[2] === pot);
    if (mine) {
      assert.equal(show.length, 1);
      assert.ok(near(show[0][0], f.arrive[f.pots.indexOf(pot)]) && near(show[0][1], R.end));
    } else assert.equal(show.length, 0);
    assert.equal(evalKeys(tl.pots.valueKeys[pot], R.next + 0.01), 0, 'empty again for the next spin');
  }
  assert.equal(tl.pots.hits.filter((h) => h[2] === 0).length, n);
  assert.equal(tl.sfx.filter((e) => e.type === 'beam').length, n);
  // Without the pots the winners pop.
  p.pots.enabled = false;
  assert.equal(buildTimeline(p).rounds[0].pres.steps[0].fx, null);
});

test('beam timing and pot reactions', () => {
  const bm = { fire: 1, travel: 0.4 };
  assert.equal(beamState(bm, 0.99), null);
  assert.deepEqual(beamState(bm, 1), { head: 0, tail: 0, alpha: 1 });
  const mid = beamState(bm, 1.2);
  assert.ok(near(mid.head, 0.5) && mid.tail === 0);
  const full = beamState(bm, 1.4);
  assert.ok(near(full.head, 1) && full.tail > 0 && full.alpha === 1);
  assert.ok(beamState(bm, 1.85).alpha < 0.5);
  // An arc bows to the side it is told; an S-curve crosses over.
  const arc = beamCurve({ x: 0, y: 0 }, { x: 0, y: 100 }, { curve: 'arc', bend: 0.5 }, 1);
  assert.ok(arc[2] > 0 && arc[4] > 0);
  const s = beamCurve({ x: 0, y: 0 }, { x: 0, y: 100 }, { curve: 's', bend: 0.5 }, -1);
  assert.ok(s[2] < 0 && s[4] > 0);
  assert.equal(beamSide(100, 300, 0, 50), -1);
  // Points spread evenly along the beam.
  const pts = beamPoints(arc, 20);
  const d = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
  assert.ok(Math.max(...d) - Math.min(...d) < 0.05 * Math.max(...d));
  assert.deepEqual(pointAlong(pts, 0), pts[0]);
  // A catch squashes the pot; firing kicks it less; charging glows.
  const hits = [[2, 0, 0], [3, 0, 1]];
  assert.ok(near(potBump(hits, 0, 2).bump, 1) && potBump(hits, 0, 2.5).bump === 0);
  assert.ok(near(potBump(hits, 0, 3).bump, 0.55));
  assert.equal(potBump(hits, 1, 2).bump, 0);
  assert.equal(potCharge([[1, 2, 0]], 0, 1.5), 1);
  assert.equal(potCharge([[1, 2, 0]], 0, 2.6), 0);
});

test('After Effects: the pots, their beams, boosts and nameplates follow the preview', () => {
  const p = withPots(defaultProject());
  p.winfx.style = 'collect';
  p.grid.curvature = 0;
  p.rounds = [newRound('medium', { seed: 52, lines: [1], count: 4, boosts: [{ kind: 'wild' }, { kind: 'mult', value: 3 }] })];
  const { tl, L, data, log } = exportAE(p);
  const R = tl.rounds[0];
  const P0 = data.rounds[0].start;
  // Pots: art placeholders behind the frame, squashing and charging as in the preview.
  for (const [i, it] of data.pots.items.entries()) {
    assert.ok(log.comps.some((c) => c.name === `Pot ${i + 1} ${it.name}`), 'the pot art is a placeholder comp');
    const scale = exprOf(log, it.name, 'ADBE Scale');
    for (const t of [...tl.pots.hits.filter((h) => h[1] === i).map((h) => h[0] + 0.05), R.pres.boost.start + 0.3, 0.5]) {
      const { bump } = potBump(tl.pots.hits, i, t);
      const ch = potCharge(tl.pots.charges, i, t);
      const s = (100 * L.pots[i].size) / 512;
      const [sx, sy] = ev(scale, t);
      assert.ok(near(sx, s * (1 + 0.08 * bump + 0.02 * ch), 0.01) && near(sy, s * (1 - 0.08 * bump + 0.03 * ch), 0.01), `${it.name} at ${t}`);
    }
  }
  // What each pot caught rides on a SLOT CONTROL slider.
  const slider = log.keys.find((k) => k.prop === 'Pot 1-1');
  assert.ok(slider, 'Pot 1 slider');
  assert.ok(near(slider.keys[slider.keys.length - 1].v, tl.pots.valueKeys[0][tl.pots.valueKeys[0].length - 1].v));
  // Beams: Trim Paths and the head glow follow the preview's beam.
  assert.equal(data.rounds[0].beams.length, R.pres.beams.length);
  data.rounds[0].beams.forEach((bm, i) => {
    const src = R.pres.beams[i];
    const name = `${src.up ? 'Beam Up' : 'Beam Down'} ${i + 1} ${data.pots.items[src.pot].name}`;
    const cell = { x: L.reelX[src.c] + L.cellW / 2, y: L.rowsTop + (src.r + 0.5) * L.cellH };
    const pot = L.pots[src.pot].mouth;
    const out = beamSide(cell.x, L.pots[src.pot].x, src.c, L.cellW);
    const bez = src.up ? beamCurve(cell, pot, p.pots.beam, out) : beamCurve(pot, cell, p.pots.beam, out);
    bez.forEach((v, k) => assert.ok(near(v, bm.bez[k], 1e-3)));
    const start = exprOf(log, name, 'ADBE Vector Trim Start');
    const end = exprOf(log, name, 'ADBE Vector Trim End');
    const head = log.expressions.filter((e) => e.layer === `Beam Head ${i + 1}` && e.prop === 'ADBE Position').pop()?.expr;
    assert.ok(start && end && head, name);
    for (const t of [src.fire + 0.05, src.fire + src.travel * 0.5, src.fire + src.travel + 0.1]) {
      const s = beamState(src, t);
      assert.ok(near(ev(end, t - P0), s.head * 100, 0.01) && near(ev(start, t - P0), s.tail * 100, 0.01), `${name} trim at ${t}`);
      const [hx, hy] = ev(head, t - P0);
      const [px, py] = pointAlong(beamPoints(bez, 24), s.head);
      assert.ok(near(hx, px, 0.5) && near(hy, py, 0.5), `${name} head at ${t}`);
    }
  });
  // Boosted cells: the reel is cut out, the old symbol trembles until the hit, the new one pops.
  for (const it of R.pres.boost.items) {
    assert.ok(data.reveals.some((v) => v.c === it.c && v.r === it.r && near(v.cover, it.hit - BOOST.lead) && near(v.to, it.hit + BOOST.pop)));
  }
  const froms = log.comps.flatMap((c) => c.layers.list).filter((l) => /^Boost From /.test(l.name));
  assert.equal(froms.length, 2);
  // Winners beam up: each darkens as it fires.
  assert.equal(log.comps.flatMap((c) => c.layers.list).filter((l) => /^Drained /.test(l.name)).length, R.pres.steps[0].cells.length);
});

test('the Pots and beams preset uses both features', () => {
  const p = potsProject();
  const tl = buildTimeline(p);
  assert.equal(computeLayout(p).pots.length, 3);
  assert.ok(tl.rounds.some((R) => R.pres.boost && R.pres.steps?.length), 'boosters that make a win');
  assert.ok(tl.rounds.some((R) => R.pres.steps?.[0]?.fx?.style === 'collect'), 'winners beam into the pots');
});
