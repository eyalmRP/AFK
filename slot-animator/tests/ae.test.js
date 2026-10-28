import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProject, candyProject, cellsProject, newRound } from '../src/js/core/defaults.js';
import { buildTimeline } from '../src/js/core/timeline.js';
import { computeLayout } from '../src/js/core/layout.js';
import { evalKeys } from '../src/js/core/keys.js';
import { buildAEData, buildAEScript, AE_ASSETS, AE_SCRIPT, exportFormats, projectForFormat, parseFormat } from '../src/js/core/ae-export.js';
import { formatPrize } from '../src/js/core/coins.js';
import { createAE, runScript } from './ae-mock.js';

const TITLE_KEYS = (p) => [...p.tiers.map((t) => t.id), 'total', 'bonus', 'freespins', 'wheel', 'nearmiss'];

function exportProject(project, { formats = null, winFrames = null } = {}) {
  const tl = buildTimeline(project);
  if (formats) project.output.formats = formats;
  const list = exportFormats(project).map((fmt) => {
    const p = projectForFormat(project, fmt);
    const L = computeLayout(p);
    const dir = `assets/${fmt[0]}x${fmt[1]}`;
    return { L, data: buildAEData(p, tl, L, { assetDir: dir, titleKeys: TITLE_KEYS(p), hasBulbs: true, soundFile: AE_ASSETS.shared.sound, winFrames }) };
  });
  return { tl, list, src: buildAEScript(list.map((x) => x.data)) };
}

function allAssetPaths(list) {
  const out = new Set();
  for (const { data } of list) {
    const a = data.assets;
    for (const [k, v] of Object.entries(a)) {
      if (k === 'titles') Object.values(v).forEach((p) => out.add(p));
      else if (v) out.add(v);
    }
    for (const s of data.symbols) {
      out.add(s.file);
      if (s.win) s.win.frames.forEach((f) => out.add(f));
    }
    if (data.sound) out.add(data.sound);
  }
  return new Set([...out].map((p) => `/pkg/${p}`));
}

function run(project, opts) {
  const res = exportProject(project, opts);
  const { env, log } = createAE({ files: allAssetPaths(res.list) });
  runScript(res.src, env);
  return { ...res, log };
}

function withExtras(p) {
  const big = p.machine.payMode === 'anywhere' ? { count: p.grid.reels * p.grid.rows - 4 } : { pattern: 'full' };
  p.rounds.push(newRound('medium', { seed: 26, ...big }));
  p.rounds.push(newRound('freespins', { seed: 21 }), newRound('small', { seed: 22, free: true, sticky: true, extraWilds: 2 }), newRound('fstotal', { seed: 23 }), newRound('medium', { seed: 24 }), newRound('bonus', { seed: 25, amount: 40 }));
  return p;
}

test('AE script is plain ES3 source (no ES6 syntax in the template)', () => {
  const body = AE_SCRIPT.replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
  assert.doesNotMatch(body, /=>/);
  assert.doesNotMatch(body, /\b(let|const|class)\s/);
  assert.doesNotMatch(body, /`/);
  assert.doesNotMatch(body, /\.\.\.\w/);
});

test('AE script runs against the mock DOM for every preset, without errors or missing files', () => {
  for (const make of [defaultProject, candyProject, cellsProject]) {
    const p = withExtras(make());
    const { log, list } = run(p);
    assert.deepEqual(log.alerts, [], `${p.name}: ${log.alerts.join('\n')}`);
    const names = log.comps.map((c) => c.name);
    assert.ok(names.includes(p.name), `${p.name} main comp`);
    assert.ok(names.includes('Symbols Atlas'));
    assert.ok(names.includes('Odometer Digits'));
    // One editable comp and one win comp per symbol.
    for (const s of list[0].data.symbols) {
      assert.ok(names.some((n) => n.startsWith('Symbol ') && n.endsWith(` ${s.name}`)), `symbol comp ${s.name}`);
      assert.ok(names.some((n) => n.startsWith('Win ') && n.endsWith(` ${s.name}`)), `win comp ${s.name}`);
    }
    // Every expression parses as JavaScript.
    for (const e of log.expressions) assert.doesNotThrow(() => new Function(e.expr), `${e.comp} / ${e.layer} / ${e.prop}`);
    assert.ok(log.imports.some((f) => f.endsWith('soundtrack.wav')));
  }
});

test('AE batch export builds one comp tree per format and shares the symbol art', () => {
  const p = defaultProject();
  const { log, list } = run(p, { formats: ['1920x1080', '1080x1920', '1080x1080', 'bogus'] });
  assert.equal(list.length, 3);
  assert.deepEqual(log.alerts, [], log.alerts.join('\n'));
  const names = log.comps.map((c) => c.name);
  for (const f of ['1920x1080', '1080x1920', '1080x1080']) {
    assert.ok(names.includes(`${p.name} ${f}`), f);
    assert.ok(names.includes(`Symbols Atlas ${f}`), f);
    const main = log.comps.find((c) => c.name === `${p.name} ${f}`);
    assert.deepEqual([main.width, main.height], parseFormat(f));
  }
  const symImports = log.imports.filter((f) => /symbols\/symbol_/.test(f));
  assert.equal(symImports.length, new Set(symImports).size, 'symbol PNGs are imported once');
  // The machine's symbols, the built-in orb when needed, the coins and the empty cell.
  assert.equal(symImports.length, buildTimeline(p).lay.total);
});

const fromExport = (ks) => ks.map((k) => ({ t: k.t, v: k.v, inSpeed: k.is, inInf: k.ii, outSpeed: k.os, outInf: k.oi, hold: !!k.h }));

function evalExpr(expr, thisComp, time = 0) {
  return new Function('thisComp', 'time', `return eval(${JSON.stringify(expr)})`)(thisComp, time);
}

function spinOf(comp) {
  return comp.layers.list.find((l) => l.name === 'CTRL').property('ADBE Effect Parade').children[0].property(1);
}

function shownSymbols(comp, pval, peekRows, cellH, rows) {
  const thisComp = { width: comp.width, frameDuration: comp.frameDuration, layer: () => ({ effect: () => () => ({ value: pval }) }) };
  const shown = {};
  for (const cell of comp.layers.list.filter((l) => /^Cell /.test(l.name))) {
    const sym = Math.round(evalExpr(cell.property('ADBE Time Remapping').expression, thisComp) / comp.frameDuration - 0.5);
    const xy = evalExpr(cell.property('ADBE Transform Group').property('ADBE Position').expression, thisComp);
    const rowPos = xy[1] / cellH - 0.5 - peekRows;
    const r = Math.round(rowPos);
    if (Math.abs(rowPos - r) < 1e-6 && r >= 0 && r < rows) shown[r] = sym;
  }
  return Object.keys(shown).sort().map((k) => shown[k]);
}

test('AE reel expressions land the same symbols as the preview', () => {
  const p = defaultProject();
  p.rounds.push(newRound('medium', { seed: 61, tumble: true }));
  const { tl, list, log } = run(p);
  const { L } = list[0];
  const reelComps = log.comps.filter((c) => /^Reel \d+$/.test(c.name));
  assert.equal(reelComps.length, p.grid.reels);
  for (const [c, comp] of reelComps.entries()) {
    const spin = spinOf(comp);
    assert.ok(spin.keys.length > 3);
    for (const R of tl.rounds) {
      const pval = evalKeys(tl.stripKeys[c], R.spinEnd + 0.01);
      assert.deepEqual(shownSymbols(comp, pval, tl.peek, L.cellH, tl.rows), R.grid[c], `reel ${c} round ${R.index}`);
    }
  }
});

test('AE per-cell comps land every cell on the round grid', () => {
  const p = cellsProject();
  const { tl, list, log } = run(p);
  const { L } = list[0];
  for (let c = 0; c < tl.reels; c++) {
    for (let r = 0; r < tl.rows; r++) {
      const comp = log.comps.find((x) => x.name === `Cell ${c + 1}-${r + 1}`);
      assert.ok(comp, `cell comp ${c + 1}-${r + 1}`);
      for (const R of tl.rounds) {
        const pval = evalKeys(tl.stripKeys[c * tl.rows + r], R.spinEnd + 0.01);
        assert.deepEqual(shownSymbols(comp, pval, 0, L.cellH, 1), [R.grid[c][r]], `cell ${c},${r} round ${R.index}`);
      }
    }
  }
});

test('AE tumble layers follow the preview actors and cover the whole cascade', () => {
  const p = candyProject();
  const { tl, list, log } = run(p);
  const { L } = list[0];
  const data = list[0].data;
  for (let c = 0; c < tl.reels; c++) {
    const comp = log.comps.find((x) => x.name === `Reel ${c + 1}`);
    const layers = comp.layers.list.filter((l) => /^Tumble /.test(l.name));
    assert.equal(layers.length, data.actors[c].length);
    // At the end of every round's spin each row is covered by exactly one layer.
    for (const R of tl.rounds) {
      const t = R.noSpin ? R.t0 + 0.05 : R.spinEnd + 0.01;
      const rowsShown = [];
      for (const a of data.actors[c]) {
        if (!(t >= a.tIn && t < a.tOut)) continue;
        rowsShown.push(Math.round(evalKeys(fromExport(a.keys), t)));
      }
      assert.deepEqual(rowsShown.sort((x, y) => x - y), Array.from({ length: tl.rows }, (_, r) => r), `col ${c} round ${R.index}`);
    }
    // Layer Y keys are the actor rows scaled into the reel comp.
    const keyed = layers.filter((l) => l.property('ADBE Transform Group').property('ADBE Position_1').keys.length > 1);
    for (const l of keyed) {
      const ks = l.property('ADBE Transform Group').property('ADBE Position_1').keys;
      for (const k of ks) {
        const row = k.v / L.cellH - 0.5 - L.peek;
        assert.ok(row > -tl.rows - 3 && row < 2 * tl.rows + 3, `row ${row}`);
      }
    }
  }
});

test('AE counters: big win odometer reads the overlay keys, HUD meter reads the slot control', () => {
  const p = defaultProject();
  const { log } = run(p);
  const odos = log.comps.filter((c) => / Odometer$/.test(c.name));
  assert.ok(odos.some((c) => c.name === 'Win Meter Odometer'));
  assert.ok(odos.length >= 2);
  const valueExprs = log.expressions.filter((e) => e.layer === 'ODO CTRL');
  assert.ok(valueExprs.some((e) => /SLOT CONTROL/.test(e.expr) && /Meter/.test(e.expr)));
  assert.ok(valueExprs.some((e) => /WIN CTRL/.test(e.expr)));
  // Each referenced comp exists.
  const names = new Set(log.comps.map((c) => c.name));
  for (const e of valueExprs) {
    const m = /comp\("([^"]+)"\)/.exec(e.expr);
    assert.ok(m && names.has(m[1]), e.expr);
  }
});

test('AE odometer digits roll to the counted value', () => {
  const p = defaultProject();
  p.machine.decimals = 2;
  const { log, tl } = run(p);
  const oc = log.comps.find((c) => c.name === 'Win Meter Odometer');
  const digits = oc.layers.list.filter((l) => /^Digit x10\^/.test(l.name));
  const RH = log.comps.find((c) => c.name === 'Odometer Digits').height / 11;
  const max = Math.max(...tl.meterKeys.map((k) => k.v));
  assert.ok(max > 100);
  for (const value of [0, 7.25, Math.floor(max * 33) / 100, max, max * 9.5]) {
    const thisComp = { width: oc.width, height: oc.height, layer: () => ({ effect: () => () => ({ value, velocity: 0 }) }) };
    let read = 0;
    for (const L of digits) {
      const K = +L.name.split('^')[1];
      const xy = evalExpr(L.property('ADBE Transform Group').property('ADBE Position').expression, thisComp);
      const d = 5 - (xy[1] - oc.height / 2) / RH;
      read += Math.round(d) % 10 * Math.pow(10, K);
    }
    assert.ok(Math.abs(read - Math.floor(value * 100 + 1e-6)) < 1e-6, `${value} read as ${read / 100}`);
  }
});

test('AE win comps use the uploaded frame sequence', () => {
  const p = defaultProject();
  const winFrames = p.symbols.map((_, i) => (i === 2 ? new Array(12).fill(0) : null));
  const { log, list } = run(p, { winFrames });
  assert.equal(list[0].data.symbols[2].win.frames.length, 12);
  assert.equal(list[0].data.symbols[2].win.frames[0], AE_ASSETS.shared.winFrame(2, 0));
  const wc = log.comps.find((c) => c.name.startsWith('Win 03 '));
  assert.equal(wc.layers.list.length, 12);
  assert.equal(wc.comment, 'loop');
});

test('AE transparent export switches the background off', () => {
  const p = defaultProject();
  p.output.transparent = true;
  const { log } = run(p);
  const main = log.comps.find((c) => c.name === p.name);
  const bg = main.layers.list.find((l) => l.name === 'Background');
  assert.equal(bg.enabled, false);
});

// What a strip comp's value slots show: row -> text.
function shownLabels(comp, pval, peekRows, cellH, rows, time) {
  const thisComp = { width: comp.width, frameDuration: comp.frameDuration, layer: () => ({ effect: () => () => ({ value: pval }) }) };
  const out = {};
  for (const T of comp.layers.list.filter((l) => /^Value \d+$/.test(l.name))) {
    const txt = evalExpr(T.property('ADBE Text Properties').property('ADBE Text Document').expression, thisComp, time);
    if (!txt) continue;
    const op = evalExpr(T.property('ADBE Transform Group').property('ADBE Opacity').expression, thisComp, time);
    if (!op) continue;
    const xy = evalExpr(T.property('ADBE Transform Group').property('ADBE Position').expression, thisComp, time);
    const r = Math.floor(xy[1] / cellH - peekRows);
    if (r >= 0 && r < rows) out[r] = txt;
  }
  return out;
}

test('AE hold & spin board: every cell lands the preview coin, with its value', () => {
  const p = defaultProject();
  p.game = 'holdspin';
  p.holdspin.startCoins = 2;
  p.rounds = [newRound('respin', { seed: 1, coinsIn: 2 }), newRound('respin', { seed: 2, coinsIn: 0 }), newRound('respin', { seed: 3, fill: true, specials: ['mega'] }), newRound('collect', { seed: 4 })];
  const { tl, list, log } = run(p);
  assert.deepEqual(log.alerts, [], log.alerts.join('\n'));
  const { L } = list[0];
  const fmt = (v) => formatPrize(v, p.machine.currency, p.machine.decimals);
  for (const R of tl.rounds.filter((x) => x.outcome === 'respin')) {
    const t = R.spinEnd + 0.01;
    for (let c = 0; c < tl.reels; c++) {
      for (let r = 0; r < tl.rows; r++) {
        const k = c * tl.rows + r;
        const comp = log.comps.find((x) => x.name === `Hold Cell ${c + 1}-${r + 1}`);
        assert.ok(comp, `hold cell ${c + 1}-${r + 1}`);
        const pval = evalKeys(tl.hold.keys[k], t);
        const lock = tl.hold.locks.find((l) => l.c === c && l.r === r && l.from <= t && l.to > t);
        assert.deepEqual(shownSymbols(comp, pval, 0, L.cellH, 1), [lock ? lock.sym : tl.lay.blankSym], `cell ${c},${r} round ${R.index}`);
        assert.deepEqual(shownLabels(comp, pval, 0, L.cellH, 1, t), lock ? { 0: fmt(lock.value) } : {}, `label ${c},${r} round ${R.index}`);
      }
    }
  }
  const main = log.comps.find((x) => x.name === p.name);
  assert.equal(main.layers.list.filter((l) => /^Coin Lock /.test(l.name)).length, tl.hold.locks.length);
  assert.ok(main.layers.list.some((l) => l.name === 'Respins Counter'));
  assert.ok(log.comps.some((x) => / Grand Odometer$/.test(x.name)), 'grand counter');
  assert.ok(log.comps.some((x) => x.name === 'Symbol 16 Empty cell'));
});

test('AE trigger round: coins land on the reels with their values, then carry onto the board', () => {
  const p = defaultProject();
  p.rounds = [newRound('hstrigger', { seed: 4, coinsIn: 5 }), newRound('respin', { seed: 5, coinsIn: 1 }), newRound('collect', { seed: 6 })];
  const { tl, list, log } = run(p);
  assert.deepEqual(log.alerts, [], log.alerts.join('\n'));
  const { L } = list[0];
  const trig = tl.rounds[0];
  const t = trig.spinEnd + 0.01;
  for (let c = 0; c < tl.reels; c++) {
    const comp = log.comps.find((x) => x.name === `Reel ${c + 1}`);
    const pval = evalKeys(tl.stripKeys[c], t);
    const want = {};
    for (const cn of trig.win.coins) if (cn.c === c) want[cn.r] = formatPrize(cn.value, p.machine.currency, p.machine.decimals);
    assert.deepEqual(shownLabels(comp, pval, tl.peek, L.cellH, tl.rows, t), want, `reel ${c}`);
  }
  const main = log.comps.find((x) => x.name === p.name);
  const reel1 = main.layers.list.find((l) => l.name === 'Reel 1');
  assert.match(reel1.property('ADBE Transform Group').property('ADBE Opacity').expression, /HW/);
});

test('AE wheel game: no machine, and the wheel hands over from round to round', () => {
  const p = defaultProject();
  p.game = 'wheel';
  p.rounds = [newRound('wheel', { seed: 1, wheelSegment: 2 }), newRound('wheel', { seed: 2, wheelSegment: 5 }), newRound('wheel', { seed: 3, wheelSegment: 9 })];
  const { tl, log, list } = run(p);
  assert.deepEqual(log.alerts, [], log.alerts.join('\n'));
  assert.ok(!log.comps.some((c) => /^Reel \d/.test(c.name)));
  const main = log.comps.find((c) => c.name === p.name);
  assert.ok(!main.layers.list.some((l) => /Machine|Win Meter/.test(l.name)));
  const fx = main.layers.list.filter((l) => /^R\d\d /.test(l.name)).sort((a, b) => a.startTime - b.startTime);
  assert.equal(fx.length, 3);
  const data = list[0].data;
  for (let i = 0; i < 2; i++) assert.ok(Math.abs(fx[i].startTime + fx[i].source.duration - data.rounds[i + 1].start) < 1e-6, 'no gap and no overlap');
  void tl;
});
