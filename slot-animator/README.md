# Reel Studio

A browser tool for animating slot machine wins. Upload symbol art, set up the
reels, sequence the spin rounds (no win, small win, near miss, big/mega/epic
win, free spins, wheel of fortune), tune the start/mid/end motion of the
reels, and export:

- **MP4**: H.264, rendered frame by frame at full resolution (WebCodecs).
- **After Effects package** (.zip): an ExtendScript that rebuilds the whole
  animation as a layered, editable AE project, plus every image it uses.
- **PNG** of the current frame, and the **project file** (.json).

This folder is self-contained and does not touch the AFK Arena Codex app.

## Run it

```sh
npm run slots:build   # writes slot-animator/dist/index.html and artifact.html
npm run slots:test    # engine + After Effects export tests
```

Open `dist/index.html` in Chrome, Edge or Safari. `dist/artifact.html` is the
same page without a document skeleton, for publishing as a claude.ai artifact.
JSZip and mp4-muxer load from cdnjs/jsDelivr, fonts from Google Fonts.

## How it works

Everything is a pure function of time, built from one JSON project:

| Module | Job |
| --- | --- |
| `src/js/core/outcomes.js` | Turns a round ("mega win, lines 1 and 4, Lucky 7") into a symbol grid. Filler is re-rolled until no unintended payline win remains; lines completed by the winning symbols are added to the win. |
| `src/js/core/timeline.js` | Schedules every round: reel start/stop times, anticipation teases, win presentations, wheel spins, shakes and flashes. Reel motion is stored as After Effects style keyframes (value + speed/influence eases). |
| `src/js/core/keys.js` | Evaluates those keyframes with the same cubic Bézier After Effects uses, so exported curves play back identically. |
| `src/js/core/layout.js` | Screen layout shared by the renderer and the exporter. |
| `src/js/core/ae-export.js` | Builds the ES3 `.jsx` for After Effects. |
| `src/js/render/*` | Canvas renderer, built-in sample art, effects (paylines, symbol pops, coins, light rays, odometer counter, bonus wheel, bloom). |
| `src/js/export/*` | MP4 encoder and the After Effects zip packager. |
| `src/js/ui/*` | The editor. |

### After Effects project layout

- `Reels/Reel N`: a `CTRL` null with a `Spin` slider (symbols scrolled). Its
  keys are the start, mid and end phases with the exact eases from the
  preview. Cell layers read the slider and time-remap into `Symbols Atlas`
  (one symbol per frame), so replacing a symbol image there updates every reel.
  A Directional Blur adjustment layer reads the slider's velocity.
- `Win FX/Rxx ...`: one precomp per presentation: paylines (shape layers with
  Trim Paths), symbol pops, cell frames, titles, coins (expression physics),
  shockwaves, counters driven by `WIN CTRL > Amount`, the bonus wheel rig.
- Main comp: background, machine, reels, marquee, logo, win meter
  (`SLOT CONTROL > Meter`), a `SCREEN SHAKE` parent null, flashes, vignette,
  and a marker per round.

Counters are plain sliders, so the Plugin Everything **Odometer** effect can be
pick-whipped to `Amount` for its rolling digits.

Preview-only: reel curvature and bloom. The AE reels are flat.

## Ideas for next steps

- Tumble refills after a cascade win (winning symbols burst, others fall).
- Expanding or sticky wilds, multiplier orbs, symbol upgrades.
- Free spins as a real sub-sequence with a spin counter and a total win.
- Per-symbol win animations (sprite sheets or short videos per symbol).
- Sound design track: reel start, per-reel stop clunks, anticipation riser,
  count-up loop and the big win sting, exported as a WAV aligned to the video.
- Alpha video export (WebM VP9 with alpha) for compositing over gameplay.
- Batch renders: one MP4 per finale, or several aspect ratios at once.
