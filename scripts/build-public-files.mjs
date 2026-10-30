import { cp, mkdir, writeFile } from 'node:fs/promises';

const output = new URL('../dist/', import.meta.url);
await cp(new URL('../examples/', import.meta.url), new URL('examples/', output), { recursive: true });
await mkdir(new URL('licenses/', output), { recursive: true });
await cp(new URL('../src/vendor/LICENSE-sheetjs.txt', import.meta.url), new URL('licenses/LICENSE-sheetjs.txt', output));
await writeFile(new URL('.nojekyll', output), '');
// Preserve editor bookmarks. The retired map and builder are no longer shipped.
for (const [route, target] of [['builder/', '../'], ['builder/sketch/', '../../']]) {
  const directory = new URL(route, output);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL('index.html', directory), `<!doctype html><html lang="ja"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${target}"><title>machi.</title><a href="${target}">machi.を開く</a></html>`);
}
