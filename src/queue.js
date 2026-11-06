import { addVisit, uploadPhoto } from './api'
import { photoDel, photoGet } from './db'
import { blobToBase64 } from './photo'
import { getQueue, setQueueWhy, updateLog, updateQueue } from './storage'

// Finish never waits on the network: the visit and its photos go into the
// phone's queue and this uploads them in the background. Order per visit:
// receipt photo, engagement photo (when one was taken), then the visit row. Each step is safe to
// send twice, so a lost reply never makes a duplicate.
const subs = new Set()
let state = { busy: false, pending: 0, why: '' }
const emit = () => subs.forEach((fn) => fn(state))

export function onQueue(fn) {
  subs.add(fn)
  fn(state)
  return () => subs.delete(fn)
}

export async function refreshQueueCount() {
  const q = await getQueue()
  state = { ...state, pending: q.length }
  emit()
  return q.length
}

export const KINDS = ['receipt', 'engagement']
// More receipt photos for a transfer activity: receipt2 ... receipt10
export const MORE_KINDS = Array.from({ length: 9 }, (_, i) => `receipt${i + 2}`)
export const ALL_KINDS = [...KINDS, ...MORE_KINDS]
export const photoKey = (visitId, kind) => `${visitId}_${kind}`

// Every photo of a visit, in upload order
const photosOf = (v) => [
  ...(v.receipt ? [['receipt', v.receipt]] : []),
  ...(v.more || []).map((p) => [p.kind, p]),
  ...(v.engagement ? [['engagement', v.engagement]] : []),
]

function withPhotoId(x, kind, r) {
  if (kind === 'receipt' || kind === 'engagement') return { ...x, [kind]: { ...x[kind], photoId: r.photoId, url: r.url } }
  return { ...x, more: (x.more || []).map((p) => (p.kind === kind ? { ...p, photoId: r.photoId, url: r.url } : p)) }
}

async function sendPhoto(v, kind, p) {
  const blob = await photoGet(photoKey(v.id, kind))
  if (!blob) throw new Error(`A ${kind === 'engagement' ? 'engagement' : 'receipt'} photo for ${v.outletId} is missing on this phone. Discard and record the visit again.`)
  const thumb = await photoGet(photoKey(v.id, kind) + '_t')
  const [data, thumbData] = await Promise.all([blobToBase64(blob), thumb ? blobToBase64(thumb) : ''])
  const r = await uploadPhoto({ token: v.token, visitId: v.id, kind, data, thumb: thumbData, hash: p.hash, source: p.source, takenAt: p.at, lat: p.lat, lng: p.lng, sizeKb: p.sizeKb })
  await updateQueue((q) => q.map((x) => (x.id === v.id ? withPhotoId(x, kind, r) : x)))
  return r
}

async function sendOne(v) {
  for (const [kind, p] of photosOf(v)) {
    if (p.photoId) continue
    const r = await sendPhoto(v, kind, p)
    p.photoId = r.photoId
    p.url = r.url
  }
  const { receipt, engagement, more, ...rest } = v
  await addVisit({ ...rest, receipt: { ...receipt }, more: (more || []).map((p) => ({ ...p })), engagement: engagement ? { ...engagement } : null })
  // Photos leave the phone only once the server has the visit row
  await updateQueue((q) => q.filter((x) => x.id !== v.id))
  await Promise.all(ALL_KINDS.flatMap((k) => [photoDel(photoKey(v.id, k)), photoDel(photoKey(v.id, k) + '_t')])).catch(() => {})
  await updateLog(v.userId, (list) => list.map((x) => (x.id === v.id ? { ...x, uploaded: true } : x)))
}

let flushing = null
export function flushQueue() {
  if (flushing) return flushing
  flushing = (async () => {
    let sent = 0
    let why = ''
    const tried = new Set()
    state = { ...state, busy: true }
    emit()
    // Keep going while new visits land in the queue during the upload
    for (;;) {
      const q = await getQueue()
      state = { ...state, pending: q.length }
      emit()
      const next = q.find((v) => !tried.has(v.id))
      if (!next) break
      tried.add(next.id)
      try {
        await sendOne(next)
        sent++
      } catch (err) {
        why = err.message
        // No connection: the rest will fail the same way, so stop here
        if (/no connection|too long/i.test(why)) break
      }
    }
    setQueueWhy(why)
    const left = (await getQueue()).length
    state = { busy: false, pending: left, why }
    emit()
    return { sent, left, why }
  })().finally(() => {
    flushing = null
  })
  return flushing
}

// Retry when the phone comes back online
if (typeof window !== 'undefined') window.addEventListener('online', () => flushQueue())
