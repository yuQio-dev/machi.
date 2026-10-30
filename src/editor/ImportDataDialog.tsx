import { useEffect, useMemo, useRef, useState } from 'react';
import { FIELDS, readGoogleSheet, tableFromGrid, validateTable, worksheetGrid, type Table } from '../data/table.mjs';
import type { Design } from './model';
import { importTableDesign } from './dataImport';
import { IconButton } from './IconButton';

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

export function ImportDataDialog({ design, onApply, onClose }: { design: Design; onApply: (next: Design) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef(document.activeElement as HTMLElement | null);
  const requestId = useRef(0);
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
  const checked = useMemo(() => table ? validateTable(table, mapping) : null, [table, mapping]);
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => { requestId.current++; element.close(); trigger.current?.focus(); }; }, []);
  const useGrid = (next: unknown[][], headerIndex?: number) => {
    const parsed = tableFromGrid(next, headerIndex);
    setGrid(next); setTable(parsed); setMapping(parsed.mapping); setExclude(false);
  };
  const chooseSheet = async (book: Workbook, name: string) => {
    const xlsx = await loadSheetJS();
    setSheet(name);
    setTable(null);
    useGrid(worksheetGrid(book.Sheets[name], xlsx.utils));
  };
  const read = async (kind: 'file' | 'paste' | 'google', file?: File) => {
    const id = ++requestId.current;
    setBusy(true); setError(''); setTable(null); setExclude(false); setWorkbook(null);
    try {
      const xlsx = await loadSheetJS();
      let book: Workbook;
      let nextSource = { kind: 'file', label: '貼り付けた表', url: '' };
      if (kind === 'file') {
        if (!file || !/\.(xlsx?|csv|tsv)$/i.test(file.name)) throw new Error('Excel・CSV・TSVファイルを選んでください');
        if (file.size > 8 * 1024 * 1024) throw new Error('8MB以内のファイルを選んでください');
        book = xlsx.read(await file.arrayBuffer(), { type: 'array', raw: false });
        nextSource.label = file.name;
      } else {
        if (paste.length > 8 * 1024 * 1024 && kind === 'paste') throw new Error('貼り付ける表は8MB以内にしてください');
        const response = kind === 'google' ? await readGoogleSheet(url) : null;
        book = xlsx.read(response ? response.text : paste, { type: 'string', raw: true });
        if (response) nextSource = { kind: 'google-sheet', label: 'Googleスプレッドシート', url: response.source.original };
      }
      if (id !== requestId.current) return;
      const name = book.SheetNames[0];
      if (!name) throw new Error('シートがありません');
      setWorkbook(book); setSource(nextSource);
      await chooseSheet(book, name);
    } catch (reason) { if (id === requestId.current) setError(reason instanceof Error ? reason.message : '表を読み込めませんでした'); }
    finally { if (id === requestId.current) setBusy(false); }
  };
  const apply = () => {
    if (!table || !checked || checked.missing.length || checked.duplicatedColumns || !checked.valid.length || (checked.invalid.length > 0 && !exclude)) return;
    try { onApply(importTableDesign(design, table, mapping, published, source)); } catch (reason) { setError(reason instanceof Error ? reason.message : '取り込みに失敗しました'); }
  };
  return <dialog ref={dialog} className="data-import-dialog" aria-labelledby="import-data-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="import-heading"><div><span className="eyebrow">DATA IMPORT</span><h2 id="import-data-title">地点データを取り込む</h2></div><IconButton icon="close" label="取り込みを閉じる" onClick={onClose} /></div>
    <p className="hint">{design.datasets[0] ? `「${design.datasets[0].name || design.datasets[0].id}」の地点データを置き換えます。配置と動作設定は引き継ぎ、反映後もUndoで戻せます。` : '地点データを追加します。反映後もUndoで戻せます。'}</p>
    <div className="import-sources"><label className="setting-field">Excel・CSV・TSV<input type="file" accept=".xlsx,.xls,.csv,.tsv" disabled={busy} onChange={event => { void read('file', event.target.files?.[0]); event.target.value = ''; }} /></label>
      <details><summary>表を貼り付ける</summary><label className="setting-field">CSVまたはタブ区切りの表<textarea aria-label="取り込む表" rows={5} value={paste} onChange={event => setPaste(event.target.value)} /></label><IconButton icon="upload" label="貼り付けた表を読む" showLabel disabled={busy || !paste.trim()} hint={busy ? '読み込み中です' : !paste.trim() ? '表を貼り付けてください' : undefined} onClick={() => void read('paste')} /></details>
      <details><summary>公開Googleスプレッドシート</summary><p className="hint">対象シートを開いた共有URL（gid付き）またはウェブ公開URLを入力してください。URLからは1シートを読み込みます。取得できない場合はCSVまたはExcelをダウンロードして取り込めます。</p><label className="setting-field">共有URL<input value={url} onChange={event => setUrl(event.target.value)} /></label><IconButton icon="download" label="URLから読む" showLabel disabled={busy || !url.trim()} hint={busy ? '読み込み中です' : !url.trim() ? 'URLを入力してください' : undefined} onClick={() => void read('google')} /></details></div>
    {busy && <p role="status">表を読み込んでいます…</p>}{error && <p role="alert" className="import-error">{error}</p>}
    <div className="import-table-options">{workbook && <label className="setting-field">シート<select value={sheet} disabled={busy} onChange={event => { setError(''); void chooseSheet(workbook, event.target.value).catch(reason => { setTable(null); setError(reason instanceof Error ? reason.message : 'シートを読み込めませんでした'); }); }}>{workbook.SheetNames.map(name => <option key={name}>{name}</option>)}</select></label>}{table && <label className="setting-field">見出しの行<input type="number" min={1} max={grid.length} value={table.headerRow} onChange={event => { const row = event.target.valueAsNumber; if (!Number.isInteger(row) || row < 1 || row > grid.length) return; try { useGrid(grid, row - 1); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : '見出しを設定できませんでした'); } }} /></label>}</div>
    {table && checked && <>
      <fieldset className="field-picker"><legend>列の対応と掲載項目</legend>{FIELDS.filter(field => field.key !== 'id').map(field => {
        const locked = ['name', 'lat', 'lon', 'category'].includes(field.key);
        return <div className="import-mapping-row" key={field.key}><label>{field.label}{field.required ? '（必須）' : ''}<select aria-label={`${field.label}の列`} value={mapping[field.key] ?? -1} onChange={event => { setMapping(current => ({ ...current, [field.key]: Number(event.target.value) })); setExclude(false); }}><option value={-1}>使用しない</option>{table.headers.map((header, index) => <option key={index} value={index}>{index + 1}: {header}</option>)}</select></label><label><input type="checkbox" aria-label={`${field.label}を掲載`} disabled={locked} checked={locked || published.includes(field.key)} onChange={event => setPublished(current => event.target.checked ? [...current, field.key] : current.filter(key => key !== field.key))} />掲載</label></div>;
      })}</fieldset>
      <p className="hint">名称・座標・カテゴリは地図の基本表示に使います。対応付けなかった列は内部列として保持し、検索やAI向け出力には含めません。</p>
      <div className="import-results" role="status">有効 {checked.valid.length}件 ／ 不正 {checked.invalid.length}件 ／ 空行 {checked.blank}件</div>
      {checked.missing.length > 0 && <p className="import-error">必須列を設定してください: {checked.missing.join('、')}</p>}{checked.duplicatedColumns && <p className="import-error">同じ列を複数の項目へ割り当てています。</p>}
      {checked.invalid.length > 0 && <><ul className="invalid-rows">{checked.invalid.map(row => <li key={row.row}>{row.row}行目・{row.name}: {row.reasons.join('、')}</li>)}</ul><label className="checkbox-setting"><input type="checkbox" checked={exclude} onChange={event => setExclude(event.target.checked)} />不正な{checked.invalid.length}行を除外して取り込む</label></>}
    </>}
    <div className="dialog-actions"><IconButton icon="close" label="取り消す" showLabel onClick={onClose} /><IconButton icon="check" label="確認したデータを反映" className="primary-button" disabled={busy || !checked || checked.missing.length > 0 || checked.duplicatedColumns || !checked.valid.length || (checked.invalid.length > 0 && !exclude)} hint="列の対応と掲載項目を確認して適用" onClick={apply} /></div>
  </dialog>;
}
