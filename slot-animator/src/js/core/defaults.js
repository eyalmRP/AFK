// Default project, themes and built-in symbol set. A project is plain JSON:
// it can be saved, loaded and diffed, and fully determines the animation.

export const OUTCOMES = [
  { id: 'none', label: 'No win', list: 'No win', short: 'No win', color: '#56607a' },
  { id: 'nearmiss', label: 'Near miss', list: 'Near miss', short: 'Near miss', color: '#8d7cf0' },
  { id: 'small', label: 'Small win', list: 'Small win', short: 'Small', color: '#3fb0ff' },
  { id: 'medium', label: 'Medium win', list: 'Medium win', short: 'Medium', color: '#25cf96' },
  { id: 'big', label: 'Big win', list: 'Big win', short: 'BIG', color: '#ffc53d' },
  { id: 'mega', label: 'Mega win', list: 'Mega win', short: 'MEGA', color: '#ff8a3d' },
  { id: 'epic', label: 'Epic win', list: 'Epic win', short: 'EPIC', color: '#ff3d7f' },
  { id: 'freespins', label: 'Free spins trigger', list: 'Free spins', short: 'Free spins', color: '#b46cff' },
  { id: 'bonus', label: 'Bonus trigger', list: 'Bonus', short: 'Bonus', color: '#e36cff' },
  { id: 'wheel', label: 'Wheel of Fortune bonus', list: 'Wheel bonus', short: 'Wheel', color: '#ff5fd2' },
];

export const OUTCOME_BY_ID = Object.fromEntries(OUTCOMES.map((o) => [o.id, o]));

export const LINE_WINS = ['small', 'medium', 'big', 'mega', 'epic'];
export const BIG_WINS = ['big', 'mega', 'epic'];
export const SCATTER_WINS = ['freespins', 'bonus', 'wheel'];

export const SPIN_TYPES = [
  { id: 'classic', label: 'Classic', hint: 'All reels start together, stop left to right.' },
  { id: 'stagger', label: 'Staggered start', hint: 'Reels kick off one after another, like a wave.' },
  { id: 'turbo', label: 'Turbo', hint: 'Short spin, reels slam down almost together.' },
  { id: 'tease', label: 'Tease last reel', hint: 'The last reel always slows down with an anticipation glow.' },
  { id: 'cascade', label: 'Cascade drop', hint: 'Symbols fall out and new ones drop in (tumble style).' },
];

export const SPIN_PRESETS = {
  classic: { startStagger: 0.06, stopStagger: 0.2, midDuration: 1.1, endStyle: 'bounce', startStyle: 'windup' },
  stagger: { startStagger: 0.16, stopStagger: 0.26, midDuration: 1.0, endStyle: 'bounce', startStyle: 'windup' },
  turbo: { startStagger: 0, stopStagger: 0.05, midDuration: 0.55, endStyle: 'hard', startStyle: 'instant' },
  tease: { startStagger: 0.06, stopStagger: 0.22, midDuration: 1.0, endStyle: 'elastic', startStyle: 'windup' },
  cascade: { startStagger: 0.07, stopStagger: 0.09, midDuration: 0.3, endStyle: 'bounce', startStyle: 'ease' },
};

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

let roundCounter = 0;
export function newRound(outcome = 'none', extra = {}) {
  roundCounter += 1;
  return {
    id: `r${Date.now().toString(36)}${roundCounter}`,
    outcome,
    symbol: 'auto',
    pattern: outcome === 'epic' ? 'lines' : 'lines',
    lines: outcome === 'medium' ? [3] : outcome === 'big' || outcome === 'mega' ? [0, 1, 2] : outcome === 'epic' ? [0, 1, 2, 3, 4] : [0],
    cells: [],
    count: outcome === 'small' ? 3 : outcome === 'medium' ? 4 : 5,
    amount: null,
    midDuration: null,
    hold: 0,
    seed: Math.floor(Math.random() * 1e6),
    wildAssist: outcome === 'mega' || outcome === 'epic',
    wheelSegment: 3,
    freeSpins: 10,
    nearMissReel: null,
    ...extra,
  };
}

export function defaultProject() {
  return {
    version: 1,
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
        big: 'BIG WIN',
        mega: 'MEGA WIN',
        epic: 'EPIC WIN',
        bonus: 'BONUS!',
        freespins: 'FREE SPINS',
        wheel: 'WHEEL BONUS',
        nearmiss: 'SO CLOSE!',
      },
    },
    timing: {
      intro: 0.6,
      gap: 0.3,
      outro: 0.9,
      none: 0.45,
      nearmiss: 1.3,
      small: 2.2,
      medium: 2.8,
      bigLines: 1.3,
      big: 4.2,
      mega: 5.0,
      epic: 7.2,
      bigHold: 1.6,
      celebrate: 1.8,
      banner: 2.6,
      wheelSpin: 5.2,
    },
    wheel: {
      segments: DEFAULT_SEGMENTS.map((s) => ({ ...s })),
      turns: 5,
      landing: 'tease',
      multiplyByBet: true,
    },
    symbols: BUILTIN_SYMBOLS.map((s, i) => ({ id: `s${i}`, src: null, ...s })),
    assets: { background: null, frame: null, logo: null },
    rounds: [
      newRound('none', { seed: 11 }),
      newRound('small', { seed: 12, lines: [0], count: 3 }),
      newRound('none', { seed: 13 }),
      newRound('nearmiss', { seed: 14 }),
      newRound('mega', { seed: 15, lines: [0, 3], count: 5, symbol: 's7' }),
      newRound('wheel', { seed: 16, wheelSegment: 3 }),
    ],
  };
}
