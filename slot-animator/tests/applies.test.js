import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APPLIES, notApplying } from '../src/js/ui/applies.js';

const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

test('what applies: every listed control and section exists in the editor', () => {
  const app = readFileSync(new URL('../src/js/ui/app.js', import.meta.url), 'utf8');
  const ids = new Set([...app.matchAll(/id: '([a-z0-9-]+)'/g)].map((m) => m[1]));
  for (const k of ['freespins', 'retrigger', 'total', 'bonus', 'wheel', 'nearmiss', 'holdspin', 'grand']) ids.add(`fx-t-${k}`);
  const titles = new Set([...app.matchAll(/section\(\s*'([^']+)'/g)].map((m) => slug(m[1])));
  titles.add('winning-symbols');
  for (const key of Object.keys(APPLIES)) {
    if (key.includes('/')) assert.ok(titles.has(key.split('/')[1]), `section ${key}`);
    else assert.ok(ids.has(key), `control #${key}`);
  }
});

test('what applies: by game, and by spin style on the slot machine only', () => {
  assert.equal(notApplying('machine/reels', 'slot', 'classic'), null);
  assert.equal(notApplying('machine/reels', 'wheel', 'classic'), 'Not used in Wheel only');
  assert.equal(notApplying('machine/how-it-pays', 'holdspin', 'classic'), 'Not used in Hold & Spin');
  assert.equal(notApplying('spin/start', 'slot', 'cascade'), 'Not used with cascade drop spins');
  assert.equal(notApplying('spin/start', 'holdspin', 'cascade'), null, 'Hold & Spin respins have their own spin');
  assert.equal(notApplying('m-row-lines', 'slot', 'cells'), 'Not used with per-cell spins');
  assert.equal(notApplying('fx-shake', 'wheel', 'classic'), null, 'not listed: applies everywhere');
});
