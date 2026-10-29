export const MAX_ROWS = 1000;
export const MAX_LINK_LENGTH = 64000;
export const PALETTE = ['#7952b3', '#bf753f', '#4c8a78', '#6085b4', '#b15d83', '#968138', '#647d6b', '#8c718f'];
export const FIELDS = [
  { key: 'name', label: 'スポット名', required: true, aliases: ['name', 'title', '名称', '名前', 'スポット名', '施設名', '店名'] },
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
export const PUBLIC_FIELDS = FIELDS.filter(field => !['id', 'lat', 'lon'].includes(field.key));
export const DEFAULT_SETTINGS = {
  title: 'わたしの観光マップ', description: 'このまちの、気になる場所を見つけよう。',
  accent: '#7952b3', basemap: 'quiet', search: true, filters: true, photos: true,
  publicFields: ['name', 'location', 'category', 'description', 'image', 'time', 'closed', 'sourceUrl'], colors: {}
};
export const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ja').replace(/[\s_\-・]/g, '').trim();
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
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
  if (!Array.isArray(grid) || !grid.some(row => row.some(value => String(value ?? '').trim()))) throw new Error('表が空です。見出しとスポットの行を入れてください。');
  if (headerIndex === undefined) {
    let best = -1;
    grid.slice(0, 10).forEach((row, index) => {
      if (!row.some(value => String(value ?? '').trim())) return;
      const mapping = detectMapping(row);
      const score = Object.values(mapping).filter(value => value >= 0).length + ['name', 'lat', 'lon'].filter(key => mapping[key] >= 0).length * 3;
      if (score > best) { best = score; headerIndex = index; }
    });
  }
  const width = grid.reduce((max, row, index) => index < headerIndex ? max : Math.max(max, row.length), 0);
  if (width > 50) throw new Error('この版は50列までの表に対応しています。必要な列だけにして取り込んでください。');
  const headers = Array.from({ length: width }, (_, index) => String(grid[headerIndex][index] ?? '').trim() || `列${index + 1}`);
  const inputRows = grid.slice(headerIndex + 1);
  const count = inputRows.filter(row => row.some(value => String(value ?? '').trim())).length;
  if (count > MAX_ROWS) throw new Error(`この版は${MAX_ROWS.toLocaleString()}行までです。表を分けて取り込んでください。`);
  const rows = inputRows.map(row => Array.from({ length: width }, (_, index) => String(row[index] ?? '')));
  return { headers, rows, headerRow: headerIndex + 1, mapping: detectMapping(headers) };
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
    if (!name) reasons.push('スポット名がありません');
    if (!rawLat || !Number.isFinite(lat) || Math.abs(lat) > 90) reasons.push('緯度は−90〜90の数値にしてください');
    if (!rawLon || !Number.isFinite(lon) || Math.abs(lon) > 180) reasons.push('経度は−180〜180の数値にしてください');
    const rowNumber = table.headerRow + index + 1;
    const id = get('id') || `row-${rowNumber}`;
    if (ids.has(id)) reasons.push('地点IDが重複しています');
    ids.add(id);
    if (name.length > 160) reasons.push('スポット名は160文字以内にしてください');
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
export function categoriesOf(points) { return [...new Set(points.map(point => point.category || '未分類'))]; }
export function colorOf(category, settings, points) { const color = Object.hasOwn(settings.colors || {}, category) ? settings.colors[category] : ''; return /^#[a-f\d]{6}$/i.test(color) ? color : PALETTE[Math.max(0, categoriesOf(points).indexOf(category)) % PALETTE.length]; }
export function filterPoints(points, query = '', category = '') {
  const words = String(query).normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
  return points.filter(point => (!category || point.category === category) && words.every(word => [point.name, point.location, point.description, point.category].join(' ').normalize('NFKC').toLowerCase().includes(word)));
}
export function googleSheetSource(value) {
  let input;
  try { input = new URL(value); } catch { throw new Error('GoogleスプレッドシートのURLを入力してください。'); }
  if (input.protocol !== 'https:' || input.hostname !== 'docs.google.com' || input.username || input.password) throw new Error('docs.google.comのスプレッドシートURLを入力してください。');
  const regular = input.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})(?:\/|$)/);
  const published = input.pathname.match(/^\/spreadsheets\/d\/e\/([a-zA-Z0-9_-]{20,})(?:\/|$)/);
  if (!regular && !published) throw new Error('表のURLを確認してください。ファイルのIDを読み取れません。');
  const fragment = new URLSearchParams(input.hash.slice(1));
  const gid = input.searchParams.get('gid') || fragment.get('gid') || '0';
  if (!/^\d+$/.test(gid)) throw new Error('シートのgidは数字で指定してください。');
  const url = new URL(published ? `/spreadsheets/d/e/${published[1]}/pub` : `/spreadsheets/d/${regular[1]}/export`, 'https://docs.google.com');
  url.searchParams.set(published ? 'output' : 'format', 'csv');
  url.searchParams.set('gid', gid);
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
function cleanSettings(input = {}) {
  const settings = { ...DEFAULT_SETTINGS, colors: {} };
  settings.title = String(input.title || DEFAULT_SETTINGS.title).slice(0, 80);
  settings.description = String(input.description ?? '').slice(0, 240);
  settings.accent = /^#[a-f\d]{6}$/i.test(input.accent) ? input.accent : DEFAULT_SETTINGS.accent;
  settings.basemap = input.basemap === 'standard' ? 'standard' : 'quiet';
  for (const key of ['search', 'filters', 'photos']) settings[key] = input[key] !== false;
  settings.publicFields = Array.isArray(input.publicFields) ? input.publicFields.filter(key => PUBLIC_FIELDS.some(field => field.key === key)) : [...DEFAULT_SETTINGS.publicFields];
  if (!settings.publicFields.includes('name')) settings.publicFields.unshift('name');
  for (const [key, value] of Object.entries(input.colors || {}).slice(0, 100)) if (/^#[a-f\d]{6}$/i.test(value)) Object.defineProperty(settings.colors, key.slice(0, 1000), { value, enumerable: true, writable: true, configurable: true });
  return settings;
}
export function publicSnapshot(points, inputSettings) {
  if (!Array.isArray(points) || !points.length || points.length > MAX_ROWS) throw new Error('共有できる地点数は1〜1,000件です。');
  const settings = cleanSettings(inputSettings);
  const items = points.map((point, index) => {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon) || Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180 || !String(point.name || '').trim()) throw new Error('共有データの地点名・座標が正しくありません。');
    const item = { id: `p${index}`, name: String(point.name).slice(0, 160), lat: point.lat, lon: point.lon };
    for (const key of settings.publicFields.filter(key => key !== 'name')) {
      const value = String(point[key] || '').slice(0, key === 'description' ? 2000 : 1000);
      item[key] = key === 'image' || key === 'sourceUrl' ? safeUrl(value, key === 'image') : value;
    }
    return item;
  });
  if (!settings.publicFields.includes('category')) { settings.filters = false; settings.colors = {}; }
  else settings.colors = Object.fromEntries(categoriesOf(items).filter(category => Object.hasOwn(settings.colors, category)).map(category => [category, settings.colors[category]]));
  return { version: 1, publishedAt: new Date().toISOString(), settings, items };
}
async function bytesFromStream(stream, limit = 2 * 1024 * 1024) {
  const reader = stream.getReader(), chunks = [];
  let length = 0;
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > limit) throw new Error('地図データが大きすぎます。'); chunks.push(value); }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
export async function encodeShare(snapshot) {
  if (typeof CompressionStream !== 'function') throw new Error('このブラウザーでは共有リンクを作れません。最新版のChrome・Edge・Safariなどを使ってください。');
  const normalized = publicSnapshot(snapshot.items, snapshot.settings);
  normalized.publishedAt = snapshot.publishedAt;
  const bytes = await bytesFromStream(new Blob([JSON.stringify(normalized)]).stream().pipeThrough(new CompressionStream('deflate')));
  let binary = ''; for (const value of bytes) binary += String.fromCharCode(value);
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (encoded.length > MAX_LINK_LENGTH) throw new Error('共有リンクが長すぎます。地点数や紹介文・写真URLを減らしてください。地図ファイルへの保存は利用できます。');
  return encoded;
}
export async function decodeShare(encoded) {
  if (!encoded || encoded.length > MAX_LINK_LENGTH || !/^[a-zA-Z\d_-]+$/.test(encoded)) throw new Error('共有リンクが正しくありません。リンク全体をコピーし直してください。');
  try {
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const decoded = await bytesFromStream(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')));
    const raw = JSON.parse(new TextDecoder().decode(decoded));
    if (raw.version !== 1) throw new Error('未対応のバージョン');
    const snapshot = publicSnapshot(raw.items, raw.settings);
    snapshot.publishedAt = Number.isFinite(Date.parse(raw.publishedAt)) ? raw.publishedAt : '';
    return snapshot;
  } catch { throw new Error('地図を開けませんでした。共有リンクが途中で切れていないか確認してください。'); }
}
export function changedPoints(before, after) {
  const old = new Map(before.map(point => [point.id, point]));
  const next = new Map(after.map(point => [point.id, point]));
  return { added: after.filter(point => !old.has(point.id)).length, removed: before.filter(point => !next.has(point.id)).length, changed: after.filter(point => old.has(point.id) && JSON.stringify(old.get(point.id)) !== JSON.stringify(point)).length };
}
