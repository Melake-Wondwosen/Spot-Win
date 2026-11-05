import { useState } from 'react'
import { lookAgain } from '../location'
import { checkDev } from '../guard'
import { isIOS, isStandalone } from '../install'
import { Spinner } from './ui'

// The only page Spot Win shows while location is off or developer mode is on.
// Both clear by themselves once the problem is fixed.

const UA = navigator.userAgent
const IOS = isIOS()
const ANDROID = /Android/i.test(UA)
const PHONE = IOS || ANDROID || /Mobi/i.test(UA)
const MAC = !IOS && /Macintosh|Mac OS X/i.test(UA)

function Warning({ icon, title, text, steps, action, onAction, foot }) {
  const [busy, setBusy] = useState(false)
  async function run() {
    setBusy(true)
    try {
      await onAction()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div role="alert" className="anim-fade fixed inset-0 z-[9999] bg-ink text-paper overflow-y-auto">
      <div className="min-h-full flex flex-col items-center justify-center px-7 py-10 text-center safe-top safe-bottom">
        <span className="w-20 h-20 rounded-full gold-gradient text-ink flex items-center justify-center anim-pop">{icon}</span>
        <h1 className="font-serif text-2xl mt-6 anim-rise">{title}</h1>
        <p className="text-paper/70 mt-2 max-w-sm anim-rise">{text}</p>
        {steps?.length > 0 && (
          <ol className="mt-6 max-w-sm w-full text-left space-y-2.5 text-sm stagger">
            {steps.map((t, i) => (
              <li key={i} style={{ '--i': i }} className="flex gap-3 rounded-2xl bg-paper/[0.06] border border-paper/10 px-4 py-3">
                <b className="text-gold font-serif text-lg leading-none mt-0.5">{i + 1}</b>
                <span className="text-paper/85">{t}</span>
              </li>
            ))}
          </ol>
        )}
        <button type="button" onClick={run} disabled={busy} className="glass-button max-w-sm mt-7">
          {busy ? <Spinner /> : action}
        </button>
        {foot && <p className="text-xs text-paper/45 mt-4 max-w-xs">{foot}</p>}
      </div>
    </div>
  )
}

const Pin = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 21s-7-6.2-7-12a7 7 0 1 1 14 0c0 5.8-7 12-7 12z" />
    <circle cx="12" cy="9" r="2.5" />
  </svg>
)

const Tools = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m8 8-4 4 4 4" />
    <path d="m16 8 4 4-4 4" />
    <path d="m13.5 5-3 14" />
  </svg>
)

// Switch the device's location on, and allow it for Spot Win. `allowIf` is the
// same as `allow`, worded as the second step when the site isn't known to be blocked.
function locationSteps() {
  if (IOS) {
    const allow = 'In the same list, open Safari Websites (or your browser) and choose While Using the App.'
    return { device: 'Open Settings > Privacy & Security > Location Services and turn it on.', allow, allowIf: allow, deviceFirst: true }
  }
  if (ANDROID) {
    const device = 'Pull down from the top of the screen and tap Location to turn it on.'
    return isStandalone()
      ? { device, allow: 'Open Chrome, tap ⋮ > Settings > Site settings > Location and allow Spot Win.', allowIf: 'If Spot Win is blocked: open Chrome, tap ⋮ > Settings > Site settings > Location and allow it.' }
      : { device, allow: 'Tap the icon next to the web address, open Permissions and allow Location.', allowIf: 'If the site is blocked: tap the icon next to the web address, open Permissions and allow Location.' }
  }
  return {
    device: MAC
      ? 'Open System Settings > Privacy & Security > Location Services, turn it on and allow your browser.'
      : 'Open Windows Settings > Privacy & security > Location and turn on Location services.',
    allow: 'Click the icon left of the web address and set Location to Allow.',
    allowIf: 'If the site is blocked: click the icon left of the web address and set Location to Allow.',
  }
}

export function LocationGate({ state, reason }) {
  if (reason === 'unsupported') {
    return (
      <Warning
        icon={<Pin />}
        title="Location not available"
        text="This browser can't share location, so Spot Win can't open here."
        steps={['Open Spot Win in Chrome.']}
        action="Try again"
        onAction={() => window.location.reload()}
      />
    )
  }
  const { device, allow, allowIf, deviceFirst } = locationSteps()
  const foot = PHONE ? null : 'Keep Wi-Fi on. A computer uses it to find where it is.'
  if (state === 'ask') {
    return (
      <Warning
        icon={<Pin />}
        title="Allow your location"
        text="Spot Win only works with location on. Tap Allow location, then choose Allow."
        steps={[device]}
        action="Allow location"
        onAction={() => lookAgain(true)}
        foot={foot}
      />
    )
  }
  return (
    <Warning
      icon={<Pin />}
      title="Turn on your location"
      text="Spot Win only works with location on. It opens again by itself as soon as location is back."
      steps={reason === 'blocked' && !deviceFirst ? [allow, device] : [device, allowIf]}
      action="Try again"
      onAction={() => lookAgain(true)}
      foot={foot}
    />
  )
}

export function DevGate({ reason }) {
  let text
  let steps
  if (reason === 'automation') {
    text = 'This browser is being run by a program.'
    steps = ['Close this window.', 'Open Spot Win again in a normal browser window.']
  } else if (reason === 'location') {
    text = PHONE ? 'Something on this phone is changing your location.' : 'Something in this browser is changing your location.'
    steps = PHONE
      ? ['Close any app that changes your location, like a fake GPS app.', 'Open Settings, find Developer options and switch it off.', 'Press Reload.']
      : ['Turn off any browser add-on that changes your location.', 'Press Reload.']
  } else {
    text = PHONE ? 'This phone is connected to developer tools.' : 'Developer tools are open in this browser.'
    steps = PHONE
      ? ['Unplug the phone from the computer.', 'Open Settings, find Developer options and switch it off.', 'Spot Win comes back by itself.']
      : ['Close the developer tools: press F12, or click the X on the tools panel.', 'Spot Win comes back by itself.']
  }
  const reload = reason !== 'tools'
  return (
    <Warning
      icon={<Tools />}
      title="Turn off developer mode"
      text={`${text} Spot Win doesn't work while it's on.`}
      steps={steps}
      action={reload ? 'Reload' : 'Check again'}
      onAction={reload ? () => window.location.reload() : checkDev}
    />
  )
}
