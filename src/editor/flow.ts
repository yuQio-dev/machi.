import type { Component, Design, Transition } from './model';

export function actionWarnings(component: Component): string[] {
  const payloads: Record<string, string[]> = { 'place-select': ['placeId'], 'query-change': ['value'], 'filter-change': ['value'], clear: [], close: [], activate: [] };
  return component.interactions.flatMap(interaction => interaction.actions.flatMap(action => {
    const warnings: string[] = [];
    for (const expression of [action.value, action.screen]) {
      const value = expression as { source?: string; key?: string } | undefined;
      if (value?.source === 'event' && payloads[interaction.event] && !payloads[interaction.event].includes(value.key || 'value')) warnings.push(`${component.name}: ${action.type}の入力「${value.key || 'value'}」がこの操作から渡されません。値の設定を確認してください`);
    }
    const value = action.value as { source?: string; value?: unknown } | undefined;
    if (action.type === 'open-url' && value?.source === 'literal' && (typeof value.value !== 'string' || !/^https?:\/\//.test(value.value))) warnings.push(`${component.name}: 開くURLが未設定または未対応です`);
    return warnings;
  }));
}

export type FlowEdge = { id: string; screenId: string; componentId: string; event: string; actionIndex: number; interactionIndex: number; targetId: string; label: string; back: boolean };
export function screenFlow(design: Design): { edges: FlowEdge[]; warnings: string[] } {
  const edges: FlowEdge[] = [], warnings: string[] = [];
  for (const screen of design.screens) for (const component of screen.components) {
    warnings.push(...actionWarnings(component));
    component.interactions.forEach((interaction, interactionIndex) => {
    if (!interaction.actions.length) warnings.push(`${component.name}: 動作が未設定です`);
    interaction.actions.forEach((action, actionIndex) => {
      if (action.targetId && !screen.components.some(item => item.id === action.targetId)) warnings.push(`${component.name}: 操作先がありません`);
      if (!['navigate', 'go-back'].includes(action.type)) return;
      const value = action.screen as { source?: string; value?: string } | undefined;
      const targetId = action.type === 'go-back' ? action.fallbackScreenId || design.initialScreenId : value?.source === 'literal' ? value.value || '' : '';
      if (!targetId || !design.screens.some(item => item.id === targetId)) warnings.push(`${component.name}: 移動先が未設定または不明です`);
      edges.push({ id: `${component.id}-${interactionIndex}-${actionIndex}`, screenId: screen.id, componentId: component.id, event: interaction.event, actionIndex, interactionIndex, targetId, label: component.name, back: action.type === 'go-back' });
    });
    });
  }
  const reachable = new Set([design.initialScreenId]);
  for (let previous = -1; previous !== reachable.size;) { previous = reachable.size; for (const edge of edges) if (reachable.has(edge.screenId) && edge.targetId) reachable.add(edge.targetId); }
  for (const screen of design.screens) if (!reachable.has(screen.id)) warnings.push(`${screen.name}: 初期画面から到達する動作がありません`);
  return { edges, warnings };
}
export const noTransition: Transition = { type: 'none', durationMs: 0, direction: 'up' };
export function reverseTransition(transition: Transition): Transition {
  const reverse = { up: 'down', down: 'up', left: 'right', right: 'left' } as const;
  return { ...transition, direction: reverse[transition.direction] };
}
