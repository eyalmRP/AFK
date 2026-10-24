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
  level: 1500,
  si: 50,
  furniture: 36,
  engrave: 100,
  stars: 5,
  gear: 5,
};

// Ascended heroes have 1-5 stars. The star colour shows engraving: gold below
// E30, orange from E30, red from E60, white from E80.
export const ENGRAVE_TIERS = [
  [80, 'white'],
  [60, 'red'],
  [30, 'orange'],
  [0, 'gold'],
];

export function engraveTier(engrave) {
  const v = engrave ?? 0;
  return ENGRAVE_TIERS.find(([min]) => v >= min)[1];
}

export function starTier(stars, engrave) {
  const count = Math.min(LIMITS.stars, Math.max(0, Math.trunc(Number(stars) || 0)));
  return count ? { tier: engraveTier(engrave), count } : null;
}

export function starLabel(stars, engrave) {
  const t = starTier(stars, engrave);
  return t ? `${t.count}★ ${t.tier}` : 'no stars';
}

// What each upgrade needs before it unlocks (from the in-game card guide):
// signature item from Mythic, furniture from Ascended, engraving from
// Ascended 1 star.
const ASC_RANK = (a) => ASCENSIONS.indexOf(a);
export function upgradeUnlocked(e, field) {
  if (!e) return false;
  if (field === 'si') return ASC_RANK(e.asc) >= ASC_RANK('Mythic');
  if (field === 'furniture') return e.asc === 'Ascended';
  if (field === 'engrave') return e.asc === 'Ascended' && (e.stars || 0) >= 1;
  return true;
}

// Milestones the card icon shows: the ring around the faction emblem for
// signature item, the pendant under it for furniture.
export const SI_MILESTONES = [0, 10, 20, 30];
export const FURNITURE_MILESTONES = [0, 3, 9, 36];

export const POSITIONS = ['F1', 'F2', 'B1', 'B2', 'B3'];

// Elder Tree: the central tree level plus one branch per class. The
// in-game screen arranges the branches in this order, left to right.
export const ELDER_BRANCHES = ['Support', 'Mage', 'Warrior', 'Tank', 'Ranger'];
export const ELDER_MAX = 1000;

export const BEAST_LEVEL_MAX = 100;

// Beast buffs: one level per hero attribute type.
export const BEAST_BUFFS = [
  { key: 'str', type: 'Strength' },
  { key: 'int', type: 'Intelligence' },
  { key: 'agi', type: 'Agility' },
];

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
  const [meta, heroes, artifacts, modes, beasts, codes] = await Promise.all([
    loadJson('data/meta.json'),
    loadJson('data/heroes.json'),
    loadJson('data/artifacts.json'),
    loadJson('data/modes.json'),
    loadJson('data/beasts.json').catch(() => ({ beasts: [] })),
    loadJson('data/codes.json').catch(() => ({ codes: [] })),
  ]);
  return setData({ meta, heroes, artifacts, modes, beasts, codes });
}

export function setData({ meta, heroes, artifacts, modes, beasts = { beasts: [] }, codes = { codes: [] } }) {
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
  state.codes = codes;
  state.beasts = beasts.beasts || [];
  state.beastById = new Map(state.beasts.map((b) => [b.id, b]));
  state.beastSystem = beasts.system || null;
  state.beastModes = beasts.modeRecommendations || [];
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
