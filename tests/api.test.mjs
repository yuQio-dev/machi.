import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const code = await readFile(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
const snapshot = JSON.parse(await readFile(new URL('../dist/data.snapshot.json', import.meta.url), 'utf8'));
function runtime(rows, sheetExists = true) {
  let reads = 0;
  const context = vm.createContext({
    console: { error() {} },
    Sheets: { Spreadsheets: { get(id, options) {
      assert.equal(id, '1UJGEZiVQQ3OYiweZG2CgyhgOUkIg8FlaE2KtkyxfZ74');
      assert.equal(options.fields, 'sheets(properties)');
      return { sheets: sheetExists ? [{ properties: { sheetId: 0, title: 'シート1', gridProperties: { rowCount: 1000, columnCount: 27 } } }] : [] };
    }, Values: { get(id, range, options) {
      reads++;
      assert.equal(id, '1UJGEZiVQQ3OYiweZG2CgyhgOUkIg8FlaE2KtkyxfZ74');
      assert.equal(range, "'シート1'!A1:AA1000");
      assert.equal(options.valueRenderOption, 'FORMATTED_VALUE');
      return { values: rows.map(row => row.map(cell => String(cell ?? ''))) };
    } } } },
    ContentService: { MimeType: { JSON: 'json', JAVASCRIPT: 'js' }, createTextOutput(body) { return { body, setMimeType(type) { this.type = type; return this; } }; } }
  });
  vm.runInContext(code, context);
  return { context, reads: () => reads };
}
const header = ['name', 'location', 'lat', 'lon', 'description', 'time', 'closed', 'category', 'image', '取得したサイト'];
const sample = ['牛久シャトー', '牛久市', '35.97802056', '140.1473454', '<script>alert(1)</script>', '10:00', 'なし', 'ワイン醸造所', '牛久シャトー.jpg', 'https://example.org/'];
test('2行目の見出し、空行、日本語列、画像ファイル名を処理する', () => {
  const { context } = runtime([['表のタイトル'], header, [], sample]);
  const result = context.getMapData();
  assert.equal(result.ok, true); assert.equal(result.source.headerRow, 2); assert.equal(result.total, 1);
  assert.equal(result.items[0].id, 'sheet-0-row-4'); assert.equal(result.items[0].row, 4); assert.equal(result.items[0].lat, 35.97802056);
  assert.equal(result.items[0].image, ''); assert.equal(result.items[0].sourceUrl, 'https://example.org/'); assert.equal(result.items[0].coordinateWarning, '');
});
test('座標欠損・範囲外は除外し、遠い座標を補正せず警告する', () => {
  const bad = [...sample]; bad[2] = '';
  const out = [...sample]; out[3] = '181';
  const far = [...sample]; far[0] = '牛久大仏'; far[2] = '35.585766'; far[3] = '140.13131';
  const result = runtime([header, bad, out, far]).context.getMapData();
  assert.equal(result.skippedRows, 2); assert.equal(result.total, 1); assert.equal(result.items[0].lat, 35.585766); assert.ok(result.items[0].coordinateWarning);
});
test('JSONPのコールバック注入を拒否し、公開フィールドだけを返す', () => {
  const { context, reads } = runtime([header, sample]);
  const rejected = context.doGet({ parameter: { callback: 'alert(1)//' } });
  assert.equal(rejected.type, 'json'); assert.equal(JSON.parse(rejected.body).error.code, 'INVALID_CALLBACK'); assert.equal(reads(), 0);
  const accepted = context.doGet({ parameter: { action: 'pois', callback: '__ushiku_cb_123' } });
  assert.equal(accepted.type, 'js'); assert.ok(accepted.body.startsWith('__ushiku_cb_123('));
  assert.deepEqual(Object.keys(context.getMapData().items[0]).sort(), ['id', 'row', 'name', 'location', 'lat', 'lon', 'description', 'time', 'closed', 'category', 'image', 'sourceUrl', 'coordinateWarning'].sort());
});
test('APIの検索・カテゴリ絞り込みとタブ欠損を処理する', () => {
  const { context } = runtime([header, sample]);
  assert.equal(JSON.parse(context.doGet({ parameter: { q: 'シャトー', category: 'ワイン醸造所' } }).body).total, 1);
  assert.equal(JSON.parse(context.doGet({ parameter: { q: '存在しない' } }).body).total, 0);
  assert.equal(runtime([header, sample], false).context.getMapData().error.code, 'SHEET_NOT_FOUND');
});
test('同じ読み取りでも変更後の値を再取得する', () => {
  const rows = [header, [...sample]]; const { context } = runtime(rows);
  assert.equal(context.getMapData().items[0].name, '牛久シャトー'); rows[1][0] = '更新後の名称';
  assert.equal(context.getMapData().items[0].name, '更新後の名称');
});
test('実シートの確認データ21件をAPIと同じスキーマにする', () => {
  const rows = [['表のタイトル'], header, []];
  snapshot.items.forEach(item => rows.push([item.name, item.location, String(item.lat), String(item.lon), item.description, item.time, item.closed, item.category, '', item.sourceUrl]));
  const result = runtime(rows).context.getMapData();
  assert.equal(result.total, 21); assert.equal(result.items.filter(item => item.coordinateWarning).length, 1);
  result.items.forEach((item, index) => { assert.equal(item.id, snapshot.items[index].id); assert.equal(item.name, snapshot.items[index].name); assert.equal(item.lat, snapshot.items[index].lat); });
});
