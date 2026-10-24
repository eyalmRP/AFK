// Claude features: reading hero-bank screenshots, and Claude's own take on
// formations and counters. All of it runs through the artifact runtime's
// `sample` capability on the viewer's Claude account, so it only lights up
// when the page is opened inside Claude.

import { data, ASCENSIONS, tierOf, POSITIONS, CLASSES, ELDER_MAX, LIMITS } from './data.js';

let samplePromise = null;
export const aiState = { text: false, images: false, maxImages: 0, mediaTypes: [], disabled: false };

export function initAi() {
  if (samplePromise) return samplePromise;
  samplePromise = (async () => {
    const use = window.claude?.use;
    if (!use) return null;
    const sample = await window.claude.use('sample');
    if (!sample) return null;
    aiState.text = true;
    try {
      const lim = await sample.limits();
      if (lim?.images) {
        aiState.images = true;
        aiState.maxImages = lim.images.maxCount || 1;
        aiState.mediaTypes = lim.images.mediaTypes || [];
      }
    } catch {
      /* text-only */
    }
    return sample;
  })();
  return samplePromise;
}

export function errorCopy(e) {
  switch (e?.code) {
    case 'not_granted':
    case 'sampling_disabled':
    case 'not_declared':
    case 'capability_disabled':
    case 'capability_removed':
      aiState.disabled = true;
      return 'Claude is not available for this page. You can still edit heroes by hand.';
    case 'images_unavailable':
      aiState.images = false;
      return 'This view cannot send images to Claude.';
    case 'rate_limited':
      return 'Claude is busy or your usage limit was reached. Try again in a little while.';
    case 'image_rejected':
      return 'That image could not be read. Use a PNG or JPG screenshot under 20 MB.';
    case 'invalid_json':
      return 'Claude replied in an unexpected format. Try again, or with fewer screenshots at once.';
    case 'session_expired':
      return 'Your Claude session expired. Sign in again and retry.';
    case 'refused':
      return 'Claude declined this request. Try a different screenshot.';
    case 'cancelled':
      return 'Stopped.';
    default:
      return 'Claude could not finish this request. Try again.';
  }
}

function rosterLines() {
  return data.heroes.map((h) => `${h.id}|${h.name}|${h.faction}|${h.class}`).join('\n');
}

const SCREEN_GUIDE = () => {
  const s = data.meta?.screenshotHints || {};
  return [
    'How AFK Arena shows progression:',
    `- Ascension tiers, lowest to highest: ${ASCENSIONS.join(', ')}. The card frame colour shows it: purple = Elite, gold = Legendary, red = Mythic, pale lilac/white = Ascended. A "+" tier (Elite+, Legendary+, Mythic+) has small gems in the top-right and bottom-left corners of the frame; the plain tier has none.`,
    '- Only Ascended heroes have stars: 0-5 of them in a row along the bottom. Report "stars" as that count (0-5). The star colour shows engraving: gold = below E30, orange = E30+, red = E60+, white/lilac = E80+. When the engraving number is not visible, report "engrave" as that minimum (0, 30, 60 or 80) and add "engrave" to "est". Engraving needs Ascended 1 star.',
    '- The ornament around the faction emblem (top-left) shows the signature item tier: a plain ring = SI 0-9, a ring with 4 studs = SI 10+, a square plate with diamonds = SI 20+, white wings = SI 30+, a crown with golden wings = SI 40+, a crown with white wings = SI 50. No ring at all means SI is not unlocked (below Mythic): report 0. When reading SI from the ornament, add "si" to "est".',
    '- The pendant under the emblem shows furniture: nothing = 0-2, one red diamond = 3+, two red diamonds = 9+, red banners on both sides = 36. Furniture needs Ascended (below that report 0). When reading furniture from the pendant, add "furniture" to "est".',
    '- The level is "Lvl N" at the top of the card. Heroes in the Resonating Crystal share one level; a hero showing a different level (often Lvl 1) is outside the crystal.',
    '- Signature Item (SI) is shown as +N (0-40) on the hero detail screen next to the signature item icon.',
    '- Furniture is shown as a count of 0-9 (often "3/9" or 9 small pieces) on the detail screen.',
    '- Engraving level (E0-E100+) appears as a number on the engraving icon on the detail screen.',
    s.heroList ? `- Hero list screen: ${s.heroList}` : '',
    s.heroDetail ? `- Hero detail screen: ${s.heroDetail}` : '',
  ]
    .filter(Boolean)
    .join('\n');
};

// Read one batch of screenshots. Returns {heroes:[...], notes}.
export async function readScreenshots(files, { signal, onText } = {}) {
  const sample = await initAi();
  if (!sample) throw { code: 'not_granted' };
  const prompt = `You are reading screenshots from the mobile game AFK Arena (not AFK Journey). The player wants to record which heroes they own and how far each is upgraded.

${SCREEN_GUIDE()}

Identify every hero visible in the ${files.length} attached screenshot(s). Match each to exactly one hero from this roster (format id|name|faction|class). Use the portrait art, the name text if shown, and the faction icon:
${rosterLines()}

For each hero report only what is actually visible. The hero list shows SI, furniture and engraving only as the emblem ornaments and star colour above, so report those as minimums with "est"; exact numbers come from the hero detail screen. Use null for anything you cannot see. Never guess a number.

Reply with only JSON in this shape:
{"screen":"hero-list|hero-detail|formation|other","heroes":[{"id":"roster id","level":922,"asc":"Ascended","stars":5,"si":30,"furniture":9,"engrave":60,"est":["si","furniture","engrave"],"confidence":"high|medium|low","seen":"short note on what you read"}],"notes":"anything the player should check"}
"asc" must be one of: ${ASCENSIONS.join(', ')} or null.`;
  const out = await sample.json(prompt, { images: files, signal, onText, modelTier: 'default', cache: false });
  const valid = new Set(data.heroes.map((h) => h.id));
  const heroes = (Array.isArray(out?.heroes) ? out.heroes : [])
    .filter((h) => h && valid.has(String(h.id)))
    .map((h) => ({
      id: String(h.id),
      level: numOrNull(h.level),
      asc: ASCENSIONS.includes(h.asc) ? h.asc : null,
      stars: numOrNull(h.stars),
      si: numOrNull(h.si),
      furniture: numOrNull(h.furniture),
      engrave: numOrNull(h.engrave),
      est: Array.isArray(h.est) ? h.est.filter((f) => ['si', 'furniture', 'engrave'].includes(f)) : [],
      confidence: ['high', 'medium', 'low'].includes(h.confidence) ? h.confidence : 'medium',
      seen: String(h.seen || '').slice(0, 160),
    }));
  return { heroes, screen: out?.screen || 'other', notes: String(out?.notes || '').slice(0, 400) };
}

// Read an enemy formation screenshot. Returns {slots:{F1:id,...}, notes}.
export async function readEnemyScreenshot(file, { signal } = {}) {
  const sample = await initAi();
  if (!sample) throw { code: 'not_granted' };
  const prompt = `This is a screenshot from AFK Arena (not AFK Journey) showing an enemy formation (arena, legends championship, or a battle screen). AFK Arena formations have 2 front slots and 3 back slots. On a battle screen the enemy stands on the right: its front line (2 heroes) is the column nearer the middle and its back line (3) the far column; number each line top to bottom (F1 top, F2 bottom; B1 top, B2 middle, B3 bottom). On a lineup panel with a row of 2 above a row of 3, the 2 are the front line (F1, F2 left to right) and the 3 the back line (B1, B2, B3 left to right).
Identify the enemy heroes from this roster (id|name|faction|class):
${rosterLines()}

If the screen shows the enemy heroes' level (one shared number or "Lv" under each hero) or their beast, report them; use null otherwise. Beasts (id|name):
${(data.beasts || []).map((b) => `${b.id}|${b.name}`).join('\n')}

Reply with only JSON: {"slots":{"F1":"id or null","F2":"id or null","B1":"id or null","B2":"id or null","B3":"id or null"},"level":null,"beast":null,"notes":"what you were unsure about"}`;
  const out = await sample.json(prompt, { images: [file], signal, modelTier: 'default', cache: false });
  const valid = new Set(data.heroes.map((h) => h.id));
  const slots = {};
  for (const p of POSITIONS) {
    const id = out?.slots?.[p];
    if (id && valid.has(String(id))) slots[p] = String(id);
  }
  const level = numOrNull(out?.level);
  const beast = out?.beast && data.beastById?.has(String(out.beast)) ? String(out.beast) : null;
  return { slots, level: level && level >= 1 && level <= LIMITS.level ? level : null, beast, notes: String(out?.notes || '').slice(0, 300) };
}

// Read the Elder Tree screen. Returns {core, Warrior, Tank, Ranger, Mage, Support, notes}.
export async function readElderTree(file, { signal } = {}) {
  const sample = await initAi();
  if (!sample) throw { code: 'not_granted' };
  const prompt = `This is a screenshot of the Elder Tree screen in the mobile game AFK Arena (not AFK Journey). It shows the central tree level under a gold star at the trunk, and five class branches, each a round stained-glass icon with "LvlN" under it:
- Warrior: red icon with a sword-like emblem (usually top centre)
- Mage: purple icon with a crescent/orb emblem
- Tank: gold shield icon
- Support: blue icon with wings
- Ranger: green arrowhead icon
Read each level exactly as printed. Use null for any you cannot read.
Reply with only JSON: {"core": 257, "Warrior": 195, "Tank": 196, "Ranger": 195, "Mage": 200, "Support": 200, "notes": "anything unclear"}`;
  const out = await sample.json(prompt, { images: [file], signal, modelTier: 'default', cache: false });
  const res = { notes: String(out?.notes || '').slice(0, 300) };
  for (const k of ['core', ...CLASSES]) {
    const n = numOrNull(out?.[k]);
    res[k] = n === null ? null : Math.max(0, Math.min(ELDER_MAX, n));
  }
  return res;
}

// Read Beasts screenshots. Returns {beasts:[{id, str, int, agi, confidence, seen}], notes}.
export async function readBeasts(files, { signal } = {}) {
  const sample = await initAi();
  if (!sample) throw { code: 'not_granted' };
  const list = (data.beasts || []).map((b) => `${b.id}|${b.name}|${b.rarity}|max buff ${b.maxBuff}`).join('\n');
  const hints = data.beastSystem?.screenHints ? `Screen notes: ${JSON.stringify(data.beastSystem.screenHints)}` : '';
  const prompt = `These are screenshots of the Beasts screens in the mobile game AFK Arena (not AFK Journey). On the beast list each card shows the beast's level as "LvlN" at the top; the frame colour shows rarity (orange = legendary, purple = elite, blue = rare). A green tick marks the beast currently in use. A beast's detail page also shows three buff levels: Strength (red fist icon), Intelligence (blue head icon) and Agility (green boot icon). ${hints}
Identify every beast the player owns that is visible, matching each to this list (id|name|rarity|max buff):
${list}
Report each buff level only if you can read it; use null otherwise. Never guess.
Reply with only JSON: {"beasts":[{"id":"beast id","level":21,"str":null,"int":null,"agi":null,"confidence":"high|medium|low","seen":"short note"}],"notes":"anything to check"}`;
  const out = await sample.json(prompt, { images: files, signal, modelTier: 'default', cache: false });
  const valid = new Map((data.beasts || []).map((b) => [b.id, b]));
  const beasts = (Array.isArray(out?.beasts) ? out.beasts : [])
    .filter((b) => b && valid.has(String(b.id)))
    .map((b) => {
      const max = valid.get(String(b.id)).maxBuff || 18;
      const lv = (v) => {
        const n = numOrNull(v);
        return n === null ? null : Math.max(0, Math.min(max, n));
      };
      const level = numOrNull(b.level);
      return { id: String(b.id), level: level === null ? null : Math.max(0, Math.min(100, level)), str: lv(b.str), int: lv(b.int), agi: lv(b.agi), confidence: ['high', 'medium', 'low'].includes(b.confidence) ? b.confidence : 'medium', seen: String(b.seen || '').slice(0, 160) };
    });
  return { beasts, notes: String(out?.notes || '').slice(0, 300) };
}

export function beastsLine(owned) {
  if (!owned) return '';
  const rows = Object.entries(owned)
    .filter(([, e]) => e?.owned)
    .map(([id, e]) => `${id} (${data.beastById?.get(id)?.name || id}; level ${e.level ?? '?'}; buffs Str ${e.str ?? '?'} / Int ${e.int ?? '?'} / Agi ${e.agi ?? '?'})`);
  return rows.length ? `Player's beasts (one per formation where the mode allows; buffs boost heroes of that attribute type): ${rows.join(', ')}.` : '';
}

export function elderTreeLine(tree) {
  if (!tree) return '';
  const parts = CLASSES.filter((c) => tree[c]).map((c) => `${c} ${tree[c]}`);
  if (!parts.length && !tree.core) return '';
  return `Player's Elder Tree (class branches boost every hero of that class): tree level ${tree.core ?? '?'}; ${parts.join(', ')}.`;
}

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function heroLine(id, entries) {
  const h = data.heroById.get(id);
  const e = entries?.[id];
  const q = (v) => (v === null || v === undefined ? '?' : v);
  const inv = e ? `${e.asc}${e.stars ? ' ' + e.stars + '/5 stars' : ''} SI+${q(e.si)} ${q(e.furniture)}F E${q(e.engrave)}` : 'max';
  return `${id} | ${h.name} | ${h.faction} ${h.class} | tiers pve:${tierOf(h, 'pve') || '-'} pvp:${tierOf(h, 'pvp') || '-'} boss:${tierOf(h, 'boss') || '-'} | ${inv} | roles: ${(h.roles || []).join(',')} | ${h.kit || ''}`;
}

function modeBrief(mode) {
  if (!mode) return 'General use.';
  const comm = (mode.community || [])
    .slice(0, 4)
    .map((t) => `- ${t.name}: ${t.heroes.map((x) => `${x.pos}:${x.id}`).join(' ')} (${t.consensus || 'common'})`)
    .join('\n');
  return `${mode.name} (${mode.category}). ${mode.whatMatters || ''} ${mode.restrictions ? 'Restrictions: ' + mode.restrictions : ''}
Community teams for this mode:
${comm || '- none recorded'}`;
}

function parseTeams(out, allowed, count, unique = true) {
  const used = new Set();
  const teams = [];
  for (const t of Array.isArray(out?.teams) ? out.teams : []) {
    const slots = {};
    if (!unique) used.clear();
    for (const p of POSITIONS) {
      const id = t?.slots?.[p] ? String(t.slots[p]) : null;
      if (id && allowed.has(id) && !used.has(id)) {
        slots[p] = id;
        used.add(id);
      }
    }
    if (Object.keys(slots).length) {
      teams.push({
        name: String(t.name || `Team ${teams.length + 1}`).slice(0, 60),
        slots,
        artifacts: t.artifacts && typeof t.artifacts === 'object' ? t.artifacts : {},
        beast: t.beast && data.beastById?.has(String(t.beast)) ? String(t.beast) : null,
        why: String(t.why || '').slice(0, 700),
        risks: String(t.risks || '').slice(0, 300),
      });
    }
    if (teams.length >= count) break;
  }
  return { teams, notes: String(out?.notes || '').slice(0, 600) };
}

const ARTIFACT_IDS = () => data.artifacts.map((a) => `${a.id} (${a.name})`).join(', ');

export async function claudeBuild({ mode, count, pool, entries, engineTeams, signal, elderTree = null, beasts = null }) {
  const sample = await initAi();
  if (!sample) throw { code: 'not_granted' };
  const prompt = `You are an expert AFK Arena (Lilith Games, not AFK Journey) team builder. Build ${count} formation(s) for the mode below using ONLY the player's owned heroes. Teams must not share heroes. Each formation has 2 front slots (F1, F2) and 3 back slots (B1, B2, B3).

Mode: ${modeBrief(mode)}

Owned heroes (id | name | faction class | tier ratings | player's investment | roles | kit):
${pool.map((id) => heroLine(id, entries)).join('\n')}
${elderTreeLine(elderTree)}
${beastsLine(beasts)}

A rules engine proposed:
${engineTeams.map((t, i) => `Team ${i + 1}: ${POSITIONS.map((p) => `${p}:${t.layout[p] || '-'}`).join(' ')}`).join('\n')}

Improve on it where you can: consider synergies, energy and positioning, the mode's mechanics, and the player's investment (an under-built hero can be worse than a lower-tier maxed one). Artifact ids: ${ARTIFACT_IDS()}.
Reply with only JSON: {"teams":[{"name":"short archetype name","slots":{"F1":"id","F2":"id","B1":"id","B2":"id","B3":"id"},"artifacts":{"heroId":"artifact id"},"beast":"beast id or null","why":"2-3 sentences","risks":"1 sentence"}],"notes":"upgrade advice in 1-2 sentences"}`;
  const out = await sample.json(prompt, { signal, modelTier: 'default', cache: false });
  return parseTeams(out, new Set(pool), count);
}

export async function claudeCounter({ enemySlots, mode, pool, entries, engineTeam, signal, elderTree = null, beasts = null, enemyInfo = null }) {
  const sample = await initAi();
  if (!sample) throw { code: 'not_granted' };
  const enemy = POSITIONS.filter((p) => enemySlots[p]).map((p) => `${p}: ${heroLine(enemySlots[p], null)}`);
  const prompt = `You are an expert AFK Arena (Lilith Games, not AFK Journey) PvP and PvE strategist. Recommend the best counter formation against the enemy below using ONLY the player's owned heroes. A formation has 2 front slots (F1, F2) and 3 back slots (B1, B2, B3); position matters (who the enemy targets, who gets hit by back-line divers, faction advantage Lightbearer>Mauler>Wilder>Graveborn>Lightbearer, Celestial<>Hypogean).

Mode: ${modeBrief(mode)}

Enemy formation:
${enemy.join('\n')}
${enemyInfo ? `Enemy heroes are level ${enemyInfo.level}; their upgrades are not visible, so assume Ascended 5 stars with ${enemyInfo.build}. Enemy beast: ${enemyInfo.beast ? `${enemyInfo.beast} at level ${enemyInfo.beastLevel}` : 'unknown'}.` : ''}

Owned heroes (id | name | faction class | tier ratings | player's investment | roles | kit):
${pool.map((id) => heroLine(id, entries)).join('\n')}
${elderTreeLine(elderTree)}
${beastsLine(beasts)}

A rules engine proposed: ${POSITIONS.map((p) => `${p}:${engineTeam?.layout?.[p] || '-'}`).join(' ')}

Reply with only JSON: {"teams":[{"name":"short name","slots":{"F1":"id","F2":"id","B1":"id","B2":"id","B3":"id"},"artifacts":{"heroId":"artifact id"},"beast":"beast id or null","why":"how this beats the enemy, 2-4 sentences","risks":"what could still go wrong"}],"notes":"what to swap if this loses"}
Give 1 primary team and optionally 1 alternative (max 2 teams). Artifact ids: ${ARTIFACT_IDS()}.`;
  const out = await sample.json(prompt, { signal, modelTier: 'default', cache: false });
  return parseTeams(out, new Set(pool), 2, false);
}
