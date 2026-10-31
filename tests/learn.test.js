import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setData, data } from '../src/js/data.js';
import { learnBattles, learnedMap, learnedTraits, winChance, learnTop, topPairs, topPositions, teamMakeup, LEARN } from '../src/js/learn.js';
import { makeContext, buildTeam, scoreTeam, assignPositions } from '../src/js/engine.js';

const read = (f) => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url)));
setData({ meta: read('meta.json'), heroes: read('heroes.json'), artifacts: read('artifacts.json'), modes: read('modes.json') });
const heroes = data.heroById;
const pool = data.heroes.filter((h) => ['S+', 'S', 'A'].includes(h.tiers.pvp || h.tiers.overall)).map((h) => h.id).slice(0, 24);

// Deterministic battle logs: random 5-hero teams at equal power; `edge(a, b)`
// is the chance team a wins.
function makeLog(n, edge, seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const team = (avoid) => {
    const left = pool.filter((id) => !avoid.includes(id));
    const out = [];
    while (out.length < 5) out.push(left.splice(Math.floor(rnd() * left.length), 1)[0]);
    return out;
  };
  return Array.from({ length: n }, (_, i) => {
    const a = team([]);
    const b = team(a);
    const sa = { ids: a, power: 1e10, beastLevel: null };
    const sb = { ids: b, power: 1e10, beastLevel: null };
    const aWins = rnd() < edge(a, b);
    return { id: `t${seed}-${i}`, win: aWins ? sa : sb, lose: aWins ? sb : sa };
  });
}

test('the battle log stays off below the minimum and says how many more it needs', () => {
  const st = learnBattles(makeLog(12, () => 0.5), heroes);
  assert.equal(st.n, 12);
  assert.equal(st.need, LEARN.minBattles - 12);
  assert.equal(st.active, false);
  assert.equal(learnedMap(st), null);
});

test('coin-flip battles never switch any layer on', () => {
  for (const seed of [1, 2, 3]) {
    const st = learnBattles(makeLog(80, () => 0.5, seed), heroes);
    assert.equal(st.need, 0);
    assert.equal(st.active, false, JSON.stringify(st.layers));
  }
});

test('a hero whose team keeps winning is learned and lifts it in the counter', () => {
  const star = pool[3];
  const edge = (a, b) => (a.includes(star) ? 0.92 : b.includes(star) ? 0.08 : 0.5);
  const st = learnBattles(makeLog(200, edge, 5), heroes);
  assert.ok(st.layers.heroes.on, JSON.stringify(st.layers));
  const h = st.heroes.find((x) => x.id === star);
  assert.ok(h.delta > 0.5, `delta ${h.delta}`);
  const others = st.heroes.filter((x) => x.id !== star && x.n >= LEARN.minHeroBattles);
  assert.ok(others.every((x) => Math.abs(x.delta) < h.delta), 'the star stands out');
  const learned = learnedMap(st);
  assert.ok(learned.get(star).points > 0);
  const withStar = pool.filter((id) => id !== star).slice(0, 4).concat(star);
  const without = pool.filter((id) => id !== star).slice(5, 10);
  const p = winChance(st, { ids: withStar, power: 1e10, beastLevel: null }, { ids: without, power: 1e10, beastLevel: null }, heroes);
  assert.ok(p > 0.75, `win chance ${p}`);
});

test('more power wins more, before and after learning', () => {
  // Stronger teams win; no hero matters. The power weight stays positive.
  const st = learnBattles(
    makeLog(60, () => 0.5).map((b, i) => (i % 2 ? b : { ...b, win: { ...b.win, power: 1.15e10 } })),
    heroes
  );
  assert.ok(st.weights.power > 0);
});

const enemy = ['lucius', 'thoran', 'awakened-talene', 'lyca', 'nara'].filter((id) => heroes.get(id));

test('a team the player beat this lineup with is picked and reported', () => {
  // Strong heroes, but not the team the counter picks without the log.
  const won = ['awakened-baden', 'awakened-belinda', 'aurelia', 'athena', 'awakened-antandra'];
  const records = [{ id: 'r1', date: '2026-10-20', win: won, lose: enemy, winBeast: null, loseBeast: null }];
  const mode = data.modeById.get('arena-of-heroes');
  const ctx = makeContext({ heroes, mode, enemy, records });
  const plain = makeContext({ heroes, mode, enemy });
  const s = scoreTeam(ctx, won);
  assert.equal(s.own.wins, 1);
  assert.ok(s.own.bonus > 0);
  assert.ok(s.total > scoreTeam(plain, won).total);
  const pickFrom = [...new Set([...won, ...data.heroes.map((h) => h.id).slice(0, 40)])];
  const best = buildTeam(ctx, pickFrom);
  assert.ok(won.filter((id) => best.ids.includes(id)).length >= 4, `picked ${best.ids}`);
});

test('a team that lost to this lineup scores lower', () => {
  const lost = ['shemira', 'brutus', 'rowan', 'belinda', 'ferael'].filter((id) => heroes.get(id));
  const records = [{ id: 'r2', date: '2026-10-20', win: enemy, lose: lost }];
  const mode = data.modeById.get('arena-of-heroes');
  const s = scoreTeam(makeContext({ heroes, mode, enemy, records }), lost);
  assert.equal(s.own.losses, 1);
  assert.ok(s.own.bonus < 0);
  assert.ok(s.total < scoreTeam(makeContext({ heroes, mode, enemy }), lost).total);
});

test('team makeup is learned: teams without a tank lose', () => {
  const tank = (ids) => teamMakeup(ids, heroes).tank >= 1;
  const edge = (a, b) => (tank(a) && !tank(b) ? 0.85 : tank(b) && !tank(a) ? 0.15 : 0.5);
  const st = learnBattles(makeLog(200, edge, 9), heroes);
  assert.ok(st.layers.traits.on, JSON.stringify(st.layers));
  const w = Object.fromEntries(st.traits.map((t) => [t.key, t.w]));
  assert.ok(w.tank1 > 0.3, `tank1 ${w.tank1}`);
  // The counter's view: against the same enemy, a team with a tank scores higher than one without.
  const tanks = pool.filter((id) => teamMakeup([id], heroes).tank);
  const others = pool.filter((id) => !teamMakeup([id], heroes).tank);
  const score = learnedTraits(st, others.slice(0, 5), heroes);
  const withTank = score([tanks[0], ...others.slice(5, 9)]);
  const without = score(others.slice(5, 10));
  assert.ok(withTank.points > without.points, `${withTank.points} vs ${without.points}`);
  assert.ok(withTank.why.some((x) => x.label === 'having a tank'));
});

test('top formations: pairs fielded together and front-line placement', () => {
  const [a, b, c] = pool;
  const rest = pool.slice(3);
  let s = 3;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const forms = Array.from({ length: 40 }, (_, i) => {
    // a and b go together in half the formations; c appears as often, alone.
    const left = rest.slice();
    const others = [];
    while (others.length < 3) others.push(left.splice(Math.floor(rnd() * left.length), 1)[0]);
    const core = i % 2 ? [a, b] : [c, left[Math.floor(rnd() * left.length)]];
    const ids = [...core, ...others];
    return { id: 'f' + i, ids, slots: { F1: core[0], F2: others[0], B1: core[1], B2: others[1], B3: others[2] } };
  });
  const few = learnTop(forms.slice(0, 20), heroes);
  assert.equal(few.on, false);
  assert.equal(few.need, LEARN.top.minFormations - 20);
  assert.equal(topPairs(few), null);
  const top = learnTop(forms, heroes);
  assert.ok(top.on);
  const key = a < b ? `${a}+${b}` : `${b}+${a}`;
  assert.equal(top.strong[0].key, key, top.strong.slice(0, 3).map((p) => p.key).join(' '));
  assert.ok(topPairs(top).get(key).points > 0);
  const pos = topPositions(top);
  assert.equal(pos.get(a), 1);
  assert.equal(pos.get(b), 0);
  // The engine follows the placement: a goes to the front even if its class says back.
  const layout = assignPositions([a, b, ...rest.slice(0, 3)].map((id) => heroes.get(id)), new Map([[a, 1], [b, 0]])).slots;
  assert.ok(['F1', 'F2'].some((p) => layout[p] === a));
  assert.ok(['B1', 'B2', 'B3'].some((p) => layout[p] === b));
});

test('pairs top players field together lift a team in the engine', () => {
  const [a, b] = pool;
  const team = pool.slice(0, 5);
  const mode = data.modeById.get('arena-of-heroes');
  const k = a < b ? `${a}+${b}` : `${b}+${a}`;
  const plain = scoreTeam(makeContext({ heroes, mode, enemy }), team);
  const s = scoreTeam(makeContext({ heroes, mode, enemy, learnedTeam: { topPairs: new Map([[k, { points: 1, n: 9, lift: 2 }]]) } }), team);
  assert.ok(Math.abs(s.total - plain.total - 1) < 1e-9);
  assert.equal(s.learned.top.length, 1);
});
