// The Hold & Spin coin set, and where every extra symbol sits in the symbol
// index space: the machine's own symbols first, then the built-in multiplier
// orb (when the project has no multiplier symbol), then one symbol per coin
// type, and last the empty cell. The renderer, the timeline and the After
// Effects export all use this one layout.

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

export function symbolLayout(project) {
  const n = project.symbols.length;
  const mi = project.symbols.findIndex((s) => s.role === 'multiplier');
  const virtualOrb = mi < 0;
  const coinBase = n + (virtualOrb ? 1 : 0);
  const coinCount = holdSpinConfig(project).coins.length;
  const blankSym = coinBase + coinCount;
  return { n, virtualOrb, orbSym: virtualOrb ? n : mi, coinBase, coinCount, blankSym, total: blankSym + 1 };
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

export function coinTypeIndex(project, id) {
  const i = holdSpinConfig(project).coins.findIndex((c) => c.id === id);
  return i < 0 ? 0 : i;
}

// "$2.50", "$10", "$1,250": whole amounts drop their decimals.
export function formatPrize(amount, currency = '', decimals = 2) {
  const whole = Math.abs(amount - Math.round(amount)) < 1e-6;
  const s = Math.max(0, amount).toFixed(whole ? 0 : Math.max(0, decimals | 0));
  const [i, f] = s.split('.');
  return currency + i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? `.${f}` : '');
}
