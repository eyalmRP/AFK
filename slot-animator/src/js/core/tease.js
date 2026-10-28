// The tease: while a reel slows down with anticipation the other reels dim,
// and scatters (or trigger coins) that land pop lit over the dim. With
// "keep scatters lit" they stay lit until the tease ends; otherwise the lit
// copy fades into the dimmed reel once its pop is over. Pure: the preview
// draws with these and the After Effects rig mirrors them in expressions.

export const TEASE_DIM = 0.38;
// A landing pops for LAND_POP seconds; the lit copy fades from LAND_FADE.
export const LAND_POP = 0.7;
export const LAND_FADE = 0.4;
// A tease shows from just before its reel slows to just after it lands.
export const TEASE_LEAD = 0.05;
export const TEASE_IN = 0.2;
export const TEASE_TAIL = 0.3;

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// A round's tease windows [start, end, reel]. Per-cell teases carry reel
// -1: they keep scatters lit but dim nothing.
export function teaseWindows(R) {
  const out = [];
  (R.reels || []).forEach((ri, c) => ri && ri.antic && out.push([ri.antic.start, ri.antic.end, c]));
  for (const ci of R.cells || []) if (ci && ci.antic) out.push([ci.antic.start, ci.antic.end, -1]);
  return out;
}

// How strongly one window shows at t (0 to 1).
export function teaseEnv(w, t) {
  const a = w[0] - TEASE_LEAD;
  const b = w[1] + TEASE_TAIL;
  if (t < a || t > b) return 0;
  return Math.min(clamp01((t - a) / TEASE_IN), clamp01((b - t) / TEASE_TAIL));
}

// The dim over reel c at t: every reel but a teasing one darkens.
export function teaseDim(W, c, t) {
  let all = 0;
  let own = 0;
  for (const w of W) {
    if (w[2] < 0) continue;
    const e = teaseEnv(w, t);
    all = Math.max(all, e);
    if (w[2] === c) own = Math.max(own, e);
  }
  return own > 0 ? 0 : TEASE_DIM * all;
}

// The lit copy of a symbol that landed at `land`, at t (0 to 1).
export function landLit(W, land, t, keepLit) {
  const a = t - land;
  if (a < 0) return 0;
  let k = a < LAND_POP ? 1 - clamp01((a - LAND_FADE) / (LAND_POP - LAND_FADE)) : 0;
  if (keepLit) for (const w of W) k = Math.max(k, teaseEnv(w, t));
  return k;
}

// The landing bump: up and back over the first LAND_FADE seconds.
export function landScale(land, t) {
  return 1 + 0.25 * Math.sin(clamp01((t - land) / LAND_FADE) * Math.PI);
}

// Until when a landing's lit copy can show.
export function landUntil(W, land, keepLit) {
  let b = land + LAND_POP;
  if (keepLit) for (const w of W) if (w[1] + TEASE_TAIL > land) b = Math.max(b, w[1] + TEASE_TAIL);
  return b;
}

// What lands lit in a round: its scatters and trigger coins, with the time
// each one's reel (or cell) stops.
export function landings(R, rows) {
  const coins = (R.win && R.win.coins) || [];
  const cells = ((R.win && R.win.scatters) || []).map(([c, r]) => ({ c, r, coin: null })).concat(coins.map((cn) => ({ c: cn.c, r: cn.r, coin: cn })));
  const out = [];
  for (const it of cells) {
    const t = R.cells ? R.cells[it.c * rows + it.r]?.stop : R.reels[it.c]?.stop;
    if (t != null) out.push({ ...it, t });
  }
  return out;
}
