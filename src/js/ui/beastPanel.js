// Beasts panel on the Hero Bank tab: which beasts the player owns and their
// Strength / Intelligence / Agility buff levels, by hand or from screenshots.

import { esc, $, $$, toast, toInt } from '../util.js';
import { data, BEAST_BUFFS } from '../data.js';
import { bank, updateBeasts, ownedBeasts } from '../store.js';
import { aiState, initAi, readBeasts, errorCopy } from '../ai.js';
import { ICON, typeIcon } from './icons.js';
import { panel, beastArt } from './common.js';

let root = null;
let showAll = true;
let review = null;

function summary() {
  return `${ownedBeasts().length} of ${data.beasts.length} owned`;
}

function card(b) {
  const e = bank.beasts[b.id] || {};
  const owned = !!e.owned;
  return `<div class="beast-card" data-beast="${esc(b.id)}" data-owned="${owned}">
    <div class="beast-top">${beastArt(b.id, 52)}<div style="min-width:0"><strong>${esc(b.name)}</strong><br><span class="tag rarity-${esc(b.rarity)}">${esc(b.rarity)}</span></div></div>
    <label class="check"><input type="checkbox" data-beast-own="${esc(b.id)}" ${owned ? 'checked' : ''}> Owned</label>
    <div class="buffs">${BEAST_BUFFS.map(
      (f) => `<label class="buff" title="${f.type} buff (0–${b.maxBuff})">${typeIcon(f.type)}<input class="input num-input" type="number" min="0" max="${b.maxBuff}" data-beast-buff="${esc(b.id)}" data-key="${f.key}" value="${e[f.key] ?? ''}" placeholder="–" aria-label="${esc(b.name)} ${f.type} buff"></label>`
    ).join('')}</div>
  </div>`;
}

function grid() {
  const list = data.beasts.filter((b) => showAll || bank.beasts[b.id]?.owned);
  return list.length ? list.map(card).join('') : '<p class="small muted">No beasts marked as owned yet.</p>';
}

export function beastPanel() {
  if (!data.beasts?.length) return '';
  const body = `<div class="toolbar">
      <div class="seg" role="group" aria-label="Beasts shown"><button type="button" data-beast-show="all" aria-pressed="${showAll}">All beasts</button><button type="button" data-beast-show="owned" aria-pressed="${!showAll}">Owned</button></div>
      <button class="btn" type="button" data-beast-upload hidden>${ICON.upload} Read screenshots</button>
      <input type="file" id="beast-file" accept="image/png,image/jpeg,image/webp" multiple hidden>
      <span class="small muted" id="beast-status"></span>
    </div>
    <div id="beast-review"></div>
    <div class="beast-grid" id="beast-grid">${grid()}</div>
    <p class="small muted">${esc(
      data.beastSystem?.summary ||
        'A beast joins a formation in the modes that allow one. Its three buffs raise heroes of that type: Strength, Intelligence or Agility. Buffs go to 12, or 18 on legendary beasts.'
    )} The builder and counter pick the owned beast that fits each team best.</p>`;
  return panel({ id: 'bank-beasts', title: 'Beasts', sub: `<span id="beast-sub">${summary()}</span>`, body, folded: false });
}

export function refreshBeastPanel() {
  if (!root) return;
  const g = $('#beast-grid', root);
  if (g && !g.contains(document.activeElement)) g.innerHTML = grid();
  const sub = $('#beast-sub', root);
  if (sub) sub.textContent = summary();
}

export function bindBeastPanel(el) {
  root = el;
  initAi().then(() => {
    const b = $('[data-beast-upload]', root);
    if (b) b.hidden = !(aiState.images && !aiState.disabled);
  });
  root.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.dataset.beastOwn) {
      t.closest('.beast-card')?.setAttribute('data-owned', String(t.checked));
      updateBeasts({ [t.dataset.beastOwn]: { owned: t.checked } });
    } else if (t.dataset.beastBuff) {
      const b = data.beastById.get(t.dataset.beastBuff);
      const v = t.value === '' ? null : Math.max(0, Math.min(b.maxBuff, toInt(t.value)));
      const cardEl = t.closest('.beast-card');
      cardEl?.setAttribute('data-owned', 'true');
      const box = cardEl?.querySelector('[data-beast-own]');
      if (box) box.checked = true;
      updateBeasts({ [b.id]: { owned: true, [t.dataset.key]: v, max: b.maxBuff } });
    } else if (t.id === 'beast-file') {
      const files = [...(t.files || [])];
      t.value = '';
      if (files.length) readShots(files);
    }
  });
  root.addEventListener('click', (ev) => {
    const show = ev.target.closest('[data-beast-show]');
    if (show) {
      showAll = show.dataset.beastShow === 'all';
      $$('[data-beast-show]', root).forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.beastShow === 'all') === showAll)));
      $('#beast-grid', root).innerHTML = grid();
      return;
    }
    if (ev.target.closest('[data-beast-upload]')) $('#beast-file', root).click();
    if (ev.target.closest('[data-beast-apply]')) applyReview();
    if (ev.target.closest('[data-beast-discard]')) {
      review = null;
      $('#beast-review', root).innerHTML = '';
    }
  });
}

async function readShots(files) {
  const status = $('#beast-status', root);
  const per = Math.max(1, aiState.maxImages || 1);
  const found = new Map();
  const notes = [];
  try {
    for (let i = 0; i < files.length; i += per) {
      status.textContent = `Claude is reading beast screenshot${files.length > 1 ? 's' : ''} ${i + 1}–${Math.min(files.length, i + per)} of ${files.length}…`;
      const out = await readBeasts(files.slice(i, i + per));
      for (const b of out.beasts) {
        const prev = found.get(b.id) || {};
        found.set(b.id, { ...prev, ...Object.fromEntries(Object.entries(b).filter(([, v]) => v !== null)) });
      }
      if (out.notes) notes.push(out.notes);
    }
    status.textContent = found.size ? '' : 'No beasts recognised. Try a screenshot of the beast list or a beast detail page.';
  } catch (e) {
    status.textContent = errorCopy(e);
    return;
  }
  review = [...found.values()];
  if (!review.length) return;
  const rows = review
    .map((r, i) => {
      const b = data.beastById.get(r.id);
      const cur = bank.beasts[r.id] || {};
      const cell = (k) => {
        const v = r[k];
        if (v === undefined || v === null) return `<td class="muted">${cur[k] ?? '–'}</td>`;
        return `<td class="${cur[k] !== v ? 'diff' : ''}">${v}${cur.owned && cur[k] !== v ? ` <span class="muted small">was ${cur[k] ?? '–'}</span>` : ''}</td>`;
      };
      return `<tr><td><input type="checkbox" data-beast-take="${i}" checked aria-label="Apply ${esc(b.name)}"></td><td><span class="hero-cell">${beastArt(b.id, 30)} ${esc(b.name)}</span></td>${cell('str')}${cell('int')}${cell('agi')}
        <td><span class="tag ${r.confidence === 'high' ? 'good' : r.confidence === 'low' ? 'bad' : 'warn'}">${esc(r.confidence || 'medium')}</span></td><td class="small muted" style="white-space:normal">${esc(r.seen || '')}</td></tr>`;
    })
    .join('');
  $('#beast-review', root).innerHTML = `<div class="table-wrap"><table class="bank"><thead><tr><th></th><th>Beast</th><th>Str</th><th>Int</th><th>Agi</th><th>Confidence</th><th>What Claude saw</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${notes.length ? `<p class="callout info small">${esc(notes.join(' '))}</p>` : ''}
    <div class="toolbar"><button class="btn primary" type="button" data-beast-apply>Apply checked beasts</button><button class="btn ghost" type="button" data-beast-discard>Discard</button><span class="small muted">Beasts found are marked as owned. Empty readings keep what you have.</span></div>`;
}

function applyReview() {
  if (!review) return;
  const patches = {};
  for (const box of $$('[data-beast-take]', root)) {
    if (!box.checked) continue;
    const r = review[toInt(box.dataset.beastTake)];
    const b = data.beastById.get(r.id);
    const patch = { owned: true, max: b.maxBuff };
    for (const f of BEAST_BUFFS) if (r[f.key] !== undefined && r[f.key] !== null) patch[f.key] = r[f.key];
    patches[r.id] = patch;
  }
  review = null;
  $('#beast-review', root).innerHTML = '';
  const n = Object.keys(patches).length;
  if (n) updateBeasts(patches, 'screenshot');
  toast(n ? `Updated ${n} beast${n === 1 ? '' : 's'}.` : 'Nothing was applied.');
}
