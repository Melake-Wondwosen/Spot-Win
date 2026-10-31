import { beacon, deviceLabel, ping, reportFlag } from './api'
import { PING_MS } from './config'
import { latestFix, onLocation, startWatch } from './location'
import { getUser, setSettings } from './storage'
import { setServerNotes } from './notes'
import { syncPack } from './outlets'
import { isSales } from './roles'

// Tells the manager view where each sales user is and what they're doing.
// Runs only while the app is open on the phone.
let activity = 'Home'
let timer = null
let lastSent = 0
let pending = null
let started = false
let locationOffReported = false

function body(state) {
  const u = getUser()
  if (!isSales(u)) return null
  return { token: u.token, userName: u.name, activity, state, location: latestFix(), device: deviceLabel() }
}

function send() {
  const b = body('online')
  if (!b) return
  lastSent = Date.now()
  ping(b)
    .then((res) => {
      setServerNotes(res.notes)
      if (res.settings) setSettings(res.settings)
      if (res.packVersion) syncPack(res.packVersion)
    })
    .catch(() => {})
}

// Activity changes go out straight away, but never more than once every 45 s
export function setActivity(text, urgent = false) {
  if (text === activity && !urgent) return
  activity = text
  if (!started) return
  const since = Date.now() - lastSent
  clearTimeout(pending)
  if (urgent || since > 45000) send()
  else pending = setTimeout(send, 45000 - since)
}

function onVisibility() {
  if (document.visibilityState === 'hidden') {
    const b = body('offline')
    if (b) beacon('ping', { ...b, activity: 'App closed or in background' })
  } else {
    send()
  }
}

export function startPresence() {
  if (started || !isSales(getUser())) return
  started = true
  startWatch()
  onLocation(({ error }) => {
    if (error?.code === 1 && !locationOffReported) {
      locationOffReported = true
      const b = body('online')
      if (b) reportFlag({ token: b.token, userName: b.userName, type: 'location-off', detail: 'Location permission removed during session' })
    }
  })
  send()
  timer = setInterval(() => document.visibilityState === 'visible' && send(), PING_MS)
  document.addEventListener('visibilitychange', onVisibility)
}

export function stopPresence(lastActivity = 'Signed out') {
  const b = body('offline')
  if (b) beacon('ping', { ...b, activity: lastActivity })
  clearInterval(timer)
  clearTimeout(pending)
  document.removeEventListener('visibilitychange', onVisibility)
  started = false
}
