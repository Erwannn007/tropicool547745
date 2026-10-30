// What changed in each world (trees felled, grass mowed, objects placed,
// builds, boats) lives in IndexedDB, the browser's own database: far more
// room than localStorage (about 5 MB shared by everything), and one record
// per world and per kind, so saving one island never rewrites the others.
// A world's records are read into memory before it is built (loadWorld());
// after that reads are instant and writes go to the database in the
// background. Without IndexedDB (some private modes) records fall back to
// localStorage, one key each. Older saves, one localStorage map per kind
// holding every world, move over on the first run.
export const KINDS = { felled: 'tropicool.felled.v1', mowed: 'tropicool.mowed.v1', placed: 'tropicool.placed.v1', build: 'tropicool.build.v1', boat: 'tropicool.boat.v1' };
const DB = 'tropicool', OS = 'worlds', LS = 'tropicool.w:';
const mem = new Map(), loaded = new Set();
let db = null;
const key = (kind, id) => `${kind}|${id}`;
const done = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const committed = (tx) => new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = tx.onabort = () => rej(tx.error); });

export async function initStore() {
  try {
    db = await new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(OS);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked'));
      setTimeout(() => rej(new Error('timeout')), 4000);
    });
  } catch (_) { db = null; }
  await migrate();
  navigator.storage?.persist?.().catch(() => {}); // ask the browser not to clear it when space runs low
}

// the old maps { [world]: data } of localStorage, split into records
async function migrate() {
  for (const [kind, old] of Object.entries(KINDS)) {
    let all = null;
    try { all = JSON.parse(localStorage.getItem(old)); } catch (_) { /* unreadable: leave it */ }
    if (!all || typeof all !== 'object') continue;
    try {
      if (db) {
        const tx = db.transaction(OS, 'readwrite'), os = tx.objectStore(OS);
        for (const [id, v] of Object.entries(all)) os.put(v, key(kind, id));
        await committed(tx);
      } else for (const [id, v] of Object.entries(all)) localStorage.setItem(LS + key(kind, id), JSON.stringify(v));
      localStorage.removeItem(old); // only once everything is safely written
    } catch (_) { /* keep the old map, try again next time */ }
  }
}

// read a world's records into memory (before building it)
export async function loadWorld(id) {
  if (loaded.has(id)) return;
  for (const kind of Object.keys(KINDS)) {
    const k = key(kind, id);
    try {
      const v = db ? await done(db.transaction(OS).objectStore(OS).get(k)) : JSON.parse(localStorage.getItem(LS + k));
      if (v != null) mem.set(k, v);
    } catch (_) { /* nothing recorded */ }
  }
  loaded.add(id);
}

export const getW = (kind, id) => mem.get(key(kind, id));
export function setW(kind, id, v) {
  const k = key(kind, id);
  if (v == null) mem.delete(k); else mem.set(k, v);
  try {
    if (db) { const os = db.transaction(OS, 'readwrite').objectStore(OS); v == null ? os.delete(k) : os.put(v, k); }
    else if (v == null) localStorage.removeItem(LS + k); else localStorage.setItem(LS + k, JSON.stringify(v));
  } catch (_) { /* storage full or unavailable */ }
}
// forget everything recorded for a world
export function purgeWorld(id) { for (const kind of Object.keys(KINDS)) setW(kind, id, null); }
// does a loaded world hold any change compared to the untouched seed?
export function worldChanged(id) {
  return Object.keys(KINDS).some((kind) => { const v = getW(kind, id); return v && (Array.isArray(v) ? v.length : (v.cells?.length ?? Object.keys(v).length)); });
}
