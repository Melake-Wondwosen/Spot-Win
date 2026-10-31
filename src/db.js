// Small IndexedDB wrapper. Two stores: `kv` for records (visit in progress,
// upload queue, outlet data) and `photos` for the JPEG blobs, which are far
// too big for localStorage. Falls back to memory where IndexedDB is blocked
// (some private browsing modes); work then survives until the tab closes.
const NAME = 'spotwin'
const VERSION = 1
const mem = { kv: new Map(), photos: new Map() }
let dbp = null

function open() {
  if (dbp) return dbp
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open(NAME, VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbp
}

async function run(store, mode, fn) {
  const db = await open()
  if (!db) return fn(null, mem[store])
  return new Promise((resolve, reject) => {
    let out
    try {
      const tx = db.transaction(store, mode)
      const os = tx.objectStore(store)
      const req = fn(os)
      if (req) req.onsuccess = () => (out = req.result)
      tx.oncomplete = () => resolve(out)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    } catch (err) {
      reject(err)
    }
  })
}

const get = (store) => (key) => run(store, 'readonly', (os, m) => (os ? os.get(key) : m.get(key)))
const put = (store) => (key, value) => run(store, 'readwrite', (os, m) => (os ? os.put(value, key) : void m.set(key, value)))
const del = (store) => (key) => run(store, 'readwrite', (os, m) => (os ? os.delete(key) : void m.delete(key)))

export const kvGet = get('kv')
export const kvSet = put('kv')
export const kvDel = del('kv')
export const photoGet = get('photos')
export const photoPut = put('photos')
export const photoDel = del('photos')

// Ask the browser not to clear our storage when the phone runs low on space
export function persistStorage() {
  try {
    navigator.storage?.persist?.()
  } catch {
    // not supported
  }
}
