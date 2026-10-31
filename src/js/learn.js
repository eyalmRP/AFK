// Learns from the player's battle log (Battles tab) and from top players'
// formations. Pure, like engine.js, so the browser and the tests share it.
//
// Battles: a logistic (Bradley-Terry) model of P(team A beats team B):
//
//   logit P = wPower · 10·ln(power A / power B)
//           + wFaction · (faction edges A − edges B) / 5
//           + wBeast · (beast level A − beast level B) / 10
//           + wTier · (tier points A − tier points B) / 10
//           + Σ traits · (what A is made of against what B is made of)
//           + Σ δ(heroes in A) − Σ δ(heroes in B)
//           + Σ γ(hero pairs in A) − Σ γ(hero pairs in B)
//
// fitted by maximum a posteriori with Gaussian priors (truncated Newton; the
// problem is convex). Every learned value starts at 0, so it moves only with
// repeated results. The three learned layers (team traits, heroes, pairs)
// switch on one at a time, in that order, and only when there are enough
// battles AND, on battles left out of the fit (repeated k-fold
// cross-validation), adding the layer predicts the winner reliably better
// than the model without it. The first comparison is against power, tiers
// and factions alone, which the counter already knows. Until a layer is on,
// the counter ignores it.
//
// Top formations: lineups top players field, with no opponent, so nothing
// about winning can be learned from them. What they show is which heroes top
// players put together (pairs seen together more often than their own
// popularity predicts) and where they place each hero (front or back).

import { factionAdvantage, tierOf, tierScore } from './data.js';

export const LEARN = {
  minBattles: 30, // before this the model doesn't even check itself
  minHeroBattles: 10, // a hero's adjustment counts only after this many battles
  minPairBattles: 8, // a pair's only after this many battles on the same team
  folds: 5,
  repeats: 3, // fold splits averaged, so one lucky split can't switch a layer on (fewer for big logs, see repeatsFor)
  margin: 0.01, // cross-validated log-loss gain needed, in nats per battle, on top of the lower bound clearing 0
  // Prior spreads (log-odds). Tight for heroes: a battle has ten heroes, and
  // loose values add their noise up.
  deltaSd: 0.35,
  traitSd: 0.3,
  // Pairs are many (up to twenty a battle) and real synergies few, so pairs
  // are screened first: only those whose results stand out from the model
  // without them (|z| of the score test at least pairZ, the maxPairs
  // strongest) are fitted, with this spread. In simulations a strong synergy
  // (a pair that turns a coin flip into about 77%) shows after about 600
  // battles of a 16-hero meta, and pure noise never switched pairs on.
  pairSd: 0.5,
  pairZ: 2.2,
  maxPairs: 5,
  // Priors for the shared weights, as [mean, sd]. Power gets a positive mean:
  // a team 10% stronger wins about 70% of the time before any data says so.
  weightPrior: [
    [1, 1],
    [0, 1],
    [0, 1],
    [0, 1],
  ],
  // Counter points per unit of log-odds (one tier step is 1.5 points), capped.
  pointsPerDelta: 3,
  maxPoints: 3,
  maxTraitPoints: 4,
  top: {
    minFormations: 30, // before this top formations aren't used
    minPairCount: 5, // a pair counts once seen together this often
    minHeroCount: 3, // a hero's placement counts once seen this often
    shrink: 2, // added to seen and expected counts, so small counts can't make a big lift
    minScore: 0.2, // shrunk log-lift a pair needs to count (about 1.3x as often as chance, more for small counts)
    pointsPerLogLift: 0.8,
    maxPairPoints: 1.2,
  },
};

export const WEIGHT_NAMES = ['power', 'faction', 'beast', 'tier'];
const G = WEIGHT_NAMES.length;

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

// ---- team traits -------------------------------------------------------------

// What a team is made of, from the heroes' role tags (and class, for tanks).
const ROLE_SETS = {
  tank: ['tank', 'off-tank'],
  healer: ['healer', 'shielder', 'sustain', 'revive'],
  burst: ['burst', 'assassin'],
  control: ['cc', 'stun', 'freeze', 'petrify', 'silence', 'pull', 'energy-control'],
  energy: ['energy-gain'],
  antiheal: ['anti-heal', 'dispel'],
  aoe: ['aoe'],
  summon: ['summoner'],
  buff: ['buffer'],
  debuff: ['debuffer'],
  immune: ['immunity', 'cleanse'],
};

export function teamMakeup(ids, heroes) {
  const c = Object.fromEntries(Object.keys(ROLE_SETS).map((k) => [k, 0]));
  const factions = {};
  for (const id of ids) {
    const h = heroes.get(id);
    if (!h) continue;
    const roles = new Set(h.roles || []);
    for (const [k, set] of Object.entries(ROLE_SETS)) if (set.some((r) => roles.has(r)) || (k === 'tank' && h.class === 'Tank')) c[k]++;
    factions[h.faction] = (factions[h.faction] || 0) + 1;
  }
  c.stack = Math.max(0, ...Object.values(factions));
  return c;
}

// Each trait compares the two teams: [key, label, value(a, b)], where a and b
// are teamMakeup results. Swapping the teams flips the sign. Only traits the
// hero data tags often enough: anti-heal, cleanse, energy gain and summoners
// are each tagged on one or two heroes, too few to learn from.
export const TRAITS = [
  ['tank1', 'having a tank', (a, b) => (a.tank >= 1) - (b.tank >= 1)],
  ['tank2', 'two or more tanks', (a, b) => (a.tank >= 2) - (b.tank >= 2)],
  ['heal1', 'a healer or shielder', (a, b) => (a.healer >= 1) - (b.healer >= 1)],
  ['heal2', 'two or more healers or shielders', (a, b) => (a.healer >= 2) - (b.healer >= 2)],
  ['burst', 'burst heroes', (a, b) => (a.burst - b.burst) / 2],
  ['control', 'crowd control', (a, b) => (a.control - b.control) / 2],
  ['aoe', 'area damage', (a, b) => (a.aoe - b.aoe) / 2],
  ['buff', 'buffers', (a, b) => (a.buff - b.buff) / 2],
  ['debuff', 'debuffers', (a, b) => (a.debuff - b.debuff) / 2],
  ['stack', 'three or more heroes of one faction', (a, b) => (a.stack >= 3) - (b.stack >= 3)],
  ['burstVsHeal', 'burst against healers', (a, b) => (a.burst * b.healer - b.burst * a.healer) / 4],
];
const T = TRAITS.length;

function traitValues(aIds, bIds, heroes) {
  const a = teamMakeup(aIds, heroes);
  const b = teamMakeup(bIds, heroes);
  return TRAITS.map(([, , f]) => f(a, b));
}

// ---- features ----------------------------------------------------------------

// One side of a battle as the model sees it: hero ids, combat power, beast level (null = unknown).
function sideFeatures(side, heroes) {
  const ids = [...new Set((side.ids || []).filter((id) => heroes.get(id)))];
  const tier = ids.reduce((t, id) => t + tierScore(tierOf(heroes.get(id), 'pvp')), 0);
  return { ids, power: side.power || 0, beastLevel: side.beastLevel ?? null, tier };
}

function edges(a, b, heroes) {
  let n = 0;
  for (const x of a) for (const y of b) if (factionAdvantage(heroes.get(x)?.faction, heroes.get(y)?.faction)) n++;
  return n;
}

export const pairKey = (x, y) => (x < y ? `${x}+${y}` : `${y}+${x}`);

function pairsOf(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out.push(pairKey(ids[i], ids[j]));
  return out;
}

// Shared features of A against B (antisymmetric: swapping A and B flips the sign).
export function pairFeatures(a, b, heroes) {
  const A = sideFeatures(a, heroes);
  const B = sideFeatures(b, heroes);
  const power = A.power > 0 && B.power > 0 ? 10 * Math.log(A.power / B.power) : 0;
  const faction = (edges(A.ids, B.ids, heroes) - edges(B.ids, A.ids, heroes)) / 5;
  const beast = A.beastLevel !== null && B.beastLevel !== null ? (A.beastLevel - B.beastLevel) / 10 : 0;
  const tier = (A.tier - B.tier) / 10;
  return { g: [power, faction, beast, tier], t: traitValues(A.ids, B.ids, heroes), a: A.ids, b: B.ids };
}

// Battles the model can use: both teams with 3+ known heroes and a power.
// `battles` are {id, win: side, lose: side} with side {ids, power, beastLevel}.
export function usableBattles(battles, heroes) {
  return (battles || []).filter((x) => {
    const ok = (s) => s && (s.ids || []).filter((id) => heroes.get(id)).length >= 3 && s.power > 0;
    return ok(x.win) && ok(x.lose);
  });
}

// ---- fitting -------------------------------------------------------------

// Columns: the G shared weights, the T traits, one per hero, one per pair.
// Each row is the winner as A (every observation is "A won") with sparse
// [column, value] entries: +1 for a hero or pair on the winning side and -1
// on the losing side (0, and left out, when both sides have it).
function buildModel(use, heroes, pairsAllowed) {
  const cols = { block: [], mean: [], prec: [], key: [] };
  const addCol = (block, key, mean, sd) => {
    cols.block.push(block);
    cols.key.push(key);
    cols.mean.push(mean);
    cols.prec.push(1 / sd ** 2);
    return cols.block.length - 1;
  };
  LEARN.weightPrior.forEach(([m, sd], k) => addCol('g', WEIGHT_NAMES[k], m, sd));
  TRAITS.forEach(([k]) => addCol('t', k, 0, LEARN.traitSd));
  const heroCol = new Map();
  const pairCol = new Map();
  const rows = use.map((x) => {
    const f = pairFeatures(x.win, x.lose, heroes);
    const z = new Map();
    f.g.forEach((v, k) => v && z.set(k, v));
    f.t.forEach((v, k) => v && z.set(G + k, v));
    const add = (map, block, key, sd, v) => {
      if (!map.has(key)) map.set(key, addCol(block, key, 0, sd));
      const j = map.get(key);
      z.set(j, (z.get(j) || 0) + v);
    };
    for (const id of f.a) add(heroCol, 'h', id, LEARN.deltaSd, 1);
    for (const id of f.b) add(heroCol, 'h', id, LEARN.deltaSd, -1);
    for (const k of pairsOf(f.a)) if (pairsAllowed.has(k)) add(pairCol, 'p', k, LEARN.pairSd, 1);
    for (const k of pairsOf(f.b)) if (pairsAllowed.has(k)) add(pairCol, 'p', k, LEARN.pairSd, -1);
    return { id: x.id, z: [...z].filter(([, v]) => v) };
  });
  return { rows, cols, heroCol, pairCol };
}

const dot = (theta, z) => z.reduce((s, [j, v]) => s + theta[j] * v, 0);

function objective(theta, rows, cols, active) {
  let v = 0;
  for (const z of rows) {
    const s = dot(theta, z);
    v += s > 0 ? Math.log1p(Math.exp(-s)) : -s + Math.log1p(Math.exp(s));
  }
  for (const j of active) v += 0.5 * cols.prec[j] * (theta[j] - cols.mean[j]) ** 2;
  return v;
}

// MAP fit with the columns of the blocks in `include` ('g', 't', 'h', 'p').
// Truncated Newton: each step solves H d = g by conjugate gradients with
// Hessian-vector products, so it stays fast with hundreds of columns.
function fit(rows, cols, include, allowP = null) {
  const p = cols.block.length;
  const on = cols.block.map((b, j) => include.has(b) && (b !== 'p' || !allowP || allowP.has(j)));
  const active = [...Array(p).keys()].filter((j) => on[j]);
  const use = rows.map((r) => r.z.filter(([j]) => on[j]));
  let theta = cols.mean.slice();
  let obj = objective(theta, use, cols, active);
  for (let it = 0; it < 25; it++) {
    const grad = new Float64Array(p);
    for (const j of active) grad[j] = cols.prec[j] * (theta[j] - cols.mean[j]);
    const w = use.map((z) => {
      const q = sigmoid(dot(theta, z));
      for (const [j, v] of z) grad[j] -= (1 - q) * v;
      return q * (1 - q);
    });
    const diag = new Float64Array(p);
    for (const j of active) diag[j] = cols.prec[j];
    use.forEach((z, i) => {
      for (const [j, v] of z) diag[j] += w[i] * v * v;
    });
    const hv = (v) => {
      const out = new Float64Array(p);
      for (const j of active) out[j] = cols.prec[j] * v[j];
      use.forEach((z, i) => {
        const s = w[i] * z.reduce((a, [j, x]) => a + x * v[j], 0);
        if (s) for (const [j, x] of z) out[j] += s * x;
      });
      return out;
    };
    // Preconditioned conjugate gradients for the Newton step.
    const d = new Float64Array(p);
    const r = Float64Array.from(grad);
    const zz = new Float64Array(p);
    for (const j of active) zz[j] = r[j] / diag[j];
    const dir = Float64Array.from(zz);
    let rz = active.reduce((a, j) => a + r[j] * zz[j], 0);
    const tol = 1e-10 * Math.max(1, rz);
    for (let k = 0; k < 60 && rz > tol; k++) {
      const hd = hv(dir);
      const alpha = rz / active.reduce((a, j) => a + dir[j] * hd[j], 0);
      for (const j of active) {
        d[j] += alpha * dir[j];
        r[j] -= alpha * hd[j];
        zz[j] = r[j] / diag[j];
      }
      const rz2 = active.reduce((a, j) => a + r[j] * zz[j], 0);
      for (const j of active) dir[j] = zz[j] + (rz2 / rz) * dir[j];
      rz = rz2;
    }
    // Backtracking keeps every step downhill.
    let t = 1;
    let next;
    let nextObj;
    for (let k = 0; k < 20; k++) {
      next = theta.slice();
      for (const j of active) next[j] = theta[j] - t * d[j];
      nextObj = objective(next, use, cols, active);
      if (nextObj <= obj) break;
      t /= 2;
    }
    const moved = Math.max(0, ...active.map((j) => Math.abs(next[j] - theta[j])));
    theta = next;
    const done = obj - nextObj < 1e-9 || moved < 1e-7;
    obj = nextObj;
    if (done) break;
  }
  return theta;
}

// Which hero and pair columns have enough battles in these rows to count
// (the same rule the counter applies).
function readyCols(rows, cols) {
  const n = new Map();
  for (const r of rows) for (const [j] of r.z) if (cols.block[j] === 'h' || cols.block[j] === 'p') n.set(j, (n.get(j) || 0) + 1);
  const ok = new Set();
  for (const [j, c] of n) if (c >= (cols.block[j] === 'h' ? LEARN.minHeroBattles : LEARN.minPairBattles)) ok.add(j);
  return ok;
}

// Pairs worth fitting: on top of the model without pairs, which pairs'
// results stand out (score test of each pair column at 0). Returns the set
// of pair columns, at most maxPairs, strongest first.
function screenPairs(rows, cols, include) {
  const base = new Set([...include].filter((b) => b !== 'p'));
  const theta = fit(rows, cols, base);
  const u = new Map();
  const v = new Map();
  for (const r of rows) {
    const q = sigmoid(r.z.reduce((s, [j, x]) => (base.has(cols.block[j]) ? s + theta[j] * x : s), 0));
    for (const [j, x] of r.z) {
      if (cols.block[j] !== 'p') continue;
      u.set(j, (u.get(j) || 0) + (1 - q) * x);
      v.set(j, (v.get(j) || 0) + q * (1 - q) * x * x);
    }
  }
  const ready = readyCols(rows, cols);
  return new Set(
    [...u]
      .filter(([j]) => ready.has(j))
      .map(([j, uj]) => [j, Math.abs(uj) / Math.sqrt(v.get(j) || 1)])
      .filter(([, z]) => z >= LEARN.pairZ)
      .sort((a, b) => b[1] - a[1])
      .slice(0, LEARN.maxPairs)
      .map(([j]) => j)
  );
}

// Fit with the blocks in `include`; with pairs, only the screened ones.
function fitWith(rows, cols, include) {
  const allowP = include.has('p') ? screenPairs(rows, cols, include) : null;
  return { theta: fit(rows, cols, include, allowP), allowP };
}

// Log-loss of each winner under theta, counting only the blocks in `include`
// and, for heroes and pairs, only columns with enough battles in the fit
// (and, for pairs, only the screened ones).
function losses(theta, rows, cols, include, ready, allowP = null) {
  return rows.map((r) => {
    let s = 0;
    for (const [j, v] of r.z) {
      const b = cols.block[j];
      if (!include.has(b)) continue;
      if ((b === 'h' || b === 'p') && !ready.has(j)) continue;
      if (b === 'p' && allowP && !allowP.has(j)) continue;
      s += theta[j] * v;
    }
    return -Math.log(Math.max(1e-9, sigmoid(s)));
  });
}

// Stable fold for a battle, from its id, so the check gives the same answer each time.
function foldOf(id, k) {
  let h = 2166136261;
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h % k;
}

// Big logs vary less from split to split, and each split costs more.
const repeatsFor = (n) => (n < 150 ? LEARN.repeats : n < 300 ? 2 : 1);

// Cross-validated log-loss of each battle under a model with the blocks in
// `include`, averaged over a few fold splits. Cached per block set.
function cvLosses(model, include, cache) {
  const key = [...include].sort().join('');
  if (cache.has(key)) return cache.get(key);
  const { rows, cols } = model;
  const k = LEARN.folds;
  const out = new Array(rows.length).fill(0);
  const repeats = repeatsFor(rows.length);
  for (let rep = 0; rep < repeats; rep++) {
    for (let f = 0; f < k; f++) {
      const inTest = rows.map((r) => foldOf(`${rep}:${r.id}`, k) === f);
      const train = rows.filter((_, i) => !inTest[i]);
      const test = rows.filter((_, i) => inTest[i]);
      if (!test.length || !train.length) continue;
      const { theta, allowP } = fitWith(train, cols, include);
      const l = losses(theta, test, cols, include, readyCols(train, cols), allowP);
      let t = 0;
      rows.forEach((_, i) => {
        if (inTest[i]) out[i] += l[t++] / repeats;
      });
    }
  }
  cache.set(key, out);
  return out;
}

// Does adding a block predict battles left out of the fit reliably better?
// `gain` is the mean log-loss improvement, `low` a cautious lower bound on it
// (one-sided 95%, paired over battles).
function compare(model, without, withIt, cache) {
  const a = cvLosses(model, without, cache);
  const b = cvLosses(model, withIt, cache);
  const n = a.length;
  const diff = a.map((x, i) => x - b[i]);
  const gain = diff.reduce((s, d) => s + d, 0) / n;
  const sd = Math.sqrt(diff.reduce((s, d) => s + (d - gain) ** 2, 0) / Math.max(1, n - 1));
  const mean = (l) => l.reduce((s, x) => s + x, 0) / n;
  const low = gain - 1.645 * (sd / Math.sqrt(n));
  return { without: mean(a), with: mean(b), gain, low, on: gain >= LEARN.margin && low > 0 };
}

// ---- public: battles ----------------------------------------------------------

const LAYERS = { traits: 't', heroes: 'h', pairs: 'p' };

// Learn from the battle log. Returns the status the Battles tab shows and,
// for the layers that passed their check, what the counter applies.
export function learnBattles(battles, heroes) {
  const use = usableBattles(battles, heroes);
  const n = use.length;
  // Hero and pair records (battles, won, lost) for the tab.
  const heroRec = new Map();
  const pairRec = new Map();
  const tally = (map, key, won) => {
    const r = map.get(key) || { n: 0, w: 0, l: 0 };
    r.n++;
    if (won) r.w++;
    else r.l++;
    map.set(key, r);
  };
  for (const x of use) {
    const w = sideFeatures(x.win, heroes).ids;
    const l = sideFeatures(x.lose, heroes).ids;
    for (const id of w) tally(heroRec, id, true);
    for (const id of l) tally(heroRec, id, false);
    for (const k of pairsOf(w)) tally(pairRec, k, true);
    for (const k of pairsOf(l)) tally(pairRec, k, false);
  }
  const pairsAllowed = new Set([...pairRec].filter(([, r]) => r.n >= LEARN.minPairBattles).map(([k]) => k));
  const heroList = [...heroRec].map(([id, r]) => ({ id, ...r })).sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
  const pairList = [...pairRec].map(([k, r]) => ({ key: k, a: k.split('+')[0], b: k.split('+')[1], ...r })).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
  const status = {
    n,
    minBattles: LEARN.minBattles,
    need: Math.max(0, LEARN.minBattles - n),
    active: false,
    layers: {
      traits: { on: false, cv: null },
      heroes: { on: false, cv: null, ready: heroList.filter((h) => h.n >= LEARN.minHeroBattles).length },
      pairs: { on: false, cv: null, ready: pairsAllowed.size },
    },
    include: new Set(['g']),
    weights: null,
    traits: [],
    heroes: heroList,
    pairs: pairList,
    ready: 0,
    theta: null,
    model: null,
  };
  status.ready = status.layers.heroes.ready;
  if (n < LEARN.minBattles) return status;
  const model = buildModel(use, heroes, pairsAllowed);
  const cache = new Map();
  // Forward selection: each round, every layer not yet on is checked against
  // the model with the layers already on, and the one that helps most (if it
  // passes) goes in. Team traits and single heroes can explain the same
  // results (a hero brings its roles), so the stronger explanation wins.
  // Pairs only count on top of single heroes: they come in with the hero
  // layer, and must beat both the model without them and the same model with
  // heroes alone (so a pair can't stand in for one strong hero).
  let include = new Set(['g']);
  for (;;) {
    const open = Object.entries(LAYERS).filter(([name, block]) => {
      if (include.has(block)) return false;
      if (name === 'heroes') return status.layers.heroes.ready > 0;
      if (name === 'pairs') return status.layers.heroes.ready > 0 && status.layers.pairs.ready > 0;
      return true;
    });
    let best = null;
    for (const [name, block] of open) {
      const adds = name === 'pairs' ? ['h', 'p'] : [block];
      const next = new Set([...include, ...adds]);
      const cv = compare(model, include, next, cache);
      if (name === 'pairs') {
        cv.overHeroes = compare(model, new Set([...include, 'h']), next, cache);
        cv.on = cv.on && cv.overHeroes.on;
      }
      status.layers[name].cv = cv;
      if (cv.on && (!best || cv.gain > best.cv.gain)) best = { name, adds, cv };
    }
    if (!best) break;
    status.layers[best.name].on = true;
    // Pairs bring the hero layer with them.
    if (best.adds.includes('h')) status.layers.heroes.on = true;
    include = new Set([...include, ...best.adds]);
  }
  status.include = include;
  status.active = include.size > 1;
  // The model the counter uses, and every layer fitted for the tab.
  const { theta, allowP } = fitWith(model.rows, model.cols, include);
  const allFit = fitWith(model.rows, model.cols, new Set(['g', 't', 'h', 'p']));
  const all = allFit.theta;
  const shown = (block) => (include.has(block) ? theta : all);
  status.theta = theta;
  status.model = { ...model, allowP: include.has('p') ? allowP : allFit.allowP };
  status.weights = Object.fromEntries(WEIGHT_NAMES.map((k, i) => [k, theta[i]]));
  status.traits = TRAITS.map(([key, label], k) => ({ key, label, w: shown('t')[G + k] }));
  for (const h of status.heroes) h.delta = shown('h')[model.heroCol.get(h.id)];
  for (const p of status.pairs) {
    const j = model.pairCol.get(p.key);
    p.screened = j !== undefined && status.model.allowP?.has(j);
    if (p.screened) p.gamma = shown('p')[j];
  }
  return status;
}

const capPoints = (logit, max) => Math.max(-max, Math.min(max, logit * LEARN.pointsPerDelta));

// Counter points for a hero from an active hero layer ({points, n}), or null.
export function learnedPoints(status, id) {
  if (!status?.layers?.heroes.on) return null;
  const h = status.heroes.find((x) => x.id === id);
  if (!h || h.n < LEARN.minHeroBattles || !Number.isFinite(h.delta)) return null;
  return { points: capPoints(h.delta, LEARN.maxPoints), n: h.n, w: h.w, l: h.l, delta: h.delta };
}

// The map makeContext takes: hero id -> {points, n} for heroes with an adjustment.
export function learnedMap(status) {
  if (!status?.layers?.heroes.on) return null;
  const out = new Map();
  for (const h of status.heroes) {
    const v = learnedPoints(status, h.id);
    if (v) out.set(h.id, v);
  }
  return out.size ? out : null;
}

// Pair key -> {points, n, a, b} for pairs with an adjustment, when the pair layer is on.
export function learnedPairs(status) {
  if (!status?.layers?.pairs.on) return null;
  const out = new Map();
  for (const p of status.pairs) {
    if (p.n < LEARN.minPairBattles || !p.screened || !Number.isFinite(p.gamma)) continue;
    out.set(p.key, { points: capPoints(p.gamma, LEARN.maxPoints), n: p.n, w: p.w, l: p.l, a: p.a, b: p.b });
  }
  return out.size ? out : null;
}

// A function scoring a team's makeup against one enemy, when the trait layer
// is on: ids -> {points, why: [{label, points}]}.
export function learnedTraits(status, enemyIds, heroes) {
  if (!status?.layers?.traits.on || !enemyIds?.length) return null;
  const w = status.traits.map((t) => t.w);
  return (ids) => {
    const v = traitValues(ids, enemyIds, heroes);
    const parts = TRAITS.map(([, label], k) => ({ label, logit: w[k] * v[k] }));
    const logit = parts.reduce((s, p) => s + p.logit, 0);
    const why = parts
      .filter((p) => Math.abs(p.logit * LEARN.pointsPerDelta) >= 0.3)
      .sort((a, b) => Math.abs(b.logit) - Math.abs(a.logit))
      .slice(0, 2)
      .map((p) => ({ label: p.label, points: p.logit * LEARN.pointsPerDelta }));
    return { points: capPoints(logit, LEARN.maxTraitPoints), why };
  };
}

// The active model's chance that team a beats team b (sides as in learnBattles), or null.
export function winChance(status, a, b, heroes) {
  if (!status?.active || !status.theta) return null;
  const { cols, heroCol, pairCol } = status.model;
  const th = status.theta;
  const inc = status.include;
  const f = pairFeatures(a, b, heroes);
  let s = 0;
  for (let k = 0; k < G; k++) s += th[k] * f.g[k];
  if (inc.has('t')) for (let k = 0; k < T; k++) s += th[G + k] * f.t[k];
  if (inc.has('h')) {
    for (const id of f.a) if (learnedPoints(status, id)) s += th[heroCol.get(id)];
    for (const id of f.b) if (learnedPoints(status, id)) s -= th[heroCol.get(id)];
  }
  if (inc.has('p')) {
    const ok = (k) => pairCol.has(k) && status.model.allowP?.has(pairCol.get(k));
    for (const k of pairsOf(f.a)) if (ok(k)) s += th[pairCol.get(k)];
    for (const k of pairsOf(f.b)) if (ok(k)) s -= th[pairCol.get(k)];
  }
  void cols;
  return sigmoid(s);
}

// ---- public: top formations ------------------------------------------------------

// What top players' formations show. `formations` are {id, ids, slots}
// (slots: position -> hero id). Pairs: how much more often two heroes share
// a formation than their own popularity predicts (lift, shrunk toward 1 for
// small counts). Placement: the share of a hero's appearances in the front line.
export function learnTop(formations, heroes) {
  const C = LEARN.top;
  const list = (formations || []).map((f) => ({ ...f, ids: [...new Set((f.ids || []).filter((id) => heroes.get(id)))] })).filter((f) => f.ids.length >= 3);
  const n = list.length;
  const count = new Map();
  const front = new Map();
  const together = new Map();
  for (const f of list) {
    for (const id of f.ids) count.set(id, (count.get(id) || 0) + 1);
    for (const [pos, id] of Object.entries(f.slots || {})) if (heroes.get(id) && (pos === 'F1' || pos === 'F2')) front.set(id, (front.get(id) || 0) + 1);
    for (const k of pairsOf(f.ids)) together.set(k, (together.get(k) || 0) + 1);
  }
  const heroList = [...count].map(([id, c]) => ({ id, n: c, share: n ? c / n : 0, front: c ? (front.get(id) || 0) / c : 0 })).sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
  const pairs = [...together]
    .map(([key, c]) => {
      const [a, b] = key.split('+');
      const expected = n ? (count.get(a) * count.get(b)) / n : 0;
      const score = Math.log((c + C.shrink) / (expected + C.shrink));
      return { key, a, b, n: c, expected, lift: expected ? c / expected : 0, score };
    })
    .sort((x, y) => y.score - x.score || y.n - x.n);
  const on = n >= C.minFormations;
  return {
    n,
    minFormations: C.minFormations,
    need: Math.max(0, C.minFormations - n),
    on,
    heroes: heroList,
    pairs,
    strong: pairs.filter((p) => p.n >= C.minPairCount && p.score >= C.minScore),
  };
}

// Pair key -> {points, n, lift} for pairs top players clearly favour, once enough formations are in.
export function topPairs(top) {
  if (!top?.on) return null;
  const C = LEARN.top;
  const out = new Map();
  for (const p of top.strong) out.set(p.key, { points: Math.min(C.maxPairPoints, p.score * C.pointsPerLogLift), n: p.n, lift: p.lift, a: p.a, b: p.b });
  return out.size ? out : null;
}

// Hero id -> share of top formations that put it in the front line (heroes seen often enough).
export function topPositions(top) {
  if (!top?.on) return null;
  const out = new Map();
  for (const h of top.heroes) if (h.n >= LEARN.top.minHeroCount) out.set(h.id, h.front);
  return out.size ? out : null;
}

