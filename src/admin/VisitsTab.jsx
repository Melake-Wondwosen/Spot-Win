import { useCallback, useEffect, useMemo, useState } from 'react'
import { managerData } from '../api'
import ExportButton from '../components/ExportButton'
import Period from '../components/Period'
import { Button, Notice, birr, whole } from '../components/ui'
import { ACTIVITIES } from '../config'
import { VisitRow } from '../manager/Manager'
import { usePeriod } from '../manager/shared'
import VisitDetail from '../manager/VisitDetail'
import { isVoid, text, totals } from '../manager/calc'
import { Empty } from './tabs'

const selCls = 'h-[42px] rounded-xl bg-white border border-ink/15 text-sm px-3 outline-none focus:border-gold min-w-0 w-full'
const norm = (s) => String(s ?? '').toLowerCase()

export default function VisitsTab({ data: admin }) {
  const { range, props } = usePeriod('7d')
  const [f, setF] = useState({ division: '', userId: '', activity: '', unit: '', status: 'Saved' })
  const [q, setQ] = useState('')
  const [visits, setVisits] = useState(null)
  const [error, setError] = useState('')
  const [limit, setLimit] = useState(50)
  const [open, setOpen] = useState(null)

  const load = useCallback(async () => {
    try {
      const d = await managerData({ from: range.from, to: range.to, lite: true })
      setVisits(d.visits || [])
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [range.from, range.to])

  useEffect(() => {
    setVisits(null)
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [load])

  const users = useMemo(() => admin.users.filter((u) => u.role === 'sales').sort((a, b) => a.name.localeCompare(b.name)), [admin.users])
  const divisions = useMemo(() => [...new Set([...(admin.divisions || []), ...(visits || []).map((v) => text(v.division)).filter(Boolean)])].sort(), [admin.divisions, visits])

  const list = useMemo(() => {
    const qq = norm(q.trim())
    return (visits || [])
      .filter((v) => !f.division || text(v.division) === f.division)
      .filter((v) => !f.userId || text(v.userId) === f.userId)
      .filter((v) => !f.activity || text(v.activity) === f.activity)
      .filter((v) => !f.unit || text(v.investmentUnit) === f.unit)
      .filter((v) => (f.status === 'Void' ? isVoid(v) : f.status === 'Saved' ? !isVoid(v) : true))
      .filter((v) => !qq || [v.outletId, v.outletName, v.userName, v.id].some((x) => norm(text(x)).includes(qq)))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [visits, f, q])
  const t = totals(list)

  const put = (k) => (e) => {
    setF({ ...f, [k]: e.target.value })
    setLimit(50)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-ink text-paper p-3 flex flex-wrap items-center gap-2">
        <Period {...props} />
        <ExportButton
          className="ml-auto"
          filters={() => ({ from: range.from, to: range.to, division: f.division, userId: f.userId, activity: f.activity, unit: f.unit, status: f.status, q: q.trim() })}
          meta={() => ({ division: f.division, userName: users.find((u) => u.id === f.userId)?.name })}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <input className={`${selCls} col-span-2 sm:col-span-3 lg:col-span-1`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Outlet ID, name or user" />
        <select className={selCls} value={f.division} onChange={put('division')}>
          <option value="">All divisions</option>
          {divisions.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <select className={selCls} value={f.userId} onChange={put('userId')}>
          <option value="">All users</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select className={selCls} value={f.activity} onChange={put('activity')}>
          <option value="">All activities</option>
          {ACTIVITIES.map((a) => (
            <option key={a.key} value={a.label}>
              {a.label}
            </option>
          ))}
        </select>
        <select className={selCls} value={f.unit} onChange={put('unit')}>
          <option value="">Birr and crates</option>
          <option value="Birr">Birr</option>
          <option value="Crate">Crate</option>
        </select>
        <select className={selCls} value={f.status} onChange={put('status')}>
          <option value="Saved">Saved</option>
          <option value="Void">Void</option>
          <option value="">Saved and void</option>
        </select>
      </div>

      {error && <Notice>{error}</Notice>}
      {!visits && !error && <div className="skeleton h-40 rounded-2xl" />}
      {visits && (
        <>
          <p className="text-sm text-ink/60 tabular">
            <b className="text-ink">{list.length.toLocaleString()}</b> visits · <b className="text-ink">{birr(Math.round(t.birr))}</b> Birr · <b className="text-ink">{whole(t.crates)}</b> crates
            {f.status !== 'Saved' && ' (totals leave out void visits)'}
          </p>
          {!list.length ? (
            <Empty>No visits match</Empty>
          ) : (
            <ul className="rounded-2xl bg-white border border-ink/10 divide-y divide-ink/[0.07] px-4">
              {list.slice(0, limit).map((v) => (
                <VisitRow key={text(v.id)} v={v} onOpen={() => setOpen(text(v.id))} />
              ))}
            </ul>
          )}
          {list.length > limit && (
            <Button variant="ghost" onClick={() => setLimit(limit + 100)}>
              Show more ({(list.length - limit).toLocaleString()} left)
            </Button>
          )}
        </>
      )}
      {open && <VisitDetail id={open} canVoid onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  )
}
