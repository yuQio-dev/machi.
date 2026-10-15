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

test('新しく指定された写真を解決し、未配置の画像と空欄を区別する', () => {
  for (const name of ['芋千', '（閉店）そば処ふしみ', 'シャンボール', '観音寺', '金剛院', '井岡神社', '浄妙寺(天台宗)', 'ヤマイチ味噌']) {
    const spot = references.items.find(spot => spot.name === name);
    assert.ok(spot && M.imageUrl(spot.image), name);
  }
  const missing = references.items.filter(spot => spot.image && !M.imageUrl(spot.image));
  assert.deepEqual(missing.map(spot => spot.name), ['Dining いごこち屋', 'DIPIKA']);
  assert.equal(M.imageUrl('牛久駅.jpeg'), 'images/' + encodeURIComponent('牛久駅.jpeg'));
  assert.equal(M.imageUrl('天満屋酒店.jpg'), 'images/' + encodeURIComponent('天満屋酒店.jpg'));
  const kongo = references.items.find(spot => spot.name === '金剛院');
  assert.equal(kongo.image, '金剛院(自撮).jpg');
  assert.equal(M.imageUrl(kongo.image), 'images/' + encodeURIComponent('金剛院(自撮).jpg'));
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
  const raw = { ok: true, items: [item('牛久シャトー'), item('画像未指定'), item('未知のスポット')] };
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
  assert.ok(names.length > 0);
  const published = new Set(Object.values(images.files));
  assert.equal(published.size, names.length);
  for (const name of names) {
    const target = new URL('dist/' + M.imageUrl(name), root);
    const [original, copied] = await Promise.all([readFile(new URL(encodeURIComponent(name), source)), readFile(target)]);
    assert.deepEqual(copied, original, name);
    assert.equal(decodeURIComponent(target.pathname).normalize('NFC'), decodeURIComponent(target.pathname));
  }
});
