import { DEMO } from './config'
import { markSpoofed } from './guard'

// Keeps the latest GPS fix while the app is open. Browsers can't read location
// once the app is closed or the screen is off.
let last = null
let lastFixAt = 0
let lastError = null
let watchId = null
let wantWatch = false
const listeners = new Set()

const toFix = (p) => ({
  lat: Number(p.coords.latitude.toFixed(6)),
  lng: Number(p.coords.longitude.toFixed(6)),
  accuracy: Math.round(p.coords.accuracy),
  at: p.timestamp || Date.now(),
})

const DEMO_FIX = () => ({ lat: 9.0108 + (Math.random() - 0.5) * 0.00008, lng: 38.7613 + (Math.random() - 0.5) * 0.00008, accuracy: 12, at: Date.now() })

export function locationMessage(err) {
  if (err?.code === 1) return 'Location is blocked. Turn on location in phone settings and allow it for this app, then try again.'
  if (!navigator.geolocation) return 'This phone or browser cannot share location.'
  return 'Could not get your location. Check that location is on, step near a door or window, and try again.'
}

function notify() {
  listeners.forEach((fn) => fn({ fix: last, error: lastError }))
}

export function onLocation(fn) {
  listeners.add(fn)
  fn({ fix: last, error: lastError })
  return () => listeners.delete(fn)
}

export const latestFix = () => last
export const locationError = () => lastError

/* ---------- the location gate ---------- */
// Spot Win only works with location on, for every role, on phones and PCs.
//   checking  just started; the app shows while the first check runs
//   on        a position came in, or the browser is still looking (slow GPS is not "off")
//   ask       the browser hasn't asked yet; the warning page asks with one tap
//   off       blocked for this site, or the device's location is switched off
let gate = { state: 'checking', reason: '' }
let perm = 'unknown'
let permStatus = null
let askedOnce = false
let everOn = false
let lastOkAt = 0
let lastLookAt = 0
let looking = null
const gateListeners = new Set()

export const locationGate = () => gate
export function onLocationGate(fn) {
  gateListeners.add(fn)
  fn(gate)
  return () => gateListeners.delete(fn)
}

function setGate(state, reason = '') {
  if (state === 'on') everOn = true
  if (gate.state === state && gate.reason === reason) return
  gate = { state, reason }
  gateListeners.forEach((fn) => fn(gate))
}

// Browser errors: 1 = refused or switched off, 2 = no location at all, 3 = just slow
function gateFromError(e) {
  if (e?.code !== 1 && e?.code !== 2) return
  if (perm === 'prompt') setGate('ask')
  else setGate('off', perm === 'denied' ? 'blocked' : 'device')
}

// A position the browser made itself, not one handed over by an add-on
function genuine(p) {
  if (typeof GeolocationPosition === 'function' && !(p instanceof GeolocationPosition)) {
    markSpoofed()
    return false
  }
  return true
}

// coarse: a quick network position from a check. It doesn't replace a recent GPS fix.
function gotFix(p, coarse = false) {
  lastOkAt = Date.now()
  setGate('on')
  if (coarse && last && lastOkAt - lastFixAt < 60000) return
  last = toFix(p)
  lastFixAt = lastOkAt
  lastError = null
  notify()
}

async function readPerm() {
  if (!navigator.permissions?.query) return perm
  try {
    const st = await navigator.permissions.query({ name: 'geolocation' })
    perm = st.state
    if (!permStatus) {
      permStatus = st
      st.addEventListener?.('change', () => {
        perm = st.state
        lookAgain()
      })
    }
  } catch {
    // Some browsers can't say; the position request decides
  }
  return perm
}

function freshCheck() {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (genuine(p)) gotFix(p, true)
        resolve()
      },
      (e) => {
        gateFromError(e)
        if (e?.code === 3 && gate.state === 'checking') setGate('on')
        resolve()
      },
      { enableHighAccuracy: false, maximumAge: 0, timeout: 15000 },
    )
  })
}

// Asks for a fresh position with no other request open, so the browser checks
// again both the permission and whether the device's location is switched on.
// userAsked: the person pressed a button, so the browser may show its prompt.
export function lookAgain(userAsked = false) {
  if (looking) return looking
  looking = (async () => {
    lastLookAt = Date.now()
    if (!navigator.geolocation) return setGate('off', 'unsupported')
    await readPerm()
    if (perm === 'denied') {
      stopWatchOnly()
      return setGate('off', 'blocked')
    }
    // Never pop the browser's question by itself more than once
    if (perm === 'prompt' && !everOn) {
      if (askedOnce && !userAsked) return setGate('ask')
      askedOnce = true
      setGate('ask')
    }
    stopWatchOnly()
    await freshCheck()
    if (wantWatch && gate.state === 'on') startWatch()
  })().finally(() => {
    looking = null
  })
  return looking
}

function gateTick() {
  if (document.visibilityState === 'hidden') return
  const now = Date.now()
  if (gate.state === 'off') {
    if (now - lastLookAt >= 4000) lookAgain()
  } else if (gate.state === 'ask') {
    readPerm().then((p) => p === 'granted' && lookAgain())
  } else if (now - lastOkAt > 30000 && now - lastLookAt > 30000) {
    // No position for half a minute: location may have been switched off
    lookAgain()
  } else {
    // Blocking the site doesn't always reach a running page, so ask the browser directly
    readPerm().then((p) => p !== 'granted' && p !== 'unknown' && lookAgain())
  }
}

let gateStarted = false
export function startLocationGate() {
  if (gateStarted) return
  gateStarted = true
  lookAgain()
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && lookAgain())
  setInterval(gateTick, 2000)
}

/* ---------- watching ---------- */

function stopWatchOnly() {
  if (watchId != null) navigator.geolocation.clearWatch(watchId)
  watchId = null
}

export function startWatch() {
  wantWatch = true
  if (watchId != null || !navigator.geolocation) return
  watchId = navigator.geolocation.watchPosition(
    (p) => genuine(p) && gotFix(p),
    (e) => {
      gateFromError(e)
      // A refusal ends the watch inside the browser; it starts again once location is back
      if (e?.code === 1) stopWatchOnly()
      if (DEMO) return
      lastError = e
      notify()
    },
    { enableHighAccuracy: true, maximumAge: 30000, timeout: 60000 },
  )
}

export function stopWatch() {
  wantWatch = false
  stopWatchOnly()
}

function once(highAccuracy, timeout) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject({ code: 2 })
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: highAccuracy, timeout, maximumAge: 30000 })
  })
}

// One fresh fix. Tries GPS first, then the faster network location.
// Rejects with the browser error (code 1 = permission denied).
export async function getFix() {
  try {
    const p = await once(true, 12000).catch((e) => {
      if (e?.code === 1) throw e
      return once(false, 10000)
    })
    if (!genuine(p)) throw { code: 0, message: 'Location could not be confirmed' }
    gotFix(p)
    return last
  } catch (e) {
    gateFromError(e)
    if (DEMO) {
      last = DEMO_FIX()
      return last
    }
    lastError = e
    notify()
    throw e
  }
}
