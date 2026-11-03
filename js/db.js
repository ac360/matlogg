// IndexedDB-lager. Alla poster har id, createdAt, updatedAt och kan markeras deleted
// (mjuk radering) så att molnsynk kan läggas till senare.

const DB_NAME = 'matlogg';
const DB_VERSION = 1;

// Lager som finns redan nu. weights och workouts används i senare faser.
export const STORES = {
  entries: { keyPath: 'id', indexes: [['date', 'date']] },
  customFoods: { keyPath: 'id', indexes: [['barcode', 'barcode']] },
  choices: { keyPath: 'key' },
  favorites: { keyPath: 'id' },
  recipes: { keyPath: 'id' },
  settings: { keyPath: 'key' },
  weights: { keyPath: 'id', indexes: [['date', 'date']] },
  workouts: { keyPath: 'id', indexes: [['date', 'date']] },
};

let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, def] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, { keyPath: def.keyPath });
        for (const [idx, path] of def.indexes || []) store.createIndex(idx, path);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(storeNames, mode, fn) {
  const db = await open();
  const t = db.transaction(storeNames, mode);
  const result = await fn(t);
  await new Promise((resolve, reject) => {
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
  return result;
}

export const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

export async function get(store, key) {
  return tx([store], 'readonly', t => wrap(t.objectStore(store).get(key)));
}

export async function getAll(store, { includeDeleted = false } = {}) {
  const rows = await tx([store], 'readonly', t => wrap(t.objectStore(store).getAll()));
  return includeDeleted ? rows : rows.filter(r => !r.deleted);
}

export async function getByIndex(store, index, value) {
  const rows = await tx([store], 'readonly', t => wrap(t.objectStore(store).index(index).getAll(value)));
  return rows.filter(r => !r.deleted);
}

// Sparar en post. Sätter id och tidsstämplar automatiskt.
export async function put(store, record) {
  const now = new Date().toISOString();
  const keyPath = STORES[store].keyPath;
  const rec = { ...record };
  if (keyPath === 'id' && !rec.id) rec.id = uid();
  if (!rec.createdAt) rec.createdAt = now;
  rec.updatedAt = now;
  await tx([store], 'readwrite', t => wrap(t.objectStore(store).put(rec)));
  return rec;
}

export async function softDelete(store, key) {
  const rec = await get(store, key);
  if (!rec) return;
  await put(store, { ...rec, deleted: true });
}

// Enkla inställningar som nyckel/värde.
export async function getSetting(key, fallback = null) {
  const row = await get('settings', key);
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  return put('settings', { key, value });
}

// ---- Backup ----

export async function exportAll() {
  const stores = {};
  for (const name of Object.keys(STORES)) {
    stores[name] = await getAll(name, { includeDeleted: true });
  }
  return {
    app: 'matlogg',
    schema: DB_VERSION,
    exported: new Date().toISOString(),
    stores,
  };
}

// Ersätter all data med innehållet i backupen.
export async function importAll(data) {
  if (!data || data.app !== 'matlogg' || typeof data.stores !== 'object') {
    throw new Error('Filen är inte en backup från appen.');
  }
  const names = Object.keys(STORES);
  await tx(names, 'readwrite', t => {
    for (const name of names) {
      const store = t.objectStore(name);
      store.clear();
      for (const rec of data.stores[name] || []) store.put(rec);
    }
  });
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {}
  return false;
}
