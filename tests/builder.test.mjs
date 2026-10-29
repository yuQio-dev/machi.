import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { detectMapping, tableFromGrid, validateTable, googleSheetSource, readGoogleSheet, publicSnapshot, encodeShare, decodeShare, escapeHtml, safeUrl, colorOf, filterPoints, changedPoints, DEFAULT_SETTINGS } from '../dist/builder/core.mjs';
const headers = ['地点ID', 'スポット名', '緯度', '経度', '住所', 'カテゴリ', '紹介文', '写真URL', '内部メモ'];
const row = ['a', '牛久シャトー', '35.978', '140.147', '牛久市', '観光', '紹介文', 'https://example.com/a.jpg', '秘密のメモ'];
function table(rows = [row]) { return tableFromGrid([headers, ...rows]); }
function points() { return validateTable(table()).valid; }
function settings(patch = {}) { return { ...structuredClone(DEFAULT_SETTINGS), ...patch }; }
test('builder: 日本語・英語の列を判定し、前書きと空行の後の見出しを選ぶ', () => {
  const actual = tableFromGrid([['牛久観光情報'], [], headers, row]);
  assert.equal(actual.headerRow, 3);
  assert.equal(actual.mapping.name, 1);
  assert.equal(actual.mapping.lat, 2);
  assert.equal(actual.mapping.lon, 3);
  assert.equal(validateTable(actual).valid[0].row, 4);
  assert.equal(detectMapping(['name', 'latitude', 'lng']).lon, 2);
});
test('builder: 曖昧な見出しと同じ列の二重割当を知らせる', () => {
  assert.equal(detectMapping(['name', '名称', 'lat', 'lon']).name, -1);
  const actual = table(); actual.mapping.lon = actual.mapping.lat;
  assert.equal(validateTable(actual).duplicatedColumns, true);
});
test('builder: 空白座標・範囲外・名称欠損を元の行番号とともに保持する', () => {
  const actual = validateTable(table([row, ['b', '空白', '   ', '140'], ['c', '経度範囲外', '35', '181'], ['d', '', '35', '140'], []]));
  assert.equal(actual.valid.length, 1); assert.equal(actual.invalid.length, 3); assert.equal(actual.blank, 1);
  assert.deepEqual(actual.invalid.map(item => item.row), [3, 4, 5]);
  assert.match(actual.invalid[0].reasons[0], /緯度/);
});
test('builder: 0度は有効、空白・Infinity・NaNは無効、重複IDは要確認', () => {
  const actual = validateTable(table([['zero', '0度', '0', '0'], ['b', '無効', 'Infinity', 'NaN'], row, row]));
  assert.equal(actual.valid.length, 2); assert.equal(actual.invalid.length, 2);
  assert.match(actual.invalid[1].reasons[0], /地点ID/);
});
test('builder: 空の表・列過多・行過多を拒否する', () => {
  assert.throws(() => tableFromGrid([[], [' ']]), /空/);
  assert.throws(() => tableFromGrid([Array(51).fill('x'), Array(51).fill('x')]), /50列/);
  assert.throws(() => table(Array.from({ length: 1001 }, () => row)), /1,000行/);
});
test('builder: Google Sheets URLのgid・CSVエクスポート・公開形式を安全に解釈する', () => {
  const id = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const actual = googleSheetSource(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=456`);
  assert.equal(new URL(actual.url).searchParams.get('gid'), '456');
  assert.equal(new URL(actual.url).searchParams.get('format'), 'csv');
  assert.match(new URL(actual.url).pathname, /\/export$/);
  assert.equal(new URL(actual.url).searchParams.has('headers'), false);
  const published = googleSheetSource(`https://docs.google.com/spreadsheets/d/e/2PACX-${id}/pubhtml?gid=7`);
  assert.equal(new URL(published.url).searchParams.get('output'), 'csv');
});
test('builder: 任意ホスト・認証付きURL・偽のGoogleホスト・不正gidを拒否する', () => {
  for (const value of ['javascript:alert(1)', 'https://docs.google.com.evil.test/spreadsheets/d/abcdefghijklmnopqrstuvwxyz', 'https://user:pass@docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwxyz', 'https://example.com/a', 'http://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwxyz', 'https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwxyz/edit#gid=x']) assert.throws(() => googleSheetSource(value));
});
test('builder: Sheetsの取得は実CSVを返し、HTML・HTTP失敗・通信失敗は成功扱いしない', async () => {
  const url = 'https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwxyz/edit';
  let options;
  const result = await readGoogleSheet(url, async (_, opts) => { options = opts; return new Response('name,lat,lon\n場所,35,140'); });
  assert.match(result.text, /場所/); assert.equal(options.credentials, 'omit');
  await assert.rejects(readGoogleSheet(url, async () => new Response('<!doctype html><html>login</html>')), /CSV/);
  await assert.rejects(readGoogleSheet(url, async () => new Response('', { status: 403 })), /403/);
  await assert.rejects(readGoogleSheet(url, async () => { throw new Error('CORS'); }), /共有|閲覧/);
});
test('builder: 公開データには許可した項目だけを含め、元の行・内部メモ・接続情報は含めない', () => {
  const input = points(); input[0].internalMemo = '極秘'; input[0].source = 'secret-sheet-url';
  const snapshot = publicSnapshot(input, settings({ publicFields: ['name', 'location'] }));
  assert.deepEqual(Object.keys(snapshot.items[0]), ['id', 'name', 'lat', 'lon', 'location']);
  assert.equal(snapshot.items[0].category, undefined); assert.equal(snapshot.settings.filters, false);
  assert.doesNotMatch(JSON.stringify(snapshot), /秘密|極秘|secret-sheet-url/);
  const colored = publicSnapshot(input, settings({ colors: { 観光: '#7952b3', 前の表だけの分類: '#7952b3' } }));
  assert.deepEqual(Object.keys(colored.settings.colors), ['観光']);
});
test('builder: 入力されたHTML・危険なURL・不正なテーマ色を安全に扱う', () => {
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(safeUrl('javascript:alert(1)'), ''); assert.equal(safeUrl('data:image/svg+xml,x', true), '');
  const snapshot = publicSnapshot(points(), settings({ accent: 'red;background:url(x)', colors: { 観光: 'url(x)' } }));
  assert.equal(snapshot.settings.accent, DEFAULT_SETTINGS.accent); assert.equal(snapshot.settings.colors['観光'], undefined);
  assert.match(colorOf('toString', settings(), points()), /^#[a-f\d]{6}$/i);
});
test('builder: 日本語と写真の共有リンクを保存データなしで復元する', async () => {
  const snapshot = publicSnapshot(points(), settings({ title: '牛久の観光マップ', description: '日本語の案内文' }));
  const encoded = await encodeShare(snapshot);
  const result = await decodeShare(encoded);
  assert.equal(result.items[0].name, '牛久シャトー'); assert.equal(result.settings.title, '牛久の観光マップ');
  assert.equal(result.items[0].image, 'https://example.com/a.jpg');
  assert.doesNotMatch(JSON.stringify(result), /秘密のメモ/);
});
test('builder: 発行したリンクの内容はその後の下書き変更で変わらない', async () => {
  const options = settings({ title: '公開時の名前' });
  const snapshot = publicSnapshot(points(), options); const encoded = await encodeShare(snapshot);
  options.title = '変更した下書き';
  assert.equal((await decodeShare(encoded)).settings.title, '公開時の名前');
});
test('builder: 壊れた・巨大な共有リンクを拒否する', async () => {
  await assert.rejects(decodeShare('%%%'), /正しく/);
  await assert.rejects(decodeShare('broken'), /開けません/);
  await assert.rejects(decodeShare('a'.repeat(64001)), /正しく/);
  assert.throws(() => publicSnapshot([], settings()), /地点数/);
  assert.throws(() => publicSnapshot([{ name: 'x', lat: 91, lon: 140 }], settings()), /座標/);
});
test('builder: 検索・カテゴリ・変更件数を実データから計算する', () => {
  const data = [...points(), { id: 'b', name: '南部珈琲', location: '牛久市', category: 'カフェ', lat: 35, lon: 140 }];
  assert.equal(filterPoints(data, '牛久 シャトー').length, 1);
  assert.equal(filterPoints(data, '', 'カフェ')[0].name, '南部珈琲');
  assert.deepEqual(changedPoints(data, [{ ...data[0], name: '変更' }, { id: 'c' }]), { added: 1, removed: 1, changed: 1 });
});
const context = vm.createContext({ console, Buffer, Uint8Array, ArrayBuffer, TextDecoder, TextEncoder });
vm.runInContext(await readFile(new URL('../dist/builder/vendor/xlsx.full.min.js', import.meta.url), 'utf8'), context);
const XLSX = context.XLSX;
test('builder: 実XLSXの2シート・CSVの引用符・セル内改行を読み込む', async () => {
  const file = await readFile(new URL('../dist/builder/samples/ushiku.xlsx', import.meta.url));
  const workbook = XLSX.read(file, { type: 'buffer' });
  assert.equal(workbook.SheetNames.length, 2);
  const first = tableFromGrid(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '', raw: false }));
  assert.equal(validateTable(first).valid.length, 12);
  assert.match(validateTable(first).valid[0].image, /^https:\/\//);
  const csv = await readFile(new URL('../dist/builder/samples/quoted.csv', import.meta.url), 'utf8');
  const parsed = XLSX.read(csv, { type: 'string', raw: true });
  const actual = tableFromGrid(XLSX.utils.sheet_to_json(parsed.Sheets[parsed.SheetNames[0]], { header: 1, defval: '', raw: false }));
  assert.equal(validateTable(actual).valid[0].name, '喫茶「まち,カフェ」');
  assert.match(validateTable(actual).valid[0].description, /1行目\n2行目/);
});
