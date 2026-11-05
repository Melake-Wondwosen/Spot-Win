// "Download the app": the browser lets a web app be installed like a normal
// app (home-screen icon, full screen, no address bar). Chrome and Edge fire
// `beforeinstallprompt` when the app qualifies; we keep that event so a button
// can open the install dialog later. iPhones never fire it, so they get
// written steps instead.
let deferred = null
let installed = false
const subs = new Set()
const emit = () => subs.forEach((fn) => fn(state()))

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches || window.navigator.standalone === true
}

export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function state() {
  return { canPrompt: !!deferred, installed: installed || isStandalone(), ios: isIOS() }
}

export function onInstall(fn) {
  subs.add(fn)
  fn(state())
  return () => subs.delete(fn)
}

// Opens the browser's install dialog. Resolves 'accepted', 'dismissed' or 'unavailable'.
export async function promptInstall() {
  if (!deferred) return 'unavailable'
  const e = deferred
  deferred = null
  emit()
  e.prompt()
  const choice = await e.userChoice.catch(() => ({ outcome: 'dismissed' }))
  return choice.outcome
}

export function startInstallWatch() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e
    emit()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    deferred = null
    emit()
  })
}
