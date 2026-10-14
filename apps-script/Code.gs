/** 牛久スポット地図: 読み取り専用API。シートには書き込みません。 */
const MAP_API = Object.freeze({
  spreadsheetId: '1UJGEZiVQQ3OYiweZG2CgyhgOUkIg8FlaE2KtkyxfZ74',
  sheetName: 'シート1',
  enablePublicApi: true,
  maxRows: 5000,
  referenceLat: 35.979,
  referenceLon: 140.162,
  warningDistanceKm: 25
});

/** GET /exec?action=pois => JSON。callback指定時は公開観光情報のみJSONP。 */
function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.view === 'map') {
    return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('うしくスポットマップ')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  if (!MAP_API.enablePublicApi) return output_({ ok: false, error: { code: 'API_DISABLED', message: '公開APIは無効です。' } }, '');
  const callback = params.callback || '';
  if (callback && !/^__ushiku_cb_\d{1,32}$/.test(callback)) {
    return output_({ ok: false, error: { code: 'INVALID_CALLBACK', message: 'callbackの形式が不正です。' } }, '');
  }
  if (params.action && params.action !== 'pois') {
    return output_({ ok: false, error: { code: 'UNKNOWN_ACTION', message: 'actionにはpoisを指定してください。' } }, callback);
  }
  const result = getMapData();
  if (result.ok) {
    const category = String(params.category || '').trim();
    const words = String(params.q || '').normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
    result.items = result.items.filter(function (item) {
      const text = [item.name, item.location, item.description, item.category].join(' ').normalize('NFKC').toLowerCase();
      return (!category || item.category === category) && words.every(function (word) { return text.indexOf(word) !== -1; });
    });
    result.total = result.items.length;
  }
  return output_(result, callback);
}

/** HTML Service版から google.script.run.getMapData() で呼び出せます。 */
function getMapData() {
  try {
    // SpreadsheetApp.openById は書き込みを含むスコープが必要です。
    // 読み取り専用スコープを維持するため、Advanced Sheets APIで取得します。
    const metadata = Sheets.Spreadsheets.get(MAP_API.spreadsheetId, { fields: 'sheets(properties)' });
    const target = (metadata.sheets || []).find(function (sheet) { return sheet.properties.title === MAP_API.sheetName; });
    if (!target) return error_('SHEET_NOT_FOUND', '対象タブ「' + MAP_API.sheetName + '」がありません。');
    const props = target.properties;
    const grid = props.gridProperties;
    const columns = Math.min(grid.columnCount, 100);
    const rows = Math.min(grid.rowCount, MAP_API.maxRows + 1);
    const range = "'" + MAP_API.sheetName.replace(/'/g, "''") + "'!A1:" + columnLetter_(columns) + rows;
    const response = Sheets.Spreadsheets.Values.get(MAP_API.spreadsheetId, range, { valueRenderOption: 'FORMATTED_VALUE' });
    const allValues = response.values || [];
    const lastRow = allValues.length;
    const lastColumn = Math.max(0, ...allValues.map(function (row) { return row.length; }));
    if (!lastRow || !lastColumn) return error_('EMPTY_SHEET', 'シートに見出しがありません。');
    if (lastColumn > 100 || lastRow > MAP_API.maxRows) return error_('TOO_LARGE', '読み取り上限を超えています。設定を確認してください。');
    const top = allValues.slice(0, 10);
    const headerIndex = top.findIndex(function (row) {
      const labels = row.map(function (cell) { return String(cell).trim().toLowerCase(); });
      return ['name', 'lat', 'lon'].every(function (key) { return labels.indexOf(key) !== -1; });
    });
    if (headerIndex === -1) return error_('MISSING_HEADERS', '先頭10行にname・lat・lonの見出しが必要です。');
    const headers = top[headerIndex].map(function (cell) { return String(cell).trim().toLowerCase(); });
    for (const key of ['name', 'lat', 'lon']) {
      if (headers.filter(function (label) { return label === key; }).length !== 1) return error_('DUPLICATE_HEADERS', key + '列の見出しが重複しています。');
    }
    const headerRow = headerIndex + 1;
    const values = allValues.slice(headerRow);
    const items = [];
    let skippedRows = 0;
    values.forEach(function (row, index) {
      if (row.every(function (cell) { return !String(cell).trim(); })) return;
      function cell(key) { const pos = headers.indexOf(key); return pos < 0 ? '' : String(row[pos] || '').trim(); }
      const name = cell('name');
      const latitude = cell('lat');
      const longitude = cell('lon');
      const lat = Number(latitude);
      const lon = Number(longitude);
      if (!name || !latitude || !longitude || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { skippedRows++; return; }
      const distance = distanceKm_(MAP_API.referenceLat, MAP_API.referenceLon, lat, lon);
      const rowNumber = headerRow + 1 + index;
      items.push({
        id: 'sheet-' + props.sheetId + '-row-' + rowNumber,
        row: rowNumber, name: name, location: cell('location'), lat: lat, lon: lon,
        description: cell('description'), time: cell('time'), closed: cell('closed'),
        category: cell('category') || '未分類', image: publicUrl_(cell('image')),
        sourceUrl: publicUrl_(cell('取得したサイト')),
        coordinateWarning: distance > MAP_API.warningDistanceKm ? '牛久エリアの基準点から25km以上離れています。座標を確認してください' : ''
      });
    });
    return { ok: true, schemaVersion: 1, fetchedAt: new Date().toISOString(),
      source: { sheetName: MAP_API.sheetName, headerRow: headerRow, mode: 'live' },
      total: items.length, skippedRows: skippedRows, items: items };
  } catch (error) {
    // 例外の詳細、認証情報、他のセル内容は公開APIに返しません。
    console.error('Map API read failed: ' + error.message);
    return error_('READ_FAILED', 'シートを読み取れませんでした。スクリプトの実行権限とシートIDを確認してください。');
  }
}
function columnLetter_(number) {
  let letters = '';
  while (number > 0) { number--; letters = String.fromCharCode(65 + number % 26) + letters; number = Math.floor(number / 26); }
  return letters;
}
function error_(code, message) { return { ok: false, error: { code: code, message: message } }; }
function output_(data, callback) {
  const json = JSON.stringify(data).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return ContentService.createTextOutput(callback ? callback + '(' + json + ');' : json)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}
function publicUrl_(value) { return /^https?:\/\/[^\s]+$/i.test(value) ? value : ''; }
function distanceKm_(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const a = Math.pow(Math.sin((lat2 - lat1) * rad / 2), 2) + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.pow(Math.sin((lon2 - lon1) * rad / 2), 2);
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}
