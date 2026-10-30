import type { CSSProperties, ReactNode } from 'react';
import type { Component, Design, Device, Screen } from './model';
import { ordered } from './geometry';
import { mapPresentation, resolveAppearance } from './theme';

type Props = {
  design: Design; screen: Screen; device: Device; mode: 'edit' | 'preview' | 'thumbnail'; selected?: string[];
  editingGroupId?: string | null; hand?: boolean; openPanels?: Record<string, boolean>;
  onSelect?: (id: string, extend: boolean) => void; onEnter?: (id: string) => void;
  content: (component: Component, directText: boolean) => ReactNode;
};
export function CanvasTree({ design, screen, device, mode, selected = [], editingGroupId, hand, openPanels = {}, onSelect, onEnter, content }: Props) {
  const selectionTarget = (component: Component) => {
    let target = component;
    for (let parent = component.parentId, n = 0; parent && n < screen.components.length; n++) {
      const ancestor = screen.components.find(item => item.id === parent);
      if (!ancestor || ancestor.id === editingGroupId) break;
      if (ancestor.editor?.group) target = ancestor;
      parent = ancestor.parentId;
    }
    return target;
  };
  const render = (parentId: string | null): ReactNode => ordered(screen.components.filter(component => component.parentId === parentId), device).map(component => {
    const layout = component.layouts?.[device];
    if (!layout || (mode === 'preview' && (layout.hidden || (layout.presentation !== 'inline' && !(openPanels[component.id] ?? layout.initialOpen))))) return null;
    const style = resolveAppearance(design, component), group = component.editor?.group === true;
    const visual: CSSProperties = {
      background: style.background as string | undefined, color: style.color as string | undefined,
      borderColor: style.borderColor as string | undefined, borderWidth: style.borderWidth as number | undefined,
      borderStyle: Number(style.borderWidth) > 0 ? 'solid' : undefined,
      borderRadius: style.radius as number | undefined, fontSize: style.fontSize as number | undefined,
      fontWeight: style.fontWeight as number | undefined, fontFamily: style.fontFamily as string | undefined,
      textAlign: style.textAlign as CSSProperties['textAlign'], padding: group ? 0 : style.padding as number | undefined,
    };
    const target = selectionTarget(component);
    const directText = mode === 'edit' && !hand && target.id === component.id && (component.kind === 'app-header' || component.kind === 'text' && !component.props.field);
    const children = screen.components.some(item => item.parentId === component.id);
    return <div key={component.id} data-component-id={component.id} data-inline-text={directText || undefined} data-selectable={mode === 'edit' && !hand && target.id === component.id && component.parentId === (editingGroupId || null) ? 'true' : undefined}
      tabIndex={mode === 'edit' ? 0 : undefined} aria-label={mode === 'edit' ? component.name : undefined}
      data-custom-background={typeof style.background === 'string' || undefined} data-custom-color={typeof style.color === 'string' || undefined}
      data-managed={design.theme?.managed === true || typeof style.variant === 'string' || undefined}
      className={`canvas-component ${mode === 'edit' ? 'editable' : 'preview-component'} ${group ? 'editor-group' : ''} ${children ? 'has-children' : ''} ${selected.includes(component.id) && mode === 'edit' ? 'is-selected' : ''} ${layout.hidden && mode !== 'preview' ? 'is-hidden-in-preview' : ''}`}
      style={{ left: layout.x, top: layout.y, width: layout.width, height: layout.height, zIndex: layout.zIndex, ...visual, '--type-scale': Number(style.fontSize || 14) / 14, '--map-category-gap': `${mapPresentation.categoryGap}px`, '--map-card-gap': `${mapPresentation.cardGap}px`, '--map-card-padding': `${mapPresentation.cardPadding}px`, '--map-detail-padding': `${mapPresentation.detailPadding}px` } as CSSProperties}
      onPointerDown={event => { if (mode === 'edit' && event.button === 0 && !hand) { event.stopPropagation(); onSelect?.(target.id, event.shiftKey || event.ctrlKey || event.metaKey); } }}
      onDoubleClick={event => { if (mode === 'edit' && target.editor?.group && !hand) { event.stopPropagation(); onEnter?.(target.id); } }}>
      {!group && component.kind !== 'container' && content(component, directText)}
      {children && <div className="component-children" style={{ position: 'absolute', inset: group ? 0 : Number(style.padding || 0), overflow: component.props.clip === true ? 'hidden' : 'visible', pointerEvents: 'none' }}>{render(component.id)}</div>}
    </div>;
  });
  return <>{render(null)}</>;
}
