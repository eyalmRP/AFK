// The Hold & Spin coin set, and where every extra symbol sits in the symbol
// index space: the machine's own symbols first, then the built-in stand-ins
// for the roles the project has no symbol for (the multiplier orb, the
// mystery block, the collector), then one symbol per coin type, and last the
// empty cell. The renderer, the timeline and the After Effects export all use
// this one layout.

import { defaultHoldSpin } from './defaults.js';
import { pickWeighted } from './rng.js';

export function holdSpinConfig(project) {
  const d = defaultHoldSpin();
  const hs = { ...d, ...(project.holdspin || {}) };
  hs.coins = Array.isArray(hs.coins) && hs.coins.length ? hs.coins : d.coins;
  hs.grand = { ...d.grand, ...(hs.grand || {}) };
  hs.respins = Math.max(1, Math.min(9, Math.round(Number(hs.respins)) || 3));
  hs.startCoins = Math.max(0, Math.round(Number(hs.startCoins)) || 0);
  hs.respinMid = Math.max(0, Number(hs.respinMid) || 0);
  return hs;
}

// Built-in stand-ins, in layout order: [role, painted art, name].
export const VIRTUAL_SYMBOLS = [
  ['multiplier', 'orb', 'Multiplier'],
  ['mystery', 'mystery', 'Mystery'],
  ['collector', 'collector', 'Collector'],
];

export function symbolLayout(project) {
  const n = project.symbols.length;
  let next = n;
  const virtual = [];
  const at = {};
  for (const [role, art, name] of VIRTUAL_SYMBOLS) {
    const i = project.symbols.findIndex((s) => s.role === role);
    if (i >= 0) at[role] = i;
    else {
      at[role] = next++;
      virtual.push({ role, art, name, sym: at[role] });
    }
  }
  const coinBase = next;
  const coinCount = holdSpinConfig(project).coins.length;
  const blankSym = coinBase + coinCount;
  return {
    n,
    virtual,
    virtualOrb: virtual.some((v) => v.role === 'multiplier'),
    orbSym: at.multiplier,
    mysterySym: at.mystery,
    collectorSym: at.collector,
    coinBase,
    coinCount,
    blankSym,
    total: blankSym + 1,
  };
}

export const isCoinSym = (lay, s) => s != null && s >= lay.coinBase && s < lay.blankSym;

// Glow and frame colour per coin palette.
export const COIN_GLOW = { gold: '#ffc23a', fire: '#ff5a1f', violet: '#b44cff', aqua: '#2fc8ff', emerald: '#3dffa0', rose: '#ff4fa8', silver: '#dfe8ff' };

export function coinValues(type) {
  const v = (Array.isArray(type?.values) ? type.values : String(type?.values ?? '').split(/[,\s]+/)).map(Number).filter((x) => x > 0);
  return v.length ? v : [1];
}

// A value from the type's list, in bets. Smaller values come up more often.
export function pickCoinValue(type, rng) {
  const vals = coinValues(type).slice().sort((a, b) => a - b);
  return pickWeighted(rng, vals, (v) => Math.pow(0.7, vals.indexOf(v)));
}

// The jackpot coins used to be called Mega, Super and Ultra. A project that
// still has them under those names gets the jackpot names; its values,
// colours and art stay, and so do any names it gave them itself.
const OLD_JACKPOTS = {
  mega: { id: 'mini', name: ['Mega coin', 'Mini jackpot'], label: ['MEGA', 'MINI'] },
  super: { id: 'minor', name: ['Super coin', 'Minor jackpot'], label: ['SUPER', 'MINOR'] },
  ultra: { id: 'major', name: ['Ultra coin', 'Major jackpot'], label: ['ULTRA', 'MAJOR'] },
};
export function upgradeJackpotCoins(project) {
  const coins = project.holdspin?.coins;
  if (!Array.isArray(coins)) return project;
  const renamed = {};
  for (const ct of coins) {
    const to = OLD_JACKPOTS[ct.id];
    if (!to || coins.some((x) => x.id === to.id)) continue;
    renamed[ct.id] = to.id;
    ct.id = to.id;
    if (ct.name === to.name[0]) ct.name = to.name[1];
    if (ct.label === to.label[0]) ct.label = to.label[1];
  }
  if (Object.keys(renamed).length) for (const r of project.rounds || []) if (Array.isArray(r.specials)) r.specials = r.specials.map((id) => renamed[id] || id);
  return project;
}

export function coinTypeIndex(project, id) {
  const i = holdSpinConfig(project).coins.findIndex((c) => c.id === id);
  return i < 0 ? 0 : i;
}

// How many decimals every amount shows (Machine > Money > Decimals). "auto"
// follows how the bet was typed: 1 gives whole numbers, 1.00 or 0.25 two
// decimals (even for a whole amount: 100.00).
export function moneyDecimals(project) {
  const m = project.machine || {};
  if (m.decimals === 'auto' || m.decimals == null) return /\./.test(String(m.betText ?? m.bet ?? '')) ? 2 : 0;
  return Math.max(0, m.decimals | 0);
}

// "$2.50", "$10.00", "1,250": as many decimals as the money shows.
export function formatPrize(amount, currency = '', decimals = 2) {
  const s = Math.max(0, amount).toFixed(Math.max(0, decimals | 0));
  const [i, f] = s.split('.');
  return currency + i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? `.${f}` : '');
}
