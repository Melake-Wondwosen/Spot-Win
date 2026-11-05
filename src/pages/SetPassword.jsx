import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { changePassword, keepPassword } from '../api'
import { clearUser, getUser, setUser } from '../storage'
import { homeFor } from '../roles'
import { MovingPattern, Spinner, WatchingLogo } from '../components/ui'

// First sign-in, or after an admin set a new password: the user picks their
// own before anything else opens. Same dark look as the sign-in screen.
export default function SetPassword() {
  const navigate = useNavigate()
  const user = getUser()
  const [pw, setPw] = useState('')
  const [again, setAgain] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [shake, setShake] = useState(0)
  const [face, setFace] = useState({ mood: 'idle', field: null, progress: 0 })
  const idle = useRef(null)
  useEffect(() => () => clearTimeout(idle.current), [])

  if (!user?.token) return <Navigate to="/login" replace />
  if (!user.mustChange && !done) return <Navigate to={homeFor(user)} replace />

  function watch(value) {
    setFace({ mood: 'watch', field: 'password', progress: value.length / 16 })
    clearTimeout(idle.current)
    idle.current = setTimeout(() => setFace((f) => ({ ...f, mood: 'idle' })), 1300)
  }

  const long = pw.length >= 6
  const noSpace = !/\s/.test(pw)
  const same = pw !== '' && pw === again
  const ready = long && noSpace && same

  async function submit(e) {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError('')
    try {
      await changePassword(pw)
      setDone(true)
      setUser({ ...user, mustChange: false })
      setTimeout(() => navigate(homeFor(user), { replace: true }), 900)
    } catch (err) {
      setError(err.message)
      setFace({ mood: 'confused', field: null, progress: 0 })
      setShake((n) => n + 1)
      setBusy(false)
    }
  }

  // Keeps the password they were given. If the server can't be reached they
  // still carry on, and the screen comes back at their next sign-in.
  async function keep() {
    setBusy(true)
    try {
      await keepPassword()
    } catch {
      // carry on anyway
    }
    setUser({ ...user, mustChange: false })
    navigate(homeFor(user), { replace: true })
  }

  function signOut() {
    clearUser()
    navigate('/login', { replace: true })
  }

  const rule = (ok, text) => (
    <li className={`flex items-center gap-2 transition-colors duration-300 ${ok ? 'text-gold' : 'text-paper/50'}`}>
      <span className={`w-4 h-4 rounded-full flex items-center justify-center border transition-all duration-300 ${ok ? 'bg-gold border-gold text-ink scale-100' : 'border-paper/30 scale-90'}`}>
        {ok && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        )}
      </span>
      {text}
    </li>
  )

  return (
    <main className="login-glass min-h-full flex flex-col safe-top safe-bottom relative overflow-hidden bg-ink text-paper">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <span className="glow glow-a" />
        <span className="glow glow-b" />
        <span className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.75)_100%)]" />
        <span className="grain absolute inset-0" />
      </div>

      <div className="relative flex-1 flex flex-col justify-center px-6 py-8 max-w-md w-full mx-auto stagger">
        <div className="relative mx-auto" style={{ '--i': 0 }}>
          <WatchingLogo className="relative w-[min(56vw,220px)]" glow mood={face.mood} field={face.field} progress={face.progress} />
        </div>
        <MovingPattern className="mt-4 -mx-6" style={{ '--i': 1 }} />

        {done ? (
          <div className="text-center mt-8 anim-rise">
            <span className="anim-pop inline-flex w-16 h-16 rounded-full gold-gradient text-ink items-center justify-center">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                <path className="anim-draw" d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <h1 className="font-serif text-2xl mt-4">Password saved</h1>
            <p className="text-paper/60 mt-1">Use it from now on to sign in.</p>
          </div>
        ) : (
          <>
            <div style={{ '--i': 2 }} className="text-center mt-6">
              <h1 className="text-[26px] leading-tight font-bold tracking-tight">Choose your password</h1>
              <p className="text-paper/60 mt-1.5 text-[15px]">
                Welcome, {user.name.split(' ')[0]}. Pick a password only you know, or keep the one you were given.
              </p>
            </div>

            <form key={shake} onSubmit={submit} className={`mt-6 space-y-3.5 ${shake ? 'anim-shake' : ''}`} style={{ '--i': 3 }}>
              <PwField placeholder="New password" value={pw} show={show} onShow={() => setShow((v) => !v)} autoFocus onChange={(v) => { setPw(v); watch(v) }} />
              <PwField placeholder="Type it again" value={again} show={show} onChange={(v) => { setAgain(v); watch(v) }} />

              <ul className="text-[13px] space-y-1.5 px-2 pt-1">
                {rule(long, 'At least 6 characters')}
                {rule(pw !== '' && noSpace, 'No spaces')}
                {rule(same, 'Both match')}
              </ul>

              {error && <p className="anim-rise rounded-2xl border border-gold/40 bg-gold/10 backdrop-blur-md text-paper text-sm px-4 py-3">{error}</p>}

              <button type="submit" disabled={!ready || busy} className="glass-button">
                {busy ? <Spinner /> : 'Save password'}
              </button>
            </form>

            <button type="button" onClick={keep} disabled={busy} className="mt-3 w-full h-[52px] rounded-full border border-paper/20 text-paper/85 font-semibold hover:border-gold hover:text-paper transition-colors" style={{ '--i': 4 }}>
              Keep my current password
            </button>
            <button type="button" onClick={signOut} className="link-hover mx-auto mt-5 text-sm text-paper/55 hover:text-paper" style={{ '--i': 5 }}>
              Not you? Sign out
            </button>
          </>
        )}
      </div>
    </main>
  )
}

function PwField({ placeholder, value, onChange, show, onShow, autoFocus }) {
  return (
    <label className="glass-field">
      <span className="sr-only">{placeholder}</span>
      <svg className="glass-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
        <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
      </svg>
      <input
        className={`glass-input ${onShow ? 'pr-14' : ''}`}
        placeholder={placeholder}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="new-password"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck="false"
        autoFocus={autoFocus}
      />
      {onShow && (
        <button type="button" onClick={onShow} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-paper/55 hover:text-paper">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
            {show && <path d="M4 4l16 16" />}
          </svg>
        </button>
      )}
    </label>
  )
}
