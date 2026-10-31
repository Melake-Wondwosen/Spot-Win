import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { myVisits, notifications } from '../api'
import { photoDel } from '../db'
import { getFix, locationMessage, onLocation } from '../location'
import { addLocalNote, clearNotesMemory, setServerNotes } from '../notes'
import { clearPack, syncPack } from '../outlets'
import { setActivity, stopPresence } from '../presence'
import { flushQueue, KINDS, onQueue, photoKey, refreshQueueCount } from '../queue'
import { clearDraft, clearUser, getCounts, getDraft, getLastSync, getLog, getQueueWhy, getUser, setLastSync, updateLog } from '../storage'
import { dayStart, time } from '../time'
import { ACTIVITIES, STEP_COUNT } from '../config'
import Bell from '../components/Bell'
import { amountText, Avatar, Button, LocationBlocked, Notice, Pattern, Sheet, SignOutButton } from '../components/ui'

const STEP_NAMES = ['Outlet', 'Activity', 'Investment', 'Payment receipt', 'Engagement photo']

export default function Home() {
  const navigate = useNavigate()
  const user = getUser()
  const [counts, setCounts] = useState(() => getCounts(user.id))
  const [draft, setDraftState] = useState(null)
  const [confirmNew, setConfirmNew] = useState(false)
  const [queue, setQueue] = useState({ busy: false, pending: 0, why: getQueueWhy() })
  const [lastSync, setLast] = useState(getLastSync)
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState(null)
  const [loc, setLoc] = useState({ fix: null, error: null })
  const [now, setNow] = useState(Date.now())
  const [log, setLog] = useState([])
  const [retrying, setRetrying] = useState(false)

  const reloadLog = () => getLog(user.id).then(setLog)

  useEffect(() => {
    setActivity('Home')
    getDraft().then(setDraftState)
    reloadLog()
    refreshQueueCount()
    sync(true)
    const offQ = onQueue((s) => {
      setQueue(s)
      if (!s.busy) reloadLog()
    })
    const offL = onLocation(setLoc)
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => {
      offQ()
      offL()
      clearInterval(t)
    }
  }, [])

  useEffect(() => {
    if (queue.busy && queue.pending) setActivity(`Uploading ${queue.pending} ${queue.pending === 1 ? 'visit' : 'visits'}`)
    else setActivity('Home')
  }, [queue.busy, queue.pending])

  // Uploads the queue, then refreshes the outlet data and pulls notifications
  async function sync(quiet = false) {
    if (syncing) return
    setSyncing(true)
    if (!quiet) setResult(null)
    // The outlet data downloads in the background; Sync doesn't wait for it
    syncPack(undefined, !quiet)
    const flush = await flushQueue()
    let online = true
    try {
      const d = await notifications()
      setServerNotes(d.notes)
      await fillFromServer()
    } catch {
      online = false
    }
    if (flush.sent) addLocalNote(`${flush.sent} ${flush.sent === 1 ? 'visit' : 'visits'} uploaded`)
    if (online && !flush.left) {
      const t = Date.now()
      setLastSync(t)
      setLast(t)
    }
    if (!quiet || flush.sent) {
      setResult(flush.left || !online ? { tone: 'error', text: flush.why || 'No connection' } : { tone: 'ok', text: flush.sent ? `${flush.sent} uploaded` : 'Up to date' })
    }
    setCounts(getCounts(user.id))
    reloadLog()
    setSyncing(false)
  }

  // After a reinstall the phone has no list, so fill it from the server
  async function fillFromServer() {
    const have = await getLog(user.id)
    if (have.length) return
    const d = await myVisits()
    if (!d.visits?.length) return
    await updateLog(user.id, (list) => {
      const ids = new Set(list.map((v) => v.id))
      return [...list, ...d.visits.filter((v) => !ids.has(v.id)).map((v) => ({ ...v, uploaded: true }))]
    })
  }

  function signOut() {
    stopPresence('Signed out')
    clearPack()
    clearNotesMemory()
    clearUser()
    navigate('/login', { replace: true })
  }

  async function startNew() {
    if (draft) await Promise.all(KINDS.flatMap((k) => [photoDel(photoKey(draft.id, k)), photoDel(photoKey(draft.id, k) + '_t')])).catch(() => {})
    await clearDraft()
    navigate('/visit')
  }

  const today = useMemo(() => log.filter((v) => new Date(v.finishedAt).getTime() >= dayStart()).sort((a, b) => (a.finishedAt < b.finishedAt ? 1 : -1)), [log])
  const locOff = !!loc.error && !loc.fix
  const blocked = loc.error?.code === 1

  return (
    <main className="min-h-full flex flex-col safe-bottom bg-[#fbfaf7]">
      <header className="relative z-[1200] bg-ink text-paper px-4 min-[380px]:px-5 pt-4 pb-6 safe-top overflow-hidden">
        <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 w-64 h-64 rounded-full bg-gold/25 blur-3xl" />
        <div className="relative max-w-md mx-auto flex items-center gap-2 min-[380px]:gap-3 anim-fade">
          <Avatar name={user?.name} />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-gold">Spot Win</p>
            <p className="font-serif text-lg truncate">{user?.name || user?.username}</p>
          </div>
          <Bell />
          <SignOutButton onClick={signOut} />
        </div>

        {/* Location strip: on, accuracy and the current time, captured automatically */}
        <div className="relative max-w-md mx-auto mt-4 anim-rise">
          {locOff ? (
            <div className="flex items-center gap-2.5 rounded-2xl border border-gold/60 bg-gold/10 px-3.5 py-2.5 text-sm">
              <span className="w-2 h-2 rounded-full bg-gold shrink-0" />
              <span className="flex-1">{locationMessage(loc.error)}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 rounded-2xl bg-paper/[0.07] border border-paper/10 px-3.5 py-2.5 text-sm">
              <span className={`w-2 h-2 rounded-full shrink-0 bg-gold ${loc.fix ? 'live-dot' : 'animate-pulse'}`} />
              <span className="flex-1 text-paper/85">{loc.fix ? 'Location on' : 'Finding your location...'}</span>
              {loc.fix && <span className="text-gold tabular">±{loc.fix.accuracy} m</span>}
              <span className="text-paper/50 tabular">{time(now)}</span>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 px-4 min-[380px]:px-5 pt-5 pb-6 max-w-md w-full mx-auto stagger">
        <div className="grid grid-cols-2 gap-3" style={{ '--i': 0 }}>
          <Stat label="Visits today" value={counts.today} />
          <Stat label="All time" value={counts.total} />
        </div>

        <div style={{ '--i': 1 }}>
          {draft ? (
            <>
              <button
                type="button"
                disabled={locOff}
                onClick={() => navigate('/visit')}
                className="btn-hover cta-ring mt-5 w-full rounded-3xl gold-gradient text-ink px-5 py-4 text-left flex items-center gap-4 shadow-[0_18px_34px_-18px_rgba(143,107,30,0.8)] disabled:opacity-40 active:scale-[0.98]"
              >
                <span className="hop w-12 h-12 rounded-2xl bg-ink text-gold flex items-center justify-center shrink-0 font-serif text-xl">{(draft.step ?? 0) + 1}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-lg font-bold leading-tight">Continue visit</span>
                  <span className="block text-sm opacity-75 truncate mt-0.5">
                    {draft.data?.outletId ? `${draft.data.outletName || 'Outlet'} (${draft.data.outletId}) · ` : ''}
                    Step {(draft.step ?? 0) + 1} of {STEP_COUNT}, {STEP_NAMES[draft.step ?? 0]}
                  </span>
                </span>
                <Arrow />
              </button>
              <Button variant="quiet" className="mt-1" onClick={() => setConfirmNew(true)}>
                Start a new visit instead
              </Button>
            </>
          ) : (
            <button
              type="button"
              disabled={locOff}
              onClick={() => navigate('/visit')}
              className="cta cta-shine cta-ring mt-5 w-full rounded-3xl bg-ink text-paper px-5 py-5 flex items-center gap-4 text-left shadow-[0_22px_40px_-22px_rgba(0,0,0,0.7)] disabled:opacity-40 active:scale-[0.98]"
            >
              <span className="hop w-14 h-14 rounded-2xl gold-gradient text-ink flex items-center justify-center shrink-0">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 21h18" />
                  <path d="M5 21V8l7-5 7 5v13" />
                  <path d="M10 21v-6h4v6" />
                </svg>
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-xl font-bold leading-tight">Enter to the outlet</span>
                <span className="block text-sm text-paper/60 mt-0.5">Record a payment in five steps</span>
              </span>
              <span className="text-gold">
                <Arrow />
              </span>
            </button>
          )}
          {locOff && <p className="text-xs text-ink/55 text-center mt-2">Turn on location to start a visit.</p>}
        </div>

        {confirmNew && (
          <Sheet
            title="Start a new visit?"
            onClose={() => setConfirmNew(false)}
            footer={
              <div className="grid grid-cols-2 gap-3">
                <Button variant="ghost" onClick={() => setConfirmNew(false)}>
                  Keep it
                </Button>
                <Button onClick={startNew}>Start new</Button>
              </div>
            }
          >
            <p className="text-sm text-ink/70">The visit you started, and its photos, will be deleted.</p>
          </Sheet>
        )}

        {/* Sync card */}
        <section style={{ '--i': 2 }} className={`lift spot mt-5 rounded-2xl bg-white border p-3 pl-4 flex items-center gap-3 ${queue.pending ? 'border-gold' : 'border-ink/10'}`}>
          <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${queue.pending ? 'gold-gradient text-ink' : 'bg-mist text-ink'}`}>
            {queue.pending ? (
              <b key={queue.pending} className="anim-pop">{queue.pending}</b>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            )}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-semibold">{queue.pending ? 'Waiting to upload' : 'All synced'}</span>
            <span className="block text-xs text-ink/55 truncate">
              {queue.pending ? `${queue.pending} ${queue.pending === 1 ? 'visit' : 'visits'}, ${queue.pending * 2} photos · ` : ''}
              {lastSync ? `Last sync ${time(lastSync)}` : 'Not synced yet'}
            </span>
          </span>
          <button
            type="button"
            onClick={() => sync()}
            disabled={syncing || queue.busy}
            className="btn-hover shrink-0 inline-flex items-center gap-2 rounded-full bg-ink text-paper h-11 px-4 font-semibold hover:bg-ink-soft disabled:opacity-70"
          >
            <svg className={syncing || queue.busy ? 'animate-spin' : ''} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 0 1-15.36 6.36L3 16" />
              <path d="M3 12a9 9 0 0 1 15.36-6.36L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M3 21v-5h5" />
            </svg>
            {syncing || queue.busy ? 'Syncing' : 'Sync'}
          </button>
        </section>
        {result && (
          <Notice key={result.text + lastSync} tone={result.tone} className="mt-3">
            {result.text}
          </Notice>
        )}
        {!result && queue.pending > 0 && queue.why && <Notice className="mt-3">{queue.why}</Notice>}

        {/* Today's visits */}
        <section style={{ '--i': 3 }} className="mt-7">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="font-serif text-xl">Today's visits</h2>
            {today.length > 0 && <span className="text-xs text-ink/50">{today.length}</span>}
          </div>
          {!today.length ? (
            <p className="rounded-2xl border border-dashed border-ink/15 px-4 py-7 text-center text-sm text-ink/50">No visits yet today</p>
          ) : (
            <ul className="rounded-2xl bg-white border border-ink/10 divide-y divide-ink/[0.07] overflow-hidden stagger">
              {today.map((v, i) => (
                <li key={v.id} style={{ '--i': i }} className="row-hover px-4 py-3 flex items-center gap-3">
                  <span className="w-12 shrink-0 text-sm font-semibold tabular text-ink/70">{time(v.finishedAt)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold truncate">
                      {v.outletName || 'Outlet'} <span className="font-normal text-ink/45">{v.outletId}</span>
                    </span>
                    <span className="block text-xs text-ink/55 truncate">
                      {ACTIVITIES.find((a) => a.label === v.activity)?.short || v.activity} · <b className="text-gold-dark">{amountText(v.investmentUnit, v.amount)}</b>
                    </span>
                  </span>
                  <span title={v.uploaded ? 'Uploaded' : 'Waiting to upload'} className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${v.uploaded ? 'gold-gradient text-ink' : 'bg-mist text-ink/55'}`}>
                    {v.uploaded ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Pattern className="opacity-50 px-8 pb-2 anim-fade" />

      {blocked && (
        <LocationBlocked
          busy={retrying}
          onRetry={async () => {
            setRetrying(true)
            await getFix().catch(() => {})
            setRetrying(false)
          }}
        />
      )}
    </main>
  )
}

function Arrow() {
  return (
    <svg className="nudge shrink-0" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  )
}

function Stat({ label, value }) {
  return (
    <div className="tilt spot rounded-2xl bg-white border border-ink/10 px-4 py-4 text-center" data-tilt="8">
      <p key={value} className="tilt-pop font-serif text-4xl text-ink anim-count">{value}</p>
      <p className="text-[11px] uppercase tracking-[0.14em] text-gold-dark mt-1">{label}</p>
    </div>
  )
}
