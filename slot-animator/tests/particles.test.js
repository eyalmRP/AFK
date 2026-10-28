import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProject, candyProject, holdSpinProject, wheelProject, newRound } from '../src/js/core/defaults.js';
import { buildTimeline } from '../src/js/core/timeline.js';
import { computeLayout } from '../src/js/core/layout.js';
import { PARTICLE_TEMPLATES, BUILTIN_PARTICLES, PARTICLE_MOTIONS, spawnParticles, particleAt, particleCount, particleAssetInfo } from '../src/js/core/particles.js';

function project() {
  const p = defaultProject();
  p.rounds = [newRound('small', { seed: 1 }), newRound('medium', { seed: 2 }), newRound('big', { seed: 3, tier: 2 }), newRound('freespins', { seed: 4 }), newRound('bonus', { seed: 5 })];
  return p;
}

test('particles: every win moment gets its emitters, in its own time window', () => {
  const p = project();
  const tl = buildTimeline(p);
  const by = (o) => tl.rounds.find((R) => R.outcome === o).pres.particles;
  const small = by('small');
  assert.ok(small.length >= 1);
  assert.ok(small.every((e) => e.moment === 'small' && e.fx === 'burst-s' && e.asset === 'sparkle' && e.focus.kind === 'cells' && e.layer === 'over'));
  assert.deepEqual(by('medium').map((e) => [e.moment, e.fx]), [['medium', 'burst-m']]);
  // A big win stacks one emitter per tier it reaches, each from its tier time.
  const R = tl.rounds.find((x) => x.outcome === 'big');
  const big = R.pres.particles;
  assert.equal(big.length, R.pres.overlay.tiers.length);
  assert.deepEqual(big.map((e) => e.fx), p.tiers.slice(0, big.length).map((t) => t.particles.fx));
  big.forEach((e, k) => {
    if (k > 0) assert.equal(e.start, R.pres.overlay.tierTimes[k]);
    assert.equal(e.layer, 'under');
    assert.ok(e.cut <= R.pres.overlay.end + 1e-9);
  });
  // Continuous templates emit until the count ends; short ones fire once.
  assert.ok(big[0].end > big[0].start + 1);
  assert.equal(small[0].end, small[0].start);
  assert.deepEqual(by('freespins').map((e) => [e.moment, e.fx, e.asset]), [['feature', 'cannons', 'confetti']]);
  assert.deepEqual(by('bonus').map((e) => e.moment), ['feature']);
  assert.equal(tl.emitters.length, tl.rounds.reduce((n, x) => n + x.pres.particles.length, 0));
  for (const e of tl.emitters) assert.ok(e.cut > e.start && e.end >= e.start, e.id);
});

test('particles: a round can override the template and the particle, or switch them off', () => {
  const p = project();
  p.rounds[0].particles = { fx: 'ring', asset: 'gem' };
  p.rounds[2].particles = { fx: 'spiral', asset: 'auto' };
  p.rounds[3].particles = { fx: 'none', asset: 'auto' };
  p.rounds[1].particles = { fx: 'auto', asset: 'confetti' };
  const tl = buildTimeline(p);
  assert.ok(tl.rounds[0].pres.particles.every((e) => e.fx === 'ring' && e.asset === 'gem'));
  assert.deepEqual(tl.rounds[2].pres.particles.map((e) => [e.fx, e.asset]), [['spiral', p.tiers[0].particles.asset]]);
  assert.deepEqual(tl.rounds[3].pres.particles, []);
  assert.deepEqual(tl.rounds[1].pres.particles.map((e) => [e.fx, e.asset]), [['burst-m', 'confetti']]);
  // Settings that pick "none" leave that moment empty.
  const q = project();
  q.particles.small = { fx: 'none', asset: 'coin' };
  assert.deepEqual(buildTimeline(q).rounds[0].pres.particles, []);
});

test('particles: Hold & Spin collects, grands and the wheel game get theirs', () => {
  const hs = buildTimeline(holdSpinProject());
  const moments = new Set(hs.emitters.map((e) => e.moment));
  assert.ok(moments.has('total'), 'collect total');
  assert.ok(moments.has('grand'));
  // The collect total climbs through the tiers: total first, then each tier.
  const col = hs.rounds.find((R) => R.outcome === 'collect');
  const ov = col.pres.overlay;
  assert.deepEqual(col.pres.particles.filter((e) => e.moment !== 'grand').map((e) => e.moment), ov.tiers.map((id) => (id === 'total' ? 'total' : 'tier')));
  const wh = buildTimeline(wheelProject());
  assert.ok(wh.emitters.length >= wh.rounds.length);
  assert.ok(wh.emitters.every((e) => e.moment === 'wheel' && e.focus.kind === 'wheel'));
  const candy = buildTimeline(candyProject());
  assert.ok(candy.emitters.some((e) => e.moment === 'small' && e.asset === 'star'));
});

test('particles: every template spawns deterministic particles that move and fade on screen', () => {
  const p = project();
  const L = computeLayout(p);
  for (const tpl of PARTICLE_TEMPLATES) {
    const em = { fx: tpl.id, start: 1, end: tpl.kind === 'short' ? 1 : 4, focus: { kind: 'screen' }, seed: 1234 };
    for (const motion of PARTICLE_MOTIONS.map((m) => m.id)) {
      const a = spawnParticles(em, L, motion);
      const b = spawnParticles(em, L, motion);
      assert.deepEqual(a, b, `${tpl.id} is deterministic`);
      assert.equal(a.length, particleCount(em));
      assert.ok(a.length >= 12 && a.length <= 140, `${tpl.id} count ${a.length}`);
      for (const q of a) {
        assert.ok(q.b >= em.start - 1e-9 && q.b <= em.end + 1.2, `${tpl.id} birth ${q.b}`);
        assert.ok(q.l > 0.3 && q.s > 0);
        assert.equal(particleAt(q, q.b - 0.01, motion), null);
        assert.equal(particleAt(q, q.b + q.l + 0.01, motion), null);
        for (const f of [0.1, 0.5, 0.9]) {
          const st = particleAt(q, q.b + q.l * f, motion);
          for (const v of [st.x, st.y, st.rot, st.sx, st.sy, st.alpha]) assert.ok(Number.isFinite(v), `${tpl.id}/${motion} finite`);
          assert.ok(st.alpha >= 0 && st.alpha <= 1);
        }
      }
      // Most particles are on screen at some point of their life.
      const seen = a.filter((q) => [0.2, 0.4, 0.6].some((f) => {
        const st = particleAt(q, q.b + q.l * f, motion);
        return st.x > -L.cellW && st.x < L.W + L.cellW && st.y > -L.cellH && st.y < L.H + L.cellH;
      })).length;
      assert.ok(seen / a.length > 0.7, `${tpl.id}/${motion}: ${seen}/${a.length} on screen`);
    }
  }
  // Short bursts start together; continuous ones spread over the window.
  const burst = spawnParticles({ fx: 'burst-m', start: 2, end: 2, focus: { kind: 'screen' }, seed: 9 }, L);
  assert.ok(Math.max(...burst.map((q) => q.b)) - 2 < 0.2);
  const rain = spawnParticles({ fx: 'rain', start: 2, end: 6, focus: { kind: 'screen' }, seed: 9 }, L);
  assert.ok(Math.max(...rain.map((q) => q.b)) > 5.5);
  // The magnet lands every particle on its focus.
  const mg = spawnParticles({ fx: 'magnet', start: 0, end: 0, focus: { kind: 'screen' }, seed: 3 }, L, 'none');
  for (const q of mg) {
    const st = particleAt(q, q.b + q.l - 1e-6, 'none');
    assert.ok(Math.hypot(st.x - L.W / 2, st.y - L.H * 0.42) < 1, 'lands on the focus');
  }
  // The amount scales the count.
  assert.equal(particleCount({ fx: 'burst-l', start: 0, end: 0 }, 0.5), 48);
});

test('particles: asset info for built-ins and uploads', () => {
  const p = defaultProject();
  for (const b of BUILTIN_PARTICLES) assert.equal(particleAssetInfo(p, b.id).count, b.variants);
  p.particles.assets.push({ id: 'u1', name: 'Spin coin', kind: 'sheet', src: 'x', cols: 8, rows: 1, count: 8, fps: 30, motion: 'none' });
  p.particles.assets.push({ id: 'u2', name: 'Bill', kind: 'image', src: 'y', motion: 'flutter' });
  assert.deepEqual([particleAssetInfo(p, 'u1').anim, particleAssetInfo(p, 'u1').count, particleAssetInfo(p, 'u1').fps], [true, 8, 30]);
  assert.deepEqual([particleAssetInfo(p, 'u2').anim, particleAssetInfo(p, 'u2').motion], [false, 'flutter']);
  assert.equal(particleAssetInfo(p, 'missing').id, 'coin');
});
