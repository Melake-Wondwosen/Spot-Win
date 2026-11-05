import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { adminData } from '../api'
import { clearNotesMemory, setServerNotes } from '../notes'
import { clearUser, getUser } from '../storage'
import Bell from '../components/Bell'
import { Avatar, Notice, SignOutButton, Toast } from '../components/ui'
import { FlagsTab, MessagesTab, OutletsTab, RequestsTab, SettingsTab, UsersTab } from './tabs'
import Analysis from './Analysis'
import VisitsTab from './VisitsTab'

const TABS = [
  { key: 'analysis', label: 'Analysis' },
  { key: 'visits', label: 'Visits' },
  { key: 'users', label: 'Users' },
  { key: 'outlets', label: 'Outlets' },
  { key: 'requests', label: 'Requests' },
  { key: 'flags', label: 'Alerts' },
  { key: 'messages', label: 'Messages' },
  { key: 'settings', label: 'Settings' },
]

export default function Admin() {
  const navigate = useNavigate()
  const user = getUser()
  const [tab, setTab] = useState('analysis')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)

  const load = useCallback(async () => {
    try {
      const d = await adminData()
      setData(d)
      setServerNotes(d.notes)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  const say = (text) => setToast({ text, id: Date.now() })

  function signOut() {
    clearNotesMemory()
    clearUser()
    navigate('/login', { replace: true })
  }

  const pending = data ? data.outlets.filter((o) => o.status === 'pending').length : 0
  const openFlags = data ? data.flags.filter((f) => f.id && f.status !== 'resolved').length : 0
  const badge = { requests: pending, flags: openFlags }
  const props = { data, reload: load, say }

  return (
    <main className="min-h-full safe-bottom anim-fade bg-[#fbfaf7]">
      <header className="bg-ink text-paper safe-top sticky top-0 z-[1200] shadow-[0_6px_20px_rgba(0,0,0,0.25)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-3 sm:pt-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Avatar name={user.name} />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.14em] text-gold truncate">
                <span className="hidden sm:inline">Spot Win · </span>Admin
              </p>
              <p className="font-serif text-base sm:text-lg leading-tight truncate">{user.name}</p>
            </div>
            <Link to="/manager" className="btn-hover inline-flex items-center justify-center text-sm text-gold border border-gold/40 rounded-full w-10 sm:w-auto sm:px-4 h-10 shrink-0 hover:bg-gold hover:text-ink" aria-label="Manager view">
              <svg className="sm:hidden" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21s-7-6.2-7-12a7 7 0 1 1 14 0c0 5.8-7 12-7 12z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
              <span className="hidden sm:inline">Manager view</span>
            </Link>
            <Bell onOpenItem={(n) => (n.kind === 'request' ? setTab('requests') : n.kind === 'flag' ? setTab('flags') : null)} />
            <SignOutButton onClick={signOut} />
          </div>

          {/* Phones: one row of pills that swipes sideways. Tablets and up: all eight tabs in a row. */}
          <nav className="md:hidden -mx-4 px-4 mt-3 pb-3 flex gap-1.5 overflow-x-auto no-scrollbar snap-x">
            {TABS.map((t) => {
              const on = tab === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  ref={on ? (el) => el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }) : undefined}
                  onClick={() => setTab(t.key)}
                  className={`snap-start shrink-0 relative h-9 px-4 rounded-full text-[13px] font-semibold transition-colors ${on ? 'gold-gradient text-ink' : 'bg-paper/10 text-paper/75'}`}
                >
                  {t.label}
                  {badge[t.key] > 0 && (
                    <span className="ml-1.5 inline-flex min-w-[18px] h-[18px] px-1 rounded-full bg-paper text-ink text-[10px] font-bold items-center justify-center align-[1px]">{badge[t.key]}</span>
                  )}
                </button>
              )
            })}
          </nav>
          <nav className="hidden md:grid mt-3 grid-cols-8">
            {TABS.map((t) => {
              const on = tab === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`group relative min-h-[44px] min-w-0 px-0.5 text-[12px] min-[380px]:text-[13px] sm:text-sm font-semibold transition-colors ${on ? 'text-gold' : 'text-paper/60 hover:text-paper'}`}
                >
                  <span className="relative">
                    {t.label}
                    {badge[t.key] > 0 && (
                      <span key={badge[t.key]} className="anim-pop absolute -top-2.5 -right-3.5 min-w-[16px] h-[16px] px-1 rounded-full bg-gold text-ink text-[10px] font-bold leading-[16px]">
                        {badge[t.key]}
                      </span>
                    )}
                  </span>
                  <span
                    className={`absolute bottom-0 left-[18%] right-[18%] h-[3px] rounded-full gold-gradient transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)] origin-center ${on ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-50'}`}
                  />
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5">
        {error && <Notice className="mb-4">{error}</Notice>}
        {!data && !error && <Skeleton />}
        {data && (
          <div key={tab} className="anim-rise">
            {tab === 'analysis' && <Analysis divisions={data.divisions} role="admin" />}
            {tab === 'visits' && <VisitsTab {...props} />}
            {tab === 'users' && <UsersTab {...props} />}
            {tab === 'outlets' && <OutletsTab {...props} />}
            {tab === 'requests' && <RequestsTab {...props} />}
            {tab === 'flags' && <FlagsTab {...props} />}
            {tab === 'messages' && <MessagesTab {...props} />}
            {tab === 'settings' && <SettingsTab {...props} />}
          </div>
        )}
      </div>
      <Toast toast={toast} />
    </main>
  )
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton h-16 rounded-2xl" />
      ))}
    </div>
  )
}
