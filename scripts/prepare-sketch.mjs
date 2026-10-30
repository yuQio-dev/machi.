import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = new URL('../../design/machi-contracts/', import.meta.url);
const target = new URL('../src/builder/contracts/', import.meta.url);
const names = ['project.schema.json', 'component-registry.json', 'project.v1.schema.json', 'ushiku-demo.machi.json', 'generic-components.machi.json', 'machi-types.ts', 'ushiku-demo.v1.machi.json'];
const exists = async url => access(url).then(() => true, () => false);
await mkdir(target, { recursive: true });
if (await exists(new URL('project.schema.json', source))) {
  for (const name of names.filter(name => !name.startsWith('ushiku-demo.') && name !== 'generic-components.machi.json')) {
    await copyFile(new URL(name, source), new URL(name, target));
  }
  for (const name of ['ushiku-demo.machi.json', 'ushiku-demo.v1.machi.json', 'generic-components.machi.json']) await copyFile(new URL(`examples/${name}`, source), new URL(name, target));
  console.log(`machi. contracts copied from ${fileURLToPath(source)}`);
} else {
  for (const name of names) {
    if (!(await exists(new URL(name, target)))) throw new Error(`Missing bundled contract: ${name}`);
  }
  console.log('machi. bundled contract snapshot used');
}

// Reuse the original published map records without changing the contract example.
const original = JSON.parse(await readFile(new URL('ushiku-demo.machi.json', target), 'utf8'));
const snapshot = JSON.parse(await readFile(new URL('../dist/data.snapshot.json', import.meta.url), 'utf8'));
original.title = 'うしくスポットマップ';
original.description = '当初の牛久市マップの保存データ（2026年10月14日）から編集できます。';
const dataset = original.datasets[0];
dataset.name = '牛久市の保存データ';
dataset.rows = snapshot.items.map(item => ({ id:item.id, values:Object.fromEntries(dataset.columns.map(column => [column.key, column.key === 'image' ? (/^https?:/.test(item.image || '') ? item.image : 'https://yuqio-dev.github.io/ushiku-map/images/' + encodeURIComponent(item.image || '')) : item[column.key] ?? ''])) }));
await writeFile(new URL('ushiku-original.machi.json', target), JSON.stringify(original,null,2)+'\n');
