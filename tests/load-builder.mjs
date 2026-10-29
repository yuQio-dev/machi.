import { readFile } from 'node:fs/promises';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url), cache = new Map();
async function sourceUrl(name) {
  if (cache.has(name)) return cache.get(name);
  let source = await readFile(new URL(`../src/builder/${name}.ts`, import.meta.url), 'utf8');
  source = stripTypeScriptTypes(source, { mode: 'transform', disableExperimentalWarning: true });
  for (const match of [...source.matchAll(/import (\w+) from ['"](.+\.json)['"];?/g)]) {
    const json = await readFile(new URL(`../src/builder/${match[2]}`, import.meta.url), 'utf8');
    source = source.replace(match[0], `const ${match[1]} = ${json};`);
  }
  for (const match of [...source.matchAll(/from ['"]([^'"]+)['"]/g)]) {
    const path = match[1];
    const url = path.startsWith('./') ? await sourceUrl(path.slice(2)) : path.startsWith('../') ? new URL(`../src/builder/${path}`, import.meta.url).href : pathToFileURL(require.resolve(path)).href;
    source = source.replace(match[0], `from ${JSON.stringify(url)}`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  cache.set(name, url); return url;
}
export const loadSource = async name => import(await sourceUrl(name));
