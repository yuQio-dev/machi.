import type { Component, Device, Layout, Screen } from './model';

export type Rect = { x: number; y: number; width: number; height: number };
export const ordered = (items: Component[], device: Device) => items.slice().sort((a, b) => (a.layouts?.[device]?.zIndex ?? 0) - (b.layouts?.[device]?.zIndex ?? 0) || a.id.localeCompare(b.id));
export const inset = (component: Component) => component.editor?.group ? 0 : Number(component.style?.padding || 0) + Number(component.style?.borderWidth || 0);
export function descendants(screen: Screen, ids: string[]): string[] {
  const found = new Set(ids);
  for (let changed = true; changed;) {
    changed = false;
    for (const component of screen.components) if (component.parentId && found.has(component.parentId) && !found.has(component.id)) { found.add(component.id); changed = true; }
  }
  return [...found];
}
export function roots(screen: Screen, ids: string[]): Component[] {
  const chosen = new Set(ids);
  const byId = new Map(screen.components.map(component => [component.id, component]));
  return screen.components.filter(component => {
    if (!chosen.has(component.id)) return false;
    const seen = new Set<string>();
    for (let parent = component.parentId; parent && !seen.has(parent); parent = byId.get(parent)?.parentId || null) {
      if (chosen.has(parent)) return false;
      seen.add(parent);
    }
    return true;
  });
}
export function worldRect(screen: Screen, component: Component, device: Device): Rect | null {
  const layout = component.layouts?.[device];
  if (!layout) return null;
  const rect = { x: layout.x, y: layout.y, width: layout.width, height: layout.height };
  const seen = new Set([component.id]);
  for (let parentId = component.parentId; parentId;) {
    if (seen.has(parentId)) return null;
    seen.add(parentId);
    const parent = screen.components.find(item => item.id === parentId);
    const parentLayout = parent?.layouts?.[device];
    if (!parent || !parentLayout) return null;
    rect.x += parentLayout.x + inset(parent); rect.y += parentLayout.y + inset(parent);
    parentId = parent.parentId;
  }
  return rect;
}
export function bounds(rects: Rect[]): Rect {
  if (!rects.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...rects.map(rect => rect.x)), y = Math.min(...rects.map(rect => rect.y));
  return { x, y, width: Math.max(...rects.map(rect => rect.x + rect.width)) - x, height: Math.max(...rects.map(rect => rect.y + rect.height)) - y };
}
export function protectedIds(screen: Screen): Set<string> {
  return new Set(descendants(screen, screen.components.filter(component => component.editor?.locked).map(component => component.id)));
}
export function protectedSelection(screen: Screen, ids: string[]): boolean {
  const locked = protectedIds(screen);
  return descendants(screen, ids).some(id => locked.has(id));
}
export function parentFrame(screen: Screen, component: Component, device: Device): Rect {
  const parent = screen.components.find(item => item.id === component.parentId);
  const frame = parent?.layouts?.[device] || screen.frames[device];
  const padding = parent ? inset(parent) * 2 : 0;
  return { x: 0, y: 0, width: Math.max(1, frame.width - padding), height: Math.max(1, frame.height - padding) };
}
export function refreshGroups(screen: Screen): void {
  const depth = (component: Component) => {
    let n = 0, parent = component.parentId;
    while (parent && n <= screen.components.length) { n++; parent = screen.components.find(item => item.id === parent)?.parentId || null; }
    return n;
  };
  for (const group of screen.components.filter(component => component.editor?.group).sort((a, b) => depth(b) - depth(a))) {
    if (protectedSelection(screen, [group.id])) continue;
    const children = screen.components.filter(component => component.parentId === group.id);
    for (const device of ['desktop', 'mobile'] as const) {
      const layout = group.layouts?.[device];
      const layouts = children.map(component => component.layouts?.[device]).filter((value): value is Layout => !!value);
      if (!layout || !layouts.length) continue;
      const box = bounds(layouts);
      layout.x += box.x; layout.y += box.y; layout.width = Math.max(1, box.width); layout.height = Math.max(1, box.height);
      for (const child of layouts) { child.x -= box.x; child.y -= box.y; }
    }
  }
}
export function overflowWarnings(screen: Screen, device: Device): string[] {
  return screen.components.flatMap(component => {
    const rect = worldRect(screen, component, device), frame = screen.frames[device];
    return rect && !component.layouts?.[device]?.hidden && (rect.x < 0 || rect.y < 0 || rect.x + rect.width > frame.width + .01 || rect.y + rect.height > frame.height + .01) ? [`${component.name}が画面からはみ出しています`] : [];
  });
}
