// Mini demos for the tooltips: a tiny project that shows one option, and
// the stretch of its timeline to loop. The editor renders them with the
// real renderer at a small size. Pure: projects and time windows only.

import { defaultProject, candyProject, holdSpinProject, wheelProject, newRound, SPIN_PRESETS, AGAIN_SEGMENT } from '../core/defaults.js';

const SIZE = { width: 480, height: 270, fps: 30 };

function small(p) {
  p.canvas = { ...SIZE };
  p.machine.showHud = false;
  p.sound.enabled = false;
  p.particles.ambient = { fx: 'none', asset: 'sparkle' };
  return p;
}

const slot = (rounds, patch = () => {}) => {
  const p = small(defaultProject());
  p.rounds = rounds();
  patch(p);
  return p;
};
const spinType = (type) => (p) => Object.assign(p.spin, { type, ...SPIN_PRESETS[type] });
const winRound = () => [newRound('medium', { seed: 52, lines: [1, 2], count: 4 })];
const smallWin = () => [newRound('small', { seed: 12, lines: [0], count: 3 })];

// Loop windows.
const R0 = (tl) => tl.rounds[0];
const spinWin = (tl) => [R0(tl).t0 - 0.05, R0(tl).spinEnd + 0.6];
const startWin = (tl) => [R0(tl).t0 - 0.05, R0(tl).t0 + 1.3];
const endWin = (tl) => {
  const R = R0(tl);
  const first = Math.min(...R.reels.map((ri) => ri.stop));
  return [first - 0.7, R.spinEnd + 0.5];
};
const stepWin = (tl) => {
  const R = R0(tl);
  const st = R.pres.steps?.[0];
  return st ? [st.start - 0.3, Math.min(st.end, st.start + 3)] : spinWin(tl);
};
const wheelLand = (tl) => {
  const w = R0(tl).pres.wheel;
  return [w.spinEnd - 2.2, w.spinEnd + 1.2];
};

const wheel = (patch = () => {}, rounds) => {
  const p = small(wheelProject());
  p.rounds = rounds ? rounds() : [newRound('wheel', { seed: 3, wheelSegment: 3 })];
  patch(p);
  return p;
};

export const DEMOS = {
  'spin-classic': { make: () => slot(smallWin, spinType('classic')), window: spinWin },
  'spin-stagger': { make: () => slot(smallWin, spinType('stagger')), window: spinWin },
  'spin-turbo': { make: () => slot(smallWin, spinType('turbo')), window: spinWin },
  'spin-tease': { make: () => slot(() => [newRound('none', { seed: 21 })], spinType('tease')), window: spinWin },
  'spin-cascade': { make: () => slot(smallWin, spinType('cascade')), window: spinWin },
  'spin-cells': { make: () => slot(smallWin, spinType('cells')), window: spinWin },
  'start-windup': { make: () => slot(smallWin, (p) => Object.assign(p.spin, { startStyle: 'windup', windup: 0.5, startDuration: 0.5 })), window: startWin },
  'start-ease': { make: () => slot(smallWin, (p) => Object.assign(p.spin, { startStyle: 'ease', startDuration: 0.5 })), window: startWin },
  'start-instant': { make: () => slot(smallWin, (p) => Object.assign(p.spin, { startStyle: 'instant' })), window: startWin },
  'end-bounce': { make: () => slot(smallWin, (p) => Object.assign(p.spin, { endStyle: 'bounce', overshoot: 0.35 })), window: endWin },
  'end-elastic': { make: () => slot(smallWin, (p) => Object.assign(p.spin, { endStyle: 'elastic', overshoot: 0.35 })), window: endWin },
  'end-hard': { make: () => slot(smallWin, (p) => Object.assign(p.spin, { endStyle: 'hard' })), window: endWin },
  'end-soft': { make: () => slot(smallWin, (p) => Object.assign(p.spin, { endStyle: 'soft' })), window: endWin },
  blur: { make: () => slot(smallWin, (p) => Object.assign(p.spin, { blur: 1, speed: 34 })), window: spinWin },
  anticipation: { make: () => slot(() => [newRound('none', { seed: 3, antic: [3, 4] })], (p) => (p.spin.zoomOn = false)), window: spinWin },
  zoom: { make: () => slot(() => [newRound('none', { seed: 3, antic: [3, 4] })], (p) => Object.assign(p.spin, { zoomOn: true, zoom: 0.3 })), window: spinWin },
  'scatter-lit': {
    make: () => slot(() => [newRound('nearmiss', { seed: 14 })], (p) => Object.assign(p.spin, { scatterLit: true, zoomOn: false })),
    window: (tl) => {
      const R = R0(tl);
      const a = Math.min(...R.win.scatters.map(([c]) => R.reels[c].stop));
      return [a - 0.4, R.spinEnd + 0.5];
    },
  },
  'row-lines': { make: () => slot(smallWin, (p) => (p.machine.rowLines = true)), window: spinWin },
  tiers: { make: () => slot(() => [newRound('big', { seed: 15, lines: [0, 3], count: 5, symbol: 's7', tier: 1 })]), window: (tl) => { const ov = R0(tl).pres.overlay; return [ov.start, ov.countEnd + 0.4]; } },
  'winfx-pop': { make: () => slot(winRound, (p) => (p.winfx.style = 'pop')), window: stepWin },
  'winfx-jump': { make: () => slot(winRound, (p) => (p.winfx.style = 'jump')), window: stepWin },
  'winfx-merge': { make: () => slot(winRound, (p) => (p.winfx.style = 'merge')), window: stepWin },
  'path-line': { make: () => slot(winRound, (p) => Object.assign(p.winfx, { style: 'jump', jumpPath: 'line' })), window: stepWin },
  'path-arc': { make: () => slot(winRound, (p) => Object.assign(p.winfx, { style: 'jump', jumpPath: 'arc' })), window: stepWin },
  'path-back': { make: () => slot(winRound, (p) => Object.assign(p.winfx, { style: 'jump', jumpPath: 'back' })), window: stepWin },
  'merge-line': { make: () => slot(winRound, (p) => Object.assign(p.winfx, { style: 'merge', mergePath: 'line' })), window: stepWin },
  'merge-arc': { make: () => slot(winRound, (p) => Object.assign(p.winfx, { style: 'merge', mergePath: 'arc' })), window: stepWin },
  'merge-back': { make: () => slot(winRound, (p) => Object.assign(p.winfx, { style: 'merge', mergePath: 'back' })), window: stepWin },
  'merge-seq': { make: () => slot(winRound, (p) => Object.assign(p.winfx, { style: 'merge', mergeSeq: 1 })), window: stepWin },
  lines: { make: () => slot(() => [newRound('medium', { seed: 52, lines: [1, 2], count: 4 })], (p) => (p.winfx.style = 'pop')), window: stepWin },
  particles: { make: () => slot(() => [newRound('big', { seed: 15, lines: [0, 3], count: 5, symbol: 's7', tier: 0 })]), window: (tl) => { const ov = R0(tl).pres.overlay; return [ov.countStart - 0.3, ov.countEnd + 0.4]; } },
  shake: { make: () => slot(() => [newRound('big', { seed: 15, lines: [0, 3], count: 5, symbol: 's7', tier: 1 })], (p) => (p.effects.shake = 1.6)), window: (tl) => { const ov = R0(tl).pres.overlay; return [ov.start - 0.4, ov.tierTimes[ov.tierTimes.length - 1] + 1]; } },
  'land-shake': { make: () => slot(() => [newRound('medium', { seed: 52, lines: [0], count: 5 })], (p) => Object.assign(p.effects, { landShake: true, shake: 1.6 })), window: spinWin },
  sticky: {
    make: () => slot(() => [newRound('freespins', { seed: 5, sticky: true }), newRound('small', { seed: 6, free: true, extraWilds: 2 }), newRound('none', { seed: 7, free: true })]),
    window: (tl) => {
      const R = tl.rounds[2];
      return [R.t0 - 0.2, R.spinEnd + 0.4];
    },
  },
  expand: { make: () => slot(() => [newRound('big', { seed: 53, lines: [0, 1, 2], count: 5, tier: 0, wildAssist: true, expandWild: true })]), window: (tl) => { const e = R0(tl).pres.expand; return e ? [e.start - 0.4, e.end + 0.8] : stepWin(tl); } },
  tumble: {
    make: () => {
      const p = small(candyProject());
      p.rounds = [newRound('small', { seed: 32, count: 8, chain: [{ symbol: 'auto', count: 8 }] })];
      return p;
    },
    window: (tl) => [R0(tl).spinEnd - 0.2, R0(tl).end],
  },
  'wheel-center': { make: () => wheel((p) => (p.wheel.landing = 'center')), window: wheelLand },
  'wheel-random': { make: () => wheel((p) => (p.wheel.landing = 'random')), window: wheelLand },
  'wheel-tease': { make: () => wheel((p) => (p.wheel.landing = 'tease')), window: wheelLand },
  'wheel-slip': { make: () => wheel((p) => (p.wheel.landing = 'slip')), window: (tl) => { const w = R0(tl).pres.wheel; return [w.spinEnd - 2.6, w.spinEnd + 1.2]; } },
  'pointer-bottom': { make: () => wheel((p) => Object.assign(p.wheel, { pointer: 'bottom', landing: 'center' })), window: wheelLand },
  'frame-half': { make: () => wheel((p) => Object.assign(p.wheel, { size: 1.55, x: 0.5, y: 1.02, landing: 'center' })), window: wheelLand },
  'frame-close': { make: () => wheel((p) => Object.assign(p.wheel, { size: 2.3, x: 0.5, y: 1.42, landing: 'center' })), window: wheelLand },
  'frame-rise': { make: () => wheel((p) => Object.assign(p.wheel, { size: 1.55, x: 0.5, y: -0.02, pointer: 'bottom', landing: 'center' })), window: wheelLand },
  'wheel-push': { make: () => wheel((p) => Object.assign(p.wheel, { push: 0.45, landing: 'tease' })), window: (tl) => { const w = R0(tl).pres.wheel; return [w.slowFrom - 0.4, w.spinEnd + 1]; } },
  'wheel-again': {
    make: () => wheel(undefined, () => [newRound('wheel', { seed: 3, wheelSegment: AGAIN_SEGMENT, wheelThen: 3, wheelLanding: 'center' })]),
    window: (tl) => {
      const w = R0(tl).pres.wheel;
      return [w.agains[0].at - 1.4, w.spinEnd + 1];
    },
  },
  retrigger: {
    make: () => slot(() => [newRound('freespins', { seed: 1, freeSpins: 6 }), newRound('freespins', { seed: 3, free: true, freeSpins: 4 })]),
    window: (tl) => {
      const b = tl.rounds[1].pres.banner;
      return [b.start - 0.5, b.start + 2.2];
    },
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
      return [m.start - 0.7, m.end + 1.2];
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
  collector: {
    make: () => slot(() => [newRound('none', { seed: 8, cash: [2, 5, 10], collector: true })]),
    window: (tl) => {
      const c = R0(tl).pres.collector;
      return [c.start - 0.6, c.end];
    },
  },
  holdspin: {
    make: () => {
      const p = small(holdSpinProject());
      p.rounds = p.rounds.slice(0, 3);
      return p;
    },
    window: (tl) => [tl.rounds[0].t0, tl.rounds[2].end],
  },
};

// Loops longer than this play faster, so every demo stays short.
export const DEMO_LOOP = 4;

export function demoWindow(id, tl) {
  const d = DEMOS[id];
  const [a, b] = d.window(tl);
  const len = Math.max(0.5, b - a);
  return { a, b: a + len, speed: Math.max(1, len / DEMO_LOOP) };
}

