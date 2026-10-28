// Free spins retrigger, multiplier wilds, mystery symbols, walking wilds
// and the collector: what the core schedules, and that the After Effects
// rig plays the same thing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProject, cellsProject, candyProject, newRound } from '../src/js/core/defaults.js';
import { buildTimeline, heldCells, walkStep, WILD_WALK, WALK_HOP, MYSTERY } from '../src/js/core/timeline.js';
import { computeLayout } from '../src/js/core/layout.js';
import { evalKeys } from '../src/js/core/keys.js';
import { generatePaylines } from '../src/js/core/paylines.js';
import { makeContext } from '../src/js/core/outcomes.js';
import { lineRuns } from '../src/js/core/grid.js';
import { buildAEData, buildAEScript } from '../src/js/core/ae-export.js';
import { createAE, runScript } from './ae-mock.js';

const FS = { free: true };

// What strip s shows in its window at time t (top row first).
function visible(tl, s, t, rows) {
  const P = Math.round(evalKeys(tl.stripKeys[s], t));
  const col = [];
  for (let k = 0; k < rows; k++) col[tl.dir > 0 ? rows - 1 - k : k] = tl.strips[s][P + k];
  return col;
}

function exportAE(p) {
  const tl = buildTimeline(p);
  const L = computeLayout(p);
  const data = buildAEData(p, tl, L, { titleKeys: ['freespins', 'retrigger', 'total'] });
  const files = new Set();
  for (const [k, v] of Object.entries(data.assets)) if (k === 'titles') Object.values(v).forEach((x) => files.add(`/pkg/${x}`));
  else if (v) files.add(`/pkg/${v}`);
  data.symbols.forEach((s) => files.add(`/pkg/${s.file}`));
  data.wheel.icons.forEach((i) => files.add(`/pkg/${i.file}`));
  data.particles.assets.forEach((a) => a.files.forEach((x) => files.add(`/pkg/${x}`)));
  const { env, log } = createAE({ files });
  runScript(buildAEScript([data]), env);
  assert.deepEqual(log.alerts, [], log.alerts.join('\n'));
  return { tl, L, data, log };
}

const ev = (expr, t) => new Function('time', 'comp', 'thisComp', `return eval(${JSON.stringify(expr)})`)(t, () => ({ layer: () => ({ effect: () => () => 100 }) }), {});
const tr = (L, prop) => L.property('ADBE Transform Group').property(prop).expression;
const textExpr = (L) => L.property('ADBE Text Properties').property('ADBE Text Document').expression;

test('retrigger: scatters in free spins add spins to the running block', () => {
  const p = defaultProject();
  p.rounds = [newRound('freespins', { seed: 1, freeSpins: 6 }), newRound('none', { seed: 2, ...FS }), newRound('freespins', { seed: 3, ...FS, freeSpins: 4 }), newRound('small', { seed: 4, ...FS, lines: [0], count: 3 }), newRound('fstotal', { seed: 5 })];
  const { tl, log } = exportAE(p);
  assert.equal(tl.fsBlocks.length, 1, 'one block: the retrigger does not start a new one');
  const R = tl.rounds[2];
  assert.equal(R.pres.banner.kind, 'retrigger');
  assert.equal(R.pres.banner.freeSpins, 4);
  assert.deepEqual([R.fs.index, R.fs.of, R.fs.retrigger], [2, 10, 4]);
  assert.deepEqual([tl.rounds[3].fs.index, tl.rounds[3].fs.of], [3, 10]);
  // The counter says 6 until the banner lands, then 10, in the preview data and in After Effects.
  const block = tl.fsBlocks[0];
  const nAt = (t) => block.rounds.filter((x) => x.t0 <= t && x.n).reduce((n, x) => x.n, block.n);
  const bannerOn = R.pres.banner.start + 0.4;
  assert.equal(nAt(bannerOn - 0.01), 6);
  assert.equal(nAt(bannerOn + 0.01), 10);
  const rib = log.comps.find((c) => c.name === p.name).layers.list.find((l) => l.name === 'Free Spins Ribbon');
  assert.equal(ev(textExpr(rib), bannerOn - 0.01), 'FREE SPIN 2 OF 6');
  assert.equal(ev(textExpr(rib), bannerOn + 0.01), 'FREE SPIN 2 OF 10');
  assert.equal(ev(textExpr(rib), tl.rounds[3].t0 + 0.1), 'FREE SPIN 3 OF 10');
  const round = log.comps.find((c) => /^R03 /.test(c.name));
  assert.ok(round.layers.list.some((l) => l.name === 'Extra Spins'));
});

test('multiplier wilds: wilds in the win carry their x, the win multiplies, and the x stays on show', () => {
  const p = defaultProject();
  p.rounds = [newRound('medium', { seed: 5, lines: [0], count: 5, wildMults: [2, 3] })];
  const tl = buildTimeline(p);
  const R = tl.rounds[0];
  const wild = p.symbols.findIndex((s) => s.role === 'wild');
  assert.equal(R.win.wildMults.length, 2);
  for (const m of R.win.wildMults) {
    assert.equal(R.grid[m.c][m.r], wild, 'a wild');
    assert.equal(R.mult[m.c][m.r], m.value, 'carrying its x');
    assert.ok(R.pres.steps[0].cells.some(([c, r]) => c === m.c && r === m.r), 'in the win');
  }
  assert.equal(R.win.multSum, 5);
  assert.ok(Math.abs(R.win.base * R.win.multSum - R.win.amount) < 1e-9);
  assert.deepEqual(R.pres.mult.items.map((it) => it.value).sort(), [2, 3]);
  assert.ok(Math.abs(evalKeys(tl.meterKeys, R.pres.mult.applyAt + 0.8) - R.win.amount) < 1e-6);
  // A tumble would carry them off: none then.
  const q = defaultProject();
  q.rounds = [newRound('medium', { seed: 5, lines: [0], count: 5, wildMults: [2], tumble: true, chain: [{ symbol: 'auto', count: 3 }] })];
  assert.equal(buildTimeline(q).rounds[0].win.wildMults.length, 0);
  // After Effects: the x rides on the wild's win comp.
  const { log } = exportAE(p);
  const comp = log.comps.find((c) => /^R01 /.test(c.name));
  assert.deepEqual(comp.layers.list.filter((l) => /^Value x/.test(l.name)).map((l) => l.name).sort(), ['Value x2', 'Value x3']);
});

test('mystery symbols: blocks land, turn over together, and reveal one symbol that cannot pay by accident', () => {
  for (const make of [defaultProject, cellsProject, () => Object.assign(candyProject(), {}), () => { const q = candyProject(); q.machine.payMode = 'lines'; return q; }]) {
    const p = make();
    p.rounds = [newRound('none', { seed: 6, mystery: 3 }), newRound('small', { seed: 7, lines: [1], count: 4, mystery: 2, tumble: false })];
    const tl = buildTimeline(p);
    const lay = tl.lay;
    const R0 = tl.rounds[0];
    const my = R0.pres.mystery;
    assert.ok(my && my.cells.length, `${p.name}: blocks land`);
    const sym = R0.win.mystery.sym;
    for (const [c, r] of my.cells) assert.equal(R0.grid[c][r], sym, 'the grid holds what they reveal');
    if (p.machine.payMode === 'lines') {
      const ctx = makeContext(p, generatePaylines(p.grid.reels, p.grid.rows, p.machine.maxLines));
      assert.deepEqual(lineRuns(R0.grid, ctx, (c, r) => ctx.wildSet.has(R0.grid[c][r])), [], 'a no-win spin stays a no-win after the reveal');
    }
    // Before the turn the cells show the block, after it the symbol; while turning they are cut out of the reels.
    const shows = (c, r, t) => {
      if (tl.mode === 'cascade') {
        const a = R0.actors.filter((x) => x.c === c && t >= x.tIn && t < x.tOut && !x.old);
        return a.length ? a[a.length - 1].sym : null;
      }
      if (tl.mode === 'cells') return visible(tl, c * tl.rows + r, t, 1)[0];
      return visible(tl, c, t, tl.rows)[r];
    };
    for (const [c, r] of my.cells) {
      if (tl.mode === 'cascade') {
        const block = R0.actors.find((x) => x.c === c && x.sym === lay.mysterySym);
        assert.ok(block && block.tOut <= my.mid + 1e-9, 'the block drops in and leaves under the card');
        assert.ok(R0.actors.some((x) => x.c === c && x.row === r && x.sym === sym && Math.abs(x.tIn - my.mid) < 1e-9), 'the symbol takes its place');
      } else {
        assert.equal(shows(c, r, my.start), lay.mysterySym, `${p.name}: block before the turn`);
        assert.equal(shows(c, r, my.end), sym, `${p.name}: symbol after it`);
      }
      const cut = (t) => heldCells(tl, t).some((h) => h.c === c && h.r === r);
      assert.equal(cut(my.flipAt - 0.01), false);
      assert.equal(cut(my.mid), true);
      assert.equal(cut(my.flipEnd + 0.01), false);
    }
    assert.ok(Math.abs(my.flipEnd - my.flipAt - MYSTERY.flip) < 1e-9);
    // On a win the blocks sit on winners and reveal the winning symbol.
    const R1 = tl.rounds[1];
    assert.equal(R1.win.mystery.sym, R1.win.symbol);
    for (const [c, r] of R1.win.mystery.cells) assert.ok(R1.pres.steps[0].cells.some(([cc, rr]) => cc === c && rr === r));
    assert.ok(R1.pres.steps[0].start >= R1.pres.mystery.end - 1e-9, 'the win shows after the reveal');
  }
  // After Effects: the turning cards, and Reveal masks that cut the cells out of the reels.
  const p = defaultProject();
  p.rounds = [newRound('none', { seed: 6, mystery: 3 })];
  const { tl, log } = exportAE(p);
  const my = tl.rounds[0].pres.mystery;
  const comp = log.comps.find((c) => /^R01 /.test(c.name));
  assert.equal(comp.layers.list.filter((l) => l.name === 'Mystery Block').length, my.cells.length);
  assert.equal(comp.layers.list.filter((l) => l.name === 'Mystery Reveal').length, my.cells.length);
  const main = log.comps.find((c) => c.name === p.name);
  for (const [i, v] of tl.reveals.entries()) {
    const reel = main.layers.list.find((l) => l.name === `Reel ${v.c + 1}`);
    const mask = reel.property('ADBE Mask Parade').children.find((m) => m.name === `Reveal ${i + 1}`);
    assert.ok(mask, `reel ${v.c + 1} has a Reveal mask`);
    const op = (t) => new Function('time', `return eval(${JSON.stringify(mask.property('ADBE Mask Opacity').expression)})`)(t);
    for (const t of [my.flipAt - 0.01, my.mid, my.flipEnd + 0.01]) assert.equal(op(t), heldCells(tl, t).some((h) => h.c === v.c && h.r === v.r) ? 100 : 0);
  }
});

test('walking wilds: each free spin they step one reel left, walk off the edge, and the reel they leave is ordinary again', () => {
  const p = defaultProject();
  p.rounds = [newRound('freespins', { seed: 9, freeSpins: 6, walking: true }), newRound('none', { seed: 10, ...FS, extraWilds: 2 }), newRound('none', { seed: 11, ...FS }), newRound('none', { seed: 12, ...FS }), newRound('none', { seed: 13, ...FS }), newRound('fstotal', { seed: 14 })];
  const { tl, L, data, log } = exportAE(p);
  const wild = p.symbols.findIndex((s) => s.role === 'wild');
  const landed = tl.stickies.filter((s) => !s.walkIn);
  assert.equal(landed.length, 2, 'the two extra wilds start walking');
  for (const w of landed) {
    // Follow it: one reel left per spin, its grid cell a wild, until it walks off.
    let seg = w;
    let k = 2;
    while (seg) {
      const next = tl.stickies.find((s) => s.walkIn && s.walkIn[0] === seg.c && s.walkIn[1] === seg.r && Math.abs(s.from - seg.to) < 1e-9);
      if (!next) break;
      assert.equal(next.c, seg.c - 1, 'one reel to the left');
      const R = tl.rounds[k];
      assert.ok(Math.abs(next.from - R.t0) < 1e-9, 'as the spin starts');
      if (next.exit) assert.ok(next.c < 0 && next.to - next.from <= WILD_WALK + 1e-9, 'off the edge, and gone');
      else {
        assert.equal(R.grid[next.c][next.r], wild, 'the spin lands a wild where it stands');
        // The reel it left shows an ordinary symbol, not the wild it landed as.
        assert.notEqual(visible(tl, seg.c, R.t0 + 0.01, tl.rows)[seg.r], wild);
      }
      seg = next;
      k++;
    }
    assert.ok(seg.exit, 'every walker walks off in the end');
  }
  // After Effects: the walker hops on the same path as the preview.
  const main = log.comps.find((c) => c.name === p.name);
  const walkers = main.layers.list.filter((l) => /^Walking Wild /.test(l.name)).reverse();
  const walking = data.stickies.filter((s) => s.walk);
  assert.equal(walkers.length, walking.length);
  walking.forEach((st, i) => {
    const seg = tl.stickies.find((s) => s.walkIn && Math.abs(s.from - st.from) < 1e-6 && s.c === st.c && s.r === st.r);
    for (const dt of [0, 0.1, 0.2, 0.3, 0.45]) {
      const t = st.from + dt;
      const { u, hop } = walkStep(seg, t);
      const x0 = st.walk[0];
      const y0 = st.walk[1];
      const got = ev(tr(walkers[i], 'ADBE Position'), t);
      assert.ok(Math.abs(got[0] - (x0 + (st.x - x0) * u)) < 1e-6 && Math.abs(got[1] - (y0 + (st.y - y0) * u - hop * WALK_HOP * L.cellH)) < 1e-3, `walker ${i} at +${dt}`);
    }
  });
});

test('collector: cash values fly into the collector one by one, on top of the win', () => {
  const p = defaultProject();
  p.rounds = [newRound('small', { seed: 8, lines: [0], count: 3, cash: [2, 5, 10], collector: true })];
  const { tl, log } = exportAE(p);
  const R = tl.rounds[0];
  assert.equal(R.win.collected, 17 * p.machine.bet);
  assert.ok(Math.abs(R.win.amount - (2 * p.machine.bet + R.win.collected)) < 1e-9, 'the line win plus what was collected');
  const cl = R.pres.collector;
  assert.equal(cl.items.length, 3);
  assert.equal(tl.lay.collectorSym, R.grid[cl.c][cl.r]);
  // The meter counts each value in as it arrives, and ends on the round's win.
  const line = R.win.amount - R.win.collected;
  assert.ok(Math.abs(evalKeys(tl.meterKeys, cl.items[0].at) - line) < 1e-6);
  let sum = line;
  for (const it of cl.items) {
    sum += it.value;
    assert.ok(Math.abs(evalKeys(tl.meterKeys, it.arrive + 0.15) - sum) < 1e-6);
  }
  assert.ok(Math.abs(evalKeys(tl.meterKeys, cl.end) - R.win.amount) < 1e-6);
  // Cash and coin values are not multipliers.
  assert.ok(!R.pres.mult);
  // After Effects: the collector, a flying value per cash symbol, and the running total.
  const comp = log.comps.find((c) => /^R01 /.test(c.name));
  assert.ok(comp.layers.list.some((l) => l.name === 'Collector'));
  assert.equal(comp.layers.list.filter((l) => /^Cash /.test(l.name)).length, 3);
  const tx = comp.layers.list.find((l) => l.name === 'Collected');
  const rel = (t) => t - R.presentStart;
  assert.equal(ev(textExpr(tx), rel(cl.items[0].arrive) - 0.01), '');
  assert.equal(ev(textExpr(tx), rel(cl.items[2].arrive) + 0.01), '$17');
});
