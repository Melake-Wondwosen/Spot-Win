import { useState } from 'react'
import { Spinner } from './ui'

// One click: fetches every matching visit and downloads the .xlsx
export default function ExportButton({ filters, meta, dark = true, className = '' }) {
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  async function run() {
    setBusy('Preparing visits...')
    setMsg('')
    try {
      const { exportVisits } = await import('../export')
      const r = await exportVisits(filters(), setBusy, meta?.())
      setMsg(`${r.count.toLocaleString()} visits exported`)
    } catch (err) {
      setMsg(err.message)
    } finally {
      setBusy('')
      setTimeout(() => setMsg(''), 5000)
    }
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={run}
        disabled={!!busy}
        className={`btn-hover inline-flex items-center gap-2 rounded-full h-10 px-4 text-sm font-semibold whitespace-nowrap disabled:opacity-80 ${dark ? 'gold-gradient text-ink' : 'bg-ink text-paper hover:bg-ink-soft'}`}
      >
        {busy ? (
          <Spinner />
        ) : (
          <svg className="hop" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" />
            <path d="m7 10 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
        )}
        <span>{busy ? 'Exporting' : 'Export Excel'}</span>
      </button>
      {(busy || msg) && (
        <p className={`anim-fade absolute right-0 top-full mt-1.5 z-20 whitespace-nowrap rounded-full px-3 py-1 text-xs shadow-lg ${dark ? 'bg-paper text-ink' : 'bg-ink text-paper'}`}>{busy || msg}</p>
      )}
    </div>
  )
}
