import { MapView } from './MapView';
import type { Component, Dataset, Design, Device } from './model';
import { columnLabel, publicFieldSet } from './runtime';
import { InlineTextField } from './InlineTextField';
import { Icon } from './Icons';

type Place = Dataset['rows'][number];
type Dispatch = (component: Component, event: string, payload?: Record<string, unknown>) => void;

type Props = {
  design: Design;
  component: Component;
  dataset: Dataset;
  rows: Place[];
  mode: 'edit' | 'preview';
  query: string;
  activeFilters: { field: string; operator: string; value: unknown }[];
  selectedId: string | null;
  fitToken: number;
  device: Device;
  openPanels: Record<string, boolean>;
  dispatch: Dispatch;
  closePanel: (id: string) => void;
  previewValues?: Record<string, unknown>;
  activeScreenId?: string;
  inlineText?: { activeField?: string; start: (field: string) => void; finish: (field: string, value: string | null) => void };
};

function safeImage(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, window.location.href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch { return null; }
}

export function ComponentContent({
  design, component, dataset, rows, mode, query, activeFilters, selectedId, fitToken, device, openPanels, dispatch, closePanel, previewValues, activeScreenId, inlineText,
}: Props) {
  const { kind, props } = component;
  const selected = dataset.rows.find(row => row.id === selectedId) || (mode === 'edit' ? dataset.rows[0] : undefined);
  const allowed = publicFieldSet(dataset);
  const primaryName = dataset.mapping.name;
  const categoryField = typeof props.field === 'string' && allowed.has(props.field) ? props.field : dataset.mapping.category;
  const imageField = typeof props.imageField === 'string' && allowed.has(props.imageField) ? props.imageField : null;
  const isPanel = component.layouts[device]?.presentation !== 'inline';
  const panelOpen = mode === 'edit' || (openPanels[component.id] ?? !isPanel);
  const selectedCategories = activeFilters.filter(filter => filter.field === categoryField).flatMap(filter => Array.isArray(filter.value) ? filter.value : [filter.value]);
  const fieldValue = (field: string) => selected?.values[field];
  const labelFor = (field: string) => columnLabel(dataset, field);
  const renderImage = (row: Place, className: string) => {
    const src = imageField && allowed.has(imageField) ? safeImage(row.values[imageField]) : null;
    return src ? <img className={className} src={src} alt={String(row.values[primaryName] ?? '地点')} loading="lazy" /> : null;
  };

  if (kind === 'map-view') return <MapView design={design} component={component} dataset={dataset} rows={rows} selectedId={selectedId} fitToken={fitToken} onSelect={id => dispatch(component, 'place-select', { placeId: id })} />;
  if (kind === 'app-header') return <div className="app-header-preview"><strong>{inlineText ? <InlineTextField label="タイトル" value={String(props.title ?? '')} placeholder="タイトルを入力" maxLength={160} active={inlineText.activeField === 'title'} onStart={() => inlineText.start('title')} onFinish={value => inlineText.finish('title', value)} /> : String(props.title ?? '地図タイトル')}</strong>{inlineText ? <small><InlineTextField label="説明" value={String(props.description ?? '')} placeholder="説明を入力" maxLength={500} active={inlineText.activeField === 'description'} onStart={() => inlineText.start('description')} onFinish={value => inlineText.finish('description', value)} /></small> : String(props.description || '') && <small>{String(props.description)}</small>}</div>;
  if (kind === 'place-search') {
    const fields = Array.isArray(props.searchFields) ? props.searchFields.filter((field): field is string => typeof field === 'string' && allowed.has(field)) : [primaryName];
    return <div className="search-preview"><span aria-hidden="true">⌕</span><input aria-label="地点を検索" placeholder={String(props.placeholder || '地点を検索')} value={query} disabled={mode === 'edit'} onChange={event => dispatch(component, 'query-change', { value: event.target.value })} />{query && <button aria-label="検索語を消す" disabled={mode === 'edit'} onClick={() => dispatch(component, 'clear')}>×</button>}<span className="sr-only">検索対象: {fields.map(labelFor).join('、')}</span></div>;
  }
  if (kind === 'category-chips') {
    const categories = [...new Set(dataset.rows.map(row => row.values[categoryField]).filter(value => value !== null && value !== undefined && String(value).trim()).map(String))];
    return <div className="category-preview" aria-label="カテゴリで絞り込む">
      <button className={!selectedCategories.length ? 'active' : ''} disabled={mode === 'edit'} onClick={() => dispatch(component, 'filter-change', { value: null })}>{String(props.allLabel || 'すべて')}</button>
      {categories.map(value => {
        const isSelected = selectedCategories.some(item => String(item) === value);
        return <button key={value} className={isSelected ? 'active' : ''} disabled={mode === 'edit'} onClick={() => {
          if (props.multiple === true) {
            const next = isSelected ? selectedCategories.filter(item => String(item) !== value) : [...selectedCategories, value];
            dispatch(component, 'filter-change', { value: next });
          } else dispatch(component, 'filter-change', { value: isSelected ? null : value });
        }}>{value}</button>;
      })}
    </div>;
  }
  if (kind === 'result-count') return <div className="count-preview">{rows.length}{String(props.suffix || '件')}{props.showTotal === true && rows.length !== dataset.rows.length && <small> / {dataset.rows.length}件</small>}</div>;
  if (kind === 'place-list') {
    if (!panelOpen) return null;
    const displayFields = Array.isArray(props.displayFields) ? props.displayFields.filter((field): field is string => typeof field === 'string' && allowed.has(field)) : [primaryName];
    return <section className={`panel-preview ${mode === 'preview' ? 'preview-panel' : ''}`} aria-label="地点一覧">
      <div className="panel-heading"><div><strong>地点一覧</strong><small>{rows.length}件</small></div><button aria-label="一覧を閉じる" onClick={() => closePanel(component.id)}>×</button></div>
      <div className="place-cards">{rows.length ? rows.map(row => <button key={row.id} className={`place-card ${row.id === selectedId ? 'selected' : ''}`} onClick={() => dispatch(component, 'place-select', { placeId: row.id })}>
        {renderImage(row, 'place-card-image')}<span className="place-card-copy"><strong>{String(row.values[primaryName] ?? row.id)}</strong><small>{displayFields.filter(field => field !== primaryName).slice(0, 2).map(field => String(row.values[field] ?? '')).filter(Boolean).join(' ・ ')}</small></span>
      </button>) : <p className="empty-preview">{String(props.emptyLabel || '条件に一致する地点はありません')}</p>}</div>
    </section>;
  }
  if (kind === 'place-detail') {
    if (!panelOpen) return null;
    const displayFields = Array.isArray(props.displayFields) ? props.displayFields.filter((field): field is string => typeof field === 'string' && allowed.has(field) && field !== imageField) : [primaryName];
    return <section className={`detail-preview ${mode === 'preview' ? 'preview-panel' : ''}`} aria-label="地点詳細">
      <div className="panel-heading"><div><strong>{selected ? String(selected.values[primaryName] ?? '地点詳細') : '地点詳細'}</strong></div>{props.closable !== false && <button aria-label="詳細を閉じる" onClick={() => dispatch(component, 'close')}>×</button>}</div>
      {selected ? <div className="detail-body">{renderImage(selected, 'detail-image')}{displayFields.map(field => <div key={field} className="detail-field"><small>{labelFor(field)}</small><span>{String(fieldValue(field) ?? '—')}</span></div>)}</div> : <p className="empty-preview">{String(props.emptyLabel || '地点を選択してください')}</p>}
    </section>;
  }
  if (kind === 'floating-action') return <button className="floating-action-preview" onClick={() => dispatch(component, 'activate', { toggleTarget: true })}>{String(props.label || '一覧')}</button>;
  if (kind === 'text') {
    const field = typeof props.field === 'string' && allowed.has(props.field) ? props.field : null;
    return <div className="text-preview">{inlineText && !field ? <InlineTextField label="テキスト" value={String(props.text ?? '')} placeholder="テキストを入力" maxLength={4000} multiline active={inlineText.activeField === 'text'} onStart={() => inlineText.start('text')} onFinish={value => inlineText.finish('text', value)} /> : field ? String(fieldValue(field) ?? props.text ?? '') : String(props.text ?? '')}</div>;
  }
  if (kind === 'button') return <button className={`generic-button ${String(props.variant || 'filled')}`} disabled={mode === 'edit' || props.disabled === true} onClick={() => dispatch(component, 'activate')}><span>{String(props.label || 'ボタン')}</span></button>;
  if (kind === 'icon-button') return <button className="generic-icon-button" aria-label={String(props.ariaLabel || '操作')} disabled={mode === 'edit' || props.disabled === true} onClick={() => dispatch(component, 'activate')}><Icon name={String(props.icon || 'add')} /></button>;
  if (kind === 'chip') {
    const active = Boolean(previewValues?.[component.id] ?? props.selected);
    return <button className={`generic-chip ${active ? 'selected' : ''} ${String(props.variant || 'outline')}`} aria-pressed={active} disabled={mode === 'edit'} onClick={() => dispatch(component, 'activate', { value: !active })}>{String(props.label || 'チップ')}</button>;
  }
  if (kind === 'card') {
    const image = safeImage(props.imageUrl);
    return <button type="button" className="generic-card" disabled={mode === 'edit'} onClick={() => dispatch(component, 'activate')}>
      {image && <img src={image} alt={String(props.imageAlt || '')} loading="lazy" />}
      <span><strong>{String(props.title || 'カード')}</strong><small>{String(props.supportingText || '')}</small></span>
    </button>;
  }
  if (kind === 'list-item') return <button type="button" className="generic-list-item" disabled={mode === 'edit'} onClick={() => dispatch(component, 'activate')}><Icon name={String(props.icon || 'circle')} /><span><strong>{String(props.title || '項目')}</strong><small>{String(props.supportingText || '')}</small></span><Icon name="chevron_right" /></button>;
  if (kind === 'image') {
    const field = typeof props.field === 'string' && allowed.has(props.field) ? props.field : null;
    const source = field ? safeImage(fieldValue(field)) : safeImage(props.url);
    return source ? <img className={`generic-image ${String(props.fit || 'cover')}`} src={source} alt={String(props.alt || (field ? labelFor(field) : ''))} loading="lazy" /> : <div className="generic-image-placeholder"><Icon name="image" /><span>画像を設定してください</span></div>;
  }
  if (kind === 'divider') return <div className={`generic-divider ${props.axis === 'vertical' ? 'vertical' : 'horizontal'} ${props.line === false ? 'spacer' : ''}`} role={props.line === false ? undefined : 'separator'} />;
  if (kind === 'dialog' || kind === 'side-menu') {
    if (!panelOpen) return null;
    const title = kind === 'dialog' ? String(props.title || 'ダイアログ') : String(component.name || 'メニュー');
    return <section className={`generic-dialog ${kind === 'side-menu' ? 'side-menu-preview' : ''}`} role="dialog" aria-modal={mode === 'preview'} aria-label={title}>
      <header><strong>{title}</strong>{props.closable !== false && <button aria-label="閉じる" onClick={() => dispatch(component, kind === 'dialog' ? 'close' : 'close')}>×</button>}</header>
      {kind === 'side-menu' && <nav>{(Array.isArray(props.items) ? props.items : []).map((entry, index) => { const item = entry as { label?: string; screenId?: string }; return <button key={`${item.screenId}-${index}`} onClick={() => dispatch(component, 'navigate', { screenId: item.screenId })}>{item.label || item.screenId}</button>; })}</nav>}
      {kind === 'dialog' && <div className="generic-dialog-content"><small>ダイアログの内容は配置した部品から設定できます。</small></div>}
    </section>;
  }
  if (kind === 'text-field') {
    const value = String(previewValues?.[component.id] ?? props.initialValue ?? '');
    return <label className="generic-field"><span>{String(props.label || '入力')}</span><input aria-label={String(props.label || '入力')} type={String(props.inputType || 'text')} placeholder={String(props.placeholder || '')} value={value} disabled={mode === 'edit'} onChange={event => dispatch(component, 'change', { value: event.target.value })} /></label>;
  }
  if (kind === 'select') {
    const value = String(previewValues?.[component.id] ?? props.initialValue ?? '');
    const options = Array.isArray(props.options) ? props.options as { label?: string; value?: string }[] : [];
    return <label className="generic-field"><span>{String(props.label || '項目')}</span><select aria-label={String(props.label || '項目')} value={value} disabled={mode === 'edit'} onChange={event => dispatch(component, 'change', { value: event.target.value })}><option value="">{String(props.placeholder || '選択してください')}</option>{options.map((option, index) => <option key={`${option.value}-${index}`} value={option.value || ''}>{option.label || option.value}</option>)}</select></label>;
  }
  if (kind === 'switch' || kind === 'checkbox') {
    const checked = Boolean(previewValues?.[component.id] ?? props.checked);
    return <label className={`generic-toggle ${kind}`}><input type="checkbox" role={kind === 'switch' ? 'switch' : undefined} checked={checked} disabled={mode === 'edit'} onChange={event => dispatch(component, 'change', { value: event.target.checked })} /><span className="toggle-track" aria-hidden="true"><i /></span><span>{String(props.label || (kind === 'switch' ? 'オン・オフ' : '確認する'))}</span></label>;
  }
  if (kind === 'screen-tabs' || kind === 'bottom-navigation') {
    const items = Array.isArray(props.items) ? props.items as { label?: string; screenId?: string }[] : [];
    return <nav className={`generic-navigation ${kind}`} aria-label={kind === 'screen-tabs' ? '画面タブ' : '下部ナビ'}>{items.map((item, index) => <button key={`${item.screenId}-${index}`} className={item.screenId === activeScreenId ? 'active' : ''} disabled={mode === 'edit'} onClick={() => dispatch(component, 'navigate', { screenId: item.screenId })}>{kind === 'bottom-navigation' && <Icon name={index === 0 ? 'home' : 'circle'} />}<span>{item.label || item.screenId}</span></button>)}</nav>;
  }
  return <div className="unsupported-preview"><strong>{component.name}</strong><small>{kind} は表示に未対応です</small></div>;
}
