// Turns a round description ("big win, tumble twice, bombs x2 and x10") into
// concrete grids: the grid the spin lands on, then one grid per tumble step,
// with the cells that win at each step. Filler is re-rolled until no
// unintended win remains for the machine's pay mode, so a "no win" spin never
// pays by accident.

import { pickWeighted, shuffle } from './rng.js';
import { wheelLandings, segmentKind } from './wheel.js';
import { LINE_WINS, SCATTER_WINS } from './defaults.js';
import { keyOf, cloneGrid, lineRuns, waysWins, anywhereWins, clusterWins, componentAt, collapse, countSymbols } from './grid.js';
import { symbolLayout, holdSpinConfig, pickCoinValue, coinTypeIndex, isCoinSym } from './coins.js';
import { potsConfig, potsUpgrade, BOOST_KINDS } from './pots.js';

// Symbols with these roles are placed by the rounds, never as filler.
export const SPECIAL_ROLES = ['wild', 'scatter', 'bonus', 'multiplier', 'mystery', 'collector'];

export function symbolRoles(symbols) {
  const roles = { normal: [], low: [], high: [], ...Object.fromEntries(SPECIAL_ROLES.map((r) => [r, []])) };
  symbols.forEach((s, i) => {
    if (SPECIAL_ROLES.includes(s.role)) roles[s.role].push(i);
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
  const roles = symbolRoles(symbols);
  const normal = new Set(roles.normal);
  const m = project.machine;
  const lay = symbolLayout(project);
  return {
    game: project.game || 'slot',
    lay,
    blankSym: lay.blankSym,
    reels: project.grid.reels,
    rows: project.grid.rows,
    paylines,
    symbols,
    roles,
    bet: Number(m.bet) > 0 ? Number(m.bet) : 1,
    payMode: m.payMode || 'lines',
    minAnywhere: Math.max(3, Number(m.minAnywhere) || 8),
    minCluster: Math.max(3, Number(m.minCluster) || 5),
    scatterTrigger: Math.max(2, Number(m.scatterTrigger) || 3),
    spinType: project.spin.type,
    wildSet: new Set(roles.wild),
    wildSym: roles.wild.length ? roles.wild[0] : null,
    scatterSym: roles.scatter[0] ?? roles.bonus[0] ?? null,
    // Without a multiplier, mystery or collector symbol the renderer
    // supplies a built-in one at these indices.
    orbSym: lay.orbSym,
    mysterySym: lay.mysterySym,
    collectorSym: lay.collectorSym,
    payable: (s) => normal.has(s),
    weightOf: (i) => (symbols[i] ? Number(symbols[i].weight) || 0 : 0),
    tiers: project.tiers || [],
  };
}

export function fillSymbol(ctx, rng, exclude = null) {
  // A Hold & Spin game's board is empty between coins.
  if (ctx.game === 'holdspin') return ctx.blankSym;
  let pool = ctx.roles.normal;
  if (exclude && pool.length > 1) {
    const ex = exclude instanceof Set ? exclude : new Set([exclude]);
    const p = pool.filter((i) => !ex.has(i));
    if (p.length) pool = p;
  }
  return pickWeighted(rng, pool, ctx.weightOf);
}

function emptyGrid(ctx, fill) {
  return Array.from({ length: ctx.reels }, () => Array.from({ length: ctx.rows }, fill));
}

export function defaultPattern(mode) {
  return mode === 'ways' ? 'ways' : mode === 'anywhere' ? 'anywhere' : mode === 'cluster' ? 'cluster' : 'lines';
}

// Wins the machine would pay that nobody asked for. A win is fine when every
// cell in it was placed on purpose (locked), or when it is the intended symbol
// in a pay-anywhere / cluster / ways round.
function unwanted(grid, ctx, locked, intended, wildAt) {
  const K = keyOf(ctx.rows);
  const allLocked = (cells) => cells.every(([c, r]) => locked.has(K(c, r)));
  const out = [];
  if (ctx.payMode === 'lines') {
    for (const run of lineRuns(grid, ctx, wildAt)) if (!allLocked(run.cells)) out.push(run);
  } else if (ctx.payMode === 'ways') {
    for (const w of waysWins(grid, ctx, wildAt)) {
      if (w.sym === intended.sym && w.reels <= intended.count) continue;
      if (w.sym === intended.sym) out.push({ sym: w.sym, cells: w.cells.filter(([c]) => c === intended.count) });
      else if (!allLocked(w.cells)) out.push({ sym: w.sym, cells: w.cells.filter(([c, r]) => grid[c][r] === w.sym && c <= 2) });
    }
  } else if (ctx.payMode === 'anywhere') {
    for (const g of anywhereWins(grid, ctx, ctx.minAnywhere)) if (g.sym !== intended.sym && !allLocked(g.cells)) out.push(g);
  } else {
    for (const g of clusterWins(grid, ctx, ctx.minCluster, wildAt)) if (g.sym !== intended.sym && !allLocked(g.cells)) out.push(g);
  }
  return out;
}

function sanitize(grid, ctx, rng, { locked, intended = { sym: -1, count: 0 }, wildAt, free = null }) {
  const K = keyOf(ctx.rows);
  for (let iter = 0; iter < 500; iter++) {
    const groups = unwanted(grid, ctx, locked, intended, wildAt);
    if (!groups.length) return true;
    let fixed = false;
    for (const g of groups) {
      const cand = g.cells.filter(([c, r]) => grid[c][r] != null && !locked.has(K(c, r)) && !wildAt(c, r) && (!free || free.has(K(c, r))));
      if (!cand.length) continue;
      const [c, r] = ctx.payMode === 'lines' ? cand[cand.length - 1] : cand[Math.floor(rng() * cand.length)];
      grid[c][r] = fillSymbol(ctx, rng, new Set([g.sym, grid[c][r], intended.sym]));
      fixed = true;
    }
    if (!fixed) return false;
  }
  return false;
}

export function randomGrid(ctx, rng) {
  const grid = emptyGrid(ctx, () => fillSymbol(ctx, rng));
  const wildAt = (c, r) => ctx.wildSet.has(grid[c][r]);
  sanitize(grid, ctx, rng, { locked: new Set(), wildAt });
  return grid;
}

function resolveSymbolIndex(ctx, ref) {
  if (ref == null || ref === 'auto') return -1;
  if (typeof ref === 'number') return ref >= 0 && ref < ctx.symbols.length ? ref : -1;
  return ctx.symbols.findIndex((s) => s.id === ref);
}

function pickSymbol(ctx, rng, ref, prefer, avoid) {
  const s = resolveSymbolIndex(ctx, ref);
  if (s >= 0 && ctx.payable(s)) return s;
  let pool = (prefer === 'high' ? ctx.roles.high : ctx.roles.low).filter((x) => !avoid?.has(x));
  if (!pool.length) pool = ctx.roles.normal.filter((x) => !avoid?.has(x));
  if (!pool.length) pool = ctx.roles.normal;
  return pool[Math.floor(rng() * pool.length)];
}

function spreadReels(reels, n) {
  if (n >= reels) return Array.from({ length: reels }, (_, i) => i);
  if (n <= 1) return [0];
  const out = [];
  for (let i = 0; i < n; i++) out.push(Math.round((i * (reels - 1)) / (n - 1)));
  return [...new Set(out)];
}

function growRegion(ctx, rng, start, n, canUse) {
  const K = keyOf(ctx.rows);
  const region = [start];
  const inR = new Set([K(...start)]);
  let frontier = [];
  const addN = ([c, r]) => {
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cc = c + dc;
      const rr = r + dr;
      if (cc < 0 || cc >= ctx.reels || rr < 0 || rr >= ctx.rows || inR.has(K(cc, rr)) || !canUse(cc, rr)) continue;
      frontier.push([cc, rr]);
    }
  };
  addN(start);
  while (region.length < n && frontier.length) {
    const i = Math.floor(rng() * frontier.length);
    const cell = frontier.splice(i, 1)[0];
    if (inR.has(K(...cell))) continue;
    inR.add(K(...cell));
    region.push(cell);
    addN(cell);
    frontier = frontier.filter((x) => !inR.has(K(...x)));
  }
  return region;
}

export const AUTO_MULTIPLIER = { small: 2, medium: 8 };

export function autoAmount(ctx, project, round) {
  if (round.outcome === 'wheel') {
    // The segment the wheel ends on (after any spin again); no win pays 0.
    const segs = project.wheel.segments;
    const landings = wheelLandings(project, round);
    const seg = segs[landings[landings.length - 1]];
    const v = seg && segmentKind(seg) === 'prize' ? Number(seg.value) || 0 : 0;
    return project.wheel.multiplyByBet ? v * ctx.bet : v;
  }
  if (round.outcome === 'big') {
    const tiers = ctx.tiers;
    if (!tiers.length) return 25 * ctx.bet;
    const t = tiers[Math.min(tiers.length - 1, Math.max(0, round.tier | 0))];
    return Math.round((Number(t.x) || 20) * ctx.bet * 1.15 * 100) / 100;
  }
  return (AUTO_MULTIPLIER[round.outcome] || 0) * ctx.bet;
}

function minCountFor(ctx, pattern) {
  return pattern === 'anywhere' ? ctx.minAnywhere : pattern === 'cluster' ? ctx.minCluster : 3;
}

export function tumbleEnabled(ctx, round) {
  if (round.expandWild) return false;
  if (round.tumble === true || round.tumble === false) return round.tumble;
  return ctx.payMode === 'anywhere' || ctx.payMode === 'cluster' || ctx.spinType === 'cascade';
}

// carry: { sticky: Set of cell keys held as wilds, fsTotal }
export function resolveRound(ctx, project, round, rng, carry = {}) {
  const { reels, rows, paylines } = ctx;
  const K = keyOf(rows);
  const outcome = round.outcome;
  const grid = emptyGrid(ctx, () => fillSymbol(ctx, rng));
  const mult = emptyGrid(ctx, () => null);
  const locked = new Set();
  const wildMask = new Set();
  const isFree = (c, r) => !locked.has(K(c, r));
  const place = (c, r, s) => {
    if (c < 0 || c >= reels || r < 0 || r >= rows) return;
    grid[c][r] = s;
    locked.add(K(c, r));
  };
  let curGrid = grid;
  const wildAt = (c, r) => ctx.wildSet.has(curGrid[c][r]) || wildMask.has(K(c, r));
  // Sticky wilds stay put: a win drawn through one keeps the wild there.
  const held = new Set(ctx.wildSym == null ? [] : carry.sticky || []);
  for (const k of held) place(Math.floor(k / rows), k % rows, ctx.wildSym);
  const placeWin = (c, r, s) => held.has(K(c, r)) || place(c, r, s);
  const win = { kind: 'none', symbol: -1, lines: [], cells: [], scatters: [], nearMiss: null, amount: 0, base: 0, multSum: 0, expand: [], wilds: [], wildMults: [], mystery: null, cash: [], collector: null, collected: 0, boosts: [] };
  const steps = [];
  const randomFreeCells = (n, extra = () => true) => shuffle(rng, allCells(ctx).filter(([c, r]) => isFree(c, r) && extra(c, r))).slice(0, n);
  // Whether the cells placed on purpose pay by themselves (filler cannot
  // fix that), and placing a symbol on a free cell where it does not make
  // them pay. A spin that is not meant to win uses it for its wilds and
  // boosters; a win round takes the first free cell.
  const noWin = !LINE_WINS.includes(outcome);
  const lockedPays = () => {
    const g = grid.map((col, c) => col.map((x, r) => (locked.has(K(c, r)) ? x : null)));
    const w = (c, r) => g[c][r] != null && (ctx.wildSet.has(g[c][r]) || wildMask.has(K(c, r)));
    const m = ctx.payMode;
    const wins = m === 'lines' ? lineRuns(g, ctx, w) : m === 'ways' ? waysWins(g, ctx, w) : m === 'anywhere' ? anywhereWins(g, ctx, ctx.minAnywhere) : clusterWins(g, ctx, ctx.minCluster, w);
    return wins.length > 0;
  };
  // Filler can make it pay nothing: try the clean-up on a copy.
  const canClean = () => {
    const g = cloneGrid(grid);
    return sanitize(g, ctx, rng, { locked, wildAt: (c, r) => ctx.wildSet.has(g[c][r]) || wildMask.has(K(c, r)) });
  };
  const placeSafe = (sym) => {
    for (const [c, r] of randomFreeCells(noWin ? reels * rows : 1)) {
      const was = grid[c][r];
      place(c, r, sym);
      if (!noWin || (!lockedPays() && canClean())) return [c, r];
      grid[c][r] = was;
      locked.delete(K(c, r));
    }
    return null;
  };

  const amountTotal = round.amount != null && round.amount !== '' && !Number.isNaN(Number(round.amount)) ? Math.max(0, Number(round.amount)) : autoAmount(ctx, project, round);
  const multValues = (round.multipliers || []).map(Number).filter((v) => v > 0);
  const mysteryN = Math.max(0, Math.round(Number(round.mystery)) || 0);
  // Boosters need the pots above the machine to fire them.
  const boostList = potsUpgrade(potsConfig(project)) ? (round.boosts || []).map((b) => (typeof b === 'string' ? { kind: b } : b)).filter((b) => b && BOOST_KINDS.some((k) => k.id === b.kind)).slice(0, 12) : [];
  const boostKeys = new Set();
  const boostMults = [];

  if (LINE_WINS.includes(outcome)) {
    const pattern = round.pattern || defaultPattern(ctx.payMode);
    const tumble = tumbleEnabled(ctx, round) && pattern !== 'full';
    const specs = [{ pattern, symbol: round.symbol, count: round.count, lines: round.lines, cells: round.cells }];
    if (tumble) for (const s of round.chain || []) specs.push({ pattern: s.pattern || defaultPattern(ctx.payMode), symbol: s.symbol, count: s.count, lines: s.lines });
    const prefer = outcome === 'small' ? 'low' : 'high';
    const syms = [];
    specs.forEach((s, i) => syms.push(pickSymbol(ctx, rng, s.symbol, i ? (rng() < 0.5 ? 'low' : 'high') : prefer, new Set(i ? [syms[i - 1]] : []))));
    const counts = specs.map((s) => {
      const minC = minCountFor(ctx, s.pattern);
      const maxC = s.pattern === 'lines' || s.pattern === 'ways' ? reels : reels * rows - 2;
      return Math.max(Math.min(minC, maxC), Math.min(maxC, Number(s.count) || minC));
    });

    // Step 0 on the landed grid.
    const s0 = syms[0];
    const spec0 = specs[0];
    const n0 = counts[0];
    const stepLines = [];
    // The cells the win was drawn on (multiplier wilds go there).
    let winPlaced = [];
    if (pattern === 'lines') {
      let idxs = (spec0.lines || []).filter((i) => i >= 0 && i < paylines.length);
      if (!idxs.length) idxs = [0];
      for (const li of idxs) {
        const line = paylines[li];
        const cells = [];
        for (let c = 0; c < Math.min(n0, reels); c++) {
          placeWin(c, line[c], s0);
          cells.push([c, line[c]]);
        }
        stepLines.push({ index: li, cells });
        winPlaced.push(...cells.filter(([c]) => c > 0));
      }
    } else if (pattern === 'cells') {
      const cells = (spec0.cells || []).filter(([c, r]) => c < reels && r < rows);
      const use = cells.length ? cells : [[0, 0], [1, 1], [2, 2]].filter(([c, r]) => c < reels && r < rows);
      for (const [c, r] of use) placeWin(c, r, s0);
      winPlaced = use.slice();
    } else if (pattern === 'ways') {
      for (let c = 0; c < n0; c++) {
        const k = rows > 1 && rng() < (outcome === 'big' ? 0.7 : 0.35) ? 2 : 1;
        for (const r of shuffle(rng, range(rows)).slice(0, k)) if (isFree(c, r)) place(c, r, s0);
        if (!grid[c].some((x, r) => x === s0 || wildAt(c, r))) place(c, Math.floor(rng() * rows), s0);
        if (c > 0) for (let r = 0; r < rows; r++) if (grid[c][r] === s0 || wildAt(c, r)) winPlaced.push([c, r]);
      }
    } else if (pattern === 'full') {
      for (let c = 0; c < reels; c++) for (let r = 0; r < rows; r++) if (isFree(c, r)) place(c, r, s0);
    } else if (pattern === 'anywhere') {
      for (const [c, r] of randomFreeCells(n0)) place(c, r, s0);
    } else if (pattern === 'cluster') {
      const start = randomFreeCells(1)[0] || [0, 0];
      for (const [c, r] of growRegion(ctx, rng, start, n0, isFree)) place(c, r, s0);
    }
    if (round.wildAssist && ctx.wildSym != null && (pattern === 'lines' || pattern === 'ways' || pattern === 'cells')) {
      const cand = [...locked].map((k) => [Math.floor(k / rows), k % rows]).filter(([c, r]) => c > 0 && grid[c][r] === s0);
      if (cand.length) {
        const [c, r] = cand[Math.floor(rng() * cand.length)];
        grid[c][r] = ctx.wildSym;
      }
    }
    // Multiplier wilds: wilds in the win carry x values; a winner turns
    // wild when there are too few. A tumble would carry them off, so not
    // then; and not on a sticky or walking wild, whose art covers the x.
    const wildMults = (round.wildMults || []).map(Number).filter((v) => v > 0);
    if (wildMults.length && !tumble && ctx.wildSym != null && winPlaced.length) {
      const isWild = ([c, r]) => (ctx.wildSet.has(grid[c][r]) ? 1 : 0);
      const cand = shuffle(rng, winPlaced.filter(([c, r]) => !held.has(K(c, r)) && (grid[c][r] === s0 || isWild([c, r])))).sort((a, b) => isWild(b) - isWild(a));
      wildMults.slice(0, cand.length).forEach((v, j) => {
        const [c, r] = cand[j];
        grid[c][r] = ctx.wildSym;
        mult[c][r] = v;
        win.wildMults.push({ c, r, value: v });
      });
    }
    if (boostList.length) {
      const seen = new Set();
      const base = winPlaced.length ? winPlaced : [...locked].map((k) => [Math.floor(k / rows), k % rows]);
      const cand = base.filter(([c, r]) => grid[c][r] === s0 && !held.has(K(c, r)) && !seen.has(K(c, r)) && seen.add(K(c, r)));
      placeBoosts(cand, s0, tumble);
    }
    // Pre-seed the next tumble's symbol in cells that will survive.
    if (tumble && specs.length > 1) preseed(syms[1], counts[1], n0, (c, r) => isFree(c, r));
    placeExtras();
    if (round.expandWild && ctx.wildSym != null) expandWilds();
    sanitize(grid, ctx, rng, { locked, intended: { sym: s0, count: n0 }, wildAt });
    let first = stepWin(grid, pattern, s0, n0, stepLines, locked);
    if (tumble) {
      lookahead(grid, mult, first.cells, (c, r) => !locked.has(K(c, r)), specs.length > 1 ? syms[1] : -1, s0, { locked, intended: { sym: s0, count: n0 }, wildAt });
      first = stepWin(grid, pattern, s0, n0, stepLines, locked);
    }
    steps.push({ grid: cloneGrid(grid), mult: cloneGrid(mult), ...first });
    // Mystery blocks land on winners and reveal the winning symbol.
    if (mysteryN > 0) win.mystery = { cells: shuffle(rng, first.cells.filter(([c, r]) => grid[c][r] === s0 && !boostKeys.has(K(c, r)))).slice(0, mysteryN), sym: s0 };

    if (tumble) {
      let cur = grid;
      let curMult = mult;
      for (let k = 1; k <= specs.length; k++) {
        const prev = steps[steps.length - 1];
        const removed = new Set(prev.cells.map(([c, r]) => K(c, r)));
        const col = collapse(cur, curMult, removed, rows);
        const g = col.grid;
        const m = col.mult;
        curGrid = g;
        const holeSet = new Set(col.holes.map(([c, r]) => K(c, r)));
        const assigned = new Set();
        const lockedK = new Set();
        for (let c = 0; c < reels; c++) for (let r = 0; r < rows; r++) if (!holeSet.has(K(c, r))) lockedK.add(K(c, r));
        const freeHole = (c, r) => holeSet.has(K(c, r)) && !assigned.has(K(c, r));
        const assign = (c, r, s) => {
          g[c][r] = s;
          assigned.add(K(c, r));
          lockedK.add(K(c, r));
        };
        let stepOk = false;
        let sym = -1;
        let n = 0;
        let lines = [];
        const spec = specs[k];
        if (spec) {
          sym = syms[k];
          n = counts[k];
          stepOk = placeChainStep(spec.pattern, sym, n, g, freeHole, assign, (out) => (lines = out));
          if (stepOk && specs[k + 1]) preseed(syms[k + 1], counts[k + 1], n, freeHole, assign, g);
        }
        for (const [c, r] of col.holes) if (!assigned.has(K(c, r))) g[c][r] = fillSymbol(ctx, rng, stepOk ? new Set([sym]) : null);
        sanitize(g, ctx, rng, { locked: lockedK, intended: stepOk ? { sym, count: n } : { sym: -1, count: 0 }, wildAt, free: holeSet });
        const refill = col.holes.map(([c, r]) => [c, r, g[c][r]]);
        const base = { moves: col.moves, refill, removed: prev.cells };
        if (stepOk) {
          let w = stepWin(g, spec.pattern, sym, n, lines, lockedK);
          if (w.cells.length) {
            const freeHoleFn = (c, r) => holeSet.has(K(c, r)) && !assigned.has(K(c, r));
            lookahead(g, m, w.cells, freeHoleFn, specs[k + 1] ? syms[k + 1] : -1, sym, { locked: lockedK, intended: { sym, count: n }, wildAt, free: holeSet });
            w = stepWin(g, spec.pattern, sym, n, lines, lockedK);
          }
          if (w.cells.length) {
            steps.push({ grid: cloneGrid(g), mult: cloneGrid(m), ...w, ...base });
            cur = g;
            curMult = m;
            continue;
          }
        }
        // Final refill: no more wins, the chain ends here.
        steps.push({ grid: cloneGrid(g), mult: cloneGrid(m), cells: [], lines: [], symbol: -1, count: 0, final: true, ...base });
        cur = g;
        curMult = m;
        break;
      }
    }
    const paying = steps.filter((s) => s.cells.length);
    const weights = paying.map((_, i) => Math.pow(0.8, i));
    const wsum = weights.reduce((a, b) => a + b, 0) || 1;
    win.multSum = [...multValues, ...win.wildMults.map((m) => m.value), ...boostMults].reduce((a, b) => a + b, 0);
    win.amount = amountTotal;
    win.base = win.multSum > 0 ? amountTotal / win.multSum : amountTotal;
    paying.forEach((s, i) => (s.amount = (win.base * weights[i]) / wsum));
    win.kind = pattern;
    win.symbol = s0;
    win.cells = steps[0].cells;
    win.lines = steps[0].lines;
  } else if (SCATTER_WINS.includes(outcome) || outcome === 'nearmiss') {
    const scatter = ctx.scatterSym ?? ctx.roles.high[0] ?? 0;
    win.symbol = scatter;
    const gridMode = ctx.payMode === 'anywhere' || ctx.payMode === 'cluster';
    const trigger = ctx.scatterTrigger;
    const n = outcome === 'nearmiss' ? Math.max(2, trigger - 1) : Math.max(trigger, Math.min(reels * rows - 1, Number(round.scatterCount) || trigger));
    let cells;
    if (gridMode) {
      cells = randomFreeCells(n);
      if (outcome === 'nearmiss') win.nearMiss = { reel: carry.lastReel ?? reels - 1, symbol: scatter, position: round.nearMissPosition || 'below' };
    } else if (outcome === 'nearmiss') {
      const nm = round.nearMissReel != null ? Math.min(reels - 1, round.nearMissReel) : carry.lastReel ?? reels - 1;
      const others = range(reels).filter((c) => c !== nm);
      const pick = spreadReels(others.length, Math.min(n, others.length)).map((i) => others[i]);
      cells = pick.map((c) => [c, Math.floor(rng() * rows)]);
      win.nearMiss = { reel: nm, symbol: scatter, position: round.nearMissPosition || 'below' };
    } else {
      cells = spreadReels(reels, Math.min(n, reels)).map((c) => [c, Math.floor(rng() * rows)]);
    }
    for (const [c, r] of cells) {
      place(c, r, scatter);
      win.scatters.push([c, r]);
    }
    placeBoosts([], -1, false);
    placeExtras();
    sanitize(grid, ctx, rng, { locked, wildAt });
    win.kind = 'scatter';
    win.cells = win.scatters.slice();
    if (outcome !== 'nearmiss') win.amount = amountTotal;
    if (outcome === 'bonus' && !(round.amount != null && round.amount !== '')) win.amount = 0;
  } else if (outcome === 'hstrigger') {
    // Coins land among ordinary symbols; they carry into the Hold & Spin board.
    const hs = holdSpinConfig(project);
    const n = Math.max(1, Math.min(reels * rows - 1, Math.round(Number(round.coinsIn)) || 6));
    const specials = (round.specials || []).map((id) => coinTypeIndex(project, id)).filter((i) => i > 0);
    win.coins = [];
    randomFreeCells(n).forEach(([c, r], i) => {
      const ti = i < specials.length ? specials[i] : 0;
      const value = pickCoinValue(hs.coins[ti], rng) * ctx.bet;
      place(c, r, ctx.lay.coinBase + ti);
      mult[c][r] = value;
      win.coins.push({ c, r, sym: ctx.lay.coinBase + ti, value, type: ti });
    });
    sanitize(grid, ctx, rng, { locked, wildAt });
    win.kind = 'coins';
    win.cells = win.coins.map(({ c, r }) => [c, r]);
  } else if (outcome === 'fstotal') {
    win.kind = 'total';
    win.amount = round.amount != null && round.amount !== '' && !Number.isNaN(Number(round.amount)) ? Math.max(0, Number(round.amount)) : carry.fsTotal || 0;
  } else {
    placeMystery();
    placeBoosts([], -1, false);
    placeExtras();
    sanitize(grid, ctx, rng, { locked, wildAt });
  }

  // A collector takes every cash value on screen, on top of the win.
  if (win.collector && win.cash.length) {
    win.collected = win.cash.reduce((a, cs) => a + cs.value, 0);
    win.amount = (win.amount || 0) + win.collected;
  }
  curGrid = grid;
  win.wilds = [];
  grid.forEach((col, c) => col.forEach((s, r) => ctx.wildSet.has(s) && win.wilds.push([c, r])));
  const last = steps.length ? steps[steps.length - 1] : null;
  const mults = [];
  const finalMult = last ? last.mult : mult;
  const finalGrid = last ? last.grid : grid;
  // Multipliers (orbs and multiplier wilds); cash and coin values are not.
  finalMult.forEach((col, c) => col.forEach((v, r) => v != null && !isCoinSym(ctx.lay, finalGrid[c][r]) && mults.push({ c, r, value: v })));
  return {
    grid,
    mult,
    steps,
    finalGrid: last ? last.grid : grid,
    finalMult,
    mults,
    win,
  };

  // --- helpers that need the round's state ---

  function placeExtras() {
    for (const v of multValues) {
      const [cell] = randomFreeCells(1);
      if (!cell) break;
      place(cell[0], cell[1], ctx.orbSym);
      mult[cell[0]][cell[1]] = v;
    }
    const extra = Math.max(0, Number(round.extraWilds) || 0);
    if (extra && ctx.wildSym != null) {
      if (noWin) for (let k = 0; k < extra; k++) placeSafe(ctx.wildSym);
      else for (const [c, r] of randomFreeCells(extra)) place(c, r, ctx.wildSym);
    }
    // Cash symbols carry a value each (in bets); a collector, landing on
    // the last reel to stop when it can, takes them all.
    for (const v of (round.cash || []).map(Number).filter((x) => x > 0)) {
      const [cell] = randomFreeCells(1);
      if (!cell) break;
      place(cell[0], cell[1], ctx.lay.coinBase);
      mult[cell[0]][cell[1]] = v * ctx.bet;
      win.cash.push({ c: cell[0], r: cell[1], value: v * ctx.bet });
    }
    if (round.collector) {
      const last = carry.lastReel ?? reels - 1;
      const cell = randomFreeCells(1, (c) => c === last)[0] || randomFreeCells(1)[0];
      if (cell) {
        place(cell[0], cell[1], ctx.collectorSym);
        win.collector = cell;
      }
    }
  }

  // Boosters: after the spin lands the pots fire at cells that upgrade. A
  // boosted cell lands as a low symbol (`from`) and turns into `to`: wild,
  // the winning symbol, a wild with an x value, or cash. On a win they
  // upgrade the win's own cells (the win needs them); cash takes a free
  // cell, and so does a multiplier in a tumble (as an orb: the win's cells
  // burst). Without a win they upgrade free cells to something that does
  // not pay.
  function placeBoosts(winCand, s0, tumble) {
    if (!boostList.length) return;
    const lows = ctx.roles.low.length ? ctx.roles.low : ctx.roles.normal;
    const lowBut = (ex) => {
      const pool = lows.filter((x) => !ex.has(x));
      return pool.length ? pool[Math.floor(rng() * pool.length)] : fillSymbol(ctx, rng, ex);
    };
    const cand = shuffle(rng, winCand.slice());
    for (const b of boostList) {
      const v = Math.max(0, Number(b.value) || 0);
      if (b.kind === 'cash' || (b.kind === 'mult' && tumble)) {
        const [cell] = randomFreeCells(1);
        if (!cell) continue;
        const [c, r] = cell;
        const cash = b.kind === 'cash';
        const to = cash ? ctx.lay.coinBase : ctx.orbSym;
        const value = cash ? (v || 5) * ctx.bet : v || 2;
        place(c, r, to);
        mult[c][r] = value;
        if (cash) win.cash.push({ c, r, value });
        else boostMults.push(value);
        boostKeys.add(K(c, r));
        win.boosts.push({ c, r, kind: b.kind, from: lowBut(new Set()), to, value });
        continue;
      }
      if (b.kind !== 'upgrade' && ctx.wildSym == null) continue;
      const to = b.kind === 'upgrade' ? (s0 >= 0 ? s0 : pickSymbol(ctx, rng, 'auto', 'high')) : ctx.wildSym;
      const cell = winCand.length ? cand.shift() : placeSafe(to);
      if (!cell) continue;
      const [c, r] = cell;
      const value = b.kind === 'mult' ? v || 2 : null;
      if (winCand.length) grid[c][r] = to;
      if (value != null) {
        mult[c][r] = value;
        win.wildMults.push({ c, r, value });
      }
      boostKeys.add(K(c, r));
      win.boosts.push({ c, r, kind: b.kind, from: lowBut(new Set([to, s0])), to, value });
    }
    // The beams sweep across the machine.
    win.boosts.sort((a, b) => a.c - b.c || a.r - b.r);
  }

  // Mystery blocks on a spin that does not win: they reveal one symbol,
  // kept off the first reel (and below a win's size) so they cannot pay
  // on their own.
  function placeMystery() {
    if (!(mysteryN > 0)) return;
    const sym = pickSymbol(ctx, rng, round.mysterySymbol, 'high');
    const cap = ctx.payMode === 'anywhere' ? ctx.minAnywhere - 1 : ctx.payMode === 'cluster' ? ctx.minCluster - 1 : mysteryN;
    const lineish = ctx.payMode === 'lines' || ctx.payMode === 'ways';
    const cells = randomFreeCells(Math.min(mysteryN, cap), (c) => !lineish || c > 0);
    for (const [c, r] of cells) place(c, r, sym);
    win.mystery = { cells, sym };
  }

  function expandWilds() {
    const reelsWithWild = new Set();
    grid.forEach((col, c) => col.forEach((s) => ctx.wildSet.has(s) && reelsWithWild.add(c)));
    win.expand = [...reelsWithWild].sort((a, b) => a - b);
    for (const c of win.expand)
      for (let r = 0; r < rows; r++) {
        wildMask.add(K(c, r));
        locked.add(K(c, r));
      }
  }

  function preseed(sym, need, holes, canUse, assignFn, g = grid) {
    if (ctx.payMode !== 'anywhere') return;
    const have = countSymbols(g).get(sym)?.length || 0;
    const want = Math.min(ctx.minAnywhere - 1, Math.max(0, need - holes + 1)) - have;
    if (want <= 0) return;
    const cand = shuffle(rng, allCells(ctx).filter(([c, r]) => canUse(c, r)));
    for (const [c, r] of cand.slice(0, want)) {
      if (assignFn) assignFn(c, r, sym);
      else place(c, r, sym);
    }
  }

  function placeChainStep(pat, sym, n, g, freeHole, assign, setLines) {
    const have = () => countSymbols(g).get(sym) || [];
    if (pat === 'anywhere') {
      const need = n - have().length;
      const cand = shuffle(rng, allCells(ctx).filter(([c, r]) => freeHole(c, r)));
      cand.slice(0, Math.max(0, need)).forEach(([c, r]) => assign(c, r, sym));
      return have().length >= ctx.minAnywhere;
    }
    if (pat === 'cluster') {
      const startC = shuffle(rng, allCells(ctx).filter(([c, r]) => freeHole(c, r)))[0];
      if (!startC) return false;
      const region = growRegion(ctx, rng, startC, n, (c, r) => freeHole(c, r) || g[c][r] === sym);
      region.forEach(([c, r]) => freeHole(c, r) && assign(c, r, sym));
      return componentAt(g, ctx, startC[0], startC[1], sym, wildAtGrid(g)).length >= ctx.minCluster;
    }
    if (pat === 'lines') {
      const cnt = Math.min(n, reels);
      for (const li of shuffle(rng, range(paylines.length))) {
        const line = paylines[li];
        let ok = true;
        for (let c = 0; c < cnt; c++) {
          const r = line[c];
          if (!(freeHole(c, r) || g[c][r] === sym || ctx.wildSet.has(g[c][r]))) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        const cells = [];
        for (let c = 0; c < cnt; c++) {
          if (freeHole(c, line[c])) assign(c, line[c], sym);
          cells.push([c, line[c]]);
        }
        setLines([{ index: li, cells }]);
        return true;
      }
      return false;
    }
    if (pat === 'ways') {
      for (let c = 0; c < n; c++) {
        if (g[c].some((s, r) => s === sym || (s != null && ctx.wildSet.has(s)))) continue;
        const r = range(rows).find((rr) => freeHole(c, rr));
        if (r == null) return c >= 3;
        assign(c, r, sym);
      }
      return true;
    }
    return false;
  }

  // Survivors that fall together can form a win of their own. Simulate the
  // collapse and re-roll filler that would cause one.
  function lookahead(g, m, winCells, canChange, nextSym, curSym, sanitizeOpts) {
    for (let it = 0; it < 60; it++) {
      const removed = new Set(winCells.map(([c, r]) => K(c, r)));
      const col = collapse(g, m, removed, rows);
      const back = new Map(col.moves.map((mv) => [K(mv.c, mv.to), [mv.c, mv.from]]));
      const wa = (c, r) => col.grid[c][r] != null && ctx.wildSet.has(col.grid[c][r]);
      let groups;
      if (ctx.payMode === 'cluster') groups = clusterWins(col.grid, ctx, ctx.minCluster, wa);
      else if (ctx.payMode === 'anywhere') groups = anywhereWins(col.grid, ctx, ctx.minAnywhere);
      else if (ctx.payMode === 'ways') groups = waysWins(col.grid, ctx, wa);
      else groups = lineRuns(col.grid, ctx, wa);
      groups = groups.filter((x) => x.sym !== nextSym);
      if (!groups.length) return;
      let fixed = false;
      for (const grp of groups) {
        const orig = grp.cells.map(([c, r]) => back.get(K(c, r))).filter((x) => x && canChange(x[0], x[1]) && g[x[0]][x[1]] === grp.sym);
        if (!orig.length) continue;
        const [c, r] = orig[Math.floor(rng() * orig.length)];
        g[c][r] = fillSymbol(ctx, rng, new Set([grp.sym, curSym, nextSym]));
        fixed = true;
      }
      if (!fixed) return;
      sanitize(g, ctx, rng, sanitizeOpts);
    }
  }

  function wildAtGrid(g) {
    return (c, r) => ctx.wildSet.has(g[c][r]) || wildMask.has(K(c, r));
  }

  function stepWin(g, pat, sym, n, lines, lockedSet) {
    const wa = wildAtGrid(g);
    let cells = [];
    let outLines = lines.slice();
    if (pat === 'lines') {
      const have = new Set(outLines.map((l) => l.index));
      for (const run of lineRuns(g, ctx, wa)) {
        if (have.has(run.index)) continue;
        if (run.sym === sym && run.cells.every(([c, r]) => lockedSet.has(K(c, r)))) outLines.push({ index: run.index, cells: run.cells, bonus: true });
      }
      const seen = new Set();
      for (const l of outLines) for (const [c, r] of l.cells) if (!seen.has(K(c, r))) {
        seen.add(K(c, r));
        cells.push([c, r]);
      }
    } else if (pat === 'ways') {
      for (let c = 0; c < n; c++) for (let r = 0; r < rows; r++) if (g[c][r] === sym || wa(c, r)) cells.push([c, r]);
    } else if (pat === 'anywhere') {
      cells = (countSymbols(g).get(sym) || []).slice();
    } else if (pat === 'cluster') {
      const seen = new Set();
      for (const [c, r] of countSymbols(g).get(sym) || []) {
        if (seen.has(K(c, r))) continue;
        const comp = componentAt(g, ctx, c, r, sym, wa);
        comp.forEach(([cc, rr]) => seen.add(K(cc, rr)));
        if (comp.length >= ctx.minCluster) cells.push(...comp);
      }
    } else {
      g.forEach((col, c) => col.forEach((s, r) => (s === sym || (s != null && ctx.wildSet.has(s))) && lockedSet.has(K(c, r)) && cells.push([c, r])));
    }
    return { cells, lines: outLines, symbol: sym, count: cells.length, pattern: pat };
  }
}

function range(n) {
  return Array.from({ length: n }, (_, i) => i);
}

function allCells(ctx) {
  const out = [];
  for (let c = 0; c < ctx.reels; c++) for (let r = 0; r < ctx.rows; r++) out.push([c, r]);
  return out;
}
