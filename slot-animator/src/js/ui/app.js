// Reel Studio editor: project state, live preview, the round sequencer and
// the settings panels. Rendering and exports live in their own modules.

import { defaultProject, newRound, OUTCOMES, OUTCOME_BY_ID, SPIN_TYPES, SPIN_PRESETS, THEMES, BUILTIN_SYMBOLS, LINE_WINS, SCATTER_WINS, DEFAULT_SEGMENTS } from '../core/defaults.js';
import { buildTimeline, roundIndexAt } from '../core/timeline.js';
import { computeLayout } from '../core/layout.js';
import { evalVelocity } from '../core/keys.js';
import { lineColor, generatePaylines } from '../core/paylines.js';
import { autoAmount, makeContext } from '../core/outcomes.js';
import { loadImage, buildResources, fontStack } from '../render/sprites.js';
import { paintBuiltin } from '../render/paint.js';
import { renderFrame } from '../render/renderer.js';
import { exportMP4, frameToPNG, canEncodeVideo } from '../export/video.js';
import { buildAEPackage } from '../export/aepackage.js';
import { h, clear, rangeField, selectField, segmented, toggleField, textField, section, button, readFileAsDataURL, pickFiles } from './dom.js';

const STORE_KEY = 'reel-studio-project-v1';
const FONTS = ['Bungee', 'Lilita One', 'Russo One', 'Cinzel Decorative'];
const FORMATS = [
  ['1920x1080', 'Landscape HD · 1920 × 1080'],
  ['3840x2160', 'Landscape 4K · 3840 × 2160'],
  ['1280x720', 'Landscape · 1280 × 720'],
  ['1080x1920', 'Portrait story · 1080 × 1920'],
  ['1080x1350', 'Portrait feed · 1080 × 1350'],
  ['1080x1080', 'Square · 1080 × 1080'],
];

const state = {
  project: null,
  sel: 0,
  t: 0,
  playing: false,
  loop: true,
  solo: false,
  speed: 1,
  tab: 'machine',
  scene: null,
  images: null,
  quality: 1,
  autoQuality: true,
  perf: [],
  builder: { spins: 5, warm: 'mixed', finale: 'mega' },
  busy: null,
  exportRange: 'all',
  bitrate: 16e6,
};
const el = {};
const imageCache = new Map();
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

function migrate(p) {
  const out = deepMerge(defaultProject(), p || {});
  if (!Array.isArray(out.symbols) || !out.symbols.length) out.symbols = defaultProject().symbols;
  if (!Array.isArray(out.rounds)) out.rounds = [];
  if (!Array.isArray(out.wheel.segments) || out.wheel.segments.length < 2) out.wheel.segments = DEFAULT_SEGMENTS.map((s) => ({ ...s }));
  out.rounds = out.rounds.map((r) => ({ ...newRound(r.outcome || 'none'), ...r }));
  return out;
}

function loadSaved() {
  try {
    const s = localStorage.getItem(STORE_KEY);
    return s ? migrate(JSON.parse(s)) : null;
  } catch {
    return null;
  }
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state.project));
    } catch {
      if (!state.saveWarned) {
        toast('This project is too large to keep in the browser automatically. Use Export → Save project file.', 'warn', 6000);
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

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

async function loadImages(project) {
  const font = fontStack(project.effects.font);
  await withTimeout(document.fonts.load(`64px "${project.effects.font || 'Bungee'}"`).catch(() => null), 2500);
  const symbols = await Promise.all(project.symbols.map((s) => symbolImage(s, font)));
  return {
    symbols,
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
    state.t += dt * state.speed;
    if (state.t >= b) {
      if (state.loop) state.t = a + ((state.t - a) % Math.max(0.01, b - a));
      else {
        state.t = b;
        state.playing = false;
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
        button('MP4', () => {
          state.tab = 'export';
          renderTabs();
          renderPanel();
          startMP4();
        }, { class: 'btn', icon: 'film', id: 'top-mp4', title: 'Render the sequence to MP4' }),
        button('After Effects', () => {
          state.tab = 'export';
          renderTabs();
          renderPanel();
          startAE();
        }, { class: 'btn primary', icon: 'download', id: 'top-ae', title: 'Download the After Effects package' })
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

function onKey(e) {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea' || e.target.isContentEditable) return;
  if (!state.scene) return;
  const fd = 1 / state.scene.tl.fps;
  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
  } else if (e.key === 'ArrowRight') {
    state.t = Math.min(state.scene.tl.duration, state.t + (e.shiftKey ? 1 : fd));
    draw();
  } else if (e.key === 'ArrowLeft') {
    state.t = Math.max(0, state.t - (e.shiftKey ? 1 : fd));
    draw();
  } else if (e.key === 'Home') {
    state.t = playRange()[0];
    draw();
  }
}

// ---------- transport & timeline ----------

function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

function togglePlay() {
  if (!state.scene) return;
  const [a, b] = playRange();
  if (!state.playing && state.t >= b - 0.01) state.t = a;
  state.playing = !state.playing;
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
        renderTransport();
      }, { class: `chip${state.solo ? ' on' : ''}`, id: 'tp-solo', title: 'Play only the selected round' }),
      selectField({
        id: 'tp-speed',
        value: state.speed,
        options: [
          { value: 0.25, label: '¼×' },
          { value: 0.5, label: '½×' },
          { value: 1, label: '1×' },
        ],
        onChange: (v) => (state.speed = Number(v)),
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
  tl.rounds.forEach((R, i) => {
    const o = OUTCOME_BY_ID[R.outcome];
    el.track.append(
      h(
        'div',
        { class: `block${i === state.sel ? ' sel' : ''}`, style: { left: `${(R.t0 / D) * 100}%`, width: `${((R.next - R.t0) / D) * 100}%`, '--c': o.color }, title: `Round ${i + 1}: ${o.label}` },
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
    scrub(ev);
    const move = (e2) => scrub(e2);
    const up = () => {
      el.track.removeEventListener('pointermove', move);
      el.track.removeEventListener('pointerup', up);
    };
    el.track.addEventListener('pointermove', move);
    el.track.addEventListener('pointerup', up);
  });
  el.track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.stopPropagation();
      state.t = Math.min(D, Math.max(0, state.t + (e.key === 'ArrowRight' ? 0.5 : -0.5)));
      draw();
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

function selectRound(i, seek) {
  state.sel = i;
  if (seek && state.scene?.tl.rounds[i]) {
    state.t = Math.max(0, state.scene.tl.rounds[i].t0 - 0.05);
    draw();
  }
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

function builderCard() {
  const b = state.builder;
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
      options: [
        { value: 'big', label: 'Big win' },
        { value: 'mega', label: 'Mega win (Big → Mega)' },
        { value: 'epic', label: 'Epic win (Big → Mega → Epic)' },
        { value: 'freespins', label: 'Free spins trigger' },
        { value: 'wheel', label: 'Wheel of Fortune bonus' },
        { value: 'mega+wheel', label: 'Mega win, then the wheel' },
      ],
      onChange: (v) => (b.finale = v),
    }),
    button('Build sequence', buildSequence, { class: 'btn primary wide', id: 'qb-build' })
  );
}

function buildSequence() {
  const { spins, warm, finale } = state.builder;
  const rounds = [];
  for (let i = 0; i < spins; i++) {
    let o = 'none';
    if (warm === 'mixed' && i % 3 === 1) o = 'small';
    if (warm === 'tease') o = i === spins - 1 ? 'nearmiss' : i % 2 ? 'small' : 'none';
    rounds.push(newRound(o, o === 'small' ? { lines: [Math.floor(Math.random() * 5)] } : {}));
  }
  if (finale === 'mega+wheel') rounds.push(newRound('mega', { lines: [0, 3] }), newRound('wheel'));
  else rounds.push(newRound(finale, finale === 'epic' ? { lines: [0, 1, 2], pattern: 'lines' } : {}));
  state.project.rounds = rounds;
  state.sel = spins;
  changed('timeline');
  renderSequence();
  toast(`Built ${rounds.length} rounds: ${spins} warm-up spin${spins === 1 ? '' : 's'} and the finale.`);
}

function addRound(outcome) {
  const r = newRound(outcome);
  state.project.rounds.splice(state.sel + 1, 0, r);
  state.sel = Math.min(state.project.rounds.length - 1, state.sel + 1);
  changed('timeline');
  renderSequence();
}

function describe(r) {
  const P = state.project;
  if (LINE_WINS.includes(r.outcome)) {
    const s = r.symbol === 'auto' ? 'Auto symbol' : P.symbols.find((x) => x.id === r.symbol)?.name || 'Auto symbol';
    const pat = r.pattern === 'lines' ? `${(r.lines || []).length} line${(r.lines || []).length === 1 ? '' : 's'}` : r.pattern === 'cells' ? 'custom cells' : r.pattern === 'ways' ? 'ways' : 'full screen';
    return `${s} ×${r.count} · ${pat}`;
  }
  if (r.outcome === 'wheel') return `Lands on ${P.wheel.segments[r.wheelSegment]?.label ?? '?'}`;
  if (r.outcome === 'freespins') return `${r.freeSpins} free spins`;
  if (r.outcome === 'bonus') return 'Scatter trigger';
  if (r.outcome === 'nearmiss') return '2 scatters, third slides past';
  return 'Reels spin and stop';
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
      { class: `round${i === state.sel ? ' sel' : ''}` },
      h(
        'button',
        { type: 'button', class: 'round-main', id: `round-${r.id}`, onclick: () => selectRound(i, true), 'aria-current': i === state.sel ? 'true' : null },
        h('span', { class: 'round-n' }, String(i + 1).padStart(2, '0')),
        h('span', { class: 'dot', style: { '--c': o.color } }),
        h('span', { class: 'round-text' }, h('span', { class: 'round-label' }, o.list || o.label), h('span', { class: 'round-meta' }, describe(r))),
        h('span', { class: 'round-dur' }, dur)
      ),
      h(
        'div',
        { class: 'round-actions' },
        act('up', 'Move up', () => moveRound(i, -1), i === 0),
        act('down', 'Move down', () => moveRound(i, 1), i === state.project.rounds.length - 1),
        act('copy', 'Duplicate', () => {
          const c = { ...JSON.parse(JSON.stringify(r)), id: newRound().id };
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
          r.count = fresh.count;
          r.wildAssist = fresh.wildAssist;
        }
        changed(kind);
        refreshList();
        renderInspector();
      },
    })
  );
  const ctx2 = makeContext(P, state.scene?.tl.paylines || generatePaylines(reels, rows, P.machine.maxLines));
  const cur = P.machine.currency || '';
  if (LINE_WINS.includes(r.outcome)) {
    parts.push(
      selectField({
        id: 'ri-symbol',
        label: 'Winning symbol',
        value: r.symbol,
        options: [{ value: 'auto', label: 'Auto (picked for the win size)' }, ...P.symbols.map((s) => ({ value: s.id, label: `${s.name}${s.role !== 'normal' ? ` (${s.role})` : ''}` }))],
        onChange: set('symbol'),
      }),
      segmented({
        id: 'ri-pattern',
        label: 'Win pattern',
        value: r.pattern || 'lines',
        options: [
          { value: 'lines', label: 'Paylines' },
          { value: 'cells', label: 'Custom' },
          { value: 'ways', label: 'Ways' },
          { value: 'full', label: 'Full screen' },
        ],
        onChange: set('pattern', true),
      })
    );
    if (r.pattern !== 'cells' && r.pattern !== 'full') {
      parts.push(rangeField({ id: 'ri-count', label: 'Symbols in a row', value: Math.min(r.count, reels), min: 2, max: reels, step: 1, onInput: set('count') }));
    }
    if ((r.pattern || 'lines') === 'lines') {
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
    if (r.pattern === 'cells') {
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
      toggleField({ id: 'ri-wild', label: 'Include a Wild in the win', checked: r.wildAssist, onChange: set('wildAssist') }),
      textField({
        id: 'ri-amount',
        label: 'Win amount',
        type: 'number',
        value: r.amount ?? '',
        placeholder: `Auto: ${cur}${autoAmount(ctx2, P, r).toFixed(P.machine.decimals | 0)}`,
        onChange: set('amount'),
      })
    );
  }
  if (SCATTER_WINS.includes(r.outcome)) {
    parts.push(rangeField({ id: 'ri-scatters', label: 'Scatters landing', value: r.scatterCount || 3, min: 3, max: reels, step: 1, onInput: set('scatterCount') }));
  }
  if (r.outcome === 'freespins') parts.push(rangeField({ id: 'ri-fs', label: 'Free spins awarded', value: r.freeSpins || 10, min: 1, max: 100, step: 1, onInput: set('freeSpins') }));
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
      textField({ id: 'ri-wheel-amount', label: 'Prize amount', type: 'number', value: r.amount ?? '', placeholder: `From segment: ${cur}${autoAmount(ctx2, P, r).toFixed(P.machine.decimals | 0)}`, onChange: set('amount') })
    );
  }
  if (r.outcome === 'nearmiss') {
    parts.push(
      selectField({
        id: 'ri-nm-reel',
        label: 'Reel that misses',
        value: r.nearMissReel ?? reels - 1,
        options: Array.from({ length: Math.max(1, reels - 2) }, (_, k) => ({ value: k + 2, label: `Reel ${k + 3}` })),
        onChange: (v) => set('nearMissReel')(Number(v)),
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
  parts.push(
    rangeField({ id: 'ri-hold', label: 'Pause after this round', unit: 's', value: r.hold || 0, min: 0, max: 4, step: 0.05, onInput: set('hold') }),
    toggleField({ id: 'ri-tease', label: 'Tease the last reel (anticipation)', checked: !!r.tease, onChange: set('tease') }),
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
  const fn = { assets: panelAssets, machine: panelMachine, spin: panelSpin, effects: panelEffects, wheel: panelWheel, export: panelExport }[state.tab];
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

function panelMachine() {
  const P = state.project;
  const fmt = `${P.canvas.width}x${P.canvas.height}`;
  return [
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
      rangeField({ id: 'm-reels', label: 'Reels', value: P.grid.reels, min: 3, max: 7, step: 1, onInput: num(P.grid, 'reels', 'all', () => renderInspector()) }),
      rangeField({ id: 'm-rows', label: 'Rows', value: P.grid.rows, min: 1, max: 6, step: 1, onInput: num(P.grid, 'rows', 'all', () => renderInspector()) }),
      rangeField({ id: 'm-lines', label: 'Paylines', value: P.machine.maxLines, min: 1, max: 25, step: 1, onInput: num(P.machine, 'maxLines', 'timeline', () => renderInspector()), hint: 'Generated for the grid: straight lines, V shapes, zigzags.' }),
      rangeField({ id: 'm-aspect', label: 'Cell height', unit: '× width', value: P.grid.cellAspect, min: 0.6, max: 1.4, step: 0.02, onInput: num(P.grid, 'cellAspect', 'all') }),
      rangeField({ id: 'm-peek', label: 'Partial symbols above and below', value: P.grid.peek, min: 0, max: 0.5, step: 0.01, onInput: num(P.grid, 'peek', 'all') }),
      rangeField({ id: 'm-curve', label: 'Reel curvature', value: P.grid.curvature, min: 0, max: 1, step: 0.01, onInput: num(P.grid, 'curvature', 'all'), hint: 'Bends the strip like a drum. Preview and MP4 only; the After Effects reels stay flat.' })
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
  return [
    section(
      'Symbols',
      h('p', { class: 'hint' }, 'PNGs with transparent backgrounds work best; each symbol is fitted to its cell. Set one symbol as Wild and one as Scatter. Weight controls how often it shows up as filler.'),
      tiles,
      h(
        'div',
        { class: 'row' },
        button('Add symbol images', addSymbols, { class: 'btn', icon: 'upload', id: 'a-add' }),
        button('Use the sample set', () => {
          P.symbols = BUILTIN_SYMBOLS.map((s, i) => ({ id: `s${i}`, src: null, ...s }));
          changed('all');
          renderPanel();
          renderInspector();
        }, { class: 'btn ghost', id: 'a-reset' })
      )
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
        h('select', { id: `sym-role-${s.id}`, 'aria-label': 'Role', onchange: (e) => { s.role = e.target.value; changed('timeline'); } }, ['normal', 'wild', 'scatter', 'bonus'].map((r) => h('option', { value: r, selected: s.role === r }, r[0].toUpperCase() + r.slice(1)))),
        h('select', { id: `sym-tier-${s.id}`, 'aria-label': 'Value', onchange: (e) => { s.tier = e.target.value; changed('timeline'); } }, [['low', 'Low pay'], ['high', 'High pay']].map(([v, l]) => h('option', { value: v, selected: s.tier === v }, l)))
      ),
      h('label', { class: 'sym-weight', for: `sym-w-${s.id}` }, h('span', null, 'Weight'), h('input', { type: 'range', id: `sym-w-${s.id}`, min: 0, max: 20, step: 1, value: s.weight, oninput: (e) => { s.weight = Number(e.target.value); changed('timeline'); } }))
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
    state.project.symbols.push({ id: `u${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, name: f.name.replace(/\.[^.]+$/, '').slice(0, 24), role: 'normal', tier: 'low', weight: 8, src: await readFileAsDataURL(f) });
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

function panelSpin() {
  const P = state.project;
  const sp = P.spin;
  const typeCards = h('div', { class: 'types', role: 'radiogroup', 'aria-label': 'Spin type' });
  SPIN_TYPES.forEach((t) => {
    const b = h('button', { type: 'button', class: `type${sp.type === t.id ? ' on' : ''}`, id: `spin-type-${t.id}`, role: 'radio', 'aria-checked': String(sp.type === t.id) }, h('strong', null, t.label), h('span', null, t.hint));
    b.addEventListener('click', () => {
      sp.type = t.id;
      Object.assign(sp, SPIN_PRESETS[t.id] || {});
      changed('timeline');
      renderPanel();
    });
    typeCards.append(b);
  });
  el.graph = h('canvas', { class: 'graph', id: 'motion-graph', width: 640, height: 220, 'aria-label': 'Reel speed over time for the selected round' });
  return [
    section('Spin type', typeCards, segmented({ id: 'spin-dir', label: 'Direction', value: sp.direction, options: [{ value: 'down', label: 'Spin down' }, { value: 'up', label: 'Spin up' }], onChange: num(sp, 'direction') })),
    section('Motion curve', h('p', { class: 'hint' }, 'Reel speed in the selected round. Start, mid and end phases are shaded for the first reel.'), el.graph),
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
      rangeField({ id: 'spin-ant-v', label: 'Anticipation crawl speed', unit: 'symbols/s', value: sp.anticipationSpeed, min: 2, max: 20, step: 0.5, onInput: num(sp, 'anticipationSpeed') })
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
  g.font = '600 18px "Instrument Sans", system-ui, sans-serif';
  if (!R || tl.cascade) {
    g.fillStyle = muted;
    g.fillText(tl.cascade ? 'Cascade drops have no reel speed curve.' : 'Select a round to see its curve.', 16, H / 2);
    return;
  }
  const a = R.t0 - 0.1;
  const b = R.spinEnd + 0.15;
  const N = 220;
  let vmax = 1;
  const series = [];
  for (let k = 0; k < tl.reels; k++) {
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const t = a + ((b - a) * i) / N;
      const v = evalVelocity(tl.reelKeys[k], t);
      vmax = Math.max(vmax, Math.abs(v));
      pts.push([t, v]);
    }
    series.push(pts);
  }
  const pad = { l: 44, r: 12, t: 26, b: 26 };
  const X = (t) => pad.l + ((t - a) / (b - a)) * (W - pad.l - pad.r);
  const zeroY = pad.t + (H - pad.t - pad.b) * 0.82;
  const Y = (v) => zeroY - (v / vmax) * (zeroY - pad.t);
  const r0 = R.reels[0];
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
    g.lineWidth = k === 0 ? 3 : 2;
    g.globalAlpha = k === 0 ? 1 : 0.75;
    g.beginPath();
    pts.forEach(([t, v], i) => (i ? g.lineTo(X(t), Y(v)) : g.moveTo(X(t), Y(v))));
    g.stroke();
  });
  g.globalAlpha = 1;
}

function panelEffects() {
  const P = state.project;
  const fx = P.effects;
  const tm = P.timing;
  const titles = fx.titles;
  return [
    section(
      'Win typography',
      selectField({ id: 'fx-font', label: 'Display font', value: fx.font, options: FONTS.map((f) => ({ value: f, label: f })), onChange: num(fx, 'font', 'all') }),
      h(
        'div',
        { class: 'row2' },
        ...[
          ['big', 'Big win'],
          ['mega', 'Mega win'],
          ['epic', 'Epic win'],
          ['freespins', 'Free spins'],
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
      rangeField({ id: 'tm-big', label: 'Big win count-up', unit: 's', value: tm.big, min: 1.5, max: 12, step: 0.1, onInput: num(tm, 'big') }),
      rangeField({ id: 'tm-mega', label: 'Mega win count-up', unit: 's', value: tm.mega, min: 2, max: 14, step: 0.1, onInput: num(tm, 'mega') }),
      rangeField({ id: 'tm-epic', label: 'Epic win count-up', unit: 's', value: tm.epic, min: 2, max: 16, step: 0.1, onInput: num(tm, 'epic') }),
      rangeField({ id: 'tm-hold', label: 'Hold the final amount', unit: 's', value: tm.bigHold, min: 0.3, max: 4, step: 0.05, onInput: num(tm, 'bigHold') }),
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
  if (!el.progress) return;
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
    toast('MP4 export needs a browser with WebCodecs (current Chrome, Edge or Safari). The After Effects package works everywhere.', 'warn', 7000);
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
  renderTransport();
  try {
    setBusy('mp4', 0, 'Rendering MP4…');
    const blob = await exportMP4(state.scene, {
      from,
      to,
      bitrate: state.bitrate,
      signal: abortCtl.signal,
      onProgress: (p) => setBusy('mp4', p, `Rendering MP4… ${Math.round(p * 100)}%`),
    });
    setBusy(null);
    const suffix = state.exportRange === 'round' ? `_round${state.sel + 1}` : '';
    await saveFile(`${slugName()}${suffix}.mp4`, blob);
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
    const { blob, filename } = await buildAEPackage(state.scene, state.images, (p) => setBusy('ae', p, `Building the After Effects package… ${Math.round(p * 100)}%`));
    setBusy(null);
    await saveFile(filename, blob);
  } catch (e) {
    setBusy(null);
    toast(`Could not build the package: ${e.message}`, 'error', 7000);
  }
}

function panelExport() {
  el.progress = h('div', { class: 'progress', hidden: !state.busy }, h('div', { class: 'progress-track' }, (el.progressBar = h('div', { class: 'progress-bar' }))), h('div', { class: 'progress-row' }, (el.progressLabel = h('span', null, state.busy?.label || '')), button('Cancel', () => abortCtl?.abort(), { class: 'btn small ghost', id: 'x-cancel' })));
  const ffmpeg = 'ffmpeg -i input.mp4 -c:v prores_ks -profile:v 3 -pix_fmt yuv422p10le output.mov';
  let resetArmed = false;
  const resetBtn = button('Start over with the demo project', () => {
    if (!resetArmed) {
      resetArmed = true;
      resetBtn.querySelector('span').textContent = 'Click again to replace this project';
      setTimeout(() => {
        resetArmed = false;
        if (resetBtn.isConnected) resetBtn.querySelector('span').textContent = 'Start over with the demo project';
      }, 3500);
      return;
    }
    state.project = defaultProject();
    state.sel = 0;
    state.t = 0;
    changed('all');
    renderAll();
    toast('Loaded the demo project.');
  }, { class: 'btn small ghost danger', id: 'x-reset' });
  return [
    el.progress,
    section(
      'After Effects',
      h('p', null, 'A zip with a script that rebuilds this animation as a layered After Effects project, plus every image it uses.'),
      h(
        'ul',
        { class: 'bullets' },
        h('li', null, 'Each reel is a precomp driven by one Spin slider with the same start, mid and end keyframes and eases as this preview.'),
        h('li', null, 'Symbols live in one atlas comp: swap an image once and every reel updates.'),
        h('li', null, 'Every win is its own precomp: paylines, pops, titles, coins, counters and the bonus wheel.'),
        h('li', null, 'Counters are driven by Amount sliders, ready for the Odometer plugin.')
      ),
      button('Download After Effects package', startAE, { class: 'btn primary wide', icon: 'download', id: 'x-ae' }),
      h('p', { class: 'hint' }, 'In After Effects: File → Scripts → Run Script File, then pick the .jsx inside the folder.')
    ),
    section(
      'Video',
      segmented({ id: 'x-range', label: 'Range', value: state.exportRange, options: [{ value: 'all', label: 'Whole sequence' }, { value: 'round', label: 'Selected round' }], onChange: (v) => (state.exportRange = v) }),
      selectField({ id: 'x-bitrate', label: 'Quality', value: state.bitrate, options: [{ value: 8e6, label: 'Standard (8 Mbps)' }, { value: 16e6, label: 'High (16 Mbps)' }, { value: 40e6, label: 'Master (40 Mbps)' }], onChange: (v) => (state.bitrate = Number(v)) }),
      button('Render MP4', startMP4, { class: 'btn wide', icon: 'film', id: 'x-mp4' }),
      h('p', { class: 'hint' }, 'Rendered frame by frame at full resolution, so no frames drop.'),
      h('div', { class: 'mov' }, h('strong', null, 'Need a MOV?'), h('p', null, 'Render it from the After Effects package (Render Queue → QuickTime → Apple ProRes), or convert the MP4:'), h('div', { class: 'code' }, h('code', { id: 'x-ffmpeg' }, ffmpeg), button('Copy', async (e) => {
        try {
          await navigator.clipboard.writeText(ffmpeg);
          toast('Command copied.');
        } catch {
          const r = document.createRange();
          r.selectNodeContents(document.getElementById('x-ffmpeg'));
          getSelection().removeAllRanges();
          getSelection().addRange(r);
          toast('Select the command and copy it.');
        }
        void e;
      }, { class: 'btn small', id: 'x-copy' })))
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
      h('p', { class: 'hint' }, 'Includes your uploaded images, so you can reopen the exact animation later.'),
      h(
        'div',
        { class: 'row' },
        button('Save project', () => saveFile(`${slugName()}.json`, new Blob([JSON.stringify(state.project, null, 2)], { type: 'application/json' })), { class: 'btn small', icon: 'download', id: 'x-save' }),
        button('Open project', async () => {
          const [f] = await pickFiles('application/json,.json');
          if (!f) return;
          try {
            state.project = migrate(JSON.parse(await f.text()));
            state.sel = 0;
            state.t = 0;
            changed('all');
            renderAll();
            toast(`Opened ${f.name}.`);
          } catch (err) {
            toast(`That file is not a Reel Studio project: ${err.message}`, 'error', 6000);
          }
        }, { class: 'btn small', icon: 'upload', id: 'x-open' })
      ),
      resetBtn
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
  window.reelStudio = { state, rebuild, renderFrame };
}
