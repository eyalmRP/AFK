# Reel Studio

A browser tool for animating slot machine wins. Upload symbol art (and per
symbol win animations) into the Asset Bank, set up the reels and how the
machine pays, sequence
the spin rounds, tune the start/mid/end motion and the reel order, and export
the result as an editable **After Effects project**.

- Three games: a slot machine, Hold & Spin (a board of per-cell respins
  where coins land and lock, or the cell stays empty; the counter resets on
  every coin and the feature ends when it runs out or the board fills, then
  every coin is collected), and the Wheel of Fortune on its own. A slot game
  can trigger Hold & Spin from a spin that lands coins.
- Hold & Spin has its own coin set: a regular coin with a list of values and
  special coins (Mega, Super, Ultra or your own) with their own values,
  colours, labels or uploaded art, plus the empty cell.
- Pay modes: paylines, ways, pay anywhere (Sweet Bonanza style) and clusters.
- Spin types: classic, staggered, turbo, tease, cascade drops and per-cell
  spins (hold and spin style). Start and stop order per project (left to
  right, right to left, centre out, outside in, random or custom) and per
  round, with extra delays per reel. The anticipation tease follows the stop
  order, or you pick the teased reels yourself. The camera can push in on
  the teased reel (or cell), follow the tease from reel to reel and ease
  back out after it lands (Spin › Anticipation, with the zoom amount).
- Round outcomes: no win, near miss, small, medium, big win (counts through
  your own tiers: titles, thresholds in bets, colours), free spins trigger,
  bonus, wheel of fortune and the free spins total.
- Features: tumble chains (winners pop, survivors fall, refills drop and pay
  again), multiplier symbols that fly into the total, expanding wilds,
  extra wilds, sticky wilds through a free spins block, and a free spins
  counter with a running total.
- Winning symbols: pop in place, jump into the score (they fly one by one
  to the win meter, the win amount, above the reels, the screen centre or
  any spot you click on the preview; each landing counts up the win), or
  magnet merge (they pull together and fuse into one big symbol, all at
  once or one by one with a slider in between). Both fly a straight, arc or
  wind-up path (a pull back before the flight). Per project, with a
  per-round override. The payline drawn through a line win can be switched
  off.
- Win particles: 14 explosion templates, short (small, medium and big
  bursts, ring blast, confetti cannons, party popper, magnet) or continuous
  (fountain from below, geyser, rain, side streams, fireworks, spiral,
  shimmer). Each win moment and each big win tier picks a template and a
  particle (gold coin, stars, sparkle, gems, confetti, embers, casino chips,
  or your own still or animated art); any round can override both. Big win
  tiers stack as the count climbs. Continuous templates run while the win
  shows, until the next round, or to the end of the animation, looping
  seamlessly (a 5 s cycle) once they run long. Ambient particles float
  behind the machine for the whole animation.
- Sound: every cue (reel stops, anticipation, pops, count-up ticks, stings,
  coins, wheel pegs) is synthesised in sync with the animation; any cue can
  be replaced with your own file. It plays with the preview.

- Editor:
  - Feature search (Ctrl K or /): every control, section and command, found
    by name, by its label as it reads in the editor (labels, options and
    hints are read from the panels themselves, so new controls are found
    too), by the words people use for it ("confetti", "fly to score",
    "magnet") or despite a typo. Picking one opens its tab or the Asset
    Bank, selects a fitting round, unfolds the section and highlights it.
  - Project menu: new project, open and save the project file (Ctrl O,
    Ctrl S), start from a preset, clear all rounds, reset to the demo.
    Undo and redo (Ctrl Z, Ctrl Shift Z) cover every change.
  - Settings tabs: Machine, Spin, Wins (tiers, winning symbols, particles,
    titles, win timing), Effects, Wheel, Sound, Export. Every section
    folds and remembers it; Alt-click a section title folds them all.
  - The side panels resize (drag a divider, or focus it and use the arrow
    keys; double-click resets) and remember their widths. The Asset Bank
    (symbols, coins, particles, scene art) is a floating window you can
    move, resize and minimise (B toggles it); on phones it is a bottom
    sheet. ? lists the keyboard shortcuts.

Exports:

- **After Effects package** (.zip), the main deliverable: an ES3 ExtendScript
  that rebuilds the animation as a working, editable project built from
  placeholder comps, plus every image and every sound cue as its own clip.
  Several formats (16:9, 9:16, 1:1, 4:5, 4K) can go in one package; each gets
  its own comp tree.
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
| `src/js/core/coins.js` | The Hold & Spin coin set, and where coins, the multiplier orb and the empty cell sit in the symbol list. |
| `src/js/core/timeline.js` | Schedules every round: reel or cell start/stop times, anticipation, tumble actors, wilds, multipliers, win presentations, the free spins block, the wheel, shakes, flashes and sound cues. Reel motion is stored as After Effects style keyframes (value + speed/influence eases). |
| `src/js/core/keys.js` | Evaluates those keyframes with the same cubic Bézier After Effects uses, so exported curves play back identically. |
| `src/js/core/layout.js` | Screen layout shared by the renderer and the exporter. |
| `src/js/core/winfx.js` | Winning symbols that jump into the score or merge into one: landing spots and the flight curves the preview and After Effects share. |
| `src/js/core/particles.js` | Explosion templates and the win emitters: which moment throws which particles, and every particle's flight as a closed form (gravity, air drag, flutter) that the preview and After Effects both evaluate. |
| `src/js/core/sfx.js` | The sound cues as separate clips for the After Effects SFX comp (identical cues share a clip). |
| `src/js/core/ae-export.js` | Builds the ES3 `.jsx` for After Effects. |
| `src/js/render/*` | Canvas renderer, built-in sample art (classic and candy sets), effects, the sound synth. |
| `src/js/export/*` | MP4 encoder and the After Effects zip packager. |
| `src/js/ui/*` | The editor. |

### After Effects project layout

Most of the animation is decided in Reel Studio; the AE project is where the
look gets finished. Every piece of art and every effect is a placeholder
comp, the round comps place them in time, and a few controls sit on
`SLOT CONTROL`.

- `Placeholder Comps/`: each built once; every use is a layer of it, so
  replacing the art or animating inside updates every use.
  - `Symbols/`: `Symbol NN <name>` per symbol (coins, the orb and the empty
    cell included), `Win NN <name>` with its win animation (a default pop
    and pulse, or your PNG sequence or sprite sheet frame by frame), and
    `Symbols Atlas` with one symbol per frame for the reels.
  - `Machine/`: background, machine back and frame, `Marquee Lights` (the
    blink lives inside), logo, win meter panel, vignette.
  - `Effects/`: `FX Shockwave`, `FX Light Rays`, `FX Small Rays`, `FX Coin`,
    `FX Cell Frame`, `FX Anticipation`, `FX Tease Cell`, `FX Sticky Frame`,
    `FX Coin Lock`, `FX Near Miss`, `FX Wild Beam`, `FX Collected`. They are
    white; each use carries a Tint named `Colour` that follows the
    `FX Colour` checkbox on `SLOT CONTROL`.
  - `Titles/` (with the light sweep), `Paylines/` (each draws itself on),
    `Plaques/`, `Wheel/` and `Counters/Counter Digits` (the 0-9 strip every
    counter rolls through).
  - `Particles/Particle <name>`: the particle art, one variant (or
    animation frame) per frame.
- `Reels/Reel N` (or `Cell C-R` for per-cell spins): a `CTRL` null with a
  `Spin` slider. Its keys are the start, mid and end phases with the exact
  eases from the preview. Cell layers read the slider and time-remap into
  `Symbols Atlas`, so a reel rolls through its strip like an odometer
  wheel. A Directional Blur adjustment layer reads the slider's velocity.
  Tumbling symbols are keyframed layers in the same precomps.
  `Reels/Hold and Spin/Hold Cell C-R`: one little reel per cell for the coin
  board, with the coin values as text layers.
- `Rounds/Rxx ...`: one comp per round that shows something, placing the
  placeholders in time: paylines, win comps on the winning cells, frames,
  shockwaves, expanding wilds, multipliers flying into the total, titles,
  counters driven by `WIN CTRL > Amount`, the wheel rig. `Rounds/Particles/`
  holds every win explosion as its own comp: one layer per particle, a use
  of its particle placeholder, with expressions that reproduce the
  preview's flight exactly. Looping emitters wrap each particle's age by
  the cycle, so they run as long as the comp does.
- `Counter Rigs/`: rolling-digit money counters made of plain layers; each
  `COUNTER CTRL > Value` reads its source slider. Each column turns as the
  one below it wraps, like the Odometer plugin, so no plugin is needed.
- `Sound/SFX`: one audio layer per cue at its time, named after the cue and
  round and coloured by group. The `SFX MIX` null holds Master and per-group
  levels in dB (Master includes headroom: After Effects has no compressor).
- Main comp: background, ambient particles, machine, reels, sticky wilds,
  coin lock frames, marquee, logo, free spins ribbon and HUD texts, win
  meter, the round comps, particles that run to the end (`Rxx <template>`),
  a `SCREEN SHAKE` parent null, the flash, vignette, the SFX comp and a
  marker per round. With anticipation zoom on, a `CAMERA` null parents the
  shake null and the background and pushes in on the teased reels.
  `SLOT CONTROL` holds `Meter`, `FS Total`, `Collect` and the After Effects
  side controls: `Shake %`, `Flash %`, `Dim %`, `Particles %`, `Spin Blur %`,
  `Win Pop %`, `Zoom %` and `FX Colour`. With "Transparent
  background" the background and vignette start switched off; render
  ProRes 4444 with alpha from After Effects.

Preview-only: reel curvature and bloom. The AE reels are flat.
