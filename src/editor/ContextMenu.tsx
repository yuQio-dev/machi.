import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './IconButton';

export type MenuAction = 'copy' | 'paste' | 'lock' | 'group' | 'ungroup' | 'duplicate' | 'front' | 'back' | 'visibility' | 'color' | 'delete' | 'select-all' | 'fit' | 'undo' | 'redo';
export type MenuItem = { action: MenuAction; label: string; disabled?: boolean; danger?: boolean };
export type ColorKey = 'background' | 'color' | 'borderColor';
export type Colors = Record<ColorKey, string>;
const menuShortcuts: Partial<Record<MenuAction, string>> = { copy: 'Ctrl C', paste: 'Ctrl V', duplicate: 'Ctrl D', group: 'Ctrl G', ungroup: 'Ctrl ⇧ G', delete: 'Del', 'select-all': 'Ctrl A', fit: '0', undo: 'Ctrl Z', redo: 'Ctrl Y' };

export function ContextMenu({ x, y, label, items, onAction, onClose }: {
  x: number; y: number; label: string; items: MenuItem[];
  onAction: (action: MenuAction) => void; onClose: (restoreFocus?: boolean) => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = menu.current!;
    element.style.left = `${Math.max(8, Math.min(x, window.innerWidth - element.offsetWidth - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(y, window.innerHeight - element.offsetHeight - 8))}px`;
    element.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [x, y]);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) onClose(false); };
    const dismiss = () => onClose(false);
    const scroll = (event: Event) => { if (!menu.current?.contains(event.target as Node)) dismiss(); };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('blur', dismiss);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('blur', dismiss);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [onClose]);
  return createPortal(<div ref={menu} className="editor-context-menu" role="menu" aria-label={label}
    style={{ left: x, top: y }} onWheel={event => { event.preventDefault(); event.stopPropagation(); menu.current!.scrollTop += event.deltaY; }} onContextMenu={event => event.preventDefault()} onKeyDown={event => {
      const buttons = [...menu.current!.querySelectorAll<HTMLElement>('[role="menuitem"]')];
      const index = buttons.indexOf(document.activeElement as HTMLElement);
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const deleteItem = menu.current!.querySelector<HTMLButtonElement>('[data-menu-action="delete"]:not([aria-disabled="true"])');
        if (deleteItem) { event.preventDefault(); event.stopPropagation(); onAction('delete'); }
      } else if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const key = event.key.toLowerCase();
        const shortcuts: Record<string, MenuAction> = key === 'z' ? { z: event.shiftKey ? 'redo' : 'undo' } : key === 'y' ? { y: 'redo' } : key === 'd' && !event.shiftKey ? { d: 'duplicate' } : key === 'c' ? { c: 'copy' } : key === 'v' ? { v: 'paste' } : key === 'a' ? { a: 'select-all' } : key === 'g' ? { g: event.shiftKey ? 'ungroup' : 'group' } : {};
        const action = shortcuts[key];
        const item = action && menu.current!.querySelector<HTMLButtonElement>(`[data-menu-action="${action}"]`);
        if (item && item.getAttribute('aria-disabled') !== 'true') { event.preventDefault(); event.stopPropagation(); onAction(action); }
      } else if (event.key === '0') {
        const item = menu.current!.querySelector<HTMLButtonElement>('[data-menu-action="fit"]:not([aria-disabled="true"])');
        if (item) { event.preventDefault(); event.stopPropagation(); onAction('fit'); }
      } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      } else if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault(); event.stopPropagation(); onClose();
      }
    }}>
    <div className="context-menu-title" role="presentation">{label}</div>
    {items.map(item => <button key={item.action} role="menuitem" tabIndex={-1} data-menu-action={item.action} aria-disabled={item.disabled || undefined} aria-keyshortcuts={item.action === 'delete' ? 'Delete Backspace' : item.action === 'duplicate' ? 'Control+D Meta+D' : item.action === 'copy' ? 'Control+C Meta+C' : item.action === 'paste' ? 'Control+V Meta+V' : item.action === 'group' ? 'Control+G Meta+G' : item.action === 'ungroup' ? 'Control+Shift+G Meta+Shift+G' : item.action === 'select-all' ? 'Control+A Meta+A' : item.action === 'fit' ? '0' : item.action === 'undo' ? 'Control+Z Meta+Z' : item.action === 'redo' ? 'Control+Y Meta+Y' : undefined}
      className={item.danger ? 'danger' : undefined} onClick={() => { if (!item.disabled) onAction(item.action); }}>
      <span>{item.label}</span>{menuShortcuts[item.action] && <kbd aria-hidden="true">{menuShortcuts[item.action]}</kbd>}
    </button>)}
  </div>, document.body);
}

const colorLabels: Record<ColorKey, string> = { background: '背景色', color: '文字色', borderColor: '枠線色' };
const swatches = ['#ffffff', '#f2eafa', '#7952b3', '#332b43', '#ef6c57', '#e9b949', '#27866b', '#3979c3'];

export function ColorDialog({ count, initial, mixed, onApply, onClose }: {
  count: number; initial: Colors; mixed: ColorKey[];
  onApply: (colors: Partial<Colors>) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [colors, setColors] = useState(initial);
  const [changed, setChanged] = useState<ColorKey[]>([]);
  const setColor = (key: ColorKey, value: string) => {
    setColors(current => ({ ...current, [key]: value }));
    setChanged(current => current.includes(key) ? current : [...current, key]);
  };
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  const valid = changed.length > 0 && changed.every(key => /^#[0-9a-f]{6}$/i.test(colors[key]));
  return createPortal(<dialog ref={dialog} className="component-color-dialog" aria-labelledby="component-color-title"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <h2 id="component-color-title">色を変更</h2>
    <p>{count}部品に適用します。変更した色だけを反映します。</p>
    {(Object.keys(colorLabels) as ColorKey[]).map(key => <fieldset key={key}>
      <legend>{colorLabels[key]}{mixed.includes(key) && !changed.includes(key) ? '（複数の色）' : ''}</legend>
      <div className="color-inputs"><input type="color" aria-label={`${colorLabels[key]}を選ぶ`} value={/^#[0-9a-f]{6}$/i.test(colors[key]) ? colors[key] : initial[key]} onChange={event => setColor(key, event.target.value)} />
        <input aria-label={`${colorLabels[key]}のHEX値`} value={colors[key]} maxLength={7} spellCheck={false} onChange={event => setColor(key, event.target.value)} aria-invalid={changed.includes(key) && !/^#[0-9a-f]{6}$/i.test(colors[key]) || undefined} />
      </div>
      <div className="color-swatches">{swatches.map(value => <IconButton key={value} icon="palette" label={`${colorLabels[key]}を${value}にする`} onClick={() => setColor(key, value)}><span aria-hidden="true" className="theme-swatch" style={{ background: value }} /></IconButton>)}</div>
    </fieldset>)}
    <p className="hint">枠線色を変えると、枠線がない部品には1pxの枠を付けます。地図タイルや写真の色は変わりません。色はPC・スマホ共通です。</p>
    <div className="dialog-actions"><IconButton icon="close" label="取り消す" onClick={onClose} /><IconButton icon="check" label="適用" className="primary-button" disabled={!valid} hint={!changed.length ? '変更する色を選んでください' : !valid ? '6桁のHEX値を入力してください' : undefined} onClick={() => onApply(Object.fromEntries(changed.map(key => [key, colors[key]])))} /></div>
  </dialog>, document.body);
}

