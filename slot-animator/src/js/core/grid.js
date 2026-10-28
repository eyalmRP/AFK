// Grid evaluation for every pay mode, plus the tumble collapse. A grid is
// grid[reel][row] of symbol indices (row 0 = top); null marks a hole.

export function keyOf(rows) {
  return (c, r) => c * rows + r;
}

export function cloneGrid(g) {
  return g.map((col) => col.slice());
}

// Runs from the left on each payline. wildAt(c, r) says whether a cell
// substitutes for any symbol.
export function lineRuns(grid, ctx, wildAt) {
  const out = [];
  ctx.paylines.forEach((line, index) => {
    let sym = -1;
    let len = 0;
    for (let c = 0; c < line.length; c++) {
      const r = line[c];
      const s = grid[c][r];
      if (s == null) break;
      const w = wildAt(c, r);
      if (sym === -1) {
        if (!w && !ctx.payable(s)) break;
        len++;
        if (!w) sym = s;
        continue;
      }
      if (w || s === sym) len++;
      else break;
    }
    if (len >= 3 && sym !== -1) out.push({ index, sym, len, cells: line.slice(0, len).map((r, c) => [c, r]) });
  });
  return out;
}

export function waysWins(grid, ctx, wildAt) {
  const out = [];
  for (const s of ctx.roles.normal) {
    let reels = 0;
    const cells = [];
    for (let c = 0; c < ctx.reels; c++) {
      const hit = [];
      for (let r = 0; r < ctx.rows; r++) if (grid[c][r] === s || (grid[c][r] != null && wildAt(c, r))) hit.push([c, r]);
      if (!hit.length) break;
      reels++;
      cells.push(...hit);
    }
    if (reels >= 3) out.push({ sym: s, reels, cells });
  }
  return out;
}

export function countSymbols(grid) {
  const map = new Map();
  grid.forEach((col, c) =>
    col.forEach((s, r) => {
      if (s == null) return;
      if (!map.has(s)) map.set(s, []);
      map.get(s).push([c, r]);
    })
  );
  return map;
}

export function anywhereWins(grid, ctx, min) {
  const out = [];
  for (const [sym, cells] of countSymbols(grid)) if (ctx.payable(sym) && cells.length >= min) out.push({ sym, count: cells.length, cells });
  return out;
}

export function componentAt(grid, ctx, c0, r0, sym, wildAt) {
  const K = keyOf(ctx.rows);
  const seen = new Set([K(c0, r0)]);
  const cells = [[c0, r0]];
  for (let i = 0; i < cells.length; i++) {
    const [c, r] = cells[i];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cc = c + dc;
      const rr = r + dr;
      if (cc < 0 || cc >= ctx.reels || rr < 0 || rr >= ctx.rows || seen.has(K(cc, rr))) continue;
      const s = grid[cc][rr];
      if (s == null) continue;
      if (s === sym || wildAt(cc, rr)) {
        seen.add(K(cc, rr));
        cells.push([cc, rr]);
      }
    }
  }
  return cells;
}

export function clusterWins(grid, ctx, min, wildAt) {
  const K = keyOf(ctx.rows);
  const done = new Set();
  const out = [];
  for (let c = 0; c < ctx.reels; c++) {
    for (let r = 0; r < ctx.rows; r++) {
      const s = grid[c][r];
      if (s == null || !ctx.payable(s) || done.has(`${s}:${K(c, r)}`)) continue;
      const cells = componentAt(grid, ctx, c, r, s, wildAt);
      for (const [cc, rr] of cells) done.add(`${s}:${K(cc, rr)}`);
      if (cells.length >= min) out.push({ sym: s, cells });
    }
  }
  return out;
}

// Removes cells and lets the survivors fall. Returns the grid with holes at
// the top of each reel, the moves of survivors and the hole positions.
export function collapse(grid, mult, removed, rows) {
  const K = keyOf(rows);
  const g = grid.map(() => new Array(rows).fill(null));
  const m = grid.map(() => new Array(rows).fill(null));
  const moves = [];
  const holes = [];
  grid.forEach((col, c) => {
    let to = rows - 1;
    for (let r = rows - 1; r >= 0; r--) {
      if (removed.has(K(c, r))) continue;
      g[c][to] = col[r];
      m[c][to] = mult[c][r];
      moves.push({ c, from: r, to, sym: col[r], mult: mult[c][r] });
      to--;
    }
    for (let r = to; r >= 0; r--) holes.push([c, r]);
  });
  return { grid: g, mult: m, moves, holes };
}
