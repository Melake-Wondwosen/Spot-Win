// Apps Script web app URL (apps-script/SpotWin.gs).
// Paste the URL ending in /exec from Deploy > New deployment > Web app.
export const API_URL = 'https://script.google.com/macros/s/AKfycbybqjHvqYD-r9VejJVVbbnRZvKE8rIkwA6j4ZTEP9J_O4p8vnmh0wl0yIiIuljzdjA4gw/exec'

export const APP_NAME = 'Spot Win'
export const APP_VERSION = '1.0.0'

// Demo builds (vite --mode demo) never call the server.
export const DEMO = import.meta.env.MODE === 'demo'

// The four activities, in screen order. The label is what the sheet stores.
export const ACTIVITIES = [
  { key: 'bar', label: 'Bar Staff Engagement', short: 'Bar staff' },
  { key: 'waitress', label: 'Waitress Engagement', short: 'Waitress' },
  { key: 'consumer', label: 'Consumer Onspot Engagement', short: 'Consumer on-spot' },
  { key: 'owner', label: 'Outlet Owner Engagement', short: 'Outlet owner' },
]

// Defaults until the server sends the Settings tab
// appCard: the gold "Get the Spot Win app" card on every screen, 'on' or 'off' (set by the admin)
export const DEFAULT_SETTINGS = { birrLimit: 20000, crateLimit: 200, distanceLimitM: 100, appCard: 'on' }

export const STEP_COUNT = 5
export const RETURN_HOME_MS = 1200

// Server waits
export const REQUEST_TIMEOUT_MS = 20000
export const LOGIN_TIMEOUT_MS = 45000
export const PHOTO_TIMEOUT_MS = 60000

// Photos: long side, JPEG quality, target size
export const PHOTO_MAX_SIDE = 1600
export const PHOTO_QUALITY = 0.7
export const PHOTO_TARGET_KB = 400
export const THUMB_SIDE = 200

// Presence. The phone reports location and activity this often while the app is open.
export const PING_MS = 3 * 60 * 1000
// Online if the last report is newer than this
export const ONLINE_MS = 7 * 60 * 1000
// Manager and admin refresh
export const MANAGER_REFRESH_MS = 60 * 1000
// Two location points further apart than this speed get flagged as a jump
export const JUMP_KMH = 150

// Strict mode: only a warning page while developer tools are open (src/guard.js).
// Off while running `npm run dev` and in demo builds, which are tested by a program.
export const LOCK_DEVTOOLS = !import.meta.env.DEV && !DEMO
