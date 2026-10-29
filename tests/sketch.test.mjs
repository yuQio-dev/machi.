import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadSource } from './load-builder.mjs';
import { tableFromGrid } from '../dist/builder/core.mjs';

const sample = JSON.parse(await readFile(new URL('../src/builder/contracts/ushiku-demo.machi.json', import.meta.url), 'utf8'));
const runtime = await loadSource('runtime');
const model = await loadSource('model');
const importer = await loadSource('dataImport');

test('sketch: 同梱設計と追加可能な全9部品が契約を満たす', () => {
  assert.deepEqual(model.validateDesign(sample).errors, []);
  for (const kind of runtime.firstFlowKinds) {
    const copy = structuredClone(sample);
    const component = runtime.createComponent(kind, copy, copy.screens[0]);
    copy.screens[0].components.push(component);
    assert.deepEqual(model.validateDesign(copy).errors, [], kind);
  }
});
test('sketch: 複数部品を一括複製し、選択内の参照と自己参照も複製先へ向ける', () => {
  const result = runtime.duplicateComponents(sample, sample.screens[0].id, ['map', 'detail']);
  assert.equal(result.ids.length, 2);
  const copies = result.design.screens[0].components.filter(component => result.ids.includes(component.id));
  const map = copies.find(component => component.kind === 'map-view');
  const detail = copies.find(component => component.kind === 'place-detail');
  assert.equal(map.interactions[0].actions[1].targetId, detail.id);
  assert.equal(detail.interactions[0].actions[0].targetId, detail.id);
  assert.equal(sample.screens[0].components.length + 2, result.design.screens[0].components.length);
  assert.deepEqual(model.validateDesign(result.design).errors, []);
});
test('sketch: 4地点を検索2件・カテゴリ併用1件・不一致0件・クリア4件へ絞る', () => {
  const dataset = { id: 'test', columns: [{ key: 'name', visibility: 'public' }, { key: 'category', visibility: 'public' }, { key: 'memo', visibility: 'internal' }], mapping: { name: 'name' }, rows: [
    { id: 'a', values: { name: 'まちのカフェＡ', category: '飲食', memo: 'secret-only' } },
    { id: 'b', values: { name: 'まちの公園', category: '公園' } },
    { id: 'c', values: { name: '駅', category: '交通' } },
    { id: 'd', values: { name: '図書館', category: '施設' } },
  ] };
  const rows = (query, filters = []) => runtime.visibleRows(dataset, query, filters, ['name', 'memo']);
  assert.equal(rows('まち').length, 2);
  assert.equal(rows('まち', [{ field: 'category', operator: 'eq', value: '公園' }]).length, 1);
  assert.equal(rows('不一致').length, 0);
  assert.equal(rows('').length, 4);
  assert.equal(rows('secret-only').length, 0);
  assert.equal(rows('カフェa').length, 1);
});
test('sketch: 取り込みは元行を保持し、非公開列と接続URLをAI出力へ混ぜない', () => {
  const table = tableFromGrid([
    ['名称', '緯度', '経度', 'カテゴリ', '住所', '内部メモ'],
    ['公開公園', '35', '140', '公園', 'private-address', 'secret-memo'],
    ['不正行', '', '140', '公園', '', ''],
  ]);
  const design = importer.importTableDesign(sample, table, table.mapping, ['name', 'lat', 'lon', 'category'], { kind: 'google-sheet', label: '検証データ', url: 'https://example.com/private-source' });
  assert.equal(design.datasets[0].rows.length, 1);
  assert.equal(design.datasets[0].rows[0].values.sourceRow, 2);
  assert.equal(design.datasets[0].rows[0].values.extra_5, 'secret-memo');
  assert.deepEqual(model.validateDesign(design).errors, []);
  const prompt = runtime.buildHandoffMarkdown(design);
  assert.match(prompt, /公開公園/);
  assert.doesNotMatch(prompt, /private-address|secret-memo|private-source|sourceRow|originalId/);
  assert.equal(sample.datasets[0].rows.length, 3);
});
test('sketch: 新規画面を保存でき、テーマだけの差分を扱う', () => {
  const copy = structuredClone(sample);
  copy.screens.push(runtime.createScreen(copy));
  assert.deepEqual(model.validateDesign(copy).errors, []);
  copy.theme.accent = '#123456';
  assert(model.describeDiff(sample, copy).some(line => line.includes('accent')));
});
