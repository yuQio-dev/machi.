// Shared runtime-facing types for machi-design v2. JSON Schema remains the validator.
export type Device = 'desktop' | 'mobile';
export type Layout = {
  x: number; y: number; width: number; height: number; zIndex: number; hidden: boolean;
  presentation: string; initialOpen?: boolean; horizontal?: string; vertical?: string;
};
export type InteractionAction = {
  type: string; targetId?: string; datasetId?: string; field?: string; operator?: string;
  value?: unknown; scope?: string; screen?: unknown; fallbackScreenId?: string;
  newTab?: boolean; delta?: number; message?: string; tone?: string;
  transition?: Transition;
};
export type Transition = { type: 'none' | 'fade' | 'slide'; durationMs: number; direction: 'up' | 'down' | 'left' | 'right' };
export type Interaction = { event: string; actions: InteractionAction[] };
export type Component = {
  id: string; kind: string; version?: number; name: string; parentId: string | null;
  props: Record<string, unknown>; binding: { datasetId: string; mode: string } | null;
  style?: Record<string, unknown>; transition?: Record<string, unknown>;
  layouts: { desktop?: Layout; mobile?: Layout };
  editor?: { locked?: boolean; group?: boolean };
  implementationNote?: string;
  interactions: Interaction[];
};
export type DatasetColumn = { key: string; label?: string; type?: string; visibility: string };
export type Dataset = {
  id: string; name?: string; columns: DatasetColumn[]; mapping: Record<string, string>;
  rows: { id: string; values: Record<string, unknown> }[];
  searchMatch?: 'all' | 'any'; filterMatch?: 'all' | 'any';
  source?: { kind: string; label: string; url: string };
};
export type Screen = {
  id: string; name: string; frames: Record<Device, { width: number; height: number }>;
  components: Component[];
  implementationNote?: string;
};
export type Design = {
  $schema?: string; format: string; schemaVersion: number; id: string; title: string;
  description?: string; locale?: string; theme?: Record<string, unknown>; responsive?: Record<string, unknown>;
  initialScreenId: string; datasets: Dataset[]; screens: Screen[];
};

