// Formation Builder tab: pick a mode and a number of formations (1–7);
// the rules engine builds non-overlapping teams from the hero bank, and
// Claude can give its own take.

import { esc, $, toast } from '../util.js';
import { data, hero as getHero, POSITIONS } from '../data.js';
import { bank, ownedIds, saveFormation, deleteFormation, formations } from '../store.js';
import { makeContext, buildTeams, scoreTeam, suggestArtifact, nextUpgrade } from '../engine.js';
import { aiState, initAi, claudeBuild, errorCopy } from '../ai.js';
import { ICON } from './icons.js';
import { board, panel, pickHero, artifactChip, bindFolding, portrait } from './common.js';
import { openHeroDetail } from './heroDetail.js';

const GROUP_LABEL = { pve: 'Campaign & towers', boss: 'Bosses & realms', pvp: 'PvP', event: 'Events & other' };

const ui = {
  modeId: null,
  count: 1,
  strategy: 'strongest',
  pool: 'mine',
  invest: true,
  exclude: new Set(),
  result: null,
  claude: null,
  claudeNotes: '',
  busy: false,
  ctl: null,
};

let root;

export function mountBuilder(el) {
  root = el;
  const first = data.modes.find((m) => m.id === 'legends-championship') || data.modes[0];
  ui.modeId = first?.id || null;
  ui.count = first?.teams || 1;
  ui.strategy = defaultStrategy(first);
  if (!ownedIds().length) ui.pool = 'all';
  bindFolding(root);
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  render();
}

export function refreshBuilder() {
  if (!root) return;
  if (ui.pool === 'mine' && !ownedIds().length) ui.pool = 'all';
  build();
  render();
}

// Multi-team PvP needs every team to win, so balance by default there.
function defaultStrategy(m) {
  return m?.category === 'pvp' && (m.teams || 1) > 1 ? 'balanced' : 'strongest';
}

function mode() {
  return data.modeById.get(ui.modeId) || null;
}

function poolIds() {
  const base = ui.pool === 'mine' ? ownedIds() : data.heroes.map((h) => h.id);
  return base.filter((id) => !ui.exclude.has(id) && getHero(id));
}

function context() {
  return makeContext({
    heroes: data.heroById,
    entries: ui.pool === 'mine' && ui.invest ? bank.heroes : null,
    mode: mode(),
    combos: [...(data.combos.community || []), ...(data.combos.ai || [])],
    archetypes: data.archetypes,
  });
}

function build() {
  const pool = poolIds();
  if (!pool.length) {
    ui.result = null;
    return;
  }
  const ctx = context();
  ui.result = { ...buildTeams(ctx, pool, ui.count, ui.strategy), ctx };
}

function modeOptions() {
  const groups = {};
  for (const m of data.modes) (groups[m.group || m.category] ||= []).push(m);
  return Object.entries(groups)
    .map(([g, list]) => `<optgroup label="${esc(GROUP_LABEL[g] || g)}">${list.map((m) => `<option value="${esc(m.id)}" ${m.id === ui.modeId ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</optgroup>`)
    .join('');
}

function render() {
  if (!ui.result) build();
  const m = mode();
  const owned = ownedIds().length;
  const seg = (name, items, cur) =>
    `<div class="seg" role="group" aria-label="${name}">${items.map(([v, l]) => `<button type="button" data-${name}="${v}" aria-pressed="${String(cur) === String(v)}">${l}</button>`).join('')}</div>`;
  root.innerHTML = `
    <div class="view-head"><div><p class="eyebrow">From your hero bank</p><h2>Formation builder</h2>
      <p>Choose a game mode and how many formations you need. Teams never share a hero, so multi-team modes like Legends Championship get full, separate lineups.</p></div></div>
    <div class="controls-rail">
      <label class="field"><span>Game mode</span><select class="select" id="bd-mode">${modeOptions()}</select></label>
      <div class="field"><span>Formations</span>${seg('count', [1, 2, 3, 4, 5, 6, 7].map((n) => [n, n]), ui.count)}</div>
      <div class="field"><span>Priority</span>${seg('strategy', [['strongest', 'Strongest first'], ['balanced', 'Balanced']], ui.strategy)}</div>
      <div class="field"><span>Heroes</span>${seg('pool', [['mine', `My heroes (${owned})`], ['all', 'Full roster']], ui.pool)}</div>
      <label class="check" ${ui.pool === 'mine' ? '' : 'hidden'}><input type="checkbox" id="bd-invest" ${ui.invest ? 'checked' : ''}> Weigh my upgrade levels</label>
      <div class="field" style="flex:1 1 220px"><span>Leave out</span><div class="chips">${[...ui.exclude]
        .map((id) => `<button type="button" class="chip plain" data-unexclude="${id}" aria-label="Allow ${esc(getHero(id)?.name)}">${esc(getHero(id)?.name || id)} ${ICON.close}</button>`)
        .join('')}<button class="btn small" type="button" data-act="exclude">+ Leave out a hero</button></div></div>
    </div>
    ${m ? `<p class="small muted">${esc(m.name)} uses ${m.teams || 1} formation${(m.teams || 1) > 1 ? 's' : ''}. ${m.teamsNote ? esc(m.teamsNote) + ' ' : ''}${m.restrictions ? esc(m.restrictions) : ''}</p>` : ''}
    ${
      ui.pool === 'all'
        ? `<p class="callout small">${owned ? 'Using the full roster at full investment, as a theory build.' : 'Your hero bank is empty, so this uses the full roster as an example. Mark your heroes in the Hero Bank tab to get builds you can actually field.'}</p>`
        : ''
    }
    <div class="compare" id="bd-compare">
      <section><div class="side-title">${ICON.swords} Rules engine</div><div id="bd-engine"></div></section>
      <section><div class="side-title">${ICON.spark} Claude's take</div><div id="bd-claude"></div></section>
    </div>
    <div id="bd-saved"></div>`;
  renderEngine();
  renderClaude();
  renderSaved();
}

function coverageTags(score) {
  const names = { front: 'Frontline', sustain: 'Sustain', damage: 'Damage', control: 'Control', support: 'Buffs/debuffs' };
  return score.coverage
    .map((c) => `<span class="tag ${c.ok ? 'good' : 'bad'}" title="${c.have} of ${c.need} needed">${c.ok ? '✓' : '✗'} ${names[c.group] || c.group}</span>`)
    .join('');
}

function teamCard(t, i, ctx, { label = 'Team', saveable = true } = {}) {
  const score = t.score || scoreTeam(ctx, t.ids);
  const slots = t.slots || score.layout;
  const arts = t.artifacts && Object.keys(t.artifacts).length ? t.artifacts : {};
  for (const id of Object.values(slots)) {
    if (!arts[id]) {
      const s = suggestArtifact(getHero(id), { mode: ctx.mode, artifacts: data.artifacts, category: ctx.category });
      if (s) arts[id] = s.id;
    }
  }
  const members = POSITIONS.map((p) => slots[p])
    .filter(Boolean)
    .map((id) => {
      const mm = score.members.find((x) => x.id === id);
      const h = getHero(id);
      const why = (mm?.reasons || []).slice(0, 3).join(' · ');
      return `<li><b>${esc(h.name)}</b><span>${esc(why)}</span></li>`;
    })
    .join('');
  const syn = score.synergies.slice(0, 4).map((s) => `<li><b>${esc(getHero(s.a).name)} + ${esc(getHero(s.b).name)}</b><span>${esc(s.why || 'known synergy')}</span></li>`).join('');
  const up = ctx.entries ? nextUpgrade(ctx, Object.values(slots)) : null;
  const swaps = t.seed?.swaps?.length ? t.seed.swaps.map((s) => `${esc(getHero(s.from)?.name || s.from)} → ${esc(getHero(s.to)?.name || s.to)}`).join(', ') : '';
  const title = t.name || score.template?.name || t.seed?.name || '';
  return `<article class="result-card">
    <header><h4>${esc(label)} ${i + 1}${title ? `: ${esc(title)}` : ''}</h4><span class="score" title="Rules-engine score">${score.total.toFixed(1)} pts</span></header>
    ${board({ slots, artifacts: arts, showBank: ui.pool === 'mine' })}
    <div class="chips">${coverageTags(score)}</div>
    ${score.template ? `<p class="small"><span class="tag accent">Community template</span> matches "${esc(score.template.name)}" (${score.template.overlap}/${score.template.size} heroes)${swaps ? `, swapping ${swaps}` : ''}</p>` : ''}
    ${t.why ? `<p class="small prose">${esc(t.why)}</p>` : ''}
    ${t.risks ? `<p class="small muted">Risk: ${esc(t.risks)}</p>` : ''}
    <details><summary class="small">Why these heroes</summary><ul class="reasons" style="margin-top:6px">${members}${syn}</ul></details>
    ${up ? `<p class="small"><strong>Best next upgrade:</strong> ${esc(getHero(up.id).name)} ${esc(up.label)}</p>` : ''}
    ${saveable ? `<div class="toolbar"><button class="btn small" type="button" data-save='${esc(JSON.stringify({ slots, artifacts: arts, name: title || `${mode()?.name || 'Team'} ${i + 1}` }))}'>${ICON.save} Save formation</button></div>` : ''}
  </article>`;
}

function renderEngine() {
  const host = $('#bd-engine', root);
  if (!host) return;
  const r = ui.result;
  if (!r || !r.teams.length) {
    host.innerHTML = `<div class="empty"><h4>No heroes to build from</h4><p>Add heroes in the Hero Bank tab, or switch to the full roster.</p></div>`;
    return;
  }
  const short = r.teams.length < ui.count ? `<p class="callout small">Only ${r.teams.length} formation${r.teams.length > 1 ? 's' : ''} could be filled from ${poolIds().length} heroes.</p>` : '';
  const partial = r.teams.filter((t) => t.ids.length < 5).length;
  host.innerHTML = `${short}${partial ? '<p class="callout small">Some formations have fewer than 5 heroes. Add more heroes to your bank to fill them.</p>' : ''}
    <div class="results" style="grid-template-columns:minmax(0,1fr)">${r.teams.map((t, i) => teamCard(t, i, r.ctx)).join('')}</div>
    ${r.leftover?.length && ui.pool === 'mine' ? `<p class="small muted">On the bench: ${r.leftover.slice(0, 24).map((id) => esc(getHero(id)?.name)).join(', ')}${r.leftover.length > 24 ? '…' : ''}</p>` : ''}`;
}

function renderClaude() {
  const host = $('#bd-claude', root);
  if (!host) return;
  initAi().then(() => {
    if (!$('#bd-claude', root)) return;
    if (!aiState.text || aiState.disabled) {
      host.innerHTML = `<p class="callout info small">Claude's take is available when this page is open in Claude (claude.ai). The rules engine on the left works everywhere.</p>`;
      return;
    }
    if (ui.busy) {
      host.innerHTML = `<p class="small muted">Claude is working on ${ui.count} formation${ui.count > 1 ? 's' : ''}… this can take up to a minute.</p><div class="toolbar"><button class="btn" type="button" data-act="stop">${ICON.stop} Stop</button></div>`;
      return;
    }
    if (ui.claude) {
      const ctx = ui.result?.ctx || context();
      host.innerHTML = `<div class="results" style="grid-template-columns:minmax(0,1fr)">${ui.claude
        .map((t, i) => teamCard({ ...t, ids: Object.values(t.slots) }, i, ctx, { label: 'Team' }))
        .join('')}</div>${ui.claudeNotes ? `<p class="callout small">${esc(ui.claudeNotes)}</p>` : ''}
        <div class="toolbar"><button class="btn" type="button" data-act="claude">${ICON.spark} Ask again</button></div>`;
      return;
    }
    host.innerHTML = `<div class="empty"><p>Claude reviews the engine's teams with your exact upgrades and the mode's mechanics, then proposes its own lineups and explains them.</p>
      <button class="btn primary" type="button" data-act="claude" ${poolIds().length ? '' : 'disabled'}>${ICON.spark} Ask Claude to build ${ui.count} formation${ui.count > 1 ? 's' : ''}</button>
      <span class="small muted">Uses your Claude account.</span></div>`;
  });
}

function renderSaved() {
  const host = $('#bd-saved', root);
  if (!host) return;
  const items = formations.items;
  host.innerHTML = panel({
    id: 'builder-saved',
    title: 'Saved formations',
    sub: `${items.length}`,
    folded: !items.length,
    body: items.length
      ? `<div class="results">${items
          .map(
            (f) => `<article class="result-card"><header><h4>${esc(f.name)}</h4><span class="score">${esc(data.modeById.get(f.mode)?.name || f.mode || '')}</span></header>
          ${board({ slots: f.slots, artifacts: f.artifacts || {}, showBank: true, size: 48 })}
          <div class="toolbar"><span class="small muted">${new Date(f.saved).toLocaleDateString()}</span><span class="spacer"></span><button class="btn small ghost" type="button" data-del="${esc(f.id)}">${ICON.trash} Delete</button></div></article>`
          )
          .join('')}</div>`
      : '<p class="small muted">Save a formation from the results above to keep it here.</p>',
  });
}

async function askClaude() {
  const pool = poolIds();
  if (!pool.length) return;
  ui.busy = true;
  ui.ctl = new AbortController();
  renderClaude();
  try {
    const out = await claudeBuild({
      mode: mode(),
      count: ui.count,
      pool,
      entries: ui.pool === 'mine' ? bank.heroes : null,
      engineTeams: (ui.result?.teams || []).map((t) => ({ layout: t.score.layout })),
      signal: ui.ctl.signal,
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

function onClick(ev) {
  const t = ev.target;
  const set = (key, val) => {
    ui[key] = val;
    ui.claude = null;
    build();
    render();
  };
  const c = t.closest('[data-count]');
  if (c) return set('count', Number(c.dataset.count));
  const s = t.closest('[data-strategy]');
  if (s) return set('strategy', s.dataset.strategy);
  const p = t.closest('[data-pool]');
  if (p) return set('pool', p.dataset.pool);
  const un = t.closest('[data-unexclude]');
  if (un) {
    ui.exclude.delete(un.dataset.unexclude);
    return set('exclude', ui.exclude);
  }
  const sv = t.closest('[data-save]');
  if (sv) {
    const f = JSON.parse(sv.dataset.save);
    saveFormation({ ...f, mode: ui.modeId });
    toast('Formation saved.');
    renderSaved();
    return;
  }
  const del = t.closest('[data-del]');
  if (del) {
    deleteFormation(del.dataset.del);
    renderSaved();
    return;
  }
  const hb = t.closest('[data-hero]');
  if (hb && root.contains(hb)) {
    openHeroDetail(hb.dataset.hero);
    return;
  }
  const act = t.closest('[data-act]')?.dataset.act;
  if (act === 'exclude') {
    pickHero({ title: 'Leave a hero out', pool: ui.pool === 'mine' ? ownedIds() : null }).then((id) => {
      if (id) {
        ui.exclude.add(id);
        set('exclude', ui.exclude);
      }
    });
  } else if (act === 'claude') askClaude();
  else if (act === 'stop') ui.ctl?.abort();
}

function onChange(ev) {
  const t = ev.target;
  if (t.id === 'bd-mode') {
    ui.modeId = t.value;
    ui.count = mode()?.teams || 1;
    ui.strategy = defaultStrategy(mode());
    ui.claude = null;
    build();
    render();
  } else if (t.id === 'bd-invest') {
    ui.invest = t.checked;
    build();
    render();
  }
}

export function builderPortrait(id) {
  return portrait(getHero(id), { size: 40 });
}
