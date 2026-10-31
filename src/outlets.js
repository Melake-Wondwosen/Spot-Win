import { fetchOutletPack, lookupOutlet } from './api'
import { kvDel, kvGet, kvSet } from './db'

// National Outlet data for the user's division, kept on the phone so an
// Outlet ID fills in on the keystroke, with or without signal. Pulled after
// sign-in, again when the server reports a new version, and once a day.
// Rows are [id, name, divisionRef, agentRef, parentRef, territoryRef]; the
// refs point into `dict`, so repeated names travel once.
const PACK_KEY = 'outlet_pack'
const RECENT_KEY = 'outlet_recent'
const PACK_MAX_AGE = 24 * 3600 * 1000
const RECENT_MAX = 500

let pack = null // { version, at, division, dict, rows }
let index = null // Map id -> row
let recent = null // Map id -> outlet, oldest first
let ready = null

export const normOutletId = (id) => String(id || '').replace(/\s+/g, '').toUpperCase()

function build() {
  index = new Map()
  for (const r of pack?.rows || []) index.set(r[0], r)
}

// Loads what's on the phone into memory once
export function loadOutlets() {
  if (!ready) {
    ready = Promise.all([kvGet(PACK_KEY).catch(() => null), kvGet(RECENT_KEY).catch(() => null)]).then(([p, r]) => {
      pack = p || null
      build()
      recent = new Map(r || [])
    })
  }
  return ready
}

const fromRow = (r) => {
  const d = pack.dict
  return { outletId: r[0], outletName: r[1], division: d[r[2]] || '', agent: d[r[3]] || '', parentTerritory: d[r[4]] || '', territory: d[r[5]] || '' }
}

// Instant lookup on the phone. Null when the ID isn't stored here.
export function localOutlet(id) {
  const key = normOutletId(id)
  const r = index?.get(key)
  if (r) return fromRow(r)
  return recent?.get(key) || null
}

function remember(o) {
  if (!recent) recent = new Map()
  recent.delete(o.outletId)
  recent.set(o.outletId, o)
  while (recent.size > RECENT_MAX) recent.delete(recent.keys().next().value)
  kvSet(RECENT_KEY, [...recent.entries()]).catch(() => {})
}

export const packSize = () => pack?.rows?.length || 0
export const packDivision = () => pack?.division || ''

let syncing = null
// `serverVersion` comes with every ping. Without it the data refreshes when
// it's more than a day old.
export async function syncPack(serverVersion, force = false) {
  await loadOutlets()
  const fresh = pack && Date.now() - pack.at < PACK_MAX_AGE
  if (!force && pack && (serverVersion ? String(pack.version).split('|')[0] === String(serverVersion) : fresh)) return false
  if (syncing) return syncing
  syncing = fetchOutletPack(pack?.version)
    .then(async (d) => {
      if (d.same) pack = { ...pack, at: Date.now() }
      else {
        pack = { version: d.version, at: Date.now(), division: d.division, dict: d.dict || [], rows: d.rows || [] }
        build()
      }
      await kvSet(PACK_KEY, pack).catch(() => {})
      return true
    })
    .catch(() => false)
    .finally(() => {
      syncing = null
    })
  return syncing
}

export async function clearPack() {
  pack = null
  index = new Map()
  await kvDel(PACK_KEY).catch(() => {})
}

// Phone first, then the server (outlets outside the user's division, or
// added since the last download). Throws when neither can answer.
export async function findOutlet(id) {
  await loadOutlets()
  const key = normOutletId(id)
  const local = localOutlet(key)
  if (local) return { found: true, outlet: local }
  const d = await lookupOutlet(key)
  if (d.found) remember(d.outlet)
  return d.found ? { found: true, outlet: d.outlet } : { found: false }
}

export function distanceM(a, b) {
  const R = 6371000
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
