// Deterministic randomness. Every random choice in a project flows from
// a seed, so the same project always renders the same frames, and the
// After Effects export matches the browser preview.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= 0x9e3779b9;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// Stateless hash in [0, 1) for particles: hash01(i, salt) never changes.
export function hash01(i, salt = 0) {
  const x = Math.sin(i * 12.9898 + salt * 78.233 + salt * i * 0.017) * 43758.5453;
  return x - Math.floor(x);
}

export function pickWeighted(rng, indices, weightOf) {
  if (!indices.length) return 0;
  let total = 0;
  for (const i of indices) total += Math.max(0, weightOf(i));
  if (total <= 0) return indices[Math.floor(rng() * indices.length)];
  let r = rng() * total;
  for (const i of indices) {
    r -= Math.max(0, weightOf(i));
    if (r < 0) return i;
  }
  return indices[indices.length - 1];
}

export function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
