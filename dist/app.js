/* global L, MapModel, MAP_CONFIG, google */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const iconNames = { food: 'coffee', visit: 'landmark', shop: 'shop', transport: 'train', other: 'pin' };
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const state = { items: [], group: 'all', selected: null, markers: new Map(), pinLayer: null, ready: false, loading: false, mode: '', userMarker: null, userCircle: null };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const activeMotions = new Set();
  const motionByElement = new WeakMap();
  const mobileScreen = matchMedia('(max-width: 700px)');
  let desktopSidebarOpen = true;
  let pendingPin = null;
  const storedApi = () => { try { return localStorage.getItem('ushiku-map-api') || ''; } catch { return ''; } };
  const storeApi = value => { try { value ? localStorage.setItem('ushiku-map-api', value) : localStorage.removeItem('ushiku-map-api'); } catch {} };
  const isGas = typeof google !== 'undefined' && google.script && google.script.run;
  let map;
  function announce(text) { $('announcement').textContent = text; }
  function message(text) { $('map-message').textContent = text; $('map-message').hidden = !text; }
  function create(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text != null) el.textContent = text; return el; }
  function cancelMotion(element) {
    for (const animation of activeMotions) {
      if (!element || animation.effect?.target === element) animation.cancel();
    }
  }
  function playMotion(element, keyframes, duration, name) {
    if (!element) return;
    cancelMotion(element);
    element.dataset.motion = name;
    element.dataset.motionDuration = String(duration);
    if (reducedMotion.matches || typeof element.animate !== 'function') { element.dataset.motionState = 'skipped'; return; }
    const animation = element.animate(keyframes, { duration, easing: 'cubic-bezier(.33, 1, .68, 1)' });
    motionByElement.set(element, animation);
    element.dataset.motionState = 'running';
    activeMotions.add(animation);
    const cleanup = event => {
      activeMotions.delete(animation);
      if (motionByElement.get(element) === animation) element.dataset.motionState = event.type === 'finish' ? 'finished' : 'cancelled';
    };
    animation.addEventListener('finish', cleanup, { once: true });
    animation.addEventListener('cancel', cleanup, { once: true });
  }
  function emphasizePin(id) {
    if (state.selected !== id) return;
    // 地図の座標を担う外側は動かさず、移動後に内側だけを一度強調します。
    playMotion(state.markers.get(id)?.getElement()?.querySelector('.pin-inner'), [
      { transform: 'scale(.84)' }, { transform: 'scale(1.12)', offset: .55 }, { transform: 'scale(1)' }
    ], 300, 'pin-select');
  }
  function syncSidebar() {
    const mobile = mobileScreen.matches;
    const open = mobile ? $('sidebar').classList.contains('open') : desktopSidebarOpen;
    $('workspace').classList.toggle('sidebar-collapsed', !mobile && !desktopSidebarOpen);
    $('workspace').classList.toggle('mobile-list-open', mobile && open);
    $('sidebar').inert = !open;
    $('sidebar').setAttribute('aria-hidden', String(!open));
    $('sidebar-toggle').setAttribute('aria-expanded', String(desktopSidebarOpen));
    const label = desktopSidebarOpen ? 'サイドパネルを閉じる' : 'サイドパネルを開く';
    $('sidebar-toggle').setAttribute('aria-label', label); $('sidebar-toggle').title = label;
    $('list-toggle').setAttribute('aria-expanded', String(mobile && open));
    $('list-toggle').querySelector('span').textContent = mobile && open ? '地図に戻る' : 'スポット一覧';
  }
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
      $('source-state').textContent = state.mode === 'live' ? 'スプレッドシート接続済み' : '確認時点のデータを使用中';
      $('data-status').textContent = state.mode === 'live' ? '最新データ' : '確認時点のデータ';
      $('status-dot').classList.toggle('live', state.mode === 'live');
      const date = new Date(payload.fetchedAt);
      $('data-time').textContent = Number.isFinite(date.getTime()) ? '取得 ' + date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      updateCategories();
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
  function updateCategories() {
    const current = $('category').value;
    $('category').replaceChildren(new Option('すべてのカテゴリ', ''));
    MapModel.categoriesFor(state.items, state.group).forEach(category => $('category').add(new Option(category, category)));
    if ([...$('category').options].some(option => option.value === current)) $('category').value = current;
  }
  function syncFilters() {
    const count = Number(Boolean($('category').value)) + Number($('viewport-only').checked);
    $('filter-count').hidden = count === 0;
    $('filter-count').textContent = count;
    $('filter-count').setAttribute('aria-label', `${count}件の絞り込み条件を適用中`);
    $('reset').hidden = !($('search').value.trim() || state.group !== 'all' || count);
  }
  function renderList(items) {
    const fragment = document.createDocumentFragment();
    if (!items.length) {
      const empty = create('div', 'empty-state'); empty.append(create('strong', '', 'スポットが見つかりません'), create('span', '', 'キーワードやカテゴリを変えてください。')); fragment.append(empty);
    }
    items.forEach(item => {
      const group = MapModel.groupOf(item.category);
      const button = create('button', 'spot-row ' + group + (state.selected === item.id ? ' selected' : '')); button.type = 'button'; button.dataset.id = item.id; button.setAttribute('aria-label', item.name + 'を地図で表示'); button.setAttribute('aria-pressed', String(state.selected === item.id));
      const symbol = create('span', 'spot-symbol ' + group); symbol.innerHTML = icon(iconNames[group]);
      if (item.image) { const image = create('img', 'spot-thumbnail'); image.src = item.image; image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; image.addEventListener('error', () => image.remove()); symbol.append(image); }
      const copy = create('span', 'spot-copy'); const top = create('span', 'spot-topline'); top.append(create('span', 'spot-category', item.category)); if (item.coordinateWarning) top.append(create('span', 'warning-badge', '座標要確認'));
      copy.append(top, create('strong', 'spot-name', item.name));
      if (item.description) copy.append(create('span', 'spot-description', item.description.replace(/\s+/g, ' ')));
      copy.append(create('span', 'spot-address', item.location || '住所未入力'));
      const arrow = create('span', 'spot-arrow'); arrow.innerHTML = icon('arrow'); button.append(symbol, copy, arrow); button.addEventListener('click', () => selectSpot(item.id)); fragment.append(button);
    });
    $('results').replaceChildren(fragment); $('result-count').textContent = items.length;
  }
  function markerIcon(item) {
    const group = MapModel.groupOf(item.category);
    return L.divIcon({ className: markerClassName(item), html: '<span class="pin-inner">' + icon(iconNames[group]) + '</span>', iconSize: [44, 44], iconAnchor: [22, 22], tooltipAnchor: [0, -18] });
  }
  function markerClassName(item) { return `map-pin ${MapModel.groupOf(item.category)}${state.selected === item.id ? ' selected' : ''}${item.coordinateWarning ? ' warn' : ''}`; }
  function removePin(marker) { state.pinLayer.removeLayer(marker); marker.remove(); }
  function render(rebuild = false, updateList = true) {
    syncFilters();
    const items = filtered();
    const onMap = new Set(filtered(false).map(item => item.id));
    if (state.selected && !onMap.has(state.selected)) closeDetail(false);
    if (updateList) renderList(items);
    else $('results').querySelectorAll('.spot-row').forEach(row => {
      const selected = row.dataset.id === state.selected;
      row.classList.toggle('selected', selected); row.setAttribute('aria-pressed', String(selected));
    });
    if (!map) return;
    // 地図移動では一覧だけを更新。マーカーとクラスタは絞り込み時に同期します。
    if (rebuild) { state.pinLayer.clearLayers(); state.markers.forEach(marker => marker.remove()); state.markers.clear(); }
    state.items.forEach(item => {
      let marker = state.markers.get(item.id);
      if (!onMap.has(item.id)) { if (marker) { removePin(marker); state.markers.delete(item.id); } return; }
      if (!marker) {
        marker = L.marker([item.lat, item.lon], { icon: markerIcon(item), title: item.name, alt: item.name, riseOnHover: true });
        marker.on('click', () => selectSpot(item.id)); state.markers.set(item.id, marker);
      } else marker.options.icon.options.className = markerClassName(item);
      const selected = state.selected === item.id;
      if (selected) { state.pinLayer.removeLayer(marker); if (!map.hasLayer(marker)) marker.addTo(map); }
      else { if (!state.pinLayer.hasLayer(marker)) { marker.remove(); state.pinLayer.addLayer(marker); } }
      marker.getElement()?.classList.toggle('selected', selected);
      if (!marker.getTooltip() || marker.getTooltip().options.permanent !== selected) {
        marker.unbindTooltip(); marker.bindTooltip(create('span', '', item.name), { direction: 'top', permanent: selected, className: 'spot-tooltip' });
      }
      marker.setZIndexOffset(selected ? 2000 : 0);
    });
  }
  function selectSpot(id, pan = true) {
    const item = state.items.find(spot => spot.id === id); if (!item) return;
    const fromList = $('results').contains(document.activeElement);
    const revealDetail = pan && ($('detail').hidden || state.selected !== id);
    // 前の出現中のtransformを解除し、スマホの空き領域を最終位置で計算します。
    cancelMotion($('detail'));
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
    $('detail').hidden = false; $('sidebar').classList.remove('open'); syncSidebar();
    render(false, false);
    pendingPin = null;
    map?.stop();
    let moving = false;
    if (map && pan) {
      const zoom = Math.max(map.getZoom(), 15);
      let center = L.latLng(item.lat, item.lon);
      if (matchMedia('(max-width: 700px)').matches) {
        // 下部の詳細カードより上に選択ピンを置き、カードに隠れないようにします。
        const freeHeight = $('detail').getBoundingClientRect().top - $('map').getBoundingClientRect().top;
        const targetY = Math.min(Math.max(110, freeHeight / 2), Math.max(70, freeHeight - 28));
        center = map.unproject(map.project(center, zoom).add([0, map.getSize().y / 2 - targetY]), zoom);
      }
      moving = map.getZoom() !== zoom || map.getCenter().distanceTo(center) > .5;
      if (moving) pendingPin = id;
      map.setView(center, zoom, { animate: !reducedMotion.matches });
    }
    const selectedRow = [...$('results').querySelectorAll('.spot-row')].find(row => row.dataset.id === id);
    if (selectedRow) { selectedRow.scrollIntoView({ block: 'nearest' }); if (fromList) selectedRow.focus({ preventScroll: true }); }
    if (pan) {
      playMotion(selectedRow, [{ transform: 'scale(.97)' }, { transform: 'scale(1)' }], 240, 'card-select');
      if (!moving) emphasizePin(id);
      if (revealDetail) {
        const mobile = matchMedia('(max-width: 700px)').matches;
        playMotion($('detail'), [
          { opacity: 0, transform: `translateY(${mobile ? 22 : 18}px)` },
          { opacity: 1, transform: 'translateY(0)' }
        ], mobile ? 340 : 320, 'detail-reveal');
      }
    }
    announce(item.name + 'の詳細を表示しました');
  }
  function appendLink(container, label, url) { const a = create('a', 'detail-link'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.append(create('span', '', label)); const symbol = create('span'); symbol.innerHTML = icon('link'); a.append(symbol); container.append(a); }
  function closeDetail(refresh = true) {
    const previous = state.selected;
    const fromDetail = $('detail').contains(document.activeElement);
    cancelMotion($('detail'));
    pendingPin = null; state.selected = null; $('detail').hidden = true;
    if (refresh) {
      render();
      if (fromDetail) {
        const target = mobileScreen.matches ? $('list-toggle') : !desktopSidebarOpen ? $('sidebar-toggle') : [...$('results').querySelectorAll('.spot-row')].find(row => row.dataset.id === previous);
        target?.focus({ preventScroll: true });
      }
    }
  }
  function fit() {
    const items = filtered(false); if (!map || !items.length) { message('表示できる地点がありません。絞り込み条件を確認してください。'); return; }
    message(''); map.fitBounds(L.latLngBounds(items.map(item => [item.lat, item.lon])), { padding: [55, 60], maxZoom: 15, animate: !reducedMotion.matches });
  }
  function locate() {
    if (!navigator.geolocation) { message('このブラウザでは現在地を利用できません。'); return; }
    $('locate').disabled = true; message('現在地を確認しています。ブラウザの位置情報へのアクセスを許可してください。');
    navigator.geolocation.getCurrentPosition(position => {
      $('locate').disabled = false;
      if (!map) return;
      const latlng = [position.coords.latitude, position.coords.longitude]; state.userMarker?.remove(); state.userCircle?.remove();
      state.userMarker = L.circleMarker(latlng, { radius: 7, color: '#fff', weight: 3, fillColor: '#327eb5', fillOpacity: 1 }).addTo(map).bindTooltip('現在地');
      state.userCircle = L.circle(latlng, { radius: position.coords.accuracy, color: '#327eb5', weight: 1, fillOpacity: .08 }).addTo(map); map.setView(latlng, 15, { animate: !reducedMotion.matches }); message('現在地を表示しました。位置情報は保存しません。');
    }, error => { $('locate').disabled = false; message(error.code === 1 ? '位置情報の許可がありません。ブラウザの設定から変更できます。' : '現在地を取得できませんでした。しばらくしてから再度お試しください。'); }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
  }
  if (typeof L !== 'undefined') {
    map = L.map('map', { zoomControl: false, maxZoom: 19, zoomAnimation: !reducedMotion.matches, fadeAnimation: !reducedMotion.matches, center: MAP_CONFIG.initialCenter, zoom: MAP_CONFIG.initialZoom });
    const canCluster = typeof L.markerClusterGroup === 'function';
    state.pinLayer = canCluster ? L.markerClusterGroup({
      maxClusterRadius: 48, showCoverageOnHover: false, spiderfyOnMaxZoom: true,
      spiderfyDistanceMultiplier: 1.7, animate: !reducedMotion.matches,
      iconCreateFunction: cluster => {
        const count = cluster.getChildCount();
        cluster.options.title = `${count}件のスポット。押すと拡大します`;
        return L.divIcon({ className: 'map-cluster', html: `<span class="cluster-inner"><strong>${count}</strong><small>スポット</small></span>`, iconSize: [52, 52], iconAnchor: [26, 26] });
      }
    }) : L.layerGroup();
    if (!canCluster) document.querySelector('.map-caption span').textContent = 'ピンを押すと、スポットの詳細を表示';
    state.pinLayer.addTo(map);
    let tileFailures = 0;
    L.tileLayer(MAP_CONFIG.tileUrl, { maxZoom: 19, keepBuffer: 1, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' }).on('tileerror', () => { if (++tileFailures === 4) message('背景地図を読み込めません。インターネット接続をご確認ください。'); }).addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map); L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);
    map.on('moveend', () => {
      if (state.ready && $('viewport-only').checked) renderList(filtered());
      const id = pendingPin; pendingPin = null;
      if (id) requestAnimationFrame(() => emphasizePin(id));
    });
    // 開閉中も地図の描画サイズを追従させ、閉じた余白までタイルを表示します。
    let resizeFrame;
    new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => map.invalidateSize({ animate: false, debounceMoveend: true }));
    }).observe($('map'));
  } else { message('地図ライブラリを読み込めませんでした。インターネット接続を確認し、ページを再読み込みしてください。'); $('fit').disabled = true; $('locate').disabled = true; }
  $('search').addEventListener('input', () => render()); $('category').addEventListener('change', () => render()); $('viewport-only').addEventListener('change', () => render());
  document.querySelectorAll('[data-group]').forEach(button => button.addEventListener('click', () => { state.group = button.dataset.group; document.querySelectorAll('[data-group]').forEach(el => { const active = el === button; el.classList.toggle('active', active); el.setAttribute('aria-pressed', String(active)); }); $('category').value = ''; updateCategories(); render(); }));
  $('reset').addEventListener('click', () => { $('search').value = ''; $('category').value = ''; $('viewport-only').checked = false; $('refine').open = false; document.querySelector('[data-group="all"]').click(); });
  $('close-detail').addEventListener('click', () => closeDetail()); $('fit').addEventListener('click', fit); $('locate').addEventListener('click', locate); $('reload').addEventListener('click', () => load());
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('connection-dialog').open && !$('detail').hidden) closeDetail(); });
  $('dismiss-warning').addEventListener('click', () => { $('coordinate-note').hidden = true; }); $('show-warning').addEventListener('click', () => { const item = state.items.find(spot => spot.coordinateWarning); if (item) { $('reset').click(); selectSpot(item.id); } });
  $('list-toggle').addEventListener('click', () => { $('sidebar').classList.toggle('open'); syncSidebar(); });
  $('sidebar-toggle').addEventListener('click', () => { desktopSidebarOpen = !desktopSidebarOpen; syncSidebar(); });
  mobileScreen.addEventListener('change', () => {
    syncSidebar();
    if ($('sidebar').inert && $('sidebar').contains(document.activeElement)) (mobileScreen.matches ? $('list-toggle') : $('sidebar-toggle')).focus();
  });
  syncSidebar();
  $('settings').addEventListener('click', () => { $('api-url').value = (storedApi() === 'snapshot' ? '' : storedApi()) || MAP_CONFIG.apiUrl; $('connection-error').hidden = true; $('connection-dialog').showModal(); });
  $('close-settings').addEventListener('click', () => $('connection-dialog').close());
  $('connection-form').addEventListener('submit', event => { event.preventDefault(); try { const api = validateApi($('api-url').value.trim()); storeApi(api); $('connection-dialog').close(); load(api); } catch (error) { $('connection-error').textContent = error.message; $('connection-error').hidden = false; } });
  $('use-snapshot').addEventListener('click', () => { storeApi('snapshot'); $('connection-dialog').close(); load(''); });
  if (isGas) { $('settings').hidden = true; }
  reducedMotion.addEventListener('change', () => {
    if (map) map.options.zoomAnimation = !reducedMotion.matches;
    if (reducedMotion.matches) { cancelMotion(); map?.stop(); }
  });
  load();
})();
