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

test('star colour follows engraving, as in the game', async () => {
  const { starTier, upgradeUnlocked } = await import('../src/js/data.js');
  assert.deepEqual(starTier(3, 0), { tier: 'gold', count: 3 });
  assert.deepEqual(starTier(5, 30), { tier: 'orange', count: 5 });
  assert.deepEqual(starTier(2, 65), { tier: 'red', count: 2 });
  assert.deepEqual(starTier(5, 80), { tier: 'white', count: 5 });
  assert.deepEqual(starTier(4, null), { tier: 'gold', count: 4 });
  assert.equal(starTier(0, 80), null);
  assert.equal(upgradeUnlocked({ asc: 'Legendary+' }, 'si'), false);
  assert.equal(upgradeUnlocked({ asc: 'Mythic' }, 'si'), true);
  assert.equal(upgradeUnlocked({ asc: 'Mythic+' }, 'furniture'), false);
  assert.equal(upgradeUnlocked({ asc: 'Ascended', stars: 0 }, 'engrave'), false);
  assert.equal(upgradeUnlocked({ asc: 'Ascended', stars: 1 }, 'engrave'), true);
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

test('signature item ornaments follow the in-game tiers', async () => {
  const { siTier, emblemSvg } = await import('../src/js/ui/emblem.js');
  const e = (si, asc = 'Ascended') => ({ owned: true, asc, stars: 1, si });
  assert.equal(siTier(e(9)), 0);
  assert.equal(siTier(e(30)), 30);
  assert.equal(siTier(e(44)), 40);
  assert.equal(siTier(e(50)), 50);
  assert.equal(siTier(e(20, 'Legendary+')), null);
  assert.ok(!emblemSvg(30, 0).includes('orn-wing-gold') && !emblemSvg(30, 0).includes('#e84a4a'));
  assert.ok(emblemSvg(40, 9).includes('orn-wing-gold') && emblemSvg(40, 9).includes('#e84a4a'));
  assert.ok(!emblemSvg(50, 9).includes('orn-wing-gold') && emblemSvg(50, 9).includes('url(#orn-wing)') && emblemSvg(50, 9).includes('#e84a4a'));
});

test('estimated combat rating rises with every upgrade and the Elder Tree', async () => {
  const { estimateCR } = await import('../src/js/engine.js');
  const h = { class: 'Mage' };
  const base = { owned: true, asc: 'Ascended', stars: 3, si: 30, furniture: 9, engrave: 60, gear: 4 };
  const cr = (e, opts = {}) => estimateCR(e, h, { level: 922, ...opts });
  const b = cr(base);
  for (const patch of [{ stars: 5 }, { si: 40 }, { furniture: 36 }, { engrave: 80 }, { gear: 5 }]) assert.ok(cr({ ...base, ...patch }) > b, JSON.stringify(patch));
  assert.ok(cr(base, { level: 1000 }) > b);
  assert.ok(cr(base, { elderTree: { Mage: 200 } }) > cr(base, { elderTree: { Warrior: 200 } }));
  assert.ok(cr({ ...base, asc: 'Mythic+', stars: 0 }) < b);
  // Locked upgrades and heroes not owned add nothing.
  assert.equal(cr({ ...base, asc: 'Legendary', si: 30 }), cr({ ...base, asc: 'Legendary', si: 0 }));
  assert.equal(cr({ ...base, owned: false }), 0);
});

test('estimated combat rating matches 41 in-game ratings', async () => {
  const { estimateCR } = await import('../src/js/engine.js');
  const tree = { Mage: 200, Ranger: 195, Support: 200, Tank: 196, Warrior: 195, core: 257 };
  const at = (cls, asc, stars, si, furniture, engrave, gear = 4) => estimateCR({ owned: true, asc, stars, si, furniture, engrave, gear }, { class: cls }, { level: 922, elderTree: tree });
  // The player's heroes at level 922 and their rating in game. The game shows
  // whole billions from 10B up, so those compare with the middle of the number.
  const B = (n) => (n + 0.25) * 1e9;
  const A = 'Ascended';
  const cases = [
    [at('Tank', A, 5, 40, 9, 80, 5), B(21)], [at('Mage', A, 5, 40, 9, 80), B(20)],
    [at('Mage', A, 4, 50, 9, 80), B(19)], [at('Tank', A, 5, 40, 9, 80), B(19)], [at('Ranger', A, 2, 50, 9, 80), B(19)], [at('Tank', A, 3, 40, 9, 80), B(19)],
    [at('Support', A, 5, 40, 9, 80, 5), B(18)], [at('Warrior', A, 5, 40, 9, 80), B(18)], [at('Support', A, 5, 40, 9, 80), B(18)], [at('Support', A, 5, 40, 9, 80), B(18)], [at('Ranger', A, 4, 40, 9, 80), B(18)],
    [at('Tank', A, 5, 30, 9, 80), B(17)],
    [at('Ranger', A, 5, 40, 9, 60), B(16)], [at('Tank', A, 1, 40, 9, 60), B(16)], [at('Mage', A, 1, 40, 9, 60), B(16)], [at('Support', A, 5, 30, 9, 80), B(16)],
    [at('Warrior', A, 5, 40, 9, 60), B(15)], [at('Support', A, 1, 40, 9, 60), B(15)], [at('Mage', A, 5, 30, 9, 80), B(15)], [at('Warrior', A, 5, 30, 9, 80), B(15)],
    [at('Mage', A, 5, 30, 9, 80), B(15)], [at('Support', A, 5, 30, 9, 80), B(15)], [at('Tank', A, 5, 30, 9, 60), B(15)], [at('Mage', A, 5, 30, 9, 60), B(15)],
    ...['Mage', 'Warrior', 'Mage', 'Warrior', 'Mage', 'Mage'].map((c) => [at(c, A, 5, 30, 9, 60), B(14)]),
    [at('Ranger', A, 5, 30, 3, 60), B(14)], [at('Mage', A, 5, 20, 3, 60), B(14)],
    ...['Support', 'Mage', 'Ranger', 'Warrior'].map((c) => [at(c, A, 2, 30, 9, 60), B(14)]),
    [at('Warrior', A, 5, 30, 9, 30), B(13)], [at('Warrior', A, 0, 35, 7, 0), B(11)],
    [at('Mage', 'Mythic', 0, 40, 0, 0), 9509e6], [at('Support', 'Mythic', 0, 40, 0, 0), 9159e6], [at('Ranger', 'Legendary+', 0, 0, 0, 0), 5839e6],
  ];
  assert.equal(cases.length, 41);
  // Heroes with the same build differ by up to about 15% in game (Awakened
  // Shemira 21B, Liberta 18B), so single heroes are off by up to 10%.
  for (const [est, game] of cases) assert.ok(Math.abs(est / game - 1) < 0.1, `${est} vs ${game}`);
  const mean = cases.reduce((s, [est, game]) => s + Math.abs(est / game - 1), 0) / cases.length;
  assert.ok(mean < 0.035, `mean error ${mean}`);
});

test('a hero\'s combat rating correction scales its estimate, within limits', async () => {
  const { estimateCR } = await import('../src/js/engine.js');
  const e = { owned: true, asc: 'Ascended', stars: 5, si: 40, furniture: 9, engrave: 80, gear: 4 };
  const base = estimateCR(e, { class: 'Mage' }, { level: 922 });
  assert.equal(estimateCR({ ...e, crFit: 1.1 }, { class: 'Mage' }, { level: 922 }), Math.round(base * 1.1));
  assert.equal(estimateCR({ ...e, crFit: 9 }, { class: 'Mage' }, { level: 922 }), Math.round(base * 2.5));
});

test('weighing by power ranks a hero by its combat rating against the strongest five', () => {
  const ids = all.slice(0, 8);
  const at = (cr) => new Map(ids.map((id, i) => [id, i === 0 ? cr : 10e9]));
  const value = (power) => heroValue(ctxFor('arena-of-heroes', { power }), ids[0]).value;
  assert.ok(value(at(12e9)) > value(at(6e9)));
  // A hero as strong as the top five counts fully; ratings are capped either way.
  assert.equal(value(at(10e9)), heroValue(ctxFor('arena-of-heroes'), ids[0]).value);
  assert.equal(value(at(1)), value(at(2)));
});

test('a lineup the sources say beats the enemy is preferred and named', () => {
  const vs = ['awakened-estrilda', 'kyno', 'odysseus', 'thalassa', 'lan'];
  const win = ['awakened-shemira', 'leviathan', 'athena', 'medusa', 'awakened-eluard'];
  const matchups = [{ vsName: 'Test MVP team', vs, beatenBy: [{ name: 'Test winner', heroes: win }], url: 'https://example.com', date: '2026-10-24' }];
  const mode = data.modeById.get('arena-of-heroes');
  const pool = all.filter((id) => !vs.includes(id));
  const ctx = makeContext({ heroes: data.heroById, mode, category: 'pvp', enemy: vs, archetypes: data.archetypes, matchups });
  assert.equal(ctx.enemyMatchups.length, 1);
  const t = buildTeam(ctx, pool);
  assert.equal(t.score.beats?.name, 'Test winner');
  assert.ok(win.filter((id) => t.ids.includes(id)).length >= 4);
  // An unrelated enemy does not trigger it.
  const other = makeContext({ heroes: data.heroById, mode, category: 'pvp', enemy: ['liberta', 'ivan', 'daemia'], matchups });
  assert.equal(other.enemyMatchups.length, 0);
});

test('a beast its source lineup uses wins when the player owns it', async () => {
  const { suggestBeast } = await import('../src/js/engine.js');
  const beasts = [{ id: 'a', tiers: { pvp: 'S+' } }, { id: 'b', tiers: { pvp: 'B' } }];
  const ctx = makeContext({ heroes: data.heroById, mode: data.modeById.get('arena-of-heroes'), category: 'pvp' });
  const owned = { a: { owned: true }, b: { owned: true } };
  assert.equal(suggestBeast(ctx, [], { beasts, owned }).id, 'a');
  assert.equal(suggestBeast(ctx, [], { beasts, owned, prefer: { id: 'b', label: 'used with X' } }).id, 'b');
  // Not owned: falls back to the rating.
  assert.equal(suggestBeast(ctx, [], { beasts, owned: { a: { owned: true } }, prefer: { id: 'b' } }).id, 'a');
});
