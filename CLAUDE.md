# AFK Arena Codex

A static web app (vanilla JS bundled with esbuild) published as a claude.ai artifact: https://claude.ai/artifact/DFpXATaCfamkF5vLMpYpFG

- Weekly data refresh: follow `WEEKLY_UPDATE.md` step by step.
- Before every commit run `npm run validate && npm test && npm run build`.
- Data lives in `data/*.json`. Never invent heroes, ratings or community teams. Label anything partial or inferred, and record gaps in `meta.gaps`.
- Hero ids are lowercase names with non-alphanumerics replaced by `-` (`awakened-talene`). Awakened-type heroes that have no base version use their plain name (`envydiel`, `hybris`).
- `src/js/engine.js` and `src/js/learn.js` are pure and shared by the browser, `scripts/engine-baseline.mjs` and the tests. Keep them free of DOM code.
- The game is AFK Arena by Lilith Games, not AFK Journey. Ignore AFK Journey sources.

## Reel Studio (slot-animator/)

- `slot-animator/` is a separate app: a slot machine win animator. The After Effects project export is the main deliverable; MP4 is only a quick preview (no MOV export). It shares only the root `package.json` and esbuild; see `slot-animator/README.md`.
- Before committing changes there run `npm run slots:test && npm run slots:build`.
- `slot-animator/src/js/core/` is pure (no DOM) and shared by the browser and the tests. The generated After Effects script must stay ES3.
- The app is dense, so help and findability are part of every change, not extras. For anything added or moved, check each item and keep it consistent with what is already there:
  - Tooltip card (`ui/tips.js`), with a demo (`ui/demos.js`) when motion or a picture explains it better than words; a section header tip is `sec:<tab>/<slug>`, a bank section `sec:bank/<slug>`. Dynamic controls get `data-tip`.
  - Glossaries use the same cards (help chips under the list they explain), never separate text panels.
  - Feature search (`ui/search.js`): an entry with the words a user would type, its `go` pointing at the real control id, a `when` for options that only show under a condition.
  - Short hints: one line in the panel, the rest in the tooltip. No new intro paragraphs.
  - "More settings" links (`moreLink`) both ways when a feature's settings live in two places; art lives in the Asset Bank, settings with the feature.
  - Section icon in `SECTION_ICONS`; trash can for removing, X only for closing or chips; greyed and explained when it does not apply (`ui/applies.js`).
  - Phones: hover does nothing there, so anything that only opens on hover also needs a tap.
  - The first run guide (`ui/guide.js`) and the README when the change is visible to a user.
