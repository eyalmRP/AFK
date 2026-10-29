// What applies to which game: sections ("tab/slug" of their title) and
// controls (by id) that only matter for some game types or spin styles.
// Anything not listed applies everywhere. The editor keeps the others
// visible but greyed out and locked, saying why. Pure.

const SLOT = ['slot'];
const REELS = ['slot', 'holdspin'];

export const APPLIES = {
  // Machine
  'machine/reels': { games: REELS },
  'machine/framing': { games: REELS },
  'm-title-on': { games: REELS },
  'm-row-lines': { games: SLOT, not: ['cells'] },
  'machine/how-it-pays': { games: SLOT },
  'm-marquee': { games: REELS },
  'm-hud': { games: REELS },
  // Features
  'features/hold-spin': { games: REELS },
  'features/pots-above-the-machine': { games: SLOT },
  // Spin
  'spin/spin-type': { games: SLOT },
  'spin/reel-order': { games: SLOT },
  'spin-dir': { not: ['cascade'] },
  'spin/motion-curve': { games: REELS, not: ['cascade'] },
  'spin/start': { games: REELS, not: ['cascade'] },
  'spin/mid': { games: REELS },
  'spin-speed': { not: ['cascade'] },
  'spin-blur': { not: ['cascade'] },
  'spin/end': { games: REELS, not: ['cascade'] },
  'spin/reel-timing': { games: SLOT },
  'spin/anticipation': { games: REELS },
  'spin-ant-v': { not: ['cascade'] },
  'spin-scatter-lit': { games: SLOT },
  // Wins
  'wins/win-tiers': { games: REELS },
  'wins/winning-symbols': { games: SLOT },
  'tm-small': { games: SLOT },
  'tm-medium': { games: SLOT },
  'tm-biglines': { games: SLOT },
  'tm-tier': { games: REELS },
  'tm-hold': { games: REELS },
  'tm-tshow': { games: SLOT },
  'tm-tpop': { games: SLOT },
  'tm-tfall': { games: SLOT },
  'tm-mult': { games: SLOT },
  'tm-expand': { games: SLOT },
  'tm-collect': { games: REELS },
  'tm-cel': { games: SLOT },
  'tm-banner': { games: REELS },
  'fx-t-freespins': { games: SLOT },
  'fx-t-retrigger': { games: SLOT },
  'fx-t-total': { games: SLOT },
  'fx-t-bonus': { games: SLOT },
  'fx-t-nearmiss': { games: SLOT },
  'fx-t-holdspin': { games: REELS },
  'fx-t-grand': { games: REELS },
  // Effects
  'fx-line': { games: SLOT },
  'fx-land-shake': { games: SLOT },
};

const GAME_NAMES = { slot: 'the slot machine', holdspin: 'Hold & Spin', wheel: 'Wheel only' };
const SPIN_NAMES = { cascade: 'cascade drop spins', cells: 'per-cell spins', classic: 'classic spins', stagger: 'staggered spins', turbo: 'turbo spins', tease: 'tease spins' };

// Why a section or control does not apply (null when it does). The spin
// style only matters for the slot machine.
export function notApplying(key, game, spinType) {
  const rule = APPLIES[key];
  if (!rule) return null;
  if (rule.games && !rule.games.includes(game)) return `Not used in ${GAME_NAMES[game] || game}`;
  if (rule.not && game === 'slot' && rule.not.includes(spinType)) return `Not used with ${SPIN_NAMES[spinType] || spinType}`;
  return null;
}
