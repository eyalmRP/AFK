import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setData, data } from '../src/js/data.js';
import { learnBattles, learnedMap, winChance, LEARN } from '../src/js/learn.js';
import { makeContext, buildTeam, scoreTeam } from '../src/js/engine.js';

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

test('coin-flip battles never switch the learned part on', () => {
  for (const seed of [1, 2, 3]) {
    const st = learnBattles(makeLog(80, () => 0.5, seed), heroes);
    assert.equal(st.need, 0);
    assert.equal(st.active, false, `seed ${seed}: gain ${st.cv.gain.toFixed(3)}`);
  }
});

test('a hero whose team keeps winning is learned and lifts it in the counter', () => {
  const star = pool[3];
  const edge = (a, b) => (a.includes(star) ? 0.92 : b.includes(star) ? 0.08 : 0.5);
  const st = learnBattles(makeLog(120, edge, 5), heroes);
  assert.ok(st.active, `gain ${st.cv.gain.toFixed(3)}, low ${st.cv.low.toFixed(3)}`);
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
