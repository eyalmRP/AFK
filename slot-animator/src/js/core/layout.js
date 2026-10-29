// Screen layout for a project: where the reel window, each reel, the logo,
// the win meter and the marquee bulbs sit. Pure math, shared by the canvas
// renderer and the After Effects exporter so both place things identically.

import { wheelGeometry } from './wheel.js';
import { potsConfig, placePots } from './pots.js';
import { jackpotsConfig, jackpotRoom, placeJackpots } from './jackpots.js';

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
  // Without a title the machine takes its room, keeping a strip for the
  // free spins counter.
  const pots = potsConfig(project);
  const titled = project.machine.showTitle !== false;
  const topZone = pots.on ? H * pots.band : titled ? H * (portrait ? 0.2 : 0.165) : H * 0.1;
  const bottomZone = hud ? H * (portrait ? 0.15 : 0.15) : H * 0.06;
  // Jackpot boxes take room on their side of the machine, in cells; boxes
  // at the sides may use the margins too.
  const jp = jackpotsConfig(project);
  const room = jackpotRoom(jp);
  const sideRoom = room.left + room.right;
  const availW = W * (portrait || sideRoom > 0 ? 0.94 : 0.74);
  const availH = H - topZone - bottomZone;
  const gapK = 0.05;
  const padK = 0.2;
  const unitsW = reels + (reels - 1) * gapK + 2 * padK + sideRoom;
  const unitsH = (rows + 2 * peek) * aspect + 2 * padK + room.top + room.bottom;
  const sizes = (cw) => {
    const ch = Math.round(cw * aspect);
    const gp = Math.round(cw * gapK);
    const pd = Math.round(cw * padK);
    const ww = reels * cw + (reels - 1) * gp;
    const wh = Math.round((rows + 2 * peek) * ch);
    return { cellH: ch, gap: gp, pad: pd, winW: ww, winH: wh, frameW: ww + 2 * pd, frameH: wh + 2 * pd };
  };
  const fitW = Math.max(8, Math.floor(Math.min(availW / unitsW, availH / unitsH)));
  const fit = sizes(fitW);
  // The machine with its boxes sits centred in the room left for it.
  let frameY = Math.round(topZone + (availH - fit.frameH - (room.top + room.bottom) * fitW) / 2 + room.top * fitW);
  const frameX0 = Math.round((W - fit.frameW - sideRoom * fitW) / 2 + room.left * fitW);
  // With pots, a machine that does not fill the height (portrait, square)
  // rises so the pots, the ribbon above them and the machine sit centred
  // together instead of leaving the space above the pots empty.
  if (pots.on) {
    const first = placePots(pots, W, H, topZone, { x: frameX0, y: frameY, w: fit.frameW, h: fit.frameH }, fit.pad);
    const top = Math.min(...first.map((pt) => pt.top)) - H * 0.07;
    const below = H - (frameY + fit.frameH + room.bottom * fitW + bottomZone);
    if (top > below) frameY = Math.round(frameY - (top - below) / 2);
  }
  // Zoom scales the machine, its pots, the title and the win meter together
  // about the middle of that group; 1 is the fitted size.
  const zoom = clamp(Number(project.machine.zoom) || 1, 0.5, 1.6);
  const logoH0 = topZone * 0.78;
  // The title sits over the boxes above the machine, if any.
  const logoCY0 = Math.max(logoH0 / 2 + H * 0.01, (frameY - room.top * fitW) / 2);
  const hudH0 = bottomZone * 0.6;
  let pivotY = 0;
  if (zoom !== 1) {
    // The group as asked for: pots at their full size, even where the top
    // of the screen stops them at 100%.
    const frame0 = { x: frameX0, y: frameY, w: fit.frameW, h: fit.frameH };
    const top0 = pots.on ? Math.min(...placePots(pots, W, H, topZone, frame0, fit.pad, 1, false).map((pt) => pt.top)) : titled ? logoCY0 - logoH0 / 2 : frameY - room.top * fitW;
    const bottom0 = frameY + fit.frameH + room.bottom * fitW + (hud ? (bottomZone - hudH0) * 0.45 + hudH0 : 0);
    pivotY = (top0 + bottom0) / 2;
  }
  const zy = (y) => (zoom === 1 ? y : pivotY + (y - pivotY) * zoom);
  const cellW = zoom === 1 ? fitW : Math.max(8, Math.round(fitW * zoom));
  const { cellH, gap, pad, winW, winH, frameW, frameH } = zoom === 1 ? fit : sizes(cellW);
  const frameX = zoom === 1 ? frameX0 : Math.round(W / 2 + (frameX0 + fit.frameW / 2 - W / 2) * zoom - frameW / 2);
  if (zoom !== 1) frameY = Math.round(zy(frameY + fit.frameH / 2) - frameH / 2);
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

  const logoH = logoH0 * zoom;
  const hudH = hudH0 * zoom;
  const frame = { x: frameX, y: frameY, w: frameW, h: frameH, r: pad * 0.9 };
  const logo = { cx: W / 2, cy: zy(logoCY0), w: Math.min(W * 0.9, frameW * 1.05), h: logoH };
  const potList = pots.on ? placePots(pots, W, H, topZone, frame, pad, zoom) : null;
  const jackpots = placeJackpots(jp, frame, cellW, W, H);
  const boxesTop = frameY - room.top * cellW;
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
    ribbonY: potList ? Math.max(H * 0.035, Math.min(...potList.map((p) => p.top)) * 0.5) : Math.max(H * 0.035, Math.min(boxesTop - H * 0.025, logo.cy + logo.h * 0.42)),
    // Progressive jackpot boxes (core/jackpots.js), in tier order.
    jackpots,
    hud: hud
      ? { x: frameX + frameW * 0.18, y: frameY + frameH + room.bottom * cellW + (bottomZone - hudH0) * 0.45 * zoom, w: frameW * 0.64, h: hudH }
      : null,
    bulbs,
    bulbR: Math.max(3, cellW * 0.035),
    mapY,
    cellCenter,
    center: { x: W / 2, y: winCY },
    wheel: wheelGeometry(project, W, H),
  };
}
