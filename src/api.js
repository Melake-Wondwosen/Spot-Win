import { API_URL, DEMO, LOGIN_TIMEOUT_MS, PHOTO_TIMEOUT_MS, REQUEST_TIMEOUT_MS } from './config'
import { clearUser, getUser, setSettings } from './storage'

// Apps Script answers with an HTML page when the deployment is misconfigured.
// Turn that into something the user (or whoever they call) can act on.
function explainHtml(text) {
  const head = text.slice(0, 800).toLowerCase()
  if (head.includes('authoriz') || head.includes('authoris') || head.includes('permission')) {
    return 'The script needs re-authorising. Open Apps Script, run paymentSetup once and accept the permissions.'
  }
  if (head.includes('accounts.google.com') || head.includes('sign in') || head.includes('you need access') || head.includes('servicelogin')) {
    return 'The deployment is not open to everyone. Set "Who has access" to Anyone and redeploy.'
  }
  if (head.includes('script function not found') || head.includes('dopost') || head.includes('not found')) {
    return 'The deployment was not updated. In Apps Script use Deploy > Manage deployments > Edit > New version.'
  }
  return 'The server sent an error page instead of data. Check the Apps Script deployment.'
}

export async function post(action, payload = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  if (DEMO) {
    const { demoCall } = await import('./demo')
    return demoCall(action, payload)
  }
  if (API_URL.startsWith('PASTE')) throw new Error('The server address is not set. Put the Apps Script URL in src/config.js.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res
  try {
    // text/plain keeps this a CORS "simple request": no OPTIONS preflight,
    // which Apps Script cannot answer. Do not change it to application/json.
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...payload }),
      redirect: 'follow',
      signal: controller.signal,
    })
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'The server took too long to answer. Weak signal?' : 'No connection. Could not reach the server.')
  } finally {
    clearTimeout(timer)
  }

  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(text.trim().startsWith('<') ? explainHtml(text) : 'The server sent a reply the app could not read.')
  }
  if (data.ok !== true) throw new Error(data.error || data.message || 'The server rejected the request.')
  return data.data ?? {}
}

// Same as post, with the signed-in user's token attached. A blocked account or
// a broken session sends the user back to the sign-in page.
const LOST = /no longer active|Session not valid/i
function sessionLost() {
  clearUser()
  const login = DEMO ? '#/login' : '/login'
  if (!location.href.endsWith(login)) location.replace(login)
}
async function authed(action, payload = {}, ms) {
  try {
    return await post(action, { token: getUser()?.token, ...payload }, ms)
  } catch (err) {
    if (LOST.test(err.message) && getUser()) sessionLost()
    throw err
  }
}

export function deviceLabel() {
  const ua = navigator.userAgent
  const m = ua.match(/Android [\d.]+; ([^;)]+)/) || ua.match(/(iPhone|iPad|Windows NT [\d.]+|Mac OS X [\d_]+)/)
  return (m ? m[1] || m[0] : ua).slice(0, 80)
}

export async function login(username, password, location) {
  // Sign-in gets extra time: the first call after a quiet spell wakes Apps Script up
  const d = await post('paymentLogin', { username: username.trim(), password, location, device: deviceLabel() }, LOGIN_TIMEOUT_MS)
  const u = d.user
  if (!u || !u.token) throw new Error('Sign-in worked but no session came back. Is SpotWin.gs deployed?')
  setSettings(d.settings)
  const role = ['manager', 'rtm', 'asm', 'admin'].includes(u.role) ? u.role : 'sales'
  return { id: String(u.id), name: String(u.name), username: String(u.username), staffId: String(u.staffId || ''), region: String(u.region || ''), agent: String(u.agent || ''), role, token: u.token }
}

export const ping = (body) => authed('ping', body)
export const notifications = () => authed('notifications')
export const fetchOutletPack = (version) => authed('outletPack', { version })
export const lookupOutlet = (outletId) => authed('lookupOutlet', { outletId })
export const requestOutlet = (req) => authed('requestOutlet', req)
export const myVisits = () => authed('myVisits')
export const managerData = (q) => authed('managerData', q)
export const visitDetail = (id) => authed('visitDetail', { id })
export const getPhoto = (q) => authed('getPhoto', q, PHOTO_TIMEOUT_MS)
export const exportPage = (filters, page) => authed('exportVisits', { filters, page }, 60000)
export const adminData = () => authed('adminData')
export const saveUser = (user) => authed('saveUser', { user })
export const saveOutlet = (outlet) => authed('saveOutlet', { outlet })
export const importOutlets = (rows) => authed('importOutlets', { rows })
export const resolveFlag = (id) => authed('resolveFlag', { id })
export const sendNotice = (target, title, body) => authed('sendNotice', { target, title, body })
export const voidVisit = (id, reason) => authed('voidVisit', { id, reason })
export const saveSettings = (settings) => authed('saveSettings', { settings })

// The token travels inside the record, so a queued visit is credited to the
// user who recorded it even if someone else signs in before it uploads.
export const uploadPhoto = (p) => post('uploadPhoto', p, PHOTO_TIMEOUT_MS)
export const addVisit = (visit) => post('addVisit', { visit })

// Fire-and-forget for when the app is being hidden or closed
export function beacon(action, body) {
  if (DEMO || !navigator.sendBeacon || API_URL.startsWith('PASTE')) return
  try {
    navigator.sendBeacon(API_URL, new Blob([JSON.stringify({ action, ...body })], { type: 'text/plain;charset=utf-8' }))
  } catch {
    // nothing to do
  }
}

export function reportFlag(body) {
  return post('flag', body).catch(() => beacon('flag', body))
}
