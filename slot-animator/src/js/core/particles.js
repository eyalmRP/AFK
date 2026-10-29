// Win particles: explosion templates, the particle art they throw, and the
// emitters the timeline schedules for every win moment. Pure and
// deterministic: the preview draws these particles and the After Effects
// export bakes the very same ones into layers.
//
// A particle moves on a closed form (gravity g, linear air drag k), so any
// frame can be evaluated on its own, here and in an AE expression:
//   x(a) = x0 + vx (1 - e^-ka) / k + sway
//   y(a) = y0 + (g / k) a + (vy - g / k)(1 - e^-ka) / k

import { mulberry32, hashSeed } from './rng.js';

const TAU = Math.PI * 2;
const lerp = (a, b, x) => a + (b - a) * x;
const MAX_PARTICLES = 140;
// Emitters that run long repeat a cycle of this many seconds, seamlessly:
// every particle lives less than a cycle and is born again each cycle.
export const LOOP = 5;
const LOOP_AFTER = 6;

// Built-in particle art. "variants" are still images picked at random
// (confetti colours); uploaded art can also be an animation.
export const BUILTIN_PARTICLES = [
  { id: 'coin', name: 'Gold coin', motion: 'flip', variants: 1 },
  { id: 'star', name: 'Stars', motion: 'spin', variants: 3 },
  { id: 'sparkle', name: 'Sparkle', motion: 'glow', variants: 1 },
  { id: 'gem', name: 'Gems', motion: 'spin', variants: 4 },
  { id: 'confetti', name: 'Confetti', motion: 'flutter', variants: 8 },
  { id: 'ember', name: 'Embers', motion: 'glow', variants: 2 },
  { id: 'chip', name: 'Casino chips', motion: 'flip', variants: 4 },
];

export const PARTICLE_MOTIONS = [
  { id: 'spin', label: 'Spin' },
  { id: 'flip', label: 'Flip like a coin' },
  { id: 'flutter', label: 'Flutter like confetti' },
  { id: 'glow', label: 'Glow and shrink' },
  { id: 'none', label: 'Straight' },
];

// Explosion templates. Short ones fire once when their moment starts;
// continuous ones keep emitting until the moment ends (a big win's count).
export const PARTICLE_TEMPLATES = [
  { id: 'burst-s', name: 'Small burst', kind: 'short', desc: 'A quick pop on the winning symbols.' },
  { id: 'burst-m', name: 'Medium burst', kind: 'short', desc: 'A fuller explosion that arcs and falls.' },
  { id: 'burst-l', name: 'Big burst', kind: 'short', desc: 'Two heavy waves that fill the screen.' },
  { id: 'ring', name: 'Ring blast', kind: 'short', desc: 'A clean ring that races outwards.' },
  { id: 'cannons', name: 'Confetti cannons', kind: 'short', desc: 'Two cannons fire from the bottom corners.' },
  { id: 'popper', name: 'Party popper', kind: 'short', desc: 'One cone shot up from the bottom centre.' },
  { id: 'magnet', name: 'Magnet', kind: 'short', desc: 'Particles rush in to the centre and vanish.' },
  { id: 'fountain', name: 'Fountain from below', kind: 'continuous', desc: 'A wide fountain from the bottom edge.' },
  { id: 'geyser', name: 'Geyser', kind: 'continuous', desc: 'A narrow column shooting up the middle.' },
  { id: 'rain', name: 'Rain', kind: 'continuous', desc: 'Falls from the top across the screen.' },
  { id: 'sides', name: 'Side streams', kind: 'continuous', desc: 'Streams arc in from the left and right.' },
  { id: 'fireworks', name: 'Fireworks', kind: 'continuous', desc: 'Bursts pop one after another up high.' },
  { id: 'spiral', name: 'Spiral', kind: 'continuous', desc: 'Three arms wind out from the centre.' },
  { id: 'shimmer', name: 'Shimmer', kind: 'continuous', desc: 'Particles twinkle in place around the win.' },
];
export const TEMPLATE_BY_ID = Object.fromEntries(PARTICLE_TEMPLATES.map((t) => [t.id, t]));

// What plays when. Tiers carry their own pick (tier.particles); these are
// the other moments.
export const PARTICLE_MOMENTS = [
  { id: 'small', label: 'Small wins', hint: 'On the winning symbols, every win step' },
  { id: 'medium', label: 'Medium wins' },
  { id: 'feature', label: 'Feature triggers', hint: 'Free spins, bonus and Hold & Spin banners' },
  { id: 'wheel', label: 'Wheel prize' },
  { id: 'total', label: 'Totals', hint: 'Free spins total and the Hold & Spin collect' },
  { id: 'grand', label: 'Grand (full board)' },
  { id: 'ambient', label: 'Ambient (always on)', hint: 'Behind the machine for the whole animation' },
];

// How long a continuous template runs once its moment starts.
export const PARTICLE_LENGTHS = [
  { id: 'moment', label: 'Runs during the win', hint: 'Keeps going while the win shows' },
  { id: 'round', label: 'Runs to next round', hint: 'Keeps going until the next round starts' },
  { id: 'always', label: 'Runs to the end ↻', hint: 'Keeps going to the last frame, looping seamlessly' },
];

export function defaultParticles() {
  return {
    assets: [],
    small: { fx: 'burst-s', asset: 'sparkle' },
    medium: { fx: 'burst-m', asset: 'coin' },
    feature: { fx: 'cannons', asset: 'confetti' },
    wheel: { fx: 'fountain', asset: 'coin' },
    total: { fx: 'fountain', asset: 'coin' },
    grand: { fx: 'rain', asset: 'coin' },
    ambient: { fx: 'none', asset: 'sparkle' },
  };
}

// Tiers stack: each tier's particles start when its title lands and keep
// going (continuous) until the count ends, on top of the tiers below.
const TIER_DEFAULTS = [
  { fx: 'fountain', asset: 'coin' },
  { fx: 'rain', asset: 'coin' },
  { fx: 'fireworks', asset: 'star' },
  { fx: 'cannons', asset: 'confetti' },
  { fx: 'geyser', asset: 'gem' },
  { fx: 'spiral', asset: 'sparkle' },
];
export function tierParticles(project, k) {
  const t = project.tiers?.[k];
  return (t && t.particles) || TIER_DEFAULTS[Math.min(k, TIER_DEFAULTS.length - 1)];
}

// Everything the renderer and the exporter need to know about a particle
// asset without loading it.
export function particleAssetInfo(project, id) {
  const b = BUILTIN_PARTICLES.find((p) => p.id === id);
  if (b) return { id, name: b.name, motion: b.motion, count: b.variants, anim: false, fps: 24, builtin: true };
  const a = (project.particles?.assets || []).find((p) => p.id === id);
  if (!a) return particleAssetInfo(project, 'coin');
  const count = a.kind === 'frames' ? a.srcs.length : a.kind === 'sheet' ? Math.max(1, a.count | 0) : 1;
  return { id, name: a.name || 'Particle', motion: a.motion || 'spin', count, anim: count > 1, fps: a.fps || 24, builtin: false };
}

export function particleAssets(project) {
  return [...BUILTIN_PARTICLES.map((b) => b.id), ...(project.particles?.assets || []).map((a) => a.id)];
}

// ---------- scheduling ----------

// The configured pick for a moment, with the round's own choices on top.
function pick(cfg, fxOver, assetOver) {
  const fx = fxOver || cfg?.fx;
  if (!fx || fx === 'none' || !TEMPLATE_BY_ID[fx]) return null;
  const asset = assetOver || (cfg?.asset && cfg.asset !== 'auto' ? cfg.asset : 'coin');
  return { fx, asset };
}

// Emitters for every round: { round, moment, label, fx, asset, start, end,
// cut, focus, layer, seed }. "under" emitters sit behind a presentation's
// title and counter, "over" ones on top of everything.
export function scheduleParticles(tl, project) {
  const cfg = { ...defaultParticles(), ...(project.particles || {}) };
  const all = [];
  for (const R of tl.rounds) {
    const p = R.pres;
    const round = project.rounds[R.index] || {};
    const rp = round.particles || {};
    const over = rp.fx && rp.fx !== 'auto' ? rp.fx : null;
    const assetOver = rp.asset && rp.asset !== 'auto' ? rp.asset : null;
    if (over === 'none') {
      p.particles = [];
      continue;
    }
    const list = [];
    const cut = (t) => Math.min(t, R.next + 0.4);
    const add = (moment, label, c, start, end, cutAt, focus, layer) => {
      const sel = pick(c, over, assetOver);
      if (!sel) return;
      const short = TEMPLATE_BY_ID[sel.fx].kind === 'short';
      // Continuous templates can keep going past their moment: until the
      // next round, or to the end of the animation (drawn over everything).
      const len = short ? 'moment' : c?.length || 'moment';
      let endAt = short ? start : Math.max(start + 0.3, end);
      let cutTo = Math.max(start + 0.3, cut(cutAt));
      if (len === 'round') {
        endAt = Math.max(endAt, R.next);
        cutTo = Math.max(cutTo, R.next + 0.4);
        layer = 'over';
      } else if (len === 'always') {
        endAt = tl.duration;
        cutTo = tl.duration;
        layer = 'over';
      }
      list.push({
        id: `${R.index}-${list.length}`,
        round: R.index,
        moment,
        label,
        fx: sel.fx,
        asset: sel.asset,
        start,
        end: endAt,
        cut: cutTo,
        focus,
        layer,
        main: len === 'always',
        loop: !short && endAt - start > LOOP_AFTER ? LOOP : 0,
        seed: hashSeed('particles', round.seed ?? R.index, R.index, list.length),
      });
    };
    // A big win (or a total that climbs through the tiers) stacks one
    // emitter per title it reaches, each from the moment that title lands.
    const ov = p.overlay;
    if (ov) {
      const from = (k) => (k === 0 ? ov.countStart - 0.2 : ov.tierTimes[k]);
      if (over) add(ov.tiers[0] === 'total' ? 'total' : 'tier', 'Big win', ov.tiers[0] === 'total' ? cfg.total : tierParticles(project, 0), from(0), ov.countEnd, ov.end, { kind: 'screen' }, 'under');
      else {
        ov.tiers.forEach((id, k) => {
          if (id === 'total') return add('total', 'Total', cfg.total, from(k), ov.countEnd, ov.end, { kind: 'screen' }, 'under');
          const ti = Math.max(0, (project.tiers || []).findIndex((t) => t.id === id));
          const tier = project.tiers?.[ti];
          add('tier', tier ? tier.title : `Tier ${k + 1}`, tierParticles(project, ti), from(k), ov.countEnd, ov.end, { kind: 'screen' }, 'under');
        });
      }
    }
    if (p.grand) add('grand', 'Grand', cfg.grand, p.grand.start + 0.1, p.grand.countEnd, p.grand.end, { kind: 'screen' }, 'under');
    // A Major jackpot's full-screen moment throws the Grand's particles.
    for (const sh of p.jpShows || []) add('jackpot', 'Major jackpot', cfg.grand, sh.start + 0.1, sh.countEnd, sh.end, { kind: 'screen' }, 'under');
    if (p.banner) add('feature', 'Feature', cfg.feature, p.banner.start + 0.1, p.banner.end - 0.5, p.banner.end + 0.6, { kind: 'screen' }, 'over');
    if (p.wheel && !p.wheel.noWin) add('wheel', 'Wheel prize', cfg.wheel, p.wheel.prizeStart, p.wheel.prizeStart + 1.2, p.wheel.outEnd, { kind: 'wheel' }, 'under');
    if (p.coinBurst) add('medium', 'Medium win', cfg.medium, p.coinBurst.start, p.coinBurst.start + 0.6, (p.steps?.length ? p.steps[p.steps.length - 1].end : p.coinBurst.start + 2) + 0.6, { kind: 'window' }, 'over');
    else if (!ov && R.outcome !== 'big') {
      for (const st of p.steps || []) {
        if (!(st.amount > 0) || !st.cells.length) continue;
        add('small', 'Win', cfg.small, st.start + 0.05, st.end - 0.3, st.end + 0.6, { kind: 'cells', cells: st.cells }, 'over');
      }
    }
    p.particles = list;
    all.push(...list);
  }
  // Ambient: behind the machine, from the first frame to the last, looping.
  // It starts one cycle early so the first frame is already full.
  const amb = cfg.ambient;
  if (amb && amb.fx !== 'none' && TEMPLATE_BY_ID[amb.fx]) {
    all.push({ id: 'ambient', round: -1, moment: 'ambient', label: 'Ambient', fx: amb.fx, asset: amb.asset || 'sparkle', start: -LOOP, end: tl.duration, cut: tl.duration, focus: { kind: 'screen' }, layer: 'back', main: true, loop: LOOP, seed: hashSeed('particles', 'ambient', project.seed ?? 0) });
  }
  return all;
}

// ---------- spawning ----------

function focusOf(em, L) {
  const f = em.focus || { kind: 'screen' };
  if (f.kind === 'cells' && f.cells && f.cells.length && L.cellCenter) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let sx = 0;
    let sy = 0;
    for (const [c, r] of f.cells) {
      const m = L.cellCenter(c, r);
      sx += m.x;
      sy += m.y;
      x0 = Math.min(x0, m.x);
      x1 = Math.max(x1, m.x);
      y0 = Math.min(y0, m.y);
      y1 = Math.max(y1, m.y);
    }
    const n = f.cells.length;
    return { x: sx / n, y: sy / n, w: x1 - x0 + L.cellW, h: y1 - y0 + L.cellH };
  }
  if (f.kind === 'window' && L.winW) return { x: L.winX + L.winW / 2, y: L.winCY, w: L.winW, h: L.winH };
  if (f.kind === 'wheel') {
    const pl = L.wheel ? L.wheel.plaque : { x: L.W / 2, y: L.H * 0.54, R: L.H * 0.36 };
    return { x: pl.x, y: pl.y, w: pl.R * 2, h: pl.R * 2 };
  }
  return { x: L.W / 2, y: L.H * (L.portrait ? 0.4 : 0.42), w: L.W * 0.7, h: L.H * 0.5 };
}

// Template shapes: each returns where particle i is born and how it moves.
// E: { start, end, x, y, w, h (focus box), W, H, u (cell size), flutter }.
const SHAPES = {
  'burst-s': { n: 26, size: [0.16, 0.28], spawn: (i, n, r, E) => burst(r, E, 0.04, [0.35, 0.7], 1.1, 1.8, [0.9, 1.3]) },
  'burst-m': { n: 50, size: [0.2, 0.34], spawn: (i, n, r, E) => burst(r, E, 0.1, [0.5, 1.05], 1.4, 1.4, [1.2, 1.7]) },
  'burst-l': { n: 96, size: [0.24, 0.42], spawn: (i, n, r, E) => burst(r, E, 0.06, [0.75, 1.6], 1.6, 1.1, [1.6, 2.3], i % 2 ? 0.28 : 0) },
  ring: {
    n: 40,
    size: [0.2, 0.3],
    spawn: (i, n, r, E) => {
      const ang = (i / n) * TAU + r() * 0.05;
      const sp = E.H * 0.95 * lerp(0.97, 1.03, r());
      return { b: E.start, x: E.x, y: E.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: E.H * 0.25, k: 2.4, l: lerp(1.0, 1.2, r()) };
    },
  },
  cannons: {
    n: 120,
    size: [0.18, 0.3],
    spawn: (i, n, r, E) => {
      const side = i % 2 ? 1 : -1;
      const ang = -Math.PI / 2 - side * lerp(0.3, 0.75, r());
      const sp = E.H * lerp(2.0, 2.8, r());
      return { b: E.start + r() * 0.18 + (i % 4 < 2 ? 0 : 0.32), x: side > 0 ? E.W + E.u * 0.3 : -E.u * 0.3, y: E.H + E.u * 0.2, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: E.H * 1.1, k: 1.7, l: lerp(2.8, 3.6, r()) };
    },
  },
  popper: {
    n: 90,
    size: [0.18, 0.3],
    spawn: (i, n, r, E) => {
      const ang = -Math.PI / 2 + (r() - 0.5) * 0.9;
      const sp = E.H * lerp(1.9, 2.7, r());
      return { b: E.start + r() * 0.12, x: E.W / 2 + (r() - 0.5) * E.u * 0.4, y: E.H + E.u * 0.2, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: E.H * 1.1, k: 1.7, l: lerp(2.8, 3.4, r()) };
    },
  },
  magnet: {
    n: 44,
    size: [0.16, 0.3],
    spawn: (i, n, r, E) => {
      const ang = r() * TAU;
      const d = Math.min(E.W, E.H) * lerp(0.32, 0.55, r());
      const x0 = E.x + Math.cos(ang) * d;
      const y0 = E.y + Math.sin(ang) * d;
      const l = lerp(0.55, 0.8, r());
      const k = 3;
      const q = k / (1 - Math.exp(-k * l));
      return { b: E.start + r() * 0.35, x: x0, y: y0, vx: (E.x - x0) * q, vy: (E.y - y0) * q, g: 0, k, l, fo: 0.08 };
    },
  },
  fountain: {
    rate: 38,
    size: [0.3, 0.6],
    spawn: (i, n, r, E) => ({ b: stream(i, n, r, E), x: E.W / 2 + (r() - 0.5) * E.W * 0.25, y: E.H * 1.02, vx: (r() - 0.5) * E.W, vy: -E.H * lerp(1.15, 1.75, r()), g: E.H * 2.6, k: 0, l: 2.4 }),
  },
  geyser: {
    rate: 34,
    size: [0.26, 0.5],
    spawn: (i, n, r, E) => ({ b: stream(i, n, r, E), x: E.W / 2 + (r() - 0.5) * E.u * 0.6, y: E.H * 1.02, vx: (r() - 0.5) * E.W * 0.22, vy: -E.H * lerp(1.5, 2.0, r()), g: E.H * 2.4, k: 0, l: 2.0 }),
  },
  rain: {
    rate: 30,
    size: [0.26, 0.5],
    spawn: (i, n, r, E) => ({ b: stream(i, n, r, E), x: r() * E.W, y: -E.u * 0.5, vx: (r() - 0.5) * E.W * 0.05, vy: E.H * lerp(0.25, 0.55, r()), g: E.H * 0.9, k: 0, l: 2.6 }),
  },
  sides: {
    rate: 36,
    size: [0.24, 0.44],
    spawn: (i, n, r, E) => {
      const side = i % 2 ? 1 : -1;
      return { b: stream(i, n, r, E), x: side > 0 ? E.W + E.u * 0.3 : -E.u * 0.3, y: E.H * lerp(0.55, 0.75, r()), vx: -side * E.W * lerp(0.45, 0.8, r()), vy: -E.H * lerp(0.5, 1.0, r()), g: E.H * 1.6, k: 0, l: 2.0 };
    },
  },
  fireworks: {
    rate: 38,
    size: [0.14, 0.26],
    spawn: (i, n, r, E) => {
      const m = 16;
      const j = Math.floor(i / m);
      const rb = mulberry32(E.seed + j * 7919);
      const cx = E.W * lerp(0.15, 0.85, rb());
      const cy = E.H * lerp(0.12, 0.45, rb());
      const ang = ((i % m) / m) * TAU + r() * 0.2;
      const sp = E.H * lerp(0.32, 0.42, r());
      const gap = Math.max(0.3, (E.end - E.start) / Math.ceil(n / m));
      return { b: E.start + j * gap + r() * 0.02, x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: E.H * 0.45, k: 1.6, l: lerp(1.1, 1.4, r()) };
    },
  },
  spiral: {
    rate: 50,
    size: [0.16, 0.3],
    spawn: (i, n, r, E) => {
      const b = E.start + (E.end - E.start) * (i / n);
      const ang = (b - E.start) * TAU * 0.7 + (i % 3) * (TAU / 3);
      const sp = E.H * 0.55;
      return { b, x: E.x, y: E.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: 0, k: 0.6, l: 1.5 };
    },
  },
  shimmer: {
    rate: 22,
    size: [0.14, 0.3],
    spawn: (i, n, r, E) => ({ b: stream(i, n, r, E), x: E.x + (r() - 0.5) * E.w, y: E.y + (r() - 0.5) * E.h, vx: 0, vy: 0, g: 0, k: 0, l: lerp(0.6, 1.1, r()), tw: 1 }),
  },
};

function burst(r, E, spread, speed, g, k, life, delay = 0) {
  const ang = r() * TAU;
  const sp = E.H * lerp(speed[0], speed[1], r());
  return { b: E.start + delay + r() * spread, x: E.x + (r() - 0.5) * E.u * 0.3, y: E.y + (r() - 0.5) * E.u * 0.3, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - E.H * 0.25, g: E.H * g, k, l: lerp(life[0], life[1], r()) };
}

function stream(i, n, r, E) {
  return E.start + (E.end - E.start) * ((i + r()) / n);
}

export function particleCount(em, amount = 1) {
  const shape = SHAPES[em.fx];
  if (!shape) return 0;
  const span = em.loop || em.end - em.start;
  const base = shape.n || Math.max(12, Math.round(shape.rate * Math.max(0.3, span)));
  return Math.max(0, Math.min(MAX_PARTICLES, Math.round(base * Math.max(0, amount))));
}

// Every particle of an emitter, laid out for L. motion: the asset's motion.
// Fields: b birth, l life, x y vx vy g k, s size (px), r0 rv (deg, deg/s),
// f ph (flip/flutter rate and phase), sw sf (sway), v variant, fo fade-out,
// tw twinkle.
export function spawnParticles(em, L, motion = 'spin', amount = 1) {
  const shape = SHAPES[em.fx];
  if (!shape) return [];
  const n = particleCount(em, amount);
  const r = mulberry32(em.seed);
  const f = focusOf(em, L);
  const flutter = motion === 'flutter';
  // A looping emitter lays out one cycle; particles live less than a cycle.
  const E = { start: em.start, end: em.loop ? em.start + em.loop * 0.98 : em.end, x: f.x, y: f.y, w: f.w, h: f.h, W: L.W, H: L.H, u: L.cellW, seed: em.seed };
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = shape.spawn(i, n, r, E);
    const q = {
      b: p.b,
      l: Math.min(em.loop ? em.loop - 0.05 : Infinity, p.l * (flutter && p.k < 1.6 && !p.tw ? 1.25 : 1)),
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      g: p.g,
      k: flutter && !p.tw && p.g > 0 ? Math.max(p.k, 1.6) : p.k,
      s: L.cellW * lerp(shape.size[0], shape.size[1], r()),
      r0: r() * 360 - 180,
      rv: motion === 'glow' || p.tw ? 0 : (r() < 0.5 ? -1 : 1) * lerp(90, motion === 'spin' ? 420 : 200, r()),
      f: lerp(flutter ? 6 : 5, flutter ? 12 : 14, r()),
      ph: r() * TAU,
      sw: flutter ? L.cellW * lerp(0.06, 0.2, r()) : 0,
      sf: lerp(3, 6, r()),
      v: Math.floor(r() * 1000),
      fo: p.fo || Math.min(0.35, p.l * 0.3),
      tw: p.tw ? 1 : 0,
    };
    out.push(q);
  }
  return out;
}

// A particle of a looping emitter is born again every `loop` seconds.
export function particleTime(p, t, loop) {
  if (!loop || t < p.b) return t;
  return p.b + ((t - p.b) % loop);
}

// One particle at time t: position, rotation (deg), scale x/y, alpha, or
// null while it is not alive.
export function particleAt(p, t, motion = 'spin') {
  const a = t - p.b;
  if (a < 0 || a > p.l) return null;
  let x;
  let y;
  if (p.k > 0.001) {
    const e = (1 - Math.exp(-p.k * a)) / p.k;
    x = p.x + p.vx * e;
    y = p.y + (p.g / p.k) * a + (p.vy - p.g / p.k) * e;
  } else {
    x = p.x + p.vx * a;
    y = p.y + p.vy * a + 0.5 * p.g * a * a;
  }
  if (p.sw) x += p.sw * Math.sin(a * p.sf + p.ph);
  let sx = 1;
  let sy = 1;
  const w = Math.max(0.08, Math.abs(Math.cos(a * p.f + p.ph)));
  if (motion === 'flip') sx = w;
  else if (motion === 'flutter') sy = w;
  else if (motion === 'glow') sx = sy = 1 - 0.65 * (a / p.l);
  else if (motion === 'spin') sx = sy = 0.4 + 0.6 * Math.min(1, a / 0.15);
  let alpha = Math.min(1, a / 0.06, (p.l - a) / p.fo);
  if (p.tw) {
    const k = Math.sin((Math.PI * a) / p.l);
    sx *= k;
    sy *= k;
    alpha = k;
  }
  return { x, y, rot: p.r0 + p.rv * a, sx, sy, alpha: Math.max(0, alpha) };
}
