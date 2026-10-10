import { useEffect, useState } from 'react'
import { api } from './api'
import { LangProvider, LANGS, useLang } from './i18n'
import { AuthProvider, useAuth, needsSetup, NoAccess } from './auth'
import './i18n.css'
import './auth.css'
import Dashboard from './pages/Dashboard'
import SpotDetail from './pages/SpotDetail'
import PitchView from './pages/PitchView'
import About from './pages/About'
import Login from './pages/Login'
import Setup from './pages/Setup'
import Admin, { usePendingCount } from './pages/Admin'
import ThemeToggle from './components/ThemeToggle'
import Logo from './components/Logo'
import ChangePassword from './components/ChangePassword'

function parseHash() {
  const [path, query = ''] = window.location.hash.replace(/^#/, '').split('?')
  const parts = path.split('/').filter(Boolean)
  return { parts, query: new URLSearchParams(query) }
}

export function go(path) {
  window.location.hash = path
  window.scrollTo(0, 0)
}

export default function App() {
  return <LangProvider><AuthProvider><Gate /></AuthProvider></LangProvider>
}

// Everything is behind sign-in; first-login users finish setup before seeing the app.
function Gate() {
  const { user, status } = useAuth()
  const { t } = useLang()
  if (status === 'loading') {
    return <div className="auth-loading"><span className="spinner" /> <span className="muted">{t('common.loading')}</span></div>
  }
  if (!user) return <Login />
  if (needsSetup(user)) return <Setup />
  return <Shell />
}

function Shell() {
  const { t } = useLang()
  const { user, can, logout } = useAuth()
  const [route, setRoute] = useState(parseHash())
  const [health, setHealth] = useState(null)
  const [changePw, setChangePw] = useState(false)
  const isAdminUser = can('users.manage') || can('roles.manage') || can('applications.review')
  const pending = usePendingCount(can('applications.review'))

  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    const load = () => api.health().then(setHealth).catch(() => setHealth({ ok: false }))
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [])

  const [page, id] = route.parts
  const canHome = can('dashboard.view') || can('spots.view')
  let view
  if (page === 'spot' && id) view = can('spots.view') ? <SpotDetail id={id} /> : <NoAccess />
  else if (page === 'pitch' && id) view = can('pitch.view') ? <PitchView id={id} category={route.query.get('category') || ''} health={health} /> : <NoAccess />
  else if (page === 'about') view = <About />
  else if (page === 'admin') view = isAdminUser ? <Admin tab={route.query.get('tab') || ''} /> : <NoAccess />
  else if (!page || page === 'apply') view = canHome ? <Dashboard /> : <WelcomeNoData />
  else view = <NoAccess />

  const inSpot = (page === 'spot' || page === 'pitch') && can('spots.view')
  return (
    <div className="shell">
      <aside className="sidebar">
        <a href="#/" className="brand"><Logo variant="dark" subtitle={t('brand.subtitle')} /></a>
        <div>
          <div className="side-label">{t('nav.workspace')}</div>
          <nav className="side-links">
            {canHome && <a href="#/" className={!page ? 'active' : ''}>{t('nav.dashboard')}</a>}
            {inSpot && <a href={`#/spot/${id}`} className={page === 'spot' ? 'active' : ''}>{t('nav.ratecard', { id })}</a>}
            {inSpot && can('pitch.view') && <a href={`#/pitch/${id}`} className={page === 'pitch' ? 'active' : ''}>{t('nav.pitch', { id })}</a>}
            <a href="#/about" className={page === 'about' ? 'active' : ''}>{t('nav.about')}</a>
            {isAdminUser && (
              <a href="#/admin" className={`side-link-badged${page === 'admin' ? ' active' : ''}`}>
                <span>{t('nav.admin')}</span>
                {pending > 0 && <span className="count-badge" title={t('nav.pendingTitle', { n: pending })}>{pending}</span>}
              </a>
            )}
          </nav>
        </div>
        <LangSwitch />
        <div className="side-status">
          <ThemeToggle />
          <div className="user-card">
            <div className="user-avatar" aria-hidden="true">{(user.name || user.username || '?').trim().charAt(0).toUpperCase()}</div>
            <div className="user-meta">
              <div className="user-name" title={user.username}>{user.name || user.username}</div>
              <span className="user-role">{user.role?.name || '—'}</span>
            </div>
          </div>
          <div className="user-actions">
            <button type="button" className="side-btn" onClick={() => setChangePw(true)}>{t('nav.changePw')}</button>
            <button type="button" className="side-btn" onClick={logout}>{t('nav.signOut')}</button>
          </div>
        </div>
      </aside>
      <main className="page">{view}</main>
      {changePw && <ChangePassword onClose={() => setChangePw(false)} />}
    </div>
  )
}

function WelcomeNoData() {
  const { t } = useLang()
  const { user } = useAuth()
  return (
    <div className="card no-access">
      <h2>{t('access.welcome', { name: user.name || user.username })}</h2>
      <p className="muted">{t('access.noData')}</p>
      <a className="btn" href="#/about">{t('nav.about')}</a>
    </div>
  )
}

export function LangSwitch() {
  const { lang, setLang, t } = useLang()
  return (
    <div className="lang-block">
      <div className="side-label">{t('lang.label')}</div>
      <div className="lang-switch" role="group" aria-label={t('lang.label')}>
        {LANGS.map((l) => (
          <button key={l.code} type="button" lang={l.code} title={l.name} aria-pressed={lang === l.code}
            className={`lang-btn${lang === l.code ? ' active' : ''}`} onClick={() => setLang(l.code)}>
            {l.short}
          </button>
        ))}
      </div>
    </div>
  )
}
