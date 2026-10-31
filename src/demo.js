// Made-up data for demo builds only (vite --mode demo). Never shipped.
import { ACTIVITIES, DEFAULT_SETTINGS } from './config'
import { dayStart } from './time'

let seed = 11
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
const pick = (a) => a[Math.floor(rnd() * a.length)]
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const GEO = [
  { division: 'North Addis', agent: 'Demo Agent A plc', parentTerritory: 'Addis Ababa Gullele', territory: 'Addis Ababa Aware' },
  { division: 'North Addis', agent: 'Demo Agent B plc', parentTerritory: 'Addis Ababa Yeka', territory: 'Addis Ababa Megenagna' },
  { division: 'South Addis', agent: 'Demo Agent C plc', parentTerritory: 'Addis Ababa Kirkos', territory: 'Addis Ababa Kazanchis' },
  { division: 'South Addis', agent: 'Demo Agent D plc', parentTerritory: 'Addis Ababa Bole', territory: 'Addis Ababa Bole Medhanialem' },
]
const NAMES = ['Hana Tesfaye', 'Abel Kebede', 'Selam Girma', 'Dawit Alemu', 'Meron Haile', 'Yonas Bekele', 'Liya Mesfin', 'Kaleab Tadesse']
const PLACES = ['Bole', 'Piassa', 'Kazanchis', 'Megenagna', 'Sarbet', 'CMC', 'Merkato', 'Gerji', 'Lebu', 'Ayat']
const KINDS = ['Bar', 'Lounge', 'Grocery', 'Hotel', 'Cafe', 'Mini Market']
const CENTER = { lat: 9.0108, lng: 38.7613 }

let db = null
function build() {
  const now = Date.now()
  const users = NAMES.map((name, i) => ({ id: `S-${String(i + 1).padStart(2, '0')}`, name, username: name.split(' ')[0].toLowerCase(), staffId: `HB${1040 + i}`, region: GEO[i % 4].division, role: 'sales', active: true }))
  users.forEach((u, i) => (u.agent = GEO[i % 4].agent))
  users.push({ id: 'ASM-1', name: 'Demo ASM', username: 'asm', staffId: 'HB0501', region: 'North Addis', agent: 'Demo Agent A plc', role: 'asm', active: true })
  users.push({ id: 'M-01', name: 'Demo Manager', username: 'manager', staffId: 'HB0901', region: 'North Addis', role: 'manager', active: true })
  users.push({ id: 'A-01', name: 'Demo Admin', username: 'admin', staffId: 'HB0001', region: '', role: 'admin', active: true })
  const home = NAMES.map(() => ({ lat: CENTER.lat + (rnd() - 0.5) * 0.09, lng: CENTER.lng + (rnd() - 0.5) * 0.11 }))

  const outlets = Array.from({ length: 80 }, (_, i) => {
    const u = i % NAMES.length
    return { id: String(1237900 + i), name: `${pick(PLACES)} ${pick(KINDS)}`, u, lat: home[u].lat + (rnd() - 0.5) * 0.02, lng: home[u].lng + (rnd() - 0.5) * 0.02, ...GEO[u % 4] }
  })
  outlets.push({ id: '0012345', name: 'Lion Bar', u: 0, lat: CENTER.lat, lng: CENTER.lng, ...GEO[0] })

  const visits = []
  const flags = []
  for (let i = 0; i < 260; i++) {
    const o = pick(outlets)
    const u = users[o.u]
    const age = i < 22 ? 0 : Math.floor(rnd() * 30)
    const t0 = age === 0 ? dayStart() + (8 + rnd() * Math.max(0.5, (now - dayStart()) / 3.6e6 - 8.5)) * 3.6e6 : now - age * 864e5 - rnd() * 9 * 3.6e6
    const end = Math.min(t0, now - 120000)
    const crate = rnd() < 0.3
    const amount = crate ? 1 + Math.floor(rnd() * 12) : Math.round((200 + rnd() * 2800) / 50) * 50
    const id = `PAY-${new Date(end + 3 * 3.6e6).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')}-${i.toString(36).toUpperCase().padStart(4, 'X')}`
    const v = {
      id, status: i % 47 === 5 ? 'Void' : 'Saved', date: new Date(end).toISOString(), userId: u.id, userName: u.name, staffId: u.staffId,
      outletId: o.id, outletName: o.name, division: o.division, agent: o.agent, parentTerritory: o.parentTerritory, territory: o.territory,
      activity: pick(ACTIVITIES).label, investmentUnit: crate ? 'Crate' : 'Birr', amount,
      receiptPhotoId: 'PH-R' + i, receiptUrl: 'https://drive.google.com/file/d/demo-r' + i + '/view', receiptSource: rnd() < 0.7 ? 'camera' : 'gallery', receiptAt: new Date(end - 300000).toISOString(),
      engagementPhotoId: 'PH-E' + i, engagementUrl: 'https://drive.google.com/file/d/demo-e' + i + '/view', engagementAt: new Date(end - 60000).toISOString(),
      startedAt: new Date(end - (4 + rnd() * 22) * 60000).toISOString(), startLat: o.lat + 0.0002, startLng: o.lng - 0.0001, startAccuracy: 14,
      lat: o.lat + (rnd() - 0.5) * 0.0006, lng: o.lng + (rnd() - 0.5) * 0.0006, accuracy: 8 + Math.round(rnd() * 20), distanceM: Math.round(10 + rnd() * 70),
      device: 'Android demo', appVersion: '1.0.0', uploadedAt: new Date(end + 60000).toISOString(), voidReason: '', voidBy: '',
    }
    if (v.status === 'Void') Object.assign(v, { voidReason: 'Entered twice', voidBy: 'Demo Admin', voidAt: new Date(end + 3600000).toISOString() })
    if (i === 3) {
      v.distanceM = 340
      flags.push({ id: 'F-' + i, date: v.date, userId: u.id, userName: u.name, visitId: id, type: 'away-from-outlet', detail: `${o.name} (${o.id}) 340 m away`, status: 'open' })
    }
    if (i === 8) {
      v.amount = 26000
      v.investmentUnit = 'Birr'
      flags.push({ id: 'F-' + i, date: v.date, userId: u.id, userName: u.name, visitId: id, type: 'high-amount', detail: '26,000 Birr is above the 20,000 limit', status: 'open' })
    }
    visits.push(v)
  }
  flags.push({ id: 'F-dev', date: new Date(now - 50 * 60000).toISOString(), userId: 'S-06', userName: NAMES[5], visitId: '', type: 'devtools', detail: 'Debugger attached', status: 'open' })

  const presence = []
  const track = []
  NAMES.forEach((name, i) => {
    if (i === 7) return
    const online = i < 5
    const lastSeen = online ? now - rnd() * 4 * 60000 : now - (40 + i * 35) * 60000
    let p = { ...home[i] }
    for (let t = dayStart() + 8.5 * 3.6e6; t <= lastSeen; t += 3 * 60000) {
      p = { lat: p.lat + (rnd() - 0.5) * 0.0012, lng: p.lng + (rnd() - 0.5) * 0.0012 }
      track.push({ date: new Date(t).toISOString(), userId: users[i].id, userName: name, lat: p.lat, lng: p.lng, accuracy: 12, activity: 'Home' })
    }
    const mine = visits.find((v) => v.userId === users[i].id)
    presence.push({
      userId: users[i].id, userName: name, lastSeen: new Date(lastSeen).toISOString(), state: online ? 'online' : 'offline',
      activity: online ? (i % 2 ? `Recording visit at ${mine?.outletName} (${mine?.outletId}), step 3 of 5` : 'Home') : 'App closed or in background',
      lat: p.lat, lng: p.lng, accuracy: 12, locTime: new Date(lastSeen).toISOString(),
    })
  })

  const approved = [{ key: 'OUT-1', outletId: '0012345', outletName: 'Lion Bar', status: 'active', lat: CENTER.lat, lng: CENTER.lng, createdAt: new Date(now - 864e6).toISOString() }]
  const requests = [{ key: 'OUT-REQ1', outletId: '', outletName: 'Tsehay Lounge', status: 'pending', requestedBy: 'S-03', requestedByName: NAMES[2], lat: 9.0, lng: 38.8, createdAt: new Date(now - 3 * 3.6e6).toISOString() }]
  const notices = [{ id: 'NTF-1', date: new Date(now - 864e5).toISOString(), fromName: 'Demo Admin', target: 'sales', kind: 'notice', title: 'New engagement budget', body: 'Keep each Birr payment under 20,000 unless your manager agreed it first.' }]
  return { users, outlets, visits, flags, presence, track, outletsTab: [...approved, ...requests], notices, settings: { ...DEFAULT_SETTINGS }, photos: {} }
}
const D = () => (db = db || build())

// A placeholder photo for the demo, drawn on the spot
const photoCache = new Map()
function demoPhoto(id, w, h) {
  const key = id + w
  if (photoCache.has(key)) return photoCache.get(key)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  const receipt = id.includes('R')
  const grad = g.createLinearGradient(0, 0, w, h)
  grad.addColorStop(0, receipt ? '#f4efe3' : '#2a2117')
  grad.addColorStop(1, receipt ? '#e3d6b5' : '#0b0906')
  g.fillStyle = grad
  g.fillRect(0, 0, w, h)
  g.fillStyle = receipt ? '#8f6b1e' : '#c9a24a'
  g.font = `600 ${Math.round(w / 9)}px Calibri, sans-serif`
  g.textAlign = 'center'
  g.fillText(receipt ? 'RECEIPT' : 'ENGAGEMENT', w / 2, h / 2)
  if (receipt) {
    g.fillStyle = 'rgba(0,0,0,0.25)'
    for (let y = h * 0.6; y < h * 0.9; y += h / 18) g.fillRect(w * 0.15, y, w * 0.7 * (0.5 + ((y * 7) % 5) / 10), h / 60)
  }
  const data = c.toDataURL('image/jpeg', 0.7).split(',')[1]
  photoCache.set(key, data)
  return data
}

const roleOf = (u) => (/admin/i.test(u) ? 'admin' : /\basm\b/i.test(u) ? 'asm' : /manager|melake/i.test(u) ? 'manager' : 'sales')
let me = null
const between = (iso, from, to) => (!from || iso >= from) && (!to || iso < to)

function notesFor(role) {
  const d = D()
  const notes = d.notices.filter((n) => n.target === 'all' || n.target === role).map((n) => ({ ...n, from: n.fromName }))
  if (role !== 'sales') d.flags.filter((f) => f.status !== 'resolved').forEach((f) => notes.push({ id: 'flag:' + f.id, date: f.date, kind: 'flag', title: f.userName + ': ' + f.type.replace(/-/g, ' '), body: f.detail }))
  if (role === 'admin') d.outletsTab.filter((o) => o.status === 'pending').forEach((o) => notes.push({ id: 'req:' + o.key, date: o.createdAt, kind: 'request', title: 'New outlet request', body: o.outletName + ' from ' + o.requestedByName }))
  return notes.sort((a, b) => (a.date < b.date ? 1 : -1))
}

function exportFilter(f) {
  const d = D()
  return d.visits
    .filter((v) => between(v.date, f.from, f.to))
    .filter((v) => (me?.role === 'asm' ? v.agent === me.agent : me?.role === 'manager' ? v.division === 'North Addis' : !f.division || v.division === f.division))
    .filter((v) => !f.userId || v.userId === f.userId)
    .filter((v) => !f.activity || v.activity === f.activity)
    .filter((v) => !f.unit || v.investmentUnit === f.unit)
    .filter((v) => !f.status || v.status === f.status)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((v) => ({ ...v, alerts: d.flags.filter((x) => x.visitId === v.id).map((x) => x.type.replace(/-/g, ' ')).join(', ') }))
}

export async function demoCall(action, p) {
  await wait(action === 'uploadPhoto' ? 500 : 250)
  const d = D()
  switch (action) {
    case 'paymentLogin': {
      const role = roleOf(p.username)
      if (role === 'sales' && !p.location) throw new Error('Location is required to sign in.')
      const base = d.users.find((u) => u.role === role)
      me = { ...base, name: role === 'sales' ? p.username.trim() || base.name : base.name }
      return { user: { ...me, token: 'demo-' + role }, settings: d.settings }
    }
    case 'ping':
      return { notes: notesFor('sales'), packVersion: 'demo', settings: d.settings }
    case 'notifications':
      return { notes: notesFor(me?.role || 'sales') }
    case 'flag':
      return {}
    case 'outletPack': {
      if (p.version === 'demo|') return { same: true, version: 'demo|' }
      const dict = []
      const ref = (v) => {
        let i = dict.indexOf(v)
        if (i < 0) i = dict.push(v) - 1
        return i
      }
      return { version: 'demo|', division: '', dict, rows: d.outlets.map((o) => [o.id, o.name, ref(o.division), ref(o.agent), ref(o.parentTerritory), ref(o.territory)]) }
    }
    case 'lookupOutlet': {
      const o = d.outlets.find((x) => x.id === p.outletId)
      return o ? { found: true, outlet: { outletId: o.id, outletName: o.name, division: o.division, agent: o.agent, parentTerritory: o.parentTerritory, territory: o.territory } } : { found: false }
    }
    case 'requestOutlet':
      d.outletsTab.push({ key: 'OUT-' + Date.now(), outletId: p.outletId || '', outletName: p.outletName, lat: p.location?.lat ?? '', lng: p.location?.lng ?? '', status: 'pending', requestedBy: 'S-01', requestedByName: me?.name || 'You', createdAt: new Date().toISOString() })
      return {}
    case 'uploadPhoto': {
      if (!navigator.onLine) throw new Error('No connection. Could not reach the server.')
      const key = p.visitId + '_' + p.kind
      d.photos[key] = d.photos[key] || { id: 'PH-' + Math.random().toString(36).slice(2, 8), data: p.data, thumb: p.thumb }
      return { photoId: d.photos[key].id, url: 'https://drive.google.com/file/d/' + d.photos[key].id + '/view' }
    }
    case 'addVisit': {
      if (!navigator.onLine) throw new Error('No connection. Could not reach the server.')
      const v = p.visit
      if (d.visits.some((x) => x.id === v.id)) return { id: v.id, duplicate: true }
      const o = d.outlets.find((x) => x.id === v.outletId)
      if (!o) throw new Error(`Outlet ID ${v.outletId} is not in the outlet data.`)
      d.visits.push({
        id: v.id, status: 'Saved', date: v.finishedAt, userId: 'S-01', userName: v.userName, staffId: 'HB1040', outletId: o.id, outletName: o.name, division: o.division, agent: o.agent,
        parentTerritory: o.parentTerritory, territory: o.territory, activity: v.activity, investmentUnit: v.investmentUnit, amount: v.amount,
        receiptPhotoId: v.receipt.photoId, receiptUrl: v.receipt.url, receiptSource: v.receipt.source, receiptAt: v.receipt.at,
        engagementPhotoId: v.engagement.photoId, engagementUrl: v.engagement.url, engagementAt: v.engagement.at,
        startedAt: v.startedAt, startLat: v.startLat, startLng: v.startLng, startAccuracy: v.startAccuracy, lat: v.lat, lng: v.lng, accuracy: v.accuracy,
        distanceM: v.lat ? Math.round(Math.abs(v.lat - o.lat) * 111000) : '', device: v.device, appVersion: v.appVersion, uploadedAt: new Date().toISOString(),
      })
      return { id: v.id }
    }
    case 'myVisits':
      return { visits: [] }
    case 'managerData': {
      const scoped = me?.role === 'manager'
      const asm = me?.role === 'asm'
      const users = d.users.filter((u) => u.role === 'sales' && (asm ? u.agent === me.agent : !scoped || u.region === 'North Addis'))
      const ids = new Set(users.map((u) => u.id))
      const visits = d.visits.filter((v) => between(v.date, p.from, p.to) && (asm ? v.agent === me.agent : !scoped || v.division === 'North Addis'))
      if (p.lite) return { serverTime: new Date().toISOString(), visits }
      return {
        serverTime: new Date().toISOString(), division: scoped ? 'North Addis' : '', scopeLabel: asm ? 'ASM · ' + me.agent : scoped ? 'Manager · North Addis' : '', users, visits,
        presence: d.presence.filter((x) => ids.has(x.userId)), track: d.track.filter((x) => ids.has(x.userId) && x.date >= (p.trackFrom || '')),
        flags: d.flags.filter((x) => ids.has(x.userId)), notes: notesFor(me?.role || 'manager'),
      }
    }
    case 'visitDetail': {
      const v = d.visits.find((x) => x.id === p.id)
      if (!v) throw new Error('Visit not found.')
      const o = d.outlets.find((x) => x.id === v.outletId)
      return { visit: v, flags: d.flags.filter((f) => f.visitId === v.id), outlet: o ? { lat: o.lat, lng: o.lng } : null }
    }
    case 'getPhoto': {
      const real = (id) => Object.values(d.photos).find((x) => x.id === id)
      if (p.ids) return { photos: Object.fromEntries(p.ids.map((id) => [id, real(id)?.thumb || demoPhoto(id, 120, 160)])) }
      return { data: real(p.id)?.data || demoPhoto(p.id, 600, 800), mime: 'image/jpeg' }
    }
    case 'exportVisits': {
      const rows = exportFilter(p.filters || {})
      const size = 2000
      return { total: rows.length, pages: Math.max(1, Math.ceil(rows.length / size)), rows: rows.slice(p.page * size, (p.page + 1) * size) }
    }
    case 'adminData':
      return {
        serverTime: new Date().toISOString(), users: d.users.map((u) => ({ ...u, lastSeen: d.presence.find((x) => x.userId === u.id)?.lastSeen || '' })),
        outlets: d.outletsTab, flags: d.flags, notices: d.notices, settings: d.settings, divisions: ['North Addis', 'South Addis'], agents: GEO.map((g) => [g.division, g.agent]), notes: notesFor('admin'),
      }
    case 'saveUser': {
      const u = p.user
      const i = d.users.findIndex((x) => x.id === u.originalId)
      const row = { name: u.name, username: u.username, staffId: u.staffId, role: u.role, region: u.region, agent: u.agent, active: u.active !== false }
      if (i > -1) d.users[i] = { ...d.users[i], ...row }
      else d.users.push({ id: u.staffId || u.username, ...row })
      return {}
    }
    case 'saveOutlet': {
      const o = p.outlet
      const i = d.outletsTab.findIndex((x) => x.key === o.key)
      if (i > -1) d.outletsTab[i] = { ...d.outletsTab[i], ...o, updatedAt: new Date().toISOString() }
      else d.outletsTab.push({ ...o, key: 'OUT-' + Date.now(), createdAt: new Date().toISOString() })
      return {}
    }
    case 'importOutlets':
      p.rows.forEach((r) => d.outletsTab.push({ key: 'OUT-' + r[0], outletId: String(r[0]), outletName: r[1], lat: r[2], lng: r[3], status: 'active' }))
      return { added: p.rows.length, updated: 0, skipped: 0 }
    case 'resolveFlag':
      d.flags.forEach((f) => f.id === p.id && Object.assign(f, { status: 'resolved', resolvedBy: me?.name }))
      return {}
    case 'sendNotice':
      d.notices.push({ id: 'NTF-' + Date.now(), date: new Date().toISOString(), fromName: me?.name, target: p.target, kind: 'notice', title: p.title, body: p.body })
      return {}
    case 'voidVisit': {
      const v = d.visits.find((x) => x.id === p.id)
      Object.assign(v, { status: 'Void', voidReason: p.reason, voidBy: me?.name, voidAt: new Date().toISOString() })
      return {}
    }
    case 'saveSettings':
      Object.assign(d.settings, p.settings)
      return {}
  }
  throw new Error('Not available in the demo.')
}
