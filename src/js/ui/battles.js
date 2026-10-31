// Battles tab: a log of battles the player saw, theirs or other players'
// (arena records, Legends Championship replays): who won, who lost, and their
// levels and beasts when known. Three ways in, quickest first: a batch of
// screenshots Claude reads, tapping in ten heroes, or the full form. The
// counter uses results in the log against a lineup straight away (they're
// facts); what learn.js generalises from the log (which heroes win more or
// less than power and tiers predict) only once it proves itself on battles it
// wasn't fitted on.

import { esc, $, toast } from '../util.js';
import { data, hero as getHero, POSITIONS, LIMITS, ASSUMED_BUILDS, BEAST_BUFF_TOTAL, assumedEntry } from '../data.js';
import { bank, battles, addBattle, addBattles, updateBattle, deleteBattle, BATTLES_MAX } from '../store.js';
import { learnBattles, learnedPairs, learnedTraits, topPairs, topPositions, LEARN } from '../learn.js';
import { aiState, initAi, readBattleScreenshots, errorCopy } from '../ai.js';
import { ICON } from './icons.js';
import { board, pickHero, pickBeast, portrait, heroTile, entryCR, heroCR, fmtCR, playerLevel, beastAllowed, openDrawer, gameFilterBar, handleGameFilter, syncGameFilter } from './common.js';
import { openHeroDetail } from './heroDetail.js';
import { openBeastDetail } from './beastDetail.js';
import { topStatus, renderTop, onTopClick, onTopChange } from './topFormations.js';

const BUILDS = [...Object.entries(ASSUMED_BUILDS).map(([k, b]) => [k, b.label]), ['mine', 'My bank copies (where owned)']];
const emptySide = () => ({ heroes: {}, level: null, build: 'max', beast: null, beastLevel: 18 });

const ui = {
  view: 'battles', // battles | top (top players' formations)
  mode: 'arena-of-heroes',
  // The full form (levels, upgrades, beasts): open when asked for, or to edit.
  form: false,
  win: emptySide(),
  lose: emptySide(),
  editing: null, // id of the logged battle being edited
  fixing: null, // id of the read battle being fixed in the form
  pending: [], // battles read from screenshots, waiting to be saved: {pid, a, b, winner: 'a'|'b'|null, mode, seen}
  reading: null, // {done, total} while screenshots are being read
  dupeOk: false,
  showAll: false,
};

let root;
let pid = 0;

// ---- shared with the counter -------------------------------------------------

const sideIds = (side) => POSITIONS.map((p) => side?.heroes?.[p]).filter((id) => id && getHero(id));

// Combined power of a logged team: the assumed build at its level, or the
// player's copies as saved (heroes they don't own count at the best build).
export function sidePower(side) {
  const ids = sideIds(side);
  const level = side.level ?? playerLevel();
  if (side.build === 'mine') return side.power || minePower(ids, level);
  const e = assumedEntry(side.build);
  return ids.reduce((t, id) => t + entryCR(e, getHero(id), level), 0);
}

function minePower(ids, level) {
  const best = assumedEntry('max');
  return ids.reduce((t, id) => t + (bank.heroes[id]?.owned ? heroCR(getHero(id)) : entryCR(best, getHero(id), level)), 0);
}

export const learnSide = (side) => ({ ids: sideIds(side), power: sidePower(side), beastLevel: side.beast ? side.beastLevel ?? null : null });

let cache = { key: '', status: null };

// What the log has taught so far (learn.js), recomputed when the log or the bank changes.
export function logStatus() {
  const key = `${battles.updatedAt}|${battles.items.length}|${bank.updatedAt}`;
  if (cache.key !== key) cache = { key, status: learnBattles(battles.items.map((b) => ({ id: b.id, win: learnSide(b.win), lose: learnSide(b.lose) })), data.heroById) };
  return cache.status;
}

// The log as facts for the counter (engine.js makeContext records).
export function battleRecords() {
  return battles.items.map((b) => ({ id: b.id, date: new Date(b.at).toISOString().slice(0, 10), mode: b.mode, win: sideIds(b.win), lose: sideIds(b.lose), winBeast: b.win.beast, loseBeast: b.lose.beast, winPower: sidePower(b.win), losePower: sidePower(b.lose) }));
}

// The team-level lessons for makeContext (engine.js learnedTeam): from the
// battle log, team makeup against this enemy (needs one) and pairs; from top
// formations, the pairs top players field and where they place heroes. Each
// part is null until it has proved itself or has enough formations.
export function learnedTeamFor(enemyIds = []) {
  const st = logStatus();
  const top = topStatus();
  const out = {
    traits: learnedTraits(st, enemyIds, data.heroById),
    pairs: learnedPairs(st),
    topPairs: topPairs(top),
    positions: topPositions(top),
  };
  return Object.values(out).some(Boolean) ? out : null;
}

const LAYER_NAMES = { traits: 'team makeup', heroes: 'single heroes', pairs: 'hero pairs' };

// "From your logs: ..." for a scored team (engine.js scoreTeam learned).
export function learnedLine(learned) {
  if (!learned) return '';
  const name = (id) => getHero(id)?.name || id;
  const bits = [];
  for (const w of learned.why || []) bits.push(`${w.label} ${w.points > 0 ? 'helps' : 'hurts'} against this enemy (${w.points > 0 ? '+' : ''}${w.points.toFixed(1)})`);
  for (const p of learned.pairs || []) bits.push(`${name(p.a)} + ${name(p.b)} ${p.points > 0 ? 'win more' : 'win less'} together (${p.w}–${p.l} in ${p.n} battles)`);
  for (const t of learned.top || []) bits.push(`top players field ${name(t.a)} + ${name(t.b)} together ${t.lift.toFixed(1)}× as often as chance (${t.n} formations)`);
  return bits.length ? `<p class="small"><span class="muted">From your logs:</span> ${esc(bits.join(' · '))}</p>` : '';
}

// One line for the counter about the learned part.
export function logLine(st = logStatus()) {
  if (st.active) {
    const on = Object.entries(st.layers).filter(([, l]) => l.on).map(([k]) => LAYER_NAMES[k]);
    return `Your battle log (${st.n} battles) is on for ${on.join(', ')}: it adjusts teams that win more or less than power and tiers predict.`;
  }
  if (st.need) return `Battle log: ${st.n} of ${st.minBattles} battles. The learned part stays off until ${st.minBattles}: add ${st.need} more in the Battles tab (any battles you see, not only yours).`;
  return `Battle log: ${st.n} battles, the learned part is still off (it doesn't beat power and tiers yet on battles it hasn't seen). Keep adding battles.`;
}

// ---- tab ---------------------------------------------------------------------

export function mountBattles(el) {
  root = el;
  if (!data.modeById.has(ui.mode)) ui.mode = pvpModes()[0]?.id || null;
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  render();
}

export function refreshBattles() {
  if (root) render();
}

const pvpModes = () => data.modes.filter((m) => m.category === 'pvp');
const shotsOn = () => aiState.images && !aiState.disabled;

function render() {
  const head = `<div class="view-head"><div><p class="eyebrow">Teach the counter</p><h2>Battle log</h2>
      <p>Log any battle you see, yours or other players' (arena records, Legends Championship replays): just the two teams and who won. Top players' formations, without opponents, teach which heroes go together. The more you log, the more the counter learns.</p></div></div>
    <div class="seg bt-views" role="tablist" aria-label="What to log">
      <button type="button" role="tab" data-view="battles" aria-selected="${ui.view === 'battles'}" aria-pressed="${ui.view === 'battles'}">Battles <span class="count">${battles.items.length || ''}</span></button>
      <button type="button" role="tab" data-view="top" aria-selected="${ui.view === 'top'}" aria-pressed="${ui.view === 'top'}">Top formations <span class="count">${topStatus().n || ''}</span></button>
    </div>`;
  if (ui.view === 'top') {
    root.innerHTML = `${head}<div id="bt-top"></div>`;
    renderTop($('#bt-top', root), { shotsOn: shotsOn() });
    initAi().then(() => {
      const b = $('[data-top="shot"]', root);
      if (b) b.hidden = !shotsOn();
    });
    return;
  }
  root.innerHTML = `${head}
    <p class="bt-progress"><b>${progressText()}</b></p>
    <section class="bt-add">
      <div class="bt-ways">
        <button class="bt-way" type="button" data-act="shot" id="bt-shot" ${shotsOn() ? '' : 'hidden'} ${ui.reading ? 'disabled' : ''}>${ICON.upload}<span><b>${ui.reading ? `Reading ${ui.reading.done} of ${ui.reading.total}…` : 'Add screenshots'}</b><span class="small muted">Pick as many as you like: Victory or Defeat screens, their stats, battle records or replays. Claude reads them; you confirm.</span></span></button>
        <button class="bt-way" type="button" data-act="tap">${ICON.tabBuild}<span><b>Tap in a battle</b><span class="small muted">Tap the 5 heroes that won, then the 5 that lost. It saves itself.</span></span></button>
      </div>
      <input type="file" id="bt-file" accept="image/png,image/jpeg,image/webp" multiple hidden>
      <div class="bt-add-foot">
        <label class="field inline"><span>Mode</span><select class="select" id="bt-mode">${pvpModes()
          .map((m) => `<option value="${esc(m.id)}" ${m.id === ui.mode ? 'selected' : ''}>${esc(m.name)}</option>`)
          .join('')}</select></label>
        <button class="btn ghost small" type="button" data-act="form" aria-expanded="${ui.form || !!ui.editing || !!ui.fixing}">${ICON.edit} ${ui.form || ui.editing || ui.fixing ? 'Hide the full form' : 'Full form: levels, upgrades, beasts'}</button>
      </div>
      <p class="small muted">Without levels, both teams count as the same level and fully built. Positions don't matter for learning.</p>
    </section>
    <div id="bt-pending"></div>
    ${ui.form || ui.editing || ui.fixing ? formBlock() : ''}
    <div id="bt-status"></div>
    <div id="bt-history"></div>`;
  renderPending();
  renderStatus();
  renderHistory();
  initAi().then(() => {
    const b = $('#bt-shot', root);
    if (b) b.hidden = !shotsOn();
  });
}

// One line on where the log stands, for the top of the tab.
function progressText(st = logStatus()) {
  if (st.active) return `${st.n} battles logged. Learning is on for ${Object.entries(st.layers).filter(([, l]) => l.on).map(([k]) => LAYER_NAMES[k]).join(', ')}.`;
  if (st.need) return `${st.n} of ${st.minBattles} battles logged: ${st.need} more before it starts learning.`;
  return `${st.n} battles logged. Learning switches on once it predicts better than power and tiers (details below).`;
}

// ---- screenshots: read, review, save ------------------------------------------

const sideFromRead = (x) => ({ ...emptySide(), heroes: x.slots, level: x.level, beast: x.beast, beastLevel: x.beastLevel ?? 18 });
const setKey = (side) => sideIds(side).sort().join(',');

async function readShots(files) {
  const per = Math.max(1, aiState.maxImages || 1);
  const groups = [];
  for (let i = 0; i < files.length; i += per) groups.push(files.slice(i, i + per));
  ui.reading = { done: 0, total: files.length };
  render();
  let found = 0;
  let twice = 0; // the same battle on two screenshots (its result and its stats)
  let logged = 0; // already in the log from today
  let failed = null;
  for (const g of groups) {
    try {
      const out = await readBattleScreenshots(g);
      for (const b of out.battles) {
        const item = { pid: ++pid, a: sideFromRead(b.left), b: sideFromRead(b.right), winner: b.winner === 'right' ? 'b' : b.winner === 'left' ? 'a' : null, mode: b.mode || ui.mode, seen: b.seen };
        // The same battle twice (its result screen and its stats), or one already logged today.
        const k = [setKey(item.a), setKey(item.b)].sort().join('|');
        if (battles.items.some((x) => Date.now() - x.at < 864e5 && [setKey(x.win), setKey(x.lose)].sort().join('|') === k)) {
          logged++;
          continue;
        }
        if (ui.pending.some((p) => [setKey(p.a), setKey(p.b)].sort().join('|') === k)) {
          twice++;
          continue;
        }
        ui.pending.push(item);
        found++;
      }
    } catch (e) {
      failed = e;
      if (e?.code === 'cancelled' || aiState.disabled) break;
    }
    ui.reading.done += g.length;
    render();
  }
  ui.reading = null;
  render();
  const skipped = [twice ? `${twice} shown twice` : '', logged ? `${logged} already in your log` : ''].filter(Boolean).join(', ');
  if (failed && !found) toast(errorCopy(failed), 'error');
  else if (!found) toast(logged ? 'Those battles are already in your log.' : 'No battle found. Use a Victory or Defeat screen, its stats, or a battle record.', 'error');
  else toast(`Read ${found} battle${found > 1 ? 's' : ''}${skipped ? ` (skipped ${skipped})` : ''}. Check who won, then save.`);
  $('#bt-pending', root)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function teamTag(p, k) {
  if (!p.winner) return `<button class="btn small" type="button" data-pwin="${p.pid}:${k}">${ICON.trophy} This team won</button>`;
  return p.winner === k ? '<span class="bt-tag win">Won</span>' : '<span class="bt-tag lose">Lost</span>';
}

function sideMeta(s) {
  const bits = [s.level ? `Lvl ${s.level}` : 'level not shown', s.beast ? data.beastById?.get(s.beast)?.name : ''].filter(Boolean);
  return `<span class="small muted">${esc(bits.join(' · '))}</span>`;
}

function renderPending() {
  const host = $('#bt-pending', root);
  if (!host) return;
  const list = ui.pending;
  if (!list.length) {
    host.innerHTML = '';
    return;
  }
  const ready = list.filter((p) => p.winner).length;
  const waiting = list.length - ready;
  host.innerHTML = `<div class="side-title">${ICON.upload} Read from your screenshots<span class="spacer"></span><span class="small muted">${list.length}</span></div>
    <p class="small muted">Check who won: <b>Flip</b> if it's the other way round, <b>Fix</b> if a hero is wrong.${waiting ? ` <b>${waiting}</b> need you to pick the winner.` : ''}</p>
    <div class="bt-list">${list
      .map(
        (p) => `<article class="result-card bt-item${p.winner ? '' : ' unsure'}">
        <div class="bt-vs">
          <div><p class="bt-meta">${teamTag(p, 'a')}${sideMeta(p.a)}</p>${board({ slots: p.a.heroes, size: 36, beast: p.a.beast })}</div>
          <div><p class="bt-meta">${teamTag(p, 'b')}${sideMeta(p.b)}</p>${board({ slots: p.b.heroes, size: 36, mirror: true, beast: p.b.beast })}</div>
        </div>
        <div class="toolbar">${p.winner ? '' : '<span class="small bt-ask">The screenshot doesn\'t say who won.</span>'}${p.seen && p.winner ? `<span class="small muted">${esc(p.seen)}</span>` : ''}<span class="spacer"></span>
          <button class="btn small" type="button" data-pflip="${p.pid}" ${p.winner ? '' : 'disabled'}>${ICON.flip} Flip</button>
          <button class="btn small" type="button" data-pfix="${p.pid}">${ICON.edit} Fix</button>
          <button class="btn small ghost" type="button" data-pdel="${p.pid}">${ICON.trash} Remove</button></div>
      </article>`
      )
      .join('')}</div>
    <div class="toolbar"><button class="btn primary" type="button" data-act="saveall" ${ready ? '' : 'disabled'}>${ICON.save} Save ${ready === list.length ? 'all ' : ''}${ready} battle${ready === 1 ? '' : 's'}</button>
      <button class="btn ghost" type="button" data-act="dropall">Discard all</button>${waiting && ready ? `<span class="small muted">${waiting} without a winner stay here.</span>` : ''}</div>`;
}

const asLogged = (p) => {
  const [w, l] = p.winner === 'a' ? [p.a, p.b] : [p.b, p.a];
  const side = (s) => ({ heroes: { ...s.heroes }, level: s.level ?? playerLevel(), build: 'max', beast: s.beast || null, beastLevel: s.beast ? s.beastLevel : null });
  return { mode: p.mode || ui.mode, src: 'screenshot', win: side(w), lose: side(l) };
};

function saveAll() {
  const ready = ui.pending.filter((p) => p.winner && sideIds(p.a).length >= 3 && sideIds(p.b).length >= 3);
  const short = ui.pending.filter((p) => p.winner && !ready.includes(p)).length;
  if (!ready.length) {
    toast('Each team needs at least 3 heroes: use Fix to add them.', 'error');
    return;
  }
  addBattles(ready.map(asLogged));
  ui.pending = ui.pending.filter((p) => !ready.includes(p));
  const st = logStatus();
  toast(`Saved ${ready.length} battle${ready.length > 1 ? 's' : ''}.${short ? ` ${short} with fewer than 3 heroes a side stay here to fix.` : ''} ${st.need ? `${st.need} more to go.` : ''}`);
}

// ---- tap in a battle -----------------------------------------------------------

// One picker that stays open: the first five heroes tapped won, the next five
// lost. Ten taps save the battle and start the next one.
function tapIn() {
  const win = [];
  const lose = [];
  let saved = 0;
  const filt = { classes: new Set(), types: new Set(), factions: new Set() };
  const list = data.heroes.slice().sort((a, b) => a.name.localeCompare(b.name));
  const d = openDrawer({
    title: 'Tap in a battle',
    wide: true,
    body: `<div class="qe-head"><div class="qe-teams" id="qe-teams"></div>
      <div class="toolbar"><label class="search">${ICON.search}<input class="input" id="qe-q" type="search" placeholder="Find hero" autocomplete="off"></label>
        <button class="btn" type="button" data-qe="undo">Undo</button><button class="btn" type="button" data-qe="flip">${ICON.flip} Flip</button>
        <button class="btn primary" type="button" data-qe="save" id="qe-save">${ICON.save} Save</button></div></div>
      ${gameFilterBar(filt)}
      <div class="picker-grid" id="qe-grid"></div>`,
    onClose: () => saved && render(),
  });
  const q = $('#qe-q', d);
  const teams = () => {
    const row = (ids, label, cls) =>
      `<div class="qe-row"><span class="bt-tag ${cls}">${label}</span><div class="qe-slots">${Array.from({ length: 5 }, (_, i) =>
        ids[i] ? `<button type="button" class="qe-pick" data-qe-rm="${esc(ids[i])}" title="Remove ${esc(getHero(ids[i]).name)}">${portrait(getHero(ids[i]), { size: 40 })}</button>` : '<span class="qe-empty"></span>'
      ).join('')}</div></div>`;
    $('#qe-teams', d).innerHTML = `${row(win, 'Won', 'win')}${row(lose, 'Lost', 'lose')}
      <p class="small muted">${win.length < 5 ? `Tap the heroes that <b>won</b> (${win.length} of 5).` : lose.length < 5 ? `Now the heroes that <b>lost</b> (${lose.length} of 5).` : ''}${saved ? ` ${saved} saved so far.` : ''} Tap a hero above to take it out.</p>`;
    $('#qe-save', d).disabled = win.length < 3 || lose.length < 3;
  };
  const grid = () => {
    const s = q.value.trim().toLowerCase();
    const shown = list.filter(
      (h) =>
        (!s || h.name.toLowerCase().includes(s)) &&
        (!filt.classes.size || filt.classes.has(h.class)) &&
        (!filt.types.size || filt.types.has(h.type)) &&
        (!filt.factions.size || filt.factions.has(h.faction))
    );
    const mark = (id) => (win.includes(id) ? '<span class="qe-badge win">W</span>' : lose.includes(id) ? '<span class="qe-badge lose">L</span>' : '');
    $('#qe-grid', d).innerHTML = shown.length ? shown.map((h) => heroTile(h, { size: 54, badge: mark(h.id) })).join('') : '<p class="small muted">No hero matches.</p>';
  };
  const save = () => {
    const side = (ids) => ({ heroes: Object.fromEntries(ids.map((id, i) => [POSITIONS[i], id])), level: playerLevel(), build: 'max', beast: null, beastLevel: null });
    addBattle({ mode: ui.mode, src: 'manual', win: side(win), lose: side(lose) });
    saved++;
    win.length = 0;
    lose.length = 0;
    const st = logStatus();
    toast(`Battle saved. ${st.need ? `${st.n} of ${st.minBattles}: ${st.need} more to go.` : `${st.n} in the log.`}`);
  };
  const refresh = () => {
    teams();
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
    const rm = ev.target.closest('[data-qe-rm]');
    if (rm) {
      for (const t of [win, lose]) if (t.includes(rm.dataset.qeRm)) t.splice(t.indexOf(rm.dataset.qeRm), 1);
      refresh();
      return;
    }
    const act = ev.target.closest('[data-qe]')?.dataset.qe;
    if (act === 'undo') {
      (lose.length ? lose : win).pop();
      refresh();
      return;
    }
    if (act === 'flip') {
      const w = win.splice(0);
      win.push(...lose.splice(0));
      lose.push(...w);
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
    if (win.includes(id)) win.splice(win.indexOf(id), 1);
    else if (lose.includes(id)) lose.splice(lose.indexOf(id), 1);
    else if (win.length < 5) win.push(id);
    else if (lose.length < 5) lose.push(id);
    if (win.length === 5 && lose.length === 5) save();
    // Ready for the next name.
    if (q.value) q.value = '';
    refresh();
    if (!matchMedia('(pointer: coarse)').matches) q.focus();
  });
}

// ---- the full form ---------------------------------------------------------------

function formBlock() {
  const beasts = !!data.beasts?.length && beastAllowed(data.modeById.get(ui.mode));
  const nWin = sideIds(ui.win).length;
  const nLose = sideIds(ui.lose).length;
  return `<section class="bt-form">
      <div class="side-title">${ICON.edit} ${ui.editing ? 'Edit a logged battle' : ui.fixing ? 'Fix a battle read from a screenshot' : 'Full form'}</div>
      <div class="compare bt-compare">
        ${sideBlock('win', beasts)}
        ${sideBlock('lose', beasts)}
      </div>
      <div class="toolbar bt-actions">
        <button class="btn" type="button" data-act="flip" title="Swap the two teams: the winner becomes the loser">${ICON.flip} Flip winner</button>
        <button class="btn primary" type="button" data-act="save" ${nWin >= 3 && nLose >= 3 ? '' : 'disabled'}>${ICON.save} ${ui.editing ? 'Update battle' : 'Save battle'}</button>
        <button class="btn" type="button" data-act="clear">${ui.editing || ui.fixing ? 'Cancel' : 'Clear'}</button>
        <span class="small muted">${nWin < 3 || nLose < 3 ? 'Add at least 3 heroes to each team.' : nWin < 5 || nLose < 5 ? 'A team has fewer than 5 heroes: fine if that is how they fought.' : ''}</span>
      </div>
    </section>`;
}

function sideBlock(key, beasts) {
  const s = ui[key];
  const win = key === 'win';
  const level = s.level ?? playerLevel();
  return `<section class="bt-side ${key}" data-side="${key}">
    <div class="side-title">${win ? `${ICON.trophy} Winner` : `${ICON.swords} Loser`}<span class="spacer"></span>${sideIds(s).length ? `<span class="small muted num" title="Estimated team power">≈ ${fmtCR(sidePower({ ...s, level }))}</span>` : ''}</div>
    ${board({ slots: s.heroes, editable: true, mirror: !win, cls: win ? '' : 'enemy-board', build: s.build === 'mine' ? null : assumedEntry(s.build), level, showBank: s.build === 'mine', beastEdit: beasts, beast: beasts ? s.beast : null, beastLevel: s.beastLevel })}
    <div class="enemy-opts">
      <label class="field"><span>Hero level</span><input class="input" type="number" inputmode="numeric" min="1" max="${LIMITS.level}" data-field="level" value="${level}" placeholder="${playerLevel()}"></label>
      <label class="field"><span>Upgrades</span><select class="select" data-field="build">${BUILDS.map(([k, l]) => `<option value="${k}" ${k === s.build ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      ${
        beasts
          ? `<label class="field"><span>Beast level</span><select class="select" data-field="beastLevel" ${s.beast ? '' : 'disabled'}>${Array.from({ length: BEAST_BUFF_TOTAL }, (_, i) => i + 1)
              .map((n) => `<option value="${n}" ${n === s.beastLevel ? 'selected' : ''}>${n}</option>`)
              .join('')}</select></label>`
          : ''
      }
    </div>
  </section>`;
}

function sameTeams(a, b) {
  return setKey(a.win) === setKey(b.win) && setKey(a.lose) === setKey(b.lose);
}

function saveForm() {
  const side = (s) => {
    const level = s.level ?? playerLevel();
    return { heroes: { ...s.heroes }, level, build: s.build, beast: s.beast || null, beastLevel: s.beast ? s.beastLevel : null, power: s.build === 'mine' ? minePower(sideIds(s), level) : null };
  };
  const item = { mode: ui.mode, src: ui.fixing ? 'screenshot' : 'manual', win: side(ui.win), lose: side(ui.lose) };
  if (ui.editing) {
    // An edit keeps where the battle came from.
    delete item.src;
    updateBattle(ui.editing, item);
    toast('Battle updated.');
  } else {
    const recent = battles.items.find((b) => Date.now() - b.at < 10 * 60 * 1000 && sameTeams(b, item));
    if (recent && !ui.dupeOk) {
      ui.dupeOk = true;
      toast('You logged the same battle a few minutes ago. Tap Save again to log it twice.', 'error');
      return;
    }
    addBattle(item);
    if (ui.fixing) ui.pending = ui.pending.filter((p) => p.pid !== ui.fixing);
    const st = logStatus();
    toast(st.need ? `Battle saved. ${st.n} of ${st.minBattles}: ${st.need} more to go.` : `Battle saved (${st.n} in the log).`);
  }
  resetForm(!ui.editing && !ui.fixing);
}

// Empty the form, keeping levels and upgrades; close it after an edit or a fix.
function resetForm(keepOpen) {
  const was = ui.editing || ui.fixing;
  ui.editing = null;
  ui.fixing = null;
  ui.dupeOk = false;
  const keep = (s) => ({ ...emptySide(), level: s.level, build: s.build });
  ui.win = keep(ui.win);
  ui.lose = keep(ui.lose);
  ui.form = keepOpen && !was ? ui.form : false;
  render();
}

// ---- status and history ------------------------------------------------------------

function pct(p) {
  return `${Math.round(p * 100)}%`;
}

function renderStatus() {
  const host = $('#bt-status', root);
  if (!host) return;
  const st = logStatus();
  const bar = `<div class="bt-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${st.minBattles}" aria-valuenow="${Math.min(st.n, st.minBattles)}"><i style="width:${Math.min(100, (st.n / st.minBattles) * 100)}%"></i></div>`;
  const top = st.heroes.slice(0, 8);
  const chips = top.length ? `<div class="chips">${top.map((h) => `<span class="tag" title="${h.w} won, ${h.l} lost">${esc(getHero(h.id)?.name || h.id)} ${h.n}</span>`).join('')}</div>` : '';
  let body;
  if (st.need) {
    body = `<p><strong>${st.n} of ${st.minBattles} battles.</strong> Add <strong>${st.need} more</strong> and it starts learning. Until then the counter doesn't use any statistics from the log.</p>
      ${bar}
      <p class="small muted">It learns in three layers, each switched on only when it predicts battles it hasn't seen better than without it: <b>team makeup</b> (tanks, healers, burst, control, faction stacking and so on, usually the first to switch on), <b>single heroes</b> (each needs ${LEARN.minHeroBattles} battles), and <b>hero pairs</b> (each needs ${LEARN.minPairBattles} battles together, and in practice several hundred battles in all).</p>
      <p class="small muted">Results in the log count straight away, though: when the counter meets a lineup that's in the log (4 or more of the same heroes), it shows how that went and favours the team that beat it, if you have those heroes.</p>
      ${chips ? `<p class="small muted">Heroes logged most:</p>${chips}` : ''}`;
  } else {
    body = `<p><strong>${st.n} battles.</strong> ${st.active ? 'The layers marked On are used by the counter.' : "No layer has switched on yet: what it learned doesn't yet pick winners reliably better than power and tiers alone. It checks again after every battle you add."}</p>
      <div class="bt-layers">${layerRow('traits', st)}${layerRow('heroes', st)}${layerRow('pairs', st)}</div>
      ${powerLine(st)}`;
  }
  host.innerHTML = `<article class="result-card bt-status ${st.active ? 'on' : ''}"><header><h4>${ICON.spark} What the log has learned</h4><span class="score">${st.active ? 'On' : 'Off'}</span></header>${body}</article>`;
}

const pts = (logit, max = LEARN.maxPoints) => Math.round(Math.max(-max, Math.min(max, logit * LEARN.pointsPerDelta)) * 10) / 10;
const signed = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
const cls = (v) => (v >= 0.3 ? 'bt-up' : v <= -0.3 ? 'bt-down' : '');

// One learning layer: on or off, why, and what it learned.
function layerRow(name, st) {
  const l = st.layers[name];
  let detail = '';
  let table = '';
  if (name === 'traits') {
    const shown = st.traits.map((t) => ({ ...t, p: pts(t.w, LEARN.maxTraitPoints) })).filter((t) => Math.abs(t.p) >= 0.3).sort((a, b) => Math.abs(b.p) - Math.abs(a.p)).slice(0, 6);
    detail = 'Tanks, healers and shielders, burst, control, area damage, buffers, debuffers, faction stacking, and burst against healers.';
    if (l.on && shown.length) table = `<ul class="bt-traits">${shown.map((t) => `<li><span class="num ${cls(t.p)}">${signed(t.p)}</span> ${esc(t.label)}</li>`).join('')}</ul>`;
  } else if (name === 'heroes') {
    const close = st.heroes.filter((h) => h.n < LEARN.minHeroBattles).slice(0, 3);
    detail = `${l.ready} hero${l.ready === 1 ? ' has' : 'es have'} the ${LEARN.minHeroBattles} battles each needs${close.length ? `; closest: ${close.map((h) => `${esc(getHero(h.id)?.name || h.id)} ${h.n}`).join(', ')}` : ''}.`;
    if (l.on) {
      const ready = st.heroes.filter((h) => h.n >= LEARN.minHeroBattles && Number.isFinite(h.delta)).map((h) => ({ ...h, p: pts(h.delta) })).sort((a, b) => b.p - a.p);
      const shown = ready.length > 12 ? [...ready.slice(0, 6), ...ready.slice(-6)] : ready;
      table = `<div class="table-wrap"><table class="bank bt-learned"><thead><tr><th>Hero</th><th>Battles</th><th>Won–lost</th><th>Points</th></tr></thead><tbody>${shown
        .map((h) => `<tr><td><span class="hero-cell" data-hero="${esc(h.id)}">${portrait(getHero(h.id), { size: 34 })}${esc(getHero(h.id)?.name || h.id)}</span></td><td class="num">${h.n}</td><td class="num">${h.w}–${h.l}</td><td class="num ${cls(h.p)}">${signed(h.p)}</td></tr>`)
        .join('')}</tbody></table></div>`;
    }
  } else {
    detail = `${l.ready} pair${l.ready === 1 ? ' has' : 's have'} the ${LEARN.minPairBattles} battles together each needs. Only pairs whose results clearly stand out are tried, and in simulations even a strong synergy took about 600 battles to show; for synergy sooner, add top formations.`;
    if (l.on) {
      const shown = st.pairs.filter((p) => p.screened).map((p) => ({ ...p, p: pts(p.gamma) })).sort((a, b) => b.p - a.p);
      table = `<div class="table-wrap"><table class="bank bt-learned"><thead><tr><th>Pair</th><th>Together</th><th>Won–lost</th><th>Points</th></tr></thead><tbody>${shown
        .map((p) => `<tr><td>${esc(getHero(p.a)?.name || p.a)} + ${esc(getHero(p.b)?.name || p.b)}</td><td class="num">${p.n}</td><td class="num">${p.w}–${p.l}</td><td class="num ${cls(p.p)}">${signed(p.p)}</td></tr>`)
        .join('')}</tbody></table></div>`;
    }
  }
  const cv = l.cv ? `<span class="small muted">Check on unseen battles: log-loss ${l.cv.with.toFixed(3)} with it, ${l.cv.without.toFixed(3)} without (needs ${LEARN.margin.toFixed(2)} lower, with room for luck).</span>` : '';
  return `<div class="bt-layer ${l.on ? 'on' : ''}"><div class="bt-layer-head"><strong>${esc(LAYER_NAMES[name][0].toUpperCase() + LAYER_NAMES[name].slice(1))}</strong><span class="bt-tag ${l.on ? 'win' : ''}">${l.on ? 'On' : 'Off'}</span></div>
    <p class="small">${detail}</p>${cv}${table}</div>`;
}

// What the log says about power: the chance a team 10% stronger wins.
function powerLine(st) {
  if (!st.weights) return '';
  const p = 1 / (1 + Math.exp(-st.weights.power * 10 * Math.log(1.1)));
  return `<p class="small muted">In your log so far, a team about 10% stronger wins about ${pct(p)} of the time.</p>`;
}

function renderHistory() {
  const host = $('#bt-history', root);
  if (!host) return;
  const items = battles.items;
  const shown = ui.showAll ? items : items.slice(0, 15);
  host.innerHTML = `<div class="side-title">${ICON.trophy} Logged battles<span class="spacer"></span><span class="small muted">${items.length} battle${items.length === 1 ? '' : 's'}${items.length >= BATTLES_MAX * 0.9 ? ` of ${BATTLES_MAX} max (the oldest drop off past that)` : ''}</span></div>
    ${
      items.length
        ? `<div class="bt-list">${shown
            .map(
              (b) => `<article class="result-card bt-item${b.id === ui.editing ? ' editing' : ''}">
          <header><h4>${esc(data.modeById.get(b.mode)?.name || 'Battle')}</h4><span class="small muted">${esc(new Date(b.at).toLocaleDateString())}${b.src === 'screenshot' ? ' · from a screenshot' : ''}</span></header>
          <div class="bt-vs">
            <div><p class="bt-meta"><span class="bt-tag win">Won</span><span class="small muted">Lvl ${esc(b.win.level ?? '?')} · ${esc(buildShort(b.win))}</span></p>${board({ slots: b.win.heroes, size: 36, beast: b.win.beast && data.beastById?.get(b.win.beast) ? b.win.beast : null })}</div>
            <div><p class="bt-meta"><span class="bt-tag lose">Lost</span><span class="small muted">Lvl ${esc(b.lose.level ?? '?')} · ${esc(buildShort(b.lose))}</span></p>${board({ slots: b.lose.heroes, size: 36, mirror: true, beast: b.lose.beast && data.beastById?.get(b.lose.beast) ? b.lose.beast : null })}</div>
          </div>
          <div class="toolbar"><span class="spacer"></span><button class="btn small" type="button" data-edit="${esc(b.id)}">${ICON.edit} Edit</button><button class="btn small ghost" type="button" data-del="${esc(b.id)}">${ICON.trash} Delete</button></div>
        </article>`
            )
            .join('')}</div>${items.length > shown.length ? `<div class="toolbar"><button class="btn" type="button" data-act="all">Show all ${items.length}</button></div>` : ''}`
        : '<p class="small muted">No battles yet. Add screenshots or tap in a battle above.</p>'
    }`;
}

function buildShort(side) {
  if (side.build === 'mine') return 'your copies';
  return (ASSUMED_BUILDS[side.build]?.label || '').split(' · ')[0].toLowerCase() + ' build';
}

// ---- events ----------------------------------------------------------------------

function openForm() {
  ui.form = true;
  render();
  $('.bt-form', root)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function onClick(ev) {
  const t = ev.target;
  const v = t.closest('[data-view]');
  if (v) {
    ui.view = v.dataset.view;
    render();
    return;
  }
  if (ui.view === 'top') {
    if (onTopClick(ev, render)) return;
    const hb = t.closest('[data-hero]');
    if (hb && root.contains(hb)) openHeroDetail(hb.dataset.hero);
    return;
  }
  const sideEl = t.closest('[data-side]');
  const slot = t.closest('[data-slot]');
  if (slot && sideEl) {
    const key = sideEl.dataset.side;
    const pos = slot.dataset.slot;
    pickHero({ title: `${key === 'win' ? 'Winner' : 'Loser'} at ${pos}`, allowClear: true, showBank: ui[key].build === 'mine' }).then((id) => {
      if (id === null) return;
      const heroes = ui[key].heroes;
      if (id) {
        for (const p of POSITIONS) if (heroes[p] === id) delete heroes[p];
        heroes[pos] = id;
      } else delete heroes[pos];
      render();
    });
    return;
  }
  const act = t.closest('[data-act]')?.dataset.act;
  if (act === 'beast' && sideEl) {
    const key = sideEl.dataset.side;
    pickBeast({ title: `${key === 'win' ? "Winner's" : "Loser's"} beast`, allowClear: true, category: 'pvp' }).then((id) => {
      if (id === null) return;
      ui[key].beast = id || null;
      render();
    });
    return;
  }
  const pwin = t.closest('[data-pwin]');
  if (pwin) {
    const [id, k] = pwin.dataset.pwin.split(':');
    const p = ui.pending.find((x) => x.pid === Number(id));
    if (p) p.winner = k;
    renderPending();
    return;
  }
  const pflip = t.closest('[data-pflip]');
  if (pflip) {
    const p = ui.pending.find((x) => x.pid === Number(pflip.dataset.pflip));
    if (p?.winner) p.winner = p.winner === 'a' ? 'b' : 'a';
    renderPending();
    return;
  }
  const pdel = t.closest('[data-pdel]');
  if (pdel) {
    ui.pending = ui.pending.filter((x) => x.pid !== Number(pdel.dataset.pdel));
    renderPending();
    return;
  }
  const pfix = t.closest('[data-pfix]');
  if (pfix) {
    const p = ui.pending.find((x) => x.pid === Number(pfix.dataset.pfix));
    if (!p) return;
    const [w, l] = p.winner === 'b' ? [p.b, p.a] : [p.a, p.b];
    ui.win = { ...w, heroes: { ...w.heroes }, level: w.level ?? null };
    ui.lose = { ...l, heroes: { ...l.heroes }, level: l.level ?? null };
    ui.mode = p.mode || ui.mode;
    ui.editing = null;
    ui.fixing = p.pid;
    openForm();
    return;
  }
  const edit = t.closest('[data-edit]');
  if (edit) {
    const b = battles.items.find((x) => x.id === edit.dataset.edit);
    if (!b) return;
    const copy = (s) => ({ ...emptySide(), ...s, heroes: { ...s.heroes }, beastLevel: s.beastLevel ?? 18 });
    ui.editing = b.id;
    ui.fixing = null;
    ui.win = copy(b.win);
    ui.lose = copy(b.lose);
    ui.mode = b.mode || ui.mode;
    openForm();
    return;
  }
  const del = t.closest('[data-del]');
  if (del) {
    if (ui.editing === del.dataset.del) ui.editing = null;
    deleteBattle(del.dataset.del);
    toast('Battle deleted.');
    return;
  }
  const bb = t.closest('[data-beast-detail]');
  if (bb) {
    openBeastDetail(bb.dataset.beastDetail);
    return;
  }
  const hb = t.closest('[data-hero]');
  if (hb && root.contains(hb)) {
    openHeroDetail(hb.dataset.hero);
    return;
  }
  if (act === 'shot') $('#bt-file', root).click();
  else if (act === 'tap') tapIn();
  else if (act === 'form') {
    if (ui.form || ui.editing || ui.fixing) {
      ui.form = false;
      resetForm(false);
    } else openForm();
  } else if (act === 'saveall') saveAll();
  else if (act === 'dropall') {
    ui.pending = [];
    renderPending();
  } else if (act === 'flip') {
    [ui.win, ui.lose] = [ui.lose, ui.win];
    render();
  } else if (act === 'save') saveForm();
  else if (act === 'clear') {
    if (ui.editing || ui.fixing) resetForm(false);
    else {
      ui.win = { ...emptySide(), level: ui.win.level, build: ui.win.build };
      ui.lose = { ...emptySide(), level: ui.lose.level, build: ui.lose.build };
      render();
    }
  } else if (act === 'all') {
    ui.showAll = true;
    renderHistory();
  }
}

function onChange(ev) {
  const t = ev.target;
  if (ui.view === 'top') {
    onTopChange(ev, render);
    return;
  }
  if (t.id === 'bt-mode') {
    ui.mode = t.value;
    render();
    return;
  }
  if (t.id === 'bt-file') {
    const files = [...(t.files || [])];
    t.value = '';
    if (files.length) readShots(files);
    return;
  }
  const sideEl = t.closest('[data-side]');
  const field = t.dataset.field;
  if (!sideEl || !field) return;
  const s = ui[sideEl.dataset.side];
  if (field === 'level') {
    const v = Math.round(Number(t.value));
    s.level = t.value === '' || !Number.isFinite(v) ? null : Math.min(LIMITS.level, Math.max(1, v));
  } else if (field === 'build') s.build = t.value;
  else if (field === 'beastLevel') s.beastLevel = Number(t.value);
  render();
}
