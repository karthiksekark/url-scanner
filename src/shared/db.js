const DB_NAME = 'url-scanner'
const DB_VERSION = 1

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('results')) {
        db.createObjectStore('results', { keyPath: 'url' })
      }
      if (!db.objectStoreNames.contains('urlList')) {
        db.createObjectStore('urlList', { keyPath: 'url' })
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta')
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
