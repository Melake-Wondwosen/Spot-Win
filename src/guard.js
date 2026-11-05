import { reportFlag } from './api'
import { DEMO, LOCK_DEVTOOLS } from './config'
import { getUser } from './storage'

// Strict mode, for every role on phones and PCs. Spot Win shows only a warning
// page while any of these is true:
//   tools       developer tools are open (on a PC, or a phone inspected from a PC over USB)
//   automation  the browser is being driven by a program
//   location    something has replaced the browser's location functions (a location-changing add-on)
// A website can't read the Developer options switch on a phone, so a phone is
// caught while it is being inspected, not just because the switch is on.

let reason = null
const listeners = new Set()

export const devReason = () => reason
export function onDev(fn) {
  listeners.add(fn)
  fn(reason)
  return () => listeners.delete(fn)
}

const FLAG_DETAIL = { tools: 'Developer tools open', automation: 'Browser run by a program', location: 'Location changed by an add-on' }
const reported = new Set()

function set(next) {
  if (next === reason) return
  reason = next
  listeners.forEach((fn) => fn(reason))
  // Each kind goes to the admin's Alerts once per app start
  if (!next || reported.has(next)) return
  reported.add(next)
  const u = getUser()
  if (u?.token) reportFlag({ token: u.token, userName: u.name, type: 'devtools', detail: FLAG_DETAIL[next] })
}

const isNative = (f) => typeof f === 'function' && /\{\s*\[native code\]\s*\}\s*$/.test(Function.prototype.toString.call(f))

let spoofed = false
// location.js calls this when a position didn't come from the browser itself
export function markSpoofed() {
  if (!LOCK_DEVTOOLS) return
  spoofed = true
  set('location')
}

function locationReplaced() {
  if (spoofed) return true
  const g = navigator.geolocation
  const P = window.Geolocation?.prototype
  if (!g || !P) return false
  if (!isNative(Function.prototype.toString)) return true
  if (Object.getOwnPropertyNames(g).length || Object.prototype.hasOwnProperty.call(navigator, 'geolocation')) return true
  const getter = Object.getOwnPropertyDescriptor(Navigator.prototype, 'geolocation')?.get
  if (getter && !isNative(getter)) return true
  return ['getCurrentPosition', 'watchPosition', 'clearWatch'].some((k) => !isNative(P[k]) || g[k] !== P[k])
}

// `debugger` only stops when developer tools are attached. A long stop means they are.
function paused() {
  const t = performance.now()
  // eslint-disable-next-line no-debugger
  debugger
  return performance.now() - t > 150
}

// With developer tools open the browser builds a preview of everything logged,
// and a wide table costs far more to preview than a plain log. With them
// closed both calls take a few microseconds.
let rows = null
function inspected() {
  if (!rows) {
    rows = Array.from({ length: 50 }, (_, i) => {
      const o = {}
      for (let j = 0; j < 500; j++) o['k' + j] = i
      return o
    })
  }
  const a = performance.now()
  console.table(rows)
  const b = performance.now()
  console.log(rows)
  const c = performance.now()
  console.clear()
  return b - a > 8 && b - a > (c - b) * 5
}

let hits = 0
let quiet = 0
function tick() {
  if (document.visibilityState === 'hidden') return
  if (navigator.webdriver) return set('automation')
  if (locationReplaced()) return set('location')
  const stopped = paused()
  const open = stopped || inspected()
  // A debugger stop is certain; a slow table needs two in a row, so one slow moment on a phone doesn't count
  hits = open ? hits + (stopped ? 2 : 1) : 0
  quiet = open ? 0 : quiet + 1
  if (hits >= 2) set('tools')
  else if (reason === 'tools' && quiet >= 3) set(null)
}

// "Check again" on the warning page
export function checkDev() {
  if (LOCK_DEVTOOLS) tick()
}

export function startGuard() {
  // Demo builds only: add ?devgate to the address to see the warning page
  if (DEMO && /[?&]devgate/.test(location.search)) return set('tools')
  if (!LOCK_DEVTOOLS) return

  document.addEventListener('contextmenu', (e) => e.preventDefault())
  document.addEventListener(
    'keydown',
    (e) => {
      const k = e.key?.toUpperCase()
      const ctrl = e.ctrlKey || e.metaKey
      if (k === 'F12' || (ctrl && e.shiftKey && ['I', 'J', 'C', 'K'].includes(k)) || (ctrl && k === 'U') || (e.metaKey && e.altKey && ['I', 'J', 'C'].includes(k))) {
        e.preventDefault()
        e.stopPropagation()
      }
    },
    true,
  )

  tick()
  setTimeout(tick, 250)
  setInterval(tick, 1000)
}
