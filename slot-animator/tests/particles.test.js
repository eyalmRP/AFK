import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProject, candyProject, holdSpinProject, wheelProject, newRound } from '../src/js/core/defaults.js';
import { buildTimeline } from '../src/js/core/timeline.js';
import { computeLayout } from '../src/js/core/layout.js';
import { PARTICLE_TEMPLATES, BUILTIN_PARTICLES, PARTICLE_MOTIONS, LOOP, spawnParticles, particleAt, particleCount, particleAssetInfo, particleTime } from '../src/js/core/particles.js';
import { buildAEData, buildAEScript } from '../src/js/core/ae-export.js';
import { createAE, runScript } from './ae-mock.js';

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

test('particles: continuous templates can run until the next round or to the end, looping', () => {
  const p = project();
  p.particles.medium = { fx: 'rain', asset: 'coin', length: 'round' };
  p.tiers[0].particles = { fx: 'fountain', asset: 'coin', length: 'always' };
  const tl = buildTimeline(p);
  const med = tl.rounds.find((R) => R.outcome === 'medium');
  const [m] = med.pres.particles;
  assert.ok(m.end >= med.next && m.cut >= med.next + 0.4 - 1e-9, 'rains until the next round');
  assert.equal(m.layer, 'over');
  assert.equal(m.main, false);
  const big = tl.rounds.find((R) => R.outcome === 'big');
  const all = big.pres.particles[0];
  assert.deepEqual([all.end, all.cut, all.layer, all.main, all.loop], [tl.duration, tl.duration, 'over', true, LOOP]);
  // Short templates ignore the length: they fire once.
  p.particles.small = { fx: 'burst-s', asset: 'coin', length: 'always' };
  const s = buildTimeline(p).rounds[0].pres.particles[0];
  assert.deepEqual([s.end, s.main, s.loop], [s.start, false, 0]);
});

test('particles: a looping emitter repeats one seamless cycle, and the ambient layer fills the first frame', () => {
  const p = project();
  p.particles.ambient = { fx: 'shimmer', asset: 'sparkle' };
  const tl = buildTimeline(p);
  const amb = tl.emitters.find((e) => e.moment === 'ambient');
  assert.deepEqual([amb.layer, amb.main, amb.loop, amb.end, amb.cut], ['back', true, LOOP, tl.duration, tl.duration]);
  assert.ok(amb.start < 0, 'pre-rolled');
  assert.ok(!tl.rounds.some((R) => R.pres.particles.includes(amb)), 'not tied to a round');
  const L = computeLayout(p);
  const ps = spawnParticles(amb, L, 'glow');
  assert.equal(ps.length, particleCount(amb));
  // Every particle lives less than a cycle and is born inside the first one.
  for (const q of ps) assert.ok(q.l < LOOP && q.b >= amb.start - 1e-9 && q.b < amb.start + LOOP);
  // Cycle k looks exactly like cycle 0.
  const alive = (t) => ps.map((q) => particleAt(q, particleTime(q, t, amb.loop), 'glow'));
  for (const t of [0.4, 2.2, 3.7]) {
    const a = alive(t);
    alive(t + LOOP * 3).forEach((st, i) => {
      assert.equal(!st, !a[i]);
      if (st) for (const k of ['x', 'y', 'rot', 'sx', 'alpha']) assert.ok(Math.abs(st[k] - a[i][k]) < 1e-6, `cycle ${k}`);
    });
  }
  // The screen is never empty: some particles show on the first and last frames.
  for (const t of [0, tl.duration - 0.01]) assert.ok(alive(t).filter((st) => st && st.alpha > 0.05).length > 5, `alive at ${t}`);
  // A long fountain loops too, a short burst does not.
  assert.equal(particleTime({ b: 2 }, 13.5, 5), 3.5);
  assert.equal(particleTime({ b: 2 }, 1, 5), 1);
  assert.equal(particleTime({ b: 2 }, 13.5, 0), 13.5);
});

test('particles: After Effects puts the looping and ambient emitters in the main comp', () => {
  const p = project();
  p.particles.ambient = { fx: 'rain', asset: 'star' };
  p.tiers[0].particles = { fx: 'fountain', asset: 'coin', length: 'always' };
  const tl = buildTimeline(p);
  const L = computeLayout(p);
  const data = buildAEData(p, tl, L, { titleKeys: [] });
  assert.deepEqual(data.mainParticles.map((e) => e.layer).sort(), ['back', 'over']);
  assert.ok(data.rounds.every((R) => (R.particles || []).every((e) => !/Ambient/.test(e.name))), 'main emitters stay out of the rounds');
  const files = new Set(data.particles.assets.flatMap((a) => a.files.map((f) => `/pkg/${f}`)));
  const { env, log } = createAE({ files });
  runScript(buildAEScript([data]), env);
  const main = log.comps.find((c) => c.name === p.name);
  const names = main.layers.list.map((l) => l.name);
  const ambName = data.mainParticles.find((e) => e.layer === 'back').name;
  const fountName = data.mainParticles.find((e) => e.layer === 'over').name;
  assert.ok(/^R03 /.test(fountName), fountName);
  // AE adds layers on top: the ambient emitter sits under the machine, the fountain over it.
  const iAmb = names.indexOf(ambName);
  const iFount = names.indexOf(fountName);
  const iShake = names.indexOf('SCREEN SHAKE');
  assert.ok(iAmb > 0 && iFount >= 0 && iFount < iAmb, names.join(' | '));
  const ambL = main.layers.list[iAmb];
  assert.equal(ambL.parent, main.layers.list[iShake]);
  assert.ok(ambL.startTime < 0 && ambL.inPoint === 0);
  // The particle expressions wrap the age by the cycle, like particleTime.
  const ec = log.comps.find((c) => c.name.startsWith(`Main ${ambName}`));
  const em = data.mainParticles.find((e) => e.layer === 'back');
  const Ly = ec.layers.list[ec.layers.list.length - 1];
  const expr = Ly.property('ADBE Transform Group').property('ADBE Position').expression;
  assert.ok(expr.includes(`a % ${LOOP}`));
  const q = em.ps[0];
  const part = { b: q[0], l: q[1], x: q[2], y: q[3], vx: q[4], vy: q[5], g: q[6], k: q[7], sw: q[13], sf: q[14], ph: q[12] };
  const ev = (time) => new Function('time', `return eval(${JSON.stringify(expr)})`)(time);
  for (const t of [q[0] + 0.3, q[0] + 0.3 + LOOP, q[0] + 0.3 + LOOP * 4]) {
    const want = particleAt(part, particleTime(part, t, LOOP), 'none');
    const got = ev(t - em.start);
    assert.ok(Math.hypot(got[0] - want.x, got[1] - want.y) < 0.05, `cycle at ${t}`);
  }
  // No fade at the end: it runs to the last frame.
  assert.ok(!ambL.property('ADBE Transform Group').property('ADBE Opacity').expression);
});
