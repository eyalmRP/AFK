// Loads the weekly meta data files and builds lookup indexes.

export const TIERS = ['S+', 'S', 'A', 'B', 'C', 'D'];
export const TIER_SCORE = { 'S+': 10, S: 8.5, A: 7, B: 5.5, C: 4, D: 2.5 };
export const UNRATED_SCORE = 3;

export const CATEGORIES = [
  { id: 'overall', label: 'Overall' },
  { id: 'pve', label: 'PvE' },
  { id: 'pvp', label: 'PvP' },
  { id: 'boss', label: 'Bosses' },
];

export const FACTIONS = [
  { id: 'Lightbearer', short: 'LB', beats: ['Mauler'] },
  { id: 'Mauler', short: 'MA', beats: ['Wilder'] },
  { id: 'Wilder', short: 'WI', beats: ['Graveborn'] },
  { id: 'Graveborn', short: 'GB', beats: ['Lightbearer'] },
  { id: 'Celestial', short: 'CE', beats: ['Hypogean'] },
  { id: 'Hypogean', short: 'HY', beats: ['Celestial'] },
  { id: 'Dimensional', short: 'DI', beats: [] },
  { id: 'Draconis', short: 'DR', beats: [] },
];
export const FACTION_IDS = FACTIONS.map((f) => f.id);

export const CLASSES = ['Warrior', 'Tank', 'Ranger', 'Mage', 'Support'];
// Same order as the in-game filter bar.
export const TYPES = ['Strength', 'Intelligence', 'Agility'];

// Ascension ladder as shown in game. Index doubles as a strength rank.
export const ASCENSIONS = ['Elite', 'Elite+', 'Legendary', 'Legendary+', 'Mythic', 'Mythic+', 'Ascended'];

export const LIMITS = {
  level: 800,
  si: 50,
  furniture: 9,
  engrave: 100,
  stars: 5,
  gear: 5,
};

export const POSITIONS = ['F1', 'F2', 'B1', 'B2', 'B3'];

const state = {
  meta: null,
  heroes: [],
  heroById: new Map(),
  artifacts: [],
  artifactById: new Map(),
  modes: [],
  modeById: new Map(),
  combos: { community: [], ai: [] },
  archetypes: [],
};

async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

export async function loadData() {
  const [meta, heroes, artifacts, modes] = await Promise.all([
    loadJson('data/meta.json'),
    loadJson('data/heroes.json'),
    loadJson('data/artifacts.json'),
    loadJson('data/modes.json'),
  ]);
  return setData({ meta, heroes, artifacts, modes });
}

export function setData({ meta, heroes, artifacts, modes }) {
  state.meta = meta;
  state.heroes = (heroes.heroes || []).map(normalizeHero);
  state.heroById = new Map(state.heroes.map((h) => [h.id, h]));
  state.artifacts = artifacts.artifacts || [];
  state.artifactById = new Map(state.artifacts.map((a) => [a.id, a]));
  state.teamWide = artifacts.teamWide || null;
  state.collections = artifacts.collections || [];
  state.modes = modes.modes || [];
  state.modeById = new Map(state.modes.map((m) => [m.id, m]));
  state.combos = modes.combos || { community: [], ai: [] };
  state.archetypes = modes.pvpArchetypes || [];
  state.limits = { ...LIMITS, ...(meta.limits || {}) };
  return state;
}

function normalizeHero(h) {
  const tiers = h.tiers || {};
  return {
    roles: [],
    synergies: [],
    counters: [],
    counteredBy: [],
    modes: [],
    ...h,
    tiers: {
      overall: tiers.overall || null,
      pve: tiers.pve || null,
      pvp: tiers.pvp || null,
      boss: tiers.boss || null,
    },
  };
}

export const data = state;

export function hero(id) {
  return state.heroById.get(id);
}

export function tierOf(h, category) {
  if (!h) return null;
  return h.tiers[category] || (category === 'overall' ? null : h.tiers.overall) || null;
}

export function tierScore(tier) {
  return tier ? TIER_SCORE[tier] ?? UNRATED_SCORE : UNRATED_SCORE;
}

export function factionAdvantage(attacker, defender) {
  const f = FACTIONS.find((x) => x.id === attacker);
  return !!f && f.beats.includes(defender);
}
