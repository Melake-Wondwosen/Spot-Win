import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { managerData } from '../api'
import { MANAGER_REFRESH_MS } from '../config'
import { clearUser, getUser } from '../storage'
import { Avatar, SignOutButton, Spinner, amountText, birr, whole } from '../components/ui'
import Bell from '../components/Bell'
import ExportButton from '../components/ExportButton'
import Period from '../components/Period'
import { clearNotesMemory, setServerNotes } from '../notes'
import { ago, dateTime, dayStart, time } from '../time'
import { Tile, usePeriod } from './shared'
import MapView from './MapView'
import VisitDetail from './VisitDetail'
import { byActivity, flagLabel, isVoid, teamStatus, text, totals } from './calc'
import { useThumb } from './photos'

// The spending analysis loads only when someone opens it
const Analysis = lazy(() => import('../admin/Analysis'))

const VIEWS = [
  { key: 'live', label: 'Live' },
  { key: 'spending', label: 'Spending' },
]

export default function Manager() {
  const navigate = useNavigate()
  const user = getUser()
  const { range, props: periodProps } = usePeriod('today')
  const [data, setData] = useState(null)
  const [fetchedAt, setFetchedAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [openVisit, setOpenVisit] = useState(null)
  const [view, setView] = useState('live')

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const d = await managerData({ from: range.from, to: range.to, trackFrom: new Date(dayStart()).toISOString() })
      setData(d)
      setServerNotes(d.notes)
      setFetchedAt(Date.now())
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }, [range.from, range.to])

  useEffect(() => {
    load()
    const t = setInterval(load, MANAGER_REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  // Server clock, so a phone with the wrong time doesn't mark everyone offline
  const serverNow = data?.serverTime ? new Date(data.serverTime).getTime() + (now - fetchedAt) : now
  const visits = data?.visits || []
  const team = useMemo(() => (data ? teamStatus({ users: data.users, presence: data.presence, visits, track: data.track, flags: data.flags }, serverNow, dayStart()) : []), [data, serverNow])
  const sum = useMemo(() => totals(visits), [visits])
  const acts = useMemo(() => byActivity(visits), [visits])
  const recent = useMemo(() => [...visits].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 20), [visits])
  const mapVisits = useMemo(() => visits.filter((v) => !isVoid(v)), [visits])

  function signOut() {
    clearNotesMemory()
    clearUser()
    navigate('/login', { replace: true })
  }

  const online = team.filter((u) => u.online).length
  const activeToday = team.filter((u) => u.seenToday).length
  const title = data?.scopeLabel || (user.role === 'admin' ? 'Manager view · All divisions' : user.role === 'asm' ? 'ASM' : user.role === 'rtm' ? 'RTM · All divisions' : 'Manager · All divisions')

  return (
    <main className="min-h-full safe-bottom anim-fade bg-[#fbfaf7]">
      <header className="relative z-[1200] bg-ink text-paper safe-top">
        <span aria-hidden="true" className="pointer-events-none absolute right-0 top-0 w-72 h-40 bg-gold/20 blur-3xl" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-4">
          <div className="flex items-center gap-2 min-[380px]:gap-3">
            <Avatar name={user.name} />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-[0.16em] text-gold truncate">{title}</p>
              <p className="font-serif text-lg truncate">{user.name}</p>
            </div>
            {user.role === 'admin' && (
              <Link to="/admin" className="btn-hover hidden sm:inline-flex items-center text-sm text-gold border border-gold/40 rounded-full px-4 h-10 hover:bg-gold hover:text-ink">
                Admin console
              </Link>
            )}
            <Bell />
            <SignOutButton onClick={signOut} />
          </div>
          <div className="mt-4 flex rounded-full bg-paper/10 p-1 w-fit">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                className={`px-5 min-h-[34px] rounded-full text-sm font-semibold ${view === v.key ? 'bg-paper text-ink shadow-sm' : 'tab-hover text-paper/70 hover:text-paper'}`}
              >
                {v.label}
              </button>
            ))}
          </div>
          {view === 'live' && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Period {...periodProps} />
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={load} disabled={busy} className="text-xs text-paper/65 h-10 px-2 inline-flex items-center gap-2 hover:text-paper">
                {busy ? <Spinner /> : '↻'} {fetchedAt ? `Updated ${time(fetchedAt)}` : 'Loading'}
              </button>
              <ExportButton filters={() => ({ from: range.from, to: range.to, status: 'Saved' })} meta={() => ({ division: data?.division || (user.role === 'asm' ? user.agent : '') })} />
            </div>
          </div>
          )}
        </div>
      </header>

      {view === 'spending' && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 anim-rise">
          <Suspense fallback={<div className="skeleton h-40 rounded-2xl" />}>
            <Analysis role={user.role} scopeLabel={data?.scopeLabel} exportMeta={() => ({ division: data?.division || (user.role === 'asm' ? user.agent : '') })} />
          </Suspense>
        </div>
      )}

      <div className={`max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-5 ${view === 'live' ? '' : 'hidden'}`}>
        {error && <p className="rounded-xl bg-paper border border-ink/15 border-l-4 border-l-gold text-ink text-sm px-4 py-3">{error}</p>}
        {!data && !error && (
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton h-24 rounded-2xl" />
            ))}
          </div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 stagger">
              <Tile i={0} label="Online now" value={online} sub={`of ${team.length} sales users`} live />
              <Tile i={1} label="Active today" value={activeToday} />
              <Tile i={2} label="Visits" value={whole(sum.visits)} />
              <Tile i={3} label="Outlets visited" value={whole(sum.outlets)} />
              <Tile i={4} label="Total Birr" value={birr(Math.round(sum.birr))} gold />
              <Tile i={5} label="Total crates" value={whole(sum.crates)} gold />
            </div>

            <ActivityTable rows={acts} />

            <div className="grid lg:grid-cols-5 gap-4 anim-rise" style={{ animationDelay: '160ms' }}>
              <section className="lg:col-span-3 h-[360px] sm:h-[440px] lg:h-[600px] rounded-2xl bg-white border border-ink/10 p-1.5">
                <MapView team={team} visits={mapVisits} selectedId={selected} onSelect={setSelected} onVisit={setOpenVisit} now={fetchedAt} />
              </section>
              <section className="lg:col-span-2 rounded-2xl bg-white border border-ink/10 flex flex-col lg:h-[600px] min-w-0">
                <div className="px-4 pt-4 pb-2 flex items-baseline justify-between">
                  <h2 className="font-serif text-xl">Team</h2>
                  <span className="text-xs text-ink/50">{online} online</span>
                </div>
                <ul className="flex-1 overflow-y-auto divide-y divide-ink/[0.07] max-h-[560px] lg:max-h-none">
                  {team.map((u) => (
                    <TeamRow key={u.id} u={u} now={serverNow} selected={selected === u.id} onClick={() => setSelected(selected === u.id ? null : u.id)} />
                  ))}
                  {!team.length && <li className="px-4 py-6 text-sm text-ink/60">No sales users yet.</li>}
                </ul>
              </section>
            </div>

            <section className="rounded-2xl bg-white border border-ink/10 p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="font-serif text-xl">Latest visits</h2>
                <span className="text-xs text-ink/50">{visits.length.toLocaleString()} in the period</span>
              </div>
              {!recent.length && <p className="text-sm text-ink/60 mt-2">No visits.</p>}
              <ul className="mt-2 divide-y divide-ink/[0.07]">
                {recent.map((v) => (
                  <VisitRow key={text(v.id)} v={v} onOpen={() => setOpenVisit(text(v.id))} />
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
      {openVisit && <VisitDetail id={openVisit} onClose={() => setOpenVisit(null)} canVoid={user.role === 'admin'} onChanged={load} />}
    </main>
  )
}

export function ActivityTable({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.birr))
  return (
    <section className="rounded-2xl bg-white border border-ink/10 p-4 anim-rise">
      <h2 className="font-serif text-xl">By activity</h2>
      <div className="hidden md:grid grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_80px_120px_90px] gap-3 mt-3 text-[11px] uppercase tracking-wider text-gold-dark">
        <span>Activity</span>
        <span>Share of Birr</span>
        <span className="text-right">Visits</span>
        <span className="text-right">Birr</span>
        <span className="text-right">Crates</span>
      </div>
      <ul className="mt-2 md:mt-1 divide-y divide-ink/[0.07]">
        {rows.map((r, i) => (
          <li key={r.key} className="row-hover px-2 -mx-2 rounded-lg py-2.5 grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_80px_120px_90px] gap-x-3 gap-y-1 items-center">
            <span className="font-semibold truncate">{r.label}</span>
            <span className="md:hidden text-right text-sm tabular">
              <b>{r.visits}</b> <span className="text-ink/45">visits</span>
            </span>
            <span className="col-span-2 md:col-span-1 h-2.5 rounded-full bg-mist overflow-hidden">
              <span className="grow-x block h-full rounded-full gold-gradient" style={{ width: `${(r.birr / max) * 100}%`, animationDelay: `${i * 70}ms` }} />
            </span>
            <span className="hidden md:block text-right tabular">{r.visits}</span>
            <span className="col-span-2 md:col-span-2 grid grid-cols-2 md:contents text-sm tabular">
              <span className="md:text-right">
                <span className="md:hidden text-ink/45">Birr </span>
                {birr(Math.round(r.birr))}
              </span>
              <span className="text-right">
                <span className="md:hidden text-ink/45">Crates </span>
                {whole(r.crates)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function TeamRow({ u, now, selected, onClick }) {
  const status = u.online ? `Online · ${ago(u.lastSeen, now)}` : u.lastSeen ? `Seen ${ago(u.lastSeen, now)}` : 'Not seen yet'
  const flags = [...new Map(u.flags.map((f) => [f.type, f])).values()]
  return (
    <li>
      <button type="button" onClick={onClick} className={`row-hover w-full text-left px-4 py-3 ${selected ? 'bg-gold/10' : ''}`}>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${u.online ? 'bg-gold live-dot' : u.seenToday ? 'bg-ink/45' : 'bg-ink/15'}`} />
          <span className="font-semibold truncate">{u.name}</span>
          <span className="ml-auto text-xs text-ink/55 shrink-0">{status}</span>
        </div>
        {u.activity && <p className="text-sm text-ink/70 mt-0.5 pl-[18px] truncate">{u.activity}</p>}
        <p className="text-xs text-ink/55 mt-1 pl-[18px] tabular">
          Today {u.visitsToday} · Period {u.visitsPeriod} · {birr(Math.round(u.birr))} Birr · {whole(u.crates)} crates
        </p>
        {flags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5 pl-[18px]">
            {flags.map((f) => (
              <span key={f.type} title={`${f.detail} · ${dateTime(f.at)}`} className="text-[11px] font-semibold rounded-full bg-ink text-gold px-2 py-0.5">
                {flagLabel(f.type)}
              </span>
            ))}
          </div>
        )}
      </button>
    </li>
  )
}

export function VisitRow({ v, onOpen, showStatus }) {
  const receipt = useThumb(text(v.receiptPhotoId))
  const engagement = useThumb(text(v.engagementPhotoId))
  const off = isVoid(v)
  return (
    <li>
      <button type="button" onClick={onOpen} className={`row-hover w-full text-left px-2 -mx-2 rounded-lg py-2.5 flex items-center gap-3 ${off ? 'opacity-45' : ''}`}>
        <span className="flex gap-1.5 shrink-0">
          <Mini src={receipt} />
          <Mini src={engagement} />
        </span>
        <span className="flex-1 min-w-0 grid sm:grid-cols-[90px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-x-3 items-center text-sm">
          <span className="text-ink/55 tabular text-xs sm:text-sm">{dateTime(v.date)}</span>
          <span className="font-semibold truncate">
            {text(v.outletName)} <span className="font-normal text-ink/45 tabular">{text(v.outletId)}</span>
          </span>
          <span className="text-ink/65 truncate">{text(v.userName)}</span>
          <span className="text-ink/65 truncate hidden sm:block">{text(v.activity)}</span>
          <span className="font-semibold text-gold-dark sm:text-right tabular whitespace-nowrap">
            {amountText(text(v.investmentUnit), v.amount)}
            {(off || showStatus) && <span className="ml-2 text-[10px] font-bold rounded-full bg-ink/10 text-ink/60 px-1.5 py-0.5 align-middle">{off ? 'VOID' : 'SAVED'}</span>}
          </span>
        </span>
      </button>
    </li>
  )
}

function Mini({ src }) {
  return <span className="thumb-hover w-10 h-10 rounded-lg bg-mist overflow-hidden block">{src ? <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" /> : src === '' ? null : <span className="block w-full h-full skeleton" />}</span>
}
