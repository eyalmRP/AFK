// Tooltips: what an option does, in a sentence or two, and the mini demo
// that shows it (see ui/demos.js). Keys are control ids, segmented option
// ids ("<id>-<value>"), spin type cards, or "sec:<tab>/<slug>" for a
// section header. Their texts also feed the feature search. Pure.

const T = (tab, title, text, demo, rounds) => ({ tab, title, text, demo, rounds });

export const TIPS = {
  // Machine
  'sec:machine/game': T('machine', 'Game type', 'Slot machine plays reels and every slot feature. Hold & Spin is a board where coins land and lock. Wheel only is the Wheel of Fortune on its own.'),
  'm-reels': T('machine', 'Reels', 'How many reels (columns) the machine has.'),
  'm-rows': T('machine', 'Rows', 'How many symbols each reel shows.'),
  'm-peek': T('machine', 'Partial symbols', 'Shows a slice of the symbols above and below the window, like a real reel strip.'),
  'm-curve': T('machine', 'Reel curvature', 'Bends the reels like a drum: symbols squash towards the top and bottom.'),
  'm-row-lines': T('machine', 'Row lines', 'Thin lines between the rows across the reels.', 'row-lines'),
  'sec:machine/hold-spin': T('machine', 'Hold & Spin', 'Coins land and lock; the empty cells respin until the counter runs out or the board is full, then every coin is collected.', 'holdspin'),
  'm-pay': T('machine', 'Pay mode', 'How wins are found: along paylines, ways (any row on adjacent reels), anywhere on the grid, or in touching clusters.'),
  'm-scatter': T('machine', 'Scatters to trigger', 'How many scatters start a feature. One fewer is a near miss.'),
  'm-marquee': T('machine', 'Marquee bulbs', 'Chasing light bulbs around the machine frame, faster during wins.'),
  'm-hud': T('machine', 'Win meter', 'The bar under the reels with the bet and the win that counts up.'),
  'm-theme': T('machine', 'Theme', 'Colours of the background, the reels and the frame.'),
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
  'spin-end-bounce': T('spin', 'Bounce stop', 'Each reel overshoots its stop and settles back.', 'end-bounce'),
  'spin-end-elastic': T('spin', 'Elastic stop', 'A springy stop that wobbles before it settles.', 'end-elastic'),
  'spin-end-hard': T('spin', 'Hard stop', 'The reel stops dead on its symbols.', 'end-hard'),
  'spin-end-soft': T('spin', 'Soft stop', 'The reel glides to a gentle stop.', 'end-soft'),
  'spin-blur': T('spin', 'Motion blur', 'Smears the symbols while the reels spin fast.', 'blur'),
  'spin-speed': T('spin', 'Top speed', 'How fast the reels run in the middle of the spin.'),
  'spin-mid': T('spin', 'Spin length', 'How long the reels run at full speed before stopping.'),
  'spin-ss': T('spin', 'Start stagger', 'Delay between one reel starting and the next.'),
  'spin-st': T('spin', 'Stop stagger', 'Delay between one reel stopping and the next.'),
  'spin-ant': T('spin', 'Anticipation time', 'Extra time a teased reel keeps spinning, slowly, before it lands.', 'anticipation'),
  'spin-ant-v': T('spin', 'Anticipation crawl speed', 'How fast a teased reel crawls while it builds suspense.', 'anticipation'),
  'spin-zoom-on': T('spin', 'Anticipation zoom', 'The camera pushes in on the teased reel, follows it from reel to reel and eases out after it lands.', 'zoom'),
  'spin-zoom': T('spin', 'Zoom amount', 'How far the camera pushes in on a teased reel.', 'zoom'),
  'spin-scatter-lit': T('spin', 'Keep scatters lit through the tease', 'While a reel teases the others dim. Scatters that already landed stay lit and glowing over the dim until the teased reel lands; off, they pop and fade back into it.', 'scatter-lit'),
  'spin-stop-order': T('spin', 'Stop order', 'Which reel stops first. The tease goes to the reels that stop last.'),
  // Wins
  'sec:wins/win-tiers': T('wins', 'Win tiers', 'Big wins count up through these titles (BIG, MEGA, EPIC...), each from its threshold in bets.', 'tiers'),
  'wf-style-pop': T('wins', 'Pop in place', 'Winning symbols pulse where they are while the win counts.', 'winfx-pop'),
  'wf-style-jump': T('wins', 'Jump to score', 'Winning symbols fly into the win meter (or any spot you pick), each landing counting up the win.', 'winfx-jump'),
  'wf-style-merge': T('wins', 'Magnet merge', 'Winning symbols are pulled together and fuse into one big symbol that shows the win.', 'winfx-merge'),
  'wf-jpath-line': T('wins', 'Straight flight', 'Winners fly in a straight line.', 'path-line'),
  'wf-jpath-arc': T('wins', 'Arc flight', 'Winners hop up in an arc, like jumping into the score.', 'path-arc'),
  'wf-jpath-back': T('wins', 'Wind-up flight', 'Winners pull back first, then shoot off.', 'path-back'),
  'wf-mpath-line': T('wins', 'Straight pull', 'Winners are pulled straight in.', 'merge-line'),
  'wf-mpath-arc': T('wins', 'Arc pull', 'Winners swing in on an arc.', 'merge-arc'),
  'wf-mpath-back': T('wins', 'Wind-up pull', 'Winners pull back, then snap in.', 'merge-back'),
  'wf-seq': T('wins', 'All at once or one by one', 'At 0 every winner is pulled in together; at 100 they come one by one and wait on the pile.', 'merge-seq'),
  'fx-lines-on': T('wins', 'Winning lines', 'Draws the payline through a line win. The winners light up either way.', 'lines'),
  'fx-pop': T('wins', 'Winning symbol pop', 'How much winning symbols grow when they pulse.', 'winfx-pop'),
  'fx-dim': T('wins', 'Dim other symbols', 'Darkens the symbols that are not part of the win so the winners stand out.', 'winfx-pop'),
  'sec:wins/win-particles': T('wins', 'Win particles', 'Coins, confetti and sparkles thrown by each win moment. Pick an explosion and a particle per moment.', 'particles'),
  // Effects
  'fx-shake': T('effects', 'Screen shake', 'How hard the screen shakes on landings, big wins and features.', 'shake'),
  'fx-land-shake': T('effects', 'Build-up shake', 'Every reel or cell that brings a winner lands with a bump that grows, and a note that climbs.', 'land-shake'),
  'fx-flash': T('effects', 'Flashes', 'White flashes on big moments.'),
  'fx-rays': T('effects', 'Light rays', 'Rotating light rays behind big win titles and the wheel.'),
  'fx-bokeh': T('effects', 'Background lights', 'Soft floating lights in the background.'),
  'fx-line': T('effects', 'Payline glow', 'How strongly the paylines glow.', 'lines'),
  // Wheel
  'w-landing-center': T('wheel', 'Centred landing', 'The wheel stops in the middle of the segment.', 'wheel-center'),
  'w-landing-random': T('wheel', 'Natural landing', 'The wheel stops anywhere inside the segment.', 'wheel-random'),
  'w-landing-tease': T('wheel', 'Edge tease', 'The wheel stops right next to the boundary, almost on the neighbour.', 'wheel-tease'),
  'w-landing-slip': T('wheel', 'Almost slips', 'The wheel creeps into the next peg, nearly tips over, rolls back, and the pointer springs past straight.', 'wheel-slip'),
  'w-pointer-top': T('wheel', 'Pointer on top', 'The pointer hangs at the top, pointing down.', 'wheel-center'),
  'w-pointer-bottom': T('wheel', 'Pointer at the bottom', 'The pointer stands at the bottom, pointing up.', 'pointer-bottom'),
  'w-framing-full': T('wheel', 'Whole wheel', 'The whole wheel on screen.', 'wheel-center'),
  'w-framing-half': T('wheel', 'Top half', 'A bigger wheel with only its top half showing.', 'frame-half'),
  'w-framing-close': T('wheel', 'Close-up', 'A huge wheel: only the cap near the pointer shows.', 'frame-close'),
  'w-framing-rise': T('wheel', 'From above', 'The wheel hangs from the top of the screen with the pointer at the bottom.', 'frame-rise'),
  'w-push': T('wheel', 'Push in on the pointer', 'The camera leans in on the pointer as the wheel slows down.', 'wheel-push'),
  'seg-k-0': T('wheel', 'Segment kind', 'Prize pays its value. Spin again spins the wheel once more. No win pays nothing.', 'wheel-again'),
  'seg-icons-all': T('wheel', 'Icons on every segment', 'Gives every segment a built-in icon, richer for bigger prizes.'),
  'w-centre-icon': T('wheel', 'Centre icon', 'The icon on the hub: the star by default, any built-in icon or your own.'),
  'w-label-height': T('wheel', 'Text height', 'How far out from the hub the segment text sits.'),
  'w-icon-height': T('wheel', 'Icon height', 'How far out from the hub the segment icons sit.'),
  // Round inspector
  'ri-fs-sticky': T('round', 'Sticky wilds', 'Wilds that land stay put for the rest of the free spins; their reel spins on around them.', 'sticky', ['freespins']),
  'ri-expand': T('round', 'Expanding wild', 'A wild grows to fill its whole reel.', 'expand', ['small', 'medium', 'big']),
  'ri-tumble': T('round', 'Tumbles', 'Winners pop, the rest fall, new symbols drop in and can win again.', 'tumble', ['small', 'medium', 'big']),
};

const WHERE = { machine: 'Machine', spin: 'Spin', wins: 'Wins', effects: 'Effects', wheel: 'Wheel', round: 'Round inspector' };

// Search entries made from the tooltips: their words find the control.
export function tipEntries() {
  const out = [];
  for (const [key, t] of Object.entries(TIPS)) {
    if (key.startsWith('sec:')) {
      const [tab, section] = key.slice(4).split('/');
      out.push({ title: t.title, where: WHERE[tab] || tab, keys: t.text, go: { tab, section } });
    } else if (t.tab === 'round') out.push({ title: t.title, where: WHERE.round, keys: t.text, go: { id: key, round: t.rounds || 'any' } });
    else out.push({ title: t.title, where: WHERE[t.tab] || t.tab, keys: t.text, go: { tab: t.tab, id: key } });
  }
  return out;
}
