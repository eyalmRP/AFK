// Shared UI pieces: portraits, foldable panels, formation boards, drawers.

import { esc, local, $ } from '../util.js';
import { data, hero as getHero, POSITIONS } from '../data.js';
import { entry as bankEntry, effectiveLevel } from '../store.js';
import { ICON, factionIcon, classIcon } from './icons.js';

// ---- fold state ------------------------------------------------------------

const FOLD_KEY = 'afk-codex-folds-v1';
const folds = local.get(FOLD_KEY, {}) || {};

export function isFolded(id, dflt = false) {
  return id in folds ? folds[id] : dflt;
}

export function setFolded(id, value) {
  folds[id] = value;
  local.set(FOLD_KEY, folds);
}

// Any element with [data-fold-id] and a child [data-fold-toggle] folds.
export function bindFolding(root) {
  root.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-fold-toggle]');
    if (!t || ev.target.closest('[data-no-fold]')) return;
    const box = t.closest('[data-fold-id]');
    if (!box || !root.contains(box)) return;
    const next = box.dataset.folded !== 'true';
    box.dataset.folded = String(next);
    t.setAttribute('aria-expanded', String(!next));
    setFolded(box.dataset.foldId, next);
  });
  root.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const t = ev.target.closest('[data-fold-toggle][role="button"]');
    if (!t) return;
    ev.preventDefault();
    t.click();
  });
}

export function foldAll(root, folded) {
  for (const box of root.querySelectorAll('[data-fold-id]')) {
    box.dataset.folded = String(folded);
    box.querySelector('[data-fold-toggle]')?.setAttribute('aria-expanded', String(!folded));
    setFolded(box.dataset.foldId, folded);
  }
}

export function panel({ id, title, sub = '', body, actions = '', folded = false, cls = '' }) {
  const f = isFolded(id, folded);
  return `<section class="panel ${cls}" data-fold-id="${esc(id)}" data-folded="${f}">
    <div class="panel-head" data-fold-toggle role="button" tabindex="0" aria-expanded="${!f}">
      ${ICON.chevron}<h3>${title}</h3>${sub ? `<span class="sub">${sub}</span>` : ''}
      ${actions ? `<div class="actions" data-no-fold>${actions}</div>` : ''}
    </div>
    <div class="panel-body">${body}</div>
  </section>`;
}

// ---- hero portraits ----------------------------------------------------------

export function facClass(f) {
  return 'fac-' + String(f || 'dimensional').toLowerCase();
}

function initials(name) {
  const parts = String(name).replace(/^Awakened\s+/i, 'A ').split(/\s+/);
  return parts.length > 1 ? parts[0][0] + parts[1][0] : String(name).slice(0, 2);
}

export function portrait(h, { size = 64, showBank = false, unowned = false, badge = '' } = {}) {
  if (!h) return '';
  const e = showBank ? bankEntry(h.id) : null;
  const asc = e?.owned ? e.asc : '';
  const stars = e?.owned && e.asc === 'Ascended' && e.stars ? Array.from({ length: e.stars }, () => ICON.star).join('') : '';
  const img = h.img
    ? `<img src="${esc(h.img)}" alt="" loading="lazy" data-fallback="${esc(initials(h.name))}">`
    : `<span class="initials">${esc(initials(h.name))}</span>`;
  return `<span class="portrait ${facClass(h.faction)}${unowned ? ' unowned' : ''}" style="--ps:${size}px" data-asc="${esc(asc)}">
    <span class="art">${img}</span>
    <span class="fac" title="${esc(h.faction)}">${factionIcon(h.faction)}</span>
    ${badge ? `<span class="badge-tr">${badge}</span>` : ''}
    ${stars ? `<span class="stars">${stars}</span>` : ''}
    ${e?.owned ? `<span class="lvl">${effectiveLevel(h.id)}</span>` : ''}
  </span>`;
}

// Replace broken portrait images with initials.
export function bindImageFallback(root) {
  root.addEventListener(
    'error',
    (ev) => {
      const img = ev.target;
      if (img?.tagName !== 'IMG' || !img.dataset.fallback) return;
      const span = document.createElement('span');
      span.className = 'initials';
      span.textContent = img.dataset.fallback;
      img.replaceWith(span);
    },
    true
  );
}

export function trendBadge(h) {
  if (h.isNew || h.trend === 'new') return '<span class="trend new" title="Released in the last year">NEW</span>';
  if (h.trend === 'rising') return '<span class="trend rising" title="Rising in the meta">▲</span>';
  if (h.trend === 'falling') return '<span class="trend falling" title="Falling in the meta">▼</span>';
  return '';
}

export function ownedBadge(id) {
  return bankEntry(id)?.owned ? `<span class="owned-mark" title="In your hero bank">${ICON.check}</span>` : '';
}

export function heroTile(h, { size = 64, badge, showBank = false, attrs = '' } = {}) {
  return `<button class="hero-tile" type="button" data-hero="${esc(h.id)}" title="${esc(h.name)} · ${esc(h.faction)} ${esc(h.class)}" ${attrs}>
    ${portrait(h, { size, badge: badge ?? (trendBadge(h) || ownedBadge(h.id)), showBank })}
    <span class="name">${esc(h.name)}</span>
  </button>`;
}

export function tierPill(t) {
  return t ? `<span class="tierpill" data-tier="${esc(t)}">${esc(t)}</span>` : '<span class="tierpill">–</span>';
}

export function artifactName(id) {
  return data.artifactById.get(id)?.name || id;
}

function artInitials(name) {
  return String(name)
    .replace(/^Dura's\s+/i, '')
    .split(/\s+/)
    .filter((w) => !/^(of|the)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
}

export function artifactGlyph(name) {
  return `<span class="artifact-glyph" aria-hidden="true">${esc(artInitials(name))}</span>`;
}

export function artifactChip(id) {
  if (!id) return '';
  const name = artifactName(id);
  return `<span class="art-chip" title="${esc(name)}">${artifactGlyph(name)}<span>${esc(name.replace(/^Dura's\s+/i, ''))}</span></span>`;
}

// ---- formation board (2 front / 3 back) -------------------------------------

export function board({ slots = {}, artifacts = {}, showBank = false, size = 56, editable = false, cls = '', emptyLabel = '+' } = {}) {
  const cell = (pos) => {
    const id = slots[pos];
    const h = id ? getHero(id) : null;
    if (!h) {
      const inner = `<span class="portrait" style="--ps:${size}px"><span class="art"><span class="initials">${editable ? emptyLabel : ''}</span></span></span><span class="name muted">${editable ? 'Add' : 'Open'}</span>`;
      return `<div class="slot empty"><span class="pos">${pos}</span>${editable ? `<button type="button" data-slot="${pos}" aria-label="Choose hero for ${pos}">${inner}</button>` : inner}</div>`;
    }
    const inner = `${portrait(h, { size, showBank, badge: showBank ? '' : trendBadge(h) })}<span class="name">${esc(h.name)}</span>`;
    return `<div class="slot"><span class="pos">${pos}</span>${
      editable ? `<button type="button" data-slot="${pos}" aria-label="Change ${esc(h.name)} at ${pos}">${inner}</button>` : `<button type="button" data-hero="${esc(h.id)}">${inner}</button>`
    }${artifacts[id] ? artifactChip(artifacts[id]) : ''}</div>`;
  };
  return `<div class="board ${cls}">
    <span class="row-label">Front</span>
    <div class="row">${cell('F1')}${cell('F2')}</div>
    <span class="row-label">Back</span>
    <div class="row">${cell('B1')}${cell('B2')}${cell('B3')}</div>
  </div>`;
}

export function slotsFromList(list) {
  const slots = {};
  for (const x of list || []) if (x?.pos && x?.id) slots[x.pos] = x.id;
  // Teams recorded without positions: fill in order.
  const missing = (list || []).filter((x) => x?.id && !x.pos);
  for (const x of missing) {
    const free = POSITIONS.find((p) => !slots[p]);
    if (free) slots[free] = x.id;
  }
  return slots;
}

// ---- drawer / modal ------------------------------------------------------------

let openDrawerEl = null;

export function openDrawer({ title, body, foot = '', wide = false, onClose } = {}) {
  closeDrawer();
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const d = document.createElement('aside');
  d.className = 'drawer' + (wide ? ' wide' : '');
  d.setAttribute('role', 'dialog');
  d.setAttribute('aria-modal', 'true');
  d.innerHTML = `<div class="drawer-head"><h3>${title}</h3><button class="btn ghost small" type="button" data-close aria-label="Close">${ICON.close}</button></div>
    <div class="drawer-body">${body}</div>${foot ? `<div class="drawer-foot">${foot}</div>` : ''}`;
  document.body.append(scrim, d);
  const close = () => closeDrawer();
  scrim.addEventListener('click', close);
  d.querySelector('[data-close]').addEventListener('click', close);
  const onKey = (ev) => ev.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  openDrawerEl = { scrim, d, onKey, onClose };
  d.querySelector('[data-close]').focus();
  return d;
}

export function closeDrawer() {
  if (!openDrawerEl) return;
  const { scrim, d, onKey, onClose } = openDrawerEl;
  openDrawerEl = null;
  scrim.remove();
  d.remove();
  document.removeEventListener('keydown', onKey);
  onClose?.();
}

// Searchable hero picker. Resolves with a hero id, '' to clear, or null.
export function pickHero({ title = 'Choose a hero', pool = null, allowClear = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const list = (pool ? pool.map(getHero).filter(Boolean) : data.heroes).slice().sort((a, b) => a.name.localeCompare(b.name));
    const d = openDrawer({
      title: esc(title),
      body: `<div class="toolbar"><label class="search">${ICON.search}<input class="input" id="pick-q" type="search" placeholder="Find hero" autocomplete="off"></label>
        ${allowClear ? '<button class="btn small" type="button" data-clear>Clear slot</button>' : ''}</div>
        <div class="picker-grid" id="pick-grid"></div>`,
      onClose: () => !done && resolve(null),
    });
    const grid = $('#pick-grid', d);
    const render = (q = '') => {
      const s = q.trim().toLowerCase();
      grid.innerHTML = list
        .filter((h) => !s || h.name.toLowerCase().includes(s) || h.faction.toLowerCase().includes(s) || h.class.toLowerCase().includes(s))
        .map((h) => heroTile(h, { size: 54, showBank: true }))
        .join('');
    };
    render();
    $('#pick-q', d).addEventListener('input', (e) => render(e.target.value));
    $('#pick-q', d).focus();
    d.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-hero]');
      if (t) {
        done = true;
        closeDrawer();
        resolve(t.dataset.hero);
      } else if (ev.target.closest('[data-clear]')) {
        done = true;
        closeDrawer();
        resolve('');
      }
    });
  });
}

export function classLabel(c) {
  return `<span class="tag">${classIcon(c).replace('<svg', '<svg width="12" height="12"')} ${esc(c)}</span>`;
}
