import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icons';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'aria-label'> & {
  icon: string;
  label: string;
  hint?: string;
};
let dismissTooltip: (() => void) | null = null;

export function IconButton({ icon, label, hint, className = '', children, ...props }: Props) {
  const button = useRef<HTMLButtonElement>(null), tooltip = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const clear = () => window.clearTimeout(timer.current);
  const close: () => void = useCallback(() => { window.clearTimeout(timer.current); setOpen(false); if (dismissTooltip === close) dismissTooltip = null; }, []);
  const show = () => { dismissTooltip?.(); dismissTooltip = close; setOpen(true); };
  const leave = () => { clear(); if (document.activeElement !== button.current) timer.current = window.setTimeout(close, 150); };
  useEffect(() => () => { window.clearTimeout(timer.current); if (dismissTooltip === close) dismissTooltip = null; }, [close]);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } };
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', escape, true);
    return () => { window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); window.removeEventListener('keydown', escape, true); };
  }, [open, close]);
  useLayoutEffect(() => {
    if (!open || !button.current || !tooltip.current) return;
    const anchor = button.current.getBoundingClientRect(), box = tooltip.current.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(anchor.left + (anchor.width - box.width) / 2, window.innerWidth - box.width - 8)),
      top: anchor.bottom + box.height + 10 < window.innerHeight ? anchor.bottom + 8 : Math.max(8, anchor.top - box.height - 8),
    });
  }, [open, label, hint]);
  return <span className="icon-button-wrap" onPointerEnter={() => { clear(); timer.current = window.setTimeout(show, 250); }} onPointerLeave={leave}
    onFocusCapture={() => { clear(); show(); }} onBlurCapture={close} onPointerDown={close} onClickCapture={close}>
    <button {...props} ref={button} type={props.type || 'button'} aria-label={label} aria-describedby={open ? id : undefined} className={`icon-button ${className}`}>
      {children || <Icon name={icon} />}
    </button>
    {open && createPortal(<div id={id} ref={tooltip} className="button-tooltip" role="tooltip" style={position} onPointerEnter={clear} onPointerLeave={leave}>{label}{hint && <small>{hint}</small>}</div>, button.current?.closest('dialog[open], [popover]') || document.body)}
  </span>;
}
