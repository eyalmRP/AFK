// Formation Counter tab: enter the enemy formation (by hand or from a
// screenshot) and get the best answer from the player's own heroes.

import { esc, $, toast } from '../util.js';
import { data, hero as getHero, POSITIONS, FACTIONS, LIMITS, ASSUMED_BUILDS, BEAST_BUFF_TOTAL, assumedEntry, factionAdvantage } from '../data.js';
import { bank, ownedIds, ownedBeasts } from '../store.js';
import { makeContext, buildTeam, heroValue, scoreTeam, suggestBeast } from '../engine.js';
import { aiState, initAi, claudeCounter, readEnemyScreenshot, errorCopy } from '../ai.js';
import { ICON } from './icons.js';
import { board, pickHero, pickBeast, portrait, slotsFromList, beastAllowed, entryCR, heroCR, fmtCR, CR_NOTE, playerLevel } from './common.js';
import { openHeroDetail } from './heroDetail.js';
import { openBeastDetail } from './beastDetail.js';
import { battleRecords, logStatus, logLine, learnedTeamFor, learnedLine } from './battles.js';
import { learnedMap, winChance } from '../learn.js';

const ui = {
  enemy: {},
  modeId: 'arena-of-heroes',
  pool: 'mine',
  // How hero strength counts: tier only, the player's upgrade levels, or
  // their estimated combat rating (engine.js heroValue).
  weigh: 'power',
  claude: null,
  claudeNotes: '',
  busy: false,
  ctl: null,
  reading: false,
  // The enemy's level, upgrades and beast. The formation screen doesn't show
  // enemy upgrades, so the counter assumes a well-built enemy.
  enemyLevel: null,
  enemyBuild: 'high',
  enemyBeast: null,
  enemyBeastLevel: 18,
};

const WEIGH = [
  ['power', 'Combat power', 'Your copies\' combat rating decides first (fitted to your in-game ratings); tiers, counters and synergies choose among heroes of similar strength'],
  ['upgrades', 'My upgrades', 'Tier ratings first, adjusted for ascension, stars, signature item, furniture, engraving and the Elder Tree'],
  ['tier', 'Tier only', 'Tier ratings, counters and synergies, as if every hero were fully built'],
];

const ENEMY_BUILDS = ASSUMED_BUILDS;

// Enemy heroes as drawn and rated: Ascended 5 stars with the chosen upgrades.
function enemyBuild() {
  return assumedEntry(ui.enemyBuild);
}

// The player's own level, the default for the enemy.
function myLevel() {
  return playerLevel();
}

function enemyLevel() {
  return ui.enemyLevel ?? myLevel();
}


let root;

export function mountCounter(el) {
  root = el;
  if (!data.modeById.has(ui.modeId)) ui.modeId = data.modes.find((m) => m.category === 'pvp')?.id || data.modes[0]?.id;
  // Open on a realistic example: the most-agreed PvP comp this week.
  const ex = data.modeById.get('arena-of-heroes')?.community?.find((t) => t.heroes?.length === 5);
  if (ex) ui.enemy = slotsFromList(ex.heroes);
  if (!ownedIds().length) ui.pool = 'all';
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  render();
}

export function refreshCounter() {
  if (!root) return;
  if (ui.pool === 'mine' && !ownedIds().length) ui.pool = 'all';
  render();
}

function enemyIds() {
  return POSITIONS.map((p) => ui.enemy[p]).filter(Boolean);
}

function poolIds() {
  const base = ui.pool === 'mine' ? ownedIds() : data.heroes.map((h) => h.id);
  const enemy = new Set(enemyIds());
  return base.filter((id) => getHero(id) && (ui.pool === 'mine' || !enemy.has(id)));
}

function context() {
  return makeContext({
    heroes: data.heroById,
    entries: ui.pool === 'mine' && ui.weigh !== 'tier' ? bank.heroes : null,
    mode: data.modeById.get(ui.modeId),
    category: data.modeById.get(ui.modeId)?.category || 'pvp',
    enemy: enemyIds(),
    // AI combos are pairs this engine keeps picking; scoring them would reward its own past picks.
    combos: data.combos.community || [],
    matchups: data.matchups,
    archetypes: data.archetypes,
    elderTree: ui.pool === 'mine' && ui.weigh === 'upgrades' ? bank.settings.elderTree : null,
    power: ui.pool === 'mine' && ui.weigh === 'power' ? new Map(ownedIds().map((id) => [id, heroCR(getHero(id))])) : null,
    // The battle log: its results always, what it learned only once that proved itself (learn.js).
    records: battleRecords(),
    // Lessons from battles and top formations are about PvP.
    learned: pvp() ? learnedMap(logStatus()) : null,
    learnedTeam: pvp() ? learnedTeamFor(enemyIds()) : null,
  });
}

function pvp() {
  return data.modeById.get(ui.modeId)?.category === 'pvp';
}

function threatChips(ctx) {
  const t = ctx.enemyThreats;
  const items = [
    ['burst', 'Burst / assassins'],
    ['sustain', 'Healing & shields'],
    ['control', 'Crowd control'],
    ['energy', 'Energy gain'],
    ['summons', 'Summons'],
  ];
  return items
    .filter(([k]) => t[k])
    .map(([k, l]) => `<span class="tag ${t[k] >= 2 ? 'warn' : ''}">${l} ×${t[k]}</span>`)
    .join('');
}

function factionAdvice(ctx) {
  const counts = {};
  for (const h of ctx.enemy) counts[h.faction] = (counts[h.faction] || 0) + 1;
  const best = FACTIONS.map((f) => ({ f: f.id, n: ctx.enemy.filter((h) => factionAdvantage(f.id, h.faction)).length })).filter((x) => x.n).sort((a, b) => b.n - a.n);
  const mix = Object.entries(counts)
    .map(([f, n]) => `${n} ${esc(f)}`)
    .join(', ');
  return `<p class="small"><span class="muted">Enemy factions:</span> ${mix || '–'}${best.length ? ` · <span class="muted">Faction advantage (+25% damage) from:</span> ${best.map((b) => `${esc(b.f)} (vs ${b.n})`).join(', ')}` : ''}</p>`;
}

function render() {
  const modes = data.modes.filter((m) => !m.builderOnly);
  const owned = ownedIds().length;
  const ctx = context();
  const beasts = !!data.beasts?.length && beastAllowed(data.modeById.get(ui.modeId));
  const archetypeOpts = (data.archetypes || [])
    .map((a, i) => `<option value="arch-${i}">${esc(a.name)}</option>`)
    .concat(
      (data.modeById.get('arena-of-heroes')?.community || [])
        .filter((t) => t.heroes?.length >= 3)
        .map((t, i) => `<option value="team-${i}">${esc(t.name)}</option>`)
    )
    .join('');
  root.innerHTML = `
    <div class="view-head"><div><p class="eyebrow">Beat what you see</p><h2>Formation counter</h2>
      <p>Put in the enemy formation, by hand or from a screenshot. The counter uses your heroes, their upgrades, known counters, faction advantage and positioning.</p></div></div>
    <div class="controls-rail">
      <label class="field"><span>Mode</span><select class="select" id="ct-mode">${modes.map((m) => `<option value="${esc(m.id)}" ${m.id === ui.modeId ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
      <div class="field"><span>Heroes</span><div class="seg" role="group"><button type="button" data-pool="mine" aria-pressed="${ui.pool === 'mine'}">My heroes (${owned})</button><button type="button" data-pool="all" aria-pressed="${ui.pool === 'all'}">Full roster</button></div></div>
      <div class="field" ${ui.pool === 'mine' ? '' : 'hidden'}><span>Weigh heroes by</span><div class="seg" role="group" aria-label="Weigh heroes by">${WEIGH.map(([k, l, t]) => `<button type="button" data-weigh="${k}" aria-pressed="${ui.weigh === k}" title="${t}">${l}</button>`).join('')}</div></div>
      <label class="field"><span>Load a common enemy</span><select class="select" id="ct-load"><option value="">Choose…</option>${archetypeOpts}</select></label>
    </div>
    ${ui.pool === 'all' ? `<p class="callout small">${owned ? 'Countering with the full roster at full investment.' : 'Your hero bank is empty, so counters use the full roster. Add your heroes in the Hero Bank tab for counters you can field.'}</p>` : ''}
    <div class="compare ct-compare">
      <section>
        <div class="side-title">${ICON.swords} Enemy formation</div>
        ${board({ slots: ui.enemy, editable: true, cls: 'enemy-board', mirror: true, build: enemyBuild(), level: enemyLevel(), beastEdit: beasts, beast: beasts ? ui.enemyBeast : null, beastLevel: ui.enemyBeastLevel })}
        <div class="enemy-opts">
          <label class="field"><span>Hero level</span><input class="input" id="ct-elevel" type="number" inputmode="numeric" min="1" max="${LIMITS.level}" value="${enemyLevel()}" placeholder="${myLevel()}" title="Yours: ${myLevel()}"></label>
          <label class="field"><span>Upgrades (assumed)</span><select class="select" id="ct-ebuild">${Object.entries(ENEMY_BUILDS)
            .map(([k, b]) => `<option value="${k}" ${k === ui.enemyBuild ? 'selected' : ''}>${esc(b.label)}</option>`)
            .join('')}</select></label>
          ${
            beasts
              ? `<label class="field"><span>Beast level</span><select class="select" id="ct-eblevel" ${ui.enemyBeast ? '' : 'disabled'}>${Array.from({ length: BEAST_BUFF_TOTAL }, (_, i) => i + 1)
                  .map((n) => `<option value="${n}" ${n === ui.enemyBeastLevel ? 'selected' : ''}>${n}</option>`)
                  .join('')}</select></label>`
              : ''
          }
        </div>
        <p class="small muted">The game doesn't show enemy upgrades, so enemy heroes count as Ascended 5 stars with the upgrades above.${beasts ? ' Tap Beast in the row to set theirs.' : ''}</p>
        <div class="toolbar">
          <button class="btn primary" type="button" data-act="find" ${enemyIds().length ? '' : 'disabled'}>${ICON.spark} Find best counter</button>
          <button class="btn" type="button" data-act="shot" id="ct-shot" hidden>${ICON.upload} Read a screenshot</button>
          <input type="file" id="ct-file" accept="image/png,image/jpeg,image/webp" hidden>
          <button class="btn" type="button" data-act="clear">Clear</button>
          <span class="small muted" id="ct-status"></span>
        </div>
        ${enemyIds().length ? `<div class="chips">${threatChips(ctx)}</div>${factionAdvice(ctx)}${ctx.enemyArchetypes.length ? `<p class="small"><span class="muted">Recognised comp:</span> ${ctx.enemyArchetypes.map((a) => esc(a.name)).join(', ')}</p>` : ''}${knownLineup(ctx)}${
          ctx.enemyMatchups.length
            ? `<p class="small"><span class="muted">Known answer:</span> ${ctx.enemyMatchups.map((m) => `${esc(m.vsName)} loses to ${esc(m.beatenBy.map((t) => t.name).join(', '))} (<a href="${esc(m.url)}" target="_blank" rel="noopener">source</a>)`).join('; ')}</p>`
            : ''
        }${logFacts(ctx)}` : '<p class="small muted">Select a slot to add an enemy hero.</p>'}
      </section>
      <section><div id="ct-result"></div><div id="ct-claude"></div></section>
    </div>
    <div id="ct-picks"></div>`;
  renderResult(ctx);
  renderClaude();
  initAi().then(() => {
    const b = $('#ct-shot', root);
    if (b) b.hidden = !(aiState.images && !aiState.disabled);
  });
}

function renderResult(ctx) {
  const host = $('#ct-result', root);
  const picks = $('#ct-picks', root);
  if (!enemyIds().length) {
    host.innerHTML = `<div class="side-title">${ICON.spark} Your counter</div><div class="empty"><p>Add at least one enemy hero to get a counter.</p></div>`;
    picks.innerHTML = '';
    return;
  }
  const pool = poolIds();
  const best = pool.length ? buildTeam(ctx, pool) : null;
  ui.engineTeam = best;
  if (!best) {
    host.innerHTML = `<div class="side-title">${ICON.spark} Your counter</div><div class="empty"><h4>No heroes to counter with</h4><p>Add heroes in the Hero Bank tab, or switch to the full roster.</p></div>`;
    picks.innerHTML = '';
    return;
  }
  const s = best.score;
  const reasons = POSITIONS.map((p) => s.layout[p])
    .filter(Boolean)
    .map((id) => {
      const m = s.members.find((x) => x.id === id);
      const counterReasons = (m.reasons || []).filter((r) => /counter|weak|answers|protects|breaks|shrugs|drains|struggles|faction/.test(r));
      return `<li><b>${esc(getHero(id).name)}</b><span>${esc((counterReasons.length ? counterReasons : m.reasons.slice(0, 2)).join(' · '))}</span></li>`;
    })
    .join('');
  const bp = beastFor(ctx, Object.values(s.layout), s);
  host.innerHTML = `<div class="side-title">${ICON.spark} Your counter (rules engine)</div>
    <p class="small muted">Recalculated each time you change the enemy, the mode or your heroes.</p>
    ${counterKnowledge(ctx) ? '' : `<p class="callout small"><strong>No counter data for these enemies yet.</strong> The sources this week don't say which heroes beat ${esc(ctx.enemy.map((h) => h.name).join(', '))}, so this is your strongest team for ${esc(ctx.mode?.name || 'this mode')}, adjusted for faction advantage and positions. Ask Claude below for a matchup-based counter.</p>`}
    <article class="result-card">
      ${verdict(Object.values(s.layout), bp.id)}
      ${ownCallout(s.own, ctx, Object.values(s.layout))}
      ${
        s.beats
          ? `<p class="callout ${s.beats.evidence === 'suggested' ? 'info' : 'good'} small"><strong>${s.beats.evidence === 'suggested' ? 'Based on a suggestion:' : 'Built on'} ${esc(s.beats.name)}</strong>${s.beats.overlap < s.beats.size ? ` (${s.beats.overlap} of its ${s.beats.size} heroes: ${swapText(s.beats.heroes, Object.values(s.layout))})` : ''}, which beats ${esc(s.beats.vsName)}${s.beats.vsMatch < s.beats.vsSize ? ` (your enemy has ${s.beats.vsMatch} of its ${s.beats.vsSize} heroes)` : ''}: ${esc(s.beats.claim || '')} <a href="${esc(s.beats.url)}" target="_blank" rel="noopener">Source</a>, ${esc(s.beats.date || '')}.</p>`
          : ''
      }
      <header><h4>${esc(s.own?.wins && s.own.bonus > 0 ? 'Beat this lineup in your log' : s.beats?.name || s.template?.name || 'Counter formation')}</h4><span class="score">${s.total.toFixed(1)} pts</span></header>
      ${board({ slots: s.layout, showBank: ui.pool === 'mine', beast: bp.id })}
      ${bp.html}
      <ul class="reasons">${reasons}</ul>
      ${s.synergies.length ? `<p class="small"><span class="muted">Synergy:</span> ${s.synergies.map((x) => `${esc(getHero(x.a).name)} + ${esc(getHero(x.b).name)}`).join(', ')}</p>` : ''}
      ${learnedLine(s.learned)}
    </article>
    <p class="small muted bt-line">${esc(logLine())}</p>`;
  // Individual hero ranking against this enemy.
  const ranked = pool
    .map((id) => ({ id, v: heroValue(ctx, id) }))
    .sort((a, b) => b.v.counterBonus - a.v.counterBonus || b.v.value - a.v.value)
    .slice(0, 10);
  picks.innerHTML = `<div class="side-title">Top counter picks${ui.pool === 'mine' ? ' you own' : ''}</div>
    <div class="picks-grid" style="margin-top:8px">${ranked
      .map(
        ({ id, v }) => `<button type="button" class="combo" data-hero="${id}" style="cursor:pointer;text-align:left">
      <span class="heroes">${portrait(getHero(id), { size: 40, showBank: ui.pool === 'mine' })}</span>
      <span class="txt"><strong>${esc(getHero(id).name)}</strong> <span class="score">${v.counterBonus >= 0 ? '+' : ''}${v.counterBonus.toFixed(1)} matchup</span>
      <p class="small clamp-2" title="${esc(v.reasons.join(' · '))}">${esc(v.reasons.slice(0, 4).join(' · '))}</p></span></button>`
      )
      .join('')}</div>`;
}

// Can this team win? Compares the counter's estimated power with the
// enemy's at its assumed build and level (combat rating estimate, engine.js;
// beasts not counted). A rough guide: counters and faction edge can swing a
// close fight, rarely a gap of 20% or more.
function verdict(ids, beastId = null) {
  const enemy = enemyIds();
  if (ui.pool !== 'mine' || !enemy.length) return '';
  const theirs = enemy.reduce((t, id) => t + entryCR(enemyBuild(), getHero(id), enemyLevel()), 0);
  const ours = ids.reduce((t, id) => t + heroCR(getHero(id)), 0);
  const r = ours / theirs;
  const pct = Math.round((r >= 1 ? r - 1 : 1 / r - 1) * 100);
  let v;
  if (enemy.length < 5) v = ['info', 'Enemy formation incomplete', `With ${enemy.length} of 5 enemy heroes in, the power check isn't meaningful yet.`];
  else if (r >= 1.1) v = ['good', 'You should win', `Your team is about ${pct}% stronger.`];
  else if (r >= 0.9) v = ['close', 'Close match', `The teams are within ${pct}% of each other, so faction edge, counters and positioning decide it.`];
  else if (r >= 0.8) v = ['warn', 'Hard fight', `The enemy is about ${pct}% stronger. You need the counters and faction edge to land.`];
  else v = ['bad', "You probably can't win this", `The enemy is about ${pct}% stronger. Counters and faction edge rarely make up that much: upgrade your heroes first or pick another opponent.`];
  // Once the battle log's model has proved itself, its own estimate.
  const st = logStatus();
  const mine = beastId ? bank.beasts[beastId] : null;
  const myBeast = mine && [mine.str, mine.int, mine.agi].every((x) => Number.isFinite(x)) ? mine.str + mine.int + mine.agi : null;
  const chance = enemy.length >= 3 ? winChance(st, { ids, power: ours, beastLevel: myBeast }, { ids: enemy, power: theirs, beastLevel: ui.enemyBeast ? ui.enemyBeastLevel : null }, data.heroById) : null;
  if (chance !== null) v[2] += ` Your battle log puts your chance at about ${Math.round(chance * 100)}%.`;
  return `<div class="verdict ${v[0]}" role="status" title="${esc(CR_NOTE)}"><strong>${v[0] === 'bad' ? '⚠ ' : ''}${v[1]}</strong><span>${v[2]}</span>
    <span class="small">Team power ≈ <b class="num">${fmtCR(ours)}</b> vs enemy ≈ <b class="num">${fmtCR(theirs)}</b> (estimates; enemy assumed ${esc(ENEMY_BUILDS[ui.enemyBuild]?.label || '')} at level ${enemyLevel()})</span></div>`;
}

// "Sung Jinwoo instead of Leviathan": how a lineup differs from the source's.
function swapText(source, team) {
  const out = source.filter((id) => !team.includes(id)).map((id) => getHero(id)?.name || id);
  const inn = team.filter((id) => !source.includes(id)).map((id) => getHero(id)?.name || id);
  if (!out.length) return 'all of it';
  const outIds = source.filter((x) => !team.includes(x));
  const inIds = team.filter((x) => !source.includes(x));
  const why = out.map((n, i) => {
    const id = outIds[i];
    if (!bank.heroes[id]?.owned) return `${n} (not owned)`;
    const swapIn = inIds[i] && getHero(inIds[i]);
    return swapIn && heroCR(getHero(id)) < heroCR(swapIn) ? `${n} (your copy is less built)` : `${n} (rated lower against this enemy)`;
  });
  return `${inn.join(', ')} instead of ${why.join(', ')}`;
}

// The enemy matches a community lineup from a PvP mode (4+ of its heroes).
function knownLineup(ctx) {
  const ids = new Set(ctx.enemy.map((h) => h.id));
  const hits = [];
  for (const m of data.modes.filter((x) => x.category === 'pvp')) {
    for (const t of m.community || []) {
      const tIds = (t.heroes || []).map((x) => x.id);
      const n = tIds.filter((id) => ids.has(id)).length;
      if (tIds.length >= 4 && n >= 4) hits.push(`${t.name}${n < tIds.length ? ` (${n}/${tIds.length})` : ''}`);
    }
  }
  return hits.length ? `<p class="small"><span class="muted">Matches:</span> ${hits.map(esc).join(', ')}</p>` : '';
}

// Whether the data knows anything about beating this enemy: a hero listed as
// countering one of them, or a recognised enemy comp with known answers.
function counterKnowledge(ctx) {
  const ids = new Set(ctx.enemy.map((h) => h.id));
  if (ctx.enemy.some((h) => (h.counteredBy || []).length)) return true;
  if (ctx.enemyArchetypes.some((a) => (a.counteredBy || []).length)) return true;
  if (ctx.enemyMatchups.length) return true;
  if ((ctx.enemyRecords || []).some((r) => r.result === 'win')) return true;
  return data.heroes.some((h) => (h.counters || []).some((c) => ids.has(c)));
}

const fmtDay = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const names = (ids) => ids.map((id) => getHero(id)?.name || id).join(', ');

// What the battle log says about this enemy: lineups like it that were beaten, and by whom.
function logFacts(ctx) {
  const recs = ctx.enemyRecords || [];
  if (!recs.length) return '';
  const wins = recs.filter((r) => r.result === 'win');
  const losses = recs.filter((r) => r.result === 'loss');
  const part = (list) => list.slice(0, 3).map((r) => `${esc(names(r.team))} (${esc(fmtDay(r.date))})`).join('; ');
  return `<p class="small"><span class="muted">In your battle log, a lineup like this</span> ${[wins.length ? `lost ${wins.length}×, to ${part(wins)}` : '', losses.length ? `won ${losses.length}×, against ${part(losses)}` : ''].filter(Boolean).join('; and ')}.</p>`;
}

// The player's own results with (nearly) the suggested team against a lineup
// like this; or, when the counter picked something else, the logged wins it
// passed over with teams the player can field.
function ownCallout(own, ctx, ids) {
  if (!own) {
    const pool = new Set(poolIds());
    const other = (ctx.enemyRecords || []).filter((r) => r.result === 'win' && r.team.filter((id) => pool.has(id)).length >= 4 && r.team.filter((id) => ids.includes(id)).length < 4);
    if (!other.length) return '';
    const r = other[0];
    return `<p class="callout small"><strong>From your battle log:</strong> ${esc(names(r.team))} beat a lineup like this on ${esc(fmtDay(r.date))}${r.trust < 1 ? ', though that team was much stronger' : ''}. The counter rates the team below higher with your heroes as they are now.</p>`;
  }
  const rec = `won ${own.wins}, lost ${own.losses}`;
  if (own.bonus > 0) {
    const team = own.lastWin.team;
    const swaps = team.some((id) => !ids.includes(id)) ? ` Here it is with ${swapText(team, ids)}.` : '';
    return `<p class="callout good small"><strong>From your battle log:</strong> this team against a lineup like this: ${rec} (last win ${esc(fmtDay(own.lastWin.date))}).${swaps}</p>`;
  }
  return `<p class="callout small"><strong>From your battle log:</strong> a team like this against a lineup like this: ${rec}. It's still the best the counter found with your heroes, so check the swaps.</p>`;
}

// The beast the lineup's source uses, if it names one.
function sourceBeast(score) {
  const won = score?.own?.lastWin;
  if (won?.beast && score.own.bonus > 0) return { id: won.beast, label: `you won with it on ${fmtDay(won.date)}` };
  const from = score?.beats?.beast ? score.beats : score?.template?.beast ? score.template : null;
  return from ? { id: from.beast, label: `used with ${from.name}` } : null;
}

function beastFor(ctx, ids, score) {
  if (!data.beasts?.length || !beastAllowed(ctx.mode)) return { id: null, html: '' };
  const mine = ui.pool === 'mine';
  if (mine && !ownedBeasts().length) return { id: null, html: '<p class="beast-why">Mark your beasts in the Bank to get a beast pick.</p>' };
  const pick = suggestBeast(ctx, ids, { beasts: data.beasts, owned: mine ? bank.beasts : null, recommendations: data.beastModes, prefer: sourceBeast(score) });
  if (!pick) return { id: null, html: '' };
  return { id: pick.id, html: `<p class="beast-why"><strong>${esc(data.beastById.get(pick.id).name)}</strong>${pick.reasons?.length ? ` · ${esc(pick.reasons.slice(0, 3).join(' · '))}` : ''}</p>` };
}

function renderClaude() {
  const host = $('#ct-claude', root);
  if (!host) return;
  initAi().then(() => {
    if (!$('#ct-claude', root)) return;
    if (!aiState.text || aiState.disabled) {
      host.innerHTML = `<p class="callout info small">Claude's counter analysis is available when this page is open in Claude (claude.ai).</p>`;
      return;
    }
    if (ui.busy) {
      host.innerHTML = `<div class="side-title">${ICON.spark} Claude's counter</div><p class="small muted">Claude is studying the enemy formation…</p><div class="toolbar"><button class="btn" type="button" data-act="stop">${ICON.stop} Stop</button></div>`;
      return;
    }
    const ctx = context();
    if (ui.claude?.length) {
      host.innerHTML = `<div class="side-title">${ICON.spark} Claude's counter</div>${ui.claude
        .map((t, i) => {
          const s = scoreTeam(ctx, Object.values(t.slots));
          return `<article class="result-card"><header><h4>${i ? 'Alternative' : 'Primary'}: ${esc(t.name)}</h4><span class="score">${s.total.toFixed(1)} pts</span></header>
            ${board({ slots: t.slots, showBank: ui.pool === 'mine', beast: t.beast })}
            ${t.why ? `<p class="small prose">${esc(t.why)}</p>` : ''}${t.risks ? `<p class="small muted">Risk: ${esc(t.risks)}</p>` : ''}</article>`;
        })
        .join('')}${ui.claudeNotes ? `<p class="callout small">${esc(ui.claudeNotes)}</p>` : ''}
        <div class="toolbar"><button class="btn" type="button" data-act="claude">${ICON.spark} Ask again</button></div>`;
      return;
    }
    host.innerHTML = enemyIds().length
      ? `<div class="side-title">${ICON.spark} Claude's counter</div><div class="empty"><p>Claude weighs each enemy's kit, targeting and positioning against your exact heroes.</p>
        <button class="btn primary" type="button" data-act="claude">${ICON.spark} Ask Claude for a counter</button><span class="small muted">Uses your Claude account.</span></div>`
      : '';
  });
}

async function askClaude() {
  if (!enemyIds().length) return;
  ui.busy = true;
  ui.ctl = new AbortController();
  renderClaude();
  try {
    const out = await claudeCounter({
      enemySlots: ui.enemy,
      mode: data.modeById.get(ui.modeId),
      pool: poolIds(),
      entries: ui.pool === 'mine' ? bank.heroes : null,
      engineTeam: ui.engineTeam ? { layout: ui.engineTeam.score.layout } : null,
      enemyInfo: { level: enemyLevel(), build: ENEMY_BUILDS[ui.enemyBuild]?.label, beast: ui.enemyBeast ? data.beastById.get(ui.enemyBeast)?.name : null, beastLevel: ui.enemyBeast ? ui.enemyBeastLevel : null },
      signal: ui.ctl.signal,
      elderTree: ui.pool === 'mine' ? bank.settings.elderTree : null,
      beasts: ui.pool === 'mine' ? bank.beasts : null,
    });
    ui.claude = out.teams;
    ui.claudeNotes = out.notes;
    if (!out.teams.length) toast('Claude did not return a usable formation. Try again.', 'error');
  } catch (e) {
    if (e?.code !== 'cancelled') toast(errorCopy(e), 'error');
  } finally {
    ui.busy = false;
    renderClaude();
  }
}

async function readShot(file) {
  const status = $('#ct-status', root);
  status.textContent = 'Claude is reading the screenshot…';
  try {
    const out = await readEnemyScreenshot(file);
    if (!Object.keys(out.slots).length) {
      status.textContent = 'No heroes recognised. Try a clearer screenshot of the enemy formation.';
      return;
    }
    ui.enemy = out.slots;
    if (out.level) ui.enemyLevel = out.level;
    if (out.beast) ui.enemyBeast = out.beast;
    ui.claude = null;
    render();
    toast(`Read ${Object.keys(out.slots).length} enemy heroes. Check the slots and fix any mistakes.`);
    if (out.notes) $('#ct-status', root).textContent = out.notes;
  } catch (e) {
    status.textContent = errorCopy(e);
  }
}

function onClick(ev) {
  const t = ev.target;
  const slot = t.closest('[data-slot]');
  if (slot) {
    const pos = slot.dataset.slot;
    pickHero({ title: `Enemy hero at ${pos}`, allowClear: true, showBank: false }).then((id) => {
      if (id === null) return;
      if (id) {
        for (const p of POSITIONS) if (ui.enemy[p] === id) delete ui.enemy[p];
        ui.enemy[pos] = id;
      } else delete ui.enemy[pos];
      ui.claude = null;
      render();
    });
    return;
  }
  const p = t.closest('[data-pool]');
  if (p) {
    ui.pool = p.dataset.pool;
    ui.claude = null;
    render();
    return;
  }
  const w = t.closest('[data-weigh]');
  if (w) {
    ui.weigh = w.dataset.weigh;
    ui.claude = null;
    render();
    return;
  }
  const bb = t.closest('[data-beast-detail]');
  if (bb) {
    openBeastDetail(bb.dataset.beastDetail);
    return;
  }
  const hb = t.closest('[data-hero]');
  if (hb && root.contains(hb)) {
    openHeroDetail(hb.dataset.hero);
    return;
  }
  const act = t.closest('[data-act]')?.dataset.act;
  if (act === 'clear') {
    ui.enemy = {};
    ui.enemyBeast = null;
    ui.claude = null;
    render();
  } else if (act === 'beast') {
    pickBeast({ title: 'Enemy beast', allowClear: true, category: data.modeById.get(ui.modeId)?.category === 'pvp' ? 'pvp' : 'pve' }).then((id) => {
      if (id === null) return;
      ui.enemyBeast = id || null;
      ui.claude = null;
      render();
    });
  } else if (act === 'find') {
    // The counter is recalculated on every change; this reruns it and brings it into view.
    renderResult(context());
    const card = $('#ct-result .result-card', root) || $('#ct-result', root);
    card?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card?.classList.remove('flash');
    void card?.offsetWidth;
    card?.classList.add('flash');
  } else if (act === 'claude') askClaude();
  else if (act === 'stop') ui.ctl?.abort();
  else if (act === 'shot') $('#ct-file', root).click();
}

function onChange(ev) {
  const t = ev.target;
  if (t.id === 'ct-mode') {
    ui.modeId = t.value;
    ui.claude = null;
    render();
  } else if (t.id === 'ct-elevel') {
    // Empty goes back to the player's own level.
    const v = Math.round(Number(t.value));
    ui.enemyLevel = t.value === '' || !Number.isFinite(v) ? null : Math.min(LIMITS.level, Math.max(1, v));
    ui.claude = null;
    render();
  } else if (t.id === 'ct-ebuild') {
    ui.enemyBuild = t.value;
    ui.claude = null;
    render();
  } else if (t.id === 'ct-eblevel') {
    ui.enemyBeastLevel = Number(t.value);
    ui.claude = null;
    render();
  } else if (t.id === 'ct-file') {
    const f = t.files?.[0];
    if (f) readShot(f);
  } else if (t.id === 'ct-load' && t.value) {
    const [kind, i] = t.value.split('-');
    if (kind === 'arch') {
      const a = data.archetypes[Number(i)];
      ui.enemy = slotsFromList((a.core || []).map((id) => ({ id })));
    } else {
      const team = (data.modeById.get('arena-of-heroes')?.community || []).filter((x) => x.heroes?.length >= 3)[Number(i)];
      ui.enemy = slotsFromList(team.heroes);
    }
    ui.claude = null;
    render();
  }
}
