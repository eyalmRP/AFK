import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchFeatures, FEATURES, SYNONYMS, POPULAR } from '../src/js/ui/search.js';

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
  for (const m of app.matchAll(/id: `([a-z-]+)\$\{/g)) ids.add(`${m[1]}*`);
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
