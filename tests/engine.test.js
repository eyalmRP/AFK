import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setData, data } from '../src/js/data.js';
import { makeContext, buildTeams, buildTeam, investmentFactor, assignPositions, heroValue, scoreTeam } from '../src/js/engine.js';

const read = (f) => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url)));
setData({ meta: read('meta.json'), heroes: read('heroes.json'), artifacts: read('artifacts.json'), modes: read('modes.json') });
const all = data.heroes.map((h) => h.id);
const ctxFor = (modeId, extra = {}) => makeContext({ heroes: data.heroById, mode: data.modeById.get(modeId), combos: data.combos.community, archetypes: data.archetypes, ...extra });

test('multi-team builds never reuse a hero', () => {
  const { teams } = buildTeams(ctxFor('cursed-realm'), all, 6);
  assert.equal(teams.length, 6);
  const ids = teams.flatMap((t) => t.ids);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of teams) assert.equal(t.ids.length, 5);
});

test('balanced strategy keeps teams disjoint', () => {
  const { teams } = buildTeams(ctxFor('legends-championship'), all, 3, 'balanced');
  const ids = teams.flatMap((t) => t.ids);
  assert.equal(new Set(ids).size, 15);
});

test('faction towers only use their faction', () => {
  const t = buildTeam(ctxFor('tower-of-light'), all);
  for (const id of t.ids) assert.equal(data.heroById.get(id).faction, 'Lightbearer');
});

test('small pools fill what they can', () => {
  const pool = all.slice(0, 7);
  const { teams } = buildTeams(ctxFor('legends-championship'), pool, 3);
  assert.equal(teams.flatMap((t) => t.ids).length, 7);
});

test('more investment never lowers a hero', () => {
  const h = data.heroById.get('envydiel');
  const base = { owned: true, asc: 'Ascended', stars: 0, si: 0, furniture: 0, engrave: 0 };
  const a = investmentFactor(base, h).factor;
  const b = investmentFactor({ ...base, si: 30, furniture: 9, engrave: 60 }, h).factor;
  const c = investmentFactor({ ...base, asc: 'Mythic' }, h).factor;
  assert.ok(b > a);
  assert.ok(c < a);
});

test('investment changes which heroes the builder picks', () => {
  const pool = ['envydiel', 'liberta', 'palmer', 'daemia', 'ivan', 'rosaline', 'lucius', 'rowan', 'brutus', 'thoran'];
  const entries = Object.fromEntries(pool.map((id) => [id, { owned: true, asc: 'Ascended', stars: 5, si: 40, furniture: 9, engrave: 80 }]));
  entries.envydiel = { owned: true, asc: 'Elite', stars: 0, si: 0, furniture: 0, engrave: 0 };
  const withInv = heroValue(makeContext({ heroes: data.heroById, entries, mode: data.modeById.get('campaign') }), 'envydiel').value;
  const noInv = heroValue(makeContext({ heroes: data.heroById, mode: data.modeById.get('campaign') }), 'envydiel').value;
  assert.ok(withInv < noInv * 0.6);
});

test('tanks go to the front row', () => {
  const hs = ['lucius', 'envydiel', 'liberta', 'palmer', 'brutus'].map((id) => data.heroById.get(id));
  const { slots } = assignPositions(hs);
  assert.deepEqual(new Set([slots.F1, slots.F2]), new Set(['lucius', 'brutus']));
});

test('faction advantage counts against the enemy', () => {
  const ctx = ctxFor('arena-of-heroes', { enemy: ['shemira', 'mortas'] });
  const wilder = heroValue(ctx, 'lyca');
  assert.ok(wilder.counterBonus > 0);
  assert.ok(wilder.reasons.some((r) => r.startsWith('faction edge')));
});

test('a full team scores higher than a partial one', () => {
  const ctx = ctxFor('campaign');
  const t = buildTeam(ctx, all);
  assert.ok(scoreTeam(ctx, t.ids).total > scoreTeam(ctx, t.ids.slice(0, 3)).total);
});

test('star tiers follow the game colours', async () => {
  const { starTier } = await import('../src/js/data.js');
  assert.deepEqual(starTier(3), { tier: 'gold', count: 3 });
  assert.deepEqual(starTier(7), { tier: 'red', count: 2 });
  assert.deepEqual(starTier(15), { tier: 'white', count: 5 });
  assert.equal(starTier(0), null);
});

test('unrecorded upgrades count as neutral, not as zero', () => {
  const h = data.heroById.get('liberta');
  const unknown = { owned: true, asc: 'Ascended', stars: 5, si: null, furniture: null, engrave: null };
  const zero = { ...unknown, si: 0, furniture: 0, engrave: 0 };
  assert.ok(investmentFactor(unknown, h).factor > investmentFactor(zero, h).factor);
  assert.deepEqual(investmentFactor(unknown, h).notes, []);
});

test('a higher Elder Tree branch lifts heroes of that class', async () => {
  const { elderTreeFactors } = await import('../src/js/engine.js');
  const f = elderTreeFactors({ core: 257, Warrior: 150, Tank: 200, Ranger: 200, Mage: 250, Support: 200 });
  assert.ok(f.Mage.factor > f.Tank.factor && f.Tank.factor > f.Warrior.factor);
  assert.equal(elderTreeFactors({ core: 10 }), null);
  const tree = { Warrior: 100, Tank: 300, Ranger: 300, Mage: 300, Support: 300 };
  const entries = { lucius: { owned: true, asc: 'Ascended', stars: 5, si: null, furniture: null, engrave: null }, brutus: { owned: true, asc: 'Ascended', stars: 5, si: null, furniture: null, engrave: null } };
  const ctx = makeContext({ heroes: data.heroById, entries, mode: data.modeById.get('campaign'), elderTree: tree });
  const base = makeContext({ heroes: data.heroById, entries, mode: data.modeById.get('campaign') });
  const warrior = [...data.heroById.values()].find((h) => h.class === 'Warrior');
  entries[warrior.id] = entries.lucius;
  assert.ok(heroValue(ctx, warrior.id).value < heroValue(base, warrior.id).value);
});
