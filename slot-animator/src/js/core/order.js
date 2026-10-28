// Spin order: which reel (or cell) starts and stops first. Presets plus a
// custom order, so the anticipation reel can be any reel, not just the
// rightmost one.

import { shuffle } from './rng.js';

const range = (n) => Array.from({ length: n }, (_, i) => i);

export function orderList(kind, n, custom, rng) {
  if (kind === 'rtl') return range(n).reverse();
  if (kind === 'center') {
    const mid = (n - 1) / 2;
    return range(n).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
  }
  if (kind === 'edges') {
    const mid = (n - 1) / 2;
    return range(n).sort((a, b) => Math.abs(b - mid) - Math.abs(a - mid) || a - b);
  }
  if (kind === 'random') return shuffle(rng, range(n));
  if (kind === 'custom' || Array.isArray(kind)) {
    const list = (Array.isArray(kind) ? kind : custom || []).map(Number).filter((c) => c >= 0 && c < n);
    const seen = new Set();
    const out = [];
    for (const c of list) if (!seen.has(c)) seen.add(c) && out.push(c);
    for (const c of range(n)) if (!seen.has(c)) out.push(c);
    return out;
  }
  return range(n);
}

export function ranksOf(order) {
  const rank = [];
  order.forEach((c, i) => (rank[c] = i));
  return rank;
}

// Cells for per-cell spins, as [reel, row] in stopping order.
export function cellOrderList(kind, reels, rows, reelOrder, rng) {
  const cells = [];
  if (kind === 'rows') {
    for (let r = 0; r < rows; r++) for (const c of reelOrder) cells.push([c, r]);
    return cells;
  }
  if (kind === 'spiral') {
    let top = 0;
    let bottom = rows - 1;
    let left = 0;
    let right = reels - 1;
    while (top <= bottom && left <= right) {
      for (let c = left; c <= right; c++) cells.push([c, top]);
      for (let r = top + 1; r <= bottom; r++) cells.push([right, r]);
      if (top < bottom) for (let c = right - 1; c >= left; c--) cells.push([c, bottom]);
      if (left < right) for (let r = bottom - 1; r > top; r--) cells.push([left, r]);
      top++;
      bottom--;
      left++;
      right--;
    }
    return cells;
  }
  if (kind === 'center') {
    const mc = (reels - 1) / 2;
    const mr = (rows - 1) / 2;
    for (let c = 0; c < reels; c++) for (let r = 0; r < rows; r++) cells.push([c, r]);
    return cells.sort((a, b) => Math.hypot(a[0] - mc, a[1] - mr) - Math.hypot(b[0] - mc, b[1] - mr) || a[0] - b[0] || a[1] - b[1]);
  }
  if (kind === 'random') {
    for (let c = 0; c < reels; c++) for (let r = 0; r < rows; r++) cells.push([c, r]);
    return shuffle(rng, cells);
  }
  for (const c of reelOrder) for (let r = 0; r < rows; r++) cells.push([c, r]);
  return cells;
}
