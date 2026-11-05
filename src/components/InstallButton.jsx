import { useEffect, useState } from 'react'
import { onInstall, promptInstall } from '../install'
import { Button, Sheet } from './ui'

const DownloadIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <rect x="4" y="18" width="16" height="3" rx="1.5" />
  </svg>
)

// The "Download the app" button. Hidden once the app is installed.
//   variant 'glass'  full-width button for the dark sign-in screen
//   variant 'icon'   round icon for the dark headers
export default function InstallButton({ variant = 'icon' }) {
  const [st, setSt] = useState({ canPrompt: false, installed: false, ios: false })
  const [help, setHelp] = useState(false)
  const [done, setDone] = useState(false)
  useEffect(() => onInstall(setSt), [])

  if (st.installed || done) return null

  async function click() {
    if (st.canPrompt) {
      const r = await promptInstall()
      if (r === 'accepted') setDone(true)
      if (r !== 'unavailable') return
    }
    setHelp(true)
  }

  return (
    <>
      {variant === 'glass' ? (
        <button
          type="button"
          onClick={click}
          className="w-full h-12 rounded-full border border-gold/45 bg-gold/10 text-gold font-semibold inline-flex items-center justify-center gap-2 backdrop-blur-md transition-colors hover:bg-gold hover:text-ink"
        >
          <DownloadIcon />
          Download the app
        </button>
      ) : (
        <button
          type="button"
          onClick={click}
          aria-label="Download the app"
          title="Download the app"
          className="btn-hover shrink-0 inline-flex items-center justify-center gap-1.5 h-10 w-10 lg:w-auto lg:px-4 rounded-full border border-gold/50 text-gold text-sm font-semibold hover:bg-gold hover:text-ink"
        >
          <DownloadIcon size={17} />
          <span className="hidden lg:inline">Download app</span>
        </button>
      )}

      {help && (
        <Sheet title="Download the app" onClose={() => setHelp(false)} footer={<Button onClick={() => setHelp(false)}>Got it</Button>}>
          <p className="text-sm text-ink/70">Spot Win installs from this page, with no app store. It then opens from its own icon, full screen.</p>
          <ol className="space-y-2.5 text-sm">
            {(st.ios
              ? [
                  <>Open this page in <b>Safari</b>.</>,
                  <>Tap the <b>Share</b> button (the square with an arrow pointing up) at the bottom of the screen.</>,
                  <>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</>,
                ]
              : [
                  <>Open this page in <b>Chrome</b>.</>,
                  <>Tap the <b>⋮</b> menu at the top right.</>,
                  <>Tap <b>Install app</b> or <b>Add to Home screen</b>, then <b>Install</b>.</>,
                ]
            ).map((t, i) => (
              <li key={i} className="flex gap-3 rounded-2xl bg-mist px-4 py-3">
                <b className="font-serif text-lg leading-none text-gold-dark mt-0.5">{i + 1}</b>
                <span>{t}</span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-ink/50">The Spot Win icon then appears on the home screen. Sign in once and it stays signed in.</p>
        </Sheet>
      )}
    </>
  )
}
