import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadSource } from './load-builder.mjs';

const [model, runtime] = await Promise.all(['model', 'runtime'].map(loadSource));
const read = async name => JSON.parse(await readFile(new URL(`../examples/templates/${name}.machi.json`, import.meta.url), 'utf8'));

test('完成例は共通の架空データを同梱し、両端末の操作を定義する', async () => {
  const designs = await Promise.all(['map', 'list', 'guide'].map(read));
  for (const design of designs) {
    assert.deepEqual(model.validateDesign(design).errors, []);
    assert.deepEqual(design.datasets, designs[0].datasets);
    assert.equal(design.datasets[0].rows.length, 12);
    assert.equal(new Set(design.datasets[0].rows.map(row => row.values.category)).size, 3);
    assert.ok(design.datasets[0].rows.every(row => !row.values.image && !row.values.sourceUrl));
    const screen = design.screens[0], map = screen.components.find(c => c.kind === 'map-view');
    for (const device of ['desktop', 'mobile']) {
      assert.ok(map.layouts[device]);
      assert.ok(screen.components.find(c => c.kind === 'place-list').layouts[device]);
      assert.ok(screen.components.find(c => c.kind === 'place-detail').layouts[device]);
    }
  }
});

test('検索・カテゴリ・地点選択とスマホのパネル遷移が共通状態に反映される', async () => {
  for (const name of ['map', 'list', 'guide']) {
  const design = await read(name), screen = design.screens[0], data = design.datasets[0];
  const component = id => screen.components.find(c => c.id === id);
  let state = runtime.initialPreview(screen, 'mobile');
  function fire(id, event, payload = {}) {
    const c = component(id), actions = c.interactions.filter(item => item.event === event).flatMap(item => item.actions);
    state = runtime.applyPreviewActions(state, design, screen, 'mobile', data.id, actions, payload, payload);
  }
  fire('search', 'query-change', { value: '地点 01' });
  let visible = runtime.visibleRows(data, state.queries[data.id], state.filters[data.id] || [], ['name']);
  assert.deepEqual(visible.map(row => row.id), ['sample-1']);
  fire('search', 'clear');
  fire('categories', 'filter-change', { value: 'カテゴリ B' });
  visible = runtime.visibleRows(data, state.queries[data.id], state.filters[data.id], ['name']);
  assert.equal(visible.length, 4);
  fire('show-list', 'activate', { toggleTarget: true });
  assert.equal(state.openPanels.places, true);
  fire('places', 'place-select', { placeId: visible[0].id });
  assert.equal(state.selected[data.id], visible[0].id);
  assert.equal(state.openPanels.detail, true);
  assert.equal(state.openPanels.places, false);
  fire('detail', 'close');
  assert.equal(state.openPanels.detail, false);
  }
});

test('PC完成例の初期状態では地図の拡大縮小操作がほかの部品に隠れない', async () => {
  for (const name of ['map', 'list', 'guide']) {
    const design = await read(name), screen = design.screens[0];
    const map = screen.components.find(component => component.kind === 'map-view').layouts.desktop;
    const zoom = { x: map.x + 10, y: map.y + 10, width: 32, height: 64 };
    for (const component of screen.components) {
      const item = component.layouts.desktop;
      if (component.kind === 'map-view' || item.hidden || (item.presentation !== 'inline' && !item.initialOpen)) continue;
      const overlap = item.x < zoom.x + zoom.width && item.x + item.width > zoom.x && item.y < zoom.y + zoom.height && item.y + item.height > zoom.y;
      assert.equal(overlap, false, `${name}: ${component.id}`);
    }
  }
});

test('実装指示には共通のピン色と配置を含め、内部情報を除外する', async () => {
  const design = await read('list');
  design.datasets[0].columns.push({ key: 'privateNote', label: '内部メモ', type: 'string', visibility: 'internal' });
  design.datasets[0].rows[0].values.privateNote = 'internal-secret-example';
  design.datasets[0].source.url = 'https://example.invalid/private-source';
  const text = runtime.buildHandoffMarkdown(design);
  assert.match(text, /表示仕様/);
  assert.match(text, /#7952b3/);
  assert.match(text, /1280×800/);
  assert.doesNotMatch(text, /internal-secret-example|example\.invalid\/private-source/);
});
