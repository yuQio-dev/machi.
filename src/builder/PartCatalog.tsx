import { Icon, partIcons, partNames } from './Icons';
import { IconButton } from './IconButton';
import { firstFlowKinds } from './runtime';

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  favorites: string[];
  onFavoritesChange: (value: string[]) => void;
  onAdd: (kind: string) => void;
  dataAvailable: boolean;
};

const dataKinds = new Set(['map-view', 'place-search', 'category-chips', 'result-count', 'place-list', 'place-detail']);
const groups = [
  { label: '地図・検索', icon: 'map', kinds: ['map-view', 'place-search', 'category-chips', 'result-count'] },
  { label: '情報表示', icon: 'format_list_bulleted', kinds: ['place-list', 'place-detail', 'image', 'text'] },
  { label: '操作・ナビゲーション', icon: 'touch_app', kinds: ['button', 'icon-button', 'chip', 'floating-action', 'screen-tabs', 'bottom-navigation', 'side-menu'] },
  { label: '入力', icon: 'edit', kinds: ['text-field', 'select', 'switch', 'checkbox'] },
  { label: 'コンテナー・構成', icon: 'crop_square', kinds: ['container', 'card', 'list-item', 'divider', 'dialog', 'app-header'] },
];

export function PartCatalog({ query, onQueryChange, favorites, onFavoritesChange, onAdd, dataAvailable }: Props) {
  const normalized = query.trim().toLocaleLowerCase('ja-JP');
  const available = firstFlowKinds.filter(kind => partNames[kind]?.toLocaleLowerCase('ja-JP').includes(normalized));
  const toggleFavorite = (kind: string) => onFavoritesChange(favorites.includes(kind) ? favorites.filter(item => item !== kind) : [...favorites, kind]);
  const tile = (kind: string) => (
    <div className="part-tile" key={kind}>
      <IconButton icon={partIcons[kind]} label={partNames[kind]} hint={!dataAvailable && dataKinds.has(kind) ? '地点データの接続後に追加できます' : 'クリックまたはEnterで追加・ドラッグで配置'} disabled={!dataAvailable && dataKinds.has(kind)} draggable onDragStart={event => event.dataTransfer.setData('application/x-machi-component', kind)} onClick={() => onAdd(kind)}><Icon name={partIcons[kind]} /><span>{partNames[kind]}</span></IconButton>
      <span className="part-favorite"><IconButton icon={favorites.includes(kind) ? 'star' : 'star_outline'} label={favorites.includes(kind) ? 'お気に入りから外す' : 'お気に入りに追加'} onClick={() => toggleFavorite(kind)} /></span>
    </div>
  );

  return <div className="library-content catalog">
    <label className="part-search"><Icon name="search" /><input aria-label="部品を探す" placeholder="部品を探す" value={query} onChange={event => onQueryChange(event.target.value)} /></label>
    {!dataAvailable && <p className="hint catalog-data-hint">地図・検索部品は地点データの接続後に追加できます。</p>}
    {normalized ? <div className="part-grid search-results">{available.map(tile)}{!available.length && <p className="hint">該当する部品がありません。</p>}</div> : <>
      {!!favorites.length && <details className="catalog-group" open><summary><Icon name="star" /><span>お気に入り</span><Icon name="expand_more" /></summary><div className="part-grid">{favorites.filter(kind => firstFlowKinds.includes(kind)).map(tile)}</div></details>}
      {groups.map(group => {
        const kinds = group.kinds.filter(kind => firstFlowKinds.includes(kind));
        return <details className="catalog-group" key={group.label} open><summary><Icon name={group.icon} /><span>{group.label}</span><Icon name="expand_more" /></summary><div className="part-grid">{kinds.map(tile)}</div></details>;
      })}
    </>}
  </div>;
}
