// Prints the `files` list for republishing the claude.ai artifact after a
// build: every data file and portrait under dist/, relative to dist/.
import { readdir } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url).pathname;
const list = [];
for (const dir of ['data', 'img/heroes']) {
  for (const f of (await readdir(dist + dir)).sort()) list.push({ path: `${dir}/${f}` });
}
console.log(JSON.stringify(list));
console.error(`${list.length} files (limit 255 per publish)`);
