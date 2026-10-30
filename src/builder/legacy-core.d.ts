declare module '*core.mjs' {
  export type Table = { headers: string[]; rows: string[][]; headerRow: number; mapping: Record<string, number> };
  export type Point = { id: string; row: number; name: string; lat: number; lon: number; [key: string]: string | number };
  export const FIELDS: { key: string; label: string; required?: boolean; aliases: string[] }[];
  export function tableFromGrid(grid: unknown[][], headerIndex?: number): Table;
  export function worksheetGrid(sheet: unknown, utils: { decode_range: (ref: string) => { s: { r: number; c: number }; e: { r: number; c: number } }; sheet_to_json: (sheet: unknown, options: Record<string, unknown>) => unknown[][] }): unknown[][];
  export function validateTable(table: Table, mapping?: Record<string, number>): { valid: Point[]; invalid: { row: number; name: string; reasons: string[] }[]; missing: string[]; duplicatedColumns: boolean; blank: number; total: number };
  export function readGoogleSheet(url: string): Promise<{ text: string; source: { original: string } }>;
}
