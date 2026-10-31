import { kvDel, kvGet, kvSet } from './db'
import { DEFAULT_SETTINGS } from './config'
import { dayStart, isoDay } from './time'

// Small things live in localStorage so screens can read them without waiting.
// The visit in progress, the upload queue and the photos live in IndexedDB.
const USER_KEY = 'spotwin_user'
const WHY_KEY = 'spotwin_queue_why'
const SYNC_KEY = 'spotwin_last_sync'
const SETTINGS_KEY = 'spotwin_settings'

const mem = {}
function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw != null) return JSON.parse(raw)
  } catch {
    // fall through to memory
  }
  return key in mem ? mem[key] : fallback
}
function write(key, value) {
  mem[key] = value
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage full or blocked: memory carries on
  }
}
function remove(key) {
  delete mem[key]
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

/* ---------- session ---------- */
// No expiry. Signing out clears only this; unsent visits and their photos stay.
export const getUser = () => read(USER_KEY, null)
export const setUser = (user) => write(USER_KEY, user)
export const clearUser = () => remove(USER_KEY)

/* ---------- settings from the server ---------- */
export const getSettings = () => ({ ...DEFAULT_SETTINGS, ...read(SETTINGS_KEY, {}) })
export function setSettings(s) {
  if (!s || typeof s !== 'object') return
  const clean = {}
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (s[k] !== '' && s[k] != null && !isNaN(Number(s[k]))) clean[k] = Number(s[k])
  write(SETTINGS_KEY, clean)
}

/* ---------- sync status ---------- */
export const getQueueWhy = () => read(WHY_KEY, '')
export const setQueueWhy = (why) => (why ? write(WHY_KEY, why) : remove(WHY_KEY))
export const getLastSync = () => read(SYNC_KEY, 0)
export const setLastSync = (ms) => write(SYNC_KEY, ms)

/* ---------- counters (per user, on this phone) ---------- */
const countKey = (uid) => `spotwin_count_${uid}`
export function countDone(uid) {
  const c = read(countKey(uid), { total: 0, days: {} })
  const d = isoDay()
  c.total = (c.total || 0) + 1
  c.days = { [d]: (c.days?.[d] || 0) + 1 }
  write(countKey(uid), c)
}
export function getCounts(uid) {
  const c = read(countKey(uid), { total: 0, days: {} })
  return { today: c.days?.[isoDay()] || 0, total: c.total || 0 }
}

/* ---------- serialised writes ---------- */
// The queue is touched by Finish and by the uploader at the same time, so
// every read-modify-write goes through one chain.
let chain = Promise.resolve()
function serial(fn) {
  const next = chain.then(fn, fn)
  chain = next.catch(() => {})
  return next
}

/* ---------- visit in progress ---------- */
export async function getDraft() {
  const d = await kvGet('draft').catch(() => null)
  const u = getUser()
  return d && u && d.userId === u.id ? d : null
}
export const setDraft = (d) => serial(() => kvSet('draft', d))
export const clearDraft = () => serial(() => kvDel('draft'))

/* ---------- upload queue ---------- */
export const getQueue = async () => (await kvGet('queue').catch(() => null)) || []
export const updateQueue = (fn) =>
  serial(async () => {
    const next = fn((await kvGet('queue')) || [])
    await kvSet('queue', next)
    return next
  })

/* ---------- today's visits on this phone ---------- */
// Text only. Kept for 7 days so a late upload still shows its tick.
const logKey = (uid) => `log_${uid}`
export async function getLog(uid) {
  const list = (await kvGet(logKey(uid)).catch(() => null)) || []
  return list.filter((v) => new Date(v.finishedAt).getTime() >= dayStart(6))
}
export const updateLog = (uid, fn) =>
  serial(async () => {
    const list = ((await kvGet(logKey(uid))) || []).filter((v) => new Date(v.finishedAt).getTime() >= dayStart(6))
    const next = fn(list)
    await kvSet(logKey(uid), next)
    return next
  })
