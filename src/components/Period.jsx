import { isoDay } from '../time'

export const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'all', label: 'All' },
]

// Today / 7 days / 30 days / All, plus a From and To date picker
export default function Period({ value, onChange, from, to, onDates, dark = true }) {
  const pill = dark ? 'bg-paper/10' : 'bg-mist'
  const on = 'gold-gradient text-ink shadow-sm'
  const off = dark ? 'tab-hover text-paper/75 hover:text-paper' : 'tab-hover text-ink/65 hover:text-ink'
  const dateCls = `h-[34px] rounded-full px-3 text-sm outline-none border ${dark ? 'bg-paper/10 text-paper border-paper/15 [color-scheme:dark] focus:border-gold' : 'bg-white text-ink border-ink/15 focus:border-gold'}`
  return (
    <div className="flex flex-wrap items-center gap-2 min-w-0">
      <div className={`flex rounded-full p-1 ${pill}`}>
        {PERIODS.map((p) => (
          <button key={p.key} type="button" onClick={() => onChange(p.key)} className={`px-3 sm:px-4 min-h-[32px] rounded-full text-[13px] sm:text-sm font-semibold ${value === p.key ? on : off}`}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-sm">
        <input
          type="date"
          aria-label="From"
          className={dateCls}
          value={from || ''}
          max={to || isoDay()}
          onChange={(e) => onDates(e.target.value, to)}
        />
        <span className={dark ? 'text-paper/40' : 'text-ink/40'}>to</span>
        <input type="date" aria-label="To" className={dateCls} value={to || ''} min={from || undefined} max={isoDay()} onChange={(e) => onDates(from, e.target.value)} />
      </div>
    </div>
  )
}
