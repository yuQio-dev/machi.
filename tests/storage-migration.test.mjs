import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadSource } from './load-builder.mjs';
const storage = await loadSource('storage'), model = await loadSource('model');
const legacy = JSON.parse(await readFile(new URL('../src/builder/contracts/ushiku-demo.v1.machi.json', import.meta.url),'utf8'));

// Transactional adapter for failure injection, not a replacement for browser persistence checks.
function database(initial, failBackup = false) {
  let saved = new Map([['active',structuredClone(initial)]]);
  const api = { open() {
    const request = {};
    queueMicrotask(() => {
      request.result = { close() {}, transaction(_name,mode) {
        const changes = new Map(saved), tx = {}, store = {}; let pending=0,done=false;
        const complete = () => queueMicrotask(() => { if(!done && pending===0){done=true;if(mode==='readwrite')saved=changes;tx.oncomplete?.();} });
        const abort = () => { if(done)return;done=true;tx.error=new Error('Injected backup failure');tx.onabort?.(); };
        store.get = key => { const result={};pending++;queueMicrotask(()=>{if(done)return;result.result=structuredClone(changes.get(key));try{result.onsuccess?.();}catch{abort();}pending--;complete();});return result; };
        store.put = (value,key) => {if(failBackup && key==='pre-v2')throw new Error('Injected failure');changes.set(key,structuredClone(value));};
        tx.objectStore=()=>store;return tx;
      }};
      request.onsuccess?.();
    });
    return request;
  }};
  return {api,read:key=>structuredClone(saved.get(key))};
}
test('storage: 移行前バックアップとv2保存は同一transactionで確定する',async()=>{
  const db=database(legacy), previousWindow=globalThis.window, previousIDB=globalThis.indexedDB;
  globalThis.window={indexedDB:db.api};globalThis.indexedDB=db.api;
  try {
    const migrated=model.validateDesign(legacy).design;await storage.writeSavedDesign(migrated);
    assert.deepEqual(db.read('pre-v2'),legacy);assert.equal(db.read('active').schemaVersion,2);
    migrated.title='更新';await storage.writeSavedDesign(migrated);assert.deepEqual(db.read('pre-v2'),legacy);
    assert.equal((await storage.readSavedDesign()).title,'更新');
  } finally {globalThis.window=previousWindow;globalThis.indexedDB=previousIDB;}
});
test('storage: バックアップ失敗・不正形式では元データを上書きしない',async()=>{
  const db=database(legacy,true), previousWindow=globalThis.window, previousIDB=globalThis.indexedDB;
  globalThis.window={indexedDB:db.api};globalThis.indexedDB=db.api;
  try{
    await assert.rejects(storage.writeSavedDesign(model.validateDesign(legacy).design));
    assert.deepEqual(db.read('active'),legacy);assert.equal(db.read('pre-v2'),undefined);
    await assert.rejects(storage.writeSavedDesign({...legacy,schemaVersion:99}));assert.deepEqual(db.read('active'),legacy);
  }finally{globalThis.window=previousWindow;globalThis.indexedDB=previousIDB;}
});
