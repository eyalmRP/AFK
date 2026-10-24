# Weekly update runbook

A Claude routine runs this every Saturday. It takes one session, and every step is required unless it says optional.

Artifact: https://claude.ai/artifact/DFpXATaCfamkF5vLMpYpFG
Repo: `eyalmrp/afk`, branch `main`, cloned at `/home/user/AFK`.

## 0. Set up
```sh
cd /home/user/AFK && git pull origin main && npm install
```
Read `data/meta.json`. Its `asOf` is last week's date, and `gaps` lists what last week could not find. Spend part of this week's research on those gaps.

## 1. Research (WebSearch, "extended" mode for freshness)
Only record what a source actually says, and keep the URL and date of every source.
- **Patch notes and new heroes** since `asOf`. Use the AFK Arena fandom wiki "Update x.xxx" pages, afk.guide patch notes and afk.global.
- **Tier lists** from the last 2 months: Pocket Gamer, AllClash, AFK Global, Driffle, Pocket Tactics, afk.guide and others. Map grades onto S+ S A B C D, with SS → S+ and F → D.
- **Mode guides** for each mode in `data/modes.json`, with priority on modes that have no community team yet: Legends Championship, Cursed Realm, King's Tower, faction towers and Treasure Scramble. Also check the current Twisted Realm boss and the Nightmare Corridor cycle.
- **Kits** for heroes whose `kitConfidence` is `low`. Fill in about 20 a week, newest and highest-rated first.

## 2. Roster and portraits
```sh
python3 scripts/sync_roster.py          # dry run
python3 scripts/sync_roster.py --write  # adds new heroes + portraits
```
For each new hero (`needsReview: true`), set `class`, `release` (YYYY-MM), `title`, `kit`, `kitConfidence`, `roles` and `position` from research. Then remove `needsReview`.

## 3. Update `data/heroes.json`
For each rated hero, update:
- `tiers`: `overall` / `pve` / `pvp` / `boss`. Use only the categories a source rates.
- `raw`: one entry per source id, holding that source's own grade text.
- `consensus`: `strong` if sources agree within one tier, otherwise `mixed` or `single-source`.
- `trend`: `rising` or `falling` against last week, otherwise null.
- `tierNote`: one or two sentences.

Set `isNew` to true when `release` falls within the last 12 months. Add any new source to `meta.sources` with an `id` that matches the `raw` keys.

## 4. Update `data/modes.json` (community)
For each mode, replace stale `community` entries with this week's best-supported teams.
- Each team has `{name, consensus: strong|common|niche, heroes: [{id, pos}], why, sources: [urls], date}`.
- `pos` is one of F1, F2 (front) and B1, B2, B3 (back). If the source gives no positions, set `positionsInferred: true`.
- If fewer than 5 heroes are known, set `partial: true`. Never invent the missing heroes.
- A list of separate comps uses `{kind: "cores", cores: [ids]}`.
- Add `dated: true` when the source is more than a year old.
- Update `bosses` and `bossesUnknown`. Keep `combos.community` and `pvpArchetypes` current.

## 5. AI analysis
```sh
node scripts/engine-baseline.mjs --write
```
This recalculates the AI teams and AI combos from the full roster. Then review every mode as an analyst:
- Fix any lineup that ignores a mode mechanic you know of (ultimate caps, kill mechanics, faction-only rules). Do this by adjusting `needs` or `classBonus` on the mode, or by editing the team.
- Rewrite `why` in plain language and add `differs` (how it compares with the community), `confidence` (`high` / `medium` / `low`) and `reviewed: true`.
- Update `aiNotes` per mode with the one thing a player should know.

## 6. Update `data/meta.json`
Update these fields:
- `asOf`: today. `nextUpdate`: today + 7.
- `gameVersion` and `summary`: 3 sentences on what matters this week.
- `metaShifts`: newest first. `mustBuild`.
- `gaps`: honest, and remove the gaps you closed.
- Prepend a `changelog` entry that lists what changed.

## 7. Check, commit, publish
```sh
npm run validate && npm test && npm run build
git add -A && git commit -m "Weekly meta update YYYY-MM-DD" && git push -u origin main
node scripts/publish-files.mjs   # prints the files list
```
Republish with the Artifact tool:
- `url`: https://claude.ai/artifact/DFpXATaCfamkF5vLMpYpFG
- `file_path`: `/home/user/AFK/dist/artifact.html`, with `root`: `/home/user/AFK/dist`.
- `files`: the four `data/*.json` plus any new `img/heroes/*.webp`. Files you leave out stay published, so you don't need to resend old portraits.
- Leave out `capabilities` so the stored ones are kept.

Before publishing, take one look at the built page (`npm run serve` and a Playwright screenshot). Finally, reply with a short summary: new heroes, tier moves, new community teams, and what is still missing.
