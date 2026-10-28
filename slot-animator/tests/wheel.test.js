import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProject, wheelProject, newRound, DEFAULT_SEGMENTS } from '../src/js/core/defaults.js';
import { buildTimeline } from '../src/js/core/timeline.js';
import { computeLayout } from '../src/js/core/layout.js';
import { evalKeys } from '../src/js/core/keys.js';
import { cameraAt } from '../src/js/core/camera.js';
import { buildAEData, buildAEScript } from '../src/js/core/ae-export.js';
import { WHEEL_FRAMINGS, WHEEL_LANDINGS, WHEEL_ICONS, SLIP, POINTER_MAX, wheelConfig, pointerAt, pointerDeflection, autoIcons, iconName, segmentLayout, wheelLandings, segmentKind } from '../src/js/core/wheel.js';
import { parseFontNames, fontPostScript, projectFonts } from '../src/js/core/fonts.js';
import { createAE, runScript } from './ae-mock.js';

const segDegOf = (p) => 360 / p.wheel.segments.length;
// The segment under the pointer when the wheel stands at theta.
const under = (p, theta, P) => Math.floor((((P - theta) % 360) + 360) % 360 / segDegOf(p));

// A plain wheel: prizes only, no icons, no push-in.
function spins(extra = {}) {
  const p = wheelProject();
  p.wheel.segments = DEFAULT_SEGMENTS.map((s) => ({ ...s }));
  p.wheel.push = 0;
  p.rounds = [newRound('wheel', { seed: 1, wheelSegment: 3 }), newRound('wheel', { seed: 2, wheelSegment: 7 }), newRound('wheel', { seed: 3, wheelSegment: 0 })];
  Object.assign(p.wheel, extra);
  return p;
}

test('wheel framing: the whole wheel by default, bigger than the screen when zoomed, title and prize on screen', () => {
  const p = wheelProject();
  const L = computeLayout(p);
  const G = L.wheel;
  assert.deepEqual([G.cx, G.cy, G.R], [L.W / 2, L.H * 0.54, Math.round(Math.min(L.H * 0.36, L.W * 0.4))], 'same as before by default');
  assert.equal(G.pointerAngle, 0);
  assert.ok(G.pivot.y < G.cy && G.tip.y < G.cy);
  for (const f of WHEEL_FRAMINGS) {
    const q = wheelProject();
    Object.assign(q.wheel, { size: f.size, x: f.x, y: f.y, pointer: f.pointer || 'top' });
    const W = computeLayout(q).wheel;
    if (f.id !== 'full') assert.ok(W.cy + W.R > L.H || W.cy - W.R < 0, `${f.id} runs off screen`);
    for (const [x, y] of [[W.title.x, W.title.y], [W.plaque.x, W.plaque.y], [W.pivot.x, W.pivot.y]]) assert.ok(x > 0 && x < L.W && y > 0 && y < L.H, `${f.id}: on screen`);
    assert.ok(W.plaque.R <= W.base + 1e-9, 'the plaque keeps its size');
  }
  // The pointer at the bottom points up from below the wheel.
  const b = computeLayout(spins({ pointer: 'bottom' })).wheel;
  assert.equal(b.pointerAngle, 180);
  assert.ok(b.pivot.y > b.cy && b.tip.y > b.cy);
});

test('wheel landing: every landing style stops on the chosen segment, with the pointer at the top or the bottom', () => {
  for (const pointer of ['top', 'bottom']) {
    for (const { id } of WHEEL_LANDINGS) {
      const p = spins({ pointer, landing: id });
      const tl = buildTimeline(p);
      const P = pointer === 'bottom' ? 180 : 0;
      tl.rounds.forEach((R, i) => {
        const w = R.pres.wheel;
        const th = evalKeys(tl.wheelKeys, w.spinEnd + 0.5);
        assert.equal(under(p, th, P), p.rounds[i].wheelSegment, `${pointer}/${id} round ${i}`);
        assert.equal(w.landing, id);
      });
    }
  }
});

test('wheel almost slips: creeps into the next peg, rolls back, and the pointer springs past straight', () => {
  const p = spins({ landing: 'slip' });
  const tl = buildTimeline(p);
  const seg = segDegOf(p);
  const plain = buildTimeline(spins({ landing: 'center' }));
  for (const [i, R] of tl.rounds.entries()) {
    const w = R.pres.wheel;
    assert.ok(Math.abs(w.spinEnd - w.spinStart - (plain.rounds[i].pres.wheel.spinEnd - plain.rounds[i].pres.wheel.spinStart) - SLIP.creep - SLIP.roll) < 1e-9, 'the slip adds its creep and roll');
    // Peak: the furthest the wheel gets, right against the next peg.
    let peak = -Infinity;
    let tPeak = 0;
    for (let t = w.spinStart; t <= w.spinEnd; t += 1 / 120) {
      const th = evalKeys(tl.wheelKeys, t);
      if (th > peak) [peak, tPeak] = [th, t];
    }
    const u = ((peak / seg) % 1 + 1) % 1;
    assert.ok(Math.abs(u - SLIP.peak) < 1e-3, `peaks at ${u}`);
    assert.ok(pointerDeflection(peak, seg) < -POINTER_MAX * 0.9, 'the pointer strains against the peg');
    assert.ok(evalKeys(tl.wheelKeys, w.spinEnd) < peak - seg * 0.25, 'then rolls back');
    assert.ok(tPeak < w.spinEnd - 0.4);
    // Release: the pointer swings past straight, then settles.
    assert.ok(w.kick && w.kick.t > tPeak && w.kick.t < w.spinEnd);
    const swing = Math.max(...Array.from({ length: 60 }, (_, k) => pointerAt(evalKeys(tl.wheelKeys, w.kick.t + k / 120), seg, 0, w.kick.t + k / 120, w.kick)));
    assert.ok(swing > 5, `overshoot ${swing}`);
    const settled = w.spinEnd + 1.2;
    assert.ok(Math.abs(pointerAt(evalKeys(tl.wheelKeys, settled), seg, 0, settled, w.kick)) < 0.5);
    assert.ok(tl.sfx.some((e) => e.type === 'wheelTick' && Math.abs(e.t - w.kick.t) < 1e-9), 'a tick as it snaps free');
  }
  // Other landings have no kick.
  assert.ok(buildTimeline(spins({ landing: 'tease' })).rounds.every((R) => R.pres.wheel.kick === null));
});

test('wheel push-in: the camera zooms on the pointer as the wheel slows, only when asked', () => {
  assert.deepEqual(buildTimeline(spins()).camera, []);
  const p = spins({ push: 0.4 });
  const tl = buildTimeline(p);
  const L = computeLayout(p);
  assert.equal(tl.camera.length, 3);
  for (const [i, w] of tl.camera.entries()) {
    const ww = tl.rounds[i].pres.wheel;
    assert.equal(w.amount, 0.4);
    assert.ok(w.start < ww.spinEnd && w.end === ww.spinEnd);
    const at = cameraAt(tl.camera, w.end - 0.05, L, 0.2);
    assert.ok(Math.abs(at.z - 1.4) < 1e-6, 'its own amount, not the reel zoom');
    assert.deepEqual([at.x, at.y], [L.wheel.tip.x, L.wheel.tip.y]);
  }
});

// A minimal TrueType file: a table directory with one "name" table.
function fakeFont(names) {
  const recs = Object.entries(names).map(([id, s]) => ({ id: Number(id), bytes: [...s].flatMap((ch) => [0, ch.charCodeAt(0)]) }));
  const strLen = recs.reduce((n, r) => n + r.bytes.length, 0);
  const nameLen = 6 + recs.length * 12 + strLen;
  const buf = new Uint8Array(12 + 16 + nameLen);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, 0x00010000);
  dv.setUint16(4, 1);
  buf.set([...'name'].map((c) => c.charCodeAt(0)), 12);
  dv.setUint32(20, 28);
  dv.setUint32(24, nameLen);
  dv.setUint16(28 + 2, recs.length);
  dv.setUint16(28 + 4, 6 + recs.length * 12);
  let off = 0;
  recs.forEach((r, i) => {
    const p = 28 + 6 + i * 12;
    dv.setUint16(p, 3);
    dv.setUint16(p + 2, 1);
    dv.setUint16(p + 4, 0x409);
    dv.setUint16(p + 6, r.id);
    dv.setUint16(p + 8, r.bytes.length);
    dv.setUint16(p + 10, off);
    buf.set(r.bytes, 28 + 6 + recs.length * 12 + off);
    off += r.bytes.length;
  });
  return buf;
}

test('fonts: uploaded TTF names, and the PostScript name After Effects asks for', () => {
  assert.deepEqual(parseFontNames(fakeFont({ 1: 'Party Time', 2: 'Bold', 6: 'PartyTime-Bold' })), { family: 'Party Time', style: 'Bold', postscript: 'PartyTime-Bold' });
  assert.equal(parseFontNames(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])), null);
  const p = defaultProject();
  p.fonts = [{ id: 'f1', family: 'Party Time', ps: 'PartyTime-Bold', src: '' }];
  assert.equal(fontPostScript(p, 'Party Time'), 'PartyTime-Bold');
  assert.equal(fontPostScript(p, 'Lilita One'), 'LilitaOne-Regular');
  assert.ok(projectFonts(p).includes('Party Time') && projectFonts(p).includes('Bungee'));
});

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('wheel in After Effects: a disc comp of parts, label text in the label font, and the pointer moves like the preview', () => {
  for (const pointer of ['top', 'bottom']) {
    const p = spins({ pointer, landing: 'slip', labelFont: 'Party Time', labelPalette: 'white' });
    p.fonts = [{ id: 'f1', family: 'Party Time', ps: 'PartyTime-Bold', src: '' }];
    p.wheel.art.face = PNG;
    p.wheel.segments[2].icon = PNG;
    p.wheel.segments[5].icon = PNG;
    p.wheel.segments[1].color = null;
    p.wheel.show.bulbs = false;
    const tl = buildTimeline(p);
    const L = computeLayout(p);
    const data = buildAEData(p, tl, L, { titleKeys: ['wheel'] });
    assert.equal(data.wheel.icons.length, 2);
    assert.equal(data.wheel.labels.length, p.wheel.segments.length);
    assert.equal(data.assets.wheelBulbsA, '', 'no bulbs when they are off');
    const files = new Set([data.assets.wheelFace, data.assets.wheelSegments, data.assets.wheelHub, data.assets.wheelRing, data.assets.wheelPointer, ...data.wheel.icons.map((i) => i.file)].map((f) => `/pkg/${f}`));
    const { env, log } = createAE({ files });
    runScript(buildAEScript([data]), env);
    assert.deepEqual(log.alerts.filter((a) => /error/i.test(a)), []);
    const disc = log.comps.find((c) => c.name === 'Wheel Disc');
    assert.ok(disc, 'Wheel Disc placeholder comp');
    const names = disc.layers.list.map((l) => l.name);
    for (const n of ['Wheel Face', 'Wheel Segments', 'Icon 03', 'Icon 06', 'Wheel Hub']) assert.ok(names.includes(n), `${n} in ${names.join(', ')}`);
    const labels = disc.layers.list.filter((l) => /^Label /.test(l.name));
    assert.equal(labels.length, p.wheel.segments.length);
    const first = labels.find((l) => l.name.startsWith('Label 1 '));
    const td = first.property('ADBE Text Properties').property('ADBE Text Document').value;
    assert.equal(td.font, 'PartyTime-Bold');
    assert.deepEqual(td.fillColor, [1, 1, 1]);
    // Label 1 sits in segment 1, reading outwards.
    const a = (-90 + 180 / p.wheel.segments.length) * (Math.PI / 180);
    const xy = first.property('ADBE Transform Group').property('ADBE Position').value;
    assert.ok(Math.abs(xy[0] - (disc.width / 2 + Math.cos(a) * L.wheel.R * 0.6)) < 0.01 && Math.abs(xy[1] - (disc.height / 2 + Math.sin(a) * L.wheel.R * 0.6)) < 0.01);
    // The pointer: anchored at its pivot, placed at the wheel's pivot, and
    // its rotation follows the disc like the preview, overshoot included.
    const R = data.rounds[0];
    const comp = log.comps.find((c) => /^R01 /.test(c.name));
    const ptr = comp.layers.list.find((l) => l.name === 'Pointer');
    const tr = ptr.property('ADBE Transform Group');
    assert.deepEqual(tr.property('ADBE Position').value, data.wheel.pivot);
    const discL = comp.layers.list.find((l) => l.name === 'Wheel Disc');
    const rot = discL.property('ADBE Transform Group').property('ADBE Rotate Z');
    const w = tl.rounds[0].pres.wheel;
    const P = pointer === 'bottom' ? 180 : 0;
    for (let t = w.spinStart + 0.5; t < w.spinEnd + 1; t += 0.137) {
      const th = evalKeys(tl.wheelKeys, t);
      const thisComp = { layer: () => ({ transform: { rotation: { value: th } } }) };
      const got = new Function('time', 'thisComp', `return eval(${JSON.stringify(tr.property('ADBE Rotate Z').expression)})`)(t - R.start, thisComp);
      const want = P + pointerAt(th, segDegOf(p), P, t, w.kick);
      assert.ok(Math.abs(got - want) < 0.05, `${pointer} pointer at ${t}: ${got} vs ${want}`);
    }
    assert.ok(rot.keys.length >= 5, 'the slip keys reach the disc');
  }
});

test('wheel icons: one on every segment, richer for bigger prizes, and the centre icon', () => {
  const p = wheelProject();
  const segs = p.wheel.segments;
  assert.ok(segs.every((s) => segmentKind(s) === 'none' || iconName(s.icon)), 'the wheel preset has an icon on every segment but its No win');
  const auto = autoIcons(segs);
  assert.equal(auto.length, segs.length);
  const ids = WHEEL_ICONS.map((i) => i.id);
  assert.ok(auto.every((v) => ids.includes(iconName(v))));
  const top = segs.reduce((a, s, i) => (Number(s.value) > Number(segs[a].value) ? i : a), 0);
  assert.equal(auto[top], 'builtin:seven', 'the top prize is the Lucky 7');
  const rank = (v) => ['cherry', 'bell', 'bar', 'emerald', 'ruby', 'diamond', 'crown', 'seven'].indexOf(iconName(v));
  for (let i = 0; i < segs.length; i++) for (let j = 0; j < segs.length; j++) if (Number(segs[i].value) < Number(segs[j].value)) assert.ok(rank(auto[i]) <= rank(auto[j]));
  // The centre: the star, unless the hub is your own art; "none" removes it.
  assert.equal(wheelConfig(p).centerIcon, 'builtin:star');
  p.wheel.art.hub = 'data:image/png;base64,x';
  assert.equal(wheelConfig(p).centerIcon, 'none');
  p.wheel.centerIcon = 'builtin:crown';
  assert.equal(wheelConfig(p).centerIcon, 'builtin:crown');
});

test('wheel icons in After Effects: every segment icon and the centre icon are parts of their own', () => {
  for (const hubSpins of [true, false]) {
    const p = wheelProject();
    p.wheel.hubSpins = hubSpins;
    const tl = buildTimeline(p);
    const L = computeLayout(p);
    const data = buildAEData(p, tl, L, { titleKeys: [] });
    const withIcon = p.wheel.segments.filter((s) => s.icon).length;
    assert.ok(withIcon >= p.wheel.segments.length - 1);
    assert.equal(data.wheel.icons.length, withIcon);
    assert.ok(data.assets.wheelCenter);
    const files = new Set([data.assets.wheelSegments, data.assets.wheelHub, data.assets.wheelCenter, data.assets.wheelRing, data.assets.wheelPointer, ...data.wheel.icons.map((i) => i.file)].map((f) => `/pkg/${f}`));
    const { env, log } = createAE({ files });
    runScript(buildAEScript([data]), env);
    const disc = log.comps.find((c) => c.name === 'Wheel Disc');
    const names = disc.layers.list.map((l) => l.name);
    assert.equal(names.filter((n) => /^Icon \d\d$/.test(n)).length, withIcon);
    const round = log.comps.find((c) => /^R01 /.test(c.name)).layers.list.map((l) => l.name);
    assert.equal(names.includes('Wheel Center'), hubSpins, 'turns with the disc');
    assert.equal(round.includes('Wheel Center'), !hubSpins, 'or stays still over it');
    // With no centre icon, no part.
    p.wheel.centerIcon = 'none';
    assert.equal(buildAEData(p, tl, L, { titleKeys: [] }).assets.wheelCenter, '');
  }
});

test('wheel icon and text height: automatic by default, placed by hand, sizes fit the wedge', () => {
  const p = wheelProject();
  const L = computeLayout(p);
  const R = L.wheel.R;
  let lay = segmentLayout(p.wheel.segments, R, p);
  assert.ok(Math.abs(lay[0].icon.r - 0.75 * R) < 1e-9 && Math.abs(lay[0].label.r - 0.42 * R) < 1e-9, 'icon near the rim, text towards the hub');
  p.wheel.iconHeight = 0.5;
  p.wheel.labelHeight = 0.82;
  lay = segmentLayout(p.wheel.segments, R, p);
  for (const it of lay) {
    assert.ok((!it.icon || Math.abs(it.icon.r - 0.5 * R) < 1e-9) && Math.abs(it.label.r - 0.82 * R) < 1e-9);
    assert.ok(it.label.maxLen <= 2 * (0.97 - 0.82) * R + 1e-9, 'the text stays inside the rim');
  }
  // Close to the hub the text shrinks to the wedge's width there.
  p.wheel.labelHeight = 0.2;
  const seg = (Math.PI * 2) / p.wheel.segments.length;
  for (const it of segmentLayout(p.wheel.segments, R, p)) assert.ok(it.label.px <= 2 * it.label.r * Math.sin(seg / 2) * 0.85 + 1e-9);
  // After Effects places its text layers at the same height.
  p.wheel.labelHeight = 0.82;
  const data = buildAEData(p, buildTimeline(p), L, { titleKeys: [] });
  assert.ok(data.wheel.labels.every((l) => Math.abs(l.r - 0.82 * R) < 1e-3));
  assert.ok(data.wheel.icons.every((i) => Math.abs(i.r - 0.5 * R) < 1e-3));
});

test('wheel segments: spin again spins once more to the next segment, no win pays nothing', () => {
  const p = spins();
  p.wheel.segments[1].kind = 'again';
  p.wheel.segments[4].kind = 'none';
  p.rounds = [newRound('wheel', { seed: 1, wheelSegment: 1, wheelThen: 3 }), newRound('wheel', { seed: 2, wheelSegment: 4 }), newRound('wheel', { seed: 3, wheelSegment: 1 })];
  assert.deepEqual(wheelLandings(p, p.rounds[0]), [1, 3]);
  assert.deepEqual(wheelLandings(p, p.rounds[1]), [4]);
  assert.deepEqual(wheelLandings(p, p.rounds[2]), [1, 0], 'no "then": the first prize');
  const tl = buildTimeline(p);
  const seg = segDegOf(p);
  const [R0, R1, R2] = tl.rounds;
  // Spin again: it stops on the spin-again segment, says so, then lands on segment 3 and pays it.
  const w0 = R0.pres.wheel;
  assert.equal(w0.agains.length, 1);
  const g = w0.agains[0];
  assert.equal(under(p, evalKeys(tl.wheelKeys, g.at), 0), 1);
  assert.equal(under(p, evalKeys(tl.wheelKeys, w0.spinEnd + 0.3), 0), 3);
  assert.ok(evalKeys(tl.wheelKeys, g.until + 1.5) > evalKeys(tl.wheelKeys, g.at) + 360, 'it turns again');
  assert.equal(R0.win.amount, p.wheel.segments[3].value * p.machine.bet);
  assert.ok(tl.sfx.some((e) => e.type === 'wheelAgain' && e.t > g.at - 0.3 && e.t < g.at));
  // No win: nothing to count.
  const w1 = R1.pres.wheel;
  assert.equal(w1.noWin, true);
  assert.equal(R1.win.amount, 0);
  assert.ok(!tl.sfx.some((e) => e.type === 'count' && e.t >= w1.spinEnd && e.t <= w1.countEnd + 0.1));
  assert.ok(tl.sfx.some((e) => e.type === 'nearMiss' && e.t > w1.spinEnd));
  assert.ok(!R1.pres.particles.some((e) => e.moment === 'wheel'), 'no prize particles');
  assert.equal(R2.win.amount, p.wheel.segments[0].value * p.machine.bet);
  void seg;
  // After Effects: a glow and a plaque for the spin again, a no-win label without a counter.
  const L = computeLayout(p);
  const data = buildAEData(p, tl, L, { titleKeys: [] });
  assert.equal(data.rounds[0].wheel.agains.length, 1);
  assert.equal(data.rounds[1].wheel.noWin, 1);
  const files = new Set([data.assets.wheelSegments, data.assets.wheelHub, data.assets.wheelCenter, data.assets.wheelRing, data.assets.wheelPointer].map((f) => `/pkg/${f}`));
  const { env, log } = createAE({ files });
  runScript(buildAEScript([data]), env);
  assert.deepEqual(log.alerts.filter((a) => /error/i.test(a)), []);
  const c0 = log.comps.find((c) => /^R01 /.test(c.name)).layers.list.map((l) => l.name);
  assert.ok(c0.includes('Spin Again Segment 1') && c0.includes('Spin Again Plaque 1') && c0.includes('Spin Again Label 1'));
  const c1 = log.comps.find((c) => /^R02 /.test(c.name)).layers.list.map((l) => l.name);
  assert.ok(c1.includes('No Win Label') && !c1.includes('WIN CTRL'), 'no counter on a no win');
  assert.equal(segmentKind({ kind: 'weird' }), 'prize');
});
