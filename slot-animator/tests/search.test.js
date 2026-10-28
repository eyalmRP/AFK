import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchFeatures, buildIndex, FEATURES, SYNONYMS, POPULAR } from '../src/js/ui/search.js';

const top = (q, n = 3) => searchFeatures(q).slice(0, n).map((r) => r.feature.title);

test('feature search finds features by name, by synonym and despite typos', () => {
  // Names.
  assert.equal(top('screen shake')[0], 'Screen shake');
  assert.equal(top('clear all')[0], 'Clear all rounds');
  // Synonyms: the words people use.
  assert.ok(top('confetti').includes('Win particles'));
  assert.ok(top('fly to score').includes('Winning symbols jump into the score'));
  assert.ok(top('magnetize').includes('Winning symbols merge into one big symbol'));
  assert.equal(top('load')[0], 'Open project file');
  assert.equal(top('mute')[0], 'Sound on or off');
  assert.ok(top('ae').includes('Export to After Effects'));
  assert.ok(top('jackpot').includes('Big win tiers'));
  // Typos.
  assert.equal(top('shak')[0], 'Screen shake');
  assert.ok(top('magent').includes('Winning symbols merge into one big symbol'));
  assert.ok(top('backgrund').includes('Background image'));
  // The newer controls, in the words people used for them.
  assert.ok(top('zoom', 4).includes('Zoom in on the anticipation reel'));
  assert.ok(top('zoom', 4).some((t) => /^Wheel/.test(t)), 'and the wheel zoom');
  assert.equal(top('ticker')[0].startsWith('Wheel pointer'), true);
  assert.equal(top('no color')[0], 'Segment with no colour');
  assert.ok(top('template').includes('Start from a preset'));
  assert.ok(top('camera push in').includes('Zoom in on the anticipation reel'));
  assert.equal(top('one by one')[0], 'Merge all at once or one by one');
  assert.ok(top('all at once').includes('Merge all at once or one by one'));
  assert.ok(top('continues particles').includes('Particles that keep going'));
  assert.ok(top('particles continually').includes('Particles that keep going'));
  assert.ok(top('hide lines').includes('Draw the winning lines'));
  assert.ok(top('turn off winning lines').includes('Draw the winning lines'));
  assert.ok(top('wind up').some((t) => /flight path/.test(t)));
  assert.ok(top('ambient').includes('Ambient particles'));
  // Filler words do not get in the way.
  assert.equal(top('i want to save my work')[0], 'Save project file');
  assert.equal(top('where they jump to')[0], 'Winning symbols jump into the score');
  // Matches through a synonym say which word matched.
  assert.ok(searchFeatures('confetti')[0].via);
});

test('feature search: empty shows the popular features, nonsense shows nothing', () => {
  assert.deepEqual(searchFeatures('').map((r) => r.feature.title), POPULAR);
  assert.deepEqual(searchFeatures('qqzzxx'), []);
});

test('feature search index points at controls that exist in the editor', () => {
  const app = readFileSync(new URL('../src/js/ui/app.js', import.meta.url), 'utf8');
  const ids = new Set([...app.matchAll(/id: '([a-z0-9-]+)'/g)].map((m) => m[1]));
  // Ids built from a prefix and a value.
  for (const m of app.matchAll(/(?:id: |particleRow\()`([a-z-]+)\$\{/g)) ids.add(`${m[1]}*`);
  const known = (id) => ids.has(id) || [...ids].some((x) => x.endsWith('*') && id.startsWith(x.slice(0, -1)));
  for (const f of FEATURES) {
    const id = f.go.id || f.go.top;
    if (id) assert.ok(known(id), `${f.title}: #${id}`);
    assert.ok(f.title && f.where, f.title);
  }
  assert.ok(FEATURES.length > 100);
  assert.ok(SYNONYMS.every((g) => g.length >= 2));
  assert.equal(new Set(FEATURES.map((f) => f.title)).size, FEATURES.length, 'titles are unique');
});

test('feature search: labels read from the editor join the index', () => {
  const harvested = [
    { title: 'Also tease the last reel to stop', where: 'Round inspector', keys: '', go: { round: ['none'], id: 'ri-tease' } },
    { title: 'Also tease the last reel to stop', where: 'Round inspector', keys: '', go: { round: ['small'], id: 'ri-tease' } },
    // A label of a control the index already lists becomes a search word.
    { title: 'Win meter under the reels', where: 'Machine › Look', keys: 'hud strip under the frame', go: { tab: 'machine', id: 'm-hud' } },
  ];
  const index = buildIndex(harvested);
  const tease = index.filter((f) => f.go.id === 'ri-tease');
  assert.equal(tease.length, 1, 'one entry for every outcome');
  assert.deepEqual(tease[0].go.round, ['none', 'small']);
  assert.equal(searchFeatures('last reel', index)[0].feature.title, 'Also tease the last reel to stop');
  assert.ok(searchFeatures('strip under the frame', index).some((r) => r.feature.go.id === 'm-hud'));
  // The shared index is left as it was.
  assert.ok(!FEATURES.some((f) => f.go.id === 'ri-tease'));
  assert.ok(!/strip/.test(FEATURES.find((f) => f.go.id === 'm-hud').keys));
});
