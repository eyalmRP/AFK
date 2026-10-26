// Codes tab: AFK Arena redemption codes found online, with copy buttons,
// "used" marks saved in the player's bank, and codes the player adds.

import { esc, $, fmtDate, toast, local } from '../util.js';
import { data } from '../data.js';
import { bank, setCodeUsed, addCustomCode, removeCustomCode, normCode, updateSettings } from '../store.js';
import { ICON } from './icons.js';
import { panel, bindFolding } from './common.js';

const FILTER_KEY = 'afk-codex-code-filter';
let filter = local.get(FILTER_KEY, 'todo') || 'todo';
let root = null;

const DAY = 86400000;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function isExpired(c) {
  return c.status === 'expired' || (c.expires && c.expires < today());
}

function isNew(c) {
  if (!c.firstSeen || isExpired(c)) return false;
  return new Date(today()) - new Date(c.firstSeen.length === 7 ? c.firstSeen + '-01' : c.firstSeen) <= 7 * DAY;
}

// Every code the tab knows: researched ones plus the player's own.
function allCodes() {
  const list = (data.codes?.codes || []).map((c) => ({ ...c, code: normCode(c.code) }));
  const known = new Set(list.map((c) => c.code));
  for (const c of bank.customCodes || []) {
    if (known.has(c.code)) continue;
    list.unshift({ code: c.code, rewards: c.rewards, status: 'mine', firstSeen: new Date(c.added).toISOString().slice(0, 10), sources: [], custom: true });
  }
  return list;
}

const used = (c) => !!bank.codes?.[c.code]?.used;

const SERVERS = { classic: 'Classic', companions: 'Companions' };
const myServer = () => bank.settings.codeServer || 'both';
// Codes with no known server show for everyone.
const forMe = (c) => myServer() === 'both' || !c.server || c.server === myServer();

function daysLeft(c) {
  if (!c.expires) return null;
  return Math.ceil((new Date(c.expires + 'T23:59:59Z') - new Date()) / DAY);
}

function groups(all) {
  const list = all.filter(forMe);
  // Confirmed codes first, soonest to expire first; unverified ones last.
  const rank = (c) => (c.status === 'active' ? 0 : c.custom ? 1 : 2);
  const todo = list
    .filter((c) => !used(c) && !isExpired(c))
    .sort((a, b) => rank(a) - rank(b) || (a.expires || '9999').localeCompare(b.expires || '9999'));
  return {
    todo,
    used: list.filter((c) => used(c)),
    expired: list.filter((c) => !used(c) && isExpired(c)),
    all: list,
  };
}

// Tab badge: confirmed codes still to redeem (unverified ones don't count).
export function codesToRedeem() {
  return groups(allCodes()).todo.filter((c) => c.status === 'active' || c.custom).length;
}

function hostOf(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
}

function statusPill(c) {
  if (used(c)) return '<span class="tag good">✓ Used</span>';
  if (isExpired(c)) return '<span class="tag bad">Expired</span>';
  if (c.custom) return '<span class="tag accent">Added by you</span>';
  if (c.status === 'unverified') return '<span class="tag warn" title="Seen online but not confirmed as working recently">Unverified</span>';
  return '<span class="tag good">Active</span>';
}

function extraTags(c) {
  const out = [];
  if (c.server) out.push(`<span class="tag" title="Works only on ${SERVERS[c.server]} servers">${SERVERS[c.server]}</span>`);
  const left = daysLeft(c);
  if (!used(c) && !isExpired(c) && left !== null && left <= 10) out.push(`<span class="tag bad">Ends in ${left} day${left === 1 ? '' : 's'}</span>`);
  if (isNew(c) && !used(c)) out.push('<span class="tag accent">New</span>');
  return out.join('');
}

function card(c) {
  const u = used(c);
  const exp = isExpired(c);
  const meta = [
    c.firstSeen ? `Listed ${esc(fmtDate(c.firstSeen))}` : '',
    c.expires ? `${exp ? 'Expired' : 'Expires'} ${esc(fmtDate(c.expires))}` : '',
    u && bank.codes[c.code].usedAt ? `Used ${esc(fmtDate(new Date(bank.codes[c.code].usedAt).toISOString().slice(0, 10)))}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const srcs = (c.sources || []).slice(0, 3).map((s) => `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(hostOf(s))}</a>`).join(' · ');
  return `<article class="code-card" data-state="${u ? 'used' : exp ? 'expired' : 'todo'}">
    <div class="code-top">${statusPill(c)}${extraTags(c)}</div>
    <div class="code-main">
      <code class="code-str" data-code-text="${esc(c.code)}">${esc(c.code)}</code>
      <button class="btn primary code-copy" type="button" data-copy="${esc(c.code)}" aria-label="Copy ${esc(c.code)}">${ICON.copy}<span>Copy</span></button>
    </div>
    <p class="code-rewards">${c.rewards ? esc(c.rewards) : '<span class="muted">Rewards not published</span>'}</p>
    ${c.note ? `<details class="small muted"><summary>Notes</summary>${esc(c.note)}</details>` : ''}
    <div class="code-foot">
      <label class="check code-used"><input type="checkbox" data-used="${esc(c.code)}" ${u ? 'checked' : ''}> I've redeemed this</label>
      ${c.custom ? `<button class="btn small ghost" type="button" data-remove-code="${esc(c.code)}">${ICON.trash} Remove</button>` : ''}
    </div>
    ${meta || srcs ? `<p class="code-meta">${meta}${meta && srcs ? ' · ' : ''}${srcs}</p>` : ''}
  </article>`;
}

function render() {
  const list = allCodes();
  const g = groups(list);
  const shown = g[filter] || g.todo;
  const info = data.codes || {};
  const steps = (info.howToRedeem || []).map((s) => `<li>${esc(s)}</li>`).join('');
  const empty = {
    todo: list.length ? "You've redeemed every active code. New ones are checked every week." : 'No active codes right now. New ones are checked every week.',
    used: 'Codes you tick as redeemed show up here.',
    expired: 'No expired codes recorded.',
    all: 'No codes recorded yet.',
  };
  root.innerHTML = `
    <div class="view-head"><div>
      <p class="eyebrow">Free rewards</p>
      <h2>Redeem codes</h2>
      <p>Lilith posts codes in pairs, one for Classic and one for Companions servers, around events and holidays. Copy a code, redeem it on Lilith's site, then tick it so it drops off your list.</p>
      ${info.lastChecked ? `<p class="small muted">Last checked for new codes ${esc(fmtDate(info.lastChecked))} · checked weekly</p>` : ''}
    </div></div>
    <div class="code-server">
      <span class="eyebrow">My server</span>
      <div class="seg" role="group" aria-label="My server">${[
        ['classic', 'Classic'],
        ['companions', 'Companions'],
        ['both', 'Both'],
      ]
        .map(([v, l]) => `<button type="button" data-server="${v}" aria-pressed="${myServer() === v}">${l}</button>`)
        .join('')}</div>
      ${info.webRedeem?.url ? `<a class="btn primary" href="${esc(info.webRedeem.url)}" target="_blank" rel="noopener">${ICON.gift} Redeem on Lilith's site</a>` : ''}
    </div>
    ${panel({
      id: 'codes-how',
      title: 'How to redeem',
      folded: Object.keys(bank.codes || {}).length > 0,
      body: `${steps ? `<ol class="list">${steps}</ol>` : '<p class="small muted">Steps not recorded yet.</p>'}
        ${info.webRedeem?.url ? `<p class="small"><a href="${esc(info.webRedeem.url)}" target="_blank" rel="noopener">${esc(info.webRedeem.url.replace(/^https?:\/\//, ''))}</a></p>` : ''}
        <p class="small muted">Each code works once per account, and only on its own server (Classic or Companions). Sources disagree on whether codes are case-sensitive, so paste them exactly as listed.</p>`,
    })}
    <div class="toolbar code-tools">
      <div class="seg" role="group" aria-label="Show codes">${[
        ['todo', 'To redeem'],
        ['used', 'Used'],
        ['expired', 'Expired'],
        ['all', 'All'],
      ]
        .map(([v, l]) => `<button type="button" data-filter="${v}" aria-pressed="${filter === v}">${l} <span class="count">${g[v].length}</span></button>`)
        .join('')}</div>
      ${g.todo.length > 1 && filter === 'todo' ? `<button class="btn" type="button" data-copy-all>${ICON.copy} Copy all ${g.todo.length}</button>` : ''}
    </div>
    <div class="code-list">${shown.length ? shown.map(card).join('') : `<div class="empty"><p>${empty[filter]}</p></div>`}</div>
    <form class="code-add" id="code-add" autocomplete="off">
      <span class="eyebrow">Found a code somewhere else?</span>
      <div class="code-add-row">
        <input class="input" id="code-new" placeholder="Code" maxlength="40" aria-label="Code" spellcheck="false" autocapitalize="characters">
        <input class="input" id="code-new-rewards" placeholder="Rewards (optional)" maxlength="200" aria-label="Rewards">
        <button class="btn" type="submit">Add code</button>
      </div>
    </form>
    ${(info.sources || []).length ? `<p class="small muted">Sources: ${info.sources.slice(0, 6).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name || hostOf(s.url))}</a>`).join(' · ')}</p>` : ''}`;
}

async function copy(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) {
      const label = btn.querySelector('span');
      const prev = label?.textContent;
      btn.classList.add('copied');
      if (label) label.textContent = 'Copied';
      setTimeout(() => {
        btn.classList.remove('copied');
        if (label) label.textContent = prev;
      }, 1500);
    }
    toast(text.includes('\n') ? 'Codes copied.' : `Copied ${text}.`);
  } catch {
    // Clipboard refused (some app views): select the text so it can be copied by hand.
    const el = btn?.closest('.code-card')?.querySelector('.code-str');
    if (el) {
      const r = document.createRange();
      r.selectNodeContents(el);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }
    toast('Copy is blocked here. The code is selected, so copy it with your keyboard or long-press.');
  }
}

export function mountCodes(el) {
  root = el;
  bindFolding(root);
  root.addEventListener('click', (ev) => {
    const t = ev.target;
    const sv = t.closest('[data-server]');
    if (sv) {
      updateSettings({ codeServer: sv.dataset.server });
      return;
    }
    const f = t.closest('[data-filter]');
    if (f) {
      filter = f.dataset.filter;
      local.set(FILTER_KEY, filter);
      render();
      return;
    }
    const c = t.closest('[data-copy]');
    if (c) {
      copy(c.dataset.copy, c);
      return;
    }
    if (t.closest('[data-copy-all]')) {
      copy(groups(allCodes()).todo.map((x) => x.code).join('\n'), t.closest('[data-copy-all]'));
      return;
    }
    const rm = t.closest('[data-remove-code]');
    if (rm) {
      removeCustomCode(rm.dataset.removeCode);
      toast('Code removed.');
    }
  });
  root.addEventListener('change', (ev) => {
    const u = ev.target.closest('[data-used]');
    if (!u) return;
    setCodeUsed(u.dataset.used, u.checked);
    toast(u.checked ? `${u.dataset.used} marked as redeemed.` : `${u.dataset.used} moved back to your list.`);
  });
  root.addEventListener('submit', (ev) => {
    if (ev.target.id !== 'code-add') return;
    ev.preventDefault();
    const code = normCode($('#code-new', root).value);
    if (!code) {
      toast('Type the code first.');
      return;
    }
    if (allCodes().some((c) => c.code === code)) {
      toast(`${code} is already on the list.`);
      return;
    }
    addCustomCode(code, $('#code-new-rewards', root).value);
    filter = 'todo';
    toast(`Added ${code}.`);
  });
  render();
}

export function refreshCodes() {
  if (root) render();
}

