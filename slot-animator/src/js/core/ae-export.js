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
import { STICKY_COVER, WILD_WALK, WALK_HOP, BOOST } from './timeline.js';
import { potsConfig, beamCurve, beamPoints, beamSide, POT_BOX, POT_CATCH, POT_FIRE, BEAM_PASSES, BEAM_HOLD, BEAM_FADE } from './pots.js';
import { lineColor } from './paylines.js';
import { OUTCOME_BY_ID } from './defaults.js';
import { holdSpinConfig, isCoinSym, formatPrize, COIN_GLOW } from './coins.js';
import { sfxCues, SFX_GROUPS, toDb } from './sfx.js';
import { particleAssetInfo, spawnParticles, TEMPLATE_BY_ID } from './particles.js';
import { jumpTarget, mergeTarget, flightPath, winFxConfig } from './winfx.js';
import { zoomConfig, focusPoint, ZOOM_IN, ZOOM_HOLD, ZOOM_OUT, PAN } from './camera.js';
import { wheelConfig, segmentLayout, labelPalette, POINTER_MAX } from './wheel.js';
import { fontPostScript } from './fonts.js';
import { teaseWindows, landings, landUntil, TEASE_DIM, LAND_POP, LAND_FADE, TEASE_LEAD, TEASE_IN, TEASE_TAIL } from './tease.js';
import { jackpotsConfig, JP_TEXT, JP_HOLD, JP_CELEBRATE, JP_BLINK } from './jackpots.js';

export const AE_ASSETS = {
  shared: {
    symbol: (i) => `assets/symbols/symbol_${String(i + 1).padStart(2, '0')}.png`,
    winFrame: (i, k) => `assets/symbols/win_${String(i + 1).padStart(2, '0')}_${String(k + 1).padStart(3, '0')}.png`,
    sfx: (type, n) => `assets/sfx/${type}_${String(n).padStart(2, '0')}.wav`,
    particle: (id, k) => `assets/particles/${String(id).replace(/[^a-z0-9_-]/gi, '_')}_${String(k + 1).padStart(2, '0')}.png`,
    pot: (i) => `assets/pots/pot_${i + 1}.png`,
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
    jackpot: (i) => `${dir}/jackpot_${i + 1}.png`,
  }),
};

// Full-screen art (titles, logo, particles) is painted this many
// times larger for After Effects, so it can be scaled up and stay sharp.
export const AE_HD = 2;

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
  const pitch = L.reelX.length > 1 ? L.reelX[1] - L.reelX[0] : L.cellW;
  // A reel's centre, also one reel off the left edge (walking wilds leave there).
  const cellX = (c) => r4(c >= 0 ? L.reelX[c] + L.cellW / 2 : L.reelX[0] + L.cellW / 2 + c * pitch);
  const cellY = (rowPos) => r4(L.rowsTop + (rowPos + 0.5) * L.cellH);
  const symbols = project.symbols.map((s, i) => ({
    name: clean(s.name) || `Symbol ${i + 1}`,
    file: AE_ASSETS.shared.symbol(i),
    win: extras.winFrames?.[i] ? { frames: extras.winFrames[i].map((_, k) => AE_ASSETS.shared.winFrame(i, k)), fps: extras.winFps?.[i] || 24 } : null,
  }));
  const lay = tl.lay;
  const hsc = holdSpinConfig(project);
  for (const v of lay.virtual) symbols.push({ name: v.name, file: AE_ASSETS.shared.symbol(v.sym), win: null });
  hsc.coins.forEach((ct, i) => symbols.push({ name: clean(ct.name) || `Coin ${i + 1}`, file: AE_ASSETS.shared.symbol(lay.coinBase + i), win: null }));
  symbols.push({ name: 'Empty cell', file: AE_ASSETS.shared.symbol(lay.blankSym), win: null });
  const cur = project.machine.currency || '';
  const dec = project.machine.decimals | 0;
  const labelled = hsc.coins.map((c) => !!c.label && !c.src);
  const coinColor = (sym) => rgb(COIN_GLOW[hsc.coins[sym - lay.coinBase]?.palette] || COIN_GLOW.gold);
  // A value riding on a symbol: [text, offset in cells, scale]. "x5" sits low
  // on a multiplier; a coin's prize sits in its middle.
  // A jackpot coin shows its name only (no label); its box shows the value.
  const jpCoins = new Set(tl.jackpots?.coinSyms || []);
  const label = (sym, v) => (jpCoins.has(sym) ? null : isCoinSym(lay, sym) ? [clean(formatPrize(v, cur, dec)), labelled[sym - lay.coinBase] ? -0.1 : 0, 0.7] : [`x${v}`, 0.2, 1]);
  const labelsOf = (strip, values) => [...values.entries()].filter(([j]) => !jpCoins.has(strip[j])).map(([j, v]) => [j, ...label(strip[j], v)]);
  // Particle art used by the emitters, in order of first use.
  const amount = Number(project.effects.coins ?? 1);
  const partAssets = usedParticleAssets(tl, project);
  const particleIndex = (id) => Math.max(0, partAssets.findIndex((a) => a.id === particleAssetInfo(project, id).id));

  // Jumping or merging winners: their flights, laid out for this format.
  const bigScale = r4(Number(winFxConfig(project).bigScale) || 2.2);
  const winFxData = (st) => {
    const f = st.fx;
    if (f.style === 'collect') return { style: f.style, launch: f.launch.map(r4), arrive: f.arrive.map(r4), until: f.until.map(r4), pots: f.pots };
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
  const keepLit = !!project.spin?.scatterLit;
  // Progressive jackpot boxes (core/jackpots.js): where each stands, its
  // seed and growth, and when it is won (for how much) or blinks.
  const jcfg = jackpotsConfig(project);
  const r6 = (x) => Math.round(x * 1e6) / 1e6;
  const jackpots =
    L.jackpots && tl.jackpots
      ? {
          times: [JP_CELEBRATE, JP_BLINK, JP_HOLD],
          running: jcfg.running ? 1 : 0,
          items: L.jackpots.map((b, i) => {
            const tier = jcfg.tiers[i];
            return {
              name: `Jackpot ${tier.id[0].toUpperCase()}${tier.id.slice(1)}`,
              file: A.jackpot(i),
              x: r4(b.x),
              y: r4(b.y),
              w: r4(b.w),
              h: r4(b.h),
              color: rgb(COIN_GLOW[tier.palette] || COIN_GLOW.gold),
              base: r6(tier.base),
              rate: r6(tier.rate),
              hits: tl.jackpots.hits.filter((h) => h.tier === tier.id).map((h) => [r4(h.t), h.amount]),
              blinks: tl.jackpots.blinks.filter((h) => h.tier === tier.id).map((h) => r4(h.t)),
              value: [r4(b.x), r4(b.y + b.h * JP_TEXT.valueY)],
              dy: r4(b.h * JP_TEXT.valueY),
              size: Math.round(b.h * JP_TEXT.valuePx),
              fitW: r4(b.w * 0.82),
              // The name as an editable text layer (off) in the plate's comp.
              label: clean(tier.label),
              labelY: r4(b.h * JP_TEXT.labelY),
              labelPx: Math.round(b.h * JP_TEXT.labelPx),
            };
          }),
        }
      : null;
  // Pots above the machine (core/pots.js) and the beams between them and
  // the cells, laid out on the flat rows After Effects uses.
  const pcfg = potsConfig(project);
  const potColor = (p) => rgb(pcfg.items[p]?.color || '#ffd25a');
  const beamOf = (bm) => {
    const pt = L.pots[bm.pot] || L.pots[0];
    const cell = { x: cellX(bm.c), y: cellY(bm.r) };
    const out = beamSide(cell.x, pt.x, bm.c, L.cellW);
    const b = bm.up ? beamCurve(cell, pt.mouth, pcfg.beam, out) : beamCurve(pt.mouth, cell, pcfg.beam, out);
    return { pot: bm.pot, up: bm.up ? 1 : 0, fire: r4(bm.fire), travel: r4(bm.travel), bez: b.map(r4), pts: beamPoints(b, 24).map((q) => q.map(r4)), color: potColor(bm.pot) };
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
        // A multiplier wild keeps its x on top of its win comp.
        cells: st.cells.map(([c, r], i) => ({ x: cellX(c), y: cellY(r), s: st.cellSyms[i], color: rgb(stepColor(st, c, r)), lab: !st.tumble && R.mult[c][r] != null ? label(st.cellSyms[i], R.mult[c][r]) : null })),
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
      // The tease (core/tease.js): its windows [start, end, reel], and what
      // lands lit while it runs.
      tease: teaseWindows(R).map(([a, b, c]) => [r4(a), r4(b), c]),
      lands: landings(R, tl.rows).map((l) => ({
        x: cellX(l.c),
        y: cellY(l.r),
        s: R.grid[l.c][l.r],
        t: r4(l.t),
        until: r4(landUntil(teaseWindows(R), l.t, keepLit)),
        lab: l.coin ? label(R.grid[l.c][l.r], l.coin.value) : null,
        coin: l.coin ? 1 : 0,
      })),
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
        target: [r4(L.multTarget.x), r4(L.multTarget.y)],
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
    if (p.boost && L.pots) {
      const bo = p.boost;
      out.boost = {
        start: r4(bo.start),
        end: r4(bo.end),
        items: bo.items.map((it) => ({ x: cellX(it.c), y: cellY(it.r), pot: it.pot, color: potColor(it.pot), fire: r4(it.fire), hit: r4(it.hit), from: it.from, to: it.to, lab: it.value != null ? label(it.to, it.value) : null })),
      };
    }
    if (p.beams && L.pots) out.beams = p.beams.map(beamOf);
    if (p.mystery) {
      const my = p.mystery;
      out.mystery = { start: r4(my.start), flipAt: r4(my.flipAt), mid: r4(my.mid), flipEnd: r4(my.flipEnd), end: r4(my.end), from: my.from, sym: my.sym, cells: my.cells.map(([c, r]) => ({ x: cellX(c), y: cellY(r) })) };
    }
    if (p.collector) {
      const cl = p.collector;
      out.collector = {
        start: r4(cl.start),
        done: r4(cl.done),
        end: r4(cl.end),
        x: cellX(cl.c),
        y: cellY(cl.r),
        sym: lay.collectorSym,
        total: r4(cl.total),
        items: cl.items.map((it) => ({ x: cellX(it.c), y: cellY(it.r), at: r4(it.at), arrive: r4(it.arrive), text: clean(formatPrize(it.value, cur, dec)), after: clean(formatPrize(it.after - (cl.items[0].after - cl.items[0].value), cur, dec)) })),
      };
    }
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
        items: p.collect.items.map((it) => ({ x: cellX(it.c), y: cellY(it.r), at: r4(it.at), arrive: r4(it.arrive), s: it.sym, text: clean(formatPrize(it.value, cur, dec)), color: it.special ? coinColor(it.sym) : rgb(extras.accent || '#ffd25a') })),
      };
    }
    // A round's jackpot: its amount flies from the box to the win meter.
    if (p.jackpot && p.jackpot.fly && L.jackpots) {
      const i = jcfg.tiers.findIndex((x) => x.id === p.jackpot.tier);
      const b = L.jackpots[i];
      if (b) {
        const to = L.hud ? [L.hud.x + L.hud.w / 2, L.hud.y + L.hud.h / 2] : [L.cx, L.frame.y + L.frame.h];
        out.jackpot = { box: i, at: r4(p.jackpot.at), fly: p.jackpot.fly.map(r4), from: [r4(b.x), r4(b.y)], to: to.map(r4), lift: r4(L.cellH * 0.5), text: clean(formatPrize(p.jackpot.amount, cur, dec)), size: Math.round(L.cellH * 0.26) };
      }
    }
    if (p.grand) out.grand = { start: r4(p.grand.start), end: r4(p.grand.end), countEnd: r4(p.grand.countEnd), keys: exportKeys(p.grand.keys), amount: p.grand.amount };
    // A Major jackpot's full-screen moment, built like the Grand's.
    if (p.jpShows) {
      out.jpShows = p.jpShows.map((sh) => {
        const ti = jcfg.tiers.findIndex((x) => x.id === sh.tier);
        return { title: `jp_${sh.tier}`, name: clean(jcfg.tiers[ti]?.label || sh.tier), color: rgb(COIN_GLOW[jcfg.tiers[ti]?.palette] || COIN_GLOW.fire), start: r4(sh.start), end: r4(sh.end), countEnd: r4(sh.countEnd), keys: exportKeys(sh.keys), amount: sh.amount };
      });
    }
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
  const lastR = tl.rounds[tl.rounds.length - 1];
  const hideWindows = tl.mode === 'cascade' ? [] : tl.rounds.filter((R) => R.actorsFrom != null).map((R) => [r4(R.actorsFrom), r4(R === lastR ? tl.duration : R.next)]);
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
  // Counters are built at twice their largest use (a big win's amount as it
  // slams), so they stay sharp scaled up in After Effects.
  const titlePx = extras.titlePx || Math.round(Math.min(L.W * 0.11, L.H * 0.16));
  const odoSize = Math.max(120, Math.round(titlePx * 0.9 * AE_HD));
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
    reelXs: Array.from({ length: tl.reels }, (_, c) => cellX(c)),
    tease: { keepLit: keepLit ? 1 : 0, dim: TEASE_DIM, pop: LAND_POP, fade: LAND_FADE, lead: TEASE_LEAD, fin: TEASE_IN, tail: TEASE_TAIL },
    rowsTop: r4(L.rowsTop),
    reelX: L.reelX,
    logo: [r4(L.logo.cx), r4(L.logo.cy)],
    // The machine's middle (off the screen's with boxes on one side).
    machineX: r4(L.cx),
    ribbon: [r4(L.cx), r4(L.ribbonY)],
    pots:
      L.pots && tl.pots
        ? {
            items: L.pots.map((pt, i) => ({
              name: clean(pcfg.items[i].name) || `Pot ${i + 1}`,
              file: AE_ASSETS.shared.pot(i),
              x: r4(pt.x),
              bottom: r4(pt.bottom),
              size: r4(pt.size),
              mouth: [r4(pt.mouth.x), r4(pt.mouth.y)],
              plate: [r4(pt.plate.x), r4(pt.plate.y), r4(pt.plate.w), r4(pt.plate.h)],
              color: potColor(i),
              keys: exportKeys(tl.pots.valueKeys[i]),
              max: r4(Math.max(0, ...tl.pots.valueKeys[i].map((k) => k.v))),
            })),
            hits: tl.pots.hits.map(([t, p, k]) => [r4(t), p, k]),
            charges: tl.pots.charges.map(([a, b, p]) => [r4(a), r4(b), p]),
            show: tl.pots.show.map(([a, b, p]) => [r4(a), r4(b), p]),
            plates: pcfg.plates ? 1 : 0,
            box: POT_BOX.bottom,
            times: [POT_CATCH, POT_FIRE],
          }
        : null,
    jackpots,
    // Beams: their passes (width in px, opacity, white core) and timing.
    beam: { passes: BEAM_PASSES.map(([w, a, core]) => [r4(w * pcfg.beam.width * L.cellW), a, core]), hold: BEAM_HOLD, fade: BEAM_FADE, head: r4(pcfg.beam.width * L.cellW * 0.75) },
    boostT: [BOOST.lead, BOOST.pop],
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
    // Each entry: [t0, spin index, total?, spins from then on (a retrigger) or 0].
    fsBlocks: tl.fsBlocks.map((b) => [r4(b.start), r4(Math.min(b.end, tl.duration)), b.n, b.rounds.map((r) => [r4(r.t0), r.index == null ? -1 : r.index, r.total ? 1 : 0, r.n || 0])]),
    // Sticky and walking wilds: a walker hops in from `walk`; one that walks
    // off the grid (`exit`) fades and cuts nothing out of the reels.
    stickies: tl.stickies.map((s) => ({
      c: s.c,
      r: s.r,
      x: cellX(s.c),
      y: cellY(s.r),
      from: r4(s.from),
      cover: s.exit ? -1 : r4(s.cover ?? s.from + STICKY_COVER),
      to: r4(Math.min(s.to, tl.duration)),
      walk: s.walkIn ? [cellX(s.walkIn[0]), cellY(s.walkIn[1])] : null,
      exit: s.exit ? 1 : 0,
      // Fades out when the free spins end; a multiplier wild's x shows
      // through the spin it landed in.
      fade: s.fade && s.to < tl.duration ? 1 : 0,
      lab: s.value != null ? label(Math.max(0, project.symbols.findIndex((x) => x.role === 'wild')), s.value) : null,
      labUntil: s.value != null ? r4(Math.min(s.valueUntil ?? s.to, s.to, tl.duration)) : 0,
    })),
    walk: { dur: WILD_WALK, hop: r4(WALK_HOP * L.cellH) },
    // Mystery cards turning over: their cells are cut out of the reels.
    reveals: (tl.reveals || []).map((v) => ({ c: v.c, r: v.r, cover: r4(v.cover ?? v.from), to: r4(v.to) })),
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
    titlePx,
    // Titles, the logo and particles are painted at hd times the size they
    // show; their uses are scaled down by it. The rays are vector shapes,
    // drawn hd times as big as their biggest use.
    hd: AE_HD,
    titleTexts: Object.fromEntries(Object.entries(extras.titleTexts || {}).map(([k, v]) => [k, clean(v)])),
    logoText: extras.logoText ? { text: clean(extras.logoText.text), px: r4(extras.logoText.px) } : null,
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

// The files the script imports for one format's data: the package ships
// these and nothing else. It follows the script's own conditions (the
// tests run the script and check both lists match).
export function aeAssetFiles(data) {
  const A = data.assets;
  const out = new Set();
  const add = (p) => p && out.add(p);
  add(A.background);
  add(A.vignette);
  if (data.game !== 'wheel') {
    add(A.back);
    add(A.front);
    if (A.bulbsA && A.bulbsB) [A.bulbsA, A.bulbsB].forEach(add);
    add(A.logo);
    if (data.hud) add(A.hud);
    for (const s of data.symbols) {
      add(s.file);
      s.win?.frames.forEach(add);
    }
    data.pots?.items.forEach((p) => add(p.file));
    data.jackpots?.items.forEach((j) => add(j.file));
  }
  const title = (k) => add(A.titles[k]);
  let wheel = false;
  for (const R of data.rounds) {
    R.overlay?.tiers.forEach(title);
    if (R.grand) title('grand');
    (R.jpShows || []).forEach((sh) => title(sh.title));
    if (R.banner) title(R.banner.kind);
    if (R.nearmiss) title('nearmiss');
    if (R.wheel) {
      title('wheel');
      wheel = true;
    }
  }
  if (wheel) {
    [A.wheelFace, A.wheelSegments, A.wheelHub, A.wheelCenter, A.wheelRing, A.wheelBulbsA, A.wheelBulbsB, A.wheelPointer].forEach(add);
    data.wheel.icons.forEach((ic) => add(ic.file));
  }
  data.particles.assets.forEach((a) => a.files.forEach(add));
  data.sfx?.clips.forEach(add);
  return out;
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

// The script is plain ASCII: every other character is a \\u escape, so it
// reads the same whatever encoding After Effects assumes (Mac or Windows,
// with or without a byte order mark).
export function buildAEScript(dataList) {
  const list = Array.isArray(dataList) ? dataList : [dataList];
  const json = JSON.stringify(list);
  return AE_SCRIPT.replace('__DATA__', () => json).replace(/[^\x00-\x7f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
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
  var PH, FOLD, RBASE, FONTS = null, missingFonts = [];
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
    textExpr(L);
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
  // ---------- fonts ----------
  // The "Fonts" comp holds one text layer per font: "Main Font" (every
  // text, counter and title twin) and "Wheel Font" (the wheel labels).
  // Each text layer reads its font from there by expression (After Effects
  // 2020 and later), so changing the font of one layer changes them all.
  function fontMissing(name) {
    try {
      if (app.fonts && app.fonts.getFontsByPostScriptName) {
        var a = app.fonts.getFontsByPostScriptName(name);
        return !a || !a.length;
      }
    } catch (e) {}
    return false;
  }
  function fontLayer(c, role, font, sample, y) {
    var L = c.layers.addText(sample);
    L.name = role;
    var prop = L.property("ADBE Text Properties").property("ADBE Text Document");
    var td = prop.value;
    td.fontSize = 120;
    td.applyFill = true;
    td.fillColor = [1, 0.86, 0.4];
    td.justification = ParagraphJustification.CENTER_JUSTIFY;
    try { td.font = font; } catch (e) { try { td.font = "Arial-BoldMT"; } catch (e2) {} }
    prop.setValue(td);
    pos(L, [c.width / 2, y]);
    if (fontMissing(font)) missingFonts.push(font);
    return L;
  }
  function buildFonts() {
    var D0 = DATA_LIST[0], wheel = false, f, r;
    // A Wheel Font only when a wheel with labels shows.
    for (f = 0; f < DATA_LIST.length; f++) {
      var Df = DATA_LIST[f], shows = Df.game === "wheel";
      for (r = 0; r < Df.rounds.length; r++) if (Df.rounds[r].wheel) shows = true;
      if (shows && Df.wheel && Df.wheel.labels.length) wheel = true;
    }
    FONTS = proj.items.addComp(uniqueName("Fonts"), 1600, wheel ? 440 : 260, 1, 10, D0.fps);
    FONTS.parentFolder = fShared;
    FONTS.comment = "Pick a font for a layer here (Character panel): every text layer that uses it follows. Main Font: all text, counters and the editable title twins. Wheel Font: the wheel labels.";
    fontLayer(FONTS, "Main Font", D0.font, "BIG WIN 0123456789", 175);
    if (wheel) fontLayer(FONTS, "Wheel Font", D0.wheel.font, "SPIN AGAIN 500", 355);
  }
  // A text layer's Source Text: its words (an expression value, or the
  // text it was made with) in the font of its Fonts layer. Older After
  // Effects versions skip the font and keep the words.
  function textExpr(L, pre, val, role) {
    var f = "comp(\"" + FONTS.name + "\").layer(\"" + (role || "Main Font") + "\").text.sourceText.style.font";
    L.property("ADBE Text Properties").property("ADBE Text Document").expression = val === undefined ?
      "try { text.sourceText.style.setFont(" + f + "); } catch (err) { value; }" :
      (pre || "") + "var txt_ = " + val + ";\ntry { text.sourceText.style.setFont(" + f + ").setText(txt_); } catch (err) { txt_; }";
  }
  function fmtExpr() {
    return "function fmt(v){var d=" + DATA.decimals + ";var s=Math.max(0,v).toFixed(d);var parts=s.split('.');var i=parts[0];var out='';" +
      "while(i.length>3){out=','+i.substr(i.length-3)+out;i=i.substr(0,i.length-3);}return '" + DATA.currency + "'+i+out+(d>0?'.'+parts[1]:'');}\n";
  }
  function windowsExpr(name, list) {
    var s = "var " + name + " = [", i;
    for (i = 0; i < list.length; i++) s += (i ? "," : "") + "[" + list[i][0] + "," + list[i][1] + "]";
    return s + "];\n";
  }
  function rowsExpr(name, list) {
    var s = "var " + name + " = [", i;
    for (i = 0; i < list.length; i++) s += (i ? "," : "") + "[" + list[i].join(",") + "]";
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
  // A placeholder holding one image at its own size (missing file: none),
  // with effect controls and anything more (extra) when given.
  function imagePH(key, sub, rel, controls, extra) {
    if (PH.hasOwnProperty(key)) return PH[key];
    var it = imp(rel);
    if (!it) { PH[key] = null; return null; }
    return ph(key, sub, it.width, it.height, DUR + 2, function (c) {
      var L = c.layers.add(it);
      L.name = key;
      pos(L, [c.width / 2, c.height / 2]);
      if (extra) extra(c);
      if (controls) fxControls(c, controls);
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
  // ---------- effect controls ----------
  // Every effect placeholder holds an "FX CONTROLS" null: its sliders and
  // switches drive every use of that effect (size, opacity, colour, speed,
  // and whether the uses move by themselves). Replace the art inside with a
  // prerendered movie, or swap the whole comp, and every use plays it from
  // its start.
  var FX_STD = [["Size %", 100], ["Opacity %", 100], ["Colour", true]];
  var FX_RAYS = [["Size %", 100], ["Opacity %", 100], ["Spin %", 100], ["Built-in Motion", true]];
  var FX_RING = [["Size %", 100], ["Opacity %", 100], ["Colour", true], ["Speed %", 100]];
  var FX_TITLE = [["Size %", 100], ["Built-in Motion", true], ["Light Sweep", true]];
  function fxControls(c, list) {
    var n = c.layers.addNull(c.duration), i;
    n.name = "FX CONTROLS";
    for (i = 0; i < list.length; i++) {
      if (list[i][1] === true) fx(n, "ADBE Checkbox Control", list[i][0]).property(1).setValue(1);
      else slider(n, list[i][0]).setValue(list[i][1]);
    }
    return n;
  }
  // A use reads the controls of whatever comp it shows (its source), so a
  // placeholder can be swapped for any comp: one without FX CONTROLS gets
  // the defaults (100%, on). fxc is that lookup inside an expression.
  var FXC_FN = "function fxc(n, d) { try { return thisLayer.source.layer(\"FX CONTROLS\").effect(n)(1).value; } catch (err) { return d; } }\n";
  function fxc(name, def) { return "fxc(\"" + name + "\", " + def + ")"; }
  // A use's opacity and scale times its placeholder's Opacity % and Size %:
  // e is the value (an expression after the statements in pre), or the
  // layer's own keyframes or value.
  function fxOpacity(L, pre, e) {
    if (!L) return;
    P(L, "ADBE Opacity").expression = FXC_FN + (pre || "") + "(" + (e || "value") + ") * " + fxc("Opacity %", 100) + " / 100;";
  }
  function fxScale(L, pre, e) {
    if (!L) return;
    P(L, "ADBE Scale").expression = FXC_FN + (pre || "") + "var sv_ = " + (e || "value") + "; var sk_ = " + fxc("Size %", 100) + " / 100; [sv_[0] * sk_, sv_[1] * sk_];";
  }
  // Whether a use moves by itself (rays spin, titles spring): off for a
  // prerendered movie that brings its own motion.
  function fxMotion() {
    return fxc("Built-in Motion", 1);
  }
  // Effect placeholders are white; each use is tinted to its colour. Untick
  // "Colour" in an effect's FX CONTROLS (or "FX Colour" on SLOT CONTROL for
  // all of them) to keep your own art's colours.
  function tint(L, rgbv) {
    try {
      var t = fx(L, "ADBE Tint", "Colour");
      try { t.property("ADBE Tint-0002").setValue(rgbv); } catch (e1) { t.property("Map White To").setValue(rgbv); }
      try { t.property("ADBE Tint-0003").expression = FXC_FN + "(" + ctrl("FX Colour") + ".value && " + fxc("Colour", 1) + ") ? value : 0;"; } catch (e2) {}
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
        try { wl.collapseTransformation = true; } catch (eC) {}
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
      textExpr(T, head + V + jE2 + "var e = V[j];\n", "e ? e[0] : ''");
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
  function holdCellMask(layers, st, i, kind) {
    var j;
    for (j = 0; j < layers.length; j++) {
      var Ly = layers[j], y0;
      if (Ly.name === "Reel " + (st.c + 1) || Ly.name === "Tumble " + (st.c + 1)) y0 = DATA.rowsTop - DATA.winTop + st.r * DATA.cellH;
      else if (Ly.name === "Cell " + (st.c + 1) + "-" + (st.r + 1)) y0 = 0;
      else continue;
      var mk = Ly.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
      mk.name = (kind || "Sticky") + " " + (i + 1);
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
  // It is drawn as big as its largest use (a full-screen win), so no use
  // scales it up. Uses last SHOCK_LEN, so a prerendered shockwave movie up
  // to that long plays in full.
  var RING_R = 250, SHOCK_LEN = 4;
  function ring(comp, xy, t, maxR, rgbv) {
    RING_R = Math.max(250, Math.round(H * 0.8));
    var src = ph("FX Shockwave", "Effects", RING_R * 2.56, RING_R * 2.56, SHOCK_LEN, function (c) {
      var m = c.width / 2, k = RING_R / 250;
      var L = shapeLayer(c, "Ring");
      var g = group(L);
      ellipse(g, [m, m], [RING_R * 2, RING_R * 2]);
      stroke(g, [1, 1, 1], 14 * k);
      P(L, "ADBE Anchor Point").setValue([m, m]);
      pos(L, [m, m]);
      var sp = "var sp = 1; try { sp = thisComp.layer(\"FX CONTROLS\").effect(\"Speed %\")(1).value / 100; } catch (err) {}\n";
      P(L, "ADBE Scale").expression = EASE_LIB + sp + "var a = c01(time * sp / 0.7); var s = 100 * (1 - Math.pow(1 - a, 3)); [s, s];";
      P(L, "ADBE Opacity").expression = sp + "var a = time * sp / 0.7; a > 1 ? 0 : 100 * Math.pow(1 - a, 1.5);";
      glow(L, 26 * k, 1);
      fxControls(c, FX_RING);
    });
    var L = inst(comp, src, "Shockwave", xy, t, Math.min(comp.duration, Math.max(0, t) + SHOCK_LEN));
    var s = r4(100 * maxR / RING_R);
    P(L, "ADBE Scale").setValue([s, s]);
    fxScale(L);
    fxOpacity(L);
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
      fxControls(c, FX_STD);
    });
  }
  // A use of a frame placeholder; its size and opacity follow FX CONTROLS
  // (a caller animating them goes through fxScale and fxOpacity).
  function frameAt(comp, key, w, h, o, name, xy, a, b) {
    var L = inst(comp, framePH(key, w, h, o), name, xy, a, b);
    fxScale(L);
    fxOpacity(L);
    return L;
  }
  function darkLayer(comp, a, b, peak) {
    var L = solid(comp, [0, 0, 0], "Darken", W * 1.2, H * 1.2, [W / 2, H / 2]);
    fadeKeys(L, a, b, 0.45, 0.6, peak);
    P(L, "ADBE Opacity").expression = "value * " + ctrl("Dim %") + " / 100;";
    return L;
  }
  // A circle as a mask or path shape.
  function circle(cx, cy, R) {
    var s = new Shape(), t = R * 0.5523;
    s.vertices = [[cx + R, cy], [cx, cy + R], [cx - R, cy], [cx, cy - R]];
    s.inTangents = [[0, -t], [t, 0], [0, t], [-t, 0]];
    s.outTangents = [[0, t], [-t, 0], [0, -t], [t, 0]];
    s.closed = true;
    return s;
  }
  // Light rays: wedges of light fading out from the middle. A shape layer,
  // so nothing ships and it stays sharp: the comp is hd times as big as the
  // biggest use (a full-screen win's rays, or the merge and scatter rays for
  // the small ones). A feathered mask does the fade; recolour the fill.
  function raysPH(small) {
    var key = small ? "FX Small Rays" : "FX Light Rays";
    if (PH.hasOwnProperty(key)) return PH[key];
    var S = small ? DATA.cellW * 6 : Math.max(H * 1.8, DATA.wheel ? DATA.wheel.R * 3.4 : 0);
    S = Math.min(16000, Math.max(256, Math.round(S * DATA.hd)));
    var n = small ? 12 : 18;
    return ph(key, "Effects", S, S, DUR + 2, function (c) {
      var r = S / 2, i, k;
      var L = shapeLayer(c, "Rays");
      var g = group(L);
      for (i = 0; i < n; i++) {
        var a = i / n * Math.PI * 2, w = Math.PI / n * (i % 2 ? 0.45 : 0.75), pts = [[r, r]];
        for (k = 0; k <= 4; k++) {
          var b = a - w + 2 * w * k / 4;
          pts.push([r + Math.cos(b) * r, r + Math.sin(b) * r]);
        }
        path(g, pts, true);
      }
      fill(g, small ? [1, 0.94, 0.78] : [1, 0.86, 0.55], 100);
      var m = L.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
      m.name = "Fade";
      m.property("ADBE Mask Shape").setValue(circle(r, r, r * 0.45));
      m.property("ADBE Mask Feather").setValue([r * 0.9, r * 0.9]);
      P(L, "ADBE Opacity").setValue(small ? 80 : 75);
      fxControls(c, FX_RAYS);
    });
  }
  // Rays spinning at speed (degrees a second), times the placeholder's Spin %.
  function spin(L, speed, add) {
    P(L, "ADBE Rotate Z").expression = FXC_FN + fxMotion() + " ? time * " + speed + " * " + fxc("Spin %", 100) + " / 100" + (add ? " + " + add : "") + " : " + (add || 0) + ";";
  }
  // Light rays diam pixels across, popping in at a and fading out by b.
  function rays(comp, xy, a, b, diam, speed, alpha) {
    var L = inst(comp, raysPH(false), "Light Rays", xy, a, b);
    if (!L) return null;
    var sc = r4(100 * diam / L.source.width);
    L.blendingMode = BlendingMode.ADD;
    spin(L, speed);
    fxScale(L, EASE_LIB + "var k = " + fxMotion() + " ? outBack(c01((time - " + a + ") / 0.45)) : 1;\n", "[" + sc + " * k, " + sc + " * k]");
    fadeKeys(L, a, b, 0.45, 0.6, alpha);
    fxOpacity(L);
    return L;
  }
  // Title placeholders hold the title art (painted hd times larger than it
  // shows) with its light sweep, and the words as a text layer in the Main
  // Font, switched off: turn it on (and the art off) to change the words or
  // the font. Each use springs in and breathes.
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
        try { sw.property("Width").setValue(Math.round(DATA.titlePx * 0.45 * DATA.hd)); } catch (e2) {}
        try { sw.property("Sweep Intensity").setValue(70); } catch (e3) {}
        try { sw.property("Sweep Intensity").expression = "var on = 1; try { on = thisComp.layer(\"FX CONTROLS\").effect(\"Light Sweep\")(1).value; } catch (err) {}\non ? value : 0;"; } catch (e5) {}
      } catch (e4) {}
      var tw = text(c, "Text (editable)", DATA.titleTexts[key] || key.toUpperCase(), Math.round(it.height / 1.75), [c.width / 2, c.height / 2], [1, 0.86, 0.4]);
      glow(tw, Math.round(it.height * 0.12), 1);
      tw.enabled = false;
      fxControls(c, FX_TITLE);
    });
  }
  function titleLayer(comp, key, xy, a, b, maxW) {
    var src = titlePH(key);
    var L = inst(comp, src, "Title " + key, xy, a, b);
    if (!L) return null;
    var shown = src.width / DATA.hd;
    var fit = r4((maxW && shown > maxW ? maxW / shown : 1) * 100 / DATA.hd);
    fxScale(L, EASE_LIB + "var a = time - inPoint; var s = " + fxMotion() + " ? (" + r4(fit * 0.15) + " + " + r4(fit * 0.85) + " * outElastic(c01(a / 0.8))) * (1 + 0.025 * Math.sin(time * 5)) : " + fit + ";\n", "[s, s]");
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
    textExpr(tx, fmtExpr() + "var v = thisComp.layer(\"" + cn + "\").effect(\"Amount\")(1).value;\n", "v > 0.0001 ? fmt(v) : ''");
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
          spin(rr, 69, i * 40);
          var rs = r4(100 * DATA.cellW * 2.1 / rr.source.width);
          P(rr, "ADBE Scale").setValue([rs, rs]);
          fxScale(rr);
          fadeKeys(rr, a, b, 0.2, 0.3, 75);
          fxOpacity(rr);
        }
      }
      var wl = winLayer(comp, cl.s, [cl.x, cl.y], a + i * 0.05, b);
      if (cl.lab) valueOn(comp, wl, cl, a + i * 0.05, b);
      if (withFrames && cl.color) cellFrame(comp, cl.x, cl.y, cl.color, a, b);
    }
  }
  // A value (a multiplier wild's x) riding on a win layer.
  function valueOn(comp, parent, cl, a, b) {
    var lsz = Math.round(DATA.cellH * 0.3);
    var T = text(comp, "Value " + cl.lab[0], cl.lab[0], lsz, [0, 0], [1, 0.62, 0.15]);
    pos(T, [cl.x, cl.y + cl.lab[1] * DATA.cellH + lsz * 0.36 * cl.lab[2]]);
    P(T, "ADBE Scale").setValue([cl.lab[2] * 100, cl.lab[2] * 100]);
    T.parent = parent;
    trim(T, a, b);
    return T;
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
      spin(rr, 52);
      fxScale(rr, EASE_LIB + "var a = c01((time - " + M + ") / 0.6); var s = " + r4(100 * DATA.cellW * F.big * 1.7 / rr.source.width) + " * (" + fxMotion() + " ? outElastic(a) : 1);\n", "[s, s]");
      fadeKeys(rr, M, lb, 0.05, 0.3, 70);
      fxOpacity(rr);
    }
    var big = winLayer(comp, F.sym, F.goal, M, lb, "Merged " + DATA.symbols[F.sym].name);
    // Scaled up: drawn from the symbol art itself, not the cell-sized comp.
    try { big.collapseTransformation = true; } catch (eC) {}
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
    // What each pot above the machine has caught (its nameplate).
    if (DATA.pots) for (k = 0; k < DATA.pots.items.length; k++) setKeys(slider(slotCtrl, "Pot " + (k + 1)), DATA.pots.items[k].keys);
    // What each jackpot box shows (its value text reads it).
    if (DATA.jackpots) for (k = 0; k < DATA.jackpots.items.length; k++) slider(slotCtrl, DATA.jackpots.items[k].name).expression = jpValueExpr(DATA.jackpots.items[k]);
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
    buildPots(kids);
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
      var stEnd = st.to + (st.fade ? 0.3 : 0);
      var SL = inst(main, symComps[DATA.wildSym], (st.walk ? "Walking Wild " : "Sticky Wild ") + (i + 1), [st.x, st.y], st.from, stEnd);
      var SF = frameAt(main, "FX Sticky Frame", DATA.cellW * 0.96, DATA.cellH * 0.96, { stroke: 0.035, round: 0.12, glow: 0.15, color: [1, 0.82, 0.35] }, "Sticky Frame " + (i + 1), [st.x, st.y], st.from, stEnd);
      if (st.fade) {
        var fo = "Math.max(0, Math.min(1, 1 - (time - " + st.to + ") / 0.3)) * 100";
        P(SL, "ADBE Opacity").expression = fo + ";";
        fxOpacity(SF, "", fo);
      }
      if (st.lab) valueOn(main, SL, st, st.from, st.labUntil);
      if (st.walk) {
        // A walking wild hops in from the reel it left (core/timeline.js walkStep).
        var step = "var x = Math.min(1, Math.max(0, (time - " + st.from + ") / " + DATA.walk.dur + ")); var u = x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; var hop = Math.sin(u * Math.PI);\n";
        var wpos = step + "[" + st.walk[0] + " + (" + (st.x - st.walk[0]) + ") * u, " + st.walk[1] + " + (" + (st.y - st.walk[1]) + ") * u - hop * " + DATA.walk.hop + "];";
        P(SL, "ADBE Position").expression = wpos;
        P(SF, "ADBE Position").expression = wpos;
        P(SL, "ADBE Scale").expression = step + "var s = 100 * (1 + 0.08 * hop); [s, s];";
        if (st.exit) {
          P(SL, "ADBE Opacity").expression = step + "100 * (1 - u);";
          fxOpacity(SF, step, "100 * (1 - u)");
        }
      } else P(SL, "ADBE Scale").expression = EASE_LIB + "var s = 100 * outBack(c01((time - " + st.from + ") / 0.4)); [s, s];";
      kids.push(SL);
      kids.push(SF);
      if (reels && st.cover >= 0) holdCellMask(reels, st, i);
    }
    for (i = 0; i < DATA.reveals.length; i++) if (reels) holdCellMask(reels, DATA.reveals[i], i, "Reveal");
    buildTease(kids);
    // Hold & Spin: a glowing frame on every locked coin while the board shows.
    if (DATA.hold) {
      for (i = 0; i < DATA.hold.locks.length; i++) {
        var lk = DATA.hold.locks[i];
        var LF = frameAt(main, lk.special ? "FX Special Coin Lock" : "FX Coin Lock", DATA.cellW * 0.96, DATA.cellH * 0.96, { stroke: lk.special ? 0.04 : 0.028, round: 0.12, glow: lk.special ? 0.25 : 0.14 }, "Coin Lock " + (i + 1), [lk.x, lk.y], lk.from, lk.to);
        tint(LF, lk.color);
        fxOpacity(LF, holdAlphaExpr() + "var f = Math.min(1, Math.max(0, (time - " + lk.from + ") / 0.15));\n" +
          (lk.done !== null ? "var d = time > " + lk.done + " ? 0.35 : 1;\n" : "var d = 1;\n"), "a * f * d * 100");
        kids.push(LF);
      }
    }
    // The logo is painted hd times larger; a painted name also comes as an
    // editable text layer in the Main Font (off) in its placeholder.
    var LT = DATA.logoText;
    var logo = inst(main, imagePH("Logo", "Machine", DATA.assets.logo, null, LT ? function (c) {
      var tw = text(c, "Text (editable)", LT.text, Math.round(LT.px * DATA.hd), [c.width / 2, c.height / 2], [1, 0.86, 0.4]);
      tw.enabled = false;
    } : null), "Logo", DATA.logo);
    if (logo) {
      kids.push(logo);
      P(logo, "ADBE Scale").expression = "var s = " + r4(100 / DATA.hd) + " * (1 + 0.012 * Math.sin(time * 1.6)); [s, s];";
    }
    var fsData = "var B = [";
    for (i = 0; i < DATA.fsBlocks.length; i++) {
      var b = DATA.fsBlocks[i], q, rs = "[";
      for (q = 0; q < b[3].length; q++) rs += (q ? "," : "") + "[" + b[3][q].join(",") + "]";
      fsData += (i ? "," : "") + "[" + b[0] + "," + b[1] + "," + b[2] + "," + rs + "]]";
    }
    fsData += "];\nvar cur = null; for (var i = 0; i < B.length; i++) if (time >= B[i][0] && time < B[i][1]) cur = B[i];\n" +
      "var idx = 0, nn = cur ? cur[2] : 0, done = false; if (cur) for (var k = 0; k < cur[3].length; k++) if (cur[3][k][0] <= time) { if (cur[3][k][2]) done = true; else idx = cur[3][k][1]; if (cur[3][k][3]) nn = cur[3][k][3]; }\n";
    if (DATA.fsBlocks.length) {
      var rib = text(main, "Free Spins Ribbon", "FREE SPINS", Math.round(H * 0.035), DATA.ribbon, [0.6, 0.95, 1]);
      textExpr(rib, fsData, "cur ? (done ? 'FREE SPINS COMPLETE' : 'FREE SPIN ' + Math.max(1, idx) + ' OF ' + Math.max(nn, idx)) : ''");
      kids.push(rib);
    }
    // Hold & Spin: the respins counter on the frame's top edge; the coins'
    // running total takes its place while they are collected.
    if (DATA.hold) {
      var hb = DATA.hold;
      var PL = inst(main, plaquePH("Hold Plaque", DATA.cellW * 2.8, H * 0.065, H * 0.02, 96, [0.91, 0.73, 0.29], Math.max(2, H * 0.004)), "Hold Plaque", [DATA.machineX, hb.barY]);
      P(PL, "ADBE Opacity").expression = holdAlphaExpr() + "a * 100;";
      kids.push(PL);
      var CT = text(main, "Respins Counter", "3 RESPINS LEFT", Math.round(H * 0.03), [DATA.machineX, hb.barY], [0.6, 0.95, 1]);
      textExpr(CT, holdCounterExpr(), "n == 1 ? 'LAST RESPIN' : (n == 0 ? 'NO RESPINS LEFT' : n + ' RESPINS LEFT')");
      P(CT, "ADBE Opacity").expression = holdAlphaExpr() + holdCollectExpr() + "col ? 0 : a * 100;";
      kids.push(CT);
      var maxC = 0;
      for (i = 0; i < hb.collectKeys.length; i++) maxC = Math.max(maxC, hb.collectKeys[i].v);
      if (maxC > 0) {
        var CO = rollCounter(main, "Collect", ctrl("Collect") + ".valueAtTime(time)", maxC, Math.round(H * 0.039), [DATA.machineX, hb.barY]);
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
        textExpr(hcl, holdAlphaExpr() + lks, "a > 0.5 ? 'COINS ' + nc + '/' + " + DATA.hold.cells + " : ''");
        var hcr = text(main, "Hold Respins", "RESPINS", DATA.hud.label, DATA.hud.right, DATA.accent, false);
        textExpr(hcr, holdAlphaExpr() + holdCounterExpr(), "a > 0.5 ? 'RESPINS ' + n : ''");
        kids.push(hcl);
        kids.push(hcr);
      }
      if (DATA.fsBlocks.length) {
        var fsl = text(main, "Free Spins Counter", "FREE SPINS", DATA.hud.label, DATA.hud.left, DATA.accent, false);
        textExpr(fsl, fsData, "cur ? (done ? 'FREE SPINS DONE' : 'FREE SPINS ' + idx + '/' + Math.max(nn, idx)) : ''");
        var fst = text(main, "Free Spins Total", "TOTAL", DATA.hud.label, DATA.hud.right, DATA.accent, false);
        textExpr(fst, fmtExpr() + fsData, "cur ? 'TOTAL ' + fmt(thisComp.layer(\"SLOT CONTROL\").effect(\"FS Total\")(1).value) : ''");
        kids.push(fsl);
        kids.push(fst);
      }
      var maxMeter = 0;
      for (i = 0; i < DATA.meterKeys.length; i++) maxMeter = Math.max(maxMeter, DATA.meterKeys[i].v);
      var mo = rollCounter(main, "Win Meter", ctrl("Meter") + ".valueAtTime(time)", maxMeter, DATA.hud.size, [DATA.hud.x, DATA.hud.y]);
      P(mo, "ADBE Opacity").expression = "thisComp.layer(\"SLOT CONTROL\").effect(\"Meter\")(1).value > 0.0001 ? 100 : 0;";
      kids.push(mo);
    }
    buildJackpots(kids);
    buildPotsOver(kids);
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
    var hasFx = R.steps.length || R.overlay || R.banner || R.wheel || R.celebrate || R.nearmiss || R.expand || R.mult || R.mystery || R.collector || R.pops.length || hs || R.collect || R.grand || R.particles.length || R.boost || R.beams || R.jackpot || R.jpShows;
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
    if (R.boost) buildBoost(comp, R, rel);
    if (R.mystery) buildMystery(comp, R, rel);
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
      if (st.fx && st.fx.style !== "collect") flyCells(comp, st, la, lb, rel);
      else popCells(comp, st.cells, la, lb, false, true);
      if (st.fx && st.fx.style === "collect") drainCells(comp, st, rel);
      if (st.amount > 0) {
        var cx = 0, cy = 0;
        for (k = 0; k < st.cells.length; k++) { cx += st.cells[k].x; cy += st.cells[k].y; }
        cx /= st.cells.length;
        cy /= st.cells.length;
        if (st.lines.length) { cx = winC[0]; cy = winC[1] - DATA.cellH * 0.15; }
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
    if (R.collector) buildCollector(comp, R, rel);
    if (R.beams) buildBeams(comp, R, rel);
    if (R.celebrate) popCells(comp, R.scatters, rel(R.celebrate.start), rel(R.celebrate.end) + 0.4, true, false);
    if (R.nearmiss) {
      popCells(comp, R.scatters, rel(R.nearmiss.start), rel(R.nearmiss.end), false, false);
      if (R.nearMiss) {
        var nmL = frameAt(comp, "FX Near Miss", DATA.cellW, DATA.winH, { stroke: 0.035, round: 0.06, glow: 0.2, glowI: 1.4, color: [1, 0.31, 0.43] }, "Near Miss Reel", [R.nearMiss.x, winC[1]], rel(R.nearmiss.start), rel(R.nearmiss.end));
        fxOpacity(nmL, "", "60 + 40 * Math.sin(time * 16)");
      }
      var nt = titleLayer(comp, "nearmiss", winC, rel(R.nearmiss.start), rel(R.nearmiss.end), W * 0.9);
      if (nt) fadeKeys(nt, rel(R.nearmiss.start), rel(R.nearmiss.end), 0.2, 0.35);
    }
    if (hs) buildRespin(comp, R, rel);
    if (R.collect) buildCollect(comp, R, rel);
    if (R.grand) buildGrand(comp, R, rel);
    if (R.jpShows) buildJackpotShows(comp, R, rel);
    if (R.jackpot && DATA.jackpots) buildJackpotFly(comp, R, rel);
    if (R.overlay) buildBigWin(comp, R, rel);
    if (R.banner) buildBanner(comp, R, rel);
    if (R.wheel) buildWheel(comp, R, rel);
    emitters(comp, R, "over");
    var L = main.layers.add(comp);
    L.startTime = P0;
    L.name = RBASE;
    return L;
  }

  // ---------- pots above the machine (core/pots.js) ----------
  // Pot i's reactions at time: b = squash or kick, bc = squash from catches
  // only, fl = flash, ch = charge (core/pots.js potBump, potCharge).
  function potExpr(i) {
    var Pd = DATA.pots, k, n1 = 0, n2 = 0, h = "var PH = [", c = "var PC = [";
    for (k = 0; k < Pd.hits.length; k++) if (Pd.hits[k][1] === i) h += (n1++ ? "," : "") + "[" + Pd.hits[k][0] + "," + Pd.hits[k][2] + "]";
    for (k = 0; k < Pd.charges.length; k++) if (Pd.charges[k][2] === i) c += (n2++ ? "," : "") + "[" + Pd.charges[k][0] + "," + Pd.charges[k][1] + "]";
    return h + "];\n" + c + "];\n" +
      "function c01(x){return x<0?0:(x>1?1:x);}\n" +
      "var b = 0, bc = 0, fl = 0, ch = 0;\n" +
      "for (var i = 0; i < PH.length; i++) { var a = time - PH[i][0]; if (a < 0) continue; var d = PH[i][1] ? " + Pd.times[1] + " : " + Pd.times[0] + ";\n" +
      "  if (a < d) { var bb = (PH[i][1] ? 0.55 : 1) * Math.pow(1 - a / d, 2); b = Math.max(b, bb); if (!PH[i][1]) bc = Math.max(bc, bb); }\n" +
      "  if (a < 0.4) fl = Math.max(fl, (PH[i][1] ? 0.7 : 1) * (1 - a / 0.4)); }\n" +
      "for (var j = 0; j < PC.length; j++) { if (time < PC[j][0] || time > PC[j][1] + 0.3) continue; ch = Math.max(ch, Math.min(c01((time - PC[j][0]) / 0.25), c01((PC[j][1] + 0.3 - time) / 0.3))); }\n";
  }
  // The pots stand on the frame's top edge, behind the frame. A catch
  // squashes a pot, a shot kicks it; it trembles and lights up while it
  // charges (an Add copy of it).
  function buildPots(kids) {
    var Pd = DATA.pots, i, k;
    if (!Pd) return;
    for (i = 0; i < Pd.items.length; i++) {
      var it = Pd.items[i];
      var src = imagePH("Pot " + (i + 1) + " " + it.name, "Pots", it.file);
      if (!src) continue;
      var s = r4(100 * it.size / src.width), ex = potExpr(i);
      var two = [inst(main, src, it.name, [it.x, it.bottom]), inst(main, src, it.name + " Charge Light", [it.x, it.bottom])];
      for (k = 0; k < 2; k++) {
        P(two[k], "ADBE Anchor Point").setValue([src.width / 2, src.height * (0.5 + Pd.box)]);
        P(two[k], "ADBE Position").expression = ex + "value + [ch * Math.sin(time * 71 + " + (i * 2) + ") * " + r4(it.size * 0.008) + ", 0];";
        P(two[k], "ADBE Scale").expression = ex + "[" + s + " * (1 + 0.08 * b + 0.02 * ch), " + s + " * (1 - 0.08 * b + 0.03 * ch)];";
        kids.push(two[k]);
      }
      two[1].blendingMode = BlendingMode.ADD;
      P(two[1], "ADBE Opacity").expression = ex + "100 * ch * (0.22 + 0.12 * Math.sin(time * 13 + " + i + "));";
    }
  }
  // Over the frame: each pot's glow (charging, firing, catching) and its
  // nameplate with what it caught this round (the "Pot n" slider).
  function buildPotsOver(kids) {
    var Pd = DATA.pots, i, k;
    if (!Pd) return;
    for (i = 0; i < Pd.items.length; i++) {
      var it = Pd.items[i], ex = potExpr(i);
      var G = frameAt(main, "FX Pot Glow", it.size * 0.5, it.size * 0.5, { round: 0.5, fill: [1, 1, 1], fillOp: 80, glow: 0.8, glowI: 2 }, it.name + " Glow", it.mouth, 0, DUR);
      G.blendingMode = BlendingMode.ADD;
      tint(G, it.color);
      fxOpacity(G, ex, "Math.min(100, 100 * (ch * (0.75 + 0.25 * Math.sin(time * 13 + " + i + ")) + fl * 0.8))");
      fxScale(G, ex + "var s = 100 * (1 + 0.35 * ch + 0.35 * fl);\n", "[s, s]");
      kids.push(G);
      if (!Pd.plates || !(it.max > 0)) continue;
      var n = 0, sh = "var S = [";
      for (k = 0; k < Pd.show.length; k++) if (Pd.show[k][2] === i) sh += (n++ ? "," : "") + "[" + Pd.show[k][0] + "," + Pd.show[k][1] + "]";
      sh += "]; var sa = 0; for (var q = 0; q < S.length; q++) sa = Math.max(sa, Math.min(c01((time - S[q][0]) / 0.2), c01((S[q][1] + 0.3 - time) / 0.3)));\n" +
        "if (!(" + ctrl("Pot " + (i + 1)) + ".valueAtTime(time) > 0.0001)) sa = 0;\n";
      var pl = it.plate;
      var PL = inst(main, plaquePH("Pot Plate " + (i + 1), pl[2], pl[3], pl[3] * 0.45, 92, it.color, Math.max(2, pl[3] * 0.08)), it.name + " Plate", [pl[0], pl[1]]);
      P(PL, "ADBE Opacity").expression = ex + sh + "100 * sa;";
      P(PL, "ADBE Scale").expression = ex + "var s = 100 * (1 + 0.3 * bc); [s, s];";
      kids.push(PL);
      var CO = rollCounter(main, it.name, ctrl("Pot " + (i + 1)) + ".valueAtTime(time)", it.max, Math.round(pl[3] * 0.56), [pl[0], pl[1]]);
      P(CO, "ADBE Opacity").expression = ex + sh + "100 * sa;";
      P(CO, "ADBE Scale").expression = ex + "value * (1 + 0.3 * bc);";
      kids.push(CO);
    }
  }
  // ---------- progressive jackpot boxes (core/jackpots.js) ----------
  // What a box shows at time (jackpotValue): its seed growing while it
  // runs; once won, the amount it paid while it holds, then the seed again.
  function jpValueExpr(it) {
    var J = DATA.jackpots, h = "var HT = [", k;
    for (k = 0; k < it.hits.length; k++) h += (k ? "," : "") + "[" + it.hits[k][0] + "," + it.hits[k][1] + "]";
    return h + "];\nvar SEED = " + it.base + ", GROW = " + it.rate + ", HOLD = " + J.times[2] + ", RUN = " + J.running + ";\n" +
      "var from = 0, v = null;\n" +
      "for (var i = 0; i < HT.length; i++) { if (HT[i][0] > time) break; if (time < HT[i][0] + HOLD) { v = HT[i][1]; break; } if (RUN) from = HT[i][0] + HOLD; }\n" +
      "v === null ? SEED + GROW * Math.max(0, time - from) : v;";
  }
  // How a box reacts at time (jackpotFx): sc = its scale, gl = glow, sw =
  // the light sweep (0..1, else -1), held = showing what it paid.
  function jpFxExpr(it) {
    var J = DATA.jackpots, k, h = "var HT = [", b = "var BT = [";
    for (k = 0; k < it.hits.length; k++) h += (k ? "," : "") + it.hits[k][0];
    for (k = 0; k < it.blinks.length; k++) b += (k ? "," : "") + it.blinks[k];
    return h + "];\n" + b + "];\nvar C = " + J.times[0] + ", BL = " + J.times[1] + ", HOLD = " + J.times[2] + ";\n" +
      "var sc = 1, gl = 0, sw = -1, held = 0;\n" +
      "for (var i = 0; i < HT.length; i++) { var a = time - HT[i]; if (a < 0 || a > C) continue;\n" +
      "  var env = Math.min(1, a / 0.15) * Math.min(1, (C - a) / 0.6);\n" +
      "  sc = Math.max(sc, 1 + env * (0.05 + 0.1 * Math.exp(-3 * a) + 0.025 * Math.sin(a * 12)));\n" +
      "  gl = Math.max(gl, env * (0.75 + 0.25 * Math.sin(a * 10)));\n" +
      "  if (a < 0.9) sw = a / 0.9; if (a < HOLD) held = 1; }\n" +
      "for (var j = 0; j < BT.length; j++) { var a2 = time - BT[j]; if (a2 < 0 || a2 > BL) continue; var kk = Math.sin(Math.PI * a2 / BL); sc = Math.max(sc, 1 + 0.06 * kk); gl = Math.max(gl, 0.8 * kk); }\n";
  }
  // Each box: a glow behind it, its plate (the "Jackpot <tier>" placeholder,
  // name painted in) popping on a win and swept by light once, an Add copy
  // that lights it up, the value under the name (its SLOT CONTROL slider),
  // and a shockwave each time it is won.
  function buildJackpots(kids) {
    var J = DATA.jackpots, i, k;
    if (!J) return;
    for (i = 0; i < J.items.length; i++) {
      var it = J.items[i], ex = jpFxExpr(it);
      var G = frameAt(main, "FX Jackpot Glow", it.w * 1.1, it.h * 1.1, { round: 0.3, fill: [1, 1, 1], fillOp: 70, glow: 0.6, glowI: 2 }, it.name + " Glow", [it.x, it.y], 0, DUR);
      G.blendingMode = BlendingMode.ADD;
      tint(G, it.color);
      fxOpacity(G, ex, "100 * Math.min(1, gl)");
      fxScale(G, ex + "var s = 115 * sc;\n", "[s, s]");
      kids.push(G);
      // The name also as an editable text layer (off), for art without it.
      var src = imagePH(it.name, "Jackpots", it.file, null, (function (it2) {
        return function (c) {
          var tw = text(c, "Name (editable)", it2.label, it2.labelPx, [c.width / 2, c.height / 2 + it2.labelY], [1, 0.86, 0.4]);
          tw.enabled = false;
        };
      })(it));
      if (src) {
        var B = inst(main, src, it.name, [it.x, it.y]);
        P(B, "ADBE Scale").expression = ex + "[100 * sc, 100 * sc];";
        try {
          var swp = fx(B, "CC Light Sweep", "Win Sweep");
          try { swp.property("Center").expression = ex + "[(sw < 0 ? -1 : sw * 1.6 - 0.3) * thisLayer.width, thisLayer.height / 2];"; } catch (e1) {}
          try { swp.property("Width").setValue(Math.round(it.h * 0.6)); } catch (e2) {}
          try { swp.property("Sweep Intensity").setValue(70); } catch (e3) {}
        } catch (e4) {}
        kids.push(B);
        var LT = inst(main, src, it.name + " Light", [it.x, it.y]);
        LT.blendingMode = BlendingMode.ADD;
        P(LT, "ADBE Scale").expression = ex + "[100 * sc, 100 * sc];";
        P(LT, "ADBE Opacity").expression = ex + "35 * Math.min(1, gl);";
        kids.push(LT);
      }
      var V = text(main, it.name + " Value", " ", it.size, it.value, [1, 0.86, 0.4]);
      textExpr(V, fmtExpr(), "fmt(" + ctrl(it.name) + ".value)");
      var fit = fmtExpr() + "var str = fmt(" + ctrl(it.name) + ".value); var fit = Math.min(1, " + it.fitW + " / (str.length * " + it.size + " * 0.62));\n";
      P(V, "ADBE Scale").expression = ex + fit + "[100 * sc * fit, 100 * sc * fit];";
      P(V, "ADBE Position").expression = ex + "value + [0, " + it.dy + " * (sc - 1)];";
      P(V, "ADBE Opacity").expression = ex + "held ? 75 + 25 * Math.sin(time * 16) : 100;";
      kids.push(V);
      for (k = 0; k < it.hits.length; k++) {
        var rg = ring(main, [it.x, it.y], it.hits[k][0], it.w * 0.95, it.color);
        if (rg) kids.push(rg);
      }
    }
  }
  // A round's jackpot: its amount flies from the box down into the win
  // meter, in an arc (the meter counts it in on SLOT CONTROL "Meter").
  function buildJackpotFly(comp, R, rel) {
    var J = R.jackpot, it = DATA.jackpots.items[J.box];
    if (!it) return;
    var a = rel(J.fly[0]), b = rel(J.fly[1]);
    var path = "var u = Math.max(0, Math.min(1, (time - " + a + ") / " + (b - a) + ")); var k = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;\n" +
      "var x = " + J.from[0] + " + (" + (J.to[0] - J.from[0]) + ") * k; var y = " + J.from[1] + " + (" + (J.to[1] - J.from[1]) + ") * k - Math.sin(k * Math.PI) * " + J.lift + ";\n";
    var fade = "var f = Math.max(0, Math.min(1, (time - " + b + ") / 0.25));\n";
    var GL = frameAt(comp, "FX Jackpot Fly Glow", DATA.cellW * 0.9, DATA.cellW * 0.9, { round: 0.5, fill: [1, 1, 1], fillOp: 80, glow: 0.5, glowI: 2 }, it.name + " Fly Glow", J.from, a, b + 0.25);
    GL.blendingMode = BlendingMode.ADD;
    tint(GL, it.color);
    P(GL, "ADBE Position").expression = path + "[x, y];";
    fxOpacity(GL, fade, "80 * (1 - f)");
    var T = text(comp, it.name + " Win", J.text, J.size, J.from, [1, 0.86, 0.4]);
    P(T, "ADBE Position").expression = path + "[x, y + " + (J.size * 0.36) + "];";
    P(T, "ADBE Scale").expression = path + "var s = 100 * (1.1 - 0.2 * k); [s, s];";
    P(T, "ADBE Opacity").expression = fade + "100 * (1 - f);";
    glow(T, DATA.cellW * 0.1, 1.3);
    trim(T, a, b + 0.25);
  }
  // Boosters (core/timeline.js BOOST): each target cell is marked in its
  // pot's colour while the pots charge; the old symbol trembles as the beam
  // comes, then bursts into the new one. A Reveal mask cuts the cell out of
  // its reel meanwhile.
  function buildBoost(comp, R, rel) {
    var B = R.boost, i, lead = DATA.boostT[0], popT = DATA.boostT[1];
    var a = rel(B.start);
    for (i = 0; i < B.items.length; i++) {
      var it = B.items[i], h = rel(it.hit);
      var mk = frameAt(comp, "FX Boost Target", DATA.cellW * 0.94, DATA.cellH * 0.94, { stroke: 0.035, round: 0.12, glow: 0.2, glowI: 1.5 }, "Boost Target " + (i + 1), [it.x, it.y], a, h + 0.05);
      tint(mk, it.color);
      fxOpacity(mk, "function c01(x){return x<0?0:(x>1?1:x);}\nvar e = Math.min(c01((time - " + a + ") / 0.3), c01((" + (h + 0.05) + " - time) / 0.05));\n", "100 * e * (0.65 + 0.35 * Math.sin(time * 10 + " + i + "))");
      var A = inst(comp, symComps[it.from], "Boost From " + DATA.symbols[it.from].name, [it.x, it.y], Math.max(0, h - lead), h);
      if (A) P(A, "ADBE Position").expression = "value + [Math.sin(time * 90) * " + r4(DATA.cellW * 0.02) + ", 0];";
      var T = inst(comp, symComps[it.to], "Boost " + DATA.symbols[it.to].name, [it.x, it.y], h, h + popT);
      if (T) {
        P(T, "ADBE Scale").expression = EASE_LIB + "var s = 100 * (0.55 + 0.45 * outBack(c01((time - " + h + ") / " + popT + "))); [s, s];";
        if (it.lab) valueOn(comp, T, it, h, h + popT);
      }
      var fl = frameAt(comp, "FX Boost Flash", DATA.cellW * 0.8, DATA.cellW * 0.8, { round: 0.5, fill: [1, 1, 1], fillOp: 90, glow: 0.5, glowI: 2 }, "Boost Flash " + (i + 1), [it.x, it.y], h, h + 0.6);
      fl.blendingMode = BlendingMode.ADD;
      fxOpacity(fl, "var f = Math.min(1, Math.max(0, (time - " + h + ") / 0.6));\n", "80 * (1 - f)");
      fxScale(fl, "var f = Math.min(1, Math.max(0, (time - " + h + ") / 0.6)); var s = 100 * (1.2 + f);\n", "[s, s]");
      ring(comp, [it.x, it.y], h, DATA.cellW * 0.95, it.color);
    }
  }
  // Saber beams between the pots and the cells: a Bezier path drawn on by
  // Trim Paths (start = the tail, end = the head; core/pots.js beamState),
  // stroked in soft passes of the pot's colour round a white core, with a
  // glow riding on the head.
  function buildBeams(comp, R, rel) {
    var i, k, BM = DATA.beam;
    for (i = 0; i < R.beams.length; i++) {
      var bm = R.beams[i], f0 = rel(bm.fire), dur = bm.travel + BM.hold + BM.fade, z = bm.bez;
      var pre = "function c01(x){return x<0?0:(x>1?1:x);}\nvar f = time - " + f0 + "; var tr = " + bm.travel + ";\n" +
        "var u = c01(f / tr); var head = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;\n" +
        "var tail = Math.min(head, c01((f - tr * 0.6) / (tr * 0.4 + " + BM.hold + " + " + (BM.fade * 0.5) + ")));\n";
      var fade = "(1 - c01((f - tr - " + BM.hold + ") / " + BM.fade + "))";
      var L = shapeLayer(comp, (bm.up ? "Beam Up " : "Beam Down ") + (i + 1) + " " + DATA.pots.items[bm.pot].name);
      var g = group(L);
      var p = g.addProperty("ADBE Vector Shape - Group");
      var sh = new Shape();
      sh.vertices = [[z[0], z[1]], [z[6], z[7]]];
      sh.outTangents = [[z[2] - z[0], z[3] - z[1]], [0, 0]];
      sh.inTangents = [[0, 0], [z[4] - z[6], z[5] - z[7]]];
      sh.closed = false;
      p.property("ADBE Vector Shape").setValue(sh);
      var tp = g.addProperty("ADBE Vector Filter - Trim");
      tp.property("ADBE Vector Trim Start").expression = pre + "tail * 100;";
      tp.property("ADBE Vector Trim End").expression = pre + "head * 100;";
      // The white core first: it sits in front.
      for (k = BM.passes.length - 1; k >= 0; k--) {
        var ps = BM.passes[k];
        var st = stroke(g, ps[2] ? [1, 1, 1] : bm.color, ps[0]);
        st.property("ADBE Vector Stroke Opacity").setValue(ps[1] * 100);
        if (ps[2]) continue;
        var fk = "(0.85 + 0.15 * Math.sin(time * 61) * Math.sin(time * 37 + 1))";
        st.property("ADBE Vector Stroke Width").expression = "value * " + fk + ";";
        st.property("ADBE Vector Stroke Opacity").expression = "value * " + fk + ";";
      }
      L.blendingMode = BlendingMode.ADD;
      P(L, "ADBE Opacity").expression = pre + "100 * " + fade + ";";
      trim(L, f0, f0 + dur);
      var hd = frameAt(comp, "FX Beam Head", BM.head * 0.5, BM.head * 0.5, { round: 0.5, fill: [1, 1, 1], fillOp: 90, glow: 0.35, glowI: 2 }, "Beam Head " + (i + 1), null, f0, f0 + dur);
      hd.blendingMode = BlendingMode.ADD;
      tint(hd, bm.color);
      P(hd, "ADBE Position").expression = pre + rowsExpr("Q", bm.pts) + "var n = Q.length - 1; var x = head * n; var j = Math.min(n - 1, Math.floor(x)); var kk = x - j;\n[Q[j][0] + (Q[j + 1][0] - Q[j][0]) * kk, Q[j][1] + (Q[j + 1][1] - Q[j][1]) * kk];";
      fxOpacity(hd, pre, "90 * " + fade);
    }
  }
  // Beaming to the pots: each winner fires (a ring in its pot's colour) and
  // darkens as its light goes up the beam.
  function drainCells(comp, st, rel) {
    var F = st.fx, i, e = rel(st.end);
    for (i = 0; i < st.cells.length; i++) {
      var cl = st.cells[i], l0 = rel(F.launch[i]);
      ring(comp, [cl.x, cl.y], l0, DATA.cellW * 0.75, DATA.pots.items[F.pots[i]].color);
      var dk = frameAt(comp, "FX Cell Shade", DATA.cellW * 0.94, DATA.cellH * 0.94, { round: 0.1, fill: [0.02, 0.01, 0.05], fillOp: 100 }, "Drained " + (i + 1), [cl.x, cl.y], l0, e);
      fxOpacity(dk, "var d = Math.min(1, Math.max(0, (time - " + (l0 + 0.05) + ") / 0.3)); var o = Math.min(1, Math.max(0, (" + e + " - time) / 0.3));\n", "45 * d * o");
    }
  }

  // Mystery blocks turn over together (core/timeline.js MYSTERY): the block
  // narrows to its edge, the revealed symbol opens out; the reels under
  // them are cut out meanwhile (Reveal masks).
  function buildMystery(comp, R, rel) {
    var M = R.mystery, i;
    var f0 = rel(M.flipAt), f1 = rel(M.flipEnd), mid = rel(M.mid), d = M.flipEnd - M.flipAt;
    var turn = "var u = Math.max(0, Math.min(1, (time - " + f0 + ") / " + d + ")); var lift = 1 + 0.12 * Math.sin(u * Math.PI); var sx = Math.max(0.02, Math.abs(Math.cos(u * Math.PI))) * lift;\n";
    for (i = 0; i < M.cells.length; i++) {
      var cl = M.cells[i];
      var gl = frameAt(comp, "FX Mystery Glow", DATA.cellW * 0.96, DATA.cellH * 0.96, { round: 0.14, fill: [0.77, 0.55, 1], fillOp: 35, glow: 0.35, glowI: 1.6, color: [0.77, 0.55, 1] }, "Mystery Glow", [cl.x, cl.y], rel(M.start), f1 + 0.3);
      gl.blendingMode = BlendingMode.ADD;
      fadeKeys(gl, rel(M.start), f1 + 0.3, 0.3, 0.4);
      var A = inst(comp, symComps[M.from], "Mystery Block", [cl.x, cl.y], f0, mid);
      P(A, "ADBE Scale").expression = turn + "[100 * sx, 100 * lift];";
      var B = inst(comp, symComps[M.sym], "Mystery Reveal", [cl.x, cl.y], mid, f1);
      P(B, "ADBE Scale").expression = turn + "[100 * sx, 100 * lift];";
      ring(comp, [cl.x, cl.y], mid, DATA.cellW * 0.95, [0.88, 0.7, 1]);
    }
  }
  // The collector wakes, every cash value flies in one by one, and it shows
  // what it took (the meter counts each in on WIN CTRL).
  function buildCollector(comp, R, rel) {
    var C = R.collector, i;
    var a = rel(C.start), b = rel(C.end) + 0.4;
    var tg = [C.x, C.y];
    var arr = "var A = [";
    for (i = 0; i < C.items.length; i++) arr += (i ? "," : "") + rel(C.items[i].arrive);
    arr += "]; var bump = 0, got = -1; for (var i = 0; i < A.length; i++) if (time >= A[i]) { got = i; bump = Math.max(bump, 1 - Math.min(1, (time - A[i]) / 0.25)); }\n";
    var cg = frameAt(comp, "FX Collector Glow", DATA.cellW * 1.1, DATA.cellH * 1.1, { round: 0.5, fill: DATA.accent, fillOp: 30, glow: 0.45, glowI: 1.8, color: DATA.accent }, "Collector Glow", tg, a, b);
    cg.blendingMode = BlendingMode.ADD;
    fadeKeys(cg, a, b, 0.25, 0.4);
    var CL = inst(comp, symComps[C.sym], "Collector", tg, a, b);
    P(CL, "ADBE Scale").expression = arr + "var s = 100 * (1 + 0.05 * Math.sin((time - " + a + ") * 9) + 0.16 * bump); [s, s];";
    fadeKeys(CL, a, b, 0.25, 0.4);
    for (i = 0; i < C.items.length; i++) {
      var it = C.items[i], t0 = rel(it.at), t1 = rel(it.arrive);
      ring(comp, [it.x, it.y], t0, DATA.cellW * 0.8, DATA.accent);
      var fly = text(comp, "Cash " + it.text, it.text, Math.round(DATA.cellH * 0.24), [it.x, it.y], [1, 0.88, 0.45]);
      var p0 = P(fly, "ADBE Position").value;
      ease1(P(fly, "ADBE Position"), [[t0, p0], [(t0 + t1) / 2, [(p0[0] + tg[0]) / 2, Math.min(p0[1], tg[1]) - DATA.cellH * 0.6]], [t1, tg]]);
      glow(fly, DATA.cellW * 0.1, 1.3);
      trim(fly, t0, t1);
    }
    // The running total under the collector, one value at a time.
    var tot = "var T = [";
    for (i = 0; i < C.items.length; i++) tot += (i ? "," : "") + "\"" + C.items[i].after + "\"";
    tot += "];\n";
    var TX = text(comp, "Collected", C.items.length ? C.items[0].after : "", Math.round(DATA.cellH * 0.3), [tg[0], tg[1] + DATA.cellH * 0.3]);
    textExpr(TX, arr + tot, "got >= 0 ? T[got] : ''");
    P(TX, "ADBE Scale").expression = arr + "var s = 100 * (1 + 0.2 * bump); [s, s];";
    glow(TX, DATA.cellW * 0.1, 1.3);
    trim(TX, C.items.length ? rel(C.items[0].arrive) : a, b);
    ring(comp, tg, rel(C.done), DATA.cellW * 1.4, DATA.accent);
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
    textExpr(tx, fmtExpr() + items, "time >= " + rel(M.applyAt) + " ? fmt(" + M.total + ") : (sum > 0 ? fmt(" + M.base + ") + ' x' + sum : fmt(" + M.base + "))");
    P(tx, "ADBE Scale").expression = EASE_LIB + "var a = time - " + rel(M.applyAt) + "; var s = a > 0 ? 100 * (1 + 0.25 * Math.pow(1 - c01(a / 0.4), 2)) : 100; [s, s];";
    fadeKeys(tx, rel(M.start), rel(M.end + 0.3), 0.25, 0.4);
    ring(comp, tg, rel(M.applyAt), DATA.cellW * 2.6, [1, 0.82, 0.35]);
  }

  function buildBigWin(comp, R, rel) {
    var ov = R.overlay, i;
    var a = rel(ov.start), b = rel(ov.end);
    var cx = W / 2, cy = H * (H > W * 1.1 ? 0.4 : 0.42);
    darkLayer(comp, a, b, 72);
    rays(comp, [cx, cy], a, b, H * 1.7, 12.6, 60);
    rays(comp, [cx, cy], a, b, 0.7 * H * 1.7, -20, 35);
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
  // The tease (core/tease.js): while a reel teases, a black solid dims each
  // other reel; scatters and trigger coins that land pop lit over the dim,
  // then fade into it, or stay lit to the end of the tease with "keep
  // scatters lit". Dim % on SLOT CONTROL scales the dim.
  function buildTease(kids) {
    var TE = DATA.tease, TW = [], r, i, t0 = 1e9, t1 = 0;
    var envFn = "function tEnv(w) { var a = w[0] - " + TE.lead + ", b = w[1] + " + TE.tail + "; if (time < a || time > b) return 0; return Math.min(Math.min(1, (time - a) / " + TE.fin + "), Math.min(1, (b - time) / " + TE.tail + ")); }\n";
    for (r = 0; r < DATA.rounds.length; r++) {
      for (i = 0; i < DATA.rounds[r].tease.length; i++) {
        var w = DATA.rounds[r].tease[i];
        if (w[2] < 0) continue;
        TW.push(w);
        t0 = Math.min(t0, w[0] - TE.lead);
        t1 = Math.max(t1, w[1] + TE.tail);
      }
    }
    if (TW.length) {
      for (i = 0; i < DATA.reels; i++) {
        var td = solid(main, [0, 0, 0], "Tease Dim R" + (i + 1), DATA.cellW, DATA.winH, [DATA.reelXs[i], DATA.winTop + DATA.winH / 2]);
        P(td, "ADBE Opacity").expression = rowsExpr("TW", TW) + envFn +
          "var all = 0, own = 0; for (var k = 0; k < TW.length; k++) { var e = tEnv(TW[k]); all = Math.max(all, e); if (TW[k][2] == " + i + ") own = Math.max(own, e); }\n" +
          "(own > 0 ? 0 : " + TE.dim * 100 + " * all) * " + ctrl("Dim %") + " / 100;";
        trim(td, t0, t1);
        kids.push(td);
      }
    }
    for (r = 0; r < DATA.rounds.length; r++) {
      var RR = DATA.rounds[r];
      for (i = 0; i < RR.lands.length; i++) {
        var ld = RR.lands[i];
        kids.push(ring(main, [ld.x, ld.y], ld.t, DATA.cellW * 0.95, DATA.accent));
        var LL = inst(main, symComps[ld.s] || symComps[0], (ld.coin ? "Coin Lands R" : "Scatter Lands R") + (r + 1), [ld.x, ld.y], ld.t, ld.until);
        P(LL, "ADBE Scale").expression = "var u = Math.max(0, Math.min(1, (time - " + ld.t + ") / " + TE.fade + ")); var s = 100 * (1 + 0.25 * Math.sin(u * Math.PI)); [s, s];";
        var lit = "var a = time - " + ld.t + "; var k = a < 0 ? 0 : (a < " + TE.pop + " ? 1 - Math.max(0, Math.min(1, (a - " + TE.fade + ") / " + (TE.pop - TE.fade) + ")) : 0);\n";
        if (TE.keepLit && RR.tease.length) lit += rowsExpr("W", RR.tease) + envFn + "if (a >= 0) for (var j = 0; j < W.length; j++) k = Math.max(k, tEnv(W[j]));\n";
        lit += "100 * k;";
        P(LL, "ADBE Opacity").expression = lit;
        glow(LL, DATA.cellW * 0.2, 1.2);
        kids.push(LL);
        if (ld.lab) {
          var lsz = Math.round(DATA.cellH * 0.3);
          var T = text(main, "Value " + ld.lab[0], ld.lab[0], lsz, [0, 0], [1, 0.9, 0.55]);
          pos(T, [ld.x, ld.y + ld.lab[1] * DATA.cellH + lsz * 0.36 * ld.lab[2]]);
          P(T, "ADBE Scale").setValue([ld.lab[2] * 100, ld.lab[2] * 100]);
          P(T, "ADBE Opacity").expression = lit;
          T.parent = LL;
          trim(T, ld.t, ld.until);
        }
      }
    }
  }
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
    var target = [DATA.machineX, DATA.hold ? DATA.hold.barY : H * 0.15];
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
    rays(comp, [cx, cy], a, b, H * 1.8, 17, 60);
    ring(comp, [cx, cy], a, H * 0.8, [1, 0.7, 0.1]);
    emitters(comp, R, "under", ["grand"]);
    var T = titleLayer(comp, "grand", [cx, cy - H * 0.06], a, b, W * 0.9);
    if (T) fadeKeys(T, a, b, 0.05, 0.5);
    winCtrl(comp, G.keys, -R.start, "GRAND CTRL");
    var od = counters(comp, [cx, cy + H * 0.14], Math.round(DATA.titlePx * 0.66), G.amount, rel(G.countEnd), "GRAND CTRL");
    fadeKeys(od, a + 0.2, b, 0.3, 0.5);
  }

  // A Major jackpot takes the whole screen: its name and JACKPOT, the amount
  // counting up on its own control, the Grand's particles.
  function buildJackpotShows(comp, R, rel) {
    var cx = W / 2, cy = H * 0.44, k;
    for (k = 0; k < R.jpShows.length; k++) {
      var S = R.jpShows[k];
      var a = rel(S.start), b = rel(S.end);
      darkLayer(comp, a, b, 70);
      rays(comp, [cx, cy], a, b, H * 1.8, 17, 60);
      ring(comp, [cx, cy], a, H * 0.8, S.color);
      if (k === 0) emitters(comp, R, "under", ["jackpot"]);
      var T = titleLayer(comp, S.title, [cx, cy - H * 0.06], a, b, W * 0.9);
      if (T) fadeKeys(T, a, b, 0.05, 0.5);
      var ctrl = S.name + " JACKPOT " + (k + 1) + " CTRL";
      winCtrl(comp, S.keys, -R.start, ctrl);
      var od = counters(comp, [cx, cy + H * 0.14], Math.round(DATA.titlePx * 0.66), S.amount, rel(S.countEnd), ctrl);
      fadeKeys(od, a + 0.2, b, 0.3, 0.5);
    }
  }

  function buildBanner(comp, R, rel) {
    var bn = R.banner;
    var a = rel(bn.start), b = rel(bn.end);
    var cx = W / 2, cy = H * 0.44;
    darkLayer(comp, a, b, 60);
    rays(comp, [cx, cy], a, b, H * 1.6, 14.3, 55);
    ring(comp, [cx, cy], a, H * 0.7, DATA.accent);
    var T = titleLayer(comp, bn.kind, [cx, bn.kind === "freespins" || bn.kind === "retrigger" || bn.kind === "holdspin" ? cy - H * 0.13 : cy], a, b, W * 0.9);
    if (T) fadeKeys(T, a, b, 0.05, 0.5);
    if (bn.kind === "holdspin") {
      var sub = text(comp, "Respins", bn.freeSpins + " RESPINS", Math.round(DATA.titlePx * 0.62), [cx, cy + H * 0.1], [1, 0.55, 0.15]);
      P(sub, "ADBE Scale").expression = EASE_LIB + "var s = 10 + 90 * outElastic(c01((time - " + (a + 0.35) + ") / 0.8)); [s, s];";
      fadeKeys(sub, a, b, 0.05, 0.5);
    } else if (bn.kind === "freespins" || bn.kind === "retrigger") {
      var num = text(comp, bn.kind === "retrigger" ? "Extra Spins" : "Free Spins Count", (bn.kind === "retrigger" ? "+" : "") + bn.freeSpins, Math.round(DATA.titlePx * 1.5), [cx, cy + H * 0.12], [1, 0.55, 0.15]);
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
        textExpr(L, null, undefined, "Wheel Font");
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
      spin(ry, 8.6);
      var rys = r4(100 * Rr * 3.4 / ry.source.width);
      P(ry, "ADBE Scale").setValue([rys, rys]);
      fxScale(ry);
      fxOpacity(ry, envExpr, "env * 45");
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
    buildFonts();
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
  // Missing files: a few names, and on a Mac the likely cause when none
  // could be read (macOS asks before an app reads Downloads, Desktop or
  // Documents).
  if (missing.length) {
    var mac = $.os && $.os.indexOf("Mac") >= 0;
    alert(missing.length + " asset file" + (missing.length > 1 ? "s were" : " was") + " not found next to the script:\n" + missing.slice(0, 8).join("\n") + (missing.length > 8 ? "\n..." : "") +
      "\n\nKeep the .jsx next to its \"assets\" folder, unzipped." + (mac ? "\nOn a Mac, if After Effects was refused access to this folder, allow it in System Settings > Privacy & Security > Files and Folders, then run the script again." : ""));
  }
  if (missingFonts.length) alert("Not installed: " + missingFonts.join(", ") + ".\nInstall it (the fonts folder, or Google Fonts), or pick another font on the layers of the \"Fonts\" comp: every text follows.");
})();
`;
