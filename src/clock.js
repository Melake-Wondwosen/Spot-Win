import { API_URL } from './config'
// Online time. Phone clocks are sometimes days or hours off, so every time the
// app records or shows comes from here: the phone clock plus the difference to
// the Apps Script server's clock. The difference is kept, so it also works
// offline once known.
// Until it is known the phone clock is used, and the server corrects the visit.
// v2: the first version read the web host's Date header, which can be hours
// old when the page comes from its cache, so those readings are dropped
const KEY = 'spotwin_clock_v2'
let offset = 0
try {
  offset = Number(JSON.parse(localStorage.getItem(KEY) || '{}').offset) || 0
} catch {
  offset = 0
}

export const clockNow = () => Date.now() + offset
export const clockIso = () => new Date(clockNow()).toISOString()
export const clockOffset = () => offset

// Two readings closer than this are the same time
const NOISE_MS = 2000

// A server time read between t0 and t1 (phone clock). The middle of the round
// trip is when the server most likely read its clock.
export function noteServerTime(serverMs, t0, t1) {
  if (!Number.isFinite(serverMs) || !t0 || !t1 || t1 - t0 > 8000) return
  let next = Math.round(serverMs - (t0 + t1) / 2)
  if (Math.abs(next) < NOISE_MS) next = 0
  offset = next
  try {
    localStorage.setItem(KEY, JSON.stringify({ offset, at: t1 }))
  } catch {
    // Storage full or blocked: keep it in memory
  }
}

let busy = null
export function syncClock() {
  if (busy) return busy
  busy = (async () => {
    try {
      const t0 = Date.now()
      // Opening the Apps Script address answers "ok · Spot Win · <server time>"
      const res = await fetch(`${API_URL}?clock=${t0}`, { cache: 'no-store' })
      const text = await res.text()
      const t1 = Date.now()
      const m = text.match(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z/)
      if (m) noteServerTime(Date.parse(m[0]), t0, t1)
    } catch {
      // Offline: keep the last known difference
    } finally {
      busy = null
    }
    return offset
  })()
  return busy
}

export function startClock() {
  syncClock()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncClock()
  })
  window.addEventListener('online', () => syncClock())
  setInterval(syncClock, 10 * 60 * 1000)
}

// Clear readings saved by the first version
try {
  localStorage.removeItem('spotwin_clock')
} catch {
  // ignore
}
