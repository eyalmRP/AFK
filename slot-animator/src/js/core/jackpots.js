// Progressive jackpot boxes: Grand, Major, Minor and Mini plates beside the
// machine. Their values are the Hold & Spin jackpots (the Mini, Minor and
// Major coins and the Grand prize, in bets), fixed or running up. A jackpot
// won on the machine (its coin collected, the board filled, a wheel segment
// linked to it, or a round that awards it) lights its box and pays what the
// box shows then; a running box holds that amount for a moment and starts
// again from its seed. Shared by the timeline, the layout, the preview and
// the After Effects export. Pure.

import { holdSpinConfig, coinValues } from './coins.js';
import { key } from './keys.js';

// Tiers from the top. scale: the box size when the boxes are sized by tier.
export const JP_TIERS = [
  { id: 'grand', label: 'GRAND', palette: 'gold', scale: 1 },
  { id: 'major', label: 'MAJOR', palette: 'fire', scale: 0.86 },
  { id: 'minor', label: 'MINOR', palette: 'violet', scale: 0.75 },
  { id: 'mini', label: 'MINI', palette: 'aqua', scale: 0.66 },
];

// Where the boxes stand. Two or three boxes stand on one side; four can
// also split, two on each side.
export const JP_PLACES = [
  { id: 'above', label: 'Above' },
  { id: 'below', label: 'Below' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'sides', label: 'Left and right', four: true },
  { id: 'ends', label: 'Above and below', four: true },
];

// A won box shows the amount it paid this long before it starts again.
export const JP_HOLD = 1.6;
// The celebration on a box: a flash, a pop and a light sweep.
export const JP_CELEBRATE = 2.4;
// A jackpot coin landing makes its box blink.
export const JP_BLINK = 0.6;
// Box shape, in cells: width and height at size 1 and tier scale 1. The
// name sits in the top part, the value below it (JP_TEXT: centre heights
// from the box's centre and text heights, as fractions of the box height).
export const JP_BOX = { w: 1.8, h: 0.72 };
export const JP_TEXT = { labelY: -0.22, labelPx: 0.24, valueY: 0.17, valuePx: 0.34 };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);

export function defaultJackpots() {
  return {
    enabled: false,
    count: 4,
    place: 'above',
    sizing: 'tiers',
    size: 1,
    padding: 0.2,
    spacing: 0.15,
    running: false,
    // Percent of the seed added per second while running.
    growth: 0.15,
    grandLabel: 'GRAND',
    grandPalette: 'gold',
    // Your own box art per tier (data URLs), and whether the names are
    // written on it.
    art: {},
    artNames: true,
  };
}

// The boxes shown, from the top tier down: 4 boxes are all four tiers, 3
// leave out the Mini, 2 the Minor too.
export function jackpotsConfig(project) {
  const d = defaultJackpots();
  const j = { ...d, ...(project.jackpots || {}) };
  const game = project.game || 'slot';
  const count = clamp(Math.round(num(j.count, 4)), 2, 4);
  let place = JP_PLACES.some((p) => p.id === j.place) ? j.place : 'above';
  if (count < 4 && JP_PLACES.find((p) => p.id === place).four) place = place === 'ends' ? 'above' : 'left';
  // The pots stand above the machine: boxes go below instead.
  const potsOn = !!project.pots?.enabled && game === 'slot';
  if (potsOn && place === 'above') place = 'below';
  if (potsOn && place === 'ends') place = 'sides';
  const hs = holdSpinConfig(project);
  const bet = Math.max(0, num(project.machine?.bet, 1)) || 1;
  const coin = (id) => hs.coins.find((c) => c.id === id);
  const running = !!j.running;
  const growth = clamp(num(j.growth, d.growth), 0, 5) / 100;
  const tiers = JP_TIERS.slice(0, count).map((t) => {
    const c = coin(t.id);
    const base = t.id === 'grand' ? Math.max(0, num(hs.grand.value, 1000)) * bet : c ? Math.max(...coinValues(c)) * bet : 0;
    return {
      id: t.id,
      label: t.id === 'grand' ? String(j.grandLabel ?? 'GRAND') : (c?.label || t.label),
      palette: t.id === 'grand' ? j.grandPalette || 'gold' : c?.palette || t.palette,
      scale: j.sizing === 'same' ? 0.86 : t.scale,
      art: (j.art && typeof j.art[t.id] === 'string' && j.art[t.id]) || null,
      base,
      rate: running ? base * growth : 0,
    };
  });
  return {
    on: !!j.enabled && (game === 'slot' || game === 'holdspin'),
    count,
    place,
    sizing: j.sizing === 'same' ? 'same' : 'tiers',
    size: clamp(num(j.size, 1), 0.4, 2),
    padding: clamp(num(j.padding, d.padding), -1, 2),
    spacing: clamp(num(j.spacing, d.spacing), -0.3, 1.5),
    running,
    artNames: j.artNames !== false,
    tiers,
  };
}

export const jackpotTier = (cfg, id) => cfg.tiers.find((t) => t.id === id) || null;

// Which box a wheel segment pays: its own choice, or by its label (GRAND
// and JACKPOT to the Grand, MAJOR, MINOR, MINI to theirs).
export function wheelJackpot(cfg, seg) {
  if (!cfg.on || !seg) return null;
  const pick = seg.jackpot;
  if (pick === 'none') return null;
  if (pick && pick !== 'auto') return jackpotTier(cfg, pick) ? pick : null;
  const l = String(seg.label || '').toUpperCase();
  const id = /GRAND|JACKPOT/.test(l) ? 'grand' : /MAJOR/.test(l) ? 'major' : /MINOR/.test(l) ? 'minor' : /MINI/.test(l) ? 'mini' : null;
  return id && jackpotTier(cfg, id) ? id : null;
}

// The ledger the timeline keeps: what each box shows and pays over time.
export function jackpotLedger(cfg) {
  const since = Object.fromEntries(cfg.tiers.map((t) => [t.id, 0]));
  const hits = [];
  const blinks = [];
  return {
    hits,
    blinks,
    // Pays the box at t: what it shows then. Running, it holds that amount
    // a moment, then starts again from its seed.
    award(id, t, kind) {
      const tier = jackpotTier(cfg, id);
      if (!tier) return null;
      const amount = Math.round((tier.base + tier.rate * Math.max(0, t - since[id])) * 100) / 100;
      hits.push({ tier: id, t, amount, kind });
      if (cfg.running) since[id] = t + JP_HOLD;
      return amount;
    },
    blink(id, t) {
      if (jackpotTier(cfg, id)) blinks.push({ tier: id, t });
    },
  };
}

// What box `id` shows at time t, given the hits (in time order).
export function jackpotValue(cfg, hits, id, t) {
  const tier = jackpotTier(cfg, id);
  if (!tier) return 0;
  let from = 0;
  for (const h of hits) {
    if (h.tier !== id || h.t > t) continue;
    if (t < h.t + JP_HOLD) return h.amount;
    if (cfg.running) from = h.t + JP_HOLD;
  }
  return tier.base + tier.rate * Math.max(0, t - from);
}

// The boxes' order on each side: tiers from the top, split for four.
function sidesOf(cfg) {
  const ids = cfg.tiers.map((t) => t.id);
  if (cfg.place === 'sides') return { left: [ids[0], ids[2]], right: [ids[1], ids[3]] };
  if (cfg.place === 'ends') return { above: [ids[0], ids[1]], below: [ids[2], ids[3]] };
  return { [cfg.place]: ids };
}

// The room the boxes take beside the frame, in cells: { top, bottom, left,
// right }. Negative padding tucks them over the frame.
export function jackpotRoom(cfg) {
  const room = { top: 0, bottom: 0, left: 0, right: 0 };
  if (!cfg.on) return room;
  const sides = sidesOf(cfg);
  const scaleOf = (id) => jackpotTier(cfg, id).scale * cfg.size;
  for (const [side, ids] of Object.entries(sides)) {
    const across = side === 'above' || side === 'below';
    const deep = Math.max(...ids.map((id) => (across ? JP_BOX.h : JP_BOX.w) * scaleOf(id)));
    const r = Math.max(0, deep + cfg.padding);
    if (side === 'above') room.top = r;
    else if (side === 'below') room.bottom = r;
    else room[side] = r;
  }
  return room;
}

// The boxes around the frame, in canvas pixels: { id, x, y, w, h } with
// x, y the centre. u is the cell width; W, H the canvas.
export function placeJackpots(cfg, frame, u, W, H) {
  if (!cfg.on) return null;
  const out = [];
  const pad = cfg.padding * u;
  const gap = cfg.spacing * u;
  for (const [side, ids] of Object.entries(sidesOf(cfg))) {
    const across = side === 'above' || side === 'below';
    let boxes = ids.map((id) => {
      const s = jackpotTier(cfg, id).scale * cfg.size;
      return { id, w: JP_BOX.w * s * u, h: JP_BOX.h * s * u };
    });
    // A row no wider than the screen, a column no taller than it.
    const len = boxes.reduce((a, b) => a + (across ? b.w : b.h), 0) + gap * (boxes.length - 1);
    const room = across ? W * 0.96 : H * 0.92;
    const k = len > room ? room / len : 1;
    if (k < 1) boxes = boxes.map((b) => ({ ...b, w: b.w * k, h: b.h * k }));
    const total = len * k;
    let at = (across ? frame.x + frame.w / 2 : frame.y + frame.h / 2) - total / 2;
    for (const b of boxes) {
      if (across) {
        const x = at + b.w / 2;
        // Rows line up on the edge next to the machine.
        const y = side === 'above' ? frame.y - pad - b.h / 2 : frame.y + frame.h + pad + b.h / 2;
        out.push({ ...b, x, y, side });
        at += b.w + gap * k;
      } else {
        const y = at + b.h / 2;
        const x = side === 'left' ? frame.x - pad - b.w / 2 : frame.x + frame.w + pad + b.w / 2;
        out.push({ ...b, x, y, side });
        at += b.h + gap * k;
      }
    }
  }
  // Tier order, so box i is tier i everywhere.
  return cfg.tiers.map((t) => out.find((b) => b.id === t.id));
}

// How a box reacts at time t (tl.jackpots: { hits, blinks }): a won box
// pops, glows with a pulse and a light sweeps across it once; a box whose
// coin just landed blinks. scale 1 = at rest; glow 0..1; sweep 0..1 while
// the light crosses, else -1; held: showing the amount it paid.
export function jackpotFx(jt, id, t) {
  let scale = 1;
  let glow = 0;
  let sweep = -1;
  let held = false;
  for (const h of jt?.hits || []) {
    if (h.tier !== id) continue;
    const a = t - h.t;
    if (a < 0 || a > JP_CELEBRATE) continue;
    const env = Math.min(1, a / 0.15) * Math.min(1, (JP_CELEBRATE - a) / 0.6);
    scale = Math.max(scale, 1 + env * (0.05 + 0.1 * Math.exp(-3 * a) + 0.025 * Math.sin(a * 12)));
    glow = Math.max(glow, env * (0.75 + 0.25 * Math.sin(a * 10)));
    if (a < 0.9) sweep = a / 0.9;
    if (a < JP_HOLD) held = true;
  }
  for (const b of jt?.blinks || []) {
    if (b.tier !== id) continue;
    const a = t - b.t;
    if (a < 0 || a > JP_BLINK) continue;
    const k = Math.sin((Math.PI * a) / JP_BLINK);
    scale = Math.max(scale, 1 + 0.06 * k);
    glow = Math.max(glow, 0.8 * k);
  }
  return { scale, glow, sweep, held };
}

// Tiers whose win also takes the whole screen: the box's name and
// "JACKPOT", the amount counting up (the Grand has its own for a full
// Hold & Spin board).
export const JP_SHOW_TIERS = ['major'];
export const JP_SHOW = { lead: 0.55, count: 1.4, tail: 1.0 };

// The full-screen moment for a tier won at t0, paying amount.
export function jackpotShow(tier, start, amount) {
  const countStart = start + JP_SHOW.lead;
  const countEnd = countStart + JP_SHOW.count;
  return {
    tier,
    start,
    countStart,
    countEnd,
    end: countEnd + JP_SHOW.tail,
    amount,
    keys: [key(countStart, 0, { outSpeed: (amount / JP_SHOW.count) * 1.25 }), key(countEnd, amount, { inInf: 0.6, hold: true })],
  };
}
