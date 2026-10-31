// Tooltips: what an option does, in a sentence or two, and the mini demo
// that shows it (see ui/demos.js). Keys are control ids, segmented option
// ids ("<id>-<value>"), spin type cards, or "sec:<tab>/<slug>" for a
// section header. Their texts also feed the feature search. Pure.

const T = (tab, title, text, demo, rounds) => ({ tab, title, text, demo, rounds });

export const TIPS = {
  // Machine
  'sec:machine/game': T('machine', 'Game type', 'Slot machine plays reels and every slot feature. Hold & Spin is a board where coins land and lock. Wheel only is the Wheel of Fortune on its own.', 'game'),
  'm-reels': T('machine', 'Reels', 'How many reels (columns) the machine has.'),
  'm-rows': T('machine', 'Rows', 'How many symbols each reel shows.'),
  'm-peek': T('machine', 'Partial symbols', 'Shows a slice of the symbols above and below the window, like a real reel strip.', 'peek'),
  'm-curve': T('machine', 'Reel curvature', 'Bends the reels like a drum: symbols squash towards the top and bottom.', 'curve'),
  'm-row-lines': T('machine', 'Row lines', 'Thin lines between the rows across the reels.', 'row-lines'),
  'sec:features/hold-spin': T('features', 'Hold & Spin', 'Coins land and lock; the empty cells respin until the counter runs out or the board is full, then every coin is collected.', 'holdspin'),
  'm-pay': T('machine', 'Pay mode', 'How wins are found: along paylines, ways (any row on adjacent reels), anywhere on the grid, or in touching clusters.', 'pay-mode'),
  'm-scatter': T('machine', 'Scatters to trigger', 'How many scatters start a feature. One fewer is a near miss.'),
  'm-zoom': T('machine', 'Zoom', 'Scales the machine with its pots, title and win meter together, about their middle. Zoom out to fit tall pots; zoom in to fill the screen.', 'machine-zoom'),
  'm-title-on': T('machine', 'Title above the machine', 'The game\'s name (or your logo) above the reels. Off, the machine takes its room.', 'title'),
  'm-marquee': T('machine', 'Marquee bulbs', 'Chasing light bulbs around the machine frame, faster during wins.', 'marquee'),
  'm-hud': T('machine', 'Win meter', 'The bar under the reels with the bet and the win that counts up.', 'hud'),
  'm-theme': T('machine', 'Theme', 'Colours of the background, the reels and the frame.'),
  'm-pots': T('features', 'Pots above the machine', 'A pot of gold, a pot of gems and a pot of fruits stand on the frame. They fire beams that upgrade cells, and catch the win when winners beam up into them.', 'pots'),
  'm-pots-count': T('features', 'How many pots', 'One, two or three pots above the machine.'),
  'm-pot-art-0': T('features', 'Pot look', 'Gold, gems or fruits: its painted art and, by default, which symbols it takes. Your own art goes in the Asset Bank. The colour is its beams, glow and nameplate.'),
  'm-pots-band': T('features', 'Room above the machine', 'How much of the screen the pots get. The machine scales down to make room.', 'pots-band'),
  'm-pots-size': T('features', 'Pot size', 'How big the pots are.', 'pots-size'),
  'm-pots-spacing': T('features', 'Pot spacing', 'How far apart the pots stand. 1 is side by side.', 'pots-spacing'),
  'm-pots-overlap': T('features', 'Hidden behind the frame', 'How much of each pot sits behind the frame, peeking over its top edge.', 'pots-overlap'),
  'm-pots-plates': T('features', 'Pot nameplates', 'A plate on the frame under each pot shows what it caught this round, counting up with every beam.', 'plates'),
  'm-pots-aim': T('features', 'Which pot fires or catches', 'Nearest: each cell goes to the pot above its reels. By symbol: each symbol has its pot (gems to the pot of gems, fruit to the pot of fruits). Or the pots take turns, or one pot does it all.', 'pots-aim'),
  'm-pot-role-0': T('features', 'What a pot does', 'Collects wins (winners beam up into it), upgrades cells (it fires boosters), or both. A pot that does not do something passes it to the nearest one that does.'),
  'm-pots-collect': T('features', 'Winners beam up into the pots', 'Every winner fires a beam up into its pot, one by one; each catch counts up the win and the pot\'s nameplate. The same switch as Wins → Beam to pots.', 'beam-collect'),
  'm-pot-owners': T('features', 'Each symbol\'s pot', 'By symbol: the pot a symbol\'s winners beam to, and the pot that fires a booster making that symbol. Auto follows the pots\' art.'),
  'jp-on': T('features', 'Jackpot boxes', 'Grand, Major, Minor and Mini boxes around the machine. Their values are the Hold & Spin jackpots, fixed or running up. A jackpot won on the machine lights its box and pays what it shows; the Major also takes the whole screen. Jackpot coins show only their name.', 'jackpots'),
  'jp-place-above': T('features', 'Boxes above', 'A row over the machine, under the title.', 'jp-above'),
  'jp-place-below': T('features', 'Boxes below', 'A row under the machine, above the win meter.', 'jp-below'),
  'jp-place-left': T('features', 'Boxes on the left', 'A column beside the machine; the machine moves over to make room.', 'jp-left'),
  'jp-place-right': T('features', 'Boxes on the right', 'A column beside the machine; the machine moves over to make room.', 'jp-right'),
  'jp-place-sides': T('features', 'Left and right', 'Four boxes, two on each side of the machine.', 'jp-sides'),
  'jp-place-ends': T('features', 'Above and below', 'Four boxes, two above the machine and two below it.', 'jp-ends'),
  'jp-sizing-tiers': T('features', 'Sized by tier', 'The Grand biggest, then the Major, the Minor and the Mini.', 'jp-sizing'),
  'jp-sizing-same': T('features', 'All the same size', 'Every box the same size.', 'jp-sizing'),
  'jp-padding': T('features', 'Distance from the machine', 'How far the boxes stand from the frame. Below 0 they tuck over its edge.', 'jp-padding'),
  'jp-spacing': T('features', 'Space between boxes', 'The gap between one box and the next.', 'jp-spacing'),
  'jp-values-fixed': T('features', 'Fixed values', 'Each box shows its seed value, always.', 'jp-values'),
  'jp-values-running': T('features', 'Running values', 'The numbers climb like a progressive jackpot. Won, a box shows what it paid for a moment, then starts again from its seed.', 'jp-values'),
  'jp-growth': T('features', 'Running speed', 'How much of its seed a running box adds every second.', 'jp-values'),
  'jp-decimals-auto': T('features', 'Decimals as the bet', 'Amounts show cents when the bet is typed with them (1.00), whole numbers when not (1). The same setting as Machine › Money, for every amount.'),
  'jp-decimals-0': T('features', 'Whole numbers', 'Every amount without cents: 1,250.'),
  'jp-decimals-2': T('features', 'Two decimals', 'Every amount with cents, even a whole one: 1,250.00.'),
  'jp-art-names': T('bank:jackpots', 'Names on your box art', 'Writes each box\'s name on your uploaded art. Turn it off when your art already says GRAND, MAJOR and so on.'),
  'm-beam-curve-arc': T('features', 'Simple arc beams', 'Each beam bows out in one smooth curve.', 'beam-collect'),
  'm-beam-curve-s': T('features', 'S-curve beams', 'Each beam swings out one way, then the other, like a whip.', 's-curve'),
  'm-beam-bend': T('features', 'Beam bend', 'How far the beams bow out from a straight line.', 'beam-bend'),
  'm-beam-width': T('features', 'Beam thickness', 'How thick the saber beams are.', 'beam-width'),
  'm-beam-travel': T('features', 'Beam travel time', 'How long a beam takes to reach its pot or cell.', 'beam-travel'),
  'm-beam-stagger': T('features', 'Time between beams', 'The gap between one beam firing and the next.', 'beam-stagger'),
  // Spin
  'spin-type-classic': T('spin', 'Classic spin', 'All reels start together and stop one after another in the stop order.', 'spin-classic'),
  'spin-type-stagger': T('spin', 'Staggered start', 'Reels kick off one after another, like a wave.', 'spin-stagger'),
  'spin-type-turbo': T('spin', 'Turbo spin', 'A short spin: the reels slam down almost together.', 'spin-turbo'),
  'spin-type-tease': T('spin', 'Tease last reel', 'The last reel to stop always slows down with an anticipation glow.', 'spin-tease'),
  'spin-type-cascade': T('spin', 'Cascade drop', 'Symbols fall out and new ones drop in, column by column (Sweet Bonanza style).', 'spin-cascade'),
  'spin-type-cells': T('spin', 'Per-cell spin', 'Every cell is its own little reel and stops on its own.', 'spin-cells'),
  'spin-start-windup': T('spin', 'Wind-up start', 'The reels pull back a little before they spin off.', 'start-windup'),
  'spin-start-ease': T('spin', 'Ease-in start', 'The reels speed up smoothly.', 'start-ease'),
  'spin-start-instant': T('spin', 'Instant start', 'The reels jump straight to full speed.', 'start-instant'),
  'spin-end-bounce': T('spin', 'Bounce stop', 'Each reel hits its stop still moving and bounces back off it, twice, like a ball. Overshoot sets how high.', 'end-bounce'),
  'spin-end-elastic': T('spin', 'Elastic stop', 'Each reel runs past its stop and springs back and forth around it, smaller each time, before it settles. Overshoot sets how far.', 'end-elastic'),
  'spin-end-hard': T('spin', 'Hard stop', 'The reel stops dead on its symbols.', 'end-hard'),
  'spin-end-soft': T('spin', 'Soft stop', 'The reel glides to a gentle stop.', 'end-soft'),
  'spin-blur': T('spin', 'Motion blur', 'Smears the symbols while the reels spin fast.', 'blur'),
  'spin-speed': T('spin', 'Top speed', 'How fast the reels run in the middle of the spin.', 'speed'),
  'spin-mid': T('spin', 'Spin length', 'How long the reels run at full speed before stopping.', 'spin-length'),
  'spin-ss': T('spin', 'Start stagger', 'Delay between one reel starting and the next.', 'start-stagger'),
  'spin-st': T('spin', 'Stop stagger', 'Delay between one reel stopping and the next.', 'stop-stagger'),
  'spin-ant': T('spin', 'Anticipation time', 'Extra time a teased reel keeps spinning, slowly, before it lands.', 'antic-time'),
  'spin-ant-v': T('spin', 'Anticipation crawl speed', 'How fast a teased reel crawls while it builds suspense.', 'antic-crawl'),
  'spin-zoom-on': T('spin', 'Anticipation zoom', 'The camera pushes in on the teased reel, follows it from reel to reel and eases out after it lands.', 'zoom'),
  'spin-zoom': T('spin', 'Zoom amount', 'How far the camera pushes in on a teased reel.', 'zoom-amount'),
  'spin-scatter-lit': T('spin', 'Keep scatters lit through the tease', 'While a reel teases the others dim. Scatters that already landed stay lit and glowing over the dim until the teased reel lands; off, they pop and fade back into it.', 'scatter-lit'),
  'spin-stop-order': T('spin', 'Stop order', 'Which reel stops first. The tease goes to the reels that stop last.', 'stop-order'),
  // Wins
  'sec:wins/win-tiers': T('wins', 'Win tiers', 'Big wins count up through these titles (BIG, MEGA, EPIC...), each from its threshold in bets.', 'tiers'),
  'wf-style-pop': T('wins', 'Pop in place', 'Winning symbols pulse where they are while the win counts.', 'winfx-pop'),
  'wf-style-jump': T('wins', 'Jump to score', 'Winning symbols fly into the win meter (or any spot you pick), each landing counting up the win.', 'winfx-jump'),
  'wf-style-merge': T('wins', 'Magnet merge', 'Winning symbols are pulled together and fuse into one big symbol that shows the win.', 'winfx-merge'),
  'wf-style-collect': T('wins', 'Beam to the pots', 'Every winner fires a saber beam up into its pot above the machine, one by one; each catch counts up the win and the pot\'s nameplate. Needs the pots on (Features).', 'beam-collect'),
  'wf-jpath-line': T('wins', 'Straight flight', 'Winners fly in a straight line.', 'path-line'),
  'wf-jpath-arc': T('wins', 'Arc flight', 'Winners hop up in an arc, like jumping into the score.', 'path-arc'),
  'wf-jpath-back': T('wins', 'Wind-up flight', 'Winners pull back first, then shoot off.', 'path-back'),
  'wf-mpath-line': T('wins', 'Straight pull', 'Winners are pulled straight in.', 'merge-line'),
  'wf-mpath-arc': T('wins', 'Arc pull', 'Winners swing in on an arc.', 'merge-arc'),
  'wf-mpath-back': T('wins', 'Wind-up pull', 'Winners pull back, then snap in.', 'merge-back'),
  'wf-seq': T('wins', 'All at once or one by one', 'At 0 every winner is pulled in together; at 100 they come one by one and wait on the pile.', 'merge-seq'),
  'fx-lines-on': T('wins', 'Winning lines', 'Draws the payline through a line win. The winners light up either way.', 'lines'),
  'fx-pop': T('wins', 'Winning symbol pop', 'How much winning symbols grow when they pulse.', 'pop-size'),
  'fx-dim': T('wins', 'Dim other symbols', 'Darkens the symbols that are not part of the win so the winners stand out.', 'dim'),
  'sec:effects/win-particles': T('effects', 'Win particles', 'Coins, confetti and sparkles thrown by each win moment. Pick an explosion and a particle per moment.', 'particles'),
  // Effects
  'fx-shake': T('effects', 'Screen shake', 'How hard the screen shakes on landings, big wins and features.', 'shake'),
  'fx-land-shake': T('effects', 'Build-up shake', 'Every reel or cell that brings a winner lands with a bump that grows, and a note that climbs.', 'land-shake'),
  'fx-flash': T('effects', 'Flashes', 'White flashes on big moments.', 'flash'),
  'fx-rays': T('effects', 'Light rays', 'Rotating light rays behind big win titles and the wheel.', 'rays'),
  'fx-bokeh': T('effects', 'Background lights', 'Soft floating lights in the background.', 'bokeh'),
  'fx-line': T('effects', 'Payline glow', 'How strongly the paylines glow.', 'line-glow'),
  // Wheel
  'w-landing-center': T('wheel', 'Centred landing', 'The wheel stops in the middle of the segment.', 'wheel-center'),
  'w-landing-random': T('wheel', 'Natural landing', 'The wheel stops anywhere inside the segment.', 'wheel-random'),
  'w-landing-tease': T('wheel', 'Edge tease', 'The wheel stops right next to the boundary, almost on the neighbour.', 'wheel-tease'),
  'w-landing-slip': T('wheel', 'Almost slips', 'The wheel creeps into the next peg, nearly tips over, rolls back, and the pointer springs past straight.', 'wheel-slip'),
  'w-pointer-top': T('wheel', 'Pointer on top', 'The pointer hangs at the top, pointing down.', 'pointer-top'),
  'w-pointer-bottom': T('wheel', 'Pointer at the bottom', 'The pointer stands at the bottom, pointing up.', 'pointer-bottom'),
  'w-framing-full': T('wheel', 'Whole wheel', 'The whole wheel on screen.', 'frame-full'),
  'w-framing-half': T('wheel', 'Top half', 'A bigger wheel with only its top half showing.', 'frame-half'),
  'w-framing-close': T('wheel', 'Close-up', 'A huge wheel: only the cap near the pointer shows.', 'frame-close'),
  'w-framing-rise': T('wheel', 'From above', 'The wheel hangs from the top of the screen with the pointer at the bottom.', 'frame-rise'),
  'w-push': T('wheel', 'Push in on the pointer', 'The camera leans in on the pointer as the wheel slows down.', 'wheel-push'),
  'seg-k-0': T('wheel', 'Segment kind', 'Prize pays its value. Spin again spins the wheel once more. No win pays nothing.', 'wheel-again'),
  'seg-icons-all': T('wheel', 'Icons on every segment', 'Gives every segment a built-in icon, richer for bigger prizes.', 'seg-icons'),
  'w-centre-icon': T('wheel', 'Centre icon', 'The icon on the hub: the star by default, any built-in icon or your own.'),
  'w-label-height': T('wheel', 'Text height', 'How far out from the hub the segment text sits.', 'label-height'),
  'w-icon-height': T('wheel', 'Icon height', 'How far out from the hub the segment icons sit.', 'icon-height'),
  // Round inspector
  'ri-fs-wilds-sticky': T('round', 'Sticky wilds', 'Wilds that land stay put for the rest of the free spins; their reel spins on around them.', 'sticky', ['freespins']),
  'ri-fs-wilds-walking': T('round', 'Walking wilds', 'Every wild that lands in these free spins steps one reel to the left as each spin starts, until it walks off the grid.', 'walking', ['freespins']),
  'ri-fs': T('round', 'Free spins and retriggers', 'How many free spins the trigger awards. Inside free spins (marked Free spin) it is a retrigger: EXTRA SPINS shows and the counter grows by this many.', 'retrigger', ['freespins']),
  'ri-wmult': T('round', 'Multiplier wilds', 'Wilds in the win carry an x2, x3... badge. After the win shows, the badges fly in and multiply it by their sum.', 'wild-mult', ['small', 'medium', 'big']),
  'ri-mystery': T('round', 'Mystery symbols', 'Mystery blocks land, glow and turn over together into one symbol. On a win they sit on winners and reveal the winning symbol.', 'mystery', ['none', 'small', 'medium', 'big']),
  'ri-cash': T('round', 'Cash symbols', 'Coins that land carrying a value, in bets. On their own they just land; a collector takes them all.', 'cash', ['none', 'small', 'medium', 'big', 'nearmiss', 'freespins', 'bonus']),
  'ri-collector': T('round', 'Collector', 'A collector lands, on the last reel to stop when it can, and every cash value flies into it one by one, on top of the win.', 'collector', ['none', 'small', 'medium', 'big', 'nearmiss', 'freespins', 'bonus']),
  'ri-boost': T('round', 'Boosters', 'After the spin lands the pots charge up and fire beams at cells, one by one; each cell turns into a wild, a better symbol, a wild with an x value, or cash. On a win they make the win.', 'boost', ['none', 'small', 'medium', 'big', 'nearmiss', 'freespins', 'bonus', 'wheel']),
  'ri-pot-aim': T('round', 'Which pot fires or catches', 'This round only: the nearest pot, the pots in turn, or one pot.', 'pots-aim', ['none', 'small', 'medium', 'big', 'nearmiss', 'freespins', 'bonus', 'wheel']),
  'ri-mult': T('round', 'Multipliers', 'Multiplier symbols (bombs) land with the win, then fly into the total: the win is multiplied by their sum.', 'mult', ['small', 'medium', 'big']),
  'ri-extra-wilds': T('round', 'Extra wilds', 'More wilds land on the grid. On a losing spin they are placed so nothing pays.', 'extra-wilds', ['none', 'small', 'medium', 'big', 'nearmiss', 'freespins', 'bonus']),
  'ri-jackpot': T('round', 'Jackpot', 'After the round shows its win, a jackpot box lights up and what it shows flies down into the win meter, on top of the win. The Major takes the whole screen instead.', 'jackpots', ['none', 'nearmiss', 'small', 'medium', 'big', 'freespins', 'bonus', 'wheel']),
  'ri-expand': T('round', 'Expanding wild', 'A wild grows to fill its whole reel.', 'expand', ['small', 'medium', 'big']),
  'ri-tumble': T('round', 'Tumbles', 'Winners pop, the rest fall, new symbols drop in and can win again.', 'tumble', ['small', 'medium', 'big']),
};

const WHERE = { machine: 'Machine', spin: 'Spin', wins: 'Wins', effects: 'Effects', features: 'Features', wheel: 'Wheel', round: 'Round inspector', 'bank:jackpots': 'Asset Bank › Jackpot box art' };

// Search entries made from the tooltips: their words find the control.
export function tipEntries() {
  const out = [];
  for (const [key, t] of Object.entries(TIPS)) {
    if (key.startsWith('sec:')) {
      const [tab, section] = key.slice(4).split('/');
      out.push({ title: t.title, where: WHERE[tab] || tab, keys: t.text, go: { tab, section } });
    } else if (t.tab === 'round') out.push({ title: t.title, where: WHERE.round, keys: t.text, go: { id: key, round: t.rounds || 'any' } });
    else if (t.tab.startsWith('bank:')) out.push({ title: t.title, where: WHERE[t.tab] || 'Asset Bank', keys: t.text, go: { bank: t.tab.slice(5), id: key } });
    else out.push({ title: t.title, where: WHERE[t.tab] || t.tab, keys: t.text, go: { tab: t.tab, id: key } });
  }
  return out;
}
