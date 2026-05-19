const DB_NAME = 'url-scanner'
const DB_VERSION = 2

const BRAND_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const MAX_SCAN_HISTORY = 5

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      // v1 stores
      if (!db.objectStoreNames.contains('results')) {
        db.createObjectStore('results', { keyPath: 'url' })
      }
      if (!db.objectStoreNames.contains('urlList')) {
        db.createObjectStore('urlList', { keyPath: 'url' })
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta')
      }
      // v2 stores
      if (!db.objectStoreNames.contains('brandCache')) {
        db.createObjectStore('brandCache', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('scanHistory')) {
        db.createObjectStore('scanHistory', { keyPath: 'scanId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => { dbPromise = null; reject(req.error) }
  })
  return dbPromise
}

function idbReq(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

function storeTx(storeName, mode, fn) {
  return openDB().then(
    (db) => new Promise((resolve, reject) => {
      const t = db.transaction(storeName, mode)
      t.onerror = () => reject(t.error)
      resolve(fn(t.objectStore(storeName), t))
    })
  )
}

// ── Results ──────────────────────────────────────────────────────────────────

export function getAllResults() {
  return storeTx('results', 'readonly', (store) => idbReq(store.getAll()))
}

export function saveResults(results) {
  return openDB().then(
    (db) => new Promise((resolve, reject) => {
      const t = db.transaction('results', 'readwrite')
      const store = t.objectStore('results')
      store.clear()
      for (const r of results) store.put(r)
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error)
    })
  )
}

export function putResults(results) {
  return openDB().then(
    (db) => new Promise((resolve, reject) => {
      const t = db.transaction('results', 'readwrite')
      const store = t.objectStore('results')
      for (const r of results) store.put(r)
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error)
    })
  )
}

// ── Meta ─────────────────────────────────────────────────────────────────────

export function getMeta(key) {
  return storeTx('meta', 'readonly', (store) => idbReq(store.get(key)))
}

export function setMeta(key, value) {
  return openDB().then(
    (db) => new Promise((resolve, reject) => {
      const t = db.transaction('meta', 'readwrite')
      t.objectStore('meta').put(value, key)
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error)
    })
  )
}

// ── URL List ─────────────────────────────────────────────────────────────────

export function getAllUrlList() {
  return storeTx('urlList', 'readonly', (store) => idbReq(store.getAll()))
}

export function saveUrlList(items) {
  return openDB().then(
    (db) => new Promise((resolve, reject) => {
      const t = db.transaction('urlList', 'readwrite')
      const store = t.objectStore('urlList')
      store.clear()
      for (const item of items) store.put(item)
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error)
    })
  )
}

// ── Brand Cache ───────────────────────────────────────────────────────────────

// Returns a Map<id, brandData> for all requested ids that are in cache and not expired.
export async function getBrandCacheMap(ids) {
  const db = await openDB()
  const result = new Map()
  const now = Date.now()
  await new Promise((resolve, reject) => {
    const t = db.transaction('brandCache', 'readonly')
    const store = t.objectStore('brandCache')
    let pending = ids.length
    if (pending === 0) { resolve(); return }
    for (const id of ids) {
      const req = store.get(id)
      req.onsuccess = () => {
        const entry = req.result
        if (entry && (now - entry.cachedAt) < BRAND_CACHE_TTL_MS) {
          const { id: _id, cachedAt: _c, ...brandData } = entry
          result.set(id, brandData)
        }
        if (--pending === 0) resolve()
      }
      req.onerror = () => { if (--pending === 0) resolve() }
    }
    t.onerror = () => reject(t.error)
  })
  return result
}

// Saves brand entries to cache. Each entry must include an `id` field.
export function saveBrandCacheEntries(entries) {
  return openDB().then(
    (db) => new Promise((resolve, reject) => {
      const t = db.transaction('brandCache', 'readwrite')
      const store = t.objectStore('brandCache')
      const now = Date.now()
      for (const entry of entries) store.put({ ...entry, cachedAt: now })
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error)
    })
  )
}

// ── Scan History ──────────────────────────────────────────────────────────────

export async function getScanHistory() {
  const all = await storeTx('scanHistory', 'readonly', (store) => idbReq(store.getAll()))
  return all.sort((a, b) => b.startedAt - a.startedAt).slice(0, MAX_SCAN_HISTORY)
}

// Appends a scan history record and trims to MAX_SCAN_HISTORY.
export async function appendScanHistory(record) {
  const db = await openDB()
  await new Promise((resolve, reject) => {
    const t = db.transaction('scanHistory', 'readwrite')
    const store = t.objectStore('scanHistory')
    store.put(record)
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
  // Trim to max count
  const all = await storeTx('scanHistory', 'readonly', (store) => idbReq(store.getAll()))
  if (all.length > MAX_SCAN_HISTORY) {
    const sorted = all.sort((a, b) => a.startedAt - b.startedAt)
    const toDelete = sorted.slice(0, all.length - MAX_SCAN_HISTORY)
    await new Promise((resolve, reject) => {
      const t = db.transaction('scanHistory', 'readwrite')
      const store = t.objectStore('scanHistory')
      for (const r of toDelete) store.delete(r.scanId)
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error)
    })
  }
}
