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
  - Progressive jackpot boxes (Features tab): 2 to 4 boxes (Grand and
    Major; then the Minor; then the Mini) above, below, left or right of
    the machine; four can also split, two on each side (left and right, or
    above and below). Sized by tier or all the same; box size, distance
    from the machine (below 0 they tuck over the frame) and the space
    between them are settings, and the machine makes room (boxes on one
    side move it over, its title, pots and plaques with it). Their names,
    seed values (in bets) and colours are the Hold & Spin jackpots: the
    Mini, Minor and Major coins and the Grand prize. Values are fixed or
    running (a share of the seed added per second; the digits roll). What
    wins a box: collecting its coin, a full board (the Grand), a wheel
    segment linked to it (by its label, GRAND or JACKPOT to the Grand, or
    by choice), or a round that awards it (round inspector → Add a feature
    → Jackpot: after the win its amount flies down into the meter and
    counts on top). A won box pops, glows and a light sweeps across it, a
    ring and sparks burst from it, and a running box shows what it paid for
    a moment before it starts again from its seed; a jackpot coin landing
    makes its box blink. Each pays what its box shows at that moment. A
    Major (from a coin or a round) also takes the whole screen: MAJOR
    JACKPOT and its amount counting up, the meter counting with it, the
    collect waiting for it to end (`JP_SHOW_TIERS`). Jackpot coins show
    only their name; their box shows the value. Your own box art (Asset
    Bank › Scene) can replace each painted plate (the name written on
    it or not); in After Effects it is the plate in that box's comp. With the pots on, boxes
    stand at the sides or below. `core/jackpots.js`.
  - Pots above the machine (Features tab): a pot of gold, a pot of gems
    and a pot of fruits stand on the frame's top edge, peeking over it,
    where the title was. 1 to 3 pots; their size, spacing, how much hides
    behind the frame and how much room they get above the machine (the
    machine scales down) are settings, and each pot is gold, gems or
    fruits (painted) with a colour for its beams, glow and nameplate; your
    own art for it goes in Asset Bank › Scene. Beams are
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
- Fonts: the font picker (Effects › Titles and font, Wheel › Look) lists
  about a hundred Google Fonts by look (bold, tech and retro, classic,
  script, fun), each name written in its own font and loaded as it scrolls
  into view, with a search. Its chevron, or the field itself, folds the
  list again. Your uploaded fonts (TTF or OTF, Asset Bank ›
  Fonts or the picker's Upload button) come first and ship in the After
  Effects package. `core/fonts.js` holds the catalogue and the PostScript
  names After Effects asks for.
- Money (Machine › Money): no currency by default; pick one or type your
  own (up to four characters, "CHF "). Decimals: "As the bet" (the bet as
  typed decides: 1 gives whole numbers, 1.00 or 0.50 two decimals, shown
  even on a whole amount: 100.00), or always none or two. It applies to
  every amount (meter, big wins, coins, pots, jackpot boxes, After Effects
  counters); the jackpot boxes section has the same control.
  `moneyDecimals` in `core/coins.js`.
- Stop styles: Bounce hits the stop still moving and bounces back off it
  twice, like a ball; Elastic runs past it and springs back and forth,
  smaller each time. Overshoot sets the height of either. Staggered start
  kicks the reels off a third of a second apart.
- Sound: every cue (reel stops, anticipation, pops, count-up ticks, stings,
  coins, wheel pegs) is synthesised in sync with the animation; any cue can
  be replaced with your own file (Asset Bank › Sounds). The preview starts muted (the Sound
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
    framings and spin again). Layouts and looks (jackpot box places and
    sizes, pots, title, pay modes, paylines, wheel framings) are stills,
    each variant in turn. A demo can zoom in (close on one jackpot box for
    running values) and light its subject while the rest darkens (the
    boxes, the landing reel, the winning cells). Options that do not apply
    to the game type or spin style stay in view, greyed out and locked,
    saying why. Section headers have icons and each its own colour (a
    tinted title, never the same as the few above it). Search also reads
    the tooltip texts.
  - Help everywhere: every section title (settings, Asset Bank, Spin
    rounds) has its tooltip card, most with a demo; glossary chips and
    each symbol's role, pay and Shows up open cards too. On a phone, press
    and hold anything with a card to see it (the tap that ends the hold
    does not also press it); glossary chips open on a plain tap.
    `tests/consistency.test.js` keeps it that way: every section has an
    icon and a card, every demo is shown by a card, links and search
    point at real tabs and Asset Bank filters, and removing is a trash
    can (an X only closes or takes a chip off).
  - Asset Bank explanations stay short: each section has one line, and
    hovering its title gives the rest. Under the symbols, the built-in art
    the machine draws for a role your set lacks (the multiplier orb, the
    mystery block, the collector) shows as dashed tiles with Use your art,
    next to the cash coin's (the regular coin, changed in Coins). The
    glossary uses the app's tooltip cards: chips under the symbols (each
    role and the cash coin) and under the coins (regular, special, jackpot,
    empty cell) open the card with its demo (hover, or tap on a phone;
    tap again or elsewhere to close), as does each symbol's role menu. The bonus role has its own built-in art (the scatter star,
    BONUS) and demo.
  - Particle art: a built-in particle takes your art (one PNG, or several
    for an animation) from the upload button on its card, keeping its
    name, its motion and every place that uses it; the trash can puts the
    built-in back.
  - Symbols (Asset Bank): each has a role (normal, wild, scatter…), low or
    high pay (a round whose symbol is Auto wins with a low-pay symbol on a
    small win and a high-pay one on a bigger win) and Shows up, a stepped
    slider (only in wins, rarely, sometimes, often, very often) for how
    often it fills the reels around the wins, with its share of them. Wilds,
    scatters and the like show up only where a round puts them. Removing
    anything in the bank, a win tier, a wheel segment, a tumble win or a
    round's feature is a trash can.
  - Art and sounds live in the Asset Bank, one place for everything you
    can replace (as in After Effects, where each is a placeholder comp or
    its own layer). A side bar like the main rail picks the kind (a row
    of tabs on phones): All, Symbols, Coins, Effects (the particle art,
    and how the win effects are replaced in After Effects), Wheel, Scene
    (background, frame, logo, and the pot and jackpot box art while they
    are on; a line links to turning them on), Sounds (a play button and
    your own file for any cue, grouped as in the mix; play sounds it as
    this animation first uses it, at the track's volume and mix) and
    Fonts. A feature's own settings
    stay with the feature, which links to its art (and the art back to
    the feature): the Sound tab keeps the track, volume and mix.
  - More settings: a setting whose companions live elsewhere links to
    them (Wins › Beam to pots → Features › Pots above the machine, the
    pots → winning symbols, boosters and zoom, Hold & Spin ↔ Asset Bank ›
    Coins and the jackpot boxes, the logo ↔ Machine › Look, particles ↔
    particle art, fonts ↔ Effects › Titles and font, the wheel ↔ wheel
    art, the round inspector's overrides → their defaults). A link opens
    the tab, Asset Bank or a fitting round and highlights the setting, as
    search does.
  - Rounds: drag a round up or down in Spin rounds to reorder it (its
    number turns into a grip on hover); the arrows still work. Reel Studio
    opens paused on the first frame.
  - Presets (top bar, or P): a gallery of 19 ready-made animations with a
    frame of each: classic, fruit 3×3, 243 ways, tumbles, clusters 7×7,
    per-cell spins, mobile portrait, free spins with sticky wilds and a
    retrigger, a cash collector, mystery and walking wilds, pots and
    beams (boosters and winners beaming to the pots), teases,
    the big win ladder, slot into Hold & Spin, Hold & Spin, a slot wheel
    bonus and three wheel-only framings. The first run guide offers it.
    Between them they show the newer options, each where it fits:
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
  - First run guide (`ui/guide.js`): on the first visit a short tour
    lights each area in turn while the rest darkens (preview, playback,
    timeline, spin rounds, the round inspector, settings, search, the
    Asset Bank, the exports) with a card that explains it; arrow keys
    move, Esc closes. It ends at the presets. It shows by itself once
    (the browser remembers it); Project › Take the tour, or searching
    “tour”, runs it again any time. On phones it lights the bottom bar
    and the phone controls instead.
  - Project menu: new project, open and save the project file (Ctrl O,
    Ctrl S), presets, clear all rounds, reset to the demo, the tour. Undo and redo
    (Ctrl Z, Ctrl Shift Z) cover every change. Switching the game type keeps
    rounds only when they belong to the new game.
  - Framing (Machine tab): Zoom scales the machine with its pots, title and
    win meter together about their middle (100% fits the screen; zoom out
    to give tall pots room above them, zoom in to fill the screen). The
    title above the machine has its own switch in Machine › Look: off, the
    machine takes its room, keeping a strip for the free spins counter
    (the pots stand where the title goes, so it never shows with them). A
    logo image from the Asset Bank replaces the title text. The preview and
    the After Effects project follow both.
  - Settings tabs: Machine (game, reels, how it pays, framing, look, money), Spin,
    Wins (tiers, winning symbols, win timing), Effects (intensity, win
    particles, explosion templates, titles and font), Features (Hold & Spin,
    pots above the machine), Wheel, Sound, Export (output size, frame rate
    and transparency first, then the exports). On desktop the tabs are a
    rail at the window's left edge, an icon and a name each, with the Asset
    Bank at its foot; clicking the open tab folds the settings panel away
    and gives the preview its room (any tab brings it back, and it is
    remembered; arrow keys move along the rail). Tablets and phones keep
    the tabs on top of the panel, in two rows of four when it is narrow.
    Every section folds and remembers it. Fold all, pinned to the top of
    the settings panel and the Asset Bank, folds them all (and unfolds
    them once all are folded); Alt-click on a section title does the
    same.
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
    is a floating window you can
    move, resize and minimise (B toggles it); on phones it is a bottom
    sheet, and while it (or the guide, or a dialog) is open the page
    behind holds still, so a drag scrolls only what is on top. ? lists the keyboard shortcuts.

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
    white; each use carries a Tint named `Colour`. Each effect placeholder
    (and each title) holds an `FX CONTROLS` null whose sliders and switches
    drive every use: `Size %`, `Opacity %`, `Colour` (with the global
    `FX Colour` on `SLOT CONTROL`), `Speed %` (the shockwave), `Spin %`
    (rays), `Built-in Motion` (rays and titles: off for art that brings its
    own motion) and `Light Sweep` (titles). A prerendered movie dropped into
    a placeholder plays from the start of every use; shockwave uses last
    4 s so a movie that long plays in full. Uses read the controls of the
    comp they show (`thisLayer.source`, defaults when it has none), so a
    placeholder can be swapped for any comp and deleted. The rays are shape
    layers (wedges faded by a feathered mask), so no ray image ships.
  - `Titles/` (with the light sweep and the words as an editable text
    layer in the Main Font, switched off), `Paylines/` (each draws itself on),
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
- `Slot Assets/Fonts`: a `Main Font` layer (and `Wheel Font` with a wheel).
  Every text layer's Source Text expression takes its font from there
  (After Effects 2020+), so one font change restyles all the text. Painted
  words (titles, a logo painted from the name, jackpot names) also come as
  editable text layers, switched off, in their placeholders.
- Full-screen art is HD: titles, the logo and the particle art are painted
  `AE_HD` (2) times their size and their uses scaled down; the ray comps
  are `AE_HD` times their biggest use; counters
  are built at twice the biggest amount; the shockwave ring is drawn as big
  as its biggest use; a merged symbol is drawn from its full-size art
  (Collapse Transformations).
- The `.jsx` is plain ASCII (other characters are `\u` escapes), so After
  Effects reads it the same on a Mac and on Windows whatever encoding it
  assumes; the missing-files alert says where macOS grants folder access.
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
parts in `<W>x<H>/`. A file identical to one already stored (the same
title in two formats, two cues that sound the same) is not stored again:
the script points every use at the one copy.

Preview-only: reel curvature and bloom. The AE reels are flat.
