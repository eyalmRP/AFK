// Screen layout for a project: where the reel window, each reel, the logo,
// the win meter and the marquee bulbs sit. Pure math, shared by the canvas
// renderer and the After Effects exporter so both place things identically.

import { wheelGeometry } from './wheel.js';
import { potsConfig, placePots } from './pots.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function computeLayout(project) {
  const W = project.canvas.width;
  const H = project.canvas.height;
  const { reels, rows } = project.grid;
  const peek = clamp(Number(project.grid.peek) || 0, 0, 0.5);
  const aspect = clamp(Number(project.grid.cellAspect) || 1, 0.5, 2);
  const curvature = clamp(Number(project.grid.curvature) || 0, 0, 1);
  const portrait = H > W * 1.1;
  const hud = !!project.machine.showHud;
  // Pots above the machine take a taller band; the machine scales down.
  const pots = potsConfig(project);
  const topZone = pots.on ? H * pots.band : H * (portrait ? 0.2 : 0.165);
  const bottomZone = hud ? H * (portrait ? 0.15 : 0.15) : H * 0.06;
  const availW = W * (portrait ? 0.94 : 0.74);
  const availH = H - topZone - bottomZone;
  const gapK = 0.05;
  const padK = 0.2;
  const unitsW = reels + (reels - 1) * gapK + 2 * padK;
  const unitsH = (rows + 2 * peek) * aspect + 2 * padK;
  const cellW = Math.max(8, Math.floor(Math.min(availW / unitsW, availH / unitsH)));
  const cellH = Math.round(cellW * aspect);
  const gap = Math.round(cellW * gapK);
  const pad = Math.round(cellW * padK);
  const winW = reels * cellW + (reels - 1) * gap;
  const winH = Math.round((rows + 2 * peek) * cellH);
  const frameW = winW + 2 * pad;
  const frameH = winH + 2 * pad;
  const frameX = Math.round((W - frameW) / 2);
  const frameY = Math.round(topZone + (availH - frameH) / 2);
  const winX = frameX + pad;
  const winTop = frameY + pad;
  const reelX = Array.from({ length: reels }, (_, c) => winX + c * (cellW + gap));
  const rowsTop = winTop + peek * cellH;
  const winCY = winTop + winH / 2;
  const theta = curvature * 1.15;

  const mapY = (yFlat) => {
    if (theta < 1e-3) return { y: yFlat, s: 1 };
    const h = winH / 2;
    const u = clamp((yFlat - winCY) / h, -1.6, 1.6);
    const a = u * theta;
    const k = Math.sin(theta);
    return { y: winCY + (h * Math.sin(a)) / k, s: Math.max(0.05, (Math.cos(a) * theta) / k) };
  };

  // rowPos 0 = top visible row; fractional while spinning.
  const cellCenter = (c, rowPos) => {
    const yFlat = rowsTop + (rowPos + 0.5) * cellH;
    const m = mapY(yFlat);
    return { x: reelX[c] + cellW / 2, y: m.y, s: m.s, yFlat };
  };

  const bulbs = [];
  const ringInset = pad * 0.5;
  const bx = frameX + ringInset;
  const by = frameY + ringInset;
  const bw = frameW - ringInset * 2;
  const bh = frameH - ringInset * 2;
  const spacing = Math.max(18, cellW * 0.2);
  const perim = 2 * (bw + bh);
  const n = Math.max(8, Math.round(perim / spacing));
  for (let i = 0; i < n; i++) {
    let d = (i / n) * perim;
    let x;
    let y;
    if (d < bw) {
      x = bx + d;
      y = by;
    } else if ((d -= bw) < bh) {
      x = bx + bw;
      y = by + d;
    } else if ((d -= bh) < bw) {
      x = bx + bw - d;
      y = by + bh;
    } else {
      d -= bw;
      x = bx;
      y = by + bh - d;
    }
    bulbs.push({ x, y });
  }

  const logoH = topZone * 0.78;
  const hudH = bottomZone * 0.6;
  const frame = { x: frameX, y: frameY, w: frameW, h: frameH, r: pad * 0.9 };
  const logo = { cx: W / 2, cy: Math.max(logoH / 2 + H * 0.01, frameY / 2), w: Math.min(W * 0.9, frameW * 1.05), h: logoH };
  const potList = pots.on ? placePots(pots, W, H, topZone, frame, pad) : null;
  return {
    W,
    H,
    portrait,
    reels,
    rows,
    peek,
    curvature,
    cellW,
    cellH,
    gap,
    pad,
    winX,
    winW,
    winTop,
    winH,
    winCY,
    rowsTop,
    reelX,
    frame,
    logo,
    // The pots replace the title; the free spins ribbon goes above them.
    pots: potList,
    // The multiplier plaque: over the top row, or the bottom one when the
    // pots' nameplates sit on the frame's top edge.
    multTarget: { x: W / 2, y: potList ? winTop + winH - cellH * 0.55 : winTop + cellH * 0.55 },
    ribbonY: potList ? Math.max(H * 0.035, Math.min(...potList.map((p) => p.top)) * 0.5) : Math.min(frameY - H * 0.025, logo.cy + logo.h * 0.42),
    hud: hud
      ? { x: frameX + frameW * 0.18, y: frameY + frameH + (bottomZone - hudH) * 0.45, w: frameW * 0.64, h: hudH }
      : null,
    bulbs,
    bulbR: Math.max(3, cellW * 0.035),
    mapY,
    cellCenter,
    center: { x: W / 2, y: winCY },
    wheel: wheelGeometry(project, W, H),
  };
}
