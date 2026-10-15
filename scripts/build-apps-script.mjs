import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildImages } from './build-images.mjs';
console.log('Image check: ' + JSON.stringify(await buildImages()));
const root = new URL('../', import.meta.url);
let html = await readFile(new URL('dist/index.html', root), 'utf8');
const css = await readFile(new URL('dist/styles.css', root), 'utf8');
html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>' + css + '</style>');
for (const file of ['config.js', 'images.js', 'model.js', 'app.js']) {
  const source = await readFile(new URL('dist/' + file, root), 'utf8');
  html = html.replace(`  <script src="${file}" defer></script>`, '');
  // 本文の後に置き、DOMと先行するLeafletの読み込み後に起動。
  html = html.replace('</body>', '<script>\n' + source.replace(/<\/script/gi, '<\\/script') + '\n</script>\n</body>');
}
// deferのLeafletより先にインライン処理が走らないよう、先に同期ロードします。
html = html.replace('crossorigin="" defer></script>', 'crossorigin=""></script>');
// クラスタ表示のプラグインも、インラインapp.jsより先に読み込みます。
html = html.replace('leaflet.markercluster.js" defer></script>', 'leaflet.markercluster.js"></script>');
await writeFile(new URL('apps-script/Index.html', root), html);
console.log('Apps Script HTML created: ' + fileURLToPath(new URL('apps-script/Index.html', root)));
