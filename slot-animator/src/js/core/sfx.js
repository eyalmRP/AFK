// The sound cues as separate clips, for the After Effects SFX comp. Cues with
// the same type and parameters sound the same, so they share one rendered
// clip: five reel stops (one per pan position) serve every spin.

import { SOUND_EVENTS } from './defaults.js';

const META = Object.fromEntries(SOUND_EVENTS.map((e) => [e.id, e]));

// Mix groups in the order the SFX comp lists them, with After Effects label
// colours (8 blue, 9 green, 2 yellow, 1 red, 10 purple).
export const SFX_GROUPS = [
  { id: 'reels', name: 'Reels', label: 8 },
  { id: 'wins', name: 'Wins', label: 9 },
  { id: 'coins', name: 'Coins', label: 2 },
  { id: 'bigwin', name: 'Big Win', label: 1 },
  { id: 'ui', name: 'UI', label: 10 },
];

const r3 = (x) => (x == null ? '' : Math.round(x * 1000) / 1000);

export function cueKey(e) {
  return [e.type, r3(e.dur), r3(e.pan), e.step ?? '', e.n ?? '', e.i ?? '', e.value ?? '', e.big ? 1 : '', e.special ? 1 : ''].join('|');
}

export function sfxGroup(type) {
  return META[type]?.group || 'ui';
}

export function sfxCues(tl) {
  const clips = [];
  const byKey = new Map();
  const perType = {};
  const events = [];
  const list = tl.sfx.filter((e) => e.t >= 0 && e.t < tl.duration).sort((a, b) => a.t - b.t);
  for (const e of list) {
    const key = cueKey(e);
    let clip = byKey.get(key);
    if (clip == null) {
      perType[e.type] = (perType[e.type] || 0) + 1;
      clip = clips.length;
      byKey.set(key, clip);
      clips.push({ key, type: e.type, n: perType[e.type], cue: { ...e, t: 0 } });
    }
    const R = tl.rounds.find((r) => e.t >= r.t0 - 1e-6 && e.t < r.next - 1e-6);
    events.push({ t: e.t, clip, type: e.type, group: sfxGroup(e.type), label: META[e.type]?.label || e.type, round: R ? R.index : -1 });
  }
  return { clips, events };
}

// Linear gain to decibels for After Effects' Audio Levels (silence at -96).
export function toDb(g) {
  const v = Number(g);
  return v > 0.0000158 ? Math.round(20 * Math.log10(v) * 100) / 100 : -96;
}
