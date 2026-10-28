# Reel Studio

A browser tool for animating slot machine wins. Upload symbol art (and per
symbol win animations), set up the reels and how the machine pays, sequence
the spin rounds, tune the start/mid/end motion and the reel order, and export
the result as an editable **After Effects project**.

- Pay modes: paylines, ways, pay anywhere (Sweet Bonanza style) and clusters.
- Spin types: classic, staggered, turbo, tease, cascade drops and per-cell
  spins (hold and spin style). Start and stop order per project (left to
  right, right to left, centre out, outside in, random or custom) and per
  round, with extra delays per reel. The anticipation tease follows the stop
  order, or you pick the teased reels yourself.
- Round outcomes: no win, near miss, small, medium, big win (counts through
  your own tiers: titles, thresholds in bets, colours), free spins trigger,
  bonus, wheel of fortune and the free spins total.
- Features: tumble chains (winners pop, survivors fall, refills drop and pay
  again), multiplier symbols that fly into the total, expanding wilds,
  extra wilds, sticky wilds through a free spins block, and a free spins
  counter with a running total.
- Sound: every cue (reel stops, anticipation, pops, count-up ticks, stings,
  coins, wheel pegs) is synthesised in sync with the animation; any cue can
  be replaced with your own file. It plays with the preview.

Exports:

- **After Effects package** (.zip), the main deliverable: an ES3 ExtendScript
  that rebuilds the animation as a layered, editable project, plus every image
  and the sound track. Several formats (16:9, 9:16, 1:1, 4:5, 4K) can go in
  one package; each gets its own comp tree.
- **MP4 preview** with sound (WebCodecs H.264, frame by frame).
- **PNG** of the current frame, the **sound track** (WAV in a zip) and the
  **project file** (.json).

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
| `src/js/core/outcomes.js` | Turns a round ("big win, 12 candies anywhere, two tumbles, x25 and x50") into symbol grids, one per tumble step. Filler is re-rolled until no unintended win remains, including wins the survivors would form after a collapse. |
| `src/js/core/grid.js` | Win finding for every pay mode and the tumble collapse. |
| `src/js/core/order.js` | Reel and cell start/stop orders. |
| `src/js/core/timeline.js` | Schedules every round: reel or cell start/stop times, anticipation, tumble actors, wilds, multipliers, win presentations, the free spins block, the wheel, shakes, flashes and sound cues. Reel motion is stored as After Effects style keyframes (value + speed/influence eases). |
| `src/js/core/keys.js` | Evaluates those keyframes with the same cubic Bézier After Effects uses, so exported curves play back identically. |
| `src/js/core/layout.js` | Screen layout shared by the renderer and the exporter. |
| `src/js/core/ae-export.js` | Builds the ES3 `.jsx` for After Effects. |
| `src/js/render/*` | Canvas renderer, built-in sample art (classic and candy sets), effects, the sound synth. |
| `src/js/export/*` | MP4 encoder and the After Effects zip packager. |
| `src/js/ui/*` | The editor. |

### After Effects project layout

- `Symbols/Symbol NN <name>`: one comp per symbol. `Symbols/Win NN <name>`:
  its win animation (a default pop and pulse, or your PNG sequence or sprite
  sheet frame by frame). `Symbols Atlas` holds one symbol comp per frame.
  Animate inside a symbol comp and every reel, tumble and win updates.
- `Reels/Reel N` (or `Cell C-R` for per-cell spins): a `CTRL` null with a
  `Spin` slider. Its keys are the start, mid and end phases with the exact
  eases from the preview. Cell layers read the slider and time-remap into
  `Symbols Atlas`. A Directional Blur adjustment layer reads the slider's
  velocity. Tumbling symbols are keyframed layers in the same precomps.
- `Win FX/Rxx ...`: one precomp per presentation: paylines (shape layers with
  Trim Paths), win comps on the winning cells, cell frames, shockwaves,
  expanding wilds, multipliers flying into the total, tier titles, coins
  (expression physics), counters driven by `WIN CTRL > Amount`, the wheel rig.
- `Odometers/`: rolling-digit counters made of plain layers. `Odometer
  Digits` is the 0-9 strip shared by every counter; each counter's
  `ODO CTRL > Value` reads its source slider. Each column turns as the one
  below it wraps, like the Odometer plugin, so no plugin is needed.
- Main comp: background, machine, reels, sticky wilds, marquee, logo, free
  spins ribbon and HUD texts, win meter (`SLOT CONTROL > Meter` and
  `FS Total`), a `SCREEN SHAKE` parent null, flashes, vignette, the sound
  track layer and a marker per round. With "Transparent background" the
  background and vignette start switched off; render ProRes 4444 with alpha
  from After Effects.

Preview-only: reel curvature and bloom. The AE reels are flat.
