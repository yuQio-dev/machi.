import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { loadSource } from './load-editor.mjs';
import { tableFromGrid } from '../src/data/table.mjs';

const [model, runtime, importer] = await Promise.all(['model','runtime','dataImport'].map(loadSource));
const initial = JSON.parse(await readFile(new URL('../src/editor/contracts/map-template.machi.json', import.meta.url), 'utf8'));

test('初期設計は地点0件で、すべての地図部品を追加できる', () => {
  assert.deepEqual(model.validateDesign(initial).errors, []);
  assert.equal(initial.datasets[0].rows.length, 0);
  assert.equal(initial.title, '新しい地図');
  for (const kind of runtime.firstFlowKinds) {
    const design = structuredClone(initial);
    design.screens[0].components.push(runtime.createComponent(kind, design, design.screens[0]));
    assert.deepEqual(model.validateDesign(design).errors, [], kind);
  }
});

test('独自の列キーで検索・一覧・詳細・カテゴリの部品と操作を接続する', () => {
  const design = structuredClone(initial), data = design.datasets[0];
  const keys = { name:'facilityTitle',lat:'north',lon:'east',category:'serviceType',location:'areaText',description:'notes',image:'pictureUrl',sourceUrl:'homepage' };
  data.mapping = keys;
  data.columns = data.columns.map(column => ({...column,key:keys[column.key]}));
  data.rows = [{id:'a',values:{facilityTitle:'検証施設',north:35,east:139,serviceType:'施設',areaText:'地区A',notes:'説明',pictureUrl:'',homepage:''}}];
  const screen = design.screens[0]; screen.components = [];
  for (const kind of ['place-detail','map-view','place-search','place-list','category-chips']) screen.components.push(runtime.createComponent(kind,design,screen));
  assert.deepEqual(model.validateDesign(design).errors, []);
  const part = kind => screen.components.find(component => component.kind === kind);
  assert.deepEqual(part('place-search').props.searchFields,['facilityTitle','areaText','notes']);
  assert.equal(part('place-detail').props.imageField,'pictureUrl');
  assert.equal(part('category-chips').props.field,'serviceType');
  assert.equal(part('category-chips').interactions[0].actions[0].field,'serviceType');
  const changed = runtime.setComponentProperty(part('category-chips'),'field','areaText');
  assert.equal(changed.interactions[0].actions[0].field,'areaText');
  let state = runtime.initialPreview(screen,'desktop');
  state = runtime.applyPreviewActions(state,design,screen,'desktop',data.id,changed.interactions[0].actions,{value:'地区A'},{value:'地区A'});
  assert.equal(runtime.visibleRows(data,'検証',state.filters[data.id],part('place-search').props.searchFields).length,1);
});

test('空のテンプレートへ取り込んだ地点が既存の地図部品に接続される', () => {
  const table = tableFromGrid([['名称','緯度','経度','カテゴリ'],['検証施設',35.6,139.7,'施設']]);
  const design = importer.importTableDesign(initial,table,table.mapping,['name','lat','lon','category'],{kind:'file',label:'任意の地域.csv',url:''});
  assert.deepEqual(model.validateDesign(design).errors,[]);
  assert.equal(initial.datasets[0].rows.length,0);
  assert.equal(design.datasets[0].rows.length,1);
  const map = design.screens[0].components.find(component=>component.kind==='map-view');
  assert.deepEqual(map.props.center,{lat:35.6,lon:139.7});
  assert.equal(map.props.zoom,14);
  assert.equal(map.binding.datasetId,design.datasets[0].id);
});

test('配布トップはエディターで、廃止したアプリ・写真・API設定を含まない', async () => {
  const output = new URL('../dist/',import.meta.url);
  const html = await readFile(new URL('index.html',output),'utf8');
  assert.match(html, /machi\./);
  assert.match(html, /assets\/index-/);
  const files = await readdir(output);
  for (const retired of ['app.js','model.js','config.js','data.snapshot.json','images.js','images']) assert.ok(!files.includes(retired),retired);
  const bookmark = await readFile(new URL('builder/sketch/index.html',output),'utf8');
  assert.match(bookmark, /http-equiv="refresh"/);
});
