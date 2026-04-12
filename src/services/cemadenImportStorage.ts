/**
 * Persistência local dos CSV CEMADEN importados pelo utilizador (IndexedDB).
 * Permite meses que ainda não existem em `public/data/cemaden/` no deploy.
 */

const DB_NAME = 'dados-jf-cemaden-v1';
const STORE = 'imports';

export interface CemadenImportRecord {
  monthKey: string;
  csvText: string;
  importedAt: number;
}

export interface CemadenImportMeta {
  monthKey: string;
  importedAt: number;
  sizeBytes: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'monthKey' });
      }
    };
  });
}

export async function isCemadenImportStorageAvailable(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  try {
    await openDb();
    return true;
  } catch {
    return false;
  }
}

export async function listCemadenImports(): Promise<CemadenImportMeta[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const rows = (req.result as CemadenImportRecord[]) ?? [];
      resolve(
        rows.map((r) => ({
          monthKey: r.monthKey,
          importedAt: r.importedAt,
          sizeBytes: new Blob([r.csvText]).size,
        }))
      );
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getImportedCsvMap(): Promise<Map<string, string>> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const rows = (req.result as CemadenImportRecord[]) ?? [];
      const m = new Map<string, string>();
      for (const r of rows) {
        m.set(r.monthKey, r.csvText);
      }
      resolve(m);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveCemadenImport(monthKey: string, csvText: string): Promise<void> {
  const db = await openDb();
  const rec: CemadenImportRecord = {
    monthKey,
    csvText,
    importedAt: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteCemadenImport(monthKey: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(monthKey);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
