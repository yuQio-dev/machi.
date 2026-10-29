import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Component, Design, Device } from './model';
import { CanvasTree } from './CanvasTree';
import { ComponentContent } from './PreviewComponents';
import { applyPreviewActions, eventValue, initialPreview, visibleRows } from './runtime';
import './styles.css';
import './editor.css';
import './redesign.css';
import './extensions.css';
import './inline-text.css';
import './viewer.css';

const design: Design = JSON.parse(document.getElementById('machi-data')!.textContent!);
function Viewer() {
  const [width, setWidth] = useState(window.innerWidth);
  const device: Device = width < 700 ? 'mobile' : 'desktop';
  const [preview, setPreview] = useState(() => initialPreview(design.screens.find(s => s.id === design.initialScreenId)!, device));
  const screen = design.screens.find(s => s.id === preview.activeScreenId) || design.screens[0];
  const frame = screen.frames[device] || screen.frames.desktop;
  const scale = Math.min(1, width / frame.width);
  useEffect(() => { const resize = () => setWidth(window.innerWidth); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  const dispatch = (component: Component, event: string, payload: Record<string, unknown> = {}) => {
    const datasetId = component.binding?.datasetId || design.datasets[0].id;
    const dataset = design.datasets.find(d => d.id === datasetId)!;
    const selectedPlace = dataset.rows.find(r => r.id === preview.selected[datasetId])?.values;
    const actionPayload = { ...payload, selectedPlace };
    const actions = component.interactions.filter(i => i.event === event).flatMap(i => i.actions);
    for (const action of actions) if (action.type === 'open-url') {
      const value = eventValue(action.value, actionPayload);
      try { const url = new URL(String(value)); if (['https:', 'http:'].includes(url.protocol)) window.open(url.href, action.newTab === false ? '_self' : '_blank', 'noopener,noreferrer'); } catch { /* Ignore invalid destination. */ }
    }
    setPreview(current => applyPreviewActions(current, design, screen, device, datasetId, actions, payload, actionPayload));
  };
  return <main className="downloaded-map"><div className="viewer-stage" style={{width:frame.width * scale,height:frame.height * scale}}><div className="frame" style={{width:frame.width,height:frame.height,transform:`scale(${scale})`,background:String(design.theme?.background || '#fff'),'--accent':String(design.theme?.accent || '#7952b3')} as React.CSSProperties}>
    <CanvasTree design={design} screen={screen} device={device} mode="preview" openPanels={preview.openPanels} content={component => {
      const dataset = design.datasets.find(d => d.id === component.binding?.datasetId) || design.datasets[0];
      const query = preview.queries[dataset.id] || '', filters = preview.filters[dataset.id] || [];
      const fields = screen.components.filter(c => c.kind === 'place-search' && c.binding?.datasetId === dataset.id).flatMap(c => Array.isArray(c.props.searchFields) ? c.props.searchFields.filter((f): f is string => typeof f === 'string') : []);
      const rows = visibleRows(dataset,query,filters,fields.length ? fields : [dataset.mapping.name,dataset.mapping.location,dataset.mapping.description].filter((f): f is string => Boolean(f)));
      const selectedId = preview.selected[dataset.id] || null;
      return <ComponentContent design={design} component={component} dataset={dataset} rows={rows} mode="preview" query={query} activeFilters={filters} selectedId={rows.some(r => r.id === selectedId) ? selectedId : null} fitToken={preview.mapFit[component.id] || 0} device={device} openPanels={preview.openPanels} dispatch={dispatch} closePanel={id => setPreview(p => ({...p,openPanels:{...p.openPanels,[id]:false}}))} />;
    }} />
  </div></div><footer>machi.で作成した地図 · 背景地図・写真の表示にはインターネット接続が必要です。</footer></main>;
}
createRoot(document.getElementById('root')!).render(<Viewer />);
