import { validateDesign, type Design } from './model';

const databaseName = 'machi-projects-v1', storeName = 'projects';
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('このブラウザーでは保存できません')); return; }
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('保存領域を開けません'));
  });
}
export async function readSavedDesign(key = 'active'): Promise<unknown> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
    request.onsuccess = () => { db.close(); resolve(request.result); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}
export async function writeSavedDesign(design: Design): Promise<void> {
  const checked = validateDesign(design);
  if (!checked.design) throw new Error('未完了の設定があります: ' + checked.errors.slice(0, 2).join(' / '));
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite'), store = transaction.objectStore(storeName);
    const current = store.get('active');
    current.onsuccess = () => {
      const previous = current.result;
      if (previous?.schemaVersion === 1) {
        const backup = store.get('pre-v2');
        backup.onsuccess = () => {
          if (backup.result === undefined) store.put(previous, 'pre-v2');
          store.put(checked.design, 'active');
        };
      } else store.put(checked.design, 'active');
    };
    transaction.oncomplete = () => { db.close(); resolve(); };
    const failure = () => { db.close(); reject(transaction.error || new Error('保存に失敗しました。元の保存データは保持しています')); };
    transaction.onerror = failure; transaction.onabort = failure;
  });
}
