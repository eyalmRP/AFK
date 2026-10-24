// Learns from the player's battle log (Battles tab): which heroes win more,
// or less, than combat power and tier ratings predict. Pure, like engine.js,
// so the browser and the tests share it.
//
// The model is a logistic (Bradley-Terry) model of P(team A beats team B):
//
//   logit P = wPower · 10·ln(power A / power B)
//           + wFaction · (faction edges A − edges B) / 5
//           + wBeast · (beast level A − beast level B) / 10
//           + wTier · (tier points A − tier points B) / 10
//           + Σ δ(heroes in A) − Σ δ(heroes in B)
//
// fitted by maximum a posteriori with Gaussian priors (Newton's method; the
// problem is convex). δ, a hero's adjustment, starts at 0 with spread 0.5, so
// a hero moves only with repeated results. The learned part switches on only
// when there are enough battles AND, on battles left out of the fit (k-fold
// cross-validation), it predicts the winner better than the same model
// without δ, which is what the counter already knows (power, tiers,
// factions). Until then the counter ignores it.

import { factionAdvantage, tierOf, tierScore } from './data.js';

export const LEARN = {
  minBattles: 30, // before this the model doesn't even check itself
  minHeroBattles: 10, // a hero's adjustment counts only after this many battles
  folds: 5,
  repeats: 3, // fold splits averaged, so one lucky split can't switch it on
  margin: 0.01, // cross-validated log-loss gain needed, in nats per battle, on top of the lower bound clearing 0
  deltaSd: 0.5,
  // Priors for the shared weights, as [mean, sd]. Power gets a positive mean:
  // a team 10% stronger wins about 70% of the time before any data says so.
  weightPrior: [
    [1, 1],
    [0, 1],
    [0, 1],
    [0, 1],
  ],
  // Counter points per unit of δ (one tier step is 1.5 points), capped.
  pointsPerDelta: 3,
  maxPoints: 3,
};

export const WEIGHT_NAMES = ['power', 'faction', 'beast', 'tier'];
const G = WEIGHT_NAMES.length;

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

// One side of a battle as the model sees it: hero ids, combat power, beast level (null = unknown).
function sideFeatures(side, heroes) {
  const ids = (side.ids || []).filter((id) => heroes.get(id));
  const tier = ids.reduce((t, id) => t + tierScore(tierOf(heroes.get(id), 'pvp')), 0);
  return { ids, power: side.power || 0, beastLevel: side.beastLevel ?? null, tier };
}

function edges(a, b, heroes) {
  let n = 0;
  for (const x of a) for (const y of b) if (factionAdvantage(heroes.get(x)?.faction, heroes.get(y)?.faction)) n++;
  return n;
}

// Shared features of A against B (antisymmetric: swapping A and B flips the sign).
export function pairFeatures(a, b, heroes) {
  const A = sideFeatures(a, heroes);
  const B = sideFeatures(b, heroes);
  const power = A.power > 0 && B.power > 0 ? 10 * Math.log(A.power / B.power) : 0;
  const faction = (edges(A.ids, B.ids, heroes) - edges(B.ids, A.ids, heroes)) / 5;
  const beast = A.beastLevel !== null && B.beastLevel !== null ? (A.beastLevel - B.beastLevel) / 10 : 0;
  const tier = (A.tier - B.tier) / 10;
  return { g: [power, faction, beast, tier], a: A.ids, b: B.ids };
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

// Rows: the winner as A, so every observation is "A won". Hero columns hold
// +1 for a hero on the winning side and -1 on the losing side (0 if both).
function buildRows(battles, heroes, index) {
  return battles.map((x) => {
    const f = pairFeatures(x.win, x.lose, heroes);
    const h = new Map();
    for (const id of f.a) if (index.has(id)) h.set(index.get(id), (h.get(index.get(id)) || 0) + 1);
    for (const id of f.b) if (index.has(id)) h.set(index.get(id), (h.get(index.get(id)) || 0) - 1);
    return { id: x.id, g: f.g, h: [...h].filter(([, v]) => v) };
  });
}

function rowScore(theta, r) {
  let s = 0;
  for (let k = 0; k < G; k++) s += theta[k] * r.g[k];
  for (const [j, v] of r.h) s += theta[j] * v;
  return s;
}

function objective(theta, rows, mean, prec) {
  let v = 0;
  for (const r of rows) {
    const s = rowScore(theta, r);
    v += s > 0 ? Math.log1p(Math.exp(-s)) : -s + Math.log1p(Math.exp(s));
  }
  for (let j = 0; j < theta.length; j++) v += 0.5 * prec[j] * (theta[j] - mean[j]) ** 2;
  return v;
}

// Solve H x = g for a symmetric positive definite H (Cholesky).
function solve(H, g) {
  const n = g.length;
  const L = H.map((row) => row.slice());
  for (let j = 0; j < n; j++) {
    let d = L[j][j];
    for (let k = 0; k < j; k++) d -= L[j][k] * L[j][k];
    d = Math.sqrt(Math.max(d, 1e-12));
    L[j][j] = d;
    for (let i = j + 1; i < n; i++) {
      let s = L[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = s / d;
    }
  }
  const y = new Array(n);
  for (let i = 0; i < n; i++) {
    let s = g[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
    y[i] = s / L[i][i];
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}

// MAP fit. `p` columns: the G shared weights, then one δ per hero (none when withHeroes is false).
function fit(rows, p, withHeroes) {
  const mean = new Array(p).fill(0);
  const prec = new Array(p).fill(1 / LEARN.deltaSd ** 2);
  LEARN.weightPrior.forEach(([m, sd], k) => {
    mean[k] = m;
    prec[k] = 1 / sd ** 2;
  });
  const use = withHeroes ? rows : rows.map((r) => ({ ...r, h: [] }));
  let theta = mean.slice();
  let obj = objective(theta, use, mean, prec);
  for (let it = 0; it < 30; it++) {
    const grad = theta.map((t, j) => prec[j] * (t - mean[j]));
    const H = Array.from({ length: p }, (_, i) => {
      const row = new Array(p).fill(0);
      row[i] = prec[i];
      return row;
    });
    for (const r of use) {
      const q = sigmoid(rowScore(theta, r));
      const z = [...r.g.map((v, k) => [k, v]), ...r.h].filter(([, v]) => v);
      for (const [i, vi] of z) {
        grad[i] -= (1 - q) * vi;
        for (const [j, vj] of z) H[i][j] += q * (1 - q) * vi * vj;
      }
    }
    const step = solve(H, grad);
    // Backtracking keeps every step downhill.
    let t = 1;
    let next;
    let nextObj;
    for (let k = 0; k < 20; k++) {
      next = theta.map((v, j) => v - t * step[j]);
      nextObj = objective(next, use, mean, prec);
      if (nextObj <= obj) break;
      t /= 2;
    }
    const moved = Math.max(...next.map((v, j) => Math.abs(v - theta[j])));
    theta = next;
    const done = obj - nextObj < 1e-9 || moved < 1e-7;
    obj = nextObj;
    if (done) break;
  }
  return theta;
}

// Log-loss of each winner under theta, using δ only for heroes with enough
// battles in the fitted data (the same rule the counter applies).
function losses(theta, rows, counts) {
  return rows.map((r) => {
    let s = 0;
    for (let k = 0; k < G; k++) s += theta[k] * r.g[k];
    for (const [j, x] of r.h) if ((counts.get(j) || 0) >= LEARN.minHeroBattles) s += theta[j] * x;
    return -Math.log(Math.max(1e-9, sigmoid(s)));
  });
}

function heroCounts(rows) {
  const c = new Map();
  for (const r of rows) for (const [j] of r.h) c.set(j, (c.get(j) || 0) + 1);
  return c;
}

// Stable fold for a battle, from its id, so the check gives the same answer each time.
function foldOf(id, k) {
  let h = 2166136261;
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h % k;
}

// Cross-validated log-loss with and without hero adjustments, repeated over
// a few fold splits. `gain` is how much better the adjusted model predicts
// battles it wasn't fitted on, `low` a cautious lower bound on that gain
// (one-sided 95%, paired over battles).
function crossValidate(rows, p) {
  const k = LEARN.folds;
  const diff = new Array(rows.length).fill(0);
  let full = 0;
  let base = 0;
  for (let rep = 0; rep < LEARN.repeats; rep++) {
    for (let f = 0; f < k; f++) {
      const inTest = rows.map((r) => foldOf(`${rep}:${r.id}`, k) === f);
      const train = rows.filter((_, i) => !inTest[i]);
      const test = rows.filter((_, i) => inTest[i]);
      if (!test.length || !train.length) continue;
      const lf = losses(fit(train, p, true), test, heroCounts(train));
      const lb = losses(fit(train, G, false), test, new Map());
      let t = 0;
      rows.forEach((_, i) => {
        if (!inTest[i]) return;
        diff[i] += (lb[t] - lf[t]) / LEARN.repeats;
        full += lf[t];
        base += lb[t];
        t++;
      });
    }
  }
  const n = rows.length;
  const gain = diff.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(diff.reduce((a, d) => a + (d - gain) ** 2, 0) / Math.max(1, n - 1));
  return { full: full / (n * LEARN.repeats), base: base / (n * LEARN.repeats), gain, low: gain - 1.645 * (sd / Math.sqrt(n)) };
}

// ---- public --------------------------------------------------------------

// Learn from the battle log. Returns the status the Battles tab shows and,
// when the check passes, what the counter applies.
export function learnBattles(battles, heroes) {
  const use = usableBattles(battles, heroes);
  const n = use.length;
  const ids = [...new Set(use.flatMap((x) => [...x.win.ids, ...x.lose.ids]).filter((id) => heroes.get(id)))];
  const index = new Map(ids.map((id, i) => [id, G + i]));
  const p = G + ids.length;
  const rows = buildRows(use, heroes, index);
  const record = new Map(ids.map((id) => [id, { id, n: 0, w: 0, l: 0 }]));
  for (const x of use) {
    for (const id of new Set(x.win.ids)) if (record.has(id)) (record.get(id).n++, record.get(id).w++);
    for (const id of new Set(x.lose.ids)) if (record.has(id)) (record.get(id).n++, record.get(id).l++);
  }
  const status = { n, minBattles: LEARN.minBattles, need: Math.max(0, LEARN.minBattles - n), active: false, cv: null, weights: null, heroes: [], ready: 0, theta: null, index };
  status.heroes = [...record.values()].sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
  status.ready = status.heroes.filter((h) => h.n >= LEARN.minHeroBattles).length;
  if (n < LEARN.minBattles) return status;
  const theta = fit(rows, p, true);
  status.theta = theta;
  status.weights = Object.fromEntries(WEIGHT_NAMES.map((k, i) => [k, theta[i]]));
  for (const h of status.heroes) h.delta = theta[index.get(h.id)];
  status.cv = crossValidate(rows, p);
  status.active = status.ready > 0 && status.cv.gain >= LEARN.margin && status.cv.low > 0;
  return status;
}

// Counter points for a hero from an active model ({points, n}), or null.
export function learnedPoints(status, id) {
  if (!status?.active) return null;
  const h = status.heroes.find((x) => x.id === id);
  if (!h || h.n < LEARN.minHeroBattles || !Number.isFinite(h.delta)) return null;
  const points = Math.max(-LEARN.maxPoints, Math.min(LEARN.maxPoints, h.delta * LEARN.pointsPerDelta));
  return { points, n: h.n, w: h.w, l: h.l, delta: h.delta };
}

// The map makeContext takes: hero id -> {points, n} for heroes with an adjustment.
export function learnedMap(status) {
  if (!status?.active) return null;
  const out = new Map();
  for (const h of status.heroes) {
    const v = learnedPoints(status, h.id);
    if (v) out.set(h.id, v);
  }
  return out.size ? out : null;
}

// The active model's chance that team a beats team b (sides as in learnBattles), or null.
export function winChance(status, a, b, heroes) {
  if (!status?.active || !status.theta) return null;
  const f = pairFeatures(a, b, heroes);
  let s = 0;
  for (let k = 0; k < G; k++) s += status.theta[k] * f.g[k];
  for (const id of f.a) if (learnedPoints(status, id)) s += status.theta[status.index.get(id)];
  for (const id of f.b) if (learnedPoints(status, id)) s -= status.theta[status.index.get(id)];
  return sigmoid(s);
}
