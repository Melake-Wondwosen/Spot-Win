import { useState } from 'react'
import { isoDay } from '../time'

export const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'all', label: 'All' },
]

// Today / 7 days / 30 days / All, and a calendar button that opens a From and
// To date picker. On phones the buttons fill the width and the dates sit on
// their own labelled row, so nothing is squeezed.
export default function Period({ value, onChange, from, to, onDates, dark = true }) {
  const [open, setOpen] = useState(value === 'custom')
  const showDates = open || value === 'custom'
  const pill = dark ? 'bg-paper/10' : 'bg-mist'
  const on = 'gold-gradient text-ink shadow-sm'
  const off = dark ? 'text-paper/75 hover:text-paper hover:bg-paper/10' : 'text-ink/65 hover:text-ink hover:bg-white'
  const dateCls = `w-full min-w-0 h-10 rounded-xl px-3 text-sm outline-none border ${dark ? 'bg-paper/10 text-paper border-paper/15 [color-scheme:dark] focus:border-gold' : 'bg-white text-ink border-ink/15 focus:border-gold'}`
  const label = `block text-[11px] uppercase tracking-wider mb-1 ${dark ? 'text-paper/50' : 'text-ink/50'}`

  return (
    <div className="w-full sm:w-auto min-w-0">
      <div className={`grid grid-cols-[repeat(4,minmax(0,1fr))_40px] sm:inline-grid sm:grid-cols-[repeat(4,auto)_40px] rounded-full p-1 gap-0.5 w-full sm:w-auto ${pill}`}>
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              onChange(p.key)
              setOpen(false)
            }}
            className={`h-9 px-1 sm:px-4 rounded-full text-[13px] sm:text-sm font-semibold whitespace-nowrap transition-colors ${value === p.key ? on : off}`}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          aria-label="Pick dates"
          aria-expanded={showDates}
          onClick={() => setOpen((o) => !o)}
          className={`h-9 w-9 rounded-full flex items-center justify-center transition-colors ${value === 'custom' ? on : showDates ? (dark ? 'bg-paper/15 text-paper' : 'bg-white text-ink') : off}`}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
            <path d="M3.5 10h17M8 3v4M16 3v4" />
          </svg>
        </button>
      </div>

      {showDates && (
        <div className="anim-rise grid grid-cols-2 gap-2 mt-2 sm:max-w-sm">
          <label className="min-w-0">
            <span className={label}>From</span>
            <input type="date" className={dateCls} value={from || ''} max={to || isoDay()} onChange={(e) => onDates(e.target.value, to)} />
          </label>
          <label className="min-w-0">
            <span className={label}>To</span>
            <input type="date" className={dateCls} value={to || ''} min={from || undefined} max={isoDay()} onChange={(e) => onDates(from, e.target.value)} />
          </label>
        </div>
      )}
    </div>
  )
}
