import { useEffect, useLayoutEffect, useRef } from 'react';
import Moveable from 'react-moveable';
import type { Layout } from './model';

type Item = { target: HTMLElement; layout: Layout; id: string; group?: boolean };
export function LayoutHandles({ items, frame, snap, commit }: {
  items: Item[]; frame: { width: number; height: number }; snap: boolean;
  commit: (patches: Record<string, Partial<Layout>>) => void;
}) {
  const moveable = useRef<Moveable>(null);
  useLayoutEffect(() => { moveable.current?.updateRect(); });
  useEffect(() => {
    const update = () => moveable.current?.updateRect();
    const observer = new ResizeObserver(update), panel = items[0]?.target.closest('.canvas-panel');
    if (panel) observer.observe(panel);
    window.addEventListener('scroll', update, { capture: true, passive: true });
    return () => { observer.disconnect(); window.removeEventListener('scroll', update, true); };
  }, [items[0]?.target]);
  const position = (item: Item, dx: number, dy: number) => {
    item.target.style.left = `${Math.round(item.layout.x + dx)}px`;
    item.target.style.top = `${Math.round(item.layout.y + dy)}px`;
  };
  const finish = () => commit(Object.fromEntries(items.map(item => [item.id, {
    x: parseFloat(item.target.style.left), y: parseFloat(item.target.style.top),
    width: parseFloat(item.target.style.width), height: parseFloat(item.target.style.height),
  }])));
  const siblings = items[0]?.target.parentElement?.children || [];
  const elements = [...siblings].filter((element): element is HTMLElement => element instanceof HTMLElement && element.matches('.canvas-component') && !items.some(item => item.target === element));
  return <Moveable ref={moveable} target={items.length === 1 ? items[0].target : items.map(item => item.target)}
    draggable resizable={items.length === 1 && !items[0].group} snappable={snap} origin={false}
    snapDirections={{ left: true, right: true, top: true, bottom: true, center: true, middle: true }}
    elementSnapDirections={{ left: true, right: true, top: true, bottom: true, center: true, middle: true }}
    horizontalGuidelines={[0, frame.height / 2, frame.height]} verticalGuidelines={[0, frame.width / 2, frame.width]}
    elementGuidelines={elements} snapThreshold={6}
    onDrag={event => position(items[0], event.beforeDist[0], event.beforeDist[1])}
    onDragEnd={event => { if (event.lastEvent) finish(); }}
    onDragGroup={event => { const delta = event.events[0]?.beforeDist; if (delta) items.forEach(item => position(item, delta[0], delta[1])); }}
    onDragGroupEnd={event => { if (event.events.some(item => item.lastEvent)) finish(); }}
    onResizeStart={event => { event.setMin([40, 30]); if (event.dragStart) event.dragStart.set([0, 0]); }}
    onResize={event => {
      items[0].target.style.width = `${Math.round(event.width)}px`;
      items[0].target.style.height = `${Math.round(event.height)}px`;
      position(items[0], event.drag.beforeTranslate[0], event.drag.beforeTranslate[1]);
    }} onResizeEnd={event => { if (event.lastEvent) finish(); }} />;
}
