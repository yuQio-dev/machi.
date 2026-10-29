export const partNames: Record<string, string> = {
  'map-view': '地図', 'app-header': 'ヘッダー', 'place-search': '検索', 'category-chips': 'カテゴリ', 'result-count': '件数',
  'place-list': '一覧', 'place-detail': '詳細', 'floating-action': 'ボタン', text: 'テキスト',
};
export const partIcons: Record<string, string> = {
  'map-view': 'map', 'app-header': 'web_asset', 'place-search': 'search', 'category-chips': 'filter_list', 'result-count': 'tag',
  'place-list': 'format_list_bulleted', 'place-detail': 'article', 'floating-action': 'smart_button', text: 'text_fields',
};
export function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    palette: 'M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-3.7 1.5 1.5 0 0 1 1-2.6h2A4 4 0 0 0 21 11a9 9 0 0 0-9-8M7 10h.01M10 6h.01M15 6h.01M18 10h.01',
    account_tree: 'M3 3h6v6H3zM15 3h6v6h-6zM15 15h6v6h-6zM9 6h3v12h3M12 6h3',
    near_me: 'm4 4 16 6-7 3-3 7z',
    pan_tool: 'M8 12V5a1.5 1.5 0 0 1 3 0v6-8a1.5 1.5 0 0 1 3 0v8-6a1.5 1.5 0 0 1 3 0v7-3a1.5 1.5 0 0 1 3 0v6c0 4-2 7-6 7h-2c-2 0-3-1-4-2l-5-6a1.5 1.5 0 0 1 2-2z',
    lock: 'M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4M12 14v3',
    lock_open: 'M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0M12 14v3',
    folder: 'M3 6h7l2 3h9v11H3z',
    add: 'M12 5v14M5 12h14',
    close: 'm6 6 12 12M18 6 6 18',
    check: 'm5 12 4 4L19 6',
    copy: 'M8 8h12v13H8zM16 8V3H3v13h5',
    delete: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',
    save: 'M4 3h13l4 4v14H3V3zM7 3v6h10V3M7 21v-8h10v8',
    download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
    upload: 'M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4',
    desktop: 'M3 4h18v13H3zM12 17v4M8 21h8',
    smartphone: 'M7 2h10v20H7zM11 18h2',
    fit: 'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M7 7h10v10H7z',
    group: 'M3 3h18v18H3zM7 7h6v6H7zM11 11h6v6h-6',
    ungroup: 'M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M7 7h6v6H7zM11 11h6v6h-6',
    align_left: 'M4 3v18M8 6h12v4H8zM8 14h8v4H8z',
    align_center: 'M12 2v20M4 6h16v4H4zM7 14h10v4H7z',
    align_right: 'M20 3v18M4 6h12v4H4zM8 14h8v4H8z',
    align_top: 'M3 4h18M6 8h4v12H6zM14 8h4v8h-4z',
    align_middle: 'M2 12h20M6 4h4v16H6zM14 7h4v10h-4z',
    align_bottom: 'M3 20h18M6 4h4v12H6zM14 8h4v8h-4z',
    reset: 'M4 10a8 8 0 1 1 1 8M4 3v7h7',
    bolt: 'm13 2-9 12h7l-1 8 10-13h-7z',
    code: 'm8 6-6 6 6 6M16 6l6 6-6 6M14 3l-4 18',
    checklist: 'm3 6 1 1 2-3M9 6h12M3 12l1 1 2-3M9 12h12M3 18l1 1 2-3M9 18h12',
    back: 'M20 12H4m6-6-6 6 6 6',
  };
  if (paths[name]) return <svg className="material-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
  return <span className="material-icon" aria-hidden="true">{name}</span>;
}
