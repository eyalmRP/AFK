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
  the jackpot coins (Mini, Minor, Major, or your own) with their own values,
  colours, labels or uploaded art, plus the empty cell. Filling the board
  wins the Grand. Projects saved with the old Mega, Super and Ultra coins
  get the jackpot names when they open.
- Pay modes: paylines, ways, pay anywhere (Sweet Bonanza style) and clusters.
- Spin types: classic, staggered, turbo, tease, cascade drops and per-cell
  spins (hold and spin style). Start and stop order per project (left to
  right, right to left, centre out, outside in, random or custom) and per
  round, with extra delays per reel. The anticipation tease follows the stop
  order, or you pick the teased reels yourself. The camera can push in on
  the teased reel (or cell), follow the tease from reel to reel and ease
  back out after it lands (Spin › Anticipation, with the zoom amount).
  While a reel teases the others dim; scatters and trigger coins pop lit as
  they land, then fade back into the dim, or, with "Keep scatters lit
  through the tease", stay lit and glowing until the teased reel lands.
- Round outcomes: no win, near miss, small, medium, big win (counts through
  your own tiers: titles, thresholds in bets, colours), free spins trigger,
  bonus, wheel of fortune and the free spins total.
- Features: tumble chains (winners pop, survivors fall, refills drop and pay
  again), multiplier symbols that fly into the total, expanding wilds,
  extra wilds, sticky wilds through a free spins block (a held cell is cut
  out of its spinning reel; in After Effects a Subtract mask on the reel
  layer does it; a later win drawn through one pays through the wild), and
  a free spins counter with a running total.
- More mechanics, set per round in the round inspector:
  - Free spins retrigger: a Free spins trigger round marked Free spin,
    inside a free spins block, lands scatters, shows EXTRA SPINS with the
    spins it adds, and the counter grows from then on (adding a trigger
    after a free spin makes one).
  - Multiplier wilds: wilds in a line or ways win carry x2, x3... badges
    (a winner turns wild when there are too few); after the win shows the
    badges fly into the plaque and the win is multiplied by their sum. Not
    on tumbling rounds, and never on a sticky or walking wild.
  - Mystery symbols: blocks land, glow and turn over together into one
    symbol. On a win they sit on winners and reveal the winning symbol; on
    a no-win spin they reveal a symbol you pick, kept from paying. While
    they turn, their cells are cut out of the reels and the reels swap to
    the revealed symbols underneath. Works with every spin type.
  - Walking wilds (a free spins trigger option, next to sticky): every
    wild that lands steps one reel to the left as each free spin starts,
    hopping, until it walks off the grid. The cell it leaves turns back
    into an ordinary symbol while the wild still covers it.
  - Cash symbols and a collector (Big Bass style): coins land with values
    (in bets); a collector, landing on the last reel to stop when it can,
    takes them one by one on top of the win, the meter counting each in.
  - Pots above the machine (Features tab): a pot of gold, a pot of gems
    and a pot of fruits stand on the frame's top edge, peeking over it,
    where the title was. 1 to 3 pots; their size, spacing, how much hides
    behind the frame and how much room they get above the machine (the
    machine scales down) are settings, and each pot takes painted or
    uploaded art and a colour for its beams, glow and nameplate. Beams are
    saber beams: a simple arc by default or an S-curve, with bend,
    thickness, travel time and the time between beams. Each cell goes to
    the nearest pot (the pot above its reels), or by symbol (each symbol
    has its pot: by default gems to the pot of gems, fruit to the pot of
    fruits, the rest to the pot of gold; a table reassigns them), or the
    pots take turns, or one pot does it all (per project, with a per-round
    override). Each pot collects wins, upgrades cells, or both; a pot that
    does not do something passes it to the nearest one that does. The
    section also holds the switch for winners beaming up into the pots.
  - Boosters (round inspector, with the pots on): after the spin lands
    the pots charge up and fire beams at cells one by one, sweeping across
    the machine; each cell lands as a low symbol and, as its beam hits,
    bursts into a wild, the winning symbol (an upgrade), a wild with an x
    value, or cash. On a win they upgrade the win's own cells, so the win
    needs them; in a tumble a multiplier lands as a bomb. On a spin that
    does not win they upgrade free cells to things that do not pay; cash
    goes to a collector if one lands. While a cell upgrades it is cut out
    of its reel and the reel swaps underneath.
  The mystery block and the collector are built-in symbols unless the
  project has a symbol with the Mystery or Collector role, whose art is
  used instead.
- Winning symbols: pop in place, jump into the score (they fly one by one
  to the win meter, the win amount, above the reels, the screen centre or
  any spot you click on the preview; each landing counts up the win), or
  magnet merge (they pull together and fuse into one big symbol, all at
  once or one by one with a slider in between), or beam to the pots (with
  the pots on: each winner fires a beam up into its pot one by one and
  darkens; every catch squashes the pot and counts up the win and the
  pot's nameplate). Jump and merge fly a straight, arc or wind-up path (a
  pull back before the flight). Per project, with a
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
- Wheel of Fortune: segments with a colour or none (your wheel face shows
  through), an icon on every segment (16 built-in icons, or your own; one
  click fills them all, richer for bigger prizes), a centre icon on the hub
  (the star, any icon, your own or none), labels in any font, colour and
  size, and the text and icon height (how far out from the hub). Every
  part can be your own art: the face, rim, hub and pointer (Asset Bank ›
  Wheel), and the rim, bulbs, pegs, separators, hub and labels switch off.
  Segments can be a prize, Spin again (the wheel says so and spins once
  more within the round) or No win. The pointer sits at the top or the
  bottom, pegs bend it, and the "Almost
  slips" landing creeps into the next peg, nearly tips over, rolls back and
  the pointer springs past straight before it settles. The wheel can be
  bigger than the screen (whole wheel, top half, close-up, from above, or
  your own zoom and centre), and the camera can push in on the pointer as
  it slows.
- Build-up shake (Effects): every reel or cell that brings a winner lands
  with a growing bump and a climbing note. Row lines (Machine › Reels) put
  thin lines between the rows.
- Fonts: upload TTF or OTF fonts (Asset Bank › Fonts) for the titles,
  counters and wheel labels; they ship in the After Effects package.
- Sound: every cue (reel stops, anticipation, pops, count-up ticks, stings,
  coins, wheel pegs) is synthesised in sync with the animation; any cue can
  be replaced with your own file. The preview starts muted (the Sound
  button turns it on); exports always carry it.

- Editor:
  - Feature search (Ctrl K or /): every control, section and command, found
    by name, by its label as it reads in the editor (labels, options and
    hints are read from the panels themselves, so new controls are found
    too), by the words people use for it ("confetti", "fly to score",
    "magnet") or despite a typo. Picking one opens its tab or the Asset
    Bank, selects a fitting round, unfolds the section and highlights it.
  - Tooltips: hover (or focus) an option for what it does; many show a
    small looping demo rendered by the real engine (spin types, start and
    stop styles, anticipation and zoom, winning symbol styles and paths,
    build-up shake, sticky and expanding wilds, tumbles, wheel landings,
    framings and spin again). Options that do not apply to the game type
    or spin style stay in view, greyed out and locked, saying why. Section
    headers have icons. Search also reads the tooltip texts.
  - Presets (top bar, or P): a gallery of 19 ready-made animations with a
    frame of each: classic, fruit 3×3, 243 ways, tumbles, clusters 7×7,
    per-cell spins, mobile portrait, free spins with sticky wilds and a
    retrigger, a cash collector, mystery and walking wilds, pots and
    beams (boosters and winners beaming to the pots), teases,
    the big win ladder, slot into Hold & Spin, Hold & Spin, a slot wheel
    bonus and three wheel-only framings. It opens by itself on the first
    visit. Between them they show the newer options, each where it fits:
    build-up shake (classic, fruit, ways, clusters, cells, portrait, free
    spins, teases, ladder and the coin and wheel slots), row lines (fruit),
    scatters kept lit through the tease (every preset with a scatter
    tease), jump with a wind-up flight (ways) or an arc (portrait), merge with a
    wind-up pull one by one (clusters), ambient particles (ways, Hold &
    Spin, wheel from above), fireworks that run to the end (ladder), Spin
    again and No win segments (slot wheel bonus, wheel only, close-up),
    every wheel landing, a centre icon of its own and a label font (wheel
    from above), retriggers (free spins, cash collector), cash and the
    collector, mystery symbols, multiplier wilds and walking wilds
    (mystery and walking wilds). The editor opens on the classic preset;
    `defaultProject()` stays plain because saved projects are filled in
    from it.
  - Project menu: new project, open and save the project file (Ctrl O,
    Ctrl S), presets, clear all rounds, reset to the demo. Undo and redo
    (Ctrl Z, Ctrl Shift Z) cover every change. Switching the game type keeps
    rounds only when they belong to the new game.
  - Settings tabs: Machine (game, reels, how it pays, look, money), Spin,
    Wins (tiers, winning symbols, win timing), Effects (intensity, win
    particles, explosion templates, titles and font), Features (Hold & Spin,
    pots above the machine), Wheel, Sound, Export (output size, frame rate
    and transparency first, then the exports). On desktop the tabs are a
    rail at the window's left edge, an icon and a name each, with the Asset
    Bank at its foot; clicking the open tab folds the settings panel away
    and gives the preview its room (any tab brings it back, and it is
    remembered; arrow keys move along the rail). Tablets and phones keep
    the tabs on top of the panel, in two rows of four when it is narrow.
    Every section folds and remembers it; Alt-click a section title folds
    them all.
  - Round inspector: the round's basics on top (outcome, symbol, amount,
    pattern; winning lines show the picked ones until you change them),
    then a card for each feature the round uses: tumbles, multipliers,
    expanding wild, multiplier wilds, extra wilds, mystery symbols, cash
    and collector, boosters. A card folds to one line or takes its feature
    out of the round; the rest wait in "Add a feature", whose items show
    their tooltip demos. Look and Spin and timing fold to one line saying
    what they are set to. Search opens a folded setting, and offers a
    feature the round does not use yet. With no rounds the inspector offers
    a first round or the quick sequence.
  - Phones: the preview stays pinned at the top with a playback strip
    (play, time, scrubber, loop, sound); a bar at the bottom switches the
    area below between Rounds and Settings and opens the Asset Bank.
    Desktop and tablet layouts are unchanged.
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
  its own comp tree. The package holds only the files the script imports
  (`aeAssetFiles` in `core/ae-export.js`; no wheel art without a wheel round,
  no titles the animation never shows, no symbols in the wheel game), and
  each identical file once (`core/pack.js`): formats and sound cues that
  match share one file.
- **MP4 preview** with sound (WebCodecs H.264, frame by frame).
- **Soundtrack (WAV)**: the whole mix as the preview plays it, 16-bit stereo
  at 48 kHz, for editing the sound elsewhere. In claude.ai it comes in a zip
  (saves there take no .wav files); the standalone file saves the .wav.
- **PNG** of the current frame (with "Transparent background" on it leaves
  out the background and vignette, like the After Effects package) and the
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
| `src/js/core/wheel.js` | The wheel's framing and screen geometry, pointer side, how pegs bend the pointer and its spring back, the almost-slip landing, and where labels and icons sit on the disc. |
| `src/js/core/tease.js` | The tease: when the other reels dim, and how a landed scatter's lit copy pops, fades or stays lit. The preview draws with it and the After Effects expressions mirror it. |
| `src/js/core/fonts.js` | Built-in and uploaded fonts, and the PostScript names After Effects asks for (read from the font file). |
| `src/js/core/winfx.js` | Winning symbols that jump into the score, merge into one or beam to the pots: landing spots and the flight curves the preview and After Effects share. |
| `src/js/core/pots.js` | Pots above the machine: their settings, where they stand, which pot serves a cell, the beam curves (arc or S, sampled evenly along their length like Trim Paths) and timing, and how a pot squashes, kicks and charges. |
| `src/js/core/particles.js` | Explosion templates and the win emitters: which moment throws which particles, and every particle's flight as a closed form (gravity, air drag, flutter) that the preview and After Effects both evaluate. |
| `src/js/core/sfx.js` | The sound cues as separate clips for the After Effects SFX comp (identical cues share a clip). |
| `src/js/core/ae-export.js` | Builds the ES3 `.jsx` for After Effects, and lists the files it imports (the package ships only those). |
| `src/js/core/pack.js` | The package's files: each identical file stored once, every reference pointed at it. |
| `src/js/core/wav.js` | 16-bit PCM WAV encoding for the soundtrack and the cue clips. |
| `src/js/render/*` | Canvas renderer, built-in sample art (classic and candy sets), effects, the sound synth. |
| `src/js/export/*` | MP4 encoder and the After Effects zip packager. |
| `src/js/ui/*` | The editor. `applies.js` says which options apply to which game and spin style, `tips.js` holds the tooltips and `demos.js` the mini demo projects. |

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
  - `Wheel/`: `Wheel Disc` is the turning part: your face art, `Wheel
    Segments`, an icon layer per segment icon and a text layer per label
    (in the label font), plus the hub and `Wheel Center` (its icon) when it
    turns. `Wheel Hub`, `Wheel
    Ring`, the bulbs and `Wheel Pointer` (anchored at its pivot) are their
    own placeholders. The pointer's rotation expression reads the disc, so
    retimed spins keep it in step.
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
  shockwaves, expanding wilds, multipliers flying into the total (a
  multiplier wild's x rides on its win comp), mystery cards turning over
  (`Mystery Block` narrowing, `Mystery Reveal` opening, while `Reveal n`
  masks cut their cells out of the reels), the collector with each cash
  value flying in and its running total, boosters (a `Boost Target`
  frame in the pot's colour, `Boost From` trembling until the hit, the new
  symbol popping, a flash and a shockwave; `Reveal n` masks cut the cell
  out of its reel), beams (`Beam Down n` / `Beam Up n`: a shape layer with
  the Bézier path drawn on by Trim Paths, soft strokes in the pot's colour
  round a white core, and a `Beam Head n` glow riding on the head; edit
  the path to reshape a beam), winners beaming to the pots (`Drained n`
  shades), titles, counters driven by
  `WIN CTRL > Amount`, the wheel rig. `Rounds/Particles/`
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
- Main comp: background, ambient particles, machine, reels, sticky wilds
  and walking wilds (each step a `Walking Wild n` layer hopping in from
  the reel it left, on the same path as the preview),
  the tease (a `Tease Dim Rn` solid per reel, scaled by `Dim %`, and a
  `Scatter Lands Rxx` copy with a shockwave for every scatter or trigger
  coin that lands, lit by expression), the pots (each a `Pot n` art
  placeholder behind the frame with a `Charge Light` copy, squashing and
  kicking by expression, then over the frame its `Glow` and its nameplate
  counter reading the `Pot n` slider), coin lock frames, marquee, logo, free spins ribbon and HUD texts, win
  meter, the round comps, particles that run to the end (`Rxx <template>`),
  a `SCREEN SHAKE` parent null, the flash, vignette, the SFX comp and a
  marker per round. With anticipation zoom on, a `CAMERA` null parents the
  shake null and the background and pushes in on the teased reels.
  `SLOT CONTROL` holds `Meter`, `FS Total`, `Collect`, `Pot 1`-`Pot 3` and the After Effects
  side controls: `Shake %`, `Flash %`, `Dim %`, `Particles %`, `Spin Blur %`,
  `Win Pop %`, `Zoom %` and `FX Colour`. With "Transparent
  background" the background and vignette start switched off; render
  ProRes 4444 with alpha from After Effects.

`assets/` holds what the script imports and nothing else: the symbols,
their win frames, pots and particle art once for every format, the sound
cues in `sfx/`, and each format's machine art, effects, titles and wheel
parts in `<W>x<H>/`. A file identical to one already stored (the same rays
or title in two formats, two cues that sound the same) is not stored again:
the script points every use at the one copy.

Preview-only: reel curvature and bloom. The AE reels are flat.
