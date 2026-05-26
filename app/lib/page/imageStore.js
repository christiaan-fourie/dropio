const DB_NAME = "dropio";
const DB_VERSION = 1;
const STORE_NAME = "library-images";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB"));
  });
}

function withStore(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        fn(store, resolve, reject);
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error("IndexedDB transaction failed"));
        };
      })
  );
}

export function isImageStoreAvailable() {
  return typeof indexedDB !== "undefined";
}

export async function putLibraryImage(id, blob) {
  await withStore("readwrite", (store, resolve, reject) => {
    const request = store.put(blob, id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not store library image"));
  });
}

export async function getLibraryImage(id) {
  return withStore("readonly", (store, resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error ?? new Error("Could not read library image"));
  });
}

export async function deleteLibraryImage(id) {
  await withStore("readwrite", (store, resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not delete library image"));
  });
}

export async function listLibraryImageIds() {
  return withStore("readonly", (store, resolve, reject) => {
    const request = store.getAllKeys();
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error ?? new Error("Could not list library images"));
  });
}

export async function clearLibraryImages() {
  await withStore("readwrite", (store, resolve, reject) => {
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not clear library images"));
  });
}

export async function syncLibraryImages(libraryItems, srcToBlob) {
  const keepIds = new Set((libraryItems || []).map((item) => item.id));
  const existingIds = await listLibraryImageIds();

  for (const id of existingIds) {
    if (!keepIds.has(id)) {
      await deleteLibraryImage(id);
    }
  }

  for (const item of libraryItems || []) {
    const blob = await srcToBlob(item.src);
    await putLibraryImage(item.id, blob);
  }
}
