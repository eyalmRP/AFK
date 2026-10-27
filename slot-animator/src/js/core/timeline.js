// Builds the whole animation from a project: every reel's motion as
// AE-style keyframes, the symbol strip each reel scrolls through, and a
// schedule of win presentations. Rendering is then a pure function of time,
// so the preview, the MP4 export and the After Effects script agree.

import { mulberry32, hashSeed } from './rng.js';
import { key, pushKeys } from './keys.js';
import { generatePaylines } from './paylines.js';
import { makeContext, randomGrid, resolveRound, fillSymbol } from './outcomes.js';
import { LINE_WINS, BIG_WINS, SCATTER_WINS } from './defaults.js';

export const STRIP_PAD = 4;

const num = (v, d) => (v == null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

function ensure(strip, len, ctx, rng) {
  while (strip.length < len) strip.push(fillSymbol(ctx, rng));
}

function placeColumn(strip, P, column, dir, rows, ctx, rng) {
  ensure(strip, P + rows, ctx, rng);
  for (let k = 0; k < rows; k++) strip[P + k] = dir > 0 ? column[rows - 1 - k] : column[k];
}

// Which reels slow down with an anticipation tease this round.
function anticipationReels(spin, round, win, reels) {
  const out = new Array(reels).fill(false);
  if (spin.type === 'cascade' && !SCATTER_WINS.includes(round.outcome) && round.outcome !== 'nearmiss') return out;
  if (spin.type === 'tease' && reels > 1) out[reels - 1] = true;
  if (SCATTER_WINS.includes(round.outcome) || round.outcome === 'nearmiss') {
    const sc = win.scatters.map(([c]) => c).sort((a, b) => a - b);
    if (sc.length >= 2) for (let c = sc[1] + 1; c < reels; c++) out[c] = true;
  }
  if (round.tease && reels > 1) out[reels - 1] = true;
  return out;
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

function cascadeKeys(opts) {
  const { outS, inS, rows, peek, dropDur } = opts;
  const fallDur = 0.36;
  const fallDist = rows + 1 + peek * 2;
  const dropDist = rows + 0.6 + peek;
  const outKeys = [
    key(outS, 0, { outInf: 0.55 }),
    key(outS + fallDur, fallDist, { inSpeed: (2.1 * fallDist) / fallDur, inInf: 0.3 }),
  ];
  const land = inS + dropDur;
  const inKeys = [
    key(inS, -dropDist, { outInf: 0.55 }),
    key(land, 0, { inSpeed: (2.1 * dropDist) / dropDur, inInf: 0.3, outSpeed: -2.2, outInf: 0.4 }),
    key(land + 0.09, -0.07, { inInf: 0.5, outInf: 0.5 }),
    key(land + 0.18, 0, { inInf: 0.5 }),
  ];
  return { outKeys, inKeys, outStart: outS, outEnd: outS + fallDur, inStart: inS, land, settle: land + 0.18 };
}

export function buildTimeline(project) {
  const { reels, rows } = project.grid;
  const peek = num(project.grid.peek, 0);
  const sp = { ...project.spin };
  const tm = project.timing;
  const paylines = generatePaylines(reels, rows, project.machine.maxLines || 20);
  const ctx = makeContext(project, paylines);
  const rngInit = mulberry32(hashSeed(project.seed, 'init'));
  const initialGrid = randomGrid(ctx, rngInit);
  const dir = sp.direction === 'up' ? -1 : 1;
  const cascade = sp.type === 'cascade';
  const v = Math.max(2, num(sp.speed, 24));

  const strips = [];
  const reelKeys = [];
  const pos = [];
  for (let c = 0; c < reels; c++) {
    const strip = [];
    ensure(strip, STRIP_PAD, ctx, rngInit);
    placeColumn(strip, STRIP_PAD, initialGrid[c], dir, rows, ctx, rngInit);
    ensure(strip, STRIP_PAD + rows + 3, ctx, rngInit);
    strips.push(strip);
    reelKeys.push([key(0, STRIP_PAD)]);
    pos.push(STRIP_PAD);
  }

  const meterKeys = [key(0, 0, { hold: true })];
  const wheelKeys = [key(0, 0)];
  let wheelAngle = 0;
  const shakes = [];
  const flashes = [];
  const rounds = [];
  let prevGrid = initialGrid;
  let cursor = num(tm.intro, 0.6);

  project.rounds.forEach((round, i) => {
    const rng = mulberry32(hashSeed(project.seed, round.seed, i));
    const { grid, win } = resolveRound(ctx, project, round, rng);
    const t0 = cursor;
    const mid = Math.max(0, num(round.midDuration, sp.midDuration));
    const antic = anticipationReels(sp, round, win, reels);
    const reelInfo = [];
    let shift = 0;
    let cascadeCells = null;

    if (!cascade) {
      for (let c = 0; c < reels; c++) {
        const ts = t0 + c * sp.startStagger;
        const normalStop = t0 + sp.startDuration + mid + sp.endDuration + c * sp.stopStagger;
        const prevShift = shift;
        if (antic[c]) shift += sp.anticipation;
        const stop = Math.max(normalStop + shift, ts + sp.startDuration + 0.25);
        const a = antic[c] ? { tSlow: normalStop + prevShift - sp.endDuration } : null;
        const { keys, T, settle } = reelKeysFor({ sp, ts, P0: pos[c], v, stop, antic: a, minDistance: rows + 2 });
        pushKeys(reelKeys[c], keys);
        const strip = strips[c];
        ensure(strip, T, ctx, rng);
        placeColumn(strip, T, grid[c], dir, rows, ctx, rng);
        ensure(strip, T + rows + 4, ctx, rng);
        if (win.nearMiss && win.nearMiss.reel === c) {
          const idx = win.nearMiss.position === 'above' ? T + rows : T - 1;
          strip[idx] = win.nearMiss.symbol;
        }
        reelInfo.push({ start: ts, stop, settle, antic: a ? { start: a.tSlow, end: stop } : null, from: pos[c], to: T });
        pos[c] = T;
      }
    } else {
      cascadeCells = [];
      // New symbols start falling as soon as the first column has cleared.
      const inBase = t0 + (rows - 1) * 0.035 + 0.3 + mid * 0.35;
      for (let c = 0; c < reels; c++) {
        const col = [];
        const prevShift = shift;
        if (antic[c]) shift += sp.anticipation;
        let last = 0;
        let first = Infinity;
        for (let r = 0; r < rows; r++) {
          const outS = t0 + c * sp.startStagger + (rows - 1 - r) * 0.035;
          const inS = inBase + c * sp.stopStagger + (rows - 1 - r) * 0.05 + shift;
          const ck = cascadeKeys({ outS, inS, rows, peek, dropDur: 0.3 + 0.02 * (rows - r) });
          col.push(ck);
          last = Math.max(last, ck.settle);
          first = Math.min(first, ck.land);
        }
        cascadeCells.push(col);
        reelInfo.push({
          start: t0 + c * sp.startStagger,
          stop: first,
          settle: last,
          antic: antic[c] ? { start: inBase + c * sp.stopStagger + prevShift - 0.2, end: first } : null,
        });
        // Keep the strip position meaningful for a later switch back to reels.
        pushKeys(reelKeys[c], [key(t0, pos[c])]);
      }
    }

    const spinEnd = Math.max(...reelInfo.map((r) => r.settle));
    const T = spinEnd + 0.08;
    const pres = { start: T };
    const o = round.outcome;
    let end;
    if (o === 'none') {
      end = T + num(tm.none, 0.45);
    } else if (o === 'nearmiss') {
      pres.nearmiss = { start: T, end: T + num(tm.nearmiss, 1.3) };
      end = pres.nearmiss.end;
    } else if (o === 'small' || o === 'medium') {
      const d = num(tm[o], 2.4);
      pres.lines = { start: T, end: T + d };
      pres.meter = { start: T + 0.15, end: T + (o === 'small' ? 0.9 : 1.5) };
      pres.floatText = { start: T + 0.25, end: T + d };
      if (o === 'medium') pres.coinBurst = { start: T + 0.25, count: 46 };
      end = T + d;
    } else if (BIG_WINS.includes(o)) {
      const linesDur = num(tm.bigLines, 1.3);
      const ov = T + linesDur - 0.15;
      const countDur = num(tm[o], 5);
      const countStart = ov + 0.45;
      const countEnd = countStart + countDur;
      const holdEnd = countEnd + num(tm.bigHold, 1.6);
      const tiers = win.tiers.length ? win.tiers : ['big'];
      const tierTimes = tiers.map((_, k) => (k === 0 ? ov : countStart + (countDur * k) / tiers.length));
      pres.lines = { start: T, end: ov + 0.5 };
      pres.overlay = { start: ov, countStart, countEnd, holdEnd, end: holdEnd + 0.6, tiers, tierTimes, amount: win.amount };
      pres.meter = { start: countStart, end: countEnd };
      tierTimes.slice(1).forEach((t) => {
        shakes.push({ t, amp: 1, dur: 0.5 });
        flashes.push({ t, amp: 0.55, dur: 0.35 });
      });
      shakes.push({ t: countEnd, amp: 0.8, dur: 0.45 });
      flashes.push({ t: countEnd, amp: 0.45, dur: 0.3 });
      flashes.push({ t: ov + 0.05, amp: 0.35, dur: 0.3 });
      end = pres.overlay.end;
    } else if (o === 'freespins' || o === 'bonus') {
      const cel = num(tm.celebrate, 1.8);
      pres.celebrate = { start: T, end: T + cel };
      const bs = T + cel - 0.3;
      pres.banner = { start: bs, end: bs + num(tm.banner, 2.6), kind: o, freeSpins: round.freeSpins | 0 || 10, amount: win.amount };
      if (win.amount > 0) pres.meter = { start: bs + 0.5, end: bs + 1.8 };
      flashes.push({ t: bs + 0.05, amp: 0.4, dur: 0.3 });
      shakes.push({ t: bs + 0.1, amp: 0.6, dur: 0.4 });
      end = pres.banner.end;
    } else if (o === 'wheel') {
      const cel = num(tm.celebrate, 1.8);
      pres.celebrate = { start: T, end: T + cel };
      const segs = project.wheel.segments;
      const N = Math.max(2, segs.length);
      const segment = Math.min(N - 1, Math.max(0, round.wheelSegment | 0));
      const inStart = T + cel - 0.2;
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
      let delta = (((-targetLocal - wheelAngle) % 360) + 360) % 360;
      const total = turns * 360 + delta;
      const windup = 12;
      const accel = 0.6;
      const decel = spinDur - 0.45 - accel;
      const Y = (total + windup) / (1 + (0.3 * 2.2) / decel);
      const vmax = (2.2 * Y) / decel;
      const a0 = wheelAngle;
      pushKeys(wheelKeys, [
        key(spinStart, a0, { outInf: 0.5 }),
        key(spinStart + 0.45, a0 - windup, { inInf: 0.5, outInf: 0.5 }),
        key(spinStart + 0.45 + accel, a0 - windup + 0.3 * vmax, { inSpeed: vmax, outSpeed: vmax, outInf: 0.16 }),
        key(spinEnd2, a0 + total, { inInf: 0.62 }),
      ]);
      wheelAngle = a0 + total;
      const countStart = spinEnd2 + 0.65;
      const countEnd = countStart + 2.2;
      const outStart = countEnd + 1.3;
      pres.wheel = {
        inStart,
        inEnd,
        spinStart,
        spinEnd: spinEnd2,
        prizeStart: spinEnd2 + 0.25,
        countStart,
        countEnd,
        outStart,
        outEnd: outStart + 0.8,
        segment,
        amount: win.amount,
      };
      pres.meter = { start: countStart, end: countEnd };
      flashes.push({ t: inStart + 0.1, amp: 0.4, dur: 0.35 });
      flashes.push({ t: spinEnd2 + 0.25, amp: 0.5, dur: 0.35 });
      shakes.push({ t: spinEnd2 + 0.25, amp: 0.8, dur: 0.5 });
      end = pres.wheel.outEnd;
    } else {
      end = T + 0.5;
    }

    // HUD win meter: resets when the spin starts, counts up during the win.
    pushKeys(meterKeys, [key(t0, 0, { hold: true })]);
    if (pres.meter && win.amount > 0) {
      const d = Math.max(0.1, pres.meter.end - pres.meter.start);
      pushKeys(meterKeys, [
        key(pres.meter.start, 0, { outSpeed: (win.amount / d) * 1.25 }),
        key(pres.meter.end, win.amount, { inInf: 0.6, hold: true }),
      ]);
    }

    rounds.push({
      index: i,
      id: round.id,
      outcome: o,
      t0,
      spinEnd,
      presentStart: T,
      end,
      next: end + Math.max(0, num(round.hold, 0)) + num(tm.gap, 0.3),
      grid,
      prevGrid,
      win,
      reels: reelInfo,
      cascade: cascadeCells,
      pres,
    });
    prevGrid = grid;
    cursor = rounds[rounds.length - 1].next;
  });

  const duration = Math.max(1, cursor + num(tm.outro, 0.9));
  for (const k of reelKeys) pushKeys(k, [key(duration, k[k.length - 1].v)]);
  return {
    duration,
    fps: project.canvas.fps,
    reels,
    rows,
    peek,
    dir,
    cascade,
    paylines,
    strips,
    reelKeys,
    meterKeys,
    wheelKeys,
    shakes,
    flashes,
    rounds,
    initialGrid,
  };
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

export { LINE_WINS, BIG_WINS, SCATTER_WINS };
