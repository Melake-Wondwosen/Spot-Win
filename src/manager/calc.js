import { ACTIVITIES, JUMP_KMH, ONLINE_MS } from '../config'

export const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v))
export const text = (v) => String(v ?? '').replace(/^'/, '')
const ms = (iso) => (iso ? new Date(iso).getTime() : 0)
export const isVoid = (v) => text(v.status).toLowerCase() === 'void'

// Totals for a list of visits. Void visits are left out.
export function totals(visits) {
  const saved = visits.filter((v) => !isVoid(v))
  let birr = 0
  let crates = 0
  let birrVisits = 0
  const outlets = new Set()
  const users = new Set()
  for (const v of saved) {
    const a = num(v.amount) || 0
    if (text(v.investmentUnit) === 'Crate') crates += a
    else {
      birr += a
      birrVisits++
    }
    outlets.add(text(v.outletId))
    users.add(text(v.userId))
  }
  return { visits: saved.length, outlets: outlets.size, users: users.size, birr, crates, birrVisits, avgBirr: birrVisits ? birr / birrVisits : null }
}

export function byActivity(visits) {
  return ACTIVITIES.map((a) => ({ ...a, ...totals(visits.filter((v) => text(v.activity) === a.label)) }))
}

// Groups visits by a field and totals each group, biggest first
export function groupBy(visits, key) {
  const by = new Map()
  for (const v of visits) {
    if (isVoid(v)) continue
    const k = text(v[key]).trim() || 'Not set'
    if (!by.has(k)) by.set(k, [])
    by.get(k).push(v)
  }
  return [...by.entries()].map(([name, list]) => ({ name, ...totals(list) })).sort((a, b) => b.birr - a.birr || b.visits - a.visits)
}

export function haversineKm(a, b) {
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Location points that imply impossible travel. Usually a fake-GPS app.
export function locationJumps(points) {
  const out = []
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const hours = (ms(b.date) - ms(a.date)) / 3.6e6
    const km = haversineKm(a, b)
    if (km > 1 && hours > 0 && km / hours > JUMP_KMH) out.push({ at: b.date, km: Math.round(km), kmh: Math.round(km / hours) })
  }
  return out
}

export function teamStatus({ users, presence, visits, track, flags }, nowMs, dayStartMs) {
  const pres = new Map(presence.map((p) => [text(p.userId), p]))
  return users
    .map((u) => {
      const p = pres.get(u.id)
      const lastSeen = ms(p?.lastSeen)
      const online = !!p && text(p.state) === 'online' && nowMs - lastSeen < ONLINE_MS
      const mine = visits.filter((v) => text(v.userId) === u.id && !isVoid(v)).sort((a, b) => ms(b.date) - ms(a.date))
      const points = track
        .filter((t) => text(t.userId) === u.id && num(t.lat) != null)
        .map((t) => ({ date: t.date, lat: num(t.lat), lng: num(t.lng), accuracy: num(t.accuracy), activity: text(t.activity) }))
        .sort((a, b) => ms(a.date) - ms(b.date))
      const myFlags = flags.filter((f) => text(f.userId) === u.id && text(f.status) !== 'resolved').map((f) => ({ type: text(f.type), at: f.date, detail: text(f.detail), visitId: text(f.visitId) }))
      locationJumps(points).forEach((j) => myFlags.push({ type: 'jump', at: j.at, detail: `${j.km} km at ${j.kmh} km/h` }))
      const t = totals(mine)
      return {
        ...u,
        online,
        lastSeen: lastSeen || null,
        seenToday: lastSeen >= dayStartMs,
        activity: text(p?.activity),
        lat: num(p?.lat),
        lng: num(p?.lng),
        accuracy: num(p?.accuracy),
        locTime: ms(p?.locTime) || null,
        visitsToday: mine.filter((v) => ms(v.date) >= dayStartMs).length,
        visitsPeriod: mine.length,
        birr: t.birr,
        crates: t.crates,
        lastVisit: mine[0] || null,
        track: points,
        flags: myFlags,
      }
    })
    .sort((a, b) => b.online - a.online || (b.lastSeen || 0) - (a.lastSeen || 0) || a.name.localeCompare(b.name))
}

export const FLAG_LABEL = {
  devtools: 'Dev tools',
  'location-off': 'Location off',
  jump: 'GPS jump',
  'away-from-outlet': 'Away from outlet',
  'high-amount': 'High amount',
  'duplicate-receipt': 'Duplicate receipt',
  'short-visit': 'Very short visit',
}
export const flagLabel = (t) => FLAG_LABEL[t] || t
