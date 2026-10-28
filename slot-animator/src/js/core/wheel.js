// The Wheel of Fortune: where it sits on screen (it can be bigger than the
// screen, showing only part of it), which side the pointer is on, and how
// the pointer moves. Pure; the preview and the After Effects rig share it.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);

// Framing presets: size is the radius relative to the whole wheel fitting
// the screen; x and y place the centre as fractions of the screen.
export const WHEEL_FRAMINGS = [
  { id: 'full', label: 'Whole wheel', size: 1, x: 0.5, y: 0.54 },
  { id: 'half', label: 'Top half', size: 1.55, x: 0.5, y: 1.02, pointer: 'top' },
  { id: 'close', label: 'Close-up', size: 2.3, x: 0.5, y: 1.42, pointer: 'top' },
  { id: 'rise', label: 'From above', size: 1.55, x: 0.5, y: -0.02, pointer: 'bottom' },
];

export const WHEEL_LANDINGS = [
  { id: 'center', label: 'Centered' },
  { id: 'random', label: 'Natural' },
  { id: 'tease', label: 'Edge tease', hint: 'Stops right next to the boundary' },
  { id: 'slip', label: 'Almost slips', hint: 'Creeps into the next peg, nearly tips over, then rolls back' },
];

export const POINTER_SIDES = [
  { id: 'top', label: 'Top, pointing down' },
  { id: 'bottom', label: 'Bottom, pointing up' },
];

// The pointer: how far a peg bends it (deg), over which part of a segment
// it is pushed before the peg passes, and the swing after.
export const POINTER_MAX = 26;
const PUSH = 0.22;
const BACK = 0.3;
// Almost slips: where in the segment the wheel peaks (just short of the
// peg), where it creeps from, where it rolls back to, and the timing.
export const SLIP = { creepFrom: 0.95, peak: 0.985, rest: 0.68, creep: 0.4, roll: 0.65, kick: 15 };

export function wheelConfig(project) {
  const w = project.wheel || {};
  const show = w.show || {};
  return {
    pointer: w.pointer === 'bottom' ? 'bottom' : 'top',
    size: clamp(num(w.size, 1), 0.4, 3),
    x: clamp(num(w.x, 0.5), -0.5, 1.5),
    y: clamp(num(w.y, 0.54), -0.8, 1.8),
    pointerSize: clamp(num(w.pointerSize, 1), 0.4, 2.5),
    pivot: clamp(num(w.pivot, 0.2), 0, 1),
    push: clamp(num(w.push, 0), 0, 1),
    labelFont: w.labelFont || '',
    labelPalette: w.labelPalette || 'gold',
    labelSize: clamp(num(w.labelSize, 1), 0.4, 2),
    iconSize: clamp(num(w.iconSize, 1), 0.3, 2),
    hubSize: clamp(num(w.hubSize, 1), 0.3, 3),
    hubSpins: w.hubSpins !== false,
    // The icon in the middle of the hub: the star unless the hub is your art.
    centerIcon: w.centerIcon ?? (w.art?.hub ? 'none' : 'builtin:star'),
    show: {
      rim: show.rim !== false,
      bulbs: show.bulbs !== false,
      pegs: show.pegs !== false,
      separators: show.separators !== false,
      hub: show.hub !== false,
      labels: show.labels !== false,
    },
  };
}

// Screen geometry of the wheel for a layout's W and H.
export function wheelGeometry(project, W, H) {
  const c = wheelConfig(project);
  const base = Math.min(H * 0.36, W * 0.4);
  const R = Math.round(base * c.size);
  const cx = W * c.x;
  const cy = H * c.y;
  const bottom = c.pointer === 'bottom';
  const s = bottom ? 1 : -1;
  const pivot = { x: cx, y: cy + s * R * 1.1 };
  // The prize plaque and the title stay on screen however the wheel is framed.
  const pr = Math.min(R, base);
  const plaque = { x: clamp(cx, W * 0.25, W * 0.75), y: clamp(cy, H * 0.3, H * 0.7), R: pr };
  // The title sits above the wheel; when the wheel hangs from the top of the
  // screen, under its pointer instead.
  const above = cy - R * 1.28;
  const titleY = !bottom || above >= H * 0.07 ? clamp(above, H * 0.07, H * 0.6) : clamp(pivot.y + base * 0.45, H * 0.3, H * 0.93);
  return {
    cx,
    cy,
    R,
    base,
    pointer: c.pointer,
    pointerAngle: bottom ? 180 : 0,
    pivot,
    tip: { x: cx, y: cy + s * R * 0.9 },
    plaque,
    title: { x: clamp(cx, W * 0.3, W * 0.7), y: titleY },
  };
}

// How far the pegs bend the pointer at wheel angle theta (deg; negative
// leans with the wheel's turn). The same sign works on either side: the
// pointer art is turned over at the bottom.
export function pointerDeflection(theta, segDeg, pointerAngle = 0) {
  const u = ((((theta - pointerAngle) / segDeg) % 1) + 1) % 1;
  if (u > 1 - PUSH) return -POINTER_MAX * ((u - (1 - PUSH)) / PUSH);
  if (u < BACK) {
    const k = u / BACK;
    return -POINTER_MAX * Math.pow(1 - k, 2) * Math.cos(k * Math.PI * 1.5);
  }
  return 0;
}

// When a peg lets go of a bent pointer, it springs past straight and
// settles: a damped swing from t0.
export function pointerKick(kick, t) {
  if (!kick) return 0;
  const a = t - kick.t;
  if (a <= 0 || a > 1.6) return 0;
  return kick.amp * Math.exp(-a * 5.5) * Math.sin(a * Math.PI * 2 * 2.2);
}

export function pointerAt(theta, segDeg, pointerAngle, t, kick) {
  return pointerDeflection(theta, segDeg, pointerAngle) + pointerKick(kick, t);
}

// Where each segment's label and icon go on a wheel of radius R. a: the
// segment's middle direction (deg, 0 = right, clockwise, before the wheel
// turns). Labels read outwards along the radius; icons stand with their
// top towards the rim. An icon pushes the label towards the hub.
export function segmentLayout(segments, R, project) {
  const c = wheelConfig(project);
  const N = Math.max(2, segments.length);
  const seg = (Math.PI * 2) / N;
  return segments.map((s, k) => {
    const a = -90 + ((k + 0.5) * 360) / N;
    const hasIcon = !!s.icon;
    const hasLabel = c.show.labels && String(s.label ?? '') !== '';
    const chord = (r) => 2 * r * Math.sin(seg / 2);
    let icon = null;
    if (hasIcon) {
      const r = R * (hasLabel ? 0.75 : 0.62);
      icon = { r, size: Math.min(R * (hasLabel ? 0.24 : 0.34), chord(r) * 0.78) * c.iconSize };
    }
    const label = hasLabel ? { r: R * (hasIcon ? 0.42 : 0.6), maxLen: R * (hasIcon ? 0.4 : 0.56), px: Math.min(R * 0.15, R * seg * 0.42) * c.labelSize } : null;
    return { a, icon, label };
  });
}

// The label colours: metal names paint a gradient (the After Effects text
// takes the middle colour), plain ones a flat fill.
export const LABEL_PALETTES = [
  { id: 'gold', label: 'Gold', fill: '#ffd86b', stroke: '#140600' },
  { id: 'chrome', label: 'Silver', fill: '#dfe4ec', stroke: '#141922' },
  { id: 'rose', label: 'Rose', fill: '#ff9ccf', stroke: '#2a0016' },
  { id: 'neon', label: 'Neon', fill: '#7ff6ff', stroke: '#032030' },
  { id: 'violet', label: 'Violet', fill: '#c9a2ff', stroke: '#14042e' },
  { id: 'white', label: 'White', fill: '#ffffff', stroke: '#140600', flat: true },
  { id: 'black', label: 'Black', fill: '#16110a', stroke: '#ffffff', flat: true },
];
export const labelPalette = (id) => LABEL_PALETTES.find((p) => p.id === id) || LABEL_PALETTES[0];

// Built-in icons a segment or the hub can show (painted by the renderer).
// A segment's icon is "builtin:<id>", an uploaded image (data URL) or none.
export const WHEEL_ICONS = [
  { id: 'coin', label: 'Coin' },
  { id: 'star', label: 'Star' },
  { id: 'cherry', label: 'Cherry' },
  { id: 'bell', label: 'Bell' },
  { id: 'bar', label: 'BAR' },
  { id: 'emerald', label: 'Emerald' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'crown', label: 'Crown' },
  { id: 'seven', label: 'Lucky 7' },
  { id: 'heart', label: 'Heart' },
  { id: 'wild', label: 'Wild' },
  { id: 'scatter', label: 'Scatter' },
  { id: 'orb', label: 'Multiplier orb' },
  { id: 'lollipop', label: 'Lollipop' },
  { id: 'grapes', label: 'Grapes' },
];

export const iconName = (v) => (typeof v === 'string' && v.startsWith('builtin:') ? v.slice(8) : null);

// An icon for every segment, by prize: the bigger the value, the richer
// the icon, the top prize a Lucky 7.
const LADDER = ['cherry', 'bell', 'bar', 'emerald', 'ruby', 'diamond', 'crown', 'seven'];
export function autoIcons(segments) {
  const vals = [...new Set(segments.map((s) => Number(s.value) || 0))].sort((a, b) => a - b);
  return segments.map((s) => {
    const r = vals.length > 1 ? vals.indexOf(Number(s.value) || 0) / (vals.length - 1) : 1;
    return `builtin:${LADDER[Math.round(r * (LADDER.length - 1))]}`;
  });
}
