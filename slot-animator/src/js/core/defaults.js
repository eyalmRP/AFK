// Default project, themes, presets and built-in symbol sets. A project is
// plain JSON: it can be saved, loaded and diffed, and fully determines the
// animation.

import { defaultParticles } from './particles.js';
import { defaultWinFx } from './winfx.js';

export const OUTCOMES = [
  { id: 'none', label: 'No win', list: 'No win', short: 'No win', color: '#56607a' },
  { id: 'nearmiss', label: 'Near miss', list: 'Near miss', short: 'Near miss', color: '#8d7cf0' },
  { id: 'small', label: 'Small win', list: 'Small win', short: 'Small', color: '#3fb0ff' },
  { id: 'medium', label: 'Medium win', list: 'Medium win', short: 'Medium', color: '#25cf96' },
  { id: 'big', label: 'Big win (counts through your tiers)', list: 'Big win', short: 'BIG', color: '#ffb13d' },
  { id: 'freespins', label: 'Free spins trigger', list: 'Free spins', short: 'Free spins', color: '#b46cff' },
  { id: 'bonus', label: 'Bonus trigger', list: 'Bonus', short: 'Bonus', color: '#e36cff' },
  { id: 'wheel', label: 'Wheel of Fortune bonus', list: 'Wheel bonus', short: 'Wheel', color: '#ff5fd2' },
  { id: 'fstotal', label: 'Free spins total', list: 'Free spins total', short: 'Total', color: '#ff3d7f' },
  { id: 'hstrigger', label: 'Hold & Spin trigger (coins land)', list: 'Hold & Spin trigger', short: 'H&S', color: '#ffd23d' },
  { id: 'respin', label: 'Respin (coins land, or nothing)', list: 'Respin', short: 'Respin', color: '#41c9ff' },
  { id: 'collect', label: 'Collect the coins', list: 'Collect', short: 'Collect', color: '#ff8a1f' },
];

export const OUTCOME_BY_ID = Object.fromEntries(OUTCOMES.map((o) => [o.id, o]));

// Game types. A slot machine plays any round; Hold & Spin is a board of
// per-cell respins where coins land and lock; the wheel game is just the
// Wheel of Fortune with no machine.
export const GAMES = [
  { id: 'slot', label: 'Slot machine', hint: 'Reels, wins, tumbles, free spins, bonus rounds. A Hold & Spin trigger round switches to the coin board.' },
  { id: 'holdspin', label: 'Hold & Spin', hint: 'Every cell spins on its own and lands a coin or stays empty. Coins lock; respins run until the counter runs out or the board is full.' },
  { id: 'wheel', label: 'Wheel only', hint: 'The Wheel of Fortune on its own, spin after spin, with no machine.' },
];

export const GAME_OUTCOMES = {
  slot: OUTCOMES.map((o) => o.id),
  holdspin: ['respin', 'collect', 'wheel'],
  wheel: ['wheel'],
};

export const HS_OUTCOMES = ['hstrigger', 'respin', 'collect'];

export const LINE_WINS = ['small', 'medium', 'big'];
export const BIG_WINS = ['big'];
export const SCATTER_WINS = ['freespins', 'bonus', 'wheel'];

export const PAY_MODES = [
  { id: 'lines', label: 'Paylines', hint: 'Matching symbols from the left along a line.' },
  { id: 'ways', label: 'Ways', hint: 'A symbol on adjacent reels from the left, any row.' },
  { id: 'anywhere', label: 'Pay anywhere', hint: 'Enough of one symbol anywhere on the grid (Sweet Bonanza style).' },
  { id: 'cluster', label: 'Clusters', hint: 'A group of touching symbols.' },
];

export const SPIN_TYPES = [
  { id: 'classic', label: 'Classic', hint: 'All reels start together and stop in the stop order.' },
  { id: 'stagger', label: 'Staggered start', hint: 'Reels kick off one after another, like a wave.' },
  { id: 'turbo', label: 'Turbo', hint: 'Short spin, reels slam down almost together.' },
  { id: 'tease', label: 'Tease last reel', hint: 'The last reel in the stop order always slows down with an anticipation glow.' },
  { id: 'cascade', label: 'Cascade drop', hint: 'Symbols fall out and new ones drop in (Sweet Bonanza style).' },
  { id: 'cells', label: 'Per-cell spin', hint: 'Every cell is its own little reel (hold and spin style).' },
];

export const SPIN_PRESETS = {
  classic: { startStagger: 0.06, stopStagger: 0.2, midDuration: 1.1, endStyle: 'bounce', startStyle: 'windup' },
  stagger: { startStagger: 0.16, stopStagger: 0.26, midDuration: 1.0, endStyle: 'bounce', startStyle: 'windup' },
  turbo: { startStagger: 0, stopStagger: 0.05, midDuration: 0.55, endStyle: 'hard', startStyle: 'instant' },
  tease: { startStagger: 0.06, stopStagger: 0.22, midDuration: 1.0, endStyle: 'elastic', startStyle: 'windup' },
  cascade: { startStagger: 0.07, stopStagger: 0.09, midDuration: 0.3, endStyle: 'bounce', startStyle: 'ease' },
  cells: { startStagger: 0.03, stopStagger: 0.07, midDuration: 0.7, endStyle: 'bounce', startStyle: 'windup' },
};

export const ORDERS = [
  { id: 'ltr', label: 'Left to right' },
  { id: 'rtl', label: 'Right to left' },
  { id: 'center', label: 'Centre out' },
  { id: 'edges', label: 'Outside in' },
  { id: 'random', label: 'Random' },
  { id: 'custom', label: 'Custom' },
];

export const CELL_ORDERS = [
  { id: 'columns', label: 'Reel by reel' },
  { id: 'rows', label: 'Row by row' },
  { id: 'spiral', label: 'Spiral' },
  { id: 'center', label: 'Centre out' },
  { id: 'random', label: 'Random' },
];

export const THEMES = {
  royal: {
    name: 'Royal Purple',
    bg: ['#3a0f66', '#12042a', '#050010'],
    reel: ['#1d1038', '#0b0618'],
    divider: '#e9c46a',
    metal: 'gold',
    accent: '#ffd25a',
    glow: '#b06bff',
    bokeh: ['#ffd25a', '#ff6ad5', '#8c7bff'],
    hud: '#140a26',
  },
  emerald: {
    name: 'Emerald Casino',
    bg: ['#0d5a3c', '#03261a', '#010c07'],
    reel: ['#0c2a1f', '#04130d'],
    divider: '#f0d27a',
    metal: 'gold',
    accent: '#ffe08a',
    glow: '#3dffb0',
    bokeh: ['#ffe08a', '#7dffcf', '#d6ff7a'],
    hud: '#06170f',
  },
  neon: {
    name: 'Neon Night',
    bg: ['#1a1060', '#070a26', '#01020a'],
    reel: ['#0c0f2e', '#04050f'],
    divider: '#33e6ff',
    metal: 'neon',
    accent: '#3ff0ff',
    glow: '#ff3fd8',
    bokeh: ['#3ff0ff', '#ff3fd8', '#8f7bff'],
    hud: '#060820',
  },
  vegas: {
    name: 'Classic Vegas',
    bg: ['#8a0d1f', '#3a0309', '#120002'],
    reel: ['#fffaf0', '#e4dac4'],
    divider: '#c9ced6',
    metal: 'chrome',
    accent: '#ffe27a',
    glow: '#ff3b3b',
    bokeh: ['#ffe27a', '#ff6b6b', '#ffffff'],
    hud: '#1a0205',
    lightReels: true,
  },
  candy: {
    name: 'Candy Land',
    bg: ['#ff9ad5', '#b45bd6', '#3a1e7a'],
    reel: ['#fff1fb', '#f6c9ec'],
    divider: '#ffffff',
    metal: 'rose',
    accent: '#fff07a',
    glow: '#ff5fb8',
    bokeh: ['#ffffff', '#fff07a', '#8ff3ff'],
    hud: '#3a1450',
    lightReels: true,
    glass: true,
  },
};

export const BUILTIN_SYMBOLS = [
  { builtin: 'cherry', name: 'Cherry', role: 'normal', tier: 'low', weight: 10 },
  { builtin: 'bell', name: 'Bell', role: 'normal', tier: 'low', weight: 9 },
  { builtin: 'bar', name: 'BAR', role: 'normal', tier: 'low', weight: 9 },
  { builtin: 'emerald', name: 'Emerald', role: 'normal', tier: 'low', weight: 8 },
  { builtin: 'ruby', name: 'Ruby', role: 'normal', tier: 'low', weight: 8 },
  { builtin: 'diamond', name: 'Diamond', role: 'normal', tier: 'high', weight: 6 },
  { builtin: 'crown', name: 'Crown', role: 'normal', tier: 'high', weight: 5 },
  { builtin: 'seven', name: 'Lucky 7', role: 'normal', tier: 'high', weight: 4 },
  { builtin: 'wild', name: 'Wild', role: 'wild', tier: 'high', weight: 0 },
  { builtin: 'scatter', name: 'Scatter', role: 'scatter', tier: 'high', weight: 0 },
  { builtin: 'orb', name: 'Multiplier', role: 'multiplier', tier: 'high', weight: 0 },
];

export const CANDY_SYMBOLS = [
  { builtin: 'banana', name: 'Banana', role: 'normal', tier: 'low', weight: 10 },
  { builtin: 'grapes', name: 'Grapes', role: 'normal', tier: 'low', weight: 10 },
  { builtin: 'watermelon', name: 'Watermelon', role: 'normal', tier: 'low', weight: 9 },
  { builtin: 'apple', name: 'Apple', role: 'normal', tier: 'low', weight: 9 },
  { builtin: 'candyBlue', name: 'Blue Candy', role: 'normal', tier: 'high', weight: 7 },
  { builtin: 'candyGreen', name: 'Green Candy', role: 'normal', tier: 'high', weight: 7 },
  { builtin: 'candyPurple', name: 'Purple Candy', role: 'normal', tier: 'high', weight: 6 },
  { builtin: 'candyHeart', name: 'Heart Candy', role: 'normal', tier: 'high', weight: 5 },
  { builtin: 'lollipop', name: 'Lollipop', role: 'scatter', tier: 'high', weight: 0 },
  { builtin: 'orb', name: 'Bomb', role: 'multiplier', tier: 'high', weight: 0 },
];

export const DEFAULT_SEGMENTS = [
  { label: '50', value: 50, color: '#b3123b' },
  { label: '500', value: 500, color: '#1f3fbf' },
  { label: '100', value: 100, color: '#0e8a4f' },
  { label: 'JACKPOT', value: 5000, color: '#d49a12' },
  { label: '75', value: 75, color: '#6a1fb8' },
  { label: '250', value: 250, color: '#b3123b' },
  { label: '150', value: 150, color: '#1f3fbf' },
  { label: '1000', value: 1000, color: '#0e8a4f' },
  { label: '25', value: 25, color: '#6a1fb8' },
  { label: '300', value: 300, color: '#b3123b' },
  { label: '200', value: 200, color: '#1f3fbf' },
  { label: '750', value: 750, color: '#0e8a4f' },
];

export const TITLE_PALETTE_NAMES = ['gold', 'fire', 'violet', 'aqua', 'rose', 'silver'];
export const COIN_PALETTES = ['gold', 'fire', 'violet', 'aqua', 'emerald', 'rose', 'silver'];

// The Hold & Spin coin set: its own symbols, separate from the machine's.
// Values are in bets; a coin shows value × bet.
export function defaultHoldSpin() {
  return {
    respins: 3,
    reset: true,
    startCoins: 0,
    respinMid: 0.45,
    coins: [
      { id: 'coin', name: 'Coin', label: '', palette: 'gold', values: [1, 2, 3, 5, 8, 10, 15, 20], src: null },
      { id: 'mega', name: 'Mega coin', label: 'MEGA', palette: 'fire', values: [50], src: null },
      { id: 'super', name: 'Super coin', label: 'SUPER', palette: 'violet', values: [100], src: null },
      { id: 'ultra', name: 'Ultra coin', label: 'ULTRA', palette: 'aqua', values: [250], src: null },
    ],
    emptySrc: null,
    grand: { enabled: true, value: 1000 },
  };
}

export function defaultTiers() {
  return [
    { id: 'tier1', title: 'BIG WIN', x: 15, palette: 'gold', particles: { fx: 'fountain', asset: 'coin' } },
    { id: 'tier2', title: 'MEGA WIN', x: 40, palette: 'fire', particles: { fx: 'rain', asset: 'coin' } },
    { id: 'tier3', title: 'EPIC WIN', x: 80, palette: 'violet', particles: { fx: 'fireworks', asset: 'star' } },
  ];
}

export const SOUND_EVENTS = [
  { id: 'spinStart', label: 'Spin start', group: 'reels' },
  { id: 'spinLoop', label: 'Reels spinning', group: 'reels' },
  { id: 'reelStop', label: 'Reel stop', group: 'reels' },
  { id: 'anticipation', label: 'Anticipation riser', group: 'reels' },
  { id: 'scatter', label: 'Scatter lands', group: 'wins' },
  { id: 'win', label: 'Line or cluster win', group: 'wins' },
  { id: 'pop', label: 'Tumble pop', group: 'wins' },
  { id: 'drop', label: 'Tumble drop', group: 'reels' },
  { id: 'count', label: 'Count-up ticks', group: 'wins' },
  { id: 'countEnd', label: 'Count-up slam', group: 'wins' },
  { id: 'bigWin', label: 'Big win sting', group: 'bigwin' },
  { id: 'tierUp', label: 'Tier up hit', group: 'bigwin' },
  { id: 'coins', label: 'Coin shower', group: 'coins' },
  { id: 'mult', label: 'Multiplier collect', group: 'wins' },
  { id: 'expand', label: 'Wild expands', group: 'wins' },
  { id: 'sticky', label: 'Wild sticks', group: 'wins' },
  { id: 'fsTrigger', label: 'Free spins fanfare', group: 'bigwin' },
  { id: 'wheelTick', label: 'Wheel peg tick', group: 'reels' },
  { id: 'wheelLand', label: 'Wheel lands', group: 'bigwin' },
  { id: 'whoosh', label: 'Whoosh', group: 'ui' },
  { id: 'coinLand', label: 'Coin lands and locks', group: 'wins' },
  { id: 'cellStop', label: 'Empty cell stops', group: 'reels' },
  { id: 'respinReset', label: 'Respins reset', group: 'ui' },
  { id: 'collect', label: 'Coin collected', group: 'coins' },
  { id: 'scoreHit', label: 'Symbol lands in the score', group: 'wins' },
  { id: 'magnet', label: 'Symbols pulled together', group: 'wins' },
  { id: 'merge', label: 'Symbols merge into one', group: 'wins' },
];

let roundCounter = 0;
export function newRound(outcome = 'none', extra = {}) {
  roundCounter += 1;
  return {
    id: `r${Date.now().toString(36)}${roundCounter}`,
    outcome,
    symbol: 'auto',
    pattern: null,
    lines: outcome === 'medium' ? [3] : outcome === 'big' ? [0, 3] : [0],
    cells: [],
    count: outcome === 'small' ? 3 : outcome === 'medium' ? 4 : 5,
    amount: null,
    tier: 1,
    midDuration: null,
    hold: 0,
    seed: Math.floor(Math.random() * 1e6),
    wildAssist: outcome === 'big',
    expandWild: false,
    extraWilds: 0,
    sticky: false,
    free: false,
    tumble: null,
    chain: [],
    multipliers: [],
    antic: 'auto',
    stopOrder: null,
    wheelSegment: 3,
    freeSpins: 10,
    coinsIn: outcome === 'hstrigger' ? 6 : outcome === 'respin' ? 1 : 0,
    specials: [],
    fill: false,
    scatterCount: null,
    nearMissReel: null,
    ...extra,
  };
}

function baseProject() {
  return {
    version: 2,
    game: 'slot',
    name: 'Royal Sevens',
    seed: 7,
    canvas: { width: 1920, height: 1080, fps: 30 },
    grid: { reels: 5, rows: 3, peek: 0.18, curvature: 0.3, cellAspect: 0.92 },
    machine: {
      theme: 'royal',
      title: 'ROYAL SEVENS',
      showHud: true,
      marquee: true,
      bet: 1,
      currency: '$',
      decimals: 2,
      maxLines: 20,
      builtinFrame: true,
      payMode: 'lines',
      minAnywhere: 8,
      minCluster: 5,
      scatterTrigger: 3,
    },
    spin: {
      type: 'classic',
      direction: 'down',
      startStyle: 'windup',
      startDuration: 0.34,
      windup: 0.3,
      midDuration: 1.1,
      speed: 24,
      blur: 0.85,
      endStyle: 'bounce',
      endDuration: 0.42,
      overshoot: 0.26,
      startStagger: 0.06,
      stopStagger: 0.2,
      anticipation: 1.5,
      anticipationSpeed: 7,
      startOrder: 'ltr',
      stopOrder: 'ltr',
      customStart: [],
      customStop: [],
      reelDelay: [],
      cellOrder: 'columns',
    },
    effects: {
      dim: 0.62,
      popScale: 0.14,
      lineGlow: 1,
      sparkles: 1,
      coins: 1,
      rays: 1,
      shake: 1,
      flash: 1,
      bloom: 0.5,
      bokeh: 1,
      font: 'Bungee',
      titles: {
        bonus: 'BONUS!',
        freespins: 'FREE SPINS',
        wheel: 'WHEEL BONUS',
        nearmiss: 'SO CLOSE!',
        total: 'TOTAL WIN',
        holdspin: 'HOLD & SPIN',
        grand: 'GRAND',
      },
    },
    tiers: defaultTiers(),
    timing: {
      intro: 0.6,
      gap: 0.3,
      outro: 0.9,
      none: 0.45,
      nearmiss: 1.3,
      small: 2.2,
      medium: 2.8,
      bigLines: 1.3,
      tierCount: 2.4,
      bigHold: 1.6,
      celebrate: 1.8,
      banner: 2.6,
      wheelSpin: 5.2,
      tumbleShow: 1.0,
      tumblePop: 0.36,
      tumbleFall: 0.34,
      multEach: 0.5,
      expand: 0.7,
      collectEach: 0.22,
    },
    wheel: {
      segments: DEFAULT_SEGMENTS.map((s) => ({ ...s })),
      turns: 5,
      landing: 'tease',
      multiplyByBet: true,
    },
    sound: {
      enabled: true,
      volume: 0.8,
      mix: { reels: 1, wins: 1, coins: 0.8, bigwin: 1, ui: 0.7 },
      custom: {},
    },
    output: { transparent: false, formats: ['1920x1080'] },
    holdspin: defaultHoldSpin(),
    particles: defaultParticles(),
    winfx: defaultWinFx(),
    symbols: BUILTIN_SYMBOLS.map((s, i) => ({ id: `s${i}`, src: null, winAnim: null, ...s })),
    assets: { background: null, frame: null, logo: null },
    rounds: [],
  };
}

export function defaultProject() {
  const p = baseProject();
  p.rounds = [
    newRound('none', { seed: 11 }),
    newRound('small', { seed: 12, lines: [0], count: 3 }),
    newRound('none', { seed: 13 }),
    newRound('nearmiss', { seed: 14 }),
    newRound('big', { seed: 15, lines: [0, 3], count: 5, symbol: 's7', tier: 1 }),
    newRound('wheel', { seed: 16, wheelSegment: 3 }),
  ];
  return p;
}

// Sweet Bonanza style: 6x5, pay anywhere (8+), tumbles, multiplier bombs,
// 4 scatters trigger free spins with a running total.
export function candyProject() {
  const p = baseProject();
  p.name = 'Candy Tumble';
  p.seed = 21;
  p.grid = { reels: 6, rows: 5, peek: 0, curvature: 0, cellAspect: 0.86 };
  Object.assign(p.machine, { theme: 'candy', title: 'SUGAR TUMBLE', marquee: false, payMode: 'anywhere', minAnywhere: 8, scatterTrigger: 4, decimals: 2 });
  Object.assign(p.spin, { type: 'cascade', ...SPIN_PRESETS.cascade, blur: 0.6 });
  p.effects.font = 'Lilita One';
  p.symbols = CANDY_SYMBOLS.map((s, i) => ({ id: `c${i}`, src: null, winAnim: null, ...s }));
  p.tiers = [
    { id: 'tier1', title: 'NICE WIN', x: 10, palette: 'rose', particles: { fx: 'fountain', asset: 'gem' } },
    { id: 'tier2', title: 'MEGA WIN', x: 30, palette: 'fire', particles: { fx: 'cannons', asset: 'confetti' } },
    { id: 'tier3', title: 'SENSATIONAL', x: 75, palette: 'violet', particles: { fx: 'fireworks', asset: 'star' } },
  ];
  Object.assign(p.particles, { small: { fx: 'burst-s', asset: 'star' }, medium: { fx: 'burst-m', asset: 'gem' }, total: { fx: 'rain', asset: 'confetti' } });
  const fs = { free: true };
  p.rounds = [
    newRound('none', { seed: 31 }),
    newRound('small', { seed: 32, count: 8, chain: [{ symbol: 'auto', count: 8 }] }),
    newRound('nearmiss', { seed: 33 }),
    newRound('freespins', { seed: 34, freeSpins: 10 }),
    newRound('small', { seed: 35, ...fs, count: 9, multipliers: [5] }),
    newRound('none', { seed: 36, ...fs }),
    newRound('medium', { seed: 37, ...fs, count: 10, chain: [{ symbol: 'auto', count: 8 }, { symbol: 'auto', count: 9 }], multipliers: [2, 10] }),
    newRound('big', { seed: 38, ...fs, count: 12, tier: 2, chain: [{ symbol: 'auto', count: 10 }, { symbol: 'auto', count: 8 }], multipliers: [25, 50] }),
    newRound('fstotal', { seed: 39 }),
  ];
  return p;
}

// Hold and spin style: every cell spins on its own.
export function cellsProject() {
  const p = baseProject();
  p.name = 'Cell Spin';
  p.seed = 41;
  Object.assign(p.machine, { theme: 'emerald', title: 'LUCKY CELLS' });
  Object.assign(p.spin, { type: 'cells', ...SPIN_PRESETS.cells, cellOrder: 'spiral' });
  p.grid.curvature = 0;
  p.rounds = [
    newRound('none', { seed: 51 }),
    newRound('medium', { seed: 52, lines: [3], count: 4 }),
    newRound('big', { seed: 53, lines: [0, 1, 2], count: 5, tier: 0, wildAssist: true, expandWild: true }),
  ];
  return p;
}

// Hold & Spin: the board starts with a few coins, respins land more (or
// nothing), the counter resets on every hit, and the last respins fill the
// board for the grand.
export function holdSpinProject() {
  const p = baseProject();
  p.game = 'holdspin';
  p.name = 'Coin Rush';
  p.seed = 61;
  Object.assign(p.machine, { theme: 'royal', title: 'COIN RUSH' });
  p.grid.curvature = 0;
  p.grid.peek = 0;
  p.holdspin.startCoins = 4;
  const r = (coinsIn, extra = {}) => newRound('respin', { coinsIn, ...extra });
  p.rounds = [r(2, { seed: 71 }), r(0, { seed: 72 }), r(1, { seed: 73 }), r(0, { seed: 74 }), r(0, { seed: 75 }), r(2, { seed: 76, specials: ['mega'] }), r(1, { seed: 77 }), r(0, { seed: 78 }), r(0, { seed: 79 }), r(1, { seed: 80, specials: ['super'] }), r(0, { seed: 81, fill: true, specials: ['ultra'] }), newRound('collect', { seed: 82 })];
  return p;
}

// Just the wheel: three spins, the last one on the jackpot.
export function wheelProject() {
  const p = baseProject();
  p.game = 'wheel';
  p.name = 'Wheel of Fortune';
  p.seed = 91;
  p.machine.title = 'WHEEL OF FORTUNE';
  p.rounds = [newRound('wheel', { seed: 92, wheelSegment: 2 }), newRound('wheel', { seed: 93, wheelSegment: 5 }), newRound('wheel', { seed: 94, wheelSegment: 3 })];
  return p;
}

export const PRESETS = [
  { id: 'classic', label: 'Classic 5×3 paylines', make: defaultProject },
  { id: 'candy', label: 'Tumble 6×5 pay anywhere (Sweet Bonanza style)', make: candyProject },
  { id: 'cells', label: 'Per-cell spins 5×3', make: cellsProject },
  { id: 'holdspin', label: 'Hold & Spin coins (fills the board)', make: holdSpinProject },
  { id: 'wheel', label: 'Wheel of Fortune only', make: wheelProject },
];
