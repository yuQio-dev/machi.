import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import '../dist/images.js';
import '../dist/model.js';

const M = globalThis.MapModel;
const images = globalThis.MapImages;
const root = new URL('../', import.meta.url);
const references = JSON.parse(await readFile(new URL('image-references.json', root), 'utf8'));
const item = (name, image = '') => ({ name, image, lat: 35.98, lon: 140.15 });

test('シートの指定画像11件を解決し、未配置1件と空欄9件を区別する', () => {
  const resolved = references.items.filter(spot => M.imageUrl(spot.image));
  const missing = references.items.filter(spot => spot.image && !M.imageUrl(spot.image));
  assert.equal(resolved.length, 11);
  assert.deepEqual(missing.map(spot => spot.name), ['Dining いごこち屋']);
  assert.equal(references.items.filter(spot => !spot.image).length, 9);
  assert.equal(M.imageUrl('牛久駅.jpg'), 'images/' + encodeURIComponent('牛久駅.jpeg'));
  assert.equal(M.imageUrl('天満屋酒店.jpeg'), 'images/' + encodeURIComponent('天満屋酒店.jpg'));
});

test('濁点の表現を正規化し、画像以外のパスやスクリプトを拒否する', () => {
  assert.equal(M.imageUrl('手作処かっぱ本舗.jpg'.normalize('NFD')), M.imageUrl('手作処かっぱ本舗.jpg'));
  assert.equal(M.imageUrl('./images/牛久シャトー.jpg'), M.imageUrl('牛久シャトー.jpg'));
  assert.equal(M.imageUrl('https://example.org/photo.jpg'), 'https://example.org/photo.jpg');
  for (const value of ['../images/牛久シャトー.jpg', 'images/../config.js', 'javascript:alert(1)', 'data:image/svg+xml,test', '//example.org/photo.jpg', '__proto__', '未配置.jpg']) {
    assert.equal(M.imageUrl(value), '', value);
  }
  assert.equal(M.imageUrl('牛久シャトー.jpg', images, 'https://yuqio-dev.github.io/ushiku-map/'),
    'https://yuqio-dev.github.io/ushiku-map/images/' + encodeURIComponent('牛久シャトー.jpg'));
});

test('旧APIは確認済み対応表を使い、新APIの空欄・変更・別APIを優先する', () => {
  const raw = { ok: true, items: [item('牛久シャトー'), item('芋千'), item('未知のスポット')] };
  assert.equal(M.sanitizePayload(raw).items[0].image, '');
  const legacy = M.sanitizePayload(raw, { legacyImages: true });
  assert.ok(legacy.items[0].image);
  assert.equal(legacy.items[1].image, '');
  assert.equal(legacy.items[2].image, '');
  const fresh = M.sanitizePayload({ ...raw, source: { imageReferences: true } }, { legacyImages: true });
  assert.equal(fresh.items[0].image, '');
  const changed = M.sanitizePayload({ ok: true, items: [item('牛久シャトー', '牛久大仏.png')] }, { legacyImages: true });
  assert.equal(changed.items[0].image, M.imageUrl('牛久大仏.png'));
  const missing = M.sanitizePayload({ ok: true, items: [item('牛久シャトー', '未配置.jpg')] }, { legacyImages: true });
  assert.equal(missing.items[0].image, '');
});

test('公開画像は元ファイルの内容を保ち、すべてNFCのURLで取得できる配置になる', async () => {
  const source = new URL('images/', root);
  const names = await readdir(source);
  assert.equal(names.length, 16);
  for (const name of names) {
    const target = new URL('dist/' + M.imageUrl(name), root);
    const [original, copied] = await Promise.all([readFile(new URL(encodeURIComponent(name), source)), readFile(target)]);
    assert.deepEqual(copied, original, name);
    assert.equal(decodeURIComponent(target.pathname).normalize('NFC'), decodeURIComponent(target.pathname));
  }
});
