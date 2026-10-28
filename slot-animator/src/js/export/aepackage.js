// Builds the After Effects package: the generated .jsx plus every file it
// imports, zipped. Symbol art, win animations and the sound track are shared;
// machine art, titles and effects are painted once per output format.

import { AE_ASSETS, buildAEData, buildAEScript, exportFormats, projectForFormat } from '../core/ae-export.js';
import { computeLayout } from '../core/layout.js';
import { paintHudLayer, paintBulbLayer, paintWheelBulbLayer } from '../render/renderer.js';
import { canvas, buildResources } from '../render/sprites.js';
import { decodeCustomSounds, renderSoundtrack, audioBufferToWav } from '../render/audio.js';

const MAX_WIN_FRAMES = 240;

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

const README = ({ name, file, formats, sound, transparent, font }) => `${name} - After Effects package
=========================================

1. Unzip this folder anywhere. Keep "${file}" next to the "assets" folder.
2. In After Effects (2026 or any CC version): File > Scripts > Run Script
   File... and pick "${file}".
3. The script builds one project folder per format (${formats.join(', ')}).
   Open the main comp and press space to play.

What you get
- Symbols/
  - "Symbol 01 <name>" ... one comp per symbol. Open one and animate inside
    (swap the art, add a glow, a breathing loop): every reel, every tumble
    and every win that shows the symbol updates.
  - "Win 01 <name>" ... the symbol's win animation. It plays once from the
    start, then loops the tail. A PNG sequence or sprite sheet you uploaded
    is laid out here frame by frame.
  - "Symbols Atlas": one symbol per frame, used by the reels.
- Reels/: one precomp per reel (or per cell for per-cell spins). Each has a
  CTRL null with a "Spin" slider: its keyframes are the start, mid and end
  phases from Reel Studio, with the same speed and influence eases. Open the
  Graph Editor on that slider to reshape a start or a stop. Tumbling symbols
  are ordinary keyframed layers in the same precomps.
- Win FX/: one precomp per round that shows something (paylines, symbol
  pops, expanding wilds, multipliers, titles, coins, counters, the wheel).
  Each counter is read from WIN CTRL > Amount in its comp.
- Odometers/: rolling-digit counters built from plain layers, no plugin
  needed. "Odometer Digits" holds the 0-9 strip: change its font, colour
  or style once and every counter follows. Each counter's ODO CTRL > Value
  reads its source slider; key or pick-whip it to drive the counter
  yourself. The digits roll like the Odometer plugin (each column turns as
  the one below it wraps) and tick crisply while counting fast.
- Hold and Spin/ (when the animation has coins): one comp per cell, "Hold
  Cell C-R", each a little reel of coins and empty cells on its own Spin
  slider. The coins are comps in Symbols/ too ("Symbol NN Coin", "Mega coin",
  "Empty cell"...): restyle one and every cell follows. Their values ride on
  "Value" text layers. In the main comp, "Coin Lock" frames glow on locked
  coins, "Respins Counter" counts the respins, and the coins' running total
  ("Collect", on SLOT CONTROL) rolls on the frame while they are collected;
  each round's FX comp holds the landings, the collect and the grand.
- SLOT CONTROL (main comp): "Meter" drives the win meter and "FS Total" the
  free spins total. SCREEN SHAKE is a parent null whose position expression
  holds the shake events; the Flash solid holds the flashes.
- The wheel game has no machine layers: just the background, the wheel and
  its prizes, one FX comp per spin handing the wheel to the next.

Transparency
- ${transparent ? 'Background and Vignette are switched off in this build.' : 'Switch off the Background and Vignette layers in the main comp.'}
  Then Composition > Add to Render Queue, Output Module: QuickTime, Apple
  ProRes 4444, Channels: RGB + Alpha. That gives a transparent MOV.

Sound
- ${sound ? '"Sound Track" in the main comp is assets/soundtrack.wav: every reel stop, tumble, count-up and big win cue, in sync with the animation.' : 'Sound was switched off in Reel Studio, so no sound track is included.'}

Notes
- Fonts: text layers ask for ${font}. Install it (Google Fonts) or change the
  font on "Odometer Digits" and the text layers.
- Reel curvature and bloom are preview-only effects; the AE reels are flat.
- Markers on the main comp mark where each round starts.
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
  let soundFile = '';
  if (project.sound?.enabled !== false && typeof OfflineAudioContext !== 'undefined') {
    const buffer = await renderSoundtrack(tl, project, await decodeCustomSounds(project));
    dir.file(AE_ASSETS.shared.sound, audioBufferToWav(buffer));
    soundFile = AE_ASSETS.shared.sound;
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
      [A.coin, res.coin],
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
        soundFile,
        titleKeys: Object.keys(res.titles),
      })
    );
    tick();
  }

  const file = `${base}.jsx`;
  dir.file(file, buildAEScript(dataList));
  dir.file(
    'README.txt',
    README({ name, file, formats: formats.map(([w, h]) => `${w}x${h}`), sound: !!soundFile, transparent: !!project.output?.transparent, font: `${project.effects.font || 'Bungee'} (PostScript "${font}-Regular")` })
  );
  dir.file(`${base}.reelstudio.json`, JSON.stringify(project, null, 2));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }, (m) => onProgress?.(0.9 + (m.percent / 100) * 0.1));
  return { blob, filename: `${base}_AfterEffects.zip`, formats: formats.length };
}
