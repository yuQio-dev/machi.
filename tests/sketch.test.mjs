import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadSource } from './load-builder.mjs';
import { tableFromGrid } from '../dist/builder/core.mjs';

const sample = JSON.parse(await readFile(new URL('../src/builder/contracts/ushiku-demo.machi.json', import.meta.url), 'utf8'));
const generic = JSON.parse(await readFile(new URL('../src/builder/contracts/generic-components.machi.json', import.meta.url), 'utf8'));
const runtime = await loadSource('runtime');
const model = await loadSource('model');
const importer = await loadSource('dataImport');

test('sketch: 同梱設計と追加可能な全25部品が契約を満たす', () => {
  assert.deepEqual(model.validateDesign(sample).errors, []);
  assert.equal(runtime.firstFlowKinds.length, 25);
  for (const kind of runtime.firstFlowKinds) {
    const copy = structuredClone(sample);
    const component = runtime.createComponent(kind, copy, copy.screens[0]);
    copy.screens[0].components.push(component);
    assert.deepEqual(model.validateDesign(copy).errors, [], kind);
  }
});
test('sketch: 汎用画面サンプルは25部品を地点データなしで保存・再読込・HTML出力できる', async () => {
  const checked = model.validateDesign(JSON.parse(JSON.stringify(generic)));
  assert.deepEqual(checked.errors, []);
  assert.deepEqual(checked.design.datasets, []);
  const addedKinds = ['button', 'icon-button', 'chip', 'container', 'card', 'list-item', 'image', 'divider', 'dialog', 'text-field', 'select', 'switch', 'checkbox', 'screen-tabs', 'bottom-navigation', 'side-menu'];
  assert.deepEqual(addedKinds.filter(kind => !checked.design.screens.some(screen => screen.components.some(component => component.kind === kind))), []);
  const htmlModule = await loadSource('exportMap');
  const html = htmlModule.mapHtml(checked.design, '', '');
  const exported = JSON.parse(html.match(/type="application\/json">(.*?)<\/script>/s)[1]);
  assert.deepEqual(exported.datasets, []);
  assert.deepEqual(exported.screens, checked.design.screens);
});
test('sketch: 地点なしでは汎用部品だけを追加でき、入力値・ダイアログ・画面遷移をプレビュー状態で扱う', () => {
  const design = structuredClone(generic);
  const home = design.screens[0];
  const about = design.screens[1];
  const emptyScreen = { ...home, components: [] };
  assert.ok(runtime.createComponent('button', design, emptyScreen));
  assert.ok(runtime.createComponent('text-field', design, emptyScreen));
  assert.equal(runtime.createComponent('map-view', design, emptyScreen), null);
  let preview = runtime.initialPreview(home, 'desktop');
  const field = home.components.find(component => component.kind === 'text-field');
  const dialog = home.components.find(component => component.kind === 'dialog');
  const button = home.components.find(component => component.id === 'sample-button');
  const nav = home.components.find(component => component.kind === 'screen-tabs');
  preview = runtime.updatePreviewValue(preview, field, '入力テスト');
  assert.equal(preview.values[field.id], '入力テスト');
  preview = runtime.applyPreviewActions(preview, design, home, 'desktop', 'empty-data', button.interactions[0].actions, {}, {});
  assert.equal(preview.openPanels[dialog.id], true);
  preview = runtime.applyPreviewActions(preview, design, home, 'desktop', 'empty-data', dialog.interactions[0].actions, {}, {});
  assert.equal(preview.openPanels[dialog.id], false);
  preview = runtime.applyPreviewActions(preview, design, home, 'desktop', 'empty-data', nav.interactions[0].actions, { screenId: about.id }, { screenId: about.id });
  assert.equal(preview.activeScreenId, about.id);
  assert.equal(Object.hasOwn(preview.values, field.id), false);
  assert.equal(runtime.initialPreview(home, 'desktop').values[field.id], field.props.initialValue);
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
test('sketch: データセットがない設計にも地点を追加でき、元の設計は変えない', () => {
  const table = tableFromGrid([['名称', '緯度', '経度', 'カテゴリ'], ['検証用公園', '35.98', '140.14', '公園']]);
  const design = importer.importTableDesign(generic, table, table.mapping, ['name', 'lat', 'lon', 'category'], { kind: 'file', label: '例.csv', url: '' });
  assert.equal(generic.datasets.length, 0);
  assert.equal(design.datasets.length, 1);
  assert.equal(design.datasets[0].rows[0].values.name, '検証用公園');
  assert.deepEqual(model.validateDesign(design).errors, []);
});
test('sketch: 新規画面を保存でき、テーマだけの差分を扱う', () => {
  const copy = structuredClone(sample);
  copy.screens.push(runtime.createScreen(copy));
  assert.deepEqual(model.validateDesign(copy).errors, []);
  copy.theme.accent = '#123456';
  assert(model.describeDiff(sample, copy).some(line => line.includes('accent')));
});
