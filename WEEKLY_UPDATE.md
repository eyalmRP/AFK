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
  A hero's overall tier is the median (rounded down) of the lists from the last 2 months; older lists count only when nothing recent rates the hero. Mode-only grades (PvP, bosses) set those categories, not overall.
  AFK Global's hero tier list is AllClash's list with the bottom two tiers relabelled (AllClash C+ and C shown as C and D), so treat the two as one source: record AllClash's grade and don't count AFK Global as agreement. AllClash blocks scripts; ask the user for a PDF or text of its page if search results are thin. AFK Global calls Gwyneth (Draconis) "Awakened Gwyneth".
- **Mode guides** for each mode in `data/modes.json`, with priority on modes that have no community team yet: Legends Championship, Cursed Realm, King's Tower, faction towers and Treasure Scramble. Also check the current Twisted Realm boss and the Nightmare Corridor cycle.
- **Kits** for heroes whose `kitConfidence` is `low`. Fill in about 20 a week, newest and highest-rated first.
- **Redeem codes**: check them as part of this update (see "Code check" below). Codes last 4-10 weeks, so once a week catches them all.
- **Beasts**: new beasts, beast tier lists, and the beast the community pairs with each comp (Nightmare Corridor guides name one per comp).

## 2. Roster and portraits
```sh
python3 scripts/sync_roster.py          # dry run
python3 scripts/sync_roster.py --write  # adds new heroes + portraits
```
The script also adds new beasts to `data/beasts.json`.

For each new hero (`needsReview: true`), set `class`, `release` (YYYY-MM), `title`, `kit`, `kitConfidence`, `roles` and `position` from research. Then remove `needsReview`. For each new beast, set its `skill`, `roles`, `suits` and `tiers`.

Then update `data/beasts.json`:
- `tiers` (pve / pvp / boss), with `raw` per source.
- `bestFor`: hero ids or mode ids.
- `modeRecommendations`: `{mode, beast, heroes, why, source}`.
- `system`: which modes take a beast, and what upgrades do.

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
node scripts/publish-files.mjs --since HEAD~1   # data files + images changed in this commit
```
Republish with the Artifact tool:
- `url`: https://claude.ai/artifact/DFpXATaCfamkF5vLMpYpFG
- `file_path`: `/home/user/AFK/dist/artifact.html`, with `root`: `/home/user/AFK/dist`.
- `files`: the `data/*.json` files that changed (codes.json included) plus any new `img/heroes/*.webp`. Files you leave out stay published, so you don't need to resend old portraits.
- Leave out `capabilities` so the stored ones are kept.

Before publishing, take one look at the built page (`npm run serve` and a Playwright screenshot). Finally, reply with a short summary: new heroes, tier moves, new community teams, and what is still missing.

## Code check
Part of the weekly update (there is no separate daily routine any more). The Codes tab's "Check for new codes" button also runs it on demand: it fires the routine "AFK Codex code check (on demand)" (`trig_019yAgo8pJRoVhbYdZA7JacV`, no schedule) through the viewer's Claude Code Remote connector, and that run commits, pushes and republishes `data/codes.json` itself. It only touches `data/codes.json`:
1. Search for AFK Arena redemption codes posted or confirmed since `lastChecked`, and for codes that have expired.
2. Add new codes with the exact code string, `server` (`classic` or `companions`; codes come in pairs, one per server), `rewards` (null if not published), `firstSeen`, `expires`, `status` (active / expired / unverified) and `sources`. Never invent a code. A code seen on only one low-reliability site is `unverified`. Mark codes past their expiry as `expired`.
3. Set `lastChecked` and `asOf` to today.
4. It is committed, pushed and republished with the rest of the weekly update (step 7); include `data/codes.json` in `files`.
