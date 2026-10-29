import { FIELDS, PUBLIC_FIELDS, DEFAULT_SETTINGS, PALETTE, escapeHtml as e, tableFromGrid, validateTable, categoriesOf, colorOf, filterPoints, readGoogleSheet, publicSnapshot, encodeShare, decodeShare, changedPoints } from './core.mjs';

const $ = id => document.getElementById(id);
const clone = value => structuredClone(value);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const STORAGE = 'machi-projects-v1';
const stageNames = ['表を取り込む', '地図を生成', '地図を整える', '公開前に確認', '公開・共有'];
const defaultState = () => ({ id: crypto.randomUUID(), stage: 'import', tab: 'file', settingsTab: 'style', settings: clone(DEFAULT_SETTINGS), table: null, points: [], source: null, excluded: false, error: '', busy: false, device: 'desktop', sheetUrl: '', paste: '', workbook: null, sheet: '', published: null, shareUrl: '', reviewed: null, reviewContent: false, reviewPublic: false, history: [], changes: null });
let state = defaultState();
let viewer = null, teaserMap = null, saveTimer, toastTimer;
const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
function icons() { window.lucide?.createIcons({ attrs: { 'aria-hidden': 'true' } }); }
function announce(message) { $('announcement').textContent = ''; requestAnimationFrame(() => { $('announcement').textContent = message; }); }
function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500); }
function getProjects() { try { const projects = JSON.parse(localStorage.getItem(STORAGE) || '[]'); return Array.isArray(projects) ? projects : []; } catch { return []; } }
function writeProject() {
  clearTimeout(saveTimer);
  if (!state.table) return true;
  try {
    const project = { format: 'machi-project', version: 1, id: state.id, table: state.table, points: state.points, settings: state.settings, source: state.source, excluded: state.excluded, published: state.published, updatedAt: new Date().toISOString() };
    const projects = getProjects().filter(item => item.id !== state.id);
    if (projects.length >= 10) throw new Error('保存数の上限');
    localStorage.setItem(STORAGE, JSON.stringify([project, ...projects]));
    $('save-state').innerHTML = `${icon('check')}このブラウザーに保存しました`;
    icons(); return true;
  } catch {
    $('save-state').innerHTML = `${icon('triangle-alert')}保存できません。「地図ファイルを保存」で保管できます`;
    icons(); return false;
  }
}
function queueSave() { clearTimeout(saveTimer); $('save-state').innerHTML = `${icon('loader-circle')}保存中…`; icons(); saveTimer = setTimeout(writeProject, 500); }
function remember() { state.history.push(clone(state.settings)); if (state.history.length > 40) state.history.shift(); }
function updateSettings() {
  state.reviewed = null; state.reviewContent = false; state.reviewPublic = false;
  document.title = `${state.settings.title} — machi`;
  viewer?.update(state.points, state.settings); queueSave();
  const undo = document.querySelector('[data-action="undo"]'); if (undo) undo.disabled = !state.history.length;
}
function destroyViews() { viewer?.destroy(); viewer = null; teaserMap?.remove(); teaserMap = null; }
function renderSteps(index) {
  $('steps-list').innerHTML = stageNames.map((name, i) => `<li class="step ${i === index ? 'active' : i < index ? 'complete' : ''}" ${i === index ? 'aria-current="step"' : ''}><span class="step-number">${i < index ? icon('check') : i + 1}</span><span>${name}</span></li>`).join('');
}
function footer(html, note) {
  $('footer-actions').innerHTML = html;
  if (note) $('save-state').innerHTML = note;
  icons();
}
function focusMain() { $('main').focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }
function render() {
  destroyViews();
  document.body.classList.remove('public-mode');
  document.title = state.stage === 'import' ? 'machi — 表から、まちの地図を。' : `${state.settings.title} — machi`;
  if (state.stage === 'import') renderImport();
  if (state.stage === 'generating') renderGenerating();
  if (state.stage === 'editor') renderEditor();
  if (state.stage === 'review') renderReview();
  if (state.stage === 'share') renderShare();
  icons();
}
function sourceTabs() { return `<div class="source-tabs" role="tablist" aria-label="取り込み方法">${[['file', 'file-spreadsheet', 'ファイル'], ['google', 'sheet', 'Google Sheets'], ['paste', 'clipboard-paste', '貼り付け']].map(([tab, symbol, label]) => `<button role="tab" id="tab-${tab}" aria-controls="source-pane" aria-selected="${state.tab === tab}" class="${state.tab === tab ? 'active' : ''}" data-action="source-tab" data-tab="${tab}">${icon(symbol)}${label}</button>`).join('')}</div>`; }
function sourcePane() {
  if (state.tab === 'google') return `<div class="source-form"><label>スプレッドシートのURL<input id="sheet-url" type="url" placeholder="https://docs.google.com/spreadsheets/d/…" value="${e(state.sheetUrl)}" autocomplete="off" ${state.busy ? 'disabled' : ''}></label><p class="muted">使いたいシートのタブを開き、そのURLを貼り付けてください。</p><button class="button wide" data-action="read-google" ${state.busy ? 'disabled' : ''}>${icon(state.busy ? 'loader-circle' : 'link')}${state.busy ? 'Google Sheetsから取得中…' : '表を読み込む'}</button><p class="muted">リンクで閲覧できる表を、そのまま読み込みます。<br><button class="text-button" data-action="google-help">共有設定の確認方法</button></p></div>`;
  if (state.tab === 'paste') return `<div class="source-form"><label>表のセルをコピーして貼り付け<textarea id="paste-data" placeholder="スポット名&#9;緯度&#9;経度&#10;牛久シャトー&#9;35.978&#9;140.147" spellcheck="false">${e(state.paste)}</textarea></label><button class="button wide" data-action="read-paste" ${state.busy ? 'disabled' : ''}>${icon('table-2')}貼り付けた表を読み込む</button></div>`;
  return `<div class="dropzone" id="dropzone"><span class="upload-symbol">${icon('upload')}</span><h3>表のファイルを、ここにドロップ</h3><p>Excel（.xlsx）・CSV（UTF-8）・地図ファイル<br>最大8MB／1,000地点まで</p><button class="button" data-action="choose-file" ${state.busy ? 'disabled' : ''}>${icon('folder-open')}${state.busy ? '読み込み中…' : 'ファイルを選ぶ'}</button></div>`;
}
function renderImport() {
  renderSteps(0);
  const table = state.table;
  $('main').innerHTML = `<div class="page-heading"><div><p class="eyebrow">MAKE YOUR LOCAL MAP</p><h1>表から、まちの地図を。</h1><p class="muted">いつもの表を取り込むだけ。スポット・検索・カテゴリを備えた地図ができます。</p></div></div>
    <div class="import-grid"><section class="panel import-card" aria-labelledby="import-title"><div class="card-heading"><span>01</span><h2 id="import-title">データを取り込む</h2></div>${sourceTabs()}<div id="source-pane" role="tabpanel" aria-labelledby="tab-${state.tab}">${sourcePane()}</div><input type="file" id="file-input" accept=".xlsx,.csv,.tsv,.json" hidden>
    ${state.error ? `<div class="error-box" role="alert">${icon('circle-alert')}<span>${e(state.error)}</span></div>` : ''}
    <p class="source-note">${icon('shield-check')}ファイルはブラウザー内で読み込みます。<br>元の表に書き込むことはありません。</p>
    <div class="sample-row"><div><p>まずは、牛久のスポットで。</p><small>写真付きのサンプル表で試せます</small></div><button class="button small soft" data-action="sample" ${state.busy ? 'disabled' : ''}>サンプルを使う${icon('arrow-up-right')}</button></div>
    <div style="margin-top:14px;text-align:right"><a class="muted" href="samples/ushiku.xlsx" download>サンプルExcelをダウンロード</a></div></section>
    <div>${table ? importPreview() : `<div class="panel teaser"><div id="teaser-map" class="teaser-map" aria-label="牛久周辺の地図の表示例"></div><div class="teaser-tag">${icon('map')}できあがる地図のイメージ</div><div class="teaser-caption"><span class="caption-icon">${icon('map-pinned')}</span><div><h3>表の中の場所が、ひとつの地図に。</h3><p>名前も、写真も、カテゴリも。まちの魅力が伝わるかたちへ。</p></div>${icon('sparkles')}</div></div><div class="mini-benefits"><div>${icon('file-check-2')}<div><b>使い慣れた表から</b><p>Excel・CSV・Google Sheets</p></div></div><div>${icon('sliders-horizontal')}<div><b>見ながら整える</b><p>色や表示を、その場で変更</p></div></div><div>${icon('send')}<div><b>リンクで届ける</b><p>確認した地図を、そのまま共有</p></div></div></div>`}</div></div>`;
  if (!table) createTeaser();
  footer(`<button class="button" data-action="generate" id="generate-button" disabled>${icon('map-pinned')}この表から地図を作成${icon('arrow-right')}</button>`, `${icon('lock-keyhole')}元の表への書き込みは行いません`);
  updateImportValidation();
  const dropzone = $('dropzone');
  if (dropzone) {
    for (const type of ['dragenter', 'dragover']) dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.add('dragover'); });
    for (const type of ['dragleave', 'drop']) dropzone.addEventListener(type, event => { event.preventDefault(); dropzone.classList.remove('dragover'); });
    dropzone.addEventListener('drop', event => { const file = event.dataTransfer.files[0]; if (file && !state.busy) readFile(file); });
  }
  $('file-input').addEventListener('change', event => { if (event.target.files[0]) readFile(event.target.files[0]); });
}
function importPreview() {
  const table = state.table;
  return `<section class="panel data-panel" aria-labelledby="data-title"><div class="data-panel-header"><h2 id="data-title">読み取った表</h2><span class="status-badge">${icon('check')}読み込み完了</span></div><div class="file-result" style="margin-top:16px">${icon(state.source?.kind === 'google' ? 'sheet' : 'file-spreadsheet')}<div><strong>${e(state.source?.name || '取り込んだ表')}</strong><small>見出し：${table.headerRow}行目${state.source?.sheet ? ` ／ ${e(state.source.sheet)}` : ''}</small></div><button class="icon-button" data-action="clear-import" aria-label="取り込んだ表を外す">${icon('x')}</button></div>
    ${state.workbook && state.workbook.SheetNames.length > 1 ? `<label style="margin-bottom:16px">Excelのシート<select id="workbook-sheet">${state.workbook.SheetNames.map(name => `<option ${state.sheet === name ? 'selected' : ''}>${e(name)}</option>`).join('')}</select></label>` : ''}
    <div class="data-stats" id="data-stats"></div><div class="table-scroll"><table><thead><tr><th>行</th>${table.headers.map((header, index) => `<th title="${e(header)}">${index + 1}. ${e(header)}</th>`).join('')}</tr></thead><tbody>${table.rows.slice(0, 6).map((row, index) => `<tr><td>${table.headerRow + index + 1}</td>${row.map(value => `<td title="${e(value)}">${e(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="muted" style="font-size:10px;margin-top:7px">先頭${Math.min(6, table.rows.length)}行を表示しています。</p>
    <div class="mapping-title"><h3>地図に使う列</h3><span>自動判定した列を変更できます</span></div><div class="mapping-fields">${FIELDS.filter(field => field.required).map(mappingControl).join('')}</div><details class="optional-mapping"><summary>住所・カテゴリ・写真などの列を確認する</summary><div class="mapping-fields">${FIELDS.filter(field => !field.required).map(mappingControl).join('')}</div></details><div id="validation-results"></div></section>`;
}
function mappingControl(field) { return `<label>${e(field.label)}${field.required ? '<span class="required">*</span>' : ''}<select data-mapping="${field.key}" aria-label="${e(field.label)}に使う列"><option value="-1">${field.required ? '列を選んでください' : '使わない'}</option>${state.table.headers.map((header, index) => `<option value="${index}" ${state.table.mapping[field.key] === index ? 'selected' : ''}>${index + 1}. ${e(header)}</option>`).join('')}</select></label>`; }
function updateImportValidation() {
  if (!state.table) return;
  const result = validateTable(state.table);
  $('data-stats').innerHTML = `<span><b>${result.total}</b>行を読み込み</span><span><b>${result.valid.length}</b>地点を配置できます</span>${result.invalid.length ? `<span class="warning-count">要確認 ${result.invalid.length}行</span>` : ''}`;
  let html = '';
  if (result.missing.length) html += `<div class="error-box">${icon('columns-3')}<span>${e(result.missing.join('・'))}に使う列を選んでください。住所からの位置検索は未対応です。</span></div>`;
  if (result.duplicatedColumns) html += `<div class="error-box">${icon('columns-3')}同じ列が複数の項目に選択されています。列の対応を確認してください。</div>`;
  if (!result.missing.length && !result.duplicatedColumns && result.invalid.length) html += `<div class="invalid-rows"><details><summary>${result.invalid.length}行の位置・必須項目を確認してください</summary><ul>${result.invalid.slice(0, 50).map(row => `<li>${row.row}行目「${e(row.name)}」：${e(row.reasons.join('／'))}</li>`).join('')}</ul></details><label class="check-row"><input type="checkbox" id="exclude-invalid" ${state.excluded ? 'checked' : ''}>要確認の${result.invalid.length}行を、今回の地図には含めない</label></div>`;
  if (!result.total) html += '<div class="error-box">見出し以外のデータがありません。スポットの行を追加してください。</div>';
  if (!result.missing.length && !result.duplicatedColumns && !result.invalid.length && result.valid.length) html += `<p class="source-note" style="margin-top:16px;color:#5c7d68">${icon('circle-check')}名称と座標の形式を確認しました。位置の正確さは地図上で確認してください。</p>`;
  $('validation-results').innerHTML = html;
  $('generate-button').disabled = !!(state.busy || result.missing.length || result.duplicatedColumns || !result.valid.length || (result.invalid.length && !state.excluded));
  icons();
}
function createTeaser() {
  if (!window.L) { $('teaser-map').innerHTML = '<p class="fatal">地図ライブラリを読み込めませんでした。ページを再読み込みしてください。</p>'; return; }
  teaserMap = L.map('teaser-map', { zoomControl: false, scrollWheelZoom: false, dragging: false, touchZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, zoomAnimation: false, center: [35.9807, 140.143], zoom: 14 });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(teaserMap);
  [[35.97802056, 140.1473454, '牛久シャトー', PALETTE[0]], [35.98645215, 140.1398715, 'かっぱ本舗', PALETTE[2]], [35.9773, 140.1399, '牛久駅', PALETTE[3]]].forEach(([lat, lon, name, color]) => L.marker([lat, lon], { icon: pinIcon(color), keyboard: false, interactive: false }).addTo(teaserMap).bindTooltip(name, { permanent: true, direction: 'top', offset: [0, -17], className: 'map-label' }));
}
function csvGrid(text) {
  if (!window.XLSX) throw new Error('表の読み込みライブラリがありません。ページを再読み込みしてください。');
  const workbook = XLSX.read(text.replace(/^\uFEFF/, ''), { type: 'string', raw: true });
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '', raw: false, blankrows: true });
}
function imported(grid, source) {
  const previous = state.points;
  const table = tableFromGrid(grid);
  const result = validateTable(table);
  state.table = table; state.source = source; state.excluded = false; state.error = ''; state.reviewed = null;
  state.changes = previous.length ? changedPoints(previous, result.valid) : null;
  state.stage = 'import'; state.busy = false;
  render(); queueSave();
  announce(`${result.total}行を読み込みました。${result.valid.length}地点を配置できます。`);
}
async function readFile(file) {
  if (state.busy) return;
  const request = state;
  state.busy = true; state.error = ''; render();
  try {
    if (file.size > 8 * 1024 * 1024) throw new Error('8MB以内のファイルを選んでください。');
    if (!/\.(xlsx|csv|tsv|json)$/i.test(file.name)) throw new Error('Excel（.xlsx）・CSV・TSV・地図ファイル（.json）に対応しています。');
    const buffer = await file.arrayBuffer();
    if (state !== request) return;
    state.workbook = null;
    if (/\.json$/i.test(file.name)) {
      const data = JSON.parse(new TextDecoder().decode(buffer));
      if (data.format === 'machi-project') { loadProject(data, true); return; }
      const snapshot = publicSnapshot(data.items, data.settings);
      state.settings = snapshot.settings;
      const keys = ['name', 'lat', 'lon', 'location', 'category', 'description', 'image', 'time', 'closed', 'sourceUrl'];
      imported([keys, ...snapshot.items.map(item => keys.map(key => item[key] ?? ''))], { kind: 'file', name: file.name, readAt: new Date().toISOString() });
    } else if (/\.xlsx$/i.test(file.name)) {
      if (new Uint8Array(buffer)[0] !== 0x50 || new Uint8Array(buffer)[1] !== 0x4b) throw new Error('Excelファイルを読み取れません。Excelで.xlsxとして保存し直してください。');
      state.workbook = XLSX.read(buffer, { type: 'array', raw: true });
      state.sheet = state.workbook.SheetNames[0];
      imported(XLSX.utils.sheet_to_json(state.workbook.Sheets[state.sheet], { header: 1, defval: '', raw: false, blankrows: true }), { kind: 'file', name: file.name, sheet: state.sheet, readAt: new Date().toISOString() });
    } else {
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch { throw new Error('文字コードを読み取れません。CSV UTF-8で保存し直して取り込んでください。'); }
      imported(csvGrid(text), { kind: 'file', name: file.name, readAt: new Date().toISOString() });
    }
  } catch (error) { if (state !== request) return; state.busy = false; state.error = error.message || 'ファイルを読み込めませんでした。'; render(); }
}
async function readGoogle() {
  if (state.busy) return;
  const request = state;
  state.busy = true; state.error = ''; render();
  try {
    const result = await readGoogleSheet(state.sheetUrl.trim());
    if (state !== request) return;
    state.workbook = null;
    imported(csvGrid(result.text), { kind: 'google', name: 'Googleスプレッドシート', url: result.source.original, sheet: `gid: ${result.source.gid}`, readAt: new Date().toISOString() });
  } catch (error) { if (state !== request) return; state.busy = false; state.error = error.message; render(); announce(error.message); }
}
async function loadSample() {
  if (state.busy) return;
  const request = state;
  state.busy = true; state.error = ''; render();
  try {
    const response = await fetch('samples/ushiku.csv'); if (!response.ok) throw new Error('サンプルを読み込めませんでした。');
    const grid = csvGrid(await response.text());
    if (state !== request) return;
    state.workbook = null; state.settings = clone(DEFAULT_SETTINGS); state.settings.title = 'うしくスポットマップ';
    imported(grid, { kind: 'sample', name: 'うしくスポット.csv', readAt: new Date().toISOString() });
  } catch (error) { if (state !== request) return; state.busy = false; state.error = error.message; render(); }
}
function renderGenerating() {
  renderSteps(1);
  $('main').innerHTML = `<div class="generating"><div>${icon('map-pinned')}<h2>表から地図を作成しています</h2><p class="muted">スポットを配置し、検索とカテゴリを準備しています。</p></div></div>`;
  footer('', `${icon('loader-circle')}地図を生成中`);
}
async function generate() {
  const request = state;
  const result = validateTable(state.table);
  if (result.missing.length || result.duplicatedColumns || !result.valid.length || (result.invalid.length && !state.excluded)) return;
  state.stage = 'generating'; render();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  if (state !== request) return;
  state.points = result.valid;
  if (state.settings.title === DEFAULT_SETTINGS.title && state.source?.kind !== 'paste') state.settings.title = state.source.name.replace(/\.(xlsx|csv|tsv|json)$/i, '') + (state.source.kind === 'google' ? 'の地図' : '');
  categoriesOf(state.points).forEach((category, index) => { if (!Object.hasOwn(state.settings.colors, category)) Object.defineProperty(state.settings.colors, category, { value: PALETTE[index % PALETTE.length], enumerable: true, configurable: true, writable: true }); });
  state.stage = 'editor'; state.reviewed = null; state.reviewContent = false; state.reviewPublic = false;
  render(); writeProject(); focusMain(); announce(`${state.points.length}地点の地図を作成しました。`);
}
function previewMarkup() { return `<section class="panel preview-panel"><div class="preview-top"><span>${icon('eye')}公開前のプレビュー</span><div class="device-switch" role="group" aria-label="プレビューの端末">${[['desktop', 'monitor', 'PC'], ['mobile', 'smartphone', 'スマートフォン']].map(([device, symbol, name]) => `<button class="${state.device === device ? 'active' : ''}" aria-pressed="${state.device === device}" data-action="device" data-device="${device}">${icon(symbol)}${name}</button>`).join('')}</div></div><div class="preview-stage" id="preview-stage"></div></section>`; }
function renderEditor() {
  renderSteps(2);
  $('main').innerHTML = `<div class="page-heading editor-heading"><div><p class="eyebrow">YOUR MAP, YOUR STYLE</p><div class="heading-inline"><h1>地図を、あなたらしく。</h1><span class="status-badge">下書き・未公開の変更</span></div><p class="muted">${state.points.length}地点から地図ができました。設定を変えると、右のプレビューに反映されます。</p></div><button class="button small ghost" data-action="undo" ${!state.history.length ? 'disabled' : ''}>${icon('undo-2')}元に戻す</button></div>
    <div class="editor-grid"><aside class="panel settings-panel" aria-label="地図の設定"><div class="source-tabs editor-tabs" role="tablist" aria-label="設定の種類">${[['style', 'palette', '見た目'], ['data', 'table-2', 'データ'], ['fields', 'list-checks', '掲載項目']].map(([tab, symbol, name]) => `<button role="tab" aria-selected="${state.settingsTab === tab}" class="${state.settingsTab === tab ? 'active' : ''}" data-action="settings-tab" data-tab="${tab}">${icon(symbol)}${name}</button>`).join('')}</div><div class="settings-content" id="settings-content"></div></aside>${previewMarkup()}</div>`;
  renderSettings();
  viewer = new MapView($('preview-stage'), state.points, state.settings, { mobile: state.device === 'mobile' });
  footer(`<button class="button small ghost" data-action="export-project">${icon('download')}地図ファイルを保存</button><button class="button" data-action="review">公開前に確認${icon('arrow-right')}</button>`);
}
function renderSettings() {
  const settings = state.settings;
  if (state.settingsTab === 'data') {
    const result = validateTable(state.table);
    $('settings-content').innerHTML = `<div class="settings-section"><h3>${icon('file-spreadsheet')}取り込み元</h3><div class="source-summary"><strong>${e(state.source?.name)}</strong>${e(state.source?.sheet || '')}<br>${result.total}行 → ${state.points.length}地点${result.invalid.length ? `<br>含めない行：${result.invalid.length}行` : ''}<br>取得 ${new Date(state.source.readAt).toLocaleString('ja-JP')}</div>${state.source?.kind === 'google' ? `<button class="button small outline wide" data-action="refresh-google">${icon('refresh-cw')}元の表を再取得</button>` : ''}<button class="button small ghost wide" data-action="back-import" style="margin-top:8px">${icon('replace')}表・列の対応を変更</button></div>${state.changes ? `<div class="settings-section"><h3>前の取り込みからの変化</h3><p class="muted">追加 ${state.changes.added} ／ 変更 ${state.changes.changed} ／ 削除 ${state.changes.removed}</p><p class="muted" style="font-size:10px;margin-top:8px">地点IDがない表では行の並び替えで対応が変わることがあります。</p></div>` : ''}<p class="note">掲載情報は元の表で修正し、取り込み直してください。表示設定だけをこの画面で変更します。再取得しても、発行済みの共有リンクは変わりません。</p>`;
  } else if (state.settingsTab === 'fields') {
    $('settings-content').innerHTML = `<div class="settings-section"><h3>${icon('list-checks')}地図に掲載する項目</h3><p class="muted" style="font-size:10px;margin-bottom:17px">共有リンクに含める情報を選びます。</p>${PUBLIC_FIELDS.map(field => `<label class="check-row"><input type="checkbox" data-public-field="${field.key}" ${settings.publicFields.includes(field.key) ? 'checked' : ''} ${field.key === 'name' ? 'disabled' : ''}>${e(field.label)}${field.key === 'name' ? '（必須）' : ''}</label>`).join('')}</div><p class="note">選択していない列や内部メモ、元の表のURLは、共有データに含めません。緯度・経度は地図表示に使うため必ず含みます。</p>`;
  } else {
    $('settings-content').innerHTML = `<div class="settings-section"><h3>${icon('type')}地図の基本情報</h3><label>地図名<input data-setting="title" value="${e(settings.title)}" maxlength="80" placeholder="地図の名前"></label><label>案内文<textarea data-setting="description" maxlength="240" placeholder="この地図をひとことで">${e(settings.description)}</textarea></label></div>
      <div class="settings-section"><h3>${icon('palette')}テーマカラー</h3><div class="palette" role="group" aria-label="テーマカラー">${[['#7952b3', 'ラベンダー'], ['#ad6387', 'ローズ'], ['#538470', 'セージ'], ['#5d80ac', 'ブルー'], ['#ae7b43', 'アンバー']].map(([color, name]) => `<button class="swatch ${settings.accent === color ? 'selected' : ''}" style="--swatch:${color}" aria-label="${name}" aria-pressed="${settings.accent === color}" data-action="accent" data-color="${color}">${settings.accent === color ? icon('check') : ''}</button>`).join('')}</div></div>
      <div class="settings-section"><h3>${icon('map-pin')}カテゴリのピン色</h3>${categoriesOf(state.points).map(category => `<label class="category-color-row"><span>${e(category)}</span><input type="color" aria-label="${e(category)}のピン色" data-category-color="${e(category)}" value="${colorOf(category, settings, state.points)}"></label>`).join('')}</div>
      <div class="settings-section"><h3>${icon('sliders-horizontal')}表示の設定</h3>${[['search', '検索を表示'], ['filters', 'カテゴリで絞り込み'], ['photos', '写真を表示']].map(([key, label]) => `<label class="toggle-row">${label}<input type="checkbox" role="switch" data-toggle="${key}" ${settings[key] ? 'checked' : ''}></label>`).join('')}<label style="margin-top:16px">背景地図<select data-setting="basemap"><option value="quiet" ${settings.basemap === 'quiet' ? 'selected' : ''}>やわらかい地図</option><option value="standard" ${settings.basemap === 'standard' ? 'selected' : ''}>標準の地図</option></select></label></div>`;
  }
  icons();
}
function enterReview() {
  state.reviewed = publicSnapshot(state.points, state.settings);
  state.reviewContent = false; state.reviewPublic = false; state.stage = 'review'; render(); focusMain();
}
function renderReview() {
  renderSteps(3);
  const snapshot = state.reviewed;
  $('main').innerHTML = `<div class="page-heading editor-heading"><div><p class="eyebrow">ONE LAST LOOK</p><h1>届ける前に、最終確認。</h1><p class="muted">掲載する情報と位置、スマートフォンでの見え方を確認してください。</p></div><span class="status-badge">確認中・未公開の変更</span></div><div class="editor-grid"><section class="panel review-panel"><h2>共有する地図</h2><dl class="review-summary"><div><dt>地図名</dt><dd>${e(snapshot.settings.title)}</dd></div><div><dt>スポット数</dt><dd>${snapshot.items.length}地点</dd></div><div><dt>掲載しない行</dt><dd>${validateTable(state.table).invalid.length}行</dd></div><div><dt>共有方法</dt><dd>データを含むリンク</dd></div></dl><h3 style="font-size:11px">掲載する項目</h3><div class="review-fields">${snapshot.settings.publicFields.map(key => `<span>${e(PUBLIC_FIELDS.find(field => field.key === key)?.label)}</span>`).join('')}</div><label class="check-row"><input type="checkbox" id="review-content" ${state.reviewContent ? 'checked' : ''}>掲載内容と地図上の位置を確認しました</label><label class="check-row"><input type="checkbox" id="review-public" ${state.reviewPublic ? 'checked' : ''}>リンクを知っている人が、掲載情報を閲覧できることを確認しました</label><p class="note">共有リンクには確認した地図のデータが含まれます。元の表は変更しません。発行後のリンクを無効にする機能はありません。変更時には新しいリンクを発行します。</p></section>${previewMarkup()}</div>`;
  viewer = new MapView($('preview-stage'), snapshot.items, snapshot.settings, { mobile: state.device === 'mobile' });
  footer(`<button class="button ghost" data-action="back-editor">${icon('arrow-left')}編集に戻る</button><button class="button" id="publish-button" data-action="publish" ${!state.reviewContent || !state.reviewPublic || state.busy ? 'disabled' : ''}>${icon('send')}${state.busy ? 'リンクを作成中…' : '共有リンクを発行'}</button>`, `${icon('shield-check')}確認した版だけを共有リンクに含めます`);
}
async function publish() {
  if (!state.reviewContent || !state.reviewPublic || state.busy) return;
  const request = state;
  state.busy = true; $('publish-button').disabled = true; $('publish-button').textContent = 'リンクを作成中…';
  try {
    const snapshot = clone(state.reviewed);
    const encoded = await encodeShare(snapshot);
    if (state !== request) return;
    const url = new URL('./', location.href); url.search = ''; url.hash = `map=${encoded}`;
    state.published = snapshot; state.shareUrl = url.href; state.stage = 'share'; state.busy = false;
    render(); writeProject(); focusMain(); announce('共有リンクを作成しました。');
  } catch (error) { if (state !== request) return; state.busy = false; render(); toast(error.message); }
}
function renderShare() {
  renderSteps(4);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  $('main').innerHTML = `<div class="page-heading editor-heading"><div><p class="eyebrow">READY TO EXPLORE</p><h1>まちの魅力を、届けよう。</h1><p class="muted">確認した地図から、閲覧用の共有リンクを作成しました。</p></div><span class="status-badge green">${icon('check')}リンク作成済み</span></div><div class="share-grid"><section class="panel share-card"><div class="success-mark">${icon('check')}</div><h2>${e(state.published.settings.title)}</h2><p class="muted">${state.published.items.length}地点の地図を、リンクから開けます。<br>閲覧者が元の表にアクセスする必要はありません。</p><label>地図の共有リンク<textarea id="share-url" readonly aria-label="地図の共有リンク">${e(state.shareUrl)}</textarea></label><div class="share-actions"><button class="button" data-action="copy-link">${icon('copy')}リンクをコピー</button><a class="button outline" id="open-shared" href="${e(state.shareUrl)}" target="_blank" rel="noopener">${icon('external-link')}地図を開く</a></div><p class="note">${local ? '現在はローカル環境です。このURLを他の端末に送っても開けません。GitHub Pagesなどの公開先に配置した後、その公開先でリンクを発行してください。' : 'リンクには地図データが含まれています。リンクを知っている人は別のブラウザーでも閲覧できます。サーバーへの地図データの保存・発行後の無効化は行いません。'}</p><div class="download-row"><span>編集を続けるために</span><button class="button small soft" data-action="export-project">${icon('download')}地図ファイルを保存</button></div><p class="muted" style="font-size:10px;margin-top:10px">下書き・元の列対応も含む編集用ファイルです。保管・移行に利用できます。</p></section>${previewMarkup()}</div>`;
  viewer = new MapView($('preview-stage'), state.published.items, state.published.settings, { mobile: state.device === 'mobile' });
  footer(`<button class="button outline" data-action="back-editor">${icon('pencil')}地図の編集を続ける</button>`, `${icon('check')}編集しても発行済みのリンクは変わりません`);
}
function download(name, data, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportProject() {
  if (!state.table) { toast('表を取り込んでから保存してください。'); return; }
  const project = { format: 'machi-project', version: 1, id: state.id, settings: state.settings, points: state.points, table: state.table, source: state.source, excluded: state.excluded, published: state.published };
  download(`${(state.settings.title || 'machi-map').replace(/[<>:"/\\|?*]/g, '_')}.machi.json`, JSON.stringify(project, null, 2));
  toast('編集用の地図ファイルを保存しました。');
}
function loadProject(project, importedFile = false) {
  if (project.version !== 1 || !Array.isArray(project.table?.headers) || !Array.isArray(project.table?.rows) || project.table.rows.length > 1200 || project.table.headers.length > 50) throw new Error('この地図ファイルを読み取れません。');
  const headers = project.table.headers.map(value => String(value).slice(0, 1000));
  const table = { headers, rows: project.table.rows.map(row => { if (!Array.isArray(row)) throw new Error('表の形式が正しくありません。'); return headers.map((_, index) => String(row[index] ?? '').slice(0, 4000)); }), headerRow: Math.max(1, Number(project.table.headerRow) || 1), mapping: Object.fromEntries(FIELDS.map(field => [field.key, Number.isInteger(project.table.mapping?.[field.key]) ? project.table.mapping[field.key] : -1])) };
  const result = validateTable(table);
  if (result.total > 1000) throw new Error('1,000地点までの地図ファイルに対応しています。');
  const next = defaultState();
  next.table = table; next.points = result.valid; next.excluded = project.excluded === true;
  next.settings = publicSnapshot(result.valid.length ? result.valid : [{ name: '設定', lat: 0, lon: 0 }], project.settings).settings;
  next.source = { kind: ['file', 'google', 'paste', 'sample'].includes(project.source?.kind) ? project.source.kind : 'file', name: String(project.source?.name || '地図ファイル'), sheet: String(project.source?.sheet || ''), readAt: Number.isFinite(Date.parse(project.source?.readAt)) ? project.source.readAt : new Date().toISOString() };
  if (next.source.kind === 'google' && project.source?.url) { next.source.url = String(project.source.url); next.sheetUrl = next.source.url; }
  if (!importedFile && typeof project.id === 'string') next.id = project.id;
  if (project.published?.items?.length) next.published = publicSnapshot(project.published.items, project.published.settings);
  next.stage = result.missing.length || result.duplicatedColumns || !result.valid.length || (result.invalid.length && !next.excluded) ? 'import' : 'editor';
  state = next; document.documentElement.style.setProperty('--accent', state.settings.accent); $('saved-dialog').close(); render(); writeProject(); focusMain(); toast('地図の下書きを開きました。');
}
function openSaved() {
  const projects = getProjects();
  $('saved-list').innerHTML = projects.length ? projects.map(project => `<div class="saved-card"><div><h3>${e(project.settings?.title || '名称未設定')}</h3><p>${project.points?.length || 0}地点 ／ ${e(new Date(project.updatedAt).toLocaleString('ja-JP'))}</p></div><button class="button small soft" data-action="load-project" data-id="${e(project.id)}">開く${icon('arrow-right')}</button></div>`).join('') : '<p class="empty-results">保存した地図はまだありません。<br>表を取り込むと、このブラウザーに下書きを保存します。</p>';
  icons(); $('saved-dialog').showModal();
}
function pinIcon(color) {
  const symbol = window.lucide?.icons?.MapPin;
  const svg = symbol ? lucide.createElement(symbol).outerHTML : '';
  return L.divIcon({ className: 'map-pin', html: `<span class="pin-bubble" style="--pin:${color}">${svg}</span>`, iconSize: [34, 34], iconAnchor: [17, 34], tooltipAnchor: [0, -36] });
}

class MapView {
  constructor(parent, points, settings, { mobile = false, publicView = false } = {}) {
    this.parent = parent; this.query = ''; this.category = ''; this.selected = null; this.markers = new Map(); this.publicView = publicView;
    this.root = document.createElement('section'); this.root.className = `viewer ${mobile ? 'is-mobile' : ''} ${publicView ? 'public-view' : ''}`;
    this.root.setAttribute('aria-label', '地図プレビュー');
    this.root.innerHTML = `<header class="viewer-header"><div><h2></h2><p></p></div><a class="viewer-brand" href="./" target="_blank" rel="noopener" title="machiで地図をつくる">machi.</a></header><div class="viewer-workspace"><aside class="places" aria-label="スポット検索と一覧"><div class="place-search"><div class="search-input">${icon('search')}<input type="search" aria-label="スポットを検索" placeholder="名前・住所で検索"></div><div class="category-chips" role="group" aria-label="カテゴリで絞り込む"></div></div><div class="places-count"></div><div class="places-list"></div></aside><div class="map-area"><div class="map-canvas" aria-label="スポットの地図"></div><div class="map-tools"><button data-map="fit" aria-label="全スポットを表示" title="全スポットを表示">${icon('scan')}</button><button data-map="zoom-in" aria-label="地図を拡大">${icon('plus')}</button><button data-map="zoom-out" aria-label="地図を縮小">${icon('minus')}</button><button data-map="locate" aria-label="現在地を表示" title="現在地を表示">${icon('locate-fixed')}</button></div><div class="map-notice" role="status" hidden></div><aside class="spot-detail" aria-label="選択したスポットの詳細" hidden></aside><button class="mobile-list-button" data-map="list">${icon('list')}スポット一覧</button></div></div>`;
    parent.append(this.root);
    this.map = L.map(this.root.querySelector('.map-canvas'), { zoomControl: false, center: [35.979, 140.15], zoom: 13, maxZoom: 19, zoomAnimation: !reduced.matches, fadeAnimation: !reduced.matches });
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(this.map);
    let failures = 0;
    tiles.on('tileerror', () => { if (++failures > 2) this.notice('背景地図を取得できません。一覧・検索は利用できます。'); });
    tiles.on('load', () => { if (failures === 0) this.notice(''); });
    this.cluster = L.markerClusterGroup ? L.markerClusterGroup({ showCoverageOnHover: false, animate: !reduced.matches, maxClusterRadius: 42, iconCreateFunction: cluster => L.divIcon({ className: 'map-cluster', html: String(cluster.getChildCount()), iconSize: [35, 35] }) }).addTo(this.map) : L.layerGroup().addTo(this.map);
    this.root.querySelector('input[type=search]').addEventListener('input', event => { this.query = event.target.value; this.renderPlaces(); this.syncMarkers(); });
    this.root.addEventListener('click', event => {
      const category = event.target.closest('[data-filter]');
      if (category) { this.category = category.dataset.filter; this.renderChips(); this.renderPlaces(); this.syncMarkers(); return; }
      const place = event.target.closest('[data-point]');
      if (place) { this.select(place.dataset.point); return; }
      const action = event.target.closest('[data-map]')?.dataset.map;
      if (action === 'fit') this.fit();
      if (action === 'zoom-in') this.map.zoomIn();
      if (action === 'zoom-out') this.map.zoomOut();
      if (action === 'close') this.closeDetail();
      if (action === 'list') { const panel = this.root.querySelector('.places'); panel.classList.toggle('list-open'); this.root.querySelector('[data-map=list]').setAttribute('aria-expanded', panel.classList.contains('list-open')); }
      if (action === 'locate') this.locate();
    });
    this.root.addEventListener('keydown', event => { if (event.key === 'Escape') { this.closeDetail(); this.root.querySelector('.places').classList.remove('list-open'); } });
    this.map.on('moveend', () => this.emphasize());
    this.resize = new ResizeObserver(() => { this.map.invalidateSize({ pan: false }); }); this.resize.observe(this.root);
    this.motionChanged = () => { this.map.stop(); this.map.options.zoomAnimation = !reduced.matches; this.map.options.fadeAnimation = !reduced.matches; this.cluster.options.animate = !reduced.matches; if (reduced.matches) this.root.getAnimations({ subtree: true }).forEach(animation => animation.cancel()); };
    reduced.addEventListener('change', this.motionChanged);
    this.update(points, settings, true); icons();
  }
  setMobile(mobile) { this.root.classList.toggle('is-mobile', mobile); this.map.invalidateSize({ pan: false }); if (this.selected) this.positionSelected(); }
  update(points, inputSettings, first = false) {
    const snapshot = publicSnapshot(points, inputSettings);
    this.points = snapshot.items; this.settings = snapshot.settings;
    this.root.style.setProperty('--map-accent', this.settings.accent);
    this.root.querySelector('.viewer-header h2').textContent = this.settings.title;
    this.root.querySelector('.viewer-header p').textContent = this.settings.description;
    this.root.querySelector('.viewer-header p').hidden = !this.settings.description;
    this.root.querySelector('.search-input').hidden = !this.settings.search;
    if (!this.settings.search) { this.query = ''; this.root.querySelector('input[type=search]').value = ''; }
    if (!this.settings.filters) this.category = '';
    this.root.querySelector('.map-canvas').classList.toggle('quiet', this.settings.basemap === 'quiet');
    this.renderChips(); this.renderPlaces(); this.syncMarkers();
    if (this.selected) this.renderDetail();
    if (first) requestAnimationFrame(() => this.fit());
    icons();
  }
  visible() { return filterPoints(this.points, this.query, this.category); }
  notice(message) { const element = this.root.querySelector('.map-notice'); element.textContent = message; element.hidden = !message; }
  renderChips() {
    const categories = categoriesOf(this.points);
    const chips = this.root.querySelector('.category-chips');
    chips.hidden = !this.settings.filters || (categories.length === 1 && categories[0] === '未分類');
    chips.innerHTML = ['', ...categories].map(category => `<button data-filter="${e(category)}" class="${this.category === category ? 'active' : ''}" aria-pressed="${this.category === category}">${category ? `<span class="chip-dot" style="--chip:${colorOf(category, this.settings, this.points)}"></span>` : ''}${e(category || 'すべて')}</button>`).join('');
  }
  renderPlaces() {
    const points = this.visible();
    this.root.querySelector('.places-count').innerHTML = `<span><b>${points.length}</b> / ${this.points.length} スポット</span>${this.query || this.category ? '<button class="text-button" data-map="clear" style="font-size:9px">解除</button>' : ''}`;
    const clear = this.root.querySelector('[data-map=clear]'); if (clear) clear.onclick = () => { this.query = ''; this.category = ''; this.root.querySelector('input[type=search]').value = ''; this.renderChips(); this.renderPlaces(); this.syncMarkers(); };
    this.root.querySelector('.places-list').innerHTML = points.length ? points.map(point => `<button class="place-row ${point.id === this.selected ? 'selected' : ''}" data-point="${e(point.id)}" aria-label="${e(point.name)}の詳細を表示" aria-pressed="${point.id === this.selected}" style="--pin:${colorOf(point.category, this.settings, this.points)}">${this.settings.photos && point.image ? `<img class="place-photo" src="${e(point.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="place-symbol">${icon('map-pin')}</span>`}<span class="place-copy">${point.category ? `<small>${e(point.category)}</small>` : ''}<strong>${e(point.name)}</strong>${point.location ? `<p>${e(point.location)}</p>` : ''}</span>${icon('chevron-right')}</button>`).join('') : '<p class="empty-results">スポットが見つかりません。<br>検索やカテゴリを変えてください。</p>';
    this.root.querySelectorAll('.place-photo').forEach(image => image.addEventListener('error', () => { image.hidden = true; }, { once: true }));
    icons();
    if (this.selected && !points.some(point => point.id === this.selected)) { this.selected = null; this.root.querySelector('.spot-detail').hidden = true; }
  }
  syncMarkers() {
    const visible = new Set(this.visible().map(point => point.id));
    const all = new Set(this.points.map(point => point.id));
    for (const [id, marker] of this.markers) if (!all.has(id)) { this.cluster.removeLayer(marker); marker.remove(); this.markers.delete(id); }
    for (const point of this.points) {
      const color = colorOf(point.category, this.settings, this.points);
      let marker = this.markers.get(point.id);
      if (!marker) { marker = L.marker([point.lat, point.lon], { icon: pinIcon(color), title: point.name, alt: point.name, riseOnHover: true }); marker.on('click', () => this.select(point.id)); this.markers.set(point.id, marker); }
      if (!marker.getLatLng().equals([point.lat, point.lon])) { this.cluster.removeLayer(marker); marker.setLatLng([point.lat, point.lon]); }
      if (marker.machiColor !== color) { marker.setIcon(pinIcon(color)); marker.machiColor = color; }
      const selected = point.id === this.selected;
      if (marker.machiName !== point.name || marker.machiSelected !== selected) {
        marker.unbindTooltip(); marker.bindTooltip(document.createTextNode(point.name), { permanent: selected, direction: 'top', className: 'map-label' });
        marker.machiName = point.name; marker.machiSelected = selected;
      }
      if (!visible.has(point.id)) { this.cluster.removeLayer(marker); marker.remove(); continue; }
      if (selected) { this.cluster.removeLayer(marker); if (!this.map.hasLayer(marker)) marker.addTo(this.map); }
      else if (!this.cluster.hasLayer(marker)) { marker.remove(); this.cluster.addLayer(marker); }
      marker.setZIndexOffset(selected ? 2000 : 0); marker.getElement()?.classList.toggle('selected', selected);
    }
  }
  select(id) {
    if (!this.points.some(point => point.id === id)) return;
    this.markers.get(this.selected)?.getElement()?.querySelector('.pin-bubble')?.getAnimations().forEach(animation => animation.cancel());
    const previous = this.selected; this.selected = id;
    this.root.querySelector('.places').classList.remove('list-open');
    this.root.querySelectorAll('.place-row').forEach(row => { const selected = row.dataset.point === id; row.classList.toggle('selected', selected); row.setAttribute('aria-pressed', selected); });
    this.renderDetail(); this.syncMarkers();
    const detail = this.root.querySelector('.spot-detail');
    detail.getAnimations().forEach(animation => animation.cancel());
    if (!reduced.matches && previous !== id) detail.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 220, easing: 'cubic-bezier(.33,1,.68,1)' });
    this.positionSelected();
    announce(`${this.points.find(point => point.id === id).name}の詳細を表示しました。`);
  }
  positionSelected() {
    const point = this.points.find(point => point.id === this.selected); if (!point) return;
    const zoom = Math.max(15, this.map.getZoom()); let center = L.latLng(point.lat, point.lon);
    if (this.root.classList.contains('is-mobile')) {
      const detail = this.root.querySelector('.spot-detail');
      const available = detail.getBoundingClientRect().top - this.root.querySelector('.map-area').getBoundingClientRect().top;
      const targetY = Math.max(45, Math.min(available / 2, available - 25));
      center = this.map.unproject(this.map.project(center, zoom).add([0, this.map.getSize().y / 2 - targetY]), zoom);
    } else {
      const available = this.root.querySelector('.spot-detail').getBoundingClientRect().left - this.root.querySelector('.map-area').getBoundingClientRect().left;
      const targetX = Math.max(45, available / 2);
      center = this.map.unproject(this.map.project(center, zoom).add([this.map.getSize().x / 2 - targetX, 0]), zoom);
    }
    this.pendingEmphasis = false; this.map.stop(); this.pendingEmphasis = true;
    let moving = false; const started = () => { moving = true; };
    this.map.once('movestart', started); this.map.setView(center, zoom, { animate: !reduced.matches }); this.map.off('movestart', started);
    if (!moving) this.emphasize();
  }
  emphasize() {
    if (!this.pendingEmphasis) return; this.pendingEmphasis = false;
    const inner = this.markers.get(this.selected)?.getElement()?.querySelector('.pin-bubble');
    if (inner && !reduced.matches) { inner.getAnimations().forEach(animation => animation.cancel()); inner.animate([{ scale: .92 }, { scale: 1.12, offset: .6 }, { scale: 1 }], { duration: 280, easing: 'ease-out' }); }
  }
  renderDetail() {
    const point = this.points.find(point => point.id === this.selected); const element = this.root.querySelector('.spot-detail');
    if (!point) { element.hidden = true; return; }
    element.style.setProperty('--pin', colorOf(point.category, this.settings, this.points));
    element.innerHTML = `<button class="icon-button detail-close" data-map="close" aria-label="スポット詳細を閉じる">${icon('x')}</button>${this.settings.photos && point.image ? `<img class="detail-image" src="${e(point.image)}" alt="${e(point.name)}" referrerpolicy="no-referrer">` : ''}${point.category ? `<p class="detail-category">${e(point.category)}</p>` : ''}<h3>${e(point.name)}</h3>${point.location ? `<p class="detail-location">${icon('map-pin')}${e(point.location)}</p>` : ''}${point.description ? `<p class="detail-description">${e(point.description)}</p>` : ''}${point.time || point.closed ? `<dl class="detail-facts">${point.time ? `<dt>営業時間</dt><dd>${e(point.time)}</dd>` : ''}${point.closed ? `<dt>定休日</dt><dd>${e(point.closed)}</dd>` : ''}</dl>` : ''}${point.sourceUrl ? `<a class="detail-link" href="${e(point.sourceUrl)}" target="_blank" rel="noopener noreferrer">${icon('external-link')}Webサイトを見る</a>` : ''}<a class="detail-link" href="https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lon}#map=17/${point.lat}/${point.lon}" target="_blank" rel="noopener noreferrer">${icon('navigation')}地図アプリで開く</a>`;
    element.hidden = false;
    element.querySelector('.detail-image')?.addEventListener('error', event => { event.target.hidden = true; }, { once: true }); icons();
  }
  closeDetail() {
    if (!this.selected) return;
    this.root.querySelector('.spot-detail').getAnimations().forEach(animation => animation.cancel());
    this.markers.get(this.selected)?.getElement()?.querySelector('.pin-bubble')?.getAnimations().forEach(animation => animation.cancel());
    const previous = this.selected; this.selected = null; this.pendingEmphasis = false;
    this.root.querySelector('.spot-detail').hidden = true;
    this.root.querySelectorAll('.place-row').forEach(row => { row.classList.remove('selected'); row.setAttribute('aria-pressed', 'false'); }); this.syncMarkers();
    const row = [...this.root.querySelectorAll('.place-row')].find(element => element.dataset.point === previous);
    if (row && !this.root.classList.contains('is-mobile')) row.focus({ preventScroll: true });
  }
  fit() { const points = this.visible(); if (points.length) this.map.fitBounds(points.map(point => [point.lat, point.lon]), { padding: [45, 45], maxZoom: 15, animate: !reduced.matches }); }
  locate() {
    if (!navigator.geolocation) { this.notice('このブラウザーは現在地に対応していません。'); return; }
    this.notice('現在地を確認しています…');
    navigator.geolocation.getCurrentPosition(position => { this.userMarker?.remove(); this.userMarker = L.circleMarker([position.coords.latitude, position.coords.longitude], { radius: 7, color: '#fff', weight: 3, fillColor: '#5b83bf', fillOpacity: 1 }).addTo(this.map); this.map.setView(this.userMarker.getLatLng(), 15, { animate: !reduced.matches }); this.notice('現在地を表示しました。位置情報は保存しません。'); }, () => this.notice('現在地を取得できません。地図と検索は引き続き利用できます。'), { timeout: 10000, enableHighAccuracy: false });
  }
  destroy() { this.resize.disconnect(); reduced.removeEventListener('change', this.motionChanged); this.map.remove(); this.root.remove(); }
}

document.addEventListener('click', async event => {
  const close = event.target.closest('[data-close]'); if (close) { $(close.dataset.close).close(); return; }
  const element = event.target.closest('[data-action]'); if (!element || element.disabled) return;
  const action = element.dataset.action;
  if (action === 'source-tab') { state.tab = element.dataset.tab; state.error = ''; render(); $(`tab-${state.tab}`).focus(); }
  if (action === 'choose-file') $('file-input').click();
  if (action === 'sample') loadSample();
  if (action === 'read-google') readGoogle();
  if (action === 'google-help') $('help-dialog').showModal();
  if (action === 'read-paste') { try { if (!state.paste.trim()) throw new Error('見出しを含めた表のセルを貼り付けてください。'); state.workbook = null; imported(csvGrid(state.paste), { kind: 'paste', name: '貼り付けた表', readAt: new Date().toISOString() }); } catch (error) { state.error = error.message; render(); } }
  if (action === 'clear-import') { state.table = null; state.workbook = null; state.error = ''; render(); }
  if (action === 'generate') generate();
  if (action === 'settings-tab') { state.settingsTab = element.dataset.tab; renderSettings(); document.querySelectorAll('.editor-tabs button').forEach(button => { button.classList.toggle('active', button.dataset.tab === state.settingsTab); button.setAttribute('aria-selected', button.dataset.tab === state.settingsTab); }); }
  if (action === 'device') { state.device = element.dataset.device; viewer?.setMobile(state.device === 'mobile'); document.querySelectorAll('.device-switch button').forEach(button => { button.classList.toggle('active', button.dataset.device === state.device); button.setAttribute('aria-pressed', button.dataset.device === state.device); }); }
  if (action === 'accent') { remember(); state.settings.accent = element.dataset.color; document.documentElement.style.setProperty('--accent', state.settings.accent); updateSettings(); renderSettings(); }
  if (action === 'undo' && state.history.length) { state.settings = state.history.pop(); document.documentElement.style.setProperty('--accent', state.settings.accent); updateSettings(); renderSettings(); }
  if (action === 'back-import') { state.stage = 'import'; state.error = ''; render(); focusMain(); }
  if (action === 'refresh-google') { state.sheetUrl = state.source.url; state.tab = 'google'; state.stage = 'import'; readGoogle(); }
  if (action === 'review') enterReview();
  if (action === 'back-editor') { state.stage = 'editor'; render(); focusMain(); writeProject(); }
  if (action === 'publish') publish();
  if (action === 'copy-link') { try { await navigator.clipboard.writeText(state.shareUrl); toast('共有リンクをコピーしました。'); } catch { $('share-url').focus(); $('share-url').select(); toast('URLを選択しました。コピーして共有してください。'); } }
  if (action === 'export-project') exportProject();
  if (action === 'load-project') { try { const project = getProjects().find(item => item.id === element.dataset.id); if (project) loadProject(project); } catch (error) { toast(error.message); } }
});
document.addEventListener('focusin', event => { if (event.target.matches('input[data-setting],textarea[data-setting],input[data-category-color]')) remember(); });
document.addEventListener('keydown', event => {
  if (!event.target.matches('[role=tab]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...event.target.closest('[role=tablist]').querySelectorAll('[role=tab]')];
  const index = tabs.indexOf(event.target);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  event.preventDefault(); tabs[next].focus(); tabs[next].click();
});
document.addEventListener('input', event => {
  const target = event.target;
  if (target.id === 'sheet-url') state.sheetUrl = target.value;
  if (target.id === 'paste-data') state.paste = target.value;
  if (target.matches('input[data-setting],textarea[data-setting]')) { state.settings[target.dataset.setting] = target.value; updateSettings(); }
  if (target.dataset.categoryColor) { Object.defineProperty(state.settings.colors, target.dataset.categoryColor, { value: target.value, enumerable: true, configurable: true, writable: true }); updateSettings(); }
});
document.addEventListener('change', event => {
  const target = event.target;
  if (target.dataset.mapping) { state.table.mapping[target.dataset.mapping] = Number(target.value); state.excluded = false; updateImportValidation(); queueSave(); }
  if (target.id === 'exclude-invalid') { state.excluded = target.checked; updateImportValidation(); queueSave(); }
  if (target.id === 'workbook-sheet') { state.sheet = target.value; imported(XLSX.utils.sheet_to_json(state.workbook.Sheets[state.sheet], { header: 1, defval: '', raw: false, blankrows: true }), { ...state.source, sheet: state.sheet }); }
  if (target.dataset.toggle) { remember(); state.settings[target.dataset.toggle] = target.checked; updateSettings(); }
  if (target.matches('select[data-setting]')) { remember(); state.settings[target.dataset.setting] = target.value; updateSettings(); }
  if (target.dataset.publicField) { remember(); state.settings.publicFields = target.checked ? [...state.settings.publicFields, target.dataset.publicField] : state.settings.publicFields.filter(key => key !== target.dataset.publicField); updateSettings(); }
  if (target.id === 'review-content' || target.id === 'review-public') { state.reviewContent = $('review-content').checked; state.reviewPublic = $('review-public').checked; $('publish-button').disabled = !state.reviewContent || !state.reviewPublic; }
});
$('saved-button').addEventListener('click', openSaved);
$('new-button').addEventListener('click', () => { if (!writeProject()) { toast('下書きを保存できません。地図ファイルを保存してから切り替えてください。'); return; } state = defaultState(); document.documentElement.style.removeProperty('--accent'); render(); focusMain(); });
window.addEventListener('beforeunload', () => { if (state.table) writeProject(); });
async function openPublic() {
  const encoded = new URLSearchParams(location.hash.slice(1)).get('map');
  if (!encoded) { render(); return; }
  document.body.classList.add('public-mode');
  const root = document.createElement('div'); root.className = 'public-view'; document.body.append(root);
  root.id = 'public-map'; root.tabIndex = -1; document.querySelector('.skip-link').href = '#public-map';
  root.innerHTML = '<p class="fatal" role="status">共有された地図を読み込んでいます…</p>';
  try {
    const snapshot = await decodeShare(encoded);
    root.replaceChildren(); document.title = `${snapshot.settings.title} — machi`;
    viewer = new MapView(root, snapshot.items, snapshot.settings, { mobile: matchMedia('(max-width:700px)').matches, publicView: true });
    viewer.root.setAttribute('aria-label', snapshot.settings.title);
    const media = matchMedia('(max-width:700px)'); media.addEventListener('change', event => viewer?.setMobile(event.matches));
  } catch (error) { root.innerHTML = `<div class="fatal"><h1>地図を開けませんでした</h1><p>${e(error.message)}</p><a href="./">地図作成画面へ戻る</a></div>`; }
}
if (!window.L || !window.XLSX) $('main').innerHTML = '<div class="fatal">必要なライブラリを読み込めませんでした。ページを再読み込みしてください。</div>';
else openPublic();
