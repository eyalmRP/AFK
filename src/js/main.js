// App entry: load the weekly data, mount the tabs, wire persistence.

import { loadData, data } from './data.js';
import { esc, fmtDate, $, $$, local } from './util.js';
import { loadLocal, connectRemote, onBankChange, onSyncChange, sync, ownedIds, battles } from './store.js';
import { mountMeta, refreshMeta } from './ui/meta.js';
import { mountBank, refreshBank } from './ui/bank.js';
import { mountBuilder, refreshBuilder } from './ui/builder.js';
import { mountCounter, refreshCounter } from './ui/counter.js';
import { mountBattles, refreshBattles } from './ui/battles.js';
import { mountCodes, refreshCodes, codesToRedeem } from './ui/codes.js';
import { bindImageFallback } from './ui/common.js';
import { BRAND, ICON, GEM_SPRITE } from './ui/icons.js';
import { initAi } from './ai.js';
import { EMBLEM_DEFS } from './ui/emblem.js';

const TABS = [
  { id: 'meta', label: 'Meta', short: 'Meta', icon: 'tabMeta', mount: mountMeta, refresh: refreshMeta },
  { id: 'bank', label: 'Hero Bank', short: 'Bank', icon: 'tabBank', mount: mountBank, refresh: refreshBank },
  { id: 'builder', label: 'Formation Builder', short: 'Build', icon: 'tabBuild', mount: mountBuilder, refresh: refreshBuilder },
  { id: 'counter', label: 'Counter', short: 'Counter', icon: 'tabCounter', mount: mountCounter, refresh: refreshCounter },
  { id: 'battles', label: 'Battles', short: 'Battles', icon: 'tabBattles', mount: mountBattles, refresh: refreshBattles },
  { id: 'codes', label: 'Codes', short: 'Codes', icon: 'tabCodes', mount: mountCodes, refresh: refreshCodes },
];

// Theme: Auto follows Claude's appearance setting (or the device's when Claude
// is on System); Dark and Light override it. Remembered in this browser.
const THEME_KEY = 'afk-codex-theme';
const THEMES = [
  ['auto', 'Auto', 'themeAuto'],
  ['dark', 'Dark', 'themeDark'],
  ['light', 'Light', 'themeLight'],
];
let theme = THEMES.some(([v]) => v === local.get(THEME_KEY, 'auto')) ? local.get(THEME_KEY, 'auto') : 'auto';

function applyTheme() {
  if (theme === 'auto') document.documentElement.removeAttribute('data-codex-theme');
  else document.documentElement.setAttribute('data-codex-theme', theme);
  const b = document.getElementById('theme-btn');
  if (!b) return;
  const [, label, icon] = THEMES.find(([v]) => v === theme);
  b.innerHTML = `${ICON[icon]}<span>${label}</span>`;
  b.setAttribute('aria-label', `Theme: ${label}. Tap to change.`);
}

function cycleTheme() {
  const i = THEMES.findIndex(([v]) => v === theme);
  theme = THEMES[(i + 1) % THEMES.length][0];
  local.set(THEME_KEY, theme);
  applyTheme();
}
applyTheme();

const mounted = new Set();
const dirty = new Set();
let current = 'meta';

function header() {
  const m = data.meta;
  return `<div class="inner">
    <div class="brand-row">
      <div class="brand">${BRAND}<h1>AFK Arena Codex</h1></div>
      <div class="brand-meta">
        <span class="pill" title="The meta data is refreshed weekly">Meta of ${esc(fmtDate(m.asOf))}</span>
        ${m.nextUpdate ? `<span class="pill">Next update ${esc(fmtDate(m.nextUpdate))}</span>` : ''}
        <span class="pill" id="sync-pill" data-state="local"><span class="dot"></span><span id="sync-text">Saved in this browser</span></span>
        <button class="theme-btn" type="button" id="theme-btn" title="Auto follows Claude's appearance setting"></button>
      </div>
    </div>
    <nav class="tabs" role="tablist" aria-label="Sections">${TABS.map(
      (t) => `<button class="tab" role="tab" type="button" data-tab="${t.id}" id="tab-${t.id}" aria-controls="view-${t.id}" aria-selected="${t.id === current}">${t.label}<span class="count"></span></button>`
    ).join('')}</nav>
  </div>`;
}

// Phone navigation: a tab bar at the top of the screen that stays put while the
// page below it scrolls. (A bar fixed to the bottom can sit under Safari's
// toolbar, and a sticky one moves when iOS shifts the page around it.)
function phoneNav() {
  return `<nav class="phone-nav" aria-label="Sections">${TABS.map(
    (t) => `<button type="button" data-tab="${t.id}" aria-selected="${t.id === current}">${ICON[t.icon]}<span>${t.short}</span><span class="count"></span></button>`
  ).join('')}</nav>`;
}

function show(id) {
  if (!TABS.some((t) => t.id === id)) id = 'meta';
  current = id;
  for (const t of TABS) {
    const v = document.getElementById('view-' + t.id);
    v.hidden = t.id !== id;
    for (const b of document.querySelectorAll(`[data-tab="${t.id}"]`)) b.setAttribute('aria-selected', String(t.id === id));
  }
  const tab = TABS.find((t) => t.id === id);
  const el = document.getElementById('view-' + id);
  if (!mounted.has(id)) {
    tab.mount(el);
    mounted.add(id);
    dirty.delete(id);
  } else if (dirty.has(id)) {
    tab.refresh();
    dirty.delete(id);
  }
  try {
    history.replaceState(null, '', '#' + id);
  } catch {
    /* sandboxed */
  }
  window.scrollTo({ top: 0 });
  const sc = document.getElementById('app-scroll');
  if (sc) sc.scrollTop = 0;
}

function renderSync() {
  const pill = $('#sync-pill');
  const text = $('#sync-text');
  if (!pill) return;
  if (sync.mode === 'cloud') {
    pill.dataset.state = sync.status === 'saving' ? 'saving' : sync.status === 'error' ? 'error' : 'cloud';
    text.textContent = sync.status === 'saving' ? 'Saving…' : sync.status === 'error' ? 'Not saved, retrying on next change' : 'Saved to your Claude account';
  } else {
    pill.dataset.state = 'local';
    text.textContent = 'Saved in this browser';
  }
}

function updateBankCount() {
  const n = ownedIds().length;
  for (const c of document.querySelectorAll('[data-tab="bank"] .count')) c.textContent = n ? String(n) : '';
  for (const c of document.querySelectorAll('[data-tab="battles"] .count')) c.textContent = battles.items.length ? String(battles.items.length) : '';
  const k = codesToRedeem();
  for (const c of document.querySelectorAll('[data-tab="codes"] .count')) {
    c.textContent = k ? String(k) : '';
    c.classList.toggle('alert', k > 0);
  }
}

async function start() {
  const app = document.getElementById('app');
  try {
    await loadData();
  } catch (e) {
    app.innerHTML = `<div class="loading">The meta data could not be loaded (${esc(e.message)}). Reload the page to try again.</div>`;
    return;
  }
  loadLocal();
  // Phones: the tab bar stays put and only .app-scroll scrolls (see app.css).
  app.innerHTML = `${phoneNav()}<div class="app-scroll" id="app-scroll"><header class="app-header">${header()}</header>
    <main>${TABS.map((t) => `<section class="view" id="view-${t.id}" role="tabpanel" aria-labelledby="tab-${t.id}" hidden></section>`).join('')}
      <footer class="small muted app-foot">Fan-made tool, not affiliated with Lilith Games. Hero portraits are game assets via the floofpire/cdn mirror. Meta data ${esc(data.meta.gameVersion || '')} · updated weekly.</footer></main></div>
    <div id="toast" role="status" aria-live="polite" hidden></div>${GEM_SPRITE}<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>${EMBLEM_DEFS}</defs></svg>`;
  bindImageFallback(document.body);
  applyTheme();
  $('#theme-btn').addEventListener('click', cycleTheme);
  // Sticky bars inside the views sit just below the sticky header (on phones the header scrolls away).
  const head = app.querySelector('.app-header');
  const setHeaderH = () => document.documentElement.style.setProperty('--header-h', getComputedStyle(head).position === 'sticky' ? `${head.offsetHeight}px` : '0px');
  setHeaderH();
  if (window.ResizeObserver) new ResizeObserver(setHeaderH).observe(head);
  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
  const fromHash = (location.hash || '').replace('#', '');
  show(TABS.some((t) => t.id === fromHash) ? fromHash : 'meta');
  updateBankCount();

  onBankChange(() => {
    updateBankCount();
    for (const t of TABS) {
      if (!mounted.has(t.id)) continue;
      if (t.id === current) t.refresh();
      else dirty.add(t.id);
    }
  });
  onSyncChange(renderSync);
  renderSync();
  connectRemote();
  initAi();
}

start();
