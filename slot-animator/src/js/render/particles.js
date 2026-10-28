// Particle art and drawing. Built-in particles are painted here (gold
// coins, stars, sparkles, gems, confetti, embers, casino chips); uploaded
// particle art can be a still image, a PNG sequence or a sprite sheet.
// Emitters come from core/particles.js; this file only draws them.

import { BUILTIN_PARTICLES, particleAssetInfo, spawnParticles, particleAt } from '../core/particles.js';
import { canvas, loadImage, loadWinAnim, paintCoin } from './sprites.js';
import { starPath, roundRect } from './paint.js';

export const PARTICLE_PX = 192;

const STAR_FILLS = [
  ['#fff8d2', '#ffd447', '#c77c08'],
  ['#ffffff', '#fff0b8', '#e0a52c'],
  ['#ffe6f4', '#ff7ac4', '#b81c72'],
];
const GEM_FILLS = [
  ['#e6fdff', '#4fe3ff', '#0a6f9e'],
  ['#ffe8fb', '#ff5fd8', '#8a0f78'],
  ['#e8ffef', '#43e58a', '#0a6b38'],
  ['#ffe9e9', '#ff4d5e', '#8c0a1d'],
];
const CONFETTI = ['#ff4f6d', '#ffd23f', '#3ddc97', '#4fa3ff', '#b46bff', '#ff8f3f', '#ffffff', '#ff6ec7'];
const CHIPS = [
  ['#e8283d', '#ffffff'],
  ['#2468e8', '#ffffff'],
  ['#18a558', '#ffffff'],
  ['#1b1b22', '#f4c55b'],
];

function paintStar(fill) {
  const S = PARTICLE_PX;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const r = S * 0.46;
  starPath(g, S / 2, S / 2, r, r * 0.45, 5);
  const gr = g.createRadialGradient(S * 0.42, S * 0.38, S * 0.02, S / 2, S / 2, r);
  gr.addColorStop(0, fill[0]);
  gr.addColorStop(0.45, fill[1]);
  gr.addColorStop(1, fill[2]);
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = S * 0.025;
  g.strokeStyle = 'rgba(255,255,255,0.75)';
  g.stroke();
  starPath(g, S / 2, S / 2 - S * 0.03, r * 0.42, r * 0.2, 5);
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.fill();
  return c;
}

function paintSparkle() {
  const S = PARTICLE_PX;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const m = S / 2;
  const glow = g.createRadialGradient(m, m, 0, m, m, m);
  glow.addColorStop(0, 'rgba(255,250,220,1)');
  glow.addColorStop(0.12, 'rgba(255,226,140,0.85)');
  glow.addColorStop(0.4, 'rgba(255,190,60,0.22)');
  glow.addColorStop(1, 'rgba(255,170,40,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#ffffff';
  for (const [w, h] of [[0.06, 0.48], [0.48, 0.06]]) {
    g.beginPath();
    g.moveTo(m, m - S * h);
    g.quadraticCurveTo(m, m, m + S * w, m);
    g.quadraticCurveTo(m, m, m, m + S * h);
    g.quadraticCurveTo(m, m, m - S * w, m);
    g.quadraticCurveTo(m, m, m, m - S * h);
    g.fill();
  }
  return c;
}

function paintGem(fill) {
  const S = PARTICLE_PX;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const m = S / 2;
  const w = S * 0.42;
  const top = S * 0.24;
  const girdle = S * 0.42;
  const bottom = S * 0.86;
  const facets = [
    [[m - w * 0.55, top], [m + w * 0.55, top], [m + w, girdle], [m - w, girdle]],
    [[m - w, girdle], [m + w, girdle], [m, bottom]],
  ];
  const gr = g.createLinearGradient(m - w, top, m + w, bottom);
  gr.addColorStop(0, fill[0]);
  gr.addColorStop(0.5, fill[1]);
  gr.addColorStop(1, fill[2]);
  g.fillStyle = gr;
  for (const f of facets) {
    g.beginPath();
    f.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
  }
  g.strokeStyle = 'rgba(255,255,255,0.6)';
  g.lineWidth = S * 0.015;
  g.beginPath();
  for (const x of [-0.55, 0, 0.55]) {
    g.moveTo(m + w * x, top);
    g.lineTo(m + w * x * 0.5, girdle);
    g.lineTo(m, bottom);
  }
  g.moveTo(m - w, girdle);
  g.lineTo(m + w, girdle);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.beginPath();
  g.moveTo(m - w * 0.45, top + S * 0.02);
  g.lineTo(m - w * 0.05, top + S * 0.02);
  g.lineTo(m - w * 0.3, girdle - S * 0.02);
  g.closePath();
  g.fill();
  return c;
}

function paintConfetti(color, k) {
  const S = PARTICLE_PX;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const w = S * (k % 3 === 0 ? 0.62 : 0.5);
  const h = S * (k % 2 ? 0.3 : 0.24);
  const gr = g.createLinearGradient(0, S / 2 - h / 2, 0, S / 2 + h / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0.35)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0)');
  roundRect(g, (S - w) / 2, (S - h) / 2, w, h, S * 0.02);
  g.fillStyle = color;
  g.fill();
  g.fillStyle = gr;
  g.fill();
  return c;
}

function paintEmber(k) {
  const S = PARTICLE_PX;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const m = S / 2;
  const gr = g.createRadialGradient(m, m, 0, m, m, m);
  const [a, b] = k ? ['rgba(255,244,200,1)', 'rgba(255,196,64,'] : ['rgba(255,236,190,1)', 'rgba(255,110,30,'];
  gr.addColorStop(0, a);
  gr.addColorStop(0.18, `${b}0.9)`);
  gr.addColorStop(0.5, `${b}0.25)`);
  gr.addColorStop(1, `${b}0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  return c;
}

function paintChip([body, stripe]) {
  const S = PARTICLE_PX;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const m = S / 2;
  const r = S * 0.46;
  g.fillStyle = body;
  g.beginPath();
  g.arc(m, m, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = stripe;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.save();
    g.translate(m, m);
    g.rotate(a);
    g.fillRect(r * 0.72, -r * 0.13, r * 0.28, r * 0.26);
    g.restore();
  }
  g.strokeStyle = stripe;
  g.lineWidth = S * 0.025;
  g.setLineDash([S * 0.05, S * 0.04]);
  g.beginPath();
  g.arc(m, m, r * 0.6, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  const gl = g.createRadialGradient(m - r * 0.4, m - r * 0.45, 0, m, m, r);
  gl.addColorStop(0, 'rgba(255,255,255,0.4)');
  gl.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.fillStyle = gl;
  g.beginPath();
  g.arc(m, m, r, 0, Math.PI * 2);
  g.fill();
  return c;
}

export function paintParticle(id) {
  switch (id) {
    case 'coin':
      return [paintCoin(PARTICLE_PX)];
    case 'star':
      return STAR_FILLS.map(paintStar);
    case 'sparkle':
      return [paintSparkle()];
    case 'gem':
      return GEM_FILLS.map(paintGem);
    case 'confetti':
      return CONFETTI.map(paintConfetti);
    case 'ember':
      return [paintEmber(0), paintEmber(1)];
    case 'chip':
      return CHIPS.map(paintChip);
    default:
      return [paintCoin(PARTICLE_PX)];
  }
}

// Fit an uploaded frame into PARTICLE_PX, keeping its aspect.
function fitParticle(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const s = Math.min(1, PARTICLE_PX / Math.max(w, h));
  const c = canvas(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

const builtinCache = new Map();

// Every particle asset of the project, ready to draw:
// id -> { frames, fps, anim, motion, blend }.
export async function loadParticleSprites(project, load = loadImage) {
  const out = new Map();
  for (const b of BUILTIN_PARTICLES) {
    if (!builtinCache.has(b.id)) builtinCache.set(b.id, paintParticle(b.id));
    const info = particleAssetInfo(project, b.id);
    out.set(b.id, { frames: builtinCache.get(b.id), fps: 24, anim: false, motion: info.motion, blend: info.motion === 'glow' ? 'add' : 'normal' });
  }
  for (const a of project.particles?.assets || []) {
    const info = particleAssetInfo(project, a.id);
    let frames = null;
    try {
      if (a.kind === 'image' && a.src) frames = [await load(a.src)];
      else {
        const anim = await loadWinAnim(a, load);
        frames = anim?.frames || null;
      }
    } catch {
      frames = null;
    }
    if (!frames || !frames.length) continue;
    out.set(a.id, { frames: frames.map(fitParticle), fps: info.fps, anim: info.anim, motion: info.motion, blend: a.blend === 'add' || info.motion === 'glow' ? 'add' : 'normal' });
  }
  return out;
}

// The frame a particle shows: a random variant, or its own point in an
// animation (each particle starts at a random frame).
export function particleFrame(sprite, p, t) {
  const n = sprite.frames.length;
  if (!sprite.anim) return sprite.frames[p.v % n];
  return sprite.frames[(Math.floor(Math.max(0, t - p.b) * sprite.fps) + p.v) % n];
}

export function drawParticleList(ctx, sprite, list, t, alphaMul = 1) {
  if (!sprite || !list.length || alphaMul <= 0) return;
  ctx.save();
  if (sprite.blend === 'add') ctx.globalCompositeOperation = 'lighter';
  for (const p of list) {
    const st = particleAt(p, t, sprite.motion);
    if (!st || st.alpha <= 0.003) continue;
    const img = particleFrame(sprite, p, t);
    const k = p.s / Math.max(img.width, img.height);
    const w = img.width * k * st.sx;
    const h = img.height * k * st.sy;
    if (w < 0.3 || h < 0.3) continue;
    ctx.globalAlpha = st.alpha * alphaMul;
    ctx.save();
    ctx.translate(st.x, st.y);
    ctx.rotate((st.rot * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
  ctx.restore();
}

// An emitter's particles for this scene's layout, made once and kept.
export function emitterParticles(scene, em) {
  if (!scene._particles) scene._particles = new Map();
  let list = scene._particles.get(em);
  if (!list) {
    const sprite = scene.res.particles?.get(em.asset) || scene.res.particles?.get('coin');
    list = spawnParticles(em, scene.L, sprite ? sprite.motion : 'spin', Number(scene.project.effects.coins ?? 1));
    scene._particles.set(em, list);
  }
  return list;
}

export function drawEmitter(ctx, scene, em, t) {
  if (t < em.start || t > em.cut) return;
  const sprite = scene.res.particles?.get(em.asset) || scene.res.particles?.get('coin');
  if (!sprite) return;
  drawParticleList(ctx, sprite, emitterParticles(scene, em), t, Math.min(1, (em.cut - t) / 0.3));
}
