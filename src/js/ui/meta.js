// Meta tab: weekly summary, hero tiers, artifacts, formations per mode
// (community vs AI side by side), combinations and PvP archetypes.

import { esc, fmtDate, $, local } from '../util.js';
import { data, TIERS, CATEGORIES, tierOf, tierScore, hero as getHero } from '../data.js';
import { entry as bankEntry, bank } from '../store.js';
import { ICON } from './icons.js';
import { makeContext, suggestBeast } from '../engine.js';
import { panel, heroTile, portrait, board, slotsFromList, artifactChip, artifactGlyph, tierPill, bindFolding, foldAll, isFolded, trendBadge, ownedBadge, gameFilterBar, handleGameFilter, artifactArt, beastArt, beastAllowed } from './common.js';
import { openHeroDetail } from './heroDetail.js';
import { openBeastDetail } from './beastDetail.js';

// Short descriptions shown under each tier letter, in the style of the
// reference tier list. data/meta.json can override them with `tierLabels`.
const TIER_DESC = {
  'S+': 'Must have: team cores, very broken',
  S: 'Broken',
  A: 'Good',
  B: 'Mid',
  C: 'Weak',
  D: 'Skip',
  '?': 'Not rated this week',
};
const ARTIFACT_DESC = { 'S+': 'Best in slot for most', S: 'Strong', A: 'Good', B: 'Situational', C: 'Niche', D: 'Skip', '?': 'Not rated yet' };

const ui = {
  category: 'overall',
  showNames: !!local.get('afk-codex-show-names', false),
  factions: new Set(),
  classes: new Set(),
  types: new Set(),
  q: '',
  ownedOnly: false,
};

let root;

export function mountMeta(el) {
  root = el;
  bindFolding(root);
  root.addEventListener('click', onClick);
  root.addEventListener('input', (ev) => {
    if (ev.target.id === 'tier-q') {
      ui.q = ev.target.value;
      renderTiers();
    }
  });
  root.addEventListener('change', (ev) => {
    if (ev.target.id === 'tier-owned') {
      ui.ownedOnly = ev.target.checked;
      renderTiers();
    } else if (ev.target.id === 'tier-names') {
      ui.showNames = ev.target.checked;
      local.set('afk-codex-show-names', ui.showNames);
      $('#tier-table', root)?.classList.toggle('show-names', ui.showNames);
    }
  });
  render();
}

export function refreshMeta() {
  if (root) renderTiers();
}

function onClick(ev) {
  const t = ev.target;
  const beastBtn = t.closest('[data-beast-detail]');
  if (beastBtn) {
    openBeastDetail(beastBtn.dataset.beastDetail);
    return;
  }
  const heroBtn = t.closest('[data-hero]');
  if (heroBtn && root.contains(heroBtn)) {
    openHeroDetail(heroBtn.dataset.hero);
    return;
  }
  const cat = t.closest('[data-cat]');
  if (cat) {
    ui.category = cat.dataset.cat;
    renderTiers();
    return;
  }
  if (t.closest('.gamebar') && handleGameFilter(ev, ui)) {
    renderTiers();
    return;
  }
  const all = t.closest('[data-fold-all]');
  if (all) {
    const scope = all.dataset.scope ? $(all.dataset.scope, root) : root;
    foldAll(scope, all.dataset.foldAll === 'fold');
  }
}

function render() {
  const m = data.meta;
  root.innerHTML = `
    <div class="view-head">
      <div>
        <p class="eyebrow">Week of ${esc(fmtDate(m.asOf))}</p>
        <h2>The current meta</h2>
        <p>Hero tiers, artifacts and the formations that win each game mode right now. Community picks and Claude's own analysis sit side by side so you can see where they agree.</p>
      </div>
      <div class="toolbar">
        <button class="btn small" type="button" data-fold-all="open">Expand all</button>
        <button class="btn small" type="button" data-fold-all="fold">Collapse all</button>
      </div>
    </div>
    ${summaryPanel()}
    ${panel({ id: 'meta-tiers', title: 'Hero tiers', sub: `${data.heroes.length} heroes`, body: '<div id="tiers-host"></div>' })}
    ${artifactsPanel()}
    ${beastsPanel()}
    ${modesPanel()}
    ${combosPanel()}
    ${archetypesPanel()}
    ${sourcesPanel()}
  `;
  renderTiers();
}

function summaryPanel() {
  const m = data.meta;
  const shifts = (m.metaShifts || []).slice(0, 6);
  const must = (m.mustBuild || []).map(getHero).filter(Boolean);
  const fresh = data.heroes.filter((h) => h.isNew).sort((a, b) => String(b.release).localeCompare(String(a.release))).slice(0, 10);
  const body = `
    ${m.summary ? `<p class="prose">${esc(m.summary)}</p>` : ''}
    <div class="grid-2">
      <div class="side">
        <div class="side-title">Must-build heroes</div>
        <div class="chips">${must.map((h) => heroTile(h, { size: 56 })).join('') || '<span class="muted">Not set this week.</span>'}</div>
      </div>
      <div class="side">
        <div class="side-title">Newest heroes</div>
        <div class="chips">${fresh.map((h) => heroTile(h, { size: 56, badge: '', sub: h.release ? String(h.release).slice(0, 7) : '' })).join('') || '<span class="muted">None recorded.</span>'}</div>
      </div>
    </div>
    ${
      shifts.length
        ? `<div class="side"><div class="side-title">What changed recently</div><ul class="list">${shifts
            .map((s) => `<li><span class="num muted">${esc(s.date || '')}</span> ${esc(s.text)}</li>`)
            .join('')}</ul></div>`
        : ''
    }`;
  return panel({ id: 'meta-summary', title: 'This week', sub: `updated ${esc(fmtDate(m.asOf))}`, body });
}

function tierControls() {
  const seg = CATEGORIES.map((c) => `<button type="button" data-cat="${c.id}" aria-pressed="${ui.category === c.id}">${c.label}</button>`).join('');
  return `<div class="toolbar">
      <div class="seg" role="group" aria-label="Rating category">${seg}</div>
      <label class="search">${ICON.search}<input class="input" id="tier-q" type="search" placeholder="Find hero" value="${esc(ui.q)}" autocomplete="off"></label>
      <label class="check"><input type="checkbox" id="tier-owned" ${ui.ownedOnly ? 'checked' : ''}> Only heroes I own</label>
      <label class="check"><input type="checkbox" id="tier-names" ${ui.showNames ? 'checked' : ''}> Show names</label>
      <span class="spacer"></span>
      <button class="btn ghost" type="button" data-fold-all="open" data-scope="#tier-table">Expand tiers</button>
      <button class="btn ghost" type="button" data-fold-all="fold" data-scope="#tier-table">Fold tiers</button>
    </div>
    ${gameFilterBar(ui)}`;
}

function heroMatches(h) {
  if (ui.factions.size && !ui.factions.has(h.faction)) return false;
  if (ui.classes.size && !ui.classes.has(h.class)) return false;
  if (ui.types.size && !ui.types.has(h.type)) return false;
  if (ui.ownedOnly && !bankEntry(h.id)?.owned) return false;
  if (ui.q) {
    const s = ui.q.toLowerCase();
    if (!h.name.toLowerCase().includes(s) && !(h.title || '').toLowerCase().includes(s)) return false;
  }
  return true;
}

function overallScore(h) {
  return ['pve', 'pvp', 'boss'].reduce((a, c) => a + tierScore(tierOf(h, c)), 0);
}

function renderTiers() {
  const host = $('#tiers-host', root);
  if (!host) return;
  const cat = ui.category;
  const groups = new Map([...TIERS, '?'].map((t) => [t, []]));
  for (const h of data.heroes) {
    if (!heroMatches(h)) continue;
    const t = tierOf(h, cat);
    groups.get(t && groups.has(t) ? t : '?').push(h);
  }
  for (const list of groups.values()) list.sort((a, b) => overallScore(b) - overallScore(a) || a.name.localeCompare(b.name));
  const labels = { ...TIER_DESC, ...(data.meta.tierLabels || {}) };
  const rows = [...groups.entries()]
    .filter(([t, list]) => list.length || t !== '?')
    .map(([t, list]) => {
      const id = `tier-${cat}-${t}`;
      const folded = isFolded(id, t === '?' || t === 'D');
      const name = t === '?' ? 'Not rated' : t;
      return `<div class="tier-row" data-tier="${esc(t)}" data-fold-id="${esc(id)}" data-folded="${folded}">
        <button class="tier-label" type="button" data-fold-toggle aria-expanded="${!folded}" title="${folded ? 'Expand' : 'Fold'} ${esc(name)}">
          <span class="letter">${esc(t === '?' ? '–' : t)}</span><span class="desc">${esc(labels[t] || '')}</span><span class="cnt">${list.length}${ICON.chevron}</span>
        </button>
        <div class="tier-heroes">${list.length ? list.map(tmTile).join('') : '<span class="tier-empty">No heroes match the filters.</span>'}</div>
        <div class="tier-folded" data-fold-toggle>${list
          .slice(0, 14)
          .map((h) => tmTile(h, { mini: true }))
          .join('')}<span class="more">${list.length > 14 ? `+${list.length - 14} · ` : ''}${list.length} hero${list.length === 1 ? '' : 'es'} folded</span></div>
      </div>`;
    })
    .join('');
  host.innerHTML = `${tierControls()}<div class="tier-table${ui.showNames ? ' show-names' : ''}" id="tier-table">${rows}</div>
    <p class="small muted">S+ is best and D weakest, merged from the community sources listed at the bottom. A hero's name shows on hover; select it for kit, synergies and each source's rating. Corner marks: ▲ rising, ▼ falling, NEW released in the past year, ✓ in your hero bank.</p>`;
}

// One square portrait in the TierMaker style: no frame, name on hover.
function tmTile(h, { mini = false } = {}) {
  const img = h.img ? `<img src="${esc(h.img)}" alt="" loading="lazy" data-fallback="${esc(h.name.slice(0, 2))}">` : `<span class="initials">${esc(h.name.slice(0, 2))}</span>`;
  if (mini) return `<span class="tm-tile" aria-hidden="true">${img}</span>`;
  return `<button class="tm-tile" type="button" data-hero="${esc(h.id)}" title="${esc(h.name)} · ${esc(h.faction)} ${esc(h.class)}" aria-label="${esc(h.name)}">${img}${trendBadge(h)}${ownedBadge(h.id)}<span class="tm-name">${esc(h.name)}</span></button>`;
}

// ---- artifacts ---------------------------------------------------------------

function artifactsPanel() {
  const list = data.artifacts;
  if (!list.length) return '';
  const rank = (t) => TIERS.indexOf(t);
  const groups = new Map();
  for (const a of list) {
    const best = [a.tier?.pve, a.tier?.pvp].filter(Boolean).sort((x, y) => rank(x) - rank(y))[0] || '?';
    if (!groups.has(best)) groups.set(best, []);
    groups.get(best).push(a);
  }
  const rows = [...TIERS, '?']
    .filter((t) => groups.has(t))
    .map((t) => {
      const id = `art-tier-${t}`;
      const folded = isFolded(id, false);
      const items = groups.get(t);
      return `<div class="tier-row art-row" data-tier="${t}" data-fold-id="${id}" data-folded="${folded}">
        <button class="tier-label" type="button" data-fold-toggle aria-expanded="${!folded}"><span class="letter">${t === '?' ? '–' : t}</span><span class="desc">${ARTIFACT_DESC[t] || ''}</span><span class="cnt">${items.length}${ICON.chevron}</span></button>
        <div class="tier-heroes artifact-list">${items.map(artifactCard).join('')}</div>
        <div class="tier-folded" data-fold-toggle>${items.map((a) => `<span class="tm-tile" aria-hidden="true" title="${esc(a.name)}">${a.img ? `<img src="${esc(a.img)}" alt="">` : ''}</span>`).join('')}<span class="more">${items.length} artifact${items.length === 1 ? '' : 's'} folded</span></div>
      </div>`;
    })
    .join('');
  const tw = data.teamWide;
  const twBody =
    tw && tw.items?.length
      ? `<div class="side"><div class="side-title">${esc(tw.name)}</div><div class="artifact-list" style="padding:0">${tw.items
          .map(
            (x) => `<div class="artifact-card">${artifactGlyph(x.name)}<div><h4>${esc(x.name)}</h4><p>${esc(x.effect || '')}</p>${x.meta ? `<p class="small"><strong>Meta:</strong> ${esc(x.meta)}</p>` : ''}</div></div>`
          )
          .join('')}</div></div>`
      : '';
  return panel({
    id: 'meta-artifacts',
    title: 'Artifacts',
    sub: `${list.length} artifacts`,
    body: `<div class="tier-table">${rows}</div>${twBody}${
      (data.collections || []).length
        ? `<p class="small"><span class="muted">Ghoulish Gallery collections (fit the artifact slot, not rated yet):</span> ${data.collections.map((c) => esc(c.name)).join(', ')}</p>`
        : ''
    }<p class="small muted">Each artifact sits in the row of its better rating (PvE or PvP). The card shows both.</p>`,
  });
}

function artifactCard(a) {
  const bis = (a.bis || []).map(getHero).filter(Boolean);
  return `<div class="artifact-card">
    ${artifactArt(a.id, a.name)}
    <div>
      <h4>${esc(a.name)}</h4>
      <p>${esc(a.effect || a.note || '')}</p>
      <div class="row"><span class="tag">PvE ${tierPill(a.tier?.pve)}</span><span class="tag">PvP ${tierPill(a.tier?.pvp)}</span>${(a.suits || [])
        .slice(0, 4)
        .map((s) => `<span class="tag">${esc(s)}</span>`)
        .join('')}</div>
      ${a.restriction ? `<p class="small muted" style="margin-top:4px">${esc(a.restriction)}</p>` : ''}
      ${bis.length ? `<div class="row">${bis.slice(0, 6).map((h) => `<button type="button" class="hero-tile" style="width:auto;padding:2px" data-hero="${h.id}" title="${esc(h.name)}">${portrait(h, { size: 30 })}</button>`).join('')}</div>` : ''}
    </div>
  </div>`;
}

// ---- beasts ------------------------------------------------------------------------

const BEAST_DESC = { 'S+': 'Best beasts', S: 'Strong', A: 'Good', B: 'Situational', C: 'Niche', D: 'Skip', '?': 'Not rated yet' };

function beastTile(b) {
  const owned = bank.beasts?.[b.id]?.owned;
  return `<button class="tm-tile" type="button" data-beast-detail="${esc(b.id)}" title="${esc(b.name)} · ${esc(b.rarity)}" aria-label="${esc(b.name)}">
    <img src="${esc(b.img)}" alt="" loading="lazy">${owned ? `<span class="owned-mark" title="You own this beast">${ICON.check}</span>` : ''}<span class="tm-name">${esc(b.name)}</span></button>`;
}

function beastsPanel() {
  const list = data.beasts || [];
  if (!list.length) return '';
  const rank = (t) => TIERS.indexOf(t);
  const groups = new Map();
  for (const b of list) {
    const best = [b.tiers?.pve, b.tiers?.pvp, b.tiers?.boss, b.tiers?.overall].filter(Boolean).sort((x, y) => rank(x) - rank(y))[0] || '?';
    if (!groups.has(best)) groups.set(best, []);
    groups.get(best).push(b);
  }
  const rows = [...TIERS, '?']
    .filter((t) => groups.has(t))
    .map((t) => {
      const id = `beast-tier-${t}`;
      const folded = isFolded(id, false);
      const items = groups.get(t);
      return `<div class="tier-row" data-tier="${t}" data-fold-id="${id}" data-folded="${folded}">
        <button class="tier-label" type="button" data-fold-toggle aria-expanded="${!folded}"><span class="letter">${t === '?' ? '–' : t}</span><span class="desc">${BEAST_DESC[t]}</span><span class="cnt">${items.length}${ICON.chevron}</span></button>
        <div class="tier-heroes">${items.map(beastTile).join('')}</div>
        <div class="tier-folded" data-fold-toggle>${items.map((b) => `<span class="tm-tile" aria-hidden="true" title="${esc(b.name)}"><img src="${esc(b.img)}" alt=""></span>`).join('')}<span class="more">${items.length} beast${items.length === 1 ? '' : 's'} folded</span></div>
      </div>`;
    })
    .join('');
  const sys = data.beastSystem;
  const recs = (data.beastModes || [])
    .map((r) => {
      const b = data.beastById.get(r.beast);
      if (!b) return '';
      const m = data.modeById.get(r.mode);
      return `<li>${beastArt(b.id, 22)} <strong>${esc(b.name)}</strong>${m ? ` in ${esc(m.name)}` : ''}${r.heroes?.length ? ` with ${r.heroes.map((h) => esc(getHero(h)?.name || h)).join(', ')}` : ''}${r.why ? ` <span class="muted">${esc(r.why)}</span>` : ''}</li>`;
    })
    .join('');
  return panel({
    id: 'meta-beasts',
    title: 'Beasts',
    sub: `${list.length} beasts`,
    body: `${sys?.summary ? `<p class="prose">${esc(sys.summary)}</p>` : ''}
      <div class="tier-table">${rows}</div>
      ${recs ? `<div class="side"><div class="side-title">Community beast picks</div><ul class="list small">${recs}</ul></div>` : ''}
      <p class="small muted">Each beast sits in the row of its best rating across PvE, PvP and bosses. Select a beast for its skill and buffs. ✓ marks beasts in your bank.</p>`,
  });
}

// ---- formations per mode --------------------------------------------------------

const MODE_GROUPS = [
  { id: 'pve', label: 'Campaign & towers' },
  { id: 'boss', label: 'Bosses & realms' },
  { id: 'pvp', label: 'PvP' },
  { id: 'event', label: 'Events & other modes' },
];

function teamHeroes(t) {
  return (t.heroes || []).map((x) => x.id).concat(t.cores || []);
}

export function agreement(mode) {
  const c = new Set((mode.community || []).flatMap(teamHeroes));
  const a = (mode.ai || []).flatMap(teamHeroes);
  if (!c.size || !a.length) return null;
  const aSet = new Set(a);
  const shared = [...aSet].filter((id) => c.has(id)).length;
  return Math.round((shared / aSet.size) * 100);
}

const CONS_LABEL = { strong: ['good', 'Strong consensus'], common: ['accent', 'Common pick'], niche: ['', 'Niche'] };

function heroNames(ids) {
  return ids.map((x) => esc(getHero(x)?.name || x)).join(', ');
}

function communityCard(t) {
  const [cls, label] = CONS_LABEL[t.consensus] || CONS_LABEL.common;
  const subs = Object.entries(t.subs || {})
    .map(([id, alts]) => `${esc(getHero(id)?.name || id)} → ${alts.map((x) => esc(getHero(x)?.name || x)).join(' / ')}`)
    .join('; ');
  const opts = (t.options || []).map((o) => `<p class="small"><span class="muted">${esc(o.label)}:</span> ${heroNames(o.ids)}</p>`).join('');
  const srcs = (t.sources || []).slice(0, 3).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(hostOf(u))}</a>`).join(' · ');
  const flags = [
    t.dated ? '<span class="tag warn" title="The source is older than a year">Dated source</span>' : '',
    t.partial ? '<span class="tag" title="The source names only these heroes">Core only</span>' : '',
    t.positionsInferred && !t.partial ? '<span class="tag" title="The source did not give slots; positions follow hero class and role">Positions inferred</span>' : '',
  ].join('');
  const body =
    t.kind === 'cores'
      ? `<p class="small muted">Separate comps, each built around one of these heroes:</p><div class="chips">${(t.cores || [])
          .map(getHero)
          .filter(Boolean)
          .map((h) => heroTile(h, { size: 48 }))
          .join('')}</div>`
      : board({ slots: slotsFromList(t.heroes), artifacts: t.artifacts || {}, emptyLabel: '?' });
  return `<div class="team-card">
    <h5>${esc(t.name)} <span class="tag ${cls}">${label}</span>${flags}</h5>
    ${body}
    ${t.why ? `<p class="why">${esc(t.why)}</p>` : ''}
    ${opts}
    ${subs ? `<p class="small"><span class="muted">Substitutes:</span> ${subs}</p>` : ''}
    ${t.artifactNote ? `<p class="small"><span class="muted">Artifacts:</span> ${esc(t.artifactNote)}</p>` : ''}
    ${srcs ? `<p class="sources">${t.date ? `${esc(t.date)} · ` : ''}${srcs}</p>` : ''}
  </div>`;
}

// Beast for an AI team: the stored pick, or the best-rated beast for the
// team and mode when the weekly analysis has not named one.
function aiBeast(t, mode) {
  if (t.beast) return { id: t.beast, reasons: [] };
  if (!data.beasts?.length || !beastAllowed(mode)) return null;
  const ctx = makeContext({ heroes: data.heroById, mode });
  return suggestBeast(ctx, (t.heroes || []).map((x) => x.id), { beasts: data.beasts, owned: null, recommendations: data.beastModes });
}

function aiCard(t, mode) {
  const bp = aiBeast(t, mode);
  return `<div class="team-card">
    <h5>${esc(t.name)} ${t.confidence ? `<span class="tag accent">${esc(t.confidence)} confidence</span>` : ''}</h5>
    ${board({ slots: slotsFromList(t.heroes), artifacts: t.artifacts || {}, beast: bp?.id || null })}
    ${bp && !t.beast ? `<p class="beast-why"><strong>${esc(data.beastById.get(bp.id).name)}</strong>${bp.reasons?.length ? ` · ${esc(bp.reasons.slice(0, 2).join(' · '))}` : ''}</p>` : ''}
    ${t.why ? `<p class="why">${esc(t.why)}</p>` : ''}
    ${t.differs ? `<p class="small"><span class="muted">Compared with the community:</span> ${esc(t.differs)}</p>` : ''}
    ${t.upgrade ? `<p class="small"><span class="muted">Swap-ins:</span> ${esc(t.upgrade)}</p>` : ''}
  </div>`;
}

function hostOf(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
}

function modeCard(mode) {
  const id = `mode-${mode.id}`;
  const folded = isFolded(id, true);
  const ag = agreement(mode);
  const unknown = (mode.bossesUnknown || []).length ? ` <span class="muted">Not yet researched: ${mode.bossesUnknown.map(esc).join(', ')}.</span>` : '';
  const bosses = (mode.bosses || []).length
    ? `<details class="small"><summary>Bosses and mechanics (${mode.bosses.length})</summary><ul class="list">${mode.bosses
        .map((b) => `<li><strong>${esc(b.name)}</strong>: ${esc(b.mechanics || '')}${b.teams ? ` <span class="muted">Best: ${esc(b.teams)}</span>` : ''}</li>`)
        .join('')}</ul>${unknown}</details>`
    : unknown
      ? `<p class="small">${unknown}</p>`
      : '';
  const sets = (mode.teamSets || []).length
    ? `<div class="side"><div class="side-title">${ICON.people} Full ${mode.teams}-team sets (community)</div>${mode.teamSets
        .map(
          (set, i) => `<div class="team-card"><h5>Set ${i + 1}</h5><div class="results" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">${set
            .map((t) => `<div>${t.name ? `<p class="small"><strong>${esc(t.name)}</strong></p>` : ''}${board({ slots: slotsFromList(t.heroes), artifacts: t.artifacts || {}, size: 46 })}</div>`)
            .join('')}</div></div>`
        )
        .join('')}</div>`
    : '';
  return `<div class="mode" data-fold-id="${id}" data-folded="${folded}">
    <div class="mode-head" data-fold-toggle role="button" tabindex="0" aria-expanded="${!folded}">
      ${ICON.chevron}<h4>${esc(mode.name)}</h4>
      <span class="tag">${mode.teams || 1} team${(mode.teams || 1) > 1 ? 's' : ''}</span>
      ${ag !== null ? `<span class="agree" title="Share of the AI's heroes that also appear in community teams">Agreement <span class="bar"><i style="width:${ag}%"></i></span> ${ag}%</span>` : '<span class="agree"></span>'}
    </div>
    <div class="mode-body">
      ${mode.whatMatters ? `<p class="prose">${esc(mode.whatMatters)}</p>` : ''}
      ${mode.restrictions ? `<p class="small"><span class="muted">Rules:</span> ${esc(mode.restrictions)}</p>` : ''}
      ${mode.teamsNote ? `<p class="small"><span class="muted">Teams:</span> ${esc(mode.teamsNote)}</p>` : ''}
      ${bosses}
      <div class="side-by-side">
        <div class="side"><div class="side-title">${ICON.people} Community consensus</div>${(mode.community || []).map(communityCard).join('') || '<p class="muted small">No community team recorded yet.</p>'}</div>
        <div class="side ai"><div class="side-title">${ICON.spark} AI analysis</div>${(mode.ai || []).map((t) => aiCard(t, mode)).join('') || '<p class="muted small">No AI analysis yet.</p>'}${
          mode.aiNotes ? `<p class="small prose">${esc(mode.aiNotes)}</p>` : ''
        }</div>
      </div>
      ${sets}
    </div>
  </div>`;
}

function modesPanel() {
  if (!data.modes.length) return '';
  const body = MODE_GROUPS.map((g) => {
    const modes = data.modes.filter((m) => !m.builderOnly && (m.group || m.category) === g.id);
    if (!modes.length) return '';
    return `<div class="mode-group"><h4>${g.label}</h4>${modes.map(modeCard).join('')}</div>`;
  }).join('');
  return panel({
    id: 'meta-modes',
    title: 'Formations by game mode',
    sub: `${data.modes.filter((m) => !m.builderOnly).length} modes`,
    body: `<div class="toolbar"><span class="muted small">Open a mode to compare what the community runs with what Claude's analysis picks.</span><span class="spacer"></span>
      <button class="btn small ghost" type="button" data-fold-all="open" data-scope="#modes-host">Open all modes</button>
      <button class="btn small ghost" type="button" data-fold-all="fold" data-scope="#modes-host">Close all modes</button></div>
      <div id="modes-host" style="display:flex;flex-direction:column;gap:14px">${body}</div>`,
  });
}

// ---- combos & archetypes -----------------------------------------------------------

function comboRow(c) {
  const hs = (c.heroes || []).map(getHero).filter(Boolean);
  return `<div class="combo"><div class="heroes">${hs.map((h) => `<button type="button" class="hero-tile" style="width:auto;padding:0" data-hero="${h.id}" title="${esc(h.name)}">${portrait(h, { size: 40 })}</button>`).join('')}</div>
    <div class="txt"><strong>${esc(c.name || hs.map((h) => h.name).join(' + '))}</strong>${c.modes?.length ? ` <span class="muted small">${c.modes.map(esc).join(', ')}</span>` : ''}<p>${esc(c.why || '')}</p></div></div>`;
}

function combosPanel() {
  const { community = [], ai = [] } = data.combos || {};
  if (!community.length && !ai.length) return '';
  return panel({
    id: 'meta-combos',
    title: 'Best combinations',
    sub: `${community.length} community · ${ai.length} AI`,
    body: `<div class="side-by-side">
      <div class="side"><div class="side-title">${ICON.people} Community consensus</div><div class="combo-list">${community.map(comboRow).join('')}</div></div>
      <div class="side ai"><div class="side-title">${ICON.spark} AI analysis</div><div class="combo-list">${ai.map(comboRow).join('')}</div></div>
    </div>`,
  });
}

function archetypesPanel() {
  const list = data.archetypes || [];
  if (!list.length) return '';
  const rows = list
    .map((a) => {
      const core = (a.core || []).map(getHero).filter(Boolean);
      const ctr = (a.counteredBy || []).map((x) => getHero(x)?.name || x);
      return `<div class="combo"><div class="heroes">${core.map((h) => `<button type="button" class="hero-tile" style="width:auto;padding:0" data-hero="${h.id}" title="${esc(h.name)}">${portrait(h, { size: 40 })}</button>`).join('')}</div>
      <div class="txt"><strong>${esc(a.name)}</strong><p>${esc(a.why || '')}</p>${ctr.length ? `<p class="small"><span class="muted">Countered by:</span> ${ctr.map(esc).join(', ')}</p>` : ''}</div></div>`;
    })
    .join('');
  return panel({ id: 'meta-archetypes', title: 'PvP archetypes and their counters', sub: `${list.length} archetypes`, body: `<div class="combo-list">${rows}</div>`, folded: true });
}

const KIND_LABEL = { tiers: 'Tier lists', formations: 'Formations and modes', systems: 'Artifacts and systems', beasts: 'Beasts', roster: 'Hero roster and portraits' };

function sourcesPanel() {
  const m = data.meta;
  const groups = {};
  for (const s of m.sources || []) (groups[s.kind || 'other'] ||= []).push(s);
  const src = Object.entries(groups)
    .map(
      ([k, list]) => `<details ${k === 'tiers' ? 'open' : ''}><summary class="small"><strong>${esc(KIND_LABEL[k] || k)}</strong> (${list.length})</summary><ul class="list small">${list
        .map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a> <span class="muted num">${esc(s.date || '')}</span></li>`)
        .join('')}</ul></details>`
    )
    .join('');
  const log = (m.changelog || [])
    .slice(0, 8)
    .map((c) => `<li><span class="num muted">${esc(c.date)}</span> ${esc((c.changes || []).join(' · '))}</li>`)
    .join('');
  const gaps = (m.gaps || []).map((g) => `<li>${esc(g)}</li>`).join('');
  return panel({
    id: 'meta-sources',
    title: 'Sources and method',
    sub: `${(m.sources || []).length} sources`,
    folded: true,
    body: `<p class="prose">${esc(m.method || '')}</p>
      ${gaps ? `<div class="side"><div class="side-title">Known gaps this week</div><ul class="list small">${gaps}</ul></div>` : ''}
      <div class="grid-2"><div class="side"><div class="side-title">Sources this week</div>${src}</div>
      <div class="side"><div class="side-title">Update log</div><ul class="list small">${log || '<li>First edition.</li>'}</ul></div></div>`,
  });
}
