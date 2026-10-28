import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProject, candyProject, cellsProject, freeSpinsProject, fruitProject, newRound } from '../src/js/core/defaults.js';
import { teaseWindows, teaseEnv, teaseDim, landLit, landScale, landings, LAND_POP } from '../src/js/core/tease.js';
import { buildTimeline, heldCells, STICKY_COVER } from '../src/js/core/timeline.js';
import { computeLayout } from '../src/js/core/layout.js';
import { evalKeys } from '../src/js/core/keys.js';
import { buildAEData, buildAEScript, AE_ASSETS, AE_SCRIPT, exportFormats, projectForFormat, parseFormat } from '../src/js/core/ae-export.js';
import { formatPrize } from '../src/js/core/coins.js';
import { sfxCues, toDb } from '../src/js/core/sfx.js';
import { particleAt, particleAssetInfo } from '../src/js/core/particles.js';
import { createAE, runScript } from './ae-mock.js';

const TITLE_KEYS = (p) => [...p.tiers.map((t) => t.id), 'total', 'bonus', 'freespins', 'wheel', 'nearmiss'];

function exportProject(project, { formats = null, winFrames = null } = {}) {
  const tl = buildTimeline(project);
  if (formats) project.output.formats = formats;
  const list = exportFormats(project).map((fmt) => {
    const p = projectForFormat(project, fmt);
    const L = computeLayout(p);
    const dir = `assets/${fmt[0]}x${fmt[1]}`;
    return { L, data: buildAEData(p, tl, L, { assetDir: dir, titleKeys: TITLE_KEYS(p), hasBulbs: true, sfx: true, sfxHeadroom: -2, winFrames }) };
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
    if (data.sfx) data.sfx.clips.forEach((f) => out.add(f));
    data.particles.assets.forEach((a) => a.files.forEach((f) => out.add(f)));
    data.wheel.icons.forEach((i) => out.add(i.file));
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
  // ES3 has no trailing commas in object or array literals.
  assert.doesNotMatch(body, /,\s*[}\]]/);
});

test('AE script runs against the mock DOM for every preset, without errors or missing files', () => {
  for (const make of [defaultProject, candyProject, cellsProject]) {
    const p = withExtras(make());
    const { log, list } = run(p);
    assert.deepEqual(log.alerts, [], `${p.name}: ${log.alerts.join('\n')}`);
    const names = log.comps.map((c) => c.name);
    assert.ok(names.includes(p.name), `${p.name} main comp`);
    assert.ok(names.includes('Symbols Atlas'));
    assert.ok(names.includes('Counter Digits'));
    // One editable comp and one win comp per symbol.
    for (const s of list[0].data.symbols) {
      assert.ok(names.some((n) => n.startsWith('Symbol ') && n.endsWith(` ${s.name}`)), `symbol comp ${s.name}`);
      assert.ok(names.some((n) => n.startsWith('Win ') && n.endsWith(` ${s.name}`)), `win comp ${s.name}`);
    }
    // Every expression parses as JavaScript.
    for (const e of log.expressions) assert.doesNotThrow(() => new Function(e.expr), `${e.comp} / ${e.layer} / ${e.prop}`);
    assert.ok(names.includes('SFX'));
    assert.ok(log.imports.some((f) => /\/assets\/sfx\/(reelStop|drop)_01\.wav$/.test(f)));
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

test('AE counters: big win counter reads the overlay keys, HUD meter reads the slot control', () => {
  const p = defaultProject();
  const { log } = run(p);
  const rigs = log.comps.filter((c) => / Counter$/.test(c.name));
  assert.ok(rigs.some((c) => c.name === 'Win Meter Counter'));
  assert.ok(rigs.length >= 2);
  const valueExprs = log.expressions.filter((e) => e.layer === 'COUNTER CTRL');
  assert.ok(valueExprs.some((e) => /SLOT CONTROL/.test(e.expr) && /Meter/.test(e.expr)));
  assert.ok(valueExprs.some((e) => /WIN CTRL/.test(e.expr)));
  // Each referenced comp exists.
  const names = new Set(log.comps.map((c) => c.name));
  for (const e of valueExprs) {
    const m = /comp\("([^"]+)"\)/.exec(e.expr);
    assert.ok(m && names.has(m[1]), e.expr);
  }
});

test('AE counter digits roll to the counted value', () => {
  const p = defaultProject();
  p.machine.decimals = 2;
  const { log, tl } = run(p);
  const oc = log.comps.find((c) => c.name === 'Win Meter Counter');
  const digits = oc.layers.list.filter((l) => /^Digit x10\^/.test(l.name));
  const RH = log.comps.find((c) => c.name === 'Counter Digits').height / 11;
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
  p.rounds = [newRound('respin', { seed: 1, coinsIn: 2 }), newRound('respin', { seed: 2, coinsIn: 0 }), newRound('respin', { seed: 3, fill: true, specials: ['mini'] }), newRound('collect', { seed: 4 })];
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
  assert.ok(log.comps.some((x) => / Grand Counter$/.test(x.name)), 'grand counter');
  assert.ok(log.comps.some((x) => x.name === `Symbol ${tl.lay.blankSym + 1} Empty cell`));
  // The built-in stand-ins have comps of their own too.
  for (const v of tl.lay.virtual) assert.ok(log.comps.some((x) => x.name === `Symbol ${v.sym + 1} ${v.name}`), v.name);
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

test('AE SFX comp: one audio layer per cue at its time, mixed by group on SFX MIX', () => {
  const p = withExtras(defaultProject());
  p.sound.mix = { reels: 0.5, wins: 1, coins: 0, bigwin: 1.2, ui: 1 };
  p.sound.volume = 0.6;
  const { tl, log, list } = run(p);
  assert.deepEqual(log.alerts, [], log.alerts.join('\n'));
  const { clips, events } = sfxCues(tl);
  const sfx = log.comps.find((c) => c.name === 'SFX');
  const layers = sfx.layers.list.filter((l) => l.name !== 'SFX MIX');
  assert.equal(layers.length, events.length);
  // Layers run in time order from the top, each at its cue's time.
  const starts = layers.map((l) => l.startTime);
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
  assert.deepEqual(starts, events.map((e) => Math.round(e.t * 10000) / 10000));
  // Identical cues share one clip; every clip is imported once.
  const imported = log.imports.filter((f) => f.includes('/assets/sfx/'));
  assert.equal(imported.length, clips.length);
  assert.ok(clips.length < events.length);
  assert.equal(clips.filter((c) => c.type === 'reelStop').length, p.grid.reels);
  // Levels: master (with the headroom) plus the layer's group, in dB.
  const mix = sfx.layers.list.find((l) => l.name === 'SFX MIX');
  const sliders = Object.fromEntries(mix.property('ADBE Effect Parade').children.map((e) => [e.name, e.property(1).value]));
  assert.equal(sliders['Master (dB)'], Math.round((toDb(0.6) - 2) * 100) / 100);
  assert.equal(sliders['Reels (dB)'], toDb(0.5));
  assert.equal(sliders['Coins (dB)'], -96);
  const stop = layers.find((l) => /^Reel stop R01$/.test(l.name));
  assert.ok(stop, 'cue layers are named after the cue and round');
  const lv = stop.property('ADBE Audio Group').property('ADBE Audio Levels').expression;
  assert.match(lv, /Master \(dB\)/);
  assert.match(lv, /Reels \(dB\)/);
  const mixLayer = { effect: (n) => () => ({ 'Master (dB)': -4, 'Reels (dB)': -6 })[n] };
  assert.deepEqual(new Function('thisComp', `return eval(${JSON.stringify(lv)})`)({ layer: () => mixLayer }), [-10, -10]);
  assert.equal(stop.label, 8);
  const main = log.comps.find((c) => c.name === p.name);
  assert.ok(main.layers.list.some((l) => l.name === 'SFX' && l.source === sfx));
  assert.ok(!main.layers.list.some((l) => l.name === 'Sound Track'));
  // No sound, no SFX comp.
  void list;
  const q = defaultProject();
  const tl2 = buildTimeline(q);
  const L2 = computeLayout(q);
  assert.equal(buildAEData(q, tl2, L2, { sfx: false }).sfx, null);
});

test('AE placeholder comps: art and effect looks are built once and used as layers', () => {
  const p = withExtras(defaultProject());
  p.rounds.push(newRound('big', { seed: 70 }), newRound('nearmiss', { seed: 71 }));
  const { log } = run(p);
  assert.deepEqual(log.alerts, [], log.alerts.join('\n'));
  const ph = log.folders.find((f) => f.name === 'Placeholder Comps');
  assert.ok(ph);
  const subs = log.folders.filter((f) => f.parentFolder === ph).map((f) => f.name);
  for (const n of ['Symbols', 'Machine', 'Effects', 'Titles', 'Paylines', 'Counters', 'Plaques', 'Wheel', 'Particles']) assert.ok(subs.includes(n), `folder ${n}`);
  const byName = (n) => log.comps.filter((c) => c.name === n);
  for (const n of ['Background', 'Machine Back', 'Machine Frame', 'Marquee Lights', 'Logo', 'Win Meter Panel', 'Vignette', 'FX Shockwave', 'FX Light Rays', 'FX Small Rays', 'FX Cell Frame', 'FX Anticipation', 'FX Sticky Frame', 'FX Near Miss', 'Prize Plaque', 'Wheel Disc', 'Wheel Pointer', 'Counter Digits', 'Title nearmiss', 'Title freespins']) {
    assert.equal(byName(n).length, 1, `one ${n} placeholder`);
    assert.ok(ph === byName(n)[0].parentFolder.parentFolder, `${n} sits in Placeholder Comps`);
  }
  // Every effect layer in the rounds is a use of its placeholder.
  const rounds = log.comps.filter((c) => /^R\d\d /.test(c.name) && c.parentFolder?.name === 'Rounds');
  assert.ok(rounds.length >= 5);
  const uses = (layerName, phName) => rounds.flatMap((c) => c.layers.list).filter((l) => l.name === layerName).every((l) => l.source?.name === phName);
  const rings = rounds.flatMap((c) => c.layers.list).filter((l) => l.name === 'Shockwave');
  assert.ok(rings.length > 3);
  assert.ok(uses('Shockwave', 'FX Shockwave'));
  assert.ok(uses('Light Rays', 'FX Light Rays'));
  assert.ok(uses('Cell Frame', 'FX Cell Frame'));
  // Tinted uses follow the FX Colour switch.
  const tintExpr = log.expressions.filter((e) => e.prop === 'ADBE Tint-0003');
  assert.ok(tintExpr.length >= rings.length);
  assert.ok(tintExpr.every((e) => /effect\("FX Colour"\)/.test(e.expr)));
  // Paylines are placeholders that draw themselves on.
  const lines = log.comps.filter((c) => /^Payline \d\d$/.test(c.name));
  assert.ok(lines.length > 0);
  assert.equal(new Set(lines.map((c) => c.name)).size, lines.length);
  // Particle emitters are comps of their own, made of particle placeholder layers.
  const ems = log.comps.filter((c) => c.parentFolder?.name === 'Particles' && c.parentFolder.parentFolder?.name === 'Rounds');
  assert.ok(ems.length >= 3);
  for (const ec of ems) assert.ok(ec.layers.list.every((l) => /^Particle /.test(l.source?.name) && l.source.parentFolder.parentFolder === ph), ec.name);
  for (const ec of ems) assert.ok(rounds.some((c) => c.layers.list.some((l) => l.source === ec)), `${ec.name} is used`);
  assert.equal(byName('Particle Confetti').length, 1);
});

test('AE side controls: SLOT CONTROL sliders exist and every comp/layer/effect an expression names exists', () => {
  const used = new Set();
  for (const make of [defaultProject, candyProject, cellsProject]) {
    const p = withExtras(make());
    const { log } = run(p);
    const main = log.comps.find((c) => c.name === p.name);
    const ctrl = main.layers.list.find((l) => l.name === 'SLOT CONTROL');
    const fxNames = ctrl.property('ADBE Effect Parade').children.map((e) => e.name);
    for (const n of ['Meter', 'FS Total', 'Shake %', 'Flash %', 'Dim %', 'Particles %', 'Spin Blur %', 'Win Pop %', 'FX Colour']) assert.ok(fxNames.includes(n), n);
    const comps = new Map(log.comps.map((c) => [c.name, c]));
    let refs = 0;
    for (const e of log.expressions) {
      for (const m of e.expr.matchAll(/comp\("([^"]+)"\)\.layer\("([^"]+)"\)\.effect\("([^"]+)"\)/g)) {
        refs++;
        const c = comps.get(m[1]);
        assert.ok(c, `comp ${m[1]}`);
        const L = c.layers.list.find((l) => l.name === m[2]);
        assert.ok(L, `layer ${m[2]} in ${m[1]}`);
        assert.ok(L.property('ADBE Effect Parade').children.some((x) => x.name === m[3]), `effect ${m[3]} on ${m[2]}`);
      }
    }
    assert.ok(refs > 50);
    for (const e of log.expressions) for (const m of e.expr.matchAll(/layer\("SLOT CONTROL"\)\.effect\("([^"]+)"\)/g)) used.add(m[1]);
  }
  for (const n of ['Shake %', 'Flash %', 'Dim %', 'Particles %', 'Spin Blur %', 'Win Pop %', 'FX Colour']) assert.ok(used.has(n), `${n} is used`);
});

test('AE counter rigs: the digit layers last as long as their counter', () => {
  const p = withExtras(defaultProject());
  const { log } = run(p);
  const rigs = log.comps.filter((c) => / Counter$/.test(c.name));
  assert.ok(rigs.some((c) => c.duration > 10), 'a rig longer than 10 s');
  for (const rc of rigs) {
    for (const l of rc.layers.list.filter((x) => /^Digit /.test(x.name))) assert.ok(l.outPoint >= rc.duration - 1e-6, `${rc.name} / ${l.name}`);
  }
});

test('AE particles: every emitter is a comp whose layers move exactly like the preview particles', () => {
  const p = defaultProject();
  p.rounds = [newRound('small', { seed: 1 }), newRound('big', { seed: 3, tier: 2 }), newRound('freespins', { seed: 4 })];
  p.particles.small = { fx: 'spiral', asset: 'ember' };
  const { tl, log, list } = run(p);
  assert.deepEqual(log.alerts, [], log.alerts.join('\n'));
  const data = list[0].data;
  const ctrlStub = { layer: () => ({ effect: () => () => ({ value: 100, valueOf: () => 100 }) }) };
  const evalAt = (expr, time) => new Function('time', 'comp', 'thisComp', `return eval(${JSON.stringify(expr)})`)(time, () => ctrlStub, { frameDuration: 1 / tl.fps });
  let checked = 0;
  for (const em of tl.emitters) {
    const R = data.rounds.find((r) => r.index === em.round);
    const ed = R.particles.find((x) => x.start === Math.round(em.start * 1e4) / 1e4 && x.moment === em.moment);
    assert.ok(ed, `${em.id} exported`);
    const comp = log.comps.find((c) => c.name.endsWith(` ${ed.name}`) && c.name.startsWith(`R${String(em.round + 1).padStart(2, '0')} `));
    assert.ok(comp, `${em.id} comp`);
    const layers = comp.layers.list.slice().reverse();
    assert.equal(layers.length, ed.ps.length);
    const motion = particleAssetInfo(p, em.asset).motion;
    for (const [i, L] of layers.entries()) {
      if (i % 7) continue;
      const q = ed.ps[i];
      const part = { b: q[0], l: q[1], x: q[2], y: q[3], vx: q[4], vy: q[5], g: q[6], k: q[7], s: q[8], r0: q[9], rv: q[10], f: q[11], ph: q[12], sw: q[13], sf: q[14], v: q[15], fo: q[16], tw: q[17] };
      for (const f of [0.15, 0.5, 0.85]) {
        const t = part.b + part.l * f;
        const local = t - ed.start;
        const want = particleAt(part, t, motion);
        const tr = L.property('ADBE Transform Group');
        const xy = evalAt(tr.property('ADBE Position').expression, local);
        assert.ok(Math.abs(xy[0] - want.x) < 0.05 && Math.abs(xy[1] - want.y) < 0.05, `${comp.name} #${i} position`);
        assert.ok(Math.abs(evalAt(tr.property('ADBE Rotate Z').expression, local) - want.rot) < 1e-3);
        const sc = evalAt(tr.property('ADBE Scale').expression, local);
        assert.ok(Math.abs(sc[0] / sc[1] - want.sx / want.sy) < 1e-3, 'scale shape');
        assert.ok(Math.abs(evalAt(tr.property('ADBE Opacity').expression, local) - want.alpha * 100) < 0.05, 'opacity');
        checked++;
      }
      // Before birth the layer is invisible.
      assert.equal(evalAt(L.property('ADBE Transform Group').property('ADBE Opacity').expression, part.b - ed.start - 0.01), 0);
    }
  }
  assert.ok(checked > 60, `checked ${checked}`);
  // Particle art: one placeholder per asset, with every variant.
  const conf = log.comps.find((c) => c.name === 'Particle Confetti');
  assert.equal(conf.layers.list.length, 8);
});

test('sticky wilds: the held cell stops showing the spinning strip, in the preview and in After Effects', () => {
  const cases = [freeSpinsProject()];
  const q = cellsProject();
  q.rounds = [newRound('freespins', { seed: 5, sticky: true }), newRound('small', { seed: 6, free: true, extraWilds: 2 }), newRound('none', { seed: 7, free: true }), newRound('fstotal', { seed: 8 })];
  cases.push(q);
  for (const p of cases) {
    const { tl, log, list } = run(p);
    assert.deepEqual(log.alerts, [], log.alerts.join('\n'));
    assert.ok(tl.stickies.length >= 1);
    const { data } = list[0];
    for (const [i, st] of tl.stickies.entries()) {
      // While it pops in, the strip still shows; then the cell is cut out until the block ends.
      const at = (t) => heldCells(tl, t).some((h) => h.c === st.c && h.r === st.r);
      assert.equal(at(st.from + 0.1), false);
      assert.equal(at(st.from + STICKY_COVER + 0.01), true);
      assert.equal(at(Math.min(st.to, tl.duration) + 0.01), false);
      const main = log.comps.find((c) => c.name === p.name);
      const name = p.spin.type === 'cells' ? `Cell ${st.c + 1}-${st.r + 1}` : `Reel ${st.c + 1}`;
      const layer = main.layers.list.find((l) => l.name === name);
      const mask = layer.property('ADBE Mask Parade').children.find((m) => m.name === `Sticky ${i + 1}`);
      assert.ok(mask, `${name} has a mask for sticky ${i + 1}`);
      assert.equal(mask.maskMode, 'subtract');
      const v = mask.property('ADBE Mask Shape').value.vertices;
      const y0 = p.spin.type === 'cells' ? 0 : data.rowsTop - data.winTop + st.r * data.cellH;
      assert.deepEqual(v, [[0, y0], [data.cellW, y0], [data.cellW, y0 + data.cellH], [0, y0 + data.cellH]]);
      const op = (t) => new Function('time', `return eval(${JSON.stringify(mask.property('ADBE Mask Opacity').expression)})`)(t);
      for (const t of [st.from + 0.1, st.from + STICKY_COVER + 0.01, (st.from + Math.min(st.to, tl.duration)) / 2, Math.min(st.to, tl.duration) + 0.01]) assert.equal(op(t), at(t) ? 100 : 0, `${name} at ${t}`);
    }
  }
});

test('the tease: landed scatters fade into the dim or stay lit through it, never cutting, and After Effects matches', () => {
  // A ctrl() slider reads 100%.
  const ev = (expr, t) => new Function('time', 'comp', `return eval(${JSON.stringify(expr)})`)(t, () => ({ layer: () => ({ effect: () => () => 100 }) }));
  const tr = (L, prop) => L.property('ADBE Transform Group').property(prop).expression;
  for (const keep of [false, true]) {
    const p = fruitProject();
    p.spin.scatterLit = keep;
    const { tl, log } = run(p);
    assert.deepEqual(log.alerts, [], log.alerts.join('\n'));
    const R = tl.rounds.find((r) => r.outcome === 'nearmiss');
    const W = teaseWindows(R);
    const lands = landings(R, tl.rows);
    assert.ok(W.length && lands.length >= 2, 'the near miss teases with scatters already down');
    const end = Math.max(...W.map((w) => w[1])) + 0.6;
    for (const l of lands) {
      // Lit as it lands, then no jump bigger than the fastest fade allows.
      assert.equal(landLit(W, l.t, l.t, keep), 1);
      let prev = 1;
      for (let t = l.t; t < end; t += 1 / 120) {
        const v = landLit(W, l.t, t, keep);
        assert.ok(Math.abs(v - prev) <= 0.05, `${keep ? 'kept' : 'faded'} at ${t.toFixed(3)}: ${prev} -> ${v}`);
        prev = v;
        const on = W.some((w) => teaseEnv(w, t) >= 1);
        if (keep && on) assert.equal(v, 1, 'kept lit while the tease runs');
        if (!keep && t > l.t + LAND_POP) assert.equal(v, 0, 'back to the reel once the pop is over');
      }
    }
    // After Effects: a dim solid per reel and a lit copy per landing, on the same numbers.
    const main = log.comps.find((c) => c.name === p.name);
    const all = tl.rounds.flatMap((Q) => teaseWindows(Q)).filter((w) => w[2] >= 0);
    const times = [];
    for (let t = W[0][0] - 0.2; t < end; t += 0.037) times.push(t);
    for (let c = 0; c < tl.reels; c++) {
      const dim = main.layers.list.find((L) => L.name === `Tease Dim R${c + 1}`);
      assert.ok(dim, `reel ${c + 1} has a tease dim`);
      for (const t of times) assert.ok(Math.abs(ev(tr(dim, 'ADBE Opacity'), t) - teaseDim(all, c, t) * 100) < 1e-6, `dim R${c + 1} at ${t}`);
    }
    const copies = main.layers.list.filter((L) => L.name === `Scatter Lands R${R.index + 1}`).reverse();
    assert.equal(copies.length, lands.length);
    for (const [i, l] of lands.entries()) {
      for (const t of times) {
        assert.ok(Math.abs(ev(tr(copies[i], 'ADBE Opacity'), t) - landLit(W, l.t, t, keep) * 100) < 1e-6, `lit copy ${i} at ${t}`);
        if (t >= l.t) assert.ok(Math.abs(ev(tr(copies[i], 'ADBE Scale'), t)[0] - landScale(l.t, t) * 100) < 1e-6);
      }
    }
  }
});
