# AFK Arena Codex

A weekly-updated meta tracker and team planner for **AFK Arena** (Lilith Games).

**Live page:** https://claude.ai/artifact/DFpXATaCfamkF5vLMpYpFG (private to the owner until shared from the page's Share menu)

## What's in it

| Tab | What it does |
| --- | --- |
| **Meta** | This week's summary, hero tier table (Overall / PvE / PvP / Bosses, filter by faction and class), artifacts by tier, formations for every game mode with **community consensus and AI analysis side by side**, best combinations (community vs AI), PvP archetypes, sources and known gaps. Every section and every tier row folds. |
| **Hero Bank** | Your roster: find, sort, filter, select and batch edit, per-hero editor, card or table view (edit values inline), import/export JSON, and **upload screenshots** that Claude reads to fill in ascension, stars, level, signature item, furniture and engraving. "All heroes share the same level" is on by default, with one level box (the Resonating Crystal level). |
| **Formation Builder** | Pick a game mode and 1–7 formations. The rules engine builds teams from your heroes that never share a hero, with artifacts, coverage checks, reasons and the best next upgrade. "Ask Claude" gives Claude's own lineups next to the engine's. |
| **Counter** | Enter the enemy formation by hand, from a screenshot, or from a common comp. You get a counter team from your heroes, plus a ranking of your best individual counter picks and Claude's take. |

Screenshot reading and "Ask Claude" run on the viewer's own Claude account and only work when the page is opened in Claude. The hero bank is saved privately to your Claude account, with a copy in the browser.

## How the data stays current

Every Saturday a Claude routine follows [`WEEKLY_UPDATE.md`](WEEKLY_UPDATE.md):
1. It researches the newest tier lists, patch notes and mode guides.
2. It syncs the hero roster and portraits from the game's unit database.
3. It updates the ratings and the community teams.
4. It recalculates the AI analysis and reviews it.
5. It validates the data, commits to `main`, and republishes the page.

## Data

- `data/heroes.json`: 229 ascended-tier heroes in 8 factions, with faction, class, type, roles, release month, tiers per category with each source's raw grade, kit, synergies and counters.
- `data/artifacts.json`: artifacts with PvE/PvP tiers, classes they suit, best-in-slot heroes and class restrictions.
- `data/modes.json`: game modes with rules, mechanics and bosses; community teams (partial lineups and inferred positions are labelled); the AI teams with explanations; combos and PvP archetypes.
- `data/meta.json`: the weekly summary, meta shifts, must-build list, sources, known gaps, system limits and changelog.
- `img/heroes/`: 128px portraits, taken from the [floofpire/cdn](https://github.com/floofpire/cdn) mirror of the game's CDN.

## Develop

```sh
npm install
npm run build      # dist/artifact.html (claude.ai page), dist/index.html (any static host), data + images
npm run serve      # http://localhost:4173 serving dist/
npm test           # engine tests
npm run validate   # data reference checks
node scripts/engine-baseline.mjs           # print engine teams for every mode
python3 scripts/sync_roster.py             # list heroes that are new in the game
```

`dist/index.html` also works on any static host, such as GitHub Pages. There, the bank is saved in the browser only, and the Claude features are hidden.

Code layout: `src/js/engine.js` (team scoring and search), `src/js/store.js` (bank persistence), `src/js/ai.js` (Claude calls), `src/js/ui/*` (tabs), `src/css/app.css`.

Fan-made and not affiliated with Lilith Games. Hero art belongs to its owners.
