import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icons';
import './workflow.css';

export const stageNames = ['データを準備', '設計・動作を調整', 'AIへの指示を整える', 'AIへ渡す・HTML取得'];
const stageDescriptions = ['表と掲載項目を設定', '画面の見た目と動作を調整', '実装指示を編集', '実装指示とHTMLを取得'];
export function StageNav({ step, onNavigate }: { step: number; onNavigate: (step: number) => void }) {
  return <nav className="stage-nav" aria-label="作業の段階"><p className="stage-nav-label">WORKFLOW <span>作業の流れ</span></p>{stageNames.map((name, index) => <button key={name} aria-current={step === index + 1 ? 'step' : undefined} onClick={() => onNavigate(index + 1)}><span className="stage-number">{index + 1}</span><span className="stage-copy"><span>{name}</span><small>{stageDescriptions[index]}</small></span></button>)}</nav>;
}
export function WorkMenu({ step, onNavigate }: { step: number; onNavigate: (step: number) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const keys = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); return; }
    if (event.key === 'Tab') { setOpen(false); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]') || []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };
  return <div className="work-menu-wrap" ref={root}><button ref={trigger} className="work-menu-trigger" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? 'workflow-stage-menu' : undefined} onClick={() => setOpen(value => !value)}><Icon name="checklist" /><span>作業</span><span className="work-menu-progress">{step}<span>/ 4</span></span><Icon name="expand_more" /></button>{open && <div id="workflow-stage-menu" ref={menu} className="work-menu" role="menu" aria-label="作業の段階" onKeyDown={keys}>{stageNames.map((name, index) => <button key={name} role="menuitem" aria-current={step === index + 1 ? 'step' : undefined} onClick={() => { setOpen(false); if (index + 1 === step) trigger.current?.focus(); else onNavigate(index + 1); }}><span className="work-menu-step">{index + 1}</span><span className="work-menu-name">{name}</span>{step === index + 1 && <span className="work-menu-current">作業中</span>}</button>)}</div>}</div>;
}

