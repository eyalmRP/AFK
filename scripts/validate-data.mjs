// Checks data/*.json for broken references and bad values. The weekly update
// must pass this before it commits (npm run validate).
import { readFile, access } from 'node:fs/promises';

const root = new URL('..', import.meta.url).pathname;
const read = async (f) => JSON.parse(await readFile(root + 'data/' + f, 'utf8'));
const errors = [];
const warn = [];
const err = (m) => errors.push(m);

const [meta, heroesFile, artifactsFile, modesFile] = await Promise.all([read('meta.json'), read('heroes.json'), read('artifacts.json'), read('modes.json')]);
const TIERS = new Set(['S+', 'S', 'A', 'B', 'C', 'D']);
const FACTIONS = new Set(['Lightbearer', 'Mauler', 'Wilder', 'Graveborn', 'Celestial', 'Hypogean', 'Dimensional', 'Draconis']);
const CLASSES = new Set(['Warrior', 'Tank', 'Ranger', 'Mage', 'Support']);
const POS = new Set(['F1', 'F2', 'B1', 'B2', 'B3']);

const ids = new Set();
for (const h of heroesFile.heroes) {
  if (ids.has(h.id)) err(`duplicate hero id ${h.id}`);
  ids.add(h.id);
  if (!h.name) err(`${h.id}: missing name`);
  if (!FACTIONS.has(h.faction)) err(`${h.id}: unknown faction ${h.faction}`);
  if (!CLASSES.has(h.class)) err(`${h.id}: unknown class ${h.class}`);
  for (const [k, v] of Object.entries(h.tiers || {})) if (!TIERS.has(v)) err(`${h.id}: bad ${k} tier ${v}`);
  if (h.img) {
    try {
      await access(root + h.img);
    } catch {
      err(`${h.id}: image ${h.img} is missing`);
    }
  } else warn.push(`${h.id}: no portrait`);
}
const known = (id, where) => ids.has(id) || err(`${where}: unknown hero id "${id}"`);
for (const h of heroesFile.heroes) {
  for (const s of h.synergies || []) known(s.id, `${h.id} synergy`);
}
const artIds = new Set(artifactsFile.artifacts.map((a) => a.id));
for (const a of artifactsFile.artifacts) {
  for (const id of a.bis || []) known(id, `artifact ${a.id} bis`);
  if (a.img) {
    try {
      await access(root + a.img);
    } catch {
      err(`artifact ${a.id}: image ${a.img} is missing`);
    }
  }
  for (const k of ['pve', 'pvp']) if (a.tier?.[k] && !TIERS.has(a.tier[k])) err(`artifact ${a.id}: bad ${k} tier`);
}
const checkTeam = (t, where) => {
  const seen = new Set();
  for (const x of t.heroes || []) {
    known(x.id, where);
    if (x.pos && !POS.has(x.pos)) err(`${where}: bad position ${x.pos}`);
    if (seen.has(x.id)) err(`${where}: ${x.id} appears twice`);
    seen.add(x.id);
  }
  if ((t.heroes || []).length > 5) err(`${where}: more than 5 heroes`);
  for (const id of t.cores || []) known(id, where + ' cores');
  for (const [k, v] of Object.entries(t.subs || {})) [k, ...v].forEach((id) => known(id, where + ' subs'));
  for (const o of t.options || []) o.ids.forEach((id) => known(id, where + ' options'));
  for (const [k, v] of Object.entries(t.artifacts || {})) {
    known(k, where + ' artifacts');
    if (!artIds.has(v)) err(`${where}: unknown artifact "${v}"`);
  }
};
const modeIds = new Set();
for (const m of modesFile.modes) {
  if (modeIds.has(m.id)) err(`duplicate mode ${m.id}`);
  modeIds.add(m.id);
  if (!['pve', 'pvp', 'boss'].includes(m.category)) err(`mode ${m.id}: bad category ${m.category}`);
  (m.community || []).forEach((t, i) => checkTeam(t, `${m.id} community[${i}]`));
  (m.ai || []).forEach((t, i) => checkTeam(t, `${m.id} ai[${i}]`));
  (m.teamSets || []).forEach((set, i) => set.forEach((t, j) => checkTeam(t, `${m.id} set${i}[${j}]`)));
  if (!m.builderOnly && !(m.ai || []).length) warn.push(`mode ${m.id}: no AI analysis`);
  for (const t of m.ai || []) if (!t.reviewed) warn.push(`mode ${m.id}: AI team "${t.name}" not reviewed`);
}
for (const side of ['community', 'ai']) (modesFile.combos?.[side] || []).forEach((c, i) => c.heroes.forEach((id) => known(id, `combo ${side}[${i}]`)));
for (const a of modesFile.pvpArchetypes || []) [...(a.core || []), ...(a.counteredBy || [])].forEach((id) => known(id, `archetype ${a.name}`));
for (const id of meta.mustBuild || []) known(id, 'mustBuild');
if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.asOf || '')) err('meta.asOf must be YYYY-MM-DD');
if (meta.nextUpdate && meta.nextUpdate <= meta.asOf) err('meta.nextUpdate must be after asOf');
for (const s of meta.sources || []) if (!/^https?:\/\//.test(s.url || '')) err(`source "${s.name}" has no URL`);

// Beasts
let beastCount = 0;
try {
  const beastsFile = await read('beasts.json');
  const beastIds = new Set();
  for (const b of beastsFile.beasts || []) {
    beastCount++;
    if (beastIds.has(b.id)) err(`duplicate beast ${b.id}`);
    beastIds.add(b.id);
    if (!['rare', 'elite', 'legendary'].includes(b.rarity)) err(`beast ${b.id}: bad rarity ${b.rarity}`);
    for (const [k, v] of Object.entries(b.tiers || {})) if (!TIERS.has(v)) err(`beast ${b.id}: bad ${k} tier ${v}`);
    try {
      await access(root + b.img);
    } catch {
      err(`beast ${b.id}: image ${b.img} is missing`);
    }
  }
  for (const r of beastsFile.modeRecommendations || []) {
    if (!beastIds.has(r.beast)) err(`beast recommendation: unknown beast "${r.beast}"`);
    if (r.mode && !modeIds.has(r.mode)) err(`beast recommendation: unknown mode "${r.mode}"`);
    for (const id of r.heroes || []) known(id, `beast recommendation ${r.beast}`);
  }
} catch (e) {
  err(`beasts.json: ${e.message}`);
}

for (const w of warn.slice(0, 15)) console.log('warn:', w);
if (warn.length > 15) console.log(`warn: …and ${warn.length - 15} more`);
if (errors.length) {
  for (const e of errors) console.error('error:', e);
  console.error(`\n${errors.length} error(s)`);
  process.exit(1);
}
console.log(`data ok: ${ids.size} heroes, ${artIds.size} artifacts, ${beastCount} beasts, ${modeIds.size} modes, ${meta.sources.length} sources`);
