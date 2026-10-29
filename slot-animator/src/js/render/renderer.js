// Draws one frame of the animation at time t. Everything is derived from
// the timeline, so scrubbing, looping and frame-by-frame export all give
// the same picture for the same t.

import { evalKeys, evalVelocity } from '../core/keys.js';
import { roundIndexAt, holdAlpha } from '../core/timeline.js';
import { isCoinSym, formatPrize, COIN_GLOW } from '../core/coins.js';
import { lineColor } from '../core/paylines.js';
import { hash01 } from '../core/rng.js';
import { sparkle, roundRect } from './paint.js';
import { canvas, paintTitle } from './sprites.js';
import { drawEmitter } from './particles.js';
import { jumpTarget, mergeTarget, flightPath, flightAt, bigScaleAt, winFxConfig } from '../core/winfx.js';
import { cameraAt, zoomConfig } from '../core/camera.js';
import { heldCells, walkStep, WALK_HOP } from '../core/timeline.js';
import { pointerAt } from '../core/wheel.js';
import { teaseWindows, teaseEnv, teaseDim, landLit, landScale, landings, LAND_POP } from '../core/tease.js';
import { potsConfig, potBump, potCharge, beamCurve, beamPoints, pointAlong, beamState, beamSide, beamFlicker, BEAM_PASSES, POT_BOX } from '../core/pots.js';
import { BOOST } from '../core/timeline.js';
import { jackpotsConfig, jackpotValue, jackpotFx, JP_TEXT } from '../core/jackpots.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const prog = (t, a, b) => clamp01((t - a) / Math.max(1e-6, b - a));
export const ease = {
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inCubic: (x) => x * x * x,
  outBack: (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
  outElastic: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin(((x * 10 - 0.75) * (2 * Math.PI)) / 3) + 1),
  inOut: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
};

function env(t, a, b, fin = 0.25, fout = 0.3) {
  if (t < a || t > b) return 0;
  return Math.min(clamp01((t - a) / fin), clamp01((b - t) / fout));
}

function glowSprite(res, color) {
  let g = res.glowColored?.get(color);
  if (g) return g;
  if (!res.glowColored) res.glowColored = new Map();
  g = canvas(128, 128);
  const x = g.getContext('2d');
  const rg = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, '#ffffff');
  rg.addColorStop(0.12, color);
  rg.addColorStop(0.45, color.startsWith('#') ? color + '55' : color);
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = rg;
  x.fillRect(0, 0, 128, 128);
  res.glowColored.set(color, g);
  return g;
}

function drawGlow(ctx, res, color, x, y, size, alpha) {
  if (alpha <= 0.002) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Within whatever fade the caller has set.
  ctx.globalAlpha *= Math.min(1, alpha);
  ctx.drawImage(glowSprite(res, color), x - size / 2, y - size / 2, size, size);
  ctx.restore();
}

function cachedTitle(res, key, text, px, pal) {
  const k = `${key}|${text}|${px}|${pal}`;
  let c = res.titleCache.get(k);
  if (!c) {
    c = paintTitle(text, res.font, px, pal);
    res.titleCache.set(k, c);
    if (res.titleCache.size > 80) res.titleCache.delete(res.titleCache.keys().next().value);
  }
  return c;
}

function drawCentered(ctx, img, x, y, scale = 1, alpha = 1, rot = 0) {
  if (!img || alpha <= 0.002 || scale <= 0.001) return;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, alpha);
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}

// Shimmer: a diagonal light band sweeping across an image's opaque pixels.
function drawShimmer(ctx, res, img, x, y, scale, phase, alpha = 1) {
  if (!img || phase < 0 || phase > 1) return;
  let tmp = res.shimmerTmp;
  if (!tmp || tmp.width < img.width || tmp.height < img.height) {
    tmp = res.shimmerTmp = canvas(Math.max(img.width, tmp?.width || 0), Math.max(img.height, tmp?.height || 0));
  }
  const g = tmp.getContext('2d');
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, tmp.width, tmp.height);
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-in';
  const bx = -img.width * 0.4 + phase * img.width * 1.8;
  const lg = g.createLinearGradient(bx - img.height, 0, bx + img.height * 0.2, img.height);
  lg.addColorStop(0, 'rgba(255,255,255,0)');
  lg.addColorStop(0.45, 'rgba(255,255,255,0)');
  lg.addColorStop(0.55, 'rgba(255,255,255,0.85)');
  lg.addColorStop(0.65, 'rgba(255,255,255,0)');
  lg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = lg;
  g.fillRect(0, 0, img.width, img.height);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.drawImage(tmp, 0, 0, img.width, img.height, -img.width / 2, -img.height / 2, img.width, img.height);
  ctx.restore();
}

function drawSymbol(ctx, scene, symIdx, c, rowPos, blurAmt, scale = 1, alpha = 1) {
  const { L, res } = scene;
  const sp = res.sym[symIdx] || res.sym[0];
  if (!sp) return;
  const m = L.cellCenter(c, rowPos);
  const w = L.cellW * scale;
  const h = L.cellH * m.s * scale;
  if (blurAmt < 0.98) {
    ctx.globalAlpha = alpha * (1 - blurAmt * 0.85);
    ctx.drawImage(sp.sharp, m.x - w / 2, m.y - h / 2, w, h);
  }
  if (blurAmt > 0.02) {
    const bh = (L.cellH + 2 * sp.ext) * m.s * scale * (1 + blurAmt * 0.25);
    ctx.globalAlpha = alpha * blurAmt;
    ctx.drawImage(sp.blur, m.x - w / 2, m.y - bh / 2, w, bh);
  }
  ctx.globalAlpha = 1;
}

function actorsByCol(R, reels) {
  if (!R._byCol) {
    R._byCol = Array.from({ length: reels }, () => []);
    for (const a of R.actors) R._byCol[a.c].push(a);
  }
  return R._byCol;
}

function drawMultLabel(ctx, scene, value, x, y, s = 1, alpha = 1) {
  const { L, res } = scene;
  const img = cachedTitle(res, 'mult', `x${value}`, Math.round(L.cellH * 0.3), 'fire');
  drawCentered(ctx, img, x, y + L.cellH * 0.2 * s, s * Math.min(1, (L.cellW * 0.95) / img.width), alpha);
}

// Values riding on symbols: "x5" on a multiplier, the prize on a coin.
function drawValueLabel(ctx, scene, sym, value, x, y, s = 1, alpha = 1) {
  const { L, res, tl, project } = scene;
  if (!isCoinSym(tl.lay, sym)) {
    drawMultLabel(ctx, scene, value, x, y, s, alpha);
    return;
  }
  // A jackpot coin shows its name only; its box shows the value.
  if (tl.jackpots?.coinSyms.includes(sym)) return;
  const text = formatPrize(value, project.machine.currency || '', project.machine.decimals | 0);
  const img = cachedTitle(res, 'coinval', text, Math.round(L.cellH * 0.2), 'silver');
  const dy = res.coinLabelled?.[sym - tl.lay.coinBase] ? -L.cellH * 0.1 : 0;
  drawCentered(ctx, img, x, y + dy * s, s * Math.min(1, (L.cellW * 0.64) / img.width), alpha);
}

function drawActor(ctx, scene, a, t, blurK, popDur) {
  const rowPos = evalKeys(a.keys, t);
  const v = Math.abs(evalVelocity(a.keys, t));
  let scale = 1;
  let alpha = 1;
  if (a.popAt != null && t >= a.popAt) {
    const k = clamp01((t - a.popAt) / popDur);
    scale = 1 + 0.38 * ease.outCubic(k);
    alpha = 1 - k * k;
  }
  drawSymbol(ctx, scene, a.sym, a.c, rowPos, clamp01((v - 4) / 16) * blurK, scale, alpha);
  if (a.mult != null) {
    const m = scene.L.cellCenter(a.c, rowPos);
    drawValueLabel(ctx, scene, a.sym, a.mult, m.x, m.y, scale, alpha);
  }
}

// Draws into an offscreen layer and composites it at the given opacity, so
// overlapping symbols fade as one picture.
function withAlpha(ctx, scene, a, fn) {
  if (a >= 0.999) {
    fn(ctx);
    return;
  }
  if (a <= 0.001) return;
  const cw = ctx.canvas.width;
  const chh = ctx.canvas.height;
  let tmp = scene.res.layerTmp;
  if (!tmp || tmp.width !== cw || tmp.height !== chh) tmp = scene.res.layerTmp = canvas(cw, chh);
  const g = tmp.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cw, chh);
  g.setTransform(ctx.getTransform());
  fn(g);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = a;
  ctx.drawImage(tmp, 0, 0);
  ctx.restore();
}

function drawReels(ctx, scene, R, t) {
  const hA = holdAlpha(scene.tl, t);
  withAlpha(ctx, scene, 1 - hA, (g) => drawMachineReels(g, scene, R, t));
  withAlpha(ctx, scene, hA, (g) => drawHoldBoard(g, scene, t));
}

// The Hold & Spin board: every cell is its own little reel of coins and
// empty cells.
function drawHoldBoard(ctx, scene, t) {
  const { tl, L, project } = scene;
  const H = tl.hold;
  const blurK = Number(project.spin.blur) || 0;
  for (let c = 0; c < tl.reels; c++) {
    for (let r = 0; r < tl.rows; r++) {
      const k = c * tl.rows + r;
      const P = evalKeys(H.keys[k], t);
      const blur = clamp01((Math.abs(evalVelocity(H.keys[k], t)) - 3) / 14) * blurK;
      ctx.save();
      ctx.beginPath();
      ctx.rect(L.reelX[c], L.rowsTop + r * L.cellH, L.cellW, L.cellH);
      ctx.clip();
      const base = Math.floor(P);
      for (let j = base - 2; j <= base + 2; j++) {
        const local = tl.dir > 0 ? -(j - P) : j - P;
        if (Math.abs(local) > 1.3) continue;
        const sym = H.strips[k][j];
        if (sym == null) continue;
        drawSymbol(ctx, scene, sym, c, r + local, blur);
        const v = H.values[k].get(j);
        if (v != null) {
          const m = L.cellCenter(c, r + local);
          drawValueLabel(ctx, scene, sym, v, m.x, m.y, 1, 1 - blur * 0.6);
        }
      }
      ctx.restore();
    }
  }
}

function drawMachineReels(ctx, scene, R, t) {
  const { tl, L, project } = scene;
  const blurK = Number(project.spin.blur) || 0;
  const popDur = Number(project.timing.tumblePop) || 0.36;
  const useActors = R && R.actorsFrom != null && t >= R.actorsFrom;
  const byCol = useActors ? actorsByCol(R, tl.reels) : null;
  // A cell held by a sticky wild is cut out of its reel: the strip spins on
  // behind the machine, not through the wild.
  const held = heldCells(tl, t);
  for (let c = 0; c < tl.reels; c++) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(L.reelX[c], L.winTop, L.cellW, L.winH);
    for (const hc of held) {
      if (hc.c !== c) continue;
      const y0 = L.mapY(L.rowsTop + hc.r * L.cellH).y;
      const y1 = L.mapY(L.rowsTop + (hc.r + 1) * L.cellH).y;
      ctx.rect(L.reelX[c], y0, L.cellW, y1 - y0);
    }
    ctx.clip('evenodd');
    if (useActors) {
      for (const a of byCol[c]) if (t >= a.tIn && t < a.tOut) drawActor(ctx, scene, a, t, blurK, popDur);
    } else if (tl.mode === 'cascade') {
      const grid = R ? R.prevGrid : tl.initialGrid;
      for (let r = 0; r < tl.rows; r++) drawSymbol(ctx, scene, grid[c][r], c, r, 0);
    } else if (tl.mode === 'cells') {
      for (let r = 0; r < tl.rows; r++) {
        if (held.some((hc) => hc.c === c && hc.r === r)) continue;
        const si = c * tl.rows + r;
        const keys = tl.stripKeys[si];
        const P = evalKeys(keys, t);
        const v = Math.abs(evalVelocity(keys, t));
        const blur = clamp01((v - 3) / 14) * blurK;
        ctx.save();
        ctx.beginPath();
        ctx.rect(L.reelX[c], L.rowsTop + r * L.cellH, L.cellW, L.cellH);
        ctx.clip();
        const base = Math.floor(P);
        for (let j = base - 2; j <= base + 2; j++) {
          const local = tl.dir > 0 ? -(j - P) : j - P;
          if (Math.abs(local) > 1.3) continue;
          const sym = tl.strips[si][j];
          if (sym == null) continue;
          drawSymbol(ctx, scene, sym, c, r + local, blur);
          const mv = tl.stripValues[si].get(j);
          if (mv != null) {
            const m = L.cellCenter(c, r + local);
            drawValueLabel(ctx, scene, sym, mv, m.x, m.y);
          }
        }
        ctx.restore();
      }
    } else {
      const keys = tl.stripKeys[c];
      const P = evalKeys(keys, t);
      const v = Math.abs(evalVelocity(keys, t));
      const blur = clamp01((v - 3) / 14) * blurK;
      const strip = tl.strips[c];
      const base = Math.floor(P);
      for (let j = base - 3; j <= base + tl.rows + 3; j++) {
        const rowPos = tl.dir > 0 ? tl.rows - 1 - (j - P) : j - P;
        if (rowPos < -1.6 - L.peek || rowPos > tl.rows + 0.6 + L.peek) continue;
        const sym = strip[j];
        if (sym == null) continue;
        drawSymbol(ctx, scene, sym, c, rowPos, blur);
        const mv = tl.stripValues[c].get(j);
        if (mv != null) {
          const m = L.cellCenter(c, rowPos);
          drawValueLabel(ctx, scene, sym, mv, m.x, m.y);
        }
      }
    }
    ctx.restore();
  }
}

function winDim(R, t) {
  if (!R) return 0;
  const p = R.pres;
  let d = 0;
  for (const st of p.steps || []) d = Math.max(d, env(t, st.start, st.end + (st.tumble ? 0.25 : 0), 0.2, 0.35));
  if (p.mult) d = Math.max(d, env(t, p.mult.start, p.mult.end, 0.2, 0.4) * 0.8);
  if (p.celebrate) d = Math.max(d, env(t, p.celebrate.start, p.celebrate.end + 0.4, 0.2, 0.4));
  if (p.nearmiss) d = Math.max(d, env(t, p.nearmiss.start, p.nearmiss.end, 0.2, 0.3) * 0.6);
  return d;
}

function anticActive(R, t) {
  if (!R) return null;
  return R.reels.map((ri) => (ri.antic ? teaseEnv([ri.antic.start, ri.antic.end], t) : 0));
}

function drawInWindowFx(ctx, scene, R, t) {
  const { L, project } = scene;
  if (!R) return;
  const theme = scene.res.theme;
  // Landing glint on each reel.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  R.reels.forEach((ri, c) => {
    const a = t - ri.stop;
    if (a < 0 || a > 0.32) return;
    const k = Math.pow(1 - a / 0.32, 2) * 0.22;
    const g = ctx.createLinearGradient(0, L.winTop, 0, L.winTop + L.winH);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, `rgba(255,250,230,${k})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(L.reelX[c], L.winTop, L.cellW, L.winH);
  });
  // Anticipation: warm energy inside the teasing reel, others dimmed.
  const an = anticActive(R, t);
  const any = an.some((x) => x > 0);
  if (any) {
    an.forEach((a, c) => {
      if (a <= 0) return;
      const pulse = 0.5 + 0.5 * Math.sin(t * 14 + c);
      const g = ctx.createLinearGradient(L.reelX[c], 0, L.reelX[c] + L.cellW, 0);
      g.addColorStop(0, `rgba(255,140,20,${0.32 * a})`);
      g.addColorStop(0.5, `rgba(255,200,60,${(0.05 + 0.08 * pulse) * a})`);
      g.addColorStop(1, `rgba(255,140,20,${0.32 * a})`);
      ctx.fillStyle = g;
      ctx.fillRect(L.reelX[c], L.winTop, L.cellW, L.winH);
      const sweep = ((t * 1.6) % 1) * (L.winH + L.cellH) - L.cellH / 2;
      const sg = ctx.createLinearGradient(0, L.winTop + sweep - L.cellH * 0.4, 0, L.winTop + sweep + L.cellH * 0.4);
      sg.addColorStop(0, 'rgba(255,230,160,0)');
      sg.addColorStop(0.5, `rgba(255,230,160,${0.22 * a})`);
      sg.addColorStop(1, 'rgba(255,230,160,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(L.reelX[c], L.winTop, L.cellW, L.winH);
    });
  }
  ctx.restore();
  if (any) {
    const W = teaseWindows(R);
    an.forEach((a, c) => {
      const d = teaseDim(W, c, t);
      if (d <= 0) return;
      ctx.fillStyle = `rgba(0,0,0,${d})`;
      ctx.fillRect(L.reelX[c], L.winTop, L.cellW, L.winH);
    });
  }
  // Dim the whole window while wins are shown; winners are redrawn on top.
  const d = winDim(R, t) * (Number(project.effects.dim) || 0);
  if (d > 0) {
    ctx.fillStyle = `rgba(0,0,0,${d})`;
    ctx.fillRect(L.winX, L.winTop, L.winW, L.winH);
  }
  void theme;
}

function drawAnticFrames(ctx, scene, R, t) {
  const { L, res } = scene;
  const an = anticActive(R, t);
  if (!an) return;
  if (R.cells) {
    for (const ci of R.cells) {
      if (!ci || !ci.antic) continue;
      const a = env(t, ci.antic.start - 0.05, ci.antic.end + 0.3, 0.2, 0.3);
      if (a <= 0) continue;
      const x = L.reelX[ci.c];
      const y = L.rowsTop + ci.r * L.cellH;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = L.cellW * 0.045;
      ctx.strokeStyle = `rgba(255,170,40,${0.9 * a})`;
      ctx.shadowColor = 'rgba(255,120,0,1)';
      ctx.shadowBlur = L.cellW * 0.3 * (0.6 + 0.4 * Math.sin(t * 18));
      roundRect(ctx, x + 2, y + 2, L.cellW - 4, L.cellH - 4, L.cellW * 0.08);
      ctx.stroke();
      ctx.restore();
    }
  }
  an.forEach((a, c) => {
    if (a <= 0) return;
    const x = L.reelX[c];
    const pulse = 0.6 + 0.4 * Math.sin(t * 18);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = L.cellW * 0.05;
    ctx.strokeStyle = `rgba(255,170,40,${0.9 * a})`;
    ctx.shadowColor = 'rgba(255,120,0,1)';
    ctx.shadowBlur = L.cellW * 0.3 * pulse;
    roundRect(ctx, x - L.gap * 0.3, L.winTop - L.gap * 0.3, L.cellW + L.gap * 0.6, L.winH + L.gap * 0.6, L.cellW * 0.06);
    ctx.stroke();
    ctx.lineWidth = L.cellW * 0.014;
    ctx.strokeStyle = `rgba(255,250,220,${a})`;
    ctx.stroke();
    ctx.restore();
    // Rising embers along both edges.
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? x - L.gap * 0.2 : x + L.cellW + L.gap * 0.2;
      const life = 0.9 + hash01(i, 3) * 0.6;
      const ph = ((t + hash01(i, 4) * life) % life) / life;
      const yy = L.winTop + L.winH * (1 - ph) + (hash01(i, 5) - 0.5) * L.cellH * 0.2;
      const xx = side + Math.sin(ph * 9 + i) * L.cellW * 0.06;
      drawGlow(ctx, res, '#ff9a1a', xx, yy, L.cellW * (0.12 + 0.12 * hash01(i, 6)), a * (1 - ph) * 0.9);
    }
  });
}

function drawBokeh(ctx, scene, t) {
  const { L, res } = scene;
  const cols = res.theme.bokeh;
  for (let i = 0; i < 28; i++) {
    const x = hash01(i, 11) * L.W + Math.sin(t * 0.2 + i) * L.W * 0.01;
    const speed = 0.012 + hash01(i, 12) * 0.03;
    const y = L.H - (((hash01(i, 13) + t * speed) % 1.2) - 0.1) * L.H;
    const s = L.H * (0.03 + hash01(i, 14) * 0.08);
    const tw = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * (0.6 + hash01(i, 15)) + i * 2.1), 2);
    drawGlow(ctx, res, cols[i % cols.length], x, y, s, 0.22 * tw * (Number(scene.project.effects.bokeh) || 0));
  }
}

function machineState(R, t) {
  if (!R) return 'idle';
  if (t < R.spinEnd) return 'spin';
  const p = R.pres;
  if ((p.lines && t < p.lines.end) || (p.overlay && t < p.overlay.end) || (p.banner && t < p.banner.end) || (p.wheel && t < p.wheel.outEnd) || (p.celebrate && t < p.celebrate.end)) return 'win';
  return 'idle';
}

function drawMarquee(ctx, scene, R, t) {
  const { L, res, project } = scene;
  if (!project.machine.marquee || project.machine.builtinFrame === false) return;
  const state = machineState(R, t);
  const n = L.bulbs.length;
  for (let i = 0; i < n; i++) {
    let b;
    if (state === 'win') b = i % 2 === Math.floor(t * 7) % 2 ? 1 : 0.18;
    else if (state === 'spin') b = 0.2 + 0.8 * Math.pow(0.5 + 0.5 * Math.cos(Math.PI * 2 * (i / 6 - t * 2.6)), 6);
    else b = 0.28 + 0.72 * Math.pow(0.5 + 0.5 * Math.cos(Math.PI * 2 * (i / 10 - t * 0.6)), 8);
    drawBulb(ctx, scene, L.bulbs[i], b);
  }
}

function drawBulb(ctx, scene, p, b) {
  const { L, res } = scene;
  const col = res.theme.accent;
  ctx.save();
  const r = L.bulbR;
  const g = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, 0, p.x, p.y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.45, b > 0.5 ? '#fff6d0' : '#d9b56a');
  g.addColorStop(1, b > 0.5 ? col : '#5a3c10');
  ctx.globalAlpha = 0.45 + 0.55 * b;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  drawGlow(ctx, res, col, p.x, p.y, r * 7, b * 0.5);
  ctx.restore();
}

// Static layers for the After Effects package.
export function paintHudLayer(scene) {
  const c = canvas(scene.L.W, scene.L.H);
  drawHudPanel(c.getContext('2d'), scene, null, true);
  return c;
}

export function paintBulbLayer(scene, parity) {
  const c = canvas(scene.L.W, scene.L.H);
  const g = c.getContext('2d');
  scene.L.bulbs.forEach((p, i) => {
    if (i % 2 === parity) drawBulb(g, scene, p, 1);
  });
  return c;
}

export function paintWheelBulbLayer(scene, parity) {
  const wh = scene.res.wheel;
  const c = canvas(wh.ringSize, wh.ringSize);
  const g = c.getContext('2d');
  g.translate(wh.ringSize / 2, wh.ringSize / 2);
  wh.bulbs.forEach((p, i) => {
    if (i % 2 !== parity) return;
    const rg = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, wh.R * 0.03);
    rg.addColorStop(0, '#ffffff');
    rg.addColorStop(0.5, '#fff3c4');
    rg.addColorStop(1, scene.res.theme.accent);
    g.fillStyle = rg;
    g.beginPath();
    g.arc(p.x, p.y, wh.R * 0.03, 0, Math.PI * 2);
    g.fill();
    drawGlow(g, scene.res, scene.res.theme.accent, p.x, p.y, wh.R * 0.22, 0.55);
  });
  return c;
}

function drawLogo(ctx, scene, t) {
  const { L, res } = scene;
  if (!res.logo) return;
  const breathe = 1 + 0.012 * Math.sin(t * 1.6);
  drawGlow(ctx, res, res.theme.glow, L.logo.cx, L.logo.cy, res.logo.width * 0.9, 0.18 + 0.06 * Math.sin(t * 2));
  drawCentered(ctx, res.logo, L.logo.cx, L.logo.cy, breathe);
  const cyc = 4.5;
  drawShimmer(ctx, res, res.logo, L.logo.cx, L.logo.cy, breathe, ((t % cyc) / cyc) * 1.6 - 0.2, 0.9);
}

function digitGlyphs(res, px, pal) {
  const k = `${px}|${pal}`;
  let d = res.digitCache.get(k);
  if (d) return d;
  const chars = '0123456789,.$€£¥ ';
  const probe = canvas(4, 4).getContext('2d');
  probe.font = `${px}px ${res.font}`;
  const glyphs = {};
  let digitW = 0;
  for (const ch of chars) {
    const img = paintTitle(ch, res.font, px, pal);
    glyphs[ch] = { img, w: probe.measureText(ch).width };
    if (/\d/.test(ch)) digitW = Math.max(digitW, glyphs[ch].w);
  }
  d = { glyphs, digitW, px };
  res.digitCache.set(k, d);
  return d;
}

function glyphFor(set, ch) {
  if (!set.glyphs[ch]) {
    set.glyphs[ch] = { img: paintTitle(ch, '', set.px, 'gold'), w: set.px * 0.6 };
  }
  return set.glyphs[ch];
}

// Rolling odometer counter. Each digit column rolls only while the digits
// below it carry over, like a mechanical counter.
export function drawOdometer(ctx, res, value, cx, cy, px, o = {}) {
  const pal = o.pal || 'gold';
  const set = digitGlyphs(res, Math.round(px), pal);
  const decimals = Math.max(0, o.decimals | 0);
  const scale = Math.pow(10, decimals);
  const v = Math.max(0, value) * scale;
  const intUnits = Math.floor(v + 1e-6);
  const nDigits = Math.max(decimals + 1, String(intUnits).length);
  const slots = [];
  const cur = o.currency || '';
  for (const ch of cur) slots.push({ type: 's', ch });
  for (let k = nDigits - 1; k >= 0; k--) {
    const p = Math.pow(10, k);
    const base = Math.floor(v / p + 1e-9);
    const digit = ((base % 10) + 10) % 10;
    const lower = v - base * p;
    const pr = k === 0 ? lower : Math.max(0, lower - (p - 1));
    slots.push({ type: 'd', digit, prog: clamp01(pr), k });
    if (k === decimals && decimals > 0) slots.push({ type: 's', ch: '.' });
    else if (k > decimals && (k - decimals) % 3 === 0) slots.push({ type: 's', ch: ',' });
  }
  const adv = (s) => (s.type === 'd' ? set.digitW * 1.02 : glyphFor(set, s.ch).w * 1.02);
  const total = slots.reduce((a, s) => a + adv(s), 0);
  const sc = o.scale || 1;
  const rowH = px * 1.62;
  const rate = Math.abs(o.rate || 0) * scale;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(sc, sc);
  let x = -total / 2;
  for (const s of slots) {
    const w = adv(s);
    const mid = x + w / 2;
    if (s.type === 's') {
      const g = glyphFor(set, s.ch);
      ctx.drawImage(g.img, mid - g.img.width / 2, -g.img.height / 2);
    } else {
      const speed = rate / Math.pow(10, s.k);
      const ga = set.glyphs[String(s.digit)];
      const gb = set.glyphs[String((s.digit + 1) % 10)];
      // Fast columns tick like a counter; slower ones roll like an odometer.
      if (s.prog < 0.001 || speed > 18) {
        ctx.drawImage(ga.img, mid - ga.img.width / 2, -ga.img.height / 2);
      } else {
        // Roll inside a soft-edged window so digits fade in and out.
        const tw = Math.ceil(w * 2);
        const th = Math.ceil(rowH);
        let tmp = res.odoTmp;
        if (!tmp || tmp.width < tw || tmp.height < th) tmp = res.odoTmp = canvas(Math.max(tw, tmp?.width || 0), Math.max(th, tmp?.height || 0));
        const g = tmp.getContext('2d');
        g.globalCompositeOperation = 'source-over';
        g.clearRect(0, 0, tmp.width, tmp.height);
        const ox = tw / 2;
        const oy = th / 2;
        const off = s.prog * rowH;
        g.drawImage(ga.img, ox - ga.img.width / 2, oy - ga.img.height / 2 - off);
        g.drawImage(gb.img, ox - gb.img.width / 2, oy - gb.img.height / 2 - off + rowH);
        g.globalCompositeOperation = 'destination-in';
        const mg = g.createLinearGradient(0, 0, 0, th);
        mg.addColorStop(0, 'rgba(0,0,0,0)');
        mg.addColorStop(0.2, '#000');
        mg.addColorStop(0.8, '#000');
        mg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = mg;
        g.fillRect(0, 0, tw, th);
        ctx.drawImage(tmp, 0, 0, tw, th, mid - ox, -oy, tw, th);
      }
    }
    x += w;
  }
  ctx.restore();
}

function drawHud(ctx, scene, R, t) {
  const { L, res, project, tl } = scene;
  const h = L.hud;
  if (!h) return;
  drawHudPanel(ctx, scene, t);
  const cur = project.machine.currency || '';
  const dec = project.machine.decimals | 0;
  const v = evalKeys(tl.meterKeys, t);
  const rate = evalVelocity(tl.meterKeys, t);
  if (v > 0.0001 || (R && R.win.amount > 0 && t > R.presentStart)) {
    drawOdometer(ctx, res, v, h.x + h.w / 2, h.y + h.h * 0.6, Math.round(h.h * 0.42), { currency: cur, decimals: dec, rate });
  }
}

function fsStateAt(tl, t) {
  const block = tl.fsBlocks.find((b) => t >= b.start && t < b.end);
  if (!block) return null;
  let index = 0;
  let total = false;
  let n = block.n;
  for (const r of block.rounds) {
    if (r.t0 > t) continue;
    if (r.total) total = true;
    else index = r.index;
    // A retrigger raises the number of spins from its banner on.
    if (r.n) n = r.n;
  }
  return { block, index, total, n };
}

// panelOnly paints the bare panel: the After Effects build adds its labels
// as live text layers.
function drawHudPanel(ctx, scene, t = null, panelOnly = false) {
  const { L, res, project, tl } = scene;
  const h = L.hud;
  if (!h) return;
  const metal = res.theme.metal === 'neon' ? 'neon' : res.theme.metal === 'chrome' ? 'chrome' : 'gold';
  const fsNow = t == null ? null : fsStateAt(tl, t);
  const holdNow = t != null && holdAlpha(tl, t) > 0.5;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = h.h * 0.3;
  roundRect(ctx, h.x, h.y, h.w, h.h, h.h * 0.3);
  const g = ctx.createLinearGradient(0, h.y, 0, h.y + h.h);
  g.addColorStop(0, 'rgba(40,30,60,0.92)');
  g.addColorStop(1, 'rgba(5,3,12,0.96)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, h.x, h.y, h.w, h.h, h.h * 0.3);
  ctx.lineWidth = Math.max(2, h.h * 0.05);
  ctx.strokeStyle = scene.res.metalStroke || (scene.res.metalStroke = (() => {
    const s = ctx.createLinearGradient(0, h.y, 0, h.y + h.h);
    const m = metal === 'gold' ? ['#fff3b0', '#c98a17', '#5c3500'] : metal === 'neon' ? ['#bafcff', '#14b8d6', '#063247'] : ['#ffffff', '#8d97a6', '#2b323c'];
    s.addColorStop(0, m[0]);
    s.addColorStop(0.5, m[1]);
    s.addColorStop(1, m[2]);
    return s;
  })());
  ctx.stroke();
  ctx.restore();
  if (panelOnly) return;
  const label = Math.round(h.h * 0.2);
  ctx.save();
  ctx.font = `${label}px ${res.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = res.theme.accent;
  ctx.globalAlpha = 0.9;
  ctx.fillText('WIN', h.x + h.w / 2, h.y + h.h * 0.2);
  ctx.font = `${Math.round(label * 0.85)}px ${res.font}`;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  const cur = project.machine.currency || '';
  const dec = project.machine.decimals | 0;
  if (holdNow) {
    ctx.fillStyle = res.theme.accent;
    const n = tl.hold.locks.filter((l) => t >= l.from && t < l.to).length;
    ctx.fillText(`COINS ${n}/${tl.reels * tl.rows}`, h.x + h.w * 0.15, h.y + h.h * 0.55);
    ctx.fillText(`RESPINS ${Math.round(evalKeys(tl.hold.counterKeys, t))}`, h.x + h.w * 0.85, h.y + h.h * 0.55);
  } else if (fsNow) {
    ctx.fillStyle = res.theme.accent;
    ctx.fillText(fsNow.total ? 'FREE SPINS DONE' : `FREE SPINS ${fsNow.index}/${Math.max(fsNow.n, fsNow.index)}`, h.x + h.w * 0.15, h.y + h.h * 0.55);
    const tot = evalKeys(tl.fsTotalKeys, t);
    ctx.fillText(`TOTAL ${cur}${tot.toFixed(dec)}`, h.x + h.w * 0.85, h.y + h.h * 0.55);
  } else {
    ctx.fillText(`BET ${cur}${Number(project.machine.bet || 0).toFixed(dec)}`, h.x + h.w * 0.12, h.y + h.h * 0.55);
    const ways = project.machine.payMode === 'lines' ? `LINES ${tl.paylines.length}` : project.machine.payMode === 'ways' ? `${Math.pow(tl.rows, tl.reels)} WAYS` : project.machine.payMode === 'anywhere' ? `PAYS ${project.machine.minAnywhere}+` : `CLUSTER ${project.machine.minCluster}+`;
    ctx.fillText(ways, h.x + h.w * 0.88, h.y + h.h * 0.55);
  }
  ctx.restore();
}

function drawFsRibbon(ctx, scene, t) {
  const { L, res, tl } = scene;
  const st = fsStateAt(tl, t);
  if (!st) return;
  const a = Math.min(clamp01((t - st.block.start) / 0.4), clamp01((st.block.end - t) / 0.4));
  const text = st.total ? 'FREE SPINS COMPLETE' : `FREE SPIN ${Math.max(1, st.index)} OF ${Math.max(st.n, st.index)}`;
  const img = cachedTitle(res, 'fsribbon', text, Math.round(L.H * 0.04), 'aqua');
  const y = L.pots ? L.ribbonY : Math.min(L.frame.y - img.height * 0.32, L.logo.cy + L.logo.h * 0.42);
  drawCentered(ctx, img, L.W / 2, y, Math.min(1, (L.frame.w * 0.8) / img.width), a);
}

function drawFsTint(ctx, scene, t) {
  const st = fsStateAt(scene.tl, t);
  if (!st) return;
  const a = Math.min(clamp01((t - st.block.start) / 0.6), clamp01((st.block.end - t) / 0.6));
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.55 * a;
  ctx.fillStyle = scene.res.theme.glow;
  ctx.fillRect(0, 0, scene.L.W, scene.L.H);
  ctx.restore();
}

function stepCellColor(st, c, r) {
  for (const l of st.lines || []) if (l.cells.some(([cc, rr]) => cc === c && rr === r)) return lineColor(l.index);
  return st.symbol >= 0 ? lineColor(st.symbol + 3) : null;
}

function drawWinLines(ctx, scene, R, t, p) {
  const { L, tl, project } = scene;
  const a = env(t, p.start, p.end, 0.15, 0.35);
  if (a <= 0) return;
  const cw = L.cellW;
  const glowK = Number(project.effects.lineGlow) || 0;
  p.lines.forEach((l, li) => {
    const line = tl.paylines[l.index];
    if (!line) return;
    const pts = line.map((r, c) => L.cellCenter(c, r));
    const first = { x: L.frame.x + L.pad * 0.35, y: pts[0].y };
    const last = { x: L.frame.x + L.frame.w - L.pad * 0.35, y: pts[pts.length - 1].y };
    const path = [first, ...pts, last];
    const lens = [0];
    for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
    const total = lens[lens.length - 1];
    const reveal = ease.outCubic(prog(t, p.start + li * 0.07, p.start + li * 0.07 + 0.45)) * total;
    if (reveal <= 0) return;
    const build = () => {
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) {
        if (lens[i] <= reveal) ctx.lineTo(path[i].x, path[i].y);
        else {
          const k = (reveal - lens[i - 1]) / (lens[i] - lens[i - 1]);
          ctx.lineTo(path[i - 1].x + (path[i].x - path[i - 1].x) * k, path[i - 1].y + (path[i].y - path[i - 1].y) * k);
          break;
        }
      }
    };
    const col = lineColor(l.index);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    if (glowK > 0) {
      build();
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.3 * a * glowK;
      ctx.lineWidth = cw * 0.14;
      ctx.shadowColor = col;
      ctx.shadowBlur = cw * 0.22;
      ctx.stroke();
    }
    build();
    ctx.globalAlpha = 0.95 * a;
    ctx.lineWidth = cw * 0.05;
    ctx.shadowColor = col;
    ctx.shadowBlur = cw * 0.08;
    ctx.strokeStyle = col;
    ctx.stroke();
    ctx.shadowBlur = 0;
    build();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = cw * 0.016;
    ctx.globalAlpha = a;
    ctx.stroke();
    build();
    ctx.setLineDash([cw * 0.22, cw * 0.95]);
    ctx.lineDashOffset = -t * cw * 3.2;
    ctx.lineWidth = cw * 0.055;
    ctx.globalAlpha = 0.75 * a;
    ctx.stroke();
    ctx.restore();
    // Line number badge at the start.
    ctx.save();
    ctx.globalAlpha = a;
    const bx = first.x;
    const by = first.y;
    const br = L.pad * 0.38;
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = br;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#10051c';
    ctx.font = `${Math.round(br * 1.05)}px ${scene.res.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(l.index + 1), bx, by + br * 0.06);
    ctx.restore();
  });
}

function popScale(t, start, end, k) {
  const a = t - start;
  if (a < 0 || t > end) return 1;
  const intro = ease.outElastic(clamp01(a / 0.6));
  const loop = 0.78 + 0.22 * Math.sin(a * Math.PI * 2 * 1.3);
  const outro = clamp01((end - t) / 0.3);
  return 1 + k * (a < 0.6 ? intro : loop) * outro;
}

function drawWinCells(ctx, scene, R, t, cells, start, end, opts = {}) {
  const { L, res, project } = scene;
  const fx = project.effects;
  const a = env(t, start, end, 0.12, 0.3);
  if (a <= 0) return;
  const k = (Number(fx.popScale) || 0) * (opts.popMul || 1);
  const sym = (c, r, i) => (opts.syms ? opts.syms[i] : R.grid[c][r]);
  // Jumping or merging winners leave their cells (core/winfx.js).
  const wfx = opts.step && opts.step.fx;
  // Beaming to the pots: winners stay; each fires and its light drains.
  const beam = wfx && wfx.style === 'collect';
  const goal = wfx && !beam ? (wfx.style === 'jump' ? jumpTarget(project, L, opts.step) : mergeTarget(project, L, opts.step)) : null;
  cells.forEach(([c, r], i) => {
    const m0 = L.cellCenter(c, r);
    const col = opts.color || (opts.step && stepCellColor(opts.step, c, r)) || res.theme.accent;
    let s = popScale(t, start + (opts.stagger ? i * 0.05 : 0), end, k);
    let m = m0;
    let fa = 1;
    let stay = 1;
    let drain = 0;
    if (beam) {
      const f = t - wfx.launch[i];
      if (f >= 0 && f < 0.25) s *= 1 + 0.14 * Math.sin((f / 0.25) * Math.PI);
      drain = clamp01((f - 0.05) / 0.3);
      if (f >= 0 && f < 0.5) drawRing(ctx, m0.x, m0.y, f / 0.5, L.cellW * 0.75, potColor(scene, wfx.pots[i]), L.cellW * 0.045);
    } else if (wfx) {
      const f = flightAt(flightPath(wfx.style, m0, goal, L, wfx.path), wfx.launch[i], wfx.arrive[i], t, wfx.until[i]);
      if (f.flying) m = { x: f.x, y: f.y, s: m0.s };
      s *= f.s;
      fa = f.a;
      stay = 1 - clamp01((t - wfx.launch[i]) / 0.15);
    }
    if (fa <= 0 && stay <= 0) return;
    if (opts.rays && stay > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawCentered(ctx, res.raysSmall, m.x, m.y, (L.cellW * 2.1) / res.raysSmall.width * s, 0.75 * a, t * 1.2 + i);
      ctx.restore();
    }
    drawGlow(ctx, res, col, m.x, m.y, L.cellW * 1.7 * s, (0.45 + 0.2 * Math.sin(t * 6 + i)) * a * fa);
    ctx.save();
    ctx.globalAlpha *= fa;
    ctx.translate(m.x, m.y);
    ctx.scale(s, s * m.s);
    const si = sym(c, r, i);
    const anim = res.winAnim && res.winAnim[si];
    if (anim && anim.frames.length) {
      const f = anim.frames[Math.floor(Math.max(0, t - start) * anim.fps) % anim.frames.length];
      ctx.drawImage(f, -L.cellW / 2, -L.cellH / 2, L.cellW, L.cellH);
    } else {
      const sp = res.sym[si] || res.sym[0];
      ctx.drawImage(sp.sharp, -L.cellW / 2, -L.cellH / 2, L.cellW, L.cellH);
    }
    ctx.restore();
    // Values ride along: a coin's prize, a multiplier wild's x.
    const val = opts.values ? opts.values[i] : opts.mults?.[c]?.[r];
    if (val != null) drawValueLabel(ctx, scene, si, val, m.x, m.y, s, fa);
    if (drain > 0) {
      ctx.save();
      ctx.globalAlpha = 0.45 * drain * a;
      ctx.fillStyle = '#05020c';
      roundRect(ctx, m0.x - L.cellW * 0.47, m0.y - L.cellH * 0.47 * m0.s, L.cellW * 0.94, L.cellH * 0.94 * m0.s, L.cellW * 0.1);
      ctx.fill();
      ctx.restore();
    }
    if (stay <= 0) return;
    // Cell frame with a chasing light (it stays with the cell).
    ctx.save();
    ctx.globalAlpha = a * stay;
    const fw = L.cellW * 0.97;
    const fh = L.cellH * 0.97 * m0.s;
    roundRect(ctx, m0.x - fw / 2, m0.y - fh / 2, fw, fh, L.cellW * 0.1);
    ctx.lineWidth = L.cellW * 0.03;
    ctx.strokeStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = L.cellW * 0.15;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'lighter';
    ctx.setLineDash([L.cellW * 0.35, L.cellW * 3.4]);
    ctx.lineDashOffset = -t * L.cellW * 4 - i * L.cellW;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = L.cellW * 0.035;
    ctx.stroke();
    ctx.restore();
    if (Number(fx.sparkles) > 0) {
      for (let q = 0; q < 5; q++) {
        const salt = c * 31 + r * 7 + q;
        const per = 0.7 + hash01(salt, 21) * 0.6;
        const ph = ((t - start + hash01(salt, 22) * per) % per) / per;
        const tw = Math.sin(ph * Math.PI);
        const sx = m0.x + (hash01(salt + Math.floor((t - start) / per), 23) - 0.5) * L.cellW * 0.85;
        const sy = m0.y + (hash01(salt + Math.floor((t - start) / per), 24) - 0.5) * L.cellH * 0.85;
        sparkle(ctx, sx, sy, L.cellW * 0.11 * tw, a * stay * tw * Number(fx.sparkles));
      }
    }
  });
}

// After the winners: rings where jumpers land, or the merged big symbol.
function drawWinFxGoal(ctx, scene, R, st, t) {
  const wfx = st.fx;
  if (!wfx || wfx.style === 'collect' || t < st.start || t > st.end) return;
  const { L, res, project } = scene;
  const accent = res.theme.accent;
  if (wfx.style === 'jump') {
    const g = jumpTarget(project, L, st);
    let hit = 0;
    for (const at of wfx.arrive) {
      drawRing(ctx, g.x, g.y, (t - at) / 0.45, L.cellW * 0.65, accent, L.cellW * 0.05);
      if (t >= at) hit = Math.max(hit, 1 - clamp01((t - at) / 0.35));
    }
    if (hit > 0) drawGlow(ctx, res, accent, g.x, g.y, L.cellW * 1.6, 0.6 * hit);
    return;
  }
  const g = mergeTarget(project, L, st);
  const big = bigScaleAt(wfx.mergeAt, st.end, Number(winFxConfig(project).bigScale) || 2.2, t);
  // The pull: a glow gathering where they fuse; each arrival pulses it.
  const pull = clamp01((t - wfx.launch[0]) / (wfx.mergeAt - wfx.launch[0]));
  if (t < wfx.mergeAt) {
    drawGlow(ctx, res, accent, g.x, g.y, L.cellW * (1 + 1.5 * pull), 0.5 * pull);
    if (wfx.seq > 0.05) for (const at of wfx.arrive) drawRing(ctx, g.x, g.y, (t - at) / 0.35, L.cellW * 0.7, accent, L.cellW * 0.04);
  }
  if (big <= 0) return;
  const a = env(t, wfx.mergeAt, st.end, 0.05, 0.3);
  drawRing(ctx, g.x, g.y, (t - wfx.mergeAt) / 0.7, L.cellW * 2.6, accent, L.cellW * 0.07);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawCentered(ctx, res.raysSmall, g.x, g.y, ((L.cellW * big * 1.7) / res.raysSmall.width), 0.7 * a, t * 0.9);
  ctx.restore();
  drawGlow(ctx, res, accent, g.x, g.y, L.cellW * big * 1.6, 0.6 * a);
  const si = st.symbol >= 0 ? st.symbol : st.cellSyms[0];
  const anim = res.winAnim && res.winAnim[si];
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate(g.x, g.y);
  ctx.scale(big, big);
  if (anim && anim.frames.length) ctx.drawImage(anim.frames[Math.floor(Math.max(0, t - wfx.mergeAt) * anim.fps) % anim.frames.length], -L.cellW / 2, -L.cellH / 2, L.cellW, L.cellH);
  else ctx.drawImage((res.sym[si] || res.sym[0]).sharp, -L.cellW / 2, -L.cellH / 2, L.cellW, L.cellH);
  ctx.restore();
}

function drawRing(ctx, x, y, a, maxR, color, width) {
  if (a < 0 || a > 1) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.pow(1 - a, 1.5);
  ctx.strokeStyle = color;
  ctx.lineWidth = width * (1 - a * 0.7);
  ctx.shadowColor = color;
  ctx.shadowBlur = width * 2;
  ctx.beginPath();
  ctx.arc(x, y, maxR * ease.outCubic(a), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Win particles from the round's emitters (core/particles.js). "under"
// ones are drawn by their presentation, behind its title and counter.
function drawRoundParticles(ctx, scene, R, t, moments) {
  for (const em of R.pres.particles || []) if (em.layer === 'under' && moments.includes(em.moment)) drawEmitter(ctx, scene, em, t);
}

function drawOverParticles(ctx, scene, t, layer = 'over') {
  for (const em of scene.tl.emitters || []) if (em.layer === layer && t >= em.start && t <= em.cut) drawEmitter(ctx, scene, em, t);
}

function drawSparkleField(ctx, scene, t, o) {
  const { project } = scene;
  const k = Number(project.effects.sparkles) || 0;
  if (k <= 0) return;
  for (let i = 0; i < o.n; i++) {
    const per = 0.6 + hash01(i, o.salt) * 0.9;
    const local = t - o.start + hash01(i, o.salt + 1) * per;
    if (local < 0) continue;
    const cyc = Math.floor(local / per);
    const ph = (local % per) / per;
    const x = o.x + (hash01(i * 13 + cyc, o.salt + 2) - 0.5) * o.w;
    const y = o.y + (hash01(i * 17 + cyc, o.salt + 3) - 0.5) * o.h;
    const tw = Math.sin(ph * Math.PI);
    sparkle(ctx, x, y, o.size * (0.5 + hash01(i, o.salt + 4)) * tw, tw * o.alpha * k, o.color || '#ffffff');
  }
}

function drawSteps(ctx, scene, R, t) {
  const p = R.pres;
  const { L, res, project } = scene;
  for (const st of p.steps || []) {
    if (t < st.start || t > st.end) continue;
    if (st.lines && st.lines.length && project.effects.showLines !== false) drawWinLines(ctx, scene, R, t, st);
    drawWinCells(ctx, scene, R, t, st.cells, st.start, st.end, { stagger: true, step: st, syms: st.cellSyms, mults: st.tumble ? null : R.mult });
    drawWinFxGoal(ctx, scene, R, st, t);
    // A merged win shows its amount under the big symbol once it forms.
    const merged = st.fx && st.fx.style === 'merge';
    const aStart = merged ? st.fx.mergeAt + 0.15 : st.start + 0.15;
    if (st.amount > 0 && t >= aStart) {
      const a = env(t, aStart, st.end, 0.2, 0.4);
      const k = prog(t, aStart, st.end);
      let cx = 0;
      let cy = 0;
      for (const [c, r] of st.cells) {
        const m = L.cellCenter(c, r);
        cx += m.x;
        cy += m.y;
      }
      cx /= st.cells.length;
      cy /= st.cells.length;
      if (st.lines && st.lines.length) {
        cx = L.W / 2;
        cy = L.winCY - L.cellH * 0.15;
      }
      if (merged) {
        const g = mergeTarget(project, L, st);
        cx = g.x;
        cy = g.y + L.cellH * ((Number(winFxConfig(project).bigScale) || 2.2) * 0.5 + 0.25);
      }
      const cur = project.machine.currency || '';
      const txt = `+${cur}${Number(st.amount).toFixed(project.machine.decimals | 0)}`;
      const img = cachedTitle(res, 'float', txt, Math.round(res.titlePx * (st.tumble ? 0.4 : 0.5)), 'gold');
      const s2 = 0.4 + 0.6 * ease.outBack(clamp01((t - aStart) / 0.45));
      drawCentered(ctx, img, cx, cy - k * L.cellH * 0.5, s2, a);
    }
  }
}

// Bursts where tumbling winners explode.
function drawPops(ctx, scene, R, t) {
  if (!R.actors.length) return;
  const { L, res } = scene;
  for (const a of R.actors) {
    if (a.popAt == null) continue;
    const k = (t - a.popAt) / 0.7;
    if (k < 0 || k > 1) continue;
    const m = L.cellCenter(a.c, evalKeys(a.keys, a.popAt));
    const col = lineColor(a.sym + 3);
    drawGlow(ctx, res, col, m.x, m.y, L.cellW * 1.4 * (0.6 + k), (1 - k) * 0.4);
    drawRing(ctx, m.x, m.y, k, L.cellW * 0.8, col, L.cellW * 0.05);
    for (let q = 0; q < 9; q++) {
      const ang = (q / 9) * Math.PI * 2 + hash01(a.id, q) * 0.6;
      const d = L.cellW * (0.2 + 0.7 * ease.outCubic(k)) * (0.7 + 0.5 * hash01(a.id, q + 20));
      sparkle(ctx, m.x + Math.cos(ang) * d, m.y + Math.sin(ang) * d, L.cellW * 0.12 * (1 - k), 1 - k, q % 2 ? '#ffffff' : col);
    }
  }
}

function drawMultPhase(ctx, scene, R, t) {
  const mp = R.pres.mult;
  // Each multiplier lights up a moment before it flies.
  if (!mp || t < mp.start - 0.25 || t > mp.end + 0.3) return;
  const { L, res, project } = scene;
  const target = L.multTarget;
  const a = Math.min(clamp01((t - mp.start) / 0.25), clamp01((mp.end + 0.3 - t) / 0.4));
  let sum = 0;
  for (const it of mp.items) {
    const tt = t - it.t;
    const p0 = L.cellCenter(it.c, it.r);
    if (tt > -0.25 && tt < 0.3) {
      const k = clamp01((tt + 0.25) / 0.55);
      drawGlow(ctx, res, '#ff9a2e', p0.x, p0.y, L.cellW * 2.2, Math.sin(k * Math.PI) * 0.9);
      drawRing(ctx, p0.x, p0.y, k, L.cellW * 0.9, '#ffd25a', L.cellW * 0.05);
    }
    if (tt >= 0 && tt < 0.45) {
      const k = ease.inOut(tt / 0.45);
      const x = p0.x + (target.x - p0.x) * k;
      const y = p0.y + (target.y - p0.y) * k - Math.sin(k * Math.PI) * L.cellH * 0.8;
      drawGlow(ctx, res, '#ffb02e', x, y, L.cellW * 1.2, 0.8);
      const img = cachedTitle(res, 'mult', `x${it.value}`, Math.round(L.cellH * 0.3), 'fire');
      drawCentered(ctx, img, x, y, 1.2 - 0.3 * k);
    }
    if (tt >= 0.45) sum += it.value;
  }
  // Plaque collecting the multipliers, then the multiplied win.
  const applied = t >= mp.applyAt;
  const cur = project.machine.currency || '';
  const dec = project.machine.decimals | 0;
  const pw = L.cellW * 2.6;
  const ph = L.cellH * 0.7;
  ctx.save();
  ctx.globalAlpha = a;
  drawGlow(ctx, res, res.theme.glow, target.x, target.y, pw * 1.4, 0.5);
  roundRect(ctx, target.x - pw / 2, target.y - ph / 2, pw, ph, ph * 0.3);
  ctx.fillStyle = 'rgba(20,6,30,0.85)';
  ctx.fill();
  ctx.lineWidth = Math.max(2, L.cellW * 0.03);
  ctx.strokeStyle = '#ffd25a';
  ctx.stroke();
  ctx.restore();
  const txt = applied ? `${cur}${mp.total.toFixed(dec)}` : sum > 0 ? `${cur}${mp.base.toFixed(dec)} x${sum}` : `${cur}${mp.base.toFixed(dec)}`;
  const img = cachedTitle(res, 'multplaque', txt, Math.round(ph * 0.5), applied ? 'gold' : 'fire');
  const pop = applied ? 1 + 0.25 * Math.pow(1 - clamp01((t - mp.applyAt) / 0.4), 2) : 1;
  drawCentered(ctx, img, target.x, target.y, Math.min(1, (pw * 0.92) / img.width) * pop, a);
  if (applied) drawRing(ctx, target.x, target.y, (t - mp.applyAt) / 0.6, pw, '#ffd25a', L.cellW * 0.06);
}

function wildIndex(scene) {
  if (scene.res.wildIdx === undefined) scene.res.wildIdx = scene.project.symbols.findIndex((x) => x.role === 'wild');
  return scene.res.wildIdx;
}

function drawExpand(ctx, scene, R, t) {
  const ex = R.pres.expand;
  if (!ex || t < ex.start || t >= R.next) return;
  const { L, res, tl } = scene;
  const wi = wildIndex(scene);
  const sp = res.sym[wi];
  if (!sp) return;
  for (const c of ex.reels) {
    const origin = (ex.wilds.find(([cc]) => cc === c) || [c, Math.floor(tl.rows / 2)])[1];
    const beam = env(t, ex.start, ex.end + 0.5, 0.15, 0.5);
    if (beam > 0) {
      const x = L.reelX[c];
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(x, 0, x + L.cellW, 0);
      g.addColorStop(0, 'rgba(255,200,80,0)');
      g.addColorStop(0.5, `rgba(255,220,140,${0.35 * beam})`);
      g.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, L.winTop - L.pad, L.cellW, L.winH + L.pad * 2);
      ctx.lineWidth = L.cellW * 0.04;
      ctx.strokeStyle = `rgba(255,214,90,${beam})`;
      ctx.shadowColor = '#ffb21a';
      ctx.shadowBlur = L.cellW * 0.25;
      roundRect(ctx, x, L.winTop, L.cellW, L.winH, L.cellW * 0.06);
      ctx.stroke();
      ctx.restore();
    }
    for (let r = 0; r < tl.rows; r++) {
      const k = clamp01((t - ex.start - Math.abs(r - origin) * 0.1) / 0.35);
      if (k <= 0) continue;
      const m = L.cellCenter(c, r);
      const s = 0.3 + 0.7 * ease.outBack(k);
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.scale(s, s * m.s);
      ctx.drawImage(sp.sharp, -L.cellW / 2, -L.cellH / 2, L.cellW, L.cellH);
      ctx.restore();
    }
  }
}

// A cell's centre, also one reel off the left edge (where walking wilds go).
function cellAt(L, c, r) {
  if (c >= 0) return L.cellCenter(c, r);
  const m = L.cellCenter(0, r);
  const pitch = L.reelX.length > 1 ? L.reelX[1] - L.reelX[0] : L.cellW;
  return { ...m, x: m.x + c * pitch };
}

// Where a sticky or walking wild is at t: it pops in where it landed, or
// hops in from the reel it walked from (core/timeline.js walkStep); one
// walking off the grid fades as it goes.
function wildPose(L, st, t) {
  const to = cellAt(L, st.c, st.r);
  if (!st.walkIn) return { x: to.x, y: to.y, s: to.s, k: ease.outBack(clamp01((t - st.from) / 0.4)), a: 1 };
  const { u, hop } = walkStep(st, t);
  const from = cellAt(L, st.walkIn[0], st.walkIn[1]);
  return { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u - hop * L.cellH * WALK_HOP, s: to.s, k: 1 + 0.08 * hop, a: st.exit ? 1 - u : 1 };
}

function drawStickies(ctx, scene, t) {
  const { L, res, tl } = scene;
  if (!tl.stickies.length) return;
  const sp = res.sym[wildIndex(scene)];
  if (!sp) return;
  for (const st of tl.stickies) {
    // When the free spins end they fade out over the next spin.
    const out = st.fade ? clamp01(1 - (t - st.to) / 0.3) : t < st.to ? 1 : 0;
    if (t < st.from || out <= 0) continue;
    const m = wildPose(L, st, t);
    const k = m.k;
    ctx.save();
    ctx.globalAlpha = m.a * out;
    drawGlow(ctx, res, '#ffcf45', m.x, m.y, L.cellW * 1.4, 0.35 + 0.1 * Math.sin(t * 4));
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.scale(k, k * m.s);
    ctx.drawImage(sp.sharp, -L.cellW / 2, -L.cellH / 2, L.cellW, L.cellH);
    ctx.restore();
    if (st.value != null && t < (st.valueUntil ?? st.to)) drawValueLabel(ctx, scene, wildIndex(scene), st.value, m.x, m.y, k);
    ctx.save();
    const fw = L.cellW * 0.96;
    const fh = L.cellH * 0.96 * m.s;
    roundRect(ctx, m.x - fw / 2, m.y - fh / 2, fw, fh, L.cellW * 0.12);
    ctx.lineWidth = L.cellW * 0.035;
    ctx.strokeStyle = '#ffd25a';
    ctx.shadowColor = '#ffb21a';
    ctx.shadowBlur = L.cellW * 0.15;
    ctx.stroke();
    ctx.setLineDash([L.cellW * 0.08, L.cellW * 0.08]);
    ctx.lineDashOffset = -t * L.cellW * 0.3;
    ctx.lineWidth = L.cellW * 0.015;
    ctx.strokeStyle = '#fff6d0';
    ctx.stroke();
    ctx.restore();
    const tag = cachedTitle(res, st.walking ? 'walking' : 'sticky', st.walking ? 'WALKING' : 'STICKY', Math.round(L.cellH * 0.12), 'gold');
    drawCentered(ctx, tag, m.x, m.y + fh * 0.42, Math.min(1, (L.cellW * 0.7) / tag.width), st.walkIn ? 1 : clamp01((t - st.from) / 0.3));
    ctx.restore();
  }
}

// Mystery blocks glow, then turn over together to the symbol they hide.
// Their cells are cut out of the reels while they turn (core/timeline.js).
function drawMystery(ctx, scene, R, t) {
  const my = R.pres.mystery;
  if (!my || t < my.start || t > my.end + 0.6) return;
  const { L, res } = scene;
  const from = res.sym[my.from];
  const to = res.sym[my.sym];
  const glow = env(t, my.start, my.flipEnd + 0.3, 0.3, 0.4);
  my.cells.forEach(([c, r], i) => {
    const m = L.cellCenter(c, r);
    drawGlow(ctx, res, '#c48cff', m.x, m.y, L.cellW * 1.9, (0.4 + 0.25 * Math.sin(t * 14 + i)) * glow);
    if (t >= my.flipAt && t < my.flipEnd) {
      const u = (t - my.flipAt) / (my.flipEnd - my.flipAt);
      const sp = u < 0.5 ? from : to;
      const lift = 1 + 0.12 * Math.sin(u * Math.PI);
      if (sp) {
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.scale(Math.max(0.02, Math.abs(Math.cos(u * Math.PI))) * lift, lift * m.s);
        ctx.drawImage(sp.sharp, -L.cellW / 2, -L.cellH / 2, L.cellW, L.cellH);
        ctx.restore();
      }
    }
    if (t >= my.mid && t < my.mid + 0.6) drawRing(ctx, m.x, m.y, (t - my.mid) / 0.6, L.cellW * 0.95, '#e0b3ff', L.cellW * 0.05);
  });
}

// The collector wakes, every cash value flies into it one by one (the
// meter counts each in), and it shows what it took.
function drawCollector(ctx, scene, R, t) {
  const cl = R.pres.collector;
  if (!cl || t < cl.start || t > cl.end + 0.4) return;
  const { L, res, project, tl } = scene;
  const target = L.cellCenter(cl.c, cl.r);
  const a = Math.min(clamp01((t - cl.start) / 0.25), clamp01((cl.end + 0.4 - t) / 0.4));
  const cur = project.machine.currency || '';
  const dec = project.machine.decimals | 0;
  let got = 0;
  let bump = 0;
  for (const it of cl.items) {
    const p0 = L.cellCenter(it.c, it.r);
    if (t >= it.at && t < it.at + 0.5) drawRing(ctx, p0.x, p0.y, (t - it.at) / 0.5, L.cellW * 0.8, res.theme.accent, L.cellW * 0.04);
    if (t >= it.at && t < it.arrive) {
      const k = ease.inOut((t - it.at) / (it.arrive - it.at));
      const x = p0.x + (target.x - p0.x) * k;
      const y = p0.y + (target.y - p0.y) * k - Math.sin(k * Math.PI) * L.cellH * 0.6;
      drawGlow(ctx, res, res.theme.accent, x, y, L.cellW * 1.1, 0.8);
      const img = cachedTitle(res, 'cashfly', formatPrize(it.value, cur, dec), Math.round(L.cellH * 0.24), 'gold');
      drawCentered(ctx, img, x, y, Math.min(1, (L.cellW * 0.9) / img.width) * (1.15 - 0.25 * k));
    }
    if (t >= it.arrive) {
      got += it.value;
      bump = Math.max(bump, 1 - clamp01((t - it.arrive) / 0.25));
    }
  }
  const pulse = 1 + 0.05 * Math.sin((t - cl.start) * 9) + 0.16 * bump;
  drawGlow(ctx, res, res.theme.accent, target.x, target.y, L.cellW * 2.4, (0.55 + 0.25 * bump) * a);
  const sp = res.sym[tl.lay.collectorSym];
  if (sp) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(target.x, target.y);
    ctx.scale(pulse, pulse * target.s);
    ctx.drawImage(sp.sharp, -L.cellW / 2, -L.cellH / 2, L.cellW, L.cellH);
    ctx.restore();
  }
  if (got > 0) {
    const img = cachedTitle(res, 'collected', formatPrize(got, cur, dec), Math.round(L.cellH * 0.3), 'gold');
    const done = clamp01((t - cl.done) / 0.3);
    drawCentered(ctx, img, target.x, target.y + L.cellH * 0.3, Math.min(1.3, (L.cellW * 1.2) / img.width) * (1 + 0.2 * bump + 0.15 * done), a);
  }
}

// ---- pots above the machine (core/pots.js) ----

function potColor(scene, p) {
  return scene.res.potColors[p] || scene.res.theme.accent;
}

// Fit a pot's art in its S x S box, standing on the box's bottom.
function potArtSize(img, S) {
  const k = Math.min(S / img.width, S / img.height);
  return [img.width * k, img.height * k];
}

// The pots stand on the frame's top edge. They are drawn before the
// machine, so the frame hides their lower part. A catch squashes a pot, a
// shot kicks it, and it trembles while it charges.
function drawPots(ctx, scene, t) {
  const { L, res, tl } = scene;
  if (!L.pots || !tl.pots) return;
  for (const pt of L.pots) {
    const img = res.pots[pt.i];
    if (!img) continue;
    const { bump } = potBump(tl.pots.hits, pt.i, t);
    const ch = potCharge(tl.pots.charges, pt.i, t);
    const S = pt.size;
    const [w, h] = potArtSize(img, S);
    ctx.save();
    ctx.translate(pt.x + ch * Math.sin(t * 71 + pt.i * 2) * S * 0.008, pt.bottom);
    ctx.scale(1 + 0.08 * bump + 0.02 * ch, 1 - 0.08 * bump + 0.03 * ch);
    ctx.drawImage(img, -w / 2, (0.5 - POT_BOX.bottom) * S - h, w, h);
    // Charging, the pot lights up from inside.
    if (ch > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = ch * (0.22 + 0.12 * Math.sin(t * 13 + pt.i));
      ctx.drawImage(img, -w / 2, (0.5 - POT_BOX.bottom) * S - h, w, h);
    }
    ctx.restore();
  }
}

// Over the frame: a pot glows while it charges and flashes as it fires or
// catches; its nameplate shows what it caught this round.
function drawPotsOver(ctx, scene, t) {
  const { L, res, tl, project } = scene;
  if (!L.pots || !tl.pots) return;
  const plates = project.pots?.plates !== false;
  for (const pt of L.pots) {
    const col = potColor(scene, pt.i);
    const { bump, flash } = potBump(tl.pots.hits, pt.i, t);
    const ch = potCharge(tl.pots.charges, pt.i, t);
    const g = ch * (0.75 + 0.25 * Math.sin(t * 13 + pt.i)) + flash * 0.8;
    if (g > 0.01) drawGlow(ctx, res, col, pt.mouth.x, pt.mouth.y, pt.size * (1 + 0.35 * ch + 0.35 * flash), Math.min(1, g));
    if (ch > 0.02) {
      // Sparks spiral into the mouth.
      for (let k = 0; k < 9; k++) {
        const ph = (t * 1.7 + k / 9) % 1;
        const ang = k * 2.4 + t * 3;
        const rr = pt.size * (0.62 - 0.5 * ph);
        sparkle(ctx, pt.mouth.x + Math.cos(ang) * rr, pt.mouth.y + Math.sin(ang) * rr * 0.6, pt.size * 0.07 * (1 - ph * 0.5), ch * Math.sin(ph * Math.PI));
      }
    }
    if (!plates) continue;
    let a = 0;
    for (const [from, to, p] of tl.pots.show) if (p === pt.i) a = Math.max(a, Math.min(clamp01((t - from) / 0.2), clamp01((to + 0.3 - t) / 0.3)));
    if (a <= 0) continue;
    const v = evalKeys(tl.pots.valueKeys[pt.i], t);
    if (!(v > 0)) continue;
    const pl = pt.plate;
    const k = 1 + 0.3 * (potBump(tl.pots.hits.filter((h) => !h[2]), pt.i, t).bump);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(pl.x, pl.y);
    ctx.scale(k, k);
    drawGlow(ctx, res, col, 0, 0, pl.w * 1.3, 0.35 + 0.3 * flash);
    roundRect(ctx, -pl.w / 2, -pl.h / 2, pl.w, pl.h, pl.h * 0.45);
    ctx.fillStyle = 'rgba(14,6,28,0.92)';
    ctx.fill();
    ctx.lineWidth = Math.max(2, pl.h * 0.08);
    ctx.strokeStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = pl.h * 0.35;
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = a;
    drawOdometer(ctx, res, v, pl.x, pl.y, Math.round(pl.h * 0.56), { currency: project.machine.currency || '', decimals: project.machine.decimals | 0, rate: evalVelocity(tl.pots.valueKeys[pt.i], t), scale: k });
    ctx.restore();
  }
}

// ---- progressive jackpot boxes (core/jackpots.js) ----

// Every box with its value: running boxes roll their digits; a won box
// pops, glows and a light sweeps across it, then shows what it paid (the
// digits pulse) before it starts again from its seed.
function drawJackpots(ctx, scene, t) {
  const { L, res, tl, project } = scene;
  if (!L.jackpots || !tl.jackpots) return;
  const cfg = jackpotsConfig(project);
  const cur = project.machine.currency || '';
  const dec = project.machine.decimals | 0;
  L.jackpots.forEach((b, i) => {
    const art = res.jackpots[i];
    const tier = cfg.tiers[i];
    if (!art || !tier) return;
    const fx = jackpotFx(tl.jackpots, tier.id, t);
    if (fx.glow > 0.01) drawGlow(ctx, res, art.color, b.x, b.y, b.w * 1.5, Math.min(1, fx.glow));
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(fx.scale, fx.scale);
    const img = art.img;
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    if (fx.glow > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, fx.glow) * 0.35;
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
    }
    ctx.restore();
    if (fx.sweep >= 0) drawShimmer(ctx, res, img, b.x, b.y, fx.scale, fx.sweep * 1.6 - 0.3, 0.9);
    // The value, under the tier's name.
    const v = jackpotValue(cfg, tl.jackpots.hits, tier.id, t);
    const px = Math.round(b.h * JP_TEXT.valuePx);
    const chars = formatPrize(v, cur, dec).length;
    const fit = Math.min(1, (b.w * 0.82) / (chars * px * 0.62));
    const rate = cfg.running && !fx.held ? tier.rate : 0;
    ctx.save();
    ctx.globalAlpha = fx.held ? 0.75 + 0.25 * Math.sin(t * 16) : 1;
    drawOdometer(ctx, res, v, b.x, b.y + b.h * JP_TEXT.valueY * fx.scale, px, { currency: cur, decimals: dec, rate, scale: fx.scale * fit });
    ctx.restore();
  });
  // A ring and sparks burst from a box as it is won.
  for (const h of tl.jackpots.hits) {
    const i = cfg.tiers.findIndex((x) => x.id === h.tier);
    const b = L.jackpots[i];
    const a = t - h.t;
    if (!b || a < 0 || a > 0.9) continue;
    const col = res.jackpots[i]?.color || res.theme.accent;
    drawRing(ctx, b.x, b.y, a / 0.6, b.w * 0.95, col, b.h * 0.06);
    for (let k = 0; k < 14; k++) {
      const ang = (k / 14) * Math.PI * 2 + i;
      const rr = b.w * (0.35 + 0.75 * ease.outCubic(Math.min(1, a / 0.9)));
      sparkle(ctx, b.x + Math.cos(ang) * rr, b.y + Math.sin(ang) * rr * 0.55, b.h * 0.12 * (1 - a / 0.9), 1 - a / 0.9);
    }
  }
}

// A round awards a jackpot: its amount flies from the box down into the
// win meter, which counts it in.
function drawJackpotFly(ctx, scene, R, t) {
  const j = R.pres.jackpot;
  const { L, res, project } = scene;
  if (!j || !j.fly || !L.jackpots || t < j.fly[0] || t > j.fly[1] + 0.25) return;
  const i = jackpotsConfig(project).tiers.findIndex((x) => x.id === j.tier);
  const b = L.jackpots[i];
  if (!b) return;
  const to = L.hud ? { x: L.hud.x + L.hud.w / 2, y: L.hud.y + L.hud.h / 2 } : { x: L.W / 2, y: L.frame.y + L.frame.h };
  const k = ease.inOut(clamp01((t - j.fly[0]) / (j.fly[1] - j.fly[0])));
  const x = b.x + (to.x - b.x) * k;
  const y = b.y + (to.y - b.y) * k - Math.sin(k * Math.PI) * L.cellH * 0.5;
  const a = 1 - clamp01((t - j.fly[1]) / 0.25);
  const col = res.jackpots[i]?.color || res.theme.accent;
  drawGlow(ctx, res, col, x, y, L.cellW * 1.4, 0.8 * a);
  const img = cachedTitle(res, 'jpfly', formatPrize(j.amount, project.machine.currency || '', project.machine.decimals | 0), Math.round(L.cellH * 0.26), 'gold');
  drawCentered(ctx, img, x, y, Math.min(1, (L.cellW * 1.6) / img.width) * (1.1 - 0.2 * k), a);
}

// Each beam's path for the current layout (pots and cells don't move).
const beamCache = new WeakMap();
function beamPath(scene, bm) {
  const { L } = scene;
  let m = beamCache.get(L);
  if (!m) beamCache.set(L, (m = new WeakMap()));
  let pts = m.get(bm);
  if (!pts) {
    const pot = L.pots[bm.pot] || L.pots[0];
    const cell = L.cellCenter(bm.c, bm.r);
    const out = beamSide(cell.x, pot.x, bm.c, L.cellW);
    const cfg = potsConfig(scene.project).beam;
    pts = beamPoints(bm.up ? beamCurve(cell, pot.mouth, cfg, out) : beamCurve(pot.mouth, cell, cfg, out));
    m.set(bm, pts);
  }
  return pts;
}

// A saber beam: wide soft passes in the pot's colour and a white core
// (core/pots.js BEAM_PASSES), drawn from the tail to the head with a glow
// on the head.
function drawBeams(ctx, scene, R, t) {
  const beams = R.pres.beams;
  const { L, res } = scene;
  if (!beams || !L.pots) return;
  const width = potsConfig(scene.project).beam.width * L.cellW;
  const flick = beamFlicker(t);
  for (const bm of beams) {
    const st = beamState(bm, t);
    if (!st || st.head - st.tail < 1e-3) continue;
    const pts = beamPath(scene, bm);
    const n = pts.length - 1;
    const seg = [pointAlong(pts, st.tail)];
    for (let i = Math.ceil(st.tail * n); i < st.head * n; i++) seg.push(pts[i]);
    seg.push(pointAlong(pts, st.head));
    const col = potColor(scene, bm.pot);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [w, a, core] of BEAM_PASSES) {
      ctx.globalAlpha = a * st.alpha * (core ? 1 : flick);
      ctx.strokeStyle = core ? '#ffffff' : col;
      ctx.lineWidth = w * width * (core ? 1 : flick);
      ctx.beginPath();
      seg.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    ctx.restore();
    const [hx, hy] = seg[seg.length - 1];
    drawGlow(ctx, res, col, hx, hy, width * 0.75, 0.9 * st.alpha);
  }
}

// A boosted cell: marked while the pots charge; the old symbol trembles as
// the beam comes, then bursts into the new one. Its reel is cut out from
// just before the hit until the new symbol has popped (core/timeline.js).
function drawBoost(ctx, scene, R, t) {
  const bo = R.pres.boost;
  if (!bo || t < bo.start || t > bo.end + 0.6) return;
  const { L, res } = scene;
  for (const it of bo.items) {
    const m = L.cellCenter(it.c, it.r);
    const col = potColor(scene, it.pot);
    // Marked: a pulsing frame in the colour of the pot that will fire.
    const pre = env(t, bo.start, it.hit + 0.05, 0.3, 0.05);
    if (pre > 0) {
      const pulse = 0.65 + 0.35 * Math.sin(t * 10 + it.c);
      drawGlow(ctx, res, col, m.x, m.y, L.cellW * 1.6, 0.35 * pulse * pre);
      ctx.save();
      ctx.globalAlpha = pre * pulse;
      const fw = L.cellW * 0.94;
      const fh = L.cellH * 0.94 * m.s;
      roundRect(ctx, m.x - fw / 2, m.y - fh / 2, fw, fh, L.cellW * 0.12);
      ctx.lineWidth = L.cellW * 0.035;
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = L.cellW * 0.2;
      ctx.stroke();
      ctx.restore();
    }
    const cover = it.hit - BOOST.lead;
    const until = it.hit + BOOST.pop;
    if (t >= cover && t < until) {
      const before = t < it.hit;
      const sym = before ? it.from : it.to;
      const sp = res.sym[sym];
      const k = before ? 1 : 0.55 + 0.45 * ease.outBack(clamp01((t - it.hit) / BOOST.pop));
      const jx = before ? Math.sin(t * 90) * L.cellW * 0.02 : 0;
      if (sp) {
        ctx.save();
        ctx.translate(m.x + jx, m.y);
        ctx.scale(k, k * m.s);
        ctx.drawImage(sp.sharp, -L.cellW / 2, -L.cellH / 2, L.cellW, L.cellH);
        ctx.restore();
      }
      if (!before && it.value != null) drawValueLabel(ctx, scene, sym, it.value, m.x, m.y, k);
    }
    if (t >= it.hit && t < it.hit + 0.6) {
      const f = (t - it.hit) / 0.6;
      drawGlow(ctx, res, '#ffffff', m.x, m.y, L.cellW * (1.2 + f), 0.8 * (1 - f));
      drawGlow(ctx, res, col, m.x, m.y, L.cellW * 2, 0.7 * (1 - f));
      drawRing(ctx, m.x, m.y, f, L.cellW * 0.95, col, L.cellW * 0.05);
    }
  }
}

function drawScatterFx(ctx, scene, R, t) {
  const { L, res, project } = scene;
  const p = R.pres;
  // Scatters (and trigger coins) pop lit as they land, over the dim of a
  // tease (core/tease.js); kept lit, they glow on until the tease ends.
  const coins = R.win.coins || [];
  const W = teaseWindows(R);
  const keep = !!project.spin?.scatterLit;
  let tease = 0;
  if (keep) for (const w of W) tease = Math.max(tease, teaseEnv(w, t));
  landings(R, scene.tl.rows).forEach(({ c, r, t: landT }, i) => {
    const a = t - landT;
    const lit = landLit(W, landT, t, keep);
    if (a < 0 || lit <= 0) return;
    const m = L.cellCenter(c, r);
    if (a < LAND_POP) drawRing(ctx, m.x, m.y, a / LAND_POP, L.cellW * 0.95, res.theme.accent, L.cellW * 0.05);
    const s = landScale(landT, t);
    const pop = a < LAND_POP ? 0.6 * (1 - a / LAND_POP) : 0;
    drawGlow(ctx, res, res.theme.accent, m.x, m.y, L.cellW * 1.8, Math.max(pop, (0.3 + 0.12 * Math.sin(t * 6 + i)) * tease));
    ctx.save();
    ctx.globalAlpha *= lit;
    ctx.translate(m.x, m.y);
    ctx.scale(s, s * m.s);
    const sp = res.sym[R.grid[c][r]];
    if (sp) ctx.drawImage(sp.sharp, -L.cellW / 2, -L.cellH / 2, L.cellW, L.cellH);
    ctx.restore();
    if (R.mult[c][r] != null) drawValueLabel(ctx, scene, R.grid[c][r], R.mult[c][r], m.x, m.y, s, lit);
  });
  if (p.celebrate && t >= p.celebrate.start && t <= p.celebrate.end + 0.4) {
    if (coins.length) drawWinCells(ctx, scene, R, t, coins.map((cn) => [cn.c, cn.r]), p.celebrate.start, p.celebrate.end + 0.4, { rays: true, popMul: 1.2, color: res.theme.accent, values: coins.map((cn) => cn.value) });
    else drawWinCells(ctx, scene, R, t, R.win.scatters, p.celebrate.start, p.celebrate.end + 0.4, { rays: true, popMul: 1.4, color: res.theme.accent });
  }
  if (p.nearmiss && t >= p.nearmiss.start && t <= p.nearmiss.end) {
    drawWinCells(ctx, scene, R, t, R.win.scatters, p.nearmiss.start, p.nearmiss.end, { popMul: 0.6, color: '#9fb4ff' });
    const a = env(t, p.nearmiss.start, p.nearmiss.end, 0.2, 0.35);
    const nm = R.win.nearMiss;
    if (nm) {
      const x = L.reelX[nm.reel];
      ctx.save();
      ctx.globalAlpha = a * (0.6 + 0.4 * Math.sin(t * 16));
      ctx.strokeStyle = '#ff4f6d';
      ctx.lineWidth = L.cellW * 0.035;
      ctx.shadowColor = '#ff4f6d';
      ctx.shadowBlur = L.cellW * 0.2;
      roundRect(ctx, x, L.winTop, L.cellW, L.winH, L.cellW * 0.06);
      ctx.stroke();
      ctx.restore();
    }
    const s = 0.6 + 0.4 * ease.outBack(clamp01((t - p.nearmiss.start) / 0.4));
    drawCentered(ctx, res.titles.nearmiss, L.W / 2, L.winCY, s, a);
  }
  void project;
}

function darken(ctx, L, a) {
  if (a <= 0) return;
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.fillRect(-L.W * 0.1, -L.H * 0.1, L.W * 1.2, L.H * 1.2);
}

const TIER_COLORS = { gold: '#ffb21a', fire: '#ff5a1f', violet: '#b44cff', aqua: '#2fc8ff', rose: '#ff4fa8', silver: '#c8d4ff' };

function drawBigWin(ctx, scene, R, t) {
  const ov = R.pres.overlay;
  if (!ov || t < ov.start || t > ov.end) return;
  const { L, res, project, tl } = scene;
  const fin = clamp01((t - ov.start) / 0.45);
  const fout = clamp01((ov.end - t) / 0.6);
  const a = Math.min(fin, fout);
  darken(ctx, L, 0.72 * a);
  let tier = 0;
  ov.tierTimes.forEach((tt, k) => {
    if (t >= tt) tier = k;
  });
  const name = ov.tiers[tier];
  const tStart = ov.tierTimes[tier];
  const col = TIER_COLORS[res.tierPalette[name]] || '#ffb21a';
  const cx = L.W / 2;
  const cy = L.H * (L.portrait ? 0.4 : 0.42);
  const rays = Number(project.effects.rays) || 0;
  drawGlow(ctx, res, col, cx, cy, L.H * (1.3 + tier * 0.2), 0.55 * a);
  if (rays > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const rs = ((L.H * 1.7 * (1 + tier * 0.12)) / res.rays.width) * ease.outBack(fin);
    drawCentered(ctx, res.rays, cx, cy, rs, 0.6 * a * rays, t * 0.22);
    drawCentered(ctx, res.rays, cx, cy, rs * 0.7, 0.35 * a * rays, -t * 0.35);
    ctx.restore();
  }
  // Particles: each tier's template, stacking as the count climbs.
  drawRoundParticles(ctx, scene, R, t, ['tier', 'total']);
  ov.tierTimes.slice(1).forEach((tt) => drawRing(ctx, cx, cy, (t - tt) / 0.7, L.H * 0.75, col, L.H * 0.02));
  const title = res.titles[name];
  const at = t - tStart;
  const s = (0.15 + 0.85 * ease.outElastic(clamp01(at / 0.8))) * (1 + 0.025 * Math.sin(t * 5));
  const titleY = cy - L.H * 0.08;
  const maxW = L.W * 0.92;
  const fitS = title ? Math.min(1, maxW / title.width) : 1;
  drawCentered(ctx, title, cx, titleY, s * fitS, a);
  drawShimmer(ctx, res, title, cx, titleY, s * fitS, ((t - tStart) % 1.7) / 1.7 * 1.6 - 0.3, a);
  drawSparkleField(ctx, scene, t, { n: 26, start: ov.start, x: cx, y: titleY, w: title ? title.width * fitS : L.W * 0.5, h: res.titlePx * 1.4, size: L.cellW * 0.16, alpha: a, salt: 300 });
  // Counter.
  void tl;
  const v = evalKeys(ov.keys, t);
  const rate = evalVelocity(ov.keys, t);
  const slam = t > ov.countEnd ? 1 + 0.2 * Math.pow(1 - clamp01((t - ov.countEnd) / 0.35), 2) : 1;
  const cIn = ease.outBack(clamp01((t - ov.start - 0.2) / 0.5));
  const px = Math.round(res.titlePx * 0.72);
  ctx.save();
  ctx.globalAlpha = a;
  drawOdometer(ctx, res, v, cx, cy + L.H * 0.13, px, { currency: project.machine.currency || '', decimals: project.machine.decimals | 0, rate, scale: cIn * slam });
  ctx.restore();
}

function drawBanner(ctx, scene, R, t) {
  const b = R.pres.banner;
  if (!b || t < b.start || t > b.end) return;
  const { L, res, project, tl } = scene;
  const fin = clamp01((t - b.start) / 0.4);
  const fout = clamp01((b.end - t) / 0.5);
  const a = Math.min(fin, fout);
  darken(ctx, L, 0.6 * a);
  const cx = L.W / 2;
  const cy = L.H * 0.44;
  drawGlow(ctx, res, res.theme.glow, cx, cy, L.H * 1.3, 0.5 * a);
  if (Number(project.effects.rays) > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawCentered(ctx, res.rays, cx, cy, ((L.H * 1.6) / res.rays.width) * ease.outBack(fin), 0.55 * a, t * 0.25);
    ctx.restore();
  }
  drawRing(ctx, cx, cy, (t - b.start) / 0.8, L.H * 0.7, res.theme.accent, L.H * 0.02);
  const title = res.titles[b.kind] || res.titles.bonus;
  const s = 0.2 + 0.8 * ease.outElastic(clamp01((t - b.start) / 0.8));
  const ty = b.kind === 'freespins' || b.kind === 'retrigger' || b.kind === 'holdspin' ? cy - L.H * 0.13 : cy;
  drawCentered(ctx, title, cx, ty, s * Math.min(1, (L.W * 0.9) / title.width), a);
  drawShimmer(ctx, res, title, cx, ty, s * Math.min(1, (L.W * 0.9) / title.width), ((t - b.start) % 1.6) / 1.6 * 1.6 - 0.3, a);
  if (b.kind === 'freespins' || b.kind === 'retrigger') {
    const num = cachedTitle(res, 'fs', b.kind === 'retrigger' ? `+${b.freeSpins}` : String(b.freeSpins), Math.round(res.titlePx * 1.5), 'fire');
    const s2 = 0.1 + 0.9 * ease.outElastic(clamp01((t - b.start - 0.35) / 0.8));
    drawCentered(ctx, num, cx, cy + L.H * 0.12, s2, a);
  } else if (b.kind === 'holdspin') {
    const sub = cachedTitle(res, 'hsrespins', `${b.freeSpins} RESPINS`, Math.round(res.titlePx * 0.62), 'fire');
    const s2 = 0.1 + 0.9 * ease.outElastic(clamp01((t - b.start - 0.35) / 0.8));
    drawCentered(ctx, sub, cx, cy + L.H * 0.1, s2 * Math.min(1, (L.W * 0.8) / sub.width), a);
  } else if (b.amount > 0) {
    const v = evalKeys(tl.meterKeys, t);
    ctx.save();
    ctx.globalAlpha = a;
    drawOdometer(ctx, res, v, cx, cy + L.H * 0.16, Math.round(res.titlePx * 0.6), { currency: project.machine.currency || '', decimals: project.machine.decimals | 0, rate: evalVelocity(tl.meterKeys, t) });
    ctx.restore();
  }
  drawSparkleField(ctx, scene, t, { n: 22, start: b.start, x: cx, y: cy, w: L.W * 0.6, h: L.H * 0.4, size: L.cellW * 0.15, alpha: a, salt: 400 });
}

function drawWheel(ctx, scene, R, t) {
  const w = R.pres.wheel;
  if (!w || t < w.inStart || t > w.outEnd) return;
  const { L, res, project, tl } = scene;
  const wh = res.wheel;
  const G = L.wheel;
  const tIn = clamp01((t - w.inStart) / (w.inEnd - w.inStart));
  const tOut = clamp01((t - w.outStart) / (w.outEnd - w.outStart));
  const a = ease.outCubic(tIn) * (1 - ease.inCubic(tOut));
  const wheelGame = tl.game === 'wheel';
  darken(ctx, L, (wheelGame ? 0.3 : 0.86) * a);
  const { cx, cy } = G;
  const sc = (0.3 + 0.7 * ease.outBack(tIn)) * (1 - 0.35 * ease.inCubic(tOut));
  if (Number(project.effects.rays) > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawCentered(ctx, res.rays, cx, cy, ((wh.R * 3.4) / res.rays.width) * sc, 0.45 * a, t * 0.15);
    ctx.restore();
  }
  drawGlow(ctx, res, res.theme.glow, cx, cy, wh.R * 3.2 * sc, 0.5 * a);
  const theta = evalKeys(tl.wheelKeys, t);
  const omega = evalVelocity(tl.wheelKeys, t);
  const N = project.wheel.segments.length;
  const segDeg = 360 / Math.max(2, N);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(cx, cy);
  ctx.scale(sc, sc);
  // Rotational motion blur: averaged ghost copies when spinning fast.
  const shutter = (Math.abs(omega) / 30) * 0.5;
  const ghosts = shutter > 1.5 ? Math.min(16, Math.ceil(shutter / 1.1)) : 0;
  const draw = (deg, alpha) => {
    ctx.save();
    ctx.globalAlpha = a * alpha;
    ctx.rotate((deg * Math.PI) / 180);
    ctx.drawImage(wh.disc, -wh.discSize / 2, -wh.discSize / 2);
    ctx.restore();
  };
  draw(theta, 1);
  for (let i = 1; i <= ghosts; i++) draw(theta - (Math.sign(omega) * shutter * i) / ghosts, 1 / (i + 1));
  // Segment glow once the wheel has landed: the winner, or a spin again
  // while it says so.
  const again = (w.agains || []).find((g) => t > g.at - 0.2 && t < g.until);
  // The wheel game keeps the wheel: the last prize fades before it spins on.
  const prev = w.cont ? tl.rounds[R.index - 1]?.pres.wheel : null;
  const fadePrev = prev && t < R.t0 + 0.4 ? 1 - clamp01((t - R.t0) / 0.4) : 0;
  if (t > w.spinEnd || again || fadePrev > 0) {
    const k = again ? clamp01((t - again.at + 0.2) / 0.3) : t > w.spinEnd ? clamp01((t - w.spinEnd) / 0.3) : fadePrev;
    const seg = (Math.PI * 2) / N;
    ctx.save();
    ctx.rotate((theta * Math.PI) / 180);
    const a0 = -Math.PI / 2 + (again ? again.segment : t > w.spinEnd ? w.segment : prev.segment) * seg;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * k * (0.3 + 0.25 * Math.sin(t * 10));
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, wh.R, a0, a0 + seg);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // A hub that stays still sits over the turning disc.
  if (!wh.hubSpins) {
    if (wh.hub) ctx.drawImage(wh.hub, -wh.hub.width / 2, -wh.hub.height / 2);
    if (wh.center) ctx.drawImage(wh.center, -wh.center.width / 2, -wh.center.height / 2);
  }
  if (wh.ring) ctx.drawImage(wh.ring, -wh.ringSize / 2, -wh.ringSize / 2);
  // Ring bulbs: chase while spinning, blink when landed.
  const landed = t > w.spinEnd;
  wh.bulbs.forEach((p, i) => {
    const b = landed ? (i % 2 === Math.floor(t * 8) % 2 ? 1 : 0.2) : 0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.cos(Math.PI * 2 * (i / 5 - t * (t > w.spinStart ? 2.5 : 0.8))), 6);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, wh.R * 0.03);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, b > 0.5 ? '#fff3c4' : '#c9a050');
    g.addColorStop(1, b > 0.5 ? res.theme.accent : '#4a3008');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, wh.R * 0.03, 0, Math.PI * 2);
    ctx.fill();
    drawGlow(ctx, res, res.theme.accent, p.x, p.y, wh.R * 0.22, b * 0.55 * a);
  });
  // The pointer, at the top or turned over at the bottom; pegs bend it and
  // it springs back past straight when one lets go.
  const def = pointerAt(theta, segDeg, G.pointerAngle, t, w.kick);
  ctx.save();
  ctx.translate(G.pivot.x - cx, G.pivot.y - cy);
  ctx.rotate(((G.pointerAngle + def) * Math.PI) / 180);
  ctx.drawImage(wh.pointer, -wh.pivotX, -wh.pivotY);
  ctx.restore();
  ctx.restore();

  // Title before the spin; prize plaque after landing.
  const titleIn = w.cont ? clamp01((t - w.titleIn) / 0.3) : 1;
  const titleA = a * titleIn * (1 - clamp01((t - w.spinStart - 0.6) / 0.5));
  drawCentered(ctx, res.titles.wheel, G.title.x, cy + (G.title.y - cy) * sc, 0.5 + 0.5 * ease.outBack(tIn), titleA);
  const pl = G.plaque;
  // Spin again: the plaque says so, then the wheel turns once more.
  if (again) {
    const k = ease.outBack(clamp01((t - again.at) / 0.4)) * clamp01((again.until - t) / 0.3);
    drawRing(ctx, pl.x, pl.y, (t - again.at) / 0.7, pl.R * 1.3, res.theme.accent, pl.R * 0.04);
    const seg = project.wheel.segments[again.segment] || {};
    drawWheelPlaque(ctx, scene, pl, k * sc, a, String(seg.label || 'SPIN AGAIN'), null);
  }
  if (t > w.prizeStart) {
    if (!w.noWin) {
      drawRoundParticles(ctx, scene, R, t, ['wheel']);
      drawRing(ctx, pl.x, pl.y, (t - w.prizeStart) / 0.8, pl.R * 1.6, res.theme.accent, pl.R * 0.05);
    }
    const k = ease.outBack(clamp01((t - w.prizeStart) / 0.5)) * clamp01((w.plaqueEnd - t) / 0.35);
    const seg = project.wheel.segments[w.segment] || { label: '' };
    drawWheelPlaque(ctx, scene, pl, k * sc, a, String(seg.label), w.noWin ? null : evalKeys(tl.meterKeys, t), evalVelocity(tl.meterKeys, t));
  }
}

// The wheel's prize plaque: a label, and the counting amount (none for a
// spin again or no win, where the label sits in the middle).
function drawWheelPlaque(ctx, scene, pl, k, a, label, value, rate = 0) {
  const { res, project } = scene;
  const pw = pl.R * 1.5;
  const ph = pl.R * 0.62;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(pl.x, pl.y);
  ctx.scale(k, k);
  drawGlow(ctx, res, res.theme.accent, 0, 0, pw * 1.8, value == null ? 0.4 : 0.6);
  roundRect(ctx, -pw / 2, -ph / 2, pw, ph, ph * 0.25);
  const g = ctx.createLinearGradient(0, -ph / 2, 0, ph / 2);
  g.addColorStop(0, 'rgba(46,20,70,0.96)');
  g.addColorStop(1, 'rgba(8,2,16,0.97)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = ph * 0.05;
  ctx.strokeStyle = '#e9b949';
  ctx.stroke();
  ctx.restore();
  const lbl = cachedTitle(res, 'prize', label, Math.round(pl.R * 0.2), 'gold');
  drawCentered(ctx, lbl, pl.x, pl.y - (value == null ? 0 : ph * 0.16 * k), k * Math.min(1, (pw * 0.92) / lbl.width), a);
  if (value == null) return;
  ctx.save();
  ctx.globalAlpha = a;
  drawOdometer(ctx, res, value, pl.x, pl.y + ph * 0.2 * k, Math.round(pl.R * 0.14), { currency: project.machine.currency || '', decimals: project.machine.decimals | 0, rate, scale: k });
  ctx.restore();
}

// ---- Hold & Spin effects ----

function coinColor(scene, sym) {
  const pal = scene.res.coinPalettes?.[sym - scene.tl.lay.coinBase] || 'gold';
  return COIN_GLOW[pal] || COIN_GLOW.gold;
}

// The counter and the collect plaque sit on the frame's top edge.
function holdBarY(L) {
  return L.frame.y + L.pad * 0.25;
}

function plaque(ctx, res, w, h, glowA) {
  drawGlow(ctx, res, res.theme.accent, 0, 0, w * 1.4, glowA);
  roundRect(ctx, -w / 2, -h / 2, w, h, h * 0.32);
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, 'rgba(46,20,70,0.97)');
  g.addColorStop(1, 'rgba(8,2,16,0.98)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = h * 0.07;
  ctx.strokeStyle = '#e9b949';
  ctx.stroke();
}

function drawCellSprite(ctx, scene, sym, value, c, r, s, alpha) {
  const { L, res } = scene;
  const m = L.cellCenter(c, r);
  const sp = res.sym[sym];
  if (!sp) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(m.x, m.y);
  ctx.scale(s, s * m.s);
  ctx.drawImage(sp.sharp, -L.cellW / 2, -L.cellH / 2, L.cellW, L.cellH);
  ctx.restore();
  if (value != null) drawValueLabel(ctx, scene, sym, value, m.x, m.y, s, alpha);
}

// Lock frames, landing pops, teasing cells and the collect sequence.
function drawHoldFx(ctx, scene, R, t) {
  const { tl, L, res } = scene;
  const hA = holdAlpha(tl, t);
  if (hA <= 0.001) return;
  const col = R && R.pres.collect;
  // Teasing cells: the last empty cells crawl with an orange glow.
  for (const ci of (R && R.pres.holdspin && R.pres.holdspin.cells) || []) {
    if (!ci.antic) continue;
    const a = env(t, ci.antic.start - 0.05, ci.antic.end + 0.25, 0.2, 0.25) * hA;
    if (a <= 0) continue;
    const x = L.reelX[ci.c];
    const y = L.rowsTop + ci.r * L.cellH;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = L.cellW * 0.05;
    ctx.strokeStyle = `rgba(255,170,40,${0.95 * a})`;
    ctx.shadowColor = 'rgba(255,120,0,1)';
    ctx.shadowBlur = L.cellW * 0.35 * (0.6 + 0.4 * Math.sin(t * 18));
    roundRect(ctx, x + 2, y + 2, L.cellW - 4, L.cellH - 4, L.cellW * 0.1);
    ctx.stroke();
    ctx.restore();
    drawGlow(ctx, res, '#ff9a1a', x + L.cellW / 2, y + L.cellH / 2, L.cellW * 1.6, 0.4 * a);
  }
  for (const lk of tl.hold.locks) {
    if (t < lk.from || t >= lk.to) continue;
    const m = L.cellCenter(lk.c, lk.r);
    const color = lk.special ? coinColor(scene, lk.sym) : res.theme.accent;
    const age = t - lk.from;
    const item = col && col.items.find((it) => it.c === lk.c && it.r === lk.r);
    const done = item && t > item.arrive;
    // Landing: shockwave, flash and a bounce of the coin.
    if (age < 0.6) {
      drawRing(ctx, m.x, m.y, age / 0.6, L.cellW * (lk.special ? 1.3 : 0.95), color, L.cellW * 0.05);
      drawGlow(ctx, res, color, m.x, m.y, L.cellW * 2, 0.7 * (1 - age / 0.6) * hA);
      const s = 1 + 0.28 * Math.sin(clamp01(age / 0.35) * Math.PI);
      if (age < 0.35) drawCellSprite(ctx, scene, lk.sym, lk.value, lk.c, lk.r, s, hA);
    }
    // Held: a glowing frame; specials pulse.
    const fa = clamp01(age / 0.15) * hA * (done ? 0.35 : 1);
    ctx.save();
    ctx.globalAlpha = fa;
    const fw = L.cellW * 0.96;
    const fh = L.cellH * 0.96 * m.s;
    roundRect(ctx, m.x - fw / 2, m.y - fh / 2, fw, fh, L.cellW * 0.12);
    ctx.lineWidth = L.cellW * (lk.special ? 0.04 : 0.028);
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = L.cellW * (lk.special ? 0.25 + 0.1 * Math.sin(t * 6) : 0.14);
    ctx.stroke();
    ctx.restore();
    if (lk.special) drawGlow(ctx, res, color, m.x, m.y, L.cellW * 1.5, (0.18 + 0.1 * Math.sin(t * 5 + lk.c)) * fa);
    // Collect: the coin flashes and its value flies to the plaque.
    if (item && t >= item.at - 0.05) {
      const k = clamp01((t - item.at) / 0.25);
      if (t < item.arrive + 0.1) {
        drawGlow(ctx, res, color, m.x, m.y, L.cellW * 2.2, 0.8 * (1 - k * 0.6) * hA);
        drawCellSprite(ctx, scene, lk.sym, null, lk.c, lk.r, 1 + 0.22 * Math.sin(k * Math.PI), hA);
      }
      if (done) {
        ctx.save();
        ctx.globalAlpha = 0.45 * hA;
        ctx.fillStyle = '#000';
        roundRect(ctx, m.x - fw / 2, m.y - fh / 2, fw, fh, L.cellW * 0.12);
        ctx.fill();
        ctx.restore();
      }
    }
  }
  // Values in flight, drawn last so they pass over everything.
  if (col) {
    const ty = holdBarY(L);
    for (const it of col.items) {
      if (t < it.at || t > it.arrive) continue;
      const m = L.cellCenter(it.c, it.r);
      const u = ease.inOut(clamp01((t - it.at) / (it.arrive - it.at)));
      const x = m.x + (L.W / 2 - m.x) * u;
      const y = m.y + (ty - m.y) * u - Math.sin(u * Math.PI) * L.cellH * 0.6;
      const text = formatPrize(it.value, scene.project.machine.currency || '', scene.project.machine.decimals | 0);
      const img = cachedTitle(res, 'coinval', text, Math.round(L.cellH * 0.2), 'silver');
      drawGlow(ctx, res, res.theme.accent, x, y, L.cellW * 0.9, 0.6 * hA);
      drawCentered(ctx, img, x, y, (1.1 - 0.35 * u) * Math.min(1, (L.cellW * 0.8) / img.width), hA);
    }
  }
}

// Above the reels: the respins counter, then the collect plaque.
function drawHoldBar(ctx, scene, R, t) {
  const { tl, L, res, project } = scene;
  const hA = holdAlpha(tl, t);
  if (hA <= 0.001) return;
  const y = holdBarY(L);
  const col = R && R.pres.collect;
  if (col && t >= col.start) {
    const a = hA * clamp01((t - col.start) / 0.3) * clamp01((col.end + 0.6 - t) / 0.4);
    if (a <= 0) return;
    const pw = L.frame.w * 0.36;
    const ph = L.H * 0.075;
    const pulse = col.items.reduce((p, it) => Math.max(p, 1 - clamp01((t - it.arrive) / 0.25)), 0) * (t > col.items[0].arrive ? 1 : 0);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(L.W / 2, y);
    ctx.scale(1 + 0.06 * pulse, 1 + 0.06 * pulse);
    plaque(ctx, res, pw, ph, 0.3 + 0.4 * pulse);
    ctx.restore();
    const v = evalKeys(tl.hold.collectKeys, t);
    ctx.save();
    ctx.globalAlpha = a;
    drawOdometer(ctx, res, v, L.W / 2, y + ph * 0.04, Math.round(ph * 0.52), { currency: project.machine.currency || '', decimals: project.machine.decimals | 0, rate: evalVelocity(tl.hold.collectKeys, t) });
    ctx.restore();
    return;
  }
  // The respins counter: a label and one pip per respin, lit while left.
  const n = Math.round(evalKeys(tl.hold.counterKeys, t));
  const label = cachedTitle(res, 'hsbar', n === 1 ? 'LAST RESPIN' : 'RESPINS LEFT', Math.round(L.H * 0.028), n === 1 ? 'fire' : 'aqua');
  let pop = 0;
  const ks = tl.hold.counterKeys;
  for (let i = 1; i < ks.length; i++) if (ks[i].v > ks[i - 1].v && t >= ks[i].t && t - ks[i].t < 0.45) pop = 1 - (t - ks[i].t) / 0.45;
  const R0 = tl.hold.respins;
  const pr = L.H * 0.012;
  const gap = pr * 3;
  const ph = L.H * 0.06;
  const lw = label.width * 0.9;
  const pw = lw + R0 * gap + ph * 0.6;
  ctx.save();
  ctx.globalAlpha = hA;
  ctx.translate(L.W / 2, y);
  const sc = 1 + 0.14 * Math.sin(pop * Math.PI);
  ctx.scale(sc, sc);
  plaque(ctx, res, pw, ph, 0.25 + 0.5 * pop);
  ctx.drawImage(label, -pw / 2 + ph * 0.25, -label.height / 2, label.width * 0.9, label.height);
  for (let i = 0; i < R0; i++) {
    const px = -pw / 2 + ph * 0.25 + lw + gap * (i + 0.5);
    ctx.beginPath();
    ctx.arc(px, 0, pr, 0, Math.PI * 2);
    ctx.fillStyle = i < n ? (n === 1 ? '#ffb23a' : '#7ff6ff') : 'rgba(255,255,255,0.16)';
    ctx.fill();
    if (i < n) drawGlow(ctx, res, n === 1 ? '#ff7a1a' : '#2fc8ff', px, 0, pr * 6, 0.55);
  }
  ctx.restore();
  void project;
}

function drawGrand(ctx, scene, R, t) {
  const g = R.pres.grand;
  if (!g || t < g.start || t > g.end) return;
  const { L, res, project } = scene;
  const a = Math.min(clamp01((t - g.start) / 0.4), clamp01((g.end - t) / 0.5));
  darken(ctx, L, 0.7 * a);
  const cx = L.W / 2;
  const cy = L.H * 0.44;
  drawGlow(ctx, res, '#ff5a1f', cx, cy, L.H * 1.5, 0.6 * a);
  if (Number(project.effects.rays) > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawCentered(ctx, res.rays, cx, cy, ((L.H * 1.8) / res.rays.width) * ease.outBack(clamp01((t - g.start) / 0.45)), 0.6 * a, t * 0.3);
    ctx.restore();
  }
  drawRing(ctx, cx, cy, (t - g.start) / 0.8, L.H * 0.8, '#ffb21a', L.H * 0.022);
  drawRoundParticles(ctx, scene, R, t, ['grand']);
  const title = res.titles.grand;
  const s = (0.15 + 0.85 * ease.outElastic(clamp01((t - g.start) / 0.8))) * (1 + 0.03 * Math.sin(t * 5));
  const fit = title ? Math.min(1, (L.W * 0.9) / title.width) : 1;
  drawCentered(ctx, title, cx, cy - L.H * 0.06, s * fit, a);
  drawShimmer(ctx, res, title, cx, cy - L.H * 0.06, s * fit, ((t - g.start) % 1.5) / 1.5 * 1.6 - 0.3, a);
  const v = evalKeys(g.keys, t);
  ctx.save();
  ctx.globalAlpha = a;
  drawOdometer(ctx, res, v, cx, cy + L.H * 0.14, Math.round(res.titlePx * 0.66), { currency: project.machine.currency || '', decimals: project.machine.decimals | 0, rate: evalVelocity(g.keys, t), scale: ease.outBack(clamp01((t - g.start - 0.3) / 0.5)) });
  ctx.restore();
}

// A Major jackpot takes the whole screen: its name and JACKPOT, the amount
// counting up, the Grand's particles (pres.jpShows).
function drawJackpotShows(ctx, scene, R, t) {
  const { L, res, project } = scene;
  for (const sh of R.pres.jpShows || []) {
    if (t < sh.start || t > sh.end) continue;
    const a = Math.min(clamp01((t - sh.start) / 0.4), clamp01((sh.end - t) / 0.5));
    const i = jackpotsConfig(project).tiers.findIndex((x) => x.id === sh.tier);
    const col = res.jackpots[i]?.color || '#ff5a1f';
    darken(ctx, L, 0.7 * a);
    const cx = L.W / 2;
    const cy = L.H * 0.44;
    drawGlow(ctx, res, col, cx, cy, L.H * 1.5, 0.6 * a);
    if (Number(project.effects.rays) > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawCentered(ctx, res.rays, cx, cy, ((L.H * 1.8) / res.rays.width) * ease.outBack(clamp01((t - sh.start) / 0.45)), 0.6 * a, t * 0.3);
      ctx.restore();
    }
    drawRing(ctx, cx, cy, (t - sh.start) / 0.8, L.H * 0.8, col, L.H * 0.022);
    drawRoundParticles(ctx, scene, R, t, ['jackpot']);
    const title = res.titles[`jp_${sh.tier}`];
    const s = (0.15 + 0.85 * ease.outElastic(clamp01((t - sh.start) / 0.8))) * (1 + 0.03 * Math.sin(t * 5));
    const fit = title ? Math.min(1, (L.W * 0.9) / title.width) : 1;
    drawCentered(ctx, title, cx, cy - L.H * 0.06, s * fit, a);
    drawShimmer(ctx, res, title, cx, cy - L.H * 0.06, s * fit, (((t - sh.start) % 1.5) / 1.5) * 1.6 - 0.3, a);
    ctx.save();
    ctx.globalAlpha = a;
    drawOdometer(ctx, res, evalKeys(sh.keys, t), cx, cy + L.H * 0.14, Math.round(res.titlePx * 0.66), { currency: project.machine.currency || '', decimals: project.machine.decimals | 0, rate: evalVelocity(sh.keys, t), scale: ease.outBack(clamp01((t - sh.start - 0.3) / 0.5)) });
    ctx.restore();
  }
}

function drawFlashes(ctx, scene, t) {
  const k = Number(scene.project.effects.flash) || 0;
  if (k <= 0) return;
  let a = 0;
  for (const f of scene.tl.flashes) {
    const d = t - f.t;
    if (d >= 0 && d < f.dur) a += f.amp * Math.pow(1 - d / f.dur, 2);
  }
  if (a <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(255,244,214,${Math.min(0.9, a * k)})`;
  ctx.fillRect(0, 0, scene.L.W, scene.L.H);
  ctx.restore();
}

function bloomPass(ctx, scene) {
  const k = Number(scene.project.effects.bloom) || 0;
  if (k <= 0 || !('filter' in ctx)) return;
  const cw = ctx.canvas.width;
  const chh = ctx.canvas.height;
  const w = Math.max(1, Math.round(cw / 4));
  const h = Math.max(1, Math.round(chh / 4));
  let b = scene.res.bloomA;
  if (!b || b.width !== w) {
    scene.res.bloomA = b = canvas(w, h);
    scene.res.bloomB = canvas(w, h);
  }
  const bb = scene.res.bloomB;
  const ga = b.getContext('2d');
  ga.filter = 'brightness(0.85) contrast(2.4) saturate(1.3)';
  ga.clearRect(0, 0, w, h);
  ga.drawImage(ctx.canvas, 0, 0, w, h);
  const gb = bb.getContext('2d');
  gb.filter = `blur(${Math.max(2, w * 0.012)}px)`;
  gb.clearRect(0, 0, w, h);
  gb.drawImage(b, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = Math.min(1, k * 0.7);
  ctx.drawImage(bb, 0, 0, cw, chh);
  ctx.restore();
}

export function renderFrame(ctx, scene, t, opts = {}) {
  const { tl, L, res, project } = scene;
  const fx = project.effects;
  const ri = roundIndexAt(tl, t);
  const R = ri >= 0 ? tl.rounds[ri] : null;
  const base = opts.scale || 1;
  // A view (the tooltip demos) shows the frame from (x, y) on: the canvas
  // is a window onto a bigger frame.
  const ox = opts.view ? -opts.view.x * base : 0;
  const oy = opts.view ? -opts.view.y * base : 0;
  ctx.save();
  ctx.setTransform(base, 0, 0, base, ox, oy);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  // Camera: push in on anticipation. Flashes and the vignette stay put.
  const cam = cameraAt(tl.camera, t, L, zoomConfig(project).amount);
  if (cam.z > 1.0001) {
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.z, cam.z);
    ctx.translate(-cam.x, -cam.y);
  }
  // A transparent frame leaves out what After Effects switches off for
  // transparency: the background (with its lights and tint) and the vignette.
  const clear = !!opts.transparent;
  if (!clear) {
    ctx.drawImage(res.bg, 0, 0);
    if (Number(fx.bokeh) > 0) drawBokeh(ctx, scene, t);
    drawFsTint(ctx, scene, t);
  }
  let sx = 0;
  let sy = 0;
  const shakeK = Number(fx.shake) || 0;
  if (shakeK > 0) {
    for (const s of tl.shakes) {
      const a = t - s.t;
      if (a >= 0 && a < s.dur) {
        const k = 1 - a / s.dur;
        const amp = s.amp * shakeK * L.cellW * 0.09 * k * k;
        sx += Math.sin(a * 93 + s.t * 7) * amp;
        sy += Math.cos(a * 79 + s.t * 3) * amp;
      }
    }
  }
  ctx.translate(sx, sy);
  // Ambient particles float behind the machine.
  drawOverParticles(ctx, scene, t, 'back');
  // The wheel game has no machine: just the background and the wheel.
  if (tl.game !== 'wheel') {
    drawPots(ctx, scene, t);
    ctx.drawImage(res.back, 0, 0);
    drawReels(ctx, scene, R, t);
    drawInWindowFx(ctx, scene, R, t);
    ctx.drawImage(res.front, 0, 0);
    drawMarquee(ctx, scene, R, t);
    drawAnticFrames(ctx, scene, R, t);
    drawStickies(ctx, scene, t);
    drawHoldFx(ctx, scene, R, t);
    drawLogo(ctx, scene, t);
    drawFsRibbon(ctx, scene, t);
    drawHoldBar(ctx, scene, R, t);
    drawHud(ctx, scene, R, t);
    drawJackpots(ctx, scene, t);
    drawPotsOver(ctx, scene, t);
  }
  if (R) {
    drawBoost(ctx, scene, R, t);
    drawMystery(ctx, scene, R, t);
    drawExpand(ctx, scene, R, t);
    drawScatterFx(ctx, scene, R, t);
    drawPops(ctx, scene, R, t);
    drawSteps(ctx, scene, R, t);
    drawMultPhase(ctx, scene, R, t);
    drawCollector(ctx, scene, R, t);
    drawJackpotFly(ctx, scene, R, t);
    drawBeams(ctx, scene, R, t);
    drawGrand(ctx, scene, R, t);
    drawJackpotShows(ctx, scene, R, t);
    drawBigWin(ctx, scene, R, t);
    drawBanner(ctx, scene, R, t);
    drawWheel(ctx, scene, R, t);
  }
  drawOverParticles(ctx, scene, t);
  ctx.setTransform(base, 0, 0, base, ox, oy);
  drawFlashes(ctx, scene, t);
  if (!clear) ctx.drawImage(res.vignette, 0, 0);
  ctx.restore();
  if (!opts.noBloom) bloomPass(ctx, scene);
}
