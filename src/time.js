// Everything is stored in UTC and shown in Addis Ababa time (UTC+3, no daylight saving).
const ADDIS_MS = 3 * 3600 * 1000
const TZ = 'Africa/Addis_Ababa'
const DAY = 864e5

const fmt = (opts) => {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts })
  } catch {
    return new Intl.DateTimeFormat('en-GB', opts)
  }
}
const F_TIME = fmt({ hour: '2-digit', minute: '2-digit', hour12: false })
const F_DATE = fmt({ day: 'numeric', month: 'short' })
const F_DATE_Y = fmt({ day: 'numeric', month: 'short', year: 'numeric' })
const F_WEEKDAY = fmt({ weekday: 'short' })

const ms = (v) => (v instanceof Date ? v.getTime() : typeof v === 'number' ? v : v ? new Date(v).getTime() : NaN)

export const time = (v) => (isNaN(ms(v)) ? '' : F_TIME.format(ms(v)))
export const date = (v) => (isNaN(ms(v)) ? '' : F_DATE.format(ms(v)))
export const dateYear = (v) => (isNaN(ms(v)) ? '' : F_DATE_Y.format(ms(v)))
export const weekday = (v) => (isNaN(ms(v)) ? '' : F_WEEKDAY.format(ms(v)))
export const dateTime = (v) => (isNaN(ms(v)) ? '' : `${date(v)} ${time(v)}`)

// Midnight in Addis, as a UTC timestamp. `offset` days back.
export function dayStart(offset = 0, from = Date.now()) {
  return Math.floor((from + ADDIS_MS) / DAY) * DAY - ADDIS_MS - offset * DAY
}

// "2026-10-31" for an instant, in Addis time
export function isoDay(v = Date.now()) {
  return new Date(ms(v) + ADDIS_MS).toISOString().slice(0, 10)
}

// Midnight in Addis for a "2026-10-31" date string
export const dayFromIso = (s) => Date.parse(s + 'T00:00:00Z') - ADDIS_MS

// PAY-20261031-161205-AB12, in Addis time
export function visitId(at = Date.now()) {
  const s = new Date(at + ADDIS_MS).toISOString()
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let tail = ''
  const rnd = crypto.getRandomValues(new Uint8Array(4))
  for (const b of rnd) tail += chars[b % chars.length]
  return `PAY-${s.slice(0, 10).replace(/-/g, '')}-${s.slice(11, 19).replace(/:/g, '')}-${tail}`
}

// Period buttons and the From/To picker turn into a UTC range
export function periodRange(key, fromDay, toDay) {
  if (key === 'custom') {
    const from = fromDay ? dayFromIso(fromDay) : 0
    const to = toDay ? dayFromIso(toDay) + DAY : 0
    return { from: from ? new Date(from).toISOString() : '', to: to ? new Date(to).toISOString() : '' }
  }
  const back = key === 'today' ? 0 : key === '7d' ? 6 : key === '30d' ? 29 : null
  return { from: back == null ? '' : new Date(dayStart(back)).toISOString(), to: '' }
}

export function ago(fromMs, nowMs = Date.now()) {
  if (!fromMs) return 'never'
  const m = Math.max(0, Math.round((nowMs - fromMs) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}

export const DAY_MS = DAY
