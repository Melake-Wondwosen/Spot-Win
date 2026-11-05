import { useEffect, useState } from 'react'
import { onInstall, promptInstall } from '../install'
import { getSettings, onSettings } from '../storage'
import { Button, Sheet } from './ui'

const DownloadIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <rect x="4" y="18" width="16" height="3" rx="1.5" />
  </svg>
)
const ShareIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="2.6" />
    <circle cx="6" cy="12" r="2.6" />
    <circle cx="18" cy="19" r="2.6" />
    <path d="m8.3 10.7 7.4-4.3M8.3 13.3l7.4 4.3" />
  </svg>
)

const LINK_TEXT = 'Download the Spot Win app. Open this link in Chrome (Safari on iPhone) and tap "Download the app".'

// Always visible, for everyone.
//   In a browser: Download, which installs the app (or shows the steps).
//   In the installed app: Share link, so the user can send it to their team.
// variants: 'banner' (card at the top of a screen), 'glass' (sign-in page), 'icon' (header)
export default function InstallButton({ variant = 'icon' }) {
  const [st, setSt] = useState({ canPrompt: false, installed: false, ios: false })
  const [help, setHelp] = useState(false)
  const [copied, setCopied] = useState(false)
  const [linkSheet, setLinkSheet] = useState(false)
  const [cardOn, setCardOn] = useState(() => getSettings().appCard !== 'off')
  useEffect(() => onInstall(setSt), [])
  useEffect(() => onSettings((s) => setCardOn(s.appCard !== 'off')), [])

  // The admin can turn the card off for everyone (Admin > App)
  if (variant === 'banner' && !cardOn) return null

  const link = `${location.origin}/login`
  const sharing = st.installed

  async function download() {
    if (st.canPrompt) {
      const r = await promptInstall()
      if (r !== 'unavailable') return
    }
    setHelp(true)
  }

  // The phone's own share menu (WhatsApp, Telegram, SMS...), else copy the link
  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Spot Win', text: LINK_TEXT, url: link })
        return
      }
    } catch (err) {
      if (err?.name === 'AbortError') return
    }
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setLinkSheet(true)
    }
  }

  const click = sharing ? share : download
  const Icon = sharing ? ShareIcon : DownloadIcon

  return (
    <>
      {variant === 'banner' ? (
        <section className="anim-rise relative overflow-hidden rounded-2xl bg-ink text-paper p-3.5 sm:p-4 flex items-center gap-3 shadow-[0_16px_32px_-20px_rgba(0,0,0,0.7)]">
          <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 w-40 h-40 rounded-full bg-gold/25 blur-2xl" />
          <span className="relative w-11 h-11 rounded-2xl gold-gradient text-ink flex items-center justify-center shrink-0">
            <Icon size={22} />
          </span>
          <span className="relative flex-1 min-w-0">
            <span className="block font-semibold leading-tight">{sharing ? 'Spot Win is installed' : 'Get the Spot Win app'}</span>
            <span className="block text-xs text-paper/60 mt-0.5">
              {sharing
                ? 'Send the link to your team so they can download it too.'
                : `Install it on this ${st.ios || /Android/.test(navigator.userAgent) ? 'phone' : 'computer'}. It opens from its own icon, full screen.`}
            </span>
          </span>
          <button type="button" onClick={click} className="btn-hover relative shrink-0 h-10 px-4 rounded-full gold-gradient text-ink text-sm font-bold">
            {sharing ? (copied ? 'Link copied' : 'Share link') : 'Download'}
          </button>
        </section>
      ) : variant === 'glass' ? (
        <button
          type="button"
          onClick={click}
          className="w-full h-12 rounded-full border border-gold/45 bg-gold/10 text-gold font-semibold inline-flex items-center justify-center gap-2 backdrop-blur-md transition-colors hover:bg-gold hover:text-ink"
        >
          <Icon />
          {sharing ? (copied ? 'Link copied' : 'Share the app link') : 'Download the app'}
        </button>
      ) : (
        <button
          type="button"
          onClick={click}
          aria-label={sharing ? 'Share the app link' : 'Download the app'}
          title={sharing ? 'Share the app link' : 'Download the app'}
          className="btn-hover shrink-0 inline-flex items-center justify-center gap-1.5 h-10 w-10 lg:w-auto lg:px-4 rounded-full border border-gold/50 text-gold text-sm font-semibold hover:bg-gold hover:text-ink"
        >
          <Icon size={17} />
          <span className="hidden lg:inline">{sharing ? (copied ? 'Copied' : 'Share app') : 'Download app'}</span>
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

      {linkSheet && (
        <Sheet title="Share the app link" onClose={() => setLinkSheet(false)} footer={<Button onClick={() => setLinkSheet(false)}>Done</Button>}>
          <p className="text-sm text-ink/70">Copy this link and send it to your team. They open it in Chrome (Safari on iPhone) and tap Download the app.</p>
          <input readOnly value={link} onFocus={(e) => e.target.select()} className="w-full h-12 rounded-xl border border-ink/15 px-4 text-[15px] font-semibold" />
        </Sheet>
      )}
    </>
  )
}
