// After Effects export. Produces a self-contained ExtendScript (.jsx) that
// rebuilds the animation as a layered, editable After Effects project:
// - each reel is a precomp driven by one "Spin" slider whose keyframes and
//   speed/influence eases are the exact curves the preview plays,
// - symbols live in a "Symbols Atlas" comp (one symbol per frame), so
//   swapping a symbol image updates every reel,
// - every win presentation is its own precomp (lines, pops, titles, coins,
//   counters, the bonus wheel), placed on the main timeline.
// The script is ES3 so it runs in every After Effects version's ExtendScript.

import { normInf } from './keys.js';
import { lineColor } from './paylines.js';
import { OUTCOME_BY_ID, BIG_WINS } from './defaults.js';

export const AE_ASSETS = {
  background: 'assets/background.png',
  back: 'assets/machine_back.png',
  front: 'assets/machine_front.png',
  bulbsA: 'assets/bulbs_a.png',
  bulbsB: 'assets/bulbs_b.png',
  hud: 'assets/hud_panel.png',
  logo: 'assets/logo.png',
  vignette: 'assets/vignette.png',
  coin: 'assets/coin.png',
  rays: 'assets/rays.png',
  raysSmall: 'assets/rays_small.png',
  wheelDisc: 'assets/wheel_disc.png',
  wheelRing: 'assets/wheel_ring.png',
  wheelBulbsA: 'assets/wheel_bulbs_a.png',
  wheelBulbsB: 'assets/wheel_bulbs_b.png',
  wheelPointer: 'assets/wheel_pointer.png',
  title: (k) => `assets/title_${k}.png`,
  symbol: (i) => `assets/symbol_${String(i + 1).padStart(2, '0')}.png`,
};

const r4 = (x) => Math.round(x * 10000) / 10000;

function rgb(hex) {
  const m = /^#?([0-9a-f]{6})/i.exec(hex || '');
  const n = m ? parseInt(m[1], 16) : 0xffd447;
  return [r4(((n >> 16) & 255) / 255), r4(((n >> 8) & 255) / 255), r4((n & 255) / 255)];
}

// Keys with each segment's influences normalised the way the preview
// evaluates them, so AE never receives an influence sum above 100%.
export function exportKeys(keys, from = -Infinity, to = Infinity) {
  const ks = keys.filter((k) => k.t >= from - 1e-6 && k.t <= to + 1e-6).map((k) => ({ ...k }));
  for (let i = 0; i < ks.length - 1; i++) {
    const [oi, ii] = normInf(ks[i], ks[i + 1]);
    ks[i].outInf = oi;
    ks[i + 1].inInf = ii;
  }
  return ks.map((k) => ({ t: r4(k.t), v: r4(k.v), is: r4(k.inSpeed), ii: r4(k.inInf), os: r4(k.outSpeed), oi: r4(k.outInf), h: k.hold ? 1 : 0 }));
}

function wheelAngleAt(keys, t) {
  let v = keys[0]?.v ?? 0;
  for (const k of keys) if (k.t <= t + 1e-6) v = k.v;
  return v;
}

export function buildAEData(project, tl, L, extras = {}) {
  const cellX = (c) => L.reelX[c] + L.cellW / 2;
  const cellY = (r) => L.rowsTop + (r + 0.5) * L.cellH;
  const titles = project.effects.titles || {};
  const rounds = tl.rounds.map((R) => {
    const p = R.pres;
    const o = OUTCOME_BY_ID[R.outcome] || { label: R.outcome };
    const out = {
      index: R.index,
      outcome: R.outcome,
      label: o.label,
      t0: r4(R.t0),
      start: r4(R.presentStart),
      end: r4(R.end),
      amount: R.win.amount || 0,
      symbol: R.win.symbol,
      cells: R.win.cells.map(([c, r]) => ({ x: r4(cellX(c)), y: r4(cellY(r)), s: R.grid[c][r], color: rgb(winColor(R, c, r)) })),
      scatters: R.win.scatters.map(([c, r]) => ({ x: r4(cellX(c)), y: r4(cellY(r)), s: R.grid[c][r] })),
      lines: R.win.lines.map((l) => {
        const line = tl.paylines[l.index];
        const pts = line.map((r, c) => [r4(cellX(c)), r4(cellY(r))]);
        pts.unshift([r4(L.frame.x + L.pad * 0.35), pts[0][1]]);
        pts.push([r4(L.frame.x + L.frame.w - L.pad * 0.35), pts[pts.length - 1][1]]);
        return { index: l.index, color: rgb(lineColor(l.index)), pts };
      }),
      antic: R.reels.map((ri, c) => (ri.antic ? { c, x: r4(cellX(c)), start: r4(ri.antic.start), end: r4(ri.antic.end) } : null)).filter(Boolean),
      nearMiss: R.win.nearMiss ? { x: r4(cellX(R.win.nearMiss.reel)) } : null,
    };
    if (p.lines) out.lines_t = { start: r4(p.lines.start), end: r4(p.lines.end) };
    if (p.floatText) out.floatText = { start: r4(p.floatText.start), end: r4(p.floatText.end) };
    if (p.coinBurst) out.coinBurst = { start: r4(p.coinBurst.start), n: p.coinBurst.count };
    if (p.nearmiss) out.nearmiss = { start: r4(p.nearmiss.start), end: r4(p.nearmiss.end) };
    if (p.celebrate) out.celebrate = { start: r4(p.celebrate.start), end: r4(p.celebrate.end) };
    if (p.overlay) {
      const ov = p.overlay;
      out.overlay = {
        start: r4(ov.start),
        countStart: r4(ov.countStart),
        countEnd: r4(ov.countEnd),
        end: r4(ov.end),
        tiers: ov.tiers,
        tierTimes: ov.tierTimes.map(r4),
      };
    }
    if (p.banner) out.banner = { start: r4(p.banner.start), end: r4(p.banner.end), kind: p.banner.kind, freeSpins: p.banner.freeSpins };
    if (p.meter) out.meter = { start: r4(p.meter.start), end: r4(p.meter.end) };
    if (p.wheel) {
      const w = p.wheel;
      out.wheel = {
        inStart: r4(w.inStart),
        inEnd: r4(w.inEnd),
        spinStart: r4(w.spinStart),
        spinEnd: r4(w.spinEnd),
        prizeStart: r4(w.prizeStart),
        outStart: r4(w.outStart),
        outEnd: r4(w.outEnd),
        segment: w.segment,
        label: String(project.wheel.segments[w.segment]?.label ?? ''),
        angle0: r4(wheelAngleAt(tl.wheelKeys, w.spinStart)),
        keys: exportKeys(tl.wheelKeys, w.spinStart, w.spinEnd),
      };
    }
    return out;
  });
  const wheelR = extras.wheelR || Math.round(Math.min(L.H * 0.36, L.W * 0.4));
  return {
    name: project.name || 'Slot Animation',
    W: L.W,
    H: L.H,
    fps: project.canvas.fps,
    duration: r4(tl.duration),
    reels: tl.reels,
    rows: tl.rows,
    peek: r4(L.peek),
    dir: tl.dir,
    cascade: tl.cascade ? 1 : 0,
    cellW: L.cellW,
    cellH: L.cellH,
    winX: L.winX,
    winW: L.winW,
    winTop: L.winTop,
    winH: L.winH,
    rowsTop: r4(L.rowsTop),
    reelX: L.reelX,
    logo: [r4(L.logo.cx), r4(L.logo.cy)],
    hud: L.hud ? { x: r4(L.hud.x + L.hud.w / 2), y: r4(L.hud.y + L.hud.h * 0.6), size: Math.round(L.hud.h * 0.42) } : null,
    symbols: project.symbols.map((s, i) => ({ name: s.name || `Symbol ${i + 1}`, file: AE_ASSETS.symbol(i) })),
    strips: tl.strips,
    reelKeys: tl.reelKeys.map((k) => exportKeys(k)),
    cascadeRounds: tl.cascade
      ? tl.rounds.map((R) => ({
          grid: R.grid,
          cells: R.cascade.map((col) => col.map((ck) => ({ inKeys: exportKeys(ck.inKeys), outKeys: exportKeys(ck.outKeys), inStart: r4(ck.inStart), outEnd: r4(ck.outEnd) }))),
        }))
      : null,
    initialGrid: tl.initialGrid,
    meterKeys: exportKeys(tl.meterKeys),
    shakes: tl.shakes.map((s) => [r4(s.t), r4(s.amp * (Number(project.effects.shake) || 0) * L.cellW * 0.09), r4(s.dur)]),
    flashes: tl.flashes.map((f) => [r4(f.t), r4(f.amp * (Number(project.effects.flash) || 0)), r4(f.dur)]),
    rounds,
    currency: project.machine.currency || '',
    decimals: project.machine.decimals | 0,
    dim: r4(Number(project.effects.dim) || 0),
    popScale: r4(Number(project.effects.popScale) || 0),
    blur: r4(Number(project.spin.blur) || 0),
    accent: rgb(extras.accent || '#ffd25a'),
    font: extras.fontPostScript || 'Bungee-Regular',
    titlePx: extras.titlePx || Math.round(Math.min(L.W * 0.11, L.H * 0.16)),
    wheel: { cx: r4(L.W / 2), cy: r4(L.H * 0.54), R: wheelR, segDeg: r4(360 / Math.max(2, project.wheel.segments.length)), n: project.wheel.segments.length },
    maxCoins: 60,
    assets: {
      background: AE_ASSETS.background,
      back: AE_ASSETS.back,
      front: AE_ASSETS.front,
      bulbsA: AE_ASSETS.bulbsA,
      bulbsB: AE_ASSETS.bulbsB,
      hud: L.hud ? AE_ASSETS.hud : '',
      logo: extras.hasLogo === false ? '' : AE_ASSETS.logo,
      vignette: AE_ASSETS.vignette,
      coin: AE_ASSETS.coin,
      rays: AE_ASSETS.rays,
      raysSmall: AE_ASSETS.raysSmall,
      wheelDisc: AE_ASSETS.wheelDisc,
      wheelRing: AE_ASSETS.wheelRing,
      wheelBulbsA: AE_ASSETS.wheelBulbsA,
      wheelBulbsB: AE_ASSETS.wheelBulbsB,
      wheelPointer: AE_ASSETS.wheelPointer,
      titles: Object.fromEntries(['big', 'mega', 'epic', 'bonus', 'freespins', 'wheel', 'nearmiss'].map((k) => [k, AE_ASSETS.title(k)])),
    },
    titleText: titles,
    hasWheel: rounds.some((r) => r.wheel) ? 1 : 0,
    bigWins: BIG_WINS,
  };
}

function winColor(R, c, r) {
  for (const l of R.win.lines) if (l.cells.some(([cc, rr]) => cc === c && rr === r)) return lineColor(l.index);
  return '#ffd25a';
}

export function buildAEScript(data) {
  const json = JSON.stringify(data).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return AE_SCRIPT.replace('__DATA__', () => json);
}

// ExtendScript (ES3). Keep it free of let/const, arrow functions, template
// strings and JSON: older After Effects versions reject them.
export const AE_SCRIPT = String.raw`// Slot animation rebuilt for After Effects by Reel Studio.
// Run it with File > Scripts > Run Script File... and keep this .jsx next
// to the "assets" folder it came with.
(function () {
  var DATA = __DATA__;
  var ROOT = (new File($.fileName)).parent;
  var missing = [];
  var BEZ = KeyframeInterpolationType.BEZIER;
  var HOLD = KeyframeInterpolationType.HOLD;
  var proj, top, fAssets, fReels, fRounds, atlas, main, shake;
  var footage = {};
  var W = DATA.W, H = DATA.H, FPS = DATA.fps, DUR = DATA.duration;

  function file(rel) { return new File(ROOT.fsName + "/" + rel); }
  function folder(name, parent) { var f = proj.items.addFolder(name); if (parent) f.parentFolder = parent; return f; }
  function imp(rel) {
    if (!rel) return null;
    if (footage[rel]) return footage[rel];
    var f = file(rel);
    if (!f.exists) { missing.push(rel); return null; }
    var it = proj.importFile(new ImportOptions(f));
    it.parentFolder = fAssets;
    footage[rel] = it;
    return it;
  }
  function tr(L) { return L.property("ADBE Transform Group"); }
  function P(L, name) { return tr(L).property(name); }
  function pos(L, xy) { P(L, "ADBE Position").setValue(xy); }
  function fx(L, match, name) { var e = L.property("ADBE Effect Parade").addProperty(match); if (name) e.name = name; return e; }
  function slider(L, name) { return fx(L, "ADBE Slider Control", name).property(1); }
  function trim(L, a, b) { if (b !== undefined && b !== null) L.outPoint = b; if (a !== undefined && a !== null) L.inPoint = Math.max(0, a); }
  function pct(x) { var v = x * 100; if (v < 0.1) v = 0.1; if (v > 100) v = 100; return v; }
  function setKeys(prop, keys, tOff) {
    var i, times = [], vals = [];
    tOff = tOff || 0;
    if (!keys || !keys.length) return;
    for (i = 0; i < keys.length; i++) { times.push(keys[i].t + tOff); vals.push(keys[i].v); }
    prop.setValuesAtTimes(times, vals);
    for (i = 0; i < keys.length; i++) {
      var k = keys[i];
      var prevHold = i > 0 && keys[i - 1].h;
      try {
        prop.setInterpolationTypeAtKey(i + 1, prevHold ? HOLD : BEZ, k.h ? HOLD : BEZ);
        prop.setTemporalContinuousAtKey(i + 1, false);
        prop.setTemporalAutoBezierAtKey(i + 1, false);
        prop.setTemporalEaseAtKey(i + 1, [new KeyframeEase(k.is, pct(k.ii))], [new KeyframeEase(k.os, pct(k.oi))]);
      } catch (e) {}
    }
  }
  function ease1(prop, pairs) {
    var i, times = [], vals = [];
    for (i = 0; i < pairs.length; i++) {
      if (i > 0 && pairs[i][0] <= pairs[i - 1][0]) pairs[i][0] = pairs[i - 1][0] + 0.01;
      times.push(pairs[i][0]); vals.push(pairs[i][1]);
    }
    prop.setValuesAtTimes(times, vals);
    for (i = 1; i <= pairs.length; i++) {
      try { prop.setTemporalEaseAtKey(i, [new KeyframeEase(0, 55)], [new KeyframeEase(0, 55)]); } catch (e) {}
    }
  }
  function fadeKeys(L, a, b, fin, fout, peak) {
    peak = peak === undefined ? 100 : peak;
    ease1(P(L, "ADBE Opacity"), [[a, 0], [a + fin, peak], [Math.max(a + fin + 0.01, b - fout), peak], [Math.max(a + fin + 0.02, b), 0]]);
  }
  function image(comp, rel, name, xy) {
    var it = imp(rel);
    if (!it) return null;
    var L = comp.layers.add(it);
    L.name = name;
    if (xy) pos(L, xy);
    return L;
  }
  function solid(comp, rgbv, name, w, h, xy) {
    var L = comp.layers.addSolid(rgbv, name, Math.max(4, Math.round(w)), Math.max(4, Math.round(h)), 1, comp.duration);
    if (xy) pos(L, xy);
    return L;
  }
  function shapeLayer(comp, name) {
    var L = comp.layers.addShape();
    L.name = name;
    pos(L, [0, 0]);
    return L;
  }
  function group(L) {
    var g = L.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
    return g.property("ADBE Vectors Group");
  }
  function path(cont, pts, closed) {
    var p = cont.addProperty("ADBE Vector Shape - Group");
    var s = new Shape();
    s.vertices = pts;
    s.closed = !!closed;
    p.property("ADBE Vector Shape").setValue(s);
    return p;
  }
  function rect(cont, xy, size, round) {
    var r = cont.addProperty("ADBE Vector Shape - Rect");
    r.property("ADBE Vector Rect Size").setValue(size);
    r.property("ADBE Vector Rect Position").setValue(xy);
    r.property("ADBE Vector Rect Roundness").setValue(round || 0);
    return r;
  }
  function stroke(cont, rgbv, width) {
    var s = cont.addProperty("ADBE Vector Graphic - Stroke");
    s.property("ADBE Vector Stroke Color").setValue(rgbv);
    s.property("ADBE Vector Stroke Width").setValue(width);
    try { s.property("ADBE Vector Stroke Line Cap").setValue(2); s.property("ADBE Vector Stroke Line Join").setValue(2); } catch (e) {}
    return s;
  }
  function fill(cont, rgbv, opacity) {
    var f = cont.addProperty("ADBE Vector Graphic - Fill");
    f.property("ADBE Vector Fill Color").setValue(rgbv);
    if (opacity !== undefined) f.property("ADBE Vector Fill Opacity").setValue(opacity);
    return f;
  }
  function glow(L, radius, intensity) {
    try {
      var g = fx(L, "ADBE Glo2");
      try { g.property("Glow Radius").setValue(radius); } catch (e1) {}
      try { g.property("Glow Intensity").setValue(intensity); } catch (e2) {}
      try { g.property("Glow Threshold").setValue(55); } catch (e3) {}
    } catch (e) {}
  }
  function text(comp, name, str, size, xy, rgbv) {
    var L = comp.layers.addText(str);
    L.name = name;
    var prop = L.property("ADBE Text Properties").property("ADBE Text Document");
    var td = prop.value;
    td.fontSize = size;
    td.applyFill = true;
    td.fillColor = rgbv || [1, 0.86, 0.4];
    td.applyStroke = true;
    td.strokeColor = [0.16, 0.06, 0];
    td.strokeWidth = Math.max(1, Math.round(size * 0.1));
    td.strokeOverFill = false;
    td.justification = ParagraphJustification.CENTER_JUSTIFY;
    try { td.font = DATA.font; } catch (e) { try { td.font = "Arial-BoldMT"; } catch (e2) {} }
    prop.setValue(td);
    pos(L, [xy[0], xy[1] + size * 0.36]);
    try {
      var ds = fx(L, "ADBE Drop Shadow");
      ds.property("ADBE Drop Shadow-0002").setValue(70);
      ds.property("ADBE Drop Shadow-0004").setValue(Math.round(size * 0.06));
      ds.property("ADBE Drop Shadow-0005").setValue(Math.round(size * 0.12));
    } catch (e3) {}
    return L;
  }
  function counterExpr(ref) {
    return "var v = " + ref + ";\n" +
      "var d = " + DATA.decimals + ";\n" +
      "var s = Math.max(0, v).toFixed(d); var parts = s.split('.'); var i = parts[0]; var out = '';\n" +
      "while (i.length > 3) { out = ',' + i.substr(i.length - 3) + out; i = i.substr(0, i.length - 3); }\n" +
      "v > 0.0001 ? '" + DATA.currency.replace(/'/g, "\\'") + "' + i + out + (d > 0 ? '.' + parts[1] : '') : '';";
  }
  var EASE_LIB = "function c01(x){return x<0?0:(x>1?1:x);}\n" +
    "function outBack(x){var s=1.70158;return 1+(s+1)*Math.pow(x-1,3)+s*Math.pow(x-1,2);}\n" +
    "function outElastic(x){return x<=0?0:(x>=1?1:Math.pow(2,-10*x)*Math.sin((x*10-0.75)*(2*Math.PI)/3)+1);}\n" +
    "function inCubic(x){return x*x*x;}\n";
  function popScaleExpr(start, end, k, base) {
    base = base || 100;
    return EASE_LIB + "var a = time - " + start + "; var e = " + end + ";\n" +
      "var s = a < 0.6 ? outElastic(c01(a / 0.6)) : 0.78 + 0.22 * Math.sin(a * Math.PI * 2 * 1.3);\n" +
      "var o = c01((e - time) / 0.3);\n" +
      "var v = " + base + " * (1 + " + k + " * s * o); [v, v];";
  }
  function symbolLayer(comp, sym, xy, name) {
    var L = comp.layers.add(atlas);
    L.name = name || DATA.symbols[sym].name;
    L.timeRemapEnabled = true;
    L.outPoint = comp.duration;
    L.property("ADBE Time Remapping").expression = "(" + sym + " + 0.5) * thisComp.frameDuration;";
    pos(L, xy);
    return L;
  }
  function coins(comp, o) {
    var it = imp(DATA.assets.coin);
    if (!it) return;
    var n = Math.min(o.n, DATA.maxCoins), i;
    for (i = 0; i < n; i++) {
      var L = comp.layers.add(it);
      L.name = "Coin " + (i + 1);
      var pre = "seedRandom(" + (o.seed * 1000 + i) + ", true);\n" +
        "var birth = " + o.start + " + " + (o.end - o.start) + " * ((" + i + " + random()) / " + n + ");\n" +
        "var age = time - birth;\n";
      if (o.mode === "rain") {
        pre += "var x0 = random(0, thisComp.width); var y0 = -60; var vx = 0; var vy = thisComp.height * random(0.25, 0.55); var g = thisComp.height * 0.9;\n";
      } else {
        pre += "var vx = (random() - 0.5) * thisComp.width * " + o.spread + "; var vy = -thisComp.height * random(" + o.vy0 + ", " + (o.vy0 + o.vy1) + ");\n" +
          "var x0 = " + o.x + " + (random() - 0.5) * " + o.w + "; var y0 = " + o.y + "; var g = thisComp.height * " + o.g + ";\n";
      }
      pre += "var spin = random(5, 14); var ph = random(0, 6.28); var sz = random(52, 108) * " + o.scale + "; var r0 = random(-35, 35); var rv = random(-90, 90);\n";
      P(L, "ADBE Position").expression = pre + "age < 0 ? [-9999, -9999] : [x0 + vx * age, y0 + vy * age + 0.5 * g * age * age];";
      P(L, "ADBE Scale").expression = pre + "var f = Math.abs(Math.cos(age * spin + ph)); [sz * Math.max(0.1, f), sz];";
      P(L, "ADBE Rotate Z").expression = pre + "r0 + rv * age;";
      P(L, "ADBE Opacity").expression = pre + "var life = " + o.life + "; (age < 0 || age > life) ? 0 : Math.min(100, (life - age) / 0.35 * 100, age / 0.06 * 100);";
      L.motionBlur = true;
    }
  }
  function ring(comp, xy, t, maxR, rgbv, width) {
    var L = shapeLayer(comp, "Shockwave");
    var c = group(L);
    var e = c.addProperty("ADBE Vector Shape - Ellipse");
    e.property("ADBE Vector Ellipse Size").setValue([maxR * 2, maxR * 2]);
    e.property("ADBE Vector Ellipse Position").setValue(xy);
    stroke(c, rgbv, width);
    L.blendingMode = BlendingMode.ADD;
    P(L, "ADBE Anchor Point").setValue(xy);
    pos(L, xy);
    P(L, "ADBE Scale").expression = EASE_LIB + "var a = c01((time - " + t + ") / 0.7); var s = 100 * (1 - Math.pow(1 - a, 3)); [s, s];";
    P(L, "ADBE Opacity").expression = EASE_LIB + "var a = (time - " + t + ") / 0.7; (a < 0 || a > 1) ? 0 : 100 * Math.pow(1 - a, 1.5);";
    glow(L, width * 2, 1);
    trim(L, t, t + 0.75);
    return L;
  }
  function darkLayer(comp, a, b, peak) {
    var L = solid(comp, [0, 0, 0], "Darken", W * 1.2, H * 1.2, [W / 2, H / 2]);
    fadeKeys(L, a, b, 0.45, 0.6, peak);
    return L;
  }
  function rays(comp, xy, a, b, scale, speed, alpha) {
    var L = image(comp, DATA.assets.rays, "Light Rays", xy);
    if (!L) return null;
    L.blendingMode = BlendingMode.ADD;
    P(L, "ADBE Rotate Z").expression = "time * " + speed + ";";
    P(L, "ADBE Scale").expression = EASE_LIB + "var k = outBack(c01((time - " + a + ") / 0.45)); [" + scale + " * k, " + scale + " * k];";
    fadeKeys(L, a, b, 0.45, 0.6, alpha);
    return L;
  }
  function titleLayer(comp, key, xy, a, b, maxW) {
    var L = image(comp, DATA.assets.titles[key], "Title " + key, xy);
    if (!L) return null;
    trim(L, a, b);
    var fit = 100;
    try { var w = L.source.width; if (maxW && w > maxW) fit = 100 * maxW / w; } catch (e) {}
    P(L, "ADBE Scale").expression = EASE_LIB + "var a = time - inPoint; var s = (" + (fit * 0.15) + " + " + (fit * 0.85) + " * outElastic(c01(a / 0.8))) * (1 + 0.025 * Math.sin(time * 5)); [s, s];";
    try {
      var sw = fx(L, "CC Light Sweep");
      try { sw.property("Center").expression = "var p = ((time - inPoint) % 1.7) / 1.7 * 1.6 - 0.3; [p * thisLayer.width, thisLayer.height / 2];"; } catch (e1) {}
      try { sw.property("Width").setValue(Math.round(DATA.titlePx * 0.45)); } catch (e2) {}
      try { sw.property("Sweep Intensity").setValue(70); } catch (e3) {}
    } catch (e4) {}
    return L;
  }
  function winCtrl(comp, keys) {
    var c = comp.layers.addNull(comp.duration);
    c.name = "WIN CTRL";
    var s = slider(c, "Amount");
    setKeys(s, keys);
    return c;
  }
  function counter(comp, xy, size, slamAt) {
    var L = text(comp, "Win Counter", "0", size, xy);
    L.property("ADBE Text Properties").property("ADBE Text Document").expression = counterExpr('thisComp.layer("WIN CTRL").effect("Amount")(1).value');
    if (slamAt !== undefined) {
      P(L, "ADBE Scale").expression = EASE_LIB + "var a = time - " + slamAt + "; var s = a > 0 ? 100 * (1 + 0.2 * Math.pow(1 - c01(a / 0.35), 2)) : 100; [s, s];";
    }
    return L;
  }
  function cellFrame(comp, x, y, rgbv, a, b) {
    var L = shapeLayer(comp, "Cell Frame");
    var c = group(L);
    rect(c, [x, y], [DATA.cellW * 0.97, DATA.cellH * 0.97], DATA.cellW * 0.1);
    stroke(c, rgbv, Math.max(2, DATA.cellW * 0.03));
    glow(L, DATA.cellW * 0.1, 1.2);
    fadeKeys(L, a, b, 0.12, 0.3);
    return L;
  }
  function popCells(comp, cells, a, b, k, withRays) {
    var i;
    for (i = 0; i < cells.length; i++) {
      var cl = cells[i];
      if (withRays) {
        var rr = image(comp, DATA.assets.raysSmall, "Scatter Rays", [cl.x, cl.y]);
        if (rr) {
          rr.blendingMode = BlendingMode.ADD;
          P(rr, "ADBE Rotate Z").expression = "time * 69 + " + (i * 40) + ";";
          P(rr, "ADBE Scale").setValue([100 * DATA.cellW * 2.1 / 512, 100 * DATA.cellW * 2.1 / 512]);
          fadeKeys(rr, a, b, 0.2, 0.3, 75);
        }
      }
      var L = symbolLayer(comp, cl.s, [cl.x, cl.y]);
      P(L, "ADBE Scale").expression = popScaleExpr(a + i * 0.05, b, k);
      glow(L, DATA.cellW * 0.14, 1.1);
      trim(L, a, b);
      if (cl.color) cellFrame(comp, cl.x, cl.y, cl.color, a, b);
    }
  }

  function buildAtlas() {
    var n = DATA.symbols.length, i;
    atlas = proj.items.addComp("Symbols Atlas", DATA.cellW, DATA.cellH, 1, Math.max(n, 1) / FPS, FPS);
    atlas.parentFolder = fReels;
    for (i = 0; i < n; i++) {
      var L = image(atlas, DATA.symbols[i].file, DATA.symbols[i].name);
      if (!L) continue;
      var w = L.source.width, h = L.source.height;
      var s = 100 * Math.min(DATA.cellW * 0.88 / w, DATA.cellH * 0.88 / h);
      P(L, "ADBE Scale").setValue([s, s]);
      pos(L, [DATA.cellW / 2, DATA.cellH / 2]);
      L.outPoint = (i + 1) / FPS;
      L.inPoint = i / FPS;
    }
  }

  function buildReels() {
    var reels = [], c, k;
    var nCells = DATA.rows + 4;
    for (c = 0; c < DATA.reels; c++) {
      var rc = proj.items.addComp("Reel " + (c + 1), DATA.cellW, DATA.winH, 1, DUR, FPS);
      rc.parentFolder = fReels;
      if (!DATA.cascade) {
        var ctrl = rc.layers.addNull(DUR);
        ctrl.name = "CTRL";
        setKeys(slider(ctrl, "Spin"), DATA.reelKeys[c]);
        var S = "var S = [" + DATA.strips[c].join(",") + "];\n";
        var head = "var p = thisComp.layer(\"CTRL\").effect(\"Spin\")(1).value;\n";
        for (k = 0; k < nCells; k++) {
          var L = rc.layers.add(atlas);
          L.name = "Cell " + (k + 1);
          L.timeRemapEnabled = true;
          L.outPoint = DUR;
          L.property("ADBE Time Remapping").expression = S + head +
            "var j = Math.floor(p + 1e-4) - 2 + " + k + ";\n" +
            "var s = (j >= 0 && j < S.length) ? S[j] : 0;\n" +
            "(s + 0.5) * thisComp.frameDuration;";
          P(L, "ADBE Position").expression = head +
            "var j = Math.floor(p + 1e-4) - 2 + " + k + ";\n" +
            "var row = " + DATA.dir + " > 0 ? (" + (DATA.rows - 1) + " - (j - p)) : (j - p);\n" +
            "[thisComp.width / 2, (row + 0.5 + " + DATA.peek + ") * " + DATA.cellH + "];";
        }
      } else {
        buildCascadeReel(rc, c);
      }
      var adj = rc.layers.addSolid([1, 1, 1], "Reel Motion Blur", DATA.cellW, DATA.winH, 1, DUR);
      adj.adjustmentLayer = true;
      var db = fx(adj, "ADBE Motion Blur", "Spin Blur");
      if (!DATA.cascade) {
        db.property(2).expression = "var v = Math.abs(thisComp.layer(\"CTRL\").effect(\"Spin\")(1).velocity);\n" +
          "var a = Math.max(0, Math.min(1, (v - 3) / 14)) * " + DATA.blur + ";\n" +
          "a * " + DATA.cellH + " * 0.35;";
      }
      var RL = main.layers.add(rc);
      RL.name = "Reel " + (c + 1);
      pos(RL, [DATA.reelX[c] + DATA.cellW / 2, DATA.winTop + DATA.winH / 2]);
      reels.push(RL);
    }
    return reels;
  }

  function buildCascadeReel(rc, c) {
    var r, i;
    for (r = 0; r < DATA.rows; r++) {
      var y0 = (r + 0.5 + DATA.peek) * DATA.cellH;
      var first = symbolLayer(rc, DATA.initialGrid[c][r], [DATA.cellW / 2, y0], "Start r" + (r + 1));
      var fk = DATA.cascadeRounds.length ? DATA.cascadeRounds[0].cells[c][r] : null;
      if (fk) {
        cascadeY(first, fk.outKeys, y0);
        trim(first, 0, fk.outEnd + 0.02);
      }
      for (i = 0; i < DATA.cascadeRounds.length; i++) {
        var cr = DATA.cascadeRounds[i];
        var ck = cr.cells[c][r];
        var L = symbolLayer(rc, cr.grid[c][r], [DATA.cellW / 2, y0], "R" + (i + 1) + " r" + (r + 1));
        var next = i + 1 < DATA.cascadeRounds.length ? DATA.cascadeRounds[i + 1].cells[c][r] : null;
        var keys = ck.inKeys.slice(0);
        if (next) keys = keys.concat(next.outKeys);
        cascadeY(L, keys, y0);
        trim(L, ck.inStart, next ? next.outEnd + 0.02 : DUR);
      }
    }
  }
  function cascadeY(L, keys, y0) {
    var Y = P(L, "ADBE Position");
    try { Y.dimensionsSeparated = true; } catch (e) {}
    var yp = tr(L).property("ADBE Position_1");
    var scaled = [], i;
    for (i = 0; i < keys.length; i++) {
      var k = keys[i];
      scaled.push({ t: k.t, v: y0 + k.v * DATA.cellH, is: k.is * DATA.cellH, ii: k.ii, os: k.os * DATA.cellH, oi: k.oi, h: k.h });
    }
    setKeys(yp, scaled);
  }

  function buildMain() {
    main = proj.items.addComp(uniqueName(DATA.name), W, H, 1, DUR, FPS);
    main.parentFolder = top;
    main.motionBlur = true;
    var bg = image(main, DATA.assets.background, "Background");
    var ctrl = main.layers.addNull(DUR);
    ctrl.name = "SLOT CONTROL";
    setKeys(slider(ctrl, "Meter"), DATA.meterKeys);
    shake = main.layers.addNull(DUR);
    shake.name = "SCREEN SHAKE";
    var kids = [];
    var back = image(main, DATA.assets.back, "Machine Back");
    if (back) kids.push(back);
    var reels = buildReels(), i;
    for (i = 0; i < reels.length; i++) kids.push(reels[i]);
    var front = image(main, DATA.assets.front, "Machine Frame");
    if (front) kids.push(front);
    var winExpr = "var Wn = [";
    for (i = 0; i < DATA.rounds.length; i++) winExpr += (i ? "," : "") + "[" + DATA.rounds[i].start + "," + DATA.rounds[i].end + "]";
    winExpr += "]; var on = false; for (var i = 0; i < Wn.length; i++) if (time >= Wn[i][0] && time <= Wn[i][1]) on = true;\n";
    var ba = image(main, DATA.assets.bulbsA, "Marquee A");
    var bb = image(main, DATA.assets.bulbsB, "Marquee B");
    if (ba) { P(ba, "ADBE Opacity").expression = winExpr + "Math.floor(time * (on ? 7 : 1.6)) % 2 == 0 ? 100 : 18;"; ba.blendingMode = BlendingMode.ADD; kids.push(ba); }
    if (bb) { P(bb, "ADBE Opacity").expression = winExpr + "Math.floor(time * (on ? 7 : 1.6)) % 2 == 1 ? 100 : 18;"; bb.blendingMode = BlendingMode.ADD; kids.push(bb); }
    var logo = image(main, DATA.assets.logo, "Logo", DATA.logo);
    if (logo) {
      kids.push(logo);
      P(logo, "ADBE Scale").expression = "var s = 100 * (1 + 0.012 * Math.sin(time * 1.6)); [s, s];";
    }
    if (DATA.hud) {
      var hp = image(main, DATA.assets.hud, "Win Meter Panel");
      if (hp) kids.push(hp);
      var meter = text(main, "Win Meter", "0", DATA.hud.size, [DATA.hud.x, DATA.hud.y]);
      meter.property("ADBE Text Properties").property("ADBE Text Document").expression = counterExpr('thisComp.layer("SLOT CONTROL").effect("Meter")(1).value');
      kids.push(meter);
    }
    // Anticipation glow around teasing reels.
    var r, a;
    for (r = 0; r < DATA.rounds.length; r++) {
      var R = DATA.rounds[r];
      for (a = 0; a < R.antic.length; a++) {
        var an = R.antic[a];
        var S = shapeLayer(main, "Anticipation R" + (r + 1) + " reel " + (an.c + 1));
        var cg = group(S);
        rect(cg, [an.x, DATA.winTop + DATA.winH / 2], [DATA.cellW * 1.06, DATA.winH * 1.02], DATA.cellW * 0.06);
        stroke(cg, [1, 0.67, 0.16], Math.max(2, DATA.cellW * 0.05));
        fill(cg, [1, 0.55, 0.08], 18);
        glow(S, DATA.cellW * 0.3, 1.6);
        S.blendingMode = BlendingMode.ADD;
        fadeKeys(S, an.start - 0.05, an.end + 0.3, 0.2, 0.3);
        kids.push(S);
      }
    }
    for (r = 0; r < DATA.rounds.length; r++) {
      var fxL = buildRound(DATA.rounds[r]);
      if (fxL) kids.push(fxL);
    }
    // Shake: parent everything except the background, then animate.
    for (i = 0; i < kids.length; i++) kids[i].parent = shake;
    var sh = "var S = [";
    for (i = 0; i < DATA.shakes.length; i++) sh += (i ? "," : "") + "[" + DATA.shakes[i].join(",") + "]";
    sh += "]; var x = 0, y = 0;\nfor (var i = 0; i < S.length; i++) { var a = time - S[i][0]; if (a >= 0 && a < S[i][2]) { var k = 1 - a / S[i][2]; var m = S[i][1] * k * k; x += Math.sin(a * 93 + S[i][0] * 7) * m; y += Math.cos(a * 79 + S[i][0] * 3) * m; } }\nvalue + [x, y];";
    P(shake, "ADBE Position").expression = sh;
    var fl = solid(main, [1, 0.96, 0.84], "Flash", W, H, [W / 2, H / 2]);
    fl.blendingMode = BlendingMode.ADD;
    var fe = "var F = [";
    for (i = 0; i < DATA.flashes.length; i++) fe += (i ? "," : "") + "[" + DATA.flashes[i].join(",") + "]";
    fe += "]; var a = 0;\nfor (var i = 0; i < F.length; i++) { var d = time - F[i][0]; if (d >= 0 && d < F[i][2]) a += F[i][1] * Math.pow(1 - d / F[i][2], 2); }\nMath.min(90, a * 100);";
    P(fl, "ADBE Opacity").expression = fe;
    image(main, DATA.assets.vignette, "Vignette");
    for (r = 0; r < DATA.rounds.length; r++) {
      try { main.markerProperty.setValueAtTime(DATA.rounds[r].t0, new MarkerValue("R" + (r + 1) + " " + DATA.rounds[r].label)); } catch (e) {}
    }
    if (bg) bg.moveToEnd();
  }

  function uniqueName(base) {
    var names = {}, i;
    for (i = 1; i <= proj.numItems; i++) if (proj.item(i).layers) names[proj.item(i).name] = true;
    if (!names[base]) return base;
    for (i = 2; i < 1000; i++) if (!names[base + " " + i]) return base + " " + i;
    return base + " " + (new Date()).getTime();
  }
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  function buildRound(R) {
    var P0 = R.start, len = Math.max(0.6, R.end - P0 + 0.6), i;
    var hasFx = R.lines_t || R.overlay || R.banner || R.wheel || R.celebrate || R.nearmiss;
    if (!hasFx) return null;
    var comp = proj.items.addComp("R" + pad2(R.index + 1) + " " + R.label + " FX", W, H, 1, len, FPS);
    comp.parentFolder = fRounds;
    function rel(t) { return Math.max(0, t - P0); }
    var winC = [DATA.winX + DATA.winW / 2, DATA.winTop + DATA.winH / 2];
    if (R.lines_t || R.celebrate || R.nearmiss) {
      var de = R.lines_t ? R.lines_t.end : (R.celebrate ? R.celebrate.end + 0.4 : R.nearmiss.end);
      var dim = solid(comp, [0, 0, 0], "Dim Reels", DATA.winW, DATA.winH, winC);
      fadeKeys(dim, 0, rel(de), 0.2, 0.35, DATA.dim * 100 * (R.nearmiss ? 0.6 : 1));
    }
    if (R.lines_t) {
      var la = rel(R.lines_t.start), lb = rel(R.lines_t.end);
      for (i = 0; i < R.lines.length; i++) {
        var ln = R.lines[i];
        var S = shapeLayer(comp, "Payline " + (ln.index + 1));
        var g = group(S);
        path(g, ln.pts, false);
        var tp = g.addProperty("ADBE Vector Filter - Trim");
        stroke(g, ln.color, Math.max(3, DATA.cellW * 0.05));
        var core = group(S);
        path(core, ln.pts, false);
        var tp2 = core.addProperty("ADBE Vector Filter - Trim");
        stroke(core, [1, 1, 1], Math.max(1, DATA.cellW * 0.016));
        var ends = [[la + i * 0.07, 0], [la + i * 0.07 + 0.45, 100]];
        ease1(tp.property("ADBE Vector Trim End"), [[ends[0][0], 0], [ends[1][0], 100]]);
        ease1(tp2.property("ADBE Vector Trim End"), [[ends[0][0], 0], [ends[1][0], 100]]);
        glow(S, DATA.cellW * 0.22, 1.5);
        S.blendingMode = BlendingMode.ADD;
        fadeKeys(S, la, lb, 0.15, 0.35);
      }
      popCells(comp, R.cells, la, lb, DATA.popScale, false);
      if (R.floatText && R.amount > 0) {
        var ft = text(comp, "Win Amount", DATA.currency + R.amount.toFixed(DATA.decimals), Math.round(DATA.titlePx * 0.5), [W / 2, DATA.winTop + DATA.winH / 2 - DATA.cellH * 0.15]);
        ft.property("ADBE Text Properties").property("ADBE Text Document").setValue("+" + DATA.currency + R.amount.toFixed(DATA.decimals));
        var fa = rel(R.floatText.start), fb = rel(R.floatText.end);
        var p0 = P(ft, "ADBE Position").value;
        ease1(P(ft, "ADBE Position"), [[fa, p0], [fb, [p0[0], p0[1] - DATA.cellH * 0.5]]]);
        fadeKeys(ft, fa, fb, 0.2, 0.5);
      }
      if (R.coinBurst) coins(comp, { n: R.coinBurst.n, start: rel(R.coinBurst.start), end: rel(R.coinBurst.start) + 0.5, x: W / 2, y: winC[1], w: DATA.winW * 0.3, spread: 0.7, vy0: 0.8, vy1: 0.5, g: 2.6, life: 1.8, scale: 1, seed: 40 + R.index });
    }
    if (R.celebrate) popCells(comp, R.scatters, rel(R.celebrate.start), rel(R.celebrate.end) + 0.4, DATA.popScale * 1.4, true);
    if (R.nearmiss) {
      popCells(comp, R.scatters, rel(R.nearmiss.start), rel(R.nearmiss.end), DATA.popScale * 0.6, false);
      if (R.nearMiss) {
        var nmL = shapeLayer(comp, "Near Miss Reel");
        var ng = group(nmL);
        rect(ng, [R.nearMiss.x, winC[1]], [DATA.cellW, DATA.winH], DATA.cellW * 0.06);
        stroke(ng, [1, 0.31, 0.43], Math.max(2, DATA.cellW * 0.035));
        glow(nmL, DATA.cellW * 0.2, 1.4);
        P(nmL, "ADBE Opacity").expression = "60 + 40 * Math.sin(time * 16);";
        trim(nmL, rel(R.nearmiss.start), rel(R.nearmiss.end));
      }
      var nt = titleLayer(comp, "nearmiss", winC, rel(R.nearmiss.start), rel(R.nearmiss.end), W * 0.9);
      if (nt) fadeKeys(nt, rel(R.nearmiss.start), rel(R.nearmiss.end), 0.2, 0.35);
    }
    if (R.overlay) buildBigWin(comp, R, rel);
    if (R.banner) buildBanner(comp, R, rel);
    if (R.wheel) buildWheel(comp, R, rel);
    var L = main.layers.add(comp);
    L.startTime = P0;
    L.name = "R" + pad2(R.index + 1) + " " + R.label;
    return L;
  }

  function countKeys(a, b, amount) {
    var d = Math.max(0.1, b - a);
    return [{ t: a, v: 0, is: 0, ii: 0.3333, os: amount / d * 1.25, oi: 0.3333, h: 0 }, { t: b, v: amount, is: 0, ii: 0.6, os: 0, oi: 0.3333, h: 1 }];
  }

  function buildBigWin(comp, R, rel) {
    var ov = R.overlay, i;
    var a = rel(ov.start), b = rel(ov.end);
    var cx = W / 2, cy = H * (H > W * 1.1 ? 0.4 : 0.42);
    darkLayer(comp, a, b, 72);
    rays(comp, [cx, cy], a, b, 100 * H * 1.7 / 1024, 12.6, 60);
    rays(comp, [cx, cy], a, b, 70 * H * 1.7 / 1024, -20, 35);
    coins(comp, { n: 70 * ov.tiers.length, start: rel(ov.countStart) - 0.2, end: rel(ov.countEnd), x: cx, y: H * 1.02, w: W * 0.25, spread: 1.0, vy0: 1.15, vy1: 0.6, g: 2.6, life: 2.4, scale: 1.25, seed: 90 + R.index });
    if (ov.tiers.length > 1) coins(comp, { n: 60 * (ov.tiers.length - 1), start: rel(ov.tierTimes[1]), end: rel(ov.countEnd) + 0.4, mode: "rain", life: 2.6, scale: 1.1, seed: 140 + R.index });
    for (i = 0; i < ov.tiers.length; i++) {
      var ta = rel(ov.tierTimes[i]);
      var tb = i + 1 < ov.tiers.length ? rel(ov.tierTimes[i + 1]) : b;
      var T = titleLayer(comp, ov.tiers[i], [cx, cy - H * 0.08], ta, tb, W * 0.92);
      if (T && i + 1 === ov.tiers.length) fadeKeys(T, ta, tb, 0.05, 0.6);
      if (i > 0) ring(comp, [cx, cy], ta, H * 0.75, DATA.accent, H * 0.02);
    }
    winCtrl(comp, countKeys(rel(ov.countStart), rel(ov.countEnd), R.amount));
    var ctr = counter(comp, [cx, cy + H * 0.13], Math.round(DATA.titlePx * 0.72), rel(ov.countEnd));
    fadeKeys(ctr, a + 0.2, b, 0.3, 0.6);
  }

  function buildBanner(comp, R, rel) {
    var bn = R.banner;
    var a = rel(bn.start), b = rel(bn.end);
    var cx = W / 2, cy = H * 0.44;
    darkLayer(comp, a, b, 60);
    rays(comp, [cx, cy], a, b, 100 * H * 1.6 / 1024, 14.3, 55);
    ring(comp, [cx, cy], a, H * 0.7, DATA.accent, H * 0.02);
    var T = titleLayer(comp, bn.kind, [cx, bn.kind === "freespins" ? cy - H * 0.13 : cy], a, b, W * 0.9);
    if (T) fadeKeys(T, a, b, 0.05, 0.5);
    if (bn.kind === "freespins") {
      var num = text(comp, "Free Spins Count", String(bn.freeSpins), Math.round(DATA.titlePx * 1.5), [cx, cy + H * 0.12], [1, 0.55, 0.15]);
      P(num, "ADBE Scale").expression = EASE_LIB + "var s = 10 + 90 * outElastic(c01((time - " + (a + 0.35) + ") / 0.8)); [s, s];";
      fadeKeys(num, a, b, 0.05, 0.5);
    } else if (R.amount > 0 && R.meter) {
      winCtrl(comp, countKeys(rel(R.meter.start), rel(R.meter.end), R.amount));
      var c = counter(comp, [cx, cy + H * 0.16], Math.round(DATA.titlePx * 0.6));
      fadeKeys(c, a, b, 0.3, 0.5);
    }
    coins(comp, { n: 80, start: a + 0.1, end: a + 0.9, x: cx, y: H * 1.02, w: W * 0.3, spread: 1.0, vy0: 1.1, vy1: 0.5, g: 2.6, life: 2.2, scale: 1, seed: 200 + R.index });
  }

  function buildWheel(comp, R, rel) {
    var w = R.wheel, WH = DATA.wheel;
    var inA = rel(w.inStart), inB = rel(w.inEnd), outA = rel(w.outStart), outB = rel(w.outEnd);
    var cx = WH.cx, cy = WH.cy, Rr = WH.R;
    var envExpr = EASE_LIB + "var tIn = c01((time - " + inA + ") / " + (inB - inA) + "); var tOut = c01((time - " + outA + ") / " + (outB - outA) + ");\n" +
      "var env = (1 - Math.pow(1 - tIn, 3)) * (1 - inCubic(tOut));\n";
    var dk = solid(comp, [0, 0, 0], "Darken", W * 1.2, H * 1.2, [W / 2, H / 2]);
    P(dk, "ADBE Opacity").expression = envExpr + "env * 86;";
    var ry = image(comp, DATA.assets.rays, "Light Rays", [cx, cy]);
    if (ry) {
      ry.blendingMode = BlendingMode.ADD;
      P(ry, "ADBE Rotate Z").expression = "time * 8.6;";
      P(ry, "ADBE Scale").setValue([100 * Rr * 3.4 / 1024, 100 * Rr * 3.4 / 1024]);
      P(ry, "ADBE Opacity").expression = envExpr + "env * 45;";
    }
    var rig = comp.layers.addNull(comp.duration);
    rig.name = "WHEEL RIG";
    pos(rig, [cx, cy]);
    var disc = image(comp, DATA.assets.wheelDisc, "Wheel Disc", [cx, cy]);
    var kids = [];
    if (disc) {
      var rot = P(disc, "ADBE Rotate Z");
      rot.setValue(w.angle0);
      setKeys(rot, w.keys, -R.start);
      kids.push(disc);
      // Winning segment highlight, drawn where that segment sits at t = 0.
      var seg = WH.segDeg, a0 = -90 + w.segment * seg + w.angle0, pts = [[cx, cy]], s;
      for (s = 0; s <= 12; s++) {
        var ang = (a0 + seg * s / 12) * Math.PI / 180;
        pts.push([cx + Math.cos(ang) * Rr, cy + Math.sin(ang) * Rr]);
      }
      var wedge = shapeLayer(comp, "Winning Segment");
      var wg = group(wedge);
      path(wg, pts, true);
      fill(wg, [1, 1, 1], 100);
      wedge.blendingMode = BlendingMode.ADD;
      P(wedge, "ADBE Opacity").expression = "var a = time - " + rel(w.spinEnd) + "; a < 0 ? 0 : Math.min(1, a / 0.3) * (30 + 25 * Math.sin(time * 10));";
      wedge.parent = disc;
    }
    var ringL = image(comp, DATA.assets.wheelRing, "Wheel Ring", [cx, cy]);
    if (ringL) kids.push(ringL);
    var wa = image(comp, DATA.assets.wheelBulbsA, "Wheel Bulbs A", [cx, cy]);
    var wb = image(comp, DATA.assets.wheelBulbsB, "Wheel Bulbs B", [cx, cy]);
    if (wa) { wa.blendingMode = BlendingMode.ADD; P(wa, "ADBE Opacity").expression = "Math.floor(time * (time > " + rel(w.spinEnd) + " ? 8 : 3)) % 2 == 0 ? 100 : 15;"; kids.push(wa); }
    if (wb) { wb.blendingMode = BlendingMode.ADD; P(wb, "ADBE Opacity").expression = "Math.floor(time * (time > " + rel(w.spinEnd) + " ? 8 : 3)) % 2 == 1 ? 100 : 15;"; kids.push(wb); }
    var ptr = image(comp, DATA.assets.wheelPointer, "Pointer", [cx, cy - Rr * 1.1]);
    if (ptr) {
      var pw = ptr.source.width, ph = ptr.source.height;
      P(ptr, "ADBE Anchor Point").setValue([pw / 2, ph * 0.22]);
      pos(ptr, [cx, cy - Rr * 1.1]);
      P(ptr, "ADBE Rotate Z").expression = "var th = thisComp.layer(\"Wheel Disc\").transform.rotation.value; var seg = " + WH.segDeg + ";\n" +
        "var u = ((th / seg) % 1 + 1) % 1; var w = 0.22, mx = 26, b = 0.3;\n" +
        "u > 1 - w ? -mx * ((u - (1 - w)) / w) : (u < b ? -mx * Math.pow(1 - u / b, 2) * Math.cos(u / b * Math.PI * 1.5) : 0);";
      kids.push(ptr);
    }
    var i;
    for (i = 0; i < kids.length; i++) {
      kids[i].parent = rig;
      P(kids[i], "ADBE Opacity").expression = envExpr + "env * 100;";
    }
    P(rig, "ADBE Scale").expression = EASE_LIB + "var tIn = c01((time - " + inA + ") / " + (inB - inA) + "); var tOut = c01((time - " + outA + ") / " + (outB - outA) + ");\n" +
      "var s = (0.3 + 0.7 * outBack(tIn)) * (1 - 0.35 * inCubic(tOut)) * 100; [s, s];";
    var title = titleLayer(comp, "wheel", [cx, cy - Rr * 1.28], inA, rel(w.spinStart) + 1.1, W * 0.9);
    if (title) fadeKeys(title, inA, rel(w.spinStart) + 1.1, 0.3, 0.5);
    // Prize plaque.
    var pa = rel(w.prizeStart);
    coins(comp, { n: 110, start: pa, end: pa + 1.2, x: cx, y: H * 1.03, w: W * 0.5, spread: 1.2, vy0: 1.1, vy1: 0.55, g: 2.6, life: 2.4, scale: 1.2, seed: 260 + R.index });
    ring(comp, [cx, cy], pa, Rr * 1.6, DATA.accent, Rr * 0.05);
    var pl = shapeLayer(comp, "Prize Plaque");
    var pg = group(pl);
    rect(pg, [cx, cy], [Rr * 1.5, Rr * 0.62], Rr * 0.15);
    fill(pg, [0.1, 0.04, 0.16], 96);
    stroke(pg, [0.91, 0.73, 0.29], Math.max(2, Rr * 0.03));
    P(pl, "ADBE Anchor Point").setValue([cx, cy]);
    pos(pl, [cx, cy]);
    var popE = EASE_LIB + "var k = outBack(c01((time - " + pa + ") / 0.5)) * 100; [k, k];";
    P(pl, "ADBE Scale").expression = popE;
    trim(pl, pa, outB);
    var lbl = text(comp, "Prize Label", w.label, Math.round(Rr * 0.2), [cx, cy - Rr * 0.1]);
    P(lbl, "ADBE Scale").expression = popE;
    trim(lbl, pa, outB);
    winCtrl(comp, countKeys(rel(R.meter.start), rel(R.meter.end), R.amount));
    var ctr = counter(comp, [cx, cy + Rr * 0.12], Math.round(Rr * 0.14));
    trim(ctr, pa, outB);
    var fadeOut = envExpr + "env * 100;";
    P(pl, "ADBE Opacity").expression = fadeOut;
    P(lbl, "ADBE Opacity").expression = fadeOut;
    P(ctr, "ADBE Opacity").expression = fadeOut;
  }

  if (!app.project) app.newProject();
  proj = app.project;
  app.beginUndoGroup("Build " + DATA.name);
  try {
    top = folder(DATA.name);
    fAssets = folder("Assets", top);
    fReels = folder("Reels", top);
    fRounds = folder("Win FX", top);
    // Atlas first: reels reference it.
    buildAtlas();
    buildMain();
    main.openInViewer();
  } catch (err) {
    alert("The slot build stopped: " + err.toString() + (err.line ? " (script line " + err.line + ")" : ""));
  }
  app.endUndoGroup();
  if (missing.length) alert("These asset files were not found next to the script:\n" + missing.join("\n"));
})();
`;
