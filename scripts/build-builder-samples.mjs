import { readFile, writeFile, mkdir } from 'node:fs/promises';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const context = vm.createContext({ console, Buffer, Uint8Array, ArrayBuffer, TextDecoder, TextEncoder });
vm.runInContext(await readFile(new URL('dist/builder/vendor/xlsx.full.min.js', root), 'utf8'), context);
const XLSX = context.XLSX;
vm.runInContext(await readFile(new URL('dist/images.js', root), 'utf8'), context);
const snapshot = JSON.parse(await readFile(new URL('dist/data.snapshot.json', root), 'utf8'));
const points = snapshot.items.filter(point => !point.coordinateWarning && !point.name.includes('閉店')).slice(0, 12);
const headers = ['地点ID', 'スポット名', '緯度', '経度', '住所', 'カテゴリ', '紹介文', '写真URL', '営業時間', '定休日', 'Webサイト', '内部メモ'];
const keys = ['id', 'name', 'lat', 'lon', 'location', 'category', 'description', 'image', 'time', 'closed', 'sourceUrl'];
const rows = points.map((point, index) => [...keys.map(key => {
  if (key === 'id') return `ushiku-${index + 1}`;
  if (key === 'image') {
    const path = context.MapImages.files[String(point.image || '').normalize('NFC')];
    return path ? new URL(path, 'https://yuqio-dev.github.io/ushiku-map/').href : '';
  }
  return point[key] ?? '';
}), '掲載対象ではない管理用のメモ']);
const output = new URL('dist/builder/samples/', root);
await mkdir(output, { recursive: true });
const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, sheet, '牛久のスポット');
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ...rows.slice(0, 3)]), '3地点の例');
await writeFile(new URL('ushiku.xlsx', output), XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }));
await writeFile(new URL('ushiku.csv', output), '\uFEFF' + XLSX.utils.sheet_to_csv(sheet));
const errors = cloneRows(rows);
errors[1][2] = '';
errors[2][3] = '200';
await writeFile(new URL('with-errors.csv', output), '\uFEFF' + XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet([headers, ...errors])));
await writeFile(new URL('quoted.csv', output), '\uFEFF' + XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet([headers, ['quoted-1', '喫茶「まち,カフェ」', 35.978, 140.147, '牛久市', 'カフェ', '1行目\n2行目にも、紹介文があります。', '', '10:00〜18:00', '水曜', '', '外部へ出さないメモ']])));
console.log(`Builder samples: ${points.length} spots, XLSX (2 sheets), CSV, invalid rows, quoted multiline CSV.`);
function cloneRows(input) { return input.map(row => [...row]); }
