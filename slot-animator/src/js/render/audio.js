// The sound track: every cue the timeline emits (reel stops, anticipation,
// tumble pops, count-up ticks, big win stings, coins, wheel pegs) is
// synthesised offline with Web Audio into one buffer, so it lines up with the
// animation to the sample. Any cue can be replaced by an uploaded sound.

import { SOUND_EVENTS } from '../core/defaults.js';
import { mulberry32, hash01 } from '../core/rng.js';

const GROUP_OF = Object.fromEntries(SOUND_EVENTS.map((e) => [e.id, e.group]));
const SR = 48000;

export async function decodeCustomSounds(project) {
  const out = new Map();
  const custom = project.sound?.custom || {};
  const entries = Object.entries(custom).filter(([, v]) => v);
  if (!entries.length) return out;
  const ac = new OfflineAudioContext(2, 1, SR);
  for (const [id, src] of entries) {
    try {
      const buf = await (await fetch(src)).arrayBuffer();
      out.set(id, await ac.decodeAudioData(buf));
    } catch {
      // A file the browser cannot decode is skipped; the synth plays instead.
    }
  }
  return out;
}

// Cues are rendered in short chunks, each in its own small offline context,
// then overlap-added and run once through the master gain and compressor.
// One context for the whole track would keep every voice's nodes alive for
// the full length, which makes long tracks render many times slower.
const CHUNK = 4;
let NOISE = null;

function noiseData() {
  if (!NOISE) {
    const rng = mulberry32(99);
    NOISE = new Float32Array(SR * 2);
    for (let i = 0; i < NOISE.length; i++) NOISE[i] = rng() * 2 - 1;
  }
  return NOISE;
}

// How long each synth cue rings after its start (plus its own duration).
const TAIL = { bigWin: 2.9, fsTrigger: 2.2, scatter: 1.2, wheelLand: 1.2, countEnd: 1.0, tierUp: 0.9, expand: 0.9, mult: 0.9, nearMiss: 0.8, coinLand: 0.8, respinReset: 0.6 };

function tailOf(e, custom) {
  const buf = custom.get(e.type);
  if (buf) return Math.max(e.dur || 0, buf.duration) + 0.1;
  // The riser swells for most of its duration, then rings out as long again.
  if (e.type === 'anticipation') return Math.max(0.3, e.dur || 0) * 1.9 + 0.1;
  return (e.dur || 0) + (TAIL[e.type] || 0.6);
}

export async function renderSoundtrack(tl, project, custom = new Map()) {
  const sound = project.sound || {};
  const total = Math.max(1, Math.ceil(tl.duration * SR));
  const mix = [new Float32Array(total), new Float32Array(total)];
  const events = tl.sfx.filter((e) => e.t >= 0 && e.t < tl.duration);
  for (let a = 0; a < tl.duration; a += CHUNK) {
    const list = events.filter((e) => e.t >= a && e.t < a + CHUNK);
    if (!list.length) continue;
    const start = Math.floor(a * SR);
    const span = Math.max(CHUNK, ...list.map((e) => e.t - a + tailOf(e, custom)));
    const length = Math.min(total - start, Math.ceil(span * SR));
    if (length <= 0) continue;
    const buf = await renderChunk(list, start / SR, length, sound, custom);
    for (let c = 0; c < 2; c++) {
      const src = buf.getChannelData(c);
      const dst = mix[c];
      for (let i = 0; i < src.length; i++) dst[start + i] += src[i];
    }
  }
  const ac = new OfflineAudioContext(2, total, SR);
  const stems = ac.createBuffer(2, total, SR);
  stems.copyToChannel(mix[0], 0);
  stems.copyToChannel(mix[1], 1);
  const src = ac.createBufferSource();
  src.buffer = stems;
  const master = ac.createGain();
  master.gain.value = sound.enabled === false ? 0 : Number(sound.volume ?? 0.8);
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  src.connect(master).connect(comp).connect(ac.destination);
  src.start(0);
  return ac.startRendering();
}

function renderChunk(list, offset, length, sound, custom) {
  const ac = new OfflineAudioContext(2, length, SR);
  const groups = {};
  for (const g of ['reels', 'wins', 'coins', 'bigwin', 'ui']) {
    groups[g] = ac.createGain();
    groups[g].gain.value = Number(sound.mix?.[g] ?? 1);
    groups[g].connect(ac.destination);
  }
  const noiseBuf = ac.createBuffer(1, SR * 2, SR);
  noiseBuf.copyToChannel(noiseData(), 0);

  const dest = (e) => {
    const g = groups[GROUP_OF[e.type] || 'ui'];
    if (e.pan == null) return g;
    const p = ac.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, e.pan * 0.7));
    p.connect(g);
    return p;
  };
  const envGain = (t, a, peak, d, out) => {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    g.connect(out);
    return g;
  };
  const tone = (type, f0, t, d, out, gain, o = {}) => {
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.glide || d));
    const g = envGain(t, o.attack ?? 0.004, gain, d, out);
    osc.connect(g);
    osc.start(t);
    osc.stop(t + (o.attack ?? 0.004) + d + 0.05);
  };
  const noise = (t, d, out, gain, o = {}) => {
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.Q.value = o.q ?? 1.2;
    f.frequency.setValueAtTime(o.f0 || 1000, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + d);
    const g = envGain(t, o.attack ?? 0.005, gain, d, out);
    src.connect(f).connect(g);
    src.start(t, hash01(Math.round((t + offset) * 1000), 3) * 1.5);
    src.stop(t + (o.attack ?? 0.005) + d + 0.05);
  };
  const sample = (buf, t, out, dur) => {
    const src = ac.createBufferSource();
    src.buffer = buf;
    if (dur && dur > buf.duration) src.loop = true;
    src.connect(out);
    src.start(t);
    if (dur) src.stop(t + Math.max(dur, 0.05));
  };
  const semis = (f, n) => f * Math.pow(2, n / 12);

  const SYNTH = {
    spinStart(e, o) {
      noise(e.t, 0.28, o, 0.35, { f0: 300, f1: 2400 });
      tone('sine', 180, e.t, 0.2, o, 0.12, { f1: 360 });
    },
    spinLoop(e, o) {
      const d = Math.max(0.2, e.dur);
      const src = ac.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 320;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, e.t);
      g.gain.linearRampToValueAtTime(0.22, e.t + 0.15);
      g.gain.setValueAtTime(0.22, e.t + d - 0.2);
      g.gain.linearRampToValueAtTime(0.0001, e.t + d);
      const lfo = ac.createOscillator();
      lfo.frequency.value = 15;
      const lg = ac.createGain();
      lg.gain.value = 0.08;
      lfo.connect(lg).connect(g.gain);
      src.connect(f).connect(g).connect(o);
      src.start(e.t);
      src.stop(e.t + d + 0.05);
      lfo.start(e.t);
      lfo.stop(e.t + d + 0.05);
    },
    reelStop(e, o) {
      tone('sine', 130, e.t, 0.16, o, 0.55, { f1: 46 });
      noise(e.t, 0.03, o, 0.22, { type: 'highpass', f0: 2500 });
      tone('triangle', 620, e.t, 0.05, o, 0.1, { f1: 300 });
    },
    drop(e, o) {
      tone('sine', 220, e.t, 0.1, o, 0.3, { f1: 90 });
      noise(e.t, 0.02, o, 0.1, { type: 'highpass', f0: 3000 });
    },
    anticipation(e, o) {
      const d = Math.max(0.3, e.dur);
      tone('sawtooth', 140, e.t, d, o, 0.1, { f1: 640, attack: d * 0.8 });
      noise(e.t, d, o, 0.12, { f0: 600, f1: 5000, attack: d * 0.85 });
    },
    scatter(e, o) {
      [1046, 1568, 2093].forEach((f, i) => tone('sine', f, e.t, 1.0, o, [0.22, 0.12, 0.08][i]));
      noise(e.t, 0.4, o, 0.05, { type: 'highpass', f0: 6000 });
    },
    win(e, o) {
      const base = semis(523.25, (e.step || 0) * 2);
      [0, 4, 7, 12].forEach((n, i) => tone('triangle', semis(base, n), e.t + i * 0.07, 0.22, o, 0.18));
    },
    pop(e, o) {
      const n = Math.min(6, Math.max(1, e.n || 3));
      for (let i = 0; i < n; i++) {
        tone('sine', 420 + i * 60, e.t + i * 0.028, 0.06, o, 0.16, { f1: 1600 });
        noise(e.t + i * 0.028, 0.02, o, 0.08, { type: 'highpass', f0: 4000 });
      }
    },
    count(e, o) {
      const d = Math.max(0.1, e.dur);
      const step = 0.055;
      for (let t = 0; t < d; t += step) {
        const f = e.big ? 1600 + 800 * (t / d) : 1800;
        tone('square', f, e.t + t, 0.025, o, 0.045);
      }
    },
    countEnd(e, o) {
      tone('sine', 90, e.t, 0.5, o, 0.6, { f1: 40 });
      [523, 659, 784, 1046].forEach((f) => tone('triangle', f, e.t, 0.8, o, 0.11));
      noise(e.t, 0.8, o, 0.14, { type: 'highpass', f0: 4000 });
    },
    bigWin(e, o) {
      [261.6, 329.6, 392, 523.3].forEach((f) => tone('sawtooth', f, e.t, 2.4, o, 0.08, { attack: 0.35 }));
      noise(e.t, 1.6, o, 0.2, { type: 'highpass', f0: 5000 });
      tone('sine', 62, e.t, 1.2, o, 0.5, { f1: 34 });
    },
    tierUp(e, o) {
      tone('sine', 72, e.t, 0.7, o, 0.6, { f1: 34 });
      [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => tone('triangle', semis(1046.5, n), e.t + i * 0.035, 0.18, o, 0.11));
      noise(e.t, 0.35, o, 0.15, { f0: 800, f1: 6000 });
    },
    coins(e, o) {
      const d = Math.max(0.2, e.dur);
      let i = 0;
      for (let t = 0; t < d; t += 0.035 + hash01(i, 7) * 0.04) {
        const f = 2800 + hash01(i, 8) * 2400;
        tone('sine', f, e.t + t, 0.12, o, 0.06);
        tone('sine', f * 1.51, e.t + t, 0.08, o, 0.025);
        i++;
      }
    },
    mult(e, o) {
      noise(e.t, 0.35, o, 0.2, { f0: 400, f1: 3000 });
      const f = 660 * (1 + Math.log2(Math.max(1, e.value || 2)) / 6);
      tone('triangle', f, e.t + 0.3, 0.45, o, 0.2);
      tone('triangle', f * 1.5, e.t + 0.34, 0.4, o, 0.1);
    },
    expand(e, o) {
      for (let i = 0; i < 12; i++) tone('sine', semis(523, i * 2), e.t + i * 0.03, 0.15, o, 0.08);
      noise(e.t, 0.5, o, 0.15, { f0: 500, f1: 6000 });
    },
    sticky(e, o) {
      tone('sine', 170, e.t, 0.16, o, 0.4, { f1: 80 });
      noise(e.t, 0.16, o, 0.12, { f0: 3000, q: 4 });
    },
    fsTrigger(e, o) {
      [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone('square', f, e.t + i * 0.11, 0.14, o, 0.05));
      [523, 659, 784, 1046].forEach((f) => tone('triangle', f, e.t + 0.8, 1.2, o, 0.1));
    },
    wheelTick(e, o) {
      noise(e.t, 0.012, o, 0.22, { f0: 2500, q: 3 });
      tone('sine', 1400, e.t, 0.015, o, 0.08);
    },
    wheelLand(e, o) {
      SYNTH.scatter(e, o);
      tone('sine', 80, e.t, 0.6, o, 0.5, { f1: 40 });
    },
    whoosh(e, o) {
      noise(e.t, 0.5, o, 0.22, { f0: 3000, f1: 400 });
    },
    nearMiss(e, o) {
      tone('sine', 520, e.t, 0.6, o, 0.14, { f1: 260 });
    },
    coinLand(e, o) {
      tone('sine', 150, e.t, 0.18, o, 0.5, { f1: 62 });
      tone('sine', 2637, e.t, 0.35, o, 0.12);
      tone('sine', 3951, e.t + 0.01, 0.28, o, 0.07);
      noise(e.t, 0.04, o, 0.16, { type: 'highpass', f0: 3500 });
      if (e.special) [1046, 1318, 1568, 2093].forEach((f, i) => tone('triangle', f, e.t + 0.05 + i * 0.05, 0.3, o, 0.1));
    },
    cellStop(e, o) {
      tone('sine', 260, e.t, 0.07, o, 0.16, { f1: 110 });
      noise(e.t, 0.015, o, 0.05, { type: 'highpass', f0: 3000 });
    },
    respinReset(e, o) {
      [880, 1175, 1760].forEach((f, i) => tone('triangle', f, e.t + i * 0.06, 0.22, o, 0.11));
    },
    collect(e, o) {
      const f = 660 * Math.pow(2, ((e.i || 0) / Math.max(1, e.n || 1)) * 1.5);
      tone('triangle', f, e.t, 0.12, o, 0.12);
      tone('sine', f * 2, e.t + 0.02, 0.1, o, 0.06);
      tone('sine', 3200, e.t + 0.42, 0.12, o, 0.06);
    },
  };

  for (const e0 of list) {
    const e = { ...e0, t: e0.t - offset };
    const out = dest(e);
    const buf = custom.get(e.type);
    if (buf) sample(buf, e.t, out, e.dur);
    else (SYNTH[e.type] || (() => {}))(e, out);
  }
  return ac.startRendering();
}

export function audioBufferToWav(buffer, from = 0, to = buffer.duration) {
  const sr = buffer.sampleRate;
  const a = Math.max(0, Math.floor(from * sr));
  const b = Math.min(buffer.length, Math.ceil(to * sr));
  const n = Math.max(0, b - a);
  const ch = buffer.numberOfChannels;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  out.setUint32(4, 36 + n * ch * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, ch, true);
  out.setUint32(24, sr, true);
  out.setUint32(28, sr * ch * 2, true);
  out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true);
  w(36, 'data');
  out.setUint32(40, n * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = a; i < b; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([out.buffer], { type: 'audio/wav' });
}
