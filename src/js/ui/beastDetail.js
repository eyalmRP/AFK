// Beast detail drawer: ratings, skill, best partners and the player's own beast.

import { esc } from '../util.js';
import { data, hero as getHero } from '../data.js';
import { bank } from '../store.js';
import { tierPill, openDrawer, beastArt } from './common.js';

export function openBeastDetail(id) {
  const b = data.beastById.get(id);
  if (!b) return;
  const e = bank.beasts?.[id];
  const tiers = ['pve', 'pvp', 'boss'].map((c) => `<div class="cell"><span class="eyebrow">${c === 'boss' ? 'Bosses' : c.toUpperCase()}</span>${tierPill(b.tiers?.[c])}</div>`).join('');
  const best = (b.bestFor || []).map((x) => esc(getHero(x)?.name || data.modeById.get(x)?.name || x)).join(', ');
  openDrawer({
    title: esc(b.name),
    body: `<div style="display:flex;gap:14px;align-items:center">${beastArt(b.id, 88)}<div><span class="tag rarity-${esc(b.rarity)}">${esc(b.rarity)}</span><p class="small muted" style="margin-top:6px">Buffs go up to ${b.maxBuff}.</p></div></div>
      <div class="tier-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${tiers}</div>
      ${b.skill ? `<div class="side"><div class="side-title">Skill</div><p class="prose">${esc(b.skill)}</p>${(b.roles || []).length ? `<div class="chips">${b.roles.map((r) => `<span class="tag">${esc(r)}</span>`).join('')}</div>` : ''}</div>` : '<p class="small muted">Skill not researched yet. The weekly update fills this in.</p>'}
      ${b.suits ? `<div class="side"><div class="side-title">Suits</div><p class="prose">${esc(b.suits)}</p></div>` : ''}
      ${best ? `<div class="side"><div class="side-title">Best for</div><p class="small">${best}</p></div>` : ''}
      <div class="side"><div class="side-title">Your beast</div>${
        e?.owned ? `<p class="num">Level ${e.level ?? '–'} · Strength ${e.str ?? '–'} · Intelligence ${e.int ?? '–'} · Agility ${e.agi ?? '–'}</p>` : '<p class="small muted">Not in your bank. Add it in the Hero Bank tab.</p>'
      }</div>`,
  });
}
