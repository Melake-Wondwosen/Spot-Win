// One pointer listener for the whole app drives the hover effects in
// index.css: `.spot` gets a gold light that follows the pointer, `.tilt`
// leans toward it. Updates are batched to one per frame and only CSS
// variables change, so nothing re-renders and nothing reflows.
export function startHover() {
  if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  let frame = 0
  let ev = null
  let tilted = null

  function apply() {
    frame = 0
    const e = ev
    const t = e.target instanceof Element ? e.target : null
    const spot = t?.closest('.spot')
    if (spot) {
      const r = spot.getBoundingClientRect()
      spot.style.setProperty('--mx', `${e.clientX - r.left}px`)
      spot.style.setProperty('--my', `${e.clientY - r.top}px`)
    }
    const tilt = t?.closest('.tilt')
    if (tilted && tilted !== tilt) reset(tilted)
    tilted = tilt
    if (tilt) {
      const r = tilt.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width - 0.5
      const y = (e.clientY - r.top) / r.height - 0.5
      const max = Number(tilt.dataset.tilt || 7)
      tilt.style.setProperty('--rx', `${(x * max).toFixed(2)}deg`)
      tilt.style.setProperty('--ry', `${(-y * max).toFixed(2)}deg`)
    }
  }

  function reset(el) {
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
  }

  document.addEventListener(
    'pointermove',
    (e) => {
      ev = e
      if (!frame) frame = requestAnimationFrame(apply)
    },
    { passive: true },
  )
  document.addEventListener('pointerleave', () => tilted && reset(tilted), { passive: true })
}
