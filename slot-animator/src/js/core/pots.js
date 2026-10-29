// Pots above the machine: a pot of gold, a pot of gems and a pot of fruits
// sit on the frame's top edge. Two features use them:
//   boosters - after a spin lands, the pots charge and fire beams down into
//              cells that upgrade (a wild, a better symbol, a multiplier
//              wild or a cash value),
//   collect  - a win style: every winner fires a beam up into its pot, one
//              by one, and the pots collect the win.
// Pure: the config, which pot serves a reel, where the pots sit, the beam's
// shape and its timing. The preview, the After Effects export and the tests
// all use these.

export const POT_ARTS = [
  { id: 'gold', label: 'Pot of gold', color: '#ffc23a' },
  { id: 'gems', label: 'Pot of gems', color: '#3ff0ff' },
  { id: 'fruit', label: 'Pot of fruits', color: '#ff5f8a' },
];

export const BOOST_KINDS = [
  { id: 'wild', label: 'Wild', short: 'Wild', hint: 'The cell turns wild.' },
  { id: 'upgrade', label: 'Upgrade', short: 'Upgrade', hint: 'A low symbol upgrades to the winning symbol (or a high one).' },
  { id: 'mult', label: 'Multiplier wild', short: 'x', hint: 'The cell turns into a wild with an x value.' },
  { id: 'cash', label: 'Cash', short: '$', hint: 'The cell turns into a cash value; a collector takes it.' },
];

export const BEAM_CURVES = [
  { id: 'arc', label: 'Simple arc' },
  { id: 's', label: 'S-curve' },
];

// What a pot does: catch winners' beams, fire boosters, or both.
export const POT_ROLES = [
  { id: 'both', label: 'Collects and upgrades', short: 'Both' },
  { id: 'collect', label: 'Collects wins', short: 'Collects' },
  { id: 'upgrade', label: 'Upgrades cells', short: 'Upgrades' },
];

// Which pot fires at (or catches from) a cell.
export const POT_AIMS = [
  { id: 'nearest', label: 'Nearest pot' },
  { id: 'type', label: 'By symbol' },
  { id: 'turns', label: 'Pots take turns' },
  { id: '0', label: 'First pot only' },
  { id: '1', label: 'Second pot only' },
  { id: '2', label: 'Third pot only' },
];

export function defaultPots() {
  return {
    enabled: false,
    count: 3,
    // Share of the screen height above the machine; the machine scales
    // down to make room.
    band: 0.3,
    size: 1,
    spacing: 1,
    // How much of a pot hides behind the frame's top edge.
    overlap: 0.35,
    plates: true,
    aim: 'nearest',
    items: POT_ARTS.map((a) => ({ art: a.id, name: a.label, color: a.color, src: null, role: 'both' })),
    // By symbol: symbol id (or orb, mystery, collector, cash) -> pot index,
    // -1 for none. Symbols not listed go to the pot of their family.
    owners: {},
    beam: { curve: 'arc', bend: 0.5, width: 1, travel: 0.32, stagger: 0.2 },
  };
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d) => (v == null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

// The pots config with every value in range. `on` is false outside the
// slot game: Hold & Spin and the wheel game have no pots.
export function potsConfig(project) {
  const d = defaultPots();
  const p = project.pots || {};
  const items = d.items.map((it, i) => {
    const o = { ...it, ...((p.items || [])[i] || {}) };
    if (!POT_ROLES.some((r) => r.id === o.role)) o.role = 'both';
    return o;
  });
  const beam = { ...d.beam, ...(p.beam || {}) };
  const count = clamp(Math.round(num(p.count, d.count)), 1, 3);
  return {
    on: !!p.enabled && (project.game || 'slot') === 'slot',
    count,
    band: clamp(num(p.band, d.band), 0.15, 0.45),
    size: clamp(num(p.size, d.size), 0.5, 1.8),
    spacing: clamp(num(p.spacing, d.spacing), 0.6, 2.5),
    overlap: clamp(num(p.overlap, d.overlap), 0, 0.8),
    plates: p.plates !== false,
    aim: POT_AIMS.some((a) => a.id === String(p.aim)) ? String(p.aim) : 'nearest',
    items: items.slice(0, count),
    owners: { ...(p.owners || {}) },
    beam: {
      curve: BEAM_CURVES.some((c) => c.id === beam.curve) ? beam.curve : 'arc',
      bend: clamp(num(beam.bend, 0.5), 0, 1.5),
      width: clamp(num(beam.width, 1), 0.3, 3),
      travel: clamp(num(beam.travel, 0.32), 0.12, 1.2),
      stagger: clamp(num(beam.stagger, 0.2), 0, 0.8),
    },
  };
}

// The pot that serves reel c: the reels split into one zone per pot (the
// pots sit evenly across the machine, so this is the nearest pot whatever
// the canvas size), or the pots take turns (i = the beam's index), or one.
export function potFor(aim, n, c, reels, i) {
  if (n <= 1) return 0;
  if (aim === 'turns') return i % n;
  if (aim === '0' || aim === '1' || aim === '2') return Math.min(n - 1, Number(aim));
  return Math.min(n - 1, Math.floor(((c + 0.5) / reels) * n));
}

// Whether any pot catches winners, or fires boosters.
export const potsCollect = (cfg) => cfg.on && cfg.items.some((it) => it.role !== 'upgrade');
export const potsUpgrade = (cfg) => cfg.on && cfg.items.some((it) => it.role !== 'collect');

// By symbol: the family each built-in symbol belongs to. A symbol goes to
// the pot whose art is its family unless it is given another pot.
const FAMILY = {
  gold: ['seven', 'bar', 'bell', 'crown', 'wild', 'orb', 'scatter', 'mystery', 'collector', 'cash'],
  gems: ['diamond', 'emerald', 'ruby', 'candyBlue', 'candyGreen', 'candyPurple', 'candyHeart', 'lollipop'],
  fruit: ['cherry', 'banana', 'grapes', 'watermelon', 'apple'],
};

// The owner key of symbol index `sym`: a project symbol's id, or the
// built-in multiplier, mystery block, collector or cash coin.
export function symbolKey(project, lay, sym) {
  if (sym == null || sym < 0) return null;
  if (sym < project.symbols.length) return project.symbols[sym].id;
  if (sym === lay.orbSym) return 'orb';
  if (sym === lay.mysterySym) return 'mystery';
  if (sym === lay.collectorSym) return 'collector';
  if (sym >= lay.coinBase && sym < lay.coinBase + lay.coinCount) return 'cash';
  return null;
}

// The pot a symbol belongs to by default: the pot with its family's art.
export function familyPot(cfg, art) {
  const fam = Object.keys(FAMILY).find((f) => FAMILY[f].includes(art));
  return fam ? cfg.items.findIndex((it) => it.art === fam) : -1;
}

// The pot a symbol key belongs to (-1: none).
export function ownerOf(project, cfg, key) {
  if (key == null) return -1;
  const set = cfg.owners[key];
  if (set != null && set !== '' && !Number.isNaN(Number(set))) return Number(set) < cfg.count ? Number(set) : -1;
  const s = project.symbols.find((x) => x.id === key);
  return familyPot(cfg, s ? s.builtin || (s.role === 'wild' ? 'wild' : null) : key);
}

// Which pot serves a cell for `need` ('collect' or 'upgrade'): only pots
// that do that; by symbol the owner of `sym`'s key, else the nearest such
// pot; or in turns, or one pot. -1 when no pot does it.
export function pickPot(cfg, need, aim, c, reels, i, owner = -1) {
  const can = cfg.items.map((it) => it.role === 'both' || it.role === need);
  const ok = can.map((v, p) => (v ? p : -1)).filter((p) => p >= 0);
  if (!ok.length) return -1;
  const near = () => {
    const z = potFor('nearest', cfg.count, c, reels, i);
    return ok.reduce((b, p) => (Math.abs(p - z) < Math.abs(b - z) ? p : b), ok[0]);
  };
  if (aim === 'type') return owner >= 0 && can[owner] ? owner : near();
  if (aim === 'turns') return ok[i % ok.length];
  if (aim === '0' || aim === '1' || aim === '2') {
    const p = Math.min(cfg.count - 1, Number(aim));
    return can[p] ? p : near();
  }
  return near();
}

// Pot art box, in units of the pot image's size S (centred at 0,0): the
// rim, the bottom, the treasure's top and the mouth beams start from.
export const POT_BOX = { rim: -0.06, bottom: 0.49, top: -0.44, mouth: -0.12 };

// Where the pots sit: evenly across the machine, standing on the frame's top
// edge with `overlap` of the body behind it. Each gets its image centre,
// size, mouth and the nameplate on the frame.
// zoom scales the pots with the machine (zoomed out, tall pots get the
// room they asked for); cap false measures them uncut.
export function placePots(cfg, W, H, topZone, frame, pad, zoom = 1, cap = true) {
  const n = cfg.count;
  const body = POT_BOX.bottom - POT_BOX.rim;
  let S = topZone * 0.95 * cfg.size * zoom;
  // Never above the top of the screen.
  if (cap) S = Math.min(S, (frame.y - H * 0.01) / (POT_BOX.bottom - POT_BOX.top - body * cfg.overlap));
  let pitch = S * 1.02 * cfg.spacing;
  // They stand on the frame: no wider than it (a little overhang), and
  // never off the screen.
  // Spread too far, they stop at the frame's edges; still too big, they
  // shrink.
  const cx = frame.x + frame.w / 2;
  const room = Math.min(2 * Math.min(cx, W - cx) * 0.98, frame.w * 1.04);
  if (n > 1) pitch = Math.min(pitch, Math.max(S * 0.85, (room - S * 0.94) / (n - 1)));
  const span = (n - 1) * pitch + S * 0.94;
  if (span > room) {
    const k = room / span;
    S *= k;
    pitch *= k;
  }
  const bottom = frame.y + cfg.overlap * body * S;
  const y = bottom - POT_BOX.bottom * S;
  const plateH = Math.max(pad * 1.4, S * 0.19);
  return Array.from({ length: n }, (_, i) => {
    const x = cx + (i - (n - 1) / 2) * pitch;
    return {
      i,
      x,
      y,
      size: S,
      bottom,
      top: y + POT_BOX.top * S,
      mouth: { x, y: y + POT_BOX.mouth * S },
      plate: { x, y: frame.y + pad * 0.5, w: Math.min(S * 0.86, pitch * 0.94), h: plateH },
    };
  });
}

// ---- beams ----

// A beam from p0 to p1 as a cubic Bézier [x0,y0, x1,y1, x2,y2, x3,y3]. An
// arc bows to one side (a quadratic raised to a cubic); an S-curve swings
// out one way, then the other. `out` is the side to bow towards in x
// (-1 left, 1 right).
export function beamCurve(p0, p1, beam, out) {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  if (nx * out < 0 || (Math.abs(nx) < 1e-6 && out < 0)) {
    nx = -nx;
    ny = -ny;
  }
  const k = beam.bend * len * 0.45;
  if (beam.curve === 's') {
    return [p0.x, p0.y, p0.x + dx / 3 + nx * k, p0.y + dy / 3 + ny * k, p0.x + (2 * dx) / 3 - nx * k, p0.y + (2 * dy) / 3 - ny * k, p1.x, p1.y];
  }
  const qx = p0.x + dx * 0.5 + nx * k;
  const qy = p0.y + dy * 0.5 + ny * k;
  return [p0.x, p0.y, p0.x + ((qx - p0.x) * 2) / 3, p0.y + ((qy - p0.y) * 2) / 3, p1.x + ((qx - p1.x) * 2) / 3, p1.y + ((qy - p1.y) * 2) / 3, p1.x, p1.y];
}

function bez(b, u) {
  const q = 1 - u;
  const a = q * q * q;
  const c1 = 3 * q * q * u;
  const c2 = 3 * q * u * u;
  const d = u * u * u;
  return [a * b[0] + c1 * b[2] + c2 * b[4] + d * b[6], a * b[1] + c1 * b[3] + c2 * b[5] + d * b[7]];
}

// n + 1 points spread evenly along the curve's length, so a fraction of
// the beam means the same as After Effects' Trim Paths.
export function beamPoints(b, n = 32) {
  const M = 160;
  const pts = [];
  const acc = [0];
  for (let i = 0; i <= M; i++) pts.push(bez(b, i / M));
  for (let i = 1; i <= M; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = acc[M] || 1;
  const out = [];
  let j = 0;
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * total;
    while (j < M - 1 && acc[j + 1] < s) j++;
    const f = (s - acc[j]) / Math.max(1e-9, acc[j + 1] - acc[j]);
    out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f]);
  }
  return out;
}

// The point at fraction f (0..1) of the beam's length.
export function pointAlong(pts, f) {
  const n = pts.length - 1;
  const x = Math.min(n, Math.max(0, f * n));
  const i = Math.min(n - 1, Math.floor(x));
  const k = x - i;
  return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const inOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

// A saber beam's passes, outside in: [width in cells (times the beam's
// width setting), opacity, white core]. The soft ones flicker.
export const BEAM_PASSES = [
  [0.34, 0.12, 0],
  [0.19, 0.3, 0],
  [0.1, 0.6, 0],
  [0.035, 1, 1],
];
export const beamFlicker = (t) => 0.85 + 0.15 * Math.sin(t * 61) * Math.sin(t * 37 + 1);

// Which side a beam bows to: away from the pot, or (for a cell right
// under it) alternating by reel.
export function beamSide(cellX, potX, c, cellW) {
  return Math.abs(cellX - potX) > cellW * 0.25 ? Math.sign(cellX - potX) : c % 2 ? 1 : -1;
}

// Beam timing: the head shoots along the path in `travel`, the tail follows
// once the head is most of the way, and the beam fades after `hold`.
export const BEAM_HOLD = 0.16;
export const BEAM_FADE = 0.3;

export function beamState(bm, t) {
  const f = t - bm.fire;
  const travel = bm.travel;
  if (f < 0 || f > travel + BEAM_HOLD + BEAM_FADE) return null;
  const head = inOut(clamp01(f / travel));
  const tail = clamp01((f - travel * 0.6) / (travel * 0.4 + BEAM_HOLD + BEAM_FADE * 0.5));
  const alpha = 1 - clamp01((f - travel - BEAM_HOLD) / BEAM_FADE);
  return { head, tail: Math.min(head, tail), alpha };
}

// ---- pot reactions ----
// tl.pots.hits: [t, pot, kind] with kind 0 = a beam lands in the pot, 1 =
// the pot fires. A landing squashes the pot and flashes it; firing kicks
// it back a little.
export const POT_CATCH = 0.32;
export const POT_FIRE = 0.24;

export function potBump(hits, pot, t) {
  let bump = 0;
  let flash = 0;
  for (const [ht, p, kind] of hits) {
    if (p !== pot) continue;
    const a = t - ht;
    if (a < 0) continue;
    const d = kind ? POT_FIRE : POT_CATCH;
    if (a < d) bump = Math.max(bump, (kind ? 0.55 : 1) * Math.pow(1 - a / d, 2));
    if (a < 0.4) flash = Math.max(flash, (kind ? 0.7 : 1) * (1 - a / 0.4));
  }
  return { bump, flash };
}

// tl.pots.charges: [from, to, pot]: the pot glows while it charges up.
export function potCharge(charges, pot, t) {
  let k = 0;
  for (const [a, b, p] of charges) {
    if (p !== pot || t < a || t > b + 0.3) continue;
    k = Math.max(k, Math.min(clamp01((t - a) / 0.25), clamp01((b + 0.3 - t) / 0.3)));
  }
  return k;
}
