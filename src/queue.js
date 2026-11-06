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
export const photoKey = (visitId, kind) => `${visitId}_${kind}`

async function sendPhoto(v, kind) {
  const p = v[kind]
  const blob = await photoGet(photoKey(v.id, kind))
  if (!blob) throw new Error(`The ${kind} photo for ${v.outletId} is missing on this phone. Discard and record the visit again.`)
  const thumb = await photoGet(photoKey(v.id, kind) + '_t')
  const [data, thumbData] = await Promise.all([blobToBase64(blob), thumb ? blobToBase64(thumb) : ''])
  const r = await uploadPhoto({ token: v.token, visitId: v.id, kind, data, thumb: thumbData, hash: p.hash, source: p.source, takenAt: p.at, lat: p.lat, lng: p.lng, sizeKb: p.sizeKb })
  await updateQueue((q) => q.map((x) => (x.id === v.id ? { ...x, [kind]: { ...x[kind], photoId: r.photoId, url: r.url } } : x)))
  return r.photoId
}

async function sendOne(v) {
  for (const kind of KINDS) if (v[kind] && !v[kind].photoId) v[kind].photoId = await sendPhoto(v, kind)
  const { receipt, engagement, ...rest } = v
  await addVisit({ ...rest, receipt: { ...receipt }, engagement: engagement ? { ...engagement } : null })
  // Photos leave the phone only once the server has the visit row
  await updateQueue((q) => q.filter((x) => x.id !== v.id))
  await Promise.all(KINDS.flatMap((k) => [photoDel(photoKey(v.id, k)), photoDel(photoKey(v.id, k) + '_t')])).catch(() => {})
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
