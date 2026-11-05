import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { getUser } from '../storage'
import { homeFor } from '../roles'
import { MovingPattern, WatchingLogo } from '../components/ui'
import SignInForm from '../components/SignInForm'
import InstallButton from '../components/InstallButton'

export default function Login() {
  const navigate = useNavigate()
  const current = getUser()
  // The logo watches you type, then looks puzzled once you stop
  const [face, setFace] = useState({ mood: 'idle', field: null, progress: 0 })
  const idle = useRef(null)
  useEffect(() => () => clearTimeout(idle.current), [])
  function watch(field, value, both) {
    setFace({ mood: 'watch', field, progress: value.length / 16 })
    clearTimeout(idle.current)
    idle.current = setTimeout(() => setFace((f) => ({ ...f, mood: both.username || both.password ? 'confused' : 'idle' })), 1300)
  }

  // Pressing Sign in: she looks at you; a failed sign-in puzzles her again
  function status(st) {
    clearTimeout(idle.current)
    setFace((f) => ({ ...f, mood: st === 'failed' ? 'confused' : 'idle' }))
  }

  const [step, setStep] = useState(current?.token && current.mustChange ? 'password' : 'signin')
  if (current?.token && !current.mustChange) return <Navigate to={homeFor(current)} replace />

  return (
    <main className="login-glass min-h-full flex flex-col safe-top safe-bottom relative overflow-hidden bg-ink text-paper">
      {/* Backdrop: drifting gold glows, a soft vignette and fine grain */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <span className="glow glow-a" />
        <span className="glow glow-b" />
        <span className="glow glow-c" />
        <span className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.75)_100%)]" />
        <span className="grain absolute inset-0" />
      </div>

      <div className="relative flex-1 flex flex-col justify-center px-6 py-8 max-w-md w-full mx-auto stagger">
        <div className="relative mx-auto" style={{ '--i': 0 }}>
          <span aria-hidden="true" className="absolute inset-0 -m-6 rounded-full bg-gold/25 blur-3xl" />
          <WatchingLogo className="relative w-[min(80vw,320px)]" glow mood={face.mood} field={face.field} progress={face.progress} />
        </div>
        <MovingPattern className="mt-5 -mx-6" style={{ '--i': 1 }} />
        <div style={{ '--i': 2 }} className="text-center mt-5">
          {step === 'password' ? (
            <p key="pw" className="anim-fade text-paper/70 text-[15px]">You can set your own password now, or skip and keep the one you were given.</p>
          ) : (
            <p className="text-paper/60 text-[15px]">Sign in to record your outlet visits</p>
          )}
        </div>
        <div className="mt-7" style={{ '--i': 3 }}>
          <SignInForm onWatch={watch} onStatus={status} onStep={setStep} onDone={(u) => navigate(homeFor(u), { replace: true })} />
        </div>
        {step === 'signin' && (
          <div className="mt-2" style={{ '--i': 4 }}>
            <InstallButton variant="glass" />
          </div>
        )}
      </div>
    </main>
  )
}
