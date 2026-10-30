import type { Component, Design, Device, Layout } from './model';
import { validateDesign } from './model';
import { descendants, protectedSelection, worldRect } from './geometry';

const supported = new Set(['map-view', 'app-header', 'place-search', 'category-chips', 'result-count', 'place-list', 'place-detail', 'floating-action', 'text', 'container']);
export function proposeLayout(source: Design, screenId: string, devices: Device[], primaryMapId: string): { design?: Design; errors: string[]; changes: number } {
  const next = structuredClone(source), screen = next.screens.find(item => item.id === screenId);
  if (!screen) return { errors: ['画面がありません'], changes: 0 };
  const errors: string[] = [];
  for (const component of screen.components) if (!supported.has(component.kind)) errors.push(`${component.name}は自動配置に未対応です`);
  const maps = screen.components.filter(component => component.kind === 'map-view');
  if (maps.length > 1 && !maps.some(component => component.id === primaryMapId)) errors.push('主地図を選択してください');
  if (!devices.length) errors.push('PCまたはスマホを選択してください');
  if (errors.length) return { errors, changes: 0 };
  const mainMap = primaryMapId || maps[0]?.id;
  const roots = screen.components.filter(component => !component.parentId);
  const rootMap = roots.find(component => descendants(screen, [component.id]).includes(mainMap));
  const formKinds = ['place-search', 'category-chips', 'result-count', 'text'];
  const role = (component: Component): string => {
    if (!component.editor?.group) return component.kind;
    const members = screen.components.filter(item => descendants(screen, [component.id]).includes(item.id) && !item.editor?.group);
    if (members.length && members.every(item => formKinds.includes(item.kind))) return formKinds.find(kind => members.some(item => item.kind === kind))!;
    return component.kind;
  };
  let changes = 0;
  for (const device of devices) {
    const { width: w, height: h } = screen.frames[device], margin = 16, gap = 8;
    const baseOrder = Math.max(0, ...roots.filter(component => component !== rootMap && !['place-list','place-detail','floating-action'].includes(component.kind) || protectedSelection(screen, [component.id])).map(component => component.layouts[device]?.zIndex || 0));
    const panelOrder = baseOrder + 2;
    const desktop = device === 'desktop' && w >= 960;
    const header = roots.find(component => component.kind === 'app-header');
    const top = header ? 88 : 16;
    const groupWidth = Math.max(0, ...roots.filter(component => component.editor?.group && formKinds.includes(role(component))).map(component => component.layouts[device]?.width || 0));
    const leftWidth = desktop ? Math.max(groupWidth, Math.min(280, Math.max(220, Math.floor(w * .22)))) : w - 32;
    const rightWidth = desktop && roots.some(component => component.kind === 'place-detail') ? Math.min(320, Math.floor(w * .26)) : 0;
    const side = desktop && roots.some(component => [...formKinds, 'place-list'].includes(role(component))) ? leftWidth + gap : 0;
    const mapLeft = margin + side, mapWidth = w - 32 - side - (rightWidth ? rightWidth + gap : 0);
    let cursor = top;
    const place = (component: Component, patch: Partial<Layout>) => {
      const current = component.layouts[device];
      if (!current) { errors.push(`${component.name}の${device}配置がありません`); return; }
      if (protectedSelection(screen, [component.id])) return;
      const proposal = { ...current, ...patch };
      if (component.editor?.group) { proposal.width = current.width; proposal.height = current.height; }
      if (JSON.stringify(current) !== JSON.stringify(proposal)) changes++;
      component.layouts[device] = proposal;
    };
    if (header) place(header, { x: 16, y: 16, width: w - 32, height: 64 });
    const form = roots.filter(component => formKinds.includes(role(component))).sort((a,b) => formKinds.indexOf(role(a)) - formKinds.indexOf(role(b)));
    for (const component of form) {
      const height = component.editor?.group ? component.layouts[device]?.height || 0 : component.kind === 'place-search' ? 48 : component.kind === 'category-chips' ? 64 : component.kind === 'result-count' ? 24 : 56;
      if (component.editor?.group && groupWidth > leftWidth) errors.push(`${device}: ${component.name}は内部配置を保ったまま幅に収まりません`);
      place(component, { x: 16, y: cursor, width: leftWidth, height });
      cursor = Math.max(cursor + height, (component.layouts[device]?.y || 0) + (component.layouts[device]?.height || 0)) + gap;
    }
    const mapTop = desktop ? top : cursor;
    if (rootMap) place(rootMap, { x: desktop ? mapLeft : 16, y: mapTop, width: desktop ? mapWidth : w - 32, height: h - mapTop - 16, presentation: 'inline', zIndex: 0 });
    let listIndex = 0, detailIndex = 0, floatIndex = 0, extraY = mapTop;
    for (const component of roots) {
      if (component === header || form.includes(component) || component === rootMap) continue;
      if (component.kind === 'place-list') {
        place(component, desktop ? { x: 16, y: cursor, width: leftWidth, height: Math.max(120, h - cursor - 16), presentation: 'panel', zIndex: panelOrder } : { x: 16, y: Math.max(mapTop, h - 356), width: w - 32, height: Math.min(340, h - mapTop - 16), presentation: 'bottom-sheet', zIndex: panelOrder }); listIndex++;
      } else if (component.kind === 'place-detail') { place(component, desktop ? { x: w - 16 - rightWidth, y: top, width: rightWidth, height: h - top - 16, presentation: 'panel', zIndex: panelOrder + 1 } : { x: 16, y: Math.max(mapTop, h - 356), width: w - 32, height: Math.min(340, h - mapTop - 16), presentation: 'bottom-sheet', zIndex: panelOrder + 1 }); detailIndex++; }
      else if (component.kind === 'floating-action') { place(component, { x: desktop ? mapLeft + mapWidth - 152 : w - 152, y: h - 72 - floatIndex * 56, width: 136, height: 48, zIndex: baseOrder + 1 }); floatIndex++; }
      else {
        const layout = component.layouts[device];
        if (layout) { place(component, { x: desktop ? mapLeft : 16, y: extraY }); extraY += layout.height + gap; }
      }
    }
    if (listIndex > 1) errors.push(`${device}: 複数の地点一覧を自動配置できません`);
    if (detailIndex > 1) errors.push(`${device}: 複数の地点詳細を自動配置できません`);
    const locked = roots.filter(component => protectedSelection(screen, [component.id]));
    for (const component of roots) {
      const rect = worldRect(screen, component, device), layout = component.layouts[device];
      if (!rect || !layout) continue;
      if (rect.width < 40 || rect.height < 24 || rect.x < 0 || rect.y < 0 || rect.x + rect.width > w + .01 || rect.y + rect.height > h + .01) errors.push(`${device}: ${component.name}が画面に収まりません`);
      if (protectedSelection(screen, [component.id])) continue;
      for (const fixed of locked) {
        const overlay = (a: Component, b: Component) => (a === rootMap || a.kind === 'map-view') && (b.kind === 'floating-action' || ['place-list','place-detail'].includes(b.kind) && b.layouts[device]?.presentation !== 'inline');
        if (overlay(component, fixed) || overlay(fixed, component)) continue;
        const other = worldRect(screen, fixed, device);
        if (other && rect.x < other.x + other.width && rect.x + rect.width > other.x && rect.y < other.y + other.height && rect.y + rect.height > other.y) errors.push(`${device}: ${component.name}とロックされた${fixed.name}が衝突します`);
      }
    }
  }
  if (!errors.length) errors.push(...validateDesign(next).errors.map(error => `配置を適用できません: ${error}`));
  return { design: errors.length ? undefined : next, errors: [...new Set(errors)], changes };
}
