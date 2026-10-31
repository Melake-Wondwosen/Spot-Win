import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router'
import { DEMO } from './config'
import { getUser } from './storage'
import { isLocked, onLock } from './guard'
import { startPresence } from './presence'
import { homeFor } from './roles'
import { loadOutlets, syncPack } from './outlets'
import Login from './pages/Login'
import Home from './pages/Home'
import { Emblem, Spinner } from './components/ui'

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
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />
  return children
}

function SalesShell({ children }) {
  useEffect(() => {
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

function LockScreen() {
  return (
    <div className="anim-fade fixed inset-0 z-[9999] bg-ink text-paper flex flex-col items-center justify-center text-center px-8">
      <Emblem className="w-16 h-16 anim-pop" />
      <h1 className="font-serif text-2xl mt-5 anim-rise">App locked</h1>
      <p className="text-paper/75 mt-2 max-w-xs anim-rise">Close developer tools and reopen the app.</p>
    </div>
  )
}

export default function App() {
  const [locked, setLocked] = useState(isLocked)
  useEffect(() => onLock(setLocked), [])
  if (locked) return <LockScreen />

  return (
    <Router>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RequireRole roles={['sales']}><SalesShell><Home /></SalesShell></RequireRole>} />
          <Route path="/visit" element={<RequireRole roles={['sales']}><SalesShell><Visit /></SalesShell></RequireRole>} />
          <Route path="/manager" element={<RequireRole roles={['manager', 'asm', 'admin']}><Manager /></RequireRole>} />
          <Route path="/admin" element={<RequireRole roles={['admin']}><Admin /></RequireRole>} />
          <Route path="*" element={<Navigate to={getUser()?.token ? homeFor(getUser()) : '/login'} replace />} />
        </Routes>
      </Suspense>
    </Router>
  )
}
