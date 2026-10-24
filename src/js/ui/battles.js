// Battles tab: a log of battles the player fought or watched, winner and
// loser, entered by hand or read from screenshots. The counter uses the
// player's own results against a lineup straight away (they're facts); what
// learn.js generalises from the log (which heroes win more or less than power
// and tiers predict) only once it proves itself on battles it wasn't fitted on.

import { esc, $, toast } from '../util.js';
import { data, hero as getHero, POSITIONS, LIMITS, ASSUMED_BUILDS, BEAST_BUFF_TOTAL, assumedEntry } from '../data.js';
import { bank, battles, addBattle, updateBattle, deleteBattle, BATTLES_MAX } from '../store.js';
import { learnBattles, LEARN } from '../learn.js';
import { aiState, initAi, readBattleScreenshots, errorCopy } from '../ai.js';
import { ICON } from './icons.js';
import { board, pickHero, pickBeast, portrait, entryCR, heroCR, fmtCR, playerLevel, beastAllowed } from './common.js';
import { openHeroDetail } from './heroDetail.js';
import { openBeastDetail } from './beastDetail.js';

const BUILDS = [...Object.entries(ASSUMED_BUILDS).map(([k, b]) => [k, b.label]), ['mine', 'My bank copies (where owned)']];
const emptySide = () => ({ heroes: {}, level: null, build: 'max', beast: null, beastLevel: 18 });

const ui = {
  mode: 'arena-of-heroes',
  win: emptySide(),
  lose: emptySide(),
  editing: null, // id of the logged battle being edited
  shot: null, // {seen, unsure, notes} when the form came from a screenshot
  queue: [], // more battles read from the screenshots, waiting their turn
  reading: false,
  dupeOk: false,
  showAll: false,
};

let root;

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

const learnSide = (side) => ({ ids: sideIds(side), power: sidePower(side), beastLevel: side.beast ? side.beastLevel ?? null : null });

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

export { learnSide };

// One line for the counter about the learned part.
export function logLine(st = logStatus()) {
  if (st.active) return `Your battle log (${st.n} battles) is on: it adjusts ${st.ready} hero${st.ready === 1 ? '' : 'es'} that win more or less than power and tiers predict.`;
  if (st.need) return `Battle log: ${st.n} of ${st.minBattles} battles. The learned part stays off until ${st.minBattles}: add ${st.need} more in the Battles tab.`;
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

function render() {
  const beasts = !!data.beasts?.length && beastAllowed(data.modeById.get(ui.mode));
  const nWin = sideIds(ui.win).length;
  const nLose = sideIds(ui.lose).length;
  root.innerHTML = `
    <div class="view-head"><div><p class="eyebrow">Teach the counter</p><h2>Battle log</h2>
      <p>Log battles you fought or watched: the team that won and the team that lost, with their levels and beasts. Heroes count as fully built unless you say otherwise. The more battles you log, the more the counter learns from them.</p>
      <p class="bt-progress"><b>${progressText()}</b></p></div></div>
    <section class="bt-form">
      <div class="controls-rail">
        <label class="field"><span>Mode</span><select class="select" id="bt-mode">${pvpModes()
          .map((m) => `<option value="${esc(m.id)}" ${m.id === ui.mode ? 'selected' : ''}>${esc(m.name)}</option>`)
          .join('')}</select></label>
        <div class="field" id="bt-shot-field" hidden><span>From the game</span><button class="btn" type="button" data-act="shot" ${ui.reading ? 'disabled' : ''}>${ICON.upload} ${ui.reading ? 'Reading…' : 'Read screenshots'}</button>
          <input type="file" id="bt-file" accept="image/png,image/jpeg,image/webp" multiple hidden></div>
      </div>
      ${shotNote()}
      <div class="compare bt-compare">
        ${sideBlock('win', beasts)}
        ${sideBlock('lose', beasts)}
      </div>
      <div class="toolbar bt-actions">
        <button class="btn" type="button" data-act="flip" title="Swap the two teams: the winner becomes the loser">${ICON.flip} Flip winner</button>
        <button class="btn primary" type="button" data-act="save" ${nWin >= 3 && nLose >= 3 ? '' : 'disabled'}>${ICON.save} ${ui.editing ? 'Update battle' : 'Save battle'}</button>
        <button class="btn" type="button" data-act="clear">${ui.editing ? 'Cancel edit' : 'Clear'}</button>
        ${ui.queue.length ? `<button class="btn ghost" type="button" data-act="skip">Skip this one</button>` : ''}
        <span class="small muted">${nWin < 3 || nLose < 3 ? 'Add at least 3 heroes to each team.' : nWin < 5 || nLose < 5 ? 'A team has fewer than 5 heroes: fine if that is how they fought.' : ''}${ui.queue.length ? ` ${ui.queue.length} more from your screenshots after this one.` : ''}</span>
      </div>
    </section>
    <div id="bt-status"></div>
    <div id="bt-history"></div>`;
  renderStatus();
  renderHistory();
  initAi().then(() => {
    const f = $('#bt-shot-field', root);
    if (f) f.hidden = !(aiState.images && !aiState.disabled);
  });
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

function shotNote() {
  if (!ui.shot) return '';
  const s = ui.shot;
  return `<p class="callout ${s.unsure ? '' : 'info'} small">${
    s.unsure
      ? `<strong>The screenshot doesn't say who won.</strong> Make sure the team that won is under Winner: <b>Flip winner</b> swaps the teams.`
      : `<strong>Read from your screenshot.</strong> Check both teams${s.seen ? ` (${esc(s.seen)})` : ''}. If the winner is on the wrong side, tap <b>Flip winner</b>.`
  }${s.notes ? ` <span class="muted">${esc(s.notes)}</span>` : ''}</p>`;
}

// One line on where the log stands, for the top of the tab.
function progressText(st = logStatus()) {
  if (st.active) return `${st.n} battles logged. Learning is on: the counter uses them.`;
  if (st.need) return `${st.n} of ${st.minBattles} battles logged: ${st.need} more before it starts learning.`;
  return `${st.n} battles logged. Learning switches on once it predicts better than power and tiers (details below).`;
}

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
      <p class="small muted">Your own results count straight away, though: when the counter meets a lineup you've logged (4 or more of the same heroes), it shows how that went and favours the team that won.</p>
      ${chips ? `<p class="small muted">Heroes logged most:</p>${chips}` : ''}`;
  } else if (!st.active) {
    const close = st.heroes.filter((h) => h.n < LEARN.minHeroBattles).slice(0, 4);
    body = `<p><strong>${st.n} battles: learning is still off.</strong> On battles it wasn't fitted on, what it learned doesn't yet pick winners reliably better than power and tiers alone. It checks again after every battle you add.</p>
      <p class="small">Each hero needs ${LEARN.minHeroBattles} battles before it gets an adjustment: ${st.ready} ${st.ready === 1 ? 'hero has' : 'heroes have'} that many${close.length ? `; closest: ${close.map((h) => `${esc(getHero(h.id)?.name || h.id)} ${h.n} (${LEARN.minHeroBattles - h.n} more)`).join(', ')}` : ''}. Battles with heroes you meet often teach it fastest; it can take 100 or more when the log mixes many different heroes.</p>
      ${checkLine(st)}${powerLine(st)}`;
  } else {
    const ready = st.heroes
      .filter((h) => h.n >= LEARN.minHeroBattles)
      .map((h) => ({ ...h, pts: Math.round(Math.max(-LEARN.maxPoints, Math.min(LEARN.maxPoints, h.delta * LEARN.pointsPerDelta)) * 10) / 10 }))
      .sort((a, b) => b.pts - a.pts);
    // A long list shows the six biggest each way.
    const shown = ready.length > 12 ? [...ready.slice(0, 6), ...ready.slice(-6)] : ready;
    const rows = shown
      .map((h, i) => {
        const word = Math.abs(h.pts) < 0.3 ? 'as expected' : h.pts > 0 ? 'wins more than expected' : 'wins less than expected';
        const gap = ready.length > 12 && i === 6 ? `<tr><td colspan="5" class="small muted">${ready.length - 12} more heroes in between</td></tr>` : '';
        return `${gap}<tr><td><span class="hero-cell" data-hero="${esc(h.id)}">${portrait(getHero(h.id), { size: 34 })}${esc(getHero(h.id)?.name || h.id)}</span></td><td class="num">${h.n}</td><td class="num">${h.w}–${h.l}</td><td class="num ${h.pts >= 0.3 ? 'bt-up' : h.pts <= -0.3 ? 'bt-down' : ''}">${h.pts >= 0 ? '+' : ''}${h.pts.toFixed(1)}</td><td>${word}</td></tr>`;
      })
      .join('');
    body = `<p><strong>Learning is on: the counter uses your battle log.</strong> With ${st.n} battles it picks winners it wasn't fitted on better than power and tiers alone, so the heroes below get the adjustment shown (counter points; one tier step is 1.5).</p>
      ${checkLine(st)}${powerLine(st)}
      <div class="table-wrap"><table class="bank bt-learned"><thead><tr><th>Hero</th><th>Battles</th><th>Won–lost</th><th>Points</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  host.innerHTML = `<article class="result-card bt-status ${st.active ? 'on' : ''}"><header><h4>${ICON.spark} What the log has learned</h4><span class="score">${st.active ? 'On' : 'Off'}</span></header>${body}</article>`;
}

// How the check went, in numbers, for anyone who wants them.
function checkLine(st) {
  if (!st.cv) return '';
  return `<p class="small muted">Check on battles left out of the fit: log-loss ${st.cv.full.toFixed(3)} with the learned adjustments, ${st.cv.base.toFixed(3)} with power and tiers alone (lower is better; it needs to be ${LEARN.margin.toFixed(2)} lower, with room for luck).</p>`;
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
        : '<p class="small muted">No battles yet. Fill in the two teams above and save, or read a screenshot of a battle result.</p>'
    }`;
}

function buildShort(side) {
  if (side.build === 'mine') return 'your copies';
  return (ASSUMED_BUILDS[side.build]?.label || '').split(' · ')[0].toLowerCase() + ' build';
}

// ---- actions -------------------------------------------------------------------

function sameTeams(a, b) {
  const key = (s) => sideIds(s).sort().join(',');
  return key(a.win) === key(b.win) && key(a.lose) === key(b.lose);
}

function save() {
  const side = (s) => {
    const level = s.level ?? playerLevel();
    return { heroes: { ...s.heroes }, level, build: s.build, beast: s.beast || null, beastLevel: s.beast ? s.beastLevel : null, power: s.build === 'mine' ? minePower(sideIds(s), level) : null };
  };
  const item = { mode: ui.mode, src: ui.shot ? 'screenshot' : 'manual', win: side(ui.win), lose: side(ui.lose) };
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
    const st = logStatus();
    toast(st.need ? `Battle saved. ${st.n} of ${st.minBattles}: ${st.need} more to go.` : `Battle saved (${st.n} in the log).`);
  }
  next();
}

// Move on: the next battle read from the screenshots, or an empty form that keeps the settings.
function next() {
  ui.editing = null;
  ui.dupeOk = false;
  ui.shot = null;
  const keep = (s) => ({ ...emptySide(), level: s.level, build: s.build });
  ui.win = keep(ui.win);
  ui.lose = keep(ui.lose);
  if (ui.queue.length) loadRead(ui.queue.shift());
  render();
}

// A battle read from a screenshot, winner first. Upgrades stay at the form's
// choice (best by default): the screen doesn't show them.
function loadRead(b) {
  const right = b.winner === 'right';
  const toSide = (x, prev) => ({ ...emptySide(), build: prev.build, heroes: x.slots, level: x.level ?? prev.level, beast: x.beast, beastLevel: x.beastLevel ?? 18 });
  const winPrev = ui.win;
  const losePrev = ui.lose;
  ui.win = toSide(right ? b.right : b.left, winPrev);
  ui.lose = toSide(right ? b.left : b.right, losePrev);
  if (b.mode) ui.mode = b.mode;
  ui.shot = { unsure: !b.winner, seen: b.seen, notes: b.notes || '' };
}

async function readShots(files) {
  const list = [...files].slice(0, Math.max(1, aiState.maxImages || 1));
  ui.reading = true;
  render();
  try {
    const out = await readBattleScreenshots(list);
    if (!out.battles.length) {
      toast('No battle found in the screenshot. Use a Victory/Defeat screen, its statistics, or a battle record.', 'error');
      return;
    }
    out.battles[0].notes = out.notes;
    ui.editing = null;
    loadRead(out.battles[0]);
    ui.queue = out.battles.slice(1);
    toast(`Read ${out.battles.length} battle${out.battles.length > 1 ? 's' : ''}. Check the teams and the winner, then save.`);
  } catch (e) {
    toast(errorCopy(e), 'error');
  } finally {
    ui.reading = false;
    render();
  }
}

function onClick(ev) {
  const t = ev.target;
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
  const edit = t.closest('[data-edit]');
  if (edit) {
    const b = battles.items.find((x) => x.id === edit.dataset.edit);
    if (!b) return;
    const copy = (s) => ({ ...emptySide(), ...s, heroes: { ...s.heroes }, beastLevel: s.beastLevel ?? 18 });
    ui.editing = b.id;
    ui.win = copy(b.win);
    ui.lose = copy(b.lose);
    ui.mode = b.mode || ui.mode;
    ui.shot = null;
    render();
    $('.bt-form', root)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  if (act === 'flip') {
    [ui.win, ui.lose] = [ui.lose, ui.win];
    if (ui.shot) ui.shot.unsure = false;
    render();
  } else if (act === 'save') save();
  else if (act === 'clear') {
    if (ui.editing) next();
    else {
      ui.win = { ...emptySide(), level: ui.win.level, build: ui.win.build };
      ui.lose = { ...emptySide(), level: ui.lose.level, build: ui.lose.build };
      ui.shot = null;
      ui.queue = [];
      render();
    }
  } else if (act === 'skip') next();
  else if (act === 'shot') $('#bt-file', root).click();
  else if (act === 'all') {
    ui.showAll = true;
    renderHistory();
  }
}

function onChange(ev) {
  const t = ev.target;
  if (t.id === 'bt-mode') {
    ui.mode = t.value;
    render();
    return;
  }
  if (t.id === 'bt-file') {
    if (t.files?.length) readShots(t.files);
    t.value = '';
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
