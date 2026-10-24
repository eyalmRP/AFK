// App entry: load the weekly data, mount the four tabs, wire persistence.

import { loadData, data } from './data.js';
import { esc, fmtDate, $, $$ } from './util.js';
import { loadLocal, connectRemote, onBankChange, onSyncChange, sync, ownedIds } from './store.js';
import { mountMeta, refreshMeta } from './ui/meta.js';
import { mountBank, refreshBank } from './ui/bank.js';
import { mountBuilder, refreshBuilder } from './ui/builder.js';
import { mountCounter, refreshCounter } from './ui/counter.js';
import { bindImageFallback } from './ui/common.js';
import { BRAND } from './ui/icons.js';
import { initAi } from './ai.js';

const TABS = [
  { id: 'meta', label: 'Meta', mount: mountMeta, refresh: refreshMeta },
  { id: 'bank', label: 'Hero Bank', mount: mountBank, refresh: refreshBank },
  { id: 'builder', label: 'Formation Builder', mount: mountBuilder, refresh: refreshBuilder },
  { id: 'counter', label: 'Counter', mount: mountCounter, refresh: refreshCounter },
];

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
      </div>
    </div>
    <nav class="tabs" role="tablist" aria-label="Sections">${TABS.map(
      (t) => `<button class="tab" role="tab" type="button" data-tab="${t.id}" id="tab-${t.id}" aria-controls="view-${t.id}" aria-selected="${t.id === current}">${t.label}<span class="count"></span></button>`
    ).join('')}</nav>
  </div>`;
}

function show(id) {
  if (!TABS.some((t) => t.id === id)) id = 'meta';
  current = id;
  for (const t of TABS) {
    const v = document.getElementById('view-' + t.id);
    v.hidden = t.id !== id;
    document.getElementById('tab-' + t.id).setAttribute('aria-selected', String(t.id === id));
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
  const c = document.querySelector('[data-tab="bank"] .count');
  if (c) c.textContent = n ? String(n) : '';
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
  app.innerHTML = `<header class="app-header">${header()}</header>
    <main>${TABS.map((t) => `<section class="view" id="view-${t.id}" role="tabpanel" aria-labelledby="tab-${t.id}" hidden></section>`).join('')}
      <footer class="small muted app-foot">Fan-made tool, not affiliated with Lilith Games. Hero portraits are game assets via the floofpire/cdn mirror. Meta data ${esc(data.meta.gameVersion || '')} · updated weekly.</footer></main>
    <div id="toast" role="status" aria-live="polite" hidden></div>`;
  bindImageFallback(document.body);
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
