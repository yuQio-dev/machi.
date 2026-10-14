import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const config = await readFile(new URL('../dist/config.js', import.meta.url), 'utf8');
const api = config.match(/apiUrl: '([^']+)'/)[1];
async function get(params = {}) {
  const url = new URL(api);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  assert.equal(response.ok, true, 'API HTTP status: ' + response.status);
  return response.json();
}
const all = await get({ action: 'pois' });
assert.equal(all.ok, true); assert.equal(all.schemaVersion, 1); assert.ok(all.items.length > 0);
assert.equal(all.source.mode, 'live');
const results = await Promise.allSettled([
  get({ action: 'pois', q: '南部', category: 'カフェ' }),
  get({ callback: 'invalid' })
]);
results.forEach(result => { if (result.status === 'rejected') throw result.reason; });
assert.equal(results[0].value.ok, true);
assert.equal(results[0].value.items[0].name, '南部珈琲');
assert.equal(results[0].value.items.length, 1);
assert.equal(results[1].value.error.code, 'INVALID_CALLBACK');
console.log(JSON.stringify({ ok: true, liveCount: all.items.length, searchCount: results[0].value.items.length, invalidCallbackRejected: true }));
