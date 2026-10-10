import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, getToken, setToken } from './api'
import { useLang } from './i18n'
import './auth.css'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // 'loading' while /auth/me runs for a stored token, then 'ready'
  const [status, setStatus] = useState(() => (getToken() ? 'loading' : 'ready'))

  const setSession = useCallback((token, nextUser) => {
    if (token) setToken(token)
    if (nextUser !== undefined) setUser(nextUser)
  }, [])

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); setStatus('ready'); return null }
    try {
      const { user: u } = await api.me()
      setUser(u)
      return u
    } catch (e) {
      if (e.status === 401) setUser(null)
      return null
    } finally {
      setStatus('ready')
    }
  }, [])

  const login = useCallback(async (username, password) => {
    const res = await api.login(username, password)
    setToken(res.token)
    setUser(res.user)
    return res.user
  }, [])

  const logout = useCallback(async () => {
    try { await api.logout() } catch { /* token may already be invalid */ }
    setToken(null)
    setUser(null)
    window.location.hash = '/'
  }, [])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    const onLogout = () => { setToken(null); setUser(null) }
    const onSetup = () => { refresh() }
    window.addEventListener('auth:logout', onLogout)
    window.addEventListener('auth:setup', onSetup)
    return () => {
      window.removeEventListener('auth:logout', onLogout)
      window.removeEventListener('auth:setup', onSetup)
    }
  }, [refresh])

  const can = useCallback((perm) => {
    if (!user) return false
    if (user.role?.is_admin) return true
    return (user.permissions || []).includes(perm)
  }, [user])

  const value = useMemo(() => ({ user, status, can, login, logout, refresh, setSession }), [user, status, can, login, logout, refresh, setSession])
  return (
    <AuthContext.Provider value={value}>
      <ConfirmProvider>{children}</ConfirmProvider>
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

export const needsSetup = (u) => !!u && (u.needs_email || u.must_change_password)

/* ---------- "Confirm it's you" password re-entry for privileged grants ---------- */

const ConfirmContext = createContext(null)

// withConfirm(run) calls run(undefined); if the API answers 403 password_required it opens
// the modal and retries run(password) until it succeeds or the user cancels.
function ConfirmProvider({ children }) {
  const [open, setOpen] = useState(false)
  const pending = useRef(null)

  const withConfirm = useCallback(async (run) => {
    try {
      return await run(undefined)
    } catch (e) {
      if (e.code !== 'password_required') throw e
      return new Promise((resolve, reject) => {
        pending.current = { run, resolve, reject }
        setOpen(true)
      })
    }
  }, [])

  const close = () => { setOpen(false); pending.current = null }

  return (
    <ConfirmContext.Provider value={withConfirm}>
      {children}
      {open && <ConfirmModal pending={pending} onDone={close} />}
    </ConfirmContext.Provider>
  )
}

export function useConfirmPassword() {
  return useContext(ConfirmContext)
}

function ConfirmModal({ pending, onDone }) {
  const { t } = useLang()
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const cancel = () => {
    const p = pending.current
    onDone()
    p?.reject(Object.assign(new Error(t('confirm.cancelled')), { code: 'cancelled' }))
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') cancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    if (!pw) return
    setBusy(true); setErr('')
    const p = pending.current
    try {
      const res = await p.run(pw)
      onDone()
      p.resolve(res)
    } catch (ex) {
      if (ex.code === 'invalid_password') setErr(t('confirm.invalid'))
      else if (ex.code === 'password_required') setErr(t('confirm.required'))
      else { onDone(); p.reject(ex) }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) cancel() }}>
      <form className="modal card" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onSubmit={submit}>
        <div className="modal-eyebrow">{t('confirm.eyebrow')}</div>
        <h2 id="confirm-title">{t('confirm.title')}</h2>
        <p className="muted small">{t('confirm.body')}</p>
        <label className="field">
          <span>{t('auth.password')}</span>
          <input type="password" autoFocus autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        {err && <div className="form-error" role="alert">{err}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={cancel}>{t('common.cancel')}</button>
          <button type="submit" className="btn primary" disabled={busy || !pw}>{busy ? <span className="spinner" /> : null}{t('confirm.submit')}</button>
        </div>
      </form>
    </div>
  )
}

/* ---------- small shared bits ---------- */

export function NoAccess() {
  const { t } = useLang()
  return (
    <div className="card no-access">
      <div className="no-access-icon" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
      </div>
      <h2>{t('access.title')}</h2>
      <p className="muted">{t('access.body')}</p>
      <a className="btn" href="#/">{t('access.home')}</a>
    </div>
  )
}

export function OneTimeSecret({ label, value }) {
  const { t } = useLang()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked */ }
  }
  return (
    <div className="secret">
      <div className="label">{label || t('admin.tempPw')}</div>
      <div className="secret-row">
        <code className="secret-value">{value}</code>
        <button type="button" className="btn sm" onClick={copy}>{copied ? t('common.copied') : t('common.copy')}</button>
      </div>
      <div className="tiny muted">{t('admin.tempPwNote')}</div>
    </div>
  )
}

export function PasswordInput({ value, onChange, autoComplete = 'current-password', id, autoFocus, minLength }) {
  const { t } = useLang()
  const [show, setShow] = useState(false)
  return (
    <div className="pw-wrap">
      <input id={id} type={show ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} autoFocus={autoFocus} minLength={minLength} />
      <button type="button" className="pw-toggle" onClick={() => setShow((s) => !s)} aria-pressed={show} aria-label={show ? t('auth.hidePw') : t('auth.showPw')}>
        {show ? t('auth.hide') : t('auth.show')}
      </button>
    </div>
  )
}
