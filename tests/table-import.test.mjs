import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { detectMapping, tableFromGrid, worksheetGrid, validateTable, googleSheetSource, readGoogleSheet } from '../src/data/table.mjs';
const headers = ['地点ID', 'スポット名', '緯度', '経度', '住所', 'カテゴリ', '紹介文', '写真URL', '内部メモ'];
const row = ['a', 'サンプル公園', '35.978', '140.147', 'サンプル地域', '観光', '紹介文', 'https://example.com/a.jpg', '秘密のメモ'];
function table(rows = [row]) { return tableFromGrid([headers, ...rows]); }
test('table: 日本語・英語の列を判定し、前書きと空行の後の見出しを選ぶ', () => {
  const actual = tableFromGrid([['地点データ'], [], headers, row]);
  assert.equal(actual.headerRow, 3);
  assert.equal(actual.mapping.name, 1);
  assert.equal(actual.mapping.lat, 2);
  assert.equal(actual.mapping.lon, 3);
  assert.equal(validateTable(actual).valid[0].row, 4);
  assert.equal(detectMapping(['name', 'latitude', 'lng']).lon, 2);
  assert.equal(detectMapping(['地点名', '緯度', '経度']).name, 0);
});
test('table: 曖昧な見出しと同じ列の二重割当を知らせる', () => {
  assert.equal(detectMapping(['name', '名称', 'lat', 'lon']).name, -1);
  const actual = table(); actual.mapping.lon = actual.mapping.lat;
  assert.equal(validateTable(actual).duplicatedColumns, true);
});
test('table: 空白座標・範囲外・名称欠損を元の行番号とともに保持する', () => {
  const actual = validateTable(table([row, ['b', '空白', '   ', '140'], ['c', '経度範囲外', '35', '181'], ['d', '', '35', '140'], []]));
  assert.equal(actual.valid.length, 1); assert.equal(actual.invalid.length, 3); assert.equal(actual.blank, 1);
  assert.deepEqual(actual.invalid.map(item => item.row), [3, 4, 5]);
  assert.match(actual.invalid[0].reasons[0], /緯度/);
});
test('table: 0度は有効、空白・Infinity・NaNは無効、重複IDは要確認', () => {
  const actual = validateTable(table([['zero', '0度', '0', '0'], ['b', '無効', 'Infinity', 'NaN'], row, row]));
  assert.equal(actual.valid.length, 2); assert.equal(actual.invalid.length, 2);
  assert.match(actual.invalid[1].reasons[0], /地点ID/);
});
test('table: 空の表・列過多・行過多を拒否する', () => {
  assert.throws(() => tableFromGrid([[], [' ']]), /空/);
  assert.throws(() => tableFromGrid([Array(51).fill('x'), Array(51).fill('x')]), /50列/);
  assert.throws(() => table(Array.from({ length: 1001 }, () => row)), /1,000行/);
});
test('table: Google Sheets URLのgid・CSVエクスポート・公開形式を安全に解釈する', () => {
  const id = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const actual = googleSheetSource(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=456`);
  assert.equal(new URL(actual.url).searchParams.get('gid'), '456');
  assert.equal(new URL(actual.url).searchParams.get('format'), 'csv');
  assert.match(new URL(actual.url).pathname, /\/export$/);
  assert.equal(new URL(actual.url).searchParams.has('headers'), false);
  const published = googleSheetSource(`https://docs.google.com/spreadsheets/d/e/2PACX-${id}/pubhtml?gid=7`);
  assert.equal(new URL(published.url).searchParams.get('output'), 'csv');
  assert.equal(new URL(published.url).searchParams.get('single'), 'true');
  const account = googleSheetSource(`https://docs.google.com/spreadsheets/u/2/d/${id}/edit?usp=sharing#gid=123`);
  assert.equal(new URL(account.url).searchParams.get('gid'), '123');
  const noGid = googleSheetSource(`https://docs.google.com/spreadsheets/d/e/2PACX-${id}/pub?output=csv`);
  assert.equal(noGid.gid, null);
  assert.equal(new URL(noGid.url).searchParams.has('gid'), false);
});
test('table: 任意ホスト・認証付きURL・偽のGoogleホスト・不正gidを拒否する', () => {
  for (const value of ['javascript:alert(1)', 'https://docs.google.com.evil.test/spreadsheets/d/abcdefghijklmnopqrstuvwxyz', 'https://user:pass@docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwxyz', 'https://example.com/a', 'http://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwxyz', 'https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwxyz/edit#gid=x', 'https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwxyz/edit?gid=']) assert.throws(() => googleSheetSource(value));
});
test('table: Sheetsの取得は実CSVを返し、HTML・HTTP失敗・通信失敗は成功扱いしない', async () => {
  const url = 'https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwxyz/edit';
  let options;
  const result = await readGoogleSheet(url, async (_, opts) => { options = opts; return new Response('name,lat,lon\n場所,35,140'); });
  assert.match(result.text, /場所/); assert.equal(options.credentials, 'omit');
  await assert.rejects(readGoogleSheet(url, async () => new Response('<!doctype html><html>login</html>')), /CSV/);
  await assert.rejects(readGoogleSheet(url, async () => new Response('', { status: 403 })), /403/);
  await assert.rejects(readGoogleSheet(url, async () => { throw new Error('CORS'); }), /共有|閲覧/);
});
const context = vm.createContext({ console, Buffer, Uint8Array, ArrayBuffer, TextDecoder, TextEncoder });
vm.runInContext(await readFile(new URL('../src/vendor/xlsx.full.min.js', import.meta.url), 'utf8'), context);
const XLSX = context.XLSX;
test('table: 空シートと先頭に空行・空列があるXLSXの元の行と列を保持する', async () => {
  const book = XLSX.read(await readFile(new URL('../examples/import/multiple-sheets.xlsx', import.meta.url)), { type: 'buffer' });
  assert.deepEqual(Array.from(book.SheetNames), ['空のシート', '地点データ', '別の地点']);
  assert.throws(() => tableFromGrid(worksheetGrid(book.Sheets[book.SheetNames[0]], XLSX.utils)), /空/);
  const grid = worksheetGrid(book.Sheets['地点データ'], XLSX.utils);
  const table = tableFromGrid(grid);
  assert.equal(table.headerRow, 12);
  assert.equal(table.mapping.name, 1);
  const checked = validateTable(table);
  assert.equal(checked.valid[0].row, 13);
  assert.equal(checked.invalid[0].row, 14);
  assert.equal(tableFromGrid(grid, 12).headerRow, 13);
  assert.throws(() => tableFromGrid(grid, NaN), /見出し/);
  const alternate = tableFromGrid(worksheetGrid(book.Sheets['別の地点'], XLSX.utils));
  assert.equal(validateTable(alternate).valid[0].name, '検証用駅');
});
test('table: 入力例のCSVは引用符・改行と不正行を保持する', async () => {
  const csv = await readFile(new URL('../examples/import/places.csv', import.meta.url), 'utf8');
  const book = XLSX.read(csv, { type: 'string', raw: true });
  const checked = validateTable(tableFromGrid(worksheetGrid(book.Sheets[book.SheetNames[0]], XLSX.utils)));
  assert.equal(checked.valid[0].name, '検証用,公園');
  assert.equal(checked.valid[0].description, '1行目\n2行目');
  assert.equal(checked.invalid[0].row, 3);
});
