// Builds the After Effects package: the generated .jsx plus every bitmap it
// imports (symbols, machine frame, titles, coins, rays, wheel), zipped.

import { AE_ASSETS, buildAEData, buildAEScript } from '../core/ae-export.js';
import { paintHudLayer, paintBulbLayer, paintWheelBulbLayer } from '../render/renderer.js';
import { canvas } from '../render/sprites.js';

function toPNG(c) {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png'));
}

function slug(s) {
  return (s || 'slot').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'slot';
}

function symbolCanvas(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const s = Math.min(1, 1024 / Math.max(w, h));
  const c = canvas(w * s, h * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

const README = (name, file) => `${name} - After Effects package
=========================================

1. Unzip this folder anywhere. Keep "${file}" next to the "assets" folder.
2. In After Effects: File > Scripts > Run Script File... and pick "${file}".
3. The script builds a project folder named "${name}" with:
   - the main comp (open it and press space to play),
   - Reels/: one precomp per reel plus "Symbols Atlas" (one symbol per frame).
     Replace a symbol by swapping its layer source in Symbols Atlas
     (Alt/Option-drag new footage onto the layer).
   - Win FX/: one precomp per win presentation (paylines, symbol pops,
     titles, coins, counters, the bonus wheel).

Editing the motion
- Each reel comp has a CTRL null with a "Spin" slider. Its keyframes are the
  start, mid and end phases you set in Reel Studio, with the same speed and
  influence eases. Open the Graph Editor on that slider to reshape a stop.
- SLOT CONTROL > Meter drives the win meter; each Win FX comp has WIN CTRL >
  Amount for its own counter.
- SCREEN SHAKE is a parent null: its position expression holds the shake
  events; the Flash solid holds the flashes.

Odometer plugin (Plugin Everything)
- Add a solid in a Win FX comp, apply Odometer, and pick-whip its number to
  WIN CTRL > Amount. Hide the "Win Counter" text layer.

Rendering a MOV
- Composition > Add to Render Queue, Output Module: QuickTime,
  Apple ProRes 4444 (with alpha if you hide the Background layer) or 422 HQ.

Notes
- Fonts: text layers ask for Bungee (PostScript "Bungee-Regular"). Install it
  from Google Fonts or change the font on the text layers.
- Reel curvature and bloom are preview effects; the AE reels are flat.
`;

export async function buildAEPackage(scene, images, onProgress) {
  const JSZip = window.JSZip;
  if (!JSZip) throw new Error('The zip library did not load. Check your connection and reload the page.');
  const { project, tl, L, res } = scene;
  const name = project.name || 'Slot Animation';
  const base = slug(name);
  const zip = new JSZip();
  const dir = zip.folder(`${base}_AE`);
  const jobs = [];
  const add = (path, c) => {
    if (c) jobs.push([path, c]);
  };
  add(AE_ASSETS.background, res.bg);
  add(AE_ASSETS.back, res.back);
  add(AE_ASSETS.front, res.front);
  add(AE_ASSETS.bulbsA, project.machine.marquee && project.machine.builtinFrame !== false ? paintBulbLayer(scene, 0) : null);
  add(AE_ASSETS.bulbsB, project.machine.marquee && project.machine.builtinFrame !== false ? paintBulbLayer(scene, 1) : null);
  if (L.hud) add(AE_ASSETS.hud, paintHudLayer(scene));
  add(AE_ASSETS.logo, res.logo);
  add(AE_ASSETS.vignette, res.vignette);
  add(AE_ASSETS.coin, res.coin);
  add(AE_ASSETS.rays, res.rays);
  add(AE_ASSETS.raysSmall, res.raysSmall);
  add(AE_ASSETS.wheelDisc, res.wheel.disc);
  add(AE_ASSETS.wheelRing, res.wheel.ring);
  add(AE_ASSETS.wheelBulbsA, paintWheelBulbLayer(scene, 0));
  add(AE_ASSETS.wheelBulbsB, paintWheelBulbLayer(scene, 1));
  add(AE_ASSETS.wheelPointer, res.wheel.pointer);
  for (const k of Object.keys(res.titles)) add(AE_ASSETS.title(k), res.titles[k]);
  images.symbols.forEach((img, i) => add(AE_ASSETS.symbol(i), symbolCanvas(img)));
  let done = 0;
  for (const [path, c] of jobs) {
    dir.file(path, await toPNG(c));
    done++;
    onProgress?.(done / (jobs.length + 1));
  }
  const data = buildAEData(project, tl, L, {
    wheelR: res.wheel.R,
    accent: res.theme.accent,
    titlePx: res.titlePx,
    hasLogo: !!res.logo,
    fontPostScript: `${(project.effects.font || 'Bungee').replace(/\s+/g, '')}-Regular`,
  });
  const file = `${base}.jsx`;
  dir.file(file, buildAEScript(data));
  dir.file('README.txt', README(name, file));
  dir.file(`${base}.reelstudio.json`, JSON.stringify(project, null, 2));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }, (m) => onProgress?.(0.9 + (m.percent / 100) * 0.1));
  return { blob, filename: `${base}_AfterEffects.zip` };
}
