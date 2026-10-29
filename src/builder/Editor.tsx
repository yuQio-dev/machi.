import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Selecto from 'react-selecto';
import { Group, Panel, Separator, useGroupRef } from 'react-resizable-panels';
import sample from './contracts/ushiku-original.machi.json';
import { buildMapHtml } from './exportMap';
import './viewer.css';
import { LayoutHandles } from './LayoutHandles';
import { describeDiff, validateDesign, type Component, type Design, type Device, type Interaction, type InteractionAction, type Layout, type Screen, type Transition } from './model';
import { createComponent, createScreen, eventValue, firstFlowKinds, initialPreview, applyPreviewActions, publicColumns, publicFieldSet, visibleRows, type PreviewState } from './runtime';
import { ComponentContent } from './PreviewComponents';
import './styles.css';
import './editor.css';
import './redesign.css';
import './context-menu.css';
import './extensions.css';
import './icon-buttons.css';
import './inline-text.css';
import { applyCommand, copyComponents, groupingReason, type Clipboard, type EditorCommand } from './commands';
import { overflowWarnings, parentFrame, protectedSelection, roots } from './geometry';
import { CanvasTree } from './CanvasTree';
import { AutoLayoutDialog, FlowPanel, NoteField, PromptWorkspace, SelectionTools, ThemePanel } from './EditorPanels';
import { actionWarnings, noTransition } from './flow';
import { resolveAppearance } from './theme';
import { Icon, partNames, partIcons } from './Icons';
import { IconButton } from './IconButton';
import { useHistory } from './history';
import { readSavedDesign, writeSavedDesign } from './storage';
import { ContextMenu, ColorDialog, type MenuAction, type MenuItem, type Colors, type ColorKey } from './ContextMenu';

const validInitial = validateDesign(sample);
if (!validInitial.design) throw new Error(`同梱設計JSONが無効です: ${validInitial.errors.join(' / ')}`);
const initial = validInitial.design;
const ImportDataDialog = React.lazy(() => import('./ImportDataDialog').then(module => ({ default: module.ImportDataDialog })));
const storageKey = 'machi-sketch-panels-v2';
type Mode = 'edit' | 'preview' | 'prompt' | 'flow';
type SettingsTab = 'appearance' | 'behavior' | 'data';

const eventOptions: Record<string, string[]> = {
  'map-view': ['place-select'], 'place-search': ['query-change', 'clear'],
  'category-chips': ['filter-change'], 'place-list': ['place-select'], 'place-detail': ['close'],
  'floating-action': ['activate'],
};
const actionOptions = [
  ['select-place', '地点を選択'], ['clear-selection', '選択を解除'], ['set-query', '検索条件を更新'],
  ['set-filter', 'カテゴリ・条件を更新'], ['set-filters', '条件をまとめて設定'], ['reset-filters', '条件をリセット'],
  ['open-panel', 'パネルを開く'], ['close-panel', 'パネルを閉じる'], ['navigate', '画面へ移動'],
  ['go-back', '前の画面へ戻る'], ['open-url', 'Webサイトを開く'], ['map-fit', '地図を全体表示'],
] as const;
const actionNeedsDataset = new Set(['select-place', 'clear-selection', 'set-query', 'set-filter', 'set-filters', 'reset-filters', 'retry-data']);
const actionNeedsTarget = new Set(['open-panel', 'close-panel', 'map-fit', 'map-locate', 'map-zoom', 'notify']);

function makeAction(type: string, design: Design, screen: Screen): InteractionAction {
  const datasetId = design.datasets[0]?.id || '';
  const targetId = screen.components.find(component => type === 'map-fit' ? component.kind === 'map-view' : ['place-list', 'place-detail'].includes(component.kind))?.id || '';
  const value = { source: 'event', key: type === 'select-place' ? 'placeId' : type === 'open-url' ? 'url' : 'value' };
  switch (type) {
    case 'select-place': case 'set-query': return { type, datasetId, value };
    case 'clear-selection': case 'retry-data': return { type, datasetId };
    case 'set-filter': return { type, datasetId, field: design.datasets[0]?.mapping.category || '', operator: 'eq', value };
    case 'set-filters': return { type, datasetId, value: { source: 'event', key: 'filters' } };
    case 'reset-filters': return { type, datasetId, scope: 'all' };
    case 'open-panel': case 'close-panel': case 'map-fit': case 'map-locate': return { type, targetId };
    case 'map-zoom': return { type, targetId, delta: 1 };
    case 'navigate': return { type, screen: { source: 'literal', value: design.initialScreenId } };
    case 'go-back': return { type, fallbackScreenId: design.initialScreenId };
    case 'open-url': return { type, value, newTab: true };
    case 'notify': return { type, targetId, message: '操作しました', tone: 'info' };
    default: return { type };
  }
}

function App() {
  const history = useHistory(initial);
  const design = history.present;
  const [device, setDevice] = useState<Device>('desktop');
  const [mode, setMode] = useState<Mode>('edit');
  const [sideTab, setSideTab] = useState<'parts' | 'layers' | 'data' | 'theme'>('parts');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('appearance');
  const [selected, setSelected] = useState<string[]>([]);
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  const [fitZoom, setFitZoom] = useState(.5);
  const [editorScreenId, setEditorScreenId] = useState(design.initialScreenId);
  const [preview, setPreview] = useState<PreviewState>(() => initialPreview(design.screens[0], 'desktop'));
  const [showDataImport, setShowDataImport] = useState(false);
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [inlineEditing, setInlineEditing] = useState<{ id: string; field: string } | null>(null);
  const [hand, setHand] = useState(false), [spacePan, setSpacePan] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [snap, setSnap] = useState(true), [grid, setGrid] = useState(false);
  const [autoLayout, setAutoLayout] = useState(false);
  const transition = preview.transition || noTransition, transitionToken = preview.navigationToken || 0;
  const [, refreshHandles] = useState(0);
  useEffect(() => { const tick = requestAnimationFrame(() => refreshHandles(value => value + 1)); return () => cancelAnimationFrame(tick); }, [selected, device, mode, design]);
  const keyboardDraft = useRef<Design | null>(null);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<{ design: Design; diff: string[] } | null>(null);
  const [savedReady, setSavedReady] = useState(false);
  const [saveBlocked, setSaveBlocked] = useState(false);
  const [saveStatus, setSaveStatus] = useState('読み込み中');
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [partQuery, setPartQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; ids: string[] } | null>(null);
  const [colorSelection, setColorSelection] = useState<string[] | null>(null);
  const originalMap = useRef<HTMLDialogElement>(null);
  const designInput = useRef<HTMLInputElement>(null);
  const contextTrigger = useRef<HTMLElement | null>(null);
  const inspectorScroll = useRef<HTMLDivElement>(null);
  useEffect(() => { inspectorScroll.current?.scrollTo(0, 0); }, [selected[0], settingsTab]);
  const panelLayout = useRef<Record<string,number> | undefined>((() => { try { const value=JSON.parse(localStorage.getItem(storageKey) || 'null'); return value && ['library','canvas','inspector'].every(key => typeof value[key] === 'number' && value[key] > 0 && value[key] < 100) ? value : undefined; } catch { return undefined; } })());
  const librarySplit = useRef<Record<string,number> | undefined>((() => {try {const value=JSON.parse(localStorage.getItem('machi-sketch-library-split-v1') || 'null'); return value && ['catalog','layers'].every(key => Number.isFinite(value[key]) && value[key] > 0 && value[key] < 100) ? value : undefined;} catch {return undefined;} })());
  const stageScroll = useRef<HTMLDivElement>(null);
  const panelGroup = useGroupRef();
  const screenId = mode === 'preview' ? preview.activeScreenId : editorScreenId;
  const screen = design.screens.find(item => item.id === screenId) || design.screens[0];
  const dataset = design.datasets[0];
  const frame = screen.frames[device] || screen.frames.desktop;
  const zoom = manualZoom ?? fitZoom;
  const selectedComponent = screen.components.find(component => component.id === selected[0]);
  const handleItems = !protectedSelection(screen, selected) ? roots(screen, selected).flatMap(component => {
    const target = stageScroll.current?.querySelector<HTMLElement>(`[data-component-id="${CSS.escape(component.id)}"]`);
    return target && component.layouts?.[device] ? [{ id: component.id, target, layout: component.layouts?.[device]!, group: component.editor?.group }] : [];
  }) : [];
  const screenComponents = screen.components;
  const commitDesign = (next: Design) => {
    const checked = validateDesign(next);
    if (!checked.design) { setNotice(`変更できません: ${checked.errors.slice(0, 2).join(' / ')}`); return; }
    setSaveBlocked(false); keyboardDraft.current = null; history.commit(checked.design);
  };
  const execute = (command: EditorCommand, ids = selected, stage = false) => {
    const result = applyCommand(stage && keyboardDraft.current || design, screen.id, device, ids, command);
    if (result.warnings.length) setNotice(result.warnings.join(' / '));
    if (result.design !== design) {
      if (stage) { keyboardDraft.current = result.design; history.stage(result.design); }
      else commitDesign(result.design);
    }
    setSelected(result.selection);
  };
  const finishKeys = () => { keyboardDraft.current = null; history.finish(); };
  useEffect(() => {
    const finish = () => { keyboardDraft.current = null; history.finish(); setSpacePan(false); pan.current = null; };
    window.addEventListener('blur', finish);
    return () => window.removeEventListener('blur', finish);
  }, []);
  useEffect(() => { setClipboard(null); }, [design.id]);
  useEffect(() => { setEditingGroupId(null); setInlineEditing(null); setPanOffset({ x: 0, y: 0 }); }, [editorScreenId, device, mode]);
  useEffect(() => { if (editingGroupId && !screen.components.some(component => component.id === editingGroupId)) setEditingGroupId(null); }, [screen, editingGroupId]);
  const undoDesign = () => { setSaveBlocked(false); history.undo(); };
  const redoDesign = () => { setSaveBlocked(false); history.redo(); };

  useEffect(() => {
    let active = true;
    readSavedDesign().then(value => {
      if (!active || !value) return;
      const result = validateDesign(value);
      if (result.design) {
        history.reset(result.design);
        setEditorScreenId(result.design.initialScreenId);
        setPreview(initialPreview(result.design.screens.find(item => item.id === result.design!.initialScreenId)!, 'desktop'));
        setSaveStatus('保存済みの設計を復元');
      } else {
        setSaveBlocked(true);
        setNotice(`保存データを復元できませんでした: ${result.errors.slice(0, 2).join(' / ')}`);
        setSaveStatus('保存データを確認してください');
      }
    }).catch(() => { if (active) setSaveStatus('ブラウザー保存は利用できません'); })
      .finally(() => { if (active) setSavedReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!savedReady || saveBlocked || history.staging) return;
    const timer = window.setTimeout(() => {
      setSaveStatus('保存中');
      writeSavedDesign(history.confirmed).then(() => setSaveStatus('保存済み')).catch(() => setSaveStatus('保存失敗'));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [history.confirmed, history.staging, savedReady, saveBlocked]);

  useEffect(() => {
    const host = stageScroll.current;
    if (!host) return;
    const fit = () => {
      const stage = host.querySelector<HTMLElement>('.stage');
      if (!stage || host.clientWidth <= 64 || host.clientHeight <= 64) return;
      const padding = getComputedStyle(host);
      const margin = getComputedStyle(stage);
      const pixels = (value: string) => Number.parseFloat(value) || 0;
      const availableWidth = host.clientWidth - pixels(padding.paddingLeft) - pixels(padding.paddingRight);
      const availableHeight = host.clientHeight - pixels(padding.paddingTop) - pixels(padding.paddingBottom) - pixels(margin.marginTop) - pixels(margin.marginBottom);
      setFitZoom(Math.max(.1, Math.min(availableWidth / frame.width, availableHeight / frame.height, 1)));
    };
    const observer = new ResizeObserver(fit);
    observer.observe(host); fit();
    return () => observer.disconnect();
  }, [frame.width, frame.height, mode, leftOpen, rightOpen]);

  useEffect(() => {
    if (!design.screens.some(item => item.id === editorScreenId)) setEditorScreenId(design.initialScreenId);
    if (!design.screens.some(item => item.id === preview.activeScreenId)) setPreview(current => ({ ...current, activeScreenId: design.initialScreenId, screenHistory: [] }));
    const valid = new Set(screen.components.map(component => component.id));
    setSelected(current => current.filter(id => valid.has(id)));
  }, [design, editorScreenId, preview.activeScreenId, screen]);

  useEffect(() => {
    const host = stageScroll.current;
    if (!host || mode === 'prompt' || mode === 'flow') return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const stage = host.querySelector<HTMLElement>('.stage'), canvas = host.querySelector<HTMLElement>('.frame');
      if (!stage || !canvas) return;
      const before = canvas.getBoundingClientRect(), anchorX = (event.clientX - before.left) / zoom, anchorY = (event.clientY - before.top) / zoom;
      const next = Math.max(.1, Math.min(2, zoom * Math.exp(-event.deltaY * .002)));
      setManualZoom(next);
      requestAnimationFrame(() => { const after = canvas.getBoundingClientRect(); setPanOffset(current => ({ x: current.x + event.clientX - after.left - anchorX * next, y: current.y + event.clientY - after.top - anchorY * next })); });
    };
    host.addEventListener('wheel', wheel, { passive: false });
    return () => host.removeEventListener('wheel', wheel);
  }, [mode, zoom]);

  const searchFieldsByDataset = useMemo(() => Object.fromEntries(design.datasets.map(item => {
    const declared = screen.components.filter(component => component.kind === 'place-search' && component.binding?.datasetId === item.id)
      .flatMap(component => Array.isArray(component.props.searchFields) ? component.props.searchFields.filter((field): field is string => typeof field === 'string') : []);
    const fallback = [item.mapping.name, item.mapping.location, item.mapping.description].filter((field): field is string => Boolean(field));
    return [item.id, declared.length ? declared : fallback];
  })), [design.datasets, screen.components]);

  const rowsByDataset = useMemo(() => Object.fromEntries(design.datasets.map(item => [item.id, visibleRows(
    item, preview.queries[item.id] || '', preview.filters[item.id] || [], searchFieldsByDataset[item.id] || [],
  )])), [design.datasets, preview.queries, preview.filters, searchFieldsByDataset]);

  useEffect(() => {
    for (const item of design.datasets) {
      const selectedId = preview.selected[item.id];
      if (selectedId && !(rowsByDataset[item.id] || []).some(row => row.id === selectedId)) {
        setPreview(current => ({
          ...current,
          selected: { ...current.selected, [item.id]: null },
          openPanels: Object.fromEntries(Object.entries(current.openPanels).map(([id, isOpen]) => {
            const component = screen.components.find(candidate => candidate.id === id);
            return [id, component?.kind === 'place-detail' && component.binding?.datasetId === item.id ? false : isOpen];
          })),
        }));
      }
    }
  }, [design.datasets, preview.selected, rowsByDataset, screen.components]);

  const commitComponent = (id: string, update: (component: Component) => Component) => {
    commitDesign({ ...design, screens: design.screens.map(item => item.id !== screen.id ? item : {
      ...item, components: item.components.map(component => component.id === id ? update(component) : component),
    }) });
  };
  const commitLayout = (id: string, patch: Partial<Layout>) => execute({ type: 'layout', patches: { [id]: patch } }, [id]);
  const commitProps = (id: string, key: string, value: unknown) => commitComponent(id, component => ({ ...component, props: { ...component.props, [key]: value } }));
  const commitStyle = (id: string, key: string, value: unknown) => {
    const bounded = typeof value === 'number' ? Math.min(key === 'fontSize' ? 72 : key === 'borderWidth' ? 8 : 96, Math.max(key === 'fontSize' ? 10 : 0, value)) : value;
    execute({ type: 'style', patch: { [key]: bounded } }, [id]);
  };

  const setPanel = (id: string, open: boolean) => setPreview(current => ({ ...current, openPanels: { ...current.openPanels, [id]: open } }));
  const dispatch = (component: Component, event: string, payload: Record<string, unknown> = {}) => {
    const interactions = component.interactions.filter(item => item.event === event);
    if (!interactions.length) return;
    const unsupported = interactions.flatMap(item => item.actions).filter(action => !actionOptions.some(([type]) => type === action.type));
    if (unsupported.length) setNotice('未対応の動作があります: ' + unsupported.map(action => action.type).join('、'));
    const owningDataset = component.binding?.datasetId || dataset.id;
    const selectedRow = design.datasets.find(item => item.id === owningDataset)?.rows.find(row => row.id === preview.selected[owningDataset]);
    const actionPayload = { ...payload, selectedPlace: selectedRow?.values };
    for (const action of interactions.flatMap(item => item.actions)) {
      if (action.type === 'open-url') {
        const value = eventValue(action.value, actionPayload);
        if (typeof value === 'string') {
          try { const url = new URL(value); if (url.protocol === 'https:' || url.protocol === 'http:') window.open(url.href, action.newTab === false ? '_self' : '_blank', 'noopener,noreferrer'); } catch { /* invalid URL is ignored */ }
        }
      }
    }
    setPreview(current => applyPreviewActions(current, design, screen, device, owningDataset, interactions.flatMap(item => item.actions), payload, actionPayload));
  };

  const download = (name: string, text: string, type: string) => {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportMap = async () => {
    try { setNotice('閲覧用の地図を作成中…'); const html = await buildMapHtml(design); download(`${design.id}.html`, html, 'text/html;charset=utf-8'); setNotice('地図HTMLをダウンロードしました。ブラウザーで開けます。背景地図・写真には通信が必要です。'); } catch (error) { setNotice(error instanceof Error ? error.message : '地図を書き出せませんでした'); }
  };
  const exportDesign = () => download(`${design.id}.machi.json`, `${JSON.stringify(design, null, 2)}\n`, 'application/json');
  const exportPrompt = (text: string) => { download(`${design.id}-implementation.md`, text, 'text/markdown;charset=utf-8'); setNotice('Markdownの保存を開始しました'); };
  const copyPrompt = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setNotice('実装指示をコピーしました'); }
    catch { setNotice('コピーできませんでした。全文欄からコピーしてください'); }
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setNotice('8MBを超える設計は読み込めません'); return; }
    try {
      const result = validateDesign(JSON.parse(await file.text()));
      if (!result.design) { setNotice(`読み込みを中止: ${result.errors.slice(0, 5).join(' / ')}`); return; }
      setPending({ design: result.design, diff: describeDiff(design, result.design) });
    } catch { setNotice('JSONの構文を読めませんでした'); }
  };
  const addComponent = (kind: string, position?: { x: number; y: number }) => {
    const component = createComponent(kind, design, screen);
    if (!component) return;
    if (position && component.layouts?.[device]) component.layouts[device] = { ...component.layouts?.[device]!, x: Math.max(0, Math.min(frame.width - component.layouts?.[device]!.width, position.x)), y: Math.max(0, Math.min(frame.height - component.layouts?.[device]!.height, position.y)) };
    commitDesign({ ...design, screens: design.screens.map(item => item.id === screen.id ? { ...item, components: [...item.components, component] } : item) });
    setSelected([component.id]); setRightOpen(true); setSettingsTab('appearance'); setMode('edit');
  };
  const deleteSelected = () => execute({ type: 'delete' });
  const duplicateSelected = () => execute({ type: 'duplicate' });
  const copySelected = (ids = selected) => { if (ids.length) { setClipboard(copyComponents(design, screen.id, ids)); setNotice('部品をコピーしました。同じプロジェクト内で貼り付けできます'); } };
  const selectComponent = (id: string, extend: boolean) => {
    setSelected(current => extend ? current.includes(id) ? current.filter(value => value !== id) : [...current, id] : [id]);
    setRightOpen(true);
  };
  const restoreContextFocus = () => requestAnimationFrame(() => {
    const trigger = contextTrigger.current;
    (trigger?.isConnected ? trigger : stageScroll.current)?.focus({ preventScroll: true });
  });
  const closeContextMenu = (restoreFocus = true) => {
    setContextMenu(null);
    if (restoreFocus) restoreContextFocus();
  };
  const openContextMenu = (event: React.MouseEvent | React.KeyboardEvent) => {
    if (mode !== 'edit' || colorSelection || !(event.target instanceof Element)) return;
    if (event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
    const target = event.target.closest<HTMLElement>('[data-component-id],[data-layer-id]');
    if (!target && !event.target.closest('.stage-scroll')) return;
    event.preventDefault(); event.stopPropagation();
    const id = target?.dataset.componentId || target?.dataset.layerId;
    const ids = id ? selected.includes(id) ? selected : [id] : [];
    if (id) { setSelected(ids); setRightOpen(true); }
    contextTrigger.current = target || stageScroll.current;
    const rect = contextTrigger.current!.getBoundingClientRect();
    const pointer = 'clientX' in event && (event.clientX !== 0 || event.clientY !== 0);
    setContextMenu({ x: pointer ? event.clientX : rect.left + 16, y: pointer ? event.clientY : rect.top + 16, ids });
  };
  const contextComponents = screen.components.filter(component => contextMenu?.ids.includes(component.id));
  const contextLayouts = contextComponents.filter(component => component.layouts?.[device]);
  const allHidden = contextLayouts.length > 0 && contextLayouts.every(component => component.layouts?.[device]!.hidden);
  const contextLocked = protectedSelection(screen, contextMenu?.ids || []);
  const menuItems: MenuItem[] = contextMenu?.ids.length ? [
    { action: 'copy', label: 'コピー' },
    { action: 'paste', label: '貼り付け', disabled: !clipboard },
    { action: 'duplicate', label: '複製' },
    { action: 'lock', label: contextComponents.every(component => component.editor?.locked) ? 'ロック解除' : '位置をロック' },
    { action: contextComponents.length === 1 && contextComponents[0].editor?.group ? 'ungroup' : 'group', label: contextComponents.length === 1 && contextComponents[0].editor?.group ? 'グループ解除' : 'グループ化', disabled: contextLocked || !contextComponents[0]?.editor?.group && !!groupingReason(screen, contextMenu?.ids || []) },
    { action: 'color', label: '色を変更…' },
    { action: 'front', label: '最前面へ移動', disabled: !contextLayouts.length },
    { action: 'back', label: '最背面へ移動', disabled: !contextLayouts.length },
    { action: 'visibility', label: allHidden ? 'この端末で表示' : 'この端末で非表示', disabled: !contextLayouts.length },
    { action: 'delete', label: contextLocked ? '削除（ロック中）' : '削除', danger: true, disabled: contextLocked },
  ] : [
    { action: 'paste', label: '貼り付け', disabled: !clipboard },
    { action: 'select-all', label: 'すべて選択', disabled: !screenComponents.length },
    { action: 'fit', label: '全体表示' },
    { action: 'undo', label: '元に戻す', disabled: !history.past.length },
    { action: 'redo', label: 'やり直す', disabled: !history.future.length },
  ];
  const runContextAction = (action: MenuAction) => {
    if (!contextMenu) return;
    const ids = contextMenu.ids;
    closeContextMenu(action !== 'color');
    if (action === 'copy') copySelected(ids);
    if (action === 'paste' && clipboard) execute({ type: 'paste', clipboard });
    if (action === 'lock') execute({ type: 'lock', locked: !contextComponents.every(component => component.editor?.locked) }, ids);
    if (action === 'group' || action === 'ungroup') execute({ type: action }, ids);
    if (action === 'duplicate') duplicateSelected();
    if (action === 'delete') deleteSelected();
    if (action === 'color') setColorSelection(ids);
    if (action === 'fit') (setManualZoom(null), setPanOffset({ x: 0, y: 0 }));
    if (action === 'undo') undoDesign();
    if (action === 'redo') redoDesign();
    if (action === 'select-all') { setSelected(screenComponents.map(component => component.id)); setRightOpen(true); }
    if (action === 'visibility') execute({ type: 'visibility', hidden: !allHidden }, ids);
    if (action === 'front' || action === 'back') execute({ type: action }, ids);
  };
  const colorComponents = screen.components.filter(component => colorSelection?.includes(component.id));
  const componentColors = (component: Component): Colors => {
    const style = resolveAppearance(design, component);
    return {
      background: String(style.background || (component.kind === 'floating-action' ? design.theme?.accent || '#7952b3' : '#ffffff')),
      color: String(style.color || (component.kind === 'floating-action' ? '#ffffff' : design.theme?.foreground || '#332b43')),
      borderColor: String(style.borderColor || '#e6deef'),
    };
  };

  const addScreen = () => {
    const next = createScreen(design);
    commitDesign({ ...design, screens: [...design.screens, next] });
    setEditorScreenId(next.id); setSelected([]); setSideTab('parts'); setMode('edit');
  };

  const startPreview = () => {
    const activeScreen = design.screens.find(item => item.id === editorScreenId) || design.screens[0];
    setPreview(initialPreview(activeScreen, device)); setMode('preview');
  };
  const switchDevice = (nextDevice: Device) => {
    setDevice(nextDevice);
    if (mode === 'preview') {
      const activeScreen = design.screens.find(item => item.id === preview.activeScreenId) || design.screens[0];
      setPreview(current => ({ ...current, openPanels: initialPreview(activeScreen, nextDevice).openPanels }));
    }
  };
  const updateInteraction = (componentId: string, index: number, update: (interaction: Interaction) => Interaction) => commitComponent(componentId, component => ({
    ...component, interactions: component.interactions.map((interaction, current) => current === index ? update(interaction) : interaction),
  }));
  const addInteraction = (component: Component) => {
    const options = eventOptions[component.kind] || [];
    const event = options.find(name => !component.interactions.some(interaction => interaction.event === name));
    if (!event) return;
    commitComponent(component.id, item => ({ ...item, interactions: [...item.interactions, { event, actions: [] }] }));
  };
  const activeFiltersFor = (component: Component) => preview.filters[component.binding?.datasetId || dataset.id] || [];
  const dataFor = (component: Component) => design.datasets.find(item => item.id === component.binding?.datasetId) || dataset;
  const rowsFor = (component: Component) => rowsByDataset[component.binding?.datasetId || dataset.id] || [];
  const selectedFor = (component: Component) => preview.selected[component.binding?.datasetId || dataset.id] || null;

  const layers = (parentId: string | null = null, depth = 0): React.ReactNode => screen.components.filter(component => component.parentId === parentId).map(component => <React.Fragment key={component.id}><div className="layer-row" style={{ paddingLeft: depth * 12 }}><button data-layer-id={component.id} aria-pressed={selected.includes(component.id)} className={selected.includes(component.id) ? 'selected' : ''} onClick={event => selectComponent(component.id, event.shiftKey || event.ctrlKey || event.metaKey)} onDoubleClick={() => { if (component.editor?.group) setEditingGroupId(component.id); }}><Icon name={component.editor?.group ? 'folder' : partIcons[component.kind] || 'article'} /><span>{component.name}</span>{component.layouts?.[device]?.hidden && <small>非表示</small>}</button><IconButton icon={component.editor?.locked ? 'lock' : 'lock_open'} className="layer-lock" label={`${component.name}の${component.editor?.locked ? 'ロック解除' : '位置をロック'}`} onClick={() => execute({ type: 'lock', locked: !component.editor?.locked }, [component.id])} /></div>{layers(component.id, depth + 1)}</React.Fragment>);
  const keyDown = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest('input,textarea,select,[contenteditable=true],dialog,[role=dialog],[role=menu]') || contextMenu || colorSelection || pending || autoLayout || showDataImport) return;
    if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') { openContextMenu(event); return; }
    const ctrl = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
    if (ctrl && (key === 'z' || key === 'y')) {
      event.preventDefault(); finishKeys();
      key === 'y' || event.shiftKey ? redoDesign() : undoDesign();
      return;
    }
    if (mode === 'preview' && event.key === 'Escape') { const detail = screen.components.find(component => component.kind === 'place-detail' && preview.openPanels[component.id]); if (detail) dispatch(detail, 'close'); return; }
    if (mode !== 'edit' || !target.closest('.stage-scroll,.layers-panel')) return;
    if (ctrl && ['d','c','v','a','g'].includes(key)) {
      event.preventDefault();
      if (key === 'd') duplicateSelected();
      if (key === 'c') copySelected();
      if (key === 'v' && clipboard) execute({ type: 'paste', clipboard });
      if (key === 'a') setSelected(screen.components.filter(component => component.parentId === editingGroupId).map(component => component.id));
      if (key === 'g') execute({ type: event.shiftKey ? 'ungroup' : 'group' });
      return;
    }
    if (ctrl || event.altKey) return;
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) { event.preventDefault(); const step = event.shiftKey ? 10 : 1; execute({ type: 'move', dx: key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0, dy: key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0 }, selected, true); }
    if (key === 'delete' || key === 'backspace') { event.preventDefault(); deleteSelected(); }
    if (key === 'h') setHand(true);
    if (key === 'v') setHand(false);
    if (key === ' ') { event.preventDefault(); setSpacePan(true); }
    if (key === '0') { event.preventDefault(); (setManualZoom(null), setPanOffset({ x: 0, y: 0 })); }
    if (key === 'escape') { setEditingGroupId(screen.components.find(component => component.id === editingGroupId)?.parentId || null); setSelected([]); }
  };
  return <div className="editor" onKeyDown={keyDown} onKeyUp={event => { if (event.key.startsWith('Arrow')) finishKeys(); if (event.key === ' ') setSpacePan(false); }}>
    <dialog ref={originalMap} className="original-map-dialog"><div><strong>当初の牛久市マップ</strong><button onClick={() => originalMap.current?.close()}>閉じる</button></div><iframe title="当初の牛久市マップ" src="../../" loading="lazy" /></dialog>
    <header className="topbar">
      <h1 className="brand">machi<span>.</span></h1>
      <div className="save-state" aria-live="polite"><span className={saveStatus.includes('失敗') ? 'save-dot error' : 'save-dot'} />{saveStatus}</div>
      <nav className="mode-tabs" aria-label="作業モード"><IconButton icon="edit" label="編集" className={mode === 'edit' ? 'active' : ''} aria-pressed={mode === 'edit'} onClick={() => setMode('edit')} /><IconButton icon="play_arrow" label="試す" className={mode === 'preview' ? 'active' : ''} aria-pressed={mode === 'preview'} onClick={startPreview} /></nav>
      <div className="top-actions"><IconButton icon="auto_awesome" label="プロンプト" hint="外部AIへ渡す実装指示を作成" className="prompt-primary" aria-pressed={mode === 'prompt'} onClick={() => setMode('prompt')}><Icon name="auto_awesome" /><span>プロンプト</span></IconButton><div className="header-history" aria-label="編集履歴"><IconButton icon="undo" label="元に戻す" hint={history.past.length ? 'Ctrl / Command + Z' : '元に戻せる操作はありません'} onClick={undoDesign} disabled={!history.past.length} /><IconButton icon="redo" label="やり直す" hint={history.future.length ? 'Ctrl / Command + Shift + Z' : 'やり直せる操作はありません'} onClick={redoDesign} disabled={!history.future.length} /></div>
      <IconButton icon="download" label="地図をダウンロード" onClick={() => void exportMap()} />
      <IconButton icon="web_asset" label="プロジェクト" popoverTarget="project-actions" />
      <div id="project-actions" popover="auto" className="project-actions-menu" aria-label="プロジェクトの操作">
        <button onClick={() => originalMap.current?.showModal()}>当初の牛久市マップを表示</button>
        <button onClick={() => { commitDesign(initial); setEditorScreenId(initial.initialScreenId); setSelected([]); setNotice("牛久市の21地点を読み込みました（2026年10月14日の保存データ）。元に戻す操作で以前の編集に戻れます。"); }}>牛久市マップを編集用に読み込む</button>
        <IconButton icon="save" label="保存" popoverTarget="project-actions" popoverTargetAction="hide" onClick={() => { setSaveBlocked(false); void writeSavedDesign(history.confirmed).then(() => setSaveStatus('保存済み')).catch(() => setSaveStatus('保存失敗')); }} />
        <IconButton icon="reset" label="移行前バックアップを書き出す" popoverTarget="project-actions" popoverTargetAction="hide" onClick={() => void readSavedDesign('pre-v2').then(value => { if (value) download(`${design.id}-before-v2.machi.json`, JSON.stringify(value, null, 2), 'application/json'); else setNotice('v1の移行前バックアップはありません'); }).catch(() => setNotice('バックアップを読み込めません'))} />
        <IconButton icon="download" label="設計JSONを書き出す" popoverTarget="project-actions" popoverTargetAction="hide" onClick={exportDesign} />
        <IconButton icon="upload" label="JSONを読み戻す" popoverTarget="project-actions" popoverTargetAction="hide" onClick={() => designInput.current?.click()} />
        <input hidden ref={designInput} type="file" accept=".json,application/json" onChange={event => { void importFile(event.target.files?.[0]); event.target.value = ''; }} />
      </div></div>
    </header>
    <div className={`editor-body mode-${mode}`} onContextMenu={openContextMenu}>
      {mode === 'edit' && <nav className="tool-rail" aria-label="編集ツール">{([['parts','grid_view','部品'],['layers','layers','構造'],['data','database','データ'],['theme','palette','テーマ']] as const).map(([tab,icon,label]) => <IconButton key={tab} icon={icon} label={label} className={leftOpen && sideTab === tab ? 'active' : ''} aria-pressed={leftOpen && sideTab === tab} onClick={() => { setSideTab(tab); setLeftOpen(true); }} />)}<IconButton icon="account_tree" label="フロー" onClick={() => setMode('flow')} /></nav>}
      <Group key={`${leftOpen}-${rightOpen}-${mode}`} className="workspace" orientation="horizontal" groupRef={panelGroup} defaultLayout={leftOpen && rightOpen && mode === 'edit' ? panelLayout.current : undefined} onLayoutChanged={layout => { if (mode === 'edit' && leftOpen && rightOpen && ['library','canvas','inspector'].every(key => layout[key] > 0)) { panelLayout.current=layout; try { localStorage.setItem(storageKey, JSON.stringify(layout)); } catch {} } }}>
      {mode === 'edit' && leftOpen && <><Panel id="library" defaultSize="20%" minSize="220px" maxSize="400px" className="library-panel">
        <div className="panel-title"><strong>{sideTab === 'parts' ? '部品' : sideTab === 'layers' ? '構造' : sideTab === 'theme' ? 'テーマ' : '地点データ'}</strong><IconButton icon="chevron_left" label="左パネルを閉じる" onClick={() => setLeftOpen(false)} /></div>
        {sideTab === 'theme' ? <ThemePanel design={design} onChange={commitDesign} /> : sideTab === 'data' ? <div className="library-content"><h2>{dataset.name}</h2><p>{dataset.rows.length}地点・{publicColumns(dataset).length}公開列</p><IconButton icon="upload" label="地点データを取り込む" className="primary-button" onClick={() => setShowDataImport(true)} /><p className="hint">掲載する列と不正な行を確認してから反映します。</p><ul className="column-summary">{dataset.columns.map(column => <li key={column.key}>{column.label}<small>{column.visibility === 'public' ? '掲載' : '内部'}</small></li>)}</ul></div> : <>
        {sideTab === 'parts' ? <Group orientation="vertical" className="library-split" defaultLayout={librarySplit.current} onLayoutChanged={layout => { if (layout.catalog > 0 && layout.layers > 0) { librarySplit.current=layout; try {localStorage.setItem('machi-sketch-library-split-v1',JSON.stringify(layout));} catch {} } }}><Panel id="catalog" defaultSize="62%" minSize="140px"><div className="library-content catalog"><label className="part-search"><Icon name="search" /><input aria-label="部品を探す" placeholder="部品を探す" value={partQuery} onChange={e => setPartQuery(e.target.value)} /></label>{[['地図・検索',['map-view','place-search','category-chips','result-count']],['情報表示',['place-list','place-detail']],['基本',['app-header','floating-action','text']]].map(([label,kinds]) => { const items=(kinds as string[]).filter(kind => partNames[kind].includes(partQuery.trim()));return items.length ? <section className="catalog-group" key={label as string}><h2>{label as string}</h2><div className="part-grid">{items.map(kind => <IconButton key={kind} icon={partIcons[kind]} label={partNames[kind]} hint="クリックで追加・ドラッグで配置" draggable onDragStart={e => e.dataTransfer.setData('application/x-machi-component',kind)} onClick={() => addComponent(kind)} />)}</div></section> : null; })}{!firstFlowKinds.some(kind => partNames[kind].includes(partQuery.trim())) && <p>該当する部品がありません。</p>}</div></Panel><Separator className="library-height-handle" aria-label="部品一覧と配置済みの高さを変更" /><Panel id="layers" minSize="120px"><section className="layers-panel"><h2>配置済み <small>{screenComponents.length}</small></h2><div className="layer-list">{layers()}</div></section></Panel></Group> : <section className="layers-panel"><h2>配置済み <small>{screenComponents.length}</small></h2><div className="layer-list">{layers()}</div></section>}</>}
        <div className="side-footer">{dataset.rows.length}地点 · {publicColumns(dataset).length}公開列</div>
      </Panel><Separator className="splitter" aria-label="部品パネルの幅を変更" /></>}
      <Panel id="canvas" minSize="360px" className="canvas-panel">
        {mode === 'prompt' ? <PromptWorkspace design={design} screenId={editorScreenId} onCopy={text => void copyPrompt(text)} onSave={exportPrompt} /> : mode === 'flow' ? <FlowPanel design={design} onOpen={(id, componentId) => { setEditorScreenId(id); setSelected(componentId ? [componentId] : []); setSettingsTab('behavior'); setMode('edit'); setRightOpen(true); }} /> : <>
          <div className="canvas-toolbar"><div className="canvas-controls">{mode === 'edit' && !rightOpen && <IconButton icon="settings" label="設定パネルを開く" onClick={() => setRightOpen(true)} />}<label className="screen-select">画面<select value={screen.id} onChange={event => { setSelected([]); if (mode === 'preview') setPreview(current => ({ ...current, activeScreenId: event.target.value })); else setEditorScreenId(event.target.value); }}>{design.screens.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><IconButton icon="add" label="画面を追加" onClick={addScreen} /><div className="device-tabs"><IconButton icon="desktop" label="PC" aria-pressed={device === 'desktop'} onClick={() => switchDevice('desktop')} /><IconButton icon="smartphone" label="スマホ" aria-pressed={device === 'mobile'} onClick={() => switchDevice('mobile')} /></div></div><div className="zoom-control"><select aria-label="表示倍率" value={manualZoom === null ? 'fit' : String(manualZoom)} onChange={event => setManualZoom(event.target.value === 'fit' ? null : Number(event.target.value))}><option value="fit">全体 ({Math.round(fitZoom * 100)}%)</option><option value="0.1">10%</option><option value="0.25">25%</option><option value="0.5">50%</option><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="2">200%</option>{manualZoom !== null && ![.1,.25,.5,1,1.25,1.5,2].includes(manualZoom) && <option value={manualZoom}>{Math.round(manualZoom * 100)}%</option>}</select><IconButton icon="fit" label="全体表示" hint="0" onClick={() => (setManualZoom(null), setPanOffset({ x: 0, y: 0 }))} /></div></div>
          {mode === 'edit' && <div className="canvas-edit-tools"><div className="tool-pair"><IconButton icon="near_me" label="選択" hint="V" aria-pressed={!hand} onClick={() => setHand(false)} /><IconButton icon="pan_tool" label="手のひら" hint="H・Space長押し" aria-pressed={hand} onClick={() => setHand(true)} /></div><label><input type="checkbox" checked={snap} onChange={event => setSnap(event.target.checked)} />吸着</label><label><input type="checkbox" checked={grid} onChange={event => setGrid(event.target.checked)} />4pxグリッド</label><IconButton icon="grid_view" label="自動配置" hint="配置案をプレビュー" onClick={() => { finishKeys(); setAutoLayout(true); }} />{editingGroupId && <IconButton icon="back" label="グループの外へ" hint="Esc" onClick={() => { setEditingGroupId(screen.components.find(component => component.id === editingGroupId)?.parentId || null); setSelected([]); }} />}</div>}
          <div className={`stage-scroll ${hand || spacePan ? 'hand-tool' : ''}`} ref={stageScroll} tabIndex={0} onPointerDown={event => {
            if (event.button === 0) event.currentTarget.focus({ preventScroll: true });
            if ((hand || spacePan) && event.button === 0) { pan.current = { x: event.clientX, y: event.clientY, left: panOffset.x, top: panOffset.y }; event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); }
          }} onPointerMove={event => { if (pan.current) { setPanOffset({ x: pan.current.left + event.clientX - pan.current.x, y: pan.current.top + event.clientY - pan.current.y }); } }} onPointerUp={event => { pan.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { pan.current = null; }} aria-label="編集キャンバス" onDragOver={event => { if (mode === 'edit') event.preventDefault(); }} onDrop={event => { event.preventDefault(); const kind = event.dataTransfer.getData('application/x-machi-component'); if (mode === 'edit' && firstFlowKinds.includes(kind)) { const rect=event.currentTarget.querySelector('.frame')?.getBoundingClientRect(); if(rect) addComponent(kind,{x:Math.round((event.clientX-rect.left)/zoom),y:Math.round((event.clientY-rect.top)/zoom)}); } }}><div className="stage" style={{ width: frame.width * zoom, height: frame.height * zoom, translate: `${panOffset.x}px ${panOffset.y}px` }}><div key={mode === 'preview' ? transitionToken : 'edit'} className={`frame ${mode === 'edit' ? 'frame-edit' : 'preview-enter'} ${grid && mode === 'edit' ? 'show-grid' : ''}`} data-transition={mode === 'preview' ? transition.type : undefined} style={{ '--transition-duration': `${transition.durationMs}ms`, '--slide-x': transition.direction === 'left' ? '36px' : transition.direction === 'right' ? '-36px' : '0px', '--slide-y': transition.direction === 'up' ? '36px' : transition.direction === 'down' ? '-36px' : '0px', background: String(design.theme?.background || '#ffffff'), width: frame.width, height: frame.height, transform: `scale(${zoom})`, '--accent': String(design.theme?.accent || '#7952b3'), '--surface': String(design.theme?.background || '#ffffff'), '--foreground': String(design.theme?.foreground || '#332b43'), '--accent-contrast': design.theme?.mode === 'dark' ? '#201626' : '#ffffff' } as React.CSSProperties} onPointerDown={event => { if (event.button === 0 && event.target === event.currentTarget) setSelected([]); }}>
            <CanvasTree design={design} screen={screen} device={device} mode={mode === 'preview' ? 'preview' : 'edit'} selected={selected} editingGroupId={editingGroupId} hand={hand || spacePan} openPanels={preview.openPanels} onSelect={(id, extend) => { if (extend || !selected.includes(id)) selectComponent(id, extend); }} onEnter={id => { setEditingGroupId(id); setSelected([]); }} content={(component, directText) => {
              const componentDataset = dataFor(component);
              const inlineText = directText ? { activeField: inlineEditing?.id === component.id ? inlineEditing.field : undefined, start: (field: string) => { setSelected([component.id]); setRightOpen(true); setInlineEditing({ id: component.id, field }); }, finish: (field: string, value: string | null) => { setInlineEditing(null); if (value !== null && value !== String(component.props[field] ?? '')) commitProps(component.id, field, value); if (value === null) requestAnimationFrame(() => stageScroll.current?.focus({ preventScroll: true })); } } : undefined;
              return <ComponentContent design={design} component={component} dataset={componentDataset} rows={rowsFor(component)} mode={mode === 'preview' ? 'preview' : 'edit'} query={preview.queries[componentDataset.id] || ''} activeFilters={activeFiltersFor(component)} selectedId={selectedFor(component)} fitToken={preview.mapFit[component.id] || 0} device={device} openPanels={preview.openPanels} dispatch={dispatch} closePanel={id => setPanel(id, false)} inlineText={inlineText} />;
            }} />
            {mode === 'edit' && !inlineEditing && !hand && !spacePan && handleItems.length > 0 && <LayoutHandles key={`${handleItems.map(item => item.id).join('-')}-${device}-${zoom}`} items={handleItems} frame={parentFrame(screen, roots(screen, selected)[0], device)} snap={snap} commit={patches => execute({ type: 'layout', patches })} />}
          </div></div></div>
          {mode === 'edit' && !hand && !spacePan && <Selecto dragContainer=".stage-scroll" selectableTargets={['.canvas-component[data-selectable=true]']} selectByClick={false} selectFromInside={false} preventDragFromInside hitRate={5} onDragStart={event => { if (event.inputEvent?.button === 2 || (event.inputEvent?.target as Element)?.closest('.moveable-control-box, input, textarea, [contenteditable=true]')) event.stop(); }} onSelectEnd={event => { if (event.selected.length) setSelected(event.selected.map(element => element.getAttribute('data-component-id') || '').filter(Boolean)); }} />}
          <div className="canvas-status"><span>{mode === 'edit' ? inlineEditing ? '文字を編集中 · 入力を終えると確定 · Escで取り消し' : '編集: 部品を選択・移動。右クリックで複製・色変更など' : '試す: 検索、絞り込み、地点選択を操作できます'}</span><span title={overflowWarnings(screen, device).join(' / ')}>{overflowWarnings(screen, device).length > 0 ? `⚠ はみ出し ${overflowWarnings(screen, device).length}件 · ` : ''}{frame.width} × {frame.height} · {device === 'desktop' ? 'PC' : 'スマホ'}</span></div>
        </>}
      </Panel>
      {mode === 'edit' && rightOpen && <><Separator className="splitter" aria-label="設定パネルの幅を変更" /><Panel id="inspector" defaultSize="23%" minSize="290px" maxSize="440px" className="inspector-panel"><span className="close-inspector"><IconButton icon="close" label="設定パネルを閉じる" onClick={() => setRightOpen(false)} /></span><div className="inspector-content" ref={inspectorScroll}>{selectedComponent ? <>
            <SelectionTools screen={screen} ids={selected} device={device} onCommand={execute} />
            {selected.length > 1 ? <div className="multi-select-note"><strong>{selected.length}部品を選択中</strong><p>選択した部品を、相対位置を保って移動できます。右クリックで色・コピー・ロックも操作できます。</p><IconButton icon="copy" label="選択を複製" onClick={duplicateSelected} /><IconButton icon="delete" label="選択を削除" className="danger" disabled={protectedSelection(screen, selected)} hint={protectedSelection(screen, selected) ? 'ロックされた部品を含みます' : undefined} onClick={deleteSelected} /></div> : <>
              <div className="settings-head"><span className="eyebrow">COMPONENT</span><h2>{selectedComponent.name}</h2><small>選択中の部品</small></div>
              <NoteField key={selectedComponent.id} label="部品の実装仕様メモ" value={selectedComponent.implementationNote} onCommit={value => commitComponent(selectedComponent.id, item => ({ ...item, implementationNote: value }))} />
              <div className="settings-tabs"><IconButton icon="palette" label="見た目" aria-pressed={settingsTab === 'appearance'} onClick={() => setSettingsTab('appearance')} /><IconButton icon="bolt" label="動作" aria-pressed={settingsTab === 'behavior'} onClick={() => setSettingsTab('behavior')} /><IconButton icon="database" label="データ" aria-pressed={settingsTab === 'data'} onClick={() => setSettingsTab('data')} /></div>
              {settingsTab === 'appearance' ? <>
                {(selectedComponent.kind === 'place-detail' || selectedComponent.kind === 'place-list') && <section className="property-section"><h3>内容</h3>{(() => { const data=dataFor(selectedComponent); const image=data.rows[0]?.values[String(selectedComponent.props.imageField)]; return <>{typeof image === 'string' && /^https?:\/\//.test(image) && <img className="inspector-photo" src={image} alt="掲載写真の見本" />}<label className="setting-field">写真の列<select value={String(selectedComponent.props.imageField || '')} onChange={e => commitProps(selectedComponent.id, 'imageField', e.target.value || null)}><option value="">写真を使わない</option>{publicColumns(data).filter(c => /image|photo|写真/i.test(c.key)).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label><span className="property-label">表示する項目</span><div className="display-field-list">{publicColumns(data).filter(c => !['lat','lon','image','sourceUrl'].includes(c.key)).map(c => <label key={c.key}><input type="checkbox" checked={(selectedComponent.props.displayFields as string[] || []).includes(c.key)} onChange={e => {const current=selectedComponent.props.displayFields as string[] || [];commitProps(selectedComponent.id, 'displayFields', e.target.checked ? [...current,c.key] : current.filter(f => f !== c.key));}} />{c.label}</label>)}</div></>; })()}</section>}
                <h3 className="property-heading">配置・表示</h3>

                
                {selectedComponent.layouts?.[device] ? <div className="fields">{(['x', 'y', 'width', 'height'] as const).map(key => <label key={key}>{({ x: 'X位置', y: 'Y位置', width: '幅', height: '高さ' })[key]}<input type="number" disabled={protectedSelection(screen, [selectedComponent.id]) || !!selectedComponent.editor?.group && (key === 'width' || key === 'height')} value={selectedComponent.layouts?.[device]![key]} onChange={event => commitLayout(selectedComponent.id, { [key]: Number(event.target.value) })} /></label>)}</div> : <div className="empty-settings"><p>この端末には配置がありません。</p><IconButton icon="copy" label="PC配置を複製" onClick={() => commitLayout(selectedComponent.id, { ...(selectedComponent.layouts?.desktop || { x: 16, y: 16, width: 280, height: 120, zIndex: 1, hidden: false, presentation: 'inline' }) })} /></div>}
                <div className="presentation-picker"><span className="property-label">表示形式</span><div>{(['inline','panel','bottom-sheet'] as const).map((value,index) => <IconButton key={value} icon={['web_asset','article','smart_button'][index]} label={['インライン','パネル','ボトムシート'][index]} aria-pressed={selectedComponent.layouts?.[device]?.presentation === value} onClick={() => commitLayout(selectedComponent.id,{presentation:value})} />)}</div></div><div className="fields"><label>重なり順<input type="number" value={selectedComponent.layouts?.[device]?.zIndex ?? 1} onChange={event => commitLayout(selectedComponent.id, { zIndex: Number(event.target.value) })} /></label><label className="checkbox-setting"><input type="checkbox" checked={selectedComponent.layouts?.[device]?.hidden ?? false} onChange={event => commitLayout(selectedComponent.id, { hidden: event.target.checked })} />この端末で非表示</label></div>
                {selectedComponent.layouts?.[device]?.presentation !== 'inline' && <label className="checkbox-setting"><input type="checkbox" checked={selectedComponent.layouts?.[device]?.initialOpen ?? false} onChange={event => commitLayout(selectedComponent.id, { initialOpen: event.target.checked })} />試す開始時に開く</label>}
                <details className="appearance-section"><summary>外観</summary>
                {(['background', 'color', 'borderColor'] as const).map(key => <label className="color-setting" key={key}>{({ background: '背景色', color: '文字色', borderColor: '枠線色' })[key]}<input type="color" value={componentColors(selectedComponent)[key]} onChange={event => commitStyle(selectedComponent.id, key, event.target.value)} /></label>)}
                <label className="setting-field">角丸<input type="number" min="0" max="64" value={Number(selectedComponent.style?.radius ?? 12)} onChange={event => commitStyle(selectedComponent.id, 'radius', Number(event.target.value))} /></label>
                </details>
                {selectedComponent.kind === 'app-header' && <><label className="setting-field">タイトル<input value={String(selectedComponent.props.title || '')} onChange={event => commitProps(selectedComponent.id, 'title', event.target.value)} /></label><label className="setting-field">説明<input value={String(selectedComponent.props.description || '')} onChange={event => commitProps(selectedComponent.id, 'description', event.target.value)} /></label></>}
                {selectedComponent.kind === 'place-search' && <label className="setting-field">入力例<input value={String(selectedComponent.props.placeholder || '')} onChange={event => commitProps(selectedComponent.id, 'placeholder', event.target.value)} /></label>}
                {selectedComponent.kind === 'category-chips' && <label className="setting-field">全カテゴリの表示名<input value={String(selectedComponent.props.allLabel || '')} onChange={event => commitProps(selectedComponent.id, 'allLabel', event.target.value)} /></label>}
                {selectedComponent.kind === 'result-count' && <label className="setting-field">件数の後ろに付ける文字<input value={String(selectedComponent.props.suffix || '')} onChange={event => commitProps(selectedComponent.id, 'suffix', event.target.value)} /></label>}
                {(selectedComponent.kind === 'place-list' || selectedComponent.kind === 'place-detail') && <label className="setting-field">空のときの表示<input value={String(selectedComponent.props.emptyLabel || '')} onChange={event => commitProps(selectedComponent.id, 'emptyLabel', event.target.value)} /></label>}
                {selectedComponent.kind === 'place-detail' && <label className="checkbox-setting"><input type="checkbox" checked={selectedComponent.props.closable !== false} onChange={event => commitProps(selectedComponent.id, 'closable', event.target.checked)} />閉じるボタンを表示</label>}
                {selectedComponent.kind === 'floating-action' && <label className="setting-field">ボタンの文言<input value={String(selectedComponent.props.label || '')} onChange={event => commitProps(selectedComponent.id, 'label', event.target.value)} /></label>}
                {selectedComponent.kind === 'text' && <label className="setting-field">表示する文章<textarea rows={4} value={String(selectedComponent.props.text || '')} onChange={event => commitProps(selectedComponent.id, 'text', event.target.value)} /></label>}
                {selectedComponent.kind === 'map-view' && <label className="setting-field">初期ズーム<input type="number" min="0" max="20" value={Number(selectedComponent.props.zoom || 14)} onChange={event => commitProps(selectedComponent.id, 'zoom', Number(event.target.value))} /></label>}
                <label className="setting-field">部品名<input value={selectedComponent.name} onChange={e => commitComponent(selectedComponent.id,c => ({...c,name:e.target.value}))} /></label><div className="component-actions"><IconButton icon="copy" label="複製" onClick={duplicateSelected} /><IconButton icon="delete" label="削除" className="danger" disabled={protectedSelection(screen, selected)} hint={protectedSelection(screen, selected) ? 'ロックされた部品を含みます' : undefined} onClick={deleteSelected} /></div>
              </> : settingsTab === 'data' ? <>
                <label className="setting-field">使用するデータ<select value={selectedComponent.binding?.datasetId || ''} onChange={event => commitComponent(selectedComponent.id, component => ({ ...component, binding: event.target.value ? { datasetId: event.target.value, mode: component.kind === 'place-detail' ? 'selection' : 'collection' } : null }))}>{design.datasets.map(item => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</select></label>
                {(() => {
                  const bound = dataFor(selectedComponent); const fields = publicColumns(bound); const fieldSet = publicFieldSet(bound);
                  const arrayField = selectedComponent.kind === 'place-search' ? 'searchFields' : 'displayFields';
                  const arrayValue = Array.isArray(selectedComponent.props[arrayField]) ? selectedComponent.props[arrayField] as string[] : [];
                  return <>
                    {(selectedComponent.kind === 'place-search' || selectedComponent.kind === 'place-list' || selectedComponent.kind === 'place-detail') && <fieldset className="field-picker"><legend>{selectedComponent.kind === 'place-search' ? '検索する掲載項目' : '表示する掲載項目'}</legend>{fields.map(column => <label key={column.key}><input type="checkbox" checked={arrayValue.includes(column.key)} onChange={event => commitProps(selectedComponent.id, arrayField, event.target.checked ? [...new Set([...arrayValue, column.key])] : arrayValue.filter(field => field !== column.key))} />{column.label || column.key}</label>)}</fieldset>}
                    {selectedComponent.kind === 'category-chips' && <label className="setting-field">カテゴリに使う列<select value={String(selectedComponent.props.field || '')} onChange={event => commitProps(selectedComponent.id, 'field', event.target.value)}>{fields.map(column => <option key={column.key} value={column.key}>{column.label || column.key}</option>)}</select></label>}
                    {selectedComponent.kind === 'text' && <label className="setting-field">表示するデータ列<select value={String(selectedComponent.props.field || '')} onChange={event => { const field = event.target.value || null; commitComponent(selectedComponent.id, component => ({ ...component, props: { ...component.props, field }, binding: field ? { datasetId: dataFor(component).id, mode: 'selection' } : null })); }}><option value="">固定テキスト</option>{fields.map(column => <option key={column.key} value={column.key}>{column.label || column.key}</option>)}</select></label>}
                    {(selectedComponent.kind === 'place-list' || selectedComponent.kind === 'place-detail') && <label className="setting-field">写真の列<select value={String(selectedComponent.props.imageField || '')} onChange={event => commitProps(selectedComponent.id, 'imageField', event.target.value || null)}><option value="">写真を使わない</option>{fields.filter(column => column.type === 'url' || /image|photo|写真/i.test(column.key)).map(column => <option key={column.key} value={column.key}>{column.label || column.key}</option>)}</select></label>}
                    {!fieldSet.size && <p className="hint">公開設定された列がありません。表示・検索には公開列だけを使います。</p>}
                  </>;
                })()}
              </> : <>
                <p className="hint">操作のきっかけと、そのときに起こる動きを設定します。</p>
                {actionWarnings(selectedComponent).map((warning, index) => <p className="operation-warning" key={index}>{warning}</p>)}
                <div className="interaction-list">{selectedComponent.interactions.map((interaction, interactionIndex) => <section className="interaction-card" key={`${interaction.event}-${interactionIndex}`}>
                  <div className="interaction-head"><label>きっかけ<select value={interaction.event} onChange={event => updateInteraction(selectedComponent.id, interactionIndex, item => ({ ...item, event: event.target.value }))}>{!eventOptions[selectedComponent.kind]?.includes(interaction.event) && <option value={interaction.event} disabled>{interaction.event}（未対応）</option>}{(eventOptions[selectedComponent.kind] || []).map(name => <option key={name} value={name}>{({ 'place-select': '地点を選んだとき', 'query-change': '検索語を変えたとき', clear: '検索を消したとき', 'filter-change': 'カテゴリを変えたとき', close: '閉じるを押したとき', activate: 'ボタンを押したとき' } as Record<string,string>)[name] || name}</option>)}</select></label><IconButton icon="delete" label="動作設定を削除" className="danger" onClick={() => commitComponent(selectedComponent.id, component => ({ ...component, interactions: component.interactions.filter((_, index) => index !== interactionIndex) }))} /></div>
                  {interaction.actions.map((action, actionIndex) => <div className="action-row" key={actionIndex}><label>実行すること<select value={action.type} onChange={event => updateInteraction(selectedComponent.id, interactionIndex, item => ({ ...item, actions: item.actions.map((current, index) => index === actionIndex ? makeAction(event.target.value, design, screen) : current) }))}>{!actionOptions.some(([type]) => type === action.type) && <option value={action.type} disabled>{action.type}（未対応）</option>}{actionOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                    {actionNeedsDataset.has(action.type) && <label>データ<select value={action.datasetId || dataset.id} onChange={event => updateInteraction(selectedComponent.id, interactionIndex, item => ({ ...item, actions: item.actions.map((current, index) => index === actionIndex ? { ...current, datasetId: event.target.value } : current) }))}>{design.datasets.map(item => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</select></label>}
                    {action.type === 'set-filter' && <label>対象の列<select value={action.field || ''} onChange={event => updateInteraction(selectedComponent.id, interactionIndex, item => ({ ...item, actions: item.actions.map((current, index) => index === actionIndex ? { ...current, field: event.target.value } : current) }))}>{publicColumns(dataFor(selectedComponent)).map(column => <option key={column.key} value={column.key}>{column.label || column.key}</option>)}</select></label>}
                    {actionNeedsTarget.has(action.type) && <label>対象<select value={action.targetId || ''} onChange={event => updateInteraction(selectedComponent.id, interactionIndex, item => ({ ...item, actions: item.actions.map((current, index) => index === actionIndex ? { ...current, targetId: event.target.value } : current) }))}>{screen.components.filter(item => action.type === 'map-fit' ? item.kind === 'map-view' : ['place-list','place-detail'].includes(item.kind)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
                    {action.type === 'navigate' && <label>移動先<select value={String((action.screen as { value?: string } | undefined)?.value || design.initialScreenId)} onChange={event => updateInteraction(selectedComponent.id, interactionIndex, item => ({ ...item, actions: item.actions.map((current, index) => index === actionIndex ? { ...current, screen: { source: 'literal', value: event.target.value } } : current) }))}>{design.screens.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
                    {(action.type === 'navigate' || action.type === 'go-back') && <fieldset className="transition-settings"><legend>画面の遷移効果</legend><select aria-label="遷移効果" value={action.transition?.type === 'slide' ? action.transition.direction : action.transition?.type || 'none'} onChange={event => { const value = event.target.value; updateInteraction(selectedComponent.id, interactionIndex, item => ({ ...item, actions: item.actions.map((current, index) => index === actionIndex ? { ...current, transition: { type: value === 'none' || value === 'fade' ? value : 'slide', direction: ['up','down','left','right'].includes(value) ? value as Transition['direction'] : 'up', durationMs: value === 'none' ? 0 : 200 } } : current) })); }}><option value="none">なし</option><option value="fade">フェード</option><option value="up">上へスライド</option><option value="down">下へスライド</option><option value="left">左へスライド</option><option value="right">右へスライド</option></select>{action.transition && action.transition.type !== 'none' && <label>時間 (ms)<input type="number" min={0} max={2000} step={50} value={action.transition.durationMs} onChange={event => updateInteraction(selectedComponent.id, interactionIndex, item => ({ ...item, actions: item.actions.map((current, index) => index === actionIndex ? { ...current, transition: { ...current.transition!, durationMs: Number(event.target.value) } } : current) }))} /></label>}</fieldset>}
                    {action.type === 'map-zoom' && <label>変化<select value={action.delta || 1} onChange={event => updateInteraction(selectedComponent.id, interactionIndex, item => ({ ...item, actions: item.actions.map((current, index) => index === actionIndex ? { ...current, delta: Number(event.target.value) } : current) }))}><option value={1}>拡大</option><option value={-1}>縮小</option></select></label>}
                    <IconButton icon="delete" label="動作を削除" className="danger" onClick={() => updateInteraction(selectedComponent.id, interactionIndex, item => ({ ...item, actions: item.actions.filter((_, index) => index !== actionIndex) }))} />
                  </div>)}
                  <label className="setting-field">動作を追加<select value="" onChange={event => { if (event.target.value) updateInteraction(selectedComponent.id, interactionIndex, item => ({ ...item, actions: [...item.actions, makeAction(event.target.value, design, screen)] })); }}><option value="">動作を選んで追加…</option>{actionOptions.map(([type, label]) => <option key={type} value={type} disabled={actionNeedsTarget.has(type) && !screen.components.some(component => type === 'map-fit' ? component.kind === 'map-view' : ['place-list','place-detail'].includes(component.kind))}>{label}</option>)}</select></label>
                </section>)}</div>
                <div className="interaction-foot"><IconButton icon="add" label="きっかけを追加" onClick={() => addInteraction(selectedComponent)} /><span>{selectedComponent.interactions.length}件</span></div>
                {!eventOptions[selectedComponent.kind] && <p className="hint">この部品に設定できるきっかけはありません。</p>}
              </>}
            </>}
          </> : <div className="screen-settings"><span className="eyebrow">SCREEN</span><h2>画面全体</h2><NoteField key={screen.id} label="画面の実装仕様メモ" value={screen.implementationNote} onCommit={value => commitDesign({ ...design, screens: design.screens.map(item => item.id === screen.id ? { ...item, implementationNote: value } : item) })} /><label className="setting-field">画面名<input value={screen.name} onChange={event => commitDesign({ ...design, screens: design.screens.map(item => item.id === screen.id ? { ...item, name: event.target.value } : item) })} /></label><label className="checkbox-setting"><input type="checkbox" checked={design.initialScreenId === screen.id} onChange={event => { if (event.target.checked) commitDesign({ ...design, initialScreenId: screen.id }); }} />最初に開く画面</label><div className="fields"><label>幅<input type="number" value={frame.width} onChange={event => commitDesign({ ...design, screens: design.screens.map(item => item.id === screen.id ? { ...item, frames: { ...item.frames, [device]: { ...frame, width: Number(event.target.value) } } } : item) })} /></label><label>高さ<input type="number" value={frame.height} onChange={event => commitDesign({ ...design, screens: design.screens.map(item => item.id === screen.id ? { ...item, frames: { ...item.frames, [device]: { ...frame, height: Number(event.target.value) } } } : item) })} /></label></div><IconButton icon="map" label="地図を追加" className="primary-button" onClick={() => addComponent('map-view')} /></div>}</div></Panel></>}
    </Group></div>
    {showDataImport && <React.Suspense fallback={<div className="notice" role="status">取り込み画面を準備しています…</div>}><ImportDataDialog design={design} onClose={() => setShowDataImport(false)} onApply={next => {
      const checked = validateDesign(next);
      if (!checked.design) throw new Error(checked.errors.slice(0, 4).join(' / '));
      commitDesign(checked.design); setPreview(initialPreview(checked.design.screens.find(item => item.id === screen.id) || checked.design.screens[0], device));
      setClipboard(null); setShowDataImport(false); setMode('edit'); setNotice('地点データを反映しました。Undoで取り込み前へ戻せます');
    }} /></React.Suspense>}
    {notice && <div className="notice" role="status">{notice}<IconButton icon="close" label="通知を閉じる" onClick={() => setNotice('')} /></div>}
    {contextMenu && mode === 'edit' && <ContextMenu x={contextMenu.x} y={contextMenu.y} label={contextMenu.ids.length ? contextMenu.ids.length > 1 ? `${contextMenu.ids.length}部品を選択中` : contextComponents[0]?.name || '部品' : 'キャンバス'} items={menuItems} onAction={runContextAction} onClose={closeContextMenu} />}
    {colorSelection && colorComponents.length > 0 && <ColorDialog count={colorComponents.length} initial={componentColors(colorComponents[0])}
      mixed={(['background', 'color', 'borderColor'] as ColorKey[]).filter(key => colorComponents.some(component => componentColors(component)[key] !== componentColors(colorComponents[0])[key]))}
      onClose={() => { setColorSelection(null); restoreContextFocus(); }} onApply={colors => {
        execute({ type: 'style', patch: { ...colors, ...(colors.borderColor ? { borderWidth: 1 } : {}) } }, colorSelection);
        setColorSelection(null); setNotice(`${colorComponents.length}部品の色を変更しました`); restoreContextFocus();
      }} />}
    {autoLayout && <AutoLayoutDialog design={design} screenId={screen.id} device={device} onClose={() => setAutoLayout(false)} onApply={next => { commitDesign(next); setAutoLayout(false); setNotice('配置を適用しました。1回のUndoで戻せます'); }} />}
    {pending && <div className="dialog-backdrop"><section className="diff-dialog" role="dialog" aria-modal="true" aria-labelledby="diff-title"><span className="eyebrow">IMPORT REVIEW</span><h2 id="diff-title">読み戻す変更を確認</h2><ul>{pending.diff.map((line, index) => <li key={index}>{line}</li>)}</ul><p>取り込むと現在の設計が置き換わります。Undoで戻せます。</p><div className="dialog-actions"><IconButton icon="close" label="取り消す" onClick={() => setPending(null)} /><IconButton icon="check" label="取り込む" className="primary-button" onClick={() => { setClipboard(null); setEditingGroupId(null); commitDesign(pending.design); setEditorScreenId(pending.design.initialScreenId); setSelected([]); setPending(null); setMode('edit'); setNotice('設計を取り込みました'); }} /></div></section></div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
