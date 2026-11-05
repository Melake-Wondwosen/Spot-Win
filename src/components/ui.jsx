import { useEffect } from 'react'
import { getFix } from '../location'
import logo from '../assets/logo.png'
import pattern from '../assets/pattern.png'
import face from '../assets/face.png'
import spotWinLogo from '../assets/spotwin-logo.png'

export function Emblem({ className = '' }) {
  return <img src={face} alt="Habesha" className={className} draggable="false" />
}

export function Logo({ className = '', ...rest }) {
  return <img src={logo} alt="Habesha" className={className} draggable="false" {...rest} />
}

// Sign-in logo: the Spot Win wordmark with her eyes redrawn as shapes so they
// can move. Coordinates are in the PNG's own pixels (720 x 482).
//   idle      looks straight at you
//   watch     follows the text as you type (squints at a password)
//   confused  the logo tilts, one eye half shuts, a "?" appears
const LOGO_W = 720
const LOGO_H = 482
const EYES = [372.4, 425.6] // centre x of each eye; both sit at y 184
const EYE_Y = 184
const SKIN = 'rgb(126, 73, 30)'
const almond = (cx) => `M${cx - 16} ${EYE_Y}Q${cx} ${EYE_Y - 12.5} ${cx + 16} ${EYE_Y - 0.5}Q${cx} ${EYE_Y + 12} ${cx - 16} ${EYE_Y}Z`

export function WatchingLogo({ mood = 'idle', field = null, progress = 0, glow = false, className = '', ...rest }) {
  const watching = mood === 'watch'
  const confused = mood === 'confused'
  // Pupils: across with the text, down towards the form while typing
  const px = watching ? -5 + 10 * Math.min(1, progress) : confused ? 1.5 : 0
  const py = watching ? (field === 'password' ? 2.4 : 1.8) : confused ? -1.5 : 0
  // Upper lids: 0 open, 1 shut
  const lid = (i) => (watching && field === 'password' ? 0.55 : confused && i === 1 ? 0.6 : 0)

  return (
    <div className={`relative ${className}`} {...rest}>
      <div className="face-tilt relative" style={{ transform: confused ? 'rotate(-5deg)' : 'rotate(0deg)' }}>
        <img src={spotWinLogo} alt="Spot Win" width={LOGO_W} height={LOGO_H} className={`block w-full h-auto ${glow ? 'logo-night' : ''}`} draggable="false" />
        <svg viewBox={`0 0 ${LOGO_W} ${LOGO_H}`} aria-hidden="true" className="absolute inset-0 w-full h-full">
          <defs>
            {EYES.map((cx, i) => (
              <clipPath key={i} id={`eye-clip-${i}`}>
                <path d={almond(cx)} />
              </clipPath>
            ))}
          </defs>
          {EYES.map((cx, i) => (
            <g key={i}>
              {/* skin over the eye painted in the picture */}
              <ellipse cx={cx} cy={EYE_Y} rx="19.5" ry="9.6" fill={SKIN} />
              <path d={almond(cx)} fill="rgb(212, 234, 247)" />
              <g clipPath={`url(#eye-clip-${i})`}>
                <g className="eye-move" style={{ transform: `translate(${px}px, ${py}px)` }}>
                  <circle cx={cx} cy={EYE_Y} r="6.4" fill="#1d1612" />
                  <circle cx={cx + 2.3} cy={EYE_Y - 1.8} r="1.3" fill="#fff" />
                </g>
                <rect className="eye-lid" x={cx - 17} y={EYE_Y - 7} width="34" height="11" fill={SKIN} stroke="#1b120b" strokeWidth="1.6" style={{ transform: `scaleY(${lid(i)})` }} />
              </g>
              <path d={almond(cx)} fill="none" stroke="#1b120b" strokeWidth="2.6" strokeLinejoin="round" />
            </g>
          ))}
        </svg>
      </div>
      <span
        aria-hidden="true"
        className={`absolute left-[70%] top-[2%] font-serif font-bold text-4xl text-gold transition-all duration-300 ${confused ? 'opacity-100 scale-100 rotate-12' : 'opacity-0 scale-50 rotate-0'}`}
      >
        ?
      </span>
    </div>
  )
}

export function Pattern({ className = '', ...rest }) {
  return <img src={pattern} alt="" aria-hidden="true" className={`block w-full max-w-xs mx-auto ${className}`} draggable="false" {...rest} />
}

// Moving version of the pattern band for the sign-in screen. The diamonds are
// drawn as shapes so each one can move: the band drifts sideways in a seamless
// loop, the motifs swell in a wave, and a light glint passes over them.
const PT_UNIT = 180
const pd = (cx, cy, r) => `M${cx} ${cy - r}L${cx + r} ${cy}L${cx} ${cy + r}L${cx - r} ${cy}Z`

function PatternUnit({ x, i }) {
  const big = x + 50
  const mid = x + 140
  return (
    <g>
      <g className="pt-pulse" style={{ animationDelay: `${(i * 2) * 0.35}s` }}>
        <path d={pd(big, 56, 44)} />
        <path d={pd(big, 56, 32)} />
        <path d={pd(big, 56, 20)} />
        <path d={pd(big, 56, 8)} className="pt-solid" />
      </g>
      {[[-46, -34], [46, -34], [-46, 34], [46, 34]].map(([dx, dy], k) => (
        <path key={k} d={pd(big + dx, 56 + dy, 6)} className="pt-twinkle" style={{ animationDelay: `${(i * 2 + k * 0.5) * 0.35}s` }} />
      ))}
      <g className="pt-pulse" style={{ animationDelay: `${(i * 2 + 1) * 0.35}s` }}>
        <path d={pd(mid, 56, 22)} />
        <path d={pd(mid, 56, 11)} />
        <path d={pd(mid, 56, 4)} className="pt-solid" />
      </g>
      {[[0, -36], [0, 36], [-32, 0], [32, 0]].map(([dx, dy], k) => (
        <path key={k} d={pd(mid + dx, 56 + dy, 5)} className="pt-twinkle" style={{ animationDelay: `${(i * 2 + 1 + k * 0.5) * 0.35}s` }} />
      ))}
    </g>
  )
}

export function MovingPattern({ className = '', units = 4, ...rest }) {
  const w = units * PT_UNIT
  const strip = Array.from({ length: units * 2 }, (_, i) => <PatternUnit key={i} x={i * PT_UNIT} i={i % units} />)
  return (
    <div aria-hidden="true" className={`pt-band relative overflow-hidden ${className}`} {...rest}>
      <svg viewBox={`0 0 ${w} 112`} className="block w-full h-auto" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="pt-gold" x1="0" y1="0" x2={w * 2} y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#d9bc6a" />
            <stop offset="0.5" stopColor="#b58a35" />
            <stop offset="1" stopColor="#d9bc6a" />
          </linearGradient>
        </defs>
        <g className="pt-drift" style={{ '--pt-shift': `-${w}px` }} fill="none" stroke="url(#pt-gold)" strokeWidth="5" strokeLinejoin="miter">
          {strip}
        </g>
      </svg>
      <span className="pt-glint pointer-events-none absolute inset-y-0 -left-1/3 w-1/3" />
    </div>
  )
}

export function Button({ variant = 'primary', className = '', ...props }) {
  const base =
    'w-full min-h-[52px] rounded-2xl px-5 text-[17px] font-semibold active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 disabled:cursor-not-allowed'
  const styles = {
    primary: 'bg-ink text-paper shadow-sm hover:bg-ink-soft',
    gold: 'gold-gradient text-ink shadow-sm hover:shadow-md',
    ghost: 'bg-transparent text-ink border border-ink/20 hover:border-ink/40',
    quiet: 'bg-transparent text-ink/70 underline underline-offset-4 min-h-[44px] hover:text-ink',
    danger: 'bg-ink text-paper hover:bg-ink-soft',
  }
  return <button type="button" className={`${base} ${variant === 'quiet' ? '' : 'btn-hover'} ${styles[variant]} ${className}`} {...props} />
}

// Icon only on narrow phones, icon and word from 380px up
export function SignOutButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Sign out"
      className="btn-hover shrink-0 inline-flex items-center justify-center gap-1.5 text-sm text-paper/85 border border-paper/25 rounded-full w-10 sm:w-auto sm:px-4 h-10 hover:bg-paper hover:text-ink hover:border-paper"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="m16 17 5-5-5-5" />
        <path d="M21 12H9" />
      </svg>
      <span className="hidden sm:inline">Sign out</span>
    </button>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-ink/80 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-ink/50 mt-1">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full min-h-[52px] rounded-xl bg-white border border-ink/15 px-4 text-[17px] text-ink placeholder:text-ink/35 outline-none transition focus:border-gold focus:ring-4 focus:ring-gold/20'

export function Spinner() {
  return <span className="inline-block w-5 h-5 border-2 border-current border-r-transparent rounded-full animate-spin align-[-3px]" />
}

export function Notice({ tone = 'error', children, className = '' }) {
  const tones = {
    error: 'bg-paper border-ink/15 border-l-4 border-l-gold text-ink',
    ok: 'bg-gold/10 border-gold/40 text-ink',
    info: 'bg-white border-gold/50 text-ink',
  }
  return <p className={`anim-rise rounded-xl border text-sm px-4 py-3 ${tones[tone]} ${className}`}>{children}</p>
}

// Bottom sheet on phones, centred dialog on wider screens
export function Sheet({ title, onClose, children, footer }) {
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

  return (
    <div className="fixed inset-0 z-[2000] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-ink/45 backdrop-blur-[2px] anim-fade" onClick={onClose} />
      <div role="dialog" aria-label={title} className="anim-sheet relative w-full md:max-w-lg max-h-[92vh] flex flex-col bg-paper rounded-t-3xl md:rounded-3xl shadow-2xl">
        <div className="md:hidden mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-ink/15" />
        <div className="flex items-center justify-between px-5 pt-3 md:pt-5">
          <h2 className="font-serif text-xl">{title}</h2>
          <button type="button" onClick={onClose} className="w-10 h-10 -mr-2 rounded-full text-2xl text-ink/60 hover:bg-ink/5" aria-label="Close">
            ×
          </button>
        </div>
        {children ? <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">{children}</div> : <div className="h-3" />}
        {footer && <div className="px-5 pt-2 pb-5 safe-bottom border-t border-ink/10">{footer}</div>}
      </div>
    </div>
  )
}

export function Segmented({ value, onChange, options, className = '' }) {
  return (
    <div className={`grid gap-1 rounded-2xl bg-mist p-1 ${className}`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`min-h-[42px] min-w-0 px-1 rounded-xl text-[13px] min-[380px]:text-sm font-semibold truncate ${value === o.value ? 'bg-ink text-paper shadow-sm' : 'tab-hover text-ink/70 hover:text-ink hover:bg-white'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// Number helpers
export const birr = (n) => (n == null || n === '' || isNaN(Number(n)) ? '–' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }))
export const whole = (n) => (n == null || n === '' || isNaN(Number(n)) ? '–' : Math.round(Number(n)).toLocaleString('en-US'))
export const amountText = (unit, amount) => (unit === 'Crate' ? `${whole(amount)} ${Number(amount) === 1 ? 'crate' : 'crates'}` : `${birr(amount)} Birr`)

export const initials = (name) =>
  String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

// The user's badge: initials inside a gold ring
export function Avatar({ name, className = 'w-10 h-10 text-xs sm:w-11 sm:h-11 sm:text-sm', dark = true }) {
  return (
    <span className={`relative shrink-0 rounded-full p-[2px] gold-gradient ${className.includes('w-') ? '' : 'w-11 h-11'} ${className}`}>
      <span className={`w-full h-full rounded-full flex items-center justify-center font-bold tracking-wide ${dark ? 'bg-ink text-gold' : 'bg-white text-ink'}`}>{initials(name)}</span>
    </span>
  )
}

// Full-screen help when the phone has refused location to this site
export function LocationBlocked({ onRetry, busy }) {
  const ios = /iPhone|iPad/.test(navigator.userAgent)
  return (
    <div className="anim-fade fixed inset-0 z-[3000] bg-ink text-paper flex flex-col items-center justify-center px-7 text-center safe-top safe-bottom">
      <span className="relative w-20 h-20 rounded-full gold-gradient text-ink flex items-center justify-center anim-pop">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 21s-7-6.2-7-12a7 7 0 1 1 14 0c0 5.8-7 12-7 12z" />
          <circle cx="12" cy="9" r="2.5" />
        </svg>
      </span>
      <h1 className="font-serif text-2xl mt-6 anim-rise">Turn on location</h1>
      <p className="text-paper/70 mt-2 max-w-sm anim-rise">Spot Win records where each visit happens, so it can't work with location off.</p>
      <ol className="mt-6 max-w-sm w-full text-left space-y-2.5 text-sm stagger">
        {(ios
          ? ['Open Settings > Privacy & Security > Location Services and turn it on.', 'Scroll to your browser (Safari or Chrome) and choose While Using the App.', 'Come back here and press Try again.']
          : ['Pull down from the top of the screen and turn on Location.', 'Tap the lock or settings icon next to the web address, open Permissions, and set Location to Allow.', 'Come back here and press Try again.']
        ).map((t, i) => (
          <li key={i} style={{ '--i': i }} className="flex gap-3 rounded-2xl bg-paper/[0.06] border border-paper/10 px-4 py-3">
            <b className="text-gold font-serif text-lg leading-none mt-0.5">{i + 1}</b>
            <span className="text-paper/85">{t}</span>
          </li>
        ))}
      </ol>
      <button type="button" onClick={onRetry} disabled={busy} className="glass-button max-w-sm mt-7">
        {busy ? <Spinner /> : 'Try again'}
      </button>
    </div>
  )
}

export async function retryLocation() {
  try {
    return await getFix()
  } catch (err) {
    return err
  }
}

export function Toast({ toast }) {
  if (!toast) return null
  return (
    <div key={toast.id} className="fixed bottom-5 inset-x-0 z-[2500] flex justify-center px-4 pointer-events-none">
      <p className="anim-rise rounded-full bg-ink text-paper text-sm px-5 py-3 shadow-xl border border-gold/30">{toast.text}</p>
    </div>
  )
}
