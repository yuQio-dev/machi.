import { useRef, useState } from 'react';
import type { Design } from './model';

type History = { past: Design[]; present: Design; future: Design[] };
export function commitHistory(current: History, next: Design): History {
  return JSON.stringify(current.present) === JSON.stringify(next) ? current : { past: [...current.past.slice(-49), current.present], present: next, future: [] };
}
export function useHistory(initial: Design) {
  const [state, setState] = useState<History>({ past: [], present: initial, future: [] });
  const [draft, setDraft] = useState<Design | null>(null);
  const pending = useRef<Design | null>(null);
  const finish = () => { const next = pending.current; pending.current = null; setDraft(null); if (next) setState(current => commitHistory(current, next)); };
  const commit = (next: Design) => { finish(); setState(current => commitHistory(current, next)); };
  const stage = (next: Design) => { pending.current = next; setDraft(next); };
  const reset = (present: Design) => { pending.current = null; setDraft(null); setState({ past: [], present, future: [] }); };
  const undo = () => { finish(); setState(current => current.past.length ? { past: current.past.slice(0, -1), present: current.past.at(-1)!, future: [current.present, ...current.future] } : current); };
  const redo = () => { finish(); setState(current => current.future.length ? { past: [...current.past, current.present], present: current.future[0], future: current.future.slice(1) } : current); };
  return { ...state, present: draft || state.present, confirmed: state.present, staging: draft !== null, commit, stage, finish, reset, undo, redo };
}
