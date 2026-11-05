import { useCallback, useEffect, useMemo, useState } from 'react'
import { managerData } from '../api'
import Period from '../components/Period'
import { Button, Notice, Segmented, Spinner, birr, whole } from '../components/ui'
import { usePeriod, Tile } from '../manager/shared'
import ExportButton from '../components/ExportButton'
import { isVoid, text, totals } from '../manager/calc'
import { VisitRow } from '../manager/VisitRow'
import VisitDetail from '../manager/VisitDetail'
import { DAY_MS, date, dayStart, weekday } from '../time'

// What the spending can be split by. `field` groups the rows, `name` labels them.
const DIMS = {
  division: { label: 'Division', field: 'division' },
  agent: { label: 'Agent', field: 'agent' },
  territory: { label: 'Territory', field: 'territory' },
  user: { label: 'Sales person', field: 'userId', name: 'userName' },
  activity: { label: 'Activity', field: 'activity' },
  outlet: { label: 'Outlet', field: 'outletId', name: 'outletName' },
}
const ORDER = ['division', 'agent', 'territory', 'user', 'activity', 'outlet']
// Where a click on a row takes you next
const NEXT = { division: 'agent', agent: 'user', territory: 'user', activity: 'user', user: 'visits', outlet: 'visits' }
// Export filters the server understands, per level
const EXPORT_KEY = { division: 'division', agent: 'agent', territory: 'territory', user: 'userId', activity: 'activity', outlet: 'outletId' }

const keyOf = (v, dim) => text(v[DIMS[dim].field]).trim() || 'Not set'
const nameOf = (v, dim) => (DIMS[dim].name ? text(v[DIMS[dim].name]).trim() : '') || keyOf(v, dim)

function group(rows, dim) {
  const by = new Map()
  for (const v of rows) {
    if (isVoid(v)) continue
    const k = keyOf(v, dim)
    if (!by.has(k)) by.set(k, { key: k, name: nameOf(v, dim), list: [] })
    by.get(k).list.push(v)
  }
  return [...by.values()].map((g) => ({ ...g, ...totals(g.list) })).sort((a, b) => b.birr - a.birr || b.visits - a.visits)
}

// Spending analysis with drill-down: Division > Agent > Sales person > visits.
// Admins see everything; managers and RTMs their division; ASMs their agent
// (the server limits the rows). Each starts at the level that fits them.
export default function Analysis({ role = 'admin', exportMeta }) {
  const { period, range, props } = usePeriod('7d')
  const [visits, setVisits] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [path, setPath] = useState([]) // [{ dim, key, name }]
  const [view, setView] = useState(null) // a dim key or 'visits'; null = the starting level
  const [limit, setLimit] = useState(40)
  const [open, setOpen] = useState(null)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const d = await managerData({ from: range.from, to: range.to, lite: true })
      setVisits(d.visits || [])
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }, [range.from, range.to])

  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [load])

  const manyDivisions = useMemo(() => new Set((visits || []).map((v) => text(v.division)).filter(Boolean)).size > 1, [visits])
  const start = role === 'asm' ? 'user' : role === 'admin' || manyDivisions ? 'division' : 'agent'

  const used = new Set(path.map((p) => p.dim))
  const options = [...ORDER.filter((d) => !used.has(d) && !(role === 'asm' && (d === 'division' || d === 'agent'))).map((d) => ({ value: d, label: DIMS[d].label })), { value: 'visits', label: 'Visits' }]
  const current = view && options.some((o) => o.value === view) ? view : path.length ? NEXT[path[path.length - 1].dim] : start
  const level = options.some((o) => o.value === current) ? current : 'visits'

  const rows = useMemo(() => (visits || []).filter((v) => path.every((p) => keyOf(v, p.dim) === p.key)), [visits, path])
  const t = useMemo(() => totals(rows), [rows])
  const groups = useMemo(() => (level === 'visits' ? [] : group(rows, level)), [rows, level])
  const list = useMemo(() => (level === 'visits' ? [...rows].sort((a, b) => (a.date < b.date ? 1 : -1)) : []), [rows, level])
  const maxBirr = Math.max(1, ...groups.map((g) => g.birr))

  function drill(g) {
    setPath([...path, { dim: level, key: g.key, name: g.name }])
    setView(null)
    setLimit(40)
  }
  function back(to) {
    setPath(path.slice(0, to))
    setView(null)
    setLimit(40)
  }

  // A bar for each day in the period (Addis days)
  const daily = useMemo(() => {
    const saved = rows.filter((v) => !isVoid(v))
    const end = range.to ? new Date(range.to).getTime() - 1 : Date.now()
    let from = range.from ? new Date(range.from).getTime() : saved.reduce((a, v) => Math.min(a, new Date(v.date).getTime()), end)
    from = Math.max(from, dayStart(89, end))
    const out = []
    for (let d0 = dayStart(0, from); d0 <= end; d0 += DAY_MS) {
      const day = saved.filter((v) => {
        const x = new Date(v.date).getTime()
        return x >= d0 && x < d0 + DAY_MS
      })
      out.push({ day: d0, n: day.length, birr: totals(day).birr })
    }
    return out
  }, [rows, range.from, range.to])
  const maxDay = Math.max(1, ...daily.map((d) => d.n))

  const exportFilters = () => {
    const f = { from: range.from, to: range.to, status: 'Saved' }
    path.forEach((p) => (f[EXPORT_KEY[p.dim]] = p.key))
    return f
  }
  const exportName = () => ({ division: path.length ? path[path.length - 1].name : exportMeta?.()?.division || '' })
  const levelLabel = level === 'visits' ? 'Visits' : DIMS[level].label

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-ink text-paper p-2.5 sm:p-3 flex flex-col sm:flex-row sm:items-start gap-2.5">
        <Period {...props} />
        <div className="flex items-center gap-2 sm:ml-auto">
          <button type="button" onClick={load} disabled={busy} aria-label="Refresh" className="btn-hover shrink-0 h-10 w-10 sm:w-auto sm:px-4 rounded-full text-sm font-semibold border border-paper/25 text-paper inline-flex items-center justify-center gap-2 hover:border-gold">
            <svg className={busy ? 'animate-spin' : ''} width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 1-15.36 6.36L3 16" /><path d="M3 12a9 9 0 0 1 15.36-6.36L21 8" /><path d="M21 3v5h-5" /><path d="M3 21v-5h5" /></svg>
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <ExportButton className="flex-1 sm:flex-none" block filters={exportFilters} meta={exportName} />
        </div>
      </div>

      {/* Where you are. Each step goes back up. */}
      <nav aria-label="Drill path" className="flex flex-wrap items-center gap-1.5 text-sm min-w-0">
        <Crumb onClick={() => back(0)} active={!path.length}>
          {role === 'asm' ? 'My agent' : role === 'admin' || manyDivisions ? 'All divisions' : 'My division'}
        </Crumb>
        {path.map((p, i) => (
          <span key={i} className="anim-fade inline-flex items-center gap-1.5 min-w-0">
            <Chevron className="text-ink/30" />
            <Crumb onClick={() => back(i + 1)} active={i === path.length - 1}>
              <span className="opacity-60 font-normal mr-1">{DIMS[p.dim].label}:</span>
              {p.name}
            </Crumb>
          </span>
        ))}
        {path.length > 0 && (
          <button type="button" onClick={() => back(path.length - 1)} className="link-hover ml-auto text-sm font-semibold text-gold-dark">
            ← Back
          </button>
        )}
      </nav>

      {error && <Notice>{error}</Notice>}
      {!visits && !error && <div className="skeleton h-40 rounded-2xl" />}

      {visits && (
        <>
          <div key={path.length} className="grid grid-cols-2 min-[400px]:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 stagger">
            <Tile i={0} label="Visits" value={whole(t.visits)} />
            <Tile i={1} label="Outlets visited" value={whole(t.outlets)} />
            <Tile i={2} label="Active SPs" value={whole(t.users)} />
            <Tile i={3} label="Total Birr" value={birr(Math.round(t.birr))} gold />
            <Tile i={4} label="Total crates" value={whole(t.crates)} gold />
            <Tile i={5} label="Avg Birr per visit" value={t.avgBirr == null ? '–' : birr(Math.round(t.avgBirr))} />
          </div>

          <section className="rounded-2xl bg-white border border-ink/10 p-4 anim-rise">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-serif text-xl min-w-0">
                {level === 'visits' ? 'Visits' : `Spending by ${levelLabel.toLowerCase()}`}
                {path.length > 0 && <span className="text-ink/45 text-base"> · {path[path.length - 1].name}</span>}
              </h2>
              {/* Phones get a dropdown; wider screens the row of buttons */}
              <select
                aria-label="Show by"
                className="sm:hidden w-full h-11 rounded-xl bg-white border border-ink/15 px-3 text-sm font-semibold outline-none focus:border-gold"
                value={level}
                onChange={(e) => {
                  setView(e.target.value)
                  setLimit(40)
                }}
              >
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    Show by {o.label.toLowerCase()}
                  </option>
                ))}
              </select>
              <div className="hidden sm:block w-full lg:w-auto lg:min-w-[560px]">
                <Segmented
                  value={level}
                  onChange={(v) => {
                    setView(v)
                    setLimit(40)
                  }}
                  options={options}
                />
              </div>
            </div>

            {level !== 'visits' && (
              <>
                <div className="hidden md:grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.5fr)_64px_64px_110px_70px_20px] gap-3 mt-4 text-[11px] uppercase tracking-wider text-gold-dark">
                  <span>{levelLabel}</span>
                  <span>Share of Birr</span>
                  <span className="text-right">Visits</span>
                  <span className="text-right">Outlets</span>
                  <span className="text-right">Birr</span>
                  <span className="text-right">Crates</span>
                  <span />
                </div>
                <ul key={level + path.length} className="mt-2 divide-y divide-ink/[0.07] stagger">
                  {!groups.length && <li className="py-6 text-sm text-ink/55 text-center">No visits in this period.</li>}
                  {groups.map((g, i) => (
                    <li key={g.key} style={{ '--i': i }}>
                      <button
                        type="button"
                        onClick={() => drill(g)}
                        title={`Open ${g.name}`}
                        className="row-hover w-full text-left px-2 -mx-2 rounded-lg py-2.5 grid grid-cols-[minmax(0,1fr)_auto_20px] md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.5fr)_64px_64px_110px_70px_20px] gap-x-3 gap-y-1 items-center text-sm"
                      >
                        <span className="font-semibold truncate">
                          {g.name}
                          {level === 'outlet' && <span className="font-normal text-ink/45 tabular"> {g.key}</span>}
                        </span>
                        <span className="md:hidden text-right tabular font-semibold text-gold-dark">{birr(Math.round(g.birr))} Birr</span>
                        <Chevron className="md:hidden nudge text-gold-dark" />
                        <span className="col-span-3 md:col-span-1 h-2.5 rounded-full bg-mist overflow-hidden">
                          <span className="grow-x block h-full rounded-full gold-gradient" style={{ width: `${(g.birr / maxBirr) * 100}%`, animationDelay: `${Math.min(i, 12) * 50}ms` }} />
                        </span>
                        <span className="col-span-3 md:contents grid grid-cols-3 text-xs md:text-sm text-ink/70 tabular">
                          <span className="md:text-right"><span className="md:hidden text-ink/45">Visits </span>{g.visits}</span>
                          <span className="text-center md:text-right"><span className="md:hidden text-ink/45">Outlets </span>{g.outlets}</span>
                          <span className="hidden md:block text-right font-semibold text-ink">{birr(Math.round(g.birr))}</span>
                          <span className="text-right"><span className="md:hidden text-ink/45">Crates </span>{whole(g.crates)}</span>
                        </span>
                        <Chevron className="hidden md:block nudge text-gold-dark justify-self-end" />
                      </button>
                    </li>
                  ))}
                </ul>
                {groups.length > 0 && <p className="text-xs text-ink/45 mt-2">Tap a row to open it.</p>}
              </>
            )}

            {level === 'visits' && (
              <>
                {!list.length ? (
                  <p className="py-6 text-sm text-ink/55 text-center">No visits in this period.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-ink/[0.07]">
                    {list.slice(0, limit).map((v) => (
                      <VisitRow key={text(v.id)} v={v} onOpen={() => setOpen(text(v.id))} />
                    ))}
                  </ul>
                )}
                {list.length > limit && (
                  <Button variant="ghost" className="mt-3" onClick={() => setLimit(limit + 60)}>
                    Show more ({(list.length - limit).toLocaleString()} left)
                  </Button>
                )}
              </>
            )}
          </section>

          <section className="rounded-2xl bg-white border border-ink/10 p-4 anim-rise">
            <div className="flex items-baseline justify-between">
              <h2 className="font-serif text-xl">Visits per day</h2>
              <span className="text-xs text-ink/50">{daily.length} days</span>
            </div>
            <div className="mt-4 h-48 flex items-end gap-[3px]">
              {daily.map((d, i) => (
                <div key={d.day} className="group relative flex-1 min-w-0 h-full flex flex-col justify-end items-center">
                  <span className={`pointer-events-none absolute bottom-full mb-1 z-10 ${i < daily.length / 2 ? 'left-0' : 'right-0'} opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap rounded-lg bg-ink text-paper text-[11px] px-2 py-1 shadow-lg`}>
                    {weekday(d.day)} {date(d.day)} · {d.n} visits · {birr(Math.round(d.birr))} Birr
                  </span>
                  <span
                    className="bar-hover grow-y w-full max-w-[38px] rounded-t-md gold-gradient"
                    style={{ height: `${Math.max(d.n ? 4 : 1, (d.n / maxDay) * 100)}%`, opacity: d.n ? 1 : 0.25, animationDelay: `${Math.min(i, 40) * 18}ms` }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[11px] text-ink/45 mt-2 tabular">
              <span>{daily.length ? date(daily[0].day) : ''}</span>
              <span>{daily.length > 1 ? date(daily[daily.length - 1].day) : ''}</span>
            </div>
          </section>
          {period === 'all' && daily.length >= 90 && <p className="text-xs text-ink/45">The chart shows the last 90 days.</p>}
        </>
      )}
      {open && <VisitDetail id={open} canVoid={role === 'admin'} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  )
}

function Crumb({ children, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={active}
      className={`max-w-[60vw] sm:max-w-xs truncate rounded-full px-3 h-8 font-semibold transition-colors ${active ? 'bg-ink text-paper cursor-default' : 'bg-white border border-ink/10 text-ink/75 hover:border-gold hover:text-ink'}`}
    >
      {children}
    </button>
  )
}

function Chevron({ className = '' }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}
