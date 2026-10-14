import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import '../dist/model.js';
const M = globalThis.MapModel;
const data = M.sanitizePayload(JSON.parse(await readFile(new URL('../dist/data.snapshot.json', import.meta.url), 'utf8')));
test('日本語複数キーワード・カテゴリ・地図範囲を組み合わせる', () => {
  assert.equal(M.filterItems(data.items, { query: '南部 珈琲', group: 'food' }).length, 1);
  assert.equal(M.filterItems(data.items, { category: '寺院' }).length, 3);
  assert.equal(M.groupOf('お土産屋さん'), 'shop');
  assert.equal(M.filterItems(data.items, { query: 'ＤＩＰＩＫＡ' })[0].name, 'DIPIKA');
  assert.equal(M.filterItems(data.items, { bounds: { contains: ([lat]) => lat < 35.7 } })[0].name, '牛久大仏');
});
test('URL・座標・不正なAPI応答を検査する', () => {
  assert.equal(M.safeUrl('javascript:alert(1)'), ''); assert.equal(M.safeUrl('牛久シャトー.jpg'), '');
  assert.equal(M.validCoordinates('', 140), false); assert.equal(M.validCoordinates('91', '140'), false);
  assert.throws(() => M.sanitizePayload({ ok: false, error: { message: '接続エラー' } }), /接続エラー/);
  const clean = M.sanitizePayload({ ok: true, items: [{ name: '有効', lat: '0', lon: '0' }, { name: '無効', lat: '', lon: 140 }] });
  assert.equal(clean.items.length, 1); assert.equal(clean.rejectedItems, 1);
});
