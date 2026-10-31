import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Design } from './model';
import { ViewerContent } from './ViewerContent';

const design: Design = JSON.parse(document.getElementById('machi-data')!.textContent!);
function Viewer() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => { const resize = () => setWidth(window.innerWidth); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  return <main><ViewerContent design={design} width={width} /></main>;
}
createRoot(document.getElementById('root')!).render(<Viewer />);
