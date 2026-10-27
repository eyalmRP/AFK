import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProject, newRound } from '../src/js/core/defaults.js';
import { buildTimeline } from '../src/js/core/timeline.js';
import { computeLayout } from '../src/js/core/layout.js';
import { evalKeys, key } from '../src/js/core/keys.js';
import { generatePaylines } from '../src/js/core/paylines.js';
import { buildAEData, buildAEScript, AE_ASSETS } from '../src/js/core/ae-export.js';
import { createAE, runScript } from './ae-mock.js';

function visibleColumn(tl, c, t) {
  const P = Math.round(evalKeys(tl.reelKeys[c], t));
  const col = [];
  for (let k = 0; k < tl.rows; k++) col[tl.dir > 0 ? tl.rows - 1 - k : k] = tl.strips[c][P + k];
  return col;
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
    assert.ok(lines.length >= 1);
    assert.equal(new Set(lines.map((l) => l.join())).size, lines.length);
    for (const l of lines) {
      assert.equal(l.length, reels);
      assert.ok(l.every((r) => r >= 0 && r < rows));
    }
    assert.ok(lines[0].every((r) => r === Math.floor((rows - 1) / 2)));
  }
});

test('reels land exactly on every round grid, for every spin style', () => {
  const p = defaultProject();
  for (const endStyle of ['bounce', 'elastic', 'hard', 'soft']) {
    for (const startStyle of ['windup', 'ease', 'instant']) {
      for (const direction of ['down', 'up']) {
        p.spin = { ...p.spin, endStyle, startStyle, direction };
        const tl = buildTimeline(p);
        for (const R of tl.rounds) {
          for (let c = 0; c < tl.reels; c++) {
            const P = evalKeys(tl.reelKeys[c], R.spinEnd + 0.01);
            assert.ok(Math.abs(P - Math.round(P)) < 1e-6, `reel ${c} not aligned (${endStyle}/${startStyle})`);
            assert.deepEqual(visibleColumn(tl, c, R.spinEnd + 0.01), R.grid[c]);
          }
        }
      }
    }
  }
});

test('timeline is deterministic', () => {
  const a = buildTimeline(defaultProject());
  const b = buildTimeline(defaultProject());
  assert.deepEqual(a.strips, b.strips);
  assert.deepEqual(a.rounds.map((r) => r.grid), b.rounds.map((r) => r.grid));
});

test('no-win rounds have no payline wins; line wins pay their lines', () => {
  const p = defaultProject();
  p.rounds = [];
  for (let i = 0; i < 30; i++) p.rounds.push(newRound(i % 3 ? 'none' : 'small', { seed: i * 7 + 1 }));
  const tl = buildTimeline(p);
  const wild = new Set(p.symbols.map((s, i) => (s.role === 'wild' ? i : -1)).filter((i) => i >= 0));
  for (const R of tl.rounds) {
    for (const [li, line] of tl.paylines.entries()) {
      let sym = -1;
      let len = 0;
      for (let c = 0; c < line.length; c++) {
        const s = R.grid[c][line[c]];
        if (sym === -1) {
          len++;
          if (!wild.has(s)) sym = s;
        } else if (s === sym || wild.has(s)) len++;
        else break;
      }
      const paid = R.win.lines.some((l) => l.index === li);
      if (R.outcome === 'none') assert.ok(len < 3, `round ${R.index} has an accidental win on line ${li}`);
      else if (len >= 3) assert.ok(paid, `round ${R.index} line ${li} wins but is not shown`);
    }
  }
});

test('scatter rounds place the scatters and tease later reels', () => {
  const p = defaultProject();
  p.rounds = [newRound('freespins', { seed: 3 }), newRound('nearmiss', { seed: 4 })];
  const tl = buildTimeline(p);
  const [fs, nm] = tl.rounds;
  assert.equal(fs.win.scatters.length, 3);
  assert.ok(fs.reels.some((r) => r.antic));
  assert.equal(nm.win.scatters.length, 2);
  assert.ok(nm.reels[p.grid.reels - 1].antic);
});

test('wheel lands on the chosen segment', () => {
  const p = defaultProject();
  for (const seg of [0, 3, 7, 11]) {
    p.rounds = [newRound('wheel', { seed: 9, wheelSegment: seg })];
    const tl = buildTimeline(p);
    const w = tl.rounds[0].pres.wheel;
    const theta = evalKeys(tl.wheelKeys, w.spinEnd + 0.01);
    const segDeg = 360 / p.wheel.segments.length;
    const local = (((-theta) % 360) + 360) % 360;
    assert.equal(Math.floor(local / segDeg), seg);
  }
});

test('cascade rounds drop every cell into place', () => {
  const p = defaultProject();
  p.spin.type = 'cascade';
  const tl = buildTimeline(p);
  for (const R of tl.rounds) {
    for (const col of R.cascade) for (const ck of col) assert.ok(Math.abs(evalKeys(ck.inKeys, R.spinEnd + 0.01)) < 1e-6);
  }
});

function exportScript(project) {
  const tl = buildTimeline(project);
  const L = computeLayout(project);
  const data = buildAEData(project, tl, L, { wheelR: 380 });
  return { tl, L, data, src: buildAEScript(data) };
}

function allAssetPaths(data) {
  const a = data.assets;
  const list = [a.background, a.back, a.front, a.bulbsA, a.bulbsB, a.hud, a.logo, a.vignette, a.coin, a.rays, a.raysSmall, a.wheelDisc, a.wheelRing, a.wheelBulbsA, a.wheelBulbsB, a.wheelPointer, ...Object.values(a.titles), ...data.symbols.map((s) => s.file)];
  return new Set(list.filter(Boolean).map((p) => `/pkg/${p}`));
}

test('AE script runs against the mock DOM without errors or missing assets', () => {
  for (const type of ['classic', 'cascade']) {
    const p = defaultProject();
    p.spin.type = type;
    p.rounds.push(newRound('freespins', { seed: 21 }), newRound('epic', { seed: 22 }), newRound('medium', { seed: 23 }));
    const { data, src } = exportScript(p);
    const { env, log } = createAE({ files: allAssetPaths(data) });
    runScript(src, env);
    assert.deepEqual(log.alerts, [], log.alerts.join('\n'));
    assert.ok(log.comps.some((c) => c.name === p.name));
    assert.ok(log.comps.some((c) => c.name === 'Symbols Atlas'));
    // Every expression must at least parse as JavaScript.
    for (const e of log.expressions) assert.doesNotThrow(() => new Function(e.expr), `${e.comp} / ${e.layer} / ${e.prop}`);
  }
});

test('AE reel expressions show the same symbols as the preview', () => {
  const p = defaultProject();
  const { tl, L, src } = exportScript(p);
  const { env, log } = createAE({ files: new Set() });
  runScript(src, env);
  const reelComps = log.comps.filter((c) => /^Reel \d+$/.test(c.name));
  assert.equal(reelComps.length, p.grid.reels);
  for (const [c, comp] of reelComps.entries()) {
    const spin = comp.layers.list.find((l) => l.name === 'CTRL').property('ADBE Effect Parade').children[0].property(1);
    const cells = comp.layers.list.filter((l) => /^Cell /.test(l.name));
    for (const R of tl.rounds) {
      const t = R.spinEnd + 0.01;
      const pval = evalKeys(tl.reelKeys[c], t);
      const shown = {};
      for (const cell of cells) {
        const remap = cell.property('ADBE Time Remapping').expression;
        const posE = cell.property('ADBE Transform Group').property('ADBE Position').expression;
        const thisComp = { width: comp.width, frameDuration: comp.frameDuration, layer: () => ({ effect: () => () => ({ value: pval }) }) };
        const sym = Math.round(new Function('thisComp', `return eval(${JSON.stringify(remap)})`)(thisComp) / comp.frameDuration - 0.5);
        const xy = new Function('thisComp', `return eval(${JSON.stringify(posE)})`)(thisComp);
        const rowPos = xy[1] / L.cellH - 0.5 - tl.peek;
        const r = Math.round(rowPos);
        if (Math.abs(rowPos - r) < 1e-6 && r >= 0 && r < tl.rows) shown[r] = sym;
      }
      assert.deepEqual(Object.keys(shown).sort().map((k) => shown[k]), R.grid[c], `reel ${c} round ${R.index}`);
    }
    assert.ok(spin.keys.length > 3);
  }
});

test('AE asset list matches the packager names', () => {
  const p = defaultProject();
  const { data } = exportScript(p);
  assert.equal(data.symbols[0].file, AE_ASSETS.symbol(0));
  assert.equal(data.assets.titles.mega, AE_ASSETS.title('mega'));
});
