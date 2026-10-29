// The After Effects hand-off: the script runs the same on a Mac, every font
// is set in one place, every image sits in a placeholder comp, full-screen
// art is never scaled up, and every effect has its controls and takes a
// prerendered movie.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProject, jackpotsProject } from '../src/js/core/defaults.js';
import { buildTimeline } from '../src/js/core/timeline.js';
import { computeLayout } from '../src/js/core/layout.js';
import { buildAEData, buildAEScript, aeAssetFiles, AE_HD } from '../src/js/core/ae-export.js';
import { createAE, runScript } from './ae-mock.js';

const TITLES = ['total', 'bonus', 'freespins', 'retrigger', 'wheel', 'nearmiss', 'holdspin', 'grand', 'jp_major'];

function build(p, extras = {}) {
  const tl = buildTimeline(p);
  const L = computeLayout(p);
  const titleKeys = [...TITLES, ...p.tiers.map((t) => t.id)];
  const data = buildAEData(p, tl, L, { titleKeys, titleTexts: Object.fromEntries(titleKeys.map((k) => [k, `${k.toUpperCase()} WORDS`])), hasLogo: true, ...extras });
  return { tl, L, data, script: buildAEScript([data]) };
}

function run(script, data, { root = '/pkg', os = 'Windows', sizes = {}, files } = {}) {
  const list = files ?? [...aeAssetFiles(data)].map((f) => `${root}/${f}`);
  const abs = Object.fromEntries(Object.entries(sizes).map(([k, v]) => [`${root}/${k}`, v]));
  const { env, log } = createAE({ files: new Set(list), fileName: `${root}/slot.jsx`, os, sizes: abs });
  runScript(script, env);
  return log;
}

// An expression's value, with comp(...).layer(...).effect(...) reading ctl.
// (ctl.none: the use shows a comp without FX CONTROLS.)
const evalExpr = (expr, { time = 0, value = 100, ctl = {}, inPoint = 0 } = {}) => {
  const layer = (name) => {
    if (name === 'FX CONTROLS' && ctl.none) throw new Error('no layer');
    return { effect: (n) => () => ({ value: n in ctl ? ctl[n] : / %$/.test(n) ? 100 : 1 }), text: { sourceText: { style: { font: ctl.font } } } };
  };
  const comp = () => ({ layer });
  const thisLayer = { source: { layer } };
  return new Function('time', 'comp', 'thisComp', 'thisLayer', 'value', 'inPoint', 'text', `return eval(${JSON.stringify(expr)})`)(time, comp, { layer }, thisLayer, value, inPoint, ctl.text);
};
const exprOf = (l, prop) => l.property('ADBE Transform Group').property(prop).expression;
const under = (item, name) => {
  for (let f = item.parentFolder; f; f = f.parentFolder) if (f.name === name) return true;
  return false;
};

test('Mac: the script is plain ASCII, finds its files from a Mac path and keeps every character', () => {
  const p = jackpotsProject();
  p.name = 'Königs Jackpots';
  p.machine.currency = '€';
  p.symbols[0].name = 'Kirsche';
  p.tiers[0].title = 'GROẞER GEWINN';
  const { data, script } = build(p, { titleTexts: { [p.tiers[0].id]: p.tiers[0].title } });
  assert.ok(/^[\x00-\x7f]*$/.test(script), 'ASCII only, whatever encoding After Effects reads it in');
  assert.ok(script.includes('\\u20ac') && script.includes('\\u00f6'));
  // Unzipped into Downloads on a Mac, a folder name with spaces.
  const root = '/Users/me/Downloads/Konigs Jackpots_AE';
  const log = run(script, data, { root, os: 'Macintosh OS 14.5.0' });
  assert.deepEqual(log.alerts, []);
  assert.ok(log.imports.length > 20);
  for (const f of log.imports) assert.ok(f.startsWith(`${root}/assets/`) && !f.includes('\\') && /^[\x20-\x7e]+$/.test(f), f);
  // The characters arrive as themselves: the € in the money expressions,
  // the title words in its editable text.
  assert.ok(log.expressions.some((e) => e.expr.includes("'€'")));
  assert.ok(log.comps.some((c) => c.layers.list.some((l) => l.text === 'GROẞER GEWINN')));
  // Files out of reach: a short list and, on a Mac, where to allow access.
  const none = run(script, data, { root, os: 'Macintosh OS 14.5.0', files: [] });
  assert.equal(none.alerts.length, 1, none.alerts.join('\n'));
  assert.match(none.alerts[0], /were not found/);
  assert.match(none.alerts[0], /Privacy & Security > Files and Folders/);
  assert.ok(none.alerts[0].split('\n').length < 16);
  assert.doesNotMatch(run(script, data, { files: [] }).alerts[0], /Privacy/, 'Windows gets no Mac advice');
});

test('fonts: one Fonts comp; every text layer takes its font from it and keeps its words', () => {
  const p = defaultProject();
  const { data, script } = build(p);
  assert.ok(data.wheel.labels.length, 'the project has a wheel');
  const log = run(script, data);
  const fonts = log.comps.find((c) => c.name === 'Fonts');
  assert.ok(fonts);
  assert.deepEqual(fonts.layers.list.map((l) => l.name).sort(), ['Main Font', 'Wheel Font']);
  const texts = log.comps.filter((c) => c !== fonts).flatMap((c) => c.layers.list.filter((l) => l.text !== undefined).map((l) => [c, l]));
  assert.ok(texts.length > 30);
  for (const [c, l] of texts) {
    const e = l.property('ADBE Text Properties').property('ADBE Text Document').expression;
    const role = c.name.startsWith('Wheel Disc') ? 'Wheel Font' : 'Main Font';
    assert.ok(e.includes(`comp("Fonts").layer("${role}").text.sourceText.style.font`), `${c.name} > ${l.name}`);
  }
  // In After Effects 2020+: the font of the Fonts layer, the words of the
  // expression. Older versions (no text styles) keep the words.
  const meter = texts.find(([, l]) => l.name === 'Win Counter (text)')[1];
  const e = meter.property('ADBE Text Properties').property('ADBE Text Document').expression;
  const text = { sourceText: { style: { setFont: (font) => ({ setText: (words) => ({ font, words }) }) } } };
  assert.deepEqual(evalExpr(e, { ctl: { Amount: 1234.5, font: 'Foo-Bold', text } }), { font: 'Foo-Bold', words: '1,234.50' });
  assert.equal(evalExpr(e, { ctl: { Amount: 1234.5, text: { sourceText: {} } } }), '1,234.50');
  // Painted words (titles, the logo, jackpot names) come with an editable
  // text twin in the Main Font, switched off.
  for (const c of log.comps.filter((x) => x.name.startsWith('Title '))) {
    const key = c.name.slice(6);
    const tw = c.layers.list.find((l) => l.name === 'Text (editable)');
    assert.ok(tw && tw.enabled === false, c.name);
    assert.equal(tw.text, data.titleTexts[key] || key.toUpperCase());
  }
  const j = build(jackpotsProject());
  const jlog = run(j.script, j.data);
  for (const it of j.data.jackpots.items) {
    const tw = jlog.comps.find((c) => c.name === it.name).layers.list.find((l) => l.name === 'Name (editable)');
    assert.ok(tw && tw.enabled === false && tw.text === it.label, it.name);
  }
  const named = build(defaultProject(), { logoText: { text: 'ROYAL SEVENS', px: 80 } });
  const logo = run(named.script, named.data).comps.find((c) => c.name === 'Logo');
  assert.equal(logo.layers.list.find((l) => l.name === 'Text (editable)').text, 'ROYAL SEVENS');
});

test('precomps: every image sits in a placeholder comp; the animation only uses those', () => {
  for (const p of [jackpotsProject(), defaultProject()]) {
    const { data, script } = build(p);
    const log = run(script, data);
    let images = 0;
    for (const c of log.comps)
      for (const l of c.layers.list) {
        if (!/\.png$/.test(l.source?.name || '')) continue;
        images++;
        assert.ok(under(c, 'Placeholder Comps'), `${l.name} in ${c.name}`);
      }
    assert.ok(images > 10);
  }
});

test('HD: full-screen art is painted larger and only ever scaled down', () => {
  const p = jackpotsProject();
  const { L, data, script } = build(p);
  assert.equal(data.hd, AE_HD);
  // Titles as the package paints them: AE_HD times their size.
  const sizes = {};
  for (const [k, f] of Object.entries(data.assets.titles)) sizes[f] = [Math.round(L.H * 0.55 * AE_HD), Math.round(data.titlePx * 1.75 * AE_HD)];
  const log = run(script, data, { sizes });
  // The rays are vector shapes: no file ships, their comps are AE_HD times
  // their biggest use.
  assert.ok(![...aeAssetFiles(data)].some((f) => /rays/.test(f)));
  const rayComps = log.comps.filter((c) => /Rays$/.test(c.name));
  assert.ok(rayComps.length >= 1);
  for (const c of rayComps) assert.ok(c.layers.list.some((l) => l.name === 'Rays' && l.property('ADBE Mask Parade').children.length === 1));
  // The classic preset uses both: the big rays (wheel, big win) and the
  // small ones (scatters celebrating), each drawn larger than any use.
  const cl = build(defaultProject());
  const clog = run(cl.script, cl.data);
  for (const key of ['FX Light Rays', 'FX Small Rays']) {
    const c = clog.comps.find((x) => x.name === key);
    assert.ok(c, key);
    for (const l of clog.comps.flatMap((x) => x.layers.list).filter((x) => x.source === c)) {
      const v = evalExpr(exprOf(l, 'ADBE Scale'), { time: 99, value: l.property('ADBE Transform Group').property('ADBE Scale').value })[0];
      assert.ok(v <= 100 / AE_HD + 0.5, `${l.name} at ${v}%`);
    }
  }
  const uses = log.comps.flatMap((c) => c.layers.list.map((l) => [c, l]));
  // Titles: at most 1 / AE_HD of the art, springing and breathing.
  const titles = uses.filter(([, l]) => /^Title /.test(l.name) && l.source?.layers);
  assert.ok(titles.length >= 3);
  for (const [, l] of titles) for (const t of [0.4, 0.8, 3]) assert.ok(evalExpr(exprOf(l, 'ADBE Scale'), { time: t, inPoint: 0 })[0] <= (100 / AE_HD) * 1.04, l.name);
  // Rays at most 1 / AE_HD; shockwaves and counters never past 100%.
  const rayUses = uses.filter(([, l]) => /Rays$/.test(l.name) && l.source?.layers);
  assert.ok(rayUses.length >= 3);
  for (const [, l] of rayUses) {
    const e = exprOf(l, 'ADBE Scale');
    const v = evalExpr(e, { time: 99, value: l.property('ADBE Transform Group').property('ADBE Scale').value })[0];
    assert.ok(v <= 100 / AE_HD + 0.5, `${l.name} at ${v}%`);
  }
  const rings = uses.filter(([, l]) => l.name === 'Shockwave');
  assert.ok(rings.length > 5);
  for (const [, l] of rings) assert.ok(l.property('ADBE Transform Group').property('ADBE Scale').value[0] <= 100, `ring at ${l.property('ADBE Transform Group').property('ADBE Scale').value[0]}%`);
  const counters = uses.filter(([, l]) => / Counter$/.test(l.name) && l.source?.layers);
  assert.ok(counters.length >= 3);
  // A counter slams to 120%: still at most half the rig's size.
  for (const [, l] of counters) assert.ok(l.property('ADBE Transform Group').property('ADBE Scale').value[0] * 1.2 <= 100 / AE_HD + 0.5, `${l.name} at ${l.property('ADBE Transform Group').property('ADBE Scale').value[0]}%`);
  // A merged winner grows from the symbol art itself.
  assert.ok(log.comps.filter((c) => c.parentFolder?.name === 'Symbols' && /^Win /.test(c.name)).every((c) => c.layers.list.every((l) => !l.source?.layers || l.collapseTransformation)));
});

test('effects: every effect placeholder has FX CONTROLS that drive its uses; a prerendered movie plays in full', () => {
  const p = jackpotsProject();
  const { data, script } = build(p);
  const log = run(script, data);
  const effects = log.comps.filter((c) => c.parentFolder?.name === 'Effects');
  assert.ok(effects.length >= 8);
  for (const c of effects) assert.ok(c.layers.list.some((l) => l.name === 'FX CONTROLS'), c.name);
  for (const c of log.comps.filter((x) => x.parentFolder?.name === 'Titles')) assert.ok(c.layers.list.some((l) => l.name === 'FX CONTROLS'), c.name);
  const uses = log.comps.flatMap((c) => c.layers.list.filter((l) => effects.includes(l.source)).map((l) => [c, l]));
  assert.ok(uses.length > 30);
  for (const [c, l] of uses) {
    const name = l.source.name;
    assert.ok(exprOf(l, 'ADBE Opacity').includes('thisLayer.source.layer("FX CONTROLS")') && exprOf(l, 'ADBE Opacity').includes('fxc("Opacity %", 100)'), `${c.name} > ${l.name} opacity`);
    assert.ok(exprOf(l, 'ADBE Scale').includes('fxc("Size %", 100)'), `${c.name} > ${l.name} size`);
    assert.ok(!exprOf(l, 'ADBE Opacity').includes(`comp("${name}")`), 'not tied to the placeholder by name');
  }
  // Opacity % and Size % scale a use.
  const [, ring] = uses.find(([, l]) => l.name === 'Shockwave');
  assert.equal(evalExpr(exprOf(ring, 'ADBE Opacity'), { ctl: { 'Opacity %': 40 } }), 40);
  assert.deepEqual(evalExpr(exprOf(ring, 'ADBE Scale'), { value: [80, 80], ctl: { 'Size %': 150 } }), [120, 120]);
  // Swapped for a comp of your own without FX CONTROLS: the defaults.
  assert.equal(evalExpr(exprOf(ring, 'ADBE Opacity'), { value: 70, ctl: { none: true } }), 70);
  assert.deepEqual(evalExpr(exprOf(ring, 'ADBE Scale'), { value: [80, 80], ctl: { none: true } }), [80, 80]);
  // Colour: the use's tint follows its effect's switch and the global one.
  const tintAmt = ring.property('ADBE Effect Parade').children.find((e) => e.matchName === 'ADBE Tint').property('ADBE Tint-0003').expression;
  assert.ok(tintAmt.includes('fxc("Colour", 1)') && tintAmt.includes('effect("FX Colour")'));
  // A shockwave use lasts long enough for a 4 second movie (or to the end).
  const shock = effects.find((c) => c.name === 'FX Shockwave');
  assert.ok(shock.duration >= 4);
  for (const [c, l] of uses.filter(([, x]) => x.name === 'Shockwave')) assert.ok(l.outPoint - l.inPoint >= Math.min(4, c.duration - l.inPoint) - 1e-6, `${c.name} shockwave at ${l.inPoint}`);
  // Built-in motion off: rays stop spinning and popping, titles stop springing.
  const rays = log.comps.flatMap((c) => c.layers.list).filter((l) => l.name === 'Light Rays');
  assert.ok(rays.length);
  const rot = rays[0].property('ADBE Transform Group').property('ADBE Rotate Z').expression;
  assert.equal(evalExpr(rot, { time: 2, ctl: { 'Built-in Motion': 0 } }), 0);
  assert.ok(Math.abs(evalExpr(rot, { time: 2, ctl: { 'Spin %': 200 } })) > 20);
  const title = log.comps.flatMap((c) => c.layers.list).find((l) => /^Title /.test(l.name) && l.source?.layers);
  const off = evalExpr(exprOf(title, 'ADBE Scale'), { time: 0.1, ctl: { 'Built-in Motion': 0 } });
  assert.deepEqual(off, evalExpr(exprOf(title, 'ADBE Scale'), { time: 2.3, ctl: { 'Built-in Motion': 0 } }));
});
