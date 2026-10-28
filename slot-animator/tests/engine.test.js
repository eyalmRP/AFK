import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProject, candyProject, cellsProject, newRound, PRESETS } from '../src/js/core/defaults.js';
import { buildTimeline, holdAlpha } from '../src/js/core/timeline.js';
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

test('a line win drawn through a sticky wild keeps the wild', () => {
  const p = defaultProject();
  const wild = p.symbols.findIndex((x) => x.role === 'wild');
  p.rounds = [newRound('freespins', { seed: 1, sticky: true }), newRound('none', { seed: 2, free: true, extraWilds: 1 })];
  const held = buildTimeline(p).stickies[0];
  // A payline through the sticky wild, then wins drawn along it.
  const line = generatePaylines(p.grid.reels, p.grid.rows, p.machine.maxLines).findIndex((l) => l[held.c] === held.r);
  p.rounds.push(newRound('medium', { seed: 3, free: true, lines: [line], count: 5 }), newRound('big', { seed: 4, free: true, lines: [line], count: 5, tier: 0 }));
  const tl = buildTimeline(p);
  for (const R of tl.rounds.slice(2)) {
    assert.equal(R.grid[held.c][held.r], wild, `round ${R.index}: the sticky wild is still there`);
    assert.ok(R.win.lines.some((l) => l.index === line && l.cells.some(([c, r]) => c === held.c && r === held.r)), 'and the line pays through it');
  }
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

// ---- Hold & Spin and the wheel game ----

function holdShows(tl, t) {
  const out = [];
  for (let k = 0; k < tl.reels * tl.rows; k++) {
    const P = Math.round(evalKeys(tl.hold.keys[k], t));
    out.push({ sym: tl.hold.strips[k][P], value: tl.hold.values[k].get(P) });
  }
  return out;
}

function holdGame(rounds, extra = {}) {
  const p = defaultProject();
  p.game = 'holdspin';
  Object.assign(p.holdspin, extra);
  p.rounds = rounds;
  return p;
}

test('hold & spin: coins lock, empty cells respin, the counter resets on a hit', () => {
  const p = holdGame([newRound('respin', { seed: 1, coinsIn: 2 }), newRound('respin', { seed: 2, coinsIn: 0 }), newRound('respin', { seed: 3, coinsIn: 1, specials: ['mega'] }), newRound('respin', { seed: 4, coinsIn: 0 })], { startCoins: 3 });
  const tl = buildTimeline(p);
  const { lay } = tl;
  for (const R of tl.rounds) {
    const t = R.spinEnd + 0.01;
    const shown = holdShows(tl, t);
    shown.forEach(({ sym, value }, k) => {
      const lock = tl.hold.locks.find((l) => l.c * tl.rows + l.r === k && l.from <= t && l.to > t);
      assert.equal(sym, lock ? lock.sym : lay.blankSym, `round ${R.index} cell ${k}`);
      if (lock) assert.equal(value, lock.value);
    });
    // Locked cells never spin again.
    for (const ci of R.pres.holdspin.cells) assert.ok(!tl.hold.locks.some((l) => l.c === ci.c && l.r === ci.r && l.from < R.t0));
  }
  assert.deepEqual(tl.rounds.map((R) => [R.pres.holdspin.before, R.pres.holdspin.after]), [[3, 3], [3, 2], [2, 3], [3, 2]]);
  assert.equal(tl.rounds.map((R) => R.pres.holdspin.coins).join(), '5,5,6,6');
  assert.ok(tl.hold.locks.some((l) => l.special && l.sym === lay.coinBase + 1));
  assert.equal(holdAlpha(tl, 0.1), 1);
});

test('hold & spin: filling the board adds the grand, collect totals every coin', () => {
  const p = holdGame([newRound('respin', { seed: 1, coinsIn: 4 }), newRound('respin', { seed: 2, fill: true }), newRound('collect', { seed: 3 })]);
  const tl = buildTimeline(p);
  const [, fill, collect] = tl.rounds;
  assert.ok(fill.pres.holdspin.full);
  assert.equal(fill.pres.holdspin.coins, tl.reels * tl.rows);
  const coins = tl.hold.locks.reduce((a, l) => a + l.value, 0);
  const grand = p.holdspin.grand.value * p.machine.bet;
  assert.equal(collect.pres.collect.items.length, tl.reels * tl.rows);
  assert.ok(Math.abs(collect.pres.collect.total - coins - grand) < 1e-9);
  assert.ok(Math.abs(evalKeys(tl.hold.collectKeys, collect.pres.collect.end) - collect.pres.collect.total) < 1e-6);
  assert.ok(collect.pres.grand && collect.pres.overlay);
  // The board fades back out after the total.
  assert.equal(holdAlpha(tl, collect.next + 0.05), 0);
});

test('hold & spin trigger lands coins on the machine and carries them onto the board', () => {
  for (const type of ['classic', 'cells', 'cascade']) {
    const p = defaultProject();
    p.spin.type = type;
    p.rounds = [newRound('hstrigger', { seed: 4, coinsIn: 6, specials: ['ultra'] }), newRound('respin', { seed: 5, coinsIn: 0 }), newRound('collect', { seed: 6 }), newRound('none', { seed: 7 })];
    const tl = buildTimeline(p);
    const [trig, respin, collect, after] = tl.rounds;
    assert.equal(trig.win.coins.length, 6);
    for (const cn of trig.win.coins) assert.equal(trig.grid[cn.c][cn.r], cn.sym);
    assert.equal(holdAlpha(tl, trig.spinEnd), 0);
    const shown = holdShows(tl, respin.spinEnd + 0.01);
    for (const cn of trig.win.coins) assert.deepEqual(shown[cn.c * tl.rows + cn.r], { sym: cn.sym, value: cn.value }, type);
    assert.equal(collect.pres.collect.total, trig.win.coins.reduce((a, c) => a + c.value, 0));
    assert.equal(holdAlpha(tl, after.t0 + 0.2), 0, type);
  }
});

test('wheel game keeps the wheel on screen and lands every spin', () => {
  const p = defaultProject();
  p.game = 'wheel';
  p.rounds = [newRound('wheel', { seed: 1, wheelSegment: 2 }), newRound('none', { seed: 2, wheelSegment: 5 }), newRound('wheel', { seed: 3, wheelSegment: 9 })];
  const tl = buildTimeline(p);
  assert.deepEqual(tl.rounds.map((R) => R.outcome), ['wheel', 'wheel', 'wheel']);
  tl.rounds.forEach((R, i) => {
    const w = R.pres.wheel;
    assert.equal(R.spinEnd, R.t0, 'the machine never spins');
    assert.equal(w.cont, i > 0);
    if (i < 2) assert.ok(w.outStart > R.next, 'stays on screen');
    const theta = evalKeys(tl.wheelKeys, w.spinEnd + 0.01);
    const local = ((-theta % 360) + 360) % 360;
    assert.equal(Math.floor(local / (360 / p.wheel.segments.length)), [2, 5, 9][i]);
  });
});

test('landing build-up: each reel that brings a winner lands with a bigger bump and a climbing cue', async () => {
  const { LAND_SHAKE } = await import('../src/js/core/timeline.js');
  const p = defaultProject();
  p.rounds = [newRound('big', { seed: 3, lines: [0], count: 5, tier: 0 }), newRound('nearmiss', { seed: 4 }), newRound('none', { seed: 5 })];
  assert.equal(buildTimeline(p).sfx.filter((e) => e.type === 'winLand').length, 0, 'off by default');
  p.effects.landShake = true;
  const tl = buildTimeline(p);
  const R = tl.rounds[0];
  const cols = [...new Set(R.win.cells.map(([c]) => c))];
  const lands = tl.sfx.filter((e) => e.type === 'winLand');
  assert.equal(lands.length, cols.length, 'one per winning reel, none for the near miss or the blank spin');
  assert.deepEqual(lands.map((e) => e.t), cols.map((c) => R.reels[c].stop).sort((a, b) => a - b));
  assert.deepEqual(lands.map((e) => e.step), cols.map((_, k) => k));
  const amps = lands.map((e) => tl.shakes.find((s) => s.t === e.t).amp);
  for (let k = 1; k < amps.length; k++) assert.ok(amps[k] > amps[k - 1], 'grows');
  assert.ok(Math.abs(amps[0] - LAND_SHAKE[0]) < 1e-9 && Math.abs(amps[amps.length - 1] - LAND_SHAKE[1]) < 1e-9);
  // Per-cell spins bump on every winning cell.
  const q = cellsProject();
  q.effects.landShake = true;
  q.rounds = [newRound('medium', { seed: 52, lines: [3], count: 4 })];
  const tq = buildTimeline(q);
  assert.equal(tq.sfx.filter((e) => e.type === 'winLand').length, tq.rounds[0].win.cells.length);
});

test('tumble spins: a column held back by a tease keeps its old symbols until just before the new drop', () => {
  const p = candyProject();
  p.rounds = [newRound('nearmiss', { seed: 33 }), newRound('none', { seed: 1, antic: [2, 4] })];
  const tl = buildTimeline(p);
  for (const R of tl.rounds) {
    for (let c = 0; c < tl.reels; c++) {
      const old = R.actors.filter((a) => a.c === c && a.old);
      const neu = R.actors.filter((a) => a.c === c && !a.old);
      if (!old.length || !neu.length) continue;
      const gone = Math.max(...old.map((a) => a.tOut));
      const arrive = Math.min(...neu.map((a) => a.tIn));
      assert.ok(arrive - gone < 0.6, `round ${R.index} column ${c}: empty for ${(arrive - gone).toFixed(2)} s`);
    }
  }
  assert.ok(tl.rounds.some((R) => R.reels.some((ri) => ri.antic)), 'the case has a tease');
});

test('presets: every one builds, and between them they show the newer features', () => {
  assert.equal(new Set(PRESETS.map((pr) => pr.id)).size, PRESETS.length);
  const made = PRESETS.map((pr) => pr.make());
  for (const [i, p] of made.entries()) assert.ok(buildTimeline(p).duration > 5, PRESETS[i].id);
  const any = (what, f) => assert.ok(made.some(f), what);
  any('build-up shake', (p) => p.effects.landShake);
  any('row lines', (p) => p.machine.rowLines);
  any('jump with a wind-up flight', (p) => p.winfx.style === 'jump' && p.winfx.jumpPath === 'back');
  any('merge one by one', (p) => p.winfx.style === 'merge' && p.winfx.mergeSeq > 0);
  any('ambient particles', (p) => p.particles.ambient.fx !== 'none');
  any('particles that run to the end', (p) => p.tiers.some((t) => t.particles?.length === 'always'));
  any('sticky wilds', (p) => p.rounds.some((r) => r.sticky));
  any('spin again', (p) => p.wheel.segments.some((s) => s.kind === 'again') && p.rounds.some((r) => r.wheelThen != null));
  any('no win', (p) => p.wheel.segments.some((s) => s.kind === 'none'));
  any('pointer at the bottom', (p) => p.game === 'wheel' && p.wheel.pointer === 'bottom');
  any('a centre icon of its own', (p) => p.wheel.centerIcon && p.wheel.centerIcon !== 'builtin:star');
  // The classic preset is the demo the editor opens with; the plain default
  // project (the base saved projects are filled in from) keeps everything off.
  const classic = made[PRESETS.findIndex((pr) => pr.id === 'classic')];
  assert.ok(classic.effects.landShake && classic.wheel.segments.every((s) => s.icon));
  assert.ok(!defaultProject().effects.landShake && !defaultProject().wheel.segments.some((s) => s.icon || s.kind));
});
