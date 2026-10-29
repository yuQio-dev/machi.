import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LayoutHandles } from './LayoutHandles';
import Selecto from 'react-selecto';
import { Group, Panel, Separator, useGroupRef } from 'react-resizable-panels';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import sample from './contracts/ushiku-demo.machi.json';
import { describeDiff, updateLayout, validateDesign, type Component, type Dataset, type Design, type Device, type Layout } from './model';
import './styles.css';

const initial = validateDesign(sample).design;
if (!initial) throw new Error('同梱設計JSONが無効です');
const storageKey = 'machi-sketch-panel-width-v1';

function useHistory(start: Design) {
  const [state, setState] = useState({ past: [] as Design[], present: start, future: [] as Design[] });
  const commit = (next: Design) => setState(current => JSON.stringify(current.present) === JSON.stringify(next) ? current : {
    past: [...current.past.slice(-49), current.present], present: next, future: [],
  });
  const undo = () => setState(current => current.past.length ? {
    past: current.past.slice(0, -1), present: current.past.at(-1)!, future: [current.present, ...current.future],
  } : current);
  const redo = () => setState(current => current.future.length ? {
    past: [...current.past, current.present], present: current.future[0], future: current.future.slice(1),
  } : current);
  return { ...state, commit, undo, redo };
}

function MapView({ dataset, component, active, mode }: { dataset: Dataset; component: Component; active: boolean; mode: string }) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const center = component.props.center as { lat: number; lon: number };
    const instance = L.map(host.current, { zoomControl: false, dragging: mode === 'preview', scrollWheelZoom: mode === 'preview' })
      .setView([center.lat, center.lon], Number(component.props.zoom) || 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
    }).addTo(instance);
    markers.current = L.layerGroup().addTo(instance);
    observer.current = new ResizeObserver(() => instance.invalidateSize({ animate: false }));
    observer.current.observe(host.current);
    map.current = instance;
    return () => { observer.current?.disconnect(); instance.remove(); map.current = null; markers.current = null; };
  }, [component.id]);
  useEffect(() => {
    if (!map.current || !markers.current) return;
    if (mode === 'preview') { map.current.dragging.enable(); map.current.scrollWheelZoom.enable(); }
    else { map.current.dragging.disable(); map.current.scrollWheelZoom.disable(); }
    markers.current.clearLayers();
    for (const row of dataset.rows) {
      const lat = Number(row.values[dataset.mapping.lat]);
      const lon = Number(row.values[dataset.mapping.lon]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        L.circleMarker([lat, lon], { radius: 8, color: '#6b46a5', fillColor: '#8a63c4', fillOpacity: .9, weight: 2 })
          .bindTooltip(String(row.values[dataset.mapping.name] ?? '地点'))
          .addTo(markers.current);
      }
    }
    map.current.invalidateSize({ animate: false });
  }, [dataset, mode]);
  return <div ref={host} className="map-host" aria-label={`地図 ${active ? '選択中' : ''}`} />;
}

function ComponentContent({ component, dataset, mode }: { component: Component; dataset: Dataset; mode: string }) {
  const kind = component.kind;
  if (kind === 'map-view') return <MapView dataset={dataset} component={component} active={false} mode={mode} />;
  if (kind === 'app-header') return <div className="mock-header"><strong>{String(component.props.title || '地図タイトル')}</strong><small>{String(component.props.description || '')}</small></div>;
  if (kind === 'place-search') return <div className="mock-search"><span>⌕</span><input placeholder={String(component.props.placeholder || '検索')} disabled={mode === 'edit'} /></div>;
  if (kind === 'category-chips') return <div className="mock-chips"><span>すべて</span>{[...new Set(dataset.rows.map(row => String(row.values[dataset.mapping.category] ?? '未分類')))].map(category => <span key={category}>{category}</span>)}</div>;
  if (kind === 'result-count') return <div className="mock-count">{dataset.rows.length} {String(component.props.suffix || '件')}</div>;
  if (kind === 'place-list') return <div className="mock-list">{dataset.rows.map(row => <div key={row.id}><strong>{String(row.values[dataset.mapping.name])}</strong><small>{String(row.values[dataset.mapping.category] || '')}</small></div>)}</div>;
  if (kind === 'place-detail') return <div className="mock-detail"><strong>地点詳細</strong><span>{String(component.props.emptyLabel || '地点を選択してください')}</span></div>;
  if (kind === 'floating-action') return <button className="mock-fab" disabled={mode === 'edit'}>{String(component.props.label || '操作')}</button>;
  return <div className="mock-unknown">{component.name}</div>;
}

function App() {
  const history = useHistory(initial as Design);
  const design = history.present;
  const [device, setDevice] = useState<Device>('desktop');
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [tab, setTab] = useState<'parts' | 'settings'>('parts');
  const [selected, setSelected] = useState<string[]>([]);
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  const [fitZoom, setFitZoom] = useState(.5);
  const stageScroll = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<{ design: Design; diff: string[] } | null>(null);
  const screen = design.screens.find(item => item.id === design.initialScreenId) ?? design.screens[0];
  const dataset = design.datasets[0];
  const frame = screen.frames[device];
  const zoom = manualZoom ?? fitZoom;
  useEffect(() => {
    const host = stageScroll.current;
    if (!host) return;
    const fit = () => setFitZoom(Math.max(.1, Math.min((host.clientWidth - 64) / frame.width, (host.clientHeight - 64) / frame.height, 1)));
    const observer = new ResizeObserver(fit);
    observer.observe(host); fit();
    return () => observer.disconnect();
  }, [frame.width, frame.height]);
  const selectedComponent = screen.components.find(component => component.id === selected[0]);
  const target = selectedComponent && selected.length === 1 ? document.querySelector<HTMLElement>(`[data-component-id="${selectedComponent.id}"]`) : null;
  const panelGroup = useGroupRef();
  const [leftSize] = useState(() => {
    const stored = Number(localStorage.getItem(storageKey));
    return Number.isFinite(stored) && stored >= 20 && stored <= 70 ? stored : 35;
  });
  const sorted = useMemo(() => [...screen.components].sort((a, b) => ((a.layouts[device]?.zIndex ?? 0) - (b.layouts[device]?.zIndex ?? 0)) || a.id.localeCompare(b.id)), [screen, device]);

  const commitLayout = (id: string, patch: Partial<Layout>) => history.commit(updateLayout(design, screen.id, id, device, patch));
  const download = () => {
    const blob = new Blob([JSON.stringify(design, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `${design.id}.machi.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setNotice('8MBを超える設計は読み込めません'); return; }
    try {
      const result = validateDesign(JSON.parse(await file.text()));
      if (!result.design) { setNotice(`読み込みを中止: ${result.errors.join(' / ')}`); return; }
      setPending({ design: result.design, diff: describeDiff(design, result.design) });
      setNotice('検査が通りました。差分を確認してください');
    } catch { setNotice('JSONの構文を読めませんでした'); }
  };

  return <div className="editor">
    <header className="topbar">
      <div className="brand">machi<span>.</span><small> スケッチエディター</small></div>
      <div className="mode-tabs" role="group" aria-label="モード">
        <button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>編集</button>
        <button className={mode === 'preview' ? 'active' : ''} onClick={() => { setMode('preview'); setSelected([]); }}>試す</button>
      </div>
      <div className="top-actions"><button onClick={history.undo} disabled={!history.past.length}>元に戻す</button><button onClick={history.redo} disabled={!history.future.length}>やり直す</button><button onClick={download}>JSONを書き出す</button><label className="import-button">JSONを読み戻す<input type="file" accept=".json,application/json" onChange={event => { void importFile(event.target.files?.[0]); event.target.value = ''; }} /></label></div>
    </header>
    <Group className="workspace" orientation="horizontal" groupRef={panelGroup} defaultLayout={{ tools: leftSize, canvas: 100 - leftSize }} onLayoutChanged={layout => localStorage.setItem(storageKey, String(layout.tools))}>
      <Panel id="tools" minSize="320px" defaultSize={`${leftSize}%`} className="tools">
        <div className="side-title"><div><span className="eyebrow">PROJECT</span><h1>{design.title}</h1></div><button title="左パネルを35%へ戻す" onClick={() => panelGroup.current?.setLayout({ tools: 35, canvas: 65 })}>幅を戻す</button></div>
        <div className="side-tabs"><button className={tab === 'parts' ? 'active' : ''} onClick={() => setTab('parts')}>部品</button><button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>設定</button></div>
        <div className="side-content">{tab === 'parts' ? <><p className="hint">この試作では、契約サンプルの部品を移動・変更できます。</p><div className="part-list">{screen.components.map(component => <button key={component.id} className={selected.includes(component.id) ? 'selected' : ''} onClick={() => { setSelected([component.id]); setTab('settings'); setMode('edit'); }}><span className="part-icon">□</span><span>{component.name}<small>{component.kind}</small></span></button>)}</div></> : selectedComponent ? <><div className="settings-head"><span className="eyebrow">SELECTED COMPONENT</span><h2>{selectedComponent.name}</h2><code>{selectedComponent.id}</code></div>{selectedComponent.layouts[device] ? <div className="fields">{(['x', 'y', 'width', 'height'] as const).map(key => <label key={key}>{key.toUpperCase()}<input type="number" value={selectedComponent.layouts[device]![key]} onChange={event => commitLayout(selectedComponent.id, { [key]: Number(event.target.value) })} /></label>)}</div> : <p>この端末には配置がありません。</p>}<p className="hint">配置は{device === 'desktop' ? 'PC' : 'スマホ'}だけに保存します。内容と操作は共通です。</p></> : <p className="hint">部品を選ぶと設定を表示します。</p>}</div>
        <div className="side-footer"><span>設計形式 v{design.schemaVersion}</span><span>{screen.components.length} 部品</span></div>
      </Panel>
      <Separator className="splitter" aria-label="左右パネルの幅を変更" />
      <Panel id="canvas" minSize="480px" className="canvas-panel">
        <div className="canvas-toolbar"><div className="device-tabs"><button className={device === 'desktop' ? 'active' : ''} onClick={() => { setDevice('desktop'); setSelected([]); }}>PC</button><button className={device === 'mobile' ? 'active' : ''} onClick={() => { setDevice('mobile'); setSelected([]); }}>スマホ</button></div><div className="zoom-control"><select aria-label="表示倍率" value={manualZoom === null ? 'fit' : String(manualZoom)} onChange={event => setManualZoom(event.target.value === 'fit' ? null : Number(event.target.value))}><option value="fit">全体 ({Math.round(fitZoom * 100)}%)</option><option value="0.5">50%</option><option value="1">100%</option><option value="1.25">125%</option></select><button onClick={() => setManualZoom(null)}>全体表示</button></div></div>
        <div className="stage-scroll" ref={stageScroll}><div className="stage" style={{ width: frame.width * zoom, height: frame.height * zoom }}><div className={`frame ${mode === 'edit' ? 'frame-edit' : ''}`} style={{ width: frame.width, height: frame.height, transform: `scale(${zoom})` }} onPointerDown={event => { if (event.target === event.currentTarget) setSelected([]); }}>
          {sorted.map(component => {
            const layout = component.layouts[device];
            if (!layout || layout.hidden) return null;
            return <div key={component.id} data-component-id={component.id} className={`canvas-component ${mode === 'edit' ? 'editable' : ''} ${selected.includes(component.id) ? 'is-selected' : ''}`} style={{ left: layout.x, top: layout.y, width: layout.width, height: layout.height, zIndex: layout.zIndex }} onPointerDown={event => { if (mode === 'edit') { event.stopPropagation(); setSelected([component.id]); setTab('settings'); } }}><ComponentContent component={component} dataset={dataset} mode={mode} /></div>;
          })}
          {mode === 'edit' && target && selectedComponent?.layouts[device] && <LayoutHandles key={selectedComponent.id + device + zoom} items={[{target, id: selectedComponent.id, layout: selectedComponent.layouts[device]!}]} snap frame={frame} commit={patches => commitLayout(selectedComponent.id, patches[selectedComponent.id])} />}
        </div></div></div>
        {mode === 'edit' && <Selecto dragContainer=".stage-scroll" selectableTargets={['.canvas-component']} selectByClick={false} selectFromInside={false} preventDragFromInside hitRate={5} onSelectEnd={event => { if (event.selected.length) setSelected(event.selected.map(element => element.getAttribute('data-component-id') || '').filter(Boolean)); }} />}
        <div className="canvas-status">{mode === 'edit' ? '編集: 部品を選び、移動・サイズ変更できます' : '試す: 地図を移動できます'} <span>{frame.width} × {frame.height}</span></div>
      </Panel>
    </Group>
    {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="通知を閉じる">×</button></div>}
    {pending && <div className="dialog-backdrop"><section className="diff-dialog" role="dialog" aria-modal="true" aria-labelledby="diff-title"><span className="eyebrow">IMPORT REVIEW</span><h2 id="diff-title">読み戻す変更を確認</h2><ul>{pending.diff.map((line, index) => <li key={index}>{line}</li>)}</ul><p>取り込むと現在の設計が置き換わります。元に戻す操作は使えます。</p><div className="dialog-actions"><button onClick={() => setPending(null)}>取り消す</button><button className="primary" onClick={() => { history.commit(pending.design); setSelected([]); setPending(null); setNotice('設計を取り込みました'); }}>取り込む</button></div></section></div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);


