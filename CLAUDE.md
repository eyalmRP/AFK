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
