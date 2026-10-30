import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';

type Props = {
  label: string; value: string; placeholder: string; maxLength: number; multiline?: boolean; active: boolean;
  onStart: () => void; onFinish: (value: string | null) => void;
};

export function InlineTextField({ label, value, placeholder, maxLength, multiline, active, onStart, onFinish }: Props) {
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => { if (!active) setDraft(value); }, [active, value]);

  const start = (event: MouseEvent<HTMLSpanElement>) => {
    if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    const down = pointer.current;
    pointer.current = null;
    if (event.detail && down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4) return;
    event.stopPropagation(); setDraft(value); cancelled.current = false; onStart();
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelled.current = true; event.currentTarget.blur(); }
    else if (event.key === 'Enter' && !multiline) { event.preventDefault(); event.currentTarget.blur(); }
  };
  const common = {
    'aria-label': label, className: 'inline-text-input', autoFocus: true, maxLength, value: draft, placeholder,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value),
    onFocus: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => event.currentTarget.setSelectionRange(draft.length, draft.length),
    onKeyDown: keyDown,
    onBlur: () => onFinish(cancelled.current ? null : draft),
  };
  if (active) return multiline ? <textarea {...common} /> : <input {...common} type="text" />;
  return <span role="button" tabIndex={0} aria-label={`${label}を編集`} title="クリックして編集"
    className={`inline-text-display ${!value ? 'is-empty' : ''}`} onPointerDown={event => { pointer.current = { x: event.clientX, y: event.clientY }; }}
    onClick={start} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setDraft(value); cancelled.current = false; onStart(); } }}>
    {value || placeholder}
  </span>;
}
