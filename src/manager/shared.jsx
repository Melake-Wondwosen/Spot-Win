import { useMemo, useState } from 'react'
import { periodRange } from '../time'

// Today / 7 days / 30 days / All, or a From and To range
export function usePeriod(initial = 'today') {
  const [period, setPeriod] = useState(initial)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const range = useMemo(() => periodRange(period, from, to), [period, from, to])
  const props = {
    value: period,
    from,
    to,
    onChange: (k) => {
      setPeriod(k)
      setFrom('')
      setTo('')
    },
    onDates: (f, t) => {
      setFrom(f)
      setTo(t)
      setPeriod(f || t ? 'custom' : 'today')
    },
  }
  return { period, range, props }
}

// One number tile. Gold tiles are black with gold labels.
export function Tile({ i, label, value, sub, live, gold }) {
  return (
    <div className={`tilt spot rounded-2xl border px-3 py-2.5 sm:px-4 sm:py-3.5 min-w-0 ${gold ? 'bg-ink text-paper border-ink spot-dark' : 'bg-white border-ink/10'}`} style={{ '--i': i }} data-tilt="6">
      <p className={`text-[10px] sm:text-[11px] leading-tight uppercase tracking-[0.1em] sm:tracking-[0.14em] flex items-center gap-1.5 min-h-[2.4em] sm:min-h-0 ${gold ? 'text-gold' : 'text-gold-dark'}`}>
        {live && <span className="w-2 h-2 rounded-full bg-gold live-dot shrink-0" />}
        {label}
      </p>
      <p key={String(value)} className="tilt-pop font-serif text-[22px] sm:text-[28px] leading-tight mt-0.5 sm:mt-1 truncate tabular anim-count">
        {value}
      </p>
      {sub && <p className={`text-[11px] sm:text-xs truncate ${gold ? 'text-paper/50' : 'text-ink/50'}`}>{sub}</p>}
    </div>
  )
}

