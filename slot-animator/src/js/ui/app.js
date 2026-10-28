// Reel Studio editor: project state, live preview with synced sound, the
// round sequencer and the settings panels. Rendering and exports live in
// their own modules.

import {
  defaultProject,
  newRound,
  OUTCOMES,
  OUTCOME_BY_ID,
  SPIN_TYPES,
  SPIN_PRESETS,
  THEMES,
  BUILTIN_SYMBOLS,
  CANDY_SYMBOLS,
  LINE_WINS,
  SCATTER_WINS,
  DEFAULT_SEGMENTS,
  PRESETS,
  PAY_MODES,
  ORDERS,
  CELL_ORDERS,
  TITLE_PALETTE_NAMES,
  defaultTiers,
  SOUND_EVENTS,
} from '../core/defaults.js';
import { buildTimeline, roundIndexAt } from '../core/timeline.js';
import { computeLayout } from '../core/layout.js';
import { evalVelocity } from '../core/keys.js';
import { lineColor, generatePaylines } from '../core/paylines.js';
import { autoAmount, makeContext, defaultPattern, tumbleEnabled } from '../core/outcomes.js';
import { orderList } from '../core/order.js';
import { FORMAT_CHOICES } from '../core/ae-export.js';
import { loadImage, loadWinAnim, buildResources, fontStack } from '../render/sprites.js';
import { paintBuiltin } from '../render/paint.js';
import { renderFrame } from '../render/renderer.js';
import { decodeCustomSounds, renderSoundtrack, audioBufferToWav } from '../render/audio.js';
import { exportMP4, frameToPNG, canEncodeVideo } from '../export/video.js';
import { buildAEPackage } from '../export/aepackage.js';
import { h, clear, rangeField, selectField, segmented, toggleField, textField, section, button, readFileAsDataURL, pickFiles } from './dom.js';

const STORE_KEY = 'reel-studio-project-v2';
const OLD_STORE_KEY = 'reel-studio-project-v1';
const FONTS = ['Bungee', 'Lilita One', 'Russo One', 'Cinzel Decorative'];
const FORMATS = [
  ['1920x1080', 'Landscape HD · 1920 × 1080'],
  ['3840x2160', 'Landscape 4K · 3840 × 2160'],
  ['1280x720', 'Landscape · 1280 × 720'],
  ['1080x1920', 'Portrait story · 1080 × 1920'],
  ['1080x1350', 'Portrait feed · 1080 × 1350'],
  ['1080x1080', 'Square · 1080 × 1080'],
];
const MULT_VALUES = [2, 3, 5, 10, 15, 20, 25, 50, 100, 250, 500];
const ROLES = [
  ['normal', 'Normal'],
  ['wild', 'Wild'],
  ['scatter', 'Scatter'],
  ['multiplier', 'Multiplier'],
  ['bonus', 'Bonus'],
];

const state = {
  project: null,
  sel: 0,
  t: 0,
  playing: false,
  loop: true,
  solo: false,
  speed: 1,
  soundOn: true,
  tab: 'machine',
  scene: null,
  images: null,
  quality: 1,
  autoQuality: true,
  perf: [],
  builder: { spins: 5, warm: 'mixed', finale: 'big1', fsCount: 5 },
  busy: null,
  exportRange: 'all',
  bitrate: 16e6,
  mp4Sound: true,
};
const el = {};
const imageCache = new Map();
const animCache = new WeakMap();
let ctx = null;
let downloadsP = null;

// ---------- persistence ----------

function deepMerge(a, b) {
  if (Array.isArray(b)) return b;
  if (b && typeof b === 'object') {
    const out = { ...(a && typeof a === 'object' && !Array.isArray(a) ? a : {}) };
    for (const k of Object.keys(b)) out[k] = a && typeof a[k] === 'object' && a[k] && !Array.isArray(a[k]) ? deepMerge(a[k], b[k]) : b[k];
    return out;
  }
  return b === undefined ? a : b;
}

// Version 1 projects had fixed Big / Mega / Epic outcomes; version 2 has one
// Big win outcome that counts through the project's tiers.
function upgradeV1(p) {
  if (!p || p.version >= 2) return p;
  const titles = p.effects?.titles || {};
  const tiers = defaultTiers();
  ['big', 'mega', 'epic'].forEach((k, i) => titles[k] && (tiers[i].title = titles[k]));
  const tierOf = { big: 0, mega: 1, epic: 2 };
  return {
    ...p,
    version: 2,
    tiers: p.tiers || tiers,
    rounds: (p.rounds || []).map((r) => (r.outcome in tierOf ? { ...r, outcome: 'big', tier: tierOf[r.outcome] } : r)),
  };
}

function migrate(p) {
  const out = deepMerge(defaultProject(), upgradeV1(p) || {});
  if (!Array.isArray(out.symbols) || !out.symbols.length) out.symbols = defaultProject().symbols;
  out.symbols = out.symbols.map((s) => ({ winAnim: null, ...s }));
  if (!Array.isArray(out.tiers) || !out.tiers.length) out.tiers = defaultTiers();
  if (!Array.isArray(out.rounds)) out.rounds = [];
  if (!Array.isArray(out.wheel.segments) || out.wheel.segments.length < 2) out.wheel.segments = DEFAULT_SEGMENTS.map((s) => ({ ...s }));
  if (!Array.isArray(out.output.formats) || !out.output.formats.length) out.output.formats = [`${out.canvas.width}x${out.canvas.height}`];
  out.rounds = out.rounds.map((r) => ({ ...newRound(OUTCOME_BY_ID[r.outcome] ? r.outcome : 'none'), ...r, outcome: OUTCOME_BY_ID[r.outcome] ? r.outcome : 'none' }));
  out.version = 2;
  return out;
}

function loadSaved() {
  for (const k of [STORE_KEY, OLD_STORE_KEY]) {
    try {
      const s = localStorage.getItem(k);
      if (s) return migrate(JSON.parse(s));
    } catch {
      // try the next key
    }
  }
  return null;
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state.project));
    } catch {
      if (!state.saveWarned) {
        toast('This project is too large to keep in the browser automatically. Use Export → Save project.', 'warn', 6000);
        state.saveWarned = true;
      }
    }
  }, 400);
}

// ---------- rebuild & render ----------

let rebuildTimer = null;
let rebuildVersion = 0;
function changed(kind = 'all') {
  save();
  clearTimeout(rebuildTimer);
  state.pendingKind = state.pendingKind === 'all' || kind === 'all' ? 'all' : 'timeline';
  rebuildTimer = setTimeout(() => {
    const k = state.pendingKind;
    state.pendingKind = null;
    rebuild(k);
  }, kind === 'all' ? 140 : 40);
}

async function symbolImage(s, font) {
  if (s.src) {
    if (!imageCache.has(s.src)) imageCache.set(s.src, loadImage(s.src).catch(() => null));
    const img = await imageCache.get(s.src);
    if (img) return img;
  }
  const key = `builtin:${s.builtin || 'seven'}:${font}`;
  if (!imageCache.has(key)) imageCache.set(key, Promise.resolve(paintBuiltin(s.builtin || 'seven', 512, font)));
  return imageCache.get(key);
}

async function optImage(src) {
  if (!src) return null;
  if (!imageCache.has(src)) imageCache.set(src, loadImage(src).catch(() => null));
  return imageCache.get(src);
}

function winAnimFor(anim) {
  if (!anim) return Promise.resolve(null);
  if (!animCache.has(anim)) animCache.set(anim, loadWinAnim(anim, (src) => optImage(src).then((i) => i || Promise.reject(new Error('bad frame')))));
  return animCache.get(anim);
}

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

async function loadImages(project) {
  const font = fontStack(project.effects.font);
  await withTimeout(document.fonts.load(`64px "${project.effects.font || 'Bungee'}"`).catch(() => null), 2500);
  const symbols = await Promise.all(project.symbols.map((s) => symbolImage(s, font)));
  // Without a multiplier symbol the engine uses a built-in orb after the last symbol.
  if (!project.symbols.some((s) => s.role === 'multiplier')) symbols.push(await symbolImage({ builtin: 'orb' }, font));
  return {
    symbols,
    winAnims: await Promise.all(project.symbols.map((s) => winAnimFor(s.winAnim))),
    background: await optImage(project.assets.background),
    frame: await optImage(project.assets.frame),
    logo: await optImage(project.assets.logo),
  };
}

async function rebuild(kind = 'all') {
  const v = ++rebuildVersion;
  const project = state.project;
  try {
    const tl = buildTimeline(project);
    const L = computeLayout(project);
    let images = state.images;
    let res = state.scene?.res;
    if (kind === 'all' || !res) {
      images = await loadImages(project);
      if (v !== rebuildVersion) return;
      res = buildResources(project, L, images);
    }
    state.images = images;
    state.scene = { project, tl, L, res };
    if (state.sel >= project.rounds.length) state.sel = Math.max(0, project.rounds.length - 1);
    state.t = Math.min(state.t, tl.duration);
    sizeCanvas();
    renderTimeline();
    refreshList();
    if (state.tab === 'spin') drawMotionGraph();
    if (state.tab === 'assets' && kind === 'all') refreshThumbs();
    draw();
    scheduleSound();
  } catch (e) {
    console.error(e);
    toast(`Could not rebuild the animation: ${e.message}`, 'error', 6000);
  }
}

function sizeCanvas() {
  const { L } = state.scene;
  document.documentElement.style.setProperty('--ar', `${L.W} / ${L.H}`);
  const w = Math.round(L.W * state.quality);
  const hgt = Math.round(L.H * state.quality);
  if (el.canvas.width !== w || el.canvas.height !== hgt) {
    el.canvas.width = w;
    el.canvas.height = hgt;
  }
  fitCanvas();
}

function fitCanvas() {
  if (!state.scene) return;
  const { L } = state.scene;
  const box = el.viewport.getBoundingClientRect();
  const s = Math.min((box.width - 2) / L.W, (box.height - 2) / L.H);
  if (!(s > 0)) return;
  el.canvas.style.width = `${Math.floor(L.W * s)}px`;
  el.canvas.style.height = `${Math.floor(L.H * s)}px`;
}

function draw() {
  if (!state.scene || !ctx) return;
  const t0 = performance.now();
  renderFrame(ctx, state.scene, state.t, { scale: state.quality });
  const ms = performance.now() - t0;
  if (state.playing && state.autoQuality) {
    state.perf.push(ms);
    if (state.perf.length > 24) state.perf.shift();
    const avg = state.perf.reduce((a, b) => a + b, 0) / state.perf.length;
    if (state.quality === 1 && state.perf.length >= 24 && avg > 30) setQuality(0.5, true);
  }
  updatePlayhead();
}

function setQuality(q, auto = false) {
  state.quality = q;
  state.perf = [];
  sizeCanvas();
  renderBadge();
  draw();
  if (auto) toast('Preview switched to half resolution to keep playback smooth. Exports always render at full quality.', 'info', 5000);
}

function renderBadge() {
  clear(
    el.badge,
    state.quality < 1
      ? button('Half-res preview · switch to full', () => {
          state.autoQuality = false;
          setQuality(1);
        }, { class: 'chip', id: 'quality-chip' })
      : null
  );
}

let lastNow = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - lastNow) / 1000);
  lastNow = now;
  if (state.playing && state.scene) {
    const [a, b] = playRange();
    // While the sound plays, its clock drives the playhead so picture and
    // sound never drift apart.
    if (audio.src && audio.ac?.state === 'running') state.t = audio.offset + (audio.ac.currentTime - audio.startedAt);
    else state.t += dt * state.speed;
    if (state.t >= b) {
      if (state.loop) {
        state.t = a + ((state.t - a) % Math.max(0.01, b - a));
        startAudio();
      } else {
        state.t = b;
        state.playing = false;
        stopAudio();
        renderTransport();
      }
    }
    if (state.t < a) state.t = a;
    draw();
  }
  requestAnimationFrame(loop);
}

function playRange() {
  const tl = state.scene.tl;
  if (state.solo && tl.rounds[state.sel]) {
    const R = tl.rounds[state.sel];
    return [Math.max(0, R.t0 - 0.25), R.next];
  }
  return [0, tl.duration];
}

// ---------- sound preview ----------

const audio = { ac: null, buffer: null, src: null, version: 0, timer: null, startedAt: 0, offset: 0 };
let customKey = '';
let customP = null;

function customSounds(project) {
  const c = project.sound?.custom || {};
  const key = Object.keys(c)
    .sort()
    .map((k) => `${k}:${(c[k] || '').length}:${(c[k] || '').slice(-24)}`)
    .join('|');
  if (key !== customKey || !customP) {
    customKey = key;
    customP = decodeCustomSounds(project).catch(() => new Map());
  }
  return customP;
}

function scheduleSound() {
  clearTimeout(audio.timer);
  audio.timer = setTimeout(refreshSound, 350);
}

async function refreshSound() {
  const sc = state.scene;
  if (!sc || typeof OfflineAudioContext === 'undefined') return;
  const v = ++audio.version;
  if (sc.project.sound?.enabled === false) {
    audio.buffer = null;
    stopAudio();
    return;
  }
  try {
    const buf = await renderSoundtrack(sc.tl, sc.project, await customSounds(sc.project));
    if (v !== audio.version) return;
    audio.buffer = buf;
    if (state.playing) startAudio();
  } catch (e) {
    console.warn('sound', e);
  }
}

function ensureAudioContext() {
  if (!audio.ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audio.ac = new AC();
  }
  if (audio.ac.state === 'suspended') audio.ac.resume().catch(() => {});
  return audio.ac;
}

function stopAudio() {
  if (!audio.src) return;
  try {
    audio.src.stop();
  } catch {
    // already stopped
  }
  audio.src.disconnect();
  audio.src = null;
}

function startAudio() {
  stopAudio();
  if (!state.playing || !state.soundOn || state.speed !== 1 || !audio.buffer || state.project.sound?.enabled === false) return;
  const ac = ensureAudioContext();
  if (!ac) return;
  if (ac.state !== 'running') {
    ac.resume()
      .then(() => state.playing && !audio.src && startAudio())
      .catch(() => {});
    return;
  }
  const [, b] = playRange();
  const from = Math.max(0, Math.min(state.t, audio.buffer.duration));
  const src = ac.createBufferSource();
  src.buffer = audio.buffer;
  src.connect(ac.destination);
  src.start(0, from, Math.max(0.01, b - from));
  audio.src = src;
  audio.startedAt = ac.currentTime;
  audio.offset = from;
}

// ---------- shell ----------

function buildShell() {
  const app = document.getElementById('app');
  el.canvas = h('canvas', { id: 'preview', 'aria-label': 'Animation preview' });
  ctx = el.canvas.getContext('2d');
  el.viewport = h('div', { class: 'viewport' }, el.canvas);
  el.badge = h('div', { class: 'badge' });
  el.viewport.append(el.badge);
  el.transport = h('div', { class: 'transport' });
  el.timeline = h('div', { class: 'timeline' });
  el.tabs = h('nav', { class: 'tabs', role: 'tablist', 'aria-label': 'Settings' });
  el.panel = h('div', { class: 'panel-body', id: 'settings-panel' });
  el.sequence = h('div', { class: 'panel-body' });
  el.toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
  const goExport = (fn) => () => {
    state.tab = 'export';
    renderTabs();
    renderPanel();
    fn();
  };
  clear(
    app,
    h(
      'header',
      { class: 'top' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, '7'), h('div', null, h('div', { class: 'brand-name' }, 'Reel Studio'), h('div', { class: 'brand-sub' }, 'Slot win animator'))),
      el.transport,
      h(
        'div',
        { class: 'top-actions' },
        button('Preview MP4', goExport(startMP4), { class: 'btn', icon: 'film', id: 'top-mp4', title: 'Render a quick MP4 preview with sound' }),
        button('After Effects', goExport(startAE), { class: 'btn primary', icon: 'download', id: 'top-ae', title: 'Download the After Effects project package' })
      )
    ),
    h(
      'div',
      { class: 'work' },
      h('aside', { class: 'side left', 'aria-label': 'Settings' }, el.tabs, el.panel),
      h('main', { class: 'stage' }, el.viewport, el.timeline),
      h('aside', { class: 'side right', 'aria-label': 'Spin rounds' }, el.sequence)
    ),
    el.toasts
  );
  new ResizeObserver(() => fitCanvas()).observe(el.viewport);
  document.addEventListener('keydown', onKey);
}

function seek(t) {
  state.t = Math.min(state.scene.tl.duration, Math.max(0, t));
  if (state.playing) startAudio();
  draw();
}

function onKey(e) {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea' || e.target.isContentEditable) return;
  if (!state.scene) return;
  const fd = 1 / state.scene.tl.fps;
  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
  } else if (e.key === 'ArrowRight') seek(state.t + (e.shiftKey ? 1 : fd));
  else if (e.key === 'ArrowLeft') seek(state.t - (e.shiftKey ? 1 : fd));
  else if (e.key === 'Home') seek(playRange()[0]);
}

// ---------- transport & timeline ----------

function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

function togglePlay() {
  if (!state.scene) return;
  ensureAudioContext();
  const [a, b] = playRange();
  if (!state.playing && state.t >= b - 0.01) state.t = a;
  state.playing = !state.playing;
  if (state.playing) startAudio();
  else stopAudio();
  renderTransport();
}

function jumpRound(d) {
  const tl = state.scene.tl;
  if (!tl.rounds.length) return;
  const cur = roundIndexAt(tl, state.t + 0.001);
  const i = Math.min(tl.rounds.length - 1, Math.max(0, (cur < 0 ? -1 : cur) + d));
  selectRound(i, true);
}

function renderTransport() {
  const soundOff = state.project?.sound?.enabled === false;
  clear(
    el.transport,
    button('', () => jumpRound(-1), { class: 'icon-btn', icon: 'prev', title: 'Previous round', id: 'tp-prev' }),
    button('', togglePlay, { class: 'icon-btn play', icon: state.playing ? 'pause' : 'play', title: 'Play or pause (Space)', id: 'tp-play' }),
    button('', () => jumpRound(1), { class: 'icon-btn', icon: 'next', title: 'Next round', id: 'tp-next' }),
    (el.time = h('span', { class: 'time', id: 'tp-time' }, '00:00.00')),
    h(
      'div',
      { class: 'tp-opts' },
      button('Loop', () => {
        state.loop = !state.loop;
        renderTransport();
      }, { class: `chip${state.loop ? ' on' : ''}`, icon: 'loop', id: 'tp-loop', title: 'Loop playback' }),
      button('Solo round', () => {
        state.solo = !state.solo;
        if (state.playing) startAudio();
        renderTransport();
      }, { class: `chip${state.solo ? ' on' : ''}`, id: 'tp-solo', title: 'Play only the selected round' }),
      button('Sound', () => {
        state.soundOn = !state.soundOn;
        ensureAudioContext();
        if (state.soundOn) startAudio();
        else stopAudio();
        renderTransport();
      }, { class: `chip${state.soundOn && !soundOff ? ' on' : ''}`, icon: state.soundOn && !soundOff ? 'sound' : 'mute', id: 'tp-sound', title: soundOff ? 'Sound is switched off in the Sound tab' : 'Play the sound track with the preview (1× speed)', disabled: soundOff }),
      selectField({
        id: 'tp-speed',
        value: state.speed,
        options: [
          { value: 0.25, label: '¼×' },
          { value: 0.5, label: '½×' },
          { value: 1, label: '1×' },
        ],
        onChange: (v) => {
          state.speed = Number(v);
          if (state.playing) startAudio();
        },
      })
    )
  );
  updatePlayhead();
}

function updatePlayhead() {
  if (!state.scene || !el.head) return;
  const D = state.scene.tl.duration;
  el.head.style.left = `${(state.t / D) * 100}%`;
  if (el.time) el.time.textContent = `${fmtTime(state.t)} / ${fmtTime(D)}`;
  const cur = roundIndexAt(state.scene.tl, state.t);
  if (cur !== state.curShown) {
    state.curShown = cur;
    el.track?.querySelectorAll('.block').forEach((b, i) => b.classList.toggle('cur', i === cur));
  }
}

function renderTimeline() {
  const { tl } = state.scene;
  const D = tl.duration;
  el.track = h('div', { class: 'track', id: 'timeline-track', role: 'slider', 'aria-label': 'Playhead', 'aria-valuemin': 0, 'aria-valuemax': D.toFixed(2), tabindex: 0 });
  for (const b of tl.fsBlocks) {
    const end = Number.isFinite(b.end) ? b.end : D;
    el.track.append(h('div', { class: 'fs-band', style: { left: `${(b.start / D) * 100}%`, width: `${((end - b.start) / D) * 100}%` }, title: `Free spins (${b.n})` }));
  }
  tl.rounds.forEach((R, i) => {
    const o = OUTCOME_BY_ID[R.outcome];
    el.track.append(
      h(
        'div',
        { class: `block${i === state.sel ? ' sel' : ''}${R.free ? ' free' : ''}`, style: { left: `${(R.t0 / D) * 100}%`, width: `${((R.next - R.t0) / D) * 100}%`, '--c': o.color }, title: `Round ${i + 1}: ${o.label}${R.free ? ' (free spin)' : ''}` },
        h('span', null, `${i + 1} · ${o.short}`)
      )
    );
  });
  el.head = h('div', { class: 'playhead' });
  el.track.append(el.head);
  const ruler = h('div', { class: 'ruler' });
  const step = D > 90 ? 10 : D > 40 ? 5 : 2;
  for (let s = 0; s <= D; s += step) ruler.append(h('span', { style: { left: `${(s / D) * 100}%` } }, `${s}s`));
  const scrub = (ev) => {
    const r = el.track.getBoundingClientRect();
    const t = Math.min(D, Math.max(0, ((ev.clientX - r.left) / r.width) * D));
    state.t = t;
    const i = roundIndexAt(tl, t);
    if (i >= 0 && i !== state.sel) selectRound(i, false);
    draw();
  };
  el.track.addEventListener('pointerdown', (ev) => {
    el.track.setPointerCapture(ev.pointerId);
    stopAudio();
    scrub(ev);
    const move = (e2) => scrub(e2);
    const up = () => {
      el.track.removeEventListener('pointermove', move);
      el.track.removeEventListener('pointerup', up);
      if (state.playing) startAudio();
    };
    el.track.addEventListener('pointermove', move);
    el.track.addEventListener('pointerup', up);
  });
  el.track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.stopPropagation();
      seek(state.t + (e.key === 'ArrowRight' ? 0.5 : -0.5));
    }
  });
  clear(
    el.timeline,
    h('div', { class: 'tl-top' }, h('span', { class: 'tl-title' }, `${tl.rounds.length} rounds`), h('span', { class: 'tl-legend' }, legend()), h('span', { class: 'tl-dur' }, `${D.toFixed(1)} s · ${state.project.canvas.fps} fps`)),
    el.track,
    ruler
  );
  state.curShown = null;
  updatePlayhead();
}

function legend() {
  const used = new Set(state.project.rounds.map((r) => r.outcome));
  return OUTCOMES.filter((o) => used.has(o.id)).map((o) => h('span', { class: 'lg', style: { '--c': o.color } }, o.short));
}

// ---------- sequence (right panel) ----------

function selectRound(i, doSeek) {
  state.sel = i;
  if (doSeek && state.scene?.tl.rounds[i]) seek(Math.max(0, state.scene.tl.rounds[i].t0 - 0.05));
  el.track?.querySelectorAll('.block').forEach((b, k) => b.classList.toggle('sel', k === i));
  refreshList();
  renderInspector();
  if (state.tab === 'spin') drawMotionGraph();
}

function renderSequence() {
  el.list = h('ol', { class: 'rounds', id: 'round-list' });
  el.inspector = h('div', { class: 'inspector', id: 'round-inspector' });
  const addSel = h(
    'select',
    { id: 'add-outcome', 'aria-label': 'Outcome for the new round' },
    OUTCOMES.map((o) => h('option', { value: o.id }, o.label))
  );
  clear(
    el.sequence,
    builderCard(),
    h(
      'div',
      { class: 'list-head' },
      h('h2', null, 'Spin rounds'),
      h('div', { class: 'add-row' }, addSel, button('Add', () => addRound(addSel.value), { class: 'btn small', icon: 'plus', id: 'add-round' }))
    ),
    el.list,
    el.inspector
  );
  refreshList();
  renderInspector();
}

function tierTitle(i) {
  const tiers = state.project.tiers || [];
  return tiers[Math.min(tiers.length - 1, Math.max(0, i | 0))]?.title || 'BIG WIN';
}

function builderCard() {
  const b = state.builder;
  const tiers = state.project.tiers || [];
  const finales = [
    ...tiers.map((t, i) => ({ value: `big${i}`, label: i === 0 ? `Big win: ${t.title}` : `Big win counting up to ${t.title}` })),
    { value: 'tumble', label: 'Tumble chain into a big win, with multipliers' },
    { value: 'freespins', label: 'Free spins feature: trigger, spins, total' },
    { value: 'wheel', label: 'Wheel of Fortune bonus' },
    { value: 'big+wheel', label: 'Big win, then the wheel' },
  ];
  if (!finales.some((f) => f.value === b.finale)) b.finale = finales[Math.min(1, finales.length - 1)].value;
  return h(
    'section',
    { class: 'group builder' },
    h('h3', null, 'Quick sequence'),
    h('p', { class: 'hint' }, 'Pick how many spins lead up to the big moment, then fine-tune each round below.'),
    rangeField({ id: 'qb-spins', label: 'Spins before the finale', value: b.spins, min: 0, max: 20, step: 1, onInput: (v) => (b.spins = v) }),
    selectField({
      id: 'qb-warm',
      label: 'Warm-up spins',
      value: b.warm,
      options: [
        { value: 'none', label: 'All no-win spins' },
        { value: 'mixed', label: 'No wins with a few small wins' },
        { value: 'tease', label: 'Small wins, then a near-miss tease' },
      ],
      onChange: (v) => (b.warm = v),
    }),
    selectField({
      id: 'qb-finale',
      label: 'Finale',
      value: b.finale,
      options: finales,
      onChange: (v) => {
        b.finale = v;
        renderSequence();
      },
    }),
    b.finale === 'freespins' ? rangeField({ id: 'qb-fs', label: 'Free spins to show', value: b.fsCount, min: 1, max: 15, step: 1, onInput: (v) => (b.fsCount = v) }) : null,
    button('Build sequence', buildSequence, { class: 'btn primary wide', id: 'qb-build' })
  );
}

function tumbleMode() {
  const P = state.project;
  return P.machine.payMode === 'anywhere' || P.machine.payMode === 'cluster' || P.spin.type === 'cascade';
}

function chainCount(k) {
  const P = state.project;
  const m = P.machine;
  if (m.payMode === 'anywhere') return m.minAnywhere + k;
  if (m.payMode === 'cluster') return m.minCluster + k;
  return Math.min(P.grid.reels, 3 + k);
}

function buildSequence() {
  const { spins, warm, finale, fsCount } = state.builder;
  const P = state.project;
  const lineWin = (o, extra = {}) => newRound(o, { lines: [Math.floor(Math.random() * Math.min(5, P.machine.maxLines))], count: chainCount(o === 'small' ? 0 : 1), ...extra });
  const rounds = [];
  for (let i = 0; i < spins; i++) {
    let o = 'none';
    if (warm === 'mixed' && i % 3 === 1) o = 'small';
    if (warm === 'tease') o = i === spins - 1 ? 'nearmiss' : i % 2 ? 'small' : 'none';
    rounds.push(o === 'small' ? lineWin('small') : newRound(o));
  }
  const top = Math.max(0, (P.tiers || []).length - 1);
  const big = (tier, extra = {}) => newRound('big', { tier, lines: [0, 3], count: Math.max(chainCount(2), Math.min(P.grid.reels, 5)), ...extra });
  if (finale.startsWith('big') && finale !== 'big+wheel') rounds.push(big(Number(finale.slice(3)) || 0));
  else if (finale === 'tumble') rounds.push(big(Math.min(1, top), { tumble: true, chain: [{ symbol: 'auto', count: chainCount(1) }, { symbol: 'auto', count: chainCount(0) }], multipliers: tumbleMode() ? [10, 25] : [] }));
  else if (finale === 'freespins') {
    rounds.push(newRound('freespins', { freeSpins: fsCount }));
    const plan = ['small', 'none', 'medium', 'small', 'none', 'medium', 'small'];
    for (let i = 0; i < fsCount; i++) {
      const last = i === fsCount - 1;
      const o = last ? 'big' : plan[i % plan.length];
      const extra = { free: true };
      if (o === 'medium' && tumbleMode()) Object.assign(extra, { multipliers: [2 + (i % 3) * 3], chain: [{ symbol: 'auto', count: chainCount(0) }] });
      if (last) rounds.push(big(0, { ...extra, multipliers: tumbleMode() ? [5, 10] : [] }));
      else rounds.push(o === 'none' ? newRound('none', extra) : lineWin(o, extra));
    }
    rounds.push(newRound('fstotal'));
  } else if (finale === 'wheel') rounds.push(newRound('wheel'));
  else if (finale === 'big+wheel') rounds.push(big(Math.min(1, top)), newRound('wheel'));
  P.rounds = rounds;
  state.sel = spins;
  changed('timeline');
  renderSequence();
  toast(`Built ${rounds.length} rounds: ${spins} warm-up spin${spins === 1 ? '' : 's'} and the finale.`);
}

function addRound(outcome) {
  const prev = state.project.rounds[state.sel];
  const r = newRound(outcome, prev?.free && outcome !== 'freespins' && outcome !== 'fstotal' ? { free: true } : {});
  state.project.rounds.splice(state.sel + 1, 0, r);
  state.sel = Math.min(state.project.rounds.length - 1, state.sel + 1);
  changed('timeline');
  renderSequence();
}

function patternLabel(p, r) {
  const n = (r.lines || []).length;
  return { lines: `${n} line${n === 1 ? '' : 's'}`, cells: 'custom cells', ways: 'ways', full: 'full screen', anywhere: 'anywhere', cluster: 'cluster' }[p] || p;
}

function describe(r) {
  const P = state.project;
  const fs = r.free ? 'Free spin · ' : '';
  if (LINE_WINS.includes(r.outcome)) {
    const s = r.symbol === 'auto' ? 'Auto symbol' : P.symbols.find((x) => x.id === r.symbol)?.name || 'Auto symbol';
    const pat = r.pattern || defaultPattern(P.machine.payMode);
    let text = `${s} ×${r.count} · ${patternLabel(pat, r)}`;
    const ctx2 = makeContext(P, state.scene?.tl.paylines || []);
    if (r.chain?.length && tumbleEnabled(ctx2, r)) text += ` · +${r.chain.length} tumble${r.chain.length === 1 ? '' : 's'}`;
    if (r.multipliers?.length) text += ` · ${r.multipliers.map((m) => `x${m}`).join(' ')}`;
    if (r.expandWild) text += ' · expanding wild';
    if (r.outcome === 'big') text = `To ${tierTitle(r.tier)} · ${text}`;
    return fs + text;
  }
  if (r.outcome === 'wheel') return `Lands on ${P.wheel.segments[r.wheelSegment]?.label ?? '?'}`;
  if (r.outcome === 'freespins') return `${r.freeSpins} free spins${r.sticky ? ' · sticky wilds' : ''}`;
  if (r.outcome === 'bonus') return 'Scatter trigger';
  if (r.outcome === 'nearmiss') return `${fs}Scatters short by one, the last one slides past`;
  if (r.outcome === 'fstotal') return 'Free spins total win';
  return `${fs}Reels spin and stop${r.extraWilds ? ` · ${r.extraWilds} wild${r.extraWilds === 1 ? '' : 's'}` : ''}`;
}

function refreshList() {
  if (!el.list) return;
  const tl = state.scene?.tl;
  const rows = state.project.rounds.map((r, i) => {
    const o = OUTCOME_BY_ID[r.outcome];
    const R = tl?.rounds[i];
    const dur = R ? `${(R.next - R.t0).toFixed(1)}s` : '';
    const act = (ic, title, fn, dis) => button('', fn, { class: 'icon-btn tiny', icon: ic, title, disabled: dis, id: `r-${ic}-${r.id}` });
    return h(
      'li',
      { class: `round${i === state.sel ? ' sel' : ''}${r.free ? ' free' : ''}` },
      h(
        'button',
        { type: 'button', class: 'round-main', id: `round-${r.id}`, onclick: () => selectRound(i, true), 'aria-current': i === state.sel ? 'true' : null },
        h('span', { class: 'round-n' }, String(i + 1).padStart(2, '0')),
        h('span', { class: 'dot', style: { '--c': o.color } }),
        h('span', { class: 'round-text' }, h('span', { class: 'round-label' }, o.list || o.label, r.free ? h('span', { class: 'fs-tag' }, 'FS') : null), h('span', { class: 'round-meta' }, describe(r))),
        h('span', { class: 'round-dur' }, dur)
      ),
      h(
        'div',
        { class: 'round-actions' },
        act('up', 'Move up', () => moveRound(i, -1), i === 0),
        act('down', 'Move down', () => moveRound(i, 1), i === state.project.rounds.length - 1),
        act('copy', 'Duplicate', () => {
          const c = { ...JSON.parse(JSON.stringify(r)), id: newRound().id, seed: Math.floor(Math.random() * 1e6) };
          state.project.rounds.splice(i + 1, 0, c);
          state.sel = i + 1;
          changed('timeline');
          renderSequence();
        }),
        act('trash', 'Delete', () => {
          state.project.rounds.splice(i, 1);
          state.sel = Math.max(0, Math.min(state.sel, state.project.rounds.length - 1));
          changed('timeline');
          renderSequence();
        })
      )
    );
  });
  clear(el.list, rows.length ? rows : h('li', { class: 'empty' }, 'No rounds yet. Build a quick sequence or add a round.'));
}

function moveRound(i, d) {
  const rs = state.project.rounds;
  const j = i + d;
  if (j < 0 || j >= rs.length) return;
  [rs[i], rs[j]] = [rs[j], rs[i]];
  state.sel = j;
  changed('timeline');
  renderSequence();
}

function lineSVG(line, rows, color) {
  const ns = 'http://www.w3.org/2000/svg';
  const reels = line.length;
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${reels * 10} ${rows * 10}`);
  svg.setAttribute('aria-hidden', 'true');
  for (let c = 0; c < reels; c++)
    for (let r = 0; r < rows; r++) {
      const d = document.createElementNS(ns, 'circle');
      d.setAttribute('cx', c * 10 + 5);
      d.setAttribute('cy', r * 10 + 5);
      d.setAttribute('r', line[c] === r ? 2.6 : 1.3);
      d.setAttribute('fill', line[c] === r ? color : 'currentColor');
      d.setAttribute('opacity', line[c] === r ? 1 : 0.35);
      svg.append(d);
    }
  const pl = document.createElementNS(ns, 'polyline');
  pl.setAttribute('points', line.map((r, c) => `${c * 10 + 5},${r * 10 + 5}`).join(' '));
  pl.setAttribute('fill', 'none');
  pl.setAttribute('stroke', color);
  pl.setAttribute('stroke-width', '1.6');
  pl.setAttribute('stroke-linejoin', 'round');
  svg.append(pl);
  return svg;
}

// Count field for a win pattern: symbols in a row, on the grid or in a cluster.
function countField(id, pattern, value, onInput) {
  const P = state.project;
  const { reels, rows } = P.grid;
  if (pattern === 'cells' || pattern === 'full') return null;
  if (pattern === 'anywhere' || pattern === 'cluster') {
    const min = pattern === 'anywhere' ? P.machine.minAnywhere : P.machine.minCluster;
    const max = Math.max(min, reels * rows - 2);
    return rangeField({ id, label: pattern === 'anywhere' ? 'Symbols on the grid' : 'Cluster size', value: Math.min(max, Math.max(min, value)), min, max, step: 1, onInput });
  }
  return rangeField({ id, label: 'Symbols in a row', value: Math.min(reels, Math.max(3, value)), min: Math.min(3, reels), max: reels, step: 1, onInput });
}

function symbolOptions(withAuto = true) {
  const P = state.project;
  return [...(withAuto ? [{ value: 'auto', label: 'Auto (picked for the win size)' }] : []), ...P.symbols.filter((s) => s.role === 'normal' || s.role === 'wild').map((s) => ({ value: s.id, label: `${s.name}${s.role !== 'normal' ? ` (${s.role})` : ''}` }))];
}

function reelChips(id, selected, onToggle) {
  const P = state.project;
  const wrap = h('div', { class: 'reel-chips', role: 'group' });
  for (let c = 0; c < P.grid.reels; c++) {
    const on = selected.includes(c);
    const b = h('button', { type: 'button', class: `chip${on ? ' on' : ''}`, id: `${id}-${c}`, 'aria-pressed': String(on) }, `Reel ${c + 1}`);
    b.addEventListener('click', () => onToggle(c));
    wrap.append(b);
  }
  return wrap;
}

function renderInspector() {
  if (!el.inspector) return;
  const P = state.project;
  const r = P.rounds[state.sel];
  if (!r) {
    clear(el.inspector);
    return;
  }
  const kind = 'timeline';
  const set = (k, rerender = false) => (v) => {
    r[k] = v;
    changed(kind);
    refreshList();
    if (rerender) renderInspector();
  };
  const reels = P.grid.reels;
  const rows = P.grid.rows;
  const parts = [];
  parts.push(
    selectField({
      id: 'ri-outcome',
      label: 'Outcome',
      value: r.outcome,
      options: OUTCOMES.map((o) => ({ value: o.id, label: o.label })),
      onChange: (v) => {
        const fresh = newRound(v);
        r.outcome = v;
        if (LINE_WINS.includes(v)) {
          r.lines = fresh.lines;
          r.count = Math.max(r.count || 0, chainCount(v === 'small' ? 0 : 1));
          r.wildAssist = fresh.wildAssist;
        }
        if (v === 'freespins' || v === 'fstotal') r.free = false;
        changed(kind);
        refreshList();
        renderInspector();
      },
    })
  );
  const ctx2 = makeContext(P, state.scene?.tl.paylines || generatePaylines(reels, rows, P.machine.maxLines));
  const cur = P.machine.currency || '';
  const dec = P.machine.decimals | 0;
  const canFree = r.outcome !== 'freespins' && r.outcome !== 'fstotal';
  if (canFree) parts.push(toggleField({ id: 'ri-free', label: 'Free spin (counts toward the free spins total)', checked: !!r.free, onChange: set('free', true), hint: r.free && !P.rounds.slice(0, state.sel).some((x) => x.outcome === 'freespins') ? 'Add a Free spins trigger round before this one to start the counter.' : null }));
  if (LINE_WINS.includes(r.outcome)) {
    const mode = P.machine.payMode;
    const base = defaultPattern(mode);
    const pattern = r.pattern || base;
    const baseLabel = { lines: 'Paylines', ways: 'Ways', anywhere: 'Anywhere', cluster: 'Cluster' }[base];
    const patOpts = [{ value: base, label: baseLabel }];
    if (mode === 'lines') patOpts.push({ value: 'ways', label: 'Ways' });
    patOpts.push({ value: 'cells', label: 'Custom' }, { value: 'full', label: 'Full screen' });
    if (r.outcome === 'big' && P.tiers?.length) {
      parts.push(
        selectField({
          id: 'ri-tier',
          label: 'Count up to',
          value: Math.min(P.tiers.length - 1, r.tier | 0),
          options: P.tiers.map((t, i) => ({ value: i, label: `${t.title} (${t.x}× bet)` })),
          onChange: (v) => set('tier')(Number(v)),
          hint: 'The overlay climbs through every tier the amount crosses. Edit tiers in Effects.',
        })
      );
    }
    parts.push(
      selectField({ id: 'ri-symbol', label: 'Winning symbol', value: r.symbol, options: symbolOptions(), onChange: set('symbol') }),
      segmented({ id: 'ri-pattern', label: 'Win pattern', value: patOpts.some((o) => o.value === pattern) ? pattern : base, options: patOpts, onChange: (v) => set('pattern', true)(v === base ? null : v) })
    );
    parts.push(countField('ri-count', pattern, r.count, set('count')));
    if (pattern === 'lines') {
      const lines = state.scene?.tl.paylines || generatePaylines(reels, rows, P.machine.maxLines);
      const wrap = h('div', { class: 'lines', role: 'group', 'aria-label': 'Winning paylines' });
      lines.forEach((line, i) => {
        const on = (r.lines || []).includes(i);
        const b = h('button', { type: 'button', class: `line-chip${on ? ' on' : ''}`, id: `ri-line-${i}`, 'aria-pressed': String(on), title: `Line ${i + 1}` }, lineSVG(line, rows, lineColor(i)), h('span', null, i + 1));
        b.addEventListener('click', () => {
          const set2 = new Set(r.lines || []);
          if (set2.has(i)) set2.delete(i);
          else set2.add(i);
          r.lines = [...set2].sort((a, c) => a - c);
          b.classList.toggle('on', set2.has(i));
          b.setAttribute('aria-pressed', String(set2.has(i)));
          changed(kind);
          refreshList();
        });
        wrap.append(b);
      });
      parts.push(h('div', { class: 'field' }, h('span', { class: 'label' }, 'Winning lines'), wrap, h('p', { class: 'hint' }, 'Lines that cross the same symbols light up too, as on a real machine.')));
    }
    if (pattern === 'cells') {
      const grid = h('div', { class: 'cells', style: { gridTemplateColumns: `repeat(${reels}, 1fr)` }, role: 'group', 'aria-label': 'Winning cells' });
      const has = (c, rr) => (r.cells || []).some(([a, b]) => a === c && b === rr);
      for (let rr = 0; rr < rows; rr++)
        for (let c = 0; c < reels; c++) {
          const b = h('button', { type: 'button', class: `cell${has(c, rr) ? ' on' : ''}`, id: `ri-cell-${c}-${rr}`, 'aria-pressed': String(has(c, rr)), title: `Reel ${c + 1}, row ${rr + 1}` });
          b.addEventListener('click', () => {
            const list = (r.cells || []).filter(([a, bb]) => !(a === c && bb === rr));
            if (!has(c, rr)) list.push([c, rr]);
            r.cells = list;
            b.classList.toggle('on');
            changed(kind);
          });
          grid.append(b);
        }
      parts.push(h('div', { class: 'field' }, h('span', { class: 'label' }, 'Winning cells'), grid, h('p', { class: 'hint' }, 'Tap cells to paint the win pattern.')));
    }
    parts.push(
      textField({
        id: 'ri-amount',
        label: 'Win amount',
        type: 'number',
        value: r.amount ?? '',
        placeholder: `Auto: ${cur}${autoAmount(ctx2, P, r).toFixed(dec)}`,
        onChange: set('amount'),
        hint: r.multipliers?.length ? 'The total after multipliers.' : null,
      })
    );

    // Tumbles (cascades) with a chain of follow-up wins.
    const tumbles = tumbleEnabled(ctx2, r) && pattern !== 'full';
    parts.push(
      h('div', { class: 'divider' }),
      segmented({
        id: 'ri-tumble',
        label: 'Tumble after the win',
        value: r.tumble === true ? 'on' : r.tumble === false ? 'off' : 'auto',
        options: [
          { value: 'auto', label: tumbleMode() ? 'Auto (on)' : 'Auto (off)', hint: 'On for pay anywhere, clusters and cascade spins' },
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ],
        onChange: (v) => set('tumble', true)(v === 'on' ? true : v === 'off' ? false : null),
      })
    );
    if (r.expandWild) parts.push(h('p', { class: 'hint' }, 'Expanding wilds hold the reels still, so this round does not tumble.'));
    if (tumbles) {
      const list = h('div', { class: 'chain' });
      (r.chain || []).forEach((st, k) => {
        const stPattern = st.pattern || base;
        list.append(
          h(
            'div',
            { class: 'chain-step' },
            h('div', { class: 'chain-head' }, h('strong', null, `Tumble ${k + 1}`), button('', () => {
              r.chain.splice(k, 1);
              changed(kind);
              refreshList();
              renderInspector();
            }, { class: 'icon-btn tiny', icon: 'x', title: 'Remove this tumble win', id: `ri-chain-del-${k}` })),
            selectField({ id: `ri-chain-sym-${k}`, label: 'Symbol', value: st.symbol || 'auto', options: symbolOptions(), onChange: (v) => { st.symbol = v; changed(kind); } }),
            countField(`ri-chain-n-${k}`, stPattern, st.count || chainCount(0), (v) => {
              st.count = v;
              changed(kind);
              refreshList();
            })
          )
        );
      });
      parts.push(
        h(
          'div',
          { class: 'field' },
          h('span', { class: 'label' }, 'Tumble chain'),
          h('p', { class: 'hint' }, 'The winners pop, the rest fall, new symbols drop in and pay again. Each step is one more win; after the last one the refill pays nothing.'),
          list,
          (r.chain || []).length < 6
            ? button('Add a tumble win', () => {
                r.chain = [...(r.chain || []), { symbol: 'auto', count: chainCount((r.chain || []).length % 2) }];
                changed(kind);
                refreshList();
                renderInspector();
              }, { class: 'btn small', icon: 'plus', id: 'ri-chain-add' })
            : null
        )
      );
    }

    // Multipliers collected at the end of the round.
    const mults = h('div', { class: 'mults' });
    (r.multipliers || []).forEach((m, k) =>
      mults.append(
        button(`x${m}`, () => {
          r.multipliers.splice(k, 1);
          changed(kind);
          refreshList();
          renderInspector();
        }, { class: 'chip on', icon: 'x', id: `ri-mult-${k}`, title: 'Remove this multiplier' })
      )
    );
    const multSel = h('select', { id: 'ri-mult-value', 'aria-label': 'Multiplier value' }, MULT_VALUES.map((v) => h('option', { value: v }, `x${v}`)));
    parts.push(
      h(
        'div',
        { class: 'field' },
        h('span', { class: 'label' }, 'Multipliers'),
        mults,
        (r.multipliers || []).length < 8
          ? h('div', { class: 'add-row' }, multSel, button('Add', () => {
              r.multipliers = [...(r.multipliers || []), Number(multSel.value)];
              changed(kind);
              refreshList();
              renderInspector();
            }, { class: 'btn small', icon: 'plus', id: 'ri-mult-add' }))
          : null,
        h('p', { class: 'hint' }, 'Multiplier symbols land with the win, then fly into the total: the win is multiplied by their sum.')
      )
    );

    // Wilds.
    parts.push(
      h('div', { class: 'divider' }),
      toggleField({ id: 'ri-wild', label: 'Include a Wild in the win', checked: r.wildAssist, onChange: set('wildAssist') })
    );
    if (pattern === 'lines' || pattern === 'ways' || pattern === 'cells') parts.push(toggleField({ id: 'ri-expand', label: 'Expanding wild (fills its reel)', checked: !!r.expandWild, onChange: set('expandWild', true) }));
  }
  if (r.outcome !== 'wheel' && r.outcome !== 'fstotal') {
    parts.push(rangeField({ id: 'ri-extra-wilds', label: 'Extra wilds on the grid', value: r.extraWilds || 0, min: 0, max: Math.min(8, reels * rows - 3), step: 1, onInput: set('extraWilds') }));
    if (r.free) parts.push(toggleField({ id: 'ri-sticky', label: 'Wilds stick for the rest of the free spins', checked: !!r.sticky, onChange: set('sticky') }));
  }
  if (SCATTER_WINS.includes(r.outcome)) {
    const trig = P.machine.scatterTrigger || 3;
    parts.push(rangeField({ id: 'ri-scatters', label: 'Scatters landing', value: Math.max(trig, r.scatterCount || trig), min: Math.min(trig, reels), max: Math.max(trig, P.machine.payMode === 'lines' || P.machine.payMode === 'ways' ? reels : reels * rows - 4), step: 1, onInput: set('scatterCount') }));
  }
  if (r.outcome === 'freespins') {
    parts.push(
      rangeField({ id: 'ri-fs', label: 'Free spins awarded', value: r.freeSpins || 10, min: 1, max: 100, step: 1, onInput: set('freeSpins') }),
      toggleField({ id: 'ri-fs-sticky', label: 'Sticky wilds in these free spins', checked: !!r.sticky, onChange: set('sticky') }),
      h('p', { class: 'hint' }, 'The rounds after this one that are marked Free spin count up the free spins total. End the block with a Free spins total round.')
    );
  }
  if (r.outcome === 'fstotal') parts.push(textField({ id: 'ri-total-amount', label: 'Total shown', type: 'number', value: r.amount ?? '', placeholder: 'Sum of the free spins above', onChange: set('amount') }));
  if (r.outcome === 'bonus') parts.push(textField({ id: 'ri-bonus-amount', label: 'Bonus amount (optional)', type: 'number', value: r.amount ?? '', placeholder: 'No amount', onChange: set('amount') }));
  if (r.outcome === 'wheel') {
    parts.push(
      selectField({
        id: 'ri-seg',
        label: 'Wheel lands on',
        value: r.wheelSegment,
        options: P.wheel.segments.map((s, i) => ({ value: i, label: `${i + 1}. ${s.label} (${cur}${s.value})` })),
        onChange: (v) => {
          r.wheelSegment = Number(v);
          changed(kind);
          refreshList();
        },
      }),
      segmented({
        id: 'ri-landing',
        label: 'Landing',
        value: r.wheelLanding || P.wheel.landing,
        options: [
          { value: 'center', label: 'Centered' },
          { value: 'random', label: 'Natural' },
          { value: 'tease', label: 'Edge tease', hint: 'Creeps right up to the boundary' },
        ],
        onChange: set('wheelLanding'),
      }),
      textField({ id: 'ri-wheel-amount', label: 'Prize amount', type: 'number', value: r.amount ?? '', placeholder: `From segment: ${cur}${autoAmount(ctx2, P, r).toFixed(dec)}`, onChange: set('amount') })
    );
  }
  if (r.outcome === 'nearmiss') {
    parts.push(
      selectField({
        id: 'ri-nm-reel',
        label: 'Reel that misses',
        value: r.nearMissReel ?? 'auto',
        options: [{ value: 'auto', label: 'The last reel to stop' }, ...Array.from({ length: reels }, (_, k) => ({ value: k, label: `Reel ${k + 1}` }))],
        onChange: (v) => set('nearMissReel')(v === 'auto' ? null : Number(v)),
      }),
      segmented({
        id: 'ri-nm-pos',
        label: 'The missing scatter',
        value: r.nearMissPosition || 'below',
        options: [
          { value: 'below', label: 'Slides past' },
          { value: 'above', label: 'Peeks in on the bounce' },
        ],
        onChange: set('nearMissPosition'),
      })
    );
  }

  // Spin timing and order for this round.
  const useDefault = r.midDuration == null || r.midDuration === '';
  parts.push(
    h('div', { class: 'divider' }),
    toggleField({
      id: 'ri-mid-default',
      label: 'Use the default spin length',
      checked: useDefault,
      onChange: (v) => {
        r.midDuration = v ? null : P.spin.midDuration;
        changed(kind);
        renderInspector();
      },
    })
  );
  if (!useDefault) parts.push(rangeField({ id: 'ri-mid', label: 'Spin length (mid phase)', unit: 's', value: r.midDuration, min: 0, max: 6, step: 0.05, onInput: set('midDuration') }));
  const orderName = ORDERS.find((o) => o.id === (P.spin.stopOrder || 'ltr'))?.label || 'Left to right';
  parts.push(
    rangeField({ id: 'ri-hold', label: 'Pause after this round', unit: 's', value: r.hold || 0, min: 0, max: 4, step: 0.05, onInput: set('hold') }),
    selectField({
      id: 'ri-stop-order',
      label: 'Stop order',
      value: r.stopOrder || 'default',
      options: [{ value: 'default', label: `Project default (${orderName})` }, ...ORDERS.map((o) => ({ value: o.id, label: o.id === 'custom' ? 'Custom (set in Spin)' : o.label }))],
      onChange: (v) => set('stopOrder')(v === 'default' ? null : v),
    })
  );
  const manual = Array.isArray(r.antic);
  parts.push(
    segmented({
      id: 'ri-antic',
      label: 'Anticipation',
      value: manual ? 'pick' : 'auto',
      options: [
        { value: 'auto', label: 'Auto', hint: 'Scatter rounds tease the reels after the trigger is in reach' },
        { value: 'pick', label: 'Pick reels' },
      ],
      onChange: (v) => set('antic', true)(v === 'pick' ? [] : 'auto'),
    })
  );
  if (manual) {
    parts.push(
      reelChips('ri-antic-reel', r.antic, (c) => {
        r.antic = r.antic.includes(c) ? r.antic.filter((x) => x !== c) : [...r.antic, c].sort((a, b) => a - b);
        changed(kind);
        renderInspector();
      }),
      h('p', { class: 'hint' }, r.antic.length ? 'These reels slow down with the glow, in stop order. Set the stop order so the teased reel lands last.' : 'No reel is teased in this round.')
    );
  } else {
    parts.push(toggleField({ id: 'ri-tease', label: 'Also tease the last reel to stop', checked: !!r.tease, onChange: set('tease') }));
  }
  parts.push(
    h(
      'div',
      { class: 'row' },
      button('New symbols', () => {
        r.seed = Math.floor(Math.random() * 1e6);
        changed(kind);
      }, { class: 'btn small', icon: 'dice', id: 'ri-reroll', title: 'Re-roll the filler symbols for this round' }),
      button('Preview this round', () => {
        state.solo = true;
        renderTransport();
        selectRound(state.sel, true);
        if (!state.playing) togglePlay();
      }, { class: 'btn small', icon: 'eye', id: 'ri-preview' })
    )
  );
  const o = OUTCOME_BY_ID[r.outcome];
  clear(el.inspector, h('div', { class: 'inspector-head', style: { '--c': o.color } }, h('span', { class: 'dot' }), h('h2', null, `Round ${state.sel + 1}`), h('span', { class: 'muted' }, o.label)), parts);
}

// ---------- settings (left panel) ----------

const TABS = [
  ['machine', 'Machine'],
  ['assets', 'Assets'],
  ['spin', 'Spin'],
  ['effects', 'Effects'],
  ['wheel', 'Wheel'],
  ['sound', 'Sound'],
  ['export', 'Export'],
];

function renderTabs() {
  clear(
    el.tabs,
    TABS.map(([k, label]) =>
      h('button', {
        type: 'button',
        role: 'tab',
        id: `tab-${k}`,
        class: state.tab === k ? 'on' : '',
        'aria-selected': String(state.tab === k),
        'aria-controls': 'settings-panel',
        onclick: () => {
          state.tab = k;
          renderTabs();
          renderPanel();
        },
      }, label)
    )
  );
}

function renderPanel() {
  const fn = { assets: panelAssets, machine: panelMachine, spin: panelSpin, effects: panelEffects, wheel: panelWheel, sound: panelSound, export: panelExport }[state.tab];
  clear(el.panel, fn());
  if (state.tab === 'spin') drawMotionGraph();
  if (state.tab === 'assets') refreshThumbs();
}

function num(obj, key, kind = 'timeline', after) {
  return (v) => {
    obj[key] = v;
    changed(kind);
    after?.(v);
  };
}

// A button that needs a second click within a few seconds.
function confirmButton(label, armedLabel, onConfirm, opts) {
  let armed = false;
  const b = button(label, () => {
    if (!armed) {
      armed = true;
      b.querySelector('span').textContent = armedLabel;
      setTimeout(() => {
        armed = false;
        if (b.isConnected) b.querySelector('span').textContent = label;
      }, 3500);
      return;
    }
    onConfirm();
  }, opts);
  return b;
}

function loadProject(p, msg) {
  state.project = p;
  state.sel = 0;
  state.t = 0;
  changed('all');
  renderAll();
  toast(msg);
}

function panelMachine() {
  const P = state.project;
  const fmt = `${P.canvas.width}x${P.canvas.height}`;
  let preset = PRESETS[0].id;
  const pm = P.machine.payMode;
  return [
    section(
      'Start from a preset',
      selectField({ id: 'm-preset', value: preset, options: PRESETS.map((p) => ({ value: p.id, label: p.label })), onChange: (v) => (preset = v) }),
      confirmButton('Load preset', 'Click again to replace this project', () => {
        const p = PRESETS.find((x) => x.id === preset);
        loadProject(p.make(), `Loaded ${p.label}.`);
      }, { class: 'btn small', id: 'm-preset-load' }),
      h('p', { class: 'hint' }, 'Replaces the whole project, including uploaded symbols. Save it from Export first if you want to keep it.')
    ),
    section(
      'Output',
      textField({ id: 'm-name', label: 'Project name', value: P.name, onChange: (v) => (P.name = v) && save() }),
      selectField({
        id: 'm-format',
        label: 'Canvas',
        value: FORMATS.some(([k]) => k === fmt) ? fmt : '1920x1080',
        options: FORMATS.map(([value, label]) => ({ value, label })),
        onChange: (v) => {
          const [w, hh] = v.split('x').map(Number);
          P.canvas.width = w;
          P.canvas.height = hh;
          changed('all');
        },
      }),
      segmented({ id: 'm-fps', label: 'Frame rate', value: P.canvas.fps, options: [24, 25, 30, 50, 60].map((f) => ({ value: f, label: `${f}` })), onChange: (v) => num(P.canvas, 'fps', 'timeline')(Number(v)) })
    ),
    section(
      'Reels',
      rangeField({ id: 'm-reels', label: 'Reels', value: P.grid.reels, min: 3, max: 8, step: 1, onInput: num(P.grid, 'reels', 'all', () => renderInspector()) }),
      rangeField({ id: 'm-rows', label: 'Rows', value: P.grid.rows, min: 1, max: 7, step: 1, onInput: num(P.grid, 'rows', 'all', () => renderInspector()) }),
      rangeField({ id: 'm-aspect', label: 'Cell height', unit: '× width', value: P.grid.cellAspect, min: 0.6, max: 1.4, step: 0.02, onInput: num(P.grid, 'cellAspect', 'all') }),
      rangeField({ id: 'm-peek', label: 'Partial symbols above and below', value: P.grid.peek, min: 0, max: 0.5, step: 0.01, onInput: num(P.grid, 'peek', 'all') }),
      rangeField({ id: 'm-curve', label: 'Reel curvature', value: P.grid.curvature, min: 0, max: 1, step: 0.01, onInput: num(P.grid, 'curvature', 'all'), hint: 'Bends the strip like a drum. Preview and MP4 only; the After Effects reels stay flat.' })
    ),
    section(
      'How it pays',
      segmented({
        id: 'm-pay',
        label: 'Pay mode',
        value: pm,
        options: PAY_MODES.map((m) => ({ value: m.id, label: m.label, hint: m.hint })),
        onChange: (v) => {
          P.machine.payMode = v;
          for (const r of P.rounds) if (r.pattern && r.pattern !== 'cells' && r.pattern !== 'full') r.pattern = null;
          changed('timeline');
          renderPanel();
          renderInspector();
        },
      }),
      h('p', { class: 'hint' }, PAY_MODES.find((m) => m.id === pm)?.hint || ''),
      pm === 'lines' ? rangeField({ id: 'm-lines', label: 'Paylines', value: P.machine.maxLines, min: 1, max: 25, step: 1, onInput: num(P.machine, 'maxLines', 'timeline', () => renderInspector()), hint: 'Generated for the grid: straight lines, V shapes, zigzags.' }) : null,
      pm === 'anywhere' ? rangeField({ id: 'm-min-any', label: 'Symbols needed to pay', value: P.machine.minAnywhere, min: 4, max: 16, step: 1, onInput: num(P.machine, 'minAnywhere', 'timeline', () => renderInspector()) }) : null,
      pm === 'cluster' ? rangeField({ id: 'm-min-cluster', label: 'Smallest paying cluster', value: P.machine.minCluster, min: 3, max: 12, step: 1, onInput: num(P.machine, 'minCluster', 'timeline', () => renderInspector()) }) : null,
      rangeField({ id: 'm-scatter', label: 'Scatters to trigger a feature', value: P.machine.scatterTrigger, min: 2, max: 6, step: 1, onInput: num(P.machine, 'scatterTrigger', 'timeline', () => renderInspector()) })
    ),
    section(
      'Look',
      selectField({ id: 'm-theme', label: 'Theme', value: P.machine.theme, options: Object.entries(THEMES).map(([k, t]) => ({ value: k, label: t.name })), onChange: (v) => num(P.machine, 'theme', 'all')(v) }),
      toggleField({ id: 'm-marquee', label: 'Marquee bulbs on the frame', checked: P.machine.marquee, onChange: num(P.machine, 'marquee', 'timeline') }),
      toggleField({ id: 'm-hud', label: 'Win meter under the reels', checked: P.machine.showHud, onChange: num(P.machine, 'showHud', 'all') })
    ),
    section(
      'Money',
      h(
        'div',
        { class: 'row3' },
        textField({ id: 'm-bet', label: 'Bet', type: 'number', value: P.machine.bet, onChange: (v) => num(P.machine, 'bet', 'timeline', () => renderInspector())(v || 1) }),
        selectField({ id: 'm-cur', label: 'Currency', value: P.machine.currency, options: ['$', '€', '£', '¥', ''].map((c) => ({ value: c, label: c || 'None' })), onChange: num(P.machine, 'currency', 'timeline') }),
        selectField({ id: 'm-dec', label: 'Decimals', value: P.machine.decimals, options: [{ value: 0, label: '0' }, { value: 2, label: '2' }], onChange: (v) => num(P.machine, 'decimals', 'timeline')(Number(v)) })
      )
    ),
    section(
      'Randomness',
      h('p', { class: 'hint' }, 'Filler symbols come from a seed, so the animation is identical every time you render it.'),
      button('Shuffle all filler symbols', () => {
        P.seed = Math.floor(Math.random() * 1e6);
        changed('timeline');
      }, { class: 'btn small', icon: 'dice', id: 'm-seed' })
    ),
  ];
}

function panelAssets() {
  const P = state.project;
  el.thumbs = [];
  const tiles = h('div', { class: 'symbols' });
  P.symbols.forEach((s, i) => tiles.append(symbolTile(s, i)));
  const useSet = (set, name) =>
    button(name, () => {
      P.symbols = set.map((s, i) => ({ id: `${set === CANDY_SYMBOLS ? 'c' : 's'}${i}`, src: null, winAnim: null, ...s }));
      P.rounds.forEach((r) => (r.symbol = 'auto'));
      changed('all');
      renderPanel();
      renderInspector();
    }, { class: 'btn ghost small', id: `a-set-${set === CANDY_SYMBOLS ? 'candy' : 'classic'}` });
  return [
    section(
      'Symbols',
      h('p', { class: 'hint' }, 'PNGs with transparent backgrounds work best; each symbol is fitted to its cell. Give one symbol each the Wild, Scatter and Multiplier roles. Weight sets how often it shows up as filler. In After Effects every symbol becomes its own comp.'),
      tiles,
      h('div', { class: 'row' }, button('Add symbol images', addSymbols, { class: 'btn', icon: 'upload', id: 'a-add' }), useSet(BUILTIN_SYMBOLS, 'Classic set'), useSet(CANDY_SYMBOLS, 'Candy set'))
    ),
    section(
      'Scene art',
      assetRow('Background', 'background', 'Full-screen image behind the machine.'),
      assetRow('Frame overlay', 'frame', 'PNG drawn over the reels. Leave the window transparent.'),
      assetRow('Logo', 'logo', 'Replaces the title text above the reels.'),
      toggleField({ id: 'a-builtin', label: 'Draw the built-in frame', checked: P.machine.builtinFrame !== false, onChange: num(P.machine, 'builtinFrame', 'all') }),
      textField({ id: 'a-title', label: 'Title above the reels', value: P.machine.title, onChange: num(P.machine, 'title', 'all') })
    ),
  ];
}

function thumbCanvas() {
  const c = h('canvas', { class: 'thumb', width: 96, height: 96 });
  el.thumbs.push(c);
  return c;
}

function refreshThumbs() {
  if (!el.thumbs || !state.images) return;
  el.thumbs.forEach((c, i) => {
    const img = state.images.symbols[i];
    const g = c.getContext('2d');
    g.clearRect(0, 0, 96, 96);
    if (!img) return;
    const w = img.naturalWidth || img.width;
    const hh = img.naturalHeight || img.height;
    const s = Math.min(84 / w, 84 / hh);
    g.drawImage(img, (96 - w * s) / 2, (96 - hh * s) / 2, w * s, hh * s);
  });
}

const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

async function uploadWinAnim(s) {
  const files = await pickFiles('image/png,image/webp,image/jpeg', true);
  if (!files.length) return;
  if (files.length > 1) {
    files.sort((a, b) => byName.compare(a.name, b.name));
    const srcs = [];
    for (const f of files.slice(0, 240)) srcs.push(await readFileAsDataURL(f));
    s.winAnim = { kind: 'frames', srcs, fps: 24 };
    toast(`${s.name}: ${srcs.length}-frame win animation.`);
  } else {
    const src = await readFileAsDataURL(files[0]);
    const img = await loadImage(src).catch(() => null);
    const w = img?.naturalWidth || 1;
    const hh = img?.naturalHeight || 1;
    const cols = Math.max(1, Math.round(w / hh));
    s.winAnim = { kind: 'sheet', src, cols, rows: 1, count: cols, fps: 24 };
    toast(`${s.name}: sprite sheet read as ${cols} frame${cols === 1 ? '' : 's'} in one row. Adjust the grid if it is laid out differently.`, 'info', 5000);
  }
  changed('all');
  renderPanel();
}

function winAnimControls(s) {
  const a = s.winAnim;
  if (!a) return h('div', { class: 'sym-anim' }, button('Win animation', () => uploadWinAnim(s), { class: 'btn small ghost', icon: 'upload', id: `sym-anim-${s.id}`, title: 'Upload a PNG sequence (several files) or one sprite sheet' }));
  const edit = (k, min, max) =>
    h('label', { class: 'mini', for: `sym-anim-${k}-${s.id}` }, h('span', null, k === 'fps' ? 'fps' : k), h('input', { type: 'number', id: `sym-anim-${k}-${s.id}`, min, max, step: 1, value: a[k], onchange: (e) => {
      a[k] = Math.min(max, Math.max(min, Number(e.target.value) || min));
      e.target.value = a[k];
      if (a.kind === 'sheet' && (k === 'cols' || k === 'rows')) a.count = a.cols * a.rows;
      animCache.delete(a);
      changed('all');
      if (k === 'cols' || k === 'rows') renderPanel();
    } }));
  return h(
    'div',
    { class: 'sym-anim on' },
    h('span', { class: 'sym-anim-what' }, a.kind === 'frames' ? `${a.srcs.length} frames` : 'Sprite sheet'),
    a.kind === 'sheet' ? [edit('cols', 1, 32), edit('rows', 1, 32), edit('count', 1, 1024)] : null,
    edit('fps', 1, 60),
    button('', () => {
      s.winAnim = null;
      changed('all');
      renderPanel();
    }, { class: 'icon-btn tiny', icon: 'x', title: 'Remove the win animation', id: `sym-anim-del-${s.id}` })
  );
}

function symbolTile(s, i) {
  const P = state.project;
  return h(
    'div',
    { class: 'sym' },
    thumbCanvas(),
    h(
      'div',
      { class: 'sym-fields' },
      h('input', { type: 'text', id: `sym-name-${s.id}`, value: s.name, 'aria-label': 'Symbol name', oninput: (e) => { s.name = e.target.value; save(); refreshList(); } }),
      h(
        'div',
        { class: 'sym-row' },
        h('select', { id: `sym-role-${s.id}`, 'aria-label': 'Role', onchange: (e) => { s.role = e.target.value; changed('all'); renderInspector(); } }, ROLES.map(([r, l]) => h('option', { value: r, selected: s.role === r }, l))),
        h('select', { id: `sym-tier-${s.id}`, 'aria-label': 'Value', onchange: (e) => { s.tier = e.target.value; changed('timeline'); } }, [['low', 'Low pay'], ['high', 'High pay']].map(([v, l]) => h('option', { value: v, selected: s.tier === v }, l)))
      ),
      h('label', { class: 'sym-weight', for: `sym-w-${s.id}` }, h('span', null, 'Weight'), h('input', { type: 'range', id: `sym-w-${s.id}`, min: 0, max: 20, step: 1, value: s.weight, oninput: (e) => { s.weight = Number(e.target.value); changed('timeline'); } })),
      winAnimControls(s)
    ),
    h(
      'div',
      { class: 'sym-actions' },
      button('', async () => {
        const [f] = await pickFiles('image/*');
        if (!f) return;
        s.src = await readFileAsDataURL(f);
        changed('all');
      }, { class: 'icon-btn tiny', icon: 'upload', title: 'Replace image', id: `sym-up-${s.id}` }),
      button('', () => {
        if (P.symbols.length <= 3) {
          toast('Keep at least three symbols.', 'warn');
          return;
        }
        P.symbols.splice(i, 1);
        P.rounds.forEach((r) => {
          if (r.symbol === s.id) r.symbol = 'auto';
        });
        changed('all');
        renderPanel();
        renderInspector();
      }, { class: 'icon-btn tiny', icon: 'x', title: 'Remove symbol', id: `sym-del-${s.id}` })
    )
  );
}

async function addSymbols() {
  const files = await pickFiles('image/png,image/webp,image/jpeg,image/svg+xml', true);
  if (!files.length) return;
  for (const f of files) {
    state.project.symbols.push({ id: `u${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, name: f.name.replace(/\.[^.]+$/, '').slice(0, 24), role: 'normal', tier: 'low', weight: 8, src: await readFileAsDataURL(f), winAnim: null });
  }
  changed('all');
  renderPanel();
  renderInspector();
  toast(`Added ${files.length} symbol${files.length === 1 ? '' : 's'}.`);
}

function assetRow(label, key, hint) {
  const P = state.project;
  const has = !!P.assets[key];
  return h(
    'div',
    { class: 'asset-row' },
    h('div', { class: 'asset-thumb' }, has ? h('img', { src: P.assets[key], alt: '' }) : h('span', null, 'Built-in')),
    h('div', { class: 'asset-text' }, h('strong', null, label), h('span', { class: 'hint' }, hint)),
    h(
      'div',
      { class: 'asset-actions' },
      button(has ? 'Replace' : 'Upload', async () => {
        const [f] = await pickFiles('image/*');
        if (!f) return;
        P.assets[key] = await readFileAsDataURL(f);
        changed('all');
        renderPanel();
      }, { class: 'btn small', id: `asset-up-${key}` }),
      has
        ? button('Clear', () => {
            P.assets[key] = null;
            changed('all');
            renderPanel();
          }, { class: 'btn small ghost', id: `asset-clear-${key}` })
        : null
    )
  );
}

// The full order (custom picks first, then the rest) as chips; tapping a
// chip moves that reel one place earlier.
function orderPicker(id, key) {
  const sp = state.project.spin;
  const n = state.project.grid.reels;
  const order = orderList('custom', n, sp[key], null);
  const wrap = h('ol', { class: 'order-chips', id });
  order.forEach((c, i) => {
    wrap.append(
      h(
        'li',
        null,
        h('button', {
          type: 'button',
          class: 'chip',
          id: `${id}-${c}`,
          title: i ? 'Move one place earlier' : 'Already first',
          disabled: i === 0,
          onclick: () => {
            const o = order.slice();
            [o[i - 1], o[i]] = [o[i], o[i - 1]];
            sp[key] = o;
            changed('timeline');
            renderPanel();
          },
        }, h('span', { class: 'ord' }, i + 1), `Reel ${c + 1}`)
      )
    );
  });
  return h('div', { class: 'field' }, wrap, h('p', { class: 'hint' }, 'Tap a reel to move it one place earlier.'));
}

function panelSpin() {
  const P = state.project;
  const sp = P.spin;
  const typeCards = h('div', { class: 'types', role: 'radiogroup', 'aria-label': 'Spin type' });
  SPIN_TYPES.forEach((t) => {
    const b = h('button', { type: 'button', class: `type${sp.type === t.id ? ' on' : ''}`, id: `spin-type-${t.id}`, role: 'radio', 'aria-checked': String(sp.type === t.id) }, h('strong', null, t.label), h('span', null, t.hint));
    b.addEventListener('click', () => {
      sp.type = t.id;
      Object.assign(sp, SPIN_PRESETS[t.id] || {});
      changed('all');
      renderPanel();
      renderInspector();
    });
    typeCards.append(b);
  });
  el.graph = h('canvas', { class: 'graph', id: 'motion-graph', width: 640, height: 220, 'aria-label': 'Reel speed over time for the selected round' });
  const orderOpts = ORDERS.map((o) => ({ value: o.id, label: o.label }));
  const delays = h('div', { class: 'delays' }, h('div', { class: 'delay head' }, h('span', null, 'Reel'), h('span', null, 'Start +s'), h('span', null, 'Stop +s')));
  for (let c = 0; c < P.grid.reels; c++) {
    const d = (sp.reelDelay[c] = sp.reelDelay[c] || { start: 0, stop: 0 });
    const inp = (k) =>
      h('input', { type: 'number', id: `spin-delay-${k}-${c}`, step: 0.05, min: -0.5, max: 3, value: d[k] || 0, 'aria-label': `Reel ${c + 1} ${k} delay`, onchange: (e) => {
        d[k] = Math.min(3, Math.max(-0.5, Number(e.target.value) || 0));
        e.target.value = d[k];
        changed('timeline');
      } });
    delays.append(h('div', { class: 'delay' }, h('span', { class: 'seg-n' }, c + 1), inp('start'), inp('stop')));
  }
  return [
    section('Spin type', typeCards, segmented({ id: 'spin-dir', label: 'Direction', value: sp.direction, options: [{ value: 'down', label: 'Spin down' }, { value: 'up', label: 'Spin up' }], onChange: num(sp, 'direction') })),
    section(
      'Reel order',
      selectField({ id: 'spin-start-order', label: 'Start order', value: sp.startOrder || 'ltr', options: orderOpts, onChange: (v) => { sp.startOrder = v; changed('timeline'); renderPanel(); } }),
      sp.startOrder === 'custom' ? orderPicker('spin-custom-start', 'customStart') : null,
      selectField({ id: 'spin-stop-order', label: 'Stop order', value: sp.stopOrder || 'ltr', options: orderOpts, onChange: (v) => { sp.stopOrder = v; changed('timeline'); renderPanel(); renderInspector(); } }),
      sp.stopOrder === 'custom' ? orderPicker('spin-custom-stop', 'customStop') : null,
      h('p', { class: 'hint' }, 'The anticipation tease always goes to the reels that stop last, so pick the stop order to choose the teased reel. Each round can override it.'),
      sp.type === 'cells' ? selectField({ id: 'spin-cell-order', label: 'Cell order', value: sp.cellOrder || 'columns', options: CELL_ORDERS.map((o) => ({ value: o.id, label: o.label })), onChange: num(sp, 'cellOrder') }) : null
    ),
    section('Motion curve', h('p', { class: 'hint' }, 'Reel speed in the selected round. Start, mid and end phases are shaded for the first reel to stop.'), el.graph),
    section(
      'Start',
      segmented({ id: 'spin-start', label: 'Style', value: sp.startStyle, options: [{ value: 'windup', label: 'Wind-up' }, { value: 'ease', label: 'Ease in' }, { value: 'instant', label: 'Instant' }], onChange: num(sp, 'startStyle') }),
      rangeField({ id: 'spin-start-d', label: 'Duration', unit: 's', value: sp.startDuration, min: 0.05, max: 1.2, step: 0.01, onInput: num(sp, 'startDuration') }),
      rangeField({ id: 'spin-windup', label: 'Wind-up pull back', unit: 'symbols', value: sp.windup, min: 0, max: 1, step: 0.01, onInput: num(sp, 'windup') })
    ),
    section(
      'Mid',
      rangeField({ id: 'spin-mid', label: 'Spin length', unit: 's', value: sp.midDuration, min: 0, max: 5, step: 0.05, onInput: num(sp, 'midDuration') }),
      rangeField({ id: 'spin-speed', label: 'Top speed', unit: 'symbols/s', value: sp.speed, min: 6, max: 60, step: 0.5, onInput: num(sp, 'speed') }),
      rangeField({ id: 'spin-blur', label: 'Motion blur', value: sp.blur, min: 0, max: 1, step: 0.01, onInput: num(sp, 'blur') })
    ),
    section(
      'End',
      segmented({ id: 'spin-end', label: 'Stop style', value: sp.endStyle, options: [{ value: 'bounce', label: 'Bounce' }, { value: 'elastic', label: 'Elastic' }, { value: 'hard', label: 'Hard stop' }, { value: 'soft', label: 'Soft' }], onChange: num(sp, 'endStyle') }),
      rangeField({ id: 'spin-end-d', label: 'Duration', unit: 's', value: sp.endDuration, min: 0.12, max: 1.4, step: 0.01, onInput: num(sp, 'endDuration') }),
      rangeField({ id: 'spin-over', label: 'Overshoot', unit: 'symbols', value: sp.overshoot, min: 0, max: 0.8, step: 0.01, onInput: num(sp, 'overshoot') })
    ),
    section(
      'Reel timing',
      rangeField({ id: 'spin-ss', label: 'Start stagger', unit: 's', value: sp.startStagger, min: 0, max: 0.5, step: 0.01, onInput: num(sp, 'startStagger') }),
      rangeField({ id: 'spin-st', label: 'Stop stagger', unit: 's', value: sp.stopStagger, min: 0, max: 0.8, step: 0.01, onInput: num(sp, 'stopStagger') }),
      rangeField({ id: 'spin-ant', label: 'Anticipation extra time', unit: 's', value: sp.anticipation, min: 0, max: 4, step: 0.05, onInput: num(sp, 'anticipation') }),
      rangeField({ id: 'spin-ant-v', label: 'Anticipation crawl speed', unit: 'symbols/s', value: sp.anticipationSpeed, min: 2, max: 20, step: 0.5, onInput: num(sp, 'anticipationSpeed') }),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Extra delay per reel'), delays, h('p', { class: 'hint' }, 'Added on top of the stagger: hold one reel back, or make it start late.'))
    ),
  ];
}

function drawMotionGraph() {
  const c = el.graph;
  if (!c || !state.scene || !c.isConnected) return;
  const { tl, project } = state.scene;
  const g = c.getContext('2d');
  const W = c.width;
  const H = c.height;
  g.clearRect(0, 0, W, H);
  const R = tl.rounds[state.sel];
  const css = getComputedStyle(document.documentElement);
  const muted = css.getPropertyValue('--muted').trim() || '#999';
  const line = css.getPropertyValue('--line').trim() || '#333';
  g.font = '600 26px "Instrument Sans", system-ui, sans-serif';
  if (!R || tl.cascade || R.noSpin) {
    g.fillStyle = muted;
    g.fillText(tl.cascade ? 'Cascade drops have no reel speed curve.' : R ? 'This round does not spin.' : 'Select a round to see its curve.', 16, H / 2);
    return;
  }
  // Per-cell spins: plot the top cell of each reel.
  const keysOf = (k) => (tl.mode === 'cells' ? tl.stripKeys[k * tl.rows] : tl.stripKeys[k]);
  const a = R.t0 - 0.1;
  const b = R.spinEnd + 0.15;
  const N = 220;
  let vmax = 1;
  const series = [];
  for (let k = 0; k < tl.reels; k++) {
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const t = a + ((b - a) * i) / N;
      const v = evalVelocity(keysOf(k), t);
      vmax = Math.max(vmax, Math.abs(v));
      pts.push([t, v]);
    }
    series.push(pts);
  }
  const pad = { l: 44, r: 12, t: 26, b: 26 };
  const X = (t) => pad.l + ((t - a) / (b - a)) * (W - pad.l - pad.r);
  const zeroY = pad.t + (H - pad.t - pad.b) * 0.82;
  const Y = (v) => zeroY - (v / vmax) * (zeroY - pad.t);
  const first = R.stopOrder?.[0] ?? 0;
  const r0 = R.reels[first] || R.reels[0];
  const sp = project.spin;
  const phases = [
    ['START', r0.start, r0.start + sp.startDuration, 'rgba(120,180,255,0.12)'],
    ['MID', r0.start + sp.startDuration, r0.stop - sp.endDuration, 'rgba(244,197,91,0.10)'],
    ['END', r0.stop - sp.endDuration, r0.settle, 'rgba(255,95,158,0.13)'],
  ];
  for (const [label, s, e, col] of phases) {
    if (e <= s) continue;
    g.fillStyle = col;
    g.fillRect(X(s), pad.t, X(e) - X(s), H - pad.t - pad.b);
    g.fillStyle = muted;
    g.font = '600 15px "Instrument Sans", system-ui, sans-serif';
    g.fillText(label, X(s) + 6, pad.t - 8);
  }
  g.strokeStyle = line;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(pad.l, zeroY);
  g.lineTo(W - pad.r, zeroY);
  g.stroke();
  g.fillStyle = muted;
  g.font = '14px "JetBrains Mono", ui-monospace, monospace';
  g.fillText(`${vmax.toFixed(0)}`, 6, pad.t + 10);
  g.fillText('0', 24, zeroY + 5);
  g.fillText(`${(b - a).toFixed(2)} s`, W - 86, H - 6);
  series.forEach((pts, k) => {
    const mix = tl.reels > 1 ? k / (tl.reels - 1) : 0;
    g.strokeStyle = `hsl(${42 - mix * 70}, 90%, ${62 - mix * 6}%)`;
    g.lineWidth = k === first ? 3 : 2;
    g.globalAlpha = k === first ? 1 : 0.75;
    g.beginPath();
    pts.forEach(([t, v], i) => (i ? g.lineTo(X(t), Y(v)) : g.moveTo(X(t), Y(v))));
    g.stroke();
  });
  g.globalAlpha = 1;
}

function sortTiers() {
  const P = state.project;
  const ids = P.tiers.map((t) => t.id);
  P.tiers.sort((a, b) => a.x - b.x);
  for (const r of P.rounds) {
    if (r.outcome !== 'big') continue;
    const id = ids[Math.min(ids.length - 1, r.tier | 0)];
    r.tier = Math.max(0, P.tiers.findIndex((t) => t.id === id));
  }
}

function tierEditor() {
  const P = state.project;
  const list = h('div', { class: 'tiers' }, h('div', { class: 'tier head' }, h('span', null, 'Title'), h('span', null, '× bet'), h('span', null, 'Colour'), h('span', null, '')));
  P.tiers.forEach((t, i) => {
    list.append(
      h(
        'div',
        { class: 'tier' },
        h('input', { type: 'text', id: `tier-title-${t.id}`, value: t.title, 'aria-label': `Tier ${i + 1} title`, onchange: (e) => { t.title = e.target.value.slice(0, 24) || 'BIG WIN'; changed('all'); refreshList(); renderSequence(); } }),
        h('input', { type: 'number', id: `tier-x-${t.id}`, value: t.x, min: 1, step: 1, 'aria-label': `Tier ${i + 1} threshold in bets`, onchange: (e) => { t.x = Math.max(1, Number(e.target.value) || 1); sortTiers(); changed('timeline'); renderPanel(); renderInspector(); } }),
        h('select', { id: `tier-pal-${t.id}`, 'aria-label': `Tier ${i + 1} colour`, onchange: (e) => { t.palette = e.target.value; changed('all'); } }, TITLE_PALETTE_NAMES.map((p) => h('option', { value: p, selected: t.palette === p }, p[0].toUpperCase() + p.slice(1)))),
        button('', () => {
          if (P.tiers.length <= 1) return toast('Keep at least one tier.', 'warn');
          P.tiers.splice(i, 1);
          for (const r of P.rounds) if (r.outcome === 'big' && (r.tier | 0) >= i) r.tier = Math.max(0, (r.tier | 0) - 1);
          changed('all');
          renderPanel();
          renderSequence();
        }, { class: 'icon-btn tiny', icon: 'x', title: 'Remove tier', id: `tier-del-${t.id}` })
      )
    );
  });
  return h(
    'div',
    { class: 'field' },
    list,
    P.tiers.length < 6
      ? button('Add tier', () => {
          const last = P.tiers[P.tiers.length - 1];
          P.tiers.push({ id: `tier${Date.now().toString(36)}`, title: 'SUPER WIN', x: Math.round((last?.x || 10) * 2), palette: TITLE_PALETTE_NAMES[P.tiers.length % TITLE_PALETTE_NAMES.length] });
          changed('all');
          renderPanel();
          renderSequence();
        }, { class: 'btn small', icon: 'plus', id: 'tier-add' })
      : null,
    h('p', { class: 'hint' }, 'A big win shows each title as the count passes its threshold (amount ≥ bet × threshold). In After Effects every title is its own layer.')
  );
}

function panelEffects() {
  const P = state.project;
  const fx = P.effects;
  const tm = P.timing;
  const titles = fx.titles;
  return [
    section('Win tiers', tierEditor()),
    section(
      'Win typography',
      selectField({ id: 'fx-font', label: 'Display font', value: fx.font, options: FONTS.map((f) => ({ value: f, label: f })), onChange: num(fx, 'font', 'all') }),
      h(
        'div',
        { class: 'row2' },
        ...[
          ['freespins', 'Free spins'],
          ['total', 'Free spins total'],
          ['bonus', 'Bonus'],
          ['wheel', 'Wheel title'],
          ['nearmiss', 'Near miss'],
        ].map(([k, l]) => textField({ id: `fx-t-${k}`, label: l, value: titles[k], onChange: num(titles, k, 'all') }))
      )
    ),
    section(
      'Intensity',
      rangeField({ id: 'fx-dim', label: 'Dim other symbols', value: fx.dim, min: 0, max: 0.9, step: 0.01, onInput: num(fx, 'dim') }),
      rangeField({ id: 'fx-pop', label: 'Winning symbol pop', value: fx.popScale, min: 0, max: 0.4, step: 0.01, onInput: num(fx, 'popScale') }),
      rangeField({ id: 'fx-line', label: 'Payline glow', value: fx.lineGlow, min: 0, max: 1.5, step: 0.01, onInput: num(fx, 'lineGlow') }),
      rangeField({ id: 'fx-spark', label: 'Sparkles', value: fx.sparkles, min: 0, max: 2, step: 0.01, onInput: num(fx, 'sparkles') }),
      rangeField({ id: 'fx-coins', label: 'Coins', value: fx.coins, min: 0, max: 2, step: 0.01, onInput: num(fx, 'coins') }),
      rangeField({ id: 'fx-rays', label: 'Light rays', value: fx.rays, min: 0, max: 1.5, step: 0.01, onInput: num(fx, 'rays') }),
      rangeField({ id: 'fx-shake', label: 'Screen shake', value: fx.shake, min: 0, max: 2, step: 0.01, onInput: num(fx, 'shake') }),
      rangeField({ id: 'fx-flash', label: 'Flashes', value: fx.flash, min: 0, max: 1.5, step: 0.01, onInput: num(fx, 'flash') }),
      rangeField({ id: 'fx-bloom', label: 'Bloom glow', value: fx.bloom, min: 0, max: 1.2, step: 0.01, onInput: num(fx, 'bloom'), hint: 'Preview and MP4 only.' }),
      rangeField({ id: 'fx-bokeh', label: 'Background lights', value: fx.bokeh, min: 0, max: 2, step: 0.01, onInput: num(fx, 'bokeh') })
    ),
    section(
      'Timing',
      rangeField({ id: 'tm-small', label: 'Small win show', unit: 's', value: tm.small, min: 0.8, max: 5, step: 0.05, onInput: num(tm, 'small') }),
      rangeField({ id: 'tm-medium', label: 'Medium win show', unit: 's', value: tm.medium, min: 1, max: 6, step: 0.05, onInput: num(tm, 'medium') }),
      rangeField({ id: 'tm-biglines', label: 'Lines before the big win title', unit: 's', value: tm.bigLines, min: 0.4, max: 3, step: 0.05, onInput: num(tm, 'bigLines') }),
      rangeField({ id: 'tm-tier', label: 'Count-up per tier', unit: 's', value: tm.tierCount, min: 1, max: 8, step: 0.1, onInput: num(tm, 'tierCount') }),
      rangeField({ id: 'tm-hold', label: 'Hold the final amount', unit: 's', value: tm.bigHold, min: 0.3, max: 4, step: 0.05, onInput: num(tm, 'bigHold') }),
      rangeField({ id: 'tm-tshow', label: 'Each tumble win', unit: 's', value: tm.tumbleShow, min: 0.4, max: 3, step: 0.05, onInput: num(tm, 'tumbleShow') }),
      rangeField({ id: 'tm-tpop', label: 'Tumble pop', unit: 's', value: tm.tumblePop, min: 0.15, max: 1, step: 0.01, onInput: num(tm, 'tumblePop') }),
      rangeField({ id: 'tm-tfall', label: 'Tumble fall', unit: 's', value: tm.tumbleFall, min: 0.15, max: 1, step: 0.01, onInput: num(tm, 'tumbleFall') }),
      rangeField({ id: 'tm-mult', label: 'Each multiplier collect', unit: 's', value: tm.multEach, min: 0.2, max: 1.5, step: 0.05, onInput: num(tm, 'multEach') }),
      rangeField({ id: 'tm-expand', label: 'Wild expand', unit: 's', value: tm.expand, min: 0.3, max: 2, step: 0.05, onInput: num(tm, 'expand') }),
      rangeField({ id: 'tm-cel', label: 'Scatter celebration', unit: 's', value: tm.celebrate, min: 0.5, max: 4, step: 0.05, onInput: num(tm, 'celebrate') }),
      rangeField({ id: 'tm-banner', label: 'Bonus banner', unit: 's', value: tm.banner, min: 1, max: 6, step: 0.05, onInput: num(tm, 'banner') }),
      rangeField({ id: 'tm-wheel', label: 'Wheel spin', unit: 's', value: tm.wheelSpin, min: 2, max: 12, step: 0.1, onInput: num(tm, 'wheelSpin') }),
      rangeField({ id: 'tm-gap', label: 'Gap between rounds', unit: 's', value: tm.gap, min: 0, max: 2, step: 0.05, onInput: num(tm, 'gap') }),
      rangeField({ id: 'tm-intro', label: 'Intro hold', unit: 's', value: tm.intro, min: 0, max: 3, step: 0.05, onInput: num(tm, 'intro') }),
      rangeField({ id: 'tm-outro', label: 'Outro hold', unit: 's', value: tm.outro, min: 0, max: 3, step: 0.05, onInput: num(tm, 'outro') })
    ),
  ];
}

function panelWheel() {
  const P = state.project;
  const W = P.wheel;
  const list = h('div', { class: 'segments' });
  W.segments.forEach((s, i) => {
    list.append(
      h(
        'div',
        { class: 'segment' },
        h('span', { class: 'seg-n' }, i + 1),
        h('input', { type: 'color', id: `seg-c-${i}`, value: s.color || '#b3123b', 'aria-label': `Segment ${i + 1} colour`, onchange: (e) => { s.color = e.target.value; changed('all'); } }),
        h('input', { type: 'text', id: `seg-l-${i}`, value: s.label, 'aria-label': `Segment ${i + 1} label`, onchange: (e) => { s.label = e.target.value; changed('all'); refreshList(); } }),
        h('input', { type: 'number', id: `seg-v-${i}`, value: s.value, 'aria-label': `Segment ${i + 1} value`, onchange: (e) => { s.value = Number(e.target.value) || 0; changed('timeline'); } }),
        button('', () => {
          if (W.segments.length <= 3) return toast('A wheel needs at least three segments.', 'warn');
          W.segments.splice(i, 1);
          P.rounds.forEach((r) => {
            if (r.wheelSegment >= W.segments.length) r.wheelSegment = W.segments.length - 1;
          });
          changed('all');
          renderPanel();
          renderInspector();
        }, { class: 'icon-btn tiny', icon: 'x', title: 'Remove segment', id: `seg-del-${i}` })
      )
    );
  });
  return [
    section(
      'Segments',
      h('p', { class: 'hint' }, 'Clockwise from the top. Each wheel round picks its landing segment in the round settings.'),
      h('div', { class: 'segment head' }, h('span', null, '#'), h('span', null, 'Colour'), h('span', null, 'Label'), h('span', null, 'Value'), h('span', null, '')),
      list,
      h(
        'div',
        { class: 'row' },
        button('Add segment', () => {
          W.segments.push({ label: '100', value: 100, color: ['#b3123b', '#1f3fbf', '#0e8a4f', '#6a1fb8'][W.segments.length % 4] });
          changed('all');
          renderPanel();
          renderInspector();
        }, { class: 'btn small', icon: 'plus', id: 'seg-add' }),
        button('Default segments', () => {
          W.segments = DEFAULT_SEGMENTS.map((s) => ({ ...s }));
          changed('all');
          renderPanel();
          renderInspector();
        }, { class: 'btn small ghost', id: 'seg-reset' })
      )
    ),
    section(
      'Spin',
      rangeField({ id: 'w-turns', label: 'Full turns', value: W.turns, min: 1, max: 12, step: 1, onInput: num(W, 'turns') }),
      segmented({ id: 'w-landing', label: 'Default landing', value: W.landing, options: [{ value: 'center', label: 'Centered' }, { value: 'random', label: 'Natural' }, { value: 'tease', label: 'Edge tease' }], onChange: num(W, 'landing') }),
      toggleField({ id: 'w-bet', label: 'Multiply segment values by the bet', checked: W.multiplyByBet, onChange: num(W, 'multiplyByBet') })
    ),
  ];
}

// ---------- sound ----------

function soundChanged() {
  save();
  scheduleSound();
}

function panelSound() {
  const P = state.project;
  const S = P.sound;
  const groups = [
    ['reels', 'Reels and drops'],
    ['wins', 'Wins, pops, counters'],
    ['coins', 'Coins'],
    ['bigwin', 'Big win and features'],
    ['ui', 'Whooshes'],
  ];
  const rows = SOUND_EVENTS.map((ev) => {
    const has = !!S.custom[ev.id];
    return h(
      'div',
      { class: 'sound-row' },
      h('span', { class: 'sound-name' }, ev.label, h('span', { class: 'hint' }, has ? 'Your sound' : 'Built-in synth')),
      button(has ? 'Replace' : 'Upload', async () => {
        const [f] = await pickFiles('audio/*,.wav,.mp3,.ogg,.m4a');
        if (!f) return;
        if (f.size > 4e6) return toast('Keep each sound under 4 MB.', 'warn');
        S.custom[ev.id] = await readFileAsDataURL(f);
        soundChanged();
        renderPanel();
      }, { class: 'btn small', id: `snd-up-${ev.id}` }),
      has
        ? button('', () => {
            delete S.custom[ev.id];
            soundChanged();
            renderPanel();
          }, { class: 'icon-btn tiny', icon: 'x', title: 'Back to the built-in sound', id: `snd-clear-${ev.id}` })
        : h('span')
    );
  });
  return [
    section(
      'Sound track',
      toggleField({ id: 'snd-on', label: 'Sound track', checked: S.enabled !== false, onChange: (v) => { S.enabled = v; soundChanged(); renderTransport(); renderPanel(); } }),
      h('p', { class: 'hint' }, 'Every reel stop, tumble, count-up tick, big win sting, coin shower and wheel peg is generated in sync with the animation. It plays with the preview at 1× speed, is muxed into the MP4 and ships as a WAV layer in the After Effects project.'),
      S.enabled !== false
        ? [
            rangeField({ id: 'snd-vol', label: 'Volume', value: S.volume, min: 0, max: 1, step: 0.01, onInput: (v) => { S.volume = v; soundChanged(); } }),
            ...groups.map(([k, l]) => rangeField({ id: `snd-mix-${k}`, label: l, value: S.mix[k] ?? 1, min: 0, max: 1.5, step: 0.01, onInput: (v) => { S.mix[k] = v; soundChanged(); } })),
          ]
        : null,
      button('Download the sound track (WAV in a zip)', downloadWav, { class: 'btn small', icon: 'download', id: 'snd-wav', disabled: S.enabled === false })
    ),
    S.enabled !== false ? section('Your own sounds', h('p', { class: 'hint' }, 'Replace any cue with a WAV, MP3 or OGG file. It plays from its start at each cue.'), h('div', { class: 'sounds' }, rows)) : null,
  ];
}

async function downloadWav() {
  if (state.busy || !state.scene) return;
  try {
    setBusy('wav', 0.2, 'Rendering the sound track…');
    const buf = await renderSoundtrack(state.scene.tl, state.project, await customSounds(state.project));
    const zip = new window.JSZip();
    zip.file(`${slugName()}_soundtrack.wav`, audioBufferToWav(buf));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    setBusy(null);
    await saveFile(`${slugName()}_soundtrack.zip`, blob);
  } catch (e) {
    setBusy(null);
    toast(`Could not render the sound track: ${e.message}`, 'error', 6000);
  }
}

// ---------- export ----------

async function saveFile(filename, blob) {
  try {
    const dl = await downloadsP;
    if (dl) {
      await dl.save({ filename, data: blob });
      toast(`Saved ${filename}.`, 'good');
      return true;
    }
  } catch (e) {
    if (e?.code === 'declined') {
      toast('Download cancelled.', 'info');
      return false;
    }
    if (e?.code === 'rate_limited') {
      toast('Another download is waiting for your answer. Try again in a moment.', 'warn');
      return false;
    }
    if (e?.code && !['unavailable', 'not_granted', 'capability_disabled', 'capability_removed'].includes(e.code)) {
      toast(`Could not save the file: ${e.message || e.code}`, 'error', 6000);
      return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, style: { display: 'none' } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
  toast(`Downloaded ${filename}.`, 'good');
  return true;
}

function slugName() {
  return (state.project.name || 'slot').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'slot';
}

function setBusy(kind, progress, label) {
  state.busy = kind ? { kind, progress, label } : null;
  if (!el.progress?.isConnected) return;
  if (!kind) {
    el.progress.hidden = true;
    return;
  }
  el.progress.hidden = false;
  el.progressBar.style.width = `${Math.round((progress || 0) * 100)}%`;
  el.progressLabel.textContent = label;
}

let abortCtl = null;
async function startMP4() {
  if (state.busy || !state.scene) return;
  if (!canEncodeVideo()) {
    toast('MP4 preview needs a browser with WebCodecs (current Chrome, Edge or Safari). The After Effects package works everywhere.', 'warn', 7000);
    return;
  }
  const tl = state.scene.tl;
  let from = 0;
  let to = tl.duration;
  if (state.exportRange === 'round' && tl.rounds[state.sel]) {
    from = Math.max(0, tl.rounds[state.sel].t0 - 0.25);
    to = tl.rounds[state.sel].next;
  }
  abortCtl = new AbortController();
  const wasPlaying = state.playing;
  state.playing = false;
  stopAudio();
  renderTransport();
  try {
    let sound = null;
    if (state.mp4Sound && state.project.sound?.enabled !== false && typeof OfflineAudioContext !== 'undefined') {
      setBusy('mp4', 0, 'Rendering the sound track…');
      sound = await renderSoundtrack(tl, state.project, await customSounds(state.project));
    }
    setBusy('mp4', 0, 'Rendering MP4…');
    const blob = await exportMP4(state.scene, {
      from,
      to,
      bitrate: state.bitrate,
      signal: abortCtl.signal,
      audio: sound,
      onProgress: (p) => setBusy('mp4', p, `Rendering MP4… ${Math.round(p * 100)}%`),
    });
    setBusy(null);
    const suffix = state.exportRange === 'round' ? `_round${state.sel + 1}` : '';
    await saveFile(`${slugName()}${suffix}_preview.mp4`, blob);
  } catch (e) {
    setBusy(null);
    if (e?.name === 'AbortError') toast('MP4 render cancelled.');
    else toast(`MP4 render failed: ${e.message}`, 'error', 7000);
  }
  abortCtl = null;
  if (wasPlaying) togglePlay();
}

async function startAE() {
  if (state.busy || !state.scene) return;
  try {
    setBusy('ae', 0, 'Building the After Effects package…');
    const { blob, filename, formats } = await buildAEPackage(state.scene, state.images, (p) => setBusy('ae', p, `Building the After Effects package… ${Math.round(p * 100)}%`));
    setBusy(null);
    if (await saveFile(filename, blob)) toast(`The package holds ${formats} format${formats === 1 ? '' : 's'}. Run the .jsx from File → Scripts → Run Script File.`, 'info', 6000);
  } catch (e) {
    console.error(e);
    setBusy(null);
    toast(`Could not build the package: ${e.message}`, 'error', 7000);
  }
}

function formatPicker() {
  const P = state.project;
  const own = `${P.canvas.width}x${P.canvas.height}`;
  const choices = FORMAT_CHOICES.some((f) => f.id === own) ? FORMAT_CHOICES : [{ id: own, label: 'Canvas size' }, ...FORMAT_CHOICES];
  const wrap = h('div', { class: 'formats', role: 'group', 'aria-label': 'After Effects formats' });
  for (const f of choices) {
    const on = P.output.formats.includes(f.id);
    const b = h('button', { type: 'button', class: `fmt${on ? ' on' : ''}`, id: `x-fmt-${f.id}`, 'aria-pressed': String(on) }, h('strong', null, f.id.replace('x', ' × ')), h('span', null, f.label));
    b.addEventListener('click', () => {
      const set = new Set(P.output.formats);
      if (set.has(f.id)) {
        if (set.size === 1) return toast('Keep at least one format.', 'warn');
        set.delete(f.id);
      } else set.add(f.id);
      P.output.formats = choices.map((c) => c.id).filter((id) => set.has(id));
      save();
      renderPanel();
    });
    wrap.append(b);
  }
  return wrap;
}

function panelExport() {
  const P = state.project;
  el.progress = h('div', { class: 'progress', hidden: !state.busy }, h('div', { class: 'progress-track' }, (el.progressBar = h('div', { class: 'progress-bar', style: { width: `${Math.round((state.busy?.progress || 0) * 100)}%` } }))), h('div', { class: 'progress-row' }, (el.progressLabel = h('span', null, state.busy?.label || '')), button('Cancel', () => abortCtl?.abort(), { class: 'btn small ghost', id: 'x-cancel' })));
  const n = P.output.formats.length;
  return [
    el.progress,
    section(
      'After Effects project',
      h('p', null, 'The main export: a zip with a script that rebuilds this animation as a layered, editable After Effects project (2026 or any CC version), plus every image and the sound track.'),
      h(
        'ul',
        { class: 'bullets' },
        h('li', null, 'Every symbol is its own comp, with a win comp for its win animation: animate inside once and every reel and win updates.'),
        h('li', null, 'Reels (or cells) are precomps driven by one Spin slider with the same start, mid and end keyframes and eases as this preview. Tumbles are keyframed layers.'),
        h('li', null, 'Each win is its own precomp: lines, pops, wilds, multipliers, tier titles, coins, the wheel.'),
        h('li', null, 'Counters are rolling odometer rigs built from plain layers, no plugin needed.')
      ),
      h('div', { class: 'field' }, h('span', { class: 'label' }, `Formats · ${n} selected`), formatPicker(), h('p', { class: 'hint' }, 'Each format gets its own comp tree, laid out for that size. The symbol art is shared.')),
      toggleField({ id: 'x-transparent', label: 'Transparent background', checked: !!P.output.transparent, onChange: (v) => { P.output.transparent = v; save(); }, hint: 'Switches the background and vignette layers off, ready to render ProRes 4444 with alpha from After Effects.' }),
      button(`Download After Effects package`, startAE, { class: 'btn primary wide', icon: 'download', id: 'x-ae' }),
      h('p', { class: 'hint' }, 'In After Effects: File → Scripts → Run Script File, then pick the .jsx inside the folder. The README inside explains every control.')
    ),
    section(
      'Quick preview (MP4)',
      segmented({ id: 'x-range', label: 'Range', value: state.exportRange, options: [{ value: 'all', label: 'Whole sequence' }, { value: 'round', label: 'Selected round' }], onChange: (v) => (state.exportRange = v) }),
      selectField({ id: 'x-bitrate', label: 'Quality', value: state.bitrate, options: [{ value: 8e6, label: 'Standard (8 Mbps)' }, { value: 16e6, label: 'High (16 Mbps)' }, { value: 40e6, label: 'Master (40 Mbps)' }], onChange: (v) => (state.bitrate = Number(v)) }),
      toggleField({ id: 'x-mp4-sound', label: 'Include the sound track', checked: state.mp4Sound && P.sound?.enabled !== false, onChange: (v) => (state.mp4Sound = v) }),
      button('Render MP4 preview', startMP4, { class: 'btn wide', icon: 'film', id: 'x-mp4' }),
      h('p', { class: 'hint' }, 'For sharing a quick look. Rendered frame by frame at full resolution, so no frames drop.')
    ),
    section(
      'Still frame',
      button('Save this frame as PNG', async () => {
        const blob = await frameToPNG(state.scene, state.t);
        await saveFile(`${slugName()}_${state.t.toFixed(2).replace('.', '-')}s.png`, blob);
      }, { class: 'btn wide', id: 'x-png' })
    ),
    section(
      'Project file',
      h('p', { class: 'hint' }, 'Includes your uploaded images and sounds, so you can reopen the exact animation later.'),
      h(
        'div',
        { class: 'row' },
        button('Save project', () => saveFile(`${slugName()}.json`, new Blob([JSON.stringify(state.project, null, 2)], { type: 'application/json' })), { class: 'btn small', icon: 'download', id: 'x-save' }),
        button('Open project', async () => {
          const [f] = await pickFiles('application/json,.json');
          if (!f) return;
          try {
            loadProject(migrate(JSON.parse(await f.text())), `Opened ${f.name}.`);
          } catch (err) {
            toast(`That file is not a Reel Studio project: ${err.message}`, 'error', 6000);
          }
        }, { class: 'btn small', icon: 'upload', id: 'x-open' })
      ),
      confirmButton('Start over with the demo project', 'Click again to replace this project', () => loadProject(defaultProject(), 'Loaded the demo project.'), { class: 'btn small ghost danger', id: 'x-reset' })
    ),
  ];
}

// ---------- toasts ----------

function toast(msg, kind = 'info', ms = 3600) {
  const t = h('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, msg);
  el.toasts.append(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

function renderAll() {
  renderTransport();
  renderTabs();
  renderPanel();
  renderSequence();
  renderBadge();
}

export async function start() {
  state.project = loadSaved() || defaultProject();
  downloadsP = window.claude?.use ? Promise.resolve(window.claude.use('downloads')).catch(() => null) : Promise.resolve(null);
  buildShell();
  renderAll();
  await withTimeout(Promise.all(['Bungee', 'Instrument Sans'].map((f) => document.fonts.load(`32px "${f}"`).catch(() => null))), 3000);
  await rebuild('all');
  renderPanel();
  requestAnimationFrame((n) => {
    lastNow = n;
    loop(n);
  });
  state.playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderTransport();
  window.reelStudio = { state, rebuild, renderFrame, audio };
}
