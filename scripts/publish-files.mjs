// Prints the `files` list for republishing the claude.ai artifact after a
// build, relative to dist/. With `--since <git ref>` it lists only the data
// files plus images added or changed since that ref: files left out of an
// update stay published, and one publish takes at most 255 files.
import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const dist = new URL('../dist/', import.meta.url).pathname;
const i = process.argv.indexOf('--since');
const since = i > 0 ? process.argv[i + 1] : null;
const list = [];
for (const f of (await readdir(dist + 'data')).sort()) list.push({ path: `data/${f}` });
if (since) {
  const changed = execFileSync('git', ['diff', '--name-only', '--diff-filter=AM', since, '--', 'img'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  for (const p of changed) list.push({ path: p });
} else {
  for (const dir of ['img/heroes', 'img/icons/factions', 'img/icons/classes', 'img/icons/types', 'img/artifacts']) {
    for (const f of (await readdir(dist + dir)).sort()) list.push({ path: `${dir}/${f}` });
  }
}
console.log(JSON.stringify(list));
console.error(`${list.length} files${list.length > 255 ? ' — over the 255-per-publish limit: use --since <ref>' : ''}`);
