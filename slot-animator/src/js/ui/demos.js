// Mini demos for the tooltips: tiny projects that each show one option and
// the stretch of their timeline to loop. A demo is one scene, or variants
// played in turn under a corner label (the option off, then on; low, then
// high). Everything that does not belong to the option is switched off:
// win particles, paylines, marquee, shake, flashes, background lights. A
// focus zooms into the part that changes (the landing reel, the pots, the
// pointer); the scene is then built bigger, so the crop stays sharp. The
// editor renders them with the real renderer. Pure: projects, times and
// rectangles only.

import { defaultProject, candyProject, holdSpinProject, wheelProject, newRound, SPIN_PRESETS, AGAIN_SEGMENT } from '../core/defaults.js';
import { autoIcons } from '../core/wheel.js';
import { buildTimeline } from '../core/timeline.js';
import { computeLayout } from '../core/layout.js';

const SIZE = { width: 480, height: 270, fps: 30 };
// Loops longer than this play faster, so every demo stays short.
export const DEMO_LOOP = 4;
// The deepest zoom a focus may ask for.
const MAX_ZOOM = 3;

function small(p) {
  p.canvas = { ...SIZE };
  p.machine.showHud = false;
  p.sound.enabled = false;
  p.particles.ambient = { fx: 'none', asset: 'sparkle' };
  return p;
}

// Nothing but the subject: a demo turns back on what it shows.
function quiet(p) {
  small(p);
  Object.assign(p.effects, { coins: 0, showLines: false, shake: 0, flash: 0, bokeh: 0, landShake: false });
  p.machine.marquee = false;
  return p;
}

const slot = (rounds, patch = () => {}) => {
  const p = quiet(defaultProject());
  p.rounds = rounds();
  patch(p);
  return p;
};
const wheel = (patch = () => {}, rounds) => {
  const p = quiet(wheelProject());
  p.wheel.push = 0;
  p.rounds = rounds ? rounds() : [newRound('wheel', { seed: 3, wheelSegment: 3 })];
  patch(p);
  return p;
};
const pots = (p) => {
  p.pots.enabled = true;
  return p;
};
// Winners beam up into the pots.
const collect = (p) => {
  pots(p).winfx.style = 'collect';
  return p;
};
// Winners jump into the win meter (along a path, or the default one).
const jump = (path) => (p) => {
  p.winfx.style = 'jump';
  if (path) p.winfx.jumpPath = path;
  p.machine.showHud = true;
};
// Two scenes of the same demo: the option off (or low), then on (or high).
const ab = (make, [la, a], [lb, b]) => [
  { label: la, make: () => make(a) },
  { label: lb, make: () => make(b) },
];

const spinType = (type) => (p) => Object.assign(p.spin, { type, ...SPIN_PRESETS[type] });
const noWin = () => [newRound('none', { seed: 21, antic: [] })];
const smallWin = () => [newRound('small', { seed: 12, lines: [0], count: 3 })];
const winRound = () => [newRound('medium', { seed: 52, lines: [1, 2], count: 4 })];
const oneLine = () => [newRound('medium', { seed: 52, lines: [1], count: 5 })];
const teaseRound = () => [newRound('none', { seed: 3, antic: [3, 4] })];
const bigRound = () => [newRound('big', { seed: 15, lines: [0, 3], count: 5, symbol: 's7', tier: 1 })];

// ---- loop windows: [from, to] in seconds ----
const R0 = (tl) => tl.rounds[0];
const spinWin = (tl) => [R0(tl).t0 - 0.05, R0(tl).spinEnd + 0.35];
const startWin = (tl) => [R0(tl).t0 - 0.12, R0(tl).t0 + 0.8];
const lastReel = (R) => R.reels.reduce((m, ri, c) => (ri.stop > R.reels[m].stop ? c : m), 0);
const firstStop = (R) => Math.min(...R.reels.map((ri) => ri.stop));
const landWin = (tl) => {
  const ri = R0(tl).reels[lastReel(R0(tl))];
  return [ri.stop - 0.3, ri.settle + 0.35];
};
const stopsWin = (tl) => [firstStop(R0(tl)) - 0.35, R0(tl).spinEnd + 0.35];
const midSpin = (tl) => [R0(tl).t0 + 0.45, Math.min(firstStop(R0(tl)), R0(tl).t0 + 1.5)];
const landed = (tl) => [R0(tl).spinEnd - 0.5, R0(tl).spinEnd + 0.9];
// The first win step, at most len seconds of it.
const stepFor = (tl, len) => {
  const R = R0(tl);
  const st = R.pres.steps?.[0];
  return st ? [st.start - 0.25, Math.min(st.end, st.start + len)] : spinWin(tl);
};
const stepWin = (tl) => stepFor(tl, 2.6);
const teaseWin = (tl) => {
  const R = R0(tl);
  const teased = R.reels.filter((ri) => ri.antic);
  const calm = R.reels.filter((ri) => !ri.antic);
  const from = calm.length ? Math.max(...calm.map((ri) => ri.stop)) : R.t0;
  return teased.length ? [from - 0.3, R.spinEnd + 0.35] : spinWin(tl);
};
const beamWin = (tl) => {
  const bs = R0(tl).pres.beams || [];
  if (!bs.length) return stepWin(tl);
  return [bs[0].fire - 0.35, Math.max(...bs.map((b) => b.fire + b.travel)) + 0.45];
};
const boostWin = (tl) => {
  const b = R0(tl).pres.boost;
  return [b.start - 0.25, b.end + 0.35];
};
const overlayWin = (tl) => {
  const ov = R0(tl).pres.overlay;
  return [ov.start - 0.2, ov.start + 1.8];
};
const tierUpWin = (tl) => {
  const ov = R0(tl).pres.overlay;
  const t = ov.tierTimes[1] ?? ov.countEnd;
  return [t - 0.7, t + 0.9];
};
// The last stretch of the wheel's spin, until the prize plaque covers it.
const wheelLand = (tl) => {
  const w = R0(tl).pres.wheel;
  return [w.spinEnd - 1.8, w.prizeStart - 0.02];
};
const wheelSlow = (tl) => {
  const w = R0(tl).pres.wheel;
  return [w.spinEnd - 1.2, w.prizeStart - 0.02];
};

// ---- focus rectangles, in canvas pixels ----
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// The 16:9 rectangle around r (with a margin), kept on the canvas.
function fit(L, r, pad = 1.1) {
  const ar = L.W / L.H;
  let w = r.w * pad;
  let h = r.h * pad;
  if (w / h < ar) w = h * ar;
  else h = w / ar;
  w = clamp(w, L.W / MAX_ZOOM, L.W);
  h = w / ar;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  return { x: clamp(cx - w / 2, 0, L.W - w), y: clamp(cy - h / 2, 0, L.H - h), w, h };
}
const reelsRect = (L, c0, c1, rows = L.rows) => {
  const x = L.reelX[c0];
  const w = L.reelX[c1] + L.cellW - x;
  const cy = L.winTop + L.winH / 2;
  const h = Math.min(L.winH, rows * L.cellH);
  return { x, y: cy - h / 2, w, h };
};
const machineRect = (L) => L.frame;
const lastReelFocus = (tl, L) => fit(L, reelsRect(L, lastReel(R0(tl)), lastReel(R0(tl)), 2), 1.4);
const firstReelsFocus = (tl, L) => fit(L, reelsRect(L, 0, 2), 1.05);
const tease = (tl, L) => fit(L, reelsRect(L, 2, L.reels - 1), 1.05);
const potsRect = (L) => {
  const ps = L.pots || [];
  if (!ps.length) return L.frame;
  const x0 = Math.min(...ps.map((p) => p.x - p.size / 2));
  const x1 = Math.max(...ps.map((p) => p.x + p.size / 2));
  const y0 = Math.min(...ps.map((p) => p.top));
  const y1 = L.frame.y + Math.max(...ps.map((p) => p.plate.h)) * 1.6;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};
const potsFocus = (tl, L) => fit(L, potsRect(L), 1.12);
// The pots and the top of the reels, so a beam's whole flight shows.
const potsAndReels = (tl, L) => {
  const p = potsRect(L);
  return fit(L, { x: Math.min(p.x, L.frame.x), y: p.y, w: Math.max(p.x + p.w, L.frame.x + L.frame.w) - Math.min(p.x, L.frame.x), h: L.winTop + L.winH * 0.6 - p.y }, 1.04);
};
const lowerHalf = (tl, L) => fit(L, { x: L.frame.x, y: L.winTop + L.winH * 0.4, w: L.frame.w, h: (L.hud ? L.hud.y + L.hud.h : L.frame.y + L.frame.h) - (L.winTop + L.winH * 0.4) }, 1.06);
const machineFocus = (tl, L) => fit(L, machineRect(L), 1.04);
// The top edge of the reel window, where partial symbols show.
const topEdge = (tl, L) => fit(L, { x: L.reelX[0], y: L.winTop - L.cellH * 0.15, w: L.reelX[3] + L.cellW - L.reelX[0], h: L.cellH * 1.5 }, 1.05);
const pointerFocus = (tl, L) => {
  const g = L.wheel;
  const s = g.pointer === 'bottom' ? 1 : -1;
  const yA = g.pivot.y - s * g.R * 0.18;
  const yB = g.cy + s * g.R * 0.5;
  return fit(L, { x: g.cx - g.R * 0.6, y: Math.min(yA, yB), w: g.R * 1.2, h: Math.abs(yB - yA) }, 1);
};
const wheelFocus = (tl, L) => {
  const g = L.wheel;
  return fit(L, { x: g.cx - g.R * 1.08, y: g.cy - g.R * 1.08, w: g.R * 2.16, h: g.R * 2.16 }, 1);
};

export const DEMOS = {
  // ---- Machine ----
  game: {
    variants: [
      { label: 'Slot machine', make: () => slot(smallWin), window: (tl) => [R0(tl).t0 - 0.05, R0(tl).spinEnd + 1] },
      {
        label: 'Hold & Spin',
        make: () => {
          const p = quiet(holdSpinProject());
          p.rounds = p.rounds.slice(0, 2);
          return p;
        },
        window: (tl) => [tl.rounds[0].t0, tl.rounds[1].end],
      },
      { label: 'Wheel only', make: () => wheel(), window: (tl) => [R0(tl).pres.wheel.spinStart - 0.2, R0(tl).pres.wheel.prizeStart + 0.6] },
    ],
  },
  'pay-mode': {
    variants: [
      { label: 'Paylines', make: () => slot(oneLine, (p) => (p.effects.showLines = true)) },
      { label: 'Ways', make: () => slot(oneLine, (p) => (p.machine.payMode = 'ways')) },
      { label: 'Anywhere', make: () => slot(() => [newRound('medium', { seed: 31 })], (p) => (p.machine.payMode = 'anywhere')) },
      { label: 'Clusters', make: () => slot(() => [newRound('medium', { seed: 41 })], (p) => (p.machine.payMode = 'clusters')) },
    ],
    window: (tl) => stepFor(tl, 1.4),
  },
  peek: { variants: ab((v) => slot(noWin, (p) => (p.grid.peek = v)), ['None', 0], ['Deep', 0.45]), window: landed, focus: topEdge },
  curve: { variants: ab((v) => slot(noWin, (p) => {
        p.grid.curvature = v;
        Object.assign(p.spin, { speed: 8, blur: 0.1 });
      }), ['Flat', 0], ['Curved', 1]), window: midSpin, focus: machineFocus },
  'row-lines': { variants: ab((v) => slot(noWin, (p) => (p.machine.rowLines = v)), ['Off', false], ['On', true]), window: landed, focus: (tl, L) => fit(L, reelsRect(L, 0, 2), 1.05) },
  marquee: { variants: ab((v) => slot(smallWin, (p) => (p.machine.marquee = v)), ['Off', false], ['On', true]), window: (tl) => stepFor(tl, 1.8), focus: machineFocus },
  hud: { variants: ab((v) => slot(smallWin, (p) => (p.machine.showHud = v)), ['Off', false], ['On', true]), window: (tl) => stepFor(tl, 2), focus: lowerHalf },
  holdspin: {
    make: () => {
      const p = quiet(holdSpinProject());
      p.rounds = p.rounds.slice(0, 3);
      return p;
    },
    window: (tl) => [tl.rounds[0].t0, tl.rounds[2].end],
  },
  // Pots: a booster upgrades a cell, then the winners beam up.
  pots: {
    make: () =>
      slot(
        () => [newRound('small', { seed: 12, lines: [0], count: 3, boosts: [{ kind: 'upgrade' }] })],
        collect
      ),
    window: (tl) => {
      const R = R0(tl);
      const bs = (R.pres.beams || []).filter((b) => b.up);
      return [R.pres.boost.start - 0.2, bs.length ? Math.max(...bs.map((b) => b.fire + b.travel)) + 0.4 : R.pres.boost.end + 0.5];
    },
  },
  'pots-band': { variants: ab((v) => slot(noWin, (p) => Object.assign(pots(p).pots, { band: v })), ['Less room', 0.18], ['More room', 0.42]), window: (tl) => [R0(tl).t0, R0(tl).t0 + 1.2] },
  'pots-size': { variants: ab((v) => slot(noWin, (p) => Object.assign(pots(p).pots, { size: v })), ['Small', 0.65], ['Big', 1.5]), window: (tl) => [R0(tl).t0, R0(tl).t0 + 1.2], focus: potsAndReels },
  'pots-spacing': { variants: ab((v) => slot(noWin, (p) => Object.assign(pots(p).pots, { spacing: v, size: 0.8 })), ['Close', 0.7], ['Wide', 2]), window: (tl) => [R0(tl).t0, R0(tl).t0 + 1.2], focus: potsAndReels },
  'pots-overlap': { variants: ab((v) => slot(noWin, (p) => Object.assign(pots(p).pots, { overlap: v })), ['Low', 0.05], ['High', 0.7]), window: (tl) => [R0(tl).t0, R0(tl).t0 + 1.2], focus: potsAndReels },
  plates: {
    variants: ab((v) => slot(winRound, (p) => (collect(p).pots.plates = v)), ['Off', false], ['On', true]),
    window: beamWin,
    focus: potsFocus,
  },
  'pots-aim': {
    variants: ab((v) => slot(winRound, (p) => (collect(p).pots.aim = v)), ['Nearest', 'nearest'], ['Take turns', 'turns']),
    window: beamWin,
    focus: potsAndReels,
  },
  'beam-collect': { make: () => slot(winRound, collect), window: beamWin, focus: potsAndReels },
  's-curve': {
    make: () =>
      slot(winRound, (p) => {
        collect(p).pots.beam.curve = 's';
      }),
    window: beamWin,
    focus: potsAndReels,
  },
  'beam-bend': { variants: ab((v) => slot(winRound, (p) => (collect(p).pots.beam.bend = v)), ['Low', 0.1], ['High', 1.3]), window: beamWin, focus: potsAndReels },
  'beam-width': { variants: ab((v) => slot(winRound, (p) => (collect(p).pots.beam.width = v)), ['Thin', 0.45], ['Thick', 2.6]), window: beamWin, focus: potsAndReels },
  'beam-travel': { variants: ab((v) => slot(winRound, (p) => (collect(p).pots.beam.travel = v)), ['Fast', 0.15], ['Slow', 0.9]), window: beamWin, focus: potsAndReels },
  'beam-stagger': { variants: ab((v) => slot(winRound, (p) => (collect(p).pots.beam.stagger = v)), ['Short', 0.04], ['Long', 0.5]), window: beamWin, focus: potsAndReels },

  // ---- Spin ----
  'spin-classic': { make: () => slot(noWin, spinType('classic')), window: spinWin },
  'spin-stagger': { make: () => slot(noWin, spinType('stagger')), window: spinWin },
  'spin-turbo': { make: () => slot(noWin, spinType('turbo')), window: spinWin },
  'spin-tease': { make: () => slot(() => [newRound('none', { seed: 21 })], spinType('tease')), window: spinWin },
  'spin-cascade': { make: () => slot(noWin, spinType('cascade')), window: spinWin },
  'spin-cells': { make: () => slot(noWin, spinType('cells')), window: spinWin },
  'start-windup': { make: () => slot(noWin, (p) => Object.assign(p.spin, { startStyle: 'windup', windup: 0.5, startDuration: 0.5 })), window: startWin, focus: firstReelsFocus, slow: 0.4 },
  'start-ease': { make: () => slot(noWin, (p) => Object.assign(p.spin, { startStyle: 'ease', startDuration: 0.5 })), window: startWin, focus: firstReelsFocus, slow: 0.4 },
  'start-instant': { make: () => slot(noWin, (p) => Object.assign(p.spin, { startStyle: 'instant' })), window: startWin, focus: firstReelsFocus, slow: 0.4 },
  'end-bounce': { make: () => slot(noWin, (p) => Object.assign(p.spin, { endStyle: 'bounce', overshoot: 0.35 })), window: landWin, focus: lastReelFocus, slow: 0.45 },
  'end-elastic': { make: () => slot(noWin, (p) => Object.assign(p.spin, { endStyle: 'elastic', overshoot: 0.35 })), window: landWin, focus: lastReelFocus, slow: 0.45 },
  'end-hard': { make: () => slot(noWin, (p) => Object.assign(p.spin, { endStyle: 'hard' })), window: landWin, focus: lastReelFocus, slow: 0.45 },
  'end-soft': { make: () => slot(noWin, (p) => Object.assign(p.spin, { endStyle: 'soft' })), window: landWin, focus: lastReelFocus, slow: 0.45 },
  blur: { variants: ab((v) => slot(noWin, (p) => Object.assign(p.spin, { blur: v, speed: 30 })), ['Off', 0], ['On', 1]), window: midSpin, focus: (tl, L) => fit(L, reelsRect(L, 1, 3), 1.05) },
  speed: { variants: ab((v) => slot(noWin, (p) => (p.spin.speed = v)), ['Slow', 9], ['Fast', 42]), window: spinWin },
  'spin-length': { variants: ab((v) => slot(noWin, (p) => (p.spin.midDuration = v)), ['Short', 0.2], ['Long', 2]), window: spinWin },
  'start-stagger': { variants: ab((v) => slot(noWin, (p) => (p.spin.startStagger = v)), ['0 s', 0], ['0.25 s', 0.25]), window: (tl) => [R0(tl).t0 - 0.1, R0(tl).t0 + 1.7] },
  'stop-stagger': { variants: ab((v) => slot(noWin, (p) => (p.spin.stopStagger = v)), ['0.05 s', 0.05], ['0.5 s', 0.5]), window: stopsWin },
  'stop-order': {
    variants: [
      ['Left to right', 'ltr'],
      ['Right to left', 'rtl'],
      ['Centre out', 'center'],
    ].map(([label, v]) => ({ label, make: () => slot(noWin, (p) => Object.assign(p.spin, { stopOrder: v, stopStagger: 0.3 })) })),
    window: stopsWin,
  },
  'antic-time': { variants: ab((v) => slot(teaseRound, (p) => Object.assign(p.spin, { anticipation: v, zoomOn: false })), ['0.5 s', 0.5], ['2.5 s', 2.5]), window: teaseWin, focus: tease },
  'antic-crawl': { variants: ab((v) => slot(teaseRound, (p) => Object.assign(p.spin, { anticipationSpeed: v, zoomOn: false })), ['Slow', 3], ['Fast', 14]), window: teaseWin, focus: tease },
  zoom: { variants: ab((v) => slot(teaseRound, (p) => Object.assign(p.spin, { zoomOn: v, zoom: 0.3 })), ['Off', false], ['On', true]), window: teaseWin },
  'zoom-amount': { variants: ab((v) => slot(teaseRound, (p) => Object.assign(p.spin, { zoomOn: true, zoom: v })), ['10%', 0.1], ['50%', 0.5]), window: teaseWin },
  'scatter-lit': {
    variants: ab((v) => slot(() => [newRound('nearmiss', { seed: 14 })], (p) => Object.assign(p.spin, { scatterLit: v, zoomOn: false })), ['Off', false], ['On', true]),
    window: (tl) => {
      const R = R0(tl);
      const a = Math.min(...R.win.scatters.map(([c]) => R.reels[c].stop));
      return [a - 0.3, R.spinEnd + 0.3];
    },
  },

  // ---- Wins ----
  tiers: {
    make: () => slot(bigRound, (p) => (p.effects.coins = 1)),
    window: (tl) => {
      const ov = R0(tl).pres.overlay;
      return [ov.start, ov.countEnd + 0.4];
    },
  },
  'winfx-pop': { make: () => slot(winRound, (p) => (p.winfx.style = 'pop')), window: stepWin },
  'winfx-jump': { make: () => slot(winRound, jump()), window: stepWin },
  'winfx-merge': { make: () => slot(winRound, (p) => (p.winfx.style = 'merge')), window: stepWin },
  'path-line': { make: () => slot(winRound, jump('line')), window: stepWin },
  'path-arc': { make: () => slot(winRound, jump('arc')), window: stepWin },
  'path-back': { make: () => slot(winRound, jump('back')), window: stepWin },
  'merge-line': { make: () => slot(winRound, (p) => Object.assign(p.winfx, { style: 'merge', mergePath: 'line' })), window: stepWin },
  'merge-arc': { make: () => slot(winRound, (p) => Object.assign(p.winfx, { style: 'merge', mergePath: 'arc' })), window: stepWin },
  'merge-back': { make: () => slot(winRound, (p) => Object.assign(p.winfx, { style: 'merge', mergePath: 'back' })), window: stepWin },
  'merge-seq': { variants: ab((v) => slot(winRound, (p) => Object.assign(p.winfx, { style: 'merge', mergeSeq: v })), ['Together', 0], ['One by one', 1]), window: (tl) => stepFor(tl, 3) },
  lines: { variants: ab((v) => slot(oneLine, (p) => (p.effects.showLines = v)), ['Off', false], ['On', true]), window: (tl) => stepFor(tl, 1.6) },
  'line-glow': { variants: ab((v) => slot(oneLine, (p) => Object.assign(p.effects, { showLines: true, lineGlow: v })), ['Low', 0.15], ['High', 1.5]), window: (tl) => stepFor(tl, 1.6) },
  'pop-size': { variants: ab((v) => slot(oneLine, (p) => (p.effects.popScale = v)), ['Low', 0.03], ['High', 0.36]), window: (tl) => stepFor(tl, 1.6), focus: machineFocus },
  dim: { variants: ab((v) => slot(oneLine, (p) => (p.effects.dim = v)), ['Off', 0], ['On', 0.85]), window: (tl) => stepFor(tl, 1.6), focus: machineFocus },
  particles: { make: () => slot(oneLine, (p) => (p.effects.coins = 1)), window: (tl) => stepFor(tl, 2.2) },

  // ---- Effects ----
  shake: { variants: ab((v) => slot(bigRound, (p) => (p.effects.shake = v)), ['Off', 0], ['On', 2]), window: tierUpWin },
  'land-shake': { variants: ab((v) => slot(() => [newRound('medium', { seed: 52, lines: [0], count: 5 })], (p) => Object.assign(p.effects, { landShake: v, shake: 1.6 })), ['Off', false], ['On', true]), window: stopsWin },
  flash: { variants: ab((v) => slot(bigRound, (p) => (p.effects.flash = v)), ['Off', 0], ['On', 1.5]), window: tierUpWin },
  rays: { variants: ab((v) => slot(bigRound, (p) => (p.effects.rays = v)), ['Off', 0], ['On', 1.5]), window: overlayWin },
  // A narrow machine leaves the background in view.
  bokeh: {
    variants: ab(
      (v) =>
        slot(noWin, (p) => {
          p.effects.bokeh = v;
          p.grid.reels = 3;
        }),
      ['Off', 0],
      ['On', 2]
    ),
    window: (tl) => [R0(tl).t0, R0(tl).t0 + 3],
  },

  // ---- Wheel ----
  'wheel-center': { make: () => wheel((p) => (p.wheel.landing = 'center')), window: wheelLand, focus: pointerFocus },
  'wheel-random': { make: () => wheel((p) => (p.wheel.landing = 'random')), window: wheelLand, focus: pointerFocus },
  'wheel-tease': { make: () => wheel((p) => (p.wheel.landing = 'tease')), window: wheelLand, focus: pointerFocus },
  'wheel-slip': { make: () => wheel((p) => (p.wheel.landing = 'slip')), window: (tl) => { const w = R0(tl).pres.wheel; return [w.spinEnd - 2.4, w.prizeStart - 0.02]; }, focus: pointerFocus },
  'pointer-top': { make: () => wheel((p) => Object.assign(p.wheel, { pointer: 'top', landing: 'center' })), window: wheelLand },
  'pointer-bottom': { make: () => wheel((p) => Object.assign(p.wheel, { pointer: 'bottom', landing: 'center' })), window: wheelLand },
  'frame-full': { make: () => wheel((p) => (p.wheel.landing = 'center')), window: wheelLand },
  'frame-half': { make: () => wheel((p) => Object.assign(p.wheel, { size: 1.55, x: 0.5, y: 1.02, landing: 'center' })), window: wheelLand },
  'frame-close': { make: () => wheel((p) => Object.assign(p.wheel, { size: 2.3, x: 0.5, y: 1.42, landing: 'center' })), window: wheelLand },
  'frame-rise': { make: () => wheel((p) => Object.assign(p.wheel, { size: 1.55, x: 0.5, y: -0.02, pointer: 'bottom', landing: 'center' })), window: wheelLand },
  'wheel-push': {
    variants: ab((v) => wheel((p) => Object.assign(p.wheel, { push: v, landing: 'tease' })), ['Off', 0], ['On', 0.45]),
    window: (tl) => {
      const w = R0(tl).pres.wheel;
      return [w.slowFrom - 0.4, w.prizeStart - 0.02];
    },
  },
  'wheel-again': {
    make: () => wheel(undefined, () => [newRound('wheel', { seed: 3, wheelSegment: AGAIN_SEGMENT, wheelThen: 3, wheelLanding: 'center' })]),
    window: (tl) => {
      const w = R0(tl).pres.wheel;
      return [w.agains[0].at - 1.4, w.prizeStart + 0.4];
    },
  },
  'label-height': { variants: ab((v) => wheel((p) => Object.assign(p.wheel, { labelHeight: v, landing: 'center' })), ['Near the hub', 0.38], ['Further out', 0.72]), window: wheelSlow, focus: wheelFocus },
  // The icons alone, so they show wherever they sit.
  'icon-height': {
    variants: ab(
      (v) =>
        wheel((p) => {
          Object.assign(p.wheel, { iconHeight: v, landing: 'center' });
          p.wheel.show.labels = false;
        }),
      ['Near the hub', 0.38],
      ['Near the rim', 0.88]
    ),
    window: wheelSlow,
    focus: wheelFocus,
  },
  'seg-icons': {
    variants: ab(
      (on) =>
        wheel((p) => {
          const icons = autoIcons(p.wheel.segments);
          p.wheel.segments.forEach((s, i) => (s.icon = on ? icons[i] : null));
          p.wheel.landing = 'center';
        }),
      ['Off', false],
      ['On', true]
    ),
    window: wheelSlow,
    focus: wheelFocus,
  },

  // ---- Round features ----
  sticky: {
    make: () => slot(() => [newRound('freespins', { seed: 5, sticky: true }), newRound('small', { seed: 6, free: true, extraWilds: 2 }), newRound('none', { seed: 7, free: true })]),
    window: (tl) => {
      const R = tl.rounds[2];
      return [R.t0 - 0.2, R.spinEnd + 0.4];
    },
  },
  walking: {
    make: () =>
      slot(
        () => [newRound('freespins', { seed: 9, walking: true }), newRound('none', { seed: 10, free: true, extraWilds: 2 }), newRound('none', { seed: 11, free: true }), newRound('none', { seed: 12, free: true })],
        (p) => (p.spin.zoomOn = false)
      ),
    window: (tl) => [tl.rounds[2].t0 - 0.3, tl.rounds[3].t0 + 0.9],
  },
  retrigger: {
    make: () => slot(() => [newRound('freespins', { seed: 1, freeSpins: 6 }), newRound('freespins', { seed: 3, free: true, freeSpins: 4 })], (p) => (p.effects.coins = 1)),
    window: (tl) => {
      const b = tl.rounds[1].pres.banner;
      return [b.start - 0.5, b.start + 2.2];
    },
  },
  expand: {
    make: () => slot(() => [newRound('big', { seed: 53, lines: [0, 1, 2], count: 5, tier: 0, wildAssist: true, expandWild: true })]),
    window: (tl) => {
      const e = R0(tl).pres.expand;
      return e ? [e.start - 0.4, e.end + 0.6] : stepWin(tl);
    },
  },
  tumble: {
    make: () => {
      const p = quiet(candyProject());
      p.rounds = [newRound('small', { seed: 32, count: 8, chain: [{ symbol: 'auto', count: 8 }] })];
      return p;
    },
    window: (tl) => [R0(tl).spinEnd - 0.2, R0(tl).end],
  },
  'wild-mult': {
    make: () => slot(() => [newRound('medium', { seed: 5, lines: [0], count: 5, wildMults: [2, 3] })]),
    window: (tl) => {
      const R = R0(tl);
      return [R.pres.steps[0].start - 0.2, R.pres.mult.end + 0.2];
    },
  },
  mystery: {
    make: () => slot(() => [newRound('small', { seed: 7, lines: [1], count: 4, mystery: 3, tumble: false })]),
    window: (tl) => {
      const m = R0(tl).pres.mystery;
      return [m.start - 0.7, m.end + 0.6];
    },
  },
  cash: {
    make: () => slot(() => [newRound('none', { seed: 8, cash: [2, 5, 10] })]),
    window: (tl) => [firstStop(R0(tl)) - 0.4, R0(tl).spinEnd + 0.9],
  },
  collector: {
    make: () => slot(() => [newRound('none', { seed: 8, cash: [2, 5, 10], collector: true })]),
    window: (tl) => {
      const c = R0(tl).pres.collector;
      return [c.start - 0.6, c.end];
    },
  },
  boost: {
    make: () => slot(() => [newRound('medium', { seed: 52, lines: [1], count: 4, boosts: [{ kind: 'wild' }, { kind: 'upgrade' }] })], pots),
    window: boostWin,
    focus: potsAndReels,
  },
};

// The scenes a demo plays, in turn: the project to render (built bigger
// when the demo zooms in), its timeline and layout, the stretch to loop,
// the playback speed, and the view (the canvas offset of the focus). The
// variants of a demo share one framing, wide enough for each of them, so
// a size or a position compares like for like.
export function demoPlan(id) {
  const d = DEMOS[id];
  const scenes = (d.variants || [{ label: '', make: d.make }]).map((v) => {
    const project = v.make();
    const tl = buildTimeline(project);
    const L = computeLayout(project);
    const [a, b] = (v.window || d.window)(tl, L);
    const focusOf = v.focus || d.focus;
    return { label: v.label, project, tl, L, a, len: Math.max(0.5, b - a), rect: focusOf ? focusOf(tl, L) : null };
  });
  const rects = scenes.map((s) => s.rect).filter(Boolean);
  let focus = null;
  if (rects.length) {
    const x0 = Math.min(...rects.map((r) => r.x));
    const y0 = Math.min(...rects.map((r) => r.y));
    focus = fit(scenes[0].L, { x: x0, y: y0, w: Math.max(...rects.map((r) => r.x + r.w)) - x0, h: Math.max(...rects.map((r) => r.y + r.h)) - y0 }, 1);
    if (SIZE.width / focus.w <= 1.02) focus = null;
  }
  return scenes.map((s) => {
    let { project, tl, L } = s;
    let view = null;
    if (focus) {
      const z = SIZE.width / focus.w;
      project = { ...project, canvas: { ...project.canvas, width: Math.round(SIZE.width * z), height: Math.round(SIZE.height * z) } };
      tl = buildTimeline(project);
      L = computeLayout(project);
      view = { x: Math.round(focus.x * z), y: Math.round(focus.y * z) };
    }
    return { label: s.label, project, tl, L, a: s.a, b: s.a + s.len, speed: Math.max(d.slow ?? 1, s.len / DEMO_LOOP), view, focus };
  });
}

// The demo's whole loop: each scene's stretch played in turn. Returns the
// scene and its time at e seconds into the loop.
export function demoAt(plan, e) {
  const lens = plan.map((s) => (s.b - s.a) / s.speed);
  const total = lens.reduce((x, y) => x + y, 0);
  let u = ((e % total) + total) % total;
  for (let i = 0; i < plan.length; i++) {
    if (u < lens[i] || i === plan.length - 1) return { i, t: plan[i].a + Math.min(u, lens[i]) * plan[i].speed };
    u -= lens[i];
  }
  return { i: 0, t: plan[0].a };
}
