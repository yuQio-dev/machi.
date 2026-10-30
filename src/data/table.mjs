export const MAX_ROWS = 1000;
export const FIELDS = [
  { key: 'name', label: '地点名', required: true, aliases: ['name', 'title', '名称', '名前', '地点名', 'スポット名', '施設名', '店名'] },
  { key: 'lat', label: '緯度', required: true, aliases: ['lat', 'latitude', '緯度'] },
  { key: 'lon', label: '経度', required: true, aliases: ['lon', 'lng', 'longitude', '経度'] },
  { key: 'location', label: '住所', aliases: ['location', 'address', '住所', '所在地'] },
  { key: 'category', label: 'カテゴリ', aliases: ['category', 'type', 'カテゴリ', 'カテゴリー', '分類', '種別', 'ジャンル'] },
  { key: 'description', label: '紹介文', aliases: ['description', 'intro', '紹介文', '説明', '概要'] },
  { key: 'image', label: '写真URL', aliases: ['image', 'photo', 'imageurl', '写真', '写真url', '画像', '画像url'] },
  { key: 'time', label: '営業時間', aliases: ['time', 'hours', '営業時間'] },
  { key: 'closed', label: '定休日', aliases: ['closed', '定休日', '休業日'] },
  { key: 'sourceUrl', label: 'Webサイト', aliases: ['url', 'website', 'sourceurl', '取得したサイト', '公式サイト', 'webサイト'] },
  { key: 'id', label: '地点ID', aliases: ['id', 'spotid', '地点id', '施設id'] }
];
export const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ja').replace(/[\s_\-・]/g, '').trim();
export function safeUrl(value, image = false) {
  try { const url = new URL(String(value || '').trim()); return (image ? url.protocol === 'https:' : /^https?:$/.test(url.protocol)) && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
}
export function detectMapping(headers) {
  return Object.fromEntries(FIELDS.map(field => {
    const matches = headers.map((header, index) => field.aliases.some(alias => normalize(alias) === normalize(header)) ? index : -1).filter(index => index >= 0);
    return [field.key, matches.length === 1 ? matches[0] : -1];
  }));
}
export function tableFromGrid(grid, headerIndex) {
  if (!Array.isArray(grid) || !grid.some(row => row.some(value => String(value ?? '').trim()))) throw new Error('表が空です。見出しと地点の行を入れてください。');
  if (headerIndex === undefined) {
    let best = -1;
    let candidates = 0;
    grid.forEach((row, index) => {
      if (!row.some(value => String(value ?? '').trim())) return;
      if (candidates++ >= 10) return;
      const mapping = detectMapping(row);
      const score = Object.values(mapping).filter(value => value >= 0).length + ['name', 'lat', 'lon'].filter(key => mapping[key] >= 0).length * 3;
      if (score > best) { best = score; headerIndex = index; }
    });
  }
  if (!Number.isInteger(headerIndex) || headerIndex < 0 || headerIndex >= grid.length) throw new Error('見出しの行を確認してください。');
  const width = grid.reduce((max, row, index) => index < headerIndex ? max : Math.max(max, row.length), 0);
  if (width > 50) throw new Error('この版は50列までの表に対応しています。必要な列だけにして取り込んでください。');
  const headers = Array.from({ length: width }, (_, index) => String(grid[headerIndex][index] ?? '').trim() || `列${index + 1}`);
  const inputRows = grid.slice(headerIndex + 1);
  const count = inputRows.filter(row => row.some(value => String(value ?? '').trim())).length;
  if (count > MAX_ROWS) throw new Error(`この版は${MAX_ROWS.toLocaleString()}行までです。表を分けて取り込んでください。`);
  const rows = inputRows.map(row => Array.from({ length: width }, (_, index) => String(row[index] ?? '')));
  return { headers, rows, headerRow: headerIndex + 1, mapping: detectMapping(headers) };
}
export function worksheetGrid(sheet, utils) {
  if (!sheet || !sheet['!ref']) return [];
  const range = utils.decode_range(sheet['!ref']);
  // Preserve spreadsheet row and column numbers, even when the used range starts below A1.
  range.s = { r: 0, c: 0 };
  if (range.e.c >= 50) throw new Error('この版は50列までの表に対応しています。必要な列だけにして取り込んでください。');
  return utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: true, range });
}
export function validateTable(table, mapping = table.mapping) {
  const missing = FIELDS.filter(field => field.required && (!Number.isInteger(mapping[field.key]) || mapping[field.key] < 0 || mapping[field.key] >= table.headers.length)).map(field => field.label);
  const selected = Object.values(mapping).filter(value => Number.isInteger(value) && value >= 0);
  const duplicatedColumns = selected.length !== new Set(selected).size;
  const valid = [], invalid = [], ids = new Set();
  let blank = 0;
  table.rows.forEach((row, index) => {
    if (!row.some(value => String(value).trim())) { blank++; return; }
    const get = key => String(row[mapping[key]] ?? '').trim();
    const reasons = [];
    const name = get('name');
    const rawLat = get('lat'), rawLon = get('lon');
    const lat = Number(rawLat), lon = Number(rawLon);
    if (!name) reasons.push('地点名がありません');
    if (!rawLat || !Number.isFinite(lat) || Math.abs(lat) > 90) reasons.push('緯度は−90〜90の数値にしてください');
    if (!rawLon || !Number.isFinite(lon) || Math.abs(lon) > 180) reasons.push('経度は−180〜180の数値にしてください');
    const rowNumber = table.headerRow + index + 1;
    const id = get('id') || `row-${rowNumber}`;
    if (ids.has(id)) reasons.push('地点IDが重複しています');
    ids.add(id);
    if (name.length > 160) reasons.push('地点名は160文字以内にしてください');
    if (reasons.length) { invalid.push({ row: rowNumber, name: name || '名称なし', reasons }); return; }
    const point = { id, row: rowNumber, name, lat, lon };
    for (const field of FIELDS.filter(field => !['name', 'lat', 'lon', 'id'].includes(field.key))) point[field.key] = get(field.key).slice(0, field.key === 'description' ? 2000 : 1000);
    point.category ||= '未分類';
    point.sourceUrl = safeUrl(point.sourceUrl);
    point.image = safeUrl(point.image, true);
    valid.push(point);
  });
  return { valid, invalid, blank, missing, duplicatedColumns, total: valid.length + invalid.length };
}
export function googleSheetSource(value) {
  let input;
  try { input = new URL(value); } catch { throw new Error('GoogleスプレッドシートのURLを入力してください。'); }
  if (input.protocol !== 'https:' || input.hostname !== 'docs.google.com' || input.username || input.password) throw new Error('docs.google.comのスプレッドシートURLを入力してください。');
  const regular = input.pathname.match(/^\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{20,})(?:\/|$)/);
  const published = input.pathname.match(/^\/spreadsheets\/d\/e\/([a-zA-Z0-9_-]{20,})(?:\/|$)/);
  if (!regular && !published) throw new Error('表のURLを確認してください。ファイルのIDを読み取れません。');
  const fragment = new URLSearchParams(input.hash.slice(1));
  const gid = input.searchParams.get('gid') ?? fragment.get('gid');
  if (gid !== null && !/^\d+$/.test(gid)) throw new Error('シートのgidは数字で指定してください。');
  const url = new URL(published ? `/spreadsheets/d/e/${published[1]}/pub` : `/spreadsheets/d/${regular[1]}/export`, 'https://docs.google.com');
  url.searchParams.set(published ? 'output' : 'format', 'csv');
  if (gid !== null) {
    url.searchParams.set('gid', gid);
    if (published) url.searchParams.set('single', 'true');
  }
  return { url: url.href, original: input.href, id: (published || regular)[1], gid };
}
export async function readGoogleSheet(value, fetcher = fetch) {
  const source = googleSheetSource(value);
  let response;
  try { response = await fetcher(source.url, { credentials: 'omit', signal: AbortSignal.timeout(18000) }); }
  catch { throw new Error('表を取得できませんでした。「リンクを知っている全員」が閲覧できるか、通信とURLを確認して再試行してください。元の表は変更しません。'); }
  if (!response.ok) throw new Error(`表の取得に失敗しました（${response.status}）。共有設定とシート名を確認してください。`);
  const text = await response.text();
  if (text.length > 8 * 1024 * 1024) throw new Error('表が大きすぎます。8MB以内のCSV・Excelに分けて取り込んでください。');
  if (/^\s*(?:<!doctype|<html|<script)/i.test(text) || /google\.visualization\.Query\.setResponse/.test(text)) throw new Error('CSVとして取得できませんでした。共有設定と対象シートを確認してください。');
  return { text, source };
}
