"use client";

// Sheets drawn once open at once afterwards (19 Nov, Danial: drawings take "too long" to load, "not a smooth
// experience"). Measured on Whittier with a 120 ms round trip at 50 Mbps: opening a stored sheet fetched 5 to 27 MB of the
// PDF and took 2 to 9 seconds before pdf.js drew it in about one more, and the same sheet opened again after a reload did
// it all again. Every page image the app draws (the viewer's, and the automatic scope run's, which draws each sheet it
// reads at the viewer's size) is kept here in the browser's own storage (IndexedDB), by document, page and size: a stored
// document never changes under its id, so a kept image never goes stale. After a scope run, the person who uploaded
// opens every scope's drawing straight from here. The oldest are let go past KEEP_PAGES. Without IndexedDB (a private
// window, storage turned off) nothing is kept and pages are drawn as before.

/** Page images kept, about 0.4 to 1.5 MB each: 800 holds a large set like Whittier's 424 sheets, the ones opened at both sizes. */
export const KEEP_PAGES = 800;
const DB = "structor-page-images", STORE = "pages";
type Entry = { key: string; image: string; aspect: number; at: number };

export const pageImageKey = (docId: string, page: number, size: number) => `${docId}:${page}:${size}`;

let opening: Promise<IDBDatabase | null> | null = null;
function database(): Promise<IDBDatabase | null> {
  opening ??= new Promise(resolve => {
    try {
      if (typeof indexedDB === "undefined") { resolve(null); return; }
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "key" }).createIndex("at", "at");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return opening;
}

const done = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });

/** The kept image for this key, or null. Never throws: a broken store reads as empty. */
export async function keptPageImage(key: string): Promise<{ image: string; aspect: number } | null> {
  try {
    const db = await database();
    if (!db) return null;
    const entry = await done(db.transaction(STORE, "readonly").objectStore(STORE).get(key)) as Entry | undefined;
    return entry && typeof entry.image === "string" && entry.image.startsWith("data:image/") ? { image: entry.image, aspect: entry.aspect } : null;
  } catch { return null; }
}

let writes = 0;
/** Keeps a drawn page image; every few writes the oldest beyond KEEP_PAGES are let go. Never throws. */
export async function keepPageImage(key: string, image: string, aspect: number, at = Date.now()): Promise<void> {
  try {
    const db = await database();
    if (!db) return;
    await done(db.transaction(STORE, "readwrite").objectStore(STORE).put({ key, image, aspect, at } satisfies Entry));
    if (++writes % 25 === 0) await trim(db);
  } catch { /* full or unavailable storage: the page is drawn again next time */ }
}

async function trim(db: IDBDatabase) {
  const store = db.transaction(STORE, "readwrite").objectStore(STORE);
  const extra = (await done(store.count())) - KEEP_PAGES;
  if (extra <= 0) return;
  let left = extra;
  await new Promise<void>(resolve => {
    const cursor = store.index("at").openCursor();
    cursor.onsuccess = () => { const c = cursor.result; if (!c || left-- <= 0) { resolve(); return; } c.delete(); c.continue(); };
    cursor.onerror = () => resolve();
  });
}
