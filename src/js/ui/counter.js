// Formation Counter tab: enter the enemy formation (by hand or from a
// screenshot) and get the best answer from the player's own heroes.

import { esc, $, toast } from '../util.js';
import { data, hero as getHero, POSITIONS, FACTIONS, factionAdvantage } from '../data.js';
import { bank, ownedIds, ownedBeasts } from '../store.js';
import { makeContext, buildTeam, heroValue, suggestArtifact, scoreTeam, suggestBeast } from '../engine.js';
import { aiState, initAi, claudeCounter, readEnemyScreenshot, errorCopy } from '../ai.js';
import { ICON } from './icons.js';
import { board, pickHero, portrait, slotsFromList, beastLine, beastAllowed } from './common.js';
import { openHeroDetail } from './heroDetail.js';

const ui = {
  enemy: {},
  modeId: 'arena-of-heroes',
  pool: 'mine',
  invest: true,
  claude: null,
  claudeNotes: '',
  busy: false,
  ctl: null,
  reading: false,
};

let root;

export function mountCounter(el) {
  root = el;
  if (!data.modeById.has(ui.modeId)) ui.modeId = data.modes.find((m) => m.category === 'pvp')?.id || data.modes[0]?.id;
  // Open on a realistic example: the most-agreed PvP comp this week.
  const ex = data.modeById.get('arena-of-heroes')?.community?.find((t) => t.heroes?.length === 5);
  if (ex) ui.enemy = slotsFromList(ex.heroes);
  if (!ownedIds().length) ui.pool = 'all';
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  render();
}

export function refreshCounter() {
  if (!root) return;
  if (ui.pool === 'mine' && !ownedIds().length) ui.pool = 'all';
  render();
}

function enemyIds() {
  return POSITIONS.map((p) => ui.enemy[p]).filter(Boolean);
}

function poolIds() {
  const base = ui.pool === 'mine' ? ownedIds() : data.heroes.map((h) => h.id);
  const enemy = new Set(enemyIds());
  return base.filter((id) => getHero(id) && (ui.pool === 'mine' || !enemy.has(id)));
}

function context() {
  return makeContext({
    heroes: data.heroById,
    entries: ui.pool === 'mine' && ui.invest ? bank.heroes : null,
    mode: data.modeById.get(ui.modeId),
    category: data.modeById.get(ui.modeId)?.category || 'pvp',
    enemy: enemyIds(),
    combos: [...(data.combos.community || []), ...(data.combos.ai || [])],
    archetypes: data.archetypes,
    elderTree: ui.pool === 'mine' && ui.invest ? bank.settings.elderTree : null,
  });
}

function threatChips(ctx) {
  const t = ctx.enemyThreats;
  const items = [
    ['burst', 'Burst / assassins'],
    ['sustain', 'Healing & shields'],
    ['control', 'Crowd control'],
    ['energy', 'Energy gain'],
    ['summons', 'Summons'],
  ];
  return items
    .filter(([k]) => t[k])
    .map(([k, l]) => `<span class="tag ${t[k] >= 2 ? 'warn' : ''}">${l} ×${t[k]}</span>`)
    .join('');
}

function factionAdvice(ctx) {
  const counts = {};
  for (const h of ctx.enemy) counts[h.faction] = (counts[h.faction] || 0) + 1;
  const best = FACTIONS.map((f) => ({ f: f.id, n: ctx.enemy.filter((h) => factionAdvantage(f.id, h.faction)).length })).filter((x) => x.n).sort((a, b) => b.n - a.n);
  const mix = Object.entries(counts)
    .map(([f, n]) => `${n} ${esc(f)}`)
    .join(', ');
  return `<p class="small"><span class="muted">Enemy factions:</span> ${mix || '–'}${best.length ? ` · <span class="muted">Faction advantage (+25% damage) from:</span> ${best.map((b) => `${esc(b.f)} (vs ${b.n})`).join(', ')}` : ''}</p>`;
}

function render() {
  const modes = data.modes.filter((m) => !m.builderOnly);
  const owned = ownedIds().length;
  const ctx = context();
  const archetypeOpts = (data.archetypes || [])
    .map((a, i) => `<option value="arch-${i}">${esc(a.name)}</option>`)
    .concat(
      (data.modeById.get('arena-of-heroes')?.community || [])
        .filter((t) => t.heroes?.length >= 3)
        .map((t, i) => `<option value="team-${i}">${esc(t.name)}</option>`)
    )
    .join('');
  root.innerHTML = `
    <div class="view-head"><div><p class="eyebrow">Beat what you see</p><h2>Formation counter</h2>
      <p>Put in the enemy formation, by hand or from a screenshot. The counter uses your heroes, their upgrades, known counters, faction advantage and positioning.</p></div></div>
    <div class="controls-rail">
      <label class="field"><span>Mode</span><select class="select" id="ct-mode">${modes.map((m) => `<option value="${esc(m.id)}" ${m.id === ui.modeId ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
      <div class="field"><span>Heroes</span><div class="seg" role="group"><button type="button" data-pool="mine" aria-pressed="${ui.pool === 'mine'}">My heroes (${owned})</button><button type="button" data-pool="all" aria-pressed="${ui.pool === 'all'}">Full roster</button></div></div>
      <label class="check" ${ui.pool === 'mine' ? '' : 'hidden'}><input type="checkbox" id="ct-invest" ${ui.invest ? 'checked' : ''}> Weigh my upgrade levels</label>
      <label class="field"><span>Load a common enemy</span><select class="select" id="ct-load"><option value="">Choose…</option>${archetypeOpts}</select></label>
    </div>
    ${ui.pool === 'all' ? `<p class="callout small">${owned ? 'Countering with the full roster at full investment.' : 'Your hero bank is empty, so counters use the full roster. Add your heroes in the Hero Bank tab for counters you can field.'}</p>` : ''}
    <div class="compare">
      <section>
        <div class="side-title">${ICON.swords} Enemy formation</div>
        ${board({ slots: ui.enemy, editable: true, cls: 'enemy-board', size: 58 })}
        <div class="toolbar">
          <button class="btn" type="button" data-act="shot" id="ct-shot" hidden>${ICON.upload} Read a screenshot</button>
          <input type="file" id="ct-file" accept="image/png,image/jpeg,image/webp" hidden>
          <button class="btn ghost" type="button" data-act="clear">Clear</button>
          <span class="small muted" id="ct-status"></span>
        </div>
        ${enemyIds().length ? `<div class="chips">${threatChips(ctx)}</div>${factionAdvice(ctx)}${ctx.enemyArchetypes.length ? `<p class="small"><span class="muted">Recognised comp:</span> ${ctx.enemyArchetypes.map((a) => esc(a.name)).join(', ')}</p>` : ''}` : '<p class="small muted">Select a slot to add an enemy hero.</p>'}
      </section>
      <section id="ct-result"></section>
    </div>
    <div id="ct-picks"></div>
    <div class="compare" style="margin-top:4px"><section></section><section id="ct-claude"></section></div>`;
  renderResult(ctx);
  renderClaude();
  initAi().then(() => {
    const b = $('#ct-shot', root);
    if (b) b.hidden = !(aiState.images && !aiState.disabled);
  });
}

function renderResult(ctx) {
  const host = $('#ct-result', root);
  const picks = $('#ct-picks', root);
  if (!enemyIds().length) {
    host.innerHTML = `<div class="side-title">${ICON.spark} Your counter</div><div class="empty"><p>Add at least one enemy hero to get a counter.</p></div>`;
    picks.innerHTML = '';
    return;
  }
  const pool = poolIds();
  const best = pool.length ? buildTeam(ctx, pool) : null;
  ui.engineTeam = best;
  if (!best) {
    host.innerHTML = `<div class="side-title">${ICON.spark} Your counter</div><div class="empty"><h4>No heroes to counter with</h4><p>Add heroes in the Hero Bank tab, or switch to the full roster.</p></div>`;
    picks.innerHTML = '';
    return;
  }
  const s = best.score;
  const arts = {};
  for (const id of Object.values(s.layout)) {
    const a = suggestArtifact(getHero(id), { mode: ctx.mode, artifacts: data.artifacts, category: 'pvp' });
    if (a) arts[id] = a.id;
  }
  const reasons = POSITIONS.map((p) => s.layout[p])
    .filter(Boolean)
    .map((id) => {
      const m = s.members.find((x) => x.id === id);
      const counterReasons = (m.reasons || []).filter((r) => /counter|weak|answers|protects|breaks|shrugs|drains|struggles|faction/.test(r));
      return `<li><b>${esc(getHero(id).name)}</b><span>${esc((counterReasons.length ? counterReasons : m.reasons.slice(0, 2)).join(' · '))}</span></li>`;
    })
    .join('');
  host.innerHTML = `<div class="side-title">${ICON.spark} Your counter (rules engine)</div>
    <article class="result-card">
      <header><h4>${esc(s.template?.name || 'Counter formation')}</h4><span class="score">${s.total.toFixed(1)} pts</span></header>
      ${board({ slots: s.layout, artifacts: arts, showBank: ui.pool === 'mine' })}
      ${beastFor(ctx, Object.values(s.layout))}
      <ul class="reasons">${reasons}</ul>
      ${s.synergies.length ? `<p class="small"><span class="muted">Synergy:</span> ${s.synergies.map((x) => `${esc(getHero(x.a).name)} + ${esc(getHero(x.b).name)}`).join(', ')}</p>` : ''}
    </article>`;
  // Individual hero ranking against this enemy.
  const ranked = pool
    .map((id) => ({ id, v: heroValue(ctx, id) }))
    .sort((a, b) => b.v.counterBonus - a.v.counterBonus || b.v.value - a.v.value)
    .slice(0, 10);
  picks.innerHTML = `<div class="side-title">Top counter picks${ui.pool === 'mine' ? ' you own' : ''}</div>
    <div class="picks-grid" style="margin-top:8px">${ranked
      .map(
        ({ id, v }) => `<button type="button" class="combo" data-hero="${id}" style="cursor:pointer;text-align:left">
      <span class="heroes">${portrait(getHero(id), { size: 40, showBank: ui.pool === 'mine' })}</span>
      <span class="txt"><strong>${esc(getHero(id).name)}</strong> <span class="score">${v.counterBonus >= 0 ? '+' : ''}${v.counterBonus.toFixed(1)} matchup</span>
      <p class="small">${esc(v.reasons.slice(0, 4).join(' · '))}</p></span></button>`
      )
      .join('')}</div>`;
}

function beastFor(ctx, ids) {
  if (!data.beasts?.length || !beastAllowed(ctx.mode)) return '';
  const mine = ui.pool === 'mine';
  if (mine && !ownedBeasts().length) return '<p class="small muted">Mark your beasts in the Hero Bank to get a beast pick.</p>';
  return beastLine(suggestBeast(ctx, ids, { beasts: data.beasts, owned: mine ? bank.beasts : null, recommendations: data.beastModes }), { owned: mine });
}

function renderClaude() {
  const host = $('#ct-claude', root);
  if (!host) return;
  initAi().then(() => {
    if (!$('#ct-claude', root)) return;
    if (!aiState.text || aiState.disabled) {
      host.innerHTML = `<p class="callout info small">Claude's counter analysis is available when this page is open in Claude (claude.ai).</p>`;
      return;
    }
    if (ui.busy) {
      host.innerHTML = `<div class="side-title">${ICON.spark} Claude's counter</div><p class="small muted">Claude is studying the enemy formation…</p><div class="toolbar"><button class="btn" type="button" data-act="stop">${ICON.stop} Stop</button></div>`;
      return;
    }
    const ctx = context();
    if (ui.claude?.length) {
      host.innerHTML = `<div class="side-title">${ICON.spark} Claude's counter</div>${ui.claude
        .map((t, i) => {
          const s = scoreTeam(ctx, Object.values(t.slots));
          return `<article class="result-card"><header><h4>${i ? 'Alternative' : 'Primary'}: ${esc(t.name)}</h4><span class="score">${s.total.toFixed(1)} pts</span></header>
            ${board({ slots: t.slots, artifacts: t.artifacts || {}, showBank: ui.pool === 'mine' })}
            ${t.beast ? beastLine({ id: t.beast, reasons: ["Claude's pick"] }) : ''}
            ${t.why ? `<p class="small prose">${esc(t.why)}</p>` : ''}${t.risks ? `<p class="small muted">Risk: ${esc(t.risks)}</p>` : ''}</article>`;
        })
        .join('')}${ui.claudeNotes ? `<p class="callout small">${esc(ui.claudeNotes)}</p>` : ''}
        <div class="toolbar"><button class="btn" type="button" data-act="claude">${ICON.spark} Ask again</button></div>`;
      return;
    }
    host.innerHTML = enemyIds().length
      ? `<div class="side-title">${ICON.spark} Claude's counter</div><div class="empty"><p>Claude weighs each enemy's kit, targeting and positioning against your exact heroes.</p>
        <button class="btn primary" type="button" data-act="claude">${ICON.spark} Ask Claude for a counter</button><span class="small muted">Uses your Claude account.</span></div>`
      : '';
  });
}

async function askClaude() {
  if (!enemyIds().length) return;
  ui.busy = true;
  ui.ctl = new AbortController();
  renderClaude();
  try {
    const out = await claudeCounter({
      enemySlots: ui.enemy,
      mode: data.modeById.get(ui.modeId),
      pool: poolIds(),
      entries: ui.pool === 'mine' ? bank.heroes : null,
      engineTeam: ui.engineTeam ? { layout: ui.engineTeam.score.layout } : null,
      signal: ui.ctl.signal,
      elderTree: ui.pool === 'mine' ? bank.settings.elderTree : null,
      beasts: ui.pool === 'mine' ? bank.beasts : null,
    });
    ui.claude = out.teams;
    ui.claudeNotes = out.notes;
    if (!out.teams.length) toast('Claude did not return a usable formation. Try again.', 'error');
  } catch (e) {
    if (e?.code !== 'cancelled') toast(errorCopy(e), 'error');
  } finally {
    ui.busy = false;
    renderClaude();
  }
}

async function readShot(file) {
  const status = $('#ct-status', root);
  status.textContent = 'Claude is reading the screenshot…';
  try {
    const out = await readEnemyScreenshot(file);
    if (!Object.keys(out.slots).length) {
      status.textContent = 'No heroes recognised. Try a clearer screenshot of the enemy formation.';
      return;
    }
    ui.enemy = out.slots;
    ui.claude = null;
    render();
    toast(`Read ${Object.keys(out.slots).length} enemy heroes. Check the slots and fix any mistakes.`);
    if (out.notes) $('#ct-status', root).textContent = out.notes;
  } catch (e) {
    status.textContent = errorCopy(e);
  }
}

function onClick(ev) {
  const t = ev.target;
  const slot = t.closest('[data-slot]');
  if (slot) {
    const pos = slot.dataset.slot;
    pickHero({ title: `Enemy hero at ${pos}`, allowClear: true }).then((id) => {
      if (id === null) return;
      if (id) {
        for (const p of POSITIONS) if (ui.enemy[p] === id) delete ui.enemy[p];
        ui.enemy[pos] = id;
      } else delete ui.enemy[pos];
      ui.claude = null;
      render();
    });
    return;
  }
  const p = t.closest('[data-pool]');
  if (p) {
    ui.pool = p.dataset.pool;
    ui.claude = null;
    render();
    return;
  }
  const hb = t.closest('[data-hero]');
  if (hb && root.contains(hb)) {
    openHeroDetail(hb.dataset.hero);
    return;
  }
  const act = t.closest('[data-act]')?.dataset.act;
  if (act === 'clear') {
    ui.enemy = {};
    ui.claude = null;
    render();
  } else if (act === 'claude') askClaude();
  else if (act === 'stop') ui.ctl?.abort();
  else if (act === 'shot') $('#ct-file', root).click();
}

function onChange(ev) {
  const t = ev.target;
  if (t.id === 'ct-mode') {
    ui.modeId = t.value;
    ui.claude = null;
    render();
  } else if (t.id === 'ct-invest') {
    ui.invest = t.checked;
    render();
  } else if (t.id === 'ct-file') {
    const f = t.files?.[0];
    if (f) readShot(f);
  } else if (t.id === 'ct-load' && t.value) {
    const [kind, i] = t.value.split('-');
    if (kind === 'arch') {
      const a = data.archetypes[Number(i)];
      ui.enemy = slotsFromList((a.core || []).map((id) => ({ id })));
    } else {
      const team = (data.modeById.get('arena-of-heroes')?.community || []).filter((x) => x.heroes?.length >= 3)[Number(i)];
      ui.enemy = slotsFromList(team.heroes);
    }
    ui.claude = null;
    render();
  }
}
