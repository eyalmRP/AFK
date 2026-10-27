// Pre-rendered bitmaps: symbol sprites (sharp and motion-blurred), the
// machine frame, background, titles, coins, rays and the bonus wheel.
// Built once per project change so each frame is mostly cheap blits.

import { THEMES } from '../core/defaults.js';
import { paintBuiltin, metalGradient, roundRect, starPath, sparkle, METALS } from './paint.js';

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function fontStack(name) {
  const n = name || 'Bungee';
  return `"${n}", "Arial Black", Impact, sans-serif`;
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

export async function loadProjectImages(project) {
  const font = fontStack(project.effects.font);
  const symbols = await Promise.all(
    project.symbols.map(async (s) => {
      if (s.src) {
        try {
          return await loadImage(s.src);
        } catch {
          return paintBuiltin(s.builtin || 'seven', 512, font);
        }
      }
      return paintBuiltin(s.builtin || 'seven', 512, font);
    })
  );
  const opt = async (src) => {
    if (!src) return null;
    try {
      return await loadImage(src);
    } catch {
      return null;
    }
  };
  return {
    symbols,
    background: await opt(project.assets.background),
    frame: await opt(project.assets.frame),
    logo: await opt(project.assets.logo),
  };
}

function fit(srcW, srcH, w, h) {
  const s = Math.min(w / srcW, h / srcH);
  return { w: srcW * s, h: srcH * s };
}

function symbolSprites(img, cellW, cellH) {
  const sharp = canvas(cellW, cellH);
  const sw = img.naturalWidth || img.width;
  const shh = img.naturalHeight || img.height;
  const f = fit(sw, shh, cellW * 0.88, cellH * 0.88);
  const g = sharp.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, (cellW - f.w) / 2, (cellH - f.h) / 2, f.w, f.h);
  // Vertical motion blur: running average of shifted copies.
  const ext = Math.round(cellH * 0.38);
  const blur = canvas(cellW, cellH + ext * 2);
  const b = blur.getContext('2d');
  const n = Math.max(24, Math.round((2 * ext) / 1.5));
  for (let i = 0; i < n; i++) {
    b.globalAlpha = 1 / (i + 1);
    const dy = -ext + (2 * ext * i) / (n - 1);
    b.drawImage(sharp, 0, ext + dy);
  }
  b.globalAlpha = 1;
  return { sharp, blur, ext };
}

function paintBackground(W, H, theme, img) {
  const c = canvas(W, H);
  const g = c.getContext('2d');
  if (img) {
    const s = Math.max(W / img.width, H / img.height);
    g.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
    return c;
  }
  const rg = g.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.5, Math.max(W, H) * 0.75);
  rg.addColorStop(0, theme.bg[0]);
  rg.addColorStop(0.55, theme.bg[1]);
  rg.addColorStop(1, theme.bg[2]);
  g.fillStyle = rg;
  g.fillRect(0, 0, W, H);
  // Diamond lattice for texture.
  g.save();
  g.globalAlpha = 0.07;
  g.strokeStyle = theme.accent;
  g.lineWidth = Math.max(1, W / 1400);
  const step = Math.max(W, H) / 22;
  for (let x = -H; x < W + H; x += step) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + H, H);
    g.moveTo(x, H);
    g.lineTo(x + H, 0);
    g.stroke();
  }
  g.restore();
  // Spotlights from the top.
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (const [x, a] of [[0.18, 0.11], [0.5, 0.14], [0.82, 0.11]]) {
    const lg = g.createLinearGradient(0, 0, 0, H * 0.9);
    lg.addColorStop(0, `rgba(255,240,210,${a})`);
    lg.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(W * x - W * 0.02, 0);
    g.lineTo(W * x + W * 0.02, 0);
    g.lineTo(W * x + W * 0.16, H * 0.95);
    g.lineTo(W * x - W * 0.16, H * 0.95);
    g.closePath();
    g.fill();
  }
  g.restore();
  return c;
}

function paintVignette(W, H) {
  const c = canvas(W, H);
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  rg.addColorStop(0, 'rgba(0,0,0,0)');
  rg.addColorStop(1, 'rgba(0,0,0,0.62)');
  g.fillStyle = rg;
  g.fillRect(0, 0, W, H);
  return c;
}

function paintMachine(L, theme, frameImg, builtinFrame) {
  const back = canvas(L.W, L.H);
  const front = canvas(L.W, L.H);
  const b = back.getContext('2d');
  const f = front.getContext('2d');
  const { frame } = L;
  const metal = theme.metal === 'neon' ? 'neon' : theme.metal === 'chrome' ? 'chrome' : 'gold';

  // Back: dark window and the reel faces.
  b.fillStyle = '#020104';
  roundRect(b, L.winX - 2, L.winTop - 2, L.winW + 4, L.winH + 4, L.cellW * 0.06);
  b.fill();
  for (const x of L.reelX) {
    const g = b.createLinearGradient(x, 0, x + L.cellW, 0);
    g.addColorStop(0, theme.reel[1]);
    g.addColorStop(0.5, theme.reel[0]);
    g.addColorStop(1, theme.reel[1]);
    b.fillStyle = g;
    b.fillRect(x, L.winTop, L.cellW, L.winH);
  }

  // Front: cylinder shading over each reel.
  for (const x of L.reelX) {
    const g = f.createLinearGradient(0, L.winTop, 0, L.winTop + L.winH);
    const dark = theme.lightReels ? 0.55 : 0.78;
    g.addColorStop(0, `rgba(0,0,0,${dark})`);
    g.addColorStop(0.2, 'rgba(0,0,0,0.05)');
    g.addColorStop(0.33, 'rgba(255,255,255,0.06)');
    g.addColorStop(0.5, 'rgba(0,0,0,0)');
    g.addColorStop(0.8, 'rgba(0,0,0,0.05)');
    g.addColorStop(1, `rgba(0,0,0,${dark})`);
    f.fillStyle = g;
    f.fillRect(x, L.winTop, L.cellW, L.winH);
  }
  if (builtinFrame) {
    // Dividers.
    for (let c = 1; c < L.reels; c++) {
      const x = L.reelX[c] - L.gap;
      const g = f.createLinearGradient(x, 0, x + L.gap, 0);
      const s = METALS[metal];
      g.addColorStop(0, s[5]);
      g.addColorStop(0.5, s[1]);
      g.addColorStop(1, s[5]);
      f.fillStyle = g;
      f.fillRect(x, L.winTop, L.gap, L.winH);
    }
    // Frame ring (outer rounded rect minus window).
    f.save();
    f.shadowColor = 'rgba(0,0,0,0.75)';
    f.shadowBlur = L.pad * 1.6;
    f.shadowOffsetY = L.pad * 0.4;
    f.beginPath();
    roundRect(f, frame.x, frame.y, frame.w, frame.h, frame.r);
    f.rect(L.winX + L.winW, L.winTop, -L.winW, L.winH);
    f.fillStyle = metal === 'neon' ? '#0b0d24' : metalGradient(f, frame.x, frame.y, frame.x + frame.w * 0.3, frame.y + frame.h, metal);
    f.fill('evenodd');
    f.restore();
    if (metal !== 'neon') {
      // Second pass for a vertical sheen.
      f.save();
      f.globalAlpha = 0.55;
      f.beginPath();
      roundRect(f, frame.x, frame.y, frame.w, frame.h, frame.r);
      f.rect(L.winX + L.winW, L.winTop, -L.winW, L.winH);
      f.fillStyle = metalGradient(f, 0, frame.y, 0, frame.y + frame.h, metal);
      f.fill('evenodd');
      f.restore();
    }
    // Bevels.
    f.lineWidth = Math.max(2, L.pad * 0.08);
    f.strokeStyle = 'rgba(0,0,0,0.7)';
    roundRect(f, frame.x, frame.y, frame.w, frame.h, frame.r);
    f.stroke();
    roundRect(f, L.winX - 1, L.winTop - 1, L.winW + 2, L.winH + 2, L.cellW * 0.04);
    f.lineWidth = Math.max(3, L.pad * 0.16);
    f.stroke();
    f.lineWidth = Math.max(1, L.pad * 0.05);
    f.strokeStyle = 'rgba(255,255,255,0.55)';
    roundRect(f, frame.x + L.pad * 0.12, frame.y + L.pad * 0.12, frame.w - L.pad * 0.24, frame.h - L.pad * 0.24, frame.r * 0.85);
    f.stroke();
    if (metal === 'neon') {
      for (const [inset, col] of [[0.18, theme.accent], [0.82, theme.glow]]) {
        f.save();
        f.shadowColor = col;
        f.shadowBlur = L.pad * 0.8;
        f.strokeStyle = col;
        f.lineWidth = Math.max(2, L.pad * 0.12);
        const i = L.pad * inset;
        roundRect(f, frame.x + i, frame.y + i, frame.w - i * 2, frame.h - i * 2, frame.r);
        f.stroke();
        f.stroke();
        f.restore();
      }
    }
    // Bulb sockets.
    f.fillStyle = 'rgba(0,0,0,0.55)';
    for (const p of L.bulbs) {
      f.beginPath();
      f.arc(p.x, p.y, L.bulbR * 1.45, 0, Math.PI * 2);
      f.fill();
    }
  }
  if (frameImg) {
    const s = Math.max(L.W / frameImg.width, L.H / frameImg.height);
    f.drawImage(frameImg, (L.W - frameImg.width * s) / 2, (L.H - frameImg.height * s) / 2, frameImg.width * s, frameImg.height * s);
  }
  return { back, front };
}

export const TITLE_PALETTES = {
  gold: { fill: ['#ffffff', '#fff2a8', '#ffc22e', '#e07b00', '#ffd85a', '#fff4c0'], metal: 'gold', outline: '#3a1600', glow: 'rgba(255,170,30,0.85)' },
  fire: { fill: ['#fffbe8', '#ffd36b', '#ff7a1a', '#d8160f', '#ff6a2a', '#ffd08a'], metal: 'gold', outline: '#3a0500', glow: 'rgba(255,70,20,0.9)' },
  violet: { fill: ['#ffffff', '#e9d4ff', '#b56bff', '#5a10d6', '#a05cff', '#f0e2ff'], metal: 'chrome', outline: '#1c0040', glow: 'rgba(170,80,255,0.95)' },
  aqua: { fill: ['#ffffff', '#d6fbff', '#45dcff', '#0a76d6', '#43c9ff', '#e2fbff'], metal: 'chrome', outline: '#00203f', glow: 'rgba(40,200,255,0.9)' },
  silver: { fill: ['#ffffff', '#f0f3f8', '#b9c3d1', '#6b7686', '#c9d1dc', '#ffffff'], metal: 'chrome', outline: '#141922', glow: 'rgba(200,220,255,0.6)' },
};

export function paintTitle(text, font, px, paletteName = 'gold') {
  const pal = TITLE_PALETTES[paletteName] || TITLE_PALETTES.gold;
  const probe = canvas(4, 4).getContext('2d');
  probe.font = `${px}px ${font}`;
  const w = Math.ceil(probe.measureText(text).width + px * 1.1);
  const h = Math.ceil(px * 1.75);
  const c = canvas(w, h);
  const g = c.getContext('2d');
  g.font = `${px}px ${font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  const x = w / 2;
  const y = h / 2 + px * 0.04;
  g.save();
  g.shadowColor = pal.glow;
  g.shadowBlur = px * 0.32;
  g.lineWidth = px * 0.2;
  g.strokeStyle = pal.outline;
  g.strokeText(text, x, y);
  g.restore();
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.7)';
  g.shadowBlur = px * 0.12;
  g.shadowOffsetY = px * 0.08;
  g.lineWidth = px * 0.2;
  g.strokeStyle = pal.outline;
  g.strokeText(text, x, y);
  g.restore();
  g.lineWidth = px * 0.12;
  g.strokeStyle = metalGradient(g, 0, y - px * 0.6, 0, y + px * 0.6, pal.metal);
  g.strokeText(text, x, y);
  g.lineWidth = px * 0.035;
  g.strokeStyle = pal.outline;
  g.strokeText(text, x, y);
  // Fill with a hard metallic horizon, then a gloss on the top half.
  const t = canvas(w, h);
  const tg = t.getContext('2d');
  tg.font = g.font;
  tg.textAlign = 'center';
  tg.textBaseline = 'middle';
  const fg = tg.createLinearGradient(0, y - px * 0.5, 0, y + px * 0.5);
  [0, 0.3, 0.49, 0.51, 0.8, 1].forEach((p, i) => fg.addColorStop(p, pal.fill[i]));
  tg.fillStyle = fg;
  tg.fillText(text, x, y);
  tg.globalCompositeOperation = 'source-atop';
  const gl = tg.createLinearGradient(0, y - px * 0.55, 0, y);
  gl.addColorStop(0, 'rgba(255,255,255,0.55)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  tg.fillStyle = gl;
  tg.fillRect(0, 0, w, y);
  g.drawImage(t, 0, 0);
  return c;
}

function paintLogo(L, project, theme, img) {
  const { logo } = L;
  if (img) {
    const f = fit(img.width, img.height, logo.w, logo.h);
    const c = canvas(f.w, f.h);
    c.getContext('2d').drawImage(img, 0, 0, f.w, f.h);
    return c;
  }
  const text = (project.machine.title || '').trim();
  if (!text) return null;
  const font = fontStack(project.effects.font);
  let px = logo.h * 0.56;
  const probe = canvas(4, 4).getContext('2d');
  probe.font = `${px}px ${font}`;
  const mw = probe.measureText(text).width;
  if (mw > logo.w * 0.82) px *= (logo.w * 0.82) / mw;
  return paintTitle(text, font, px, theme.metal === 'neon' ? 'aqua' : theme.metal === 'chrome' ? 'silver' : 'gold');
}

function paintCoin(size) {
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const r = size / 2;
  g.translate(r, r);
  const rim = g.createLinearGradient(-r, -r, r, r);
  rim.addColorStop(0, '#fff3b0');
  rim.addColorStop(0.5, '#c98a17');
  rim.addColorStop(1, '#5c3500');
  g.fillStyle = rim;
  g.beginPath();
  g.arc(0, 0, r * 0.98, 0, Math.PI * 2);
  g.fill();
  const face = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.05, 0, 0, r * 0.85);
  face.addColorStop(0, '#fffbe0');
  face.addColorStop(0.4, '#ffd34d');
  face.addColorStop(1, '#b8740c');
  g.fillStyle = face;
  g.beginPath();
  g.arc(0, 0, r * 0.8, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(110,60,0,0.7)';
  g.lineWidth = r * 0.06;
  g.beginPath();
  g.arc(0, 0, r * 0.68, 0, Math.PI * 2);
  g.stroke();
  starPath(g, 0, 0, r * 0.46, r * 0.2, 5);
  g.fillStyle = '#c98614';
  g.fill();
  g.strokeStyle = '#fff1b0';
  g.lineWidth = r * 0.04;
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.beginPath();
  g.ellipse(-r * 0.3, -r * 0.4, r * 0.28, r * 0.14, -0.6, 0, Math.PI * 2);
  g.fill();
  return c;
}

function paintGlow(size, color = '#ffffff') {
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  rg.addColorStop(0, color);
  rg.addColorStop(0.2, color);
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = 1;
  g.fillStyle = rg;
  g.fillRect(0, 0, size, size);
  return c;
}

function paintRays(size, count, color) {
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const r = size / 2;
  g.translate(r, r);
  const rg = g.createRadialGradient(0, 0, r * 0.05, 0, 0, r);
  rg.addColorStop(0, color);
  rg.addColorStop(0.35, color.replace(/[\d.]+\)$/, '0.35)'));
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const w = (Math.PI / count) * (i % 2 ? 0.45 : 0.75);
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, r, a - w, a + w);
    g.closePath();
    g.fill();
  }
  return c;
}

function paintWheel(R, segments, font) {
  const N = Math.max(2, segments.length);
  const seg = (Math.PI * 2) / N;
  const size = Math.ceil(R * 2 + 8);
  const disc = canvas(size, size);
  const g = disc.getContext('2d');
  g.translate(size / 2, size / 2);
  for (let k = 0; k < N; k++) {
    const a0 = -Math.PI / 2 + k * seg;
    const a1 = a0 + seg;
    const col = segments[k].color || '#a01030';
    const rg = g.createRadialGradient(0, 0, R * 0.1, 0, 0, R);
    rg.addColorStop(0, shade(col, -0.55));
    rg.addColorStop(0.55, col);
    rg.addColorStop(0.92, shade(col, 0.25));
    rg.addColorStop(1, shade(col, -0.3));
    g.fillStyle = rg;
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, R, a0, a1);
    g.closePath();
    g.fill();
    // Sheen on half of each wedge for a faceted look.
    g.save();
    g.globalAlpha = 0.14;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, R, a0, a0 + seg / 2);
    g.closePath();
    g.fill();
    g.restore();
  }
  // Separators.
  g.strokeStyle = metalGradient(g, -R, -R, R, R, 'gold');
  g.lineWidth = Math.max(2, R * 0.018);
  for (let k = 0; k < N; k++) {
    const a = -Math.PI / 2 + k * seg;
    g.beginPath();
    g.moveTo(Math.cos(a) * R * 0.17, Math.sin(a) * R * 0.17);
    g.lineTo(Math.cos(a) * R, Math.sin(a) * R);
    g.stroke();
  }
  // Labels, reading outward along the radius.
  for (let k = 0; k < N; k++) {
    const a = -Math.PI / 2 + (k + 0.5) * seg;
    const label = String(segments[k].label ?? '');
    g.save();
    g.rotate(a);
    let px = Math.min(R * 0.15, R * seg * 0.42);
    g.font = `${px}px ${font}`;
    const maxLen = R * 0.56;
    const mw = g.measureText(label).width;
    if (mw > maxLen) {
      px *= maxLen / mw;
      g.font = `${px}px ${font}`;
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.translate(R * 0.6, 0);
    g.lineWidth = px * 0.22;
    g.strokeStyle = 'rgba(20,6,0,0.9)';
    g.strokeText(label, 0, 0);
    g.fillStyle = metalGradient(g, 0, -px * 0.5, 0, px * 0.5, 'gold');
    g.fillText(label, 0, 0);
    g.restore();
  }
  // Pegs.
  for (let k = 0; k < N; k++) {
    const a = -Math.PI / 2 + k * seg;
    const x = Math.cos(a) * R * 0.94;
    const y = Math.sin(a) * R * 0.94;
    const pg = g.createRadialGradient(x - R * 0.008, y - R * 0.01, 1, x, y, R * 0.03);
    pg.addColorStop(0, '#ffffff');
    pg.addColorStop(0.4, '#ffd65a');
    pg.addColorStop(1, '#6b4206');
    g.fillStyle = pg;
    g.beginPath();
    g.arc(x, y, R * 0.028, 0, Math.PI * 2);
    g.fill();
  }
  // Hub.
  const hub = g.createRadialGradient(-R * 0.05, -R * 0.06, R * 0.01, 0, 0, R * 0.19);
  hub.addColorStop(0, '#fffbe0');
  hub.addColorStop(0.45, '#ffcf45');
  hub.addColorStop(1, '#7a4a05');
  g.fillStyle = hub;
  g.beginPath();
  g.arc(0, 0, R * 0.17, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = R * 0.02;
  g.strokeStyle = '#3a1d00';
  g.stroke();
  starPath(g, 0, 0, R * 0.11, R * 0.05, 5);
  g.fillStyle = '#c4002d';
  g.fill();
  g.lineWidth = R * 0.01;
  g.strokeStyle = '#ffe9a3';
  g.stroke();

  // Static outer ring.
  const ringSize = Math.ceil(R * 2.36);
  const ring = canvas(ringSize, ringSize);
  const rg2 = ring.getContext('2d');
  rg2.translate(ringSize / 2, ringSize / 2);
  rg2.save();
  rg2.shadowColor = 'rgba(0,0,0,0.7)';
  rg2.shadowBlur = R * 0.08;
  rg2.beginPath();
  rg2.arc(0, 0, R * 1.15, 0, Math.PI * 2);
  rg2.arc(0, 0, R * 0.985, 0, Math.PI * 2, true);
  rg2.fillStyle = metalGradient(rg2, -R, -R, R, R, 'gold');
  rg2.fill();
  rg2.restore();
  rg2.lineWidth = R * 0.012;
  rg2.strokeStyle = 'rgba(40,18,0,0.9)';
  for (const rr of [R * 1.15, R * 0.985, R * 1.07]) {
    rg2.beginPath();
    rg2.arc(0, 0, rr, 0, Math.PI * 2);
    rg2.stroke();
  }
  const bulbs = [];
  const nb = Math.max(16, N * 2);
  for (let i = 0; i < nb; i++) {
    const a = -Math.PI / 2 + (i / nb) * Math.PI * 2 + Math.PI / nb;
    bulbs.push({ x: Math.cos(a) * R * 1.07, y: Math.sin(a) * R * 1.07 });
    rg2.fillStyle = 'rgba(0,0,0,0.6)';
    rg2.beginPath();
    rg2.arc(Math.cos(a) * R * 1.07, Math.sin(a) * R * 1.07, R * 0.034, 0, Math.PI * 2);
    rg2.fill();
  }

  // Pointer (flapper), pivot at top centre of its canvas.
  const pw = Math.ceil(R * 0.26);
  const ph = Math.ceil(R * 0.34);
  const pointer = canvas(pw, ph);
  const pg = pointer.getContext('2d');
  pg.translate(pw / 2, ph * 0.22);
  const shape = () => {
    pg.beginPath();
    pg.moveTo(0, ph * 0.72);
    pg.bezierCurveTo(pw * 0.12, ph * 0.4, pw * 0.42, ph * 0.12, pw * 0.4, -ph * 0.04);
    pg.arc(0, -ph * 0.04, pw * 0.4, 0, Math.PI, true);
    pg.bezierCurveTo(-pw * 0.42, ph * 0.12, -pw * 0.12, ph * 0.4, 0, ph * 0.72);
    pg.closePath();
  };
  pg.save();
  pg.shadowColor = 'rgba(0,0,0,0.6)';
  pg.shadowBlur = R * 0.03;
  pg.shadowOffsetY = R * 0.015;
  shape();
  pg.fillStyle = metalGradient(pg, -pw / 2, 0, pw / 2, ph, 'gold');
  pg.fill();
  pg.restore();
  shape();
  pg.lineWidth = R * 0.012;
  pg.strokeStyle = '#3a1d00';
  pg.stroke();
  const gem = pg.createRadialGradient(-pw * 0.06, -ph * 0.08, 1, 0, -ph * 0.04, pw * 0.22);
  gem.addColorStop(0, '#ffffff');
  gem.addColorStop(0.35, '#ff2d55');
  gem.addColorStop(1, '#4d0012');
  pg.fillStyle = gem;
  pg.beginPath();
  pg.arc(0, -ph * 0.04, pw * 0.2, 0, Math.PI * 2);
  pg.fill();

  return { disc, ring, pointer, R, bulbs, pivotY: ph * 0.22, discSize: size, ringSize };
}

export function shade(hex, amt) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = m ? parseInt(m[1], 16) : 0x993333;
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const f = (x) => Math.round(amt >= 0 ? x + (255 - x) * amt : x * (1 + amt));
  r = f(r);
  g = f(g);
  b = f(b);
  return `rgb(${r},${g},${b})`;
}

export function buildResources(project, L, images) {
  const theme = THEMES[project.machine.theme] || THEMES.royal;
  const font = fontStack(project.effects.font);
  const sym = images.symbols.map((img) => symbolSprites(img, L.cellW, L.cellH));
  const { back, front } = paintMachine(L, theme, images.frame, project.machine.builtinFrame !== false);
  const titlePx = Math.round(Math.min(L.W * 0.11, L.H * 0.16));
  const titles = {};
  const t = project.effects.titles || {};
  const make = (k, pal, scale = 1) => {
    titles[k] = paintTitle(t[k] || k.toUpperCase(), font, Math.round(titlePx * scale), pal);
  };
  make('big', 'gold');
  make('mega', 'fire');
  make('epic', 'violet');
  make('bonus', 'gold');
  make('freespins', 'gold', 0.8);
  make('wheel', 'gold', 0.7);
  make('nearmiss', 'silver', 0.55);
  const wheelR = Math.round(Math.min(L.H * 0.36, L.W * 0.4));
  const segs = project.wheel.segments.length >= 2 ? project.wheel.segments : [{ label: '?', value: 0 }, { label: '?', value: 0 }];
  return {
    theme,
    font,
    sym,
    bg: paintBackground(L.W, L.H, theme, images.background),
    vignette: paintVignette(L.W, L.H),
    back,
    front,
    logo: paintLogo(L, project, theme, images.logo),
    titles,
    titlePx,
    coin: paintCoin(Math.round(L.cellW * 0.5)),
    glow: paintGlow(256),
    rays: paintRays(1024, 18, 'rgba(255,220,140,0.75)'),
    raysSmall: paintRays(512, 12, 'rgba(255,240,200,0.8)'),
    wheel: paintWheel(wheelR, segs, font),
    digitCache: new Map(),
    titleCache: new Map(),
  };
}

export { sparkle, roundRect, metalGradient, starPath };
