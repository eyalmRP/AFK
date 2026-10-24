// Hero Bank tab: the player's roster with find, sort, filter, batch edit,
// per-hero editing, screenshot import, the shared crystal level, the Elder
// Tree, and a Beasts sub-tab.

import { esc, $, $$, toast, toInt, debounce, fmtDate, local } from '../util.js';
import { data, FACTION_IDS, CLASSES, ASCENSIONS, LIMITS, TIERS, tierOf, hero as getHero, starTier, ELDER_MAX } from '../data.js';
import { bank, updateHeroes, updateSettings, updateElderTree, replaceBank, removeHeroes, effectiveLevel, exportBank, sanitizeEntry, defaultEntry, ownedIds, ownedBeasts } from '../store.js';
import { aiState, initAi, readScreenshots, readElderTree, errorCopy } from '../ai.js';
import { ICON, classIcon, factionIcon } from './icons.js';
import { portrait, openDrawer, closeDrawer, tierPill, gameFilterBar, handleGameFilter, syncGameFilter, bindFolding, starRow, ascText } from './common.js';
import { openHeroDetail } from './heroDetail.js';
import { beastPanel, bindBeastPanel, refreshBeastPanel } from './beastPanel.js';

const SUB_KEY = 'afk-codex-bank-sub';
const SIZE_KEY = 'afk-codex-bank-size';

const ui = {
  q: '',
  sort: 'tier',
  dir: 1,
  own: 'all',
  asc: 'any',
  missing: 'any',
  factions: new Set(),
  classes: new Set(),
  types: new Set(),
  view: 'cards',
  selectMode: false,
  selected: new Set(),
  sub: local.get(SUB_KEY, 'heroes') === 'beasts' ? 'beasts' : 'heroes',
  // Card size: 1 portraits only, 2 small, 3 standard, 4 large.
  size: Math.min(4, Math.max(1, toInt(local.get(SIZE_KEY, 3), 3))),
};

// "Missing data" filter: owned heroes with an upgrade not recorded yet.
const MISSING = [
  ['any', 'Any'],
  ['upgrades', 'SI, furniture or engraving'],
  ['si', 'Signature item'],
  ['furniture', 'Furniture'],
  ['engrave', 'Engraving'],
  ['gear', 'Gear tier'],
  ['complete', 'Nothing (complete)'],
];
const MISSING_SHORT = { si: 'SI', furniture: 'Furniture', engrave: 'Engraving', gear: 'Gear' };
const unset = (v) => v === null || v === undefined;
function missingMatch(e, what = ui.missing) {
  switch (what) {
    case 'upgrades':
      return unset(e.si) || unset(e.furniture) || unset(e.engrave);
    case 'si':
    case 'furniture':
    case 'engrave':
    case 'gear':
      return unset(e[what]);
    case 'complete':
      return !unset(e.si) && !unset(e.furniture) && !unset(e.engrave) && !unset(e.gear);
    default:
      return true;
  }
}

const SORTS = [
  ['tier', 'Tier'],
  ['name', 'Name'],
  ['faction', 'Faction'],
  ['class', 'Class'],
  ['asc', 'Ascension'],
  ['level', 'Level'],
  ['si', 'Signature item'],
  ['furniture', 'Furniture'],
  ['engrave', 'Engraving'],
  ['recent', 'Recently edited'],
];

let root;

export function mountBank(el) {
  root = el;
  bindFolding(root);
  bindBeastPanel(root);
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  document.addEventListener('codex:edit-hero', (ev) => openEditor(ev.detail.id));
  render();
}

export function refreshBank() {
  if (!root) return;
  renderList();
  renderCounts();
  renderStats();
  syncElderInputs();
  refreshBeastPanel();
}

// ---- Elder Tree -------------------------------------------------------------

// Laid out like the in-game screen: Warrior at the top, Mage and Tank on
// the upper arch, Support and Ranger below them, the tree level at the foot.
const ELDER_NODES = ['Warrior', 'Mage', 'Tank', 'Support', 'Ranger', 'core'];

function elderSummary() {
  const t = bank.settings.elderTree || {};
  if (!ELDER_NODES.some((k) => !unset(t[k]))) return 'not recorded yet';
  return t.updated ? `updated ${fmtDate(new Date(t.updated).toISOString().slice(0, 10))}` : '';
}

function elderNode(key) {
  const v = bank.settings.elderTree?.[key];
  const label = key === 'core' ? 'Tree level' : key;
  return `<label class="et-node et-${key.toLowerCase()}" title="${label}">
    <img src="img/icons/elder/${key.toLowerCase()}.webp" alt="" draggable="false">
    <input class="input num-input" type="number" min="0" max="${ELDER_MAX}" inputmode="numeric" data-et="${key}" value="${v ?? ''}" placeholder="–" aria-label="${label} level">
  </label>`;
}

function elderCard() {
  return `<section class="elder-card" aria-labelledby="et-title">
    <div class="elder-head">
      <h3 id="et-title">Elder Tree</h3>
      <span class="small muted" id="et-sub">${esc(elderSummary())}</span>
      <button class="btn small ghost" type="button" data-act="elder-upload" id="et-upload" hidden title="Read the levels from a screenshot" aria-label="Read the levels from a screenshot">${ICON.upload}</button>
      <input type="file" id="et-file" accept="image/png,image/jpeg,image/webp" hidden>
    </div>
    <div class="elder-arch" role="group" aria-label="Elder Tree levels" title="Each branch boosts every hero of its class. The builder and counter favour classes levelled further than the rest.">
      ${ELDER_NODES.map(elderNode).join('')}
    </div>
    <p class="small muted" id="et-status"></p>
    <div id="et-review"></div>
  </section>`;
}

function syncElderInputs() {
  const t = bank.settings.elderTree || {};
  for (const inp of $$('[data-et]', root)) {
    if (document.activeElement === inp || inp.dataset.pending) continue;
    inp.value = t[inp.dataset.et] ?? '';
  }
  const sub = $('#et-sub', root);
  if (sub) sub.textContent = elderSummary();
}

async function readElderShot(file) {
  const status = $('#et-status', root);
  status.textContent = 'Claude is reading the Elder Tree…';
  try {
    const out = await readElderTree(file);
    const t = bank.settings.elderTree || {};
    const keys = ELDER_NODES.filter((k) => out[k] !== null);
    if (!keys.length) {
      status.textContent = 'No levels found. Try a screenshot of the whole Elder Tree screen.';
      return;
    }
    for (const k of keys) {
      const inp = root.querySelector(`[data-et="${k}"]`);
      if (!inp) continue;
      inp.value = out[k];
      inp.dataset.pending = String(out[k]);
      inp.classList.toggle('diff', t[k] !== out[k]);
    }
    status.textContent = out.notes || '';
    $('#et-review', root).innerHTML = `<div class="callout small">Read ${keys.length} level${keys.length === 1 ? '' : 's'}. Changed ones are highlighted.
      <div class="toolbar"><button class="btn small primary" type="button" data-act="elder-save">Save</button><button class="btn small ghost" type="button" data-act="elder-discard">Discard</button></div></div>`;
  } catch (e) {
    status.textContent = errorCopy(e);
  }
}

function finishElderReview(save) {
  const patch = {};
  for (const inp of $$('[data-et]', root)) {
    if (inp.dataset.pending !== undefined) {
      if (save) patch[inp.dataset.et] = toInt(inp.dataset.pending);
      delete inp.dataset.pending;
      inp.classList.remove('diff');
    }
  }
  $('#et-review', root).innerHTML = '';
  if (save && Object.keys(patch).length) {
    updateElderTree(patch, 'screenshot');
    toast('Elder Tree saved.');
  } else syncElderInputs();
}

// ---- filtering & sorting ----------------------------------------------------

const tierRank = (h) => {
  const t = tierOf(h, 'overall') || tierOf(h, 'pve');
  return t ? TIERS.indexOf(t) : TIERS.length;
};

function visibleHeroes() {
  const s = ui.q.trim().toLowerCase();
  const list = data.heroes.filter((h) => {
    const e = bank.heroes[h.id];
    const owned = !!e?.owned;
    if (ui.own === 'owned' && !owned) return false;
    if (ui.own === 'unowned' && owned) return false;
    if (ui.asc !== 'any' && (!owned || e.asc !== ui.asc)) return false;
    if (ui.missing !== 'any' && (!owned || !missingMatch(e))) return false;
    if (ui.factions.size && !ui.factions.has(h.faction)) return false;
    if (ui.classes.size && !ui.classes.has(h.class)) return false;
    if (ui.types.size && !ui.types.has(h.type)) return false;
    if (s && !h.name.toLowerCase().includes(s) && !h.faction.toLowerCase().includes(s) && !(h.title || '').toLowerCase().includes(s)) return false;
    return true;
  });
  const val = (h) => {
    const e = bank.heroes[h.id];
    const owned = e?.owned;
    switch (ui.sort) {
      case 'name':
        return h.name;
      case 'faction':
        return FACTION_IDS.indexOf(h.faction) * 1000 + tierRank(h);
      case 'class':
        return CLASSES.indexOf(h.class) * 1000 + tierRank(h);
      case 'asc':
        return owned ? -(ASCENSIONS.indexOf(e.asc) * 100 + (e.stars || 0)) : 999;
      case 'level':
        return owned ? -effectiveLevel(h.id) : 1;
      case 'si':
        return owned ? -(e.si ?? 0) : 1;
      case 'furniture':
        return owned ? -(e.furniture ?? 0) : 1;
      case 'engrave':
        return owned ? -(e.engrave ?? 0) : 1;
      case 'recent':
        return owned || e ? -(e.updated || 0) : 1;
      default:
        return tierRank(h);
    }
  };
  list.sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
    return c * ui.dir || a.name.localeCompare(b.name);
  });
  return list;
}

// ---- render -------------------------------------------------------------------

function render() {
  const beasts = ui.sub === 'beasts';
  root.innerHTML = `
    <div class="view-head">
      <div>
        <p class="eyebrow">Your roster</p>
        <h2>${beasts ? 'Beasts' : 'Hero bank'}</h2>
        <p>${
          beasts
            ? 'Mark the beasts you own and their buff levels. The builder and counter add your best-fitting beast to each team.'
            : 'Mark the heroes you own and how far each is built. The formation builder and counter planner only use heroes from here.'
        }</p>
      </div>
      <div class="toolbar">
        ${beasts ? '' : `<button class="btn primary" type="button" data-act="upload">${ICON.upload} Upload screenshots</button>`}
        <button class="btn" type="button" data-act="import">Import</button>
        <button class="btn" type="button" data-act="export">Export</button>
      </div>
    </div>
    <div class="subtabs" role="tablist" aria-label="Bank sections">
      <button type="button" role="tab" data-sub="heroes" aria-selected="${!beasts}">Heroes <span class="count" id="sub-heroes"></span></button>
      <button type="button" role="tab" data-sub="beasts" aria-selected="${beasts}">Beasts <span class="count" id="sub-beasts"></span></button>
    </div>
    ${beasts ? beastPanel({ bare: true }) : heroesPane()}`;
  renderList();
  renderCounts();
  renderStats();
  initAi().then(() => {
    const b = $('#et-upload', root);
    if (b) b.hidden = !(aiState.images && !aiState.disabled);
  });
}

function heroesPane() {
  return `
    <div class="bank-top">
      <div class="bank-summary">
        <div class="level-box">
          <label class="check"><input type="checkbox" id="bank-shared" ${bank.settings.sharedLevel ? 'checked' : ''}> All heroes share the same level</label>
          <label class="check">Level <input class="input num-input" id="bank-crystal" type="number" min="1" max="${LIMITS.level}" value="${bank.settings.crystalLevel}" ${bank.settings.sharedLevel ? '' : 'disabled'}></label>
          <span class="small muted" id="bank-shared-note">${sharedNote()}</span>
        </div>
        <div class="bank-stats" id="bank-stats"></div>
        <div class="toolbar">
        <label class="search">${ICON.search}<input class="input" id="bank-q" type="search" placeholder="Find hero, faction or title" autocomplete="off" value="${esc(ui.q)}"></label>
        <div class="seg" role="group" aria-label="Ownership">${[
          ['all', 'All'],
          ['owned', 'Owned'],
          ['unowned', 'Not owned'],
        ]
          .map(([v, l]) => `<button type="button" data-own="${v}" aria-pressed="${ui.own === v}">${l}</button>`)
          .join('')}</div>
        <label class="check">Sort <select class="select" id="bank-sort">${SORTS.map(([v, l]) => `<option value="${v}" ${ui.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <button class="btn small" type="button" data-act="dir" title="Reverse order" aria-label="Reverse order">${ui.dir === 1 ? '↓' : '↑'}</button>
      </div>
      <div class="toolbar">
        <label class="check">Ascension <select class="select" id="bank-asc"><option value="any">Any</option>${ASCENSIONS.map((a) => `<option ${ui.asc === a ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
        <label class="check" title="Owned heroes with an upgrade not recorded yet">Missing <select class="select" id="bank-missing">${MISSING.map(([v, l]) => `<option value="${v}" ${ui.missing === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <span class="spacer"></span>
        <label class="check size-ctl" id="bank-size-ctl" title="Card size" ${ui.view === 'table' ? 'hidden' : ''}><span class="size-ico small" aria-hidden="true">▦</span><input type="range" id="bank-size" min="1" max="4" step="1" value="${ui.size}" aria-label="Card size"><span class="size-ico" aria-hidden="true">▦</span></label>
        <div class="seg" role="group" aria-label="Layout">${[
          ['cards', 'Cards'],
          ['table', 'Table'],
        ]
          .map(([v, l]) => `<button type="button" data-view="${v}" aria-pressed="${ui.view === v}">${l}</button>`)
          .join('')}</div>
        <button class="btn small" type="button" data-act="select" aria-pressed="${ui.selectMode}">${ICON.edit} Batch edit</button>
        </div>
      </div>
      ${elderCard()}
    </div>
    <div class="bank-controls">
      ${gameFilterBar(ui)}
      <p class="small muted" id="bank-counts"></p>
    </div>
    <div id="bank-batch"></div>
    <div id="bank-list"></div>`;
}

function sharedNote() {
  return bank.settings.sharedLevel
    ? 'Every owned hero uses this level (the Resonating Crystal level).'
    : 'Each hero keeps its own level. Edit it per hero or in batch.';
}

function renderCounts() {
  const owned = ownedIds().length;
  for (const tab of document.querySelectorAll('[data-tab="bank"] .count')) tab.textContent = owned ? String(owned) : '';
  const sh = $('#sub-heroes', root);
  if (sh) sh.textContent = `${owned}/${data.heroes.length}`;
  const sb = $('#sub-beasts', root);
  if (sb) sb.textContent = `${ownedBeasts().length}/${data.beasts?.length || 0}`;
  const el = $('#bank-counts', root);
  if (!el) return;
  const shown = visibleHeroes().length;
  el.textContent = `${owned} owned of ${data.heroes.length} heroes · showing ${shown}${ui.selected.size ? ` · ${ui.selected.size} selected` : ''}`;
}

// Roster at a glance: owned heroes per ascension and upgrades not recorded.
// Each chip filters the list.
function renderStats() {
  const host = $('#bank-stats', root);
  if (!host) return;
  const owned = data.heroes.map((h) => bank.heroes[h.id]).filter((e) => e?.owned);
  if (!owned.length) {
    host.innerHTML = '<p class="small muted">Mark the heroes you own to see your roster at a glance here.</p>';
    return;
  }
  const byAsc = [...ASCENSIONS]
    .reverse()
    .map((a) => [a, owned.filter((e) => e.asc === a).length])
    .filter(([, n]) => n);
  const miss = Object.keys(MISSING_SHORT).map((k) => [k, owned.filter((e) => missingMatch(e, k)).length]);
  host.innerHTML = `<div class="stat-row"><span class="eyebrow">Ascension</span>${byAsc
    .map(([a, n]) => `<button type="button" class="chip-btn" data-asc-chip="${esc(a)}" aria-pressed="${ui.asc === a}">${ascText(a)}<b>${n}</b></button>`)
    .join('')}</div>
    <div class="stat-row"><span class="eyebrow">Not recorded</span>${miss
      .map(([k, n]) => `<button type="button" class="chip-btn" data-missing-chip="${k}" aria-pressed="${ui.missing === k}" ${n ? '' : 'disabled'}>${MISSING_SHORT[k]}<b>${n}</b></button>`)
      .join('')}</div>`;
}

const dash = (v) => (unset(v) ? '–' : v);

function ascLine(e, size = 12) {
  return `${ascText(e.asc)}${e.asc === 'Ascended' && e.stars ? starRow(e.stars, { size }) : ''}`;
}

function upgradeLine(e) {
  if (unset(e.si) && unset(e.furniture) && unset(e.engrave)) return '<span class="muted" title="Signature item, furniture and engraving not recorded">SI – · –F · E–</span>';
  return `SI ${dash(e.si)} · ${dash(e.furniture)}F · E${dash(e.engrave)}`;
}

function levelLine(h, e) {
  return `Lv ${effectiveLevel(h.id)}${bank.settings.sharedLevel && e.crystal === false ? ' (own level)' : ''}${unset(e.gear) ? '' : ` · T${e.gear} gear`}`;
}

// Stars as the game shows them: gold 1–5, red 6–10, white 11–15.
const STAR_TIER = { gold: 'Gold', red: 'Red', white: 'White' };
function starOptions(cur, withKeep = false) {
  const opts = withKeep ? ['<option value="">No change</option>'] : [];
  for (let i = 0; i <= LIMITS.stars; i++) {
    const t = starTier(i);
    opts.push(`<option value="${i}" ${cur === i ? 'selected' : ''}>${t ? `${'★'.repeat(t.count)} ${STAR_TIER[t.tier]} (${i})` : 'None'}</option>`);
  }
  return opts.join('');
}

function renderList() {
  const host = $('#bank-list', root);
  if (!host) return;
  const list = visibleHeroes();
  if (!list.length) {
    host.innerHTML = `<div class="empty"><h4>No heroes match</h4><p>Clear the search or filters to see the full roster.</p></div>`;
  } else if (ui.view === 'table') {
    host.innerHTML = tableView(list);
  } else {
    host.innerHTML = `<div class="bank-grid size-${ui.size}">${list.map(card).join('')}</div>`;
  }
  renderBatch();
}

const PORTRAIT_SIZE = { 1: 54, 2: 44, 3: 56, 4: 72 };

function card(h) {
  const e = bank.heroes[h.id];
  const owned = !!e?.owned;
  const sel = ui.selected.has(h.id);
  const size = ui.size;
  const box = ui.selectMode ? `<input class="sel" type="checkbox" data-sel="${h.id}" ${sel ? 'checked' : ''} aria-label="Select ${esc(h.name)}">` : '';
  const head = `<div class="bank-card" role="button" tabindex="0" data-card="${h.id}" aria-selected="${sel}" title="${esc(h.name)}">${box}${portrait(h, { size: PORTRAIT_SIZE[size], showBank: true, unowned: !owned })}`;
  if (size === 1) return `${head}<span class="nm">${esc(h.name)}</span></div>`;
  let info;
  if (!owned) {
    info = `<span class="st muted cls-line">${classIcon(h.class)} ${esc(h.class)}</span>${ui.selectMode ? '' : `<button class="btn small own-btn" type="button" data-own-hero="${h.id}">${size === 2 ? '+ Own' : '+ I own this'}</button>`}`;
  } else if (size === 2) {
    info = `<span class="st">${ascLine(e, 11)}</span>`;
  } else if (size === 3) {
    info = `<span class="st">${ascLine(e)}</span><span class="st">${upgradeLine(e)}</span><span class="st">${levelLine(h, e)}</span>`;
  } else {
    const ups = [
      ['SI', e.si],
      ['Furn.', e.furniture],
      ['Engr.', e.engrave],
      ['Gear', unset(e.gear) ? null : 'T' + e.gear],
    ];
    info = `<span class="st cls-line">${factionIcon(h.faction)}${classIcon(h.class)} ${esc(h.faction)} ${esc(h.class)}</span>
      <span class="st">${ascLine(e, 15)}</span>
      <dl class="up-grid">${ups.map(([k, v]) => `<div${unset(v) ? ' class="unset"' : ''}><dt>${k}</dt><dd>${dash(v)}</dd></div>`).join('')}</dl>
      <span class="st">${levelLine(h, e)}</span>
      ${e.notes ? `<span class="st note">${esc(e.notes)}</span>` : ''}`;
  }
  return `${head}<div class="bank-info"><span class="nm">${esc(h.name)}</span>${info}</div></div>`;
}

function numCell(id, field, value, max, disabled) {
  return `<input class="input num-input" type="number" min="0" max="${max}" value="${value ?? ''}" placeholder="–" data-cell="${id}" data-field="${field}" ${disabled ? 'disabled' : ''} aria-label="${field}">`;
}

function tableView(list) {
  const shared = bank.settings.sharedLevel;
  const rows = list
    .map((h) => {
      const e = bank.heroes[h.id] || { ...defaultEntry(), owned: false };
      const owned = !!bank.heroes[h.id]?.owned;
      const sel = ui.selected.has(h.id);
      const dis = !owned;
      const ascended = owned && e.asc === 'Ascended';
      return `<tr aria-selected="${sel}">
        <td><input type="checkbox" data-sel="${h.id}" ${sel ? 'checked' : ''} aria-label="Select ${esc(h.name)}"></td>
        <td><span class="hero-cell">${portrait(h, { size: 34, unowned: !owned })}<button class="btn ghost small" type="button" data-detail="${h.id}">${esc(h.name)}</button></span></td>
        <td><input type="checkbox" data-cell="${h.id}" data-field="owned" ${owned ? 'checked' : ''} aria-label="Owned"></td>
        <td><select class="select asc-select" data-asc="${owned ? esc(e.asc) : ''}" data-cell="${h.id}" data-field="asc" ${dis ? 'disabled' : ''} aria-label="Ascension">${ASCENSIONS.map((a) => `<option ${e.asc === a ? 'selected' : ''}>${a}</option>`).join('')}</select></td>
        <td><span class="star-cell"><select class="select" data-cell="${h.id}" data-field="stars" ${ascended ? '' : 'disabled'} aria-label="Stars">${starOptions(e.stars)}</select>${ascended ? starRow(e.stars, { size: 12 }) : ''}</span></td>
        <td>${shared && e.crystal !== false ? `<span class="num muted" title="Shared level">${owned ? bank.settings.crystalLevel : '–'}</span>` : numCell(h.id, 'level', e.level, LIMITS.level, dis)}</td>
        <td>${numCell(h.id, 'si', e.si, LIMITS.si, dis)}</td>
        <td>${numCell(h.id, 'furniture', e.furniture, LIMITS.furniture, dis)}</td>
        <td>${numCell(h.id, 'engrave', e.engrave, LIMITS.engrave, dis)}</td>
        <td>${numCell(h.id, 'gear', e.gear, LIMITS.gear, dis)}</td>
        <td>${tierPill(tierOf(h, 'overall'))}</td>
        <td><button class="btn ghost small" type="button" data-edit-hero="${h.id}" aria-label="Edit ${esc(h.name)}">${ICON.edit}</button></td>
      </tr>`;
    })
    .join('');
  return `<div class="table-wrap"><table class="bank">
    <thead><tr><th><input type="checkbox" data-act="select-all-table" aria-label="Select all shown"></th><th>Hero</th><th>Owned</th><th>Ascension</th><th>Stars</th><th>Level</th><th>SI</th><th>Furn.</th><th>Engrave</th><th>Gear T</th><th>Tier</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function opt(v, l = v) {
  return `<option value="${esc(v)}">${esc(l)}</option>`;
}

// The batch bar sits above the list and sticks to the top while scrolling.
function renderBatch() {
  const host = $('#bank-batch', root);
  if (!host) return;
  const n = ui.selected.size;
  if (!n && !ui.selectMode) {
    host.innerHTML = '';
    return;
  }
  host.innerHTML = `<div class="batch-bar" role="region" aria-label="Batch edit">
    <span class="count">${n ? `${n} selected` : 'Tap heroes to select them'}</span>
    ${n ? `<button class="btn primary" type="button" data-act="batch-edit">${ICON.edit} Edit ${plural(n, 'hero')}…</button>` : ''}
    <span class="spacer"></span>
    <button class="btn small" type="button" data-act="select-shown">Select all shown</button>
    ${n ? '<button class="btn small ghost" type="button" data-act="batch-clear">Clear</button>' : ''}
    <button class="btn small ghost" type="button" data-act="select-done">Done</button>
  </div>`;
}

function openBatchEditor() {
  const n = ui.selected.size;
  if (!n) return;
  const keep = opt('', 'No change');
  const range = (k) => Array.from({ length: k + 1 }, (_, i) => opt(String(i))).join('');
  const picked = [...ui.selected].map(getHero).filter(Boolean);
  const d = openDrawer({
    title: `Edit ${plural(n, 'hero')}`,
    body: `<div class="batch-heroes">${picked
      .slice(0, 40)
      .map((h) => portrait(h, { size: 36, showBank: true }))
      .join('')}${n > 40 ? `<span class="small muted">+${n - 40} more</span>` : ''}</div>
      <p class="small muted">Only the fields you set change. Fields left on "No change" or empty keep each hero's own value.</p>
      <div class="edit-grid">
        <label class="field"><span>Owned</span><select class="select" id="b-owned">${keep}${opt('yes', 'Owned')}${opt('no', 'Not owned')}</select></label>
        <label class="field"><span>Ascension</span><select class="select" id="b-asc">${keep}${ASCENSIONS.map((a) => opt(a)).join('')}</select></label>
        <label class="field"><span>Stars</span><select class="select" id="b-stars">${starOptions(null, true)}</select></label>
        <label class="field"><span>Shared level</span><select class="select" id="b-crystal">${keep}${opt('yes', 'Uses it')}${opt('no', 'Own level')}</select></label>
        <label class="field"><span>Own level</span><input class="input num-input" id="b-level" type="number" min="1" max="${LIMITS.level}" placeholder="–"></label>
        <label class="field"><span>Signature item</span><input class="input num-input" id="b-si" type="number" min="0" max="${LIMITS.si}" placeholder="–"></label>
        <label class="field"><span>Furniture</span><select class="select" id="b-furniture">${keep}${range(LIMITS.furniture)}</select></label>
        <label class="field"><span>Engraving</span><input class="input num-input" id="b-engrave" type="number" min="0" max="${LIMITS.engrave}" placeholder="–"></label>
        <label class="field"><span>Gear tier</span><select class="select" id="b-gear">${keep}${Array.from({ length: LIMITS.gear + 1 }, (_, i) => opt(String(i), 'T' + i)).join('')}</select></label>
      </div>`,
    foot: `<button class="btn ghost" type="button" data-remove title="Forget everything recorded for these heroes">${ICON.trash} Remove data</button><button class="btn" type="button" data-cancel>Cancel</button><button class="btn primary" type="button" data-apply>Apply to ${n}</button>`,
  });
  d.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-cancel]')) closeDrawer();
    else if (ev.target.closest('[data-apply]')) {
      if (applyBatch(d)) closeDrawer();
    } else if (ev.target.closest('[data-remove]')) {
      removeHeroes([...ui.selected]);
      toast(`Removed recorded data for ${plural(ui.selected.size, 'hero')}.`);
      ui.selected.clear();
      closeDrawer();
      refreshBank();
    }
  });
}

// ---- events ---------------------------------------------------------------------

function onClick(ev) {
  const t = ev.target;
  const act = t.closest('[data-act]')?.dataset.act;
  if (act && t.closest('[data-act]').tagName !== 'INPUT') {
    handleAct(act);
    return;
  }
  const sub = t.closest('[data-sub]');
  if (sub) {
    if (ui.sub === sub.dataset.sub) return;
    ui.sub = sub.dataset.sub;
    local.set(SUB_KEY, ui.sub);
    render();
    return;
  }
  const own = t.closest('[data-own]');
  if (own) {
    ui.own = own.dataset.own;
    $$('[data-own]', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.own === ui.own)));
    refreshBank();
    return;
  }
  const ascChip = t.closest('[data-asc-chip]');
  if (ascChip) {
    ui.asc = ui.asc === ascChip.dataset.ascChip ? 'any' : ascChip.dataset.ascChip;
    $('#bank-asc', root).value = ui.asc;
    refreshBank();
    return;
  }
  const missChip = t.closest('[data-missing-chip]');
  if (missChip) {
    ui.missing = ui.missing === missChip.dataset.missingChip ? 'any' : missChip.dataset.missingChip;
    $('#bank-missing', root).value = ui.missing;
    refreshBank();
    return;
  }
  const view = t.closest('[data-view]');
  if (view) {
    ui.view = view.dataset.view;
    $$('[data-view]', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === ui.view)));
    $('#bank-size-ctl', root).hidden = ui.view === 'table';
    renderList();
    return;
  }
  if (t.closest('.gamebar') && handleGameFilter(ev, ui)) {
    syncGameFilter(root, ui);
    refreshBank();
    return;
  }
  const ownHero = t.closest('[data-own-hero]');
  if (ownHero) {
    const id = ownHero.dataset.ownHero;
    updateHeroes({ [id]: { ...(bank.heroes[id] || {}), owned: true } });
    toast(`${getHero(id)?.name} added to your bank. Select the card to set its upgrades.`);
    return;
  }
  const detail = t.closest('[data-detail]');
  if (detail) {
    openHeroDetail(detail.dataset.detail);
    return;
  }
  const edit = t.closest('[data-edit-hero]');
  if (edit) {
    openEditor(edit.dataset.editHero);
    return;
  }
  if (t.matches('[data-sel]')) {
    toggleSelect(t.dataset.sel);
    return;
  }
  const c = t.closest('[data-card]');
  if (c) {
    if (ui.selectMode) toggleSelect(c.dataset.card);
    else openEditor(c.dataset.card);
  }
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : word.endsWith('o') ? 'es' : 's'}`;
}

function toggleSet(set, v) {
  if (set.has(v)) set.delete(v);
  else set.add(v);
}

function toggleSelect(id) {
  toggleSet(ui.selected, id);
  const sel = ui.selected.has(id);
  const c = root.querySelector(`[data-card="${id}"]`);
  if (c) c.setAttribute('aria-selected', String(sel));
  const box = root.querySelector(`[data-sel="${id}"]`);
  if (box) {
    box.checked = sel;
    box.closest('tr')?.setAttribute('aria-selected', String(sel));
  }
  renderBatch();
  renderCounts();
}

function setSelectMode(on) {
  ui.selectMode = on;
  if (!on) ui.selected.clear();
  $('[data-act="select"]', root)?.setAttribute('aria-pressed', String(on));
  renderList();
  renderCounts();
}

function handleAct(act) {
  switch (act) {
    case 'elder-upload':
      $('#et-file', root).click();
      break;
    case 'elder-save':
      finishElderReview(true);
      break;
    case 'elder-discard':
      finishElderReview(false);
      break;
    case 'dir':
      ui.dir = -ui.dir;
      $('[data-act="dir"]', root).textContent = ui.dir === 1 ? '↓' : '↑';
      renderList();
      break;
    case 'select':
      setSelectMode(!ui.selectMode);
      break;
    case 'select-done':
      setSelectMode(false);
      break;
    case 'select-shown':
    case 'select-all-table':
      for (const h of visibleHeroes()) ui.selected.add(h.id);
      setSelectMode(true);
      break;
    case 'batch-clear':
      ui.selected.clear();
      renderList();
      renderCounts();
      break;
    case 'batch-edit':
      openBatchEditor();
      break;
    case 'upload':
      openUpload();
      break;
    case 'import':
      openImport();
      break;
    case 'export':
      openExport();
      break;
  }
}

function applyBatch(d) {
  const get = (id) => $('#' + id, d)?.value ?? '';
  const patch = {};
  if (get('b-owned')) patch.owned = get('b-owned') === 'yes';
  if (get('b-asc')) patch.asc = get('b-asc');
  if (get('b-stars') !== '') patch.stars = toInt(get('b-stars'));
  if (get('b-crystal')) patch.crystal = get('b-crystal') === 'yes';
  if (get('b-level') !== '') patch.level = toInt(get('b-level'));
  if (get('b-si') !== '') patch.si = toInt(get('b-si'));
  if (get('b-furniture') !== '') patch.furniture = toInt(get('b-furniture'));
  if (get('b-engrave') !== '') patch.engrave = toInt(get('b-engrave'));
  if (get('b-gear') !== '') patch.gear = toInt(get('b-gear'));
  if (!Object.keys(patch).length) {
    toast('Pick at least one value to change.');
    return false;
  }
  // Editing upgrades on a hero implies owning it unless told otherwise.
  if (!('owned' in patch)) patch.owned = true;
  const patches = {};
  for (const id of ui.selected) patches[id] = { ...(bank.heroes[id] || {}), ...patch };
  updateHeroes(patches);
  toast(`Updated ${plural(ui.selected.size, 'hero')}.`);
  return true;
}

function onChange(ev) {
  const t = ev.target;
  if (t.dataset.et && t.dataset.pending === undefined) {
    const v = t.value === '' ? null : Math.max(0, Math.min(ELDER_MAX, toInt(t.value)));
    updateElderTree({ [t.dataset.et]: v });
    return;
  }
  if (t.id === 'et-file') {
    const f = t.files?.[0];
    if (f) readElderShot(f);
    t.value = '';
    return;
  }
  if (t.id === 'bank-shared') {
    updateSettings({ sharedLevel: t.checked });
    $('#bank-crystal', root).disabled = !t.checked;
    $('#bank-shared-note', root).textContent = sharedNote();
    return;
  }
  if (t.id === 'bank-sort') {
    ui.sort = t.value;
    renderList();
    return;
  }
  if (t.id === 'bank-asc' || t.id === 'bank-missing') {
    ui[t.id === 'bank-asc' ? 'asc' : 'missing'] = t.value;
    refreshBank();
    return;
  }
  if (t.dataset.cell) {
    const id = t.dataset.cell;
    const f = t.dataset.field;
    const optional = ['si', 'furniture', 'engrave', 'gear'].includes(f);
    const val = f === 'owned' ? t.checked : f === 'asc' ? t.value : optional && t.value === '' ? null : toInt(t.value);
    updateHeroes({ [id]: { ...(bank.heroes[id] || { ...defaultEntry(), owned: false }), [f]: val } });
  }
}

const saveCrystal = debounce((v) => updateSettings({ crystalLevel: v }), 400);

function onInput(ev) {
  const t = ev.target;
  if (t.id === 'bank-q') {
    ui.q = t.value;
    refreshBank();
  } else if (t.id === 'bank-crystal') {
    const v = toInt(t.value, 0);
    if (v >= 1) saveCrystal(v);
  } else if (t.id === 'bank-size') {
    ui.size = toInt(t.value, 3);
    local.set(SIZE_KEY, ui.size);
    renderList();
  }
}

// ---- per-hero editor ----------------------------------------------------------------

export function openEditor(id) {
  const h = getHero(id);
  if (!h) return;
  const cur = bank.heroes[id] || { ...defaultEntry(), owned: false };
  const shared = bank.settings.sharedLevel;
  const body = `
    <div style="display:flex;gap:14px;align-items:center">${portrait(h, { size: 72, showBank: true })}
      <div><p class="muted">${esc(h.faction)} ${esc(h.class)}</p><button class="btn small" type="button" data-detail-open>Hero details and ratings</button></div></div>
    <label class="check"><input type="checkbox" id="ed-owned" ${cur.owned ? 'checked' : ''}> I own this hero</label>
    <div class="edit-grid">
      <label class="field"><span>Ascension</span><select class="select asc-select" id="ed-asc" data-asc="${esc(cur.asc)}">${ASCENSIONS.map((a) => `<option ${cur.asc === a ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
      <label class="field"><span>Stars (Ascended)</span><select class="select" id="ed-stars" ${cur.asc === 'Ascended' ? '' : 'disabled'}>${starOptions(cur.stars)}</select><span class="star-prev" id="ed-star-row">${cur.asc === 'Ascended' ? starRow(cur.stars, { size: 16 }) : ''}</span></label>
      <label class="field"><span>Level</span><input class="input" id="ed-level" type="number" min="1" max="${LIMITS.level}" value="${shared && cur.crystal !== false ? bank.settings.crystalLevel : cur.level}" ${shared && cur.crystal !== false ? 'disabled' : ''}></label>
      <label class="field"><span>Signature item</span><input class="input" id="ed-si" type="number" min="0" max="${LIMITS.si}" value="${cur.si ?? ''}" placeholder="not recorded"></label>
      <label class="field"><span>Furniture (0–9)</span><input class="input" id="ed-furniture" type="number" min="0" max="${LIMITS.furniture}" value="${cur.furniture ?? ''}" placeholder="not recorded"></label>
      <label class="field"><span>Engraving</span><input class="input" id="ed-engrave" type="number" min="0" max="${LIMITS.engrave}" value="${cur.engrave ?? ''}" placeholder="not recorded"></label>
      <label class="field"><span>Mythic gear tier</span><select class="select" id="ed-gear"><option value="">Not recorded</option>${Array.from({ length: LIMITS.gear + 1 }, (_, i) => `<option value="${i}" ${cur.gear === i ? 'selected' : ''}>T${i}</option>`).join('')}</select></label>
    </div>
    ${shared ? `<label class="check"><input type="checkbox" id="ed-crystal" ${cur.crystal !== false ? 'checked' : ''}> Uses the shared level (${bank.settings.crystalLevel})</label>` : ''}
    ${h.investment?.note ? `<p class="callout info small"><strong>Investment tip:</strong> ${esc(h.investment.note)}</p>` : ''}
    <label class="field"><span>Notes</span><textarea class="input" id="ed-notes" rows="2" maxlength="500">${esc(cur.notes || '')}</textarea></label>
    ${cur.source && bank.heroes[id] ? `<p class="small muted">Last change: ${esc(cur.source)} · ${new Date(cur.updated).toLocaleString()}</p>` : ''}`;
  const d = openDrawer({
    title: `Edit ${esc(h.name)}`,
    body,
    foot: `${bank.heroes[id] ? '<button class="btn ghost" type="button" data-remove>Remove data</button>' : ''}<button class="btn" type="button" data-cancel>Cancel</button><button class="btn primary" type="button" data-save>Save</button>`,
  });
  const showStars = () => {
    const asc = $('#ed-asc', d).value;
    $('#ed-asc', d).dataset.asc = asc;
    $('#ed-stars', d).disabled = asc !== 'Ascended';
    $('#ed-star-row', d).innerHTML = asc === 'Ascended' ? starRow(toInt($('#ed-stars', d).value), { size: 16 }) : '';
  };
  $('#ed-asc', d).addEventListener('change', showStars);
  $('#ed-stars', d).addEventListener('change', showStars);
  $('#ed-crystal', d)?.addEventListener('change', (e) => {
    $('#ed-level', d).disabled = e.target.checked;
    if (e.target.checked) $('#ed-level', d).value = bank.settings.crystalLevel;
  });
  d.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-cancel]')) closeDrawer();
    else if (ev.target.closest('[data-detail-open]')) {
      closeDrawer();
      openHeroDetail(id);
    } else if (ev.target.closest('[data-remove]')) {
      removeHeroes([id]);
      closeDrawer();
      toast(`Removed ${h.name} from your bank.`);
    } else if (ev.target.closest('[data-save]')) {
      const opt = (sel) => ($(sel, d).value === '' ? null : toInt($(sel, d).value));
      const patch = {
        owned: $('#ed-owned', d).checked,
        asc: $('#ed-asc', d).value,
        stars: toInt($('#ed-stars', d).value),
        si: opt('#ed-si'),
        furniture: opt('#ed-furniture'),
        engrave: opt('#ed-engrave'),
        gear: opt('#ed-gear'),
        notes: $('#ed-notes', d).value,
      };
      const crystalBox = $('#ed-crystal', d);
      if (crystalBox) patch.crystal = crystalBox.checked;
      if (!shared || (crystalBox && !crystalBox.checked)) patch.level = toInt($('#ed-level', d).value, cur.level);
      updateHeroes({ [id]: { ...cur, ...patch } });
      closeDrawer();
      toast(`Saved ${h.name}.`);
    }
  });
}

// ---- import / export ----------------------------------------------------------------

function openExport() {
  const json = exportBank();
  let downloads = null;
  const d = openDrawer({
    title: 'Export hero bank',
    body: `<p class="small">Keep this as a backup or move your bank to another browser with Import.</p><textarea class="input" id="exp-text" rows="16" readonly style="font-family:var(--font-data);font-size:.8rem">${esc(json)}</textarea>`,
    foot: `<button class="btn" type="button" data-dl hidden>Save file</button><button class="btn primary" type="button" data-copy>Copy</button>`,
  });
  if (window.claude?.use) {
    window.claude
      .use('downloads')
      .then((ns) => {
        downloads = ns;
        const b = d.querySelector('[data-dl]');
        if (b && ns) b.hidden = false;
      })
      .catch(() => {});
  }
  d.addEventListener('click', async (ev) => {
    if (ev.target.closest('[data-copy]')) {
      try {
        await navigator.clipboard.writeText(json);
        toast('Copied.');
      } catch {
        $('#exp-text', d).select();
        toast('Select-all is on. Copy with your keyboard.');
      }
    } else if (ev.target.closest('[data-dl]')) {
      try {
        await downloads.save({ filename: `afk-hero-bank-${new Date().toISOString().slice(0, 10)}.json`, data: json });
      } catch {
        toast('The file was not saved.');
      }
    }
  });
}

function openImport() {
  const d = openDrawer({
    title: 'Import hero bank',
    body: `<p class="small">Paste an export from this app, or pick the JSON file. Choose whether it replaces your bank or only updates the heroes it lists.</p>
      <input type="file" id="imp-file" accept="application/json,.json">
      <textarea class="input" id="imp-text" rows="12" placeholder='{"heroes": {"lucius": {"owned": true, "asc": "Ascended", ...}}}' style="font-family:var(--font-data);font-size:.8rem"></textarea>
      <div class="seg" role="group"><button type="button" data-mode="merge" aria-pressed="true">Update listed heroes</button><button type="button" data-mode="replace" aria-pressed="false">Replace my bank</button></div>
      <p class="small" id="imp-msg"></p>`,
    foot: '<button class="btn" type="button" data-cancel>Cancel</button><button class="btn primary" type="button" data-go>Import</button>',
  });
  let mode = 'merge';
  $('#imp-file', d).addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => ($('#imp-text', d).value = String(r.result || ''));
    r.readAsText(f);
  });
  d.addEventListener('click', (ev) => {
    const m = ev.target.closest('[data-mode]');
    if (m) {
      mode = m.dataset.mode;
      $$('[data-mode]', d).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    }
    if (ev.target.closest('[data-cancel]')) closeDrawer();
    if (ev.target.closest('[data-go]')) {
      let parsed;
      try {
        parsed = JSON.parse($('#imp-text', d).value);
      } catch {
        $('#imp-msg', d).textContent = 'This is not valid JSON. Paste the whole export, including the outer braces.';
        return;
      }
      const heroes = parsed?.heroes && typeof parsed.heroes === 'object' ? parsed.heroes : null;
      if (!heroes) {
        $('#imp-msg', d).textContent = 'No "heroes" section found in this file.';
        return;
      }
      const known = Object.fromEntries(Object.entries(heroes).filter(([id]) => data.heroById.has(id)).map(([id, e]) => [id, sanitizeEntry(e)]));
      const skipped = Object.keys(heroes).length - Object.keys(known).length;
      if (mode === 'replace') replaceBank({ settings: parsed.settings, heroes: known });
      else {
        if (parsed.settings) updateSettings(parsed.settings);
        updateHeroes(known, 'import');
      }
      closeDrawer();
      toast(`Imported ${plural(Object.keys(known).length, 'hero')}${skipped ? `, skipped ${skipped} unknown` : ''}.`);
    }
  });
}

// ---- screenshot import -------------------------------------------------------------------

function openUpload() {
  const files = [];
  let results = [];
  let ctl = null;
  const d = openDrawer({
    title: 'Upload hero screenshots',
    wide: true,
    body: `<p class="small">Take screenshots of your hero list and of hero detail screens (the detail screen shows signature item, furniture and engraving). Claude reads each one and proposes updates. Nothing changes until you apply it.</p>
      <div class="callout info small" id="up-avail">Checking whether Claude can read images here…</div>
      <label class="dropzone" id="up-drop" for="up-file">${ICON.upload}<strong>Drop screenshots here, paste them, or choose files</strong><span class="small muted">PNG or JPG · several at once is fine</span>
        <input type="file" id="up-file" accept="image/png,image/jpeg,image/webp" multiple hidden></label>
      <div class="thumbs" id="up-thumbs"></div>
      <div class="toolbar"><button class="btn primary" type="button" data-read disabled>${ICON.spark} Read with Claude</button><button class="btn" type="button" data-stop hidden>${ICON.stop} Stop</button><span class="small muted" id="up-status"></span></div>
      <div class="stream" id="up-stream"></div>
      <div id="up-results"></div>`,
    onClose: () => ctl?.abort(),
  });
  const status = $('#up-status', d);
  const readBtn = $('[data-read]', d);
  const stopBtn = $('[data-stop]', d);

  initAi().then(() => {
    const el = $('#up-avail', d);
    if (aiState.images && !aiState.disabled) {
      el.innerHTML = `Claude can read up to ${aiState.maxImages} screenshot${aiState.maxImages > 1 ? 's' : ''} per pass. It uses your own Claude usage and asks permission the first time.`;
    } else {
      el.innerHTML = `Screenshot reading needs this page open in Claude (claude.ai), where it can pass images to Claude. Here you can still add heroes with <strong>+ I own this</strong>, batch edit, or import a JSON file. You can also send the screenshots to Claude in chat and ask for an import file for this app.`;
    }
    refreshButtons();
  });

  const refreshButtons = () => {
    readBtn.disabled = !files.length || !aiState.images || aiState.disabled;
    readBtn.innerHTML = `${ICON.spark} Read ${files.length || ''} screenshot${files.length === 1 ? '' : 's'} with Claude`;
  };
  const addFiles = (list) => {
    for (const f of list) if (/^image\//.test(f.type) && files.length < 40) files.push(f);
    renderThumbs();
  };
  const renderThumbs = () => {
    $('#up-thumbs', d).innerHTML = files
      .map((f, i) => `<figure><img src="${URL.createObjectURL(f)}" alt=""><figcaption>${esc(f.name || 'pasted image')}</figcaption><button class="rm" type="button" data-rm="${i}" aria-label="Remove">${ICON.close}</button></figure>`)
      .join('');
    refreshButtons();
  };
  $('#up-file', d).addEventListener('change', (e) => addFiles(e.target.files || []));
  const drop = $('#up-drop', d);
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.dataset.over = 'true';
  });
  drop.addEventListener('dragleave', () => (drop.dataset.over = 'false'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.dataset.over = 'false';
    addFiles(e.dataTransfer?.files || []);
  });
  const onPaste = (e) => {
    const items = [...(e.clipboardData?.files || [])];
    if (items.length) addFiles(items);
  };
  d.addEventListener('paste', onPaste);

  d.addEventListener('click', async (ev) => {
    const rm = ev.target.closest('[data-rm]');
    if (rm) {
      ev.preventDefault();
      files.splice(toInt(rm.dataset.rm), 1);
      renderThumbs();
      return;
    }
    if (ev.target.closest('[data-stop]')) {
      ctl?.abort();
      return;
    }
    if (ev.target.closest('[data-apply]')) {
      applyResults(d, results);
      return;
    }
    if (!ev.target.closest('[data-read]')) return;
    results = [];
    const per = Math.max(1, aiState.maxImages || 1);
    const batches = [];
    for (let i = 0; i < files.length; i += per) batches.push(files.slice(i, i + per));
    readBtn.disabled = true;
    stopBtn.hidden = false;
    const notes = [];
    try {
      for (let b = 0; b < batches.length; b++) {
        ctl = new AbortController();
        status.textContent = `Reading batch ${b + 1} of ${batches.length}… (Claude thinks before it answers)`;
        const out = await readScreenshots(batches[b], {
          signal: ctl.signal,
          onText: ({ text }) => ($('#up-stream', d).textContent = text.slice(-240)),
        });
        results.push(...out.heroes);
        if (out.notes) notes.push(out.notes);
      }
      status.textContent = `Found ${results.length} hero readings.`;
    } catch (e) {
      status.textContent = errorCopy(e);
    } finally {
      stopBtn.hidden = true;
      refreshButtons();
      $('#up-stream', d).textContent = '';
    }
    results = mergeReadings(results);
    renderResults(d, results, notes);
  });
}

// One reading per hero: later screenshots fill in fields earlier ones left null.
function mergeReadings(list) {
  const byId = new Map();
  for (const r of list) {
    const prev = byId.get(r.id);
    if (!prev) byId.set(r.id, { ...r });
    else for (const k of ['level', 'asc', 'stars', 'si', 'furniture', 'engrave']) if (r[k] !== null && r[k] !== undefined) prev[k] = r[k];
  }
  return [...byId.values()];
}

const FIELDS = [
  ['asc', 'Ascension'],
  ['stars', 'Stars'],
  ['level', 'Level'],
  ['si', 'SI'],
  ['furniture', 'Furn.'],
  ['engrave', 'Engrave'],
];

function renderResults(d, results, notes) {
  const host = $('#up-results', d);
  if (!results.length) {
    host.innerHTML = notes.length ? `<p class="callout info small">${esc(notes.join(' '))}</p>` : '';
    return;
  }
  // The most common level in the screenshots is the crystal level.
  const counts = {};
  for (const r of results) if (r.level) counts[r.level] = (counts[r.level] || 0) + 1;
  const common = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]) || null;
  const rows = results
    .map((r, i) => {
      const h = getHero(r.id);
      const cur = bank.heroes[r.id];
      const cells = FIELDS.map(([k]) => {
        const v = r[k];
        if (v === null || v === undefined) return `<td class="muted">${cur?.owned ? esc(String(cur[k] ?? '–')) : '–'}</td>`;
        const changed = !cur?.owned || String(cur[k]) !== String(v);
        return `<td class="${changed ? 'diff' : ''}">${esc(String(v))}${changed && cur?.owned ? ` <span class="muted small">was ${esc(String(cur[k] ?? '–'))}</span>` : ''}</td>`;
      }).join('');
      return `<tr><td><input type="checkbox" data-take="${i}" checked aria-label="Apply ${esc(h.name)}"></td>
        <td><span class="hero-cell">${portrait(h, { size: 34 })}${esc(h.name)}</span></td>${cells}
        <td><span class="tag ${r.confidence === 'high' ? 'good' : r.confidence === 'low' ? 'bad' : 'warn'}">${esc(r.confidence)}</span></td>
        <td class="small muted" style="white-space:normal;min-width:160px">${esc(r.seen)}</td></tr>`;
    })
    .join('');
  host.innerHTML = `
    <div class="table-wrap"><table class="bank"><thead><tr><th></th><th>Hero</th>${FIELDS.map(([, l]) => `<th>${l}</th>`).join('')}<th>Confidence</th><th>What Claude saw</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${notes.length ? `<p class="callout info small">${esc(notes.join(' '))}</p>` : ''}
    ${
      bank.settings.sharedLevel && common && common !== bank.settings.crystalLevel
        ? `<label class="check"><input type="checkbox" id="up-crystal" data-level="${common}" checked> Set the shared level to ${common} (was ${bank.settings.crystalLevel})</label>`
        : ''
    }
    <div class="toolbar"><button class="btn primary" type="button" data-apply>Apply checked updates</button><span class="small muted">Empty readings keep what you already have.</span></div>`;
}

function applyResults(d, results) {
  const crystal = $('#up-crystal', d);
  const crystalTo = crystal?.checked ? toInt(crystal.dataset.level) || null : null;
  if (crystalTo) updateSettings({ crystalLevel: crystalTo });
  const patches = {};
  for (const box of $$('[data-take]', d)) {
    if (!box.checked) continue;
    const r = results[toInt(box.dataset.take)];
    const cur = bank.heroes[r.id] || { ...defaultEntry(), owned: false };
    const patch = { ...cur, owned: true };
    for (const [k] of FIELDS) if (r[k] !== null && r[k] !== undefined) patch[k] = r[k];
    // A level that differs from the shared level means the hero sits outside the crystal.
    if (bank.settings.sharedLevel && r.level) patch.crystal = r.level === bank.settings.crystalLevel;
    patches[r.id] = patch;
  }
  const n = Object.keys(patches).length;
  if (n) updateHeroes(patches, 'screenshot');
  closeDrawer();
  toast(n ? `Updated ${plural(n, 'hero')} from screenshots.` : 'Nothing was applied.');
}
