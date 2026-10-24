// Shared UI pieces: portraits, foldable panels, formation boards, drawers.

import { esc, local, $ } from '../util.js';
import { data, hero as getHero, POSITIONS, CLASSES, TYPES, FACTION_IDS, starTier } from '../data.js';
import { entry as bankEntry, effectiveLevel, bank } from '../store.js';
import { estimateCR } from '../engine.js';
import { ICON, factionIcon, classIcon, typeIcon, gemStar } from './icons.js';
import { emblem, plusCorners } from './emblem.js';

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

function initials(name) {
  const parts = String(name).replace(/^Awakened\s+/i, 'A ').split(/\s+/);
  return parts.length > 1 ? parts[0][0] + parts[1][0] : String(name).slice(0, 2);
}

export function heroArt(h) {
  const ini = esc(initials(h.name));
  return h.img ? `<img src="${esc(h.img)}" alt="" loading="lazy" draggable="false" data-fallback="${ini}">` : `<span class="initials">${ini}</span>`;
}

// The player's level for a hero; blue when it keeps its own level outside the
// shared (Resonating Crystal) level.
export function levelBadge(h, e, cls, { prefix = false } = {}) {
  const own = bank.settings.sharedLevel && e.crystal === false;
  return `<span class="${cls}${own ? ' own-level' : ''}"${own ? ' title="Own level (outside the shared level)"' : ''}>${prefix ? '<span class="lv-l">Lvl </span>' : ''}${effectiveLevel(h.id)}</span>`;
}

// The hero as the game draws it: ascension frame, the faction emblem with its
// signature item and furniture ornaments top-left, the level top-right and
// the stars on the bottom edge. `e` is the player's copy or an assumed build
// (enemy heroes); without one the frame is plain. `lvl` is the level badge
// and `extra` more markup inside the frame.
export function heroFrame(h, e, { lvl = '', extra = '' } = {}) {
  const owned = !!e?.owned;
  const stars = owned && e.asc === 'Ascended' && starTier(e.stars, e.engrave) ? starRow(e.stars, { title: false, engrave: e.engrave }) : '';
  return `<span class="fr" data-asc="${owned ? esc(e.asc) : ''}"><span class="fr-art">${heroArt(h)}</span>${owned ? plusCorners(e.asc) : ''}${emblem(h, e, { cls: 'fr-fac' })}${
    stars ? `<span class="fr-band">${stars}</span>` : ''
  }${lvl}${extra}</span>`;
}

// A hero in that frame at any size. showBank draws the player's copy; build
// draws an assumed copy at `level` instead. Below 56px the ornaments and the
// level are left out, too small to read.
export function portrait(h, { size = 64, showBank = false, unowned = false, badge = '', build = null, level = null } = {}) {
  if (!h) return '';
  const e = build || (showBank ? bankEntry(h.id) : null);
  const small = size < 56;
  let lvl = '';
  if (e?.owned && !small) lvl = build ? (level ? `<span class="fr-lvl"><span class="lv-l">Lvl </span>${esc(level)}</span>` : '') : levelBadge(h, e, 'fr-lvl', { prefix: true });
  return `<span class="portrait${small ? ' small' : ''}" style="--ps:${size}px"${unowned ? ' data-owned="false"' : ''}>${heroFrame(h, e, { lvl })}${badge ? `<span class="badge-tr">${badge}</span>` : ''}</span>`;
}

// An empty formation slot in the same frame.
export function emptyPortrait(size, label = '') {
  return `<span class="portrait empty${size < 56 ? ' small' : ''}" style="--ps:${size}px"><span class="fr"><span class="fr-art"><span class="initials">${esc(label)}</span></span></span></span>`;
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

// `sub` is a small line under the name (a release date).
export function heroTile(h, { size = 64, badge, showBank = false, attrs = '', sub = '' } = {}) {
  return `<button class="hero-tile" type="button" data-hero="${esc(h.id)}" title="${esc(h.name)} · ${esc(h.faction)} ${esc(h.class)}" ${attrs}>
    ${portrait(h, { size, badge: badge ?? (showBank ? '' : trendBadge(h) || ownedBadge(h.id)), showBank })}
    <span class="name">${esc(h.name)}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}
  </button>`;
}

export function tierPill(t) {
  return t ? `<span class="tierpill" data-tier="${esc(t)}">${esc(t)}</span>` : '<span class="tierpill">–</span>';
}

// ---- stars & ascension -----------------------------------------------------------

// The star row as the game draws it: up to five stars in gold (1–5),
// red (6–10) or white (11–15).
// Stars as the game shows them: 1-5 of them, coloured by engraving.
const ENGRAVE_NAME = { gold: 'below E30', orange: 'E30+', red: 'E60+', white: 'E80+' };
export function starRow(stars, { size = 14, title = true, engrave = null } = {}) {
  const t = starTier(stars, engrave);
  if (!t) return '';
  return `<span class="star-row ${t.tier}" style="--ss:${size}px"${title ? ` title="${t.count} star${t.count === 1 ? '' : 's'}, ${t.tier} (engraving ${ENGRAVE_NAME[t.tier]})"` : ''} aria-label="${t.count} stars, ${t.tier}">${gemStar(t.tier).repeat(t.count)}</span>`;
}

// Estimated combat rating of the player's copy (see estimateCR in engine.js).
export function heroCR(h) {
  return entryCR(bankEntry(h.id), h, effectiveLevel(h.id));
}

// The same for an entry not saved yet (the hero editor's fields).
export function entryCR(e, h, level) {
  return estimateCR(e, h, { level, elderTree: bank.settings.elderTree });
}

// Written the way the game writes power: 19B, 9509M, 512K.
export function fmtCR(n) {
  if (!n) return '–';
  if (n >= 1e10) return `${Math.round(n / 1e9)}B`;
  if (n >= 1e6) return `${Math.round(n / 1e6)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}

export const CR_NOTE = 'Estimated combat rating, from level, ascension, stars, signature item, furniture, engraving, gear and the Elder Tree. Fitted to in-game ratings and to the order of your hero list in the game; upgrades you record later move it up from there.';

// Ascension name coloured like its card frame.
export function ascText(asc) {
  return `<span class="asc-text" data-asc="${esc(asc)}">${esc(asc)}</span>`;
}

// ---- beasts -------------------------------------------------------------------

export function beastArt(id, size = 40) {
  const b = data.beastById?.get(id);
  if (!b) return '';
  return `<img class="beast-img" src="${esc(b.img)}" alt="" loading="lazy" style="width:${size}px;height:${size}px">`;
}

// Beasts join every mode except the ones research says exclude them.
export function beastAllowed(mode) {
  return !mode || !(data.beastSystem?.modesExcluded || []).includes(mode.id);
}

export function beastLine(pick, { owned = true } = {}) {
  if (!pick) return '';
  const b = data.beastById.get(pick.id);
  if (!b) return '';
  return `<div class="beast-pick">${beastArt(b.id, 36)}<div><span class="eyebrow">Beast${owned ? '' : ' (suggested)'}</span><br><strong>${esc(b.name)}</strong>${
    pick.reasons?.length ? ` <span class="small muted">${esc(pick.reasons.slice(0, 2).join(' · '))}</span>` : ''
  }</div></div>`;
}

// ---- formation board (2 front / 3 back) -------------------------------------

// A formation as the game lays it out: the back line of three and the front
// line of two side by side, front toward the enemy. The player's teams face
// right (back left, front right); `mirror` faces left, for the enemy, with the
// beast in the outer top corner. Each line runs top to bottom (F1, F2; B1-B3).
// `build` draws every hero as an assumed copy at `level` (enemy formations);
// `beastEdit` turns the beast corner into a button (data-act="beast") showing
// `beastLevel`.
export function board({ slots = {}, showBank = false, size = 50, editable = false, cls = '', emptyLabel = '+', beast = null, build = null, level = null, beastEdit = false, beastLevel = null, mirror = false } = {}) {
  const cell = (pos) => {
    const id = slots[pos];
    const h = id ? getHero(id) : null;
    if (!h) {
      const inner = `${emptyPortrait(size, editable ? emptyLabel : '')}<span class="name muted">${editable ? 'Add' : 'Open'}</span>`;
      return `<div class="slot empty">${editable ? `<button type="button" data-slot="${pos}" aria-label="Choose hero for ${pos}">${inner}</button>` : inner}</div>`;
    }
    const inner = `${portrait(h, { size, showBank, build, level, badge: showBank || build ? '' : trendBadge(h) })}<span class="name">${esc(h.name)}</span>`;
    return `<div class="slot">${
      editable ? `<button type="button" data-slot="${pos}" aria-label="Change ${esc(h.name)} at ${pos}">${inner}</button>` : `<button type="button" data-hero="${esc(h.id)}">${inner}</button>`
    }</div>`;
  };
  const b = beast ? data.beastById?.get(beast) : null;
  // The beast sits in the corner, like the beast button on the battle screen.
  let beastSlot = '';
  if (beastEdit)
    beastSlot = `<button type="button" class="board-beast${b ? '' : ' no-beast'}" data-act="beast" title="${b ? `Beast: ${esc(b.name)}` : 'Choose the beast'}">${
      b ? beastArt(b.id, 42) : '<span class="beast-add">+</span>'
    }<span>${b ? esc(b.name) : 'Beast'}</span>${b && beastLevel ? `<span class="beast-lvl">Lvl ${esc(beastLevel)}</span>` : ''}</button>`;
  else if (b) beastSlot = `<button type="button" class="board-beast" data-beast-detail="${esc(b.id)}" title="Beast: ${esc(b.name)}">${beastArt(b.id, 42)}<span>${esc(b.name)}</span></button>`;
  return `<div class="board ${cls}${mirror ? ' mirror' : ''}${beastSlot ? ' has-beast' : ''}">
    ${beastSlot}
    <span class="row-label lb">Back</span><span class="row-label lf">${mirror ? '‹ Front' : 'Front ›'}</span>
    <div class="line back">${cell('B1')}${cell('B2')}${cell('B3')}</div>
    <div class="line front">${cell('F1')}${cell('F2')}</div>
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
// showBank draws the player's copies; enemy pickers show the heroes plain.
// The in-game style bar (class, type, faction) narrows the grid like the search.
export function pickHero({ title = 'Choose a hero', pool = null, allowClear = false, showBank = true } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const list = (pool ? pool.map(getHero).filter(Boolean) : data.heroes).slice().sort((a, b) => a.name.localeCompare(b.name));
    const filt = { classes: new Set(), types: new Set(), factions: new Set() };
    const d = openDrawer({
      title: esc(title),
      body: `<div class="toolbar"><label class="search">${ICON.search}<input class="input" id="pick-q" type="search" placeholder="Find hero" autocomplete="off"></label>
        ${allowClear ? '<button class="btn" type="button" data-clear>Clear slot</button>' : ''}</div>
        ${gameFilterBar(filt)}
        <div class="picker-grid" id="pick-grid"></div>`,
      onClose: () => !done && resolve(null),
    });
    const grid = $('#pick-grid', d);
    const q = $('#pick-q', d);
    const render = () => {
      const s = q.value.trim().toLowerCase();
      const shown = list.filter(
        (h) =>
          (!s || h.name.toLowerCase().includes(s) || h.faction.toLowerCase().includes(s) || h.class.toLowerCase().includes(s)) &&
          (!filt.classes.size || filt.classes.has(h.class)) &&
          (!filt.types.size || filt.types.has(h.type)) &&
          (!filt.factions.size || filt.factions.has(h.faction))
      );
      grid.innerHTML = shown.length ? shown.map((h) => heroTile(h, { size: 54, showBank })).join('') : '<p class="small muted">No hero matches.</p>';
    };
    render();
    q.addEventListener('input', render);
    // On touch screens the keyboard would cover the filter bar.
    if (!matchMedia('(pointer: coarse)').matches) q.focus();
    d.addEventListener('click', (ev) => {
      if (handleGameFilter(ev, filt)) {
        syncGameFilter(d, filt);
        render();
        return;
      }
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

// Beast picker, best rated first. Resolves with a beast id, '' to clear, or null.
export function pickBeast({ title = 'Choose a beast', allowClear = false, category = 'pvp' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const RANK = ['S+', 'S', 'A', 'B', 'C', 'D'];
    const rank = (b) => {
      const i = RANK.indexOf(b.tiers?.[category] || b.tiers?.overall);
      return i < 0 ? RANK.length : i;
    };
    const list = (data.beasts || []).slice().sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    const d = openDrawer({
      title: esc(title),
      body: `${allowClear ? '<div class="toolbar"><button class="btn small" type="button" data-clear>No beast</button></div>' : ''}
        <div class="picker-grid">${list
          .map((b) => `<button class="hero-tile" type="button" data-beast-pick="${esc(b.id)}" title="${esc(b.name)}">${beastArt(b.id, 56)}<span class="name">${esc(b.name)}</span>${tierPill(b.tiers?.[category] || b.tiers?.overall)}</button>`)
          .join('')}</div>`,
      onClose: () => !done && resolve(null),
    });
    d.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-beast-pick]');
      if (t || ev.target.closest('[data-clear]')) {
        done = true;
        closeDrawer();
        resolve(t ? t.dataset.beastPick : '');
      }
    });
  });
}

export function classLabel(c) {
  return `<span class="tag">${classIcon(c)} ${esc(c)}</span>`;
}

export function typeLabel(t) {
  return t ? `<span class="tag">${typeIcon(t)} ${esc(t)}</span>` : '';
}

export function factionLabel(f) {
  return `<span class="tag">${factionIcon(f)} ${esc(f)}</span>`;
}

// ---- in-game style filter bar: classes, types, factions -----------------

const FILTER_ROWS = [
  { key: 'classes', label: 'Class', values: CLASSES, icon: classIcon },
  { key: 'types', label: 'Type', values: TYPES, icon: typeIcon },
  { key: 'factions', label: 'Faction', values: FACTION_IDS, icon: factionIcon },
];

// `state` holds a Set per row (classes, types, factions). An empty set means
// ALL. Several icons in one row can be on at once.
export function gameFilterBar(state) {
  return `<div class="gamebar" role="group" aria-label="Filter heroes">${FILTER_ROWS.map((r) => {
    const set = state[r.key];
    return `<div class="row" role="group" aria-label="${r.label}" data-active="${set.size > 0}">
      <button type="button" class="gbtn all" data-gf-all="${r.key}" aria-pressed="${set.size === 0}" title="All ${r.label.toLowerCase()}s">ALL</button>
      ${r.values.map((v) => `<button type="button" class="gbtn" data-gf="${r.key}" data-gv="${esc(v)}" aria-pressed="${set.has(v)}" title="${esc(v)}" aria-label="${esc(v)}">${r.icon(v)}</button>`).join('')}
    </div>`;
  }).join('')}</div>`;
}

// Handles a click inside the bar. Returns true when it changed the state.
export function handleGameFilter(ev, state) {
  const all = ev.target.closest('[data-gf-all]');
  if (all) {
    state[all.dataset.gfAll].clear();
    return true;
  }
  const b = ev.target.closest('[data-gf]');
  if (!b) return false;
  const set = state[b.dataset.gf];
  const v = b.dataset.gv;
  if (set.has(v)) set.delete(v);
  else set.add(v);
  return true;
}

export function syncGameFilter(root, state) {
  for (const row of root.querySelectorAll('.gamebar .row')) {
    const key = row.querySelector('[data-gf-all]').dataset.gfAll;
    const set = state[key];
    row.dataset.active = String(set.size > 0);
    row.querySelector('[data-gf-all]').setAttribute('aria-pressed', String(set.size === 0));
    for (const b of row.querySelectorAll('[data-gf]')) b.setAttribute('aria-pressed', String(set.has(b.dataset.gv)));
  }
}
