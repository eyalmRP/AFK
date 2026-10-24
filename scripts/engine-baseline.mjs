// Runs the rules engine over every game mode with the full roster at full
// investment. The weekly update uses it as the starting point for the
// "AI analysis" column: `node scripts/engine-baseline.mjs` prints the teams,
// `--write` stores them (with drafted explanations) in data/modes.json.
import { readFile, writeFile } from 'node:fs/promises';
import { setData, data, POSITIONS, tierOf } from '../src/js/data.js';
import { makeContext, buildTeams, buildTeam, suggestArtifact } from '../src/js/engine.js';

const root = new URL('..', import.meta.url).pathname;
const read = async (f) => JSON.parse(await readFile(root + 'data/' + f, 'utf8'));
const [meta, heroes, artifacts, modes] = await Promise.all([read('meta.json'), read('heroes.json'), read('artifacts.json'), read('modes.json')]);
setData({ meta, heroes, artifacts, modes });
const write = process.argv.includes('--write');
const all = data.heroes.map((h) => h.id);
const name = (id) => data.heroById.get(id)?.name || id;

const GROUP_WORD = { front: 'frontline', sustain: 'sustain', damage: 'damage', control: 'control', support: 'buffs/debuffs' };

function draftWhy(ctx, t) {
  const s = t.score;
  const top = [...s.members].sort((a, b) => b.value - a.value).slice(0, 2);
  const parts = [`Built around ${top.map((m) => `${name(m.id)} (${m.tier || 'unrated'} ${ctx.tierCategory.toUpperCase()})`).join(' and ')}.`];
  const covered = s.coverage.filter((c) => c.ok).map((c) => GROUP_WORD[c.group]);
  const missing = s.coverage.filter((c) => !c.ok).map((c) => GROUP_WORD[c.group]);
  if (covered.length) parts.push(`Covers ${covered.join(', ')}.`);
  if (missing.length) parts.push(`Light on ${missing.join(', ')}.`);
  if (s.synergies.length) parts.push(`Synergy: ${s.synergies.map((x) => `${name(x.a)} + ${name(x.b)}`).join(', ')}.`);
  if (s.template) parts.push(`Overlaps the community "${s.template.name}" team (${s.template.overlap}/${s.template.size}).`);
  return parts.join(' ');
}

function draftDiffers(mode, ids) {
  const comm = new Set((mode.community || []).flatMap((t) => (t.heroes || []).map((x) => x.id).concat(t.cores || [])));
  if (!comm.size) return 'No community lineup was found for this mode this week, so there is nothing to compare against.';
  const extra = ids.filter((id) => !comm.has(id));
  const shared = ids.filter((id) => comm.has(id));
  const out = [];
  if (shared.length) out.push(`Agrees on ${shared.map(name).join(', ')}.`);
  if (extra.length) out.push(`Adds ${extra.map(name).join(', ')}, which the community teams don't name.`);
  return out.join(' ');
}

function toEntry(ctx, mode, t, label) {
  const slots = t.score.layout;
  const arts = {};
  for (const id of Object.values(slots)) {
    const a = suggestArtifact(data.heroById.get(id), { mode, artifacts: data.artifacts, category: ctx.category });
    if (a) arts[id] = a.id;
  }
  return {
    name: label,
    heroes: POSITIONS.filter((p) => slots[p]).map((p) => ({ id: slots[p], pos: p })),
    artifacts: arts,
    score: Math.round(t.score.total * 10) / 10,
    why: draftWhy(ctx, t),
    differs: draftDiffers(mode, Object.values(slots)),
    confidence: 'medium',
  };
}

const combos = data.combos.community || [];
for (const mode of data.modes) {
  if (mode.builderOnly) continue;
  const ctx = makeContext({ heroes: data.heroById, mode, combos, archetypes: data.archetypes });
  let entries;
  if (mode.id === 'faction-towers') {
    entries = data.modes
      .filter((m) => m.allowedFactions && m.builderOnly)
      .map((m) => {
        const c = makeContext({ heroes: data.heroById, mode: m, combos, archetypes: data.archetypes });
        const t = buildTeam(c, all);
        return toEntry(c, m, t, m.name);
      });
  } else {
    const count = mode.teams || 1;
    const { teams } = buildTeams(ctx, all, count, mode.category === 'pvp' ? 'balanced' : 'strongest');
    entries = teams.map((t, i) => toEntry(ctx, mode, t, count > 1 ? `Team ${i + 1}` : 'Best lineup'));
  }
  console.log(`\n## ${mode.name}`);
  for (const e of entries) console.log(`  ${e.name}: ${e.heroes.map((h) => `${h.pos}:${name(h.id)}`).join('  ')}  [${e.score}]\n    ${e.why}\n    ${e.differs}`);
  if (write) {
    const target = modes.modes.find((m) => m.id === mode.id);
    target.ai = entries.map((e) => {
      const prev = (target.ai || []).find((p) => p.name === e.name);
      // Keep Claude's reviewed text when the lineup did not change.
      if (prev && JSON.stringify(prev.heroes) === JSON.stringify(e.heroes) && prev.reviewed) return prev;
      return e;
    });
  }
}
// AI combinations: hero pairs that the engine keeps putting together across
// modes. Recurring pairs are the cores its calculation trusts most.
const pairCount = new Map();
for (const mode of modes.modes) {
  if (mode.builderOnly) continue;
  for (const t of mode.ai || []) {
    const ids = (t.heroes || []).map((h) => h.id).sort();
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const k = ids[i] + '|' + ids[j];
        const rec = pairCount.get(k) || { n: 0, modes: new Set() };
        rec.n++;
        rec.modes.add(mode.name);
        pairCount.set(k, rec);
      }
  }
}
const role = (id) => (data.heroById.get(id)?.roles || [])[0] || data.heroById.get(id)?.class.toLowerCase();
const aiCombos = [...pairCount.entries()]
  .filter(([, r]) => r.modes.size >= 2)
  .sort((a, b) => b[1].modes.size - a[1].modes.size || b[1].n - a[1].n)
  .slice(0, 10)
  .map(([k, r]) => {
    const [a, b] = k.split('|');
    return {
      heroes: [a, b],
      name: `${name(a)} + ${name(b)}`,
      why: `Paired in ${r.modes.size} calculated lineups (${[...r.modes].slice(0, 4).join(', ')}${r.modes.size > 4 ? '…' : ''}). ${name(a)} brings ${role(a)}, ${name(b)} brings ${role(b)}.`,
      modes: [...r.modes],
    };
  });
console.log('\n## AI combinations');
for (const c of aiCombos) console.log('  ' + c.name + ' — ' + c.why);

if (write) {
  modes.combos.ai = aiCombos.map((c) => {
    const prev = (modes.combos.ai || []).find((p) => p.name === c.name && p.reviewed);
    return prev || c;
  });
  await writeFile(root + 'data/modes.json', JSON.stringify(modes, null, 1) + '\n');
  console.log('\nwrote data/modes.json');
}
void tierOf;
