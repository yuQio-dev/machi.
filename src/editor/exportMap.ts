import type { Design } from './model';
import { publicDesign } from './runtime';

export function mapHtml(design: Design, javascript: string, css: string): string {
  const data = JSON.stringify(publicDesign(design)).replace(/</g, '\\u003c');
  const title = design.title.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${css.replace(/<\/style/gi, '<\\/style')}</style><div id="root"></div><script id="machi-data" type="application/json">${data}</script><script>${javascript.replace(/<\/script/gi, '<\\/script')}</script></html>`;
}

export async function buildMapHtml(design: Design): Promise<string> {
  const urls = ['viewer/viewer.js', 'viewer/viewer.css'];
  const [js, css] = await Promise.all(urls.map(async path => {
    const response = await fetch(new URL(path, document.baseURI));
    if (!response.ok) throw new Error('地図の出力ファイルを読み込めません。再度お試しください。');
    return response.text();
  }));
  return mapHtml(design, js, css);
}
