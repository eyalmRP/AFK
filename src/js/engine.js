// Rules engine behind the formation builder and the counter planner.
// It scores 5-hero teams from tier ratings, investment, known synergies,
// community templates for the mode, role coverage and (for counters)
// matchups against the enemy formation. Everything here is pure so it can
// run in the browser and in node tests.

import { ASCENSIONS, POSITIONS, tierOf, tierScore, factionAdvantage } from './data.js';

const ROLE_GROUPS = {
  front: ['tank', 'off-tank'],
  sustain: ['healer', 'shielder', 'sustain', 'revive', 'immunity'],
  damage: ['burst', 'sustained-dps', 'aoe', 'single-target', 'assassin', 'boss-damage'],
  control: ['cc', 'stun', 'freeze', 'petrify', 'silence', 'energy-control', 'pull'],
  support: ['buffer', 'debuffer', 'energy-gain', 'cleanse', 'dispel'],
};

const DEFAULT_NEEDS = {
  pve: { front: 1, sustain: 1, damage: 2, control: 1, support: 0 },
  pvp: { front: 1, sustain: 1, damage: 2, control: 1, support: 0 },
  boss: { front: 0, sustain: 1, damage: 2, control: 0, support: 2 },
};

const NEED_WEIGHT = 2.5;
const CONSENSUS_WEIGHT = { strong: 1.6, common: 1.0, niche: 0.5 };

const ASC_FACTOR = {
  Elite: 0.45,
  'Elite+': 0.5,
  Legendary: 0.6,
  'Legendary+': 0.67,
  Mythic: 0.76,
  'Mythic+': 0.85,
  Ascended: 1.0,
};

function lerpTable(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    const [x0, y0] = table[i - 1];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return table[table.length - 1][1];
}

// Estimated combat rating, in the game's own units. The game does not publish
// its formula, so this multiplies one factor per upgrade, fitted to eight
// in-game ratings at level 922 (Legendary+ to Ascended, SI 0-50, 0-5 stars,
// furniture 0-9, red to white stars); each estimate came within 3% of the
// game's number. Furniture, signature item and engraving are percentages of
// the hero's base, so their absolute bonus grows with level and tier, as the
// game describes for furniture. Hero-specific base stats are not modelled
// (heroes with the same build differ by a few percent in game).
// Upgrades not unlocked or not recorded add nothing.
export const CR_WEIGHTS = {
  // Legendary+, level 922, no upgrades, mythic gear T4, Elder Tree class
  // branch 195 and tree 257: 5839M in game.
  reference: { cr: 5839e6, level: 922, gear: 4, branch: 195, tree: 257 },
  ascension: { Elite: 0.72, 'Elite+': 0.8, Legendary: 0.9, 'Legendary+': 1, Mythic: 1.27, 'Mythic+': 1.37, Ascended: 1.478 },
  si: [[0, 1], [10, 1.05], [20, 1.1], [30, 1.15], [35, 1.2], [40, 1.26], [50, 1.5]],
  // In game, 7 and 9 pieces give nearly the same stats (about +6-7% HP and
  // +5-6% attack); the 9-piece bonus is mostly a skill upgrade.
  furniture: [[0, 1], [3, 1.03], [7, 1.07], [9, 1.08], [36, 1.2]],
  engrave: [[0, 1], [30, 1.1], [60, 1.155], [80, 1.21], [100, 1.25]],
  // The first star gives most of the gain; each further star a little.
  firstStar: 0.06,
  perStar: 0.01,
  perGearTier: 0.03,
  // Elder Tree: each level of the hero's class branch, and each level of the tree itself.
  perBranchLevel: 0.0006,
  perTreeLevel: 0.0003,
};

export function estimateCR(entry, hero, { level, elderTree } = {}) {
  if (!entry?.owned) return 0;
  const W = CR_WEIGHTS;
  const R = W.reference;
  const num = (v) => (v === null || v === undefined ? 0 : Number(v) || 0);
  const gearF = (g) => 1 + Math.min(5, g) * W.perGearTier;
  const treeF = (branch, tree) => 1 + branch * W.perBranchLevel + tree * W.perTreeLevel;
  const perLevel = R.cr / (R.level * gearF(R.gear) * treeF(R.branch, R.tree));
  const ascended = entry.asc === 'Ascended';
  const stars = Math.min(5, num(entry.stars));
  const ascRank = Object.keys(W.ascension).indexOf(entry.asc);
  let cr = Math.max(1, num(level ?? entry.level)) * perLevel;
  cr *= W.ascension[entry.asc] ?? 1;
  if (ascRank >= 4) cr *= lerpTable(W.si, num(entry.si));
  if (ascended) cr *= lerpTable(W.furniture, num(entry.furniture));
  if (ascended && stars >= 1) cr *= (1 + W.firstStar + stars * W.perStar) * lerpTable(W.engrave, num(entry.engrave));
  cr *= gearF(num(entry.gear));
  const t = elderTree || {};
  cr *= treeF(num(t[hero?.class]), num(t.core));
  return Math.round(cr);
}

// How much of a hero's potential the player's copy delivers (about 0.4–1.1).
export function investmentFactor(entry, hero) {
  const notes = [];
  if (!entry) return { factor: 1, notes };
  let f = ASC_FACTOR[entry.asc] ?? 0.8;
  if (entry.asc === 'Ascended') f += Math.min(5, entry.stars || 0) * 0.02;
  // Unrecorded values (null) count as neutral rather than as zero.
  const si = entry.si;
  if (si !== null && si !== undefined) f *= lerpTable([[0, 0.9], [10, 0.94], [20, 0.97], [30, 1.0], [40, 1.02], [50, 1.03]], si);
  if (entry.furniture !== null && entry.furniture !== undefined) f *= lerpTable([[0, 0.92], [3, 0.97], [9, 1.02], [36, 1.05]], entry.furniture);
  if (entry.engrave !== null && entry.engrave !== undefined) f *= lerpTable([[0, 0.96], [30, 1.0], [60, 1.02], [80, 1.03]], entry.engrave);
  const need = hero?.investment || null;
  if (need) {
    if (need.si && si !== null && si !== undefined && si < need.si) {
      f *= 0.94;
      notes.push(`needs SI +${need.si} (has +${si})`);
    }
    if (need.furniture && entry.furniture !== null && entry.furniture !== undefined && entry.furniture < need.furniture) {
      f *= 0.95;
      notes.push(`needs ${need.furniture}F (has ${entry.furniture || 0}F)`);
    }
    if (need.engrave && entry.engrave !== null && entry.engrave !== undefined && entry.engrave < need.engrave) {
      f *= 0.97;
      notes.push(`wants E${need.engrave} (has E${entry.engrave || 0})`);
    }
  }
  return { factor: Math.max(0.3, f), notes };
}

function heroGroups(h) {
  const out = new Set();
  const roles = new Set(h.roles || []);
  for (const [g, list] of Object.entries(ROLE_GROUPS)) if (list.some((r) => roles.has(r))) out.add(g);
  if (h.class === 'Tank') out.add('front');
  return out;
}

function frontness(h) {
  let s = h.position === 'front' ? 2 : h.position === 'flex' ? 1 : 0;
  if (h.class === 'Tank') s += 1;
  else if (h.class === 'Warrior') s += 0.5;
  if ((h.roles || []).includes('tank')) s += 0.5;
  return s;
}

// Where a hero appears in the mode's community and AI teams.
function modePresence(mode, id) {
  let best = 0;
  let label = null;
  for (const t of mode?.community || []) {
    if (t.heroes?.some((x) => x.id === id) || t.cores?.includes(id)) {
      const w = CONSENSUS_WEIGHT[t.consensus] ?? 0.8;
      if (w > best) {
        best = w;
        label = `in community team "${t.name}"`;
      }
    }
  }
  for (const t of mode?.ai || []) {
    if (t.heroes?.some((x) => x.id === id) && best < 0.7) {
      best = 0.7;
      label = `in Claude's ${mode.name} lineup`;
    }
  }
  return { bonus: best, label };
}

// Elder Tree branches boost every hero of their class. Only the spread
// between the player's branches matters for choosing among their own
// heroes, so a branch counts relative to the average of the recorded ones.
export function elderTreeFactors(tree) {
  if (!tree) return null;
  const levels = Object.entries(tree).filter(([k, v]) => ['Warrior', 'Tank', 'Ranger', 'Mage', 'Support'].includes(k) && Number.isFinite(v) && v > 0);
  if (levels.length < 2) return null;
  const mean = levels.reduce((a, [, v]) => a + v, 0) / levels.length;
  const out = {};
  for (const [cls, v] of levels) {
    const dev = Math.max(-0.3, Math.min(0.3, (v - mean) / mean));
    out[cls] = { factor: 1 + dev * 0.25, level: v, dev };
  }
  return out;
}

export function makeContext({ heroes, entries = null, mode = null, category, enemy = [], combos = [], archetypes = [], elderTree = null }) {
  const cat = category || mode?.category || 'pve';
  const ctx = {
    heroes,
    entries,
    mode,
    category: cat,
    tierCategory: cat === 'boss' ? 'boss' : cat === 'pvp' ? 'pvp' : 'pve',
    needs: { ...DEFAULT_NEEDS[cat === 'boss' ? 'boss' : cat === 'pvp' ? 'pvp' : 'pve'], ...(mode?.needs || {}) },
    enemy: enemy.map((id) => heroes.get(id)).filter(Boolean),
    combos,
    archetypes,
    elder: elderTreeFactors(elderTree),
    cache: new Map(),
  };
  ctx.enemyArchetypes = detectArchetypes(ctx.enemy, archetypes);
  ctx.enemyThreats = enemyThreats(ctx.enemy);
  return ctx;
}

export function detectArchetypes(enemyHeroes, archetypes) {
  const ids = new Set(enemyHeroes.map((h) => h.id));
  const found = [];
  for (const a of archetypes || []) {
    const core = a.core || [];
    const hit = core.filter((id) => ids.has(id));
    if (core.length && hit.length >= Math.min(2, core.length)) found.push({ ...a, hit });
  }
  return found;
}

function enemyThreats(enemyHeroes) {
  const count = (roles) => enemyHeroes.filter((h) => (h.roles || []).some((r) => roles.includes(r))).length;
  return {
    burst: count(['burst', 'assassin']),
    sustain: count(['healer', 'sustain', 'shielder', 'revive']),
    control: count(['cc', 'stun', 'freeze', 'petrify', 'silence', 'pull']),
    energy: count(['energy-gain']),
    summons: count(['summoner']),
  };
}

// Individual value of one hero in this context, with the reasons behind it.
export function heroValue(ctx, id) {
  if (ctx.cache.has(id)) return ctx.cache.get(id);
  const h = ctx.heroes.get(id);
  if (!h) return { value: 0, reasons: [] };
  const reasons = [];
  const tier = tierOf(h, ctx.tierCategory);
  let base = tierScore(tier);
  reasons.push(tier ? `${tier} in ${ctx.tierCategory.toUpperCase()}` : 'unrated');
  const p = modePresence(ctx.mode, id);
  if (p.bonus) {
    base += p.bonus;
    reasons.push(p.label);
  } else if (ctx.mode && (h.modes || []).includes(ctx.mode.id)) {
    base += 0.5;
    reasons.push(`good in ${ctx.mode.name}`);
  }
  let counterBonus = 0;
  if (ctx.enemy.length) {
    const r = matchup(ctx, h);
    counterBonus = r.score;
    reasons.push(...r.reasons);
  }
  const inv = ctx.entries ? investmentFactor(ctx.entries[id], h) : { factor: 1, notes: [] };
  if (inv.notes.length) reasons.push(...inv.notes);
  const elder = ctx.elder?.[h.class];
  if (elder) {
    inv.factor *= elder.factor;
    if (Math.abs(elder.dev) >= 0.03) reasons.push(`Elder Tree ${h.class} ${elder.level} (${elder.dev > 0 ? 'above' : 'below'} your average)`);
  }
  const classBonus = ctx.mode?.classBonus?.[h.class] || 0;
  if (classBonus) reasons.push(`${h.class.toLowerCase()}s suit ${ctx.mode.name}`);
  const value = (base + classBonus) * inv.factor + counterBonus;
  const out = { value, base, tier, factor: inv.factor, counterBonus, reasons, investNotes: inv.notes };
  ctx.cache.set(id, out);
  return out;
}

function matchup(ctx, h) {
  let score = 0;
  const reasons = [];
  const roles = new Set(h.roles || []);
  const edge = ctx.enemy.filter((e) => factionAdvantage(h.faction, e.faction));
  if (edge.length) reasons.push(`faction edge vs ${edge.map((e) => e.name).join(', ')}`);
  const behind = ctx.enemy.filter((e) => factionAdvantage(e.faction, h.faction));
  if (behind.length) reasons.push(`faction disadvantage vs ${behind.map((e) => e.name).join(', ')}`);
  for (const e of ctx.enemy) {
    if ((h.counters || []).includes(e.id)) {
      score += 1.5;
      reasons.push(`counters ${e.name}`);
    }
    if ((e.counteredBy || []).includes(h.id)) {
      score += 1.0;
      if (!(h.counters || []).includes(e.id)) reasons.push(`${e.name} struggles against it`);
    }
    if ((h.counteredBy || []).includes(e.id) || (e.counters || []).includes(h.id)) {
      score -= 1.5;
      reasons.push(`weak to ${e.name}`);
    }
    if (factionAdvantage(h.faction, e.faction)) score += 0.35;
    if (factionAdvantage(e.faction, h.faction)) score -= 0.35;
  }
  for (const a of ctx.enemyArchetypes) {
    if ((a.counteredBy || []).includes(h.id)) {
      score += 2.5;
      reasons.push(`answers enemy ${a.name}`);
    }
  }
  const t = ctx.enemyThreats;
  if (t.burst >= 2 && ['shielder', 'revive', 'immunity'].some((r) => roles.has(r))) {
    score += 0.6;
    reasons.push('protects against burst');
  }
  if (t.sustain >= 2 && ['anti-heal', 'burst', 'dispel'].some((r) => roles.has(r))) {
    score += 0.6;
    reasons.push('breaks enemy sustain');
  }
  if (t.control >= 2 && ['cleanse', 'immunity'].some((r) => roles.has(r))) {
    score += 0.7;
    reasons.push('shrugs off enemy CC');
  }
  if (t.energy >= 1 && roles.has('energy-control')) {
    score += 0.6;
    reasons.push('drains enemy energy');
  }
  if (t.summons >= 1 && roles.has('aoe')) score += 0.3;
  return { score, reasons };
}

function pairSynergy(a, b) {
  const ab = (a.synergies || []).find((s) => s.id === b.id);
  const ba = (b.synergies || []).find((s) => s.id === a.id);
  if (ab && ba) return { score: 1.8, why: ab.why || ba.why };
  if (ab || ba) return { score: 1.2, why: (ab || ba).why };
  return null;
}

// Score a team of hero ids. Returns the total and a breakdown for display.
export function scoreTeam(ctx, ids) {
  const hs = ids.map((id) => ctx.heroes.get(id)).filter(Boolean);
  let total = 0;
  const members = hs.map((h) => {
    const v = heroValue(ctx, h.id);
    total += v.value;
    return { id: h.id, ...v };
  });

  const synergies = [];
  for (let i = 0; i < hs.length; i++)
    for (let j = i + 1; j < hs.length; j++) {
      const s = pairSynergy(hs[i], hs[j]);
      if (s) {
        total += s.score;
        synergies.push({ a: hs[i].id, b: hs[j].id, why: s.why, score: s.score });
      }
    }

  const idSet = new Set(ids);
  const combos = [];
  for (const c of ctx.combos || []) {
    const have = (c.heroes || []).filter((id) => idSet.has(id)).length;
    if (have === c.heroes?.length && have >= 2) {
      total += 2.2;
      combos.push({ ...c, full: true });
    } else if (c.heroes?.length >= 3 && have >= 2) {
      total += 0.6;
      combos.push({ ...c, full: false });
    }
  }

  const groups = { front: 0, sustain: 0, damage: 0, control: 0, support: 0 };
  for (const h of hs) for (const g of heroGroups(h)) groups[g]++;
  const coverage = [];
  for (const [g, need] of Object.entries(ctx.needs)) {
    if (!need) continue;
    const got = Math.min(groups[g], need);
    total += got * NEED_WEIGHT;
    coverage.push({ group: g, need, have: groups[g], ok: groups[g] >= need });
  }

  const layout = assignPositions(hs);
  total -= layout.penalty;

  let template = null;
  for (const t of ctx.mode?.community || []) {
    const tIds = (t.heroes || []).map((x) => x.id);
    const overlap = tIds.filter((id) => idSet.has(id)).length;
    // Only real lineups (3+ named heroes) count as templates; cores already
    // lift each named hero through modePresence.
    if (tIds.length >= 3 && overlap >= Math.min(4, tIds.length)) {
      const bonus = 1.5 * (CONSENSUS_WEIGHT[t.consensus] ?? 0.8);
      if (!template || bonus > template.bonus) template = { name: t.name, overlap, size: tIds.length, bonus };
    }
  }
  if (template) total += template.bonus;

  return { total, members, synergies, combos, coverage, layout: layout.slots, template };
}

// Two front slots, three back slots. Front goes to the sturdiest heroes.
export function assignPositions(hs) {
  const sorted = [...hs].sort((a, b) => frontness(b) - frontness(a));
  const front = sorted.slice(0, 2);
  const back = sorted.slice(2);
  let penalty = 0;
  for (const h of front) if (frontness(h) < 1) penalty += 1.5;
  for (const h of back) if (h.position === 'front' && h.class === 'Tank') penalty += 1.0;
  const slots = {};
  front.forEach((h, i) => (slots[POSITIONS[i]] = h.id));
  back.forEach((h, i) => (slots[POSITIONS[2 + i]] = h.id));
  return { slots, penalty };
}

function allowedPool(ctx, pool) {
  const allow = ctx.mode?.allowedFactions;
  if (!allow?.length) return pool;
  return pool.filter((id) => allow.includes(ctx.heroes.get(id)?.faction));
}

function greedyFill(ctx, start, pool, size = 5) {
  const team = [...start];
  const used = new Set(team);
  while (team.length < size) {
    let best = null;
    let bestScore = -Infinity;
    for (const id of pool) {
      if (used.has(id)) continue;
      const s = scoreTeam(ctx, [...team, id]).total;
      if (s > bestScore) {
        bestScore = s;
        best = id;
      }
    }
    if (!best) break;
    team.push(best);
    used.add(best);
  }
  return team;
}

function improveBySwaps(ctx, team, pool, maxPasses = 4) {
  let cur = [...team];
  let curScore = scoreTeam(ctx, cur).total;
  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;
    for (let i = 0; i < cur.length; i++) {
      for (const id of pool) {
        if (cur.includes(id)) continue;
        const next = [...cur];
        next[i] = id;
        const s = scoreTeam(ctx, next).total;
        if (s > curScore + 1e-6) {
          cur = next;
          curScore = s;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return cur;
}

// Seeds taken from community / AI templates, mapped onto what the player owns.
function templateSeeds(ctx, pool) {
  const owned = new Set(pool);
  const seeds = [];
  const teams = [...(ctx.mode?.community || []), ...(ctx.mode?.ai || [])];
  for (const t of teams) {
    const picked = [];
    const swaps = [];
    for (const slot of t.heroes || []) {
      if (owned.has(slot.id)) picked.push(slot.id);
      else {
        const sub = (t.subs?.[slot.id] || []).find((s) => owned.has(s) && !picked.includes(s));
        if (sub) {
          picked.push(sub);
          swaps.push({ from: slot.id, to: sub });
        }
      }
    }
    if (picked.length >= 3) seeds.push({ name: t.name, ids: picked, swaps });
  }
  return seeds;
}

// Narrow a large pool to the heroes worth searching: the strongest overall,
// the best few per role, their synergy partners and the mode's template heroes.
export function shortlist(ctx, pool, k = 30) {
  if (pool.length <= k) return pool;
  const inPool = new Set(pool);
  const ranked = [...pool].sort((a, b) => heroValue(ctx, b).value - heroValue(ctx, a).value);
  const keep = new Set(ranked.slice(0, k));
  for (const g of Object.keys(ROLE_GROUPS)) {
    ranked.filter((id) => heroGroups(ctx.heroes.get(id)).has(g)).slice(0, 3).forEach((id) => keep.add(id));
  }
  for (const id of ranked.slice(0, 10)) {
    for (const syn of ctx.heroes.get(id)?.synergies || []) if (inPool.has(syn.id)) keep.add(syn.id);
  }
  for (const t of [...(ctx.mode?.community || []), ...(ctx.mode?.ai || [])]) {
    for (const x of t.heroes || []) if (inPool.has(x.id)) keep.add(x.id);
  }
  return [...keep];
}

export function buildTeam(ctx, pool) {
  const usable = shortlist(ctx, allowedPool(ctx, pool));
  if (!usable.length) return null;
  const candidates = [];
  candidates.push({ ids: improveBySwaps(ctx, greedyFill(ctx, [], usable), usable), seed: null });
  for (const seed of templateSeeds(ctx, usable)) {
    const filled = greedyFill(ctx, seed.ids.slice(0, 5), usable);
    candidates.push({ ids: improveBySwaps(ctx, filled, usable, 2), seed });
  }
  let best = null;
  for (const c of candidates) {
    const s = scoreTeam(ctx, c.ids);
    if (!best || s.total > best.score.total) best = { ...c, score: s };
  }
  return best;
}

// Build `count` teams that never share a hero.
export function buildTeams(ctx, pool, count = 1, strategy = 'strongest') {
  let remaining = [...pool];
  const teams = [];
  for (let i = 0; i < count; i++) {
    const t = buildTeam(ctx, remaining);
    if (!t || t.ids.length === 0) break;
    teams.push(t);
    remaining = remaining.filter((id) => !t.ids.includes(id));
  }
  if (strategy === 'balanced' && teams.length > 1) balanceTeams(ctx, teams, remaining);
  return { teams, leftover: remaining };
}

// Swap heroes between teams (and the bench) while it raises the weakest team
// without costing much in total.
function balanceTeams(ctx, teams, bench) {
  const objective = () => {
    const scores = teams.map((t) => scoreTeam(ctx, t.ids).total);
    return Math.min(...scores) * 2 + scores.reduce((a, b) => a + b, 0) / scores.length;
  };
  let cur = objective();
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (let a = 0; a < teams.length; a++)
      for (let b = a + 1; b < teams.length; b++)
        for (let i = 0; i < teams[a].ids.length; i++)
          for (let j = 0; j < teams[b].ids.length; j++) {
            const x = teams[a].ids[i];
            const y = teams[b].ids[j];
            teams[a].ids[i] = y;
            teams[b].ids[j] = x;
            const next = objective();
            if (next > cur + 1e-6) {
              cur = next;
              improved = true;
            } else {
              teams[a].ids[i] = x;
              teams[b].ids[j] = y;
            }
          }
    if (!improved) break;
  }
  for (const t of teams) {
    t.score = scoreTeam(ctx, t.ids);
  }
  void bench;
}

// Artifact suggestion per hero: mode template > best-in-slot list > class fit.
export function suggestArtifact(hero, { mode, artifacts, category }) {
  if (!hero) return null;
  for (const t of mode?.community || []) {
    const a = t.artifacts?.[hero.id];
    if (a) return { id: a, why: `used in "${t.name}"` };
  }
  const cat = category === 'pvp' ? 'pvp' : 'pve';
  const rank = (a) => ['S+', 'S', 'A', 'B', 'C'].indexOf(a.tier?.[cat] ?? 'C');
  const bis = (artifacts || []).filter((a) => (a.bis || []).includes(hero.id)).sort((a, b) => rank(a) - rank(b));
  if (bis.length) return { id: bis[0].id, why: 'best in slot' };
  const fits = (artifacts || [])
    .filter((a) => {
      if (a.restriction && !String(a.restriction).toLowerCase().includes(hero.class.toLowerCase())) {
        if (/class|only/i.test(a.restriction)) return false;
      }
      const suits = (a.suits || []).map((s) => s.toLowerCase());
      return suits.includes(hero.class.toLowerCase()) || (hero.roles || []).some((r) => suits.includes(r));
    })
    .sort((a, b) => rank(a) - rank(b));
  return fits.length ? { id: fits[0].id, why: `fits ${hero.class.toLowerCase()}s` } : null;
}

// The single upgrade that would lift this team the most.
export function nextUpgrade(ctx, ids) {
  if (!ctx.entries) return null;
  let best = null;
  for (const id of ids) {
    const h = ctx.heroes.get(id);
    const e = ctx.entries[id];
    if (!h || !e) continue;
    const base = investmentFactor(e, h).factor;
    const tries = [];
    if (e.asc !== 'Ascended') tries.push({ patch: { asc: ASCENSIONS[ASCENSIONS.indexOf(e.asc) + 1] }, label: `ascend to ${ASCENSIONS[ASCENSIONS.indexOf(e.asc) + 1]}` });
    // Only suggest upgrades for values the player has recorded.
    if (e.si !== null && e.si !== undefined && e.si < 40) {
      const siStep = h.investment?.si && e.si < h.investment.si ? h.investment.si : Math.min(40, (Math.floor(e.si / 10) + 1) * 10);
      tries.push({ patch: { si: siStep }, label: `SI to +${siStep}` });
    }
    if (e.furniture !== null && e.furniture !== undefined && e.furniture < 9) {
      const fStep = e.furniture < 3 ? 3 : 9;
      tries.push({ patch: { furniture: fStep }, label: `furniture to ${fStep}F` });
    }
    if (e.engrave !== null && e.engrave !== undefined && e.engrave < 80) {
      const eStep = e.engrave < 30 ? 30 : e.engrave < 60 ? 60 : 80;
      tries.push({ patch: { engrave: eStep }, label: `engrave to E${eStep}` });
    }
    const v = heroValue(ctx, id).base;
    for (const t of tries) {
      const gain = v * (investmentFactor({ ...e, ...t.patch }, h).factor - base);
      if (!best || gain > best.gain) best = { id, gain, label: t.label };
    }
  }
  return best && best.gain > 0.05 ? best : null;
}

// Best owned beast for a team: its rating for the mode, how well its buffs
// match the team's hero types, and community picks for the mode or heroes.
export function suggestBeast(ctx, ids, { beasts, owned, recommendations = [], exclude = null }) {
  if (!beasts?.length) return null;
  const pool = (owned ? beasts.filter((b) => owned[b.id]?.owned) : beasts).filter((b) => !exclude?.has(b.id));
  if (!pool.length) return null;
  const types = { Strength: 0, Intelligence: 0, Agility: 0 };
  for (const id of ids) {
    const t = ctx.heroes.get(id)?.type;
    if (t in types) types[t]++;
  }
  const keyOf = { Strength: 'str', Intelligence: 'int', Agility: 'agi' };
  const cat = ctx.tierCategory;
  let best = null;
  for (const b of pool) {
    const reasons = [];
    const tier = b.tiers?.[cat] || b.tiers?.overall || null;
    let score = tierScore(tier);
    if (tier) reasons.push(`${tier} in ${cat.toUpperCase()}`);
    const e = owned?.[b.id];
    if (e?.level) {
      score += e.level * 0.05;
      reasons.push(`level ${e.level}`);
    }
    if (e) {
      let buff = 0;
      // Absolute buff level: a legendary beast at 18 gives more than an elite at 12.
      for (const [t, n] of Object.entries(types)) buff += n * ((e[keyOf[t]] ?? 0) / 18);
      score += buff * 0.8;
      const main = Object.entries(types).sort((a, c) => c[1] - a[1])[0];
      if (main[1] && (e[keyOf[main[0]]] ?? 0) > 0) reasons.push(`${main[0]} buff ${e[keyOf[main[0]]]} for your ${main[1]} ${main[0]} hero${main[1] > 1 ? 'es' : ''}`);
    }
    for (const r of recommendations) {
      if (r.beast !== b.id) continue;
      if (r.mode && r.mode === ctx.mode?.id) {
        score += 2;
        reasons.push(`community pick for ${ctx.mode.name}`);
      }
      const shared = (r.heroes || []).filter((h) => ids.includes(h));
      if (shared.length) {
        score += 1.5;
        reasons.push(`recommended with ${shared.map((h) => ctx.heroes.get(h)?.name || h).join(', ')}`);
      }
    }
    if (!best || score > best.score) best = { id: b.id, score, reasons };
  }
  return best;
}
