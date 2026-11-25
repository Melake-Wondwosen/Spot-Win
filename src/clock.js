// Online time. Phone clocks are sometimes days or hours off, so every time the
// app records or shows comes from here: the phone clock plus the difference to
// the web server's clock, which is read from the Date header of a small request
// to our own site. The difference is kept, so it also works offline once known.
// Until it is known the phone clock is used, and the server corrects the visit.
const KEY = 'spotwin_clock'
let offset = 0
try {
  offset = Number(JSON.parse(localStorage.getItem(KEY) || '{}').offset) || 0
} catch {
  offset = 0
}

export const clockNow = () => Date.now() + offset
export const clockIso = () => new Date(clockNow()).toISOString()
export const clockOffset = () => offset

let busy = null
export function syncClock() {
  if (busy) return busy
  busy = (async () => {
    try {
      const t0 = Date.now()
      // Any path on our site answers (the site sends every path to the app page);
      // only the Date header matters
      const res = await fetch(`/clock?t=${t0}`, { method: 'HEAD', cache: 'no-store' })
      const t1 = Date.now()
      // A copy served from a cache carries its age; add it back
      const age = Number(res.headers.get('age')) || 0
      const server = Date.parse(res.headers.get('date') || '') + (age > 0 && age < 86400 ? age * 1000 : 0)
      if (isNaN(server) || t1 - t0 > 8000) return offset
      // The header is whole seconds, so the true time is on average half a second later
      offset = Math.round(server + 500 - (t0 + t1) / 2)
      // Under 2 seconds is noise
      if (Math.abs(offset) < 2000) offset = 0
      localStorage.setItem(KEY, JSON.stringify({ offset, at: t1 }))
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
