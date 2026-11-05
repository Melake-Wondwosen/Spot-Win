import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router'
import { DEMO } from './config'
import { getUser } from './storage'
import { devReason, onDev } from './guard'
import { startPresence } from './presence'
import { locationGate, onLocationGate, startWatch } from './location'
import { homeFor } from './roles'
import { loadOutlets, syncPack } from './outlets'
import { reportApp } from './install'
import Login from './pages/Login'
import Home from './pages/Home'
import { Spinner } from './components/ui'
import { DevGate, LocationGate } from './components/Gate'

// The visit flow loads in the background once the home screen is up, so
// pressing "Enter to the outlet" opens it at once. Manager and admin screens
// (with the map and the Excel builder) only download for those roles.
const loadVisit = () => import('./pages/Visit')
const Visit = lazy(loadVisit)
const Manager = lazy(() => import('./manager/Manager'))
const Admin = lazy(() => import('./admin/Admin'))

// Demo bundles are opened from arbitrary paths, so they route on the hash.
const Router = DEMO ? HashRouter : BrowserRouter

function RequireRole({ roles, children }) {
  const user = getUser()
  if (!user?.token) return <Navigate to="/login" replace />
  if (user.mustChange) return <Navigate to="/login" replace />
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />
  return children
}

function SalesShell({ children }) {
  useEffect(() => {
    startWatch()
    startPresence()
    loadOutlets().then(() => syncPack())
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 600))
    idle(() => loadVisit())
  }, [])
  return children
}

const Loading = () => (
  <div className="h-full flex items-center justify-center text-gold">
    <Spinner />
  </div>
)

export default function App() {
  const [dev, setDev] = useState(devReason)
  const [loc, setLoc] = useState(locationGate)
  useEffect(() => onDev(setDev), [])
  useEffect(() => onLocationGate(setLoc), [])
  // Once per app start
  useEffect(() => reportApp(), [])
  // Strict: nothing but the warning page while developer mode is on or location is off
  if (dev) return <DevGate reason={dev} />
  if (loc.state === 'off' || loc.state === 'ask') return <LocationGate {...loc} />

  return (
    <Router>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/password" element={<Navigate to="/login" replace />} />
          <Route path="/" element={<RequireRole roles={['sales', 'asm', 'rtm']}><SalesShell><Home /></SalesShell></RequireRole>} />
          <Route path="/visit" element={<RequireRole roles={['sales', 'asm', 'rtm']}><SalesShell><Visit /></SalesShell></RequireRole>} />
          <Route path="/manager" element={<RequireRole roles={['manager', 'rtm', 'asm', 'admin']}><Manager /></RequireRole>} />
          <Route path="/admin" element={<RequireRole roles={['admin']}><Admin /></RequireRole>} />
          <Route path="*" element={<Navigate to={getUser()?.token ? homeFor(getUser()) : '/login'} replace />} />
        </Routes>
      </Suspense>
    </Router>
  )
}
