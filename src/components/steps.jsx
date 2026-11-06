import { useEffect, useRef, useState } from 'react'
import { requestOutlet } from '../api'
import { photoGet } from '../db'
import { latestFix } from '../location'
import { findOutlet, localOutlet, normOutletId } from '../outlets'
import { ACTIVITIES, STEP_COUNT } from '../config'
import { getSettings } from '../storage'
import { Button, Field, Notice, Sheet, Spinner, amountText, inputClass } from './ui'

function Title({ n, children, sub }) {
  return (
    <div className="mb-5 anim-rise">
      <p className="text-[11px] uppercase tracking-[0.16em] text-gold-dark font-semibold">
        Step {n} of {STEP_COUNT}
      </p>
      <h2 className="font-serif text-[26px] mt-1 leading-tight">{children}</h2>
      {sub && <p className="text-sm text-ink/60 mt-1">{sub}</p>}
    </div>
  )
}

/* ---------- validation ---------- */

// Birr: positive, up to two decimals. Crates: positive whole number.
export function amountValue(unit, raw) {
  const s = String(raw || '').replace(/,/g, '')
  if (!s) return null
  if (unit === 'Crate') return /^\d+$/.test(s) && Number(s) > 0 ? Number(s) : null
  return /^\d+(\.\d{1,2})?$/.test(s) && Number(s) > 0 ? Number(s) : null
}

export function isHigh(unit, amount) {
  const s = getSettings()
  return amount != null && (unit === 'Crate' ? amount > s.crateLimit : amount > s.birrLimit)
}

export const stepReady = [
  (d) => d.picked || (d.offline && normOutletId(d.outletId).length >= 4),
  (d) => !!d.activity,
  (d) => !!d.unit && amountValue(d.unit, d.amount) != null,
  (d) => !!d.receipt,
  // The engagement photo is optional
  () => true,
]

/* ---------- step 1: outlet ---------- */

const DETAIL_ROWS = [
  ['division', 'Division'],
  ['agent', 'Agent'],
  ['parentTerritory', 'Parent territory'],
  ['territory', 'Territory'],
]
const CLEAR = { picked: false, offline: false, outletName: '', division: '', agent: '', parentTerritory: '', territory: '' }

export function StepOutlet({ data, set }) {
  const [state, setState] = useState(data.picked ? 'found' : data.offline ? 'offline' : 'idle') // idle | looking | found | notfound | offline
  const [asking, setAsking] = useState(false)
  const seq = useRef(0)

  function fill(id, o) {
    set({ ...CLEAR, picked: true, outletId: id, outletName: o.outletName, division: o.division, agent: o.agent, parentTerritory: o.parentTerritory, territory: o.territory })
    setState('found')
  }

  async function look(raw) {
    const id = normOutletId(raw)
    const n = ++seq.current
    if (id.length < 4) {
      setState('idle')
      return
    }
    setState('looking')
    try {
      const r = await findOutlet(id)
      if (n !== seq.current) return
      if (r.found) fill(id, r.outlet)
      else setState('notfound')
    } catch {
      if (n !== seq.current) return
      set({ offline: true })
      setState('offline')
    }
  }

  // Looks the ID up on the server once the user stops typing
  useEffect(() => {
    if (data.picked) return
    const t = setTimeout(() => look(data.outletId), 450)
    return () => clearTimeout(t)
  }, [data.outletId])

  // Outlets stored on the phone fill in on the keystroke, with no waiting.
  // The value stays text, so leading zeros are kept.
  function type(e) {
    seq.current++
    const id = normOutletId(e.target.value)
    const o = id.length >= 4 ? localOutlet(id) : null
    if (o) return fill(id, o)
    set({ ...CLEAR, outletId: id })
    setState('idle')
  }

  if (data.picked) {
    return (
      <>
        <Title n={1}>Outlet</Title>
        <div className="anim-pop tilt spot spot-dark relative overflow-hidden rounded-3xl bg-ink text-paper p-5 shadow-[0_24px_44px_-24px_rgba(0,0,0,0.7)]" data-tilt="5">
          <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-14 w-44 h-44 rounded-full bg-gold/25 blur-2xl" />
          <div className="relative flex items-start gap-3">
            <span className="tilt-pop w-10 h-10 rounded-full gold-gradient text-ink flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path className="anim-draw" d="M5 12l5 5L20 7" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.16em] text-paper/50">Account name</p>
              <p className="font-serif text-xl leading-tight mt-0.5">{data.outletName || 'No name in the data'}</p>
              <p className="text-gold font-semibold tracking-[0.12em] mt-1 tabular">{data.outletId}</p>
            </div>
          </div>
          <div className="hairline my-4" />
          <dl className="relative grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {DETAIL_ROWS.map(([k, label]) => (
              <div key={k} className="contents">
                <dt className="text-paper/55">{label}</dt>
                <dd className="font-semibold min-w-0 break-words">{data[k] || '–'}</dd>
              </div>
            ))}
          </dl>
        </div>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => {
            set({ ...CLEAR, outletId: '' })
            setState('idle')
          }}
        >
          Change outlet
        </Button>
      </>
    )
  }

  return (
    <>
      <Title n={1} sub="Type the Outlet ID. The rest fills in from the outlet data.">
        Enter to the outlet
      </Title>
      <label className="block anim-rise">
        <span className="block text-sm font-semibold text-ink/80 mb-1.5">Outlet ID</span>
        <span className="relative block">
          <input
            className={`${inputClass} min-h-[60px] text-2xl tracking-[0.2em] font-semibold pr-12 tabular`}
            value={data.outletId}
            onChange={type}
            inputMode="numeric"
            pattern="[0-9A-Za-z]*"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            placeholder="1237916"
            autoFocus
          />
          {state === 'looking' && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gold-dark">
              <Spinner />
            </span>
          )}
        </span>
      </label>

      {state === 'notfound' && <Notice className="mt-3">Outlet ID {normOutletId(data.outletId)} is not in the outlet data. Check the number.</Notice>}
      {state === 'offline' && (
        <Notice tone="info" className="mt-3">
          No signal, so the outlet details can't be shown. You can carry on. They are filled in from the outlet data when the visit uploads.
        </Notice>
      )}

      <Button variant="quiet" className="mt-4" onClick={() => setAsking(true)}>
        Not on the list?
      </Button>
      {asking && <RequestOutlet initial={data.outletId} onClose={() => setAsking(false)} />}
    </>
  )
}

function RequestOutlet({ initial, onClose }) {
  const [form, setForm] = useState({ outletName: '', outletId: normOutletId(initial) })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const put = (k) => (e) => setForm({ ...form, [k]: k === 'outletId' ? normOutletId(e.target.value) : e.target.value })

  async function send() {
    setBusy(true)
    setError('')
    try {
      await requestOutlet({ ...form, location: latestFix() })
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      title="Request outlet"
      onClose={onClose}
      footer={
        done ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <Button variant="gold" onClick={send} disabled={busy || !form.outletName.trim()}>
            {busy ? <Spinner /> : 'Send to admin'}
          </Button>
        )
      }
    >
      {done ? (
        <div className="anim-rise text-center py-6">
          <p className="font-serif text-xl">Request sent</p>
          <p className="text-sm text-ink/60 mt-1">The reply comes to your bell.</p>
        </div>
      ) : (
        <>
          <Field label="Outlet name">
            <input className={inputClass} value={form.outletName} onChange={put('outletName')} autoComplete="off" />
          </Field>
          <Field label="Outlet ID">
            <input className={`${inputClass} tracking-wider`} value={form.outletId} onChange={put('outletId')} inputMode="numeric" autoComplete="off" />
          </Field>
          <p className="text-xs text-ink/50">Your location is sent with the request.</p>
          {error && <Notice>{error}</Notice>}
        </>
      )}
    </Sheet>
  )
}

/* ---------- step 2: activity ---------- */

const ACTIVITY_ICONS = {
  bar: (
    <>
      <path d="M7 3h10l-1.2 9.5a3.8 3.8 0 0 1-7.6 0z" />
      <path d="M12 16v5" />
      <path d="M8.5 21h7" />
      <path d="M7.4 7h9.2" />
    </>
  ),
  waitress: (
    <>
      <path d="M3 17h18" />
      <path d="M5 17a7 7 0 0 1 14 0" />
      <path d="M12 8V6" />
      <path d="M10.5 6h3" />
      <path d="M4 20h16" />
    </>
  ),
  consumer: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c.8-3.6 3-5.5 5.5-5.5s4.7 1.9 5.5 5.5" />
      <circle cx="17" cy="9.5" r="2.4" />
      <path d="M15.5 14.4c2.6-.3 4.4 1.3 5 4.6" />
    </>
  ),
  owner: (
    <>
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M9.5 20v-5.5h5V20" />
      <circle cx="12" cy="10.3" r="1.2" />
    </>
  ),
}

export function StepActivity({ data, set }) {
  return (
    <>
      <Title n={2} sub="Choose one">
        What activity did you do?
      </Title>
      <div className="grid grid-cols-2 gap-3 stagger">
        {ACTIVITIES.map((a, i) => {
          const on = data.activity === a.label
          return (
            <button
              key={a.key}
              type="button"
              style={{ '--i': i }}
              onClick={() => set({ activity: a.label })}
              aria-pressed={on}
              className={`tilt spot relative min-h-[150px] rounded-3xl border p-4 text-left flex flex-col justify-between active:scale-[0.97] ${
                on ? 'bg-ink text-paper border-ink spot-dark shadow-[0_20px_36px_-20px_rgba(0,0,0,0.7)]' : 'bg-white border-ink/12 hover:border-gold'
              }`}
              data-tilt="9"
            >
              <span className={`tilt-pop w-12 h-12 rounded-2xl flex items-center justify-center ${on ? 'gold-gradient text-ink' : 'bg-mist text-ink'}`}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {ACTIVITY_ICONS[a.key]}
                </svg>
              </span>
              <span className="block mt-3 font-semibold leading-snug text-[15px]">{a.label}</span>
              {on && (
                <span className="anim-pop absolute top-3 right-3 w-6 h-6 rounded-full gold-gradient text-ink flex items-center justify-center">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </span>
              )}
            </button>
          )
        })}
      </div>
    </>
  )
}

/* ---------- step 3: investment ---------- */

// "12345.5" -> "12,345.5" while typing, keeping a trailing dot
function groupBirr(raw) {
  const [int, dec] = raw.split('.')
  const g = int.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return dec != null ? `${g}.${dec}` : g
}

function cleanAmount(unit, text) {
  if (unit === 'Crate') return text.replace(/\D/g, '').replace(/^0+/, '').slice(0, 6)
  let s = text.replace(/[^\d.]/g, '')
  const dot = s.indexOf('.')
  if (dot > -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '').slice(0, 2)
  return s.slice(0, 12)
}

export function StepInvestment({ data, set }) {
  const amount = amountValue(data.unit, data.amount)
  const units = [
    { key: 'Birr', label: 'Birr', sub: 'Money paid' },
    { key: 'Crate', label: 'Crate', sub: 'Product given' },
  ]
  return (
    <>
      <Title n={3}>Investment in</Title>
      <div className="grid grid-cols-2 gap-3">
        {units.map((u) => {
          const on = data.unit === u.key
          return (
            <button
              key={u.key}
              type="button"
              aria-pressed={on}
              onClick={() => on || set({ unit: u.key, amount: '', highOk: false })}
              className={`pick spot min-h-[86px] rounded-2xl border px-4 text-left active:scale-[0.97] ${on ? 'bg-ink text-paper border-ink spot-dark' : 'bg-white border-ink/15'}`}
            >
              <span className="flex items-center justify-between">
                <span className="font-serif text-2xl">{u.label}</span>
                <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${on ? 'border-gold' : 'border-ink/20'}`}>
                  {on && <span className="anim-pop w-2.5 h-2.5 rounded-full bg-gold" />}
                </span>
              </span>
              <span className={`block text-xs mt-1 ${on ? 'text-paper/60' : 'text-ink/50'}`}>{u.sub}</span>
            </button>
          )
        })}
      </div>

      {data.unit && (
        <div key={data.unit} className="mt-6 anim-rise">
          <label className="block">
            <span className="block text-sm font-semibold text-ink/80 mb-1.5">{data.unit === 'Crate' ? 'Number of crates' : 'Amount in Birr'}</span>
            <span className="relative block">
              <input
                className={`${inputClass} min-h-[64px] text-3xl font-semibold tabular pr-20`}
                value={data.unit === 'Crate' ? data.amount : groupBirr(data.amount || '')}
                onChange={(e) => set({ amount: cleanAmount(data.unit, e.target.value), highOk: false })}
                inputMode={data.unit === 'Crate' ? 'numeric' : 'decimal'}
                autoComplete="off"
                placeholder="0"
                autoFocus
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gold-dark font-semibold">{data.unit === 'Crate' ? 'crates' : 'Birr'}</span>
            </span>
          </label>
          {amount != null && isHigh(data.unit, amount) && (
            <p className="anim-fade text-xs text-gold-dark mt-2">Above the usual amount. You'll be asked to confirm.</p>
          )}
        </div>
      )}
    </>
  )
}

/* ---------- photos ---------- */

// Reads a stored photo from the phone and shows it
export function useStoredPhoto(key, version) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let live = true
    let made = null
    if (!key || !version) {
      setUrl(null)
      return
    }
    photoGet(key).then((blob) => {
      if (!live || !blob) return
      made = URL.createObjectURL(blob)
      setUrl(made)
    })
    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [key, version])
  return url
}

function PhotoPicker({ onFile, camera = true, gallery = true, busy, label }) {
  const cam = useRef(null)
  const gal = useRef(null)
  const pick = (source) => (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) onFile(f, source)
  }
  return (
    <div className={`grid gap-3 ${camera && gallery ? 'grid-cols-2' : 'grid-cols-1'}`}>
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick('camera')} />
      <input ref={gal} type="file" accept="image/*" className="hidden" onChange={pick('gallery')} />
      {camera && (
        <button type="button" disabled={busy} onClick={() => cam.current.click()} className="tilt spot rounded-3xl bg-ink text-paper spot-dark min-h-[150px] flex flex-col items-center justify-center gap-3 active:scale-[0.97] disabled:opacity-60" data-tilt="6">
          <span className="tilt-pop w-14 h-14 rounded-2xl gold-gradient text-ink flex items-center justify-center">
            {busy ? (
              <Spinner />
            ) : (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.3l1.4-2h5.6l1.4 2h1.3A2.5 2.5 0 0 1 20 8.5v9A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5z" />
                <circle cx="12" cy="13" r="3.6" />
              </svg>
            )}
          </span>
          <span className="font-semibold">{busy ? 'Preparing photo...' : label || 'Take photo'}</span>
        </button>
      )}
      {gallery && (
        <button type="button" disabled={busy} onClick={() => gal.current.click()} className="tilt spot rounded-3xl bg-white border border-ink/12 min-h-[150px] flex flex-col items-center justify-center gap-3 active:scale-[0.97] disabled:opacity-60 hover:border-gold" data-tilt="6">
          <span className="tilt-pop w-14 h-14 rounded-2xl bg-mist text-ink flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
              <circle cx="9" cy="10" r="1.8" />
              <path d="m20.5 16-4.5-4.5L7 19.5" />
            </svg>
          </span>
          <span className="font-semibold">Choose from gallery</span>
        </button>
      )}
    </div>
  )
}

function Preview({ url, children, onOpen }) {
  return (
    <div className="anim-pop">
      <button type="button" onClick={onOpen} className="thumb-hover block w-full rounded-3xl bg-ink overflow-hidden shadow-[0_24px_44px_-26px_rgba(0,0,0,0.8)]">
        {url ? <img src={url} alt="" className="block w-full max-h-[52vh] object-contain" draggable="false" /> : <span className="block h-64 skeleton" />}
      </button>
      <div className="flex gap-3 mt-3">{children}</div>
    </div>
  )
}

// A small button that opens the camera or the gallery
function PickButton({ onFile, camera, busy, children, variant = 'ghost' }) {
  const ref = useRef(null)
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        {...(camera ? { capture: 'environment' } : {})}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onFile(f)
        }}
      />
      <Button variant={variant} disabled={busy} onClick={() => ref.current.click()}>
        {busy ? <Spinner /> : children}
      </Button>
    </>
  )
}

export function StepReceipt({ data, onPhoto, removePhoto, busy, photoKey, openViewer }) {
  const url = useStoredPhoto(photoKey('receipt'), data.receipt?.v)
  return (
    <>
      <Title n={4} sub="A clear photo of the paper receipt">
        Attach the payment receipt
      </Title>
      {data.receipt ? (
        <Preview url={url} onOpen={() => url && openViewer(url)}>
          <PickButton camera busy={busy} onFile={(f) => onPhoto('receipt', f, 'camera')}>
            Retake
          </PickButton>
          <PickButton busy={busy} onFile={(f) => onPhoto('receipt', f, 'gallery')}>
            Gallery
          </PickButton>
          <Button variant="ghost" onClick={() => removePhoto('receipt')} disabled={busy}>
            Remove
          </Button>
        </Preview>
      ) : (
        <PhotoPicker onFile={(f, source) => onPhoto('receipt', f, source)} busy={busy} />
      )}
      {data.receipt && (
        <p className="text-xs text-ink/50 mt-3">
          {data.receipt.source === 'gallery' ? 'From gallery' : 'Taken with camera'} · {data.receipt.sizeKb} KB
        </p>
      )}
    </>
  )
}

export function StepEngagement({ data, onPhoto, removePhoto, busy, photoKey, openViewer, goTo, finish, finishing, error }) {
  const url = useStoredPhoto(photoKey('engagement'), data.engagement?.v)
  const receiptUrl = useStoredPhoto(photoKey('receipt'), data.receipt?.v)
  const amount = amountValue(data.unit, data.amount)
  return (
    <>
      <Title n={5} sub="Optional. Camera only. The date, time, Outlet ID and your name are stamped on it.">
        Take a photo of the engagement
      </Title>
      {data.engagement ? (
        <Preview url={url} onOpen={() => url && openViewer(url)}>
          <PickButton camera busy={busy} onFile={(f) => onPhoto('engagement', f, 'camera')}>
            Retake
          </PickButton>
          <Button variant="ghost" onClick={() => removePhoto('engagement')} disabled={busy}>
            Remove
          </Button>
        </Preview>
      ) : (
        <PhotoPicker onFile={(f) => onPhoto('engagement', f, 'camera')} gallery={false} busy={busy} />
      )}

      {/* Summary of the visit, each line with a way back to its step */}
      <section className="mt-7 rounded-3xl bg-white border border-ink/10 overflow-hidden anim-rise">
        <h3 className="px-5 pt-4 pb-2 font-serif text-xl">Summary</h3>
        <SummaryRow label="Outlet" onEdit={() => goTo(0)}>
          {data.outletName || 'Outlet'} <span className="text-ink/45 font-normal tabular">{data.outletId}</span>
        </SummaryRow>
        <SummaryRow label="Activity" onEdit={() => goTo(1)}>
          {data.activity}
        </SummaryRow>
        <SummaryRow label="Investment" onEdit={() => goTo(2)}>
          <span className="text-gold-dark">{amountText(data.unit, amount)}</span>
        </SummaryRow>
        <div className="grid grid-cols-2 gap-3 px-5 py-4 border-t border-ink/[0.07]">
          <Thumb label="Receipt" url={receiptUrl} onEdit={() => goTo(3)} />
          <Thumb label="Engagement" url={url} empty={!data.engagement} onEdit={() => goTo(4)} />
        </div>
      </section>

      {error && <Notice className="mt-4">{error}</Notice>}
      <Button variant="gold" className="mt-4 min-h-[60px] text-lg" disabled={finishing || busy} onClick={finish}>
        {finishing ? <Spinner /> : 'Finish'}
      </Button>
    </>
  )
}

function SummaryRow({ label, children, onEdit }) {
  return (
    <div className="row-hover px-5 py-3 border-t border-ink/[0.07] flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs uppercase tracking-wider text-ink/45">{label}</span>
      <span className="flex-1 min-w-0 font-semibold truncate">{children}</span>
      <button type="button" onClick={onEdit} className="link-hover text-sm font-semibold text-gold-dark shrink-0">
        Edit
      </button>
    </div>
  )
}

function Thumb({ label, url, empty, onEdit }) {
  return (
    <div>
      <div className="thumb-hover aspect-[4/3] rounded-2xl bg-mist overflow-hidden">
        {url ? (
          <img src={url} alt={label} className="w-full h-full object-cover" />
        ) : empty ? (
          <span className="flex w-full h-full items-center justify-center text-xs text-ink/45">No photo</span>
        ) : (
          <span className="block w-full h-full skeleton" />
        )}
      </div>
      <div className="flex items-center justify-between mt-1.5 text-xs">
        <span className="text-ink/55">{label}</span>
        <button type="button" onClick={onEdit} className="link-hover font-semibold text-gold-dark">
          {empty ? 'Add' : 'Edit'}
        </button>
      </div>
    </div>
  )
}
