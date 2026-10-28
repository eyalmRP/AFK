// Builds the After Effects package: the generated .jsx plus every file it
// imports, zipped. Symbol art, win animations and the sound cues are shared;
// machine art, titles and effects are painted once per output format.

import { AE_ASSETS, buildAEData, buildAEScript, exportFormats, projectForFormat, usedParticleAssets } from '../core/ae-export.js';
import { computeLayout } from '../core/layout.js';
import { paintHudLayer, paintBulbLayer, paintWheelBulbLayer } from '../render/renderer.js';
import { canvas, buildResources } from '../render/sprites.js';
import { decodeCustomSounds, renderCue, audioBufferToWav } from '../render/audio.js';
import { sfxCues } from '../core/sfx.js';

const MAX_WIN_FRAMES = 240;

// After Effects sums the SFX layers with no compressor, so the master level
// leaves headroom: the decibels that keep the loudest moment at -1 dBFS.
function mixHeadroom(rendered, events, sound, duration) {
  const sr = rendered[0]?.buffer.sampleRate || 48000;
  const n = Math.ceil(duration * sr) + 1;
  const mix = [new Float32Array(n), new Float32Array(n)];
  const vol = Number(sound.volume ?? 0.8);
  for (const e of events) {
    const { buffer, duration: d } = rendered[e.clip];
    const g = vol * Number(sound.mix?.[e.group] ?? 1);
    if (!(g > 0)) continue;
    const a = Math.round(e.t * sr);
    const len = Math.min(Math.round(d * sr), n - a);
    for (let c = 0; c < 2; c++) {
      const src = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1));
      const dst = mix[c];
      for (let i = 0; i < len; i++) dst[a + i] += src[i] * g;
    }
  }
  let peak = 0;
  for (const ch of mix) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
  return peak > 0.891 ? Math.round(20 * Math.log10(0.891 / peak) * 10) / 10 : 0;
}

function toPNG(c) {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png'));
}

function slug(s) {
  return (s || 'slot').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'slot';
}

function imageCanvas(img, max = 1024) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const s = Math.min(1, max / Math.max(w, h));
  const c = canvas(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

const README = ({ name, file, formats, sfxClips, headroom, transparent, font }) => `${name} - After Effects package
=========================================

1. Unzip this folder anywhere. Keep "${file}" next to the "assets" folder.
2. In After Effects (2026 or any CC version): File > Scripts > Run Script
   File... and pick "${file}".
3. The script builds one project folder per format (${formats.join(', ')}).
   Open the main comp and press space to play.

How the project is organised
Most of the animation is decided in Reel Studio (outcomes, timing, motion,
effects). The After Effects project is built so you can finish the look
there: every piece of art and every effect is a placeholder comp, the
timing lives in the round comps, and a few controls sit on SLOT CONTROL.

- Placeholder Comps/: the art and the effect looks, each built once. Every
  use in the animation is a layer of that comp, so replacing the art or
  animating inside a placeholder updates every use.
  - Symbols/: "Symbol 01 <name>" ... one comp per symbol (coins, the
    multiplier orb and the empty cell too). "Win 01 <name>" ... the
    symbol's win animation: it plays once from the start, then loops the
    tail; an uploaded PNG sequence or sprite sheet is laid out frame by
    frame. "Symbols Atlas" holds one symbol per frame for the reels.
  - Machine/: Background, Machine Back, Machine Frame, Marquee Lights (the
    bulbs blink inside it, faster during wins), Logo, Win Meter Panel,
    Vignette.
  - Effects/: FX Shockwave (a ring that grows and fades in 0.7 s), FX Light
    Rays, FX Small Rays, FX Cell Frame (win highlight), FX Anticipation,
    FX Tease Cell, FX Sticky Frame, FX Coin Lock, FX Near Miss, FX Wild
    Beam, FX Collected.
  - Particles/: "Particle <name>" for each particle the win explosions
    throw (gold coin, stars, confetti, your own art...). A set of variants
    holds one per frame and each particle picks one; an animated particle
    holds its frames in order and each particle plays it from a random
    frame. Replace the art here and every explosion follows.
  - Titles/: "Title <tier>" for each title, with its light sweep.
  - Paylines/: "Payline NN", each drawing itself on.
  - Plaques/: the multiplier, prize and hold & spin plaques.
  - Wheel/: Wheel Disc, Wheel Ring, Wheel Bulbs A and B, Wheel Pointer.
  - Counters/: "Counter Digits", the 0-9 strip every counter rolls
    through. Change its font, colour or style once and every counter
    follows.
  Effect placeholders are white; each use is tinted to its colour by a
  "Colour" (Tint) effect. Untick "FX Colour" on SLOT CONTROL to keep the
  colours of your own effect art.
- Reels/: one precomp per reel (or per cell for per-cell spins). Each has a
  CTRL null with a "Spin" slider: its keyframes are the start, mid and end
  phases from Reel Studio, with the same speed and influence eases. Open the
  Graph Editor on that slider to reshape a start or a stop. The reel reads
  its symbols from Symbols Atlas as the slider rolls it, like an odometer
  wheel. Tumbling symbols are ordinary keyframed layers in the same
  precomps.
  - Hold and Spin/ (when the animation has coins): "Hold Cell C-R", one
    little reel of coins and empty cells per cell, on its own Spin slider,
    with the coin values on "Value" text layers.
- Rounds/: one comp per round that shows something. It places the
  placeholders in time: paylines, win comps on the winning cells, cell
  frames, shockwaves, expanding wilds, multipliers, titles, the wheel, coin
  landings and the collect. Move a layer to retime an effect.
  Winning symbols that jump into the score are "Jump <symbol>" layers and
  ones that merge are "Pull <symbol>" layers plus a "Merged <symbol>": their
  position, scale and opacity expressions hold the flight from Reel Studio
  (time, path, landing spot), so they move exactly as in the preview.
  - Particles/: every win explosion (small burst, fountain, rain, confetti
    cannons, fireworks...) is a comp of its own. Each layer is one
    particle: a use of its Particle placeholder whose position, rotation,
    scale and opacity expressions hold the exact flight it has in Reel
    Studio (gravity, air drag, flutter). Slide the comp to retime it.
- Counter Rigs/: the rolling money counters (win meter, big win amounts,
  the hold & spin collect, the grand). Each COUNTER CTRL > Value reads its
  source slider (WIN CTRL > Amount in a round comp, SLOT CONTROL in the
  main comp); key or pick-whip it to drive the counter yourself. Each
  column turns as the one below it wraps, like the Odometer plugin, so no
  plugin is needed.
- Sound/SFX: ${sfxClips ? `every sound cue on its own audio layer at its time (${sfxClips} distinct clips in assets/sfx), named after the cue and its round and coloured by group: Reels blue, Wins green, Coins yellow, Big Win red, UI purple. The SFX MIX null holds the levels in dB: "Master" and one slider per group; every layer reads its two sliders. Mute, move or swap any cue layer.${headroom < 0 ? ` Master includes ${headroom} dB of headroom so the loudest moment stays below 0 dB (After Effects has no compressor).` : ''}` : 'sound was switched off in Reel Studio, so there are no sound cues.'}
- Main comp: the machine, reels, sticky wilds, coin lock frames, logo, free
  spins ribbon, HUD texts, the win meter, the round comps, the flash and
  the SFX comp, with a marker where each round starts. SCREEN SHAKE is a
  parent null whose position expression holds the shake events.
- SLOT CONTROL (main comp):
  - "Meter", "FS Total" (and "Collect" with Hold & Spin) drive the counters.
  - "Shake %", "Flash %", "Dim %", "Particles %" (thins every explosion
    out), "Spin Blur %" and "Win Pop %" scale those effects; 100 is what
    Reel Studio showed.
  - "FX Colour": tints the effect placeholders (see above).
- The wheel game has no machine layers: just the background, the wheel and
  its prizes, one round comp per spin handing the wheel to the next.

Transparency
- ${transparent ? 'Background and Vignette are switched off in this build.' : 'Switch off the Background and Vignette layers in the main comp.'}
  Then Composition > Add to Render Queue, Output Module: QuickTime, Apple
  ProRes 4444, Channels: RGB + Alpha. That gives a transparent MOV.

Notes
- Fonts: text layers ask for ${font}. Install it (Google Fonts) or change the
  font on "Counter Digits" and the text layers.
- Reel curvature and bloom are preview-only effects; the AE reels are flat.
`;

export async function buildAEPackage(scene, images, onProgress) {
  const JSZip = window.JSZip;
  if (!JSZip) throw new Error('The zip library did not load. Check your connection and reload the page.');
  const { project, tl } = scene;
  const name = project.name || 'Slot Animation';
  const base = slug(name);
  const zip = new JSZip();
  const dir = zip.folder(`${base}_AE`);
  const formats = exportFormats(project);
  const steps = formats.length + 2;
  let step = 0;
  const tick = (k = 1) => onProgress?.(Math.min(0.9, ((step += k) / steps) * 0.9));
  const png = async (path, c) => {
    if (c) dir.file(path, await toPNG(c));
  };

  // Shared: symbol art (with the built-in multiplier orb when the project
  // has none), win animation frames, the sound track.
  for (const [i, img] of images.symbols.entries()) await png(AE_ASSETS.shared.symbol(i), imageCanvas(img));
  const winFrames = [];
  const winFps = [];
  for (const [i, anim] of (images.winAnims || []).entries()) {
    if (!anim) continue;
    const frames = anim.frames.slice(0, MAX_WIN_FRAMES);
    for (const [k, f] of frames.entries()) await png(AE_ASSETS.shared.winFrame(i, k), imageCanvas(f, 768));
    winFrames[i] = frames;
    winFps[i] = anim.fps;
  }
  // Particle art: one PNG per variant or animation frame, shared by every
  // format (the emitters scale it).
  for (const a of usedParticleAssets(tl, project)) {
    const sprite = images.particles?.get(a.id);
    if (!sprite) continue;
    for (const [k, file] of a.files.entries()) if (sprite.frames[k]) await png(file, sprite.frames[k]);
  }

  // Sound: every distinct cue as its own clip, laid out in the SFX comp.
  let sfx = false;
  let sfxHeadroom = 0;
  let sfxClips = 0;
  if (project.sound?.enabled !== false && typeof OfflineAudioContext !== 'undefined') {
    const custom = await decodeCustomSounds(project);
    const { clips, events } = sfxCues(tl);
    const rendered = [];
    for (const clip of clips) {
      const r = await renderCue(clip.cue, custom);
      rendered.push(r);
      dir.file(AE_ASSETS.shared.sfx(clip.type, clip.n), audioBufferToWav(r.buffer, 0, r.duration));
    }
    sfxHeadroom = mixHeadroom(rendered, events, project.sound || {}, tl.duration);
    sfx = clips.length > 0;
    sfxClips = clips.length;
  }
  tick(2);

  const font = (project.effects.font || 'Bungee').replace(/\s+/g, '');
  const marquee = project.machine.marquee && project.machine.builtinFrame !== false;
  const dataList = [];
  for (const fmt of formats) {
    const p = projectForFormat(project, fmt);
    const L = computeLayout(p);
    const res = buildResources(p, L, images);
    const sc = { project: p, tl, L, res };
    const assetDir = `assets/${fmt[0]}x${fmt[1]}`;
    const A = AE_ASSETS.format(assetDir);
    const jobs = [
      [A.background, res.bg],
      [A.back, res.back],
      [A.front, res.front],
      [A.bulbsA, marquee ? paintBulbLayer(sc, 0) : null],
      [A.bulbsB, marquee ? paintBulbLayer(sc, 1) : null],
      [A.hud, L.hud ? paintHudLayer(sc) : null],
      [A.logo, res.logo],
      [A.vignette, res.vignette],
      [A.rays, res.rays],
      [A.raysSmall, res.raysSmall],
      [A.wheelDisc, res.wheel.disc],
      [A.wheelRing, res.wheel.ring],
      [A.wheelBulbsA, paintWheelBulbLayer(sc, 0)],
      [A.wheelBulbsB, paintWheelBulbLayer(sc, 1)],
      [A.wheelPointer, res.wheel.pointer],
      ...Object.keys(res.titles).map((k) => [A.title(k), res.titles[k]]),
    ];
    for (const [path, c] of jobs) await png(path, c);
    dataList.push(
      buildAEData(p, tl, L, {
        assetDir,
        winFrames,
        winFps,
        wheelR: res.wheel.R,
        accent: res.theme.accent,
        titlePx: res.titlePx,
        hasLogo: !!res.logo,
        hasBulbs: marquee,
        fontPostScript: `${font}-Regular`,
        sfx,
        sfxHeadroom,
        titleKeys: Object.keys(res.titles),
      })
    );
    tick();
  }

  const file = `${base}.jsx`;
  dir.file(file, buildAEScript(dataList));
  dir.file(
    'README.txt',
    README({ name, file, formats: formats.map(([w, h]) => `${w}x${h}`), sfxClips, headroom: sfxHeadroom, transparent: !!project.output?.transparent, font: `${project.effects.font || 'Bungee'} (PostScript "${font}-Regular")` })
  );
  dir.file(`${base}.reelstudio.json`, JSON.stringify(project, null, 2));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }, (m) => onProgress?.(0.9 + (m.percent / 100) * 0.1));
  return { blob, filename: `${base}_AfterEffects.zip`, formats: formats.length };
}
