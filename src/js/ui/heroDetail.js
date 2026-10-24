// Hero detail drawer: ratings by category and source, kit, synergies,
// counters, artifacts and the player's own copy.

import { esc } from '../util.js';
import { data, CATEGORIES, tierOf, hero as getHero } from '../data.js';
import { entry as bankEntry, effectiveLevel } from '../store.js';
import { suggestArtifact } from '../engine.js';
import { upgradeText } from './emblem.js';
import { portrait, tierPill, openDrawer, closeDrawer, classLabel, typeLabel, factionLabel, trendBadge, artifactChip, starRow, ascText, heroCR, fmtCR, CR_NOTE } from './common.js';

const MODE_LABEL = {
  pvp: 'PvP',
  campaign: 'Campaign',
  towers: 'Towers',
  'guild-hunt-wrizz': 'Wrizz',
  'guild-hunt-soren': 'Soren',
  'twisted-realm': 'Twisted Realm',
  'cursed-realm': 'Cursed Realm',
  abyssal: 'Abyssal Expedition',
  labyrinth: 'Labyrinth',
  'legends-championship': 'Legends Championship',
  'treasure-scramble': 'Treasure Scramble',
  peaks: 'Peaks of Time',
};

function heroLink(id, why) {
  const h = getHero(id);
  if (!h) return `<span class="tag">${esc(id)}</span>`;
  return `<button type="button" class="combo" data-hero-link="${esc(h.id)}" style="cursor:pointer;text-align:left;width:100%">
    <span class="heroes">${portrait(h, { size: 40 })}</span><span class="txt"><strong>${esc(h.name)}</strong>${why ? `<p>${esc(why)}</p>` : ''}</span></button>`;
}

export function openHeroDetail(id) {
  const h = getHero(id);
  if (!h) return;
  const e = bankEntry(id);
  const tiers = CATEGORIES.map(
    (c) => `<div class="cell"><span class="eyebrow">${c.label}</span>${tierPill(c.id === 'overall' ? h.tiers.overall : tierOf(h, c.id))}</div>`
  ).join('');
  const raw = Object.entries(h.raw || {});
  const srcName = (sid) => (data.meta.sources || []).find((s) => s.id === sid)?.name || sid;
  const syn = (h.synergies || []).filter((s) => getHero(s.id));
  const counters = (h.counters || []).map((x) => getHero(x)?.name || x);
  const countered = (h.counteredBy || []).map((x) => getHero(x)?.name || x);
  const bis = data.artifacts.filter((a) => (a.bis || []).includes(h.id));
  const sugg = !bis.length ? suggestArtifact(h, { artifacts: data.artifacts, category: 'pve' }) : null;
  const inv = h.investment;
  const body = `
    <div style="display:flex;gap:14px;align-items:center">
      ${portrait(h, { size: 88, showBank: true, badge: trendBadge(h) })}
      <div style="display:flex;flex-direction:column;gap:6px;min-width:0">
        ${h.title ? `<span class="muted">${esc(h.title)}</span>` : ''}
        <div class="chips">
          ${factionLabel(h.faction)}
          ${classLabel(h.class)}
          ${typeLabel(h.type)}
          ${h.position ? `<span class="tag">${esc(h.position)} line</span>` : ''}
          ${h.release ? `<span class="tag">since ${esc(h.release)}</span>` : ''}
        </div>
      </div>
    </div>
    <div class="tier-grid">${tiers}</div>
    ${h.tierNote ? `<p class="prose">${esc(h.tierNote)}${h.consensus ? ` <span class="tag">${esc(h.consensus)} consensus</span>` : ''}</p>` : ''}
    ${
      raw.length
        ? `<details><summary class="small">Ratings by source (${raw.length})</summary><dl class="kv small" style="margin-top:8px">${raw
            .map(([k, v]) => `<dt>${esc(srcName(k))}</dt><dd>${esc(v)}</dd>`)
            .join('')}</dl></details>`
        : ''
    }
    ${h.kit ? `<div class="side"><div class="side-title">What the hero does</div><p class="prose">${esc(h.kit)}</p>
      ${(h.roles || []).length ? `<div class="chips">${h.roles.map((r) => `<span class="tag">${esc(r)}</span>`).join('')}</div>` : ''}</div>` : ''}
    ${syn.length ? `<div class="side"><div class="side-title">Works well with</div><div class="combo-list">${syn.map((s) => heroLink(s.id, s.why)).join('')}</div></div>` : ''}
    ${
      counters.length || countered.length
        ? `<div class="grid-2">
        <div class="side"><div class="side-title">Good against</div><p class="small">${counters.map(esc).join(', ') || '<span class="muted">–</span>'}</p></div>
        <div class="side"><div class="side-title">Struggles against</div><p class="small">${countered.map(esc).join(', ') || '<span class="muted">–</span>'}</p></div></div>`
        : ''
    }
    <div class="side"><div class="side-title">Artifacts</div><div class="chips">${
      bis.length ? bis.map((a) => artifactChip(a.id)).join('') : sugg ? `${artifactChip(sugg.id)} <span class="muted small">${esc(sugg.why)}</span>` : '<span class="muted small">No recommendation recorded.</span>'
    }</div></div>
    ${
      inv
        ? `<div class="side"><div class="side-title">Investment priorities</div><dl class="kv small">
        ${inv.si ? `<dt>Signature item</dt><dd>+${inv.si}</dd>` : ''}${inv.furniture ? `<dt>Furniture</dt><dd>${inv.furniture}F</dd>` : ''}${inv.engrave ? `<dt>Engraving</dt><dd>E${inv.engrave}</dd>` : ''}${
          inv.note ? `<dt>Note</dt><dd>${esc(inv.note)}</dd>` : ''
        }</dl></div>`
        : ''
    }
    ${(h.modes || []).length ? `<div class="side"><div class="side-title">Shines in</div><div class="chips">${h.modes.map((m) => `<span class="tag">${esc(MODE_LABEL[m] || data.modeById.get(m)?.name || m)}</span>`).join('')}</div></div>` : ''}
    <div class="side"><div class="side-title">Your copy</div>${
      e?.owned
        ? `<p class="num">${ascText(e.asc)}${e.asc === 'Ascended' ? starRow(e.stars, { engrave: e.engrave }) : ''} · Lv ${effectiveLevel(id)} · SI ${esc(upgradeText(e, 'si'))} · ${esc(upgradeText(e, 'furniture'))}F · E${esc(upgradeText(e, 'engrave'))} · T${e.gear ?? '–'} gear</p><p class="small" title="${esc(CR_NOTE)}">Combat rating ≈ <strong class="num">${fmtCR(heroCR(h))}</strong> <span class="muted">(estimate)</span></p>${e.est?.length ? '<p class="small muted">Values with + or &lt; are minimums read from the card icon.</p>' : ''}`
        : '<p class="muted small">Not in your hero bank.</p>'
    }</div>`;
  const d = openDrawer({
    title: esc(h.name),
    body,
    foot: `<button class="btn primary" type="button" data-edit>${e?.owned ? 'Edit my copy' : 'Add to my hero bank'}</button>`,
  });
  d.addEventListener('click', (ev) => {
    const link = ev.target.closest('[data-hero-link]');
    if (link) {
      openHeroDetail(link.dataset.heroLink);
      return;
    }
    if (ev.target.closest('[data-edit]')) {
      closeDrawer();
      document.dispatchEvent(new CustomEvent('codex:edit-hero', { detail: { id } }));
    }
  });
}
