// Top formations (inside the Battles tab): lineups top players field, with no
// opponent, from screenshots (Legends Championship pages, top ranks) or tapped
// in. learn.js turns them into pairs top players put together and where they
// place each hero; the counter and builder use both once there are enough.

import { esc, $, toast } from '../util.js';
import { data, hero as getHero, POSITIONS } from '../data.js';
import { topFormations, addTopFormations, deleteTopFormation, TOP_MAX } from '../store.js';
import { learnTop, LEARN } from '../learn.js';
import { aiState, readTopFormations, errorCopy } from '../ai.js';
import { ICON } from './icons.js';
import { board, pickHero, portrait, heroTile, openDrawer, gameFilterBar, handleGameFilter, syncGameFilter } from './common.js';

const SLOT_LABEL = { F1: 'front, top', F2: 'front, bottom', B1: 'back, top', B2: 'back, middle', B3: 'back, bottom' };

const ui = {
  mode: 'legends-championship',
  pending: [], // formations read from screenshots: {pid, heroes, beast, label}
  reading: null,
  showAll: false,
};
let pid = 0;
let host = null;

const formationIds = (f) => POSITIONS.map((p) => f?.heroes?.[p]).filter((id) => id && getHero(id));

let cache = { key: '', status: null };

// What top formations show so far (learn.js learnTop), recomputed when they change.
export function topStatus() {
  const key = `${topFormations.updatedAt}|${topFormations.items.length}`;
  if (cache.key !== key) cache = { key, status: learnTop(topFormations.items.map((f) => ({ id: f.id, ids: formationIds(f), slots: f.heroes })), data.heroById) };
  return cache.status;
}

// ---- rendering -----------------------------------------------------------------

export function renderTop(el, { shotsOn }) {
  host = el;
  const st = topStatus();
  const modes = data.modes.filter((m) => m.category === 'pvp');
  host.innerHTML = `
    <p class="bt-progress"><b>${st.need ? `${st.n} of ${st.minFormations} top formations: ${st.need} more before the counter uses them.` : `${st.n} top formations. The counter uses them.`}</b></p>
    <p class="small muted">Formations the best players field, with no opponent: Legends Championship pages, top arena ranks, replays. They can't say what beats what, only which heroes top players put together and where they place them. The counter weighs this less than battle results.</p>
    <section class="bt-add">
      <div class="bt-ways">
        <button class="bt-way" type="button" data-top="shot" ${shotsOn ? '' : 'hidden'} ${ui.reading ? 'disabled' : ''}>${ICON.upload}<span><b>${ui.reading ? `Reading ${ui.reading.done} of ${ui.reading.total}…` : 'Add screenshots'}</b><span class="small muted">Pick as many as you like. Claude reads every formation on them; you check and save.</span></span></button>
        <button class="bt-way" type="button" data-top="tap">${ICON.tabBuild}<span><b>Tap in a formation</b><span class="small muted">Tap 5 heroes, front line first. It saves itself.</span></span></button>
      </div>
      <input type="file" id="top-file" accept="image/png,image/jpeg,image/webp" multiple hidden>
      <div class="bt-add-foot">
        <label class="field inline"><span>Mode</span><select class="select" id="top-mode">${modes.map((m) => `<option value="${esc(m.id)}" ${m.id === ui.mode ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
      </div>
    </section>
    <div id="top-pending"></div>
    <div id="top-status"></div>
    <div id="top-list"></div>`;
  renderPending();
  renderStatus(st);
  renderList();
}

function renderPending() {
  const el = $('#top-pending', host);
  if (!el) return;
  if (!ui.pending.length) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `<div class="side-title">${ICON.upload} Read from your screenshots<span class="spacer"></span><span class="small muted">${ui.pending.length}</span></div>
    <p class="small muted">Check each formation. Tap a hero to change it; positions are as Claude read them.</p>
    <div class="bt-list">${ui.pending
      .map(
        (f) => `<article class="result-card bt-item" data-pend="${f.pid}">
        <header><h4>${esc(f.label || 'Formation')}</h4><span class="small muted">${formationIds(f).length} heroes</span></header>
        ${board({ slots: f.heroes, size: 40, editable: true, beast: f.beast })}
        <div class="toolbar"><span class="spacer"></span><button class="btn small ghost" type="button" data-top-del="${f.pid}">${ICON.trash} Remove</button></div>
      </article>`
      )
      .join('')}</div>
    <div class="toolbar"><button class="btn primary" type="button" data-top="saveall">${ICON.save} Save ${ui.pending.length} formation${ui.pending.length === 1 ? '' : 's'}</button>
      <button class="btn ghost" type="button" data-top="dropall">Discard all</button></div>`;
}

function pairCell(a, b) {
  return `<span class="hero-cell">${portrait(getHero(a), { size: 30 })}${portrait(getHero(b), { size: 30 })}<span>${esc(getHero(a)?.name || a)} + ${esc(getHero(b)?.name || b)}</span></span>`;
}

function renderStatus(st) {
  const el = $('#top-status', host);
  if (!el) return;
  const bar = `<div class="bt-bar"><i style="width:${Math.min(100, (st.n / st.minFormations) * 100)}%"></i></div>`;
  const common = st.heroes.slice(0, 8);
  const chips = common.length ? `<div class="chips">${common.map((h) => `<span class="tag">${esc(getHero(h.id)?.name || h.id)} ${Math.round(h.share * 100)}%</span>`).join('')}</div>` : '';
  let body;
  if (!st.on) {
    body = `<p><strong>${st.n} of ${st.minFormations} formations.</strong> Add <strong>${st.need} more</strong> and the counter starts using them.</p>${bar}
      ${chips ? `<p class="small muted">Heroes in the most formations so far:</p>${chips}` : ''}`;
  } else {
    const pairs = st.strong.slice(0, 12);
    const placed = st.heroes.filter((h) => h.n >= LEARN.top.minHeroCount).slice(0, 12);
    body = `<p><strong>On: the counter and builder use what top players field.</strong> Pairs below get a small bonus (at most ${LEARN.top.maxPairPoints} points, under one tier step), and heroes go to the line top players put them in.</p>
      ${
        pairs.length
          ? `<div class="table-wrap"><table class="bank bt-learned"><thead><tr><th>Pair</th><th>Together</th><th>vs chance</th><th>Points</th></tr></thead><tbody>${pairs
              .map((p) => `<tr><td>${pairCell(p.a, p.b)}</td><td class="num">${p.n}×</td><td class="num">${p.lift.toFixed(1)}× as often</td><td class="num bt-up">+${Math.min(LEARN.top.maxPairPoints, p.score * LEARN.top.pointsPerLogLift).toFixed(1)}</td></tr>`)
              .join('')}</tbody></table></div>`
          : `<p class="small muted">No pair stands out yet: none is fielded together at least ${LEARN.top.minPairCount} times and clearly more often than chance.</p>`
      }
      ${
        placed.length
          ? `<p class="small muted">Where top players put their most used heroes (front line share):</p><div class="chips">${placed.map((h) => `<span class="tag">${esc(getHero(h.id)?.name || h.id)} ${Math.round(h.front * 100)}% front</span>`).join('')}</div>`
          : ''
      }`;
  }
  el.innerHTML = `<article class="result-card bt-status ${st.on ? 'on' : ''}"><header><h4>${ICON.spark} What top formations show</h4><span class="score">${st.on ? 'On' : 'Off'}</span></header>${body}</article>`;
}

function renderList() {
  const el = $('#top-list', host);
  if (!el) return;
  const items = topFormations.items;
  const shown = ui.showAll ? items : items.slice(0, 20);
  el.innerHTML = `<div class="side-title">${ICON.trophy} Saved top formations<span class="spacer"></span><span class="small muted">${items.length}${items.length >= TOP_MAX * 0.9 ? ` of ${TOP_MAX} max (the oldest drop off past that)` : ''}</span></div>
    ${
      items.length
        ? `<div class="bt-list top-list">${shown
            .map(
              (f) => `<article class="result-card bt-item"><header><h4>${esc(f.label || data.modeById.get(f.mode)?.name || 'Formation')}</h4><span class="small muted">${esc(new Date(f.at).toLocaleDateString())}</span></header>
            ${board({ slots: f.heroes, size: 36, beast: f.beast && data.beastById?.get(f.beast) ? f.beast : null })}
            <div class="toolbar"><span class="spacer"></span><button class="btn small ghost" type="button" data-top-rm="${esc(f.id)}">${ICON.trash} Delete</button></div></article>`
            )
            .join('')}</div>${items.length > shown.length ? `<div class="toolbar"><button class="btn" type="button" data-top="all">Show all ${items.length}</button></div>` : ''}`
        : '<p class="small muted">None yet. Add screenshots of top players\' formations or tap one in above.</p>'
    }`;
}

// ---- reading and saving ----------------------------------------------------------

const keyOf = (f) => formationIds(f).sort().join(',');

async function readShots(files, rerender) {
  const per = Math.max(1, aiState.maxImages || 1);
  ui.reading = { done: 0, total: files.length };
  rerender();
  let found = 0;
  let skipped = 0;
  let failed = null;
  for (let i = 0; i < files.length; i += per) {
    const group = files.slice(i, i + per);
    try {
      const out = await readTopFormations(group);
      for (const f of out.formations) {
        const item = { pid: ++pid, heroes: f.slots, beast: f.beast, label: f.label };
        // The same formation twice in this batch (two screenshots of one page).
        if (ui.pending.some((p) => keyOf(p) === keyOf(item))) {
          skipped++;
          continue;
        }
        ui.pending.push(item);
        found++;
      }
    } catch (e) {
      failed = e;
      if (e?.code === 'cancelled' || aiState.disabled) break;
    }
    ui.reading.done += group.length;
    rerender();
  }
  ui.reading = null;
  rerender();
  if (failed && !found) toast(errorCopy(failed), 'error');
  else if (!found) toast('No formation found. Use a screenshot that shows the heroes of a lineup.', 'error');
  else toast(`Read ${found} formation${found > 1 ? 's' : ''}${skipped ? ` (skipped ${skipped} shown twice)` : ''}. Check them, then save.`);
}

function saveAll() {
  const ready = ui.pending.filter((f) => formationIds(f).length >= 3);
  if (!ready.length) {
    toast('Each formation needs at least 3 heroes.', 'error');
    return;
  }
  addTopFormations(ready.map((f) => ({ mode: ui.mode, src: 'screenshot', heroes: f.heroes, beast: f.beast, label: f.label })));
  ui.pending = ui.pending.filter((f) => !ready.includes(f));
  const st = topStatus();
  toast(`Saved ${ready.length} formation${ready.length > 1 ? 's' : ''}.${st.need ? ` ${st.need} more to go.` : ''}`);
}

// One picker that stays open: five taps fill the front line, then the back
// line, and save the formation.
function tapIn(rerender) {
  const slots = {};
  let saved = 0;
  const filt = { classes: new Set(), types: new Set(), factions: new Set() };
  const list = data.heroes.slice().sort((a, b) => a.name.localeCompare(b.name));
  const d = openDrawer({
    title: 'Tap in a formation',
    wide: true,
    body: `<div class="qe-head"><div class="qe-teams" id="tf-slots"></div>
      <div class="toolbar"><label class="search">${ICON.search}<input class="input" id="tf-q" type="search" placeholder="Find hero" autocomplete="off"></label>
        <button class="btn" type="button" data-tf="undo">Undo</button>
        <button class="btn primary" type="button" data-tf="save" id="tf-save">${ICON.save} Save</button></div></div>
      ${gameFilterBar(filt)}
      <div class="picker-grid" id="tf-grid"></div>`,
    onClose: () => saved && rerender(),
  });
  const q = $('#tf-q', d);
  const next = () => POSITIONS.find((p) => !slots[p]);
  const head = () => {
    const n = next();
    $('#tf-slots', d).innerHTML = `<div class="qe-row"><span class="bt-tag win">Front</span><div class="qe-slots">${['F1', 'F2'].map(cell).join('')}</div></div>
      <div class="qe-row"><span class="bt-tag lose">Back</span><div class="qe-slots">${['B1', 'B2', 'B3'].map(cell).join('')}</div></div>
      <p class="small muted">${n ? `Next: <b>${SLOT_LABEL[n]}</b>.` : ''}${saved ? ` ${saved} saved so far.` : ''} Tap a hero above to take it out.</p>`;
    $('#tf-save', d).disabled = Object.keys(slots).length < 3;
  };
  const cell = (p) => (slots[p] ? `<button type="button" class="qe-pick" data-tf-rm="${p}" title="Remove ${esc(getHero(slots[p]).name)}">${portrait(getHero(slots[p]), { size: 40 })}</button>` : `<span class="qe-empty" title="${SLOT_LABEL[p]}"></span>`);
  const grid = () => {
    const s = q.value.trim().toLowerCase();
    const used = new Set(Object.values(slots));
    const shown = list.filter(
      (h) =>
        (!s || h.name.toLowerCase().includes(s)) &&
        (!filt.classes.size || filt.classes.has(h.class)) &&
        (!filt.types.size || filt.types.has(h.type)) &&
        (!filt.factions.size || filt.factions.has(h.faction))
    );
    $('#tf-grid', d).innerHTML = shown.length ? shown.map((h) => heroTile(h, { size: 54, badge: used.has(h.id) ? '<span class="qe-badge win">✓</span>' : '' })).join('') : '<p class="small muted">No hero matches.</p>';
  };
  const save = () => {
    addTopFormations([{ mode: ui.mode, src: 'manual', heroes: { ...slots } }]);
    saved++;
    for (const p of POSITIONS) delete slots[p];
    const st = topStatus();
    toast(`Formation saved. ${st.need ? `${st.n} of ${st.minFormations}: ${st.need} more to go.` : `${st.n} saved.`}`);
  };
  const refresh = () => {
    head();
    grid();
  };
  refresh();
  q.addEventListener('input', grid);
  if (!matchMedia('(pointer: coarse)').matches) q.focus();
  d.addEventListener('click', (ev) => {
    if (handleGameFilter(ev, filt)) {
      syncGameFilter(d, filt);
      grid();
      return;
    }
    const rm = ev.target.closest('[data-tf-rm]');
    if (rm) {
      delete slots[rm.dataset.tfRm];
      refresh();
      return;
    }
    const act = ev.target.closest('[data-tf]')?.dataset.tf;
    if (act === 'undo') {
      const last = [...POSITIONS].reverse().find((p) => slots[p]);
      if (last) delete slots[last];
      refresh();
      return;
    }
    if (act === 'save') {
      save();
      refresh();
      return;
    }
    const t = ev.target.closest('[data-hero]');
    if (!t) return;
    const id = t.dataset.hero;
    const at = POSITIONS.find((p) => slots[p] === id);
    if (at) delete slots[at];
    else if (next()) slots[next()] = id;
    if (!next()) save();
    if (q.value) q.value = '';
    refresh();
    if (!matchMedia('(pointer: coarse)').matches) q.focus();
  });
}

// ---- events (called from the Battles tab) ------------------------------------------

export function onTopClick(ev, rerender) {
  const t = ev.target;
  const card = t.closest('[data-pend]');
  const slot = t.closest('[data-slot]');
  if (card && slot) {
    const f = ui.pending.find((x) => x.pid === Number(card.dataset.pend));
    const pos = slot.dataset.slot;
    pickHero({ title: `Hero at ${SLOT_LABEL[pos]}`, allowClear: true, showBank: false }).then((id) => {
      if (id === null || !f) return;
      if (id) {
        for (const p of POSITIONS) if (f.heroes[p] === id) delete f.heroes[p];
        f.heroes[pos] = id;
      } else delete f.heroes[pos];
      renderPending();
    });
    return true;
  }
  const del = t.closest('[data-top-del]');
  if (del) {
    ui.pending = ui.pending.filter((x) => x.pid !== Number(del.dataset.topDel));
    renderPending();
    return true;
  }
  const rm = t.closest('[data-top-rm]');
  if (rm) {
    deleteTopFormation(rm.dataset.topRm);
    toast('Formation deleted.');
    return true;
  }
  const act = t.closest('[data-top]')?.dataset.top;
  if (!act) return false;
  if (act === 'shot') $('#top-file', host).click();
  else if (act === 'tap') tapIn(rerender);
  else if (act === 'saveall') saveAll();
  else if (act === 'dropall') {
    ui.pending = [];
    renderPending();
  } else if (act === 'all') {
    ui.showAll = true;
    renderList();
  }
  return true;
}

export function onTopChange(ev, rerender) {
  const t = ev.target;
  if (t.id === 'top-mode') {
    ui.mode = t.value;
    return true;
  }
  if (t.id === 'top-file') {
    const files = [...(t.files || [])];
    t.value = '';
    if (files.length) readShots(files, rerender);
    return true;
  }
  return false;
}
