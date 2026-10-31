import { useEffect, useRef, useState } from 'react'

// Full-screen photo with pinch to zoom, drag to pan, double tap (or double
// click) to zoom in and out, and the mouse wheel on a laptop.
export default function Zoom({ src, caption, onClose }) {
  const [t, setT] = useState({ s: 1, x: 0, y: 0 })
  const pts = useRef(new Map())
  const start = useRef(null)
  const lastTap = useRef(0)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const clamp = (s) => Math.min(6, Math.max(1, s))

  function down(e) {
    e.currentTarget.setPointerCapture(e.pointerId)
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const p = [...pts.current.values()]
    if (p.length === 2) start.current = { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), s: t.s, x: t.x, y: t.y }
    else start.current = { px: e.clientX, py: e.clientY, x: t.x, y: t.y, s: t.s }
    if (p.length === 1) {
      const now = Date.now()
      if (now - lastTap.current < 280) setT((o) => (o.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2.5, x: 0, y: 0 }))
      lastTap.current = now
    }
  }
  function move(e) {
    if (!pts.current.has(e.pointerId)) return
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const p = [...pts.current.values()]
    const st = start.current
    if (!st) return
    if (p.length === 2 && st.d) {
      const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)
      setT({ s: clamp((st.s * d) / st.d), x: st.x, y: st.y })
    } else if (p.length === 1 && st.px != null && t.s > 1) {
      setT({ s: t.s, x: st.x + (e.clientX - st.px), y: st.y + (e.clientY - st.py) })
    }
  }
  function up(e) {
    pts.current.delete(e.pointerId)
    const p = [...pts.current.values()]
    if (p.length === 1) start.current = { px: p[0].x, py: p[0].y, x: t.x, y: t.y, s: t.s }
    else start.current = null
    if (t.s <= 1.02) setT({ s: 1, x: 0, y: 0 })
  }
  function wheel(e) {
    setT((o) => {
      const s = clamp(o.s * (e.deltaY < 0 ? 1.15 : 0.87))
      return s === 1 ? { s, x: 0, y: 0 } : { ...o, s }
    })
  }

  return (
    <div className="anim-fade fixed inset-0 z-[4000] bg-ink/95 flex flex-col safe-top safe-bottom">
      <div className="flex items-center justify-between px-4 py-3 text-paper">
        <p className="text-sm text-paper/70 truncate">{caption}</p>
        <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 rounded-full text-3xl leading-none hover:bg-paper/10">
          ×
        </button>
      </div>
      <div className="zoom-stage flex-1 relative overflow-hidden select-none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel}>
        <img
          src={src}
          alt=""
          draggable="false"
          className="absolute inset-0 m-auto max-w-full max-h-full object-contain"
          style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`, transition: pts.current.size ? 'none' : 'transform 0.25s cubic-bezier(.22,1,.36,1)' }}
        />
      </div>
      <p className="text-center text-xs text-paper/40 pb-2">Pinch or double tap to zoom</p>
    </div>
  )
}
