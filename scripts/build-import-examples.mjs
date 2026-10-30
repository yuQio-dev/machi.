import { mkdir, readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const context = vm.createContext({ console, Buffer, Uint8Array, ArrayBuffer, TextDecoder, TextEncoder });
vm.runInContext(await readFile(new URL('src/vendor/xlsx.full.min.js', root), 'utf8'), context);
const XLSX = context.XLSX;
const output = new URL('examples/import/', root);
await mkdir(output, { recursive: true });
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([]), '空のシート');
const sheet = XLSX.utils.aoa_to_sheet([
  ['スポット名', '緯度', '経度', 'カテゴリ', '内部メモ'],
  ['検証用公園', 35.98, 140.14, '公園', '確認用メモ'],
  ['座標なし', '', 140.15, '施設', '不正行の例'],
], { origin: 'B12' });
XLSX.utils.book_append_sheet(book, sheet, '地点データ');
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['名称', '緯度', '経度'], ['検証用駅', 35.97, 140.13]]), '別の地点');
await writeFile(new URL('multiple-sheets.xlsx', output), XLSX.write(book, { bookType: 'xlsx', type: 'buffer' }));
await writeFile(new URL('places.csv', output), '\uFEFFスポット名,緯度,経度,カテゴリ,紹介文\n"検証用,公園",35.98,140.14,公園,"1行目\n2行目"\n座標なし,,140.15,施設,不正行\n');
console.log('Created examples/import/multiple-sheets.xlsx and places.csv');
