import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProject, candyProject, cellsProject, newRound } from '../src/js/core/defaults.js';
import { buildTimeline } from '../src/js/core/timeline.js';
import { evalKeys, key } from '../src/js/core/keys.js';
import { generatePaylines } from '../src/js/core/paylines.js';
import { makeContext } from '../src/js/core/outcomes.js';
import { lineRuns, anywhereWins, clusterWins, waysWins } from '../src/js/core/grid.js';
import { orderList, cellOrderList } from '../src/js/core/order.js';

function visibleColumn(tl, s, t, rows) {
  const P = Math.round(evalKeys(tl.stripKeys[s], t));
  const col = [];
  for (let k = 0; k < rows; k++) col[tl.dir > 0 ? rows - 1 - k : k] = tl.strips[s][P + k];
  return col;
}

function ctxFor(p) {
  return makeContext(p, generatePaylines(p.grid.reels, p.grid.rows, p.machine.maxLines));
}

function winsIn(grid, p, ctx) {
  const wildAt = (c, r) => ctx.wildSet.has(grid[c][r]);
  if (p.machine.payMode === 'lines') return lineRuns(grid, ctx, wildAt);
  if (p.machine.payMode === 'ways') return waysWins(grid, ctx, wildAt);
  if (p.machine.payMode === 'anywhere') return anywhereWins(grid, ctx, ctx.minAnywhere);
  return clusterWins(grid, ctx, ctx.minCluster, wildAt);
}

test('keys: linear segments with matching speed are linear', () => {
  const ks = [key(0, 0, { outSpeed: 10 }), key(2, 20, { inSpeed: 10 })];
  for (const t of [0.25, 0.5, 1, 1.5]) assert.ok(Math.abs(evalKeys(ks, t) - 10 * t) < 1e-6);
});

test('keys: hold keeps the value until the next key', () => {
  const ks = [key(0, 5, { hold: true }), key(1, 9)];
  assert.equal(evalKeys(ks, 0.99), 5);
  assert.equal(evalKeys(ks, 1), 9);
});

test('paylines: unique, in range, middle line first', () => {
  for (const [reels, rows] of [[5, 3], [3, 3], [6, 4], [5, 1], [7, 5]]) {
    const lines = generatePaylines(reels, rows, 25);
    assert.equal(new Set(lines.map((l) => l.join())).size, lines.length);
    for (const l of lines) assert.ok(l.length === reels && l.every((r) => r >= 0 && r < rows));
    assert.ok(lines[0].every((r) => r === Math.floor((rows - 1) / 2)));
  }
});

test('orders: presets are permutations and custom orders are honoured', () => {
  const rng = () => 0.42;
  for (const k of ['ltr', 'rtl', 'center', 'edges', 'random']) assert.deepEqual([...orderList(k, 5, [], rng)].sort(), [0, 1, 2, 3, 4]);
  assert.deepEqual(orderList('rtl', 4), [3, 2, 1, 0]);
  assert.deepEqual(orderList('center', 5), [2, 1, 3, 0, 4]);
  assert.deepEqual(orderList('custom', 5, [3, 0, 3, 9]), [3, 0, 1, 2, 4]);
  for (const k of ['columns', 'rows', 'spiral', 'center', 'random']) assert.equal(new Set(cellOrderList(k, 6, 5, [0, 1, 2, 3, 4, 5], rng).map(([c, r]) => c * 5 + r)).size, 30);
});

test('reels land exactly on every round grid, for every style, direction and stop order', () => {
  const p = defaultProject();
  for (const endStyle of ['bounce', 'elastic', 'hard', 'soft']) {
    for (const startStyle of ['windup', 'ease', 'instant']) {
      for (const [direction, stopOrder] of [['down', 'ltr'], ['up', 'rtl'], ['down', 'center'], ['down', 'random']]) {
        p.spin = { ...p.spin, endStyle, startStyle, direction, stopOrder };
        const tl = buildTimeline(p);
        for (const R of tl.rounds) {
          for (let c = 0; c < tl.reels; c++) {
            const P = evalKeys(tl.stripKeys[c], R.spinEnd + 0.01);
            assert.ok(Math.abs(P - Math.round(P)) < 1e-6);
            assert.deepEqual(visibleColumn(tl, c, R.spinEnd + 0.01, tl.rows), R.grid[c]);
          }
        }
      }
    }
  }
});

test('stop order decides which reel stops last and which one teases', () => {
  const p = defaultProject();
  p.spin.type = 'tease';
  p.spin.stopOrder = 'custom';
  p.spin.customStop = [4, 3, 0, 1, 2];
  p.rounds = [newRound('none', { seed: 3 })];
  const R = buildTimeline(p).rounds[0];
  const stops = R.reels.map((r) => r.stop);
  assert.equal(stops.indexOf(Math.max(...stops)), 2);
  assert.ok(R.reels[2].antic);
  assert.ok(R.reels.filter((r) => r.antic).length === 1);
});

test('per-cell spins land every cell on its grid symbol', () => {
  const p = cellsProject();
  for (const cellOrder of ['columns', 'rows', 'spiral', 'random']) {
    p.spin.cellOrder = cellOrder;
    const tl = buildTimeline(p);
    for (const R of tl.rounds) {
      for (let c = 0; c < tl.reels; c++)
        for (let r = 0; r < tl.rows; r++) {
          const s = c * tl.rows + r;
          assert.equal(visibleColumn(tl, s, R.spinEnd + 0.01, 1)[0], R.grid[c][r]);
        }
    }
  }
});

test('no-win rounds pay nothing in every pay mode', () => {
  for (const payMode of ['lines', 'ways', 'anywhere', 'cluster']) {
    const p = payMode === 'anywhere' || payMode === 'cluster' ? candyProject() : defaultProject();
    p.machine.payMode = payMode;
    p.rounds = Array.from({ length: 25 }, (_, i) => newRound('none', { seed: i * 13 + 1 }));
    const tl = buildTimeline(p);
    const ctx = ctxFor(p);
    for (const R of tl.rounds) assert.equal(winsIn(R.grid, p, ctx).length, 0, `${payMode} round ${R.index}`);
  }
});

test('line wins show every winning line', () => {
  const p = defaultProject();
  p.rounds = Array.from({ length: 20 }, (_, i) => newRound(i % 2 ? 'small' : 'medium', { seed: i * 7 + 1, lines: [i % 5] }));
  const tl = buildTimeline(p);
  const ctx = ctxFor(p);
  for (const R of tl.rounds) {
    const shown = new Set(R.pres.steps[0].lines.map((l) => l.index));
    for (const run of lineRuns(R.grid, ctx, (c, r) => ctx.wildSet.has(R.grid[c][r]))) assert.ok(shown.has(run.index), `round ${R.index} line ${run.index}`);
  }
});

test('tumble chains: each step pays only its symbol and the final refill pays nothing', () => {
  const p = candyProject();
  p.rounds = Array.from({ length: 16 }, (_, i) =>
    newRound(i % 3 ? 'medium' : 'big', { seed: i * 31 + 5, count: 8 + (i % 4), chain: [{ symbol: 'auto', count: 8 }, { symbol: 'auto', count: 9 + (i % 3) }], multipliers: i % 2 ? [2, 5] : [] })
  );
  const tl = buildTimeline(p);
  const ctx = ctxFor(p);
  for (const R of tl.rounds) {
    const steps = R.pres.steps;
    assert.ok(steps.length >= 1, `round ${R.index} has a win`);
    for (const s of steps) assert.ok(s.count >= ctx.minAnywhere, `round ${R.index} step ${s.index} pays ${s.count}`);
    const final = anywhereWins(R.finalGrid, ctx, ctx.minAnywhere);
    assert.equal(final.length, 0, `round ${R.index} final grid still pays`);
    if (R.pres.mult) assert.ok(Math.abs(R.pres.mult.base * R.pres.mult.sum - R.win.amount) < 1e-6);
  }
});

test('tumble actors end on the final grid', () => {
  const tl = buildTimeline(candyProject());
  for (const R of tl.rounds) {
    if (R.noSpin) continue;
    const t = R.next - 0.05;
    const seen = {};
    for (const a of R.actors) {
      if (t < a.tIn || t >= a.tOut) continue;
      const row = Math.round(evalKeys(a.keys, t));
      if (row < 0 || row >= tl.rows) continue;
      seen[`${a.c},${row}`] = a.sym;
    }
    for (let c = 0; c < tl.reels; c++) for (let r = 0; r < tl.rows; r++) assert.equal(seen[`${c},${r}`], R.finalGrid[c][r], `round ${R.index} cell ${c},${r}`);
  }
});

test('reels jump to the post-tumble grid before the next spin', () => {
  const p = candyProject();
  p.spin.type = 'classic';
  const tl = buildTimeline(p);
  for (const R of tl.rounds) {
    if (R.actorsFrom == null) continue;
    for (let c = 0; c < tl.reels; c++) assert.deepEqual(visibleColumn(tl, c, R.next - 0.001, tl.rows), R.finalGrid[c]);
  }
});

test('free spins: counter, running total and the total round agree', () => {
  const tl = buildTimeline(candyProject());
  const free = tl.rounds.filter((r) => r.free);
  assert.deepEqual(free.map((r) => r.fs.index), free.map((_, i) => i + 1));
  const sum = free.reduce((a, r) => a + r.win.amount, 0);
  const total = tl.rounds.find((r) => r.outcome === 'fstotal');
  assert.ok(Math.abs(total.win.amount - sum) < 1e-6);
  assert.equal(tl.fsBlocks.length, 1);
  assert.ok(Math.abs(evalKeys(tl.fsTotalKeys, total.t0) - sum) < 1e-6);
});

test('sticky wilds stay wild for the rest of the free spins', () => {
  const p = defaultProject();
  p.rounds = [newRound('freespins', { seed: 1, sticky: true }), newRound('none', { seed: 2, free: true, extraWilds: 1 }), newRound('none', { seed: 3, free: true }), newRound('none', { seed: 4, free: true })];
  const tl = buildTimeline(p);
  assert.ok(tl.stickies.length >= 1);
  const s = tl.stickies[0];
  const wild = p.symbols.findIndex((x) => x.role === 'wild');
  for (const R of tl.rounds.slice(2)) assert.equal(R.grid[s.c][s.r], wild);
});

test('expanding wilds turn their reel wild', () => {
  const tl = buildTimeline(cellsProject());
  const R = tl.rounds.find((r) => r.win.expand.length);
  assert.ok(R);
  assert.ok(R.pres.expand && R.pres.expand.reels.length);
});

test('big wins count through the tiers they cross', () => {
  const p = defaultProject();
  p.rounds = [newRound('big', { seed: 5, amount: 90 })];
  const R = buildTimeline(p).rounds[0];
  assert.deepEqual(R.pres.overlay.tiers, ['tier1', 'tier2', 'tier3']);
  const ts = R.pres.overlay.tierTimes;
  assert.ok(ts[0] < ts[1] && ts[1] < ts[2]);
});

test('wheel lands on the chosen segment', () => {
  const p = defaultProject();
  for (const seg of [0, 3, 7, 11]) {
    p.rounds = [newRound('wheel', { seed: 9, wheelSegment: seg })];
    const tl = buildTimeline(p);
    const w = tl.rounds[0].pres.wheel;
    const theta = evalKeys(tl.wheelKeys, w.spinEnd + 0.01);
    const local = ((-theta % 360) + 360) % 360;
    assert.equal(Math.floor(local / (360 / p.wheel.segments.length)), seg);
  }
});

test('timeline is deterministic and emits sound cues in time order', () => {
  const a = buildTimeline(candyProject());
  const b = buildTimeline(candyProject());
  assert.deepEqual(a.rounds.map((r) => r.finalGrid), b.rounds.map((r) => r.finalGrid));
  for (let i = 1; i < a.sfx.length; i++) assert.ok(a.sfx[i].t >= a.sfx[i - 1].t);
  assert.ok(a.sfx.some((s) => s.type === 'pop') && a.sfx.some((s) => s.type === 'mult'));
});
