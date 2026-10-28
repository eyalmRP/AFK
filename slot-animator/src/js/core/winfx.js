import { potsConfig } from './pots.js';

// Winning symbols: how the winners of a win step behave once they light up.
//   pop     - they pop and pulse in their cells (the classic look),
//   jump    - they pop, then fly one by one into the score; each landing
//             counts up the win meter,
//   merge   - they pop, are pulled together like magnets and fuse into one
//             big symbol,
//   collect - they pop, then each fires a beam up into its pot above the
//             machine (core/pots.js); each catch counts up the win.
// The timeline schedules the times (layout free); the motion below turns
// them into positions for a layout. The preview and the After Effects
// expressions evaluate the same formulas.

export const WIN_STYLES = [
  { id: 'pop', label: 'Pop in place', short: 'Pop', hint: 'Winners pop and pulse in their cells.' },
  { id: 'jump', label: 'Jump into the score', short: 'Jump to score', hint: 'Winners pop, then fly one by one to the landing spot; every landing counts up the win.' },
  { id: 'merge', label: 'Magnet merge', short: 'Merge', hint: 'Winners pop, get pulled together and fuse into one big symbol.' },
  { id: 'collect', label: 'Beam to the pots', short: 'Beam to pots', hint: 'Every winner fires a beam up into its pot above the machine, one by one; the pots collect the win. Needs the pots on.' },
];

export const JUMP_TARGETS = [
  { id: 'meter', label: 'Win meter' },
  { id: 'amount', label: 'Win amount' },
  { id: 'top', label: 'Above the reels' },
  { id: 'center', label: 'Screen centre' },
  { id: 'custom', label: 'Custom position' },
];

// How a winner travels: straight, on an arc, or with a wind-up that pulls
// back first (an anticipation) before it shoots to the target.
export const FLIGHT_PATHS = [
  { id: 'line', label: 'Straight' },
  { id: 'arc', label: 'Arc' },
  { id: 'back', label: 'Wind-up' },
];

export const MERGE_POINTS = [
  { id: 'window', label: 'Middle of the reels' },
  { id: 'cells', label: 'Middle of the winning symbols' },
  { id: 'center', label: 'Screen centre' },
  { id: 'custom', label: 'Custom position' },
];

export function defaultWinFx() {
  return {
    style: 'pop',
    target: 'meter',
    jx: 0.5,
    jy: 0.88,
    point: 'window',
    mx: 0.5,
    my: 0.5,
    flight: 0.55,
    stagger: 0.08,
    bigScale: 2.2,
    jumpPath: 'arc',
    mergePath: 'line',
    mergeSeq: 0,
  };
}

export function winFxConfig(project) {
  return { ...defaultWinFx(), ...(project.winfx || {}) };
}

// The style a round uses: its own pick, or the project's.
// Beaming to the pots needs the pots; without them winners pop.
export function winStyleOf(project, round) {
  const own = round && round.winStyle;
  let s = own && own !== 'auto' && WIN_STYLES.some((x) => x.id === own) ? own : winFxConfig(project).style;
  if (!WIN_STYLES.some((x) => x.id === s)) s = 'pop';
  return s === 'collect' && !potsConfig(project).on ? 'pop' : s;
}

const POP_HOLD = 0.32;
const PULL = 0.5;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Times for a step that starts at `start` with n winners. Returns the
// schedule and how long the step needs to show it all.
// merge: mergeSeq 0 pulls every winner in at once; 1 brings them in one by
// one (each waits at the merge point until the last arrives).
export function scheduleWinFx(style, start, n, cfg) {
  if (style === 'jump' && n > 0) {
    const flight = Math.max(0.2, Number(cfg.flight) || 0.55);
    const stg = n > 1 ? Math.min(Math.max(0, Number(cfg.stagger) || 0), 0.9 / (n - 1)) : 0;
    const launch = Array.from({ length: n }, (_, i) => start + POP_HOLD + i * stg);
    const arrive = launch.map((t) => t + flight);
    return { style, path: pathOf(cfg.jumpPath, 'arc'), launch, arrive, until: arrive, need: arrive[n - 1] + 0.35 - start };
  }
  if (style === 'collect' && n > 0) {
    const travel = Math.max(0.12, Number(cfg.beamTravel) || 0.32);
    const each = cfg.beamStagger == null ? 0.2 : Math.max(0, Number(cfg.beamStagger) || 0);
    const stg = n > 1 ? Math.min(each, 2.4 / (n - 1)) : 0;
    const launch = Array.from({ length: n }, (_, i) => start + POP_HOLD + i * stg);
    const arrive = launch.map((t) => t + travel);
    return { style, launch, arrive, until: arrive, travel, need: arrive[n - 1] + 0.55 - start };
  }
  if (style === 'merge' && n > 0) {
    const seq = clamp01(Number(cfg.mergeSeq) || 0);
    const gap = n > 1 ? Math.max(Math.min(0.03, 0.3 / n), seq * Math.min(PULL * 0.7, 2.4 / (n - 1))) : 0;
    const launch = Array.from({ length: n }, (_, i) => start + POP_HOLD + i * gap);
    // All at once they land together; one by one each lands as it comes.
    const together = launch[n - 1] + PULL;
    const arrive = launch.map((t) => together + (t + PULL - together) * seq);
    const mergeAt = together + (seq > 0.05 ? 0.1 : 0);
    return { style, path: pathOf(cfg.mergePath, 'line'), launch, arrive, until: arrive.map(() => mergeAt), mergeAt, seq, need: mergeAt + 1.15 - start };
  }
  return { style: 'pop', need: 0 };
}

const pathOf = (p, fallback) => (FLIGHT_PATHS.some((x) => x.id === p) ? p : fallback);

function centroid(cells, L) {
  let x = 0;
  let y = 0;
  for (const [c, r] of cells) {
    const m = L.cellCenter(c, r);
    x += m.x;
    y += m.y;
  }
  return { x: x / cells.length, y: y / cells.length };
}

// Where jumping winners land.
export function jumpTarget(project, L, st) {
  const cfg = winFxConfig(project);
  const top = { x: L.W / 2, y: Math.max(L.cellH * 0.45, L.winTop - L.cellH * 0.38) };
  switch (cfg.target) {
    case 'meter':
      return L.hud ? { x: L.hud.x + L.hud.w / 2, y: L.hud.y + L.hud.h * 0.6 } : top;
    case 'amount':
      return st.lines && st.lines.length ? { x: L.W / 2, y: L.winCY - L.cellH * 0.15 } : centroid(st.cells, L);
    case 'top':
      return top;
    case 'center':
      return { x: L.W / 2, y: L.H / 2 };
    case 'custom':
      return { x: clamp01(Number(cfg.jx)) * L.W, y: clamp01(Number(cfg.jy)) * L.H };
    default:
      return top;
  }
}

// Where merging winners fuse into one.
export function mergeTarget(project, L, st) {
  const cfg = winFxConfig(project);
  switch (cfg.point) {
    case 'cells':
      return centroid(st.cells, L);
    case 'center':
      return { x: L.W / 2, y: L.H / 2 };
    case 'custom':
      return { x: clamp01(Number(cfg.mx)) * L.W, y: clamp01(Number(cfg.my)) * L.H };
    default:
      return { x: L.winX + L.winW / 2, y: L.winCY };
  }
}

// One winner's flight from p0 to p1. kind: 'line', 'arc' (a quadratic
// Bézier lifted above both ends) or 'back' (a straight line with a
// wind-up). jump eases in and out, shrinking to 45% and fading as it lands;
// merge speeds up like a magnet and shrinks a little.
export function flightPath(style, p0, p1, L, kind = style === 'jump' ? 'arc' : 'line') {
  const arc = kind === 'arc';
  const lift = Math.max(L.cellH * 0.8, Math.abs(p1.x - p0.x) * 0.25);
  return { style, kind, x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y, cx: (p0.x + p1.x) / 2, cy: arc ? Math.min(p0.y, p1.y) - lift : (p0.y + p1.y) / 2 };
}

// Progress along the path for u in 0..1 (the wind-up dips below 0 first).
export function flightEase(path, u) {
  if (path.kind === 'back') return 2.9 * u * u * u - 1.9 * u * u;
  return path.style === 'jump' ? u * u * (3 - 2 * u) : Math.pow(u, 2.4);
}

// State of a winner at time t: position, scale and alpha (1 = as popped).
// A merging winner waits at the merge point until `until`.
export function flightAt(path, launch, arrive, t, until = arrive) {
  if (t <= launch) return { x: path.x0, y: path.y0, s: 1, a: 1, flying: false };
  const d = Math.max(0.01, arrive - launch);
  const u = clamp01((t - launch) / d);
  const e = flightEase(path, u);
  const q = 1 - e;
  const x = q * q * path.x0 + 2 * q * e * path.cx + e * e * path.x1;
  const y = q * q * path.y0 + 2 * q * e * path.cy + e * e * path.y1;
  if (path.style === 'jump') return { x, y, s: 1 - 0.55 * e, a: t >= until ? 0 : Math.min(1, (1 - u) / 0.15), flying: true };
  return { x, y, s: 1 - 0.3 * e, a: t >= until ? 0 : 1, flying: true };
}

// The merged symbol's scale (in cells) at time t, or 0 before the merge.
export function bigScaleAt(mergeAt, end, bigScale, t) {
  if (t < mergeAt) return 0;
  const a = clamp01((t - mergeAt) / 0.6);
  const el = a <= 0 ? 0 : a >= 1 ? 1 : Math.pow(2, -10 * a) * Math.sin(((a * 10 - 0.75) * (2 * Math.PI)) / 3) + 1;
  return bigScale * el * (1 + 0.04 * Math.sin((t - mergeAt) * 5));
}
