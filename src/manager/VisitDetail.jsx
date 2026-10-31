import { useEffect, useState } from 'react'
import { visitDetail, voidVisit } from '../api'
import { Button, Field, Notice, Sheet, Spinner, amountText, inputClass } from '../components/ui'
import Zoom from '../components/Zoom'
import { dateTime, dateYear, time } from '../time'
import { flagLabel, num, text } from './calc'
import { useFullPhoto } from './photos'
import { VisitMap } from './MapView'

// Every recorded field of one visit, both photos full size, start and finish
// on a small map, the distance from the outlet and any alerts.
export default function VisitDetail({ id, onClose, canVoid, onChanged }) {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(null)
  const [voiding, setVoiding] = useState(false)

  const load = () =>
    visitDetail(id)
      .then(setD)
      .catch((err) => setError(err.message))
  useEffect(() => {
    load()
  }, [id])

  const v = d?.visit
  const isVoid = text(v?.status).toLowerCase() === 'void'
  const mins = v ? (new Date(v.date) - new Date(v.startedAt)) / 60000 : null

  return (
    <Sheet title={v ? text(v.outletName) || 'Visit' : 'Visit'} onClose={onClose} footer={canVoid && v && !isVoid ? <Button onClick={() => setVoiding(true)}>Void this visit</Button> : null}>
      {error && <Notice>{error}</Notice>}
      {!v && !error && (
        <div className="py-16 text-center text-gold">
          <Spinner />
        </div>
      )}
      {v && (
        <div className="space-y-4 anim-fade">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gold-dark tracking-wider tabular">{text(v.outletId)}</span>
            <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${isVoid ? 'bg-ink/10 text-ink/55' : 'gold-gradient text-ink'}`}>{isVoid ? 'Void' : 'Saved'}</span>
            <span className="text-xs text-ink/45 ml-auto tabular">{text(v.id)}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Photo id={text(v.receiptPhotoId)} label={`Receipt · ${text(v.receiptSource) === 'gallery' ? 'gallery' : 'camera'}`} onZoom={setZoom} />
            <Photo id={text(v.engagementPhotoId)} label="Engagement" onZoom={setZoom} />
          </div>

          {d.flags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {d.flags.map((f) => (
                <span key={f.id} title={text(f.detail)} className="text-[11px] font-semibold rounded-full bg-ink text-gold px-2.5 py-1">
                  {flagLabel(text(f.type))}
                  {text(f.status) === 'resolved' ? ' · resolved' : ''}
                </span>
              ))}
            </div>
          )}

          <dl className="rounded-2xl bg-white border border-ink/10 divide-y divide-ink/[0.07] text-sm">
            {[
              ['Investment', <b className="text-gold-dark">{amountText(text(v.investmentUnit), v.amount)}</b>],
              ['Activity', text(v.activity)],
              ['User', `${text(v.userName)}${text(v.staffId) ? ` · ${text(v.staffId)}` : ''}`],
              ['Date', dateYear(v.date)],
              ['Start', `${time(v.startedAt)}${num(v.startAccuracy) != null ? ` · ±${num(v.startAccuracy)} m` : ''}`],
              ['Finish', `${time(v.date)}${num(v.accuracy) != null ? ` · ±${num(v.accuracy)} m` : ''}`],
              ['At outlet', mins != null && !isNaN(mins) ? `${Math.round(mins * 10) / 10} min` : '–'],
              ['Distance', num(v.distanceM) != null ? `${num(v.distanceM).toLocaleString()} m from outlet` : 'Outlet has no coordinates'],
              ['Division', text(v.division)],
              ['Agent', text(v.agent)],
              ['Parent territory', text(v.parentTerritory)],
              ['Territory', text(v.territory)],
              ['Receipt taken', dateTime(v.receiptAt)],
              ['Photo taken', dateTime(v.engagementAt)],
              ['Uploaded', dateTime(v.uploadedAt)],
              ['Device', `${text(v.device)} · v${text(v.appVersion)}`],
              ...(isVoid ? [['Void', `${text(v.voidReason)} · ${text(v.voidBy)} · ${dateTime(v.voidAt)}`]] : []),
            ].map(([k, val]) => (
              <div key={k} className="row-hover flex gap-3 px-4 py-2.5">
                <dt className="w-28 shrink-0 text-ink/50">{k}</dt>
                <dd className="flex-1 min-w-0 break-words font-semibold">{val || '–'}</dd>
              </div>
            ))}
          </dl>

          <VisitMap
            start={num(v.startLat) != null ? { lat: num(v.startLat), lng: num(v.startLng) } : null}
            finish={num(v.lat) != null ? { lat: num(v.lat), lng: num(v.lng) } : null}
            outlet={d.outlet && num(d.outlet.lat) != null ? { lat: num(d.outlet.lat), lng: num(d.outlet.lng) } : null}
          />
        </div>
      )}
      {zoom && <Zoom src={zoom.src} caption={zoom.caption} onClose={() => setZoom(null)} />}
      {voiding && (
        <VoidSheet
          id={id}
          onClose={() => setVoiding(false)}
          onDone={() => {
            setVoiding(false)
            load()
            onChanged?.()
          }}
        />
      )}
    </Sheet>
  )
}

function Photo({ id, label, onZoom }) {
  const { url, error } = useFullPhoto(id || null)
  return (
    <figure>
      <button type="button" disabled={!url} onClick={() => onZoom({ src: url, caption: label })} className="thumb-hover block w-full aspect-[3/4] rounded-2xl bg-mist overflow-hidden">
        {url ? <img src={url} alt={label} className="w-full h-full object-cover" /> : error || !id ? <span className="flex h-full items-center justify-center text-xs text-ink/45 px-3 text-center">{error || 'No photo'}</span> : <span className="block w-full h-full skeleton" />}
      </button>
      <figcaption className="text-xs text-ink/55 mt-1.5">{label}</figcaption>
    </figure>
  )
}

function VoidSheet({ id, onClose, onDone }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <Sheet
      title="Void visit"
      onClose={onClose}
      footer={
        <Button
          disabled={busy || !reason.trim()}
          onClick={async () => {
            setBusy(true)
            try {
              await voidVisit(id, reason.trim())
              onDone()
            } catch (err) {
              setError(err.message)
              setBusy(false)
            }
          }}
        >
          {busy ? <Spinner /> : 'Void'}
        </Button>
      }
    >
      <p className="text-sm text-ink/60">The row stays in the sheet, marked Void, and drops out of all totals.</p>
      <Field label="Reason">
        <textarea className={`${inputClass} py-3 min-h-[90px]`} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </Field>
      {error && <Notice>{error}</Notice>}
    </Sheet>
  )
}
