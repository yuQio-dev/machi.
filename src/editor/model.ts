import Ajv2020 from 'ajv/dist/2020.js';
import schema from './contracts/project.schema.json';
import legacySchema from './contracts/project.v1.schema.json';

export type * from './contracts/machi-types';
import type { Design, Device, Layout } from './contracts/machi-types';

const ajv = new Ajv2020({ allErrors: true, strict: false });
const checkSchema = ajv.compile(schema);
const checkLegacy = ajv.compile(legacySchema);

export function validateDesign(value: unknown): { design?: Design; errors: string[] } {
  const legacy = (value as { schemaVersion?: number } | null)?.schemaVersion === 1;
  const check = legacy ? checkLegacy : checkSchema;
  if (!check(value)) {
    return { errors: (check.errors ?? []).slice(0, 12).map(error => `${error.instancePath || '/'} ${error.message}`) };
  }
  const design = legacy ? { ...structuredClone(value as Design), schemaVersion: 2, $schema: 'project.schema.json' } : value as Design;
  const errors: string[] = [];
  const ids = new Set<string>();
  const datasetIds = new Set<string>();
  const screens = new Set(design.screens.map(screen => screen.id));
  const datasets = new Map(design.datasets.map(dataset => [dataset.id, dataset]));
  if (design.format !== 'machi-design' || design.schemaVersion !== 2) errors.push('対応する形式は machi-design v1/v2 だけです');
  if (screens.size !== design.screens.length) errors.push('画面IDが重複しています');
  if (!screens.has(design.initialScreenId)) errors.push(`初期画面 ${design.initialScreenId} がありません`);
  for (const dataset of design.datasets) {
    if (datasetIds.has(dataset.id)) errors.push(`データセットID ${dataset.id} が重複しています`);
    datasetIds.add(dataset.id);
    const columns = new Set(dataset.columns.map(column => column.key));
    if (columns.size !== dataset.columns.length) errors.push(`${dataset.id}: 列IDが重複しています`);
    for (const [role, key] of Object.entries(dataset.mapping)) {
      if (!columns.has(key)) errors.push(`${dataset.id}: ${role} の列 ${key} がありません`);
    }
    const rowIds = new Set<string>();
    for (const row of dataset.rows) {
      if (rowIds.has(row.id)) errors.push(`${dataset.id}: 地点ID ${row.id} が重複しています`);
      rowIds.add(row.id);
      for (const [key, value] of Object.entries(row.values)) {
        const column = dataset.columns.find(item => item.key === key);
        if (!column) { errors.push(`${row.id}: 列 ${key} がありません`); continue; }
        if (value === null) continue;
        const validType = column.type === 'number' ? typeof value === 'number' && Number.isFinite(value)
          : column.type === 'boolean' ? typeof value === 'boolean' : typeof value === 'string';
        if (!validType) errors.push(`${row.id}: ${key} の値が列の型 ${column.type || 'string'} と一致しません`);
      }
    }
  }
  for (const screen of design.screens) {
    const local = new Set(screen.components.map(component => component.id));
    for (const component of screen.components) {
      if (component.editor?.group && component.kind !== 'container') errors.push(`${component.id}: 操作用グループはcontainerに限ります`);
      if (ids.has(component.id)) errors.push(`部品ID ${component.id} が重複しています`);
      ids.add(component.id);
      if (component.parentId && !local.has(component.parentId)) errors.push(`${component.id}: 親 ${component.parentId} がありません`);
      if (component.binding && !datasets.has(component.binding.datasetId)) errors.push(`${component.id}: データ ${component.binding.datasetId} がありません`);
      if (component.binding) {
        const dataset = datasets.get(component.binding.datasetId);
        const referencedFields = [
          ...(Array.isArray(component.props.searchFields) ? component.props.searchFields : []),
          ...(Array.isArray(component.props.displayFields) ? component.props.displayFields : []),
          ...(typeof component.props.field === 'string' ? [component.props.field] : []),
          ...(typeof component.props.imageField === 'string' ? [component.props.imageField] : []),
        ].filter((field): field is string => typeof field === 'string');
        for (const field of new Set(referencedFields)) {
          if (!dataset?.columns.some(column => column.key === field)) errors.push(`${component.id}: データ列 ${field} がありません`);
          else if (!dataset.columns.some(column => column.key === field && column.visibility === 'public')) errors.push(`${component.id}: 非公開列 ${field} は表示・検索できません`);
        }
      }
      for (const interaction of component.interactions) for (const action of interaction.actions) {
        if (action.targetId && !local.has(action.targetId) && !screens.has(action.targetId)) errors.push(`${component.id}: 操作先 ${action.targetId} がありません`);
        if (action.datasetId && !datasets.has(action.datasetId)) errors.push(`${component.id}: 操作先データ ${action.datasetId} がありません`);
      }
    }
    const byId = new Map(screen.components.map(component => [component.id, component]));
    for (const component of screen.components) {
      const seen = new Set<string>([component.id]);
      let parentId = component.parentId;
      while (parentId) {
        if (seen.has(parentId)) { errors.push(`${component.id}: 親の循環参照があります`); break; }
        seen.add(parentId);
        parentId = byId.get(parentId)?.parentId ?? null;
      }
    }
  }
  return errors.length ? { errors } : { design, errors: [] };
}

export function updateLayout(design: Design, screenId: string, componentId: string, device: Device, patch: Partial<Layout>): Design {
  return {
    ...design,
    screens: design.screens.map(screen => screen.id !== screenId ? screen : {
      ...screen,
      components: screen.components.map(component => component.id !== componentId ? component : {
        ...component,
        layouts: { ...component.layouts, [device]: { ...component.layouts[device], ...patch } },
      }),
    }),
  };
}

export function describeDiff(before: Design, after: Design): string[] {
  const lines: string[] = [];
  let omitted = 0;
  const add = (line: string) => { if (lines.length < 100) lines.push(line); else omitted++; };
  const display = (value: unknown) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return (text || '未設定').length > 64 ? `${(text || '').slice(0, 61)}…` : text || '未設定';
  };
  const compareRecord = (label: string, left: Record<string, unknown>, right: Record<string, unknown>) => {
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      if (JSON.stringify(left[key]) !== JSON.stringify(right[key])) add(`${label} ${key}: ${display(left[key])} → ${display(right[key])}`);
    }
  };
  if (before.title !== after.title) add(`タイトル: ${before.title} → ${after.title}`);
  if (before.description !== after.description) add('プロジェクトの説明を変更');
  if (JSON.stringify(before.theme) !== JSON.stringify(after.theme)) compareRecord('テーマ', before.theme || {}, after.theme || {});
  if (JSON.stringify(before.responsive) !== JSON.stringify(after.responsive)) compareRecord('レスポンシブ設定', before.responsive || {}, after.responsive || {});
  if (before.initialScreenId !== after.initialScreenId) add(`初期画面: ${before.initialScreenId} → ${after.initialScreenId}`);
  const oldScreens = new Map(before.screens.map(screen => [screen.id, screen]));
  for (const screen of after.screens) {
    const previous = oldScreens.get(screen.id);
    if (!previous) { add(`画面を追加: ${screen.name}`); continue; }
    if (previous.name !== screen.name) add(`画面名: ${previous.name} → ${screen.name}`);
    if (previous.implementationNote !== screen.implementationNote) add(`${screen.name} 仕様メモを変更`);
    for (const device of ['desktop', 'mobile'] as const) {
      for (const key of ['width', 'height'] as const) {
        if (previous.frames[device]?.[key] !== screen.frames[device]?.[key]) add(`${screen.name} ${device === 'desktop' ? 'PC' : 'スマホ'} ${key === 'width' ? '幅' : '高さ'}: ${previous.frames[device]?.[key]} → ${screen.frames[device]?.[key]}`);
      }
    }
    const oldComponents = new Map(previous.components.map(component => [component.id, component]));
    for (const component of screen.components) {
      const old = oldComponents.get(component.id);
      if (!old) add(`部品を追加: ${component.name} (${component.id})`);
      else if (JSON.stringify(old) !== JSON.stringify(component)) {
        const label = `${component.name} (${component.id})`;
        if (old.name !== component.name) add(`${label} 名前: ${old.name} → ${component.name}`);
        if (old.parentId !== component.parentId) add(`${label} 親: ${display(old.parentId)} → ${display(component.parentId)}`);
        if (JSON.stringify(old.editor) !== JSON.stringify(component.editor)) add(`${label} ロック・グループ設定を変更`);
        if (old.implementationNote !== component.implementationNote) add(`${label} 仕様メモを変更`);
        if (old.kind !== component.kind) add(`${label} 種類を変更`);
        if (JSON.stringify(old.binding) !== JSON.stringify(component.binding)) add(`${label} データとの接続を変更`);
        compareRecord(`${label} 表示設定`, old.props, component.props);
        compareRecord(`${label} スタイル`, old.style || {}, component.style || {});
        for (const device of ['desktop', 'mobile'] as const) {
          const oldLayout = old.layouts[device]; const nextLayout = component.layouts[device];
          if (JSON.stringify(oldLayout) === JSON.stringify(nextLayout)) continue;
          if (!oldLayout || !nextLayout) { add(`${label} ${device === 'desktop' ? 'PC' : 'スマホ'}配置を${nextLayout ? '追加' : '削除'}`); continue; }
          for (const key of ['x', 'y', 'width', 'height', 'zIndex', 'hidden', 'presentation', 'initialOpen'] as const) {
            if (oldLayout[key] !== nextLayout[key]) add(`${label} ${device === 'desktop' ? 'PC' : 'スマホ'} ${key}: ${display(oldLayout[key])} → ${display(nextLayout[key])}`);
          }
        }
        if (JSON.stringify(old.interactions) !== JSON.stringify(component.interactions)) add(`${label} イベントと操作を変更`);
        if (JSON.stringify(old.transition) !== JSON.stringify(component.transition)) add(`${label} 出現・切替の設定を変更`);
      }
      oldComponents.delete(component.id);
    }
    for (const old of oldComponents.values()) add(`部品を削除: ${old.name} (${old.id})`);
    oldScreens.delete(screen.id);
  }
  for (const old of oldScreens.values()) add(`画面を削除: ${old.name}`);
  const oldDatasets = new Map(before.datasets.map(dataset => [dataset.id, dataset]));
  for (const dataset of after.datasets) {
    const old = oldDatasets.get(dataset.id);
    if (!old) { add(`データセットを追加: ${dataset.name || dataset.id}`); continue; }
    const label = dataset.name || dataset.id;
    if (old.name !== dataset.name) add(`${label} データ名を変更`);
    if (JSON.stringify(old.importSummary) !== JSON.stringify(dataset.importSummary)) add(`${label} 取り込み結果を変更`);
    if (JSON.stringify(old.mapping) !== JSON.stringify(dataset.mapping)) compareRecord(`${label} 列対応`, old.mapping, dataset.mapping);
    if (old.searchMatch !== dataset.searchMatch) add(`${label} 検索語の結合方法を変更`);
    if (old.filterMatch !== dataset.filterMatch) add(`${label} 絞り込みの結合方法を変更`);
    const oldColumns = new Map(old.columns.map(column => [column.key, column]));
    for (const column of dataset.columns) {
      const previous = oldColumns.get(column.key);
      if (!previous) add(`${label} 列を追加: ${column.label || column.key}`);
      else if (JSON.stringify(previous) !== JSON.stringify(column)) add(`${label} 列 ${column.label || column.key} の名前・型・公開区分を変更`);
      oldColumns.delete(column.key);
    }
    for (const column of oldColumns.values()) add(`${label} 列を削除: ${column.label || column.key}`);
    const oldRows = new Map(old.rows.map(row => [row.id, row]));
    const nameField = dataset.mapping.name || old.mapping.name;
    for (const row of dataset.rows) {
      const previous = oldRows.get(row.id);
      const placeName = String(row.values[nameField] || row.id);
      if (!previous) add(`${label} 地点を追加: ${placeName}`);
      else compareRecord(`${label} ${placeName}`, previous.values, row.values);
      oldRows.delete(row.id);
    }
    for (const row of oldRows.values()) add(`${label} 地点を削除: ${String(row.values[old.mapping.name] || row.id)}`);
    oldDatasets.delete(dataset.id);
  }
  for (const old of oldDatasets.values()) add(`データセットを削除: ${old.name || old.id}`);
  if (omitted) lines.push(`ほか${omitted}件の差分を省略しました`);
  return lines.length ? lines : ['差分はありません'];
}
