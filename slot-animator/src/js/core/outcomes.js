// Turns a round description ("big win on lines 1-3 with Lucky 7") into a
// concrete grid of symbols plus the cells that should light up. Filler
// symbols are re-rolled until no unintended payline win remains, so a
// "no win" round never shows three cherries on a line by accident.

import { pickWeighted, shuffle } from './rng.js';
import { LINE_WINS, BIG_WINS, SCATTER_WINS } from './defaults.js';

export function symbolRoles(symbols) {
  const roles = { normal: [], low: [], high: [], wild: [], scatter: [], bonus: [] };
  symbols.forEach((s, i) => {
    if (s.role === 'wild') roles.wild.push(i);
    else if (s.role === 'scatter') roles.scatter.push(i);
    else if (s.role === 'bonus') roles.bonus.push(i);
    else {
      roles.normal.push(i);
      (s.tier === 'high' ? roles.high : roles.low).push(i);
    }
  });
  if (!roles.normal.length) roles.normal = symbols.map((_, i) => i);
  return roles;
}

export function makeContext(project, paylines) {
  const symbols = project.symbols;
  return {
    reels: project.grid.reels,
    rows: project.grid.rows,
    paylines,
    symbols,
    roles: symbolRoles(symbols),
    bet: Number(project.machine.bet) || 1,
    weightOf: (i) => (symbols[i] ? Number(symbols[i].weight) || 0 : 0),
  };
}

export function fillSymbol(ctx, rng, exclude = null) {
  let pool = ctx.roles.normal;
  if (exclude != null && pool.length > 1) pool = pool.filter((i) => !(exclude instanceof Set ? exclude.has(i) : i === exclude));
  return pickWeighted(rng, pool, ctx.weightOf);
}

export function randomGrid(ctx, rng) {
  const grid = [];
  for (let c = 0; c < ctx.reels; c++) {
    grid.push([]);
    for (let r = 0; r < ctx.rows; r++) grid[c].push(fillSymbol(ctx, rng));
  }
  sanitize(grid, new Set(), ctx, rng, null);
  return grid;
}

function lineRun(grid, line, wild) {
  let sym = -1;
  let len = 0;
  for (let c = 0; c < line.length; c++) {
    const s = grid[c][line[c]];
    if (sym === -1) {
      len++;
      if (!wild.has(s)) sym = s;
      continue;
    }
    if (s === sym || wild.has(s)) len++;
    else break;
  }
  return { sym, len };
}

// Re-roll unlocked cells that form a payline (or ways) win nobody asked for.
function sanitize(grid, locked, ctx, rng, waysSym) {
  const wild = new Set(ctx.roles.wild);
  const K = (c, r) => c * ctx.rows + r;
  for (let iter = 0; iter < 400; iter++) {
    let fixed = false;
    for (const line of ctx.paylines) {
      const run = lineRun(grid, line, wild);
      if (run.len < 3) continue;
      const cells = [];
      for (let c = 0; c < run.len; c++) cells.push([c, line[c]]);
      const free = cells.filter(([c, r]) => !locked.has(K(c, r)));
      if (!free.length) continue;
      const [c, r] = free[free.length - 1];
      grid[c][r] = fillSymbol(ctx, rng, new Set([run.sym, grid[c][r]]));
      fixed = true;
    }
    if (waysSym != null) {
      // In a ways round only the chosen symbol may connect reels 1-3.
      const present = (c, s) => grid[c].some((x) => x === s || wild.has(x));
      for (const s of ctx.roles.normal) {
        if (s === waysSym) continue;
        if (present(0, s) && present(1, s) && present(2, s)) {
          for (let r = 0; r < ctx.rows; r++) {
            if (grid[2][r] === s && !locked.has(K(2, r))) {
              grid[2][r] = fillSymbol(ctx, rng, new Set([s]));
              fixed = true;
            }
          }
        }
      }
    }
    if (!fixed) break;
  }
}

function resolveSymbolIndex(ctx, ref) {
  if (ref == null || ref === 'auto') return -1;
  if (typeof ref === 'number') return ref >= 0 && ref < ctx.symbols.length ? ref : -1;
  const i = ctx.symbols.findIndex((s) => s.id === ref);
  return i;
}

function spreadReels(reels, n) {
  if (n >= reels) return Array.from({ length: reels }, (_, i) => i);
  if (n <= 1) return [0];
  const out = [];
  for (let i = 0; i < n; i++) out.push(Math.round((i * (reels - 1)) / (n - 1)));
  return [...new Set(out)];
}

export const AUTO_MULTIPLIER = { small: 2, medium: 8, big: 25, mega: 60, epic: 150 };

export function autoAmount(ctx, project, round) {
  if (round.outcome === 'wheel') {
    const segs = project.wheel.segments;
    const seg = segs[Math.min(segs.length - 1, Math.max(0, round.wheelSegment | 0))];
    const v = seg ? Number(seg.value) || 0 : 0;
    return project.wheel.multiplyByBet ? v * ctx.bet : v;
  }
  return (AUTO_MULTIPLIER[round.outcome] || 0) * ctx.bet;
}

export function resolveRound(ctx, project, round, rng) {
  const { reels, rows, paylines, roles } = ctx;
  const grid = [];
  for (let c = 0; c < reels; c++) {
    grid.push([]);
    for (let r = 0; r < rows; r++) grid[c].push(fillSymbol(ctx, rng));
  }
  const locked = new Set();
  const K = (c, r) => c * rows + r;
  const place = (c, r, s) => {
    if (c < 0 || c >= reels || r < 0 || r >= rows) return;
    grid[c][r] = s;
    locked.add(K(c, r));
  };
  const outcome = round.outcome;
  const win = {
    kind: 'none',
    symbol: -1,
    lines: [],
    cells: [],
    scatters: [],
    nearMiss: null,
    amount: 0,
    tiers: [],
  };
  let waysSym = null;

  if (LINE_WINS.includes(outcome)) {
    let sym = resolveSymbolIndex(ctx, round.symbol);
    if (sym < 0 || roles.scatter.includes(sym)) {
      const pool = BIG_WINS.includes(outcome) || outcome === 'medium' ? roles.high : roles.low;
      const list = pool.length ? pool : roles.normal;
      sym = list[Math.floor(rng() * list.length)];
    }
    win.symbol = sym;
    const count = Math.max(2, Math.min(reels, round.count | 0 || reels));
    const pattern = round.pattern || 'lines';
    win.kind = pattern;
    if (pattern === 'lines') {
      let idxs = (round.lines || []).filter((i) => i >= 0 && i < paylines.length);
      if (!idxs.length) idxs = [0];
      for (const li of idxs) {
        const line = paylines[li];
        const cells = [];
        for (let c = 0; c < count; c++) {
          place(c, line[c], sym);
          cells.push([c, line[c]]);
        }
        win.lines.push({ index: li, cells });
      }
    } else if (pattern === 'cells') {
      const cells = (round.cells || []).filter(([c, r]) => c < reels && r < rows);
      const use = cells.length ? cells : [[0, 0], [1, 1], [2, 2]].filter(([c, r]) => c < reels && r < rows);
      for (const [c, r] of use) place(c, r, sym);
    } else if (pattern === 'ways') {
      waysSym = sym;
      for (let c = 0; c < count; c++) {
        const n = rows > 1 && rng() < (BIG_WINS.includes(outcome) ? 0.7 : 0.35) ? 2 : 1;
        for (const r of shuffle(rng, Array.from({ length: rows }, (_, i) => i)).slice(0, n)) place(c, r, sym);
      }
    } else if (pattern === 'full') {
      for (let c = 0; c < reels; c++) for (let r = 0; r < rows; r++) place(c, r, sym);
    }
    if (round.wildAssist && roles.wild.length) {
      const candidates = [...locked].map((k) => [Math.floor(k / rows), k % rows]).filter(([c]) => c > 0);
      if (candidates.length) {
        const [c, r] = candidates[Math.floor(rng() * candidates.length)];
        grid[c][r] = roles.wild[0];
      }
    }
    win.cells = [...locked].map((k) => [Math.floor(k / rows), k % rows]);
    win.amount = round.amount != null && round.amount !== '' ? Number(round.amount) : autoAmount(ctx, project, round);
    win.tiers = outcome === 'epic' ? ['big', 'mega', 'epic'] : outcome === 'mega' ? ['big', 'mega'] : outcome === 'big' ? ['big'] : [];
  } else if (SCATTER_WINS.includes(outcome) || outcome === 'nearmiss') {
    const scatter = roles.scatter[0] ?? roles.bonus[0] ?? roles.high[0] ?? 0;
    win.symbol = scatter;
    const n = outcome === 'nearmiss' ? 2 : Math.max(3, Math.min(reels, round.scatterCount || 3));
    let reelIdx;
    if (outcome === 'nearmiss') {
      const nm = round.nearMissReel != null ? Math.min(reels - 1, round.nearMissReel) : reels - 1;
      reelIdx = spreadReels(Math.max(2, nm), 2).filter((c) => c !== nm);
      if (reelIdx.length < 2) reelIdx = [0, 1].filter((c) => c !== nm);
      win.nearMiss = { reel: nm, symbol: scatter, position: round.nearMissPosition || 'below' };
    } else {
      reelIdx = spreadReels(reels, n);
    }
    for (const c of reelIdx) {
      const r = Math.floor(rng() * rows);
      place(c, r, scatter);
      win.scatters.push([c, r]);
    }
    win.kind = 'scatter';
    win.cells = win.scatters.slice();
    if (outcome !== 'nearmiss') {
      win.amount = round.amount != null && round.amount !== '' ? Number(round.amount) : autoAmount(ctx, project, round);
    }
  }
  sanitize(grid, locked, ctx, rng, waysSym);
  if (win.kind === 'lines') addCoincidentLines(grid, win, ctx);
  return { grid, win };
}

// Locked cells of two winning lines can complete a third line (a V through
// a top and a middle line, say). A real machine pays and shows that line
// too, so add it to the win instead of leaving an unlit winning line.
function addCoincidentLines(grid, win, ctx) {
  const wild = new Set(ctx.roles.wild);
  const have = new Set(win.lines.map((l) => l.index));
  ctx.paylines.forEach((line, i) => {
    if (have.has(i)) return;
    const run = lineRun(grid, line, wild);
    if (run.len >= 3 && run.sym === win.symbol) {
      const cells = [];
      for (let c = 0; c < run.len; c++) cells.push([c, line[c]]);
      win.lines.push({ index: i, cells, bonus: true });
    }
  });
}
