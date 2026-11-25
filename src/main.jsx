import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { startGuard } from './guard'
import { startLocationGate } from './location'
import { startHover } from './hover'
import { persistStorage } from './db'
import { startInstallWatch } from './install'
import { startUpdateWatch } from './update'
import { startClock } from './clock'
import { DEMO } from './config'
import { melaStart } from './mela'
import './index.css'

startGuard()
startLocationGate()
startInstallWatch()
startHover()
if (!DEMO) startUpdateWatch()
if (!DEMO && !import.meta.env.DEV) startClock()
persistStorage()

// Opened from MELA: sign in with its ticket first, then show the app.
melaStart().finally(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

// Keeps the app shell on the phone so it opens instantly and with no signal
if (!DEMO && !import.meta.env.DEV && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
