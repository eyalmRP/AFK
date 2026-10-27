// Bundles slot-animator/src into slot-animator/dist: artifact.html (no
// document skeleton, as the claude.ai Artifact tool expects) and a
// standalone index.html you can open in any browser.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';

const root = new URL('..', import.meta.url).pathname;
const dist = root + 'dist/';

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const js = await build({
  entryPoints: [root + 'src/js/main.js'],
  bundle: true,
  format: 'iife',
  minify: true,
  target: ['es2020'],
  write: false,
  legalComments: 'none',
});
const css = await build({
  entryPoints: [root + 'src/css/app.css'],
  bundle: true,
  minify: true,
  write: false,
  loader: { '.css': 'css' },
});

const template = await readFile(root + 'src/index.html', 'utf8');
const jsText = js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const page = template.replace('/*__CSS__*/', () => css.outputFiles[0].text).replace('/*__JS__*/', () => jsText);

await writeFile(dist + 'artifact.html', page);
await writeFile(
  dist + 'index.html',
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n${page}\n</body></html>\n`
);
console.log(`built slot-animator/dist/ (page ${(page.length / 1024).toFixed(0)} KB)`);
