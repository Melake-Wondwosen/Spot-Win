import { useState } from 'react'
import { changePassword, keepPassword, login } from '../api'
import { getFix, locationMessage } from '../location'
import { getUser, setUser } from '../storage'
import { LocationBlocked, Spinner } from './ui'

// The sign-in form, styled as frosted glass for the dark sign-in screen.
// `onWatch` reports typing to the sign-in logo: (field, value, { username, password })
// `onStatus` reports 'signing' when Sign in is pressed and 'failed' if it doesn't work
// `onStep` reports 'signin' or 'password'. Someone still on the password they
// were given goes on to a second step in the same box: choose a new password
// or skip and keep the one they have.
export default function SignInForm({ onDone, onWatch, onStatus, onStep, submitLabel = 'Sign in' }) {
  const pending = getUser()
  const [step, setStepState] = useState(pending?.token && pending.mustChange ? 'password' : 'signin')
  const setStep = (s) => {
    setStepState(s)
    onStep?.(s)
  }
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [shake, setShake] = useState(0)
  // Location status under the button: '' | finding | found | none
  const [loc, setLoc] = useState('')
  const [blocked, setBlocked] = useState(false)
  const [retrying, setRetrying] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!username.trim() || !password) return
    setError('')
    onStatus?.('signing')

    // Location and time are captured at every sign-in. The server refuses sales
    // users without a fix; managers and admins on a PC may not have one, so
    // they get through. Wait at most 6 seconds first; a sales user without a
    // fix then gets 25 more seconds of GPS and a second try.
    setBusy('Getting your location…')
    setLoc('finding')
    let fix = null
    let fixError = null
    const getLocation = (ms) =>
      Promise.race([
        getFix()
          .then((f) => {
            setLoc('found')
            return f
          })
          .catch((err) => {
            fixError = err
            return null
          }),
        new Promise((r) => setTimeout(() => r(null), ms)),
      ])
    fix = await getLocation(6000)
    if (!fix) setLoc('finding')

    setBusy('Signing in…')
    try {
      let user
      try {
        user = await login(username, password, fix)
      } catch (err) {
        if (!/location is required/i.test(err.message)) throw err
        if (fixError?.code === 1) {
          setBlocked(true)
          throw err
        }
        setBusy('Getting your location…')
        fix = await getLocation(25000)
        if (!fix) {
          setLoc('none')
          throw err
        }
        setBusy('Signing in…')
        user = await login(username, password, fix)
      }
      setUser(user)
      setBusy('')
      if (user.mustChange) {
        onStatus?.('idle')
        setStep('password')
      } else onDone(user)
    } catch (err) {
      onStatus?.('failed')
      const isLocation = /location is required/i.test(err.message)
      setError(isLocation ? locationMessage(fixError) : err.message)
      if (!isLocation && loc !== 'found') setLoc('')
      // A wrong username or password shakes the form
      if (/wrong username or password/i.test(err.message)) setShake((n) => n + 1)
      setBusy('')
    }
  }

  if (step === 'password') return <NewPasswordStep onWatch={onWatch} onDone={onDone} />

  return (
    <>
    <form key={shake} onSubmit={submit} className={`space-y-3.5 ${shake ? 'anim-shake' : ''}`}>
      <label className="glass-field">
        <span className="sr-only">Username</span>
        <svg className="glass-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </svg>
        <input
          className="glass-input"
          placeholder="Username"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value)
            onWatch?.('username', e.target.value, { username: e.target.value, password })
          }}
          onFocus={(e) => onWatch?.('username', e.target.value, { username, password })}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck="false"
          required
        />
      </label>

      <label className="glass-field">
        <span className="sr-only">Password</span>
        <svg className="glass-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
          <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
        </svg>
        <input
          className="glass-input pr-14"
          placeholder="Password"
          type={showPw ? 'text' : 'password'}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            onWatch?.('password', e.target.value, { username, password: e.target.value })
          }}
          onFocus={(e) => onWatch?.('password', e.target.value, { username, password })}
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck="false"
          required
        />
        <button
          type="button"
          onClick={() => setShowPw((v) => !v)}
          aria-label={showPw ? 'Hide password' : 'Show password'}
          aria-pressed={showPw}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-paper/55 hover:text-paper"
        >
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
            {showPw && <path d="M4 4l16 16" />}
          </svg>
        </button>
      </label>

      {error && <p className="anim-rise rounded-2xl border border-gold/40 bg-gold/10 backdrop-blur-md text-paper text-sm px-4 py-3">{error}</p>}

      <button type="submit" disabled={!!busy || !username.trim() || !password} className="glass-button">
        {busy ? (
          <span className="inline-flex items-center gap-2">
            <Spinner /> {busy}
          </span>
        ) : (
          <span className="inline-flex items-center gap-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" className="sparkle text-gold-dark" fill="currentColor">
              <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" />
              <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
            </svg>
            {submitLabel}
          </span>
        )}
      </button>

      <p aria-live="polite" className="h-5 text-center text-[13px] text-paper/55">
        {loc === 'finding' && (
          <span className="anim-fade inline-flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" /> Finding your location...
          </span>
        )}
        {loc === 'found' && (
          <span className="anim-fade inline-flex items-center gap-1.5 text-gold">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            Location found
          </span>
        )}
        {loc === 'none' && <span className="anim-fade">No location yet</span>}
      </p>

    </form>
    {blocked && (
      <LocationBlocked
        busy={retrying}
        onRetry={async () => {
          setRetrying(true)
          try {
            await getFix()
            setBlocked(false)
            setError('')
            setLoc('found')
          } catch {
            // still blocked
          } finally {
            setRetrying(false)
          }
        }}
      />
    )}
    </>
  )
}

// Step two, in the same box: a new password, typed twice, or Skip
function NewPasswordStep({ onWatch, onDone }) {
  const user = getUser()
  const [pw, setPw] = useState('')
  const [again, setAgain] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(0)
  const ready = pw.length >= 6 && !/\s/.test(pw) && pw === again

  function finish() {
    const u = { ...getUser(), mustChange: false }
    setUser(u)
    onDone(u)
  }

  async function save(e) {
    e.preventDefault()
    if (!ready || busy) return
    setBusy('save')
    setError('')
    try {
      await changePassword(pw)
      finish()
    } catch (err) {
      setError(err.message)
      setShake((n) => n + 1)
      setBusy('')
    }
  }

  // Keeps the password they were given. If the server can't be reached they
  // carry on anyway, and the step comes back at their next sign-in.
  async function skip() {
    setBusy('skip')
    await keepPassword().catch(() => {})
    finish()
  }

  const hint = !pw ? 'At least 6 characters, no spaces' : pw.length < 6 ? 'At least 6 characters' : /\s/.test(pw) ? 'Leave out spaces' : again && pw !== again ? 'The two don\'t match yet' : again ? 'Both match' : 'Now type it again'

  return (
    <form key={shake} onSubmit={save} className={`space-y-3.5 anim-slide-r ${shake ? 'anim-shake' : ''}`}>
      <p className="text-center text-paper/80 text-[15px] -mt-1 mb-1">
        Signed in as <b className="text-gold">{user?.name}</b>
      </p>
      <label className="glass-field">
        <span className="sr-only">New password</span>
        <svg className="glass-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
          <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
        </svg>
        <input
          className="glass-input pr-14"
          placeholder="New password"
          type={show ? 'text' : 'password'}
          value={pw}
          onChange={(e) => {
            setPw(e.target.value)
            onWatch?.('password', e.target.value, { username: '', password: e.target.value })
          }}
          autoComplete="new-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck="false"
          autoFocus
        />
        <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-paper/55 hover:text-paper">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
            {show && <path d="M4 4l16 16" />}
          </svg>
        </button>
      </label>
      <label className="glass-field">
        <span className="sr-only">Type it again</span>
        <svg className="glass-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
          <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
        </svg>
        <input
          className="glass-input"
          placeholder="Type it again"
          type={show ? 'text' : 'password'}
          value={again}
          onChange={(e) => {
            setAgain(e.target.value)
            onWatch?.('password', e.target.value, { username: '', password: e.target.value })
          }}
          autoComplete="new-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck="false"
        />
      </label>

      <p className={`h-5 text-center text-[13px] transition-colors ${ready ? 'text-gold' : 'text-paper/55'}`}>{hint}</p>

      {error && <p className="anim-rise rounded-2xl border border-gold/40 bg-gold/10 backdrop-blur-md text-paper text-sm px-4 py-3">{error}</p>}

      <button type="submit" disabled={!ready || !!busy} className="glass-button">
        {busy === 'save' ? <Spinner /> : 'Save new password'}
      </button>
      <button type="button" onClick={skip} disabled={!!busy} className="link-hover block mx-auto text-sm text-paper/70 hover:text-paper min-h-[40px]">
        {busy === 'skip' ? <Spinner /> : 'Skip, keep my current password'}
      </button>
    </form>
  )
}
