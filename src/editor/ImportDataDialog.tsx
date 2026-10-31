import { useEffect, useMemo, useRef, useState } from 'react';
import { FIELDS, readGoogleSheet, tableFromGrid, validateTable, worksheetGrid, type Table } from '../data/table.mjs';
import type { Design } from './model';
import { importTableDesign } from './dataImport';
import { publicColumns } from './runtime';

type Workbook = { SheetNames: string[]; Sheets: Record<string, unknown> };
type SheetJS = { read: (data: ArrayBuffer | string, options: Record<string, unknown>) => Workbook; utils: { decode_range: (ref: string) => { s: { r: number; c: number }; e: { r: number; c: number } }; sheet_to_json: (sheet: unknown, options: Record<string, unknown>) => unknown[][] } };
declare global { interface Window { XLSX?: SheetJS } }
let sheetLoader: Promise<SheetJS> | null = null;
function loadSheetJS(): Promise<SheetJS> {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!sheetLoader) sheetLoader = new Promise<SheetJS>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('../vendor/xlsx.full.min.js', import.meta.url).href;
    script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error('表の読み込み機能を起動できません'));
    script.onerror = () => { script.remove(); reject(new Error('表の読み込み機能を取得できません。通信を確認してください')); };
    document.head.append(script);
  }).catch(error => { sheetLoader = null; throw error; });
  return sheetLoader;
}

export function ImportDataDialog({ design, onApply, onClose, onSample, onDirtyChange }: {
  design: Design; onApply: (next: Design) => void; onClose: () => void;
  onSample: () => void; onDirtyChange: (dirty: boolean) => void;
}) {
  const requestId = useRef(0);
  const [kind, setKind] = useState<'file' | 'paste' | 'google'>('file');
  const [sourceExpanded, setSourceExpanded] = useState(true);
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [sheet, setSheet] = useState('');
  const [grid, setGrid] = useState<unknown[][]>([]);
  const [table, setTable] = useState<Table | null>(null);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [published, setPublished] = useState(['name', 'lat', 'lon', 'category', 'description', 'location', 'image', 'time', 'closed', 'sourceUrl']);
  const [exclude, setExclude] = useState(false);
  const [paste, setPaste] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [source, setSource] = useState({ kind: 'file', label: '', url: '' });
  const [page, setPage] = useState(0);
  const checked = useMemo(() => table ? validateTable(table, mapping) : null, [table, mapping]);
  const dataset = design.datasets[0];
  useEffect(() => { onDirtyChange(Boolean(table || paste.trim() || url.trim() || busy)); }, [table, paste, url, busy, onDirtyChange]);
  useEffect(() => () => { requestId.current++; }, []);
  const useGrid = (next: unknown[][], headerIndex?: number) => {
    const parsed = tableFromGrid(next, headerIndex);
    setGrid(next); setTable(parsed); setMapping(parsed.mapping); setExclude(false); setPage(0);
  };
  const chooseSheet = async (book: Workbook, name: string) => {
    const xlsx = await loadSheetJS();
    setSheet(name); setTable(null); setExclude(false);
    useGrid(worksheetGrid(book.Sheets[name], xlsx.utils));
  };
  const read = async (sourceKind: 'file' | 'paste' | 'google', file?: File) => {
    const id = ++requestId.current;
    setBusy(true); setError(''); setTable(null); setExclude(false); setWorkbook(null);
    try {
      const xlsx = await loadSheetJS();
      let book: Workbook;
      let nextSource = { kind: 'file', label: '貼り付けた表', url: '' };
      if (sourceKind === 'file') {
        if (!file || !/\.(xlsx?|csv|tsv)$/i.test(file.name)) throw new Error('Excel・CSV・TSVファイルを選んでください');
        if (file.size > 8 * 1024 * 1024) throw new Error('8MB以内のファイルを選んでください');
        book = xlsx.read(await file.arrayBuffer(), { type: 'array', raw: false });
        nextSource.label = file.name;
      } else {
        if (sourceKind === 'paste' && paste.length > 8 * 1024 * 1024) throw new Error('貼り付ける表は8MB以内にしてください');
        const response = sourceKind === 'google' ? await readGoogleSheet(url) : null;
        book = xlsx.read(response ? response.text : paste, { type: 'string', raw: true });
        if (response) nextSource = { kind: 'google-sheet', label: 'Googleスプレッドシート', url: response.source.original };
      }
      if (id !== requestId.current) return;
      const name = book.SheetNames[0];
      if (!name) throw new Error('シートがありません');
      setWorkbook(book); setSource(nextSource);
      await chooseSheet(book, name);
      if (id === requestId.current) setSourceExpanded(false);
    } catch (reason) { if (id === requestId.current) setError(reason instanceof Error ? reason.message : '表を読み込めませんでした'); }
    finally { if (id === requestId.current) setBusy(false); }
  };
  const apply = () => {
    if (!table || !checked || checked.missing.length || checked.duplicatedColumns || !checked.valid.length || (checked.invalid.length > 0 && !exclude)) return;
    try { onApply(importTableDesign(design, table, mapping, published.filter(key => (mapping[key] ?? -1) >= 0), source)); } catch (reason) { setError(reason instanceof Error ? reason.message : '取り込みに失敗しました'); }
  };
  const blocked = busy || !checked || checked.missing.length > 0 || checked.duplicatedColumns || !checked.valid.length || (checked.invalid.length > 0 && !exclude);
  return <div className="data-step-content">
    <h2>データを準備する</h2>
    <p className="workflow-intro">表を読み込み、地図に使う項目と掲載する内容を確認します。</p>
    <section className="workflow-card import-workspace" aria-label="データの取り込み">
      <div className="source-tabs" role="group" aria-label="取り込み方法">
        {([['file','ファイル'],['google','Google Sheets'],['paste','貼り付け']] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={kind === value} onClick={() => { if (value === kind) return; if (table && !window.confirm('未適用の表を破棄して取り込み方法を変更しますか？')) return; setTable(null); setWorkbook(null); setExclude(false); setError(''); setSourceExpanded(true); setKind(value); }}>{label}</button>)}
      </div>
      {table && !sourceExpanded && <button type="button" className="source-change" onClick={() => setSourceExpanded(true)}>取り込み元を変更・再読み込み</button>}
      {sourceExpanded && <div className="source-input">
        {kind === 'file' && <label className="setting-field import-drop" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy) void read('file', event.dataTransfer.files[0]); }}><span className="import-drop-title">ファイルを選択、またはここにドロップ</span><span className="import-drop-hint">Excel・CSV・TSV ／ 最大8MB・1,000行</span><input type="file" accept=".xlsx,.xls,.csv,.tsv" disabled={busy} onChange={event => { if (event.target.files?.[0]) void read('file', event.target.files[0]); event.target.value = ''; }} /></label>}
        {kind === 'paste' && <div><label className="setting-field">CSVまたはタブ区切りの表<textarea aria-label="取り込む表" rows={3} value={paste} onChange={event => { setPaste(event.target.value); setTable(null); setWorkbook(null); setExclude(false); }} /></label><button type="button" disabled={busy || !paste.trim()} onClick={() => void read('paste')}>貼り付けた表を読む</button></div>}
        {kind === 'google' && <div><label className="setting-field">公開GoogleスプレッドシートのURL<input value={url} onChange={event => { setUrl(event.target.value); setTable(null); setWorkbook(null); setExclude(false); }} /></label><p className="workflow-hint">公開された1シートを読み込みます。自動同期は行いません。</p><button type="button" disabled={busy || !url.trim()} onClick={() => void read('google')}>URLから読む</button></div>}
      </div>}
      {busy && <p role="status">表を読み込んでいます…</p>}
      {error && <p role="alert" className="import-error">{error}</p>}
      {workbook && <div className="source-meta"><strong>{source.label}</strong><label>シート<select value={sheet} disabled={busy} onChange={event => { setError(''); void chooseSheet(workbook, event.target.value).catch(reason => { setTable(null); setError(reason instanceof Error ? reason.message : 'シートを読み込めませんでした'); }); }}>{workbook.SheetNames.map(name => <option key={name}>{name}</option>)}</select></label>{table && <label>見出しの行<input type="number" min={1} max={grid.length} value={table.headerRow} onChange={event => { const row = event.target.valueAsNumber; if (!Number.isInteger(row) || row < 1 || row > grid.length) return; try { useGrid(grid, row - 1); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : '見出しを設定できませんでした'); } }} /></label>}</div>}
      {table && checked ? <>
        <section aria-label="読み取った表"><h3>取り込んだデータ</h3><div className="table-scroll"><table><thead><tr><th>元の行</th>{table.headers.map((header, i) => <th key={i}>{header}</th>)}<th>状態</th></tr></thead><tbody>{table.rows.slice(page * 50, page * 50 + 50).map((row, index) => {
          const rowNumber = table.headerRow + page * 50 + index + 1;
          const invalid = checked.invalid.find(item => item.row === rowNumber);
          const invalidColumns = new Set([['地点名', 'name'], ['緯度', 'lat'], ['経度', 'lon']].filter(([label]) => invalid?.reasons.some(reason => reason.includes(label))).map(([, key]) => mapping[key]));
          return <tr key={rowNumber} className={invalid ? 'invalid-row' : ''}><th scope="row">{rowNumber}</th>{row.map((value, i) => <td key={i} className={invalidColumns.has(i) ? 'invalid-cell' : undefined}>{value || <span className="empty-cell">空欄</span>}{invalidColumns.has(i) && <span className="field-warning">要確認</span>}</td>)}<td>{invalid ? '要確認' : row.some(value => value.trim()) ? '有効' : '空行'}</td></tr>;
        })}</tbody></table></div><div className="table-pages"><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>前の50行</button><span>{page + 1} / {Math.max(1, Math.ceil(table.rows.length / 50))}</span><button type="button" disabled={(page + 1) * 50 >= table.rows.length} onClick={() => setPage(page + 1)}>次の50行</button></div></section>
        {checked.invalid.length > 0 && <div className="import-error" role="alert"><strong>確認が必要な行</strong><ul>{checked.invalid.map(row => <li key={row.row}>{row.row}行目・{row.name}：{row.reasons.join('、')}</li>)}</ul><p>元の表を修正して読み直すか、不正な行を除外してください。</p><label><input type="checkbox" checked={exclude} onChange={event => setExclude(event.target.checked)} /> 不正な{checked.invalid.length}行を除外して取り込む</label></div>}
        {checked.missing.length > 0 && <p className="import-error" role="alert">必須列を設定してください: {checked.missing.join('、')}</p>}
        {checked.duplicatedColumns && <p className="import-error" role="alert">同じ列を複数の項目へ割り当てています。</p>}
        {!checked.valid.length && <p className="import-error">有効な地点がありません。元の表または列の対応を確認してください。</p>}
        <fieldset className="field-picker"><legend>地図に使う項目の設定</legend><p className="workflow-hint">地点名・緯度・経度は必須です。公開しない列は内部列として保持します。</p><div className="mapping-grid">{FIELDS.filter(field => field.key !== 'id').map(field => {
          const locked = ['name', 'lat', 'lon', 'category'].includes(field.key);
          const assigned = (mapping[field.key] ?? -1) >= 0;
          return <div className="mapping-field" key={field.key}><label>{field.label}{field.required && <span className="required-label">必須</span>}<select aria-label={`${field.label}の列`} value={mapping[field.key] ?? -1} onChange={event => { setMapping(current => ({ ...current, [field.key]: Number(event.target.value) })); setExclude(false); }}><option value={-1}>使用しない</option>{table.headers.map((header, index) => <option key={index} value={index}>{index + 1}: {header}</option>)}</select></label><label className="publish-choice"><input type="checkbox" aria-label={`${field.label}を掲載`} disabled={locked || !assigned} checked={assigned && (locked || published.includes(field.key))} onChange={event => setPublished(current => event.target.checked ? [...current, field.key] : current.filter(key => key !== field.key))} />掲載</label></div>;
        })}</div></fieldset>
      </> : !busy && !error && <div className="data-empty">{dataset?.rows.length ? <><h3>現在のデータ：{dataset.name}</h3><p>掲載項目：{publicColumns(dataset).map(column => column.label || column.key).join('、')}</p><p>内部項目：{dataset.columns.filter(column => column.visibility !== 'public').map(column => column.label || column.key).join('、') || 'なし'}</p><p>変更する場合は表を読み直してください。</p><div className="table-scroll"><table><thead><tr><th>元の行</th>{dataset.columns.map(column => <th key={column.key}>{column.label || column.key}{column.visibility !== 'public' ? '（内部）' : ''}</th>)}</tr></thead><tbody>{dataset.rows.slice(page * 50, page * 50 + 50).map(row => <tr key={row.id}><th>{String(row.values.sourceRow ?? '記録なし')}</th>{dataset.columns.map(column => <td key={column.key}>{String(row.values[column.key] ?? '')}</td>)}</tr>)}</tbody></table></div><div className="table-pages"><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>前の50行</button><span>{page + 1} / {Math.max(1, Math.ceil(dataset.rows.length / 50))}</span><button type="button" disabled={(page + 1) * 50 >= dataset.rows.length} onClick={() => setPage(page + 1)}>次の50行</button></div></> : <><h3>データを選んで始めましょう</h3><p>表のプレビューと列の対応を確認してから、設計へ反映できます。</p><button type="button" onClick={onSample}>架空のサンプルを使う</button></>}</div>}
    </section>
    <div className="workflow-actions workflow-end"><button type="button" onClick={onClose}>{table || paste || url ? '取り込みをやめる' : dataset?.rows.length ? '編集に戻る' : 'データなしで設計する'}</button>{table && <button type="button" className="workflow-primary" disabled={blocked} onClick={apply}>このデータで設計へ進む</button>}</div>
  </div>;
}
