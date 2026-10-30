import { FIELDS, validateTable, type Table } from '../../dist/builder/core.mjs';
import type { Dataset, Design } from './model';

export function importTableDesign(design: Design, table: Table, mapping: Record<string, number>, published: string[], source: { kind: string; label: string; url: string }): Design {
  const checked = validateTable(table, mapping);
  if (checked.missing.length || checked.duplicatedColumns || !checked.valid.length) throw new Error('列対応と有効な地点を確認してください');
  const known = FIELDS.filter(field => field.key !== 'id');
  const target = design.datasets[0] || { id: 'places', columns: [], mapping: Object.fromEntries(known.map(field => [field.key, field.key])), rows: [], searchMatch: 'all', filterMatch: 'all' };
  const assigned = new Set(Object.values(mapping).filter(index => index >= 0));
  const extras = table.headers.map((label, index) => ({ key: `extra_${index}`, label, index })).filter(column => !assigned.has(column.index));
  if (known.length + extras.length + 2 > 50) throw new Error('内部列を含めると50列を超えます。不要な列を減らしてください');
  const allowed = new Set([...published, 'name', 'lat', 'lon']);
  if (design.screens.some(screen => screen.components.some(component => component.binding?.datasetId === target.id && component.kind === 'category-chips'))) allowed.add('category');
  const columns = [
    ...known.map(field => ({ key: field.key, label: field.label, type: ['lat', 'lon'].includes(field.key) ? 'number' : 'string', visibility: allowed.has(field.key) ? 'public' : 'internal' })),
    ...extras.map(({ key, label }) => ({ key, label: label.slice(0, 80), type: 'string', visibility: 'internal' })),
    { key: 'sourceRow', label: '元の行番号', type: 'number', visibility: 'internal' },
    { key: 'originalId', label: '元の地点ID', type: 'string', visibility: 'internal' },
  ];
  const nextDataset: Dataset = {
    ...target, name: source.label.slice(0, 160), columns, source: { ...source, label: source.label.slice(0, 160) },
    mapping: Object.fromEntries(Object.keys(target.mapping).map(role => [role, role])),
    rows: checked.valid.map(point => {
      const raw = table.rows[point.row - table.headerRow - 1];
      return { id: `place-${point.row}`, values: {
        ...Object.fromEntries(known.map(field => [field.key, point[field.key] ?? ''])),
        ...Object.fromEntries(extras.map(column => [column.key, raw[column.index] || ''])),
        sourceRow: point.row, originalId: String(point.id),
      } };
    }),
  };
  const next = structuredClone(design);
  const renamedFields = new Map(Object.entries(target.mapping).map(([role, field]) => [field, role]));
  next.datasets = design.datasets.length ? next.datasets.map(dataset => dataset.id === target.id ? nextDataset : dataset) : [nextDataset];
  for (const screen of next.screens) for (const component of screen.components) {
    if (component.binding?.datasetId !== target.id) continue;
    for (const key of ['searchFields', 'displayFields']) {
      if (Array.isArray(component.props[key])) {
        const fields = (component.props[key] as string[]).map(field => renamedFields.get(field) || field).filter(field => allowed.has(field));
        component.props[key] = fields.length ? fields : ['name'];
      }
    }
    for (const key of ['field', 'imageField']) if (typeof component.props[key] === 'string') component.props[key] = renamedFields.get(component.props[key]) || component.props[key];
    if (typeof component.props.imageField === 'string' && !allowed.has(component.props.imageField)) component.props.imageField = null;
    if (component.kind === 'text' && typeof component.props.field === 'string' && !allowed.has(component.props.field)) { component.props.field = null; component.binding = null; }
    if (component.kind === 'map-view') component.props.center = { lat: checked.valid[0].lat, lon: checked.valid[0].lon };
    for (const interaction of component.interactions) for (const action of interaction.actions) {
      if (action.datasetId === target.id && action.field) action.field = renamedFields.get(action.field) || action.field;
    }
  }
  return next;
}
