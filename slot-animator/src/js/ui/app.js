// Reel Studio editor: project state, live preview with synced sound, the
// round sequencer and the settings panels. Rendering and exports live in
// their own modules.

import {
  defaultProject,
  classicProject,
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
  GAMES,
  GAME_OUTCOMES,
  HS_OUTCOMES,
  COIN_PALETTES,
} from '../core/defaults.js';
import { holdSpinConfig, symbolLayout, upgradeJackpotCoins, moneyDecimals, formatPrize } from '../core/coins.js';
import { buildTimeline, roundIndexAt } from '../core/timeline.js';
import { computeLayout } from '../core/layout.js';
import { evalVelocity } from '../core/keys.js';
import { lineColor, generatePaylines } from '../core/paylines.js';
import { autoAmount, makeContext, defaultPattern, tumbleEnabled, SPECIAL_ROLES } from '../core/outcomes.js';
import { orderList } from '../core/order.js';
import { FORMAT_CHOICES } from '../core/ae-export.js';
import { loadImage, loadWinAnim, buildResources, fontStack, extraSymbolImages, loadWheelArt, loadPotArt, loadJackpotArt, paintWheelIcon, paintJackpotBox } from '../render/sprites.js';
import { paintBuiltin, paintPot } from '../render/paint.js';
import { loadParticleSprites, drawParticleList } from '../render/particles.js';
import { PARTICLE_TEMPLATES, TEMPLATE_BY_ID, BUILTIN_PARTICLES, PARTICLE_MOTIONS, PARTICLE_MOMENTS, PARTICLE_LENGTHS, tierParticles, spawnParticles, particleAssetInfo } from '../core/particles.js';
import { WIN_STYLES, JUMP_TARGETS, MERGE_POINTS, FLIGHT_PATHS, winFxConfig, jumpTarget, mergeTarget } from '../core/winfx.js';
import { POT_ARTS, POT_AIMS, POT_ROLES, BOOST_KINDS, BEAM_CURVES, defaultPots, potsConfig, potsCollect, potsUpgrade, ownerOf } from '../core/pots.js';
import { JP_PLACES, defaultJackpots, jackpotsConfig, wheelJackpot } from '../core/jackpots.js';
import { JACKPOT_ROUNDS } from '../core/timeline.js';
import { searchFeatures, buildIndex } from './search.js';
import { APPLIES, notApplying } from './applies.js';
import { TIPS, tipEntries } from './tips.js';
import { DEMOS, demoPlan, demoAt } from './demos.js';
import { runGuide } from './guide.js';
import { WHEEL_FRAMINGS, WHEEL_LANDINGS, POINTER_SIDES, LABEL_PALETTES, WHEEL_ICONS, SEGMENT_KINDS, wheelConfig, iconName, autoIcons, autoHeights, segmentKind, wheelLandings } from '../core/wheel.js';
import { parseFontNames, BUILTIN_FONTS, FONT_CATALOG, FONT_CATS, googleFontURL } from '../core/fonts.js';
import { renderFrame } from '../render/renderer.js';
import { decodeCustomSounds, renderSoundtrack, renderCue, audioBufferToWav } from '../render/audio.js';
import { exportMP4, frameToPNG, canEncodeVideo } from '../export/video.js';
import { buildAEPackage } from '../export/aepackage.js';
import { h, clear, icon, rangeField, selectField, segmented, toggleField, textField, section, button, readFileAsDataURL, pickFiles } from './dom.js';

const STORE_KEY = 'reel-studio-project-v2';
const OLD_STORE_KEY = 'reel-studio-project-v1';
const FORMATS = [
  ['1920x1080', 'Landscape HD · 1920 × 1080'],
  ['3840x2160', 'Landscape 4K · 3840 × 2160'],
  ['1280x720', 'Landscape · 1280 × 720'],
  ['1080x1920', 'Portrait story · 1080 × 1920'],
  ['1080x1350', 'Portrait feed · 1080 × 1350'],
  ['1080x1080', 'Square · 1080 × 1080'],
];
const MULT_VALUES = [2, 3, 5, 10, 15, 20, 25, 50, 100, 250, 500];
const WILD_MULT_VALUES = [2, 3, 4, 5, 10];
// Cash symbol values, in bets.
const CASH_VALUES = [0.5, 1, 2, 3, 5, 10, 15, 20, 25, 50, 100];
// Boosters a round can add: [kind, value].
const BOOST_CHOICES = [['wild'], ['upgrade'], ['mult', 2], ['mult', 3], ['mult', 5], ['mult', 10], ['cash', 2], ['cash', 5], ['cash', 10], ['cash', 25], ['cash', 50]];
const ROLES = [
  ['normal', 'Normal'],
  ['wild', 'Wild'],
  ['scatter', 'Scatter'],
  ['multiplier', 'Multiplier'],
  ['mystery', 'Mystery'],
  ['collector', 'Collector'],
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
  // The preview starts muted; exports always carry the sound.
  soundOn: false,
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

// ---------- layout preferences (this browser only, not the project) ----------

const UI_KEY = 'reel-studio-ui-v1';
const PANEL_DEFAULT = { left: 330, right: 352 };
const PANEL_MIN = { left: 260, right: 280 };
const STAGE_MIN = 420;
const ui = loadUI();

function loadUI() {
  const d = { ...PANEL_DEFAULT, bank: { open: false, min: false, x: null, y: null, w: 760, h: 660, filter: 'all' } };
  try {
    const s = JSON.parse(localStorage.getItem(UI_KEY) || 'null');
    if (s) return { ...d, ...s, bank: { ...d.bank, ...(s.bank || {}) } };
  } catch {
    // private mode or blocked storage: defaults
  }
  return d;
}

function saveUI() {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(ui));
  } catch {
    // not kept; the layout still works
  }
}

function storageWorks() {
  try {
    localStorage.setItem(`${UI_KEY}-probe`, '1');
    localStorage.removeItem(`${UI_KEY}-probe`);
    return true;
  } catch {
    return false;
  }
}

// Side panel widths: drag the splitters, or focus one and use the arrow
// keys (Shift for bigger steps, Home/End for the limits). Double-click resets.
// The rail beside the settings panel (its column, with the gap).
const RAIL_W = 72;

function panelMax(side) {
  const other = side === 'left' ? ui.right : ui.leftFolded ? 0 : ui.left;
  return Math.max(PANEL_MIN[side], Math.min(760, window.innerWidth - other - STAGE_MIN - 64 - RAIL_W));
}

function applyWidths() {
  for (const side of ['left', 'right']) ui[side] = Math.round(Math.min(panelMax(side), Math.max(PANEL_MIN[side], ui[side])));
  el.work.style.setProperty('--left-w', `${ui.left}px`);
  el.work.style.setProperty('--right-w', `${ui.right}px`);
  for (const sp of el.splitters) {
    sp.setAttribute('aria-valuenow', ui[sp.dataset.side]);
    sp.setAttribute('aria-valuemax', panelMax(sp.dataset.side));
  }
}

function splitter(side) {
  const label = side === 'left' ? 'Resize the settings panel' : 'Resize the spin rounds panel';
  const sp = h('div', { class: `splitter ${side}`, role: 'separator', tabindex: 0, 'aria-orientation': 'vertical', 'aria-label': label, 'aria-valuemin': PANEL_MIN[side], 'aria-valuenow': ui[side], title: `${label}. Drag, or double-click to reset.` });
  sp.dataset.side = side;
  const dir = side === 'left' ? 1 : -1;
  const done = () => {
    saveUI();
    if (state.tab === 'spin') drawMotionGraph();
  };
  sp.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    sp.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const w0 = ui[side];
    document.body.classList.add('resizing');
    sp.classList.add('drag');
    const move = (ev) => {
      ui[side] = w0 + (ev.clientX - x0) * dir;
      applyWidths();
    };
    const up = () => {
      sp.removeEventListener('pointermove', move);
      sp.removeEventListener('pointerup', up);
      sp.removeEventListener('pointercancel', up);
      document.body.classList.remove('resizing');
      sp.classList.remove('drag');
      done();
    };
    sp.addEventListener('pointermove', move);
    sp.addEventListener('pointerup', up);
    sp.addEventListener('pointercancel', up);
  });
  sp.addEventListener('dblclick', () => {
    ui[side] = PANEL_DEFAULT[side];
    applyWidths();
    done();
  });
  sp.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 64 : 16;
    let w = ui[side];
    if (e.key === 'ArrowLeft') w -= step * dir;
    else if (e.key === 'ArrowRight') w += step * dir;
    else if (e.key === 'Home') w = PANEL_MIN[side];
    else if (e.key === 'End') w = panelMax(side);
    else return;
    e.preventDefault();
    ui[side] = w;
    applyWidths();
    done();
  });
  return sp;
}

// ---------- Asset Bank: a floating window over the editor ----------

// The bank's side bar: each kind of asset with its icon. Effects holds the
// particle art; Scene everything around the machine.
const BANK_FILTERS = [
  ['all', 'All', 'window'],
  ['symbols', 'Symbols', 'grid'],
  ['coins', 'Coins', 'coin'],
  ['effects', 'Effects', 'sparkle'],
  ['wheel', 'Wheel', 'wheel'],
  ['scene', 'Scene', 'palette'],
  ['sounds', 'Sounds', 'sound'],
  ['fonts', 'Fonts', 'text'],
];
const narrow = () => window.matchMedia('(max-width: 760px)').matches;

function buildBank() {
  el.bankBody = h('div', { class: 'bank-body' });
  el.bankFilter = h('nav', { class: 'bank-filter', role: 'tablist', 'aria-label': 'Asset types', 'aria-orientation': 'vertical' });
  el.bankMin = button('', () => setBankMin(!ui.bank.min), { class: 'icon-btn tiny', icon: 'minus', id: 'bank-min', title: 'Minimise' });
  const head = h(
    'header',
    { class: 'bank-head' },
    h('span', { class: 'bank-drag', 'aria-hidden': 'true' }, icon('grid')),
    h('h2', { id: 'bank-title' }, 'Asset Bank'),
    h('div', { class: 'bank-tools' }, el.bankMin, button('', () => closeBank(), { class: 'icon-btn tiny', icon: 'x', id: 'bank-close', title: 'Close (Esc)' }))
  );
  const grip = h('div', { class: 'bank-resize', 'aria-hidden': 'true', title: 'Resize' });
  el.bank = h('section', { class: 'bank', id: 'asset-bank', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'bank-title', hidden: true }, head, h('div', { class: 'bank-main' }, el.bankFilter, el.bankBody), grip);
  // Move by the title bar, resize from the corner.
  const drag = (e, onMove) => {
    if (e.button !== 0 || narrow()) return;
    e.preventDefault();
    const t = e.currentTarget;
    t.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const y0 = e.clientY;
    const b0 = { ...ui.bank };
    document.body.classList.add('dragging');
    const move = (ev) => {
      onMove(b0, ev.clientX - x0, ev.clientY - y0);
      placeBank();
    };
    const up = () => {
      t.removeEventListener('pointermove', move);
      t.removeEventListener('pointerup', up);
      t.removeEventListener('pointercancel', up);
      document.body.classList.remove('dragging');
      saveUI();
    };
    t.addEventListener('pointermove', move);
    t.addEventListener('pointerup', up);
    t.addEventListener('pointercancel', up);
  };
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, select, input, [role="tab"]')) return;
    drag(e, (b0, dx, dy) => {
      ui.bank.x = b0.x + dx;
      ui.bank.y = b0.y + dy;
    });
  });
  head.addEventListener('dblclick', (e) => {
    if (!e.target.closest('button, [role="tab"]')) setBankMin(!ui.bank.min);
  });
  grip.addEventListener('pointerdown', (e) =>
    drag(e, (b0, dx, dy) => {
      ui.bank.w = b0.w + dx;
      ui.bank.h = b0.h + dy;
    })
  );
  el.bank.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeBank();
    }
  });
  return el.bank;
}

function placeBank() {
  const st = el.bank.style;
  if (narrow()) {
    st.left = st.top = st.width = st.height = '';
    return;
  }
  const B = ui.bank;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  B.w = Math.round(Math.max(360, Math.min(B.w, vw - 16)));
  B.h = Math.round(Math.max(260, Math.min(B.h, vh - 16)));
  if (B.x == null || B.y == null) {
    B.x = vw - B.w - 20;
    B.y = 70;
  }
  // Keep the title bar on screen.
  B.x = Math.round(Math.min(vw - 140, Math.max(140 - B.w, B.x)));
  B.y = Math.round(Math.min(vh - 44, Math.max(0, B.y)));
  st.left = `${B.x}px`;
  st.top = `${B.y}px`;
  st.width = `${B.w}px`;
  st.height = B.min ? '' : `${B.h}px`;
}

// Phones scroll the whole page: while the Asset Bank sheet, the guide or a
// dialog covers it, the page stays put and a drag scrolls only what is on
// top (the CSS applies it on phones only).
function syncScrollLock() {
  const over = (ui.bank.open && !ui.bank.min) || !!document.querySelector('body > .modal-back, body > .guide');
  document.documentElement.classList.toggle('scroll-lock', over);
}

function setBankMin(v) {
  ui.bank.min = v;
  el.bank.classList.toggle('min', v);
  syncScrollLock();
  el.bankMin.title = v ? 'Restore' : 'Minimise';
  el.bankMin.setAttribute('aria-label', el.bankMin.title);
  clear(el.bankMin, icon(v ? 'window' : 'minus'));
  placeBank();
  saveUI();
}

function openBank(filter, focus = true) {
  if (filter) ui.bank.filter = filter;
  ui.bank.open = true;
  el.bank.hidden = false;
  el.bankBtn.setAttribute('aria-expanded', 'true');
  el.bankBtn.classList.add('on');
  el.railBank.classList.add('on');
  el.railBank.setAttribute('aria-expanded', 'true');
  renderPhoneBar();
  if (ui.bank.min) setBankMin(false);
  syncScrollLock();
  placeBank();
  renderBank();
  if (focus) el.bank.querySelector('.bank-filter [aria-selected="true"]')?.focus();
  saveUI();
}

function closeBank() {
  stopCue();
  const had = el.bank.contains(document.activeElement);
  ui.bank.open = false;
  el.bank.hidden = true;
  el.bankBtn.setAttribute('aria-expanded', 'false');
  el.bankBtn.classList.remove('on');
  el.railBank.classList.remove('on');
  el.railBank.setAttribute('aria-expanded', 'false');
  renderPhoneBar();
  syncScrollLock();
  if (had) (el.railBank.offsetParent ? el.railBank : el.bankBtn).focus();
  saveUI();
}

function toggleBank() {
  if (ui.bank.open) closeBank();
  else openBank();
}

function bankFilters() {
  const game = gameOf();
  return BANK_FILTERS.filter(([k]) => !(k === 'symbols' && game !== 'slot') && !(k === 'coins' && game === 'wheel'));
}

function renderBank() {
  if (!el.bank || el.bank.hidden) return;
  const filters = bankFilters();
  if (!filters.some(([k]) => k === ui.bank.filter)) ui.bank.filter = 'all';
  clear(
    el.bankFilter,
    filters.map(([k, label, ic]) =>
      h('button', {
        type: 'button',
        role: 'tab',
        id: `bank-f-${k}`,
        class: ui.bank.filter === k ? 'on' : '',
        'aria-selected': String(ui.bank.filter === k),
        tabindex: ui.bank.filter === k ? 0 : -1,
        onclick: () => {
          ui.bank.filter = k;
          saveUI();
          renderBank();
          document.getElementById(`bank-f-${k}`)?.focus();
        },
        onkeydown: (e) => {
          const i = filters.findIndex(([f]) => f === k);
          const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          const next = filters[(i + d + filters.length) % filters.length][0];
          ui.bank.filter = next;
          saveUI();
          renderBank();
          document.getElementById(`bank-f-${next}`)?.focus();
        },
      }, icon(ic), h('span', null, label))
    )
  );
  const scroll = el.bankBody.scrollTop;
  clear(el.bankBody, panelAssets(ui.bank.filter));
  collapsify(el.bankBody, 'bank');
  markTips(el.bankBody);
  el.bankBody.scrollTop = scroll;
  refreshThumbs();
}

// Anything that changes the assets redraws the bank.
function renderAssets() {
  renderBank();
}

// ---------- collapsible sections ----------
// Every settings section folds. Which ones are open is remembered per
// browser; the first sections of each tab start open.

const SECTION_OPEN = {
  machine: ['game', 'reels', 'how-it-pays'],
  spin: ['spin-type', 'motion-curve', 'anticipation'],
  wins: ['win-tiers', 'winning-symbols'],
  effects: ['intensity', 'win-particles'],
  features: ['hold-spin', 'pots-above-the-machine', 'jackpot-boxes'],
  wheel: ['segments', 'framing', 'pointer', 'look', 'spin'],
  sound: ['sound-track'],
  export: ['output', 'after-effects-project', 'quick-preview-mp4'],
  seq: [],
};
const slugOf = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function sectionOpen(key, scope, name) {
  ui.sections = ui.sections || {};
  if (key in ui.sections) return ui.sections[key];
  const list = SECTION_OPEN[scope];
  return !list || list.includes(name);
}

function setSection(sec, open, remember = true) {
  sec.classList.toggle('closed', !open);
  const btn = sec.querySelector(':scope > h3 > .group-toggle');
  const body = sec.querySelector(':scope > .group-body');
  if (btn) btn.setAttribute('aria-expanded', String(open));
  if (body) body.hidden = !open;
  if (remember && sec.dataset.key) {
    ui.sections = ui.sections || {};
    ui.sections[sec.dataset.key] = open;
    saveUI();
  }
  if (open && sec.querySelector('#motion-graph')) drawMotionGraph();
  syncFoldAll(sec.parentElement);
}

// "Fold all" above a panel's sections; it unfolds them all once every one
// is folded.
function foldAllBar(root) {
  const btn = h('button', { type: 'button', class: 'fold-all', onclick: () => {
    const secs = [...root.querySelectorAll(':scope > section.group[data-key]')];
    const open = secs.every((s) => s.classList.contains('closed'));
    for (const s of secs) setSection(s, open);
  } });
  return h('div', { class: 'fold-bar' }, btn);
}

function syncFoldAll(root) {
  const btn = root?.querySelector(':scope > .fold-bar > .fold-all');
  if (!btn) return;
  const folded = [...root.querySelectorAll(':scope > section.group[data-key]')].every((s) => s.classList.contains('closed'));
  clear(btn, icon(folded ? 'unfoldAll' : 'foldAll'), h('span', null, folded ? 'Unfold all' : 'Fold all'));
  btn.title = folded ? 'Open every section (Alt-click a section title does it too)' : 'Fold every section (Alt-click a section title does it too)';
}

// An icon for each section, so a tab reads at a glance.
const SECTION_ICONS = {
  game: 'grid', output: 'film', reels: 'reels', 'jackpot-boxes': 'trophy', 'pots-above-the-machine': 'coin', 'how-it-pays': 'coin', 'hold-spin': 'coin', look: 'palette', money: 'coin', randomness: 'dice',
  'spin-type': 'loop', respins: 'loop', 'reel-order': 'order', 'motion-curve': 'curve', start: 'play', mid: 'loop', end: 'target', 'reel-timing': 'clock', anticipation: 'eye', 'between-rounds': 'clock',
  'win-tiers': 'trophy', 'winning-symbols': 'sparkle', 'win-particles': 'sparkle', 'explosion-templates': 'bolt', 'titles-and-font': 'text', 'win-timing': 'clock',
  intensity: 'bolt', segments: 'wheel', framing: 'target', pointer: 'pointer', spin: 'loop',
  'sound-track': 'sound', 'your-own-sounds': 'sound', 'win-effects': 'bolt', 'after-effects-project': 'download', 'quick-preview-mp4': 'film',
  'soundtrack-wav': 'sound', 'still-frame': 'film', 'project-file': 'folder', 'quick-sequence': 'order',
  symbols: 'grid', coins: 'coin', 'hold-spin-coins': 'coin', 'pot-art': 'coin', 'jackpot-box-art': 'trophy', 'wheel-art': 'wheel', 'scene-art': 'palette', fonts: 'text', 'particle-art': 'sparkle',
};

// Each section title gets its own colour, kept from render to render and
// unlike the few sections above it, so titles stand out from the settings
// between them.
const SECTION_HUES = ['#f4c55b', '#ff7eb3', '#4fe0a5', '#ffa65c', '#6cc7ff', '#b49bff', '#ff7a6b', '#3fd6c6', '#c4e66a'];

function sectionHue(name, recent) {
  let n = 0;
  for (const c of name) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  let i = n % SECTION_HUES.length;
  while (recent.includes(SECTION_HUES[i])) i = (i + 1) % SECTION_HUES.length;
  return SECTION_HUES[i];
}

function collapsify(root, scope) {
  const recent = [];
  const keep = (hue) => recent.push(hue) > 4 && recent.shift();
  for (const sec of root.querySelectorAll(':scope > section.group')) {
    const h3 = sec.querySelector(':scope > h3');
    if (sec.dataset.key) keep(sec.style.getPropertyValue('--sc'));
    if (!h3 || sec.dataset.key) continue;
    const title = h3.textContent;
    const name = slugOf(title);
    const key = `${scope}/${name}`;
    sec.dataset.key = key;
    const body = h('div', { class: 'group-body', id: `sec-${scope}-${name}` });
    for (const node of [...sec.childNodes]) if (node !== h3) body.append(node);
    const ic = SECTION_ICONS[name];
    const hue = sectionHue(name, recent);
    sec.style.setProperty('--sc', hue);
    keep(hue);
    const btn = h('button', { type: 'button', class: 'group-toggle', 'aria-expanded': 'true', 'aria-controls': body.id }, icon('chevron'), ic ? h('span', { class: 'sec-ic', 'aria-hidden': 'true' }, icon(ic)) : null, h('span', null, title));
    btn.addEventListener('click', (e) => {
      // Alt-click folds or unfolds every section in this panel.
      const open = sec.classList.contains('closed');
      if (e.altKey) for (const other of root.querySelectorAll(':scope > section.group[data-key]')) setSection(other, open);
      else setSection(sec, open);
    });
    h3.replaceChildren(btn);
    sec.append(body);
    setSection(sec, sectionOpen(key, scope, name), false);
  }
  if (!root.querySelector(':scope > .fold-bar') && root.querySelectorAll(':scope > section.group[data-key]').length >= 3) root.prepend(foldAllBar(root));
  syncFoldAll(root);
}

// Opens the section around an element (search results land inside folded
// sections too).
function revealSection(node) {
  for (let sec = node.closest('section.group'); sec; sec = sec.parentElement?.closest('section.group')) if (sec.classList.contains('closed')) setSection(sec, true);
  const fold = node.closest('.insp-fold');
  if (fold && !fold.classList.contains('open')) setFold(fold, true);
  const card = node.closest('.feat-card.folded');
  if (card) card.querySelector('.feat-toggle')?.click();
  const menu = node.closest('.feat-menu');
  if (menu?.hidden) {
    insp.menu = true;
    menu.hidden = false;
    document.getElementById('feat-add')?.setAttribute('aria-expanded', 'true');
  }
}

// Round features not in the round yet are found in "Add a feature".
const FEATURE_OF_ID = { 'ri-jackpot': 'jackpot', 'ri-tumble': 'tumble', 'ri-chain-add': 'tumble', 'ri-mult': 'mult', 'ri-mult-add': 'mult', 'ri-expand': 'expand', 'ri-wmult': 'wmult', 'ri-extra-wilds': 'extra', 'ri-mystery': 'mystery', 'ri-cash': 'cash', 'ri-collector': 'cash', 'ri-boost': 'boost' };

function offerFeature(id) {
  const offer = FEATURE_OF_ID[id] && document.getElementById(`feat-add-${FEATURE_OF_ID[id]}`);
  if (!offer) return false;
  insp.menu = true;
  offer.closest('.feat-menu').hidden = false;
  document.getElementById('feat-add')?.setAttribute('aria-expanded', 'true');
  spotlight(offer);
  offer.focus({ preventScroll: true });
  toast('Not in this round yet: add it from Add a feature.', 'info', 4000);
  return true;
}

// ---------- undo / redo ----------
// Snapshots of the project as JSON; uploaded images (data URLs) are stored
// once and referenced, so a long history stays small.

const hist = { past: [], future: [], last: null, timer: null, intern: new Map(), back: new Map() };

function snapshot() {
  return JSON.stringify(state.project, (k, v) => {
    if (typeof v === 'string' && v.length > 256 && v.startsWith('data:')) {
      let id = hist.intern.get(v);
      if (!id) {
        id = `@@asset:${hist.intern.size}`;
        hist.intern.set(v, id);
        hist.back.set(id, v);
      }
      return id;
    }
    return v;
  });
}

function fromSnapshot(str) {
  return JSON.parse(str, (k, v) => (typeof v === 'string' && v.startsWith('@@asset:') ? hist.back.get(v) ?? v : v));
}

function recordNow() {
  clearTimeout(hist.timer);
  hist.timer = null;
  if (!state.project) return;
  const snap = snapshot();
  if (snap === hist.last) return;
  if (hist.last != null) {
    hist.past.push(hist.last);
    if (hist.past.length > 100) hist.past.shift();
  }
  hist.last = snap;
  hist.future = [];
  renderHistoryButtons();
}

function recordSoon() {
  clearTimeout(hist.timer);
  hist.timer = setTimeout(recordNow, 450);
}

function restore(snap, msg) {
  state.project = fromSnapshot(snap);
  hist.last = snap;
  state.sel = Math.min(state.sel, Math.max(0, state.project.rounds.length - 1));
  save();
  rebuild('all');
  renderAll();
  renderHistoryButtons();
  if (ui.bank.open) renderBank();
  toast(msg, 'info', 1600);
}

function undo() {
  if (hist.timer) recordNow();
  if (!hist.past.length) return toast('Nothing to undo.', 'info', 1600);
  hist.future.push(hist.last);
  restore(hist.past.pop(), 'Undone.');
}

function redo() {
  if (hist.timer) recordNow();
  if (!hist.future.length) return toast('Nothing to redo.', 'info', 1600);
  hist.past.push(hist.last);
  restore(hist.future.pop(), 'Redone.');
}

function renderHistoryButtons() {
  if (!el.undoBtn) return;
  el.undoBtn.disabled = !hist.past.length && !hist.timer;
  el.redoBtn.disabled = !hist.future.length;
}

// ---------- the Project menu ----------

function newProject() {
  const p = defaultProject();
  p.name = 'Untitled slot';
  p.rounds = [];
  loadProject(p, 'New project: pick a quick sequence or add rounds on the right. Undo brings the old one back.');
}

function clearRounds() {
  if (!state.project.rounds.length) return toast('There are no rounds to clear.', 'info');
  state.project.rounds = [];
  state.sel = 0;
  state.t = 0;
  changed('timeline');
  renderSequence();
  toast('All rounds cleared. Undo brings them back.', 'info', 4000);
}

function saveProjectFile() {
  return saveFile(`${slugName()}.json`, new Blob([JSON.stringify(state.project, null, 2)], { type: 'application/json' }));
}

async function openProjectFile() {
  const [f] = await pickFiles('application/json,.json');
  if (!f) return;
  try {
    loadProject(checkedProject(JSON.parse(await f.text())), `Opened ${f.name}.`);
  } catch (e) {
    toast(`Could not open ${f.name}: ${e.message}`, 'error', 6000);
  }
}

function projectMenuItems() {
  return [
    { id: 'pm-new', label: 'New project', hint: 'Default machine, no rounds', run: newProject },
    { id: 'pm-open', label: 'Open project file…', kbd: 'Ctrl O', run: openProjectFile },
    { id: 'pm-save', label: 'Save project file', kbd: 'Ctrl S', hint: 'Downloads a .json you can open again', run: saveProjectFile },
    { id: 'pm-presets', label: 'Start from a preset…', kbd: 'P', hint: `${PRESETS.length} ready-made animations to build on`, run: () => openPresets() },
    { sep: true },
    { id: 'pm-clear', label: 'Clear all rounds', hint: 'Keeps the machine and the art', run: clearRounds },
    { id: 'pm-reset', label: 'Reset to the demo project', run: () => loadProject(classicProject(), 'Back to the demo project. Undo brings yours back.') },
    { sep: true },
    { id: 'pm-undo', label: 'Undo', kbd: 'Ctrl Z', run: undo },
    { id: 'pm-redo', label: 'Redo', kbd: 'Ctrl Shift Z', run: redo },
    { sep: true },
    { id: 'pm-guide', label: 'Take the tour', hint: 'The first run guide, about a minute', run: () => startGuide() },
    { id: 'pm-keys', label: 'Keyboard shortcuts', kbd: '?', run: showShortcuts },
  ];
}

function buildProjectMenu() {
  el.pmBtn = h('button', { type: 'button', class: 'btn', id: 'top-project', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'project-menu' }, icon('folder'), h('span', null, 'Project'));
  el.pm = h('div', { class: 'menu', id: 'project-menu', role: 'menu', 'aria-labelledby': 'top-project', hidden: true });
  const close = (refocus = true) => {
    el.pm.hidden = true;
    el.pmBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    if (refocus) el.pmBtn.focus();
  };
  const outside = (e) => {
    if (!el.pm.contains(e.target) && !el.pmBtn.contains(e.target)) close(false);
  };
  const open = () => {
    clear(
      el.pm,
      projectMenuItems().map((it) =>
        it.sep
          ? h('div', { class: 'menu-sep', role: 'separator' }, it.label ? h('span', null, it.label) : null)
          : h('button', { type: 'button', role: 'menuitem', class: 'menu-item', id: it.id, tabindex: -1, onclick: () => { close(); it.run(); } }, h('span', { class: 'menu-label' }, it.label, it.hint ? h('small', null, it.hint) : null), it.kbd ? h('kbd', null, it.kbd) : null)
      ),
      h('p', { class: 'menu-foot' }, 'Your project is also kept in this browser automatically.')
    );
    el.pm.hidden = false;
    el.pmBtn.setAttribute('aria-expanded', 'true');
    el.pm.querySelector('.menu-item')?.focus();
    document.addEventListener('pointerdown', outside, true);
  };
  el.pmBtn.addEventListener('click', () => (el.pm.hidden ? open() : close()));
  el.pmBtn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && el.pm.hidden) {
      e.preventDefault();
      open();
    }
  });
  el.pm.addEventListener('keydown', (e) => {
    const items = [...el.pm.querySelectorAll('.menu-item')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      items[e.key === 'Home' ? 0 : items.length - 1].focus();
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.stopPropagation();
      close(e.key === 'Escape');
    }
  });
  return h('div', { class: 'menu-wrap' }, el.pmBtn, el.pm);
}

// ---------- feature search ----------

const SEARCH_ACTIONS = {
  foldAll: () => {
    const btn = document.querySelector('#settings-panel > .fold-bar .fold-all');
    if (!btn) return toast('This tab has too few sections to fold.', 'info');
    btn.click();
    spotlight(btn);
  },
  fold: () => {
    if (window.matchMedia('(max-width: 1240px)').matches) return toast('The settings panel folds away on wider windows.', 'info');
    setLeftFolded(!ui.leftFolded);
    toast(ui.leftFolded ? 'Settings folded away. Click any tab on the left rail to bring them back.' : 'Settings are back.', 'info', 4000);
  },
  new: () => newProject(),
  open: () => openProjectFile(),
  save: () => saveProjectFile(),
  presets: () => openPresets(),
  clear: () => clearRounds(),
  reset: () => loadProject(classicProject(), 'Back to the demo project. Undo brings yours back.'),
  undo: () => undo(),
  redo: () => redo(),
  keys: () => showShortcuts(),
  guide: () => startGuide(),
  bank: () => openBank(),
  splitters: () => {
    const sp = el.splitters[0];
    if (sp && sp.offsetParent) {
      sp.focus();
      spotlight(sp);
      toast('Drag the divider, or use the arrow keys while it is focused. Double-click resets.', 'info', 4500);
    } else toast('The side panels resize on wider windows.', 'info');
  },
};

function spotlight(node) {
  const target = node.closest('.field, .toggle, .pfx-row, .sym, .asset-row, .jp-rows, section.group') || node;
  target.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  target.classList.remove('found');
  void target.offsetWidth;
  target.classList.add('found');
  setTimeout(() => target.classList.remove('found'), 2200);
}

// A link to a related setting that lives elsewhere: it opens that tab (or
// the Asset Bank, or a fitting round), unfolds the section and highlights
// the setting, as a search result does. go: { tab | bank | round, id, section }.
function moreLink(where, go, text = 'More settings') {
  return h(
    'button',
    { type: 'button', class: 'more-link', onclick: () => goToFeature({ title: where, go }), title: `Go to ${where}` },
    h('span', { class: 'more-link-text' }, `${text}: `),
    h('strong', null, where),
    icon('arrow')
  );
}

// Takes the user to a feature: the right tab, bank filter or round, the
// section unfolded, the control scrolled into view, highlighted and focused.
function goToFeature(f) {
  closeSearch();
  const g = f.go;
  if (g.action) return SEARCH_ACTIONS[g.action]?.();
  let root = document;
  if (g.tab) {
    if (state.tab !== g.tab || ui.leftFolded) showTab(g.tab);
  } else if (g.bank) {
    openBank(g.bank, false);
    root = el.bank;
  } else if (g.round) {
    const P = state.project;
    const fits = (r) => r && (g.round === 'any' || g.round.includes(r.outcome));
    if (!fits(P.rounds[state.sel])) {
      const i = P.rounds.findIndex(fits);
      if (i < 0) return toast(`Add a round with a ${g.round.map((o) => OUTCOME_BY_ID[o]?.label || o).join(' or ')} outcome to see “${f.title}”.`, 'info', 5000);
      selectRound(i, true);
    }
  }
  requestAnimationFrame(() => {
    let node = g.id ? document.getElementById(g.id) : null;
    if (!node && g.section) node = (root === document ? document : root).querySelector(`section.group[data-key$="${g.section}"]`);
    if (!node && g.tab) node = el.panel;
    if (!node && g.round && offerFeature(g.id)) return;
    if (!node) return toast(f.when || `“${f.title}” is not shown for this project right now.`, 'info', 5000);
    revealSection(node);
    if (f.when && g.id && !document.getElementById(g.id)) toast(f.when, 'info', 5000);
    spotlight(node);
    if (/^(INPUT|SELECT|BUTTON|TEXTAREA)$/.test(node.tagName) && !node.disabled) node.focus({ preventScroll: true });
    else node.querySelector?.('.seg button.on, input, select, button, .group-toggle')?.focus({ preventScroll: true });
    // The floating Asset Bank folds away if it covers what was found.
    if (ui.bank.open && !el.bank.contains(node) && !narrow()) {
      setTimeout(() => {
        const a = el.bank.getBoundingClientRect();
        const b = node.getBoundingClientRect();
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) setBankMin(true);
      }, 450);
    }
  });
}

// Every labelled control in the editor, read from the panels themselves:
// each settings tab, the Asset Bank, the quick sequence and the round
// inspector for every outcome of this game. Rendered off screen; the
// editor's own references are put back afterwards.
function labelOf(c, root) {
  if (c.classList.contains('seg')) return c.closest('.field')?.querySelector(':scope > .label')?.textContent || c.getAttribute('aria-label');
  const lab = c.id ? root.querySelector(`label[for="${CSS.escape(c.id)}"]`) : null;
  // A card button (name plus description): its name is the first part.
  const parts = c.tagName === 'BUTTON' ? [...c.children].filter((x) => x.tagName !== 'svg' && x.textContent.trim()) : [];
  const btn = parts.length > 1 ? parts[0].textContent : c.tagName === 'BUTTON' ? c.textContent : '';
  const text = (lab ? lab.textContent : '') || c.getAttribute('aria-label') || btn || '';
  return text.replace(/\s+/g, ' ').trim();
}

function describeOf(c) {
  const parts = c.tagName === 'BUTTON' ? [...c.children].filter((x) => x.tagName !== 'svg' && x.textContent.trim()) : [];
  return parts.slice(1).map((x) => x.textContent).join(' ');
}

function harvestFrom(root, base) {
  const out = [];
  for (const c of root.querySelectorAll('input[id], select[id], textarea[id], button[id], .seg[id]')) {
    if (/-num$/.test(c.id) || c.type === 'file') continue;
    const inSeg = c.tagName === 'BUTTON' && c.parentElement?.classList.contains('seg');
    let title = labelOf(c, root);
    if (!title || title.length < 2) continue;
    // A bare "Add" or "Upload" button is named after its field.
    if (/^(add|upload|replace|clear|remove|delete|reset|browse|pick)$/i.test(title)) {
      const field = c.closest('.field')?.querySelector(':scope > .label')?.textContent?.trim();
      if (!field) continue;
      title = `${field}: ${title.toLowerCase()}`;
    }
    const sec = c.closest('section.group')?.querySelector(':scope > h3')?.textContent?.trim();
    const group = inSeg ? labelOf(c.parentElement, root) : '';
    const hint = c.closest('.field')?.querySelector(':scope > .hint')?.textContent || '';
    const opts = c.tagName === 'SELECT' ? [...c.options].slice(0, 14).map((o) => o.textContent).join(' ') : '';
    out.push({ title, where: [base.where, sec, group].filter(Boolean).join(' › '), keys: [group, hint, opts, c.title || '', describeOf(c)].filter(Boolean).join(' '), go: { ...base.go, id: c.id } });
  }
  for (const h3 of root.querySelectorAll('section.group > h3')) {
    const t = h3.textContent.trim();
    if (t) out.push({ title: t, where: base.where, keys: 'section', go: { ...base.go, section: slugOf(t) } });
  }
  return out;
}

function harvestLabels() {
  const keep = { ...el };
  // Panels tidy the project as they render (default lists and the like):
  // harvest on a copy so search never changes it. Images stay shared.
  const real = state.project;
  state.project = fromSnapshot(snapshot());
  const P = state.project;
  const keepSel = state.sel;
  const out = [];
  const take = (fn, base) => {
    try {
      const box = h('div', null, fn());
      out.push(...harvestFrom(box, base));
    } catch {
      // A panel that cannot render off screen is simply not indexed.
    }
  };
  try {
    const panels = { machine: panelMachine, spin: panelSpin, wins: panelWins, effects: panelEffects, wheel: panelWheel, sound: panelSound, export: panelExport };
    const tabLabel = Object.fromEntries(TABS.map(([k, l]) => [k, l]));
    for (const [k, fn] of Object.entries(panels)) take(fn, { where: tabLabel[k], go: { tab: k } });
    take(() => panelAssets('all'), { where: 'Asset Bank', go: { bank: 'all' } });
    take(builderCard, { where: 'Rounds › Quick sequence', go: { section: 'seq/quick-sequence' } });
    for (const o of GAME_OUTCOMES[gameOf()] || GAME_OUTCOMES.slot) {
      P.rounds = [newRound(o)];
      state.sel = 0;
      el.inspector = h('div');
      try {
        renderInspector();
        out.push(...harvestFrom(el.inspector, { where: `Round inspector (${OUTCOME_BY_ID[o]?.label || o})`, go: { round: [o] } }));
      } catch {
        // skip this outcome
      }
    }
  } finally {
    state.project = real;
    state.sel = keepSel;
    for (const k of Object.keys(el)) if (!(k in keep)) delete el[k];
    Object.assign(el, keep);
  }
  // Inspector controls read the same for every outcome: one entry each.
  return out.map((e) => (e.go.round ? { ...e, where: 'Round inspector' } : e));
}

// The harvested index is kept and rebuilt in idle time after changes, so
// the search opens at once.
let searchIndex = null;
let indexTimer = null;

function invalidateSearchIndex() {
  searchIndex = null;
  clearTimeout(indexTimer);
  indexTimer = setTimeout(function build() {
    if (searchIndex) return;
    if (state.playing || state.busy) {
      indexTimer = setTimeout(build, 2000);
      return;
    }
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 0));
    idle(() => {
      if (!searchIndex) searchIndex = buildIndex([...harvestLabels(), ...tipEntries()]);
    });
  }, 1500);
}

function closeSearch() {
  if (!el.search) return;
  el.search.remove();
  el.search = null;
}

function openSearch() {
  if (el.search) return el.searchInput.focus();
  const index = searchIndex || (searchIndex = buildIndex([...harvestLabels(), ...tipEntries()]));
  let results = [];
  let active = 0;
  const list = h('ul', { class: 'search-results', id: 'search-results', role: 'listbox', 'aria-label': 'Features' });
  const input = h('input', { type: 'search', id: 'search-input', placeholder: 'Search features: try “confetti”, “fly to score”, “save”…', autocomplete: 'off', spellcheck: 'false', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'search-results', 'aria-autocomplete': 'list' });
  el.searchInput = input;
  const paint = () => {
    results = searchFeatures(input.value, index);
    active = Math.min(active, Math.max(0, results.length - 1));
    clear(
      list,
      results.length
        ? results.map((r, i) =>
            h(
              'li',
              { role: 'option', id: `sr-${i}`, class: i === active ? 'on' : '', 'aria-selected': String(i === active), onclick: () => goToFeature(r.feature), onpointermove: () => { if (active !== i) { active = i; paint(); } } },
              h('span', { class: 'sr-title' }, r.feature.title),
              h('span', { class: 'sr-where' }, r.feature.where),
              r.via ? h('span', { class: 'sr-via' }, `matches “${r.via}”`) : null
            )
          )
        : h('li', { class: 'sr-none', role: 'option', 'aria-disabled': 'true' }, 'Nothing found. Try another word: synonyms and small typos are fine.')
    );
    input.setAttribute('aria-activedescendant', results.length ? `sr-${active}` : '');
    list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  };
  input.addEventListener('input', () => {
    active = 0;
    paint();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length) active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      paint();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[active]) goToFeature(results[active].feature);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeSearch();
      el.searchBtn.focus();
    }
  });
  el.search = h(
    'div',
    { class: 'modal-back search-back', onpointerdown: (e) => e.target === el.search && closeSearch() },
    h(
      'div',
      { class: 'search', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Search features' },
      h('div', { class: 'search-field' }, icon('search'), input, h('kbd', null, 'Esc')),
      h('p', { class: 'search-head' }, 'Popular'),
      list,
      h('p', { class: 'search-foot' }, h('span', null, h('kbd', null, '↑'), h('kbd', null, '↓'), ' move'), h('span', null, h('kbd', null, 'Enter'), ' go there'), h('span', null, 'Synonyms and typos understood'))
    )
  );
  input.addEventListener('input', () => {
    el.search.querySelector('.search-head').hidden = !!input.value.trim();
  });
  document.body.append(el.search);
  paint();
  input.focus();
}

// ---------- presets gallery ----------
// Every preset as a card with a frame of its own animation, grouped by
// kind. Picking one replaces the project (undo brings it back).

const presetShots = new Map();

// A telling moment of a preset: the last round's big moment.
function presetMoment(tl) {
  const R = tl.rounds[tl.rounds.length - 1];
  if (!R) return 0.5;
  const p = R.pres;
  if (p.wheel) return p.wheel.spinEnd - 0.9;
  // The machine with its winners lit beats a title that covers it.
  if (p.steps?.length) return p.steps[0].start + 0.55;
  if (p.collect) return p.collect.start + 0.9;
  if (p.overlay) return p.overlay.tierTimes[p.overlay.tierTimes.length - 1] + 0.6;
  return R.spinEnd + 0.2;
}

async function presetShot(pr) {
  if (presetShots.has(pr.id)) return presetShots.get(pr.id);
  // Painted small: the layout scales with the canvas, and it is quicker.
  const project = pr.make();
  const port = project.canvas.height > project.canvas.width;
  project.canvas = { ...project.canvas, width: port ? 360 : 640, height: port ? 640 : 360 };
  const tl = buildTimeline(project);
  const L = computeLayout(project);
  const images = await loadImages(project);
  const res = buildResources(project, L, images);
  const big = document.createElement('canvas');
  big.width = L.W;
  big.height = L.H;
  renderFrame(big.getContext('2d'), { project, tl, L, res }, presetMoment(tl));
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 216;
  const g = c.getContext('2d');
  g.fillStyle = '#07050c';
  g.fillRect(0, 0, c.width, c.height);
  const k = Math.min(c.width / L.W, c.height / L.H);
  g.drawImage(big, (c.width - L.W * k) / 2, (c.height - L.H * k) / 2, L.W * k, L.H * k);
  const url = c.toDataURL('image/jpeg', 0.82);
  presetShots.set(pr.id, url);
  return url;
}

function presetTags(pr) {
  const p = pr.make();
  const game = GAMES.find((g) => g.id === p.game)?.label || p.game;
  const tags = [game];
  if (p.game !== 'wheel') tags.push(`${p.grid.reels}×${p.grid.rows}`);
  if (p.game === 'slot') tags.push(PAY_MODES.find((m) => m.id === p.machine.payMode)?.label || p.machine.payMode);
  if (p.canvas.height > p.canvas.width) tags.push('9:16');
  return tags;
}

function closePresets(refocus = true) {
  if (!el.presets) return;
  el.presets.remove();
  el.presets = null;
  if (refocus) document.getElementById('top-presets')?.focus();
}

function openPresets() {
  if (el.presets) return;
  ui.seenPresets = true;
  saveUI();
  const groups = [...new Set(PRESETS.map((p) => p.group))];
  const shots = [];
  const card = (pr) => {
    const img = h('img', { alt: '', class: 'preset-shot' });
    shots.push([img, pr]);
    return h(
      'button',
      {
        type: 'button',
        class: 'preset-card',
        id: `preset-${pr.id}`,
        onclick: () => {
          closePresets(false);
          loadProject(pr.make(), `Started from “${pr.label}”. Undo brings your project back.`);
        },
      },
      h('span', { class: 'preset-frame' }, img),
      h('strong', null, pr.label),
      h('span', { class: 'preset-desc' }, pr.desc),
      h('span', { class: 'preset-tags' }, presetTags(pr).map((t) => h('span', null, t)))
    );
  };
  el.presets = h(
    'div',
    { class: 'modal-back presets-back', onpointerdown: (e) => e.target === el.presets && closePresets() },
    h(
      'div',
      { class: 'modal presets', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'presets-title', onkeydown: (e) => e.key === 'Escape' && (e.stopPropagation(), closePresets()) },
      h(
        'header',
        { class: 'modal-head' },
        h('div', null, h('h2', { id: 'presets-title' }, 'Start from a preset'), h('p', { class: 'hint' }, 'A ready-made animation to build on: change the art, the rounds and the timing from there. Undo brings your current project back.')),
        button('', () => closePresets(), { class: 'icon-btn tiny', icon: 'x', id: 'presets-close', title: 'Close (Esc)' })
      ),
      h(
        'div',
        { class: 'presets-body' },
        groups.map((g) => h('section', { class: 'preset-group' }, h('h3', null, g), h('div', { class: 'preset-grid' }, PRESETS.filter((p) => p.group === g).map(card))))
      ),
      h('footer', { class: 'presets-foot' }, button('Start blank instead', () => { closePresets(false); newProject(); }, { class: 'btn small ghost', id: 'presets-blank' }), h('span', { class: 'hint' }, 'Also in the Project menu. Press P any time.'))
    )
  );
  document.body.append(el.presets);
  el.presets.querySelector('.preset-card')?.focus();
  // Thumbnails render one at a time so the window opens at once.
  (async () => {
    for (const [img, pr] of shots) {
      if (!el.presets) return;
      await new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 120 }) : setTimeout(r, 16)));
      try {
        img.src = await presetShot(pr);
        img.classList.add('in');
      } catch {
        img.classList.add('in');
      }
    }
  })();
}

// ---------- first run guide ----------
// Shows itself once, where the browser remembers that; Project › Take the
// tour (or search) runs it again any time.

function startGuide(first = false) {
  if (el.guide) return;
  closeSearch();
  closePresets(false);
  el.keys?.remove();
  el.keys = null;
  if (state.pick) endPick();
  // The floating Asset Bank would cover what the tour lights.
  if (ui.bank.open && !narrow()) setBankMin(true);
  ui.seenGuide = true;
  ui.seenPresets = true;
  saveUI();
  el.guide = runGuide({
    onPresets: () => openPresets(),
    onClose: (how) => {
      el.guide = null;
      if (first && how === 'skipped') toast('The tour is in the Project menu whenever you want it.', 'info', 5000);
    },
  });
}

// ---------- keyboard shortcuts ----------

const SHORTCUTS = [
  ['Ctrl K  or  /', 'Search every feature'],
  ['Space', 'Play / pause'],
  ['← →', 'Step one frame (Shift: one second)'],
  ['Home', 'Back to the start'],
  ['B', 'Asset Bank'],
  ['P', 'Start from a preset'],
  ['Ctrl Z', 'Undo'],
  ['Ctrl Shift Z  or  Ctrl Y', 'Redo'],
  ['Ctrl S', 'Save the project file'],
  ['Ctrl O', 'Open a project file'],
  ['?', 'This list'],
  ['Alt-click a section title', 'Fold or unfold every section'],
  ['Click the open tab on the rail', 'Fold the settings panel away (any tab brings it back)'],
];

function showShortcuts() {
  if (el.keys && !el.keys.hidden) return;
  const closeK = () => {
    el.keys.remove();
    el.keys = null;
  };
  el.keys = h(
    'div',
    { class: 'modal-back', onclick: (e) => e.target === el.keys && closeK() },
    h(
      'div',
      { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'keys-title', onkeydown: (e) => e.key === 'Escape' && (e.stopPropagation(), closeK()) },
      h('header', { class: 'modal-head' }, h('h2', { id: 'keys-title' }, 'Keyboard shortcuts'), button('', closeK, { class: 'icon-btn tiny', icon: 'x', id: 'keys-close', title: 'Close' })),
      h('dl', { class: 'keys' }, SHORTCUTS.map(([k, d]) => [h('dt', null, k.split('  ').map((x, i) => [i ? h('span', { class: 'or' }, ' ') : null, ...x.replace(/^or /, '').split(' ').map((p) => (p === 'or' ? h('span', { class: 'or' }, 'or') : h('kbd', null, p)))])), h('dd', null, d)]))
    )
  );
  document.body.append(el.keys);
  el.keys.querySelector('#keys-close').focus();
}

// ---------- persistence ----------

// A saved value fills in the default; a missing, null or wrongly typed one
// (a list where a list belongs, a section where a section belongs) keeps it.
function deepMerge(a, b) {
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  if (b === undefined || b === null) return a === undefined ? b : a;
  if (Array.isArray(a)) return Array.isArray(b) ? b : a;
  if (isObj(a)) {
    if (!isObj(b)) return a;
    const out = { ...a };
    for (const k of Object.keys(b)) out[k] = deepMerge(a[k], b[k]);
    return out;
  }
  return b;
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
  if (!p || typeof p !== 'object' || Array.isArray(p) || !['rounds', 'grid', 'machine', 'symbols'].some((k) => k in p)) throw new Error('this is not a Reel Studio project');
  const out = deepMerge(defaultProject(), upgradeV1(p) || {});
  if (!Array.isArray(out.symbols) || !out.symbols.length) out.symbols = defaultProject().symbols;
  out.symbols = out.symbols.map((s) => ({ winAnim: null, ...s }));
  if (!Array.isArray(out.tiers) || !out.tiers.length) out.tiers = defaultTiers();
  if (!Array.isArray(out.rounds)) out.rounds = [];
  if (!Array.isArray(out.wheel.segments) || out.wheel.segments.length < 2) out.wheel.segments = DEFAULT_SEGMENTS.map((s) => ({ ...s }));
  if (!Array.isArray(out.output.formats) || !out.output.formats.length) out.output.formats = [`${out.canvas.width}x${out.canvas.height}`];
  out.rounds = out.rounds.map((r) => ({ ...newRound(OUTCOME_BY_ID[r.outcome] ? r.outcome : 'none'), ...r, outcome: OUTCOME_BY_ID[r.outcome] ? r.outcome : 'none' }));
  // A hand-edited file may hold any numbers: keep the machine in range.
  const lim = (v, a, b, d) => (Number.isFinite(Number(v)) ? Math.min(b, Math.max(a, Number(v))) : d);
  out.grid.reels = Math.round(lim(out.grid.reels, 3, 8, 5));
  out.grid.rows = Math.round(lim(out.grid.rows, 1, 7, 3));
  out.grid.peek = lim(out.grid.peek, 0, 0.5, 0);
  out.grid.cellAspect = lim(out.grid.cellAspect, 0.6, 1.4, 0.92);
  out.grid.curvature = lim(out.grid.curvature, 0, 1, 0);
  out.canvas.width = Math.round(lim(out.canvas.width, 64, 8192, 1920));
  out.canvas.height = Math.round(lim(out.canvas.height, 64, 8192, 1080));
  out.canvas.fps = Math.round(lim(out.canvas.fps, 1, 120, 30));
  upgradeJackpotCoins(out);
  out.version = 2;
  return out;
}

// A project read from a file or storage, checked by building it once.
function checkedProject(raw) {
  const p = migrate(raw);
  buildTimeline(p);
  computeLayout(p);
  return p;
}

// The saved project. One that no longer builds is put aside (under
// "<key>-unreadable") and the editor starts from the demo.
let savedBroken = false;
function loadSaved() {
  for (const k of [STORE_KEY, OLD_STORE_KEY]) {
    let s = null;
    try {
      s = localStorage.getItem(k);
      if (s) return checkedProject(JSON.parse(s));
    } catch {
      if (s) {
        savedBroken = true;
        try {
          localStorage.setItem(`${k}-unreadable`, s);
        } catch {
          // storage full: nothing more to keep
        }
      }
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
        toast('This project is too large to keep in the browser automatically. Save the project file from the Project menu (Ctrl S).', 'warn', 6000);
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
  recordSoon();
  invalidateSearchIndex();
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
  await withTimeout(registerFonts(project), 4000);
  const fams = [project.effects.font || 'Bungee', project.wheel?.labelFont].filter(Boolean);
  await withTimeout(Promise.all(fams.map(ensureWebFont)), 4000);
  await withTimeout(Promise.all(fams.map((f) => document.fonts.load(`64px "${f}"`).catch(() => null))), 2500);
  const symbols = await Promise.all(project.symbols.map((s) => symbolImage(s, font)));
  // Then the built-in orb (when needed), the Hold & Spin coins and the empty cell.
  symbols.push(...(await extraSymbolImages(project, font, optImage)));
  return {
    symbols,
    winAnims: await Promise.all(project.symbols.map((s) => winAnimFor(s.winAnim))),
    background: await optImage(project.assets.background),
    frame: await optImage(project.assets.frame),
    logo: await optImage(project.assets.logo),
    particles: await loadParticleSprites(project, (src) => optImage(src).then((i) => i || Promise.reject(new Error('bad image')))),
    wheel: await loadWheelArt(project, optImage),
    pots: await loadPotArt(project, optImage),
    jackpots: await loadJackpotArt(project, optImage),
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
    if (ui.bank.open && kind === 'all') refreshThumbs();
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
  drawMarker();
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
  el.pickNote = h('div', { class: 'pick-note', role: 'status', hidden: true });
  el.viewport.append(el.badge, el.pickNote);
  el.canvas.addEventListener('click', onPreviewClick);
  el.transport = h('div', { class: 'transport' });
  el.phoneTp = h('div', { class: 'phone-tp', role: 'group', 'aria-label': 'Playback' });
  el.timeline = h('div', { class: 'timeline' });
  el.tabs = h('nav', { class: 'tabs', role: 'tablist', 'aria-label': 'Settings' });
  el.railTabs = h('div', { class: 'rail-tabs', role: 'tablist', 'aria-label': 'Settings', 'aria-orientation': 'vertical' });
  el.railBank = button('Assets', toggleBank, { class: 'rail-bank', icon: 'grid', id: 'rail-bank', title: 'Asset Bank: symbols, coins, particles and scene art (B)' });
  el.railBank.setAttribute('aria-expanded', 'false');
  el.railBank.setAttribute('aria-controls', 'asset-bank');
  el.rail = h('nav', { class: 'rail', 'aria-label': 'Settings and assets' }, el.railTabs, el.railBank);
  tabKeys(el.tabs, false);
  tabKeys(el.railTabs, true);
  el.panel = h('div', { class: 'panel-body', id: 'settings-panel' });
  el.sequence = h('div', { class: 'panel-body' });
  el.toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
  const goExport = (fn) => () => {
    showTab('export');
    fn();
  };
  clear(
    app,
    h(
      'header',
      { class: 'top' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, '7'), h('div', null, h('div', { class: 'brand-name' }, 'Reel Studio'), h('div', { class: 'brand-sub' }, 'Slot win animator'))),
      h(
        'div',
        { class: 'top-left' },
        buildProjectMenu(),
        button('Presets', () => openPresets(), { class: 'btn', icon: 'sparkle', id: 'top-presets', title: 'Start from a ready-made animation (P)' }),
        (el.undoBtn = button('', undo, { class: 'icon-btn', icon: 'undo', id: 'top-undo', title: 'Undo (Ctrl Z)', disabled: true })),
        (el.redoBtn = button('', redo, { class: 'icon-btn', icon: 'redo', id: 'top-redo', title: 'Redo (Ctrl Shift Z)', disabled: true })),
        (el.searchBtn = h('button', { type: 'button', class: 'search-btn', id: 'top-search', onclick: () => openSearch(), 'aria-haspopup': 'dialog' }, icon('search'), h('span', null, 'Search features'), h('kbd', null, 'Ctrl K')))
      ),
      el.transport,
      h(
        'div',
        { class: 'top-actions' },
        (el.bankBtn = button('Asset Bank', toggleBank, { class: 'btn', icon: 'grid', id: 'top-bank', title: 'Symbols, coins, particles and scene art in their own window (B)' })),
        button('Preview MP4', goExport(startMP4), { class: 'btn', icon: 'film', id: 'top-mp4', title: 'Render a quick MP4 preview with sound' }),
        button('After Effects', goExport(startAE), { class: 'btn primary', icon: 'download', id: 'top-ae', title: 'Download the After Effects project package' })
      )
    ),
    (el.work = h(
      'div',
      { class: `work${ui.leftFolded ? ' left-folded' : ''}` },
      el.rail,
      h('aside', { class: 'side left', 'aria-label': 'Settings' }, el.tabs, el.panel),
      splitter('left'),
      h('main', { class: 'stage' }, el.viewport, el.phoneTp, el.timeline),
      splitter('right'),
      h('aside', { class: 'side right', 'aria-label': 'Spin rounds' }, el.sequence)
    )),
    buildBank(),
    (el.phoneBar = h('nav', { class: 'phone-bar', 'aria-label': 'Show' })),
    el.toasts
  );
  renderPhoneBar();
  el.splitters = [...el.work.querySelectorAll('.splitter')];
  el.bankBtn.setAttribute('aria-controls', 'asset-bank');
  el.bankBtn.setAttribute('aria-expanded', 'false');
  applyWidths();
  window.addEventListener('resize', () => {
    applyWidths();
    if (ui.bank.open) placeBank();
  });
  new ResizeObserver(() => fitCanvas()).observe(el.viewport);
  document.addEventListener('keydown', onKey);
  // Dialogs and the guide come and go as children of the page.
  new MutationObserver(syncScrollLock).observe(document.body, { childList: true });
  initTips();
}

function seek(t) {
  state.t = Math.min(state.scene.tl.duration, Math.max(0, t));
  if (state.playing) startAudio();
  draw();
}

function onKey(e) {
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'select' || tag === 'textarea' || e.target.isContentEditable;
  const mod = e.ctrlKey || e.metaKey;
  // Work everywhere, even while typing in a field.
  if (mod && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    return openSearch();
  }
  if (mod && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    return saveProjectFile();
  }
  if (mod && (e.key === 'o' || e.key === 'O')) {
    e.preventDefault();
    return openProjectFile();
  }
  if (e.key === 'Escape' && state.pick) return endPick();
  if (typing) return;
  if (mod && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    return e.shiftKey ? redo() : undo();
  }
  if (mod && (e.key === 'y' || e.key === 'Y')) {
    e.preventDefault();
    return redo();
  }
  if (e.key === '/' && !mod) {
    e.preventDefault();
    return openSearch();
  }
  if (e.key === '?') return showShortcuts();
  if (!state.scene) return;
  const fd = 1 / state.scene.tl.fps;
  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
  } else if ((e.key === 'b' || e.key === 'B') && !e.metaKey && !e.ctrlKey && !e.altKey) toggleBank();
  else if ((e.key === 'p' || e.key === 'P') && !e.metaKey && !e.ctrlKey && !e.altKey) openPresets();
  else if (e.key === 'Escape' && ui.bank.open) closeBank();
  else if (e.key === 'ArrowRight') seek(state.t + (e.shiftKey ? 1 : fd));
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
  renderPhoneTransport();
  updatePlayhead();
}

// ---------- phones ----------
// The preview stays pinned at the top with a small playback strip; a bar at
// the bottom switches the area below between the rounds and the settings,
// and opens the Asset Bank. Wider screens never show either.

function renderPhoneTransport() {
  if (!el.phoneTp) return;
  const soundOff = state.project?.sound?.enabled === false;
  const D = state.scene?.tl.duration || 1;
  el.phoneScrub = h('input', { type: 'range', id: 'ptp-scrub', min: 0, max: D, step: 0.01, value: state.t, 'aria-label': 'Position' });
  el.phoneScrub.addEventListener('input', () => seek(Number(el.phoneScrub.value)));
  clear(
    el.phoneTp,
    button('', togglePlay, { class: 'icon-btn play', icon: state.playing ? 'pause' : 'play', title: 'Play or pause', id: 'ptp-play' }),
    (el.phoneTime = h('span', { class: 'time', id: 'ptp-time' })),
    el.phoneScrub,
    button('', () => {
      state.loop = !state.loop;
      renderTransport();
    }, { class: `chip icon-chip${state.loop ? ' on' : ''}`, icon: 'loop', id: 'ptp-loop', title: 'Loop playback' }),
    button('', () => {
      state.soundOn = !state.soundOn;
      ensureAudioContext();
      if (state.soundOn) startAudio();
      else stopAudio();
      renderTransport();
    }, { class: `chip icon-chip${state.soundOn && !soundOff ? ' on' : ''}`, icon: state.soundOn && !soundOff ? 'sound' : 'mute', id: 'ptp-sound', title: soundOff ? 'Sound is switched off in the Sound tab' : 'Sound', disabled: soundOff })
  );
}

function renderPhoneBar() {
  if (!el.phoneBar) return;
  const view = ui.phone === 'settings' ? 'settings' : 'rounds';
  el.work.dataset.phone = view;
  const item = (id, label, ic, on, run) => {
    const b = button(label, run, { class: `phone-tab${on ? ' on' : ''}`, icon: ic, id: `pb-${id}` });
    b.setAttribute('aria-pressed', String(on));
    return b;
  };
  const show = (v) => () => {
    if (ui.bank.open) closeBank();
    ui.phone = v;
    saveUI();
    renderPhoneBar();
    // The top of the chosen area, just under the pinned preview.
    const side = el.work.querySelector(v === 'settings' ? '.side.left' : '.side.right');
    const stage = el.work.querySelector('.stage');
    window.scrollTo({ top: Math.max(0, side.getBoundingClientRect().top + window.scrollY - stage.offsetHeight - 6) });
  };
  clear(
    el.phoneBar,
    item('rounds', 'Rounds', 'order', view === 'rounds' && !ui.bank.open, show('rounds')),
    item('settings', 'Settings', 'palette', view === 'settings' && !ui.bank.open, show('settings')),
    item('assets', 'Assets', 'grid', !!ui.bank.open, toggleBank)
  );
}

function updatePlayhead() {
  if (!state.scene || !el.head) return;
  const D = state.scene.tl.duration;
  el.head.style.left = `${(state.t / D) * 100}%`;
  if (el.time) el.time.textContent = `${fmtTime(state.t)} / ${fmtTime(D)}`;
  if (el.phoneTime) el.phoneTime.textContent = `${fmtTime(state.t)} / ${fmtTime(D)}`;
  if (el.phoneScrub && document.activeElement !== el.phoneScrub) {
    el.phoneScrub.max = D;
    el.phoneScrub.value = state.t;
  }
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
  initRoundDrag();
  el.inspector = h('div', { class: 'inspector', id: 'round-inspector' });
  const addSel = h(
    'select',
    { id: 'add-outcome', 'aria-label': 'Outcome for the new round' },
    OUTCOMES.filter((o) => (GAME_OUTCOMES[gameOf()] || GAME_OUTCOMES.slot).includes(o.id)).map((o) => h('option', { value: o.id }, o.label))
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
  collapsify(el.sequence, 'seq');
  markTips(el.sequence);
  // With no rounds yet, the quick sequence is the way in: show it open.
  if (!state.project.rounds.length) {
    const qs = el.sequence.querySelector('section.group[data-key="seq/quick-sequence"]');
    if (qs) setSection(qs, true, false);
  }
  refreshList();
  renderInspector();
}

const gameOf = () => state.project.game || 'slot';

function tierTitle(i) {
  const tiers = state.project.tiers || [];
  return tiers[Math.min(tiers.length - 1, Math.max(0, i | 0))]?.title || 'BIG WIN';
}

function builderCard() {
  if (gameOf() === 'wheel') return wheelBuilder();
  if (gameOf() === 'holdspin') return holdBuilder();
  const b = state.builder;
  const tiers = state.project.tiers || [];
  const finales = [
    ...tiers.map((t, i) => ({ value: `big${i}`, label: i === 0 ? `Big win: ${t.title}` : `Big win counting up to ${t.title}` })),
    { value: 'tumble', label: 'Tumble chain into a big win, with multipliers' },
    { value: 'freespins', label: 'Free spins feature: trigger, spins, total' },
    { value: 'holdspin', label: 'Hold & Spin feature: coins land, respins, collect' },
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
  } else if (finale === 'holdspin') {
    const cells = P.grid.reels * P.grid.rows;
    rounds.push(newRound('hstrigger', { coinsIn: Math.min(6, cells - 2) }));
    rounds.push(...holdRounds(P, { start: Math.min(6, cells - 2), finale: 'out', endCoins: Math.min(cells - 1, Math.round(cells * 0.7)), specials: 1 }));
  } else if (finale === 'wheel') rounds.push(newRound('wheel'));
  else if (finale === 'big+wheel') rounds.push(big(Math.min(1, top)), newRound('wheel'));
  P.rounds = rounds;
  state.sel = spins;
  changed('timeline');
  renderSequence();
  toast(`Built ${rounds.length} rounds: ${spins} warm-up spin${spins === 1 ? '' : 's'} and the finale.`);
}

// A respin plan from the starting coins to the finale: a few empty respins
// between hits (never letting the counter run out early), specials late in
// the feature, then the collect.
function holdRounds(P, { start, finale, endCoins, specials }) {
  const hs = holdSpinConfig(P);
  const cells = P.grid.reels * P.grid.rows;
  const R = hs.respins;
  const target = finale === 'fill' ? cells : Math.max(start + 1, Math.min(cells - 1, endCoins));
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const rounds = [];
  const respin = (coinsIn, extra = {}) => rounds.push(newRound('respin', { coinsIn, ...extra }));
  let coins = start;
  let counter = R;
  if (!hs.reset) {
    // Without resets the feature is exactly R respins.
    for (let i = 0; i < R; i++) {
      const last = i === R - 1;
      if (last && finale === 'fill') respin(0, { fill: true });
      else {
        const n = last ? target - coins : Math.min(target - coins, pick([0, 1, 1, 2]));
        respin(Math.max(0, n));
        coins += Math.max(0, n);
      }
    }
  } else {
    while (coins < target) {
      const blanks = Math.min(Math.max(0, counter - 1), pick([0, 1, 1, 2]));
      for (let i = 0; i < blanks; i++, counter--) respin(0);
      const left = target - coins;
      if (finale === 'fill' && left <= 4) {
        respin(0, { fill: true });
        coins = target;
        break;
      }
      const n = Math.min(left, pick([1, 1, 2, 2, 3]));
      respin(n);
      coins += n;
      counter = R;
    }
    if (finale !== 'fill') for (let i = 0; i < R; i++) respin(0);
  }
  const hits = rounds.filter((r) => r.coinsIn > 0 || r.fill);
  hs.coins.slice(1, 1 + specials).forEach((ct, i, arr) => {
    const r = hits[Math.min(hits.length - 1, Math.floor(hits.length * (0.4 + (0.6 * (i + 1)) / (arr.length + 1))))];
    if (r && (r.fill || r.specials.length < r.coinsIn)) r.specials.push(ct.id);
  });
  rounds.push(newRound('collect'));
  return rounds;
}

function holdBuilder() {
  const b = state.builder;
  const P = state.project;
  const hs = holdSpinConfig(P);
  const cells = P.grid.reels * P.grid.rows;
  b.hsFinale = b.hsFinale || 'fill';
  b.hsEnd = Math.min(cells - 1, b.hsEnd || Math.round(cells * 0.7));
  b.hsSpecials = b.hsSpecials ?? 1;
  return h(
    'section',
    { class: 'group builder' },
    h('h3', null, 'Quick sequence'),
    h('p', { class: 'hint' }, 'Builds every respin from the starting coins to the finale, then the collect. Fine-tune each respin below.'),
    rangeField({ id: 'qb-hs-start', label: 'Coins on the board at the start', value: hs.startCoins, min: 0, max: cells - 2, step: 1, onInput: (v) => { P.holdspin.startCoins = v; changed('timeline'); } }),
    segmented({ id: 'qb-hs-finale', label: 'Finale', value: b.hsFinale, options: [{ value: 'fill', label: 'Fill the board' }, { value: 'out', label: 'Respins run out' }], onChange: (v) => { b.hsFinale = v; renderSequence(); } }),
    b.hsFinale === 'out' ? rangeField({ id: 'qb-hs-end', label: 'Coins when it ends', value: b.hsEnd, min: Math.min(cells - 1, hs.startCoins + 1), max: cells - 1, step: 1, onInput: (v) => (b.hsEnd = v) }) : null,
    rangeField({ id: 'qb-hs-specials', label: 'Special coins', value: b.hsSpecials, min: 0, max: Math.max(0, hs.coins.length - 1), step: 1, onInput: (v) => (b.hsSpecials = v), hint: hs.coins.length > 1 ? `In order: ${hs.coins.slice(1).map((c) => c.name).join(', ')}.` : null }),
    button('Build sequence', () => {
      P.rounds = holdRounds(P, { start: hs.startCoins, finale: b.hsFinale, endCoins: b.hsEnd, specials: b.hsSpecials });
      state.sel = 0;
      changed('timeline');
      renderSequence();
      toast(`Built ${P.rounds.length - 1} respins and the collect.`);
    }, { class: 'btn primary wide', id: 'qb-build' })
  );
}

function wheelBuilder() {
  const b = state.builder;
  const P = state.project;
  const segs = P.wheel.segments;
  b.wheelSpins = b.wheelSpins || 3;
  if (b.wheelLast == null || b.wheelLast >= segs.length) b.wheelLast = Math.max(0, segs.findIndex((s) => /jackpot/i.test(s.label)));
  return h(
    'section',
    { class: 'group builder' },
    h('h3', null, 'Quick sequence'),
    h('p', { class: 'hint' }, 'One round per spin of the wheel. Pick where the last spin lands; the others land at random.'),
    rangeField({ id: 'qb-wheel-spins', label: 'Spins', value: b.wheelSpins, min: 1, max: 8, step: 1, onInput: (v) => (b.wheelSpins = v) }),
    selectField({ id: 'qb-wheel-last', label: 'The last spin lands on', value: b.wheelLast, options: segs.map((sg, i) => ({ value: i, label: `${i + 1}. ${sg.label}` })), onChange: (v) => (b.wheelLast = Number(v)) }),
    button('Build sequence', () => {
      // The other spins land on prizes at random.
      const prizes = segs.map((sg, i) => i).filter((i) => segmentKind(segs[i]) === 'prize');
      const anyPrize = () => (prizes.length ? prizes[Math.floor(Math.random() * prizes.length)] : Math.floor(Math.random() * segs.length));
      P.rounds = Array.from({ length: b.wheelSpins }, (_, i) => newRound('wheel', { wheelSegment: i === b.wheelSpins - 1 ? b.wheelLast : anyPrize() }));
      state.sel = 0;
      changed('timeline');
      renderSequence();
      toast(`Built ${b.wheelSpins} spin${b.wheelSpins === 1 ? '' : 's'}.`);
    }, { class: 'btn primary wide', id: 'qb-build' })
  );
}

function addRound(outcome) {
  const prev = state.project.rounds[state.sel];
  // Inside free spins a round is a free spin; a free spins trigger there is
  // a retrigger that adds spins.
  const r = newRound(outcome, prev?.free && outcome === 'freespins' ? { free: true, freeSpins: 5 } : prev?.free && outcome !== 'fstotal' && !HS_OUTCOMES.includes(outcome) ? { free: true } : {});
  state.project.rounds.splice(state.sel + 1, 0, r);
  state.sel = Math.min(state.project.rounds.length - 1, state.sel + 1);
  changed('timeline');
  renderSequence();
}

function patternLabel(p, r) {
  const n = (r.lines || []).length;
  return { lines: `${n} line${n === 1 ? '' : 's'}`, cells: 'custom cells', ways: 'ways', full: 'full screen', anywhere: 'anywhere', cluster: 'cluster' }[p] || p;
}

// What else lands in a round: mystery blocks, cash and the collector.
function extrasText(r) {
  const cur = state.project.machine.currency || '';
  let t = '';
  if (r.wildMults?.length) t += ` · wild ${r.wildMults.map((m) => `x${m}`).join(' ')}`;
  if (r.mystery > 0) t += ` · ${r.mystery} mystery`;
  if (r.cash?.length) t += ` · cash ${r.cash.map((v) => `${cur}${v}`).join(' ')}`;
  if (r.collector) t += ' · collector';
  if (r.boosts?.length && potsConfig(state.project).on) t += ` · ${r.boosts.length} booster${r.boosts.length === 1 ? '' : 's'}`;
  return t;
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
    text += extrasText(r);
    if (r.outcome === 'big') text = `To ${tierTitle(r.tier)} · ${text}`;
    return fs + text;
  }
  if (r.outcome === 'wheel') {
    const segs = P.wheel.segments;
    const ls = wheelLandings(P, r);
    return ls.length > 1 ? `Spin again, then ${segs[ls[1]]?.label ?? '?'}` : `Lands on ${segs[ls[0]]?.label ?? '?'}`;
  }
  if (r.outcome === 'freespins') return r.free ? `Retrigger · +${r.freeSpins} spins` : `${r.freeSpins} free spins${r.walking ? ' · walking wilds' : r.sticky ? ' · sticky wilds' : ''}`;
  if (r.outcome === 'bonus') return 'Scatter trigger';
  if (r.outcome === 'nearmiss') return `${fs}Scatters short by one, the last one slides past`;
  if (r.outcome === 'fstotal') return 'Free spins total win';
  const specials = (r.specials || []).map((id) => holdSpinConfig(P).coins.find((c) => c.id === id)?.name).filter(Boolean);
  const sp = specials.length ? ` · ${specials.join(', ')}` : '';
  if (r.outcome === 'hstrigger') return `${r.coinsIn} coins land${sp}`;
  if (r.outcome === 'respin') return r.fill ? `Fills the board${sp}` : r.coinsIn > 0 ? `${r.coinsIn} coin${r.coinsIn === 1 ? '' : 's'} land${sp}` : 'Nothing lands';
  if (r.outcome === 'collect') return 'Collects every coin';
  return `${fs}Reels spin and stop${r.extraWilds ? ` · ${r.extraWilds} wild${r.extraWilds === 1 ? '' : 's'}` : ''}${extrasText(r)}`;
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

// Rounds reorder by dragging a row up or down (a click still selects it).
// The other rows slide aside to show where it will land.
let roundDragged = false;
function initRoundDrag() {
  el.list.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    const li = e.target.closest('li.round');
    if (!li || e.target.closest('.round-actions')) return;
    const rows = [...el.list.querySelectorAll('li.round')];
    const from = rows.indexOf(li);
    if (from < 0 || rows.length < 2) return;
    const rects = rows.map((r) => r.getBoundingClientRect());
    const pitch = rects.length > 1 ? rects[1].top - rects[0].top : rects[0].height;
    const y0 = e.clientY;
    let dragging = false;
    let to = from;
    const move = (ev) => {
      const dy = ev.clientY - y0;
      if (!dragging && Math.abs(dy) < 6) return;
      if (!dragging) {
        dragging = true;
        li.classList.add('dragging');
        el.list.classList.add('sorting');
        try {
          li.setPointerCapture(e.pointerId);
        } catch {}
      }
      const lo = rects[0].top - rects[from].top;
      const hi = rects[rects.length - 1].top - rects[from].top;
      const d = Math.max(lo - pitch * 0.4, Math.min(hi + pitch * 0.4, dy));
      li.style.transform = `translateY(${d}px)`;
      const mid = rects[from].top + rects[from].height / 2 + d;
      to = rects.filter((r, i) => i !== from && r.top + r.height / 2 < mid).length;
      rows.forEach((r, i) => {
        if (i === from) return;
        const shift = from < i && i <= to ? -pitch : to <= i && i < from ? pitch : 0;
        r.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      rows.forEach((r) => (r.style.transform = ''));
      li.classList.remove('dragging');
      el.list.classList.remove('sorting');
      if (!dragging) return;
      roundDragged = true;
      setTimeout(() => (roundDragged = false), 0);
      if (to === from) return;
      const rs = state.project.rounds;
      const [r] = rs.splice(from, 1);
      rs.splice(to, 0, r);
      state.sel = to;
      changed('timeline');
      renderSequence();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  });
  // The click that ends a drag does not select the row under it.
  el.list.addEventListener(
    'click',
    (e) => {
      if (!roundDragged) return;
      e.stopPropagation();
      e.preventDefault();
    },
    true
  );
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

// A round's boosters: chips to remove, a picker to add, and which pot fires.
const boostName = (b, cur) => (b.kind === 'mult' ? `x${b.value || 2} wild` : b.kind === 'cash' ? `${cur}${b.value || 5}` : BOOST_KINDS.find((k) => k.id === b.kind)?.label || b.kind);
const boostNames = (list, cur) => list.map((b) => boostName(b, cur)).join(', ') || 'None yet';

function boostField(r, set, cur, tumbles) {
  const P = state.project;
  const cfg = potsConfig(P);
  if (cfg.on && !potsUpgrade(cfg)) {
    return [h('p', { class: 'hint', id: 'ri-boost' }, 'No pot upgrades cells: set one to Upgrades or Both.'), moreLink('Features › Pots above the machine', { tab: 'features', section: 'pots-above-the-machine', id: 'm-pots' }, 'Pots')];
  }
  if (!cfg.on) {
    return [h('div', { class: 'field', id: 'ri-boost' }, h('p', { class: 'hint' }, 'Boosters come from the pots above the machine. Turn them on to fire beams at cells.'), button('Turn on the pots', () => turnOnPots(), { class: 'btn small', icon: 'plus', id: 'ri-boost-pots' }))];
  }
  const list = (r.boosts || []).map((b) => (typeof b === 'string' ? { kind: b } : b));
  const sel = h('select', { id: 'ri-boost-value', 'aria-label': 'Booster to add' }, BOOST_CHOICES.map(([k, v], i) => h('option', { value: i }, boostName({ kind: k, value: v }, cur))));
  const setList = (l) => set('boosts', true)(l);
  const out = [
    h(
      'div',
      { class: 'field', id: 'ri-boost' },
      h('span', { class: 'label' }, 'Cells they make'),
      h('div', { class: 'mults' }, list.map((b, k) => button(boostName(b, cur), () => setList(list.filter((_, j) => j !== k)), { class: 'chip on', icon: 'x', id: `ri-boost-${k}`, title: 'Remove' }))),
      list.length < 8
        ? h('div', { class: 'add-row' }, sel, button('Add', () => {
            const [kind, value] = BOOST_CHOICES[Number(sel.value)];
            setList([...list, value != null ? { kind, value } : { kind }]);
          }, { class: 'btn small', icon: 'plus', id: 'ri-boost-add' }))
        : null,
      h('p', { class: 'hint' }, LINE_WINS.includes(r.outcome) ? `After the spin the pots fire at cells of the win: they land as a low symbol and turn into what you add here.${tumbles ? ' In a tumble a multiplier lands as a bomb.' : ''} Cash goes to a free cell.` : 'After the spin the pots fire at free cells; nothing they make pays here. Cash goes to a collector if one lands.')
    ),
  ];
  if (list.length) out.push(potAimField(r, set, cfg));
  out.push(moreLink('Features › Pots above the machine', { tab: 'features', section: 'pots-above-the-machine', id: 'm-beam-curve' }, 'Pots and beams'));
  return out;
}

function valueChips({ id, label, list, values, fmt, max, set, hint }) {
  const cur = list || [];
  const sel = h('select', { id: `${id}-value`, 'aria-label': `${label}: value to add` }, values.map((v) => h('option', { value: v }, fmt(v))));
  return h(
    'div',
    { class: 'field', id },
    h('span', { class: 'label' }, label),
    h('div', { class: 'mults' }, cur.map((v, k) => button(fmt(v), () => set(cur.filter((_, j) => j !== k)), { class: 'chip on', icon: 'x', id: `${id}-${k}`, title: 'Remove' }))),
    cur.length < max ? h('div', { class: 'add-row' }, sel, button('Add', () => set([...cur, Number(sel.value)]), { class: 'btn small', icon: 'plus', id: `${id}-add` })) : null,
    hint ? h('p', { class: 'hint' }, hint) : null
  );
}

function winStyleIsCollect(r) {
  const own = r.winStyle && r.winStyle !== 'auto' ? r.winStyle : winFxConfig(state.project).style;
  return own === 'collect' && LINE_WINS.includes(r.outcome);
}

function potAims(n) {
  return POT_AIMS.filter((a) => !/^\d$/.test(a.id) || Number(a.id) < n).map((a) => ({ value: a.id, label: /^\d$/.test(a.id) ? `${potsConfig(state.project).items[Number(a.id)].name} only` : a.label }));
}

function turnOnPots() {
  const P = state.project;
  P.pots = { ...defaultPots(), ...(P.pots || {}), enabled: true };
  changed('all');
  renderPanel();
  renderInspector();
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

// Special coin chips: tap to add one of that type, tap a chip to remove it.
function specialPicker(r, max) {
  const P = state.project;
  const hs = holdSpinConfig(P);
  const list = r.specials || [];
  const chips = h('div', { class: 'mults' });
  list.forEach((id, k) =>
    chips.append(
      button(hs.coins.find((c) => c.id === id)?.name || id, () => {
        r.specials.splice(k, 1);
        changed('timeline');
        refreshList();
        renderInspector();
      }, { class: 'chip on', icon: 'x', id: `ri-special-${k}`, title: 'Remove this special coin' })
    )
  );
  const add = h('div', { class: 'add-row' });
  for (const ct of hs.coins.slice(1)) {
    add.append(
      button(`+ ${ct.name}`, () => {
        r.specials = [...list, ct.id];
        changed('timeline');
        refreshList();
        renderInspector();
      }, { class: 'chip', id: `ri-add-special-${ct.id}`, disabled: list.length >= max })
    );
  }
  return h('div', { class: 'field' }, h('span', { class: 'label' }, 'Special coins among them'), chips, hs.coins.length > 1 ? add : moreLink('Asset Bank › Coins', { bank: 'coins', section: 'hold-spin-coins' }, 'Add special coin types'));
}

function holdInspector(r, set) {
  const P = state.project;
  const hs = holdSpinConfig(P);
  const cells = P.grid.reels * P.grid.rows;
  const R = state.scene?.tl.rounds[state.sel];
  const parts = [];
  if (r.outcome === 'hstrigger') {
    parts.push(
      rangeField({ id: 'ri-hs-coins', label: 'Coins landing', value: Math.min(cells - 1, r.coinsIn || 6), min: 1, max: cells - 1, step: 1, onInput: set('coinsIn') }),
      specialPicker(r, r.coinsIn || 6),
      h('p', { class: 'hint' }, `The coins land among ordinary symbols, then the board turns into the Hold & Spin board keeping them, with ${hs.respins} respins. Add Respin rounds after this one and end with Collect.`)
    );
  } else if (r.outcome === 'respin') {
    const hsp = R?.pres.holdspin;
    const free = hsp ? cells - (hsp.coins - hsp.hits) : cells;
    parts.push(toggleField({ id: 'ri-hs-fill', label: 'Fill the board (every empty cell lands a coin)', checked: !!r.fill, onChange: set('fill', true) }));
    if (!r.fill) parts.push(rangeField({ id: 'ri-hs-coins', label: 'Coins landing', value: Math.min(free, r.coinsIn || 0), min: 0, max: Math.max(1, free), step: 1, onInput: set('coinsIn'), hint: r.coinsIn ? null : 'Every cell spins and stops empty.' }));
    parts.push(specialPicker(r, r.fill ? free : r.coinsIn || 0));
    if (hsp) {
      const lines = [`Respins left: ${hsp.before} → ${hsp.after}`, `coins on the board: ${hsp.coins}/${cells}`];
      parts.push(h('p', { class: hsp.before === 0 ? 'hint warn' : 'hint' }, hsp.before === 0 ? 'The counter already ran out before this respin. In a real game the feature would have ended: remove an empty respin before this one.' : `${lines.join(' · ')}.`));
    }
  } else if (r.outcome === 'collect') {
    const C = R?.pres.collect;
    const cur = P.machine.currency || '';
    parts.push(h('p', { class: 'hint' }, C ? `Collects ${C.items.length} coin${C.items.length === 1 ? '' : 's'}${R.pres.grand ? ' and the grand' : ''}: ${cur}${C.total.toFixed(moneyDecimals(P))} in all. Then the total win counts through your tiers.` : 'There are no coins to collect here. Put this round after the respins.'));
  }
  return parts;
}

// The round inspector: the round's basics, then a card for each feature the
// round uses; the others wait in "Add a feature". Look and spin timing fold
// to one line that says what they are set to.
const insp = { round: null, added: new Set(), menu: false };

function renderInspector() {
  if (!el.inspector) return;
  const P = state.project;
  const r = P.rounds[state.sel];
  if (!r) {
    clear(el.inspector, emptyInspector());
    return;
  }
  // A card added from the menu stays while this round is selected, even at
  // its starting value.
  if (insp.round !== r) {
    insp.round = r;
    insp.added = new Set();
    insp.menu = false;
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
  const ctx2 = makeContext(P, state.scene?.tl.paylines || generatePaylines(reels, rows, P.machine.maxLines));
  const cur = P.machine.currency || '';
  const dec = moneyDecimals(P);
  const isHS = HS_OUTCOMES.includes(r.outcome);
  const canFree = gameOf() === 'slot' && r.outcome !== 'fstotal' && !isHS;
  const noBlock = r.free && !P.rounds.slice(0, state.sel).some((x) => x.outcome === 'freespins' && !x.free);
  const lineWin = LINE_WINS.includes(r.outcome);
  const slotRound = r.outcome !== 'wheel' && r.outcome !== 'fstotal' && !isHS && gameOf() === 'slot';
  const mode = P.machine.payMode;
  const base = defaultPattern(mode);
  const pattern = r.pattern || base;
  const tumbles = lineWin && tumbleEnabled(ctx2, r) && pattern !== 'full';
  const cfg = potsConfig(P);
  const jpCfg = jackpotsConfig(P);

  const outcomeField = selectField({
    id: 'ri-outcome',
    label: 'Outcome',
    value: r.outcome,
    options: OUTCOMES.filter((o) => (GAME_OUTCOMES[gameOf()] || GAME_OUTCOMES.slot).includes(o.id) || o.id === r.outcome).map((o) => ({ value: o.id, label: o.label })),
    onChange: (v) => {
      const fresh = newRound(v);
      r.outcome = v;
      if (LINE_WINS.includes(v)) {
        r.lines = fresh.lines;
        r.count = Math.max(r.count || 0, chainCount(v === 'small' ? 0 : 1));
        r.wildAssist = fresh.wildAssist;
      }
      if (v === 'freespins' || v === 'fstotal' || HS_OUTCOMES.includes(v)) r.free = false;
      if (v === 'hstrigger' || v === 'respin') r.coinsIn = fresh.coinsIn;
      changed(kind);
      refreshList();
      renderInspector();
    },
  });
  parts.push(outcomeField);
  if (canFree)
    parts.push(
      toggleField({
        id: 'ri-free',
        label: r.outcome === 'freespins' ? 'Free spin: a retrigger that adds spins' : 'Free spin (counts toward the free spins total)',
        checked: !!r.free,
        onChange: (v) => {
          r.free = v;
          if (r.outcome === 'freespins' && v && (r.freeSpins | 0) === 10) r.freeSpins = 5;
          changed(kind);
          refreshList();
          renderInspector();
        },
        hint: noBlock ? 'Add a Free spins trigger round before this one to start the counter.' : null,
      })
    );
  if (r.free && slotRound) parts.push(toggleField({ id: 'ri-sticky', label: 'Wilds stick for the rest of the free spins', checked: !!r.sticky, onChange: set('sticky') }));
  if (lineWin) {
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
          hint: 'The overlay climbs through every tier the amount crosses. Edit tiers in Wins.',
        })
      );
    }
    parts.push(
      h(
        'div',
        { class: 'row2' },
        selectField({ id: 'ri-symbol', label: 'Winning symbol', value: r.symbol, options: symbolOptions(), onChange: set('symbol') }),
        textField({
          id: 'ri-amount',
          label: 'Win amount',
          type: 'number',
          value: r.amount ?? '',
          placeholder: `Auto: ${cur}${autoAmount(ctx2, P, r).toFixed(dec)}`,
          // Empty is automatic; a win is never below zero.
          onChange: (v) => set('amount', true)(v === '' || v == null || Number.isNaN(Number(v)) ? null : Math.max(0, Number(v))),
          hint: r.multipliers?.length ? 'The total after multipliers.' : null,
        })
      )
    );
    parts.push(segmented({ id: 'ri-pattern', label: 'Win pattern', value: patOpts.some((o) => o.value === pattern) ? pattern : base, options: patOpts, onChange: (v) => set('pattern', true)(v === base ? null : v) }));
    parts.push(countField('ri-count', pattern, r.count, set('count')));
    if (pattern === 'lines') {
      // The picked lines; the full set opens to change them.
      const lines = state.scene?.tl.paylines || generatePaylines(reels, rows, P.machine.maxLines);
      const picking = !!ui.inspOpen?.lines;
      const toggle = button(picking ? 'Done' : 'Change lines', () => {
        ui.inspOpen = { ...(ui.inspOpen || {}), lines: !picking };
        saveUI();
        renderInspector();
        document.getElementById('ri-lines-edit')?.focus({ preventScroll: true });
      }, { class: 'btn small ghost', id: 'ri-lines-edit' });
      toggle.setAttribute('aria-expanded', String(picking));
      let body;
      if (picking) {
        body = h('div', { class: 'lines', role: 'group', 'aria-label': 'Winning paylines' });
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
          body.append(b);
        });
      } else {
        const picked = (r.lines || []).filter((i) => i < lines.length);
        body = h('div', { class: 'lines picked' }, picked.length ? picked.map((i) => h('span', { class: 'line-chip on', title: `Line ${i + 1}` }, lineSVG(lines[i], rows, lineColor(i)), h('span', null, i + 1))) : h('span', { class: 'hint' }, 'No line picked: line 1 wins.'));
      }
      parts.push(h('div', { class: 'field' }, h('div', { class: 'label-row' }, h('span', { class: 'label' }, 'Winning lines'), toggle), body, picking ? h('p', { class: 'hint' }, 'Lines that cross the same symbols light up too, as on a real machine.') : null));
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
    parts.push(toggleField({ id: 'ri-wild', label: 'Include a Wild in the win', checked: r.wildAssist, onChange: set('wildAssist') }));
  }
  if (isHS) parts.push(...holdInspector(r, set));
  if (SCATTER_WINS.includes(r.outcome)) {
    const trig = P.machine.scatterTrigger || 3;
    parts.push(rangeField({ id: 'ri-scatters', label: 'Scatters landing', value: Math.max(trig, r.scatterCount || trig), min: Math.min(trig, reels), max: Math.max(trig, P.machine.payMode === 'lines' || P.machine.payMode === 'ways' ? reels : reels * rows - 4), step: 1, onInput: set('scatterCount') }));
  }
  if (r.outcome === 'freespins') {
    parts.push(
      rangeField({ id: 'ri-fs', label: r.free ? 'Extra spins' : 'Free spins awarded', value: r.freeSpins || (r.free ? 5 : 10), min: 1, max: 100, step: 1, onInput: set('freeSpins') })
    );
    if (r.free) parts.push(h('p', { class: 'hint' }, 'A retrigger: this free spin lands scatters, the EXTRA SPINS banner shows, and the counter grows by these spins.'));
    else
      parts.push(
        segmented({
          id: 'ri-fs-wilds',
          label: 'Wilds in these free spins',
          value: r.walking ? 'walking' : r.sticky ? 'sticky' : 'normal',
          options: [
            { value: 'normal', label: 'Normal' },
            { value: 'sticky', label: 'Sticky', hint: 'Stay put for the rest of the free spins' },
            { value: 'walking', label: 'Walking', hint: 'Step one reel left each spin until they walk off' },
          ],
          onChange: (v) => {
            r.sticky = v === 'sticky';
            r.walking = v === 'walking';
            changed(kind);
            refreshList();
          },
        }),
        h('p', { class: 'hint' }, 'The rounds after this one that are marked Free spin count up the free spins total. Add a Free spins trigger inside them for a retrigger. End the block with a Free spins total round.')
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
        options: P.wheel.segments.map((s, i) => ({ value: i, label: segmentOption(s, i, cur) })),
        onChange: (v) => {
          r.wheelSegment = Number(v);
          changed(kind);
          refreshList();
          renderInspector();
        },
      }),
      // A spin again lands somewhere next.
      segmentKind(P.wheel.segments[r.wheelSegment]) === 'again'
        ? selectField({
            id: 'ri-seg-then',
            label: 'Then lands on',
            value: wheelLandings(P, r)[1] ?? '',
            options: P.wheel.segments.map((s, i) => ({ value: i, label: segmentOption(s, i, cur) })).filter((o) => segmentKind(P.wheel.segments[o.value]) !== 'again'),
            onChange: (v) => {
              r.wheelThen = Number(v);
              changed(kind);
              refreshList();
            },
            hint: 'The wheel says SPIN AGAIN, spins once more and lands here.',
          })
        : null,
      segmented({
        id: 'ri-landing',
        label: 'Landing',
        value: r.wheelLanding || P.wheel.landing,
        options: WHEEL_LANDINGS.map((x) => ({ value: x.id, label: x.label, hint: x.hint })),
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

  // Features: what the round uses shows as cards.
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const boosts = (r.boosts || []).map((b) => (typeof b === 'string' ? { kind: b } : b));
  const cashLike = lineWin || ['none', 'nearmiss', 'freespins', 'bonus'].includes(r.outcome);
  const feats = [
    {
      id: 'tumble',
      tip: 'ri-tumble',
      title: 'Tumbles',
      desc: 'Winners pop, new symbols drop in and can win again',
      show: lineWin && pattern !== 'full' && !r.expandWild,
      used: tumbles,
      add: () => (r.tumble = true),
      clear: () => {
        r.tumble = false;
        r.chain = [];
      },
      sum: () => ((r.chain || []).length ? `${plural(r.chain.length, 'more win')}` : 'Once, then nothing pays'),
      body: () => {
        const out = [
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
          }),
        ];
        if (!tumbles) return out;
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
              }, { class: 'icon-btn tiny', icon: 'trash', title: 'Remove this tumble win', id: `ri-chain-del-${k}` })),
              selectField({ id: `ri-chain-sym-${k}`, label: 'Symbol', value: st.symbol || 'auto', options: symbolOptions(), onChange: (v) => { st.symbol = v; changed(kind); } }),
              countField(`ri-chain-n-${k}`, stPattern, st.count || chainCount(0), (v) => {
                st.count = v;
                changed(kind);
                refreshList();
              })
            )
          );
        });
        out.push(
          h(
            'div',
            { class: 'field' },
            h('span', { class: 'label' }, 'Tumble chain'),
            h('p', { class: 'hint' }, 'Each step is one more win; after the last one the refill pays nothing.'),
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
        return out;
      },
    },
    {
      id: 'mult',
      tip: 'ri-mult',
      title: 'Multipliers',
      desc: 'Bombs that land with the win and multiply it at the end',
      show: lineWin,
      used: (r.multipliers || []).length > 0,
      add: () => (r.multipliers = [2]),
      clear: () => (r.multipliers = []),
      sum: () => r.multipliers.map((m) => `x${m}`).join(' '),
      body: () => {
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
        return [
          h(
            'div',
            { class: 'field', id: 'ri-mult' },
            mults,
            (r.multipliers || []).length < 8
              ? h('div', { class: 'add-row' }, multSel, button('Add', () => {
                  r.multipliers = [...(r.multipliers || []), Number(multSel.value)];
                  changed(kind);
                  refreshList();
                  renderInspector();
                }, { class: 'btn small', icon: 'plus', id: 'ri-mult-add' }))
              : null,
            h('p', { class: 'hint' }, 'They land with the win, then fly into the total: the win is multiplied by their sum.')
          ),
        ];
      },
    },
    {
      id: 'expand',
      tip: 'ri-expand',
      title: 'Expanding wild',
      desc: 'A wild in the win grows to fill its reel',
      show: lineWin && ['lines', 'ways', 'cells'].includes(pattern),
      used: !!r.expandWild,
      add: () => (r.expandWild = true),
      clear: () => (r.expandWild = false),
      sum: () => 'Fills its reel',
      body: () => [h('p', { class: 'hint', id: 'ri-expand' }, 'A wild in the win grows to fill its whole reel. It holds the reels still, so this round does not tumble.')],
    },
    {
      id: 'wmult',
      tip: 'ri-wmult',
      title: 'Multiplier wilds',
      desc: 'Wilds in the win carry x2, x3… badges',
      show: lineWin && ['lines', 'ways', 'cells'].includes(pattern),
      offer: !tumbles,
      used: (r.wildMults || []).length > 0,
      add: () => (r.wildMults = [2]),
      clear: () => (r.wildMults = []),
      sum: () => r.wildMults.map((m) => `x${m}`).join(' '),
      body: () => [valueChips({ id: 'ri-wmult', label: 'Badges', list: r.wildMults, values: WILD_MULT_VALUES, fmt: (v) => `x${v}`, max: 5, set: (list) => set('wildMults', true)(list), hint: tumbles ? 'A tumble would carry the wilds away, so a tumbling round has none.' : 'The win is multiplied by their sum after it shows.' })],
    },
    {
      id: 'extra',
      tip: 'ri-extra-wilds',
      title: 'Extra wilds',
      desc: 'More wilds land on the grid',
      show: slotRound,
      used: (r.extraWilds | 0) > 0,
      add: () => (r.extraWilds = Math.min(2, Math.min(8, reels * rows - 3))),
      clear: () => (r.extraWilds = 0),
      sum: () => plural(r.extraWilds, 'wild'),
      body: () => [rangeField({ id: 'ri-extra-wilds', label: 'How many', value: Math.max(1, r.extraWilds || 0), min: 1, max: Math.max(1, Math.min(8, reels * rows - 3)), step: 1, onInput: set('extraWilds') })],
    },
    {
      id: 'mystery',
      tip: 'ri-mystery',
      title: 'Mystery symbols',
      desc: 'Blocks that turn over together into one symbol',
      show: slotRound && (lineWin || r.outcome === 'none'),
      used: (r.mystery | 0) > 0,
      add: () => (r.mystery = Math.min(3, Math.min(10, reels * rows - 3))),
      clear: () => (r.mystery = 0),
      sum: () => plural(r.mystery, 'block'),
      body: () => [
        rangeField({ id: 'ri-mystery', label: 'How many', value: Math.max(1, r.mystery || 0), min: 1, max: Math.max(1, Math.min(10, reels * rows - 3)), step: 1, onInput: set('mystery', true), hint: lineWin ? 'They land on winners and turn over to the winning symbol.' : 'They turn over to one symbol, kept from paying.' }),
        r.outcome === 'none' ? selectField({ id: 'ri-mystery-sym', label: 'Mystery reveals', value: r.mysterySymbol || 'auto', options: symbolOptions(), onChange: set('mysterySymbol') }) : null,
      ],
    },
    {
      id: 'cash',
      tip: 'ri-cash',
      title: 'Cash and collector',
      desc: 'Coins with values; a collector takes them all',
      show: slotRound && cashLike,
      used: (r.cash || []).length > 0 || !!r.collector,
      add: () => {
        r.cash = [2, 5, 10];
        r.collector = true;
      },
      clear: () => {
        r.cash = [];
        r.collector = false;
      },
      sum: () => `${plural((r.cash || []).length, 'coin')}${r.collector ? ' and a collector' : ''}`,
      body: () => [
        valueChips({ id: 'ri-cash', label: 'Cash values (in bets)', list: r.cash, values: CASH_VALUES, fmt: (v) => `${cur}${v}`, max: 10, set: (list) => set('cash', true)(list), hint: 'On their own they just land; a collector takes them all.' }),
        toggleField({ id: 'ri-collector', label: 'A collector lands and takes the cash', checked: !!r.collector, onChange: set('collector', true), hint: r.collector && !(r.cash || []).length ? 'Add cash symbols for it to collect.' : null }),
      ],
    },
    {
      id: 'jackpot',
      tip: 'ri-jackpot',
      title: 'Jackpot',
      desc: 'A jackpot box lights up and pays into the win',
      show: gameOf() === 'slot' && JACKPOT_ROUNDS.includes(r.outcome),
      used: !!r.jackpot,
      add: () => {
        const tiers = jackpotsConfig(P).tiers;
        r.jackpot = tiers[tiers.length - 1].id;
      },
      clear: () => (r.jackpot = null),
      sum: () => (jpCfg.on ? jpCfg.tiers.find((t) => t.id === r.jackpot)?.label || 'Not shown' : 'Boxes off'),
      body: () => {
        if (!jpCfg.on)
          return [
            h('p', { class: 'hint', id: 'ri-jackpot' }, 'The jackpot boxes are off. Turn them on to show the boxes around the machine.'),
            button('Turn on the jackpot boxes', () => {
              P.jackpots = { ...defaultJackpots(), ...(P.jackpots || {}), enabled: true };
              changed('all');
              renderPanel();
              renderInspector();
            }, { class: 'btn small', icon: 'plus', id: 'ri-jackpot-on' }),
          ];
        return [
          segmented({ id: 'ri-jackpot', label: 'Box', value: jpCfg.tiers.some((t) => t.id === r.jackpot) ? r.jackpot : null, options: jpCfg.tiers.map((t) => ({ value: t.id, label: t.label })), onChange: (v) => set('jackpot', true)(v) }),
          h('p', { class: 'hint' }, 'After the round shows its win, the box lights up and what it shows flies down into the win meter, on top of the win.'),
          moreLink('Features › Jackpot boxes', { tab: 'features', section: 'jackpot-boxes', id: 'jp-place' }, 'Box settings'),
        ];
      },
    },
    {
      id: 'boost',
      tip: 'ri-boost',
      title: 'Boosters',
      desc: 'The pots fire beams that turn cells into wilds or better symbols',
      show: slotRound && cashLike,
      used: boosts.length > 0,
      add: () => {
        if (cfg.on && potsUpgrade(cfg)) r.boosts = [{ kind: 'wild' }];
      },
      clear: () => (r.boosts = []),
      sum: () => boostNames(boosts, cur),
      body: () => boostField(r, set, cur, lineWin && tumbleEnabled(ctx2, r)),
    },
  ];
  const shown = feats.filter((f) => f.show && (f.used || insp.added.has(f.id)));
  const offers = feats.filter((f) => f.show && f.offer !== false && !f.used && !insp.added.has(f.id));
  if (shown.length || offers.length) {
    parts.push(h('h4', { class: 'insp-sub' }, 'Features in this round'));
    for (const f of shown)
      parts.push(
        featCard(f, () => {
          f.clear();
          insp.added.delete(f.id);
          changed(kind);
          refreshList();
          renderInspector();
        })
      );
    if (!shown.length) parts.push(h('p', { class: 'hint feat-none' }, 'None yet: a plain spin.'));
    if (offers.length)
      parts.push(
        featMenu(offers, (f) => {
          f.add();
          insp.added.add(f.id);
          insp.menu = false;
          changed(kind);
          refreshList();
          renderInspector();
          requestAnimationFrame(() => el.inspector.querySelector(`[data-feat="${f.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }));
        })
      );
  }

  // How it looks: winning symbols and particles, from the Wins and Effects
  // tabs or the round's own.
  const showsWin = !['none', 'nearmiss', 'respin'].includes(r.outcome);
  if (showsWin) {
    const look = [];
    const sum = [];
    if (lineWin) {
      const def = WIN_STYLES.find((x) => x.id === winFxConfig(P).style)?.label || 'Pop in place';
      const own = WIN_STYLES.find((x) => x.id === r.winStyle)?.label;
      sum.push(own || `${def} (default)`);
      look.push(
        selectField({
          id: 'ri-winstyle',
          label: 'Winning symbols',
          value: r.winStyle || 'auto',
          options: [{ value: 'auto', label: `Wins tab default (${def})` }, ...WIN_STYLES.map((x) => ({ value: x.id, label: x.label }))],
          onChange: (v) => set('winStyle', true)(v === 'auto' ? null : v),
        }),
        moreLink('Wins › Winning symbols', { tab: 'wins', id: 'wf-style' }, 'The default and its settings')
      );
      if (cfg.on && winStyleIsCollect(r) && !boosts.length) look.push(potAimField(r, set, cfg));
    }
    const rp = r.particles || { fx: 'auto', asset: 'auto' };
    const setP = (k) => (v) => {
      r.particles = { fx: 'auto', asset: 'auto', ...(r.particles || {}), [k]: v };
      changed(kind);
      renderInspector();
    };
    const fxName = PARTICLE_TEMPLATES.find((t) => t.id === rp.fx)?.name;
    sum.push(rp.fx === 'none' ? 'no particles' : fxName ? `${fxName} particles` : 'default particles');
    look.push(
      h(
        'div',
        { class: 'row2' },
        h('div', { class: 'field' }, h('label', { class: 'label', for: 'ri-pfx' }, 'Win particles'), h('select', { id: 'ri-pfx', onchange: (e) => setP('fx')(e.target.value) }, h('option', { value: 'auto', selected: (rp.fx || 'auto') === 'auto' }, 'Default (Effects)'), templateOptions(rp.fx || 'auto'))),
        selectField({ id: 'ri-passet', label: 'Particle', value: rp.asset || 'auto', options: [{ value: 'auto', label: 'Auto' }, ...particleAssetChoices()], onChange: setP('asset') })
      ),
      moreLink('Effects › Win particles', { tab: 'effects', section: 'win-particles' }, 'The default particles')
    );
    parts.push(foldRow('look', 'Look', sum.join(' · '), look));
  }

  // Spin timing and order for this round (nothing spins in a collect, or in
  // the wheel game's machine).
  const spins = r.outcome !== 'collect' && gameOf() !== 'wheel' && !(gameOf() === 'holdspin' && r.outcome === 'wheel');
  const useDefault = r.midDuration == null || r.midDuration === '';
  const timing = [];
  const tsum = [];
  if (spins) timing.push(
    toggleField({
      id: 'ri-mid-default',
      label: 'Use the default spin length',
      checked: useDefault,
      onChange: (v) => {
        r.midDuration = v ? null : r.outcome === 'respin' ? holdSpinConfig(P).respinMid : P.spin.midDuration;
        changed(kind);
        renderInspector();
      },
    })
  );
  if (spins && !useDefault) {
    timing.push(rangeField({ id: 'ri-mid', label: 'Spin length (mid phase)', unit: 's', value: r.midDuration, min: 0, max: 6, step: 0.05, onInput: set('midDuration') }));
    tsum.push(`spin ${Number(r.midDuration).toFixed(2).replace(/\.?0+$/, '')} s`);
  }
  const orderName = ORDERS.find((o) => o.id === (P.spin.stopOrder || 'ltr'))?.label || 'Left to right';
  timing.push(rangeField({ id: 'ri-hold', label: 'Pause after this round', unit: 's', value: r.hold || 0, min: 0, max: 4, step: 0.05, onInput: set('hold') }));
  if (r.hold) tsum.push(`pause ${Number(r.hold).toFixed(2).replace(/\.?0+$/, '')} s`);
  if (spins) timing.push(
    selectField({
      id: 'ri-stop-order',
      label: 'Stop order',
      value: r.stopOrder || 'default',
      options: [{ value: 'default', label: `Project default (${orderName})` }, ...ORDERS.map((o) => ({ value: o.id, label: o.id === 'custom' ? 'Custom (set in Spin)' : o.label }))],
      onChange: (v) => set('stopOrder', true)(v === 'default' ? null : v),
    })
  );
  if (spins && r.stopOrder) tsum.push(`stops ${(ORDERS.find((o) => o.id === r.stopOrder)?.label || r.stopOrder).toLowerCase()}`);
  // Respins tease on their own: the last cells when the board is about to
  // fill, and the last cell on a last-chance respin.
  const manual = Array.isArray(r.antic);
  const teases = spins && r.outcome !== 'respin';
  if (teases) timing.push(
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
  if (teases && manual) {
    timing.push(
      reelChips('ri-antic-reel', r.antic, (c) => {
        r.antic = r.antic.includes(c) ? r.antic.filter((x) => x !== c) : [...r.antic, c].sort((a, b) => a - b);
        changed(kind);
        renderInspector();
      }),
      h('p', { class: 'hint' }, r.antic.length ? 'These reels slow down with the glow, in stop order. Set the stop order so the teased reel lands last.' : 'No reel is teased in this round.')
    );
    tsum.push(r.antic.length ? `teases reel${r.antic.length === 1 ? '' : 's'} ${r.antic.map((c) => c + 1).join(', ')}` : 'no tease');
  } else if (teases) {
    timing.push(toggleField({ id: 'ri-tease', label: 'Also tease the last reel to stop', checked: !!r.tease, onChange: set('tease', true) }));
    if (r.tease) tsum.push('teases the last reel');
  }
  parts.push(foldRow('timing', 'Spin and timing', tsum.length ? tsum.join(' · ') : 'Project defaults', timing));

  const actions = h(
    'div',
    { class: 'row insp-actions' },
    button('Preview this round', () => {
      state.solo = true;
      renderTransport();
      selectRound(state.sel, true);
      if (!state.playing) togglePlay();
    }, { class: 'btn small', icon: 'eye', id: 'ri-preview' }),
    button(isHS ? 'New coins' : 'New symbols', () => {
      r.seed = Math.floor(Math.random() * 1e6);
      changed(kind);
    }, { class: 'btn small', icon: 'dice', id: 'ri-reroll', title: isHS ? 'Re-roll where the coins land and their values' : 'Re-roll the filler symbols for this round' })
  );
  const o = OUTCOME_BY_ID[r.outcome];
  clear(el.inspector, h('div', { class: 'inspector-head', style: { '--c': o.color } }, h('span', { class: 'dot' }), h('h2', null, `Round ${state.sel + 1}`), h('span', { class: 'muted' }, o.label)), actions, parts);
  markTips(el.inspector);
}

// A feature the round uses: its name, what it is set to when folded, its
// settings, and a button that takes it out of the round.
function featCard(f, onRemove) {
  ui.featFold = ui.featFold || {};
  const open = !ui.featFold[f.id];
  const body = h('div', { class: 'feat-body', id: `feat-body-${f.id}`, hidden: !open }, f.body());
  const sum = h('span', { class: 'feat-sum' }, f.sum());
  const toggle = h('button', { type: 'button', class: 'feat-toggle', id: `feat-${f.id}`, 'aria-expanded': String(open), 'aria-controls': body.id, 'data-tip': f.tip }, icon('chevron'), h('strong', null, f.title));
  const card = h('section', { class: `feat-card${open ? '' : ' folded'}`, 'data-feat': f.id }, h('header', null, toggle, sum, button('', onRemove, { class: 'icon-btn tiny', icon: 'trash', title: `Take ${f.title.toLowerCase()} out of this round`, id: `feat-del-${f.id}` })), body);
  toggle.addEventListener('click', () => {
    const now = card.classList.toggle('folded');
    body.hidden = now;
    toggle.setAttribute('aria-expanded', String(!now));
    ui.featFold[f.id] = now;
    saveUI();
  });
  return card;
}

// "Add a feature": the features this round can still use, each with a line
// on what it does (hover one for its demo).
function featMenu(offers, onAdd) {
  const list = h(
    'div',
    { class: 'feat-menu', id: 'feat-menu', role: 'group', 'aria-label': 'Features to add', hidden: !insp.menu },
    offers.map((f) => h('button', { type: 'button', class: 'feat-offer', id: `feat-add-${f.id}`, 'data-tip': f.tip, onclick: () => onAdd(f) }, h('strong', null, f.title), h('small', null, f.desc)))
  );
  const btn = button('Add a feature', () => {
    insp.menu = !insp.menu;
    list.hidden = !insp.menu;
    btn.setAttribute('aria-expanded', String(insp.menu));
    if (insp.menu) list.querySelector('button')?.focus();
  }, { class: 'btn small accent', icon: 'plus', id: 'feat-add' });
  btn.setAttribute('aria-expanded', String(insp.menu));
  btn.setAttribute('aria-controls', 'feat-menu');
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    insp.menu = false;
    list.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    btn.focus();
  });
  return h('div', { class: 'feat-add' }, btn, list);
}

// A folded group in the inspector: one line saying what it is set to, the
// settings inside. Open or folded is remembered.
function foldRow(key, title, summary, body) {
  ui.inspOpen = ui.inspOpen || {};
  const open = !!ui.inspOpen[key];
  const inner = h('div', { class: 'insp-fold-body', id: `insp-${key}-body`, hidden: !open }, body);
  const head = h('button', { type: 'button', class: 'insp-fold-head', id: `insp-${key}`, 'aria-expanded': String(open), 'aria-controls': inner.id }, h('span', { class: 'insp-fold-title' }, title), h('span', { class: 'insp-fold-sum' }, summary), icon('chevron'));
  const sec = h('section', { class: `insp-fold${open ? ' open' : ''}`, 'data-fold': key }, head, inner);
  head.addEventListener('click', () => setFold(sec, !sec.classList.contains('open')));
  return sec;
}

function setFold(sec, open) {
  sec.classList.toggle('open', open);
  sec.querySelector(':scope > .insp-fold-body').hidden = !open;
  sec.querySelector(':scope > .insp-fold-head').setAttribute('aria-expanded', String(open));
  ui.inspOpen = { ...(ui.inspOpen || {}), [sec.dataset.fold]: open };
  saveUI();
}

function potAimField(r, set, cfg) {
  return selectField({
    id: 'ri-pot-aim',
    label: 'Which pot fires or catches',
    value: r.potAim || 'auto',
    options: [{ value: 'auto', label: `Pots default (${POT_AIMS.find((a) => a.id === cfg.aim)?.label})` }, ...potAims(cfg.count)],
    onChange: (v) => set('potAim')(v === 'auto' ? null : v),
  });
}

// With no rounds the inspector offers a first round, or the quick sequence.
function emptyInspector() {
  const outs = OUTCOMES.filter((o) => (GAME_OUTCOMES[gameOf()] || GAME_OUTCOMES.slot).includes(o.id)).slice(0, 6);
  return h(
    'div',
    { class: 'insp-empty' },
    h('h2', null, 'No rounds yet'),
    h('p', { class: 'hint' }, 'A round is one spin and what it lands. Add a first one, or build a whole run of warm-up spins and a finale in one go.'),
    h('div', { class: 'insp-empty-outs', role: 'group', 'aria-label': 'Add a first round' }, outs.map((o) => h('button', { type: 'button', class: 'btn small out-btn', id: `ie-add-${o.id}`, style: { '--c': o.color }, onclick: () => addRound(o.id) }, h('span', { class: 'dot' }), h('span', null, o.label)))),
    button('Build a quick sequence', () => {
      const qs = el.sequence.querySelector('section.group[data-key="seq/quick-sequence"]');
      if (!qs) return;
      setSection(qs, true);
      spotlight(qs);
      qs.querySelector('#qb-build')?.focus({ preventScroll: true });
    }, { class: 'btn small primary', icon: 'bolt', id: 'ie-quick' })
  );
}

// ---------- settings (left panel) ----------

const TABS = [
  ['machine', 'Machine'],
  ['spin', 'Spin'],
  ['wins', 'Wins'],
  ['effects', 'Effects'],
  ['features', 'Features'],
  ['wheel', 'Wheel'],
  ['sound', 'Sound'],
  ['export', 'Export'],
];

const TAB_ICONS = { machine: 'reels', spin: 'loop', wins: 'trophy', effects: 'sparkle', features: 'coin', wheel: 'wheel', sound: 'sound', export: 'download' };

// On desktop the tabs are a rail at the window's left edge (icon and name,
// the Asset Bank at its foot); clicking the open tab again folds the
// settings panel away. Tablets and phones keep them on top of the panel.
function renderTabs() {
  const folded = !!ui.leftFolded;
  const tab = (k, label, rail) => {
    const on = state.tab === k;
    const b = h(
      'button',
      {
        type: 'button',
        role: 'tab',
        id: rail ? `tab-${k}` : `tabn-${k}`,
        class: on ? 'on' : '',
        'aria-selected': String(on),
        'aria-controls': 'settings-panel',
        tabindex: on ? 0 : -1,
        title: rail ? (on ? (folded ? `Show the ${label} settings` : 'Fold the settings away') : `${label} settings`) : null,
        onclick: () => (rail && on ? setLeftFolded(!folded) : showTab(k)),
      },
      rail ? [icon(TAB_ICONS[k]), h('span', null, label)] : label
    );
    return b;
  };
  clear(el.tabs, TABS.map(([k, l]) => tab(k, l, false)));
  clear(el.railTabs, TABS.map(([k, l]) => tab(k, l, true)));
  el.rail.classList.toggle('folded', folded);
}

function showTab(k) {
  state.tab = k;
  if (ui.leftFolded) setLeftFolded(false);
  renderTabs();
  renderPanel();
}

function setLeftFolded(v) {
  ui.leftFolded = v;
  el.work.classList.toggle('left-folded', v);
  saveUI();
  applyWidths();
  renderTabs();
  if (!v && state.tab === 'spin') drawMotionGraph();
}

// Arrow keys move along a tab list and open the tab they land on.
function tabKeys(list, vertical) {
  list.addEventListener('keydown', (e) => {
    const keys = vertical ? { ArrowDown: 1, ArrowUp: -1 } : { ArrowRight: 1, ArrowLeft: -1 };
    const i = TABS.findIndex(([k]) => k === state.tab);
    let j;
    if (e.key in keys) j = (i + keys[e.key] + TABS.length) % TABS.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = TABS.length - 1;
    else return;
    e.preventDefault();
    showTab(TABS[j][0]);
    list.querySelector('[aria-selected="true"]')?.focus();
  });
}

function renderPanel() {
  const fn = { machine: panelMachine, spin: panelSpin, wins: panelWins, effects: panelEffects, features: panelFeatures, wheel: panelWheel, sound: panelSound, export: panelExport }[state.tab] || panelMachine;
  clear(el.panel, fn());
  collapsify(el.panel, state.tab);
  markApplies(el.panel);
  markTips(el.panel);
  if (state.tab === 'spin') drawMotionGraph();
}

// ---------- tooltips with mini demos ----------
// Hover (or focus) an option with a tip: a card explains it and, where it
// helps, loops a small render of it made with the real renderer. A demo
// with variants plays them in turn (off, then on) under a corner label.

function markTips(root) {
  for (const [key, tip] of Object.entries(TIPS)) {
    let target;
    if (key.startsWith('sec:')) target = root.querySelector(`section.group[data-key="${key.slice(4)}"] > h3 > .group-toggle`);
    else {
      const node = root.querySelector(`#${CSS.escape(key)}`);
      if (!node) continue;
      target = node.matches('button, .type') ? node : node.closest('.field, .toggle') || node;
    }
    if (!target) continue;
    target.dataset.tip = key;
    // The card replaces the browser's own tooltip; a button with no text
    // keeps the title as its name.
    if (target.title) {
      if (!target.getAttribute('aria-label') && !target.textContent.trim()) target.setAttribute('aria-label', target.title);
      target.removeAttribute('title');
    }
    void tip;
  }
}

const demoScenes = new Map();
function demoScene(id) {
  if (!demoScenes.has(id)) {
    demoScenes.set(
      id,
      (async () => {
        const plan = demoPlan(id);
        for (const s of plan) s.scene = { project: s.project, tl: s.tl, L: s.L, res: buildResources(s.project, s.L, await loadImages(s.project)) };
        return plan;
      })().catch(() => null)
    );
  }
  return demoScenes.get(id);
}

const tipState = { timer: 0, target: null, raf: 0 };

function hideTip() {
  clearTimeout(tipState.timer);
  cancelAnimationFrame(tipState.raf);
  tipState.target = null;
  el.tip?.remove();
  el.tip = null;
}

// A demo's subject lit, the rest darkened, with a thin gold edge.
function drawSpot(g, r) {
  const W = g.canvas.width;
  const H = g.canvas.height;
  const x = Math.max(-4, r.x);
  const y = Math.max(-4, r.y);
  const w = Math.min(W + 4, r.x + r.w) - x;
  const hh = Math.min(H + 4, r.y + r.h) - y;
  const rad = Math.min(10, w / 4, hh / 4);
  g.save();
  g.beginPath();
  g.rect(0, 0, W, H);
  if (g.roundRect) g.roundRect(x, y, w, hh, rad);
  else g.rect(x, y, w, hh);
  g.fillStyle = 'rgba(6, 3, 12, 0.62)';
  g.fill('evenodd');
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, hh, rad);
  else g.rect(x, y, w, hh);
  g.strokeStyle = 'rgba(255, 220, 140, 0.55)';
  g.lineWidth = 1.5;
  g.stroke();
  g.restore();
}

function showTip(target) {
  const key = target.dataset.tip;
  const tip = TIPS[key];
  if (!tip) return;
  hideTip();
  tipState.target = target;
  const na = target.closest('.na');
  const reason = na ? na.querySelector('.na-note, .na-badge')?.textContent : null;
  const canvasEl = tip.demo ? h('canvas', { class: 'tip-demo', width: 480, height: 270, 'aria-hidden': 'true' }) : null;
  // The variant playing (Off / On, Low / High), in the frame's corner.
  const labelEl = tip.demo && DEMOS[tip.demo].variants ? h('span', { class: 'tip-ab', 'aria-hidden': 'true' }) : null;
  el.tip = h('div', { class: 'tip-card', role: 'tooltip', id: 'tip-card' }, canvasEl ? h('div', { class: 'tip-frame' }, canvasEl, labelEl) : null, h('strong', null, tip.title), h('p', null, tip.text), reason ? h('p', { class: 'tip-na' }, reason) : null);
  document.body.append(el.tip);
  target.setAttribute('aria-describedby', 'tip-card');
  // Beside the target: right of it when there is room, else left, else below.
  // In the rounds panel the card sits left of the whole panel, so it never
  // covers the menu or the card next to what you point at.
  const t = target.getBoundingClientRect();
  const side = !narrow() && target.closest('.side.right')?.getBoundingClientRect();
  const r = side ? { left: side.left, right: side.right + innerWidth, top: t.top, bottom: t.bottom, height: t.height } : t;
  const w = el.tip.offsetWidth;
  const hh = el.tip.offsetHeight;
  let x = r.right + 12;
  if (x + w > innerWidth - 8) x = r.left - w - 12;
  if (x < 8) x = Math.min(innerWidth - w - 8, Math.max(8, r.left));
  let y = Math.min(innerHeight - hh - 8, Math.max(8, r.top + r.height / 2 - hh / 2));
  if (x === Math.min(innerWidth - w - 8, Math.max(8, r.left))) y = r.bottom + hh + 8 < innerHeight ? r.bottom + 8 : Math.max(8, r.top - hh - 8);
  el.tip.style.left = `${Math.round(x)}px`;
  el.tip.style.top = `${Math.round(y)}px`;
  if (!canvasEl) return;
  const card = el.tip;
  demoScene(tip.demo).then((plan) => {
    if (!plan || el.tip !== card) return;
    const g = canvasEl.getContext('2d');
    const still = reducedMotion();
    const t0 = performance.now();
    let shown = -1;
    const frame = (now) => {
      if (el.tip !== card) return;
      // Reduced motion: one still of the last variant (the option on).
      const last = plan[plan.length - 1];
      const at = still ? { i: plan.length - 1, t: (last.a + last.b) / 2 } : demoAt(plan, (now - t0) / 1000);
      const s = plan[at.i];
      // A still is drawn once per variant; an animation every frame.
      if (!s.still || at.i !== shown) {
        renderFrame(g, s.scene, at.t, s.view ? { view: s.view } : undefined);
        if (s.spot) drawSpot(g, s.spot);
      }
      if (labelEl && at.i !== shown) labelEl.textContent = s.label;
      shown = at.i;
      card.classList.add('playing');
      if (!still) tipState.raf = requestAnimationFrame(frame);
    };
    tipState.raf = requestAnimationFrame(frame);
  });
}

function initTips() {
  const later = (target, ms) => {
    clearTimeout(tipState.timer);
    tipState.timer = setTimeout(() => target.isConnected && showTip(target), ms);
  };
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const target = e.target.closest?.('[data-tip]');
    if (target === tipState.target) return;
    if (!target) {
      if (tipState.target && !el.tip?.contains(e.target)) hideTip();
      else clearTimeout(tipState.timer);
      return;
    }
    hideTip();
    later(target, 380);
  });
  document.addEventListener('focusin', (e) => {
    const target = e.target.closest?.('[data-tip]');
    if (target && target !== tipState.target) later(target, 650);
  });
  document.addEventListener('focusout', () => hideTip());
  document.addEventListener('pointerdown', (e) => !e.target.closest?.('.help-chip') && hideTip(), true);
  // Phones have no hover: press and hold anything with a card to see it.
  // The tap that ends the hold does not also press it.
  let hold = 0;
  let held = false;
  document.addEventListener('pointerdown', (e) => {
    held = false;
    clearTimeout(hold);
    const target = e.pointerType === 'touch' && e.target.closest?.('[data-tip]');
    if (!target || target.classList.contains('help-chip')) return;
    hold = setTimeout(() => {
      held = true;
      showTip(target);
    }, 480);
  });
  for (const ev of ['pointerup', 'pointercancel']) document.addEventListener(ev, () => clearTimeout(hold));
  document.addEventListener('click', (e) => {
    if (!held) return;
    held = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  // Glossary chips open their card on a tap or click too (phones have no
  // hover, and Safari does not focus a tapped button); again closes it.
  document.addEventListener('click', (e) => {
    const chip = e.target.closest?.('.help-chip[data-tip]');
    if (!chip) return;
    if (tipState.target === chip) hideTip();
    else showTip(chip);
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && el.tip && hideTip(), true);
  document.addEventListener('scroll', () => el.tip && hideTip(), true);
}

// Sections and controls that do not apply to this game (or spin style)
// stay in view, greyed out and locked, with the reason (see ui/applies.js).
function markApplies(root) {
  const game = gameOf();
  const spin = state.project.spin.type;
  const lock = (node) => {
    for (const c of node.querySelectorAll('input, select, textarea, button:not(.group-toggle)')) c.disabled = true;
  };
  for (const sec of root.querySelectorAll('section.group[data-key]')) {
    const why = notApplying(sec.dataset.key, game, spin);
    if (!why) continue;
    sec.classList.add('na');
    lock(sec.querySelector(':scope > .group-body') || sec);
    sec.querySelector(':scope > h3 > .group-toggle')?.append(h('span', { class: 'na-badge' }, why));
    // Folded unless you opened it yourself.
    if (!(sec.dataset.key in (ui.sections || {}))) setSection(sec, false, false);
  }
  for (const key of Object.keys(APPLIES)) {
    if (key.includes('/')) continue;
    const node = root.querySelector(`#${CSS.escape(key)}`);
    const why = node && notApplying(key, game, spin);
    if (!why) continue;
    const block = node.closest('.field, .toggle') || node;
    block.classList.add('na');
    lock(block);
    if (block.matches('input, select, button')) block.disabled = true;
    if (!block.closest('section.na')) block.append(h('p', { class: 'na-note' }, why));
  }
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
  if (hist.timer) recordNow();
  state.project = p;
  state.sel = 0;
  state.t = 0;
  changed('all');
  recordNow();
  renderAll();
  if (ui.bank.open) renderBank();
  toast(msg, 'info', 4000);
}

const ownRound = (g, r) => (g === 'wheel' ? r.outcome === 'wheel' : g === 'holdspin' ? r.outcome === 'respin' || r.outcome === 'collect' : r.outcome !== 'wheel');

// Switching games keeps the rounds that fit the new game; the others are
// kept aside and come back when you switch back.
function setGame(g) {
  const P = state.project;
  const from = gameOf();
  if (from === g) return;
  state.stash = state.stash || {};
  state.stash[from] = P.rounds;
  P.game = g;
  // Rounds carry over only when some are the new game's own kind: a wheel
  // spin alone (allowed as a bonus in the other games) does not make a
  // Hold & Spin or slot animation.
  let rounds = state.stash[g] || P.rounds.filter((r) => GAME_OUTCOMES[g].includes(r.outcome));
  if (!rounds.some((r) => ownRound(g, r))) {
    if (g === 'wheel') rounds = [newRound('wheel', { wheelSegment: 2 }), newRound('wheel', { wheelSegment: 5 }), newRound('wheel', { wheelSegment: 3 })];
    else if (g === 'holdspin') rounds = holdRounds(P, { start: holdSpinConfig(P).startCoins, finale: 'fill', specials: 1 });
    else rounds = defaultProject().rounds;
  }
  P.rounds = rounds;
  state.sel = 0;
  state.t = 0;
  changed('all');
  renderAll();
  toast(`${GAMES.find((x) => x.id === g).label}: ${rounds.length} round${rounds.length === 1 ? '' : 's'}. Switch back to get your ${GAMES.find((x) => x.id === from).label.toLowerCase()} rounds again.`, 'info', 5000);
}

function holdSettings() {
  const P = state.project;
  const hs = holdSpinConfig(P);
  P.holdspin = { ...hs, ...(P.holdspin || {}) };
  const H = P.holdspin;
  const cells = P.grid.reels * P.grid.rows;
  return section(
    'Hold & Spin',
    rangeField({ id: 'm-hs-respins', label: 'Respins counter', value: hs.respins, min: 1, max: 9, step: 1, onInput: num(H, 'respins', 'timeline', () => renderInspector()) }),
    toggleField({ id: 'm-hs-reset', label: 'A coin landing resets the counter', checked: hs.reset, onChange: num(H, 'reset', 'timeline', () => renderInspector()) }),
    gameOf() === 'holdspin' ? rangeField({ id: 'm-hs-start', label: 'Coins on the board at the start', value: hs.startCoins, min: 0, max: cells - 2, step: 1, onInput: num(H, 'startCoins', 'timeline', () => renderInspector()), hint: 'They pop in during the intro. 0 starts with an empty board.' }) : null,
    rangeField({ id: 'm-hs-mid', label: 'Respin length (mid phase)', unit: 's', value: hs.respinMid, min: 0, max: 3, step: 0.05, onInput: num(H, 'respinMid') }),
    toggleField({ id: 'm-hs-grand', label: 'Grand prize when the board fills', checked: hs.grand.enabled, onChange: (v) => { H.grand = { ...hs.grand, enabled: v }; changed('timeline'); renderPanel(); } }),
    hs.grand.enabled ? textField({ id: 'm-hs-grand-v', label: 'Grand prize (× bet)', type: 'number', value: hs.grand.value, onChange: (v) => { H.grand = { ...hs.grand, value: Math.max(0, Number(v) || 0) }; changed('timeline'); } }) : null,
    moreLink('Asset Bank › Coins', { bank: 'coins', section: 'hold-spin-coins' }, 'Coins, their values and art'),
    moreLink('Features › Jackpot boxes', { tab: 'features', section: 'jackpot-boxes', id: 'jp-on' }, 'Show the jackpots as boxes')
  );
}

// The pots above the machine: how many, where, their art and colours, and
// the beams between them and the cells.
function potsSettings() {
  const P = state.project;
  const d = defaultPots();
  P.pots = { ...d, ...(P.pots || {}) };
  const T = P.pots;
  T.items = d.items.map((it, i) => ({ ...it, ...((T.items || [])[i] || {}) }));
  T.beam = { ...d.beam, ...(T.beam || {}) };
  const cfg = potsConfig(P);
  const all = (k, obj = T) => (v) => {
    obj[k] = v;
    changed('all');
    renderPanel();
    renderInspector();
  };
  const on = toggleField({ id: 'm-pots', label: 'Pots above the machine', checked: !!T.enabled, onChange: all('enabled'), hint: 'A pot of gold, a pot of gems and a pot of fruits stand on the frame. They collect wins (winners beam up into them) and upgrade cells (they fire boosters). They take the title\'s place.' });
  if (!T.enabled) return section('Pots above the machine', on);
  const W = winFxConfig(P);
  return section(
    'Pots above the machine',
    on,
    segmented({ id: 'm-pots-count', label: 'Pots', value: cfg.count, options: [1, 2, 3].map((n) => ({ value: n, label: String(n) })), onChange: (v) => all('count')(Number(v)) }),
    ...T.items.slice(0, cfg.count).map((it, i) => potRow(it, i)),
    moreLink('Asset Bank › Scene', { bank: 'scene', id: 'pot-up-0' }, 'Your own pot art'),
    h('h4', { class: 'insp-sub' }, 'What they do'),
    toggleField({
      id: 'm-pots-collect',
      label: 'Winners beam up into the pots',
      checked: W.style === 'collect',
      onChange: (v) => {
        P.winfx = { ...W, style: v ? 'collect' : 'pop' };
        changed('timeline');
        renderPanel();
        renderInspector();
      },
      hint: potsCollect(cfg) ? 'Collect: the same as Beam to pots for the winning symbols; a round can still pick its own.' : 'No pot collects: set one to Collects or Both above.',
    }),
    moreLink('Wins › Winning symbols', { tab: 'wins', id: 'wf-style' }, 'Winning symbols'),
    h('p', { class: 'hint', id: 'm-pots-boost-hint' }, potsUpgrade(cfg) ? 'Upgrade: add Boosters to a round. After its spin the pots fire them at cells.' : 'No pot upgrades: set one to Upgrades or Both above for boosters.'),
    potsUpgrade(cfg) ? moreLink('Round inspector › Boosters', { round: ['none', 'small', 'medium', 'big', 'nearmiss', 'freespins', 'bonus', 'wheel'], id: 'ri-boost' }, 'Add boosters') : null,
    cfg.count > 1 ? selectField({ id: 'm-pots-aim', label: 'Which pot fires or catches', value: cfg.aim, options: potAims(cfg.count), onChange: (v) => all('aim')(v), hint: cfg.aim === 'type' ? null : 'Nearest: each cell goes to the pot above its reels. By symbol: each symbol has its pot.' }) : null,
    cfg.count > 1 && cfg.aim === 'type' ? ownerTable(cfg) : null,
    h('h4', { class: 'insp-sub' }, 'Where they stand'),
    rangeField({ id: 'm-pots-band', label: 'Room above the machine', unit: '× height', value: cfg.band, min: 0.15, max: 0.45, step: 0.01, onInput: num(T, 'band', 'all'), hint: 'The machine scales down to make room.' }),
    rangeField({ id: 'm-pots-size', label: 'Pot size', value: cfg.size, min: 0.5, max: 1.8, step: 0.05, onInput: num(T, 'size', 'all'), hint: 'Big pots stop at the top of the screen. To fit taller pots, zoom the machine out.' }),
    moreLink('Machine › Framing', { tab: 'machine', id: 'm-zoom' }, 'Zoom'),
    rangeField({ id: 'm-pots-spacing', label: 'Spacing', value: cfg.spacing, min: 0.6, max: 2.5, step: 0.05, onInput: num(T, 'spacing', 'all'), hint: '1 stands them side by side; less overlaps them.' }),
    rangeField({ id: 'm-pots-overlap', label: 'Hidden behind the frame', value: cfg.overlap, min: 0, max: 0.8, step: 0.01, onInput: num(T, 'overlap', 'all') }),
    toggleField({ id: 'm-pots-plates', label: 'Nameplates show what each pot caught', checked: cfg.plates, onChange: num(T, 'plates', 'timeline') }),
    h('h4', { class: 'insp-sub' }, 'Beams'),
    segmented({ id: 'm-beam-curve', label: 'Curve', value: cfg.beam.curve, options: BEAM_CURVES.map((c) => ({ value: c.id, label: c.label })), onChange: num(T.beam, 'curve', 'timeline') }),
    rangeField({ id: 'm-beam-bend', label: 'Bend', value: cfg.beam.bend, min: 0, max: 1.5, step: 0.05, onInput: num(T.beam, 'bend') }),
    rangeField({ id: 'm-beam-width', label: 'Thickness', value: cfg.beam.width, min: 0.3, max: 3, step: 0.05, onInput: num(T.beam, 'width') }),
    rangeField({ id: 'm-beam-travel', label: 'Travel time', unit: 's', value: cfg.beam.travel, min: 0.12, max: 1.2, step: 0.01, onInput: num(T.beam, 'travel') }),
    rangeField({ id: 'm-beam-stagger', label: 'Time between beams', unit: 's', value: cfg.beam.stagger, min: 0, max: 0.8, step: 0.01, onInput: num(T.beam, 'stagger') })
  );
}

// A pot's art, painted or yours, standing on the thumbnail's floor.
function potThumb(it) {
  const thumb = h('canvas', { class: 'thumb', width: 96, height: 96 });
  const g = thumb.getContext('2d');
  const paint = (img) => {
    g.clearRect(0, 0, 96, 96);
    const k = Math.min(96 / (img.naturalWidth || img.width), 96 / (img.naturalHeight || img.height));
    const w = (img.naturalWidth || img.width) * k;
    const hh = (img.naturalHeight || img.height) * k;
    g.drawImage(img, (96 - w) / 2, 96 - hh, w, hh);
  };
  if (it.src) optImage(it.src).then((img) => img && paint(img));
  else paint(paintPot(it.art, 192));
  return thumb;
}

// One pot: which it is (gold, gems or fruits), its colour (beams, glow and
// nameplate) and what it does. Your own art for it is in the Asset Bank.
function potRow(it, i) {
  return h(
    'div',
    { class: 'asset-row pot-row', id: `m-pot-${i}` },
    h('div', { class: 'asset-thumb' }, potThumb(it)),
    h(
      'div',
      { class: 'pot-fields' },
      h('select', { id: `m-pot-art-${i}`, 'aria-label': `Pot ${i + 1}: gold, gems or fruits`, onchange: (e) => {
        const a = POT_ARTS.find((x) => x.id === e.target.value);
        Object.assign(it, { art: a.id, name: a.label, color: a.color });
        changed('all');
        renderPanel();
      } }, POT_ARTS.map((a) => h('option', { value: a.id, selected: it.art === a.id }, a.label))),
      h('input', { type: 'color', id: `m-pot-color-${i}`, value: it.color, 'aria-label': `${it.name}: beam colour`, title: 'Beam, glow and nameplate colour', onchange: (e) => { it.color = e.target.value; changed('all'); } }),
      h('select', { id: `m-pot-role-${i}`, class: 'pot-role', 'aria-label': `${it.name}: what it does`, onchange: (e) => {
        it.role = e.target.value;
        changed('timeline');
        renderPanel();
        renderInspector();
      } }, POT_ROLES.map((r) => h('option', { value: r.id, selected: (it.role || 'both') === r.id }, r.label)))
    )
  );
}

// By symbol: which pot each symbol goes to. Auto follows the pots' art
// (gems to the pot of gems, fruit to the pot of fruits, the rest to gold).
function ownerTable(cfg) {
  const P = state.project;
  const T = P.pots;
  const lay = symbolLayout(P);
  const rows = P.symbols.map((s, i) => [s.id, s.name, i, s.role]).filter(([, , , role]) => role === 'normal' || role === 'wild' || role === 'multiplier');
  if (lay.virtualOrb) rows.push(['orb', 'Multiplier (built-in)', lay.orbSym]);
  rows.push(['cash', 'Cash', lay.coinBase]);
  const auto = { ...cfg, owners: {} };
  return h(
    'div',
    { class: 'field', id: 'm-pot-owners' },
    h('span', { class: 'label' }, 'Each symbol\'s pot'),
    h(
      'div',
      { class: 'owner-grid' },
      rows.map(([key, name, sym]) => {
        const a = ownerOf(P, auto, key);
        const cur = T.owners?.[key];
        const thumb = h('canvas', { class: 'owner-thumb', width: 56, height: 56 });
        const img = state.images?.symbols?.[sym];
        if (img) {
          const k = Math.min(56 / (img.naturalWidth || img.width), 56 / (img.naturalHeight || img.height));
          const w = (img.naturalWidth || img.width) * k;
          const hh = (img.naturalHeight || img.height) * k;
          thumb.getContext('2d').drawImage(img, (56 - w) / 2, (56 - hh) / 2, w, hh);
        }
        const sel = h(
          'select',
          { id: `m-pot-owner-${key}`, 'aria-label': `${name}: its pot`, onchange: (e) => {
            const owners = { ...(T.owners || {}) };
            if (e.target.value === '') delete owners[key];
            else owners[key] = Number(e.target.value);
            T.owners = owners;
            changed('timeline');
          } },
          [h('option', { value: '', selected: cur == null }, `Auto: ${a >= 0 ? cfg.items[a].name : 'nearest pot'}`), ...cfg.items.map((it, p) => h('option', { value: p, selected: cur === p }, it.name)), h('option', { value: -1, selected: cur === -1 }, 'Nearest pot')]
        );
        return h('div', { class: 'owner-row' }, thumb, h('span', { class: 'owner-name' }, name), sel);
      })
    ),
    h('p', { class: 'hint' }, 'A winner beams up to its symbol\'s pot; a booster comes from the pot of the symbol it makes. When that pot does not collect (or upgrade), the nearest one that does takes it.')
  );
}

function panelMachine() {
  const P = state.project;
  const pm = P.machine.payMode;
  const game = gameOf();
  return [
    section(
      'Game',
      segmented({ id: 'm-game', value: game, options: GAMES.map((g) => ({ value: g.id, label: g.label, hint: g.hint })), onChange: setGame }),
      h('p', { class: 'hint' }, GAMES.find((g) => g.id === game).hint)
    ),
    section(
      'Reels',
      rangeField({ id: 'm-reels', label: 'Reels', value: P.grid.reels, min: 3, max: 8, step: 1, onInput: num(P.grid, 'reels', 'all', () => renderInspector()) }),
      rangeField({ id: 'm-rows', label: 'Rows', value: P.grid.rows, min: 1, max: 7, step: 1, onInput: num(P.grid, 'rows', 'all', () => renderInspector()) }),
      rangeField({ id: 'm-aspect', label: 'Cell height', unit: '× width', value: P.grid.cellAspect, min: 0.6, max: 1.4, step: 0.02, onInput: num(P.grid, 'cellAspect', 'all') }),
      rangeField({ id: 'm-peek', label: 'Partial symbols above and below', value: P.grid.peek, min: 0, max: 0.5, step: 0.01, onInput: num(P.grid, 'peek', 'all') }),
      rangeField({ id: 'm-curve', label: 'Reel curvature', value: P.grid.curvature, min: 0, max: 1, step: 0.01, onInput: num(P.grid, 'curvature', 'all'), hint: 'Bends the strip like a drum. Preview and MP4 only; the After Effects reels stay flat.' }),
      toggleField({ id: 'm-row-lines', label: 'Row lines', checked: !!P.machine.rowLines, onChange: num(P.machine, 'rowLines', 'all'), hint: 'Thin lines between the rows across the reels. Per-cell spins always have them.' })
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
      'Framing',
      rangeField({ id: 'm-zoom', label: 'Zoom', unit: '%', value: Math.round((P.machine.zoom || 1) * 100), min: 50, max: 160, step: 1, onInput: (v) => num(P.machine, 'zoom', 'all')(v / 100), hint: 'Scales the machine with its pots, title and win meter, about their middle. Zoom out when tall pots crowd the top; zoom in to fill the screen. 100% fits the screen.' })
    ),
    section(
      'Look',
      selectField({ id: 'm-theme', label: 'Theme', value: P.machine.theme, options: Object.entries(THEMES).map(([k, t]) => ({ value: k, label: t.name })), onChange: (v) => num(P.machine, 'theme', 'all')(v) }),
      toggleField({
        id: 'm-title-on',
        label: 'Title above the machine',
        checked: P.machine.showTitle !== false,
        onChange: (v) => {
          P.machine.showTitle = v;
          changed('all');
          renderPanel();
        },
        hint: potsConfig(P).on ? 'The pots stand where the title goes, so it is not shown while they are on.' : P.machine.showTitle === false ? 'Off: the machine takes the room, leaving a strip for the free spins counter.' : 'The name, or your own logo.',
      }),
      P.machine.showTitle !== false ? textField({ id: 'm-title', label: 'Title', value: P.machine.title, onChange: num(P.machine, 'title', 'all') }) : null,
      P.machine.showTitle !== false && !potsConfig(P).on ? moreLink('Asset Bank › Scene art', { bank: 'scene', id: 'asset-up-logo' }, 'Your own logo') : null,
      toggleField({ id: 'm-marquee', label: 'Marquee bulbs on the frame', checked: P.machine.marquee, onChange: num(P.machine, 'marquee', 'timeline') }),
      toggleField({ id: 'm-hud', label: 'Win meter under the reels', checked: P.machine.showHud, onChange: num(P.machine, 'showHud', 'all') })
    ),
    section('Money', ...moneyFields(P)),
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

// Features that sit on the machine. Per-round features (free spins,
// wilds, mystery, multipliers, the collector, boosters) are in the round
// inspector.
function panelFeatures() {
  return [
    h('p', { class: 'hint tab-intro' }, 'Features built into the machine. What happens in a single round (free spins, wilds, mystery, multipliers, the collector, boosters) is added in the round inspector.'),
    holdSettings(),
    potsSettings(),
    jackpotSettings(),
  ];
}

// The bet (kept as typed: "1" or "1.00" decides the decimals), the currency
// (none, a common sign, or your own) and how many decimals amounts show.
const CURRENCIES = ['', '$', '€', '£', '¥', '₹', '₪', 'R$'];
let currencyOther = false;
function moneyFields(P) {
  const M = P.machine;
  const bet = h('input', { type: 'text', inputmode: 'decimal', id: 'm-bet', value: M.betText ?? String(M.bet ?? 1) });
  bet.addEventListener('change', () => {
    const txt = bet.value.trim().replace(',', '.');
    const v = Number(txt);
    if (!(v > 0)) {
      bet.value = M.betText ?? String(M.bet);
      return;
    }
    M.bet = v;
    M.betText = txt;
    changed('timeline');
    renderPanel();
    renderInspector();
  });
  const custom = currencyOther || !CURRENCIES.includes(M.currency || '');
  const dec = M.decimals === 'auto' || M.decimals == null ? 'auto' : String(M.decimals | 0);
  const shown = moneyDecimals(P);
  return [
    h(
      'div',
      { class: 'row3' },
      h('div', { class: 'field' }, h('label', { for: 'm-bet' }, 'Bet'), bet),
      selectField({
        id: 'm-cur',
        label: 'Currency',
        value: custom ? 'other' : M.currency || '',
        options: [...CURRENCIES.map((c) => ({ value: c, label: c || 'None' })), { value: 'other', label: 'Other…' }],
        onChange: (v) => {
          currencyOther = v === 'other';
          if (!currencyOther) M.currency = v;
          else if (CURRENCIES.includes(M.currency || '')) M.currency = '';
          changed('timeline');
          renderPanel();
          if (currencyOther) document.getElementById('m-cur-text')?.focus();
        },
      }),
      selectField({
        id: 'm-dec',
        label: 'Decimals',
        value: dec,
        options: [
          { value: 'auto', label: 'As the bet' },
          { value: '0', label: 'None (1,250)' },
          { value: '2', label: 'Two (1,250.00)' },
        ],
        onChange: (v) => {
          M.decimals = v === 'auto' ? 'auto' : Number(v);
          changed('timeline');
          renderPanel();
        },
      })
    ),
    custom
      ? textField({
          id: 'm-cur-text',
          label: 'Your currency',
          value: M.currency || '',
          placeholder: 'CHF, ฿, coins…',
          onChange: (v) => {
            M.currency = v.replace(/["'\\]/g, '').slice(0, 4);
            changed('timeline');
          },
          hint: 'Up to 4 characters, in front of every amount. Add a space for a gap: "CHF ".',
        })
      : null,
    h('p', { class: 'hint', id: 'm-money-note' }, `Every amount (win meter, big wins, coins, pots, jackpot boxes) shows ${shown ? 'two decimals' : 'whole numbers'}${dec === 'auto' ? `, as the bet is typed: ${shown ? '1.00 gives cents, 1 whole numbers' : '1 gives whole numbers, 1.00 cents'}` : ''}. Example: ${formatPrize(1250, M.currency || '', shown)}.`),
  ];
}

// Progressive jackpot boxes: how many, where around the machine, their
// size, values (fixed or running), names and colours, and what wins them.
function jackpotSettings() {
  const P = state.project;
  P.jackpots = { ...defaultJackpots(), ...(P.jackpots || {}) };
  const J = P.jackpots;
  const cfg = jackpotsConfig({ ...P, jackpots: { ...J, enabled: true } });
  const all = (k) => (v) => {
    J[k] = v;
    changed('all');
    renderPanel();
    renderInspector();
  };
  const on = toggleField({ id: 'jp-on', label: 'Jackpot boxes', checked: !!J.enabled, onChange: all('enabled'), hint: 'Grand, Major, Minor and Mini boxes around the machine, with fixed or running values. A jackpot won on the machine lights its box.' });
  if (!J.enabled) return section('Jackpot boxes', on);
  const potsOn = potsConfig(P).on;
  const H = (P.holdspin = { ...holdSpinConfig(P), ...(P.holdspin || {}) });
  const coin = (id) => H.coins.find((c) => c.id === id);
  // Names, values and colours are the Hold & Spin jackpots': one place to
  // change them, here or on the coins.
  const boxRow = (t) => {
    const c = coin(t.id);
    const grand = t.id === 'grand';
    const setLabel = (v) => {
      if (grand) J.grandLabel = v;
      else if (c) c.label = v;
      changed('all');
    };
    const setValue = (v) => {
      const n = Math.max(0, Number(v) || 0);
      if (grand) H.grand = { ...H.grand, value: n };
      else if (c) c.values = [n];
      changed('timeline');
    };
    const setPalette = (v) => {
      if (grand) J.grandPalette = v;
      else if (c) c.palette = v;
      changed('all');
    };
    const value = grand ? H.grand.value : c ? Math.max(...(Array.isArray(c.values) ? c.values : [c.values]).map(Number).filter((x) => x > 0), 0) : 0;
    return h(
      'div',
      { class: 'jp-row' },
      h('input', { type: 'text', id: `jp-label-${t.id}`, value: t.label, 'aria-label': `${t.id} box name`, onchange: (e) => setLabel(e.target.value.slice(0, 16)) }),
      h('input', { type: 'number', id: `jp-value-${t.id}`, min: 0, value, 'aria-label': `${t.label} seed value in bets`, onchange: (e) => setValue(e.target.value) }),
      h('select', { id: `jp-pal-${t.id}`, 'aria-label': `${t.label} colour`, onchange: (e) => setPalette(e.target.value) }, COIN_PALETTES.map((pl) => h('option', { value: pl, selected: t.palette === pl }, pl[0].toUpperCase() + pl.slice(1))))
    );
  };
  const placeOpts = JP_PLACES.map((pl) => ({ value: pl.id, label: pl.label, hint: pl.four && cfg.count < 4 ? 'Four boxes only' : (pl.id === 'above' || pl.id === 'ends') && potsOn ? 'The pots stand above the machine' : null }));
  const placeField = segmented({ id: 'jp-place', label: 'Where they stand', value: cfg.place, options: placeOpts, onChange: (v) => all('place')(v) });
  // Places that cannot be used now stay visible, locked, saying why.
  for (const pl of JP_PLACES) {
    const why = pl.four && cfg.count < 4 ? 'Four boxes only' : (pl.id === 'above' || pl.id === 'ends') && potsOn ? 'The pots stand above' : null;
    const b = placeField.querySelector(`#jp-place-${pl.id}`);
    if (b && why) {
      b.disabled = true;
      b.title = why;
    }
  }
  const linked = (P.wheel?.segments || []).map((sg, i) => [sg, i]).filter(([sg]) => segmentKind(sg) === 'prize');
  const nLinked = linked.filter(([sg]) => wheelJackpot(cfg, sg)).length;
  const wheelRows = P.game === 'slot' && P.rounds.some((r) => r.outcome === 'wheel') && linked.length
    ? foldRow('jp-wheel', 'Wheel segments', `${nLinked} pay${nLinked === 1 ? 's' : ''} a box`, h(
        'div',
        { class: 'field', id: 'jp-wheel' },
        h(
          'div',
          { class: 'jp-wheel' },
          linked.map(([sg, i]) =>
            h(
              'label',
              { class: 'jp-wheel-row' },
              h('span', null, sg.label || `Segment ${i + 1}`),
              h(
                'select',
                { id: `jp-seg-${i}`, 'aria-label': `What segment ${sg.label || i + 1} pays`, onchange: (e) => { sg.jackpot = e.target.value; changed('timeline'); renderPanel(); } },
                [['auto', `Auto${wheelJackpot(cfg, { ...sg, jackpot: 'auto' }) ? ` (${cfg.tiers.find((t) => t.id === wheelJackpot(cfg, { ...sg, jackpot: 'auto' })).label})` : ' (its value)'}`], ['none', 'Its value'], ...cfg.tiers.map((t) => [t.id, `The ${t.label} box`])].map(([v, l]) => h('option', { value: v, selected: (sg.jackpot || 'auto') === v }, l))
              )
            )
          )
        ),
        h('p', { class: 'hint' }, 'Auto links a segment by its label: GRAND or JACKPOT to the Grand, MAJOR, MINOR, MINI to theirs. A linked segment pays what its box shows.')
      ))
    : null;
  return section(
    'Jackpot boxes',
    on,
    segmented({ id: 'jp-count', label: 'Boxes', value: cfg.count, options: [2, 3, 4].map((n) => ({ value: n, label: String(n), hint: n === 4 ? 'Grand, Major, Minor and Mini' : n === 3 ? 'Grand, Major and Minor' : 'Grand and Major' })), onChange: (v) => all('count')(Number(v)) }),
    placeField,
    h('p', { class: 'hint' }, cfg.place === 'sides' || cfg.place === 'ends' ? 'Two on each side, the bigger pair first.' : potsOn ? 'With the pots above the machine the boxes stand at its sides or below it.' : 'Two or three boxes stand on one side; four can also split, two on each side.'),
    segmented({ id: 'jp-sizing', label: 'Size', value: cfg.sizing, options: [{ value: 'tiers', label: 'By tier', hint: 'The Grand biggest, the Mini smallest' }, { value: 'same', label: 'All the same' }], onChange: (v) => all('sizing')(v) }),
    rangeField({ id: 'jp-size', label: 'Box size', value: cfg.size, min: 0.4, max: 2, step: 0.05, onInput: num(J, 'size', 'all') }),
    rangeField({ id: 'jp-padding', label: 'Distance from the machine', value: cfg.padding, min: -1, max: 2, step: 0.05, onInput: num(J, 'padding', 'all'), hint: 'Below 0 the boxes tuck over the frame.' }),
    rangeField({ id: 'jp-spacing', label: 'Space between boxes', value: cfg.spacing, min: -0.3, max: 1.5, step: 0.05, onInput: num(J, 'spacing', 'all') }),
    h('h4', { class: 'insp-sub' }, 'Values'),
    segmented({ id: 'jp-values', label: 'Values', value: J.running ? 'running' : 'fixed', options: [{ value: 'fixed', label: 'Fixed' }, { value: 'running', label: 'Running', hint: 'The numbers climb like a progressive' }], onChange: (v) => all('running')(v === 'running') }),
    J.running ? rangeField({ id: 'jp-growth', label: 'Running speed', unit: '% / s', value: Number(J.growth ?? 0.15), min: 0.01, max: 2, step: 0.01, onInput: num(J, 'growth'), hint: 'How much of its seed a box adds every second. Won, it shows what it paid for a moment, then starts again from its seed.' }) : null,
    // The machine's decimals, here too: where you look for them on a box.
    segmented({
      id: 'jp-decimals',
      label: 'Decimals',
      value: P.machine.decimals === 'auto' || P.machine.decimals == null ? 'auto' : String(P.machine.decimals | 0),
      options: [{ value: 'auto', label: 'As the bet' }, { value: '0', label: '1,250' }, { value: '2', label: '1,250.00' }],
      onChange: (v) => {
        P.machine.decimals = v === 'auto' ? 'auto' : Number(v);
        changed('timeline');
        renderPanel();
      },
    }),
    h('p', { class: 'hint' }, `Every amount follows this. Now: ${formatPrize(1250, P.machine.currency || '', moneyDecimals(P))}.`),
    moreLink('Machine › Money', { tab: 'machine', id: 'm-bet' }, 'Bet and currency'),
    h('div', { class: 'jp-rows' }, h('div', { class: 'jp-row jp-head', 'aria-hidden': 'true' }, h('span', null, 'Name'), h('span', null, 'Seed (× bet)'), h('span', null, 'Colour')), cfg.tiers.map(boxRow)),
    h('p', { class: 'hint' }, 'Name, seed value (in bets) and colour per box. They are the Hold & Spin jackpots: the Mini, Minor and Major coins and the Grand prize.'),
    moreLink('Asset Bank › Scene', { bank: 'scene', id: 'jpa-up-grand' }, 'Your own box art'),
    moreLink('Asset Bank › Coins', { bank: 'coins', section: 'hold-spin-coins' }, 'The jackpot coins'),
    h('h4', { class: 'insp-sub' }, 'What wins them'),
    h('p', { class: 'hint', id: 'jp-wins' }, 'Collecting a Mini, Minor or Major coin wins its box, and a full Hold & Spin board the Grand: each pays what its box shows then. A round can award a box too (Add a feature → Jackpot), and a wheel segment can pay one. A Major also takes the whole screen.'),
    moreLink('Round inspector › Jackpot', { round: JACKPOT_ROUNDS, id: 'ri-jackpot' }, 'A round awards a box'),
    wheelRows
  );
}

function coinTile(ct, i) {
  const P = state.project;
  const lay = symbolLayout(P);
  const coins = P.holdspin.coins;
  const asText = (v) => (Array.isArray(v) ? v.join(', ') : String(v ?? ''));
  return h(
    'div',
    { class: 'sym' },
    thumbCanvas(lay.coinBase + i),
    h(
      'div',
      { class: 'sym-fields' },
      h('input', { type: 'text', id: `coin-name-${ct.id}`, value: ct.name, 'aria-label': 'Coin name', oninput: (e) => { ct.name = e.target.value; save(); refreshList(); } }),
      h(
        'div',
        { class: 'sym-row' },
        h('input', { type: 'text', id: `coin-label-${ct.id}`, value: ct.label || '', placeholder: 'No label', 'aria-label': 'Label on the coin', onchange: (e) => { ct.label = e.target.value.toUpperCase().slice(0, 10); e.target.value = ct.label; changed('all'); } }),
        h('select', { id: `coin-pal-${ct.id}`, 'aria-label': 'Coin colour', onchange: (e) => { ct.palette = e.target.value; changed('all'); } }, COIN_PALETTES.map((pl) => h('option', { value: pl, selected: ct.palette === pl }, pl[0].toUpperCase() + pl.slice(1))))
      ),
      h('label', { class: 'sym-weight', for: `coin-vals-${ct.id}` }, h('span', null, '× bet'), h('input', { type: 'text', id: `coin-vals-${ct.id}`, value: asText(ct.values), 'aria-label': `${ct.name} values in bets`, onchange: (e) => {
        const v = e.target.value.split(/[,\s]+/).map(Number).filter((x) => x > 0);
        ct.values = v.length ? v : [1];
        e.target.value = ct.values.join(', ');
        changed('timeline');
      } }))
    ),
    h(
      'div',
      { class: 'sym-actions' },
      button('', async () => {
        const [f] = await pickFiles('image/*');
        if (!f) return;
        ct.src = await readFileAsDataURL(f);
        changed('all');
        renderAssets();
      }, { class: 'icon-btn tiny', icon: 'upload', title: ct.src ? 'Replace art' : 'Upload coin art', id: `coin-up-${ct.id}` }),
      ct.src
        ? button('', () => { ct.src = null; changed('all'); renderAssets(); }, { class: 'icon-btn tiny', icon: 'dice', title: 'Back to the painted coin', id: `coin-paint-${ct.id}` })
        : null,
      i > 0
        ? button('', () => {
            coins.splice(i, 1);
            P.rounds.forEach((r) => (r.specials = (r.specials || []).filter((id) => id !== ct.id)));
            changed('all');
            renderAssets();
            renderInspector();
          }, { class: 'icon-btn tiny', icon: 'trash', title: 'Remove this coin type', id: `coin-del-${ct.id}` })
        : null
    )
  );
}

function coinSection() {
  const P = state.project;
  P.holdspin = { ...holdSpinConfig(P), ...(P.holdspin || {}) };
  const H = P.holdspin;
  const lay = symbolLayout(P);
  const tiles = h('div', { class: 'symbols' });
  H.coins.forEach((ct, i) => tiles.append(coinTile(ct, i)));
  return section(
    'Hold & Spin coins',
    h('p', { class: 'hint' }, 'The first is the regular coin; the others are specials you place in respins.'),
    helpChips({ id: 'coin-kinds' }, 'What each coin does', COIN_CHIPS.map(([k, n]) => helpChip({ id: `coin-kinds-help-${k}` }, n))),
    tiles,
    H.coins.length < 8
      ? button('Add a coin type', () => {
          H.coins.push({ id: `coin${Date.now().toString(36)}`, name: 'Bonus coin', label: 'BONUS', palette: COIN_PALETTES[H.coins.length % COIN_PALETTES.length], values: [25], src: null });
          changed('all');
          renderAssets();
        }, { class: 'btn small', icon: 'plus', id: 'coin-add' })
      : null,
    h(
      'div',
      { class: 'asset-row' },
      h('div', { class: 'asset-thumb' }, thumbCanvas(lay.blankSym)),
      h('div', { class: 'asset-text' }, h('strong', null, 'Empty cell'), h('span', { class: 'hint' }, 'What an empty cell shows. Built-in: a dark socket.')),
      h(
        'div',
        { class: 'asset-actions' },
        button(H.emptySrc ? 'Replace' : 'Upload', async () => {
          const [f] = await pickFiles('image/*');
          if (!f) return;
          H.emptySrc = await readFileAsDataURL(f);
          changed('all');
          renderAssets();
        }, { class: 'btn small', id: 'coin-empty-up' }),
        H.emptySrc ? button('Clear', () => { H.emptySrc = null; changed('all'); renderAssets(); }, { class: 'btn small ghost', id: 'coin-empty-clear' }) : null
      )
    ),
    moreLink('Features › Hold & Spin', { tab: 'features', id: 'm-hs-respins' }, 'Respins and how coins land'),
    moreLink('Features › Jackpot boxes', { tab: 'features', section: 'jackpot-boxes', id: 'jp-on' }, 'Jackpot values')
  );
}

// The pots and the jackpot boxes keep their art in Scene too; while one is
// off, a line says so and links to where it is turned on.
function offSceneFeatures(game) {
  const P = state.project;
  const pots = game === 'slot' && !potsConfig(P).on;
  const boxes = game !== 'wheel' && !jackpotsConfig(P).on;
  if (!pots && !boxes) return [];
  const what = pots && boxes ? 'The pots and the jackpot boxes get' : pots ? 'The pots get' : 'The jackpot boxes get';
  return [
    h('p', { class: 'hint' }, `${what} their art here once they are on.`),
    pots ? moreLink('Features › Pots above the machine', { tab: 'features', section: 'pots-above-the-machine', id: 'm-pots' }, 'Pots') : null,
    boxes ? moreLink('Features › Jackpot boxes', { tab: 'features', section: 'jackpot-boxes', id: 'jp-on' }, 'Jackpot boxes') : null,
  ];
}

// Asset Bank › Scene, with the boxes on: each jackpot box's art, painted
// in its colour or yours. Its name, seed and colour stay with the boxes in
// the Features tab.
function jackpotArtSection() {
  const P = state.project;
  const cfg = jackpotsConfig(P);
  const link = moreLink('Features › Jackpot boxes', { tab: 'features', section: 'jackpot-boxes', id: 'jp-label-grand' }, 'Names, seeds and colours');
  const J = P.jackpots;
  const font = fontStack(P.effects.font);
  const set = (t, v) => {
    J.art = { ...(J.art || {}), [t.id]: v };
    if (!v) delete J.art[t.id];
    changed('all');
    renderAssets();
    if (state.tab === 'features') renderPanel();
  };
  const row = (t) => {
    const thumb = h('canvas', { class: 'thumb', width: 96, height: 96 });
    const paint = (img) => {
      const box = paintJackpotBox(150, 76, t.palette, t.label, font, img, cfg.artNames).img;
      const g = thumb.getContext('2d');
      const k = Math.min(96 / box.width, 96 / box.height);
      g.clearRect(0, 0, 96, 96);
      g.drawImage(box, (96 - box.width * k) / 2, (96 - box.height * k) / 2, box.width * k, box.height * k);
    };
    if (t.art) optImage(t.art).then((img) => img && paint(img));
    else paint(null);
    return h(
      'div',
      { class: 'asset-row' },
      h('div', { class: 'asset-thumb' }, thumb),
      h('div', { class: 'asset-text' }, h('strong', null, t.label), h('span', { class: 'hint' }, t.art ? 'Your art.' : `Painted, ${t.palette}.`)),
      h(
        'div',
        { class: 'asset-actions' },
        button(t.art ? 'Replace' : 'Upload', async () => {
          const [f] = await pickFiles('image/*');
          if (!f) return;
          if (f.size > 4e6) return toast('Keep box art under 4 MB.', 'warn');
          set(t, await readFileAsDataURL(f));
        }, { class: 'btn small', id: `jpa-up-${t.id}` }),
        t.art ? button('Painted', () => set(t, null), { class: 'btn small ghost', id: `jpa-clear-${t.id}`, title: 'Back to the painted box' }) : null
      )
    );
  };
  return section(
    'Jackpot box art',
    h('p', { class: 'hint' }, 'A wide PNG fills the box; its value is written over it.'),
    cfg.tiers.map(row),
    cfg.tiers.some((t) => t.art) ? toggleField({ id: 'jp-art-names', label: 'Write the names on your art', checked: J.artNames !== false, onChange: (v) => { J.artNames = v; changed('all'); renderAssets(); }, hint: 'Off when your art already says GRAND, MAJOR…' }) : null,
    link
  );
}

// Asset Bank › Scene, with the pots on: each pot's art, painted or yours.
// Which pot it is (gold, gems or fruits), its colour and what it does stay
// with the pots in Features.
function potArtSection() {
  const P = state.project;
  const cfg = potsConfig(P);
  const link = moreLink('Features › Pots above the machine', { tab: 'features', section: 'pots-above-the-machine', id: 'm-pot-art-0' }, 'Which pot is which, colours and roles');
  const d = defaultPots();
  const T = P.pots;
  T.items = d.items.map((it, i) => ({ ...it, ...((T.items || [])[i] || {}) }));
  const set = (it, v) => {
    it.src = v;
    changed('all');
    renderAssets();
    if (state.tab === 'features') renderPanel();
  };
  const row = (it, i) =>
    h(
      'div',
      { class: 'asset-row' },
      h('div', { class: 'asset-thumb' }, potThumb(it)),
      h('div', { class: 'asset-text' }, h('strong', null, it.name), h('span', { class: 'hint' }, it.src ? 'Your art.' : 'Painted.')),
      h(
        'div',
        { class: 'asset-actions' },
        button(it.src ? 'Replace' : 'Upload', async () => {
          const [f] = await pickFiles('image/*');
          if (f) set(it, await readFileAsDataURL(f));
        }, { class: 'btn small', id: `pot-up-${i}` }),
        it.src ? button('Painted', () => set(it, null), { class: 'btn small ghost', id: `pot-clear-${i}`, title: 'Back to the painted pot' }) : null
      )
    );
  return section(
    'Pot art',
    h('p', { class: 'hint' }, 'A PNG of the pot alone, its base at the bottom.'),
    T.items.slice(0, cfg.count).map(row),
    link
  );
}

// Built-in art the machine draws for a role your set lacks (the multiplier
// orb, the mystery block, the collector) and the cash coin's art, after your
// symbols, so it can be found and made yours.
function addRoleSymbol({ role, art, name }, src) {
  state.project.symbols.push({ id: `${role}${Date.now().toString(36)}`, name, role, tier: 'high', weight: 0, builtin: art, src, winAnim: null });
  changed('all');
  renderAssets();
  renderInspector();
}

function builtinSymbolTiles() {
  const lay = symbolLayout(state.project);
  const tile = (key, sym, name, note, action) => h('div', { class: 'sym ghost', id: `sg-${key}` }, thumbCanvas(sym), h('div', { class: 'sym-fields' }, h('strong', { class: 'ptile-name', 'data-tip': `sym-roles-help-${key}` }, name), h('span', { class: 'hint' }, note), action));
  return [
    ...lay.virtual.map((v) =>
      tile(v.role, v.sym, v.name, 'Built-in · drawn when a round needs it', button('Use your art', async () => {
        const [f] = await pickFiles('image/*');
        if (f) addRoleSymbol(v, await readFileAsDataURL(f));
      }, { class: 'btn small', icon: 'upload', id: `sg-up-${v.role}` }))
    ),
    tile('cash', lay.coinBase, 'Cash coin', 'The regular coin from Coins', button('Change it in Coins', () => goToFeature({ title: 'Asset Bank › Coins', go: { bank: 'coins', section: 'hold-spin-coins' } }), { class: 'btn small ghost', id: 'sg-cash-go' })),
  ];
}

// A glossary of chips: each opens the same tooltip card as everywhere else
// (its demo and a line on what it does). The keys live in ui/tips.js.
function helpChips(attrs, label, chips) {
  return h('div', { class: 'help-chips', ...attrs }, h('span', { class: 'help-chips-label' }, label), chips);
}

const helpChip = (attrs, name) => h('button', { type: 'button', class: 'help-chip', ...attrs }, name);
const ROLE_CHIPS = [...ROLES.map(([r, l]) => [r, r === 'normal' ? 'Paying' : l]), ['cash', 'Cash coin']];
const COIN_CHIPS = [['regular', 'Regular coin'], ['special', 'Special coins'], ['jackpot', 'Jackpot coins'], ['empty', 'Empty cell']];

function panelAssets(filter = 'all') {
  const P = state.project;
  el.thumbs = [];
  el.pthumbs = [];
  const game = gameOf();
  const show = (k) => filter === 'all' || filter === k;
  const tiles = h('div', { class: 'symbols' });
  P.symbols.forEach((s, i) => tiles.append(symbolTile(s, i)));
  if (game === 'slot') tiles.append(...builtinSymbolTiles());
  const useSet = (set, name) =>
    button(name, () => {
      P.symbols = set.map((s, i) => ({ id: `${set === CANDY_SYMBOLS ? 'c' : 's'}${i}`, src: null, winAnim: null, ...s }));
      P.rounds.forEach((r) => (r.symbol = 'auto'));
      changed('all');
      renderAssets();
      renderInspector();
    }, { class: 'btn ghost small', id: `a-set-${set === CANDY_SYMBOLS ? 'candy' : 'classic'}` });
  return [
    game !== 'slot' || !show('symbols') ? null : section(
      'Symbols',
      h('p', { class: 'hint' }, 'Transparent PNGs work best; each becomes its own comp in After Effects.'),
      tiles,
      h('div', { class: 'row' }, button('Add symbol images', addSymbols, { class: 'btn', icon: 'upload', id: 'a-add' }), useSet(BUILTIN_SYMBOLS, 'Classic set'), useSet(CANDY_SYMBOLS, 'Candy set')),
      helpChips({ id: 'sym-roles' }, 'What each role does', ROLE_CHIPS.map(([k, n]) => helpChip({ id: `sym-roles-help-${k}` }, n)))
    ),
    game === 'wheel' || !show('coins') ? null : coinSection(),
    show('effects') ? particleArtSection() : null,
    show('effects') ? effectsNote() : null,
    show('wheel') ? wheelArtSection() : null,
    !show('scene') ? null : section(
      'Scene art',
      assetRow('Background', 'background', 'Full-screen image behind the machine.'),
      assetRow('Frame overlay', 'frame', 'PNG drawn over the reels. Leave the window transparent.'),
      assetRow('Logo', 'logo', 'Replaces the title text above the reels.'),
      toggleField({ id: 'a-builtin', label: 'Draw the built-in frame', checked: P.machine.builtinFrame !== false, onChange: num(P.machine, 'builtinFrame', 'all') }),
      moreLink('Machine › Look', { tab: 'machine', id: 'm-title-on' }, 'Title on or off'),
      ...offSceneFeatures(game)
    ),
    // Everything else around the machine: the pots and the jackpot boxes.
    show('scene') && game === 'slot' && potsConfig(P).on ? potArtSection() : null,
    show('scene') && game !== 'wheel' && jackpotsConfig(P).on ? jackpotArtSection() : null,
    show('sounds') ? soundsSection() : null,
    show('fonts') ? fontsSection() : null,
  ];
}

// ---------- win particles: art (Asset Bank) ----------

const motionLabel = (m) => PARTICLE_MOTIONS.find((x) => x.id === m)?.label || m;

function particleThumb(id) {
  const c = h('canvas', { class: 'thumb', width: 96, height: 96 });
  el.pthumbs.push([c, id]);
  return c;
}

function refreshParticleThumbs() {
  for (const [c, id] of el.pthumbs || []) {
    const sp = state.images?.particles?.get(id);
    const g = c.getContext('2d');
    g.clearRect(0, 0, 96, 96);
    if (!sp) continue;
    // Up to four variants or frames, so a set reads as a set.
    const n = Math.min(4, sp.frames.length);
    const cell = n > 1 ? 46 : 84;
    sp.frames.slice(0, n).forEach((f, k) => {
      const s = cell / Math.max(f.width, f.height);
      const cx = n > 1 ? 25 + (k % 2) * 46 : 48;
      const cy = n > 1 ? 25 + Math.floor(k / 2) * 46 : 48;
      g.drawImage(f, cx - (f.width * s) / 2, cy - (f.height * s) / 2, f.width * s, f.height * s);
    });
  }
}

function forgetParticleAsset(id) {
  const P = state.project;
  const fix = (o) => o && o.asset === id && (o.asset = 'coin');
  for (const m of PARTICLE_MOMENTS) fix(P.particles[m.id]);
  for (const t of P.tiers) fix(t.particles);
  for (const r of P.rounds) if (r.particles?.asset === id) r.particles.asset = 'auto';
}

// One PNG is a still particle; several are the frames of an animated one.
async function readParticleFiles() {
  const files = await pickFiles('image/png,image/webp,image/gif,image/svg+xml', true);
  if (!files.length) return null;
  const name = files[0].name.replace(/\.[^.]+$/, '').replace(/[_-]?\d+$/, '').slice(0, 24) || 'Particle';
  if (files.length === 1) return { name, art: { kind: 'image', src: await readFileAsDataURL(files[0]) } };
  files.sort((a, b) => byName.compare(a.name, b.name));
  const srcs = [];
  for (const f of files.slice(0, 120)) srcs.push(await readFileAsDataURL(f));
  return { name, art: { kind: 'frames', srcs, fps: 24 } };
}

function particlesChanged() {
  changed('all');
  renderAssets();
  if (state.tab === 'effects') renderPanel();
}

async function addParticleArt() {
  const got = await readParticleFiles();
  if (!got) return;
  const { name, art } = got;
  state.project.particles.assets.push({ id: `p${Date.now().toString(36)}`, name, motion: 'spin', ...art });
  toast(art.kind === 'frames' ? `${name}: a ${art.srcs.length}-frame particle. Each particle plays it from a random frame.` : `${name} added. Pick it for a win moment in Effects → Win particles.`);
  particlesChanged();
}

// Your art for a built-in particle: it keeps its name, motion and every
// place that uses it; going back drops your art.
async function replaceParticleArt(b) {
  const got = await readParticleFiles();
  if (!got) return;
  const P = state.project;
  const old = P.particles.assets.find((x) => x.id === b.id);
  P.particles.assets = P.particles.assets.filter((x) => x.id !== b.id);
  P.particles.assets.push({ id: b.id, name: b.name, replaces: true, motion: old?.motion || b.motion, ...got.art });
  toast(`${b.name} now uses your art.`);
  particlesChanged();
}

function restoreParticleArt(id) {
  const P = state.project;
  P.particles.assets = P.particles.assets.filter((x) => x.id !== id);
  particlesChanged();
}

function particleTile(a) {
  const P = state.project;
  const builtin = !a.kind;
  const named = builtin || a.replaces;
  const info = particleAssetInfo(P, a.id);
  const edit = (k, min, max) =>
    h('label', { class: 'mini', for: `pa-${k}-${a.id}` }, h('span', null, k), h('input', { type: 'number', id: `pa-${k}-${a.id}`, min, max, step: 1, value: a[k], onchange: (e) => {
      a[k] = Math.min(max, Math.max(min, Number(e.target.value) || min));
      e.target.value = a[k];
      if (a.kind === 'sheet' && (k === 'cols' || k === 'rows')) a.count = a.cols * a.rows;
      changed('all');
      if (k === 'cols' || k === 'rows') renderAssets();
    } }));
  const what = builtin ? `Built-in · ${info.count > 1 ? `${info.count} variants` : 'one image'}` : `${a.replaces ? 'Your art · ' : ''}${a.kind === 'image' ? 'still image' : `${info.count} frames · ${a.fps} fps`}`;
  return h(
    'div',
    { class: 'sym ptile' },
    particleThumb(a.id),
    h(
      'div',
      { class: 'sym-fields' },
      named
        ? h('strong', { class: 'ptile-name' }, a.name)
        : h('input', { type: 'text', id: `pa-name-${a.id}`, value: a.name, 'aria-label': 'Particle name', onchange: (e) => { a.name = e.target.value.slice(0, 24) || 'Particle'; changed('timeline'); if (state.tab === 'effects') renderPanel(); } }),
      h('span', { class: 'hint' }, what),
      builtin
        ? h('span', { class: 'hint' }, motionLabel(info.motion))
        : h('select', { id: `pa-motion-${a.id}`, 'aria-label': 'How it moves', onchange: (e) => { a.motion = e.target.value; changed('all'); } }, PARTICLE_MOTIONS.map((m) => h('option', { value: m.id, selected: info.motion === m.id }, m.label))),
      a.kind === 'sheet' ? h('div', { class: 'sym-anim on' }, edit('cols', 1, 32), edit('rows', 1, 32), edit('count', 1, 256), edit('fps', 1, 60)) : null,
      a.kind === 'frames' ? h('div', { class: 'sym-anim on' }, edit('fps', 1, 60)) : null,
      a.kind === 'image'
        ? button('It is a sprite sheet', async () => {
            const img = await loadImageSafe(a.src);
            const cols = Math.max(1, Math.round((img?.naturalWidth || 1) / (img?.naturalHeight || 1)));
            Object.assign(a, { kind: 'sheet', cols, rows: 1, count: cols, fps: 24 });
            changed('all');
            renderAssets();
          }, { class: 'btn small ghost', id: `pa-sheet-${a.id}`, title: 'Read this image as a grid of animation frames' })
        : null,
      a.kind === 'sheet'
        ? button('Still image', () => {
            a.kind = 'image';
            changed('all');
            renderAssets();
          }, { class: 'btn small ghost', id: `pa-still-${a.id}` })
        : null
    ),
    h(
      'div',
      { class: 'sym-actions' },
      named ? button('', () => replaceParticleArt(BUILTIN_PARTICLES.find((b) => b.id === a.id)), { class: 'icon-btn tiny', icon: 'upload', title: `Replace the ${a.name} art (one PNG, or several for an animation)`, id: `pa-up-${a.id}` }) : null,
      a.replaces
        ? button('', () => restoreParticleArt(a.id), { class: 'icon-btn tiny', icon: 'trash', title: `Remove your art (back to the built-in ${a.name})`, id: `pa-restore-${a.id}` })
        : builtin
          ? null
          : button('', () => {
              P.particles.assets = P.particles.assets.filter((x) => x !== a);
              forgetParticleAsset(a.id);
              particlesChanged();
              renderInspector();
            }, { class: 'icon-btn tiny', icon: 'trash', title: `Remove ${a.name}`, id: `pa-del-${a.id}` })
    )
  );
}

function loadImageSafe(src) {
  return optImage(src);
}

function particleArtSection() {
  const P = state.project;
  const tiles = h('div', { class: 'symbols' });
  for (const b of BUILTIN_PARTICLES) tiles.append(particleTile(P.particles.assets.find((x) => x.id === b.id) || { id: b.id, name: b.name }));
  for (const a of P.particles.assets) if (!a.replaces) tiles.append(particleTile(a));
  return section(
    'Particle art',
    h('p', { class: 'hint' }, 'One PNG for a still particle, several for an animation.'),
    tiles,
    h('div', { class: 'row' }, button('Add particle art', addParticleArt, { class: 'btn', icon: 'upload', id: 'pa-add' })),
    moreLink('Effects › Win particles', { tab: 'effects', section: 'win-particles' }, 'Which moment uses which particle')
  );
}

// The win effects themselves (rays, shockwaves, frames) are drawn live;
// After Effects is where they are replaced, so the bank says how.
function effectsNote() {
  return section(
    'Win effects',
    h('p', { class: 'hint' }, 'Drawn live; you replace them in After Effects.'),
    moreLink('Effects › Intensity', { tab: 'effects', section: 'intensity' }, 'How strong each effect is')
  );
}

// ---------- win particles: live mini previews ----------

const minis = new Set();
let miniRAF = 0;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function miniCanvas(get, cls = 'pfx-mini', w = 160, hgt = 90) {
  const c = h('canvas', { class: cls, width: w * 2, height: hgt * 2, 'aria-hidden': 'true' });
  // Each preview runs at its own phase, so they never all restart together.
  minis.add({ c, get, key: '', phase: (minis.size * 0.618) % 1 });
  if (!miniRAF) miniRAF = requestAnimationFrame(tickMinis);
  return c;
}

function miniLayout(W, H) {
  const u = W * 0.2;
  return { W, H, cellW: u, cellH: u, winX: W * 0.2, winW: W * 0.6, winTop: H * 0.22, winH: H * 0.56, winCY: H * 0.5, portrait: false, cellCenter: (c) => ({ x: W * (0.35 + 0.15 * c), y: H * 0.5 }) };
}

let miniLast = 0;
function tickMinis(now) {
  miniRAF = 0;
  let any = false;
  const draw = now - miniLast > 30;
  if (draw) miniLast = now;
  for (const m of minis) {
    if (!m.c.isConnected) {
      minis.delete(m);
      continue;
    }
    any = true;
    if (draw) drawMini(m, now / 1000);
  }
  if (any && !reducedMotion()) miniRAF = requestAnimationFrame(tickMinis);
}

function drawMini(m, time) {
  const cfg = m.get() || { fx: 'none' };
  const sprite = state.images?.particles?.get(cfg.asset) || state.images?.particles?.get('coin');
  const c = m.c;
  const g = c.getContext('2d');
  const tpl = TEMPLATE_BY_ID[cfg.fx];
  const key = `${cfg.fx}|${cfg.asset}|${sprite ? sprite.frames.length : 0}|${sprite?.motion}`;
  if (m.key !== key) {
    m.key = key;
    m.list = [];
    m.period = 2;
    if (tpl && sprite) {
      const short = tpl.kind === 'short';
      const em = { fx: cfg.fx, start: 0.15, end: short ? 0.15 : 3.4, focus: cfg.focus || { kind: 'screen' }, seed: 4242 };
      m.list = spawnParticles(em, miniLayout(c.width, c.height), sprite.motion, 0.75);
      // Continuous ones loop while still flowing, fading out before the restart.
      m.period = short ? Math.min(5, Math.max(...m.list.map((p) => p.b + p.l), 1) + 0.35) : em.end + 0.6;
      m.fade = short ? 0 : 0.5;
    }
  }
  g.clearRect(0, 0, c.width, c.height);
  if (!tpl || !sprite) {
    g.fillStyle = 'rgba(164,156,184,0.55)';
    g.font = `600 ${Math.round(c.height * 0.16)}px "Instrument Sans", system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('No particles', c.width / 2, c.height / 2);
    return;
  }
  const t = reducedMotion() ? m.period * 0.5 : (time + m.phase * m.period) % m.period;
  drawParticleList(g, sprite, m.list, t, m.fade ? Math.min(1, (m.period - t) / m.fade) : 1);
}

// ---------- win particles: settings (Effects tab) ----------

function templateOptions(cur, withNone = true) {
  return [
    withNone ? h('option', { value: 'none', selected: cur === 'none' }, 'None') : null,
    h('optgroup', { label: 'Short' }, PARTICLE_TEMPLATES.filter((t) => t.kind === 'short').map((t) => h('option', { value: t.id, selected: cur === t.id }, t.name))),
    h('optgroup', { label: 'Continuous' }, PARTICLE_TEMPLATES.filter((t) => t.kind === 'continuous').map((t) => h('option', { value: t.id, selected: cur === t.id }, t.name))),
  ];
}

function particleAssetChoices() {
  const P = state.project;
  return [...BUILTIN_PARTICLES.map((b) => ({ value: b.id, label: b.name })), ...P.particles.assets.filter((a) => !a.replaces).map((a) => ({ value: a.id, label: a.name }))];
}

function particleRow(id, label, hint, get, set, opts = {}) {
  const cur = get() || { fx: 'none', asset: 'coin' };
  const assets = particleAssetChoices();
  // Continuous templates choose how long they keep going.
  const continuous = TEMPLATE_BY_ID[cur.fx]?.kind === 'continuous' && !opts.always;
  const lengthSel = continuous
    ? h('select', { id: `${id}-len`, class: 'pfx-len', 'aria-label': `${label}: how long it runs`, title: 'How long the particles keep going', onchange: (e) => set({ ...get(), length: e.target.value }) }, PARTICLE_LENGTHS.map((x) => h('option', { value: x.id, title: x.hint, selected: (cur.length || 'moment') === x.id }, x.label)))
    : null;
  return h(
    'div',
    { class: 'pfx-row' },
    miniCanvas(get, 'pfx-mini', 112, 63),
    h(
      'div',
      { class: 'pfx-fields' },
      h('div', { class: 'pfx-label' }, h('strong', null, label), hint ? h('span', { class: 'hint' }, hint) : null),
      h(
        'div',
        { class: 'pfx-selects' },
        h('select', { id: `${id}-fx`, 'aria-label': `${label}: explosion`, onchange: (e) => { set({ ...cur, fx: e.target.value }); renderPanel(); } }, templateOptions(cur.fx)),
        h('select', { id: `${id}-asset`, 'aria-label': `${label}: particle`, disabled: cur.fx === 'none', onchange: (e) => set({ ...get(), asset: e.target.value }) }, assets.map((o) => h('option', { value: o.value, selected: cur.asset === o.value }, o.label))),
        lengthSel
      )
    )
  );
}

const MOMENTS_BY_GAME = {
  slot: ['small', 'medium', 'feature', 'wheel', 'total', 'grand', 'ambient'],
  holdspin: ['feature', 'total', 'grand', 'wheel', 'ambient'],
  wheel: ['wheel', 'ambient'],
};

function particleSettings() {
  const P = state.project;
  const fx = P.effects;
  const game = gameOf();
  const rows = [];
  if (game === 'slot' || game === 'holdspin') {
    P.tiers.forEach((t, i) =>
      rows.push(particleRow(`pfx-tier-${t.id}`, t.title, i === 0 ? 'Big win tiers stack: each starts when its title lands' : null, () => tierParticles(P, i), (v) => {
        t.particles = v;
        changed('timeline');
      }))
    );
  }
  for (const m of PARTICLE_MOMENTS.filter((x) => (MOMENTS_BY_GAME[game] || MOMENTS_BY_GAME.slot).includes(x.id))) {
    rows.push(particleRow(`pfx-${m.id}`, m.label, m.hint, () => P.particles[m.id] || { fx: 'none', asset: 'sparkle' }, (v) => {
      P.particles[m.id] = v;
      changed('timeline');
    }, { always: m.id === 'ambient' }));
  }
  return h(
    'section',
    { class: 'group', id: 'fx-particles' },
    h('h3', null, 'Win particles'),
    h('p', { class: 'hint' }, 'Pick an explosion and a particle for every win moment. Short explosions fire once. Continuous ones keep going while the win shows, until the next round, or to the end of the animation (they loop seamlessly). Ambient particles float behind the machine the whole time. A round can use its own in the round inspector.'),
    h('div', { class: 'pfx-rows' }, rows),
    rangeField({ id: 'fx-coins', label: 'Particle amount', value: fx.coins, min: 0, max: 2, step: 0.01, onInput: num(fx, 'coins') }),
    moreLink('Asset Bank › Effects', { bank: 'effects', id: 'pa-add' }, 'Your own particle art')
  );
}

// Every template with a live preview.
const GALLERY_ASSET = { cannons: 'confetti', popper: 'confetti', fireworks: 'star', shimmer: 'sparkle', spiral: 'sparkle', magnet: 'ember', ring: 'gem', rain: 'confetti' };

function templateGallery() {
  return section(
    'Explosion templates',
    h(
      'div',
      { class: 'pfx-gallery' },
      PARTICLE_TEMPLATES.map((t) =>
        h(
          'figure',
          { class: 'pfx-card' },
          miniCanvas(() => ({ fx: t.id, asset: GALLERY_ASSET[t.id] || 'coin' }), 'pfx-mini', 160, 90),
          h('figcaption', null, h('strong', null, t.name), h('span', { class: `pfx-kind ${t.kind}` }, t.kind === 'short' ? 'Short' : 'Continuous'), h('span', { class: 'hint' }, t.desc))
        )
      )
    )
  );
}

function thumbCanvas(idx) {
  const c = h('canvas', { class: 'thumb', width: 96, height: 96 });
  el.thumbs.push([c, idx]);
  return c;
}

function refreshThumbs() {
  refreshParticleThumbs();
  if (!el.thumbs || !state.images) return;
  el.thumbs.forEach(([c, i]) => {
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
  renderAssets();
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
      if (k === 'cols' || k === 'rows') renderAssets();
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
      renderAssets();
    }, { class: 'icon-btn tiny', icon: 'trash', title: 'Remove the win animation', id: `sym-anim-del-${s.id}` })
  );
}

// How often a symbol fills the reels around the wins, in stages. The
// weight behind a stage counts against the other symbols', so each also
// shows its share of the filler. Wilds, scatters and the like are placed
// by the rounds only.
const SHOWS_UP = [[0, 'Only in wins'], [3, 'Rarely'], [6, 'Sometimes'], [9, 'Often'], [12, 'Very often']];

function showsUpStage(w) {
  const v = Math.max(0, Number(w) || 0);
  if (!v) return 0;
  let best = 1;
  for (let k = 2; k < SHOWS_UP.length; k++) if (Math.abs(SHOWS_UP[k][0] - v) <= Math.abs(SHOWS_UP[best][0] - v)) best = k;
  return best;
}

function fillShare(s) {
  const fill = state.project.symbols.filter((x) => !SPECIAL_ROLES.includes(x.role));
  const total = fill.reduce((a, x) => a + Math.max(0, Number(x.weight) || 0), 0);
  if (total <= 0) return Math.round(100 / Math.max(1, fill.length));
  return Math.round((100 * Math.max(0, Number(s.weight) || 0)) / total);
}

function showsUpText(s) {
  const name = SHOWS_UP[showsUpStage(s.weight)][1];
  return Number(s.weight) > 0 ? `${name} · ${fillShare(s)}%` : name;
}

// Every symbol's label follows a change: the shares move together.
function refreshShowsUp() {
  for (const s of state.project.symbols) {
    const out = document.getElementById(`sym-w-${s.id}-val`);
    if (!out) continue;
    out.textContent = showsUpText(s);
    document.getElementById(`sym-w-${s.id}`)?.setAttribute('aria-valuetext', out.textContent);
  }
}

function showsUpField(s) {
  if (SPECIAL_ROLES.includes(s.role)) return h('p', { class: 'sym-weight-note' }, 'Shows up only where a round puts it.');
  if (!document.getElementById('shows-up-stages')) document.body.append(h('datalist', { id: 'shows-up-stages' }, SHOWS_UP.map((_, k) => h('option', { value: k }))));
  const text = showsUpText(s);
  return h(
    'label',
    { class: 'sym-weight', for: `sym-w-${s.id}`, title: 'How often it fills the reels around the wins, and its share of them' },
    h('span', { 'data-tip': 'sym-w-help' }, 'Shows up'),
    h('input', {
      type: 'range',
      id: `sym-w-${s.id}`,
      min: 0,
      max: SHOWS_UP.length - 1,
      step: 1,
      list: 'shows-up-stages',
      value: showsUpStage(s.weight),
      'aria-valuetext': text,
      oninput: (e) => {
        s.weight = SHOWS_UP[Number(e.target.value)][0];
        refreshShowsUp();
        changed('timeline');
      },
    }),
    h('output', { class: 'sym-weight-val', id: `sym-w-${s.id}-val` }, text)
  );
}

function symbolTile(s, i) {
  const P = state.project;
  return h(
    'div',
    { class: 'sym' },
    thumbCanvas(i),
    h(
      'div',
      { class: 'sym-fields' },
      h('input', { type: 'text', id: `sym-name-${s.id}`, value: s.name, 'aria-label': 'Symbol name', oninput: (e) => { s.name = e.target.value; save(); refreshList(); } }),
      h(
        'div',
        { class: 'sym-row' },
        h('select', { id: `sym-role-${s.id}`, 'aria-label': 'Role', 'data-tip': `sym-roles-help-${s.role}`, onchange: (e) => { s.role = e.target.value; changed('all'); renderAssets(); renderInspector(); } }, ROLES.map(([r, l]) => h('option', { value: r, selected: s.role === r }, l))),
        h('select', { id: `sym-tier-${s.id}`, 'aria-label': 'Pay', 'data-tip': 'sym-tier-help', onchange: (e) => { s.tier = e.target.value; changed('timeline'); } }, [['low', 'Low pay'], ['high', 'High pay']].map(([v, l]) => h('option', { value: v, selected: s.tier === v }, l)))
      ),
      showsUpField(s),
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
        renderAssets();
        renderInspector();
      }, { class: 'icon-btn tiny', icon: 'trash', title: 'Remove symbol', id: `sym-del-${s.id}` })
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
  renderAssets();
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
        renderAssets();
      }, { class: 'btn small', id: `asset-up-${key}` }),
      has
        ? button('Clear', () => {
            P.assets[key] = null;
            changed('all');
            renderAssets();
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
  const hsGame = gameOf() === 'holdspin';
  return [
    gameOf() === 'wheel' ? h('p', { class: 'hint' }, 'The wheel game has no reels, so most of these do not apply. Turns and landing are in the Wheel tab; each round picks its segment.') : null,
    hsGame
      ? section(
          'Respins',
          h('p', { class: 'hint' }, 'Every empty cell spins on its own and stops in the cell order. The start, mid and end phases below shape each cell; the respin length is with Hold & Spin.'),
          moreLink('Features › Hold & Spin', { tab: 'features', id: 'm-hs-mid' }, 'Respin length'),
          segmented({ id: 'spin-dir', label: 'Direction', value: sp.direction, options: [{ value: 'down', label: 'Spin down' }, { value: 'up', label: 'Spin up' }], onChange: num(sp, 'direction') }),
          selectField({ id: 'spin-cell-order', label: 'Cell order', value: sp.cellOrder || 'columns', options: CELL_ORDERS.map((o) => ({ value: o.id, label: o.label })), onChange: num(sp, 'cellOrder') })
        )
      : section('Spin type', typeCards, segmented({ id: 'spin-dir', label: 'Direction', value: sp.direction, options: [{ value: 'down', label: 'Spin down' }, { value: 'up', label: 'Spin up' }], onChange: num(sp, 'direction') })),
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
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Extra delay per reel'), delays, h('p', { class: 'hint' }, 'Added on top of the stagger: hold one reel back, or make it start late.'))
    ),
    section(
      'Anticipation',
      rangeField({ id: 'spin-ant', label: 'Anticipation extra time', unit: 's', value: sp.anticipation, min: 0, max: 4, step: 0.05, onInput: num(sp, 'anticipation') }),
      rangeField({ id: 'spin-ant-v', label: 'Anticipation crawl speed', unit: 'symbols/s', value: sp.anticipationSpeed, min: 2, max: 20, step: 0.5, onInput: num(sp, 'anticipationSpeed') }),
      toggleField({ id: 'spin-zoom-on', label: 'Zoom in on the anticipation reel', checked: sp.zoomOn !== false, onChange: (v) => { sp.zoomOn = v; changed('timeline'); renderPanel(); }, hint: 'The camera pushes in on the teased reel, follows the tease from reel to reel and eases out after it lands.' }),
      sp.zoomOn !== false ? rangeField({ id: 'spin-zoom', label: 'Zoom amount', unit: '%', value: Math.round((sp.zoom ?? 0.2) * 100), min: 5, max: 80, step: 1, onInput: (v) => { sp.zoom = v / 100; changed('timeline'); } }) : null,
      toggleField({ id: 'spin-scatter-lit', label: 'Keep scatters lit through the tease', checked: !!sp.scatterLit, onChange: (v) => { sp.scatterLit = v; changed('timeline'); }, hint: 'Scatters that land while a reel teases stay lit over the dimmed reels until it lands. Off, they pop and fade back into the dim.' })
    ),
    section(
      'Between rounds',
      rangeField({ id: 'tm-gap', label: 'Gap between rounds', unit: 's', value: state.project.timing.gap, min: 0, max: 2, step: 0.05, onInput: num(state.project.timing, 'gap') }),
      rangeField({ id: 'tm-intro', label: 'Intro hold', unit: 's', value: state.project.timing.intro, min: 0, max: 3, step: 0.05, onInput: num(state.project.timing, 'intro') }),
      rangeField({ id: 'tm-outro', label: 'Outro hold', unit: 's', value: state.project.timing.outro, min: 0, max: 3, step: 0.05, onInput: num(state.project.timing, 'outro') })
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
  const hsp = R && R.pres.holdspin;
  if (!R || (tl.cascade && !hsp) || (R.noSpin && !(hsp && hsp.cells.length))) {
    g.fillStyle = muted;
    g.fillText(tl.cascade ? 'Cascade drops have no reel speed curve.' : R ? 'This round does not spin.' : 'Select a round to see its curve.', 16, H / 2);
    return;
  }
  // One curve per reel; per-cell spins plot the top cell of each reel, and a
  // respin plots the cells that spin (up to eight).
  const tracks = hsp
    ? hsp.cells.slice(0, 8).map((ci) => tl.hold.keys[ci.k])
    : Array.from({ length: tl.reels }, (_, k) => (tl.mode === 'cells' ? tl.stripKeys[k * tl.rows] : tl.stripKeys[k]));
  const a = R.t0 - 0.1;
  const b = R.spinEnd + 0.15;
  const N = 220;
  let vmax = 1;
  const series = [];
  for (const keys of tracks) {
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const t = a + ((b - a) * i) / N;
      const v = evalVelocity(keys, t);
      vmax = Math.max(vmax, Math.abs(v));
      pts.push([t, v]);
    }
    series.push(pts);
  }
  const pad = { l: 44, r: 12, t: 26, b: 26 };
  const X = (t) => pad.l + ((t - a) / (b - a)) * (W - pad.l - pad.r);
  const zeroY = pad.t + (H - pad.t - pad.b) * 0.82;
  const Y = (v) => zeroY - (v / vmax) * (zeroY - pad.t);
  const first = hsp ? 0 : R.stopOrder?.[0] ?? 0;
  const r0 = hsp ? hsp.cells[0] : R.reels[first] || R.reels[0];
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
    const mix = series.length > 1 ? k / (series.length - 1) : 0;
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
        }, { class: 'icon-btn tiny', icon: 'trash', title: P.tiers.length <= 1 ? 'Keep at least one tier' : 'Remove tier', id: `tier-del-${t.id}`, disabled: P.tiers.length <= 1 })
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

function panelWins() {
  const P = state.project;
  const tm = P.timing;
  return [
    section('Win tiers', tierEditor()),
    winSymbolsSection(),
    section(
      'Win timing',
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
      rangeField({ id: 'tm-collect', label: 'Each coin collected', unit: 's', value: tm.collectEach ?? 0.22, min: 0.11, max: 0.6, step: 0.01, onInput: num(tm, 'collectEach') }),
      rangeField({ id: 'tm-cel', label: 'Scatter celebration', unit: 's', value: tm.celebrate, min: 0.5, max: 4, step: 0.05, onInput: num(tm, 'celebrate') }),
      rangeField({ id: 'tm-banner', label: 'Bonus banner', unit: 's', value: tm.banner, min: 1, max: 6, step: 0.05, onInput: num(tm, 'banner') }),
      rangeField({ id: 'tm-wheel', label: 'Wheel spin', unit: 's', value: tm.wheelSpin, min: 2, max: 12, step: 0.1, onInput: num(tm, 'wheelSpin') })
    ),
  ];
}

function panelEffects() {
  const P = state.project;
  const fx = P.effects;
  const titles = fx.titles;
  return [
    section(
      'Intensity',
      rangeField({ id: 'fx-line', label: 'Payline glow', value: fx.lineGlow, min: 0, max: 1.5, step: 0.01, onInput: num(fx, 'lineGlow') }),
      rangeField({ id: 'fx-spark', label: 'Sparkles', value: fx.sparkles, min: 0, max: 2, step: 0.01, onInput: num(fx, 'sparkles') }),
      rangeField({ id: 'fx-rays', label: 'Light rays', value: fx.rays, min: 0, max: 1.5, step: 0.01, onInput: num(fx, 'rays') }),
      rangeField({ id: 'fx-shake', label: 'Screen shake', value: fx.shake, min: 0, max: 2, step: 0.01, onInput: num(fx, 'shake') }),
      toggleField({ id: 'fx-land-shake', label: 'Build-up shake on winning reels', checked: !!fx.landShake, onChange: num(fx, 'landShake'), hint: 'Every reel or cell that brings a winner lands with a bump that grows, and a note that climbs.' }),
      rangeField({ id: 'fx-flash', label: 'Flashes', value: fx.flash, min: 0, max: 1.5, step: 0.01, onInput: num(fx, 'flash') }),
      rangeField({ id: 'fx-bloom', label: 'Bloom glow', value: fx.bloom, min: 0, max: 1.2, step: 0.01, onInput: num(fx, 'bloom'), hint: 'Preview and MP4 only.' }),
      rangeField({ id: 'fx-bokeh', label: 'Background lights', value: fx.bokeh, min: 0, max: 2, step: 0.01, onInput: num(fx, 'bokeh') })
    ),
    particleSettings(),
    templateGallery(),
    section(
      'Titles and font',
      fontPicker({ id: 'fx-font', label: 'Display font', value: fx.font || 'Bungee', onChange: (f) => {
        fx.font = f;
        changed('all');
        renderPanel();
      } }),
      h(
        'div',
        { class: 'row2' },
        ...[
          ['freespins', 'Free spins'],
          ['retrigger', 'Free spins retrigger'],
          ['total', 'Free spins total'],
          ['bonus', 'Bonus'],
          ['wheel', 'Wheel title'],
          ['nearmiss', 'Near miss'],
          ['holdspin', 'Hold & Spin'],
          ['grand', 'Grand (full board)'],
        ].map(([k, l]) => textField({ id: `fx-t-${k}`, label: l, value: titles[k], onChange: num(titles, k, 'all') }))
      ),
      moreLink('Asset Bank › Fonts', { bank: 'fonts', id: 'font-add' }, 'Your own fonts'),
      gameOf() === 'slot' || gameOf() === 'holdspin' ? moreLink('Wins › Win tiers', { tab: 'wins', section: 'win-tiers' }, 'Big win titles') : null
    ),
    h('p', { class: 'hint' }, 'Win tiers, winning symbols and win timing are in the Wins tab.'),
  ];
}

// ---------- winning symbols (Wins tab) ----------

function pickOnPreview(kind) {
  state.pick = kind;
  el.viewport.classList.add('picking');
  el.pickNote.hidden = false;
  el.pickNote.textContent = kind === 'jump' ? 'Click the preview where the winning symbols should land. Esc cancels.' : 'Click the preview where the winning symbols should merge. Esc cancels.';
  el.canvas.focus?.();
}

function endPick() {
  state.pick = null;
  el.viewport.classList.remove('picking');
  el.pickNote.hidden = true;
}

function onPreviewClick(e) {
  if (!state.pick) return;
  const r = el.canvas.getBoundingClientRect();
  const fx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const fy = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  const W = state.project.winfx;
  if (state.pick === 'jump') Object.assign(W, { target: 'custom', jx: +fx.toFixed(3), jy: +fy.toFixed(3) });
  else Object.assign(W, { point: 'custom', mx: +fx.toFixed(3), my: +fy.toFixed(3) });
  const kind = state.pick;
  endPick();
  changed('timeline');
  if (state.tab === 'wins') renderPanel();
  toast(`${kind === 'jump' ? 'Landing spot' : 'Merge point'} set to ${Math.round(fx * 100)}% across, ${Math.round(fy * 100)}% down.`, 'good');
}

// Where the current winning-symbol target sits, for the marker on the preview.
function winFxMarker() {
  if (state.tab !== 'wins' || !state.scene) return null;
  const P = state.project;
  const cfg = winFxConfig(P);
  if (cfg.style === 'pop') return null;
  const L = state.scene.L;
  const st = { cells: [[0, 0]], lines: [] };
  if (cfg.style === 'jump' && cfg.target === 'amount') return null;
  if (cfg.style === 'merge' && cfg.point === 'cells') return null;
  const g = cfg.style === 'jump' ? jumpTarget(P, L, st) : mergeTarget(P, L, st);
  return { ...g, label: cfg.style === 'jump' ? 'Landing spot' : 'Merge point' };
}

function drawMarker() {
  const m = winFxMarker();
  if (!m) return;
  const k = state.quality;
  const u = state.scene.L.cellW * k;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const x = m.x * k;
  const y = m.y * k;
  ctx.lineWidth = Math.max(2, u * 0.03);
  ctx.strokeStyle = 'rgba(255,226,154,0.95)';
  ctx.setLineDash([u * 0.12, u * 0.08]);
  ctx.beginPath();
  ctx.arc(x, y, u * 0.42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x - u * 0.62, y);
  ctx.lineTo(x - u * 0.22, y);
  ctx.moveTo(x + u * 0.22, y);
  ctx.lineTo(x + u * 0.62, y);
  ctx.moveTo(x, y - u * 0.62);
  ctx.lineTo(x, y - u * 0.22);
  ctx.moveTo(x, y + u * 0.22);
  ctx.lineTo(x, y + u * 0.62);
  ctx.stroke();
  ctx.font = `600 ${Math.round(u * 0.2)}px "Instrument Sans", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,226,154,0.95)';
  // The label sits above the reticle, or below it near the top edge.
  ctx.fillText(m.label, x, y < u * 1.1 ? y + u * 0.95 : y - u * 0.75);
  ctx.restore();
}

function winSymbolsSection() {
  const P = state.project;
  P.winfx = winFxConfig(P);
  const W = P.winfx;
  const fx = P.effects;
  const set = (k, kind = 'timeline', rerender = false) => (v) => {
    W[k] = v;
    changed(kind);
    if (rerender) renderPanel();
    else draw();
  };
  const custom = (kx, ky, pickKind) => [
    h('div', { class: 'row2' },
      rangeField({ id: `wf-${kx}`, label: 'Across', unit: '%', value: Math.round(W[kx] * 100), min: 0, max: 100, step: 1, onInput: (v) => set(kx)(v / 100) }),
      rangeField({ id: `wf-${ky}`, label: 'Down', unit: '%', value: Math.round(W[ky] * 100), min: 0, max: 100, step: 1, onInput: (v) => set(ky)(v / 100) })
    ),
  ].concat(button('Pick on the preview', () => pickOnPreview(pickKind), { class: 'btn small', icon: 'target', id: `wf-pick-${pickKind}` }));
  const style = WIN_STYLES.find((x) => x.id === W.style) || WIN_STYLES[0];
  const parts = [
    segmented({ id: 'wf-style', label: 'Winning symbols', value: W.style, options: WIN_STYLES.map((x) => ({ value: x.id, label: x.short, hint: x.hint })), onChange: set('style', 'timeline', true) }),
    h('p', { class: 'hint' }, style.hint),
  ];
  if (W.style === 'jump') {
    parts.push(
      selectField({ id: 'wf-target', label: 'They land on', value: W.target, options: JUMP_TARGETS.map((x) => ({ value: x.id, label: x.label })), onChange: set('target', 'timeline', true) }),
      W.target === 'custom' ? custom('jx', 'jy', 'jump') : null,
      segmented({ id: 'wf-jpath', label: 'Flight path', value: W.jumpPath, options: FLIGHT_PATHS.map((x) => ({ value: x.id, label: x.label })), onChange: set('jumpPath') }),
      rangeField({ id: 'wf-flight', label: 'Flight time', unit: 's', value: W.flight, min: 0.25, max: 1.5, step: 0.05, onInput: set('flight') }),
      rangeField({ id: 'wf-stagger', label: 'Delay between symbols', unit: 's', value: W.stagger, min: 0, max: 0.25, step: 0.01, onInput: set('stagger') })
    );
  } else if (W.style === 'collect') {
    parts.push(
      potsCollect(potsConfig(P))
        ? h('p', { class: 'hint' }, 'Which pot each winner goes to, and the beams\' curve, thickness and timing, are set with the pots.')
        : potsConfig(P).on
        ? h('p', { class: 'hint' }, 'No pot collects, so winners pop in place. Set a pot to Collects or Both.')
        : h('div', { class: 'field' }, h('p', { class: 'hint' }, 'The pots are off, so winners pop in place.'), button('Turn on the pots', () => turnOnPots(), { class: 'btn small', icon: 'plus', id: 'wf-pots-on' })),
      potsConfig(P).on ? moreLink('Features › Pots above the machine', { tab: 'features', section: 'pots-above-the-machine', id: 'm-beam-curve' }, 'Pots and beams') : null
    );
  } else if (W.style === 'merge') {
    parts.push(
      selectField({ id: 'wf-point', label: 'They merge at', value: W.point, options: MERGE_POINTS.map((x) => ({ value: x.id, label: x.label })), onChange: set('point', 'timeline', true) }),
      W.point === 'custom' ? custom('mx', 'my', 'merge') : null,
      rangeField({ id: 'wf-seq', label: 'All at once → one by one', unit: '%', value: Math.round((W.mergeSeq || 0) * 100), min: 0, max: 100, step: 1, onInput: (v) => set('mergeSeq')(v / 100), hint: '0 pulls every winner in together; 100 brings them in one by one, each waiting at the merge point.' }),
      segmented({ id: 'wf-mpath', label: 'Flight path', value: W.mergePath, options: FLIGHT_PATHS.map((x) => ({ value: x.id, label: x.label })), onChange: set('mergePath') }),
      rangeField({ id: 'wf-big', label: 'Big symbol size', unit: '× cell', value: W.bigScale, min: 1.2, max: 4, step: 0.1, onInput: set('bigScale') })
    );
  }
  parts.push(
    toggleField({ id: 'fx-lines-on', label: 'Draw the winning lines', checked: fx.showLines !== false, onChange: (v) => { fx.showLines = v; changed('timeline'); }, hint: 'The payline drawn through each line win. The winners still light up without it.' }),
    rangeField({ id: 'fx-pop', label: 'Winning symbol pop', value: fx.popScale, min: 0, max: 0.4, step: 0.01, onInput: num(fx, 'popScale') }),
    rangeField({ id: 'fx-dim', label: 'Dim other symbols', value: fx.dim, min: 0, max: 0.9, step: 0.01, onInput: num(fx, 'dim') }),
    h('div', { class: 'row' }, button('Preview a win', previewAWin, { class: 'btn small', icon: 'eye', id: 'wf-preview' })),
    h('p', { class: 'hint' }, 'Any round can use its own style in the round inspector. The landing spot shows on the preview while this tab is open.')
  );
  const sec = section('Winning symbols', ...parts);
  sec.id = 'fx-winsyms';
  return sec;
}

// Plays the first round with a line or cluster win.
function previewAWin() {
  const i = state.scene?.tl.rounds.findIndex((R) => (R.pres.steps || []).length) ?? -1;
  if (i < 0) return toast('No round in the sequence has a win to show. Add a Small or Medium win round.', 'warn');
  state.solo = true;
  renderTransport();
  selectRound(i, true);
  if (!state.playing) togglePlay();
}

// One segment row: number, colour (or none, to show the wheel face), icon,
// label, value, remove.
// A segment as a choice in a list: its number, label and what it gives.
function segmentOption(s, i, cur) {
  const k = segmentKind(s);
  return `${i + 1}. ${s.label}${k === 'prize' ? ` (${cur}${s.value})` : k === 'again' ? ' (spin again)' : ' (no win)'}`;
}

function segmentRow(P, W, s, i) {
  const kindOf = segmentKind(s);
  const colour = s.color
    ? h(
        'div',
        { class: 'seg-color' },
        h('input', { type: 'color', id: `seg-c-${i}`, value: s.color, 'aria-label': `Segment ${i + 1} colour`, onchange: (e) => { s.color = e.target.value; changed('all'); } }),
        button('', () => {
          s.color = null;
          changed('all');
          renderPanel();
        }, { class: 'seg-none-btn', icon: 'x', title: 'No colour: show the wheel face here', id: `seg-nc-${i}` })
      )
    : h(
        'div',
        { class: 'seg-color' },
        button('', () => {
          s.color = SEG_COLOURS[i % SEG_COLOURS.length];
          changed('all');
          renderPanel();
        }, { class: 'seg-swatch none', title: 'No colour (the wheel face shows). Click to colour it.', id: `seg-c-${i}` })
      );
  const iconCell = iconControl(s.icon, (v) => {
    s.icon = v;
    changed('all');
    renderPanel();
    renderAssets();
  }, { id: `seg-i-${i}`, title: `Segment ${i + 1} icon`, cls: 'seg-icon' });
  return h(
    'div',
    { class: 'segment' },
    h('span', { class: 'seg-n' }, i + 1),
    colour,
    iconCell,
    h('input', { type: 'text', id: `seg-l-${i}`, value: s.label, 'aria-label': `Segment ${i + 1} label`, onchange: (e) => { s.label = e.target.value; changed('all'); refreshList(); } }),
    kindOf === 'prize' && wheelJackpot(jackpotsConfig(P), s)
      ? h('span', { class: 'seg-kind-chip jp', id: `seg-v-${i}`, title: 'Pays what its jackpot box shows (Features → Jackpot boxes)' }, jackpotsConfig(P).tiers.find((t) => t.id === wheelJackpot(jackpotsConfig(P), s))?.label || 'Jackpot')
      : kindOf === 'prize'
      ? h('input', { type: 'number', id: `seg-v-${i}`, value: s.value, 'aria-label': `Segment ${i + 1} value`, onchange: (e) => { s.value = Number(e.target.value) || 0; changed('timeline'); } })
      : h('span', { class: `seg-kind-chip ${kindOf}`, id: `seg-v-${i}`, title: kindOf === 'again' ? 'Lands here: the wheel spins again' : 'Lands here: no win' }, kindOf === 'again' ? 'Again' : 'No win'),
    button('', () => {
      // Prize, then spin again, then no win. A label still showing the
      // value (or the old kind's word) follows the kind.
      const order = ['prize', 'again', 'none'];
      const next = order[(order.indexOf(kindOf) + 1) % order.length];
      const words = SEGMENT_KINDS.map((k) => k.word).filter(Boolean);
      const auto = String(s.label) === String(s.value) || words.includes(String(s.label).toUpperCase());
      s.kind = next;
      if (auto) s.label = SEGMENT_KINDS.find((k) => k.id === next).word || String(s.value);
      changed('all');
      renderPanel();
      renderInspector();
      refreshList();
    }, { class: `icon-btn tiny seg-kind ${kindOf}`, icon: kindOf === 'prize' ? 'coin' : kindOf === 'again' ? 'loop' : 'block', title: `${SEGMENT_KINDS.find((k) => k.id === kindOf).label}: click for ${kindOf === 'prize' ? 'Spin again' : kindOf === 'again' ? 'No win' : 'Prize'}`, id: `seg-k-${i}` }),
    button('', () => {
      if (W.segments.length <= 3) return toast('A wheel needs at least three segments.', 'warn');
      W.segments.splice(i, 1);
      P.rounds.forEach((r) => {
        if (r.wheelSegment >= W.segments.length) r.wheelSegment = W.segments.length - 1;
      });
      changed('all');
      renderPanel();
      renderInspector();
    }, { class: 'icon-btn tiny', icon: 'trash', title: 'Remove segment', id: `seg-del-${i}` })
  );
}

const SEG_COLOURS = ['#b3123b', '#1f3fbf', '#0e8a4f', '#6a1fb8'];

function panelWheel() {
  const P = state.project;
  const W = P.wheel;
  W.art = W.art || { face: null, rim: null, hub: null, pointer: null };
  W.show = W.show || {};
  const cfg = wheelConfig(P);
  // What the height sliders show until they are moved.
  const autoH = autoHeights(W.segments.some((s) => s.icon), cfg.show.labels && W.segments.some((s) => String(s.label ?? '') !== ''));
  const list = h('div', { class: 'segments' });
  W.segments.forEach((s, i) => list.append(segmentRow(P, W, s, i)));
  const show = (k) => (v) => {
    W.show[k] = v;
    changed('all');
  };
  const framing = W.framing && WHEEL_FRAMINGS.some((f) => f.id === W.framing) ? W.framing : 'custom';
  const allChanged = (key) => num(W, key, 'all');
  return [
    section(
      'Segments',
      h('p', { class: 'hint' }, 'Clockwise from the top. Each wheel round picks its landing segment in the round settings. Clear a colour (×) to let the wheel face show through. Click an icon to pick a built-in one or upload your own.'),
      h('div', { class: 'segment head' }, h('span', null, '#'), h('span', null, 'Fill'), h('span', null, 'Icon'), h('span', null, 'Label'), h('span', null, 'Value'), h('span', { title: 'Prize, spin again or no win' }, 'Kind'), h('span', null, '')),
      list,
      h(
        'div',
        { class: 'row' },
        button('Add segment', () => {
          W.segments.push({ label: '100', value: 100, color: SEG_COLOURS[W.segments.length % 4] });
          changed('all');
          renderPanel();
          renderInspector();
        }, { class: 'btn small', icon: 'plus', id: 'seg-add' }),
        iconsEverywhereButton({ id: 'seg-icons-all' }),
        button('No colours', () => {
          W.segments.forEach((s) => (s.color = null));
          changed('all');
          renderPanel();
          if (!W.art.face) toast('Segments are clear. Add a wheel face in the Asset Bank to show behind them.');
        }, { class: 'btn small ghost', id: 'seg-clear-colours', title: 'Clear every segment colour so the wheel face shows' }),
        button('Default segments', () => {
          W.segments = DEFAULT_SEGMENTS.map((s) => ({ ...s }));
          changed('all');
          renderPanel();
          renderInspector();
        }, { class: 'btn small ghost', id: 'seg-reset' })
      )
    ),
    section(
      'Framing',
      h('p', { class: 'hint' }, 'The wheel can be bigger than the screen: show only its top half, a close-up, or hang it from above with the pointer at the bottom.'),
      segmented({
        id: 'w-framing',
        label: 'Framing',
        value: framing,
        options: [...WHEEL_FRAMINGS.map((f) => ({ value: f.id, label: f.label })), { value: 'custom', label: 'Custom' }],
        onChange: (v) => {
          W.framing = v;
          const f = WHEEL_FRAMINGS.find((x) => x.id === v);
          if (f) Object.assign(W, { size: f.size, x: f.x, y: f.y }, f.pointer ? { pointer: f.pointer } : {});
          changed('all');
          renderPanel();
        },
      }),
      rangeField({ id: 'w-size', label: 'Zoom', unit: '×', value: cfg.size, min: 0.4, max: 3, step: 0.01, onInput: (v) => { W.size = v; W.framing = 'custom'; changed('all'); } }),
      rangeField({ id: 'w-x', label: 'Centre across', unit: '% of width', value: Math.round(cfg.x * 100), min: -50, max: 150, step: 1, onInput: (v) => { W.x = v / 100; W.framing = 'custom'; changed('timeline'); } }),
      rangeField({ id: 'w-y', label: 'Centre down', unit: '% of height', value: Math.round(cfg.y * 100), min: -80, max: 180, step: 1, onInput: (v) => { W.y = v / 100; W.framing = 'custom'; changed('timeline'); } }),
      rangeField({ id: 'w-push', label: 'Push in on the pointer as it slows', unit: '%', value: Math.round(cfg.push * 100), min: 0, max: 80, step: 1, hint: '0 keeps the camera still. In After Effects the CAMERA null does it, scaled by Zoom %.', onInput: (v) => { W.push = v / 100; changed('timeline'); } })
    ),
    section(
      'Pointer',
      segmented({ id: 'w-pointer', label: 'Side', value: cfg.pointer, options: POINTER_SIDES.map((x) => ({ value: x.id, label: x.label })), onChange: (v) => { W.pointer = v; changed('all'); } }),
      rangeField({ id: 'w-ptr-size', label: 'Pointer size', unit: '×', value: cfg.pointerSize, min: 0.4, max: 2.5, step: 0.01, onInput: allChanged('pointerSize') }),
      wheelArtRow('Pointer art', 'pointer', 'Draw it pointing down; at the bottom it is turned over.'),
      W.art.pointer ? rangeField({ id: 'w-pivot', label: 'Pivot from the top', unit: '% of height', value: Math.round(cfg.pivot * 100), min: 0, max: 100, step: 1, hint: 'Where your pointer hinges; pegs bend it about this point.', onInput: (v) => { W.pivot = v / 100; changed('all'); } }) : null,
      h('p', { class: 'hint' }, 'Pegs bend the pointer as they pass. With "Almost slips" landing the wheel creeps into the next peg, nearly tips over, rolls back, and the pointer springs past straight before it settles.')
    ),
    section(
      'Look',
      fontPicker({ id: 'w-font', label: 'Label font', value: W.labelFont || '', fallback: { label: `Display font (${P.effects.font || 'Bungee'})`, font: P.effects.font || 'Bungee' }, onChange: (v) => {
        W.labelFont = v;
        changed('all');
        renderPanel();
      } }),
      moreLink('Effects › Titles and font', { tab: 'effects', id: 'fx-font' }, 'Display font'),
      segmented({ id: 'w-label-colour', label: 'Label colour', value: cfg.labelPalette, options: LABEL_PALETTES.map((x) => ({ value: x.id, label: x.label })), onChange: (v) => { W.labelPalette = v; changed('all'); } }),
      rangeField({ id: 'w-label-size', label: 'Text size', unit: '×', value: cfg.labelSize, min: 0.4, max: 2, step: 0.01, onInput: allChanged('labelSize') }),
      rangeField({ id: 'w-label-height', label: 'Text height', unit: '% from hub to rim', value: Math.round((cfg.labelHeight ?? autoH.label) * 100), min: 15, max: 97, step: 1, onInput: (v) => { W.labelHeight = v / 100; changed('all'); } }),
      rangeField({ id: 'w-icon-size', label: 'Icon size', unit: '×', value: cfg.iconSize, min: 0.3, max: 2, step: 0.01, onInput: allChanged('iconSize') }),
      rangeField({ id: 'w-icon-height', label: 'Icon height', unit: '% from hub to rim', value: Math.round((cfg.iconHeight ?? autoH.icon) * 100), min: 15, max: 97, step: 1, onInput: (v) => { W.iconHeight = v / 100; changed('all'); } }),
      cfg.iconHeight != null || cfg.labelHeight != null
        ? button('Automatic heights', () => {
            W.iconHeight = null;
            W.labelHeight = null;
            changed('all');
            renderPanel();
          }, { class: 'btn small ghost', id: 'w-heights-auto', title: 'Icons near the rim, text towards the hub, as each segment needs' })
        : null,
      h(
        'div',
        { class: 'field centre-icon-field' },
        h('span', { class: 'label' }, 'Centre icon'),
        h('div', { class: 'row' }, iconControl(cfg.centerIcon, (v) => { W.centerIcon = v || 'none'; changed('all'); renderPanel(); renderAssets(); }, { id: 'w-centre-icon', title: 'Centre icon', centre: true }), h('span', { class: 'hint' }, 'On the hub; the star by default. In After Effects it is the Wheel Center placeholder.'))
      ),
      rangeField({ id: 'w-hub-size', label: 'Hub size', unit: '×', value: cfg.hubSize, min: 0.3, max: 3, step: 0.01, onInput: allChanged('hubSize') }),
      toggleField({ id: 'w-hub-spins', label: 'Hub turns with the wheel', checked: cfg.hubSpins, onChange: (v) => { W.hubSpins = v; changed('all'); } }),
      h(
        'div',
        { class: 'toggle-grid' },
        toggleField({ id: 'w-show-labels', label: 'Labels', checked: cfg.show.labels, onChange: show('labels') }),
        toggleField({ id: 'w-show-separators', label: 'Separators', checked: cfg.show.separators, onChange: show('separators') }),
        toggleField({ id: 'w-show-pegs', label: 'Pegs', checked: cfg.show.pegs, onChange: show('pegs') }),
        toggleField({ id: 'w-show-hub', label: 'Hub', checked: cfg.show.hub, onChange: show('hub') }),
        toggleField({ id: 'w-show-rim', label: 'Rim', checked: cfg.show.rim, onChange: show('rim') }),
        toggleField({ id: 'w-show-bulbs', label: 'Rim bulbs', checked: cfg.show.bulbs, onChange: show('bulbs') })
      ),
      moreLink('Asset Bank › Wheel art', { bank: 'wheel', id: 'wart-up-face' }, 'Your own face, rim, hub and pointer')
    ),
    section(
      'Spin',
      rangeField({ id: 'w-turns', label: 'Full turns', value: W.turns, min: 1, max: 12, step: 1, onInput: num(W, 'turns') }),
      segmented({ id: 'w-landing', label: 'Default landing', value: W.landing, options: WHEEL_LANDINGS.map((x) => ({ value: x.id, label: x.label, hint: x.hint })), onChange: num(W, 'landing') }),
      toggleField({ id: 'w-bet', label: 'Multiply segment values by the bet', checked: W.multiplyByBet, onChange: num(W, 'multiplyByBet') })
    ),
  ];
}

// An uploaded wheel part (face, rim, hub, pointer): thumbnail, upload or
// replace, clear back to the built-in one.
function wheelArtRow(label, key, hint) {
  const W = state.project.wheel;
  W.art = W.art || {};
  const has = !!W.art[key];
  return h(
    'div',
    { class: 'asset-row' },
    h('div', { class: 'asset-thumb' }, has ? h('img', { src: W.art[key], alt: '' }) : h('span', null, key === 'face' ? 'None' : 'Built-in')),
    h('div', { class: 'asset-text' }, h('strong', null, label), h('span', { class: 'hint' }, hint)),
    h(
      'div',
      { class: 'asset-actions' },
      button(has ? 'Replace' : 'Upload', async () => {
        const [f] = await pickFiles('image/*');
        if (!f) return;
        W.art[key] = await readFileAsDataURL(f);
        changed('all');
        renderAssets();
        if (state.tab === 'wheel') renderPanel();
      }, { class: 'btn small', id: `wart-up-${key}` }),
      has
        ? button('Clear', () => {
            W.art[key] = null;
            changed('all');
            renderAssets();
            if (state.tab === 'wheel') renderPanel();
          }, { class: 'btn small ghost', id: `wart-clear-${key}` })
        : null
    )
  );
}

// Asset Bank: every wheel part and the segment icons.
function wheelArtSection() {
  const P = state.project;
  const after = () => {
    changed('all');
    renderAssets();
    if (state.tab === 'wheel') renderPanel();
  };
  const W = P.wheel;
  const icons = h(
    'div',
    { class: 'wheel-icons' },
    h('div', { class: 'wheel-icon centre' }, iconControl(wheelConfig(P).centerIcon, (v) => { W.centerIcon = v || 'none'; after(); }, { id: 'wi-centre', title: 'Centre icon', centre: true }), h('span', null, 'Centre')),
    W.segments.map((s, i) => h('div', { class: 'wheel-icon' }, iconControl(s.icon, (v) => { s.icon = v; after(); }, { id: `wi-up-${i}`, title: `${s.label || `Segment ${i + 1}`} icon` }), h('span', null, s.label || `#${i + 1}`)))
  );
  return section(
    'Wheel art',
    h('p', { class: 'hint' }, 'Every part of the wheel can be your own art.'),
    wheelArtRow('Wheel face', 'face', 'Square art for the whole disc. It turns with the wheel and shows through segments with no colour.'),
    wheelArtRow('Rim', 'rim', 'Square art around the wheel; the disc edge sits at 85% of its width.'),
    wheelArtRow('Hub', 'hub', 'The centre piece. Hub size and whether it turns are in the Wheel tab.'),
    wheelArtRow('Pointer', 'pointer', 'Pointing down, hinged near its top.'),
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Centre and segment icons'), icons),
    h('div', { class: 'row' }, iconsEverywhereButton({ id: 'wi-all' }), clearIconsButton({ id: 'wi-clear' })),
    moreLink('Wheel › Look', { tab: 'wheel', id: 'w-hub-size' }, 'Hub size and which parts show')
  );
}

// ---------- wheel icons ----------
// Built-in icons are painted once per session for their thumbnails.
const iconThumbs = new Map();
function wheelIconThumb(v) {
  const id = iconName(v);
  if (!id) return v;
  if (!iconThumbs.has(id)) iconThumbs.set(id, paintWheelIcon(id, 96, fontStack(state.project.effects.font)).toDataURL());
  return iconThumbs.get(id);
}

// A thumbnail button that opens the icon picker, with a small × to remove.
// centre: the hub's icon, where "none" is a choice of its own.
function iconControl(value, onPick, { id, title, cls = '', centre = false }) {
  const has = value && value !== 'none';
  const btn = button('', () => openIconPicker(btn, value, onPick, { title, centre }), { class: 'seg-icon-btn', icon: has ? null : 'plus', title: has ? `${title}: change` : `${title}: add`, id }, has ? h('img', { src: wheelIconThumb(value), alt: '' }) : null);
  return h('div', { class: `icon-ctl ${cls}` }, btn, has ? button('', () => onPick(null), { class: 'seg-none-btn', icon: 'trash', title: `${title}: remove`, id: `${id}-x` }) : null);
}

function closeIconPicker() {
  if (!el.iconPop) return;
  el.iconPop.remove();
  document.removeEventListener('pointerdown', el.iconPopOutside, true);
  el.iconPop = null;
}

function openIconPicker(anchor, current, onPick, { title, centre }) {
  closeIconPicker();
  const pick = (v) => {
    closeIconPicker();
    anchor.focus();
    onPick(v);
  };
  const grid = h(
    'div',
    { class: 'icon-pick-grid', role: 'listbox', 'aria-label': title },
    WHEEL_ICONS.map((ic) =>
      h('button', { type: 'button', role: 'option', class: `icon-pick${current === `builtin:${ic.id}` ? ' on' : ''}`, 'aria-selected': String(current === `builtin:${ic.id}`), title: ic.label, 'aria-label': ic.label, id: `ip-${ic.id}`, onclick: () => pick(`builtin:${ic.id}`) }, h('img', { src: wheelIconThumb(`builtin:${ic.id}`), alt: '' }))
    )
  );
  el.iconPop = h(
    'div',
    { class: 'icon-pop', role: 'dialog', 'aria-label': title, onkeydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeIconPicker(); anchor.focus(); } } },
    h('p', { class: 'icon-pop-title' }, title),
    grid,
    h(
      'div',
      { class: 'row' },
      button('Upload your own', async () => {
        closeIconPicker();
        const [f] = await pickFiles('image/*');
        if (f) onPick(await readFileAsDataURL(f));
      }, { class: 'btn small', icon: 'upload', id: 'ip-upload' }),
      current && current !== 'none' ? button(centre ? 'No centre icon' : 'No icon', () => pick(null), { class: 'btn small ghost', id: 'ip-none' }) : null
    )
  );
  document.body.append(el.iconPop);
  const r = anchor.getBoundingClientRect();
  const pw = el.iconPop.offsetWidth;
  const ph = el.iconPop.offsetHeight;
  el.iconPop.style.left = `${Math.max(8, Math.min(innerWidth - pw - 8, r.left))}px`;
  el.iconPop.style.top = `${r.bottom + ph + 8 > innerHeight ? Math.max(8, r.top - ph - 6) : r.bottom + 6}px`;
  el.iconPopOutside = (e) => {
    if (!el.iconPop?.contains(e.target) && !anchor.contains(e.target)) closeIconPicker();
  };
  document.addEventListener('pointerdown', el.iconPopOutside, true);
  (grid.querySelector('.on') || grid.querySelector('button')).focus();
}

// Fills every segment without its own uploaded icon, by prize.
function iconsEverywhereButton({ id }) {
  return button('Icons on every segment', () => {
    const W = state.project.wheel;
    const auto = autoIcons(W.segments);
    W.segments.forEach((s, i) => {
      if (!s.icon || iconName(s.icon)) s.icon = auto[i];
    });
    changed('all');
    renderPanel();
    renderAssets();
    toast('Every segment has an icon now, richer for bigger prizes. Click one to change it.');
  }, { class: 'btn small', icon: 'sparkle', id, title: 'Give every segment a built-in icon by its prize (your uploads stay)' });
}

function clearIconsButton({ id }) {
  return button('Clear icons', () => {
    state.project.wheel.segments.forEach((s) => (s.icon = null));
    changed('all');
    renderPanel();
    renderAssets();
  }, { class: 'btn small ghost', id });
}

// Asset Bank: uploaded fonts, for titles, counters and wheel labels.
function fontsSection() {
  const P = state.project;
  P.fonts = P.fonts || [];
  const rows = P.fonts.map((f) =>
    h(
      'div',
      { class: 'font-row' },
      h('span', { class: 'font-sample', style: `font-family: "${f.family}", sans-serif` }, f.family),
      h('span', { class: 'hint' }, f.ps || ''),
      button('', () => {
        P.fonts = P.fonts.filter((x) => x !== f);
        if (P.effects.font === f.family) P.effects.font = 'Bungee';
        if (P.wheel.labelFont === f.family) P.wheel.labelFont = '';
        changed('all');
        renderAssets();
        renderPanel();
      }, { class: 'icon-btn tiny', icon: 'trash', title: `Remove ${f.family}`, id: `font-del-${f.id}` })
    )
  );
  return section(
    'Fonts',
    h('p', { class: 'hint' }, 'TTF or OTF, for the titles, counters and wheel labels.'),
    rows.length ? h('div', { class: 'font-rows' }, rows) : h('p', { class: 'hint' }, 'None yet. Without them, pick any font in the font list.'),
    button('Upload fonts', addFonts, { class: 'btn small', icon: 'upload', id: 'font-add' }),
    moreLink('Effects › Titles and font', { tab: 'effects', id: 'fx-font' }, 'Display font')
  );
}

async function addFonts() {
  const files = await pickFiles('.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2', true);
  if (!files.length) return;
  const P = state.project;
  P.fonts = P.fonts || [];
  for (const f of files) {
    const buf = await f.arrayBuffer();
    const names = parseFontNames(buf);
    const base = f.name.replace(/\.[^.]+$/, '');
    const family = (names?.family || base.replace(/[-_](regular|bold|black|italic)$/i, '').replace(/[-_]+/g, ' ')).slice(0, 48);
    if (P.fonts.some((x) => x.family === family)) continue;
    P.fonts.push({ id: `f${Date.now().toString(36)}${P.fonts.length}`, family, ps: names?.postscript || '', file: f.name, src: await readFileAsDataURL(f) });
    toast(`${family} added. Pick it as the display font or the wheel label font.`);
  }
  changed('all');
  renderAssets();
  renderPanel();
}

// Catalogue fonts come from Google Fonts the first time they are used (a
// stylesheet per family); resolves once its stylesheet is in.
const webFonts = new Map();
function ensureWebFont(family) {
  if (!family || BUILTIN_FONTS.includes(family)) return Promise.resolve();
  if (webFonts.has(family)) return webFonts.get(family);
  const url = googleFontURL(family);
  if (!url) return Promise.resolve();
  const p = new Promise((resolve) => {
    const link = h('link', { rel: 'stylesheet', href: url });
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
    document.head.append(link);
  });
  webFonts.set(family, p);
  return p;
}

// A font picker: the font's name written in it. It opens a searchable list
// of fonts, each written in itself (loaded as it scrolls into view): your
// uploaded fonts, then the catalogue by look, and an upload button.
// fallback: a first entry meaning "the other font" (value '').
let fontPop = null;
function closeFontPicker() {
  fontPop?.close();
}
function fontPicker({ id, label, value, onChange, fallback }) {
  const P = state.project;
  const shown = value || fallback?.font || 'Bungee';
  ensureWebFont(shown);
  const btn = h(
    'button',
    { type: 'button', class: 'font-pick', id, 'aria-haspopup': 'listbox', 'aria-expanded': 'false' },
    h('span', { class: 'font-pick-name', style: { fontFamily: `"${shown}", sans-serif` } }, value ? value : fallback ? fallback.label : shown),
    icon('chevron')
  );
  // The trigger folds the list again too.
  btn.addEventListener('click', () => (fontPop?.btn === btn ? closeFontPicker() : openFontPicker(btn, value, onChange, fallback, P)));
  return h('div', { class: 'field' }, h('label', { for: id }, label), btn);
}
function openFontPicker(btn, value, onChange, fallback, P) {
  closeFontPicker();
  const mine = (P.fonts || []).map((f) => ({ family: f.family, cat: 'mine' }));
  const all = [...(fallback ? [{ family: '', label: fallback.label, cat: 'default', face: fallback.font }] : []), ...mine, ...FONT_CATALOG.filter((f) => !mine.some((m) => m.family === f.family))];
  let cat = 'all';
  let query = '';
  let active = 0;
  const search = h('input', { type: 'search', class: 'font-search', placeholder: 'Search fonts', 'aria-label': 'Search fonts', id: 'font-search' });
  const chips = h('div', { class: 'font-cats' });
  const list = h('div', { class: 'font-list', role: 'listbox', id: 'font-list' });
  const fold = h('button', { type: 'button', class: 'icon-btn font-pop-fold', id: 'font-pop-close', title: 'Fold the list', 'aria-label': 'Fold the list', onclick: () => close() }, icon('chevron'));
  const pop = h(
    'div',
    { class: 'font-pop', role: 'dialog', 'aria-label': 'Fonts' },
    h('div', { class: 'font-pop-head' }, search, fold),
    chips,
    list,
    h('div', { class: 'font-pop-foot' }, button('Upload a font', () => {
      close();
      addFonts();
    }, { class: 'btn small', icon: 'upload', id: 'font-pop-upload' }), h('span', { class: 'hint' }, 'Google Fonts; After Effects needs them installed.'))
  );
  const seen = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) ensureWebFont(e.target.dataset.font);
  }, { root: list, rootMargin: '120px' });
  let items = [];
  const pick = (f) => {
    close();
    const fam = f.family;
    Promise.resolve(fam ? ensureWebFont(fam) : null)
      .then(() => (fam ? withTimeout(document.fonts.load(`64px "${fam}"`), 2500).catch(() => null) : null))
      .then(() => onChange(fam));
  };
  const render = () => {
    clear(chips, [{ id: 'all', label: 'All' }, ...(mine.length ? [{ id: 'mine', label: 'Yours' }] : []), ...FONT_CATS].map((c) =>
      h('button', { type: 'button', class: `font-cat${cat === c.id ? ' on' : ''}`, onclick: () => {
        cat = c.id;
        active = 0;
        render();
      } }, c.label)
    ));
    const q = query.trim().toLowerCase();
    const shownList = all.filter((f) => (cat === 'all' || f.cat === cat || f.cat === 'default') && (!q || (f.label || f.family).toLowerCase().includes(q)));
    seen.disconnect();
    items = shownList.map((f, i) => {
      const face = f.face || f.family;
      const el2 = h(
        'button',
        {
          type: 'button',
          role: 'option',
          class: `font-item${(f.family || '') === (value || '') ? ' sel' : ''}${i === active ? ' active' : ''}`,
          'aria-selected': (f.family || '') === (value || '') ? 'true' : 'false',
          'data-font': face,
          onclick: () => pick(f),
        },
        h('span', { class: 'font-item-name', style: { fontFamily: `"${face}", sans-serif` } }, f.label || f.family),
        h('span', { class: 'font-item-cat' }, f.cat === 'mine' ? 'yours' : f.cat === 'default' ? '' : (FONT_CATS.find((c) => c.id === f.cat)?.label || ''))
      );
      seen.observe(el2);
      return el2;
    });
    clear(list, items.length ? items : h('p', { class: 'hint font-none' }, 'No font by that name. Upload your own below.'));
  };
  const setActive = (i) => {
    if (!items.length) return;
    active = (i + items.length) % items.length;
    items.forEach((x, k) => x.classList.toggle('active', k === active));
    items[active].scrollIntoView({ block: 'nearest' });
  };
  search.addEventListener('input', () => {
    query = search.value;
    active = 0;
    render();
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') setActive(active + 1);
    else if (e.key === 'ArrowUp') setActive(active - 1);
    else if (e.key === 'Enter' && items[active]) items[active].click();
    else if (e.key === 'Escape') close();
    else return;
    e.preventDefault();
  });
  const outside = (e) => {
    if (!pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) close();
  };
  function close() {
    if (fontPop !== api) return;
    fontPop = null;
    seen.disconnect();
    pop.remove();
    btn.setAttribute('aria-expanded', 'false');
    removeEventListener('pointerdown', outside, true);
  }
  const api = { close, btn };
  fontPop = api;
  render();
  document.body.append(pop);
  const r = btn.getBoundingClientRect();
  const w = Math.max(300, r.width);
  pop.style.width = `${w}px`;
  pop.style.left = `${Math.round(Math.min(innerWidth - w - 8, Math.max(8, r.left)))}px`;
  const below = innerHeight - r.bottom - 12;
  if (below >= 320 || below >= r.top) {
    pop.style.top = `${Math.round(r.bottom + 6)}px`;
    pop.style.maxHeight = `${Math.round(Math.min(460, below))}px`;
  } else {
    pop.style.bottom = `${Math.round(innerHeight - r.top + 6)}px`;
    pop.style.maxHeight = `${Math.round(Math.min(460, r.top - 12))}px`;
    // Opened upwards: the fold chevron points down, back to the field.
    pop.classList.add('above');
  }
  btn.setAttribute('aria-expanded', 'true');
  addEventListener('pointerdown', outside, true);
  const cur = items.findIndex((x) => x.classList.contains('sel'));
  if (cur >= 0) setActive(cur);
  search.focus();
}

// Uploaded fonts are registered with the page once each.
const fontFaces = new Map();
async function registerFonts(project) {
  for (const f of project.fonts || []) {
    if (fontFaces.has(f.id)) continue;
    const m = /^data:[^;,]*;base64,(.*)$/.exec(f.src || '');
    if (!m) continue;
    try {
      const bin = atob(m[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const face = new FontFace(f.family, bytes.buffer);
      fontFaces.set(f.id, face.load().then((ff) => document.fonts.add(ff)).catch(() => null));
    } catch {
      fontFaces.set(f.id, Promise.resolve(null));
    }
  }
  await Promise.all([...fontFaces.values()]);
}

// ---------- sound ----------

function soundChanged() {
  save();
  scheduleSound();
}

// The mix groups: a volume each in the Sound tab, and how the cues are
// grouped in Asset Bank › Sounds.
const SOUND_GROUPS = [
  ['reels', 'Reels and drops'],
  ['wins', 'Wins, pops, counters'],
  ['coins', 'Coins'],
  ['bigwin', 'Big win and features'],
  ['ui', 'Whooshes'],
];

function panelSound() {
  const P = state.project;
  const S = P.sound;
  const groups = SOUND_GROUPS;
  const mine = Object.keys(S.custom || {}).filter((k) => S.custom[k]).length;
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
      button('Download the sound track (WAV)', downloadWav, { class: 'btn small', icon: 'download', id: 'snd-wav', disabled: S.enabled === false }),
      S.enabled !== false ? moreLink('Asset Bank › Sounds', { bank: 'sounds', section: 'your-own-sounds' }, mine ? `Your own sounds (${mine} in use)` : 'Your own sounds') : null
    ),
  ];
}

// Hearing one cue on its own: the first time this animation plays it (its
// pitch and length as there), else a typical one; your own file when you
// gave one. At the track's volume and its group's level. One at a time.
const cuePlay = { id: null, src: null };
const CUE_DUR = { spinLoop: 1.5, anticipation: 1.5, count: 1.5, coins: 1.5, potCharge: 0.8, magnet: 0.8 };

function setCueButton(id, on) {
  const b = id && document.getElementById(`snd-play-${id}`);
  if (!b) return;
  clear(b, icon(on ? 'pause' : 'play'));
  b.title = on ? 'Stop' : 'Play';
  b.setAttribute('aria-label', b.title);
  b.setAttribute('aria-pressed', String(on));
}

function stopCue() {
  const { id, src } = cuePlay;
  cuePlay.id = null;
  cuePlay.src = null;
  if (src) {
    try {
      src.stop();
    } catch {
      // already ended
    }
    src.disconnect();
  }
  setCueButton(id, false);
}

async function toggleCue(id) {
  const again = cuePlay.id === id;
  stopCue();
  if (again) return;
  const ac = ensureAudioContext();
  if (!ac) return toast('This browser cannot play sound.', 'warn');
  cuePlay.id = id;
  setCueButton(id, true);
  const S = state.project.sound;
  const cue = state.scene?.tl.sfx.find((e) => e.type === id) || { type: id, dur: CUE_DUR[id] ?? 0.5 };
  try {
    const { buffer, duration } = await renderCue({ ...cue, t: 0 }, await customSounds(state.project));
    if (cuePlay.id !== id) return;
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const gain = ac.createGain();
    gain.gain.value = Number(S.volume ?? 1) * Number(S.mix?.[SOUND_EVENTS.find((e) => e.id === id)?.group || 'ui'] ?? 1);
    src.connect(gain).connect(ac.destination);
    src.onended = () => cuePlay.src === src && stopCue();
    src.start(0, 0, duration);
    cuePlay.src = src;
  } catch {
    stopCue();
    toast('That sound could not be played.', 'warn');
  }
}

// Asset Bank › Sounds: any cue can be your own file, grouped as in the mix.
function soundsSection() {
  const S = state.project.sound;
  const link = moreLink('Sound › Sound track', { tab: 'sound', id: S.enabled === false ? 'snd-on' : 'snd-vol' }, S.enabled === false ? 'Turn it on' : 'Volume and mix');
  if (S.enabled === false) return section('Your own sounds', h('p', { class: 'hint' }, 'The sound track is off.'), link);
  const after = () => {
    stopCue();
    soundChanged();
    renderAssets();
    if (state.tab === 'sound') renderPanel();
  };
  const row = (ev) => {
    const has = !!S.custom[ev.id];
    const playing = cuePlay.id === ev.id;
    return h(
      'div',
      { class: 'sound-row' },
      button('', () => toggleCue(ev.id), { class: 'icon-btn tiny snd-play', icon: playing ? 'pause' : 'play', title: playing ? 'Stop' : 'Play', id: `snd-play-${ev.id}` }),
      h('span', { class: 'sound-name' }, ev.label, h('span', { class: 'hint' }, has ? 'Your sound' : 'Built-in synth')),
      button(has ? 'Replace' : 'Upload', async () => {
        const [f] = await pickFiles('audio/*,.wav,.mp3,.ogg,.m4a');
        if (!f) return;
        if (f.size > 4e6) return toast('Keep each sound under 4 MB.', 'warn');
        S.custom[ev.id] = await readFileAsDataURL(f);
        after();
      }, { class: 'btn small', id: `snd-up-${ev.id}` }),
      has
        ? button('', () => {
            delete S.custom[ev.id];
            after();
          }, { class: 'icon-btn tiny', icon: 'trash', title: 'Remove your sound (back to the built-in one)', id: `snd-clear-${ev.id}` })
        : h('span')
    );
  };
  return section(
    'Your own sounds',
    h('p', { class: 'hint' }, 'Play any cue; upload a WAV, MP3 or OGG to replace it.'),
    SOUND_GROUPS.map(([k, l]) => {
      const list = SOUND_EVENTS.filter((ev) => (ev.group || 'ui') === k);
      if (!list.length) return null;
      const mine = list.filter((ev) => S.custom[ev.id]).length;
      return foldRow(`snd-${k}`, l, mine ? `${mine} of ${list.length} yours` : `${list.length} built-in`, h('div', { class: 'sounds' }, list.map(row)));
    }),
    link
  );
}

// The whole mix as the preview plays it: 16-bit stereo WAV at 48 kHz. Saves
// in claude.ai take no .wav files, so there the WAV comes in a zip.
async function downloadWav() {
  if (state.busy || !state.scene) return;
  try {
    setBusy('wav', 0.2, 'Rendering the sound track…');
    const buf = await renderSoundtrack(state.scene.tl, state.project, await customSounds(state.project));
    const name = `${slugName()}_soundtrack.wav`;
    let file = [name, audioBufferToWav(buf)];
    if (await downloadsP) {
      const zip = new window.JSZip();
      zip.file(...file);
      file = [`${slugName()}_soundtrack.zip`, await zip.generateAsync({ type: 'blob', compression: 'STORE' })];
    }
    setBusy(null);
    await saveFile(...file);
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
    abortCtl = new AbortController();
    const { blob, filename, formats } = await buildAEPackage(state.scene, state.images, (p) => setBusy('ae', p, `Building the After Effects package… ${Math.round(p * 100)}%`), abortCtl.signal);
    abortCtl = null;
    setBusy(null);
    if (await saveFile(filename, blob)) toast(`The package holds ${formats} format${formats === 1 ? '' : 's'}. Run the .jsx from File → Scripts → Run Script File.`, 'info', 6000);
  } catch (e) {
    abortCtl = null;
    setBusy(null);
    if (e.name === 'AbortError') return toast('After Effects package cancelled.', 'info', 3000);
    console.error(e);
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
    const only = on && P.output.formats.length === 1;
    const b = h('button', { type: 'button', class: `fmt${on ? ' on' : ''}`, id: `x-fmt-${f.id}`, 'aria-pressed': String(on), disabled: only, title: only ? 'Keep at least one format' : null }, h('strong', null, f.id.replace('x', ' × ')), h('span', null, f.label));
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
  const fmt = `${P.canvas.width}x${P.canvas.height}`;
  return [
    el.progress,
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
      segmented({ id: 'm-fps', label: 'Frame rate', value: P.canvas.fps, options: [24, 25, 30, 50, 60].map((f) => ({ value: f, label: `${f}` })), onChange: (v) => num(P.canvas, 'fps', 'timeline')(Number(v)) }),
      toggleField({ id: 'x-transparent', label: 'Transparent background', checked: !!P.output.transparent, onChange: (v) => { P.output.transparent = v; save(); }, hint: 'Leaves out the background and vignette: switched-off layers in After Effects, ready to render ProRes 4444 with alpha, and alpha in the still PNG. The preview and MP4 keep them.' })
    ),
    section(
      'After Effects project',
      h('p', null, 'The main export: a zip with a script that rebuilds this animation as a layered, editable After Effects project (2026 or any CC version), plus every image and every sound cue.'),
      h(
        'ul',
        { class: 'bullets' },
        h('li', null, 'Placeholder Comps: every symbol, piece of machine art and effect look (shockwave, light rays, coin, cell frames, plaques, titles, paylines, wheel parts) is its own comp. Replace or animate one and every use updates.'),
        h('li', null, 'Reels (or cells) are precomps driven by one Spin slider with the same start, mid and end keyframes and eases as this preview. Tumbles are keyframed layers.'),
        h('li', null, 'Each round is its own comp that places those effects in time. Every particle explosion is a comp of its own, its particles flying exactly as in this preview.'),
        h('li', null, 'SFX: every sound cue on its own audio layer, coloured by group, with group and master levels on the SFX MIX null.'),
        h('li', null, 'SLOT CONTROL carries the After Effects side controls: shake, flash, dim, particles, spin blur, win pop and effect colours.')
      ),
      h('div', { class: 'field' }, h('span', { class: 'label' }, `Formats · ${n} selected`), formatPicker(), h('p', { class: 'hint' }, 'Each format gets its own comp tree, laid out for that size. The symbol art is shared.')),
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
      'Soundtrack (WAV)',
      h('p', { class: 'hint' }, P.sound?.enabled === false ? 'The sound track is switched off in the Sound tab.' : 'The whole mix as the preview plays it, for editing the sound elsewhere: 16-bit stereo, 48 kHz, as long as the animation. In claude.ai it comes in a zip.'),
      button('Download the soundtrack', downloadWav, { class: 'btn wide', icon: 'download', id: 'x-wav', disabled: P.sound?.enabled === false })
    ),
    section(
      'Still frame',
      button('Save this frame as PNG', async () => {
        const blob = await frameToPNG(state.scene, state.t, { transparent: !!P.output.transparent });
        await saveFile(`${slugName()}_${state.t.toFixed(2).replace('.', '-')}s.png`, blob);
      }, { class: 'btn wide', id: 'x-png' }),
      h('p', { class: 'hint' }, 'With Transparent background on (Output, above), the background and vignette are left out.')
    ),
    section(
      'Project file',
      h('p', { class: 'hint' }, 'Includes your uploaded images and sounds, so you can reopen the exact animation later. New project, presets, clear and reset are in the Project menu at the top left.'),
      h('div', { class: 'row' }, button('Save project', saveProjectFile, { class: 'btn small', icon: 'download', id: 'x-save' }), button('Open project', openProjectFile, { class: 'btn small', icon: 'upload', id: 'x-open' }))
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
  invalidateSearchIndex();
  renderTransport();
  renderTabs();
  renderPanel();
  renderSequence();
  renderBadge();
}

export async function start() {
  state.project = loadSaved() || classicProject();
  downloadsP = window.claude?.use ? Promise.resolve(window.claude.use('downloads')).catch(() => null) : Promise.resolve(null);
  buildShell();
  renderAll();
  await withTimeout(Promise.all(['Bungee', 'Instrument Sans'].map((f) => document.fonts.load(`32px "${f}"`).catch(() => null))), 3000);
  await rebuild('all');
  renderPanel();
  recordNow();
  if (savedBroken) toast('Your last project could not be opened, so the demo is loaded. The old data is kept aside in this browser.', 'warn', 8000);
  // The Asset Bank reopens where it was left.
  if (ui.bank.open) {
    const wasMin = ui.bank.min;
    openBank(null, false);
    if (wasMin) setBankMin(true);
  }
  requestAnimationFrame((n) => {
    lastNow = n;
    loop(n);
  });
  // Reel Studio opens paused, on the first frame: Space or Play starts it.
  state.playing = false;
  renderTransport();
  // The first run guide shows itself once, where the browser remembers
  // that; it offers the presets gallery.
  if (!ui.seenGuide && storageWorks()) setTimeout(() => startGuide(true), 700);
  window.reelStudio = { state, rebuild, renderFrame, audio };
}
