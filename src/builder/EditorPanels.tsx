import { useEffect, useMemo, useRef, useState } from 'react';
import type { Design, Device, Screen } from './model';
import type { Alignment, EditorCommand } from './commands';
import { groupingReason } from './commands';
import { protectedSelection, roots } from './geometry';
import { contrastRatio, palettes, themePreset } from './theme';
import { screenFlow, type FlowEdge } from './flow';
import { buildHandoffMarkdown, buildHandoffSections, initialPreview } from './runtime';
import { proposeLayout } from './autoLayout';
import { CanvasTree } from './CanvasTree';
import { ComponentContent } from './PreviewComponents';
import { IconButton } from './IconButton';

function BoxGlyph({ width = 18, height = 12, fill = 'none' }: { width?: number; height?: number; fill?: string }) {
  return <svg aria-hidden="true" className="preset-glyph" viewBox="0 0 24 24"><rect x={(24-width)/2} y={(24-height)/2} width={width} height={height} rx="2" fill={fill} stroke="currentColor" strokeWidth="1.6" /></svg>;
}

export function NoteField({ label, value = '', onCommit }: { label: string; value?: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return <label className="setting-field">{label}<textarea maxLength={2000} value={draft} placeholder="実装時の補足。自動説明とは分けて出力します" onChange={event => setDraft(event.target.value)} onBlur={() => { if (draft !== value) onCommit(draft); }} /></label>;
}

export function SelectionTools({ screen, ids, device, onCommand }: { screen: Screen; ids: string[]; device: Device; onCommand: (command: EditorCommand) => void }) {
  const [relativeTo, setRelativeTo] = useState<'selection' | 'parent'>('selection');
  const chosen = roots(screen, ids), protectedParts = protectedSelection(screen, ids);
  const sameParent = new Set(chosen.map(component => component.parentId)).size <= 1;
  const group = chosen.length === 1 && chosen[0]?.editor?.group;
  const reason = group ? '' : groupingReason(screen, ids);
  return <details className="selection-tools" open={ids.length > 1 || undefined}><summary>{ids.length > 1 ? `${ids.length}部品の一括操作` : '整列・グループ・プリセット'}</summary>
    {protectedParts && <p className="operation-warning">ロックされた部品を含みます。配置・削除・グループ変更はできません。</p>}
    {!sameParent && <p className="operation-warning">整列とグループ化は、同じ親の部品を選択してください。</p>}
    <label className="setting-field">整列の基準<select value={relativeTo} onChange={event => setRelativeTo(event.target.value as typeof relativeTo)}><option value="selection">選択範囲</option><option value="parent">画面／親の内側</option></select></label>
    <div className="alignment-grid">{([['left', '左'], ['center', '水平中央'], ['right', '右'], ['top', '上'], ['middle', '垂直中央'], ['bottom', '下']] as [Alignment, string][]).map(([alignment, label]) => <IconButton key={alignment} icon={`align_${alignment}`} label={`${label}に整列`} disabled={protectedParts || !sameParent} hint={protectedParts ? 'ロックされた部品を含みます' : !sameParent ? '同じ親の部品を選択してください' : undefined} onClick={() => onCommand({ type: 'align', alignment, relativeTo })} />)}</div>
    <div className="selection-actions"><IconButton icon={group ? 'ungroup' : 'group'} label={group ? 'グループ解除' : 'グループ化'} hint={reason || (protectedParts ? 'ロックされた部品を含みます' : 'Ctrl / Command + G・Shift併用で解除')} disabled={protectedParts || !!reason} onClick={() => onCommand({ type: group ? 'ungroup' : 'group' })} />
      <IconButton icon={chosen.every(component => component.editor?.locked) ? 'lock_open' : 'lock'} label={chosen.every(component => component.editor?.locked) ? 'ロック解除' : '位置をロック'} onClick={() => onCommand({ type: 'lock', locked: !chosen.every(component => component.editor?.locked) })} /></div>
    {chosen.length > 1 && reason && <p className="hint">{reason}</p>}
    <p className="hint">配置操作は{device === 'desktop' ? 'PC' : 'スマホ'}に適用します。方向キー: 1px / Shift: 10px。</p>
    {!group && <><h4>寸法プリセット</h4><div className="preset-row">{(['standard', 'half', 'full'] as const).map((value, i) => <IconButton key={value} icon="web_asset" label={['標準幅', '半幅', '全幅'][i]} disabled={protectedParts} hint={protectedParts ? 'ロックされた部品を含みます' : undefined} onClick={() => onCommand({ type: 'preset-size', axis: 'width', value })}><BoxGlyph width={[14, 10, 21][i]} /></IconButton>)}</div>
      <div className="preset-row">{[32, 40, 56, 96, 136].map((value, i) => <IconButton key={value} icon="web_asset" label={`高さ${['XS', 'S', 'M', 'L', 'XL'][i]}（${value}px）`} disabled={protectedParts} hint={protectedParts ? 'ロックされた部品を含みます' : undefined} onClick={() => onCommand({ type: 'preset-size', axis: 'height', value })}><BoxGlyph height={[4, 7, 11, 16, 21][i]} /></IconButton>)}</div></>}
    {chosen.every(component => component.kind === 'floating-action' || component.kind === 'button') && <><h4>ボタンの外観</h4><p className="hint">プリセットで背景・文字・枠線の個別指定を置き換えます。</p><div className="preset-row">{(['filled', 'tonal', 'outline'] as const).map((variant, i) => <IconButton key={variant} icon="web_asset" label={['塗りつぶし', '淡色', '枠線'][i]} className={`variant-${variant}`} onClick={() => onCommand({ type: 'style', patch: { variant }, reset: ['background', 'color', 'borderColor', 'borderWidth'] })}><BoxGlyph fill={variant === 'outline' ? 'none' : 'currentColor'} /></IconButton>)}</div></>}
    <IconButton icon="reset" label="テーマに戻す" onClick={() => onCommand({ type: 'style', patch: {}, reset: ['background', 'color', 'borderColor', 'borderWidth', 'radius', 'fontSize', 'fontWeight'] })} />
  </details>;
}

export function ThemePanel({ design, onChange }: { design: Design; onChange: (next: Design) => void }) {
  const theme = design.theme || {};
  const patch = (value: Record<string, unknown>) => onChange({ ...design, theme: { ...theme, managed: true, ...value } });
  return <div className="library-content theme-panel"><h2>アプリのテーマ</h2><p className="hint">PC・スマホ共通。個別に指定した色は優先されます。</p>
    <div className="theme-palettes">{Object.entries(palettes).map(([key, palette]) => <IconButton key={key} icon="palette" label={palette.label} hint="テーマの配色" aria-pressed={theme.palette === key} onClick={() => onChange({ ...design, theme: themePreset(design, key as keyof typeof palettes, theme.mode === 'dark' ? 'dark' : 'light') })}><span aria-hidden="true" className="theme-swatch" style={{ background: palette.accent }} /></IconButton>)}</div>
    <label className="setting-field">明るさ<select value={String(theme.mode || 'light')} onChange={event => onChange({ ...design, theme: theme.palette && theme.palette !== 'custom' ? themePreset(design, theme.palette as keyof typeof palettes, event.target.value as 'light' | 'dark') : { ...theme, managed: true, mode: event.target.value, background: event.target.value === 'dark' ? '#1c1922' : '#faf8fd', foreground: event.target.value === 'dark' ? '#f1eaf8' : '#332b43' } })}><option value="light">ライト</option><option value="dark">ダーク</option></select></label>
    {(['accent', 'background', 'foreground'] as const).map((key, i) => <label className="color-setting" key={key}>{['アクセント', '背景', '文字'][i]}<input type="color" aria-label={`テーマの${['アクセント', '背景', '文字'][i]}`} value={String(theme[key] || ['#7952b3', '#faf8fd', '#332b43'][i])} onChange={event => patch({ [key]: event.target.value, palette: 'custom' })} /></label>)}
    <p className="hint">背景と文字のコントラスト: {contrastRatio(String(theme.background || '#faf8fd'), String(theme.foreground || '#332b43')).toFixed(2)}:1</p>
    <label className="setting-field">角丸<select value={String(theme.shape || 'standard')} onChange={event => patch({ shape: event.target.value })}><option value="standard">標準</option><option value="square">角型</option><option value="round">丸型</option></select></label>
    <label className="setting-field">書体<select value={String(theme.font || 'sans')} onChange={event => patch({ font: event.target.value })}><option value="sans">ゴシック</option><option value="serif">明朝</option><option value="mono">等幅</option></select></label>
    <label className="setting-field">文字の大きさ<select value={Number(theme.scale || 1)} onChange={event => patch({ scale: Number(event.target.value) })}><option value={.875}>小</option><option value={1}>標準</option><option value={1.125}>大</option></select></label>
  </div>;
}

export function PromptWorkspace({ design, screenId, onCopy, onSave }: { design: Design; screenId: string; onCopy: (text: string) => void; onSave: (text: string) => void }) {
  const [scope, setScope] = useState('all');
  const [active, setActive] = useState('overview');
  const targetScreenId = scope === 'all' ? undefined : screenId;
  const sections = useMemo(() => buildHandoffSections(design, targetScreenId), [design, targetScreenId]);
  const generated = useMemo(() => buildHandoffMarkdown(design, targetScreenId), [design, targetScreenId]);
  const [draft, setDraft] = useState(generated);
  useEffect(() => { setDraft(generated); }, [generated]);
  return <section className="prompt-workspace"><div className="prompt-heading"><div><span className="eyebrow">HANDOFF</span><h2>外部AIへ渡す実装指示</h2><p>設計・配置・操作・掲載データを同じ版から出力します。</p></div><div><IconButton icon="copy" label="コピー" showLabel onClick={() => onCopy(draft)} /><IconButton icon="download" label="Markdownを保存" className="primary-button" onClick={() => onSave(draft)} /></div></div>
    <label className="setting-field">依頼する範囲<select value={scope} onChange={event => setScope(event.target.value)}><option value="all">全体</option><option value="screen">選択画面: {design.screens.find(screen => screen.id === screenId)?.name}</option></select></label>
    {scope !== 'all' && <p className="hint">依頼文は選択画面に限定します。依存関係を保つため掲載用JSONは全体を添付します。</p>}
    <div className="prompt-outline-layout"><nav aria-label="プロンプトの目次">{sections.map(section => <IconButton key={section.id} icon={({ overview: 'text_fields', screens: 'web_asset', layout: 'grid_view', behavior: 'bolt', appearance: 'palette', data: 'database', checks: 'checklist', json: 'code' } as Record<string,string>)[section.id]} label={section.title} aria-current={active === section.id ? 'true' : undefined} onClick={() => { setActive(section.id); document.getElementById(`prompt-${section.id}`)?.scrollIntoView({ block: 'start' }); }} />)}</nav>
      <div className="prompt-sections">{sections.map(section => <details key={section.id} id={`prompt-${section.id}`} open={active === section.id || section.id === 'overview'}><summary onClick={() => setActive(section.id)}>{section.title}</summary><pre>{section.text}</pre></details>)}<details className="prompt-edit"><summary>AIに渡す文面を編集</summary><p className="hint">上の各節は生成元です。ここでの修正はコピー・保存する文面だけに反映され、設計JSONは変更しません。画面や依頼範囲を切り替えると修正は破棄されます。</p><textarea aria-label="外部AI向け実装指示を編集" value={draft} onChange={event => setDraft(event.target.value)} spellCheck={false} /><IconButton icon="reset" label="生成文に戻す" disabled={draft === generated} onClick={() => setDraft(generated)} /></details></div></div>
  </section>;
}

export function FlowPanel({ design, onOpen }: { design: Design; onOpen: (screenId: string, componentId?: string) => void }) {
  const { edges, warnings } = screenFlow(design);
  const position = (id: string) => { const i = design.screens.findIndex(screen => screen.id === id); return { x: 40 + (i % 3) * 300, y: 40 + Math.floor(i / 3) * 190 }; };
  return <section className="flow-workspace"><h2>画面フロー</h2><p className="hint">画面を選ぶと編集へ、操作を選ぶと元の部品の動作設定へ移動します。「戻る」の線は履歴がない場合の移動先です。</p>
    <div className="flow-viewport"><div className="flow-board" style={{ height: Math.ceil(design.screens.length / 3) * 190 + 40 }}><svg aria-hidden="true" width="940" height={Math.ceil(design.screens.length / 3) * 190 + 40}><defs><marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#7952b3" /></marker></defs>{edges.filter(edge => design.screens.some(screen => screen.id === edge.targetId)).map(edge => { const a = position(edge.screenId), b = position(edge.targetId); const route = a.y === b.y && !edge.back && b.x > a.x ? `M ${a.x + 200} ${a.y + 50} C ${a.x + 245} ${a.y + 50},${b.x - 45} ${b.y + 50},${b.x} ${b.y + 50}` : edge.back && a.y === b.y ? `M ${a.x + 100} ${a.y + 100} C ${a.x + 100} ${a.y + 155},${b.x + 100} ${b.y + 155},${b.x + 100} ${b.y + 100}` : `M ${a.x + 100} ${a.y + 100} C ${a.x + 100} ${a.y + 150},${b.x + 100} ${b.y - 30},${b.x + 100} ${b.y}`; return <path onClick={() => onOpen(edge.screenId, edge.componentId)} style={{ cursor: 'pointer' }} key={edge.id} d={route} fill="none" stroke="#7952b3" strokeWidth="2" strokeDasharray={edge.back ? '5 4' : undefined} markerEnd="url(#flow-arrow)" />; })}</svg>
      {design.screens.map(screen => <button className="flow-node" key={screen.id} style={{ left: position(screen.id).x, top: position(screen.id).y }} onClick={() => onOpen(screen.id)}><strong>{screen.name}</strong><small>{screen.components.length}部品{screen.id === design.initialScreenId ? ' · 初期画面' : ''}</small></button>)}</div></div>
    <div className="flow-edges">{edges.map((edge: FlowEdge) => <button key={edge.id} onClick={() => onOpen(edge.screenId, edge.componentId)}>{design.screens.find(screen => screen.id === edge.screenId)?.name} / {edge.label} → {edge.back ? '戻る（既定: ' : ''}{design.screens.find(screen => screen.id === edge.targetId)?.name || '移動先未設定'}{edge.back ? '）' : ''}</button>)}</div>
    {warnings.length > 0 && <section className="operation-warning"><h3>確認が必要な設定</h3><ul>{warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></section>}
  </section>;
}

function LayoutThumbnail({ design, screenId, device }: { design: Design; screenId: string; device: Device }) {
  const screen = design.screens.find(item => item.id === screenId)!, frame = screen.frames[device];
  const scale = Math.min(350 / frame.width, 250 / frame.height), preview = initialPreview(screen, device);
  return <div className="layout-thumbnail" style={{ width: frame.width * scale, height: frame.height * scale }}><div className="frame" style={{ width: frame.width, height: frame.height, transform: `scale(${scale})` }}><CanvasTree design={design} screen={screen} device={device} mode="thumbnail" content={component => {
    const dataset = design.datasets.find(item => item.id === component.binding?.datasetId) || design.datasets[0];
    return <ComponentContent design={design} component={component} dataset={dataset} rows={dataset.rows} mode="edit" query="" activeFilters={[]} selectedId={null} fitToken={0} device={device} openPanels={preview.openPanels} dispatch={() => {}} closePanel={() => {}} />;
  }} /></div></div>;
}
export function AutoLayoutDialog({ design, screenId, device, onApply, onClose }: { design: Design; screenId: string; device: Device; onApply: (next: Design) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), trigger = useRef(document.activeElement as HTMLElement | null);
  const [devices, setDevices] = useState<Device[]>([device]);
  const maps = design.screens.find(screen => screen.id === screenId)!.components.filter(component => component.kind === 'map-view');
  const [mainMap, setMainMap] = useState(maps.length === 1 ? maps[0].id : '');
  const proposal = proposeLayout(design, screenId, devices, mainMap);
  useEffect(() => { ref.current!.showModal(); const element = ref.current!; return () => { element.close(); trigger.current?.focus(); }; }, []);
  return <dialog ref={ref} className="auto-layout-dialog" aria-labelledby="auto-layout-title" onCancel={event => { event.preventDefault(); onClose(); }}><h2 id="auto-layout-title">自動配置のプレビュー</h2><p>位置・寸法・表示形式を組み替えます。適用後は1回のUndoで戻せます。</p>
    <div className="preset-row">{(['desktop', 'mobile'] as const).map(value => <label key={value}><input type="checkbox" checked={devices.includes(value)} onChange={event => setDevices(current => event.target.checked ? [...current, value] : current.filter(item => item !== value))} />{value === 'desktop' ? 'PC' : 'スマホ'}</label>)}</div>
    {maps.length > 1 && <label className="setting-field">主地図<select value={mainMap} onChange={event => setMainMap(event.target.value)}><option value="">選んでください</option>{maps.map(map => <option key={map.id} value={map.id}>{map.name}</option>)}</select></label>}
    {proposal.errors.length > 0 && <div role="alert" className="operation-warning"><ul>{proposal.errors.map((error, i) => <li key={i}>{error}</li>)}</ul></div>}
    {proposal.design && devices.map(target => <section key={target}><h3>{target === 'desktop' ? 'PC' : 'スマホ'}</h3><div className="layout-comparison"><div><h4>現在</h4><LayoutThumbnail design={design} screenId={screenId} device={target} /></div><div><h4>提案</h4><LayoutThumbnail design={proposal.design!} screenId={screenId} device={target} /></div></div></section>)}
    <p role="status">変更する配置: {proposal.changes}件</p><div className="dialog-actions"><IconButton icon="close" label="取り消す" onClick={onClose} /><IconButton icon="check" label="この配置を適用" className="primary-button" disabled={!proposal.design || proposal.changes === 0} hint={!proposal.design ? '配置案の問題を確認してください' : proposal.changes === 0 ? '配置の変更はありません' : undefined} onClick={() => { if (proposal.design) onApply(proposal.design); }} /></div>
  </dialog>;
}
