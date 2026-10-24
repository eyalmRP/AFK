# AFK Arena Codex

A static web app (vanilla JS bundled with esbuild) published as a claude.ai artifact: https://claude.ai/artifact/DFpXATaCfamkF5vLMpYpFG

- Weekly data refresh: follow `WEEKLY_UPDATE.md` step by step.
- Before every commit run `npm run validate && npm test && npm run build`.
- Data lives in `data/*.json`. Never invent heroes, ratings or community teams. Label anything partial or inferred, and record gaps in `meta.gaps`.
- Hero ids are lowercase names with non-alphanumerics replaced by `-` (`awakened-talene`). Awakened-type heroes that have no base version use their plain name (`envydiel`, `hybris`).
- `src/js/engine.js` is pure and is shared by the browser, `scripts/engine-baseline.mjs` and the tests. Keep it free of DOM code.
- The game is AFK Arena by Lilith Games, not AFK Journey. Ignore AFK Journey sources.
