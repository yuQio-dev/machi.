(function (root) {
  'use strict';
  const groups = {
    food: ['カフェ', '飲食店', '居酒屋', 'スイーツ', 'グルメ'],
    visit: ['観光名所', 'ワイン醸造所', '寺院', '神社', 'ゴルフ場'],
    shop: ['お土産やさん', 'お土産屋さん', '酒屋', '老舗和菓子店'],
    transport: ['交通']
  };
  function groupOf(category) {
    return Object.keys(groups).find(key => groups[key].includes(category)) || 'other';
  }
  function normalize(text) { return String(text ?? '').normalize('NFKC').toLocaleLowerCase('ja').trim(); }
  function validCoordinates(lat, lon) {
    return lat !== '' && lat != null && lon !== '' && lon != null &&
      Number.isFinite(Number(lat)) && Number.isFinite(Number(lon)) &&
      Math.abs(Number(lat)) <= 90 && Math.abs(Number(lon)) <= 180;
  }
  function safeUrl(value) {
    try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.href : ''; }
    catch { return ''; }
  }
  function imageUrl(value, images = root.MapImages, baseUrl = '') {
    const external = safeUrl(value);
    if (external) return external;
    const reference = String(value || '').trim().replace(/^(?:\.\/)?images\//, '').normalize('NFC');
    const files = images?.files;
    if (!files || !Object.hasOwn(files, reference)) return '';
    const local = files[reference];
    return baseUrl ? new URL(local, baseUrl).href : local;
  }
  function sanitizePayload(payload, { images = root.MapImages, imageBaseUrl = '', legacyImages = false } = {}) {
    if (!payload || payload.ok !== true || !Array.isArray(payload.items)) {
      throw new Error(payload?.error?.message || 'APIの応答形式を確認してください。');
    }
    const items = payload.items.filter(item => item && String(item.name || '').trim() && validCoordinates(item.lat, item.lon)).map((item, index) => {
      const name = String(item.name).trim();
      const key = name.normalize('NFC');
      let reference = item.image;
      if (!reference && legacyImages && payload.source?.imageReferences !== true && Object.hasOwn(images?.legacyByName || {}, key)) {
        reference = images.legacyByName[key];
      }
      return {
        id: String(item.id || `spot-${index}`), row: Number(item.row) || 0,
        name, location: String(item.location || '').trim(),
        lat: Number(item.lat), lon: Number(item.lon), description: String(item.description || '').trim(),
        time: String(item.time || '').trim(), closed: String(item.closed || '').trim(),
        category: String(item.category || '未分類').trim(),
        image: imageUrl(reference, images, imageBaseUrl),
        sourceUrl: safeUrl(item.sourceUrl), coordinateWarning: String(item.coordinateWarning || '')
      };
    });
    return { ...payload, items, rejectedItems: payload.items.length - items.length };
  }
  function filterItems(items, { query = '', group = 'all', category = '', bounds = null } = {}) {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    return items.filter(item => (group === 'all' || groupOf(item.category) === group) &&
      (!category || item.category === category) &&
      words.every(word => normalize([item.name, item.location, item.description, item.category].join(' ')).includes(word)) &&
      (!bounds || bounds.contains([item.lat, item.lon])));
  }
  function categoriesFor(items, group = 'all') {
    return [...new Set(items.filter(item => group === 'all' || groupOf(item.category) === group).map(item => item.category))]
      .sort((a, b) => a.localeCompare(b, 'ja'));
  }
  root.MapModel = { groupOf, normalize, validCoordinates, safeUrl, imageUrl, sanitizePayload, filterItems, categoriesFor };
})(globalThis);
