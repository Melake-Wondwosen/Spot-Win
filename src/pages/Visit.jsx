import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { deviceLabel } from '../api'
import { photoDel, photoGet, photoPut } from '../db'
import { getFix, latestFix, locationError, locationMessage } from '../location'
import { processPhoto } from '../photo'
import { setActivity } from '../presence'
import { ALL_KINDS, flushQueue, MORE_KINDS, photoKey as keyFor } from '../queue'
import { clearDraft, countDone, getDraft, getUser, setDraft, updateLog, updateQueue } from '../storage'
import { APP_VERSION, isTransfer, MAX_TRANSFER_PHOTOS, RETURN_HOME_MS, STEP_COUNT } from '../config'
import { dateYear, time, visitId } from '../time'
import { Button, Sheet, Spinner, amountText } from '../components/ui'
import Zoom from '../components/Zoom'
import { StepActivity, StepEngagement, StepInvestment, StepOutlet, StepReceipt, amountValue, isHigh, stepReady } from '../components/steps'

const EMPTY = {
  outletId: '', outletName: '', division: '', agent: '', parentTerritory: '', territory: '', picked: false, offline: false,
  activity: '', unit: '', amount: '', highOk: false, receipt: null, engagement: null,
  // transfer activities: the photos after the first one
  more: [],
}
const fixOf = (f) => (f ? { lat: f.lat, lng: f.lng, accuracy: f.accuracy } : null)

// A fix for the moment a photo is taken: the running one if it's fresh, or a quick new one
async function quickFix(maxWait = 3000) {
  const f = latestFix()
  if (f && Date.now() - f.at < 60000) return f
  return (await Promise.race([getFix().catch(() => null), new Promise((r) => setTimeout(() => r(null), maxWait))])) || f
}

export default function Visit() {
  const navigate = useNavigate()
  const user = getUser()
  const [loaded, setLoaded] = useState(false)
  const [id, setId] = useState('')
  const [step, setStep] = useState(0)
  const [maxStep, setMaxStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [data, setData] = useState(EMPTY)
  const [status, setStatus] = useState('idle') // idle | finishing | saved | queued
  const [error, setError] = useState('')
  const [busyPhoto, setBusyPhoto] = useState('')
  const [viewer, setViewer] = useState(null)
  const [confirmHigh, setConfirmHigh] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const start = useRef(null)
  const finished = useRef(false)
  const scroller = useRef(null)

  // Pick up a visit left part-way, or start one. The start time and location
  // are taken the moment this screen opens; a resumed visit keeps its first start.
  useEffect(() => {
    let live = true
    getDraft().then((d) => {
      if (!live) return
      if (d) {
        setId(d.id)
        setStep(d.step ?? 0)
        setMaxStep(d.maxStep ?? d.step ?? 0)
        setData({ ...EMPTY, ...d.data })
        start.current = d.start
      } else {
        setId(visitId())
        start.current = { at: new Date().toISOString(), fix: fixOf(latestFix()) }
      }
      setLoaded(true)
      if (!start.current.fix) {
        getFix()
          .then((f) => {
            if (!start.current.fix) start.current.fix = fixOf(f)
          })
          .catch(() => {})
      }
    })
    return () => {
      live = false
    }
  }, [])

  const set = (patch) => setData((d) => ({ ...d, ...patch }))
  const photoKey = (kind) => keyFor(id, kind)
  const touched = step > 0 || data.outletId !== ''

  // Saved on the phone after every answer, so a reload or a dead battery loses nothing
  useEffect(() => {
    if (!loaded || finished.current || !touched) return
    setDraft({ userId: user.id, id, data, step, maxStep, start: start.current, savedAt: Date.now() })
  }, [data, step, maxStep, loaded])

  useEffect(() => {
    if (!loaded) return
    scroller.current?.scrollTo(0, 0)
    const where = data.outletId ? `${data.outletName || 'outlet'} (${data.outletId})` : 'outlet'
    setActivity(step === 0 && !data.picked ? 'Entering an outlet' : `Recording visit at ${where}, step ${step + 1} of ${STEP_COUNT}`, step === 1)
  }, [step, loaded])

  function go(to) {
    setDir(to > step ? 1 : -1)
    setStep(to)
    setMaxStep((m) => Math.max(m, to))
    setError('')
  }
  const canJump = (i) => i !== step && i <= maxStep && [0, 1, 2, 3, 4].slice(0, i).every((j) => stepReady[j](data))

  function next() {
    if (step === 2) {
      const amount = amountValue(data.unit, data.amount)
      if (isHigh(data.unit, amount) && !data.highOk) {
        setConfirmHigh(true)
        return
      }
    }
    go(step + 1)
  }

  // Shrinks, hashes and (for the engagement photo) stamps the photo, then keeps it on the phone.
  // kind 'more' adds one more transfer photo (receipt2, receipt3, ...).
  async function onPhoto(kind, file, source) {
    let key = kind
    if (kind === 'more') {
      const used = new Set((data.more || []).map((p) => p.kind))
      key = MORE_KINDS.find((k) => !used.has(k))
      if (!key) return setError(`Up to ${MAX_TRANSFER_PHOTOS} photos for one visit.`)
    }
    setBusyPhoto(kind)
    setError('')
    try {
      const at = new Date().toISOString()
      const fixP = quickFix()
      const stamp = kind === 'engagement' ? [`${dateYear(at)} ${time(at)}`, `Outlet ${data.outletId}`, user.name] : null
      const p = await processPhoto(file, stamp)
      const others = kind === 'engagement' ? [] : [kind === 'receipt' ? null : data.receipt, ...(data.more || [])]
      if (others.some((o) => o?.hash === p.hash)) throw Object.assign(new Error('That photo is already added.'), { photo: true })
      await Promise.all([photoPut(photoKey(key), p.blob), photoPut(photoKey(key) + '_t', p.thumb)])
      const fix = await fixP
      const meta = { hash: p.hash, source, at, lat: fix?.lat ?? '', lng: fix?.lng ?? '', accuracy: fix?.accuracy ?? '', sizeKb: p.sizeKb, v: Date.now() }
      if (kind === 'more') setData((d) => ({ ...d, more: [...(d.more || []), { kind: key, ...meta }] }))
      else set({ [kind]: meta })
    } catch (err) {
      setError(err?.photo ? err.message : `Could not use that photo. ${err?.message || ''}`.trim())
    } finally {
      setBusyPhoto('')
    }
  }

  const dropStored = (k) => Promise.all([photoDel(photoKey(k)), photoDel(photoKey(k) + '_t')]).catch(() => {})

  async function removePhoto(kind) {
    await dropStored(kind)
    if (MORE_KINDS.includes(kind)) {
      setData((d) => ({ ...d, more: (d.more || []).filter((p) => p.kind !== kind) }))
      return
    }
    // The first transfer photo goes: the next one takes its place
    const next = kind === 'receipt' && isTransfer(data.activity) ? data.more?.[0] : null
    if (next) {
      const [blob, thumb] = await Promise.all([photoGet(photoKey(next.kind)), photoGet(photoKey(next.kind) + '_t')])
      if (blob) await photoPut(photoKey('receipt'), blob)
      if (thumb) await photoPut(photoKey('receipt') + '_t', thumb)
      await dropStored(next.kind)
      const { kind: _old, ...meta } = next
      setData((d) => ({ ...d, receipt: { ...meta, v: Date.now() }, more: (d.more || []).filter((p) => p.kind !== next.kind) }))
      return
    }
    set({ [kind]: null })
  }

  async function discard() {
    finished.current = true
    await Promise.all(ALL_KINDS.map(dropStored))
    await clearDraft()
    navigate('/', { replace: true })
  }

  // Finish never waits on the network: the visit goes into the phone's queue
  async function finish() {
    setStatus('finishing')
    setError('')
    if (locationError()?.code === 1) {
      setError(locationMessage(locationError()))
      setStatus('idle')
      return
    }
    let fix = latestFix()
    if (!fix || Date.now() - fix.at > 60000) {
      fix = (await Promise.race([getFix().catch(() => null), new Promise((r) => setTimeout(() => r(null), 4000))])) || latestFix()
    }
    if (!fix && locationError()?.code === 1) {
      setError(locationMessage(locationError()))
      setStatus('idle')
      return
    }
    const now = new Date().toISOString()
    const amount = amountValue(data.unit, data.amount)
    const s = start.current
    const transfer = isTransfer(data.activity)
    const record = {
      id,
      token: user.token,
      userId: user.id,
      userName: user.name,
      startedAt: s.at,
      startLat: s.fix?.lat ?? '',
      startLng: s.fix?.lng ?? '',
      startAccuracy: s.fix?.accuracy ?? '',
      outletId: data.outletId,
      outletName: data.outletName,
      activity: data.activity,
      investmentUnit: data.unit,
      amount,
      highConfirmed: !!data.highOk,
      receipt: { ...data.receipt },
      // A transfer activity sends all its transfer photos and no engagement photo
      more: transfer ? (data.more || []).map((p) => ({ ...p })) : [],
      engagement: !transfer && data.engagement ? { ...data.engagement } : null,
      finishedAt: now,
      lat: fix?.lat ?? '',
      lng: fix?.lng ?? '',
      accuracy: fix?.accuracy ?? '',
      device: deviceLabel(),
      appVersion: APP_VERSION,
    }
    finished.current = true
    await updateQueue((q) => (q.some((v) => v.id === id) ? q : [...q, record]))
    await updateLog(user.id, (list) => [
      ...list.filter((v) => v.id !== id),
      { id, finishedAt: now, outletId: data.outletId, outletName: data.outletName, activity: data.activity, investmentUnit: data.unit, amount, uploaded: false },
    ])
    await clearDraft()
    // Photos that don't go with this activity
    await Promise.all((transfer ? ['engagement'] : (data.more || []).map((p) => p.kind)).map(dropStored))
    countDone(user.id)
    setActivity(`Finished visit at ${data.outletName || 'outlet'} (${data.outletId})`, true)
    setStatus(navigator.onLine ? 'saved' : 'queued')
    flushQueue()
    setTimeout(() => navigate('/', { replace: true }), RETURN_HOME_MS)
  }

  if (status === 'saved' || status === 'queued') {
    const saved = status === 'saved'
    return (
      <main className="min-h-full flex flex-col items-center justify-center px-8 text-center safe-top safe-bottom bg-ink text-paper">
        <div className="anim-pop w-24 h-24 rounded-full flex items-center justify-center gold-gradient text-ink shadow-[0_0_60px_rgba(201,162,74,0.5)]">
          {saved ? (
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path className="anim-draw" d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          ) : (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12" />
              <path className="anim-draw" d="M7 10l5 5 5-5" />
              <path d="M5 20h14" />
            </svg>
          )}
        </div>
        <h2 className="anim-rise font-serif text-2xl mt-6" style={{ animationDelay: '120ms' }}>
          {saved ? 'Visit saved' : 'Saved on the phone'}
        </h2>
        <p className="anim-rise text-paper/60 mt-2" style={{ animationDelay: '200ms' }}>
          {saved ? `${data.outletName || data.outletId} · ${amountText(data.unit, amountValue(data.unit, data.amount))}` : 'Uploads when there is signal'}
        </p>
      </main>
    )
  }

  if (!loaded) {
    return (
      <main className="h-full flex items-center justify-center text-gold">
        <Spinner />
      </main>
    )
  }

  const ready = stepReady[step](data)
  const steps = [
    <StepOutlet key="o" data={data} set={set} />,
    <StepActivity key="a" data={data} set={set} />,
    <StepInvestment key="i" data={data} set={set} />,
    <StepReceipt
      key="r"
      data={data}
      onPhoto={onPhoto}
      removePhoto={removePhoto}
      busy={busyPhoto === 'receipt' || busyPhoto === 'more'}
      photoKey={photoKey}
      openViewer={(src, caption) => setViewer({ src, caption: caption || 'Payment receipt' })}
    />,
    <StepEngagement
      key="e"
      data={data}
      onPhoto={onPhoto}
      removePhoto={removePhoto}
      busy={busyPhoto === 'engagement'}
      photoKey={photoKey}
      openViewer={(src) => setViewer({ src, caption: 'Engagement photo' })}
      goTo={go}
      finish={finish}
      finishing={status === 'finishing'}
      error={error}
    />,
  ]
  const last = step === STEP_COUNT - 1

  return (
    <main className="h-full flex flex-col anim-fade bg-[#fbfaf7]">
      <header className="bg-ink text-paper px-4 pt-3 pb-4 safe-top">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-[0.18em] text-gold font-semibold">Spot Win · Visit</p>
            <button type="button" onClick={() => (touched ? setLeaving(true) : navigate('/', { replace: true }))} className="w-10 h-10 -mr-2 rounded-full text-2xl text-paper/80 hover:bg-paper/10 hover:rotate-90 transition-transform duration-300" aria-label="Leave visit">
              ×
            </button>
          </div>
          <p className="text-xs text-paper/55 -mt-1 mb-2.5 tabular">
            Started {time(start.current.at)}
            <span className="text-paper/30"> · </span>
            {start.current.fix ? <span className="text-gold">Location ±{start.current.fix.accuracy} m</span> : 'Getting location...'}
          </p>
          <div className="grid grid-cols-5 gap-1.5">
            {steps.map((_, i) => (
              <button key={i} type="button" onClick={() => canJump(i) && go(i)} disabled={!canJump(i) || status === 'finishing'} aria-label={`Go to step ${i + 1}`} className="group py-2 -my-2 disabled:cursor-default">
                <span className="block h-1.5 rounded-full bg-paper/20 overflow-hidden group-enabled:group-hover:bg-paper/35 transition-colors">
                  <span
                    className={`block h-full rounded-full transition-[width] duration-500 ease-[cubic-bezier(.22,1,.36,1)] ${i <= step ? 'gold-gradient' : i <= maxStep ? 'bg-gold/40' : ''}`}
                    style={{ width: i <= maxStep ? '100%' : '0%' }}
                  />
                </span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <div ref={scroller} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-md mx-auto px-5 py-6">
          <div key={step} className={dir > 0 ? 'anim-slide-r' : 'anim-slide-l'}>
            {steps[step]}
          </div>
          {!last && error && <p className="mt-4 rounded-xl bg-paper border border-ink/15 border-l-4 border-l-gold text-ink text-sm px-4 py-3">{error}</p>}
          {last && step > 0 && (
            <Button variant="quiet" className="mt-2" onClick={() => go(step - 1)} disabled={status === 'finishing'}>
              Back
            </Button>
          )}
        </div>
      </div>

      {!last && (
        <footer className="border-t border-ink/10 bg-paper px-5 pt-3 safe-bottom">
          <div className="max-w-md mx-auto flex gap-3">
            {step > 0 && (
              <Button variant="ghost" className="w-auto! flex-[0_0_32%]" onClick={() => go(step - 1)}>
                Back
              </Button>
            )}
            <Button onClick={next} disabled={!ready || !!busyPhoto}>
              Continue
            </Button>
          </div>
        </footer>
      )}

      {confirmHigh && (
        <Sheet
          title="Are you sure?"
          onClose={() => setConfirmHigh(false)}
          footer={
            <div className="grid grid-cols-2 gap-3">
              <Button variant="ghost" onClick={() => setConfirmHigh(false)}>
                Change it
              </Button>
              <Button
                variant="gold"
                onClick={() => {
                  set({ highOk: true })
                  setConfirmHigh(false)
                  go(3)
                }}
              >
                Yes, it's right
              </Button>
            </div>
          }
        >
          <p className="text-ink/75">
            This is above the usual amount: <b className="text-ink">{amountText(data.unit, amountValue(data.unit, data.amount))}</b>. Your manager will see it flagged.
          </p>
        </Sheet>
      )}

      {leaving && (
        <Sheet
          title="Leave this visit?"
          onClose={() => setLeaving(false)}
          footer={
            discarding ? (
              <div className="grid grid-cols-2 gap-3">
                <Button variant="ghost" onClick={() => setDiscarding(false)}>
                  Keep it
                </Button>
                <Button onClick={discard}>Yes, discard</Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Button variant="gold" onClick={() => navigate('/', { replace: true })}>
                  Save and continue later
                </Button>
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="ghost" onClick={() => setLeaving(false)}>
                    Stay
                  </Button>
                  <Button onClick={() => setDiscarding(true)}>Discard</Button>
                </div>
              </div>
            )
          }
        >
          <p className="text-sm text-ink/70">{discarding ? 'The visit and its photos will be deleted from this phone.' : 'Everything so far is saved on the phone. You can carry on from the home screen.'}</p>
        </Sheet>
      )}

      {viewer && <Zoom src={viewer.src} caption={viewer.caption} onClose={() => setViewer(null)} />}
    </main>
  )
}
