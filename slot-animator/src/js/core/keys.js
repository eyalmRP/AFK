// After Effects style 1D keyframes. A key has a value, an incoming and an
// outgoing speed (units per second) and influence (fraction of the segment,
// 0..1), exactly like AE's KeyframeEase. The browser evaluates the same
// cubic Bézier AE draws in its value graph, so a curve exported with
// setTemporalEaseAtKey plays back identically in After Effects.

export function key(t, v, o = {}) {
  return {
    t,
    v,
    inSpeed: o.inSpeed ?? 0,
    inInf: o.inInf ?? 1 / 3,
    outSpeed: o.outSpeed ?? 0,
    outInf: o.outInf ?? 1 / 3,
    hold: !!o.hold,
  };
}

function bez(p0, p1, p2, p3, s) {
  const u = 1 - s;
  return u * u * u * p0 + 3 * u * u * s * p1 + 3 * u * s * s * p2 + s * s * s * p3;
}

function bezD(p0, p1, p2, p3, s) {
  const u = 1 - s;
  return 3 * u * u * (p1 - p0) + 6 * u * s * (p2 - p1) + 3 * s * s * (p3 - p2);
}

// Solve x(s) = target for s in [0, 1], x monotonic (x0 = 0, x3 = 1).
function solveX(x1, x2, target) {
  let s = target;
  for (let i = 0; i < 8; i++) {
    const x = bez(0, x1, x2, 1, s) - target;
    const d = bezD(0, x1, x2, 1, s);
    if (Math.abs(x) < 1e-7) return s;
    if (Math.abs(d) < 1e-6) break;
    s -= x / d;
    if (s < 0 || s > 1) break;
  }
  let lo = 0;
  let hi = 1;
  s = target;
  for (let i = 0; i < 40; i++) {
    const x = bez(0, x1, x2, 1, s);
    if (Math.abs(x - target) < 1e-7) break;
    if (x < target) lo = s;
    else hi = s;
    s = (lo + hi) / 2;
  }
  return s;
}

export function normInf(a, b) {
  let oi = Math.min(1, Math.max(0.001, a.outInf));
  let ii = Math.min(1, Math.max(0.001, b.inInf));
  const sum = oi + ii;
  if (sum > 1) {
    oi /= sum;
    ii /= sum;
  }
  return [oi, ii];
}

function evalSeg(a, b, t) {
  if (a.hold) return a.v;
  const dt = b.t - a.t;
  if (dt <= 1e-9) return b.v;
  const [oi, ii] = normInf(a, b);
  const y0 = a.v;
  const y1 = a.v + a.outSpeed * oi * dt;
  const y2 = b.v - b.inSpeed * ii * dt;
  const y3 = b.v;
  const s = solveX(oi, 1 - ii, (t - a.t) / dt);
  return bez(y0, y1, y2, y3, s);
}

function findSeg(keys, t) {
  let lo = 0;
  let hi = keys.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].t <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function evalKeys(keys, t) {
  const n = keys.length;
  if (!n) return 0;
  if (t <= keys[0].t) return keys[0].v;
  if (t >= keys[n - 1].t) return keys[n - 1].v;
  const i = findSeg(keys, t);
  return evalSeg(keys[i], keys[i + 1], t);
}

export function evalVelocity(keys, t, h = 1 / 480) {
  return (evalKeys(keys, t + h) - evalKeys(keys, t - h)) / (2 * h);
}

export function lastKey(keys) {
  return keys[keys.length - 1];
}

// Append keys, merging a new key that lands on the time of the previous one.
export function pushKeys(target, keys) {
  for (const k of keys) {
    const prev = target[target.length - 1];
    if (prev && Math.abs(prev.t - k.t) < 1e-6) {
      prev.v = k.v;
      prev.outSpeed = k.outSpeed;
      prev.outInf = k.outInf;
      prev.hold = k.hold;
    } else if (!prev || k.t > prev.t) {
      target.push({ ...k });
    }
  }
  return target;
}
