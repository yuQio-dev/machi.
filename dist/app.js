/* global L, MapModel, MAP_CONFIG, google */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const iconNames = { food: 'coffee', visit: 'landmark', shop: 'shop', transport: 'train', other: 'pin' };
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const state = { items: [], group: 'all', selected: null, markers: new Map(), ready: false, loading: false, mode: '', userMarker: null, userCircle: null };
  const storedApi = () => { try { return localStorage.getItem('ushiku-map-api') || ''; } catch { return ''; } };
  const storeApi = value => { try { value ? localStorage.setItem('ushiku-map-api', value) : localStorage.removeItem('ushiku-map-api'); } catch {} };
  const isGas = typeof google !== 'undefined' && google.script && google.script.run;
  let map;
  function announce(text) { $('announcement').textContent = text; }
  function message(text) { $('map-message').textContent = text; $('map-message').hidden = !text; }
  function create(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text != null) el.textContent = text; return el; }
  function validateApi(value) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname) || url.username || url.password) throw new Error('Apps Scriptの /exec で終わるWebアプリURLを指定してください。');
    url.search = ''; url.hash = ''; return url.href;
  }
  function loadJsonp(api) {
    return new Promise((resolve, reject) => {
      const callback = '__ushiku_cb_' + Date.now() + Math.floor(Math.random() * 100000);
      const script = document.createElement('script');
      const url = new URL(validateApi(api)); url.searchParams.set('action', 'pois'); url.searchParams.set('callback', callback);
      const cleanup = () => { clearTimeout(timer); script.remove(); delete window[callback]; };
      const timer = setTimeout(() => { cleanup(); reject(new Error('APIの応答がありません。公開範囲と /exec URLを確認してください。')); }, 20000);
      window[callback] = data => { cleanup(); resolve(data); };
      script.onerror = () => { cleanup(); reject(new Error('APIに接続できません。デプロイと公開設定を確認してください。')); };
      script.src = url.href; document.head.append(script);
    });
  }
  function loadGas() {
    return new Promise((resolve, reject) => google.script.run.withSuccessHandler(resolve).withFailureHandler(error => reject(new Error(error.message || 'シートを読み取れませんでした。'))).getMapData());
  }
  async function load(apiOverride) {
    if (state.loading) return;
    state.loading = true; $('reload').disabled = true; $('settings').disabled = true; $('source-state').textContent = '読み込み中'; message('');
    try {
      const configuredApi = storedApi() || MAP_CONFIG.apiUrl;
      const api = apiOverride !== undefined ? apiOverride : (configuredApi === 'snapshot' ? '' : configuredApi);
      let raw;
      if (isGas) raw = await loadGas();
      else if (api) raw = await loadJsonp(api);
      else { const response = await fetch('data.snapshot.json'); if (!response.ok) throw new Error('確認時点のデータを読み込めませんでした。'); raw = await response.json(); }
      const payload = MapModel.sanitizePayload(raw);
      state.items = payload.items; state.mode = isGas || api ? 'live' : 'snapshot'; state.ready = true;
      $('source-state').textContent = state.mode === 'live' ? 'シート接続中' : '確認時点のデータ';
      $('data-status').textContent = state.mode === 'live' ? 'スプレッドシートから取得' : `API未接続・確認時点の${state.items.length}件`;
      $('status-dot').classList.toggle('live', state.mode === 'live');
      const date = new Date(payload.fetchedAt);
      $('data-time').textContent = Number.isFinite(date.getTime()) ? '取得: ' + date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      const selectedCategory = $('category').value;
      $('category').replaceChildren(new Option('すべてのカテゴリ', ''));
      [...new Set(state.items.map(item => item.category))].sort((a,b) => a.localeCompare(b, 'ja')).forEach(category => $('category').add(new Option(category, category)));
      if ([...$('category').options].some(option => option.value === selectedCategory)) $('category').value = selectedCategory;
      const warnings = state.items.filter(item => item.coordinateWarning);
      $('coordinate-note-text').textContent = warnings.length + '件の座標は確認が必要です';
      $('coordinate-note').hidden = warnings.length === 0;
      const skipped = Number(payload.skippedRows) + payload.rejectedItems;
      if (skipped > 0) message(`座標・名称が未入力または不正な${skipped}件は表示していません。`);
      if (!map) message('地図ライブラリを読み込めませんでした。インターネット接続を確認し、ページを再読み込みしてください。');
      render(true);
      if (state.selected) {
        if (state.items.some(item => item.id === state.selected)) selectSpot(state.selected, false);
        else closeDetail();
      }
      announce(`${state.items.length}件のスポットを読み込みました。${state.mode === 'snapshot' ? 'APIは未接続です。' : ''}`);
    } catch (error) {
      $('source-state').textContent = '取得に失敗'; $('data-status').textContent = state.ready ? '更新失敗・前回のデータを表示中' : 'データを取得できません'; $('status-dot').classList.remove('live');
      message(error.message); announce(error.message);
      if (!state.ready) { $('results').replaceChildren(create('div', 'empty-state', 'データを取得できませんでした。接続設定を確認して、更新してください。')); $('result-count').textContent = '0'; }
    } finally { state.loading = false; $('reload').disabled = false; $('settings').disabled = false; }
  }
  function filtered(withBounds = true) {
    return MapModel.filterItems(state.items, { query: $('search').value, group: state.group, category: $('category').value, bounds: withBounds && $('viewport-only').checked && map ? map.getBounds() : null });
  }
  function renderList(items) {
    const fragment = document.createDocumentFragment();
    if (!items.length) {
      const empty = create('div', 'empty-state'); empty.append(create('strong', '', 'スポットが見つかりません'), create('span', '', 'キーワードやカテゴリを変えてください。')); fragment.append(empty);
    }
    items.forEach(item => {
      const group = MapModel.groupOf(item.category);
      const button = create('button', 'spot-row' + (state.selected === item.id ? ' selected' : '')); button.type = 'button'; button.dataset.id = item.id; button.setAttribute('aria-label', item.name + 'を地図で表示'); button.setAttribute('aria-pressed', String(state.selected === item.id));
      const symbol = create('span', 'spot-symbol ' + group); symbol.innerHTML = icon(iconNames[group]);
      const copy = create('span', 'spot-copy'); const top = create('span', 'spot-topline'); top.append(create('span', 'spot-category', item.category)); if (item.coordinateWarning) top.append(create('span', 'warning-badge', '座標要確認'));
      copy.append(top, create('strong', 'spot-name', item.name), create('span', 'spot-address', item.location || '住所未入力'));
      const arrow = create('span', 'spot-arrow'); arrow.innerHTML = icon('arrow'); button.append(symbol, copy, arrow); button.addEventListener('click', () => selectSpot(item.id)); fragment.append(button);
    });
    $('results').replaceChildren(fragment); $('result-count').textContent = items.length;
  }
  function markerIcon(item) {
    const group = MapModel.groupOf(item.category);
    return L.divIcon({ className: `map-pin ${group}${state.selected === item.id ? ' selected' : ''}${item.coordinateWarning ? ' warn' : ''}`, html: '<span class="pin-inner">' + icon(iconNames[group]) + '</span>', iconSize: [34, 39], iconAnchor: [16, 38], tooltipAnchor: [0, -34] });
  }
  function render(rebuild = false) {
    const items = filtered(); renderList(items);
    if (!map) return;
    // 地図を動かすたびにマーカーを作り直さず、フィルタ対象だけ同期します。
    const onMap = new Set(filtered(false).map(item => item.id));
    if (rebuild) { state.markers.forEach(marker => marker.remove()); state.markers.clear(); }
    state.items.forEach(item => {
      let marker = state.markers.get(item.id);
      if (!onMap.has(item.id)) { if (marker) { marker.remove(); state.markers.delete(item.id); } return; }
      if (!marker) {
        marker = L.marker([item.lat, item.lon], { icon: markerIcon(item), title: item.name, alt: item.name, riseOnHover: true });
        marker.bindTooltip(create('span', '', item.name), { direction: 'top' }); marker.on('click', () => selectSpot(item.id)); marker.addTo(map); state.markers.set(item.id, marker);
      } else marker.setIcon(markerIcon(item));
      marker.setZIndexOffset(state.selected === item.id ? 1000 : 0);
    });
    $('map-count').textContent = `${filtered(false).length} スポット`;
    if (state.selected && !onMap.has(state.selected)) closeDetail();
  }
  function selectSpot(id, pan = true) {
    const item = state.items.find(spot => spot.id === id); if (!item) return;
    state.selected = id; $('detail-content').replaceChildren();
    const content = $('detail-content');
    content.append(create('div', 'detail-category', item.category), create('h2', 'detail-title', item.name));
    if (item.image) { const image = create('img', 'detail-image'); image.src = item.image; image.alt = item.name; image.loading = 'lazy'; image.addEventListener('error', () => image.remove()); content.append(image); }
    const address = create('div', 'detail-address'); const symbol = create('span'); symbol.innerHTML = icon('pin'); address.append(symbol, create('span', '', item.location || '住所未入力')); content.append(address);
    if (item.description) content.append(create('p', 'detail-description', item.description));
    const facts = create('dl', 'detail-facts'); [['営業時間', item.time || '情報なし'], ['定休日', item.closed || '情報なし']].forEach(([label, value]) => facts.append(create('dt', '', label), create('dd', '', value))); content.append(facts);
    if (item.sourceUrl) appendLink(content, '参考サイトを見る', item.sourceUrl);
    appendLink(content, 'OpenStreetMapで見る', `https://www.openstreetmap.org/?mlat=${item.lat}&mlon=${item.lon}#map=17/${item.lat}/${item.lon}`);
    if (item.coordinateWarning) content.append(create('p', 'detail-warning', item.coordinateWarning + '。シートに記載された座標をそのまま表示しています。'));
    $('detail').hidden = false; $('sidebar').classList.remove('open'); $('list-toggle').setAttribute('aria-expanded', 'false'); $('list-toggle').querySelector('span').textContent = 'スポット一覧';
    if (map && pan) map.setView([item.lat, item.lon], Math.max(map.getZoom(), 15), { animate: !matchMedia('(prefers-reduced-motion: reduce)').matches });
    render(); announce(item.name + 'の詳細を表示しました');
  }
  function appendLink(container, label, url) { const a = create('a', 'detail-link'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.append(create('span', '', label)); const symbol = create('span'); symbol.innerHTML = icon('link'); a.append(symbol); container.append(a); }
  function closeDetail() { state.selected = null; $('detail').hidden = true; state.markers.forEach((marker, id) => { const item = state.items.find(spot => spot.id === id); if (item) { marker.setIcon(markerIcon(item)); marker.setZIndexOffset(0); } }); document.querySelectorAll('.spot-row.selected').forEach(row => { row.classList.remove('selected'); row.setAttribute('aria-pressed', 'false'); }); }
  function fit() {
    const items = filtered(false); if (!map || !items.length) { message('表示できる地点がありません。絞り込み条件を確認してください。'); return; }
    message(''); map.fitBounds(L.latLngBounds(items.map(item => [item.lat, item.lon])), { padding: [55, 60], maxZoom: 15 });
  }
  function locate() {
    if (!navigator.geolocation) { message('このブラウザでは現在地を利用できません。'); return; }
    $('locate').disabled = true; message('現在地を確認しています。ブラウザの位置情報へのアクセスを許可してください。');
    navigator.geolocation.getCurrentPosition(position => {
      $('locate').disabled = false;
      if (!map) return;
      const latlng = [position.coords.latitude, position.coords.longitude]; state.userMarker?.remove(); state.userCircle?.remove();
      state.userMarker = L.circleMarker(latlng, { radius: 7, color: '#fff', weight: 3, fillColor: '#327eb5', fillOpacity: 1 }).addTo(map).bindTooltip('現在地');
      state.userCircle = L.circle(latlng, { radius: position.coords.accuracy, color: '#327eb5', weight: 1, fillOpacity: .08 }).addTo(map); map.setView(latlng, 15); message('現在地を表示しました。位置情報は保存しません。');
    }, error => { $('locate').disabled = false; message(error.code === 1 ? '位置情報の許可がありません。ブラウザの設定から変更できます。' : '現在地を取得できませんでした。しばらくしてから再度お試しください。'); }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
  }
  if (typeof L !== 'undefined') {
    map = L.map('map', { zoomControl: false, center: MAP_CONFIG.initialCenter, zoom: MAP_CONFIG.initialZoom });
    let tileFailures = 0;
    L.tileLayer(MAP_CONFIG.tileUrl, { maxZoom: 19, keepBuffer: 1, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' }).on('tileerror', () => { if (++tileFailures === 4) message('背景地図を読み込めません。インターネット接続をご確認ください。'); }).addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map); L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map); map.on('moveend', () => { if (state.ready && $('viewport-only').checked) renderList(filtered()); });
  } else { message('地図ライブラリを読み込めませんでした。インターネット接続を確認し、ページを再読み込みしてください。'); $('fit').disabled = true; $('locate').disabled = true; }
  $('search').addEventListener('input', () => render()); $('category').addEventListener('change', () => render()); $('viewport-only').addEventListener('change', () => render());
  document.querySelectorAll('[data-group]').forEach(button => button.addEventListener('click', () => { state.group = button.dataset.group; document.querySelectorAll('[data-group]').forEach(el => { const active = el === button; el.classList.toggle('active', active); el.setAttribute('aria-pressed', String(active)); }); $('category').value = ''; render(); }));
  $('reset').addEventListener('click', () => { $('search').value = ''; $('category').value = ''; $('viewport-only').checked = false; document.querySelector('[data-group="all"]').click(); });
  $('close-detail').addEventListener('click', closeDetail); $('fit').addEventListener('click', fit); $('locate').addEventListener('click', locate); $('reload').addEventListener('click', () => load());
  $('dismiss-warning').addEventListener('click', () => { $('coordinate-note').hidden = true; }); $('show-warning').addEventListener('click', () => { const item = state.items.find(spot => spot.coordinateWarning); if (item) { $('reset').click(); selectSpot(item.id); } });
  $('list-toggle').addEventListener('click', () => { const open = $('sidebar').classList.toggle('open'); $('list-toggle').setAttribute('aria-expanded', String(open)); $('list-toggle').querySelector('span').textContent = open ? '地図に戻る' : 'スポット一覧'; });
  $('settings').addEventListener('click', () => { $('api-url').value = (storedApi() === 'snapshot' ? '' : storedApi()) || MAP_CONFIG.apiUrl; $('connection-error').hidden = true; $('connection-dialog').showModal(); });
  $('close-settings').addEventListener('click', () => $('connection-dialog').close());
  $('connection-form').addEventListener('submit', event => { event.preventDefault(); try { const api = validateApi($('api-url').value.trim()); storeApi(api); $('connection-dialog').close(); load(api); } catch (error) { $('connection-error').textContent = error.message; $('connection-error').hidden = false; } });
  $('use-snapshot').addEventListener('click', () => { storeApi('snapshot'); $('connection-dialog').close(); load(''); });
  if (isGas) { $('settings').hidden = true; }
  load();
})();
