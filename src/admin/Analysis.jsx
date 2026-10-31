import { useCallback, useEffect, useMemo, useState } from 'react'
import { managerData } from '../api'
import Period from '../components/Period'
import { Notice, Segmented, Spinner, birr, whole } from '../components/ui'
import { usePeriod, Tile } from '../manager/shared'
import ExportButton from '../components/ExportButton'
import { groupBy, isVoid, text, totals } from '../manager/calc'
import { DAY_MS, date, dayStart, weekday } from '../time'

const ALL_GROUPS = [
  { value: 'division', label: 'Division' },
  { value: 'agent', label: 'Agent' },
  { value: 'territory', label: 'Territory' },
  { value: 'userName', label: 'Sales person' },
  { value: 'activity', label: 'Activity' },
]

// Spending analysis. Admins see everything; managers and RTMs their division;
// ASMs their agent (the server limits the rows). An ASM starts on Sales person.
export default function Analysis({ divisions = [], role = 'admin', exportMeta }) {
  const { period, range, props } = usePeriod('7d')
  const [division, setDivision] = useState('')
  const GROUPS = role === 'asm' ? ALL_GROUPS.filter((g) => g.value !== 'division') : ALL_GROUPS
  const [group, setGroup] = useState(role === 'asm' ? 'userName' : role === 'admin' ? 'division' : 'agent')
  const [visits, setVisits] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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

  const allDivs = useMemo(() => [...new Set([...divisions, ...(visits || []).map((v) => text(v.division)).filter(Boolean)])].sort(), [divisions, visits])
  const rows = useMemo(() => (visits || []).filter((v) => !division || text(v.division) === division), [visits, division])
  const t = useMemo(() => totals(rows), [rows])
  const groups = useMemo(() => groupBy(rows, group), [rows, group])
  const maxBirr = Math.max(1, ...groups.map((g) => g.birr))

  // A bar for each day in the period (Addis days)
  const daily = useMemo(() => {
    const saved = rows.filter((v) => !isVoid(v))
    const end = range.to ? new Date(range.to).getTime() - 1 : Date.now()
    let start = range.from ? new Date(range.from).getTime() : saved.reduce((a, v) => Math.min(a, new Date(v.date).getTime()), end)
    start = Math.max(start, dayStart(89, end))
    const out = []
    for (let d0 = dayStart(0, start); d0 <= end; d0 += DAY_MS) {
      const list = saved.filter((v) => {
        const x = new Date(v.date).getTime()
        return x >= d0 && x < d0 + DAY_MS
      })
      out.push({ day: d0, n: list.length, birr: totals(list).birr })
    }
    return out
  }, [rows, range.from, range.to])
  const maxDay = Math.max(1, ...daily.map((d) => d.n))

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-ink text-paper p-3 flex flex-wrap items-center gap-2">
        <Period {...props} />
        {allDivs.length > 1 && <select value={division} onChange={(e) => setDivision(e.target.value)} className="h-[38px] rounded-full bg-paper/10 border border-paper/15 text-paper text-sm px-3 outline-none focus:border-gold [color-scheme:dark] max-w-full">
          <option value="">All divisions</option>
          {allDivs.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={load} disabled={busy} className="btn-hover h-10 rounded-full px-4 text-sm font-semibold border border-paper/25 text-paper inline-flex items-center gap-2 hover:border-gold">
            {busy ? <Spinner /> : '↻'} Refresh
          </button>
          <ExportButton filters={() => ({ from: range.from, to: range.to, division, status: 'Saved' })} meta={() => ({ division: division || exportMeta?.()?.division || '' })} />
        </div>
      </div>

      {error && <Notice>{error}</Notice>}
      {!visits && !error && <div className="skeleton h-40 rounded-2xl" />}

      {visits && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 stagger">
            <Tile i={0} label="Visits" value={whole(t.visits)} />
            <Tile i={1} label="Outlets visited" value={whole(t.outlets)} />
            <Tile i={2} label="Sales people active" value={whole(t.users)} />
            <Tile i={3} label="Total Birr" value={birr(Math.round(t.birr))} gold />
            <Tile i={4} label="Total crates" value={whole(t.crates)} gold />
            <Tile i={5} label="Avg Birr per visit" value={t.avgBirr == null ? '–' : birr(Math.round(t.avgBirr))} sub="Birr visits only" />
          </div>

          <section className="rounded-2xl bg-white border border-ink/10 p-4 anim-rise">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-serif text-xl">Spending by {GROUPS.find((g) => g.value === group).label.toLowerCase()}</h2>
              <Segmented className="w-full sm:w-auto sm:min-w-[440px]" value={group} onChange={setGroup} options={GROUPS} />
            </div>
            <div className="hidden md:grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_70px_70px_110px_80px] gap-3 mt-4 text-[11px] uppercase tracking-wider text-gold-dark">
              <span>{GROUPS.find((g) => g.value === group).label}</span>
              <span>Share of Birr</span>
              <span className="text-right">Visits</span>
              <span className="text-right">Outlets</span>
              <span className="text-right">Birr</span>
              <span className="text-right">Crates</span>
            </div>
            <ul className="mt-2 divide-y divide-ink/[0.07]">
              {!groups.length && <li className="py-6 text-sm text-ink/55 text-center">No visits in this period.</li>}
              {groups.map((g, i) => (
                <li key={g.name} className="row-hover px-2 -mx-2 rounded-lg py-2.5 grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_70px_70px_110px_80px] gap-x-3 gap-y-1 items-center text-sm">
                  <span className="font-semibold truncate">{g.name}</span>
                  <span className="md:hidden text-right tabular font-semibold text-gold-dark">{birr(Math.round(g.birr))} Birr</span>
                  <span className="col-span-2 md:col-span-1 h-2.5 rounded-full bg-mist overflow-hidden">
                    <span className="grow-x block h-full rounded-full gold-gradient" style={{ width: `${(g.birr / maxBirr) * 100}%`, animationDelay: `${Math.min(i, 12) * 50}ms` }} />
                  </span>
                  <span className="col-span-2 md:contents grid grid-cols-3 text-xs md:text-sm text-ink/70 tabular">
                    <span className="md:text-right"><span className="md:hidden text-ink/45">Visits </span>{g.visits}</span>
                    <span className="text-center md:text-right"><span className="md:hidden text-ink/45">Outlets </span>{g.outlets}</span>
                    <span className="hidden md:block text-right font-semibold text-ink">{birr(Math.round(g.birr))}</span>
                    <span className="text-right"><span className="md:hidden text-ink/45">Crates </span>{whole(g.crates)}</span>
                  </span>
                </li>
              ))}
            </ul>
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
    </div>
  )
}
