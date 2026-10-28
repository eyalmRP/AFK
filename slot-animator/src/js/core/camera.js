// The camera: while a reel (or a cell) teases with anticipation, the whole
// view pushes in towards it, follows the tease from reel to reel, and eases
// back out after the last one lands. Pure; the preview and the After Effects
// CAMERA null evaluate the same curve.

export const ZOOM_IN = 0.4;
export const ZOOM_HOLD = 0.15;
export const ZOOM_OUT = 0.5;
export const PAN = 0.35;

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};

export function zoomConfig(project) {
  const sp = project.spin || {};
  return { on: sp.zoomOn !== false, amount: Math.max(0, Math.min(1, Number(sp.zoom ?? 0.2))) };
}

// Windows of anticipation: { start, end, foci: [{ t, c, r }] } where r is
// null for a whole reel. Teases that follow each other closely share one
// window so the camera pans instead of zooming out and in again.
export function scheduleCamera(tl, project) {
  if (!zoomConfig(project).on) return [];
  const teases = [];
  for (const R of tl.rounds) {
    if (R.cells) for (const ci of R.cells) if (ci && ci.antic) teases.push({ start: ci.antic.start, end: ci.antic.end, c: ci.c, r: ci.r });
    if (!R.cells) R.reels.forEach((ri, c) => ri.antic && teases.push({ start: ri.antic.start, end: ri.antic.end, c, r: null }));
    for (const ci of R.pres.holdspin?.cells || []) if (ci.antic) teases.push({ start: ci.antic.start, end: ci.antic.end, c: ci.c, r: ci.r });
  }
  teases.sort((a, b) => a.start - b.start);
  const out = [];
  for (const tz of teases) {
    const last = out[out.length - 1];
    if (last && tz.start <= last.end + 0.3) {
      last.end = Math.max(last.end, tz.end);
      last.foci.push({ t: tz.start, c: tz.c, r: tz.r });
    } else out.push({ start: tz.start, end: tz.end, foci: [{ t: tz.start, c: tz.c, r: tz.r }] });
  }
  return out;
}

export function focusPoint(L, f) {
  if (f.r == null) return { x: L.reelX[f.c] + L.cellW / 2, y: L.winCY };
  const m = L.cellCenter(f.c, f.r);
  return { x: m.x, y: m.y };
}

// The camera at time t: zoom z (1 = none) about the point (x, y).
export function cameraAt(windows, t, L, amount) {
  for (const w of windows || []) {
    if (t < w.start || t > w.end + ZOOM_HOLD + ZOOM_OUT) continue;
    const k = smooth((t - w.start) / ZOOM_IN) * (1 - smooth((t - w.end - ZOOM_HOLD) / ZOOM_OUT));
    let p = focusPoint(L, w.foci[0]);
    for (let i = 1; i < w.foci.length; i++) {
      const b = smooth((t - w.foci[i].t) / PAN);
      if (b <= 0) continue;
      const q = focusPoint(L, w.foci[i]);
      p = { x: p.x + (q.x - p.x) * b, y: p.y + (q.y - p.y) * b };
    }
    return { z: 1 + amount * k, x: p.x, y: p.y };
  }
  return { z: 1, x: L.W / 2, y: L.H / 2 };
}
