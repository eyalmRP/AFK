// Builds the whole animation from a project. Reels and per-cell reels move
// along symbol strips driven by AE-style keyframes; cascade drops and tumbles
// move individual symbol "actors", each with its own keyframed row position.
// On top of that sits a schedule of win steps, multiplier collection, big
// win overlays, banners, the bonus wheel, the free spins block and the sound
// cues. Rendering is a pure function of time, so the preview, the MP4 and the
// After Effects script agree.

import { mulberry32, hashSeed } from './rng.js';
import { key, pushKeys, evalKeys } from './keys.js';
import { generatePaylines } from './paylines.js';
import { makeContext, randomGrid, resolveRound, fillSymbol, tumbleEnabled } from './outcomes.js';
import { orderList, ranksOf, cellOrderList } from './order.js';
import { keyOf } from './grid.js';
import { LINE_WINS, BIG_WINS, SCATTER_WINS } from './defaults.js';

export const STRIP_PAD = 4;

const num = (v, d) => (v == null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

function ensure(strip, len, ctx, rng) {
  while (strip.length < len) strip.push(fillSymbol(ctx, rng));
}

function placeColumn(strip, P, column, dir, rows, ctx, rng, multMap, multCol) {
  ensure(strip, P + rows, ctx, rng);
  for (let k = 0; k < rows; k++) {
    const r = dir > 0 ? rows - 1 - k : k;
    strip[P + k] = column[r];
    if (multMap) {
      if (multCol && multCol[r] != null) multMap.set(P + k, multCol[r]);
      else multMap.delete(P + k);
    }
  }
}

function reelKeysFor(opts) {
  const { sp, ts, P0, v, stop, antic, minDistance } = opts;
  const keys = [];
  const Ds = Math.max(0.05, sp.startDuration);
  let t1;
  let y1;
  if (sp.startStyle === 'windup') {
    const tw = ts + Ds * 0.45;
    const w = sp.windup;
    keys.push(key(ts, P0, { outInf: 0.5 }));
    keys.push(key(tw, P0 - w, { inInf: 0.5, outInf: 0.5 }));
    t1 = ts + Ds;
    y1 = P0 - w + 0.5 * v * (t1 - tw);
    keys.push(key(t1, y1, { inSpeed: v, outSpeed: v }));
  } else if (sp.startStyle === 'ease') {
    keys.push(key(ts, P0, { outInf: 0.6 }));
    t1 = ts + Ds;
    y1 = P0 + 0.5 * v * Ds;
    keys.push(key(t1, y1, { inSpeed: v, outSpeed: v }));
  } else {
    keys.push(key(ts, P0, { outSpeed: v }));
    t1 = ts;
    y1 = P0;
  }
  let De = Math.max(0.12, sp.endDuration);
  let tE0;
  let yE0;
  let vin = v;
  if (antic) {
    const va = Math.max(1.5, Math.min(v * 0.8, sp.anticipationSpeed));
    const tSlow = Math.max(t1, antic.tSlow);
    const ySlow = y1 + v * (tSlow - t1);
    if (tSlow > t1 + 1e-3) keys.push(key(tSlow, ySlow, { inSpeed: v, outSpeed: v }));
    const tCrawl = tSlow + 0.35;
    const yCrawl = ySlow + ((v + va) / 2) * 0.35;
    keys.push(key(tCrawl, yCrawl, { inSpeed: va, outSpeed: va, inInf: 0.5 }));
    De = Math.max(De, 0.6);
    tE0 = Math.max(tCrawl, stop - De);
    yE0 = yCrawl + va * (tE0 - tCrawl);
    De = stop - tE0;
    vin = va;
  } else {
    tE0 = Math.max(t1, stop - De);
    yE0 = y1 + v * (tE0 - t1);
    De = stop - tE0;
  }
  if (tE0 > keys[keys.length - 1].t + 1e-3) keys.push(key(tE0, yE0, { inSpeed: vin, outSpeed: vin }));
  const style = sp.endStyle;
  const o = style === 'bounce' ? sp.overshoot : style === 'elastic' ? sp.overshoot * 1.25 : 0;
  const frac = style === 'hard' ? 0.62 : style === 'soft' ? 0.42 : 0.5;
  let T = Math.round(yE0 + vin * De * frac - o);
  while (T + o - yE0 < (vin * De) / 3 + 0.05) T++;
  if (T < P0 + minDistance) T = P0 + minDistance;
  if (style === 'bounce') {
    keys.push(key(stop, T + o, { inInf: 0.55, outInf: 0.45 }));
    keys.push(key(stop + 0.2, T, { inInf: 0.55 }));
  } else if (style === 'elastic') {
    keys.push(key(stop, T + o, { inInf: 0.5, outInf: 0.45 }));
    keys.push(key(stop + 0.13, T - o * 0.45, { inInf: 0.45, outInf: 0.45 }));
    keys.push(key(stop + 0.25, T + o * 0.16, { inInf: 0.45, outInf: 0.45 }));
    keys.push(key(stop + 0.36, T, { inInf: 0.5 }));
  } else if (style === 'hard') {
    keys.push(key(stop, T, { inSpeed: vin * 0.35, inInf: 0.25, outSpeed: -1.4, outInf: 0.4 }));
    keys.push(key(stop + 0.06, T - 0.05, { inInf: 0.4, outInf: 0.4 }));
    keys.push(key(stop + 0.13, T, { inInf: 0.5 }));
  } else {
    keys.push(key(stop, T, { inInf: 0.75 }));
  }
  return { keys, T, settle: keys[keys.length - 1].t };
}

// Row-position keys for a symbol falling from one row to another, with a
// small bounce when it lands.
function fallKeys(t, from, to, dur, bounce = 0.07) {
  const d = Math.max(0.01, to - from);
  return [
    key(t, from, { outInf: 0.55 }),
    key(t + dur, to, { inSpeed: (2.1 * d) / dur, inInf: 0.3, outSpeed: -2.2, outInf: 0.4 }),
    key(t + dur + 0.09, to - bounce, { inInf: 0.5, outInf: 0.5 }),
    key(t + dur + 0.18, to, { inInf: 0.5 }),
  ];
}

function exitKeys(t, from, dist, dur) {
  return [key(t, from, { outInf: 0.55 }), key(t + dur, from + dist, { inSpeed: (2.1 * dist) / dur, inInf: 0.3 })];
}

// Crossing time of a monotonic keyframed value.
function crossTime(keys, a, b, target) {
  let lo = a;
  let hi = b;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (evalKeys(keys, m) < target) lo = m;
    else hi = m;
  }
  return hi;
}

export function buildTimeline(project) {
  const { reels, rows } = project.grid;
  const peek = num(project.grid.peek, 0);
  const sp = { ...project.spin };
  const tm = project.timing;
  const bet = Number(project.machine.bet) || 1;
  const tiers = (project.tiers || []).map((t) => ({ ...t, x: Number(t.x) || 0 })).sort((a, b) => a.x - b.x);
  const paylines = generatePaylines(reels, rows, project.machine.maxLines || 20);
  const ctx = makeContext(project, paylines);
  const rngInit = mulberry32(hashSeed(project.seed, 'init'));
  const initialGrid = randomGrid(ctx, rngInit);
  const dir = sp.direction === 'up' ? -1 : 1;
  const mode = sp.type === 'cascade' ? 'cascade' : sp.type === 'cells' ? 'cells' : 'reels';
  const v = Math.max(2, num(sp.speed, 24));
  const K = keyOf(rows);
  const delays = Array.from({ length: reels }, (_, c) => ({ start: num(sp.reelDelay?.[c]?.start, 0), stop: num(sp.reelDelay?.[c]?.stop, 0) }));

  // Strips: one per reel, or one per cell for per-cell spins.
  const nStrips = mode === 'cells' ? reels * rows : reels;
  const stripRows = mode === 'cells' ? 1 : rows;
  const strips = [];
  const stripKeys = [];
  const stripMults = [];
  const pos = [];
  for (let i = 0; i < nStrips; i++) {
    const strip = [];
    ensure(strip, STRIP_PAD, ctx, rngInit);
    const col = mode === 'cells' ? [initialGrid[Math.floor(i / rows)][i % rows]] : initialGrid[i];
    placeColumn(strip, STRIP_PAD, col, dir, stripRows, ctx, rngInit);
    ensure(strip, STRIP_PAD + stripRows + 3, ctx, rngInit);
    strips.push(strip);
    stripKeys.push([key(0, STRIP_PAD)]);
    stripMults.push(new Map());
    pos.push(STRIP_PAD);
  }

  const meterKeys = [key(0, 0, { hold: true })];
  const fsTotalKeys = [key(0, 0, { hold: true })];
  const wheelKeys = [key(0, 0)];
  let wheelAngle = 0;
  const shakes = [];
  const flashes = [];
  const sfx = [];
  const stickies = [];
  const fsBlocks = [];
  const rounds = [];
  let prevGrid = initialGrid;
  let prevMult = initialGrid.map((col) => col.map(() => null));
  let cursor = num(tm.intro, 0.6);
  let fs = null;
  let stickyOpen = new Map();
  let actorId = 0;

  const closeBlock = (t) => {
    if (!fs) return;
    for (const s of stickyOpen.values()) s.to = t;
    stickyOpen = new Map();
    fs.block.end = t;
    fs = null;
  };

  project.rounds.forEach((round, i) => {
    const rng = mulberry32(hashSeed(project.seed, round.seed, i));
    const t0 = cursor;
    if (fs && !round.free && round.outcome !== 'fstotal') closeBlock(t0);
    const stopOrderKind = round.stopOrder || sp.stopOrder || 'ltr';
    const stopOrder = orderList(stopOrderKind, reels, sp.customStop, rng);
    const startOrder = orderList(sp.startOrder || 'ltr', reels, sp.customStart, rng);
    const stopRank = ranksOf(stopOrder);
    const startRank = ranksOf(startOrder);
    const cellOrder = cellOrderList(sp.cellOrder || 'columns', reels, rows, stopOrder, rng);
    const carry = {
      sticky: fs && round.free ? new Set(stickyOpen.keys()) : new Set(),
      fsTotal: fs ? fs.total : 0,
      lastReel: stopOrder[stopOrder.length - 1],
    };
    const res = resolveRound(ctx, project, round, rng, carry);
    const { win } = res;
    const grid = res.grid;
    const o = round.outcome;
    const mid = Math.max(0, num(round.midDuration, sp.midDuration));
    const reelInfo = [];
    const cellInfo = [];
    const actors = [];
    let actorsFrom = null;
    let spinEnd = t0;
    const noSpin = o === 'fstotal';

    // ---- anticipation: which reels (or cells) tease ----
    const anticReels = new Array(reels).fill(false);
    const scatterOutcome = SCATTER_WINS.includes(o) || o === 'nearmiss';
    if (Array.isArray(round.antic)) round.antic.forEach((c) => c >= 0 && c < reels && (anticReels[c] = true));
    else {
      if (sp.type === 'tease' || round.tease) anticReels[stopOrder[reels - 1]] = true;
      if (scatterOutcome && mode !== 'cells') {
        const need = Math.max(2, ctx.scatterTrigger - 1);
        let seen = 0;
        for (const c of stopOrder) {
          if (seen >= need) anticReels[c] = true;
          seen += win.scatters.filter(([sc]) => sc === c).length;
        }
      }
    }

    const sfxStop = (t, c) => sfx.push({ t, type: 'reelStop', pan: reels > 1 ? (c / (reels - 1)) * 2 - 1 : 0 });

    if (!noSpin && mode === 'reels') {
      let shift = 0;
      const byStop = stopOrder.map((c) => c);
      const tmp = [];
      for (const c of byStop) {
        const ts = t0 + startRank[c] * sp.startStagger + delays[c].start;
        const normalStop = t0 + sp.startDuration + mid + sp.endDuration + stopRank[c] * sp.stopStagger + delays[c].stop;
        const prevShift = shift;
        if (anticReels[c]) shift += sp.anticipation;
        const stop = Math.max(normalStop + shift, ts + sp.startDuration + 0.25);
        const a = anticReels[c] ? { tSlow: normalStop + prevShift - sp.endDuration } : null;
        const { keys, T, settle } = reelKeysFor({ sp, ts, P0: pos[c], v, stop, antic: a, minDistance: rows + 2 });
        pushKeys(stripKeys[c], keys);
        const strip = strips[c];
        ensure(strip, T, ctx, rng);
        placeColumn(strip, T, grid[c], dir, rows, ctx, rng, stripMults[c], res.mult[c]);
        ensure(strip, T + rows + 4, ctx, rng);
        if (win.nearMiss && win.nearMiss.reel === c) strip[win.nearMiss.position === 'above' ? T + rows : T - 1] = win.nearMiss.symbol;
        tmp[c] = { start: ts, stop, settle, antic: a ? { start: a.tSlow, end: stop } : null, from: pos[c], to: T };
        pos[c] = T;
        sfxStop(stop, c);
        if (win.scatters.some(([sc]) => sc === c)) sfx.push({ t: stop, type: 'scatter' });
        if (a) sfx.push({ t: a.tSlow, type: 'anticipation', dur: stop - a.tSlow });
      }
      for (let c = 0; c < reels; c++) reelInfo.push(tmp[c]);
      spinEnd = Math.max(...reelInfo.map((r) => r.settle));
    } else if (!noSpin && mode === 'cells') {
      const scatterKeys = new Set(win.scatters.map(([c, r]) => K(c, r)));
      const need = Math.max(2, ctx.scatterTrigger - 1);
      let seen = 0;
      let shift = 0;
      const cellStag = sp.stopStagger * 0.35;
      cellOrder.forEach(([c, r], rank) => {
        const idx = K(c, r);
        const tease = scatterOutcome ? seen >= need : (sp.type === 'tease' || round.tease) && rank === cellOrder.length - 1;
        const manual = Array.isArray(round.antic) && round.antic.includes(c);
        const antic = tease || manual;
        const ts = t0 + rank * sp.startStagger * 0.3 + delays[c].start;
        const normalStop = t0 + sp.startDuration + mid + sp.endDuration + rank * cellStag + delays[c].stop;
        const prevShift = shift;
        if (antic) shift += sp.anticipation * 0.6;
        const stop = Math.max(normalStop + shift, ts + sp.startDuration + 0.25);
        const a = antic ? { tSlow: normalStop + prevShift - sp.endDuration } : null;
        const { keys, T, settle } = reelKeysFor({ sp, ts, P0: pos[idx], v, stop, antic: a, minDistance: 3 });
        pushKeys(stripKeys[idx], keys);
        const strip = strips[idx];
        ensure(strip, T, ctx, rng);
        placeColumn(strip, T, [grid[c][r]], dir, 1, ctx, rng, stripMults[idx], [res.mult[c][r]]);
        ensure(strip, T + 5, ctx, rng);
        if (win.nearMiss && rank === cellOrder.length - 1) strip[win.nearMiss.position === 'above' ? T + 1 : T - 1] = win.nearMiss.symbol;
        cellInfo[idx] = { c, r, rank, start: ts, stop, settle, antic: a ? { start: a.tSlow, end: stop } : null };
        pos[idx] = T;
        if (scatterKeys.has(idx)) seen++;
        sfxStop(stop, c);
        if (scatterKeys.has(idx)) sfx.push({ t: stop, type: 'scatter' });
        if (a) sfx.push({ t: a.tSlow, type: 'anticipation', dur: stop - a.tSlow });
      });
      for (let c = 0; c < reels; c++) {
        const cs = range(rows).map((r) => cellInfo[K(c, r)]);
        reelInfo.push({
          start: Math.min(...cs.map((x) => x.start)),
          stop: Math.max(...cs.map((x) => x.stop)),
          settle: Math.max(...cs.map((x) => x.settle)),
          antic: null,
        });
      }
      spinEnd = Math.max(...cellInfo.map((x) => x.settle));
    } else if (!noSpin && mode === 'cascade') {
      actorsFrom = t0;
      let shift = 0;
      const inBase = t0 + (rows - 1) * 0.035 + 0.3 + mid * 0.35;
      const tmp = [];
      for (const c of stopOrder) {
        const prevShift = shift;
        if (anticReels[c]) shift += sp.anticipation;
        let first = Infinity;
        let last = 0;
        for (let r = 0; r < rows; r++) {
          const outS = t0 + startRank[c] * sp.startStagger + (rows - 1 - r) * 0.035 + delays[c].start;
          actors.push({ id: ++actorId, c, sym: prevGrid[c][r], mult: prevMult[c][r], tIn: t0, tOut: outS + 0.36, keys: exitKeys(outS, r, rows + 1 + peek * 2, 0.36), old: true });
          const inS = inBase + stopRank[c] * sp.stopStagger + (rows - 1 - r) * 0.05 + shift + delays[c].stop;
          const dropDur = 0.3 + 0.02 * (rows - r);
          const keys = fallKeys(inS, r - (rows + 0.6 + peek), r, dropDur);
          actors.push({ id: ++actorId, c, sym: grid[c][r], mult: res.mult[c][r], tIn: inS, tOut: Infinity, keys, row: r });
          first = Math.min(first, inS + dropDur);
          last = Math.max(last, inS + dropDur + 0.18);
        }
        tmp[c] = { start: t0 + startRank[c] * sp.startStagger, stop: first, settle: last, antic: anticReels[c] ? { start: inBase + stopRank[c] * sp.stopStagger + prevShift - 0.2, end: first } : null };
        sfx.push({ t: first, type: 'drop', pan: reels > 1 ? (c / (reels - 1)) * 2 - 1 : 0 });
        if (win.scatters.some(([sc]) => sc === c)) sfx.push({ t: first + 0.05, type: 'scatter' });
        if (tmp[c].antic) sfx.push({ t: tmp[c].antic.start, type: 'anticipation', dur: tmp[c].antic.end - tmp[c].antic.start });
      }
      for (let c = 0; c < reels; c++) reelInfo.push(tmp[c]);
      spinEnd = Math.max(...reelInfo.map((r) => r.settle));
      sfx.push({ t: t0, type: 'whoosh' });
    }
    if (!noSpin && mode !== 'cascade') {
      sfx.push({ t: t0, type: 'spinStart' });
      sfx.push({ t: t0, type: 'spinLoop', dur: Math.max(0.2, Math.max(...reelInfo.map((r) => r.stop)) - t0) });
    }

    // ---- sticky wilds: held cells shown from the moment they land ----
    if (fs && round.free && !noSpin && ctx.wildSym != null) {
      for (const [c, r] of win.wilds) {
        const k = K(c, r);
        if (stickyOpen.has(k)) continue;
        if (!(round.sticky || fs.sticky)) continue;
        const landT = mode === 'cells' ? cellInfo[k].stop : reelInfo[c].stop;
        const s = { c, r, from: landT, to: Infinity };
        stickyOpen.set(k, s);
        stickies.push(s);
        sfx.push({ t: landT + 0.05, type: 'sticky' });
      }
    }

    const pres = { start: spinEnd + 0.08 };
    let tcur = spinEnd + 0.08;
    let end;
    // HUD win meter resets when a new spin starts.
    if (!noSpin) pushKeys(meterKeys, [key(t0, 0, { hold: true })]);

    // ---- expanding wilds ----
    if (win.expand.length) {
      const dur = num(tm.expand, 0.7);
      pres.expand = { start: tcur, end: tcur + dur, reels: win.expand, wilds: win.wilds.filter(([c]) => win.expand.includes(c)) };
      sfx.push({ t: tcur, type: 'expand' });
      tcur += dur;
    }

    // ---- win steps (one per tumble) ----
    const paying = res.steps.filter((s) => s.cells.length);
    const tumble = res.steps.length > 1 || (mode === 'cascade' && res.steps.length);
    let actorGrid = null;
    const needActors = res.steps.some((s) => s.moves);
    if (needActors && mode !== 'cascade') {
      actorsFrom = spinEnd;
      actorGrid = grid.map((col, c) =>
        col.map((sym, r) => {
          const a = { id: ++actorId, c, sym, mult: res.mult[c][r], tIn: spinEnd, tOut: Infinity, keys: [key(spinEnd, r)], row: r };
          actors.push(a);
          return a;
        })
      );
    } else if (mode === 'cascade' && !noSpin) {
      actorGrid = range(reels).map((c) => range(rows).map((r) => actors.find((a) => !a.old && a.c === c && a.row === r)));
    }
    const stepsT = [];
    let cum = 0;
    const single = paying.length === 1 && res.steps.length === 1;
    const showFor = () => (single ? (o === 'big' ? num(tm.bigLines, 1.3) : num(tm[o], 2.2)) : num(tm.tumbleShow, 1));
    const popDur = num(tm.tumblePop, 0.36);
    res.steps.forEach((step, k) => {
      if (step.moves && actorGrid) {
        // Tumble: the previous winners burst, survivors fall, new symbols drop.
        const popAt = tcur;
        const removed = new Set(step.removed.map(([c, r]) => K(c, r)));
        for (const [c, r] of step.removed) {
          const a = actorGrid[c][r];
          if (a) {
            a.popAt = popAt;
            a.tOut = popAt + popDur;
          }
        }
        sfx.push({ t: popAt, type: 'pop', n: removed.size });
        const next = range(reels).map(() => new Array(rows).fill(null));
        let settle = popAt + popDur;
        const fallBase = num(tm.tumbleFall, 0.34);
        for (const mv of step.moves) {
          const a = actorGrid[mv.c][mv.from];
          next[mv.c][mv.to] = a;
          if (!a || mv.to === mv.from) continue;
          const d = mv.to - mv.from;
          const dur = fallBase * (0.6 + 0.4 * Math.sqrt(d / rows));
          const ts = popAt + popDur * 0.55 + stopRank[mv.c] * 0.04;
          pushKeys(a.keys, fallKeys(ts, mv.from, mv.to, dur));
          settle = Math.max(settle, ts + dur + 0.18);
        }
        const holesPer = new Array(reels).fill(0);
        for (const [c] of step.refill) holesPer[c]++;
        for (const [c, r, sym] of step.refill) {
          const h = holesPer[c];
          const dist = h + 0.6 + peek;
          const dur = fallBase * (0.7 + 0.4 * Math.sqrt(dist / rows));
          const ts = popAt + popDur * 0.6 + stopRank[c] * 0.05 + (h - 1 - r) * 0.045;
          const a = { id: ++actorId, c, sym, mult: step.mult[c][r], tIn: ts, tOut: Infinity, keys: fallKeys(ts, r - dist, r, dur), row: r };
          actors.push(a);
          next[c][r] = a;
          settle = Math.max(settle, ts + dur + 0.18);
        }
        for (let c = 0; c < reels; c++) if (holesPer[c]) sfx.push({ t: popAt + popDur * 0.6 + stopRank[c] * 0.05 + fallBase * 0.8, type: 'drop', pan: reels > 1 ? (c / (reels - 1)) * 2 - 1 : 0 });
        actorGrid = next;
        tcur = settle + 0.1;
      }
      if (!step.cells.length) return;
      const show = showFor();
      const amt = step.amount || 0;
      const before = cum;
      cum += amt;
      const expanded = new Set(win.expand);
      const cellSyms = step.cells.map(([c, r]) => (expanded.has(c) && ctx.wildSym != null ? ctx.wildSym : step.grid[c][r]));
      const st = { start: tcur, end: tcur + show, cells: step.cells, cellSyms, lines: step.lines, amount: amt, cum, symbol: step.symbol, pattern: step.pattern, count: step.cells.length, index: stepsT.length, tumble: !!tumble };
      stepsT.push(st);
      sfx.push({ t: tcur, type: 'win', step: stepsT.length - 1, amount: amt });
      if (amt > 0) {
        pushKeys(meterKeys, [key(tcur + 0.12, before, { outSpeed: (amt / 0.6) * 1.25 }), key(tcur + 0.72, cum, { inInf: 0.6, hold: true })]);
        sfx.push({ t: tcur + 0.12, type: 'count', dur: 0.6 });
      }
      tcur += show;
    });
    pres.steps = stepsT;
    if (o === 'medium' && stepsT.length) pres.coinBurst = { start: stepsT[0].start + 0.25, count: 46 };

    // ---- multipliers ----
    if (res.mults.length && paying.length && win.amount > 0) {
      const each = num(tm.multEach, 0.5);
      const items = res.mults.map((m, j) => ({ ...m, t: tcur + 0.15 + j * each }));
      const applyAt = items[items.length - 1].t + 0.55;
      pres.mult = { start: tcur, items, sum: win.multSum, base: win.base, total: win.amount, applyAt, end: applyAt + 1.0 };
      items.forEach((it) => sfx.push({ t: it.t, type: 'mult', value: it.value }));
      pushKeys(meterKeys, [key(applyAt, cum, { outSpeed: ((win.amount - cum) / 0.7) * 1.25 }), key(applyAt + 0.7, win.amount, { inInf: 0.6, hold: true })]);
      sfx.push({ t: applyAt, type: 'tierUp' });
      sfx.push({ t: applyAt, type: 'count', dur: 0.7 });
      flashes.push({ t: applyAt, amp: 0.4, dur: 0.3 });
      shakes.push({ t: applyAt, amp: 0.7, dur: 0.4 });
      cum = win.amount;
      tcur = pres.mult.end;
    }

    // ---- presentation by outcome ----
    const overlay = (start, total, titlesOverride) => {
      let reached = tiers.filter((t) => total >= t.x * bet);
      if (!reached.length && (o === 'big' || titlesOverride) && tiers.length && !titlesOverride) reached = [tiers[0]];
      const names = titlesOverride ? [...titlesOverride, ...reached.map((t) => t.id)] : reached.map((t) => t.id);
      if (!names.length) names.push(tiers[0]?.id || 'total');
      const countStart = start + 0.45;
      const countDur = Math.max(2.4, num(tm.tierCount, 2.4) * Math.max(1, reached.length));
      const countEnd = countStart + countDur;
      const keys = [key(countStart, 0, { outSpeed: (total / countDur) * 1.25 }), key(countEnd, total, { inInf: 0.6, hold: true })];
      const tierTimes = names.map((name, k) => {
        if (k === 0) return start;
        const tier = tiers.find((t) => t.id === name);
        const target = tier ? tier.x * bet : 0;
        return Math.max(start + 0.7 * k, crossTime(keys, countStart, countEnd, target));
      });
      const holdEnd = countEnd + num(tm.bigHold, 1.6);
      const ov = { start, countStart, countEnd, holdEnd, end: holdEnd + 0.6, tiers: names, tierTimes, amount: total, keys };
      tierTimes.slice(1).forEach((t) => {
        shakes.push({ t, amp: 1, dur: 0.5 });
        flashes.push({ t, amp: 0.55, dur: 0.35 });
        sfx.push({ t, type: 'tierUp' });
      });
      shakes.push({ t: countEnd, amp: 0.8, dur: 0.45 });
      flashes.push({ t: countEnd, amp: 0.45, dur: 0.3 });
      flashes.push({ t: start + 0.05, amp: 0.35, dur: 0.3 });
      sfx.push({ t: start, type: 'bigWin' }, { t: start, type: 'whoosh' }, { t: countStart, type: 'count', dur: countDur, big: true }, { t: countStart, type: 'coins', dur: countDur }, { t: countEnd, type: 'countEnd' });
      pushKeys(meterKeys, [key(countStart, cum, { outSpeed: ((total - cum) / countDur) * 1.25 }), key(countEnd, total, { inInf: 0.6, hold: true })]);
      return ov;
    };

    if (o === 'none') {
      end = tcur + num(tm.none, 0.45);
    } else if (o === 'nearmiss') {
      pres.nearmiss = { start: tcur, end: tcur + num(tm.nearmiss, 1.3) };
      sfx.push({ t: tcur, type: 'nearMiss' });
      end = pres.nearmiss.end;
    } else if (LINE_WINS.includes(o)) {
      const bigEnough = tiers.length && win.amount >= tiers[0].x * bet;
      if (BIG_WINS.includes(o) || (bigEnough && stepsT.length > 1)) {
        pres.overlay = overlay(tcur - 0.15, win.amount);
        end = pres.overlay.end;
      } else {
        end = Math.max(tcur, spinEnd + 0.5);
      }
    } else if (o === 'freespins' || o === 'bonus') {
      const cel = num(tm.celebrate, 1.8);
      pres.celebrate = { start: tcur, end: tcur + cel };
      const bs = tcur + cel - 0.3;
      pres.banner = { start: bs, end: bs + num(tm.banner, 2.6), kind: o, freeSpins: round.freeSpins | 0 || 10, amount: win.amount };
      if (win.amount > 0) {
        pres.meter = { start: bs + 0.5, end: bs + 1.8 };
        pushKeys(meterKeys, [key(bs + 0.5, 0, { outSpeed: (win.amount / 1.3) * 1.25 }), key(bs + 1.8, win.amount, { inInf: 0.6, hold: true })]);
        sfx.push({ t: bs + 0.5, type: 'count', dur: 1.3 });
      }
      flashes.push({ t: bs + 0.05, amp: 0.4, dur: 0.3 });
      shakes.push({ t: bs + 0.1, amp: 0.6, dur: 0.4 });
      sfx.push({ t: bs, type: 'fsTrigger' }, { t: bs, type: 'coins', dur: 1.2 });
      end = pres.banner.end;
    } else if (o === 'wheel') {
      const cel = num(tm.celebrate, 1.8);
      pres.celebrate = { start: tcur, end: tcur + cel };
      const segs = project.wheel.segments;
      const N = Math.max(2, segs.length);
      const segment = Math.min(N - 1, Math.max(0, round.wheelSegment | 0));
      const inStart = tcur + cel - 0.2;
      const inEnd = inStart + 0.9;
      const spinStart = inEnd + 0.15;
      const spinDur = Math.max(2, num(tm.wheelSpin, 5.8));
      const spinEnd2 = spinStart + spinDur;
      const segDeg = 360 / N;
      const landing = round.wheelLanding || project.wheel.landing || 'tease';
      let off = 0;
      if (landing === 'tease') off = rng() < 0.5 ? -0.42 : 0.42;
      else if (landing === 'random') off = (rng() - 0.5) * 0.7;
      const targetLocal = (segment + 0.5 + off) * segDeg;
      const turns = Math.max(1, num(project.wheel.turns, 5));
      const delta = (((-targetLocal - wheelAngle) % 360) + 360) % 360;
      const total = turns * 360 + delta;
      const windup = 12;
      const accel = 0.6;
      const decel = spinDur - 0.45 - accel;
      const Y = (total + windup) / (1 + (0.3 * 2.2) / decel);
      const vmax = (2.2 * Y) / decel;
      const a0 = wheelAngle;
      const wk = [
        key(spinStart, a0, { outInf: 0.5 }),
        key(spinStart + 0.45, a0 - windup, { inInf: 0.5, outInf: 0.5 }),
        key(spinStart + 0.45 + accel, a0 - windup + 0.3 * vmax, { inSpeed: vmax, outSpeed: vmax, outInf: 0.16 }),
        key(spinEnd2, a0 + total, { inInf: 0.62 }),
      ];
      pushKeys(wheelKeys, wk);
      // A tick every time a peg passes the pointer.
      let lastSeg = Math.floor((a0 - windup) / segDeg);
      for (let t = spinStart + 0.45; t <= spinEnd2; t += 1 / 240) {
        const s2 = Math.floor(evalKeys(wheelKeys, t) / segDeg);
        if (s2 !== lastSeg) {
          sfx.push({ t, type: 'wheelTick' });
          lastSeg = s2;
        }
      }
      wheelAngle = a0 + total;
      const countStart = spinEnd2 + 0.65;
      const countEnd = countStart + 2.2;
      const outStart = countEnd + 1.3;
      pres.wheel = { inStart, inEnd, spinStart, spinEnd: spinEnd2, prizeStart: spinEnd2 + 0.25, countStart, countEnd, outStart, outEnd: outStart + 0.8, segment, amount: win.amount };
      pres.meter = { start: countStart, end: countEnd };
      pushKeys(meterKeys, [key(countStart, 0, { outSpeed: (win.amount / 2.2) * 1.25 }), key(countEnd, win.amount, { inInf: 0.6, hold: true })]);
      flashes.push({ t: inStart + 0.1, amp: 0.4, dur: 0.35 }, { t: spinEnd2 + 0.25, amp: 0.5, dur: 0.35 });
      shakes.push({ t: spinEnd2 + 0.25, amp: 0.8, dur: 0.5 });
      sfx.push({ t: inStart, type: 'whoosh' }, { t: spinEnd2 + 0.2, type: 'wheelLand' }, { t: countStart, type: 'count', dur: 2.2 }, { t: spinEnd2 + 0.25, type: 'coins', dur: 1.5 }, { t: countEnd, type: 'countEnd' }, { t: outStart, type: 'whoosh' });
      end = pres.wheel.outEnd;
    } else if (o === 'fstotal') {
      pres.overlay = overlay(t0 + 0.2, win.amount, ['total']);
      end = pres.overlay.end;
    } else {
      end = tcur + 0.5;
    }

    const next = end + Math.max(0, num(round.hold, 0)) + num(tm.gap, 0.3);
    // After tumbles the reels show the final grid: jump the strips there while
    // the actors cover them, so the next spin starts from what is on screen.
    if (actorsFrom != null && mode !== 'cascade') {
      for (let s = 0; s < nStrips; s++) {
        const col = mode === 'cells' ? [res.finalGrid[Math.floor(s / rows)][s % rows]] : res.finalGrid[s];
        const multCol = mode === 'cells' ? [res.finalMult[Math.floor(s / rows)][s % rows]] : res.finalMult[s];
        const P2 = strips[s].length + 3;
        ensure(strips[s], P2, ctx, rng);
        placeColumn(strips[s], P2, col, dir, stripRows, ctx, rng, stripMults[s], multCol);
        ensure(strips[s], P2 + stripRows + 4, ctx, rng);
        pushKeys(stripKeys[s], [key(next - 0.02, pos[s], { hold: true }), key(next - 0.01, P2, { hold: true })]);
        pos[s] = P2;
      }
    }

    // ---- free spins bookkeeping ----
    let fsInfo = null;
    if (o === 'freespins') {
      if (fs) closeBlock(t0);
      fs = { n: round.freeSpins | 0 || 10, count: 0, total: 0, sticky: !!round.sticky, block: { start: next, end: Infinity, n: round.freeSpins | 0 || 10, rounds: [] } };
      fsBlocks.push(fs.block);
      fsInfo = { trigger: fs.n };
    } else if (round.free && fs) {
      fs.count++;
      fs.total += win.amount || 0;
      fsInfo = { index: fs.count, of: Math.max(fs.n, fs.count), totalAfter: fs.total };
      fs.block.rounds.push({ t0, index: fs.count });
      pushKeys(fsTotalKeys, [key(end - 0.6, fs.total - (win.amount || 0), { outSpeed: ((win.amount || 0) / 0.6) * 1.25 }), key(end, fs.total, { inInf: 0.6, hold: true })]);
    } else if (o === 'fstotal') {
      fsInfo = { total: win.amount };
      if (fs) {
        fs.block.rounds.push({ t0, index: null, total: true });
        closeBlock(next);
      }
    }

    rounds.push({
      index: i,
      id: round.id,
      outcome: o,
      free: !!round.free,
      t0,
      spinEnd,
      presentStart: pres.start,
      end,
      next,
      grid,
      mult: res.mult,
      finalGrid: res.finalGrid,
      finalMult: res.finalMult,
      prevGrid,
      win,
      reels: reelInfo,
      cells: mode === 'cells' ? cellInfo : null,
      actors,
      actorsFrom,
      stopOrder,
      pres,
      fs: fsInfo,
      noSpin,
    });
    if (!noSpin) {
      prevGrid = res.finalGrid;
      prevMult = res.finalMult;
    }
    cursor = next;
  });
  if (fs) closeBlock(cursor);

  const duration = Math.max(1, cursor + num(tm.outro, 0.9));
  for (const s of stickies) if (!Number.isFinite(s.to)) s.to = duration;
  for (const b of fsBlocks) if (!Number.isFinite(b.end)) b.end = duration;
  for (const R of rounds) for (const a of R.actors) if (!Number.isFinite(a.tOut)) a.tOut = R.next;
  for (const k of stripKeys) pushKeys(k, [key(duration, k[k.length - 1].v)]);
  sfx.sort((a, b) => a.t - b.t);
  return {
    duration,
    fps: project.canvas.fps,
    reels,
    rows,
    peek,
    dir,
    mode,
    cascade: mode === 'cascade',
    paylines,
    strips,
    stripKeys,
    stripMults,
    reelKeys: mode === 'reels' ? stripKeys : [],
    meterKeys,
    fsTotalKeys,
    wheelKeys,
    shakes,
    flashes,
    sfx,
    stickies,
    fsBlocks,
    rounds,
    initialGrid,
    tiers,
    orbSym: ctx.orbSym,
  };
}

function range(n) {
  return Array.from({ length: n }, (_, i) => i);
}

export function roundIndexAt(tl, t) {
  let lo = 0;
  let hi = tl.rounds.length - 1;
  if (hi < 0 || t < tl.rounds[0].t0) return -1;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (tl.rounds[m].t0 <= t) lo = m;
    else hi = m - 1;
  }
  return lo;
}

export function fsBlockAt(tl, t) {
  return tl.fsBlocks.find((b) => t >= b.start && t < b.end) || null;
}

export { LINE_WINS, BIG_WINS, SCATTER_WINS, tumbleEnabled };
