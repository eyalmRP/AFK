// Progressive jackpot boxes: their values (fixed or running), where they
// stand around the machine, and what wins them on the machine.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProject, slotHoldSpinProject, slotWheelProject, jackpotsProject, newRound, AGAIN_SEGMENT } from '../src/js/core/defaults.js';
import { buildTimeline } from '../src/js/core/timeline.js';
import { computeLayout } from '../src/js/core/layout.js';
import { evalKeys } from '../src/js/core/keys.js';
import { holdSpinConfig } from '../src/js/core/coins.js';
import { jackpotsConfig, jackpotLedger, jackpotValue, wheelJackpot, JP_HOLD } from '../src/js/core/jackpots.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const withBoxes = (p, extra = {}) => {
  Object.assign(p.jackpots, { enabled: true, ...extra });
  return p;
};
const plain = (L) => JSON.stringify(L, (k, v) => (typeof v === 'function' || k === 'wheel' ? undefined : v));

test('boxes: off by default; their tiers and values are the Hold & Spin jackpots', () => {
  const p = defaultProject();
  assert.equal(jackpotsConfig(p).on, false);
  assert.equal(computeLayout(p).jackpots, null);
  assert.equal(buildTimeline(p).jackpots, null);
  withBoxes(p);
  p.machine.bet = 2;
  const cfg = jackpotsConfig(p);
  assert.deepEqual(cfg.tiers.map((t) => t.id), ['grand', 'major', 'minor', 'mini']);
  assert.deepEqual(cfg.tiers.map((t) => t.base), [2000, 500, 200, 100]);
  assert.deepEqual(cfg.tiers.map((t) => t.label), ['GRAND', 'MAJOR', 'MINOR', 'MINI']);
  p.jackpots.count = 3;
  assert.deepEqual(jackpotsConfig(p).tiers.map((t) => t.id), ['grand', 'major', 'minor']);
  p.jackpots.count = 2;
  assert.deepEqual(jackpotsConfig(p).tiers.map((t) => t.id), ['grand', 'major']);
  // Two or three boxes stand on one side.
  p.jackpots.place = 'sides';
  assert.equal(jackpotsConfig(p).place, 'left');
  // The pots stand above: boxes go below.
  p.jackpots.count = 4;
  p.jackpots.place = 'above';
  p.pots.enabled = true;
  assert.equal(jackpotsConfig(p).place, 'below');
  // Wheel only has no machine to stand around.
  const w = withBoxes(defaultProject());
  w.game = 'wheel';
  assert.equal(jackpotsConfig(w).on, false);
});

test('fixed boxes never change; running boxes climb, hold what they paid, then start again', () => {
  const p = withBoxes(defaultProject());
  const fixed = jackpotsConfig(p);
  const lf = jackpotLedger(fixed);
  assert.equal(lf.award('major', 30), 250);
  assert.equal(jackpotValue(fixed, lf.hits, 'major', 31), 250);
  assert.equal(jackpotValue(fixed, lf.hits, 'major', 60), 250);
  p.jackpots.running = true;
  p.jackpots.growth = 0.2;
  const run = jackpotsConfig(p);
  const l = jackpotLedger(run);
  assert.ok(near(jackpotValue(run, [], 'grand', 10), 1000 + 1000 * 0.002 * 10));
  const paid = l.award('grand', 10);
  assert.ok(near(paid, 1020, 0.01));
  assert.equal(jackpotValue(run, l.hits, 'grand', 10 + JP_HOLD * 0.5), paid, 'holds what it paid');
  assert.ok(near(jackpotValue(run, l.hits, 'grand', 10 + JP_HOLD), 1000), 'back to its seed');
  assert.ok(jackpotValue(run, l.hits, 'grand', 20) > 1000 && jackpotValue(run, l.hits, 'grand', 20) < paid);
  // A second win pays from the seed again.
  assert.ok(near(l.award('grand', 20), 1000 + 2 * (20 - 10 - JP_HOLD), 0.01));
  // Other boxes run on their own.
  assert.ok(near(jackpotValue(run, l.hits, 'mini', 20), 50 + 50 * 0.002 * 20));
});

test('layout: room on the boxes\' side, rows on the edge next to the machine, padding and spacing', () => {
  const base = defaultProject();
  const a = computeLayout(base);
  // Above: a row over the frame, bottoms on one line, the machine smaller.
  const p = withBoxes(defaultProject(), { place: 'above', padding: 0.2, spacing: 0.15 });
  const L = computeLayout(p);
  assert.ok(L.cellW < a.cellW);
  const u = L.cellW;
  L.jackpots.forEach((b) => assert.ok(near(b.y + b.h / 2, L.frame.y - 0.2 * u, 1), `${b.id} sits on the padding line`));
  for (let i = 1; i < 4; i++) assert.ok(near(L.jackpots[i].x - L.jackpots[i].w / 2 - (L.jackpots[i - 1].x + L.jackpots[i - 1].w / 2), 0.15 * u, 1), 'spacing');
  const mid = (L.jackpots[0].x - L.jackpots[0].w / 2 + L.jackpots[3].x + L.jackpots[3].w / 2) / 2;
  assert.ok(near(mid, L.frame.x + L.frame.w / 2, 1), 'the row is centred over the machine');
  // Sized by tier, or all the same.
  assert.ok(L.jackpots[0].w > L.jackpots[1].w && L.jackpots[2].w > L.jackpots[3].w);
  p.jackpots.sizing = 'same';
  const S = computeLayout(p);
  assert.ok(S.jackpots.every((b) => near(b.w, S.jackpots[0].w, 0.5)));
  // Negative padding tucks them over the frame.
  p.jackpots.padding = -0.3;
  const N = computeLayout(p);
  assert.ok(N.jackpots.every((b) => b.y + b.h / 2 > N.frame.y));
  // Left: a column beside the frame, the machine moved right to make room.
  const left = computeLayout(withBoxes(defaultProject(), { place: 'left' }));
  assert.ok(left.jackpots.every((b) => b.x + b.w / 2 < left.frame.x && b.x - b.w / 2 >= 0));
  assert.ok(left.frame.x + left.frame.w / 2 > base.canvas.width / 2);
  // Four can split, two on each side.
  const sides = computeLayout(withBoxes(defaultProject(), { place: 'sides' }));
  assert.deepEqual(sides.jackpots.map((b) => b.side), ['left', 'right', 'left', 'right']);
  const ends = computeLayout(withBoxes(defaultProject(), { place: 'ends' }));
  assert.deepEqual(ends.jackpots.map((b) => b.side), ['above', 'above', 'below', 'below']);
  assert.ok(ends.hud.y > Math.max(...ends.jackpots.map((b) => b.y + b.h / 2)), 'the win meter sits under the boxes below');
  // Everything stays on screen, in every place, landscape and portrait.
  for (const place of ['above', 'below', 'left', 'right', 'sides', 'ends'])
    for (const [w, h] of [[1920, 1080], [1080, 1920], [1080, 1080]]) {
      const q = withBoxes(defaultProject(), { place });
      q.canvas = { ...q.canvas, width: w, height: h };
      const Q = computeLayout(q);
      for (const b of Q.jackpots) assert.ok(b.x - b.w / 2 >= -1 && b.x + b.w / 2 <= w + 1 && b.y - b.h / 2 >= -1 && b.y + b.h / 2 <= h + 1, `${place} ${w}x${h} ${b.id}`);
    }
  // Off, the layout is exactly as before.
  const off = withBoxes(defaultProject());
  off.jackpots.enabled = false;
  assert.equal(plain(computeLayout(off)), plain(a));
});

test('Hold & Spin: a jackpot coin blinks its box as it lands and pays what the box shows when collected; a full board wins the Grand', () => {
  const p = withBoxes(slotHoldSpinProject(), { running: true });
  const tl = buildTimeline(p);
  const cfg = jackpotsConfig(p);
  const R = tl.rounds.find((r) => r.outcome === 'collect');
  const jpItems = R.pres.collect.items.filter((it) => it.jackpot);
  assert.ok(jpItems.length >= 1);
  for (const it of jpItems) {
    const hit = tl.jackpots.hits.find((h) => h.tier === it.jackpot && h.t === it.at);
    assert.ok(hit, 'the box is won as its coin is collected');
    assert.equal(it.value, hit.amount);
    assert.ok(near(hit.amount, cfg.tiers.find((t) => t.id === it.jackpot).base * (1 + 0.0015 * it.at), 0.02));
  }
  assert.ok(near(R.pres.collect.total, R.pres.collect.items.reduce((a, it) => a + it.value, 0) + (R.pres.grand?.amount || 0), 0.01));
  assert.ok(tl.jackpots.blinks.some((b) => b.tier === 'mini'), 'the Mini blinks as its coin lands');
  // Fill the board: the Grand box pays.
  const q = withBoxes(slotHoldSpinProject());
  q.rounds.splice(q.rounds.length - 1, 0, newRound('respin', { seed: 9, fill: true }));
  const tq = buildTimeline(q);
  const grand = tq.rounds.find((r) => r.outcome === 'collect').pres.grand;
  assert.ok(grand, 'full board');
  assert.ok(tq.jackpots.hits.some((h) => h.tier === 'grand' && h.kind === 'grand' && h.amount === grand.amount));
});

test('wheel: a segment linked to a box (JACKPOT by its label) pays what the box shows', () => {
  const p = withBoxes(slotWheelProject(), { running: true });
  const cfg = jackpotsConfig(p);
  const jackpotSeg = p.wheel.segments.findIndex((s) => /JACKPOT/.test(s.label));
  assert.equal(wheelJackpot(cfg, p.wheel.segments[jackpotSeg]), 'grand');
  assert.equal(wheelJackpot(cfg, { ...p.wheel.segments[jackpotSeg], jackpot: 'none' }), null);
  assert.equal(wheelJackpot(cfg, { label: '500', jackpot: 'major' }), 'major');
  p.rounds = [newRound('wheel', { seed: 3, wheelSegment: jackpotSeg })];
  const tl = buildTimeline(p);
  const R = tl.rounds[0];
  const hit = tl.jackpots.hits[0];
  assert.equal(hit.tier, 'grand');
  assert.equal(R.win.amount, hit.amount);
  assert.equal(R.pres.wheel.amount, hit.amount);
  assert.ok(near(hit.t, R.pres.wheel.spinEnd + 0.25));
  // Spin again first, then the jackpot.
  p.rounds = [newRound('wheel', { seed: 3, wheelSegment: AGAIN_SEGMENT, wheelThen: jackpotSeg })];
  assert.equal(buildTimeline(p).jackpots.hits.length, 1);
});

test('a round can award a box: it lights up, its amount flies to the meter and counts on top of the win', () => {
  const p = withBoxes(jackpotsProject());
  const tl = buildTimeline(p);
  const R = tl.rounds.find((r) => r.pres.jackpot);
  const j = R.pres.jackpot;
  assert.equal(j.tier, 'minor');
  assert.ok(near(j.amount, jackpotsConfig(p).tiers.find((t) => t.id === 'minor').base * (1 + 0.0015 * j.at), 0.01), 'pays what the running box shows');
  const before = evalKeys(tl.meterKeys, j.countStart - 0.01);
  assert.ok(near(evalKeys(tl.meterKeys, j.countEnd + 0.01), before + j.amount, 0.01));
  assert.ok(R.end >= j.end && j.at >= R.pres.start);
  assert.ok(tl.sfx.some((e) => e.type === 'jackpot' && near(e.t, j.at)));
  // A jackpot for a box that is not shown is ignored.
  p.jackpots.count = 2;
  assert.ok(!buildTimeline(p).rounds.some((r) => r.pres.jackpot));
  // Boxes off: nothing changes.
  p.jackpots.enabled = false;
  const off = buildTimeline(p);
  assert.equal(off.jackpots, null);
  assert.ok(!off.rounds.some((r) => r.pres.jackpot));
});

test('a Major jackpot takes the whole screen: the collect waits for it and counts it in; a round award shows it instead of the flight', () => {
  const p = withBoxes(jackpotsProject());
  const tl = buildTimeline(p);
  const R = tl.rounds.find((r) => r.outcome === 'collect');
  const items = R.pres.collect.items;
  const k = items.findIndex((it) => it.jackpot === 'major');
  assert.ok(k >= 0, 'the preset collects a Major coin');
  const [sh] = R.pres.jpShows;
  assert.equal(R.pres.jpShows.length, 1);
  assert.equal(sh.tier, 'major');
  assert.equal(sh.amount, items[k].value);
  assert.ok(near(sh.start, items[k].arrive + 0.15));
  assert.ok(sh.start < sh.countStart && sh.countStart < sh.countEnd && sh.countEnd < sh.end);
  assert.ok(items.slice(k + 1).every((it) => it.at > sh.end), 'the next coins wait');
  assert.ok(R.pres.collect.end > sh.end, 'and the total');
  const before = items.slice(0, k).reduce((a, it) => a + it.value, 0);
  assert.ok(near(evalKeys(tl.hold.collectKeys, sh.countStart - 0.01), before, 0.01), 'nothing counted before the moment');
  assert.ok(near(evalKeys(tl.hold.collectKeys, sh.countEnd + 0.01), before + sh.amount, 0.01));
  assert.ok(near(evalKeys(sh.keys, sh.countEnd), sh.amount, 0.01));
  assert.ok(tl.sfx.some((e) => e.type === 'bigWin' && near(e.t, sh.start)));
  // Other tiers celebrate on their box only.
  assert.ok(!tl.rounds.some((r) => r.pres.jpShows?.some((s) => s.tier !== 'major')));
  // A round awarding the Major: the moment, no flight; the meter counts with it.
  const q = withBoxes(jackpotsProject());
  q.rounds.find((r) => r.jackpot === 'minor').jackpot = 'major';
  const tq = buildTimeline(q);
  const Q = tq.rounds.find((r) => r.pres.jackpot);
  const j = Q.pres.jackpot;
  assert.equal(j.fly, null);
  assert.equal(Q.pres.jpShows[0].tier, 'major');
  assert.equal(j.countStart, Q.pres.jpShows[0].countStart);
  const m0 = evalKeys(tq.meterKeys, j.countStart - 0.01);
  assert.ok(near(evalKeys(tq.meterKeys, j.countEnd + 0.01), m0 + j.amount, 0.01));
  assert.ok(Q.end >= Q.pres.jpShows[0].end);
});

test('jackpot coins show only their name; uploaded box art rides on the tier', () => {
  const p = withBoxes(jackpotsProject());
  const tl = buildTimeline(p);
  const cfg = jackpotsConfig(p);
  const hs = holdSpinConfig(p).coins;
  // Every coin linked to a shown box, and only those.
  assert.deepEqual(tl.jackpots.coinSyms.length, hs.filter((c) => cfg.tiers.some((t) => t.id === c.id)).length);
  p.jackpots.count = 2;
  const two = buildTimeline(p).jackpots.coinSyms;
  assert.equal(two.length, hs.filter((c) => ['grand', 'major'].includes(c.id)).length);
  // Box art: per tier, names on it by default.
  assert.equal(cfg.artNames, true);
  assert.ok(cfg.tiers.every((t) => !t.art));
  p.jackpots.count = 4;
  p.jackpots.art = { major: 'data:image/png;base64,AAAA' };
  p.jackpots.artNames = false;
  const c2 = jackpotsConfig(p);
  assert.equal(c2.tiers.find((t) => t.id === 'major').art, 'data:image/png;base64,AAAA');
  assert.ok(c2.tiers.filter((t) => t.id !== 'major').every((t) => !t.art));
  assert.equal(c2.artNames, false);
});
