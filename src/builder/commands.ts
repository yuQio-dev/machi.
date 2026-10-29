import type { Component, Design, Device, Layout } from './model';
import { bounds, descendants, ordered, parentFrame, protectedSelection, refreshGroups, roots, worldRect } from './geometry';

export type Clipboard = { projectId: string; screenId: string; components: Component[] };
export type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type EditorCommand =
  | { type: 'move'; dx: number; dy: number }
  | { type: 'layout'; patches: Record<string, Partial<Layout>> }
  | { type: 'align'; alignment: Alignment; relativeTo: 'selection' | 'parent' }
  | { type: 'lock'; locked: boolean }
  | { type: 'delete' | 'duplicate' | 'group' | 'ungroup' | 'front' | 'back' }
  | { type: 'paste'; clipboard: Clipboard }
  | { type: 'style'; patch: Record<string, unknown>; reset?: string[] }
  | { type: 'preset-size'; axis: 'width' | 'height'; value: number | 'standard' | 'half' | 'full' }
  | { type: 'visibility'; hidden: boolean };
export type CommandResult = { design: Design; selection: string[]; warnings: string[] };

export function groupingReason(screen: import('./model').Screen, ids: string[]): string {
  const selected = roots(screen, ids);
  if (protectedSelection(screen, ids)) return 'ロックされた部品を含むため操作できません';
  if (selected.length < 2) return '2部品以上を選択してください';
  if (new Set(selected.map(component => component.parentId)).size !== 1) return '同じ親の部品を選択してください';
  for (const device of ['desktop', 'mobile'] as const) {
    if (selected.some(component => !component.layouts?.[device])) return '両端末に配置が必要です';
    const siblings = ordered(screen.components.filter(component => component.parentId === selected[0].parentId), device);
    const positions = selected.map(component => siblings.findIndex(item => item.id === component.id)).sort((a,b) => a-b);
    if (positions.at(-1)! - positions[0] + 1 !== positions.length) return '重なり順が連続する部品を選択してください';
  }
  return '';
}

export function copyComponents(design: Design, screenId: string, ids: string[]): Clipboard {
  const screen = design.screens.find(item => item.id === screenId)!;
  const included = new Set(descendants(screen, ids));
  const components = structuredClone(screen.components.filter(component => included.has(component.id)));
  for (const component of components) if (component.parentId && !included.has(component.parentId)) {
    for (const device of ['desktop', 'mobile'] as const) {
      const rect = worldRect(screen, component, device);
      if (rect && component.layouts?.[device]) Object.assign(component.layouts?.[device]!, { x: rect.x, y: rect.y });
    }
    component.parentId = null;
  }
  return { projectId: design.id, screenId, components };
}

export function applyCommand(source: Design, screenId: string, device: Device, ids: string[], command: EditorCommand): CommandResult {
  const unchanged = (message?: string): CommandResult => ({ design: source, selection: ids, warnings: message ? [message] : [] });
  const original = source.screens.find(item => item.id === screenId);
  if (!original) return unchanged('対象の画面がありません');
  if (command.type !== 'paste' && !ids.length) return unchanged('部品を選択してください');
  const selected = roots(original, ids);
  const geometryCommands = ['move', 'layout', 'align', 'delete', 'group', 'ungroup', 'preset-size'];
  if (geometryCommands.includes(command.type) && protectedSelection(original, selected.map(component => component.id))) return unchanged('ロックされた部品を含むため操作できません');
  const next = structuredClone(source), screen = next.screens.find(item => item.id === screenId)!;
  const chosen = new Set(ids), moving = new Set(selected.map(component => component.id));
  let selection = ids;
  const updateLayouts = (patch: (component: Component, layout: Layout) => Partial<Layout>) => {
    for (const component of screen.components) if (moving.has(component.id) && component.layouts?.[device]) Object.assign(component.layouts?.[device]!, patch(component, component.layouts?.[device]!));
  };
  const uniqueId = (base: string) => {
    const used = new Set(next.screens.flatMap(item => item.components.map(component => component.id)));
    let id = base.slice(0, 56), i = 2;
    while (used.has(id)) id = `${base.slice(0, 52)}-${i++}`;
    return id;
  };
  if (command.type === 'move') updateLayouts((_component, layout) => ({ x: layout.x + command.dx, y: layout.y + command.dy }));
  if (command.type === 'layout') {
    if (screen.components.some(component => moving.has(component.id) && component.editor?.group && command.patches[component.id] && (command.patches[component.id].width !== undefined && command.patches[component.id].width !== component.layouts?.[device]?.width || command.patches[component.id].height !== undefined && command.patches[component.id].height !== component.layouts?.[device]?.height))) return unchanged('グループ全体の拡大縮小には対応していません');
    for (const component of screen.components) if (moving.has(component.id) && component.layouts?.[device] && command.patches[component.id]) Object.assign(component.layouts?.[device]!, command.patches[component.id]);
  }
  if (command.type === 'lock') for (const component of screen.components) if (chosen.has(component.id)) component.editor = { ...component.editor, locked: command.locked };
  if (command.type === 'visibility') updateLayouts(() => ({ hidden: command.hidden }));
  if (command.type === 'style') for (const component of screen.components) if (chosen.has(component.id)) {
    component.style = { ...component.style, ...command.patch };
    for (const key of command.reset || []) delete component.style[key];
  }
  if (command.type === 'align') {
    if (new Set(selected.map(component => component.parentId)).size > 1) return unchanged('同じ親の部品を選択してください');
    const placed = selected.filter(component => component.layouts?.[device]);
    const box = command.relativeTo === 'parent' ? parentFrame(screen, selected[0], device) : bounds(placed.map(component => component.layouts?.[device]!));
    updateLayouts((_component, layout) => {
      switch (command.alignment) {
        case 'left': return { x: box.x }; case 'right': return { x: box.x + box.width - layout.width };
        case 'center': return { x: box.x + (box.width - layout.width) / 2 };
        case 'top': return { y: box.y }; case 'bottom': return { y: box.y + box.height - layout.height };
        case 'middle': return { y: box.y + (box.height - layout.height) / 2 };
      }
    });
  }
  if (command.type === 'preset-size') updateLayouts((component) => {
    if (component.editor?.group) return {};
    const available = parentFrame(screen, component, device).width;
    const standard = component.kind === 'map-view' ? 720 : ['place-list', 'place-detail'].includes(component.kind) ? 320 : component.kind === 'text' ? 340 : component.kind === 'app-header' ? 500 : 280;
    const value = typeof command.value === 'number' ? command.value : command.value === 'full' ? available - 32 : command.value === 'half' ? (available - 48) / 2 : Math.min(standard, available - 32);
    return { [command.axis]: Math.max(command.axis === 'width' ? 40 : 30, value) };
  });
  if (command.type === 'delete') {
    const removed = new Set(descendants(screen, ids));
    screen.components = screen.components.filter(component => !removed.has(component.id));
    for (const component of screen.components) for (const interaction of component.interactions) interaction.actions = interaction.actions.filter(action => !action.targetId || !removed.has(action.targetId));
    for (const component of screen.components) component.interactions = component.interactions.filter(interaction => interaction.actions.length);
    selection = [];
  }
  if (command.type === 'duplicate' || command.type === 'paste') {
    const clipboard = command.type === 'paste' ? command.clipboard : copyComponents(source, screenId, ids);
    if (clipboard.projectId !== source.id) return unchanged('同じプロジェクト内でコピーしてください');
    const included = new Set(clipboard.components.map(component => component.id));
    const local = new Set(screen.components.map(component => component.id));
    const missing = clipboard.components.flatMap(component => component.interactions.flatMap(interaction => interaction.actions.filter(action => action.targetId && !included.has(action.targetId) && !local.has(action.targetId)).map(action => `${component.name} → ${action.targetId}`)));
    if (missing.length) return unchanged(`操作先も一緒にコピーしてください: ${missing.join('、')}`);
    if (clipboard.components.some(component => component.binding && !source.datasets.some(dataset => dataset.id === component.binding!.datasetId))) return unchanged('コピー元のデータセットがありません');
    if (screen.components.length + clipboard.components.length > 200) return unchanged('1画面の部品数は200までです');
    const copies = structuredClone(clipboard.components), idMap = new Map<string, string>();
    for (const component of copies) {
      const old = component.id; component.id = uniqueId(`${old}-copy`); idMap.set(old, component.id);
      screen.components.push(component);
    }
    for (const targetDevice of ['desktop', 'mobile'] as const) {
      const box = bounds(copies.filter(component => !component.parentId || !included.has(component.parentId)).flatMap(component => component.layouts?.[targetDevice] ? [component.layouts?.[targetDevice]!] : []));
      const offset = clipboard.screenId === screenId ? { x: 24, y: 24 } : { x: 24 - box.x, y: 24 - box.y };
      for (const component of copies) if ((!component.parentId || !included.has(component.parentId)) && component.layouts?.[targetDevice]) {
        component.layouts[targetDevice]!.x += offset.x; component.layouts[targetDevice]!.y += offset.y;
        component.layouts[targetDevice]!.zIndex += 1;
      }
    }
    for (const component of copies) {
      component.name = `${component.name.slice(0, 150)} のコピー`;
      component.parentId = component.parentId ? idMap.get(component.parentId) || null : null;
      component.editor = { ...component.editor, locked: false };
      for (const interaction of component.interactions) for (const action of interaction.actions) if (action.targetId && idMap.has(action.targetId)) action.targetId = idMap.get(action.targetId);
    }
    selection = copies.map(component => component.id);
  }
  if (command.type === 'front' || command.type === 'back') {
    for (const parent of new Set(selected.map(component => component.parentId))) {
      const siblings = ordered(screen.components.filter(component => component.parentId === parent), device);
      const a = siblings.filter(component => moving.has(component.id)), b = siblings.filter(component => !moving.has(component.id));
      (command.type === 'front' ? [...b, ...a] : [...a, ...b]).forEach((component, index) => { if (component.layouts?.[device]) component.layouts[device]!.zIndex = index + 1; });
    }
  }
  if (command.type === 'group') {
    const reason = groupingReason(original, ids);
    if (reason) return unchanged(reason);
    if (selected.length < 2) return unchanged('2部品以上を選択してください');
    if (new Set(selected.map(component => component.parentId)).size !== 1) return unchanged('同じ親の部品を選択してください');
    if (screen.components.length >= 200) return unchanged('部品数の上限に達しています');
    for (const targetDevice of ['desktop', 'mobile'] as const) {
      if (selected.some(component => !component.layouts?.[targetDevice])) return unchanged('両端末に配置が必要です');
      const siblings = ordered(original.components.filter(component => component.parentId === selected[0].parentId), targetDevice);
      const indexes = selected.map(component => siblings.findIndex(item => item.id === component.id)).sort((a, b) => a - b);
      if (indexes.at(-1)! - indexes[0] + 1 !== indexes.length) return unchanged('重なり順が連続する部品を選択してください');
    }
    const id = uniqueId('group');
    const group: Component = { id, name: 'グループ', kind: 'container', version: 1, parentId: selected[0].parentId, props: { clip: false }, style: {}, binding: null, interactions: [], editor: { group: true }, transition: { type: 'none', durationMs: 0, direction: 'up' }, layouts: {} };
    for (const targetDevice of ['desktop', 'mobile'] as const) {
      const children = screen.components.filter(component => moving.has(component.id));
      const box = bounds(children.map(component => component.layouts?.[targetDevice]!));
      group.layouts[targetDevice] = { ...box, hidden: false, presentation: 'inline', horizontal: 'start', vertical: 'start', zIndex: Math.min(...children.map(component => component.layouts?.[targetDevice]!.zIndex)) };
      ordered(children, targetDevice).forEach((component, index) => { const layout = component.layouts?.[targetDevice]!; layout.x -= box.x; layout.y -= box.y; layout.zIndex = index + 1; });
      let inserted = false;
      const siblings = ordered(original.components.filter(component => component.parentId === selected[0].parentId), targetDevice).flatMap(component => {
        if (!moving.has(component.id)) return [screen.components.find(item => item.id === component.id)!];
        if (inserted) return [];
        inserted = true; return [group];
      });
      siblings.forEach((component, index) => { if (component.layouts?.[targetDevice]) component.layouts[targetDevice]!.zIndex = index + 1; });
    }
    for (const component of screen.components) if (moving.has(component.id)) component.parentId = id;
    screen.components.push(group); selection = [id];
  }
  if (command.type === 'ungroup') {
    if (selected.length !== 1 || !selected[0].editor?.group) return unchanged('操作用グループを1つ選択してください');
    const group = screen.components.find(component => component.id === selected[0].id)!;
    const children = screen.components.filter(component => component.parentId === group.id);
    for (const targetDevice of ['desktop', 'mobile'] as const) {
      const siblings = ordered(screen.components.filter(component => component.parentId === group.parentId), targetDevice);
      const order = siblings.flatMap(component => component.id === group.id ? ordered(children, targetDevice) : [component]);
      order.forEach((component, index) => { if (component.layouts?.[targetDevice]) component.layouts[targetDevice]!.zIndex = index + 1; });
      for (const child of children) if (child.layouts?.[targetDevice] && group.layouts?.[targetDevice]) { child.layouts[targetDevice]!.x += group.layouts?.[targetDevice]!.x; child.layouts[targetDevice]!.y += group.layouts?.[targetDevice]!.y; }
    }
    for (const child of children) child.parentId = group.parentId;
    for (const component of screen.components) for (const interaction of component.interactions) if (interaction.actions.some(action => action.targetId === group.id)) return unchanged('グループを操作先として参照しています。先に動作設定を変更してください');
    screen.components = screen.components.filter(component => component.id !== group.id); selection = children.map(component => component.id);
  }
  if (['move', 'layout', 'align', 'delete', 'group', 'ungroup', 'preset-size'].includes(command.type)) refreshGroups(screen);
  for (const component of screen.components) for (const layout of Object.values(component.layouts || {})) {
    if (![layout.x, layout.y, layout.width, layout.height, layout.zIndex].every(Number.isFinite) || layout.x < -8192 || layout.y < -8192 || layout.x > 32768 || layout.y > 32768 || layout.width < 1 || layout.width > 8192 || layout.height < 1 || layout.height > 16384 || layout.zIndex < 0 || layout.zIndex > 10000) return unchanged('配置値が対応範囲を超えています');
  }
  return { design: next, selection, warnings: [] };
}
