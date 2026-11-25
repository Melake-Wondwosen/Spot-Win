// Picks up a new deploy without anyone refreshing by hand. When the app comes
// back to the screen, and every few minutes, it compares its own build file with
// the live one and reloads if they differ. Never during a visit: the draft is
// saved, but a reload mid-step would still be jarring.
const EVERY_MS = 5 * 60 * 1000
const BUILD = /\/assets\/index-[\w-]+\.js/

function current() {
  const s = [...document.querySelectorAll('script[src]')].map((x) => x.getAttribute('src')).find((src) => BUILD.test(src))
  return s ? s.match(BUILD)[0] : ''
}

let busy = false
export async function checkForUpdate() {
  if (busy || !navigator.onLine || location.pathname.startsWith('/visit')) return
  const mine = current()
  if (!mine) return
  busy = true
  try {
    // The query string keeps the service worker's stored page out of it
    const res = await fetch(`/index.html?u=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return
    const live = (await res.text()).match(BUILD)?.[0]
    if (live && live !== mine) location.reload()
  } catch {
    // Offline or blocked: try again later
  } finally {
    busy = false
  }
}

export function startUpdateWatch() {
  if (import.meta.env.DEV) return
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate()
  })
  setInterval(checkForUpdate, EVERY_MS)
  setTimeout(checkForUpdate, 3000)
}
