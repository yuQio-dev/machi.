import type { Component, Design } from './model';

// Project-authored palettes: no source product code or assets are embedded.
export const palettes = {
  purple: { label: 'Purple', accent: '#7952b3' }, blue: { label: 'Blue', accent: '#2563b8' },
  green: { label: 'Green', accent: '#34734f' }, coral: { label: 'Coral', accent: '#b34642' },
  amber: { label: 'Amber', accent: '#8c640d' }, teal: { label: 'Teal', accent: '#257773' }, mono: { label: 'Mono', accent: '#5d5d68' },
};
export const mapPresentation = { categoryGap: 6, cardGap: 10, cardPadding: 8, detailPadding: 12 } as const;
export function markerAppearance(design: Design, component: Component) {
  if (design.theme?.managed !== true) return { normal: '#a484d0', normalBorder: '#6b46a5', selected: '#7952b3', selectedBorder: '#4d267c' };
  const accent = String(component.style?.color || design.theme.accent || '#7952b3');
  return { normal: accent, normalBorder: accent, selected: accent, selectedBorder: accent };
}
export function themePreset(design: Design, palette: keyof typeof palettes, mode: 'light' | 'dark') {
  const hex = palettes[palette].accent;
  const rgb = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  const lightAccent = '#' + rgb.map(value => Math.round(value * .35 + 255 * .65).toString(16).padStart(2, '0')).join('');
  return { ...design.theme, managed: true, palette, mode, accent: mode === 'dark' ? lightAccent : hex, background: mode === 'dark' ? '#1c1922' : '#faf8fd', foreground: mode === 'dark' ? '#f1eaf8' : '#332b43' };
}
export function resolveAppearance(design: Design, component: Component) {
  const theme = design.theme || {}, style = component.style || {}, managed = theme.managed === true;
  const accent = String(theme.accent || '#7952b3'), surface = String(theme.background || '#faf8fd'), text = String(theme.foreground || '#332b43');
  const variant = style.variant;
  const defaults: Record<string, unknown> = {};
  if (managed && !component.editor?.group) {
    defaults.background = surface; defaults.color = text;
    defaults.fontSize = 14 * Number(theme.scale || 1);
    defaults.fontFamily = theme.font === 'serif' ? '"Yu Mincho","Hiragino Mincho ProN",serif' : theme.font === 'mono' ? 'ui-monospace,"Yu Gothic",monospace' : 'Inter,"Noto Sans JP","Yu Gothic",sans-serif';
    defaults.radius = component.kind === 'floating-action' ? 12 : 8;
    if (theme.shape === 'square') defaults.radius = 0;
    if (theme.shape === 'round') defaults.radius = component.kind === 'floating-action' ? 64 : 24;
    if (component.kind === 'floating-action') Object.assign(defaults, { background: accent, color: theme.mode === 'dark' ? '#201626' : '#ffffff' });
  }
  if (variant === 'filled') Object.assign(defaults, { background: accent, color: theme.mode === 'dark' ? '#201626' : '#ffffff', borderWidth: 0 });
  if (variant === 'tonal') Object.assign(defaults, { background: theme.mode === 'dark' ? '#393044' : '#eee5f8', color: text, borderWidth: 0 });
  if (variant === 'outline') Object.assign(defaults, { background: surface, color: accent, borderColor: accent, borderWidth: 1 });
  return { ...defaults, ...style };
}
export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const values = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
