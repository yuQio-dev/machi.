import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { loadSource } from '../tests/load-builder.mjs';

const runtime = await loadSource('runtime');
const model = await loadSource('model');
const source = JSON.parse(await readFile(new URL('../src/builder/contracts/ushiku-demo.machi.json', import.meta.url), 'utf8'));
const rows = Array.from({ length: 12 }, (_, i) => ({
  id: `sample-${i + 1}`,
  values: { name: `サンプル地点 ${String(i + 1).padStart(2, '0')}`, lat: 35.676 + Math.floor(i / 4) * .003, lon: 139.760 + (i % 4) * .003,
    location: `サンプル区画 ${i + 1}`, category: ['カテゴリ A', 'カテゴリ B', 'カテゴリ C'][i % 3],
    description: `架空の地点 ${i + 1} の説明です。データを差し替えて利用してください。`, image: '', sourceUrl: '' },
}));
const output = new URL('../examples/templates/', import.meta.url);
await mkdir(output, { recursive: true });
const csvFields = ['name', 'lat', 'lon', 'location', 'category', 'description'];
const csv = [csvFields.join(','), ...rows.map(row => csvFields.map(key => `"${String(row.values[key]).replaceAll('"', '""')}"`).join(','))].join('\r\n') + '\r\n';
await writeFile(new URL('sample-data.csv', output), '\ufeff' + csv);

for (const [name, label] of [['map', '地図中心型'], ['list', '一覧併設型'], ['guide', '案内重視型']]) {
  const design = JSON.parse(JSON.stringify(source).replaceAll('"ushiku"', '"sample"'));
  design.id = `generic-${name}`;
  design.title = `${label}の完成例`;
  design.description = '表示検証用の架空データです。実在施設の案内ではありません。';
  design.theme = { managed: true, palette: 'purple', mode: 'light', accent: '#7952b3', background: '#faf8fd', foreground: '#332b43' };
  const dataset = design.datasets[0];
  dataset.id = 'sample'; dataset.name = '架空のサンプル地点'; dataset.rows = rows;
  dataset.source = { kind: 'inline', label: '架空の表示検証用データ', url: '' };
  const screen = design.screens[0]; screen.name = label;
  const part = id => screen.components.find(item => item.id === id);
  part('heading').props = { title: label, description: 'この地図の地点・位置・説明は架空のサンプルです' };
  part('count').props.suffix = '件の地点';
  part('map').props.center = { lat: 35.679, lon: 139.7645 };
  part('places').props.imageField = null; part('detail').props.imageField = null;
  const set = (id, device, values) => Object.assign(part(id).layouts[device], values);
  for (const device of ['desktop', 'mobile']) {
    set('heading', device, { zIndex: 2 }); set('map', device, { zIndex: 0 });
    for (const id of ['search', 'categories', 'count']) set(id, device, { zIndex: 2 });
    set('places', device, { zIndex: 4 }); set('detail', device, { zIndex: 5 }); set('show-list', device, { zIndex: 3 });
  }
  set('show-list', 'desktop', { hidden: false, x: 1100, y: 724, width: 120, height: 48 });
  set('show-list', 'mobile', { x: 124, y: 236, width: 142, height: 44 });
  set('map', 'mobile', { x: 0, y: 220, width: 390, height: 624 });
  if (name === 'map') {
    set('map', 'desktop', { x: 0, y: 80, width: 1280, height: 720 });
    set('search', 'desktop', { x: 72, width: 360 });
    set('places', 'desktop', { x: 72, y: 294, width: 360, height: 490, initialOpen: false });
    set('show-list', 'desktop', { x: 72, y: 238 });
    set('count', 'desktop', { x: 72, y: 206, width: 360 });
    set('categories', 'desktop', { x: 72, y: 150, width: 360, height: 48 });
  } else if (name === 'list') {
    set('show-list', 'desktop', { x: 1100, y: 724 });
  } else {
    const text = runtime.createComponent('text', design, screen);
    text.name = '地図の案内'; text.props.text = 'この地図は自由に編集できます。検索やカテゴリから地点を探し、詳細を確認してください。';
    Object.assign(text.layouts.desktop, { x: 24, y: 88, width: 1232, height: 76, zIndex: 2 });
    Object.assign(text.layouts.mobile, { x: 12, y: 78, width: 366, height: 60, zIndex: 2 });
    screen.components.push(text);
    set('search', 'desktop', { x: 24, y: 174, width: 288, height: 44 });
    set('categories', 'desktop', { x: 328, y: 174, width: 320, height: 44 });
    set('count', 'desktop', { x: 664, y: 184, width: 180, height: 24 });
    set('map', 'desktop', { x: 0, y: 232, width: 1280, height: 568 });
    set('places', 'desktop', { x: 72, y: 292, width: 288, height: 492, initialOpen: false });
    set('show-list', 'desktop', { x: 72, y: 238 });
    set('detail', 'desktop', { x: 924, y: 250, width: 332, height: 520 });
    set('search', 'mobile', { x: 12, y: 144, width: 366, height: 44 });
    set('categories', 'mobile', { x: 12, y: 192, width: 366, height: 44 });
    set('count', 'mobile', { x: 12, y: 240, width: 180, height: 24 });
    set('map', 'mobile', { x: 0, y: 272, width: 390, height: 572 });
    set('show-list', 'mobile', { x: 124, y: 280 });
  }
  const checked = model.validateDesign(design);
  if (!checked.design) throw new Error(`${name}: ${checked.errors.join('\n')}`);
  await writeFile(new URL(`${name}.machi.json`, output), JSON.stringify(design, null, 2) + '\n');
  if (name === 'list') await writeFile(new URL('list-implementation.md', output), runtime.buildHandoffMarkdown(design));
}
console.log('Created three generic map examples and sample CSV.');
