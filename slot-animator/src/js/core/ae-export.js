// After Effects export. Produces a self-contained ExtendScript (.jsx) that
// rebuilds the animation as a layered, editable After Effects project:
// - "Placeholder Comps" holds every piece of art and every effect look once:
//   symbols and their win animations, machine art, shockwaves, light rays,
//   the coin, cell frames, plaques, titles, paylines, the wheel parts and the
//   counter digits. Every use is a layer of that comp, so replacing or
//   animating a placeholder updates the whole animation,
// - reels (or cells) are precomps driven by one "Spin" slider whose keyframes
//   carry the exact speed/influence eases of the preview; tumbling symbols
//   are keyframed layers in the same precomps,
// - every round is its own comp that places those effect layers in time;
//   coin showers are comps of their own,
// - counters are rolling-digit rigs driven by sliders (no plugin needed),
// - "SFX" holds one audio layer per sound cue, mixed by group on a null,
// - SLOT CONTROL carries the After Effects side controls (shake, flash, dim,
//   coins, spin blur, win pop, effect colours).
// The script is ES3 so every After Effects version's ExtendScript runs it.

import { normInf, evalKeys } from './keys.js';
import { STICKY_COVER } from './timeline.js';
import { lineColor } from './paylines.js';
import { OUTCOME_BY_ID } from './defaults.js';
import { holdSpinConfig, isCoinSym, formatPrize, COIN_GLOW } from './coins.js';
import { sfxCues, SFX_GROUPS, toDb } from './sfx.js';
import { particleAssetInfo, spawnParticles, TEMPLATE_BY_ID } from './particles.js';
import { jumpTarget, mergeTarget, flightPath, winFxConfig } from './winfx.js';
import { zoomConfig, focusPoint, ZOOM_IN, ZOOM_HOLD, ZOOM_OUT, PAN } from './camera.js';
import { wheelConfig, segmentLayout, labelPalette, POINTER_MAX } from './wheel.js';
import { fontPostScript } from './fonts.js';

export const AE_ASSETS = {
  shared: {
    symbol: (i) => `assets/symbols/symbol_${String(i + 1).padStart(2, '0')}.png`,
    winFrame: (i, k) => `assets/symbols/win_${String(i + 1).padStart(2, '0')}_${String(k + 1).padStart(3, '0')}.png`,
    sfx: (type, n) => `assets/sfx/${type}_${String(n).padStart(2, '0')}.wav`,
    particle: (id, k) => `assets/particles/${String(id).replace(/[^a-z0-9_-]/gi, '_')}_${String(k + 1).padStart(2, '0')}.png`,
  },
  format: (dir) => ({
    background: `${dir}/background.png`,
    back: `${dir}/machine_back.png`,
    front: `${dir}/machine_front.png`,
    bulbsA: `${dir}/bulbs_a.png`,
    bulbsB: `${dir}/bulbs_b.png`,
    hud: `${dir}/hud_panel.png`,
    logo: `${dir}/logo.png`,
    vignette: `${dir}/vignette.png`,
    rays: `${dir}/rays.png`,
    raysSmall: `${dir}/rays_small.png`,
    wheelFace: `${dir}/wheel_face.png`,
    wheelSegments: `${dir}/wheel_segments.png`,
    wheelHub: `${dir}/wheel_hub.png`,
    wheelCenter: `${dir}/wheel_center.png`,
    wheelIcon: (k) => `${dir}/wheel_icon_${String(k + 1).padStart(2, '0')}.png`,
    wheelRing: `${dir}/wheel_ring.png`,
    wheelBulbsA: `${dir}/wheel_bulbs_a.png`,
    wheelBulbsB: `${dir}/wheel_bulbs_b.png`,
    wheelPointer: `${dir}/wheel_pointer.png`,
    title: (k) => `${dir}/title_${String(k).replace(/[^a-z0-9_-]/gi, '_')}.png`,
  }),
};

// Batch formats are "WxH" strings. The timeline does not depend on the canvas
// size, so every format shares one timeline and only the layout changes.
export const FORMAT_CHOICES = [
  { id: '1920x1080', label: 'Landscape 16:9' },
  { id: '1080x1920', label: 'Portrait 9:16' },
  { id: '1080x1080', label: 'Square 1:1' },
  { id: '1080x1350', label: 'Feed 4:5' },
  { id: '3840x2160', label: '4K 16:9' },
];

export function parseFormat(f) {
  const m = /^(\d{2,5})x(\d{2,5})$/.exec(String(f || ''));
  if (!m) return null;
  const w = Math.min(7680, Math.max(64, +m[1]));
  const h = Math.min(7680, Math.max(64, +m[2]));
  return [w - (w % 2), h - (h % 2)];
}

export function exportFormats(project) {
  const list = (project.output?.formats || []).map(parseFormat).filter(Boolean);
  const own = [project.canvas.width, project.canvas.height];
  const seen = new Set();
  return (list.length ? list : [own]).filter(([w, h]) => !seen.has(`${w}x${h}`) && seen.add(`${w}x${h}`));
}

export function projectForFormat(project, [w, h]) {
  return { ...project, canvas: { ...project.canvas, width: w, height: h } };
}

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

function stepColor(st, c, r) {
  for (const l of st.lines || []) if (l.cells.some(([cc, rr]) => cc === c && rr === r)) return lineColor(l.index);
  return st.symbol >= 0 ? lineColor(st.symbol + 3) : '#ffd25a';
}

const clean = (s) => String(s || '').replace(/["\\\r\n]/g, '').slice(0, 40);

export function buildAEData(project, tl, L, extras = {}) {
  const dir = extras.assetDir || 'assets/format';
  const A = AE_ASSETS.format(dir);
  const cellX = (c) => r4(L.reelX[c] + L.cellW / 2);
  const cellY = (rowPos) => r4(L.rowsTop + (rowPos + 0.5) * L.cellH);
  const symbols = project.symbols.map((s, i) => ({
    name: clean(s.name) || `Symbol ${i + 1}`,
    file: AE_ASSETS.shared.symbol(i),
    win: extras.winFrames?.[i] ? { frames: extras.winFrames[i].map((_, k) => AE_ASSETS.shared.winFrame(i, k)), fps: extras.winFps?.[i] || 24 } : null,
  }));
  const lay = tl.lay;
  const hsc = holdSpinConfig(project);
  if (lay.virtualOrb) symbols.push({ name: 'Multiplier', file: AE_ASSETS.shared.symbol(lay.orbSym), win: null });
  hsc.coins.forEach((ct, i) => symbols.push({ name: clean(ct.name) || `Coin ${i + 1}`, file: AE_ASSETS.shared.symbol(lay.coinBase + i), win: null }));
  symbols.push({ name: 'Empty cell', file: AE_ASSETS.shared.symbol(lay.blankSym), win: null });
  const cur = project.machine.currency || '';
  const dec = project.machine.decimals | 0;
  const labelled = hsc.coins.map((c) => !!c.label && !c.src);
  const coinColor = (sym) => rgb(COIN_GLOW[hsc.coins[sym - lay.coinBase]?.palette] || COIN_GLOW.gold);
  // A value riding on a symbol: [text, offset in cells, scale]. "x5" sits low
  // on a multiplier; a coin's prize sits in its middle.
  const label = (sym, v) => (isCoinSym(lay, sym) ? [clean(formatPrize(v, cur, dec)), labelled[sym - lay.coinBase] ? -0.1 : 0, 0.7] : [`x${v}`, 0.2, 1]);
  const labelsOf = (strip, values) => [...values.entries()].map(([j, v]) => [j, ...label(strip[j], v)]);
  // Particle art used by the emitters, in order of first use.
  const amount = Number(project.effects.coins ?? 1);
  const partAssets = usedParticleAssets(tl, project);
  const particleIndex = (id) => Math.max(0, partAssets.findIndex((a) => a.id === particleAssetInfo(project, id).id));

  // Jumping or merging winners: their flights, laid out for this format.
  const bigScale = r4(Number(winFxConfig(project).bigScale) || 2.2);
  const winFxData = (st) => {
    const f = st.fx;
    const goal = f.style === 'jump' ? jumpTarget(project, L, st) : mergeTarget(project, L, st);
    const out = {
      style: f.style,
      kind: f.path,
      launch: f.launch.map(r4),
      arrive: f.arrive.map(r4),
      until: f.until.map(r4),
      goal: [r4(goal.x), r4(goal.y)],
      paths: st.cells.map(([c, r]) => {
        const q = flightPath(f.style, { x: cellX(c), y: cellY(r) }, goal, L, f.path);
        return [q.x0, q.y0, q.cx, q.cy, q.x1, q.y1].map(r4);
      }),
    };
    if (f.style === 'merge') Object.assign(out, { mergeAt: r4(f.mergeAt), big: bigScale, sym: st.symbol >= 0 ? st.symbol : st.cellSyms[0] });
    return out;
  };
  // One emitter with its baked particles. loop: seconds of the repeating cycle.
  const emitterData = (em) => {
    const info = particleAssetInfo(project, em.asset);
    const tpl = TEMPLATE_BY_ID[em.fx];
    return {
      // Emitters of several rounds share the main comp: say whose they are.
      name: clean(`${em.main && em.round >= 0 ? `R${String(em.round + 1).padStart(2, '0')} ` : ''}${em.moment === 'tier' ? `${em.label} ${tpl.name}` : em.moment === 'ambient' ? `Ambient ${tpl.name}` : tpl.name}`),
      moment: em.moment,
      layer: em.layer,
      a: particleIndex(em.asset),
      start: r4(em.start),
      cut: r4(em.cut),
      loop: em.loop || 0,
      end: em.cut >= tl.duration - 1e-6 ? 1 : 0,
      ps: spawnParticles(em, L, info.motion, amount).map((q) => [q.b, q.l, q.x, q.y, q.vx, q.vy, q.g, q.k, q.s, q.r0, q.rv, q.f, q.ph, q.sw, q.sf, q.v, q.fo, q.tw].map(r4)),
    };
  };
  const rounds = tl.rounds.map((R) => {
    const p = R.pres;
    const o = OUTCOME_BY_ID[R.outcome] || { label: R.outcome };
    const out = {
      index: R.index,
      outcome: R.outcome,
      label: clean(o.list || o.label),
      t0: r4(R.t0),
      start: r4(R.presentStart),
      end: r4(R.end),
      next: r4(R.next),
      amount: R.win.amount || 0,
      steps: (p.steps || []).map((st) => ({
        start: r4(st.start),
        end: r4(st.end),
        amount: r4(st.amount || 0),
        tumble: st.tumble ? 1 : 0,
        cells: st.cells.map(([c, r], i) => ({ x: cellX(c), y: cellY(r), s: st.cellSyms[i], color: rgb(stepColor(st, c, r)) })),
        lines: (st.lines || []).map((l) => {
          const line = tl.paylines[l.index];
          const pts = line.map((r, c) => [cellX(c), cellY(r)]);
          pts.unshift([r4(L.frame.x + L.pad * 0.35), pts[0][1]]);
          pts.push([r4(L.frame.x + L.frame.w - L.pad * 0.35), pts[pts.length - 1][1]]);
          return { index: l.index, color: rgb(lineColor(l.index)), pts };
        }),
        fx: st.fx ? winFxData(st) : null,
      })),
      pops: R.actors.filter((a) => a.popAt != null).map((a) => ({ x: cellX(a.c), y: cellY(evalKeys(a.keys, a.popAt)), t: r4(a.popAt), color: rgb(lineColor(a.sym + 3)) })),
      scatters: R.win.scatters.map(([c, r]) => ({ x: cellX(c), y: cellY(r), s: R.grid[c][r] })),
      antic: [],
    };
    if (R.cells) {
      for (const ci of R.cells) if (ci && ci.antic) out.antic.push({ x: cellX(ci.c), y: cellY(ci.r), w: L.cellW, h: L.cellH, start: r4(ci.antic.start), end: r4(ci.antic.end) });
    } else {
      R.reels.forEach((ri, c) => ri.antic && out.antic.push({ x: cellX(c), y: r4(L.winTop + L.winH / 2), w: r4(L.cellW * 1.06), h: r4(L.winH * 1.02), start: r4(ri.antic.start), end: r4(ri.antic.end) }));
    }
    // Emitters that run to the end live in the main comp (see mainParticles).
    out.particles = (p.particles || []).filter((em) => !em.main).map(emitterData);
    if (p.expand) {
      out.expand = {
        start: r4(p.expand.start),
        end: r4(p.expand.end),
        reels: p.expand.reels.map((c) => {
          const origin = (p.expand.wilds.find(([cc]) => cc === c) || [c, Math.floor(tl.rows / 2)])[1];
          return { x: cellX(c), cells: Array.from({ length: tl.rows }, (_, r) => ({ y: cellY(r), delay: r4(Math.abs(r - origin) * 0.1) })) };
        }),
      };
    }
    if (p.mult) {
      out.mult = {
        start: r4(p.mult.start),
        applyAt: r4(p.mult.applyAt),
        end: r4(p.mult.end),
        base: r4(p.mult.base),
        sum: p.mult.sum,
        total: r4(p.mult.total),
        target: [r4(L.W / 2), r4(L.winTop + L.cellH * 0.55)],
        items: p.mult.items.map((it) => ({ x: cellX(it.c), y: cellY(it.r), t: r4(it.t), value: it.value })),
      };
    }
    if (p.nearmiss) {
      out.nearmiss = { start: r4(p.nearmiss.start), end: r4(p.nearmiss.end) };
      if (R.win.nearMiss) out.nearMiss = { x: cellX(R.win.nearMiss.reel) };
    }
    if (p.celebrate) out.celebrate = { start: r4(p.celebrate.start), end: r4(p.celebrate.end) };
    if (p.overlay) {
      const ov = p.overlay;
      out.overlay = { start: r4(ov.start), countStart: r4(ov.countStart), countEnd: r4(ov.countEnd), end: r4(ov.end), tiers: ov.tiers, tierTimes: ov.tierTimes.map(r4), keys: exportKeys(ov.keys), amount: ov.amount };
    }
    if (p.banner) out.banner = { start: r4(p.banner.start), end: r4(p.banner.end), kind: p.banner.kind, freeSpins: p.banner.freeSpins };
    if (p.meter) out.meter = { start: r4(p.meter.start), end: r4(p.meter.end) };
    if (p.holdspin) {
      out.holdspin = {
        tease: p.holdspin.cells.filter((ci) => ci.antic).map((ci) => ({ x: cellX(ci.c), y: cellY(ci.r), start: r4(ci.antic.start), end: r4(ci.antic.end) })),
        hits: p.holdspin.cells.filter((ci) => ci.hit).map((ci) => ({ x: cellX(ci.c), y: cellY(ci.r), t: r4(ci.stop), s: ci.sym, lab: label(ci.sym, ci.value), special: ci.special ? 1 : 0, color: ci.special ? coinColor(ci.sym) : rgb(extras.accent || '#ffd25a') })),
      };
    }
    if (p.collect) {
      out.collect = {
        start: r4(p.collect.start),
        end: r4(p.collect.end),
        items: p.collect.items.map((it) => ({ x: cellX(it.c), y: cellY(it.r), at: r4(it.at), arrive: r4(it.arrive), s: it.sym, text: label(it.sym, it.value)[0], color: it.special ? coinColor(it.sym) : rgb(extras.accent || '#ffd25a') })),
      };
    }
    if (p.grand) out.grand = { start: r4(p.grand.start), end: r4(p.grand.end), countEnd: r4(p.grand.countEnd), keys: exportKeys(p.grand.keys), amount: p.grand.amount };
    if (p.wheel) {
      const w = p.wheel;
      out.wheel = {
        inStart: r4(w.inStart),
        inEnd: r4(w.inEnd),
        spinStart: r4(w.spinStart),
        spinEnd: r4(w.spinEnd),
        prizeStart: r4(w.prizeStart),
        countStart: r4(w.countStart),
        countEnd: r4(w.countEnd),
        outStart: r4(w.outStart),
        outEnd: r4(w.outEnd),
        segment: w.segment,
        label: clean(project.wheel.segments[w.segment]?.label ?? ''),
        angle0: r4(wheelAngleAt(tl.wheelKeys, w.spinStart)),
        plaqueEnd: r4(Math.min(w.plaqueEnd ?? w.outEnd, w.outEnd)),
        cont: w.cont ? 1 : 0,
        keys: exportKeys(tl.wheelKeys, w.spinStart, w.spinEnd),
        kick: w.kick ? [r4(w.kick.t), w.kick.amp] : null,
        // Spin again: the segment, when the plaque says so, and its label.
        agains: (w.agains || []).map((g) => ({ segment: g.segment, at: r4(g.at), until: r4(g.until), label: clean(project.wheel.segments[g.segment]?.label || 'SPIN AGAIN') })),
        noWin: w.noWin ? 1 : 0,
      };
    }
    return out;
  });
  // The wheel game hands the wheel from one round's comp to the next.
  if (tl.game === 'wheel') rounds.forEach((r, i) => (r.fxEnd = rounds[i + 1] ? rounds[i + 1].start : null));

  const actorsByCol = Array.from({ length: tl.reels }, () => []);
  if (tl.mode === 'cascade') {
    // Between drops the preview shows the resting grid: before the first
    // spin, and through rounds that do not spin (a free spins total).
    const rest = (grid, mult, a, b) => {
      b = Math.min(b, tl.duration);
      if (!(b - a > 1e-3)) return;
      for (let c = 0; c < tl.reels; c++) {
        for (let r = 0; r < tl.rows; r++) {
          const m = mult?.[c]?.[r] ?? null;
          actorsByCol[c].push({ s: grid[c][r], lab: m != null ? label(grid[c][r], m) : null, tIn: r4(a), tOut: r4(b), keys: [{ t: r4(a), v: r, is: 0, ii: 0.1667, os: 0, oi: 0.1667, h: 1 }], pop: null });
        }
      }
    };
    rest(tl.initialGrid, null, 0, tl.rounds.length ? tl.rounds[0].t0 : tl.duration);
    tl.rounds.forEach((R, i) => {
      const prevMult = i > 0 ? tl.rounds[i - 1].finalMult : null;
      rest(R.prevGrid, prevMult, R.t0, R.actorsFrom == null ? R.next : R.actorsFrom);
    });
  }
  for (const R of tl.rounds) {
    for (const a of R.actors) {
      actorsByCol[a.c].push({ s: a.sym, lab: a.mult != null ? label(a.sym, a.mult) : null, tIn: r4(a.tIn), tOut: r4(Math.min(a.tOut, tl.duration)), keys: exportKeys(a.keys), pop: a.popAt != null ? r4(a.popAt) : null });
    }
  }
  const hideWindows = tl.mode === 'cascade' ? [] : tl.rounds.filter((R) => R.actorsFrom != null).map((R) => [r4(R.actorsFrom), r4(R.next)]);
  // The wheel: where it sits, its pointer, and what goes on the disc. Labels
  // become text layers; the preview's measured sizes are used when given.
  const WG = L.wheel;
  const wcfg = wheelConfig(project);
  const wsegs = project.wheel.segments;
  const wlay = segmentLayout(wsegs, WG.R, project);
  const wpal = labelPalette(wcfg.labelPalette);
  const wheelData = {
    cx: r4(WG.cx),
    cy: r4(WG.cy),
    R: WG.R,
    segDeg: r4(360 / Math.max(2, wsegs.length)),
    n: wsegs.length,
    disc: Math.ceil(WG.R * 2 + 8),
    pointerAngle: WG.pointerAngle,
    pivot: [r4(WG.pivot.x), r4(WG.pivot.y)],
    anchor: extras.wheelPivot ? extras.wheelPivot.map(r4) : null,
    max: POINTER_MAX,
    title: [r4(WG.title.x), r4(WG.title.y)],
    plaque: [r4(WG.plaque.x), r4(WG.plaque.y), r4(WG.plaque.R)],
    hubSpins: wcfg.hubSpins ? 1 : 0,
    font: fontPostScript(project, wcfg.labelFont || project.effects.font),
    fill: rgb(wpal.fill),
    stroke: rgb(wpal.stroke),
    labels: wlay
      .map((it, k) => {
        if (!it.label) return null;
        const text = String(wsegs[k].label);
        const est = it.label.px * Math.min(1, it.label.maxLen / Math.max(1, text.length * 0.62 * it.label.px));
        return { text: clean(text), a: r4(it.a), r: r4(it.label.r), px: r4(extras.wheelLabels?.[k]?.px ?? est) };
      })
      .filter(Boolean),
    icons: wlay.map((it, k) => (it.icon && wsegs[k].icon ? { k, a: r4(it.a), r: r4(it.icon.r), file: A.wheelIcon(k) } : null)).filter(Boolean),
  };
  const odoSize = 120;
  const hud = L.hud
    ? {
        x: r4(L.hud.x + L.hud.w / 2),
        y: r4(L.hud.y + L.hud.h * 0.6),
        size: Math.round(L.hud.h * 0.42),
        label: Math.round(L.hud.h * 0.17),
        left: [r4(L.hud.x + L.hud.w * 0.14), r4(L.hud.y + L.hud.h * 0.55)],
        right: [r4(L.hud.x + L.hud.w * 0.86), r4(L.hud.y + L.hud.h * 0.55)],
        betText: `BET ${project.machine.currency || ''}${Number(project.machine.bet || 0).toFixed(project.machine.decimals | 0)}`,
        rightText:
          project.machine.payMode === 'lines'
            ? `LINES ${tl.paylines.length}`
            : project.machine.payMode === 'ways'
              ? `${Math.pow(tl.rows, tl.reels)} WAYS`
              : project.machine.payMode === 'anywhere'
                ? `PAYS ${project.machine.minAnywhere}+`
                : `CLUSTER ${project.machine.minCluster}+`,
      }
    : null;

  return {
    name: clean(project.name) || 'Slot Animation',
    W: L.W,
    H: L.H,
    fps: project.canvas.fps,
    duration: r4(tl.duration),
    mode: tl.mode,
    reels: tl.reels,
    rows: tl.rows,
    peek: r4(L.peek),
    dir: tl.dir,
    cellW: L.cellW,
    cellH: L.cellH,
    winX: L.winX,
    winW: L.winW,
    winTop: L.winTop,
    winH: L.winH,
    rowsTop: r4(L.rowsTop),
    reelX: L.reelX,
    logo: [r4(L.logo.cx), r4(L.logo.cy)],
    ribbon: [r4(L.W / 2), r4(Math.min(L.frame.y - L.H * 0.025, L.logo.cy + L.logo.h * 0.42))],
    hud,
    symbols,
    wildSym: project.symbols.findIndex((s) => s.role === 'wild'),
    strips: tl.mode === 'cascade' ? [] : tl.strips,
    stripKeys: tl.mode === 'cascade' ? [] : tl.stripKeys.map((k) => exportKeys(k)),
    stripLabels: tl.mode === 'cascade' ? [] : tl.stripValues.map((m, si) => labelsOf(tl.strips[si], m)),
    hideWindows,
    actors: actorsByCol,
    meterKeys: exportKeys(tl.meterKeys),
    fsTotalKeys: exportKeys(tl.fsTotalKeys),
    fsBlocks: tl.fsBlocks.map((b) => [r4(b.start), r4(Math.min(b.end, tl.duration)), b.n, b.rounds.map((r) => [r4(r.t0), r.index == null ? -1 : r.index, r.total ? 1 : 0])]),
    stickies: tl.stickies.map((s) => ({ c: s.c, r: s.r, x: cellX(s.c), y: cellY(s.r), from: r4(s.from), cover: r4(s.from + STICKY_COVER), to: r4(Math.min(s.to, tl.duration)) })),
    shakes: tl.shakes.map((s) => [r4(s.t), r4(s.amp * (Number(project.effects.shake) || 0) * L.cellW * 0.09), r4(s.dur)]),
    flashes: tl.flashes.map((f) => [r4(f.t), r4(f.amp * (Number(project.effects.flash) || 0)), r4(f.dur)]),
    rounds,
    currency: clean(project.machine.currency || ''),
    decimals: project.machine.decimals | 0,
    dim: r4(Number(project.effects.dim) || 0),
    popScale: r4(Number(project.effects.popScale) || 0),
    popDur: r4(Number(project.timing.tumblePop) || 0.36),
    blur: r4(Number(project.spin.blur) || 0),
    accent: rgb(extras.accent || '#ffd25a'),
    font: extras.fontPostScript || 'Bungee-Regular',
    titlePx: extras.titlePx || Math.round(Math.min(L.W * 0.11, L.H * 0.16)),
    odo: { size: odoSize, dw: Math.round(odoSize * 0.8), sw: Math.round(odoSize * 0.38), rh: Math.round(odoSize * 1.3) },
    wheel: wheelData,
    transparent: project.output?.transparent ? 1 : 0,
    game: tl.game,
    hold: tl.hold.windows.length
      ? {
          strips: tl.hold.strips,
          keys: tl.hold.keys.map((k) => exportKeys(k)),
          labels: tl.hold.values.map((m, k) => labelsOf(tl.hold.strips[k], m)),
          windows: tl.hold.windows.map((w) => [r4(w.start), r4(Math.min(w.end, tl.duration)), r4(w.fadeIn), r4(w.fadeOut)]),
          locks: tl.hold.locks.map((l) => ({ x: cellX(l.c), y: cellY(l.r), from: r4(l.from), to: r4(Math.min(l.to, tl.duration)), done: l.collectAt != null ? r4(l.collectAt + 0.42) : null, color: l.special ? coinColor(l.sym) : rgb(extras.accent || '#ffd25a'), special: l.special ? 1 : 0 })),
          counter: tl.hold.counterKeys.map((k) => [r4(k.t), k.v]),
          collectKeys: exportKeys(tl.hold.collectKeys),
          collectWins: tl.rounds.filter((R) => R.pres.collect).map((R) => [r4(R.pres.collect.start), r4(R.pres.collect.end + 0.6)]),
          barY: r4(L.frame.y + L.pad * 0.25),
          cells: tl.reels * tl.rows,
        }
      : null,
    sfx: extras.sfx ? sfxData(tl, project, extras.sfxHeadroom || 0) : null,
    showLines: project.effects.showLines === false ? 0 : 1,
    // Emitters that run to the end of the animation (and the ambient layer),
    // placed in the main comp.
    mainParticles: (tl.emitters || []).filter((em) => em.main).map(emitterData),
    // Anticipation zoom: windows of [start, end, [[t, x, y]...]] for the
    // CAMERA null. Cells use the flat rows After Effects lays out.
    camera: (tl.camera || []).length
      ? {
          amount: r4(zoomConfig(project).amount),
          times: [ZOOM_IN, ZOOM_HOLD, ZOOM_OUT, PAN],
          windows: tl.camera.map((w) => [r4(w.start), r4(w.end), w.foci.map((f) => {
            const p = f.r == null ? focusPoint(L, f) : { x: cellX(f.c), y: cellY(f.r) };
            return [r4(f.t), r4(p.x), r4(p.y)];
          }), r4(w.amount ?? zoomConfig(project).amount)]),
        }
      : null,
    particles: { assets: partAssets.map((a) => ({ name: clean(a.name), files: a.files, count: a.count, anim: a.anim ? 1 : 0, fps: a.fps, motion: a.motion, blend: a.motion === 'glow' ? 'add' : 'normal' })) },
    assets: {
      background: A.background,
      back: A.back,
      front: A.front,
      bulbsA: extras.hasBulbs ? A.bulbsA : '',
      bulbsB: extras.hasBulbs ? A.bulbsB : '',
      hud: L.hud ? A.hud : '',
      logo: extras.hasLogo === false ? '' : A.logo,
      vignette: A.vignette,
      rays: A.rays,
      raysSmall: A.raysSmall,
      wheelFace: project.wheel.art?.face ? A.wheelFace : '',
      wheelSegments: A.wheelSegments,
      wheelHub: wcfg.show.hub ? A.wheelHub : '',
      wheelCenter: wcfg.centerIcon && wcfg.centerIcon !== 'none' ? A.wheelCenter : '',
      wheelRing: wcfg.show.rim ? A.wheelRing : '',
      wheelBulbsA: wcfg.show.bulbs ? A.wheelBulbsA : '',
      wheelBulbsB: wcfg.show.bulbs ? A.wheelBulbsB : '',
      wheelPointer: A.wheelPointer,
      titles: Object.fromEntries((extras.titleKeys || []).map((k) => [k, A.title(k)])),
    },
  };
}

// The particle assets the emitters use, with the files the package holds
// for each (one PNG per variant or animation frame).
export function usedParticleAssets(tl, project) {
  const out = [];
  for (const em of tl.emitters || []) {
    const info = particleAssetInfo(project, em.asset);
    if (!out.some((a) => a.id === info.id)) out.push({ ...info, files: Array.from({ length: info.count }, (_, k) => AE_ASSETS.shared.particle(info.id, k)) });
  }
  return out;
}

// The SFX comp: one layer per cue, named after the cue and its round, set
// to its group's colour. Levels are in decibels on the SFX MIX null.
function sfxData(tl, project, headroom) {
  const { clips, events } = sfxCues(tl);
  if (!clips.length) return null;
  const sound = project.sound || {};
  const gi = Object.fromEntries(SFX_GROUPS.map((g, i) => [g.id, i]));
  return {
    clips: clips.map((c) => AE_ASSETS.shared.sfx(c.type, c.n)),
    events: events.map((e) => [r4(e.t), e.clip, gi[e.group] ?? SFX_GROUPS.length - 1, clean(e.label + (e.round >= 0 ? ` R${String(e.round + 1).padStart(2, '0')}` : ''))]),
    groups: SFX_GROUPS.map((g) => ({ name: g.name, label: g.label, db: toDb(sound.mix?.[g.id] ?? 1) })),
    master: Math.round((toDb(sound.volume ?? 0.8) + headroom) * 100) / 100,
  };
}

export function buildAEScript(dataList) {
  const list = Array.isArray(dataList) ? dataList : [dataList];
  const json = JSON.stringify(list).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return AE_SCRIPT.replace('__DATA__', () => json);
}

// ExtendScript (ES3). Keep it free of let/const, arrow functions, template
// strings and JSON: older After Effects versions reject them.
export const AE_SCRIPT = String.raw`// Slot animation rebuilt for After Effects by Reel Studio.
// Run it with File > Scripts > Run Script File... and keep this .jsx next
// to the "assets" folder it came with.
(function () {
  var DATA_LIST = __DATA__;
  var ROOT = (new File($.fileName)).parent;
  var missing = [];
  var BEZ = KeyframeInterpolationType.BEZIER;
  var HOLD = KeyframeInterpolationType.HOLD;
  var proj, fShared;
  var footage = {};
  var DATA, W, H, FPS, DUR, SUFFIX, top, fPH, fSymbols, fReels, fRounds, fHold, atlas, main, slotCtrl, shake, symComps, winComps, digits, mainName;
  var PH, FOLD, RBASE;
  var WIN_INTRO = 0.6, WIN_LOOP = 1.5385;

  function file(rel) { return new File(ROOT.fsName + "/" + rel); }
  function folder(name, parent) { var f = proj.items.addFolder(name); if (parent) f.parentFolder = parent; return f; }
  function imp(rel, into) {
    if (!rel) return null;
    if (footage[rel]) return footage[rel];
    var f = file(rel);
    if (!f.exists) { missing.push(rel); return null; }
    var it = proj.importFile(new ImportOptions(f));
    it.parentFolder = into || fShared;
    footage[rel] = it;
    return it;
  }
  function tr(L) { return L.property("ADBE Transform Group"); }
  function P(L, name) { return tr(L).property(name); }
  function pos(L, xy) { P(L, "ADBE Position").setValue(xy); }
  function fx(L, match, name) { var e = L.property("ADBE Effect Parade").addProperty(match); if (name) e.name = name; return e; }
  function slider(L, name) { return fx(L, "ADBE Slider Control", name).property(1); }
  // Layer in/out points; the layer always keeps at least one frame.
  function trim(L, a, b) {
    var has = a !== undefined && a !== null;
    if (has) a = Math.max(0, a);
    if (b !== undefined && b !== null) {
      if (has && b < a + 1 / FPS) b = a + 1 / FPS;
      if (b <= L.inPoint) L.inPoint = Math.max(0, b - 1 / FPS);
      L.outPoint = b;
    }
    if (has) L.inPoint = a;
  }
  function pct(x) { var v = x * 100; if (v < 0.1) v = 0.1; if (v > 100) v = 100; return v; }
  function setKeys(prop, keys, tOff, mul, add) {
    var i, times = [], vals = [];
    tOff = tOff || 0;
    mul = (mul === undefined) ? 1 : mul;
    add = add || 0;
    if (!keys || !keys.length) return;
    for (i = 0; i < keys.length; i++) { times.push(keys[i].t + tOff); vals.push(keys[i].v * mul + add); }
    prop.setValuesAtTimes(times, vals);
    for (i = 0; i < keys.length; i++) {
      var k = keys[i];
      var prevHold = i > 0 && keys[i - 1].h;
      try {
        prop.setInterpolationTypeAtKey(i + 1, prevHold ? HOLD : BEZ, k.h ? HOLD : BEZ);
        prop.setTemporalContinuousAtKey(i + 1, false);
        prop.setTemporalAutoBezierAtKey(i + 1, false);
        prop.setTemporalEaseAtKey(i + 1, [new KeyframeEase(k.is * mul, pct(k.ii))], [new KeyframeEase(k.os * mul, pct(k.oi))]);
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
  function fitTo(L, w, h) {
    try {
      var s = 100 * Math.min(w / L.source.width, h / L.source.height);
      P(L, "ADBE Scale").setValue([s, s]);
    } catch (e) {}
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
  function ellipse(cont, xy, size) {
    var e = cont.addProperty("ADBE Vector Shape - Ellipse");
    e.property("ADBE Vector Ellipse Size").setValue(size);
    e.property("ADBE Vector Ellipse Position").setValue(xy);
    return e;
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
  function text(comp, name, str, size, xy, rgbv, shadow) {
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
    if (shadow !== false) {
      try {
        var ds = fx(L, "ADBE Drop Shadow");
        ds.property("ADBE Drop Shadow-0002").setValue(178);
        ds.property("ADBE Drop Shadow-0004").setValue(Math.round(size * 0.06));
        ds.property("ADBE Drop Shadow-0005").setValue(Math.round(size * 0.12));
      } catch (e3) {}
    }
    return L;
  }
  function fmtExpr() {
    return "function fmt(v){var d=" + DATA.decimals + ";var s=Math.max(0,v).toFixed(d);var parts=s.split('.');var i=parts[0];var out='';" +
      "while(i.length>3){out=','+i.substr(i.length-3)+out;i=i.substr(0,i.length-3);}return '" + DATA.currency + "'+i+out+(d>0?'.'+parts[1]:'');}\n";
  }
  function counterExpr(ref) {
    return fmtExpr() + "var v = " + ref + ";\nv > 0.0001 ? fmt(v) : '';";
  }
  function windowsExpr(name, list) {
    var s = "var " + name + " = [", i;
    for (i = 0; i < list.length; i++) s += (i ? "," : "") + "[" + list[i][0] + "," + list[i][1] + "]";
    return s + "];\n";
  }
  var EASE_LIB = "function c01(x){return x<0?0:(x>1?1:x);}\n" +
    "function outBack(x){var s=1.70158;return 1+(s+1)*Math.pow(x-1,3)+s*Math.pow(x-1,2);}\n" +
    "function outElastic(x){return x<=0?0:(x>=1?1:Math.pow(2,-10*x)*Math.sin((x*10-0.75)*(2*Math.PI)/3)+1);}\n" +
    "function inCubic(x){return x*x*x;}\n";
  function uniqueName(base) {
    var names = {}, i;
    for (i = 1; i <= proj.numItems; i++) if (proj.item(i).layers) names[proj.item(i).name] = true;
    if (!names[base]) return base;
    for (i = 2; i < 1000; i++) if (!names[base + " " + i]) return base + " " + i;
    return base + " " + (new Date()).getTime();
  }
  function addComp(name, w, h, dur, parent) {
    var c = proj.items.addComp(uniqueName(name), Math.max(4, Math.round(w)), Math.max(4, Math.round(h)), 1, Math.max(1 / FPS, dur), FPS);
    if (parent) c.parentFolder = parent;
    return c;
  }
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function dir(key, name, parent) {
    if (!FOLD[key]) FOLD[key] = folder(name, parent);
    return FOLD[key];
  }

  // ---------- placeholder comps ----------
  // Each piece of art or effect look is built once, in "Placeholder Comps";
  // every use is a layer of it. Open one and replace the art or animate it:
  // all its uses follow.
  var PH_NOTE = "Placeholder: replace the art or animate inside; every layer that uses this comp follows.";
  function ph(key, sub, w, h, dur, build) {
    if (PH.hasOwnProperty(key)) return PH[key];
    var c = addComp(key + SUFFIX, w, h, dur, dir("PH/" + sub, sub, fPH));
    c.comment = PH_NOTE;
    build(c);
    PH[key] = c;
    return c;
  }
  // A placeholder holding one image at its own size (missing file: none).
  function imagePH(key, sub, rel) {
    if (PH.hasOwnProperty(key)) return PH[key];
    var it = imp(rel);
    if (!it) { PH[key] = null; return null; }
    return ph(key, sub, it.width, it.height, DUR + 2, function (c) {
      var L = c.layers.add(it);
      L.name = key;
      pos(L, [c.width / 2, c.height / 2]);
    });
  }
  // A layer of a placeholder (or any comp) from a to b.
  function inst(comp, src, name, xy, a, b) {
    if (!src) return null;
    var L = comp.layers.add(src);
    L.name = name;
    if (a !== undefined && a !== null) L.startTime = Math.max(0, a);
    if (xy) pos(L, xy);
    trim(L, a, b);
    return L;
  }
  // An After Effects side control on SLOT CONTROL, from any comp.
  function ctrl(name) {
    return "comp(\"" + mainName + "\").layer(\"SLOT CONTROL\").effect(\"" + name + "\")(1)";
  }
  // Effect placeholders are white; each use is tinted to its colour. Turn
  // "FX Colour" off on SLOT CONTROL to keep your own art's colours.
  function tint(L, rgbv) {
    try {
      var t = fx(L, "ADBE Tint", "Colour");
      try { t.property("ADBE Tint-0002").setValue(rgbv); } catch (e1) { t.property("Map White To").setValue(rgbv); }
      try { t.property("ADBE Tint-0003").expression = ctrl("FX Colour") + ".value ? value : 0;"; } catch (e2) {}
    } catch (e) {}
  }

  // ---------- symbols ----------
  function buildSymbols() {
    var i, k;
    symComps = [];
    winComps = [];
    for (i = 0; i < DATA.symbols.length; i++) {
      var sd = DATA.symbols[i];
      var sc = addComp("Symbol " + pad2(i + 1) + " " + sd.name + SUFFIX, DATA.cellW, DATA.cellH, Math.max(10, DUR + 2), fSymbols);
      sc.comment = PH_NOTE;
      var art = image(sc, sd.file, sd.name, [DATA.cellW / 2, DATA.cellH / 2]);
      if (art) fitTo(art, DATA.cellW * 0.88, DATA.cellH * 0.88);
      symComps.push(sc);
      var wdur = sd.win ? sd.win.frames.length / sd.win.fps : WIN_INTRO + WIN_LOOP;
      var wc = addComp("Win " + pad2(i + 1) + " " + sd.name + SUFFIX, DATA.cellW * 1.6, DATA.cellH * 1.6, wdur, fSymbols);
      wc.comment = sd.win ? "loop" : "intro";
      if (sd.win) {
        var fd = 1 / sd.win.fps;
        for (k = 0; k < sd.win.frames.length; k++) {
          var fl = image(wc, sd.win.frames[k], sd.name + " win " + (k + 1), [wc.width / 2, wc.height / 2]);
          if (!fl) continue;
          fitTo(fl, DATA.cellW * 0.88, DATA.cellH * 0.88);
          fl.outPoint = (k + 1) * fd;
          fl.inPoint = k * fd;
        }
      } else {
        var wl = wc.layers.add(sc);
        wl.name = sd.name;
        pos(wl, [wc.width / 2, wc.height / 2]);
        P(wl, "ADBE Scale").expression = EASE_LIB + "var a = time; var s = a < " + WIN_INTRO + " ? outElastic(c01(a / " + WIN_INTRO + ")) : 0.78 + 0.22 * Math.cos((a - " + WIN_INTRO + ") * Math.PI * 2 * 1.3);\n" +
          "var v = 100 * (1 + " + DATA.popScale + " * " + ctrl("Win Pop %") + " / 100 * s); [v, v];";
        glow(wl, DATA.cellW * 0.14, 1.1);
      }
      winComps.push(wc);
    }
  }
  function buildAtlas() {
    var n = DATA.symbols.length, i;
    atlas = addComp("Symbols Atlas" + SUFFIX, DATA.cellW, DATA.cellH, Math.max(n, 1) / FPS, fSymbols);
    for (i = 0; i < n; i++) {
      var L = atlas.layers.add(symComps[i]);
      L.name = DATA.symbols[i].name;
      L.startTime = i / FPS;
      L.outPoint = (i + 1) / FPS;
    }
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
  function winLayer(comp, sym, xy, a, b, name) {
    var wc = winComps[sym] || winComps[0];
    var L = comp.layers.add(wc);
    L.name = name || ("Win " + DATA.symbols[sym].name);
    L.startTime = a;
    L.timeRemapEnabled = true;
    L.outPoint = Math.max(a + 1 / FPS, Math.min(comp.duration, b));
    if (wc.comment === "loop") L.property("ADBE Time Remapping").expression = "(time - inPoint) % thisLayer.source.duration;";
    else L.property("ADBE Time Remapping").expression = "var a = time - inPoint; a < " + (WIN_INTRO + WIN_LOOP) + " ? a : " + WIN_INTRO + " + ((a - " + WIN_INTRO + ") % " + WIN_LOOP + ");";
    trim(L, a, b);
    pos(L, xy);
    return L;
  }

  // ---------- rolling counters (odometer style, no plugin) ----------
  // "Counter Digits" is the 0-9 strip every counter rolls through.
  function buildDigits() {
    var O = DATA.odo, i;
    digits = ph("Counter Digits", "Counters", O.dw, O.rh * 11, DUR + 2, function (c) {
      for (i = 0; i <= 10; i++) text(c, "Digit " + (i % 10), String(i % 10), O.size, [O.dw / 2, (i + 0.5) * O.rh]);
    });
  }
  function rollCounter(parent, name, ref, maxValue, size, xy) {
    var O = DATA.odo, D = DATA.decimals, i;
    var scaled = Math.floor(Math.max(0, maxValue) * Math.pow(10, D) + 1e-6);
    // One spare digit, so a value edited up in After Effects still fits.
    var n = Math.max(D + 1, String(scaled).length) + 1;
    var curW = DATA.currency ? O.size * 0.75 : 0;
    var sepCount = 0;
    for (i = 1; i <= n - 1; i++) if ((i === D && D > 0) || (i > D && (i - D) % 3 === 0)) sepCount++;
    var w = curW + n * O.dw + sepCount * O.sw + O.dw;
    var oc = addComp(name + " Counter" + SUFFIX, w, O.rh * 1.15, parent.duration, dir("rigs", "Counter Rigs", top));
    oc.motionBlur = true;
    var cc = oc.layers.addNull(oc.duration);
    cc.name = "COUNTER CTRL";
    slider(cc, "Value").expression = ref;
    var pre = "var SC = Math.pow(10, " + D + "); var D = " + D + "; var DW = " + O.dw + "; var SW = " + O.sw + "; var CURW = " + curW + "; var RH = " + O.rh + ";\n" +
      "var vv = Math.max(0, thisComp.layer(\"COUNTER CTRL\").effect(\"Value\")(1).value) * SC;\n" +
      "var iu = Math.floor(vv + 1e-6); var n = Math.max(D + 1, String(iu).length);\n" +
      "function isSep(q) { return (q == D && D > 0) || (q > D && (q - D) % 3 == 0); }\n" +
      "var tot = 0; for (var q = 1; q <= n - 1; q++) if (isSep(q)) tot++;\n" +
      "var x0 = thisComp.width / 2 - (CURW + n * DW + tot * SW) / 2;\n";
    for (i = 0; i < n; i++) {
      var L = oc.layers.add(digits);
      L.name = "Digit x10^" + i;
      L.motionBlur = true;
      P(L, "ADBE Position").expression = pre + "var K = " + i + ";\n" +
        "var sl = 0; for (var q2 = K + 1; q2 <= n - 1; q2++) if (isSep(q2)) sl++;\n" +
        "var x = x0 + CURW + (n - 1 - K) * DW + sl * SW + DW / 2;\n" +
        "var p = Math.pow(10, K); var base = Math.floor(vv / p + 1e-9); var lower = vv - base * p;\n" +
        "var prog = K == 0 ? lower : Math.max(0, lower - (p - 1));\n" +
        "var spd = Math.abs(thisComp.layer(\"COUNTER CTRL\").effect(\"Value\")(1).velocity) * SC / p;\n" +
        "var d = (base % 10) + (spd > 18 ? 0 : Math.min(1, prog));\n" +
        "[x, thisComp.height / 2 + (5 - d) * RH];";
      P(L, "ADBE Opacity").expression = pre + i + " < n ? 100 : 0;";
    }
    for (i = 1; i <= n - 1; i++) {
      if (!((i === D && D > 0) || (i > D && (i - D) % 3 === 0))) continue;
      var S = text(oc, i === D ? "Decimal point" : "Thousands comma", i === D ? "." : ",", O.size, [0, 0]);
      P(S, "ADBE Position").expression = pre + "var Q = " + i + "; var sl = 0; for (var q3 = Q + 1; q3 <= n - 1; q3++) if (isSep(q3)) sl++;\n" +
        "[x0 + CURW + (n - Q) * DW + sl * SW + SW / 2, thisComp.height / 2 + " + (O.size * 0.36) + "];";
      P(S, "ADBE Opacity").expression = pre + "Q = " + i + "; Q <= n - 1 ? 100 : 0;";
    }
    if (DATA.currency) {
      var C = text(oc, "Currency", DATA.currency, O.size, [0, 0]);
      P(C, "ADBE Position").expression = pre + "[x0 + CURW / 2, thisComp.height / 2 + " + (O.size * 0.36) + "];";
    }
    var OL = parent.layers.add(oc);
    OL.name = name + " Counter";
    pos(OL, xy);
    var s = 100 * size / O.size;
    P(OL, "ADBE Scale").setValue([s, s]);
    return OL;
  }

  // ---------- reels ----------
  // Values riding on a strip ("x5" on a multiplier, "$10" on a coin): one
  // text layer per visible slot reads the value at its strip position.
  function labelMap(list) {
    var v = "var V = {", i;
    for (i = 0; i < list.length; i++) v += (i ? "," : "") + list[i][0] + ":[\"" + list[i][1] + "\"," + list[i][2] + "," + list[i][3] + "]";
    return v + "};\n";
  }
  function stripCells(rc, strip, labels, nCells, rowsInWindow, x, peek, hideW) {
    var k;
    var S = "var S = [" + strip.join(",") + "];\n";
    var head = "var p = thisComp.layer(\"CTRL\").effect(\"Spin\")(1).value;\n";
    var hide = hideW && hideW.length ? windowsExpr("HW", hideW) + "var hid = false; for (var w = 0; w < HW.length; w++) if (time >= HW[w][0] && time < HW[w][1]) hid = true;\n" : "var hid = false;\n";
    var rowE = "var row = " + DATA.dir + " > 0 ? (" + (rowsInWindow - 1) + " - (j - p)) : (j - p);\n";
    for (k = 0; k < nCells; k++) {
      var jE = "var j = Math.floor(p + 1e-4) - 2 + " + k + ";\n";
      var L = rc.layers.add(atlas);
      L.name = "Cell " + (k + 1);
      L.timeRemapEnabled = true;
      L.outPoint = DUR;
      L.property("ADBE Time Remapping").expression = S + head + jE + "var s = (j >= 0 && j < S.length) ? S[j] : 0;\n(s + 0.5) * thisComp.frameDuration;";
      P(L, "ADBE Position").expression = head + jE + rowE + "[" + x + ", (row + 0.5 + " + peek + ") * " + DATA.cellH + "];";
      if (hideW && hideW.length) P(L, "ADBE Opacity").expression = hide + "hid ? 0 : 100;";
    }
    if (!labels || !labels.length) return;
    var V = labelMap(labels);
    var size = Math.round(DATA.cellH * 0.3);
    for (k = 0; k < nCells; k++) {
      var jE2 = "var j = Math.floor(p + 1e-4) - 2 + " + k + ";\n";
      var T = text(rc, "Value " + (k + 1), " ", size, [x, 0], [1, 0.9, 0.55]);
      T.property("ADBE Text Properties").property("ADBE Text Document").expression = head + V + jE2 + "var e = V[j]; e ? e[0] : '';";
      P(T, "ADBE Position").expression = head + V + jE2 + rowE + "var e = V[j]; var dy = e ? e[1] : 0; var sc = e ? e[2] : 1;\n" +
        "[" + x + ", (row + 0.5 + " + peek + " + dy) * " + DATA.cellH + " + " + (size * 0.36) + " * sc];";
      P(T, "ADBE Scale").expression = head + V + jE2 + "var e = V[j]; var s = e ? e[2] * 100 : 100; [s, s];";
      P(T, "ADBE Opacity").expression = head + V + jE2 + hide + "(V[j] && !hid) ? 100 : 0;";
    }
  }
  function blurLayer(rc) {
    var adj = rc.layers.addSolid([1, 1, 1], "Reel Motion Blur", rc.width, rc.height, 1, DUR);
    adj.adjustmentLayer = true;
    var db = fx(adj, "ADBE Motion Blur", "Spin Blur");
    db.property(2).expression = "var v = Math.abs(thisComp.layer(\"CTRL\").effect(\"Spin\")(1).velocity);\n" +
      "var a = Math.max(0, Math.min(1, (v - 3) / 14)) * " + DATA.blur + " * " + ctrl("Spin Blur %") + " / 100;\na * " + DATA.cellH + " * 0.35;";
  }
  function actorLayers(rc, c) {
    var list = DATA.actors[c] || [], i;
    for (i = 0; i < list.length; i++) {
      var a = list[i];
      var y0 = (a.keys[0].v + 0.5 + DATA.peek) * DATA.cellH;
      var L = symbolLayer(rc, a.s, [DATA.cellW / 2, y0], "Tumble " + DATA.symbols[a.s].name);
      var Pp = P(L, "ADBE Position");
      try { Pp.dimensionsSeparated = true; } catch (e) {}
      var yp = tr(L).property("ADBE Position_1");
      if (a.keys.length > 1) setKeys(yp, a.keys, 0, DATA.cellH, (0.5 + DATA.peek) * DATA.cellH);
      else yp.setValue(y0);
      L.motionBlur = true;
      if (a.pop !== null) {
        ease1(P(L, "ADBE Opacity"), [[a.pop, 100], [a.pop + DATA.popDur * 0.5, 75], [a.pop + DATA.popDur, 0]]);
        P(L, "ADBE Scale").expression = EASE_LIB + "var k = c01((time - " + a.pop + ") / " + DATA.popDur + "); var s = 100 * (1 + 0.38 * (1 - Math.pow(1 - k, 3))); [s, s];";
      }
      if (a.lab) {
        var lsz = Math.round(DATA.cellH * 0.3);
        var T = text(rc, "Value " + a.lab[0], a.lab[0], lsz, [0, 0], [1, 0.9, 0.55]);
        pos(T, [DATA.cellW / 2, y0 + a.lab[1] * DATA.cellH + lsz * 0.36 * a.lab[2]]);
        P(T, "ADBE Scale").setValue([a.lab[2] * 100, a.lab[2] * 100]);
        T.parent = L;
        trim(T, a.tIn, a.tOut);
      }
      trim(L, a.tIn, a.tOut);
    }
  }
  // While a sticky wild holds a cell, a Subtract mask cuts that cell out of
  // its reel (or its own little reel), so the strip spins on unseen.
  function holdCellMask(layers, st, i) {
    var j;
    for (j = 0; j < layers.length; j++) {
      var Ly = layers[j], y0;
      if (Ly.name === "Reel " + (st.c + 1) || Ly.name === "Tumble " + (st.c + 1)) y0 = DATA.rowsTop - DATA.winTop + st.r * DATA.cellH;
      else if (Ly.name === "Cell " + (st.c + 1) + "-" + (st.r + 1)) y0 = 0;
      else continue;
      var mk = Ly.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
      mk.name = "Sticky " + (i + 1);
      mk.maskMode = MaskMode.SUBTRACT;
      var shp = new Shape();
      shp.vertices = [[0, y0], [DATA.cellW, y0], [DATA.cellW, y0 + DATA.cellH], [0, y0 + DATA.cellH]];
      shp.closed = true;
      mk.property("ADBE Mask Shape").setValue(shp);
      mk.property("ADBE Mask Opacity").expression = "(time >= " + st.cover + " && time < " + st.to + ") ? 100 : 0;";
    }
  }

  function buildReels() {
    var out = [], c, r;
    var hasActors = function (cc) { return DATA.actors[cc] && DATA.actors[cc].length; };
    if (DATA.mode === "cells") {
      for (c = 0; c < DATA.reels; c++) {
        for (r = 0; r < DATA.rows; r++) {
          var s = c * DATA.rows + r;
          var cc2 = addComp("Cell " + (c + 1) + "-" + (r + 1) + SUFFIX, DATA.cellW, DATA.cellH, DUR, fReels);
          var cn = cc2.layers.addNull(DUR);
          cn.name = "CTRL";
          setKeys(slider(cn, "Spin"), DATA.stripKeys[s]);
          stripCells(cc2, DATA.strips[s], DATA.stripLabels[s], 5, 1, DATA.cellW / 2, 0, DATA.hideWindows);
          blurLayer(cc2);
          var CL = main.layers.add(cc2);
          CL.name = "Cell " + (c + 1) + "-" + (r + 1);
          pos(CL, [DATA.reelX[c] + DATA.cellW / 2, DATA.rowsTop + (r + 0.5) * DATA.cellH]);
          out.push(CL);
        }
      }
    }
    for (c = 0; c < DATA.reels; c++) {
      if (DATA.mode === "cells" && !hasActors(c)) continue;
      var rc = addComp((DATA.mode === "cells" ? "Tumble " : "Reel ") + (c + 1) + SUFFIX, DATA.cellW, DATA.winH, DUR, fReels);
      rc.motionBlur = true;
      if (DATA.mode === "reels") {
        var ctrl2 = rc.layers.addNull(DUR);
        ctrl2.name = "CTRL";
        setKeys(slider(ctrl2, "Spin"), DATA.stripKeys[c]);
        stripCells(rc, DATA.strips[c], DATA.stripLabels[c], DATA.rows + 4, DATA.rows, DATA.cellW / 2, DATA.peek, DATA.hideWindows);
      }
      actorLayers(rc, c);
      if (DATA.mode === "reels") blurLayer(rc);
      var RL = main.layers.add(rc);
      RL.name = (DATA.mode === "cells" ? "Tumble " : "Reel ") + (c + 1);
      pos(RL, [DATA.reelX[c] + DATA.cellW / 2, DATA.winTop + DATA.winH / 2]);
      out.push(RL);
    }
    if (!DATA.hold) return out;
    // The Hold & Spin board: one little reel per cell, shown in the board's
    // windows while the machine's reels fade away.
    var H = DATA.hold, k;
    for (k = 0; k < out.length; k++) P(out[k], "ADBE Opacity").expression = holdAlphaExpr() + "(1 - a) * 100;";
    for (c = 0; c < DATA.reels; c++) {
      for (r = 0; r < DATA.rows; r++) {
        k = c * DATA.rows + r;
        var hc = addComp("Hold Cell " + (c + 1) + "-" + (r + 1) + SUFFIX, DATA.cellW, DATA.cellH, DUR, fHold);
        var hctrl = hc.layers.addNull(DUR);
        hctrl.name = "CTRL";
        setKeys(slider(hctrl, "Spin"), H.keys[k]);
        stripCells(hc, H.strips[k], H.labels[k], 5, 1, DATA.cellW / 2, 0, null);
        blurLayer(hc);
        var HL = main.layers.add(hc);
        HL.name = "Hold Cell " + (c + 1) + "-" + (r + 1);
        pos(HL, [DATA.reelX[c] + DATA.cellW / 2, DATA.rowsTop + (r + 0.5) * DATA.cellH]);
        P(HL, "ADBE Opacity").expression = holdAlphaExpr() + "a * 100;";
        out.push(HL);
      }
    }
    return out;
  }
  function holdCounterExpr() {
    var C = DATA.hold.counter, e = "var C = [", i;
    for (i = 0; i < C.length; i++) e += (i ? "," : "") + "[" + C[i][0] + "," + C[i][1] + "]";
    return e + "]; var n = 0; for (var ci = 0; ci < C.length; ci++) if (time >= C[ci][0]) n = C[ci][1];\n";
  }
  function holdCollectExpr() {
    var C = DATA.hold.collectWins, e = "var CW = [", i;
    for (i = 0; i < C.length; i++) e += (i ? "," : "") + "[" + C[i][0] + "," + C[i][1] + "]";
    return e + "]; var col = false; for (var cw = 0; cw < CW.length; cw++) if (time >= CW[cw][0] && time <= CW[cw][1]) col = true;\n";
  }
  function holdAlphaExpr() {
    var W = DATA.hold.windows, e = "var HW = [", i;
    for (i = 0; i < W.length; i++) e += (i ? "," : "") + "[" + W[i].join(",") + "]";
    return e + "]; var a = 0;\nfor (var i = 0; i < HW.length; i++) if (time >= HW[i][0] && time <= HW[i][1]) { var x = HW[i][2] > 0 ? (time - HW[i][0]) / HW[i][2] : 1; var y = HW[i][3] > 0 ? (HW[i][1] - time) / HW[i][3] : 1; a = Math.max(0, Math.min(1, Math.min(x, y))); }\n";
  }

  // ---------- effects building blocks ----------
  // ---------- win particles ----------
  // Each particle asset is a placeholder ("Particle Confetti": one variant
  // or animation frame per frame). Each emitter is a comp of its own in
  // Rounds/Particles whose layers are uses of that placeholder, moved by
  // expressions that hold the very particles the preview draws.
  // SLOT CONTROL > Particles % thins every emitter out.
  var fParticleArt = null;
  function particlePH(ai) {
    var A = DATA.particles.assets[ai], k;
    if (!A) return null;
    var key = "Particle " + A.name;
    if (PH.hasOwnProperty(key)) return PH[key];
    if (!fParticleArt) fParticleArt = folder("Particles", fShared);
    var items = [], w = 4, h = 4;
    for (k = 0; k < A.files.length; k++) {
      var it = imp(A.files[k], fParticleArt);
      if (!it) continue;
      items.push(it);
      w = Math.max(w, it.width);
      h = Math.max(h, it.height);
    }
    if (!items.length) { PH[key] = null; return null; }
    var F = A.anim ? A.fps : FPS;
    var c = ph(key, "Particles", w, h, Math.max(items.length / F, 1 / FPS), function (pc) {
      for (k = 0; k < items.length; k++) {
        var L = pc.layers.add(items[k]);
        L.name = A.name + " " + (k + 1);
        pos(L, [w / 2, h / 2]);
        L.startTime = k / F;
        L.outPoint = (k + 1) / F;
      }
    });
    c.comment = PH_NOTE + (A.anim ? " One animation frame per frame." : " One variant per frame; each particle picks one.");
    return c;
  }
  // Particle q: [b, l, x, y, vx, vy, g, k, s, r0, rv, f, ph, sw, sf, v, fo, tw]
  // (core/particles.js). "a" is the particle's age in the emitter comp.
  function particlePos(q) {
    var e = q[7] > 0.001 ?
      "var e = (1 - Math.exp(-" + q[7] + " * a)) / " + q[7] + ";\nvar x = " + q[2] + " + " + q[4] + " * e;\nvar y = " + q[3] + " + " + (q[6] / q[7]) + " * a + " + (q[5] - q[6] / q[7]) + " * e;\n" :
      "var x = " + q[2] + " + " + q[4] + " * a;\nvar y = " + q[3] + " + " + q[5] + " * a + " + (0.5 * q[6]) + " * a * a;\n";
    if (q[13]) e += "x += " + q[13] + " * Math.sin(a * " + q[14] + " + " + q[12] + ");\n";
    return e + "(a < 0 || a > " + q[1] + ") ? [-9999, -9999] : [x, y];";
  }
  function particleScale(q, motion, S) {
    var w = "var w = Math.max(0.08, Math.abs(Math.cos(a * " + q[11] + " + " + q[12] + ")));\n";
    var e = motion === "flip" ? w + "var sx = w, sy = 1;\n" : motion === "flutter" ? w + "var sx = 1, sy = w;\n" :
      motion === "glow" ? "var sx = 1 - 0.65 * a / " + q[1] + ", sy = sx;\n" : motion === "spin" ? "var sx = 0.4 + 0.6 * Math.min(1, Math.max(0, a) / 0.15), sy = sx;\n" : "var sx = 1, sy = 1;\n";
    if (q[17]) e += "var tw = Math.max(0, Math.sin(Math.PI * a / " + q[1] + ")); sx *= tw; sy *= tw;\n";
    return e + "[" + S + " * sx, " + S + " * sy];";
  }
  function particleOpacity(q, i, n) {
    var al = q[17] ? "Math.max(0, Math.sin(Math.PI * a / " + q[1] + "))" : "Math.max(0, Math.min(1, a / 0.06, (" + q[1] + " - a) / " + q[16] + "))";
    return "var on = " + i + " + 0.5 < " + n + " * " + ctrl("Particles %") + " / 100;\n(!on || a < 0 || a > " + q[1] + ") ? 0 : 100 * " + al + ";";
  }
  function emitter(comp, em, P0) {
    var A = DATA.particles.assets[em.a];
    var src = A ? particlePH(em.a) : null;
    if (!src || !em.ps.length) return null;
    var dur = Math.max(0.1, em.cut - em.start + 0.05), i;
    var ec = addComp(RBASE + " " + em.name + SUFFIX, W, H, dur, dir("particles", "Particles", fRounds));
    ec.motionBlur = A.blend !== "add";
    var S0 = 100 / Math.max(src.width, src.height);
    var F = A.anim ? A.fps : FPS, N = Math.max(1, A.count);
    for (i = 0; i < em.ps.length; i++) {
      var q = em.ps[i];
      // A looping emitter brings every particle back each cycle.
      var pre = "var a = time - " + r4(q[0] - em.start) + ";\n" + (em.loop ? "if (a > 0) a = a % " + em.loop + ";\n" : "");
      var L = ec.layers.add(src);
      L.name = em.name + " " + (i + 1);
      L.timeRemapEnabled = true;
      L.outPoint = dur;
      if (A.blend === "add") L.blendingMode = BlendingMode.ADD;
      else L.motionBlur = true;
      P(L, "ADBE Position").expression = pre + particlePos(q);
      P(L, "ADBE Rotate Z").expression = pre + q[9] + " + " + q[10] + " * a;";
      P(L, "ADBE Scale").expression = pre + particleScale(q, A.motion, r4(q[8] * S0));
      P(L, "ADBE Opacity").expression = pre + particleOpacity(q, i, em.ps.length);
      L.property("ADBE Time Remapping").expression = A.anim ?
        pre + "var f = (Math.floor(Math.max(0, a) * " + F + ") + " + q[15] + ") % " + N + ";\n(f + 0.5) / " + F + ";" :
        "(" + (q[15] % N) + " + 0.5) / " + F + ";";
    }
    var EL = comp.layers.add(ec);
    EL.name = em.name;
    EL.startTime = em.start - P0;
    if (EL.startTime < 0) EL.inPoint = 0;
    if (!em.end) P(EL, "ADBE Opacity").expression = "100 * Math.max(0, Math.min(1, (" + r4(em.cut - P0) + " - time) / 0.3));";
    return EL;
  }
  function r4(x) { return Math.round(x * 10000) / 10000; }
  // The round's emitters on one layer ("under" a presentation's title, or
  // "over" everything), optionally only some moments.
  function emitters(comp, R, layer, moments) {
    var i, j;
    for (i = 0; i < (R.particles || []).length; i++) {
      var em = R.particles[i];
      if (em.layer !== layer) continue;
      if (moments) {
        var ok = false;
        for (j = 0; j < moments.length; j++) if (moments[j] === em.moment) ok = true;
        if (!ok) continue;
      }
      emitter(comp, em, R.start);
    }
  }
  // A white ring that grows and fades in 0.7 s; each use is scaled and tinted.
  var RING_R = 250;
  function ring(comp, xy, t, maxR, rgbv) {
    var src = ph("FX Shockwave", "Effects", 640, 640, 0.8, function (c) {
      var L = shapeLayer(c, "Ring");
      var g = group(L);
      ellipse(g, [320, 320], [RING_R * 2, RING_R * 2]);
      stroke(g, [1, 1, 1], 14);
      P(L, "ADBE Anchor Point").setValue([320, 320]);
      pos(L, [320, 320]);
      P(L, "ADBE Scale").expression = EASE_LIB + "var a = c01(time / 0.7); var s = 100 * (1 - Math.pow(1 - a, 3)); [s, s];";
      P(L, "ADBE Opacity").expression = "var a = time / 0.7; a > 1 ? 0 : 100 * Math.pow(1 - a, 1.5);";
      glow(L, 26, 1);
    });
    var L = inst(comp, src, "Shockwave", xy, t, Math.max(0, t) + 0.75);
    var s = 100 * maxR / RING_R;
    P(L, "ADBE Scale").setValue([s, s]);
    L.blendingMode = BlendingMode.ADD;
    tint(L, rgbv);
    return L;
  }
  // A cell or reel sized frame placeholder: rounded rect, stroke, optional
  // fill, glow inside. White ones are tinted per use.
  function framePH(key, w, h, o) {
    var padX = DATA.cellW * ((o.glow || 0) * 2.4 + 0.08);
    return ph(key, "Effects", w + padX * 2, h + padX * 2, DUR + 2, function (c) {
      var L = shapeLayer(c, key.replace(/^FX /, ""));
      var g = group(L);
      rect(g, [c.width / 2, c.height / 2], [w, h], DATA.cellW * (o.round || 0.1));
      if (o.stroke) stroke(g, o.color || [1, 1, 1], Math.max(2, DATA.cellW * o.stroke));
      if (o.fill) fill(g, o.fill, o.fillOp);
      if (o.glow) glow(L, DATA.cellW * o.glow, o.glowI || 1.3);
    });
  }
  function frameAt(comp, key, w, h, o, name, xy, a, b) {
    return inst(comp, framePH(key, w, h, o), name, xy, a, b);
  }
  function darkLayer(comp, a, b, peak) {
    var L = solid(comp, [0, 0, 0], "Darken", W * 1.2, H * 1.2, [W / 2, H / 2]);
    fadeKeys(L, a, b, 0.45, 0.6, peak);
    P(L, "ADBE Opacity").expression = "value * " + ctrl("Dim %") + " / 100;";
    return L;
  }
  function raysPH(small) {
    return small ? imagePH("FX Small Rays", "Effects", DATA.assets.raysSmall) : imagePH("FX Light Rays", "Effects", DATA.assets.rays);
  }
  function rays(comp, xy, a, b, scale, speed, alpha) {
    var L = inst(comp, raysPH(false), "Light Rays", xy, a, b);
    if (!L) return null;
    L.blendingMode = BlendingMode.ADD;
    P(L, "ADBE Rotate Z").expression = "time * " + speed + ";";
    P(L, "ADBE Scale").expression = EASE_LIB + "var k = outBack(c01((time - " + a + ") / 0.45)); [" + scale + " * k, " + scale + " * k];";
    fadeKeys(L, a, b, 0.45, 0.6, alpha);
    return L;
  }
  // Title placeholders hold the title art with its light sweep; each use
  // springs in and breathes.
  function titlePH(key) {
    if (PH.hasOwnProperty("Title " + key)) return PH["Title " + key];
    var it = imp(DATA.assets.titles[key]);
    if (!it) { PH["Title " + key] = null; return null; }
    return ph("Title " + key, "Titles", it.width, it.height, DUR + 2, function (c) {
      var L = c.layers.add(it);
      L.name = key;
      pos(L, [c.width / 2, c.height / 2]);
      try {
        var sw = fx(L, "CC Light Sweep");
        try { sw.property("Center").expression = "var p = (time % 1.7) / 1.7 * 1.6 - 0.3; [p * thisLayer.width, thisLayer.height / 2];"; } catch (e1) {}
        try { sw.property("Width").setValue(Math.round(DATA.titlePx * 0.45)); } catch (e2) {}
        try { sw.property("Sweep Intensity").setValue(70); } catch (e3) {}
      } catch (e4) {}
    });
  }
  function titleLayer(comp, key, xy, a, b, maxW) {
    var src = titlePH(key);
    var L = inst(comp, src, "Title " + key, xy, a, b);
    if (!L) return null;
    var fit = maxW && src.width > maxW ? 100 * maxW / src.width : 100;
    P(L, "ADBE Scale").expression = EASE_LIB + "var a = time - inPoint; var s = (" + (fit * 0.15) + " + " + (fit * 0.85) + " * outElastic(c01(a / 0.8))) * (1 + 0.025 * Math.sin(time * 5)); [s, s];";
    return L;
  }
  function winCtrl(comp, keys, tOff, name) {
    var c = comp.layers.addNull(comp.duration);
    c.name = name || "WIN CTRL";
    setKeys(slider(c, "Amount"), keys, tOff);
    return c;
  }
  function counters(comp, xy, size, maxValue, slamAt, ctrlName) {
    var cn = ctrlName || "WIN CTRL";
    var ref = "comp(\"" + comp.name + "\").layer(\"" + cn + "\").effect(\"Amount\")(1).valueAtTime(time)";
    var extra = ctrlName ? " " + cn.charAt(0) + cn.replace(/ CTRL$/, "").substr(1).toLowerCase() : "";
    var od = rollCounter(comp, RBASE + extra, ref, maxValue, size, xy);
    if (slamAt !== undefined) {
      var base = P(od, "ADBE Scale").value[0];
      P(od, "ADBE Scale").expression = EASE_LIB + "var a = time - " + slamAt + "; var s = " + base + " * (a > 0 ? 1 + 0.2 * Math.pow(1 - c01(a / 0.35), 2) : 1); [s, s];";
    }
    var tx = text(comp, "Win Counter (text)", "0", size, xy);
    tx.property("ADBE Text Properties").property("ADBE Text Document").expression = counterExpr('thisComp.layer("' + cn + '").effect("Amount")(1).value');
    tx.enabled = false;
    return od;
  }
  function countKeys(a, b, amount) {
    var d = Math.max(0.1, b - a);
    return [{ t: a, v: 0, is: 0, ii: 0.3333, os: amount / d * 1.25, oi: 0.3333, h: 0 }, { t: b, v: amount, is: 0, ii: 0.6, os: 0, oi: 0.3333, h: 1 }];
  }
  var CELL_FRAME = { stroke: 0.03, round: 0.1, glow: 0.1, glowI: 1.2 };
  function cellFrame(comp, x, y, rgbv, a, b) {
    var L = frameAt(comp, "FX Cell Frame", DATA.cellW * 0.97, DATA.cellH * 0.97, CELL_FRAME, "Cell Frame", [x, y], a, b);
    tint(L, rgbv);
    fadeKeys(L, a, b, 0.12, 0.3);
    return L;
  }
  function popCells(comp, cells, a, b, withRays, withFrames) {
    var i;
    for (i = 0; i < cells.length; i++) {
      var cl = cells[i];
      if (withRays) {
        var rr = inst(comp, raysPH(true), "Scatter Rays", [cl.x, cl.y], a, b);
        if (rr) {
          rr.blendingMode = BlendingMode.ADD;
          P(rr, "ADBE Rotate Z").expression = "time * 69 + " + (i * 40) + ";";
          var rs = 100 * DATA.cellW * 2.1 / rr.source.width;
          P(rr, "ADBE Scale").setValue([rs, rs]);
          fadeKeys(rr, a, b, 0.2, 0.3, 75);
        }
      }
      winLayer(comp, cl.s, [cl.x, cl.y], a + i * 0.05, b);
      if (withFrames && cl.color) cellFrame(comp, cl.x, cl.y, cl.color, a, b);
    }
  }
  // Winners that jump into the score or merge into one big symbol: each
  // win comp flies on an expression that holds the preview's path
  // (core/winfx.js). Jumpers ring the landing spot; a merge grows the big
  // symbol where they fuse.
  function flightExprs(F, i, rel) {
    var q = F.paths[i], L0 = r4(rel(F.launch[i])), D = r4(Math.max(0.01, F.arrive[i] - F.launch[i])), U = r4(rel(F.until[i]));
    var pre = "var u = Math.max(0, Math.min(1, (time - " + L0 + ") / " + D + "));\n" +
      (F.kind === "back" ? "var e = 2.9 * u * u * u - 1.9 * u * u;" : F.style === "jump" ? "var e = u * u * (3 - 2 * u);" : "var e = Math.pow(u, 2.4);") + " var q = 1 - e;\n";
    return {
      pos: pre + "[q * q * " + q[0] + " + 2 * q * e * " + q[2] + " + e * e * " + q[4] + ", q * q * " + q[1] + " + 2 * q * e * " + q[3] + " + e * e * " + q[5] + "];",
      scale: pre + "var s = 100 * (1 - " + (F.style === "jump" ? 0.55 : 0.3) + " * e); [s, s];",
      opacity: F.style === "jump" ? pre + "time >= " + U + " ? 0 : (time <= " + L0 + " ? 100 : Math.min(100, (1 - u) / 0.15 * 100));" : "time >= " + U + " ? 0 : 100;"
    };
  }
  function flyCells(comp, st, la, lb, rel) {
    var F = st.fx, i;
    for (i = 0; i < st.cells.length; i++) {
      var cl = st.cells[i];
      var L0 = rel(F.launch[i]), L1 = rel(F.until[i]);
      var wl = winLayer(comp, cl.s, [cl.x, cl.y], la + i * 0.05, Math.max(la + i * 0.05 + 0.1, L1 + 0.02), (F.style === "jump" ? "Jump " : "Pull ") + DATA.symbols[cl.s].name);
      var ex = flightExprs(F, i, rel);
      P(wl, "ADBE Position").expression = ex.pos;
      P(wl, "ADBE Scale").expression = ex.scale;
      P(wl, "ADBE Opacity").expression = ex.opacity;
      // The frame stays with the cell and fades as the symbol leaves.
      if (cl.color) {
        var fr = cellFrame(comp, cl.x, cl.y, cl.color, la, Math.max(la + 0.2, L0 + 0.15));
        fadeKeys(fr, la, Math.max(la + 0.2, L0 + 0.15), 0.12, 0.15);
      }
      if (F.style === "jump") ring(comp, F.goal, L1, DATA.cellW * 0.65, DATA.accent);
    }
    if (F.style !== "merge") return;
    var M = rel(F.mergeAt);
    ring(comp, F.goal, M, DATA.cellW * 2.6, DATA.accent);
    var rr = inst(comp, raysPH(true), "Merge Rays", F.goal, M, lb);
    if (rr) {
      rr.blendingMode = BlendingMode.ADD;
      P(rr, "ADBE Rotate Z").expression = "time * 52;";
      P(rr, "ADBE Scale").expression = EASE_LIB + "var a = c01((time - " + M + ") / 0.6); var s = " + r4(100 * DATA.cellW * F.big * 1.7 / rr.source.width) + " * outElastic(a); [s, s];";
      fadeKeys(rr, M, lb, 0.05, 0.3, 70);
    }
    var big = winLayer(comp, F.sym, F.goal, M, lb, "Merged " + DATA.symbols[F.sym].name);
    P(big, "ADBE Scale").expression = EASE_LIB + "var a = c01((time - " + M + ") / 0.6); var s = 100 * " + F.big + " * outElastic(a) * (1 + 0.04 * Math.sin((time - " + M + ") * 5)); [s, s];";
    fadeKeys(big, M, lb, 0.05, 0.3);
  }

  // Payline placeholders draw themselves on in 0.45 s from their start.
  function paylinePH(ln) {
    return ph("Payline " + pad2(ln.index + 1), "Paylines", W, H, DUR + 2, function (c) {
      var S = shapeLayer(c, "Line");
      var g = group(S);
      path(g, ln.pts, false);
      var tp = g.addProperty("ADBE Vector Filter - Trim");
      stroke(g, ln.color, Math.max(3, DATA.cellW * 0.05));
      var core = group(S);
      path(core, ln.pts, false);
      var tp2 = core.addProperty("ADBE Vector Filter - Trim");
      stroke(core, [1, 1, 1], Math.max(1, DATA.cellW * 0.016));
      ease1(tp.property("ADBE Vector Trim End"), [[0, 0], [0.45, 100]]);
      ease1(tp2.property("ADBE Vector Trim End"), [[0, 0], [0.45, 100]]);
      glow(S, DATA.cellW * 0.22, 1.5);
    });
  }
  function linesFor(comp, lines, la, lb) {
    var i;
    for (i = 0; i < lines.length; i++) {
      var ln = lines[i];
      var S = inst(comp, paylinePH(ln), "Payline " + (ln.index + 1), [W / 2, H / 2], la + i * 0.07, lb);
      S.blendingMode = BlendingMode.ADD;
      fadeKeys(S, la, lb, 0.15, 0.35);
    }
  }
  function plaquePH(key, w, h, round, fillOp, strokeRgb, strokeW) {
    var pad = Math.max(4, strokeW * 2);
    return ph(key, "Plaques", w + pad * 2, h + pad * 2, DUR + 2, function (c) {
      var L = shapeLayer(c, key);
      var g = group(L);
      rect(g, [c.width / 2, c.height / 2], [w, h], round);
      fill(g, [0.1, 0.04, 0.16], fillOp);
      stroke(g, strokeRgb, strokeW);
    });
  }

  // ---------- main comp ----------
  // The main comp and SLOT CONTROL come first: expressions everywhere read
  // the After Effects side controls on it.
  var AE_CONTROLS = ["Shake %", "Flash %", "Dim %", "Particles %", "Spin Blur %", "Win Pop %", "Zoom %"];
  function createMain() {
    main = proj.items.addComp(mainName, W, H, 1, DUR, FPS);
    main.parentFolder = top;
    main.motionBlur = true;
    slotCtrl = main.layers.addNull(DUR);
    slotCtrl.name = "SLOT CONTROL";
    setKeys(slider(slotCtrl, "Meter"), DATA.meterKeys);
    setKeys(slider(slotCtrl, "FS Total"), DATA.fsTotalKeys);
    if (DATA.hold) setKeys(slider(slotCtrl, "Collect"), DATA.hold.collectKeys);
    var k;
    for (k = 0; k < AE_CONTROLS.length; k++) slider(slotCtrl, AE_CONTROLS[k]).setValue(100);
    fx(slotCtrl, "ADBE Checkbox Control", "FX Colour").property(1).setValue(1);
  }
  function machineArt(key, rel, xy) {
    return inst(main, imagePH(key, "Machine", rel), key, xy);
  }
  function roundMarkers(comp) {
    var r;
    for (r = 0; r < DATA.rounds.length; r++) {
      try { comp.markerProperty.setValueAtTime(DATA.rounds[r].t0, new MarkerValue("R" + (r + 1) + " " + DATA.rounds[r].label)); } catch (e) {}
    }
  }
  function buildMain() {
    var bg = machineArt("Background", DATA.assets.background);
    shake = main.layers.addNull(DUR);
    shake.name = "SCREEN SHAKE";
    var kids = [], i, r;
    // Ambient particles float behind the machine.
    RBASE = "Main";
    for (i = 0; i < DATA.mainParticles.length; i++) {
      if (DATA.mainParticles[i].layer !== "back") continue;
      var amb = emitter(main, DATA.mainParticles[i], 0);
      if (amb) kids.push(amb);
    }
    // The wheel game has no machine: background, wheel rounds, effects.
    if (DATA.game !== "wheel") {
    var back = machineArt("Machine Back", DATA.assets.back);
    if (back) kids.push(back);
    var reels = buildReels();
    for (i = 0; i < reels.length; i++) kids.push(reels[i]);
    var front = machineArt("Machine Frame", DATA.assets.front);
    if (front) kids.push(front);
    var winExpr = "var Wn = [";
    for (i = 0; i < DATA.rounds.length; i++) winExpr += (i ? "," : "") + "[" + DATA.rounds[i].start + "," + DATA.rounds[i].end + "]";
    winExpr += "]; var on = false; for (var i = 0; i < Wn.length; i++) if (time >= Wn[i][0] && time <= Wn[i][1]) on = true;\n";
    // The marquee bulbs blink inside their placeholder, faster during wins.
    var itA = imp(DATA.assets.bulbsA), itB = imp(DATA.assets.bulbsB);
    if (itA && itB) {
      var mq = inst(main, ph("Marquee Lights", "Machine", W, H, DUR + 2, function (c) {
        var la = c.layers.add(itA);
        la.name = "Bulbs A";
        pos(la, [W / 2, H / 2]);
        la.blendingMode = BlendingMode.ADD;
        P(la, "ADBE Opacity").expression = winExpr + "Math.floor(time * (on ? 7 : 1.6)) % 2 == 0 ? 100 : 18;";
        var lb = c.layers.add(itB);
        lb.name = "Bulbs B";
        pos(lb, [W / 2, H / 2]);
        lb.blendingMode = BlendingMode.ADD;
        P(lb, "ADBE Opacity").expression = winExpr + "Math.floor(time * (on ? 7 : 1.6)) % 2 == 1 ? 100 : 18;";
      }), "Marquee Lights");
      mq.blendingMode = BlendingMode.ADD;
      kids.push(mq);
    }
    var ANTIC = { stroke: 0.05, round: 0.06, fill: [1, 0.55, 0.08], fillOp: 18, glow: 0.3, glowI: 1.6, color: [1, 0.67, 0.16] };
    for (r = 0; r < DATA.rounds.length; r++) {
      var R = DATA.rounds[r], a;
      for (a = 0; a < R.antic.length; a++) {
        var an = R.antic[a];
        var S = frameAt(main, "FX Anticipation", an.w, an.h, ANTIC, "Anticipation R" + (r + 1), [an.x, an.y], an.start - 0.05, an.end + 0.3);
        S.blendingMode = BlendingMode.ADD;
        fadeKeys(S, an.start - 0.05, an.end + 0.3, 0.2, 0.3);
        kids.push(S);
      }
    }
    // Sticky wilds sit on top of the reels for the rest of the free spins.
    for (i = 0; i < DATA.stickies.length; i++) {
      var st = DATA.stickies[i];
      if (DATA.wildSym < 0) break;
      var SL = inst(main, symComps[DATA.wildSym], "Sticky Wild " + (i + 1), [st.x, st.y], st.from, st.to);
      P(SL, "ADBE Scale").expression = EASE_LIB + "var s = 100 * outBack(c01((time - " + st.from + ") / 0.4)); [s, s];";
      var SF = frameAt(main, "FX Sticky Frame", DATA.cellW * 0.96, DATA.cellH * 0.96, { stroke: 0.035, round: 0.12, glow: 0.15, color: [1, 0.82, 0.35] }, "Sticky Frame " + (i + 1), [st.x, st.y], st.from, st.to);
      kids.push(SL);
      kids.push(SF);
      if (reels) holdCellMask(reels, st, i);
    }
    // Hold & Spin: a glowing frame on every locked coin while the board shows.
    if (DATA.hold) {
      for (i = 0; i < DATA.hold.locks.length; i++) {
        var lk = DATA.hold.locks[i];
        var LF = frameAt(main, lk.special ? "FX Special Coin Lock" : "FX Coin Lock", DATA.cellW * 0.96, DATA.cellH * 0.96, { stroke: lk.special ? 0.04 : 0.028, round: 0.12, glow: lk.special ? 0.25 : 0.14 }, "Coin Lock " + (i + 1), [lk.x, lk.y], lk.from, lk.to);
        tint(LF, lk.color);
        P(LF, "ADBE Opacity").expression = holdAlphaExpr() + "var f = Math.min(1, Math.max(0, (time - " + lk.from + ") / 0.15));\n" +
          (lk.done !== null ? "var d = time > " + lk.done + " ? 0.35 : 1;\n" : "var d = 1;\n") + "a * f * d * 100;";
        kids.push(LF);
      }
    }
    var logo = machineArt("Logo", DATA.assets.logo, DATA.logo);
    if (logo) {
      kids.push(logo);
      P(logo, "ADBE Scale").expression = "var s = 100 * (1 + 0.012 * Math.sin(time * 1.6)); [s, s];";
    }
    var fsData = "var B = [";
    for (i = 0; i < DATA.fsBlocks.length; i++) {
      var b = DATA.fsBlocks[i], q, rs = "[";
      for (q = 0; q < b[3].length; q++) rs += (q ? "," : "") + "[" + b[3][q].join(",") + "]";
      fsData += (i ? "," : "") + "[" + b[0] + "," + b[1] + "," + b[2] + "," + rs + "]]";
    }
    fsData += "];\nvar cur = null; for (var i = 0; i < B.length; i++) if (time >= B[i][0] && time < B[i][1]) cur = B[i];\n" +
      "var idx = 0, done = false; if (cur) for (var k = 0; k < cur[3].length; k++) if (cur[3][k][0] <= time) { if (cur[3][k][2]) done = true; else idx = cur[3][k][1]; }\n";
    if (DATA.fsBlocks.length) {
      var rib = text(main, "Free Spins Ribbon", "FREE SPINS", Math.round(H * 0.035), DATA.ribbon, [0.6, 0.95, 1]);
      rib.property("ADBE Text Properties").property("ADBE Text Document").expression = fsData + "cur ? (done ? 'FREE SPINS COMPLETE' : 'FREE SPIN ' + Math.max(1, idx) + ' OF ' + Math.max(cur[2], idx)) : '';";
      kids.push(rib);
    }
    // Hold & Spin: the respins counter on the frame's top edge; the coins'
    // running total takes its place while they are collected.
    if (DATA.hold) {
      var hb = DATA.hold;
      var PL = inst(main, plaquePH("Hold Plaque", DATA.cellW * 2.8, H * 0.065, H * 0.02, 96, [0.91, 0.73, 0.29], Math.max(2, H * 0.004)), "Hold Plaque", [W / 2, hb.barY]);
      P(PL, "ADBE Opacity").expression = holdAlphaExpr() + "a * 100;";
      kids.push(PL);
      var CT = text(main, "Respins Counter", "3 RESPINS LEFT", Math.round(H * 0.03), [W / 2, hb.barY], [0.6, 0.95, 1]);
      CT.property("ADBE Text Properties").property("ADBE Text Document").expression = holdCounterExpr() + "n == 1 ? 'LAST RESPIN' : (n == 0 ? 'NO RESPINS LEFT' : n + ' RESPINS LEFT');";
      P(CT, "ADBE Opacity").expression = holdAlphaExpr() + holdCollectExpr() + "col ? 0 : a * 100;";
      kids.push(CT);
      var maxC = 0;
      for (i = 0; i < hb.collectKeys.length; i++) maxC = Math.max(maxC, hb.collectKeys[i].v);
      if (maxC > 0) {
        var CO = rollCounter(main, "Collect", ctrl("Collect") + ".valueAtTime(time)", maxC, Math.round(H * 0.039), [W / 2, hb.barY]);
        P(CO, "ADBE Opacity").expression = holdAlphaExpr() + holdCollectExpr() + "col ? a * 100 : 0;";
        kids.push(CO);
      }
    }
    if (DATA.hud) {
      var hp = machineArt("Win Meter Panel", DATA.assets.hud);
      if (hp) kids.push(hp);
      var lab = text(main, "WIN label", "WIN", DATA.hud.label, [DATA.hud.x, DATA.hud.y - DATA.hud.size * 0.85], DATA.accent, false);
      kids.push(lab);
      var betL = text(main, "Bet", DATA.hud.betText, DATA.hud.label, DATA.hud.left, [1, 1, 1], false);
      var rightL = text(main, "Pay mode", DATA.hud.rightText, DATA.hud.label, DATA.hud.right, [1, 1, 1], false);
      kids.push(betL);
      kids.push(rightL);
      if (DATA.fsBlocks.length || DATA.hold) {
        var hudHide = (DATA.fsBlocks.length ? fsData : "var cur = null;\n") + (DATA.hold ? holdAlphaExpr() : "var a = 0;\n") + "(cur || a > 0.5) ? 0 : 75;";
        P(betL, "ADBE Opacity").expression = hudHide;
        P(rightL, "ADBE Opacity").expression = hudHide;
      }
      if (DATA.hold) {
        var lks = "var LK = [";
        for (i = 0; i < DATA.hold.locks.length; i++) lks += (i ? "," : "") + "[" + DATA.hold.locks[i].from + "," + DATA.hold.locks[i].to + "]";
        lks += "]; var nc = 0; for (var q = 0; q < LK.length; q++) if (time >= LK[q][0] && time < LK[q][1]) nc++;\n";
        var hcl = text(main, "Hold Coins", "COINS", DATA.hud.label, DATA.hud.left, DATA.accent, false);
        hcl.property("ADBE Text Properties").property("ADBE Text Document").expression = holdAlphaExpr() + lks + "a > 0.5 ? 'COINS ' + nc + '/' + " + DATA.hold.cells + " : '';";
        var hcr = text(main, "Hold Respins", "RESPINS", DATA.hud.label, DATA.hud.right, DATA.accent, false);
        hcr.property("ADBE Text Properties").property("ADBE Text Document").expression = holdAlphaExpr() + holdCounterExpr() + "a > 0.5 ? 'RESPINS ' + n : '';";
        kids.push(hcl);
        kids.push(hcr);
      }
      if (DATA.fsBlocks.length) {
        var fsl = text(main, "Free Spins Counter", "FREE SPINS", DATA.hud.label, DATA.hud.left, DATA.accent, false);
        fsl.property("ADBE Text Properties").property("ADBE Text Document").expression = fsData + "cur ? (done ? 'FREE SPINS DONE' : 'FREE SPINS ' + idx + '/' + Math.max(cur[2], idx)) : '';";
        var fst = text(main, "Free Spins Total", "TOTAL", DATA.hud.label, DATA.hud.right, DATA.accent, false);
        fst.property("ADBE Text Properties").property("ADBE Text Document").expression = fmtExpr() + fsData + "cur ? 'TOTAL ' + fmt(thisComp.layer(\"SLOT CONTROL\").effect(\"FS Total\")(1).value) : '';";
        kids.push(fsl);
        kids.push(fst);
      }
      var maxMeter = 0;
      for (i = 0; i < DATA.meterKeys.length; i++) maxMeter = Math.max(maxMeter, DATA.meterKeys[i].v);
      var mo = rollCounter(main, "Win Meter", ctrl("Meter") + ".valueAtTime(time)", maxMeter, DATA.hud.size, [DATA.hud.x, DATA.hud.y]);
      P(mo, "ADBE Opacity").expression = "thisComp.layer(\"SLOT CONTROL\").effect(\"Meter\")(1).value > 0.0001 ? 100 : 0;";
      kids.push(mo);
    }
    }
    for (r = 0; r < DATA.rounds.length; r++) {
      var fxL = buildRound(DATA.rounds[r]);
      if (fxL) kids.push(fxL);
    }
    // Particles that keep going to the end of the animation.
    RBASE = "Main";
    for (i = 0; i < DATA.mainParticles.length; i++) {
      if (DATA.mainParticles[i].layer === "back") continue;
      var mp = emitter(main, DATA.mainParticles[i], 0);
      if (mp) kids.push(mp);
    }
    for (i = 0; i < kids.length; i++) kids[i].parent = shake;
    // CAMERA: the whole scene hangs from it; it pushes in on anticipation.
    if (DATA.camera) {
      var cam = main.layers.addNull(DUR);
      cam.name = "CAMERA";
      pos(cam, [W / 2, H / 2]);
      shake.parent = cam;
      if (bg) bg.parent = cam;
      var C = DATA.camera, cw = "var CW = [", ci;
      for (ci = 0; ci < C.windows.length; ci++) {
        var wd = C.windows[ci], fs = "[", fj;
        for (fj = 0; fj < wd[2].length; fj++) fs += (fj ? "," : "") + "[" + wd[2][fj].join(",") + "]";
        cw += (ci ? "," : "") + "[" + wd[0] + "," + wd[1] + "," + fs + "]," + wd[3] + "]";
      }
      var camE = cw + "];\nfunction sm(x) { x = x < 0 ? 0 : (x > 1 ? 1 : x); return x * x * (3 - 2 * x); }\n" +
        "var z = 1, fx = " + W / 2 + ", fy = " + H / 2 + ";\n" +
        "for (var i = 0; i < CW.length; i++) { var w = CW[i]; if (time < w[0] || time > w[1] + " + (C.times[1] + C.times[2]) + ") continue;\n" +
        "  var k = sm((time - w[0]) / " + C.times[0] + ") * (1 - sm((time - w[1] - " + C.times[1] + ") / " + C.times[2] + "));\n" +
        "  var F = w[2]; fx = F[0][1]; fy = F[0][2];\n" +
        "  for (var j = 1; j < F.length; j++) { var b = sm((time - F[j][0]) / " + C.times[3] + "); if (b <= 0) continue; fx += (F[j][1] - fx) * b; fy += (F[j][2] - fy) * b; }\n" +
        "  z = 1 + w[3] * k * " + ctrl("Zoom %") + " / 100; break; }\n";
      P(cam, "ADBE Position").expression = camE + "[fx * (1 - z) + " + W / 2 + " * z, fy * (1 - z) + " + H / 2 + " * z];";
      P(cam, "ADBE Scale").expression = camE + "[z * 100, z * 100];";
    }
    var sh = "var S = [";
    for (i = 0; i < DATA.shakes.length; i++) sh += (i ? "," : "") + "[" + DATA.shakes[i].join(",") + "]";
    sh += "]; var x = 0, y = 0, amt = " + ctrl("Shake %") + " / 100;\nfor (var i = 0; i < S.length; i++) { var a = time - S[i][0]; if (a >= 0 && a < S[i][2]) { var k = 1 - a / S[i][2]; var m = S[i][1] * k * k * amt; x += Math.sin(a * 93 + S[i][0] * 7) * m; y += Math.cos(a * 79 + S[i][0] * 3) * m; } }\nvalue + [x, y];";
    P(shake, "ADBE Position").expression = sh;
    var fl = solid(main, [1, 0.96, 0.84], "Flash", W, H, [W / 2, H / 2]);
    fl.blendingMode = BlendingMode.ADD;
    var fe = "var F = [";
    for (i = 0; i < DATA.flashes.length; i++) fe += (i ? "," : "") + "[" + DATA.flashes[i].join(",") + "]";
    fe += "]; var a = 0;\nfor (var i = 0; i < F.length; i++) { var d = time - F[i][0]; if (d >= 0 && d < F[i][2]) a += F[i][1] * Math.pow(1 - d / F[i][2], 2); }\nMath.min(90, a * 100 * " + ctrl("Flash %") + " / 100);";
    P(fl, "ADBE Opacity").expression = fe;
    var vg = machineArt("Vignette", DATA.assets.vignette);
    buildSound();
    roundMarkers(main);
    slotCtrl.moveToBeginning();
    if (bg) bg.moveToEnd();
    if (DATA.transparent) {
      if (bg) bg.enabled = false;
      if (vg) vg.enabled = false;
    }
  }

  // ---------- rounds ----------
  // One comp per round that shows something; it places the effect
  // placeholders (shockwaves, frames, rays, titles, paylines...) in time.
  function buildRound(R) {
    var P0 = R.start, len = Math.max(0.6, (R.fxEnd !== null && R.fxEnd !== undefined ? R.fxEnd : R.next + 0.6) - P0), i, k;
    var hs = R.holdspin && (R.holdspin.hits.length || R.holdspin.tease.length);
    var hasFx = R.steps.length || R.overlay || R.banner || R.wheel || R.celebrate || R.nearmiss || R.expand || R.mult || R.pops.length || hs || R.collect || R.grand || R.particles.length;
    if (!hasFx) return null;
    RBASE = "R" + pad2(R.index + 1) + " " + R.label;
    var comp = addComp(RBASE + SUFFIX, W, H, len, fRounds);
    function rel(t) { return Math.max(0, t - P0); }
    var winC = [DATA.winX + DATA.winW / 2, DATA.winTop + DATA.winH / 2];
    var dimW = [];
    for (i = 0; i < R.steps.length; i++) dimW.push([rel(R.steps[i].start), rel(R.steps[i].end + (R.steps[i].tumble ? 0.25 : 0))]);
    if (R.celebrate) dimW.push([rel(R.celebrate.start), rel(R.celebrate.end + 0.4)]);
    if (R.nearmiss) dimW.push([rel(R.nearmiss.start), rel(R.nearmiss.end)]);
    if (R.mult) dimW.push([rel(R.mult.start), rel(R.mult.end)]);
    if (dimW.length) {
      var dim = solid(comp, [0, 0, 0], "Dim Reels", DATA.winW, DATA.winH, winC);
      P(dim, "ADBE Opacity").expression = windowsExpr("D", dimW) + "var a = 0; for (var i = 0; i < D.length; i++) { var x = Math.min((time - D[i][0]) / 0.2, (D[i][1] - time) / 0.35); a = Math.max(a, Math.max(0, Math.min(1, x))); }\na * " + (DATA.dim * 100) + " * " + ctrl("Dim %") + " / 100;";
    }
    if (R.expand) {
      for (i = 0; i < R.expand.reels.length; i++) {
        var er = R.expand.reels[i];
        var beam = frameAt(comp, "FX Wild Beam", DATA.cellW, DATA.winH, { stroke: 0.04, round: 0.06, fill: [1, 0.8, 0.4], fillOp: 22, glow: 0.25, glowI: 1.5, color: [1, 0.84, 0.35] }, "Expanding Wild Glow", [er.x, winC[1]], rel(R.expand.start), rel(R.expand.end + 0.5));
        beam.blendingMode = BlendingMode.ADD;
        fadeKeys(beam, rel(R.expand.start), rel(R.expand.end + 0.5), 0.15, 0.5);
        for (k = 0; k < er.cells.length; k++) {
          if (DATA.wildSym < 0) break;
          var ta = rel(R.expand.start) + er.cells[k].delay;
          var wl = inst(comp, symComps[DATA.wildSym], "Expanded Wild", [er.x, er.cells[k].y], ta, len);
          P(wl, "ADBE Scale").expression = EASE_LIB + "var s = 30 + 70 * outBack(c01((time - " + ta + ") / 0.35)); [s, s];";
        }
      }
    }
    for (i = 0; i < R.steps.length; i++) {
      var st = R.steps[i];
      var la = rel(st.start), lb = rel(st.end);
      if (st.lines.length && DATA.showLines) linesFor(comp, st.lines, la, lb);
      if (st.fx) flyCells(comp, st, la, lb, rel);
      else popCells(comp, st.cells, la, lb, false, true);
      if (st.amount > 0) {
        var cx = 0, cy = 0;
        for (k = 0; k < st.cells.length; k++) { cx += st.cells[k].x; cy += st.cells[k].y; }
        cx /= st.cells.length;
        cy /= st.cells.length;
        if (st.lines.length) { cx = W / 2; cy = winC[1] - DATA.cellH * 0.15; }
        // A merged win shows its amount under the big symbol once it forms.
        var ta = la + 0.15;
        if (st.fx && st.fx.style === "merge") {
          cx = st.fx.goal[0];
          cy = st.fx.goal[1] + DATA.cellH * (st.fx.big * 0.5 + 0.25);
          ta = rel(st.fx.mergeAt) + 0.15;
        }
        var ft = text(comp, "Win Amount", "+" + DATA.currency + st.amount.toFixed(DATA.decimals), Math.round(DATA.titlePx * (st.tumble ? 0.4 : 0.5)), [cx, cy]);
        var p0 = P(ft, "ADBE Position").value;
        ease1(P(ft, "ADBE Position"), [[ta, p0], [lb, [p0[0], p0[1] - DATA.cellH * 0.5]]]);
        fadeKeys(ft, ta, lb, 0.2, 0.4);
        trim(ft, ta, lb);
      }
    }
    for (i = 0; i < R.pops.length; i++) {
      var pp = R.pops[i];
      ring(comp, [pp.x, pp.y], rel(pp.t), DATA.cellW * 0.8, pp.color);
    }
    if (R.mult) buildMult(comp, R, rel);
    if (R.celebrate) popCells(comp, R.scatters, rel(R.celebrate.start), rel(R.celebrate.end) + 0.4, true, false);
    if (R.nearmiss) {
      popCells(comp, R.scatters, rel(R.nearmiss.start), rel(R.nearmiss.end), false, false);
      if (R.nearMiss) {
        var nmL = frameAt(comp, "FX Near Miss", DATA.cellW, DATA.winH, { stroke: 0.035, round: 0.06, glow: 0.2, glowI: 1.4, color: [1, 0.31, 0.43] }, "Near Miss Reel", [R.nearMiss.x, winC[1]], rel(R.nearmiss.start), rel(R.nearmiss.end));
        P(nmL, "ADBE Opacity").expression = "60 + 40 * Math.sin(time * 16);";
      }
      var nt = titleLayer(comp, "nearmiss", winC, rel(R.nearmiss.start), rel(R.nearmiss.end), W * 0.9);
      if (nt) fadeKeys(nt, rel(R.nearmiss.start), rel(R.nearmiss.end), 0.2, 0.35);
    }
    if (hs) buildRespin(comp, R, rel);
    if (R.collect) buildCollect(comp, R, rel);
    if (R.grand) buildGrand(comp, R, rel);
    if (R.overlay) buildBigWin(comp, R, rel);
    if (R.banner) buildBanner(comp, R, rel);
    if (R.wheel) buildWheel(comp, R, rel);
    emitters(comp, R, "over");
    var L = main.layers.add(comp);
    L.startTime = P0;
    L.name = RBASE;
    return L;
  }

  function buildMult(comp, R, rel) {
    var M = R.mult, i;
    var tg = M.target;
    for (i = 0; i < M.items.length; i++) {
      var it = M.items[i];
      var t = rel(it.t);
      ring(comp, [it.x, it.y], Math.max(0, t - 0.25), DATA.cellW * 0.9, [1, 0.82, 0.35]);
      var fly = text(comp, "Multiplier x" + it.value, "x" + it.value, Math.round(DATA.cellH * 0.36), [it.x, it.y], [1, 0.62, 0.15]);
      var a0 = P(fly, "ADBE Position").value;
      var mid = [(a0[0] + tg[0]) / 2, Math.min(a0[1], tg[1]) - DATA.cellH * 0.8];
      ease1(P(fly, "ADBE Position"), [[t, a0], [t + 0.22, mid], [t + 0.45, [tg[0], tg[1] + DATA.cellH * 0.12]]]);
      glow(fly, DATA.cellW * 0.12, 1.4);
      trim(fly, t, t + 0.5);
    }
    var pl = inst(comp, plaquePH("Multiplier Plaque", DATA.cellW * 2.6, DATA.cellH * 0.7, DATA.cellH * 0.2, 85, [1, 0.82, 0.35], Math.max(2, DATA.cellW * 0.03)), "Multiplier Plaque", tg, rel(M.start), rel(M.end + 0.3));
    fadeKeys(pl, rel(M.start), rel(M.end + 0.3), 0.25, 0.4);
    var items = "var I = [";
    for (i = 0; i < M.items.length; i++) items += (i ? "," : "") + "[" + rel(M.items[i].t) + "," + M.items[i].value + "]";
    items += "]; var sum = 0; for (var i = 0; i < I.length; i++) if (time >= I[i][0] + 0.45) sum += I[i][1];\n";
    var tx = text(comp, "Multiplier Total", "x", Math.round(DATA.cellH * 0.35), tg);
    tx.property("ADBE Text Properties").property("ADBE Text Document").expression = fmtExpr() + items +
      "time >= " + rel(M.applyAt) + " ? fmt(" + M.total + ") : (sum > 0 ? fmt(" + M.base + ") + ' x' + sum : fmt(" + M.base + "));";
    P(tx, "ADBE Scale").expression = EASE_LIB + "var a = time - " + rel(M.applyAt) + "; var s = a > 0 ? 100 * (1 + 0.25 * Math.pow(1 - c01(a / 0.4), 2)) : 100; [s, s];";
    fadeKeys(tx, rel(M.start), rel(M.end + 0.3), 0.25, 0.4);
    ring(comp, tg, rel(M.applyAt), DATA.cellW * 2.6, [1, 0.82, 0.35]);
  }

  function buildBigWin(comp, R, rel) {
    var ov = R.overlay, i;
    var a = rel(ov.start), b = rel(ov.end);
    var cx = W / 2, cy = H * (H > W * 1.1 ? 0.4 : 0.42);
    darkLayer(comp, a, b, 72);
    rays(comp, [cx, cy], a, b, 100 * H * 1.7 / 1024, 12.6, 60);
    rays(comp, [cx, cy], a, b, 70 * H * 1.7 / 1024, -20, 35);
    emitters(comp, R, "under", ["tier", "total"]);
    for (i = 0; i < ov.tiers.length; i++) {
      var ta = rel(ov.tierTimes[i]);
      var tb = i + 1 < ov.tiers.length ? rel(ov.tierTimes[i + 1]) : b;
      var T = titleLayer(comp, ov.tiers[i], [cx, cy - H * 0.08], ta, tb, W * 0.92);
      if (T && i + 1 === ov.tiers.length) fadeKeys(T, ta, tb, 0.05, 0.6);
      if (i > 0) ring(comp, [cx, cy], ta, H * 0.75, DATA.accent);
    }
    winCtrl(comp, ov.keys, -R.start);
    var od = counters(comp, [cx, cy + H * 0.13], Math.round(DATA.titlePx * 0.72), ov.amount, rel(ov.countEnd));
    fadeKeys(od, a + 0.2, b, 0.3, 0.6);
  }

  // ---------- Hold & Spin ----------
  // A coin layer that bounces in at time t, with its value on it.
  function coinPop(comp, it, t, dur, lab, name) {
    var L = inst(comp, symComps[it.s] || symComps[0], name, [it.x, it.y], t, t + dur);
    P(L, "ADBE Scale").expression = EASE_LIB + "var k = c01((time - " + t + ") / " + dur + "); var s = 100 * (1 + 0.26 * Math.sin(k * Math.PI)); [s, s];";
    if (lab) {
      var lsz = Math.round(DATA.cellH * 0.3);
      var T = text(comp, "Value " + lab[0], lab[0], lsz, [0, 0], [1, 0.9, 0.55]);
      pos(T, [it.x, it.y + lab[1] * DATA.cellH + lsz * 0.36 * lab[2]]);
      P(T, "ADBE Scale").setValue([lab[2] * 100, lab[2] * 100]);
      T.parent = L;
      trim(T, t, t + dur);
    }
    return L;
  }
  function buildRespin(comp, R, rel) {
    var hs = R.holdspin, i;
    for (i = 0; i < hs.tease.length; i++) {
      var te = hs.tease[i];
      var S = frameAt(comp, "FX Tease Cell", DATA.cellW * 0.96, DATA.cellH * 0.96, { stroke: 0.05, round: 0.1, fill: [1, 0.55, 0.08], fillOp: 14, glow: 0.3, glowI: 1.6, color: [1, 0.67, 0.16] }, "Tease Cell", [te.x, te.y], rel(te.start - 0.05), rel(te.end + 0.25));
      S.blendingMode = BlendingMode.ADD;
      fadeKeys(S, rel(te.start - 0.05), rel(te.end + 0.25), 0.2, 0.25);
    }
    for (i = 0; i < hs.hits.length; i++) {
      var h = hs.hits[i], t = rel(h.t);
      ring(comp, [h.x, h.y], t, DATA.cellW * (h.special ? 1.3 : 0.95), h.color);
      coinPop(comp, h, t, 0.35, h.lab, "Coin Lands");
    }
  }
  function buildCollect(comp, R, rel) {
    var C = R.collect, i;
    var target = [W / 2, DATA.hold ? DATA.hold.barY : H * 0.15];
    for (i = 0; i < C.items.length; i++) {
      var it = C.items[i], a = rel(it.at), b = rel(it.arrive);
      ring(comp, [it.x, it.y], a, DATA.cellW * 0.9, it.color);
      coinPop(comp, it, a, b + 0.1 - a, null, "Coin Collect");
      // Collected: the cell dims for the rest of the feature.
      frameAt(comp, "FX Collected", DATA.cellW * 0.96, DATA.cellH * 0.96, { round: 0.12, fill: [0, 0, 0], fillOp: 45 }, "Collected", [it.x, it.y], b, comp.duration);
      // The value flies to the total on the frame.
      var T = text(comp, "Collect " + it.text, it.text, Math.round(DATA.cellH * 0.22), [it.x, it.y]);
      var p0 = P(T, "ADBE Position").value;
      var mid = [(p0[0] + target[0]) / 2, Math.min(p0[1], target[1]) - DATA.cellH * 0.6];
      ease1(P(T, "ADBE Position"), [[a, p0], [(a + b) / 2, mid], [b, [target[0], target[1] + DATA.cellH * 0.08]]]);
      P(T, "ADBE Scale").expression = EASE_LIB + "var k = c01((time - " + a + ") / " + (b - a) + "); var s = 100 * (1.1 - 0.35 * k); [s, s];";
      glow(T, DATA.cellW * 0.12, 1.3);
      trim(T, a, b + 0.02);
    }
  }
  function buildGrand(comp, R, rel) {
    var G = R.grand;
    var a = rel(G.start), b = rel(G.end);
    var cx = W / 2, cy = H * 0.44;
    darkLayer(comp, a, b, 70);
    rays(comp, [cx, cy], a, b, 100 * H * 1.8 / 1024, 17, 60);
    ring(comp, [cx, cy], a, H * 0.8, [1, 0.7, 0.1]);
    emitters(comp, R, "under", ["grand"]);
    var T = titleLayer(comp, "grand", [cx, cy - H * 0.06], a, b, W * 0.9);
    if (T) fadeKeys(T, a, b, 0.05, 0.5);
    winCtrl(comp, G.keys, -R.start, "GRAND CTRL");
    var od = counters(comp, [cx, cy + H * 0.14], Math.round(DATA.titlePx * 0.66), G.amount, rel(G.countEnd), "GRAND CTRL");
    fadeKeys(od, a + 0.2, b, 0.3, 0.5);
  }

  function buildBanner(comp, R, rel) {
    var bn = R.banner;
    var a = rel(bn.start), b = rel(bn.end);
    var cx = W / 2, cy = H * 0.44;
    darkLayer(comp, a, b, 60);
    rays(comp, [cx, cy], a, b, 100 * H * 1.6 / 1024, 14.3, 55);
    ring(comp, [cx, cy], a, H * 0.7, DATA.accent);
    var T = titleLayer(comp, bn.kind, [cx, bn.kind === "freespins" || bn.kind === "holdspin" ? cy - H * 0.13 : cy], a, b, W * 0.9);
    if (T) fadeKeys(T, a, b, 0.05, 0.5);
    if (bn.kind === "holdspin") {
      var sub = text(comp, "Respins", bn.freeSpins + " RESPINS", Math.round(DATA.titlePx * 0.62), [cx, cy + H * 0.1], [1, 0.55, 0.15]);
      P(sub, "ADBE Scale").expression = EASE_LIB + "var s = 10 + 90 * outElastic(c01((time - " + (a + 0.35) + ") / 0.8)); [s, s];";
      fadeKeys(sub, a, b, 0.05, 0.5);
    } else if (bn.kind === "freespins") {
      var num = text(comp, "Free Spins Count", String(bn.freeSpins), Math.round(DATA.titlePx * 1.5), [cx, cy + H * 0.12], [1, 0.55, 0.15]);
      P(num, "ADBE Scale").expression = EASE_LIB + "var s = 10 + 90 * outElastic(c01((time - " + (a + 0.35) + ") / 0.8)); [s, s];";
      fadeKeys(num, a, b, 0.05, 0.5);
    } else if (R.amount > 0 && R.meter) {
      winCtrl(comp, countKeys(rel(R.meter.start), rel(R.meter.end), R.amount));
      var od = counters(comp, [cx, cy + H * 0.16], Math.round(DATA.titlePx * 0.6), R.amount);
      fadeKeys(od, a, b, 0.3, 0.5);
    }
  }

  // The turning part of the wheel as one placeholder comp: your face art,
  // the segments, an icon layer per segment that has one and a text layer
  // per label (font, size and colour editable), and the hub when it turns.
  function wheelDiscPH() {
    var WH = DATA.wheel, D = WH.disc;
    return ph("Wheel Disc", "Wheel", D, D, DUR + 2, function (c) {
      var i, L;
      var part = function (key, rel2) {
        var src = imagePH(key, "Wheel", rel2);
        return src ? inst(c, src, key, [D / 2, D / 2]) : null;
      };
      part("Wheel Face", DATA.assets.wheelFace);
      part("Wheel Segments", DATA.assets.wheelSegments);
      for (i = 0; i < WH.icons.length; i++) {
        var ic = WH.icons[i], ia = ic.a * Math.PI / 180;
        var isrc = imagePH("Wheel Icon " + pad2(ic.k + 1), "Wheel", ic.file);
        if (!isrc) continue;
        L = inst(c, isrc, "Icon " + pad2(ic.k + 1), [D / 2 + Math.cos(ia) * ic.r, D / 2 + Math.sin(ia) * ic.r]);
        P(L, "ADBE Rotate Z").setValue(ic.a + 90);
      }
      for (i = 0; i < WH.labels.length; i++) {
        var lb = WH.labels[i], la = lb.a * Math.PI / 180;
        L = c.layers.addText(lb.text);
        L.name = "Label " + (i + 1) + " " + lb.text;
        var prop = L.property("ADBE Text Properties").property("ADBE Text Document");
        var td = prop.value;
        td.fontSize = lb.px;
        td.applyFill = true;
        td.fillColor = WH.fill;
        td.applyStroke = true;
        td.strokeColor = WH.stroke;
        td.strokeWidth = Math.max(1, Math.round(lb.px * 0.22));
        td.strokeOverFill = false;
        td.justification = ParagraphJustification.CENTER_JUSTIFY;
        try { td.font = WH.font; } catch (e) { try { td.font = DATA.font; } catch (e2) {} }
        prop.setValue(td);
        // Turn about the middle of the text, reading outwards.
        P(L, "ADBE Anchor Point").setValue([0, -lb.px * 0.36]);
        pos(L, [D / 2 + Math.cos(la) * lb.r, D / 2 + Math.sin(la) * lb.r]);
        P(L, "ADBE Rotate Z").setValue(lb.a);
      }
      if (WH.hubSpins) {
        part("Wheel Hub", DATA.assets.wheelHub);
        part("Wheel Center", DATA.assets.wheelCenter);
      }
    });
  }

  function buildWheel(comp, R, rel) {
    var w = R.wheel, WH = DATA.wheel, i, s;
    var inA = rel(w.inStart), inB = rel(w.inEnd), outA = rel(w.outStart), outB = rel(w.outEnd);
    var cx = WH.cx, cy = WH.cy, Rr = WH.R;
    // A wheel that is already on screen (the wheel game) skips its intro.
    var tInE = w.cont ? "var tIn = 1;" : "var tIn = c01((time - " + inA + ") / " + Math.max(0.01, inB - inA) + ");";
    var envExpr = EASE_LIB + tInE + " var tOut = c01((time - " + outA + ") / " + Math.max(0.01, outB - outA) + ");\n" +
      "var env = (1 - Math.pow(1 - tIn, 3)) * (1 - inCubic(tOut));\n";
    var dk = solid(comp, [0, 0, 0], "Darken", W * 1.2, H * 1.2, [W / 2, H / 2]);
    P(dk, "ADBE Opacity").expression = envExpr + "env * " + (DATA.game === "wheel" ? 30 : 86) + " * " + ctrl("Dim %") + " / 100;";
    var ry = inst(comp, raysPH(false), "Light Rays", [cx, cy]);
    if (ry) {
      ry.blendingMode = BlendingMode.ADD;
      P(ry, "ADBE Rotate Z").expression = "time * 8.6;";
      var rys = 100 * Rr * 3.4 / ry.source.width;
      P(ry, "ADBE Scale").setValue([rys, rys]);
      P(ry, "ADBE Opacity").expression = envExpr + "env * 45;";
    }
    var rig = comp.layers.addNull(comp.duration);
    rig.name = "WHEEL RIG";
    pos(rig, [cx, cy]);
    var part = function (key, rel2, xy) { return inst(comp, imagePH(key, "Wheel", rel2), key, xy || [cx, cy]); };
    var disc = inst(comp, wheelDiscPH(), "Wheel Disc", [cx, cy]);
    var kids = [];
    // A glowing wedge on a segment of the disc, turning with it.
    var wedgeOn = function (segIdx, name, opExpr) {
      var seg = WH.segDeg, a0 = -90 + segIdx * seg + w.angle0, pts = [[cx, cy]], ang;
      for (s = 0; s <= 12; s++) {
        ang = (a0 + seg * s / 12) * Math.PI / 180;
        pts.push([cx + Math.cos(ang) * Rr, cy + Math.sin(ang) * Rr]);
      }
      var wedge = shapeLayer(comp, name);
      var wg = group(wedge);
      path(wg, pts, true);
      fill(wg, [1, 1, 1], 100);
      wedge.blendingMode = BlendingMode.ADD;
      P(wedge, "ADBE Opacity").expression = opExpr;
      wedge.parent = disc;
    };
    if (disc) {
      var rot = P(disc, "ADBE Rotate Z");
      rot.setValue(w.angle0);
      setKeys(rot, w.keys, -R.start);
      kids.push(disc);
      wedgeOn(w.segment, w.noWin ? "No Win Segment" : "Winning Segment", "var a = time - " + rel(w.spinEnd) + "; a < 0 ? 0 : Math.min(1, a / 0.3) * (30 + 25 * Math.sin(time * 10));");
      for (i = 0; i < w.agains.length; i++) {
        var ag = w.agains[i];
        wedgeOn(ag.segment, "Spin Again Segment " + (i + 1), "var a = time - " + rel(ag.at - 0.2) + "; (a < 0 || time > " + rel(ag.until) + ") ? 0 : Math.min(1, a / 0.3) * (30 + 25 * Math.sin(time * 10));");
      }
    }
    // A hub that stays still sits over the turning disc.
    if (!WH.hubSpins) {
      var hub = part("Wheel Hub", DATA.assets.wheelHub);
      if (hub) kids.push(hub);
      var ctr = part("Wheel Center", DATA.assets.wheelCenter);
      if (ctr) kids.push(ctr);
    }
    var ringL = part("Wheel Ring", DATA.assets.wheelRing);
    if (ringL) kids.push(ringL);
    var wa = part("Wheel Bulbs A", DATA.assets.wheelBulbsA);
    var wb = part("Wheel Bulbs B", DATA.assets.wheelBulbsB);
    if (wa) { wa.blendingMode = BlendingMode.ADD; P(wa, "ADBE Opacity").expression = "Math.floor(time * (time > " + rel(w.spinEnd) + " ? 8 : 3)) % 2 == 0 ? 100 : 15;"; kids.push(wa); }
    if (wb) { wb.blendingMode = BlendingMode.ADD; P(wb, "ADBE Opacity").expression = "Math.floor(time * (time > " + rel(w.spinEnd) + " ? 8 : 3)) % 2 == 1 ? 100 : 15;"; kids.push(wb); }
    // The pointer pivots where the art says; it reads the disc's rotation
    // (pegs bend it) and, after an almost-slip, springs back past straight.
    var ptr = part("Wheel Pointer", DATA.assets.wheelPointer, WH.pivot);
    if (ptr) {
      var pw = ptr.source.width, ph2 = ptr.source.height;
      P(ptr, "ADBE Anchor Point").setValue(WH.anchor || [pw / 2, ph2 * 0.2]);
      pos(ptr, WH.pivot);
      ptr.name = "Pointer";
      var kick = w.kick ? "var k = time - " + rel(w.kick[0]) + "; if (k > 0 && k <= 1.6) d += " + w.kick[1] + " * Math.exp(-k * 5.5) * Math.sin(k * Math.PI * 2 * 2.2);\n" : "";
      P(ptr, "ADBE Rotate Z").expression = "var th = thisComp.layer(\"Wheel Disc\").transform.rotation.value; var seg = " + WH.segDeg + ", P = " + WH.pointerAngle + ";\n" +
        "var u = (((th - P) / seg) % 1 + 1) % 1; var w = 0.22, mx = " + WH.max + ", b = 0.3;\n" +
        "var d = u > 1 - w ? -mx * ((u - (1 - w)) / w) : (u < b ? -mx * Math.pow(1 - u / b, 2) * Math.cos(u / b * Math.PI * 1.5) : 0);\n" +
        kick + "P + d;";
      kids.push(ptr);
    }
    for (i = 0; i < kids.length; i++) {
      kids[i].parent = rig;
      P(kids[i], "ADBE Opacity").expression = envExpr + "env * 100;";
    }
    P(rig, "ADBE Scale").expression = EASE_LIB + tInE + " var tOut = c01((time - " + outA + ") / " + Math.max(0.01, outB - outA) + ");\n" +
      "var s = (0.3 + 0.7 * outBack(tIn)) * (1 - 0.35 * inCubic(tOut)) * 100; [s, s];";
    var title = titleLayer(comp, "wheel", WH.title, inA, rel(w.spinStart) + 1.1, W * 0.9);
    if (title) fadeKeys(title, inA, rel(w.spinStart) + 1.1, 0.3, 0.5);
    var pa = rel(w.prizeStart), PL = WH.plaque, Rp = PL[2];
    var plaqueSrc = plaquePH("Prize Plaque", Rp * 1.5, Rp * 0.62, Rp * 0.15, 96, [0.91, 0.73, 0.29], Math.max(2, Rp * 0.03));
    // Spin again: the plaque says so between the spins.
    for (i = 0; i < w.agains.length; i++) {
      var g2 = w.agains[i], ga = rel(g2.at), gb = rel(g2.until);
      var apl = inst(comp, plaqueSrc, "Spin Again Plaque " + (i + 1), [PL[0], PL[1]], ga, gb);
      var aPop = EASE_LIB + "var k = outBack(c01((time - " + ga + ") / 0.4)) * 100 * c01((" + gb + " - time) / 0.3); [k, k];";
      P(apl, "ADBE Scale").expression = aPop;
      var albl = text(comp, "Spin Again Label " + (i + 1), g2.label, Math.round(Rp * 0.2), [PL[0], PL[1]]);
      P(albl, "ADBE Scale").expression = aPop;
      trim(albl, ga, gb);
      ring(comp, [PL[0], PL[1]], ga, Rp * 1.3, DATA.accent);
    }
    if (!w.noWin) {
      emitters(comp, R, "under", ["wheel"]);
      ring(comp, [PL[0], PL[1]], pa, Rp * 1.6, DATA.accent);
    }
    // The plaque leaves before the next spin in the wheel game.
    var pEnd = Math.min(outB, rel(w.plaqueEnd));
    var pl = inst(comp, plaqueSrc, "Prize Plaque", [PL[0], PL[1]], pa, pEnd);
    var popE = EASE_LIB + "var k = outBack(c01((time - " + pa + ") / 0.5)) * 100; [k, k];";
    P(pl, "ADBE Scale").expression = popE;
    // No win: the label sits in the middle and nothing counts.
    var lbl = text(comp, w.noWin ? "No Win Label" : "Prize Label", w.label, Math.round(Rp * 0.2), [PL[0], PL[1] - (w.noWin ? 0 : Rp * 0.1)]);
    P(lbl, "ADBE Scale").expression = popE;
    trim(lbl, pa, pEnd);
    var fadeOut = envExpr + "env * 100 * c01((" + pEnd + " - time) / 0.35);";
    P(pl, "ADBE Opacity").expression = fadeOut;
    P(lbl, "ADBE Opacity").expression = fadeOut;
    if (w.noWin) return;
    winCtrl(comp, countKeys(rel(w.countStart), rel(w.countEnd), R.amount));
    var od = counters(comp, [PL[0], PL[1] + Rp * 0.12], Math.round(Rp * 0.14), R.amount);
    trim(od, pa, pEnd);
    P(od, "ADBE Opacity").expression = fadeOut;
  }

  // ---------- sound ----------
  // "SFX": one audio layer per cue at its time, named after the cue and its
  // round and coloured by group. Levels are decibels on the SFX MIX null:
  // Master plus one slider per group; each layer reads its two sliders.
  var fSfx = null;
  function buildSound() {
    var S = DATA.sfx, i;
    if (!S) return null;
    var sc = addComp("SFX" + SUFFIX, W, H, DUR, dir("sound", "Sound", top));
    sc.comment = "Every sound cue on its own layer. Mix with the sliders on SFX MIX; mute, move or swap any cue.";
    if (!fSfx) fSfx = folder("SFX", fShared);
    for (i = S.events.length - 1; i >= 0; i--) {
      var e = S.events[i], g = S.groups[e[2]];
      var it = imp(S.clips[e[1]], fSfx);
      if (!it) continue;
      var L = sc.layers.add(it);
      L.name = e[3];
      L.startTime = e[0];
      try { L.label = g.label; } catch (x) {}
      L.property("ADBE Audio Group").property("ADBE Audio Levels").expression = "var m = thisComp.layer(\"SFX MIX\");\nvar d = m.effect(\"Master (dB)\")(1) + m.effect(\"" + g.name + " (dB)\")(1);\n[d, d];";
    }
    var mix = sc.layers.addNull(DUR);
    mix.name = "SFX MIX";
    slider(mix, "Master (dB)").setValue(S.master);
    for (i = 0; i < S.groups.length; i++) slider(mix, S.groups[i].name + " (dB)").setValue(S.groups[i].db);
    roundMarkers(sc);
    var SL = main.layers.add(sc);
    SL.name = "SFX";
    return SL;
  }

  function buildFormat() {
    W = DATA.W;
    H = DATA.H;
    FPS = DATA.fps;
    DUR = DATA.duration;
    PH = {};
    FOLD = {};
    top = folder(DATA.name + SUFFIX);
    mainName = uniqueName(DATA.name + SUFFIX);
    createMain();
    fPH = folder("Placeholder Comps", top);
    fRounds = folder("Rounds", top);
    // The wheel game has no reels, so no symbol comps.
    if (DATA.game !== "wheel") {
      fSymbols = dir("PH/Symbols", "Symbols", fPH);
      fReels = folder("Reels", top);
      fHold = DATA.hold ? folder("Hold and Spin", fReels) : null;
      buildSymbols();
      buildAtlas();
    }
    buildDigits();
    buildMain();
  }

  if (!app.project) app.newProject();
  proj = app.project;
  app.beginUndoGroup("Build slot animation");
  try {
    fShared = folder("Slot Assets");
    var f;
    for (f = 0; f < DATA_LIST.length; f++) {
      DATA = DATA_LIST[f];
      SUFFIX = DATA_LIST.length > 1 ? " " + DATA.W + "x" + DATA.H : "";
      buildFormat();
    }
    main.openInViewer();
  } catch (err) {
    alert("The slot build stopped: " + err.toString() + (err.line ? " (script line " + err.line + ")" : ""));
  }
  app.endUndoGroup();
  if (missing.length) alert("These asset files were not found next to the script:\n" + missing.join("\n"));
})();
`;
