// Builds the whole animation from a project. Reels and per-cell reels move
// along symbol strips driven by AE-style keyframes; cascade drops and tumbles
// move individual symbol "actors", each with its own keyframed row position.
// On top of that sits a schedule of win steps, multiplier collection, big
// win overlays, banners, the bonus wheel, the free spins block and the sound
// cues. Rendering is a pure function of time, so the preview, the MP4 and the
// After Effects script agree.

import { mulberry32, hashSeed, shuffle } from './rng.js';
import { key, pushKeys, evalKeys } from './keys.js';
import { generatePaylines } from './paylines.js';
import { makeContext, randomGrid, resolveRound, fillSymbol, tumbleEnabled } from './outcomes.js';
import { orderList, ranksOf, cellOrderList } from './order.js';
import { keyOf } from './grid.js';
import { LINE_WINS, BIG_WINS, SCATTER_WINS, GAME_OUTCOMES } from './defaults.js';
import { holdSpinConfig, pickCoinValue, coinTypeIndex, isCoinSym } from './coins.js';
import { scheduleParticles } from './particles.js';
import { winFxConfig, winStyleOf, scheduleWinFx } from './winfx.js';
import { scheduleCamera } from './camera.js';
import { wheelConfig, wheelLandings, segmentKind, SLIP } from './wheel.js';
import { potsConfig, pickPot, ownerOf, symbolKey } from './pots.js';
import { jackpotsConfig, jackpotLedger, jackpotTier, wheelJackpot, JP_CELEBRATE } from './jackpots.js';

// Rounds that can award a jackpot box at their end.
export const JACKPOT_ROUNDS = ['none', 'nearmiss', 'small', 'medium', 'big', 'freespins', 'bonus', 'wheel'];

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
  const bet = Number(project.machine.bet) > 0 ? Number(project.machine.bet) : 1;
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
  const stripValues = [];
  const pos = [];
  for (let i = 0; i < nStrips; i++) {
    const strip = [];
    ensure(strip, STRIP_PAD, ctx, rngInit);
    const col = mode === 'cells' ? [initialGrid[Math.floor(i / rows)][i % rows]] : initialGrid[i];
    placeColumn(strip, STRIP_PAD, col, dir, stripRows, ctx, rngInit);
    ensure(strip, STRIP_PAD + stripRows + 3, ctx, rngInit);
    strips.push(strip);
    stripKeys.push([key(0, STRIP_PAD)]);
    stripValues.push(new Map());
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
  const reveals = [];
  const fsBlocks = [];
  // Pots above the machine: when each fires or catches a beam, when it
  // charges, and the value on its nameplate.
  const potCfg = potsConfig(project);
  const potHits = [];
  const potCharges = [];
  const potShow = [];
  const potValueKeys = Array.from({ length: potCfg.count }, () => [key(0, 0, { hold: true })]);
  // By symbol: the pot a symbol belongs to.
  const potOf = (sym) => ownerOf(project, potCfg, symbolKey(project, ctx.lay, sym));
  const rounds = [];
  let prevGrid = initialGrid;
  let prevMult = initialGrid.map((col) => col.map(() => null));
  let cursor = num(tm.intro, 0.6);
  let fs = null;
  let stickyOpen = new Map();
  let actorId = 0;
  const game = project.game || 'slot';

  // ---- Hold & Spin board ----
  // Its own per-cell strips of coins and empty cells, shown in windows over
  // the machine's reels. Coins that land lock; the counter counts respins.
  const lay = ctx.lay;
  const hsCfg = holdSpinConfig(project);
  // Progressive jackpot boxes: what each shows and pays over time.
  const jpCfg = jackpotsConfig(project);
  const jp = jackpotLedger(jpCfg);
  const jpShown = (id) => jpCfg.on && !!jackpotTier(jpCfg, id);
  // The box a jackpot coin belongs to (Mini, Minor, Major), if shown.
  const jpOfSym = (sym) => {
    if (!jpCfg.on || !isCoinSym(lay, sym)) return null;
    const id = hsCfg.coins[sym - lay.coinBase]?.id;
    return jpShown(id) ? id : null;
  };
  const nCells = reels * rows;
  const rngHS = mulberry32(hashSeed(project.seed, 'holdspin'));
  const hsStrips = [];
  const hsKeys = [];
  const hsVals = [];
  const hsPos = [];
  const hsFill = (rng) => {
    const x = rng();
    if (x < 0.72) return [lay.blankSym, null];
    const ti = x > 0.985 && hsCfg.coins.length > 1 ? 1 + Math.floor(rng() * (hsCfg.coins.length - 1)) : 0;
    return [lay.coinBase + ti, pickCoinValue(hsCfg.coins[ti], rng) * bet];
  };
  const hsEnsure = (k, len, rng) => {
    const strip = hsStrips[k];
    while (strip.length < len) {
      const [sym, val] = hsFill(rng);
      if (val != null) hsVals[k].set(strip.length, val);
      strip.push(sym);
    }
  };
  const hsSet = (k, j, sym, val) => {
    hsStrips[k][j] = sym;
    if (val != null) hsVals[k].set(j, val);
    else hsVals[k].delete(j);
  };
  for (let k = 0; k < nCells; k++) {
    hsStrips.push([]);
    hsVals.push(new Map());
    hsEnsure(k, STRIP_PAD + 5, rngHS);
    hsSet(k, STRIP_PAD, lay.blankSym, null);
    hsKeys.push([key(0, STRIP_PAD)]);
    hsPos.push(STRIP_PAD);
  }
  // Show a symbol on a cell from time t on, without spinning.
  const hsJump = (k, t, sym, val) => {
    const P2 = hsStrips[k].length + 2;
    hsEnsure(k, P2 + 5, rngHS);
    hsSet(k, P2, sym, val);
    const ks = hsKeys[k];
    if (t <= 0.02 && ks.length === 1) ks[0] = key(0, P2);
    else pushKeys(ks, [key(t - 0.011, hsPos[k], { hold: true }), key(t - 0.001, P2, { hold: true })]);
    hsPos[k] = P2;
  };
  const hsWindows = [];
  const hsLocks = [];
  const hsCounterKeys = [key(0, 0, { hold: true })];
  const collectKeys = [key(0, 0, { hold: true })];
  let hs = null;
  const openHold = (t, fadeIn, coins) => {
    hs = { start: t, counter: hsCfg.respins, locked: new Map(), full: false, window: { start: t, end: Infinity, fadeIn, fadeOut: 0.4 } };
    hsWindows.push(hs.window);
    const at = new Map(coins.map((cn) => [K(cn.c, cn.r), cn]));
    for (let k = 0; k < nCells; k++) {
      const cn = at.get(k);
      const appear = cn && cn.appear != null ? Math.max(t, cn.appear) : t;
      const now = cn && appear <= t + 1e-6;
      hsJump(k, t, now ? cn.sym : lay.blankSym, now ? cn.value : null);
      if (cn && !now) hsJump(k, appear, cn.sym, cn.value);
      if (cn) {
        const lock = { c: cn.c, r: cn.r, sym: cn.sym, value: cn.value, from: appear, to: Infinity, special: cn.sym !== lay.coinBase, start: true };
        hs.locked.set(k, lock);
        hsLocks.push(lock);
        if (jpOfSym(cn.sym)) jp.blink(jpOfSym(cn.sym), appear);
        if (!now) sfx.push({ t: appear, type: 'coinLand', special: lock.special });
      }
    }
    if (hs.locked.size >= nCells) hs.full = true;
    pushKeys(hsCounterKeys, [key(t, hsCfg.respins, { hold: true })]);
    pushKeys(collectKeys, [key(t, 0, { hold: true })]);
    pushKeys(meterKeys, [key(t, 0, { hold: true })]);
  };
  const closeHold = (t) => {
    if (!hs) return;
    hs.window.end = t;
    for (const l of hs.locked.values()) if (!Number.isFinite(l.to)) l.to = t;
    hs = null;
  };
  // Starting coins in random cells, popping in one after another.
  const startCoins = (n, rng, from) =>
    shuffle(rng, range(nCells))
      .slice(0, Math.min(nCells - 1, n))
      .map((k, i) => ({ c: Math.floor(k / rows), r: k % rows, sym: lay.coinBase, value: pickCoinValue(hsCfg.coins[0], rng) * bet, appear: from + i * 0.09 }));
  if (game === 'holdspin') openHold(0, 0, startCoins(hsCfg.startCoins, mulberry32(hashSeed(project.seed, 'hsstart')), 0.3));
  let wheelShown = false;

  // The block ends: its sticky wilds fade out over the next spin.
  const closeBlock = (t) => {
    if (!fs) return;
    for (const s of stickyOpen.values()) {
      s.to = t;
      s.fade = true;
    }
    stickyOpen = new Map();
    fs.block.end = t;
    fs = null;
  };
  // Jump strip s, at t, to a copy of what it shows with `col` in the window
  // (the symbols just outside the window stay as they were).
  const swapStrip = (s, t, col, multCol, rng) => {
    const strip = strips[s];
    const P1 = pos[s];
    const P2 = strip.length + 6;
    ensure(strip, P2 + stripRows + 6, ctx, rng);
    for (let d = -4; d < stripRows + 4; d++) {
      strip[P2 + d] = strip[P1 + d];
      const v = stripValues[s].get(P1 + d);
      if (v != null) stripValues[s].set(P2 + d, v);
      else stripValues[s].delete(P2 + d);
    }
    placeColumn(strip, P2, col, dir, stripRows, ctx, rng, stripValues[s], multCol);
    pushKeys(stripKeys[s], [key(t - 0.01, P1, { hold: true }), key(t, P2, { hold: true })]);
    pos[s] = P2;
  };

  project.rounds.forEach((round, i) => {
    const rng = mulberry32(hashSeed(project.seed, round.seed, i));
    const t0 = cursor;
    // Each game plays only its own kinds of round.
    const allowed = GAME_OUTCOMES[game] || GAME_OUTCOMES.slot;
    const o = allowed.includes(round.outcome) ? round.outcome : game === 'wheel' ? 'wheel' : game === 'holdspin' ? 'respin' : 'none';
    if (fs && !round.free && o !== 'fstotal') closeBlock(t0);
    if (hs && game === 'slot' && o !== 'respin' && o !== 'collect') closeHold(t0);
    const stopOrderKind = round.stopOrder || sp.stopOrder || 'ltr';
    const stopOrder = orderList(stopOrderKind, reels, sp.customStop, rng);
    const startOrder = orderList(sp.startOrder || 'ltr', reels, sp.customStart, rng);
    const stopRank = ranksOf(stopOrder);
    const startRank = ranksOf(startOrder);
    const cellOrder = cellOrderList(sp.cellOrder || 'columns', reels, rows, stopOrder, rng);
    // ---- walking wilds step one reel to the left as each free spin starts;
    // one on the first reel walks off ----
    const spins = !(o === 'fstotal' || o === 'respin' || o === 'collect' || game !== 'slot');
    // The cell a walking wild leaves still holds the wild it landed as:
    // while the wild still hides it, the reel there swaps to an ordinary
    // symbol (cascade drops take it from `vacated`).
    const vacated = new Map();
    if (fs && fs.walking && round.free && spins && stickyOpen.size) {
      const moved = new Map();
      const rngW = mulberry32(hashSeed(project.seed, 'walk', i));
      for (const st of stickyOpen.values()) vacated.set(K(st.c, st.r), fillSymbol(ctx, rngW));
      if (mode === 'reels') {
        for (const c of new Set([...vacated.keys()].map((k) => Math.floor(k / rows)))) {
          swapStrip(c, t0 - 0.02, prevGrid[c].map((sym, r) => vacated.get(K(c, r)) ?? sym), prevMult[c].map((v, r) => (vacated.has(K(c, r)) ? null : v)), rngW);
        }
      } else if (mode === 'cells') for (const [k, sym] of vacated) swapStrip(k, t0 - 0.02, [sym], [null], rngW);
      for (const st of stickyOpen.values()) {
        st.to = t0;
        const seg = { c: st.c - 1, r: st.r, from: t0, to: Infinity, cover: t0 + WILD_WALK, walkIn: [st.c, st.r], walking: true };
        stickies.push(seg);
        if (seg.c < 0) {
          seg.to = t0 + WILD_WALK;
          seg.cover = Infinity;
          seg.exit = true;
        } else moved.set(K(seg.c, seg.r), seg);
      }
      stickyOpen = moved;
      sfx.push({ t: t0, type: 'wildWalk' });
    }
    const carry = {
      sticky: fs && round.free ? new Set(stickyOpen.keys()) : new Set(),
      fsTotal: fs ? fs.total : 0,
      lastReel: stopOrder[stopOrder.length - 1],
    };
    const res = resolveRound(ctx, project, o === round.outcome ? round : { ...round, outcome: o }, rng, carry);
    const { win } = res;
    const grid = res.grid;
    const mid = Math.max(0, num(round.midDuration, sp.midDuration));
    const reelInfo = [];
    const cellInfo = [];
    const actors = [];
    let actorsFrom = null;
    let spinEnd = t0;
    // Respins spin the Hold & Spin board, not the machine; the wheel game
    // and the Hold & Spin game never spin the machine.
    const noSpin = o === 'fstotal' || o === 'respin' || o === 'collect' || game !== 'slot';

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
    // Mystery blocks land in place of the symbols they will reveal.
    const mysteryAt = new Set(win.mystery && !noSpin ? win.mystery.cells.map(([c, r]) => K(c, r)) : []);
    const mysteryActors = new Map();
    // Boosted cells land as an ordinary symbol; a pot's beam upgrades them.
    const boostAt = new Map(noSpin ? [] : (win.boosts || []).map((b) => [K(b.c, b.r), b]));
    const boostActors = new Map();
    const landCol = (c) => grid[c].map((sym, r) => (mysteryAt.has(K(c, r)) ? lay.mysterySym : boostAt.has(K(c, r)) ? boostAt.get(K(c, r)).from : sym));
    const landMult = (c) => res.mult[c].map((v, r) => (boostAt.has(K(c, r)) ? null : v));

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
        placeColumn(strip, T, landCol(c), dir, rows, ctx, rng, stripValues[c], landMult(c));
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
        placeColumn(strip, T, [landCol(c)[r]], dir, 1, ctx, rng, stripValues[idx], [landMult(c)[r]]);
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
          // A column held back by a tease keeps its old symbols until just
          // before its new ones drop, instead of standing empty.
          const outS = t0 + startRank[c] * sp.startStagger + (rows - 1 - r) * 0.035 + delays[c].start + shift;
          const gone = vacated.get(K(c, r));
          actors.push({ id: ++actorId, c, sym: gone ?? prevGrid[c][r], mult: gone != null ? null : prevMult[c][r], tIn: t0, tOut: outS + 0.36, keys: exitKeys(outS, r, rows + 1 + peek * 2, 0.36), old: true });
          const inS = inBase + stopRank[c] * sp.stopStagger + (rows - 1 - r) * 0.05 + shift + delays[c].stop;
          const dropDur = 0.3 + 0.02 * (rows - r);
          const keys = fallKeys(inS, r - (rows + 0.6 + peek), r, dropDur);
          const act = { id: ++actorId, c, sym: landCol(c)[r], mult: landMult(c)[r], tIn: inS, tOut: Infinity, keys, row: r };
          actors.push(act);
          if (mysteryAt.has(K(c, r))) mysteryActors.set(K(c, r), act);
          if (boostAt.has(K(c, r))) boostActors.set(K(c, r), act);
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

    // ---- landing build-up: every reel (or cell) that brings a winner
    // lands with a bump that grows, and a cue that climbs ----
    if (!noSpin && project.effects?.landShake && o !== 'nearmiss' && win.cells?.length) {
      const lands = mode === 'cells' ? win.cells.map(([c, r]) => cellInfo[K(c, r)]?.stop) : [...new Set(win.cells.map(([c]) => c))].map((c) => reelInfo[c]?.stop);
      const times = lands.filter((t) => t != null).sort((a, b) => a - b);
      times.forEach((t, k) => {
        const u = times.length > 1 ? k / (times.length - 1) : 1;
        shakes.push({ t, amp: LAND_SHAKE[0] + (LAND_SHAKE[1] - LAND_SHAKE[0]) * u, dur: 0.22 + 0.12 * u });
        sfx.push({ t, type: 'winLand', step: k });
      });
    }

    for (const cn of win.coins || []) {
      const landT = mode === 'cells' ? cellInfo[K(cn.c, cn.r)]?.stop : reelInfo[cn.c]?.stop;
      if (landT != null) sfx.push({ t: landT + 0.02, type: 'coinLand', special: cn.type > 0 });
    }

    // ---- Hold & Spin respin: every empty cell spins on its own ----
    let hsInfo = null;
    if (o === 'respin') {
      let tSpin = t0;
      if (!hs) {
        const n0 = hsCfg.startCoins;
        openHold(t0, 0.4, startCoins(n0, rng, t0 + 0.45));
        tSpin = t0 + 0.6 + n0 * 0.09;
      }
      const order = cellOrderList(sp.cellOrder || 'columns', reels, rows, stopOrder, rng).filter(([c, r]) => !hs.locked.has(K(c, r)));
      const want = round.fill ? order.length : Math.max(0, Math.min(order.length, Math.round(Number(round.coinsIn)) || 0));
      const before = hs.counter;
      const hitSet = new Set(shuffle(rng, order.map(([c, r]) => K(c, r))).slice(0, want));
      // Last chance: the coin that keeps the feature alive lands on the last cell to stop.
      const lastK = order.length ? K(...order[order.length - 1]) : null;
      if (want > 0 && before <= 1 && lastK != null && !hitSet.has(lastK)) {
        hitSet.delete([...hitSet][0]);
        hitSet.add(lastK);
      }
      const specials = (round.specials || []).map((id) => coinTypeIndex(project, id)).filter((x) => x > 0);
      const typeOf = new Map(shuffle(rng, [...hitSet]).map((k, j) => [k, j < specials.length ? specials[j] : 0]));
      const fills = want > 0 && want === order.length;
      const teaseN = fills ? Math.min(2, order.length) : want > 0 && before <= 1 ? 1 : 0;
      pushKeys(hsCounterKeys, [key(tSpin, Math.max(0, before - 1), { hold: true })]);
      const cellsI = [];
      let shift = 0;
      let firstHit = Infinity;
      const stag = Math.max(0.03, sp.stopStagger * 0.35);
      const midHS = Math.max(0, num(round.midDuration, hsCfg.respinMid));
      order.forEach(([c, r], rank) => {
        const k = K(c, r);
        const antic = rank >= order.length - teaseN;
        const ts = tSpin + rank * 0.012;
        const normalStop = tSpin + sp.startDuration + midHS + sp.endDuration + rank * stag;
        const prevShift = shift;
        if (antic) shift += sp.anticipation * 0.6;
        const stop = Math.max(normalStop + shift, ts + sp.startDuration + 0.25);
        const a = antic ? { tSlow: normalStop + prevShift - sp.endDuration } : null;
        const { keys, T, settle } = reelKeysFor({ sp, ts, P0: hsPos[k], v, stop, antic: a, minDistance: 3 });
        pushKeys(hsKeys[k], keys);
        hsEnsure(k, T + 6, rng);
        const hit = hitSet.has(k);
        const ti = hit ? typeOf.get(k) : -1;
        const sym = hit ? lay.coinBase + ti : lay.blankSym;
        const value = hit ? pickCoinValue(hsCfg.coins[ti], rng) * bet : null;
        hsSet(k, T, sym, value);
        hsPos[k] = T;
        cellsI.push({ c, r, k, rank, start: ts, stop, settle, antic: a ? { start: a.tSlow, end: stop } : null, hit, sym, value, special: ti > 0 });
        if (hit) {
          const lock = { c, r, sym, value, from: stop, to: Infinity, special: ti > 0 };
          hs.locked.set(k, lock);
          hsLocks.push(lock);
          if (jpOfSym(sym)) jp.blink(jpOfSym(sym), stop);
          firstHit = Math.min(firstHit, stop);
          sfx.push({ t: stop, type: 'coinLand', special: ti > 0, pan: reels > 1 ? (c / (reels - 1)) * 2 - 1 : 0 });
        } else sfx.push({ t: stop, type: 'cellStop', pan: reels > 1 ? (c / (reels - 1)) * 2 - 1 : 0 });
        if (a) sfx.push({ t: a.tSlow, type: 'anticipation', dur: stop - a.tSlow });
      });
      if (firstHit < Infinity && hsCfg.reset) {
        pushKeys(hsCounterKeys, [key(firstHit, hsCfg.respins, { hold: true })]);
        if (before - 1 < hsCfg.respins) sfx.push({ t: firstHit + 0.05, type: 'respinReset' });
      }
      hs.counter = firstHit < Infinity && hsCfg.reset ? hsCfg.respins : Math.max(0, before - 1);
      if (hs.locked.size >= nCells) hs.full = true;
      spinEnd = cellsI.length ? Math.max(...cellsI.map((x) => x.settle)) : tSpin;
      if (cellsI.length) sfx.push({ t: tSpin, type: 'spinLoop', dur: Math.max(0.2, Math.max(...cellsI.map((x) => x.stop)) - tSpin) });
      if (hs.full && fills) {
        flashes.push({ t: spinEnd, amp: 0.5, dur: 0.35 });
        shakes.push({ t: spinEnd, amp: 0.8, dur: 0.45 });
      }
      hsInfo = { kind: 'respin', tSpin, cells: cellsI, before, after: hs.counter, hits: cellsI.filter((x) => x.hit).length, coins: hs.locked.size, full: hs.full };
    }

    // ---- boosters: the pots charge, then fire a beam at each boosted cell,
    // one after another; each cell upgrades as its beam hits ----
    const newStickyValues = [];
    let boost = null;
    if (boostAt.size) {
      const start = spinEnd + 0.08;
      const aim = round.potAim && round.potAim !== 'auto' ? String(round.potAim) : potCfg.aim;
      const fireAt = start + BOOST.charge;
      const items = win.boosts.map((b, j) => {
        const fire = fireAt + j * Math.max(0.12, potCfg.beam.stagger);
        return { ...b, pot: pickPot(potCfg, 'upgrade', aim, b.c, reels, j, potOf(b.to)), fire, hit: fire + potCfg.beam.travel };
      });
      boost = { start, chargeEnd: fireAt, items, end: items[items.length - 1].hit + BOOST.after };
    }
    const boostHit = new Map(boost ? boost.items.map((it) => [K(it.c, it.r), it.hit]) : []);

    // ---- sticky wilds: held cells shown from the moment they land; once
    // the wild has popped in, its cell is cut out of the spinning strip ----
    if (fs && round.free && !noSpin && ctx.wildSym != null) {
      for (const [c, r] of win.wilds) {
        const k = K(c, r);
        if (stickyOpen.has(k)) continue;
        if (!(round.sticky || fs.sticky || fs.walking)) continue;
        // A wild a beam brings sticks from when it hits.
        const landT = boostHit.get(k) ?? (mode === 'cells' ? cellInfo[k].stop : reelInfo[c].stop);
        const s = { c, r, from: landT, to: Infinity, walking: !!fs.walking };
        // A multiplier wild keeps its x on show for the spin it landed in.
        if (res.mult[c][r] != null) {
          s.value = res.mult[c][r];
          newStickyValues.push(s);
        }
        stickyOpen.set(k, s);
        stickies.push(s);
        sfx.push({ t: landT + 0.05, type: 'sticky' });
      }
    }

    const pres = { start: spinEnd + 0.08, holdspin: hsInfo };
    let tcur = spinEnd + 0.08;
    let end;
    // HUD win meter resets when a new spin starts (Hold & Spin rounds keep it
    // for the collect).
    if (o !== 'fstotal' && o !== 'respin' && o !== 'collect') pushKeys(meterKeys, [key(t0, 0, { hold: true })]);

    if (boost) {
      pres.boost = boost;
      pres.beams = boost.items.map((it) => ({ pot: it.pot, c: it.c, r: it.r, up: false, fire: it.fire, travel: potCfg.beam.travel }));
      for (let p = 0; p < potCfg.count; p++) {
        const mine = boost.items.filter((it) => it.pot === p);
        if (mine.length) potCharges.push([boost.start, mine[mine.length - 1].fire, p]);
      }
      sfx.push({ t: boost.start, type: 'potCharge', dur: BOOST.charge });
      // What each reel shows as the beams land one by one (a mystery block
      // or a cell not hit yet keeps its landing symbol).
      const shown = range(reels).map((c) => landCol(c));
      const shownMult = range(reels).map((c) => landMult(c));
      for (const it of boost.items) {
        shown[it.c][it.r] = grid[it.c][it.r];
        shownMult[it.c][it.r] = res.mult[it.c][it.r];
        potHits.push([it.fire, it.pot, 1]);
        sfx.push({ t: it.fire, type: 'beam' }, { t: it.hit, type: 'upgrade', kind: it.kind });
        flashes.push({ t: it.hit, amp: 0.12, dur: 0.2 });
        // The cell is the beam's while it upgrades; under it the reel swaps.
        reveals.push({ c: it.c, r: it.r, from: it.hit - BOOST.lead, cover: it.hit - BOOST.lead, to: it.hit + BOOST.pop, boost: true });
        if (mode === 'reels') swapStrip(it.c, it.hit + 0.02, shown[it.c].slice(), shownMult[it.c].slice(), rng);
        else if (mode === 'cells') swapStrip(K(it.c, it.r), it.hit + 0.02, [grid[it.c][it.r]], [res.mult[it.c][it.r]], rng);
        else {
          const a = boostActors.get(K(it.c, it.r));
          if (a) {
            a.tOut = it.hit;
            a.row = null;
            actors.push({ id: ++actorId, c: it.c, sym: grid[it.c][it.r], mult: res.mult[it.c][it.r], tIn: it.hit, tOut: Infinity, keys: [key(it.hit, it.r)], row: it.r });
          }
        }
      }
      tcur = boost.end;
    }

    // ---- mystery blocks flip over together, revealing one symbol; under
    // the cards the reels swap to it ----
    if (mysteryAt.size) {
      const flipAt = tcur + MYSTERY.build;
      const flipEnd = flipAt + MYSTERY.flip;
      const mid = (flipAt + flipEnd) / 2;
      const cells = win.mystery.cells;
      pres.mystery = { start: tcur, flipAt, mid, flipEnd, end: flipEnd + MYSTERY.after, cells, sym: win.mystery.sym, from: lay.mysterySym };
      for (const [c, r] of cells) reveals.push({ c, r, from: flipAt, cover: flipAt, to: flipEnd });
      if (mode === 'reels') for (const c of new Set(cells.map(([c]) => c))) swapStrip(c, flipAt + 0.02, grid[c], res.mult[c], rng);
      else if (mode === 'cells') for (const [c, r] of cells) swapStrip(K(c, r), flipAt + 0.02, [grid[c][r]], [res.mult[c][r]], rng);
      else {
        for (const [c, r] of cells) {
          const a = mysteryActors.get(K(c, r));
          if (!a) continue;
          a.tOut = mid;
          a.row = null;
          actors.push({ id: ++actorId, c, sym: grid[c][r], mult: res.mult[c][r], tIn: mid, tOut: Infinity, keys: [key(mid, r)], row: r });
        }
      }
      sfx.push({ t: tcur, type: 'reveal', n: cells.length });
      flashes.push({ t: mid, amp: 0.15, dur: 0.25 });
      tcur = pres.mystery.end;
    }

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
      const actorT = Math.max(spinEnd, pres.mystery ? pres.mystery.end : 0, pres.boost ? pres.boost.end : 0);
      actorsFrom = actorT;
      actorGrid = grid.map((col, c) =>
        col.map((sym, r) => {
          const a = { id: ++actorId, c, sym, mult: res.mult[c][r], tIn: actorT, tOut: Infinity, keys: [key(actorT, r)], row: r };
          actors.push(a);
          return a;
        })
      );
    } else if (mode === 'cascade' && !noSpin) {
      actorGrid = range(reels).map((c) => range(rows).map((r) => actors.find((a) => !a.old && a.c === c && a.row === r)));
    }
    const stepsT = [];
    let cum = 0;
    // Pots that caught winners this round, and when they first did.
    const potRound = new Map();
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
      // Winning symbols: pop in place, jump into the score, merge, or beam
      // up into the pots.
      const wfx = scheduleWinFx(winStyleOf(project, round), tcur, step.cells.length, { ...winFxConfig(project), beamTravel: potCfg.beam.travel, beamStagger: potCfg.beam.stagger });
      const show = Math.max(showFor(), wfx.need);
      const amt = step.amount || 0;
      const before = cum;
      cum += amt;
      const expanded = new Set(win.expand);
      const cellSyms = step.cells.map(([c, r]) => (expanded.has(c) && ctx.wildSym != null ? ctx.wildSym : step.grid[c][r]));
      const st = { start: tcur, end: tcur + show, cells: step.cells, cellSyms, lines: step.lines, amount: amt, cum, symbol: step.symbol, pattern: step.pattern, count: step.cells.length, index: stepsT.length, tumble: !!tumble, fx: wfx.style === 'pop' ? null : wfx };
      stepsT.push(st);
      sfx.push({ t: tcur, type: 'win', step: stepsT.length - 1, amount: amt });
      if (wfx.style === 'collect') {
        // Every winner beams up into its pot: the pot catches it, its
        // nameplate and the win meter count the winner's share in.
        const aim = round.potAim && round.potAim !== 'auto' ? String(round.potAim) : potCfg.aim;
        const n = wfx.arrive.length;
        wfx.pots = step.cells.map(([c], j) => pickPot(potCfg, 'collect', aim, c, reels, j, potOf(cellSyms[j])));
        pres.beams = (pres.beams || []).concat(step.cells.map(([c, r], j) => ({ pot: wfx.pots[j], c, r, up: true, fire: wfx.launch[j], travel: wfx.travel })));
        // Catches too close together count up in one sweep instead.
        const gap = n > 1 ? wfx.arrive[1] - wfx.arrive[0] : 1;
        if (amt > 0 && gap < 0.12) pushKeys(meterKeys, [key(wfx.arrive[0], before, { outSpeed: (amt / (wfx.arrive[n - 1] - wfx.arrive[0] + 0.12)) * 1.25 }), key(wfx.arrive[n - 1] + 0.12, cum, { inInf: 0.6, hold: true })]);
        wfx.arrive.forEach((t, j) => {
          const p = wfx.pots[j];
          const share = amt / n;
          if (amt > 0 && gap >= 0.12) pushKeys(meterKeys, [key(t, before + (amt * j) / n), key(t + 0.1, before + (amt * (j + 1)) / n, { hold: true })]);
          const pv = potValueKeys[p];
          const was = pv[pv.length - 1].v;
          pushKeys(pv, [key(t, was), key(t + 0.1, was + share, { hold: true })]);
          if (!potRound.has(p)) potRound.set(p, t);
          potHits.push([t, p, 0]);
          sfx.push({ t: wfx.launch[j], type: 'beam', i: j, n }, { t, type: 'scoreHit', i: j, n });
        });
      } else if (wfx.style === 'jump') {
        // Each landing adds its share; landings too close together count
        // up in one sweep instead.
        const n = wfx.arrive.length;
        const gap = n > 1 ? wfx.arrive[1] - wfx.arrive[0] : 1;
        if (amt > 0 && gap >= 0.12) {
          wfx.arrive.forEach((t, i) => pushKeys(meterKeys, [key(t, before + (amt * i) / n), key(t + 0.1, before + (amt * (i + 1)) / n, { hold: true })]));
        } else if (amt > 0) {
          pushKeys(meterKeys, [key(wfx.arrive[0], before, { outSpeed: (amt / (wfx.arrive[n - 1] - wfx.arrive[0] + 0.12)) * 1.25 }), key(wfx.arrive[n - 1] + 0.12, cum, { inInf: 0.6, hold: true })]);
        }
        wfx.arrive.forEach((t, i) => sfx.push({ t, type: 'scoreHit', i, n }));
      } else if (wfx.style === 'merge') {
        sfx.push({ t: wfx.launch[0], type: 'magnet', dur: wfx.mergeAt - wfx.launch[0] });
        sfx.push({ t: wfx.mergeAt, type: 'merge' });
        // One by one: each winner ticks as it joins the pile.
        if (wfx.seq > 0.3) wfx.arrive.forEach((t, i) => sfx.push({ t, type: 'scoreHit', i, n: wfx.arrive.length }));
        flashes.push({ t: wfx.mergeAt, amp: 0.3, dur: 0.28 });
        shakes.push({ t: wfx.mergeAt, amp: 0.45, dur: 0.3 });
        if (amt > 0) {
          pushKeys(meterKeys, [key(wfx.mergeAt + 0.1, before, { outSpeed: (amt / 0.6) * 1.25 }), key(wfx.mergeAt + 0.7, cum, { inInf: 0.6, hold: true })]);
          sfx.push({ t: wfx.mergeAt + 0.1, type: 'count', dur: 0.6 });
        }
      } else if (amt > 0) {
        pushKeys(meterKeys, [key(tcur + 0.12, before, { outSpeed: (amt / 0.6) * 1.25 }), key(tcur + 0.72, cum, { inInf: 0.6, hold: true })]);
        sfx.push({ t: tcur + 0.12, type: 'count', dur: 0.6 });
      }
      tcur += show;
    });
    pres.steps = stepsT;
    if (o === 'medium' && stepsT.length) pres.coinBurst = { start: stepsT[0].start + 0.25, count: 46 };

    // ---- multipliers ----
    const lineTotal = win.amount - (win.collected || 0);
    if (res.mults.length && paying.length && lineTotal > 0) {
      const each = num(tm.multEach, 0.5);
      const items = res.mults.map((m, j) => ({ ...m, t: tcur + 0.15 + j * each }));
      const applyAt = items[items.length - 1].t + 0.55;
      pres.mult = { start: tcur, items, sum: win.multSum, base: win.base, total: lineTotal, applyAt, end: applyAt + 1.0 };
      items.forEach((it) => sfx.push({ t: it.t, type: 'mult', value: it.value }));
      pushKeys(meterKeys, [key(applyAt, cum, { outSpeed: ((lineTotal - cum) / 0.7) * 1.25 }), key(applyAt + 0.7, lineTotal, { inInf: 0.6, hold: true })]);
      sfx.push({ t: applyAt, type: 'tierUp' });
      sfx.push({ t: applyAt, type: 'count', dur: 0.7 });
      flashes.push({ t: applyAt, amp: 0.4, dur: 0.3 });
      shakes.push({ t: applyAt, amp: 0.7, dur: 0.4 });
      cum = lineTotal;
      tcur = pres.mult.end;
    }

    // ---- a collector takes every cash value on screen, one by one ----
    if (win.collected > 0 && !noSpin) {
      const fg = res.finalGrid;
      const fm = res.finalMult;
      let at = win.collector;
      const cash = [];
      fg.forEach((col, c) =>
        col.forEach((sym, r) => {
          if (sym === lay.collectorSym) at = [c, r];
          else if (isCoinSym(lay, sym) && fm[c][r] != null) cash.push({ c, r, value: fm[c][r] });
        })
      );
      const t1 = tcur + COLLECTOR.wake;
      let sum = cum;
      const items = cash.map((cs, j) => {
        const go = t1 + j * COLLECTOR.each;
        const arrive = go + COLLECTOR.flight;
        pushKeys(meterKeys, [key(arrive, sum), key(arrive + 0.1, sum + cs.value, { hold: true })]);
        sum += cs.value;
        sfx.push({ t: go, type: 'collect', i: j, n: cash.length });
        return { ...cs, at: go, arrive, after: sum };
      });
      const done = (items.length ? items[items.length - 1].arrive : t1) + 0.1;
      pres.collector = { start: tcur, c: at[0], r: at[1], items, total: win.collected, done, end: done + COLLECTOR.hold };
      sfx.push({ t: tcur, type: 'magnet', dur: COLLECTOR.wake }, { t: done, type: 'countEnd' });
      flashes.push({ t: done, amp: 0.35, dur: 0.3 });
      shakes.push({ t: done, amp: 0.5, dur: 0.35 });
      cum = sum;
      tcur = pres.collector.end;
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
      // Scatters landing in free spins retrigger: they add spins.
      const retrigger = o === 'freespins' && fs && round.free;
      const cel = num(tm.celebrate, 1.8);
      pres.celebrate = { start: tcur, end: tcur + cel };
      const bs = tcur + cel - 0.3;
      pres.banner = { start: bs, end: bs + num(tm.banner, 2.6), kind: retrigger ? 'retrigger' : o, freeSpins: round.freeSpins | 0 || (retrigger ? 5 : 10), amount: win.amount };
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
      // The wheel game keeps the wheel on screen from spin to spin.
      const wheelGame = game === 'wheel';
      const cont = wheelGame && wheelShown;
      const keepOn = wheelGame && i < project.rounds.length - 1;
      const cel = noSpin ? 0 : num(tm.celebrate, 1.8);
      if (cel > 0) pres.celebrate = { start: tcur, end: tcur + cel };
      const segs = project.wheel.segments;
      const N = Math.max(2, segs.length);
      // Where it lands, spin after spin: a "spin again" segment spins it again.
      const landings = wheelLandings(project, round);
      const segment = landings[landings.length - 1];
      const noWin = segmentKind(segs[segment]) === 'none';
      const inStart = cont ? tcur - 2 : tcur + Math.max(0, cel - 0.2);
      const inEnd = inStart + 0.9;
      const spinStart = cont ? tcur + 0.35 : inEnd + 0.15;
      const spinDur = Math.max(2, num(tm.wheelSpin, 5.8));
      const segDeg = 360 / N;
      const landing = round.wheelLanding || project.wheel.landing || 'tease';
      // The pointer reads the segment under it, at the top or at the bottom.
      const P = wheelConfig(project).pointer === 'bottom' ? 180 : 0;
      const turns = Math.max(1, num(project.wheel.turns, 5));
      // One spin from `from` to segment `seg`, landing `how`; returns when it
      // ends (and, for an almost-slip, the pointer's release).
      const spinTo = (from, seg, how, dur, nTurns) => {
        const slip = how === 'slip';
        // Almost slips: the wheel creeps into the next peg, the pointer
        // strains, then the wheel rolls back into the winning segment.
        const stopAt = from + dur + (slip ? SLIP.creep + SLIP.roll : 0);
        let off = 0;
        if (how === 'tease') off = rng() < 0.5 ? -0.42 : 0.42;
        else if (how === 'random') off = (rng() - 0.5) * 0.7;
        else if (slip) off = 0.5 - SLIP.peak;
        const targetLocal = (seg + 0.5 + off) * segDeg;
        const delta = (((P - targetLocal - wheelAngle) % 360) + 360) % 360;
        const total = nTurns * 360 + delta;
        const creepDeg = slip ? (SLIP.peak - SLIP.creepFrom) * segDeg : 0;
        const rollDeg = slip ? (SLIP.peak - SLIP.rest) * segDeg : 0;
        const windup = 12;
        const accel = 0.6;
        const decel = dur - 0.45 - accel;
        const Y = (total - creepDeg + windup) / (1 + (0.3 * 2.2) / decel);
        const vmax = (2.2 * Y) / decel;
        const a0 = wheelAngle;
        const mainEnd = from + dur;
        const vc = slip ? (2 * creepDeg) / SLIP.creep : 0;
        const wk = [
          key(from, a0, { outInf: 0.5 }),
          key(from + 0.45, a0 - windup, { inInf: 0.5, outInf: 0.5 }),
          key(from + 0.45 + accel, a0 - windup + 0.3 * vmax, { inSpeed: vmax, outSpeed: vmax, outInf: 0.16 }),
          key(mainEnd, a0 + total - creepDeg, { inInf: 0.62, inSpeed: vc, outSpeed: vc, outInf: 0.3 }),
        ];
        if (slip) wk.push(key(mainEnd + SLIP.creep, a0 + total, { inInf: 0.6, outInf: 0.45 }), key(stopAt, a0 + total - rollDeg, { inInf: 0.55 }));
        pushKeys(wheelKeys, wk);
        // A tick every time a peg passes the pointer.
        let lastSeg = Math.floor((a0 - windup - P) / segDeg);
        for (let t = from + 0.45; t <= stopAt; t += 1 / 240) {
          const s2 = Math.floor((evalKeys(wheelKeys, t) - P) / segDeg);
          if (s2 !== lastSeg) {
            sfx.push({ t, type: 'wheelTick' });
            lastSeg = s2;
          }
        }
        // The peg lets go of the pointer as the wheel rolls back: it springs
        // past straight (a tick as it snaps free).
        let kick = null;
        if (slip) {
          for (let t = mainEnd + SLIP.creep; t <= stopAt; t += 1 / 240) {
            const u = ((((evalKeys(wheelKeys, t) - P) / segDeg) % 1) + 1) % 1;
            if (u < 0.78) {
              kick = { t, amp: SLIP.kick };
              sfx.push({ t, type: 'wheelTick' });
              break;
            }
          }
        }
        wheelAngle = a0 + total - rollDeg;
        return { end: stopAt, mainEnd, kick, slip };
      };
      const agains = [];
      let from = spinStart;
      let last = null;
      landings.forEach((seg, j) => {
        const final = j === landings.length - 1;
        // A spin again is quicker, and lands naturally; the round's landing
        // style is for the last spin.
        const r = spinTo(from, seg, final ? landing : 'random', j ? Math.max(2, spinDur * 0.8) : spinDur, j ? Math.max(1, turns - 2) : turns);
        if (final) last = r;
        else {
          agains.push({ segment: seg, at: r.end + 0.2, until: r.end + WHEEL_AGAIN });
          flashes.push({ t: r.end + 0.2, amp: 0.35, dur: 0.3 });
          sfx.push({ t: r.end + 0.15, type: 'wheelAgain' });
          from = r.end + WHEEL_AGAIN + 0.15;
        }
      });
      const spinEnd2 = last.end;
      // A segment linked to a jackpot box pays what the box shows.
      const jw = noWin ? null : wheelJackpot(jpCfg, segs[segment]);
      if (jw) win.amount = jp.award(jw, spinEnd2 + 0.25, 'wheel');
      const countStart = spinEnd2 + 0.65;
      const countEnd = countStart + 2.2;
      const outStart = keepOn ? countEnd + 1000 : countEnd + 1.3;
      pres.wheel = { inStart, inEnd, spinStart, spinEnd: spinEnd2, prizeStart: spinEnd2 + 0.25, countStart, countEnd, outStart, outEnd: outStart + 0.8, segment, amount: win.amount, cont, titleIn: tcur, plaqueEnd: keepOn ? countEnd + 1.3 : outStart + 0.8, landing, slowFrom: last.slip ? last.mainEnd - 1.2 : spinEnd2 - 1.6, kick: last.kick, agains, noWin };
      wheelShown = wheelGame;
      if (!cont) sfx.push({ t: inStart, type: 'whoosh' });
      if (!keepOn) sfx.push({ t: outStart, type: 'whoosh' });
      flashes.push({ t: inStart + 0.1, amp: 0.4, dur: 0.35 });
      if (noWin) {
        // No win: the label shows, nothing counts, a let-down cue.
        shakes.push({ t: spinEnd2 + 0.25, amp: 0.25, dur: 0.3 });
        sfx.push({ t: spinEnd2 + 0.2, type: 'nearMiss' });
      } else {
        pres.meter = { start: countStart, end: countEnd };
        pushKeys(meterKeys, [key(countStart, 0, { outSpeed: (win.amount / 2.2) * 1.25 }), key(countEnd, win.amount, { inInf: 0.6, hold: true })]);
        flashes.push({ t: spinEnd2 + 0.25, amp: 0.5, dur: 0.35 });
        shakes.push({ t: spinEnd2 + 0.25, amp: 0.8, dur: 0.5 });
        sfx.push({ t: spinEnd2 + 0.2, type: 'wheelLand' }, { t: countStart, type: 'count', dur: 2.2 }, { t: spinEnd2 + 0.25, type: 'coins', dur: 1.5 }, { t: countEnd, type: 'countEnd' });
      }
      end = keepOn ? pres.wheel.plaqueEnd : pres.wheel.outEnd;
    } else if (o === 'fstotal') {
      pres.overlay = overlay(t0 + 0.2, win.amount, ['total']);
      end = pres.overlay.end;
    } else if (o === 'hstrigger') {
      // Coins glow, the banner announces the feature, and under it the board
      // turns into the Hold & Spin board keeping the coins where they landed.
      const cel = num(tm.celebrate, 1.8) * 0.75;
      pres.celebrate = { start: tcur, end: tcur + cel };
      const bs = tcur + cel - 0.3;
      pres.banner = { start: bs, end: bs + num(tm.banner, 2.6), kind: 'holdspin', freeSpins: hsCfg.respins, amount: 0 };
      closeHold(bs);
      openHold(bs + 0.6, 0.4, (win.coins || []).map((cn) => ({ ...cn })));
      flashes.push({ t: bs + 0.05, amp: 0.4, dur: 0.3 });
      shakes.push({ t: bs + 0.1, amp: 0.6, dur: 0.4 });
      sfx.push({ t: bs, type: 'fsTrigger' }, { t: bs, type: 'whoosh' });
      end = pres.banner.end;
    } else if (o === 'respin') {
      end = tcur + (hsInfo && hsInfo.hits ? 0.45 : 0.22);
    } else if (o === 'collect') {
      if (!hs || !hs.locked.size) {
        end = tcur + 0.5;
      } else {
        // Every coin flashes and its value flies into the collect plaque,
        // reel by reel; a full board adds the grand prize; then the total.
        const locks = [...hs.locked.values()].sort((a, b) => a.c - b.c || a.r - b.r);
        const n = locks.length;
        const per = Math.max(0.11, Math.min(num(tm.collectEach, 0.22), 5 / n));
        let sum = 0;
        const t1 = tcur + 0.35;
        const items = locks.map((l, j) => {
          const at = t1 + j * per;
          const arrive = at + 0.42;
          const prev = sum;
          // A jackpot coin pays what its box shows as it is collected.
          const jt = jpOfSym(l.sym);
          const value = jt ? jp.award(jt, at, 'coin') : l.value;
          sum += value;
          pushKeys(collectKeys, [key(arrive, prev), key(arrive + 0.1, sum, { hold: true })]);
          pushKeys(meterKeys, [key(arrive, prev), key(arrive + 0.1, sum, { hold: true })]);
          sfx.push({ t: at, type: 'collect', i: j, n });
          l.collectAt = at;
          return { c: l.c, r: l.r, sym: l.sym, value, at, arrive, special: l.special, jackpot: jt };
        });
        let tA = items[n - 1].arrive + 0.45;
        if (hs.full && hsCfg.grand.enabled) {
          const g = jpShown('grand') ? jp.award('grand', tA, 'grand') : Math.max(0, Number(hsCfg.grand.value) || 0) * bet;
          const cs = tA + 0.55;
          const ce = cs + 1.4;
          pres.grand = { start: tA, end: ce + 1.0, amount: g, countStart: cs, countEnd: ce, keys: [key(cs, 0, { outSpeed: (g / 1.4) * 1.25 }), key(ce, g, { inInf: 0.6, hold: true })] };
          pushKeys(collectKeys, [key(cs, sum, { outSpeed: (g / 1.4) * 1.25 }), key(ce, sum + g, { inInf: 0.6, hold: true })]);
          pushKeys(meterKeys, [key(cs, sum, { outSpeed: (g / 1.4) * 1.25 }), key(ce, sum + g, { inInf: 0.6, hold: true })]);
          sfx.push({ t: tA, type: 'bigWin' }, { t: tA, type: 'whoosh' }, { t: cs, type: 'count', dur: 1.4, big: true }, { t: cs, type: 'coins', dur: 1.4 }, { t: ce, type: 'countEnd' });
          flashes.push({ t: tA + 0.05, amp: 0.55, dur: 0.35 });
          shakes.push({ t: tA + 0.1, amp: 1, dur: 0.5 });
          sum += g;
          tA = pres.grand.end - 0.1;
        }
        pres.collect = { start: tcur, items, end: tA, total: sum, per };
        win.amount = sum;
        cum = sum;
        pres.overlay = overlay(tA, sum, ['total']);
        closeHold(pres.overlay.end + 0.45);
        end = pres.overlay.end + 0.45;
      }
    } else {
      end = tcur + 0.5;
    }

    // ---- a jackpot this round awards: its box lights up, its amount flies
    // down into the win meter and counts on top of the win ----
    if (round.jackpot && jpShown(round.jackpot) && JACKPOT_ROUNDS.includes(o) && !(o === 'wheel' && game !== 'slot')) {
      const at = end - 0.1;
      const amount = jp.award(round.jackpot, at, 'round');
      const prev = evalKeys(meterKeys, at);
      const fly = [at + 0.55, at + 1.15];
      const cs = fly[1];
      const ce = cs + 1.4;
      pushKeys(meterKeys, [key(cs, prev, { outSpeed: (amount / 1.4) * 1.25 }), key(ce, prev + amount, { inInf: 0.6, hold: true })]);
      win.amount = (win.amount || 0) + amount;
      pres.jackpot = { tier: round.jackpot, at, fly, countStart: cs, countEnd: ce, amount, end: Math.max(ce + 0.6, at + JP_CELEBRATE) };
      flashes.push({ t: at + 0.05, amp: 0.45, dur: 0.3 });
      shakes.push({ t: at + 0.1, amp: 0.5, dur: 0.4 });
      sfx.push({ t: at, type: 'jackpot' }, { t: fly[0], type: 'whoosh' }, { t: cs, type: 'count', dur: 1.4 }, { t: ce, type: 'countEnd' });
      end = pres.jackpot.end;
    }

    const next = end + Math.max(0, num(round.hold, 0)) + num(tm.gap, 0.3);
    for (const s of newStickyValues) s.valueUntil = next;
    // The pots' nameplates show what they caught until the round ends.
    for (const [p, from] of potRound) {
      potShow.push([from, end, p]);
      pushKeys(potValueKeys[p], [key(next, 0, { hold: true })]);
    }
    // After tumbles the reels show the final grid: jump the strips there while
    // the actors cover them, so the next spin starts from what is on screen.
    if (actorsFrom != null && mode !== 'cascade') {
      for (let s = 0; s < nStrips; s++) {
        const col = mode === 'cells' ? [res.finalGrid[Math.floor(s / rows)][s % rows]] : res.finalGrid[s];
        const multCol = mode === 'cells' ? [res.finalMult[Math.floor(s / rows)][s % rows]] : res.finalMult[s];
        const P2 = strips[s].length + 3;
        ensure(strips[s], P2, ctx, rng);
        placeColumn(strips[s], P2, col, dir, stripRows, ctx, rng, stripValues[s], multCol);
        ensure(strips[s], P2 + stripRows + 4, ctx, rng);
        pushKeys(stripKeys[s], [key(next - 0.02, pos[s], { hold: true }), key(next - 0.01, P2, { hold: true })]);
        pos[s] = P2;
      }
    }

    // ---- free spins bookkeeping ----
    let fsInfo = null;
    if (o === 'freespins' && fs && round.free) {
      // A retrigger: this free spin counts, then the spins it adds join in
      // (the counter changes as the banner lands).
      const add = pres.banner.freeSpins;
      fs.count++;
      fs.total += win.amount || 0;
      fs.n += add;
      fs.block.rounds.push({ t0, index: fs.count });
      fs.block.rounds.push({ t0: pres.banner.start + 0.4, index: fs.count, n: fs.n });
      fsInfo = { index: fs.count, of: fs.n, totalAfter: fs.total, retrigger: add };
      pushKeys(fsTotalKeys, [key(end - 0.6, fs.total - (win.amount || 0), { outSpeed: ((win.amount || 0) / 0.6) * 1.25 }), key(end, fs.total, { inInf: 0.6, hold: true })]);
    } else if (o === 'freespins') {
      if (fs) closeBlock(t0);
      fs = { n: round.freeSpins | 0 || 10, count: 0, total: 0, sticky: !!round.sticky && !round.walking, walking: !!round.walking, block: { start: next, end: Infinity, n: round.freeSpins | 0 || 10, rounds: [] } };
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
  if (hs) {
    hs.window.fadeOut = 0;
    closeHold(duration);
  }
  for (const k of hsKeys) pushKeys(k, [key(duration, k[k.length - 1].v)]);
  for (const s of stickies) if (!Number.isFinite(s.to)) s.to = duration;
  for (const b of fsBlocks) if (!Number.isFinite(b.end)) b.end = duration;
  // The last round's symbols stay on screen through the outro.
  rounds.forEach((R, k) => {
    for (const a of R.actors) if (!Number.isFinite(a.tOut)) a.tOut = k === rounds.length - 1 ? duration : R.next;
  });
  for (const k of stripKeys) pushKeys(k, [key(duration, k[k.length - 1].v)]);
  // A box won by a coin, a full board or the wheel rings out too (a round's
  // own jackpot already has its cue).
  for (const h of jp.hits) if (h.kind !== 'round') sfx.push({ t: h.t, type: 'jackpot' });
  sfx.sort((a, b) => a.t - b.t);
  const tl = {
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
    stripValues,
    reelKeys: mode === 'reels' ? stripKeys : [],
    meterKeys,
    fsTotalKeys,
    wheelKeys,
    shakes,
    flashes,
    sfx,
    stickies,
    reveals,
    fsBlocks,
    rounds,
    pots: potCfg.on ? { count: potCfg.count, hits: potHits.sort((a, b) => a[0] - b[0]), charges: potCharges, show: potShow, valueKeys: potValueKeys } : null,
    // Jackpot boxes: when each is won (and for how much) or blinks.
    jackpots: jpCfg.on ? { hits: jp.hits.sort((a, b) => a.t - b.t), blinks: jp.blinks.sort((a, b) => a.t - b.t) } : null,
    initialGrid,
    tiers,
    orbSym: ctx.orbSym,
    lay,
    game,
    hold: { strips: hsStrips, keys: hsKeys, values: hsVals, windows: hsWindows, locks: hsLocks, counterKeys: hsCounterKeys, collectKeys, respins: hsCfg.respins },
  };
  // Win particles for every round (R.pres.particles), all in tl.emitters.
  tl.emitters = scheduleParticles(tl, project);
  // The camera pushes in on anticipation (core/camera.js).
  tl.camera = scheduleCamera(tl, project);
  return tl;
}

// How much of the Hold & Spin board shows at time t (0 = the machine's reels).
export function holdAlpha(tl, t) {
  for (const w of tl.hold.windows) {
    if (t < w.start || t > w.end) continue;
    const a = w.fadeIn > 0 ? (t - w.start) / w.fadeIn : 1;
    const b = w.fadeOut > 0 ? (w.end - t) / w.fadeOut : 1;
    return Math.max(0, Math.min(1, a, b));
  }
  return 0;
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

// How long after a sticky wild lands its cell stops showing the reel strip
// (the wild has popped in on top by then).
export const STICKY_COVER = 0.45;

// The cells whose strip is hidden at time t: held by a sticky or walking
// wild (from when it has popped or walked in), or turning over in a
// mystery reveal.
export function heldCells(tl, t) {
  const on = (s) => t >= (s.cover ?? s.from + STICKY_COVER) && t < s.to;
  return (tl.stickies || []).filter(on).concat((tl.reveals || []).filter(on));
}

// A walking wild's step from one reel to the next, and how high it hops
// (in cell heights).
export const WILD_WALK = 0.45;
export const WALK_HOP = 0.3;

// How far along its step a walking wild is at t (0 to 1, eased in and out)
// and how high it is in its hop (0 to 1).
export function walkStep(st, t) {
  const x = Math.min(1, Math.max(0, (t - st.from) / WILD_WALK));
  const u = x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  return { u, hop: Math.sin(u * Math.PI) };
}

// Mystery reveal: the blocks glow, flip over together, then the win shows.
export const MYSTERY = { build: 0.45, flip: 0.5, after: 0.3 };

// Boosters: the pots charge up, then each beam fires; the cell is cut out
// of its reel from just before the hit until the new symbol has popped.
export const BOOST = { charge: 0.55, lead: 0.06, pop: 0.42, after: 0.4 };

// The collector wakes, each cash value flies in, then the total holds.
export const COLLECTOR = { wake: 0.5, each: 0.26, flight: 0.42, hold: 0.9 };

// The landing build-up's shake, from the first winning reel to the last.
export const LAND_SHAKE = [0.18, 0.68];

// A spin again: how long after the wheel stops it spins again (the plaque
// says SPIN AGAIN in between).
export const WHEEL_AGAIN = 1.5;
