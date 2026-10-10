import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth, PasswordInput } from '../auth'
import { useLang } from '../i18n'
import Logo from '../components/Logo'
import ThemeToggle from '../components/ThemeToggle'
import { LangSwitch } from '../App'

// Full-screen sign-in. There is no public sign-up: outsiders apply for access instead.
export default function Login() {
  const { t } = useLang()
  const [mode, setMode] = useState(() => (window.location.hash.includes('apply') ? 'apply' : 'login'))

  const show = (m) => {
    setMode(m)
    window.location.hash = m === 'apply' ? '/apply' : '/'
  }

  return (
    <div className="auth-screen">
      <aside className="auth-brand">
        <Logo variant="dark" size={44} />
        <div className="auth-brand-copy">
          <h1 className="auth-tagline">{t('brand.tagline')}</h1>
          <p className="auth-lede">{t('auth.lede')}</p>
          <ul className="auth-points">
            <li><span className="auth-point-dot" aria-hidden="true" />{t('auth.point1')}</li>
            <li><span className="auth-point-dot" aria-hidden="true" />{t('auth.point2')}</li>
            <li><span className="auth-point-dot" aria-hidden="true" />{t('auth.point3')}</li>
          </ul>
        </div>
        <div className="auth-brand-controls">
          <LangSwitch />
          <ThemeToggle />
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-form-wrap">
          {mode === 'login' ? <SignIn onApply={() => show('apply')} /> : <Apply onBack={() => show('login')} />}
        </div>
      </main>
    </div>
  )
}

function fmtWait(s, t) {
  if (s >= 60) return t('auth.minutes', { n: Math.ceil(s / 60) })
  return t('auth.seconds', { n: Math.max(1, Math.ceil(s)) })
}

function SignIn({ onApply }) {
  const { t } = useLang()
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null) // {kind, retry}
  const [lockLeft, setLockLeft] = useState(0)

  useEffect(() => {
    if (lockLeft <= 0) return
    const id = setInterval(() => setLockLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [lockLeft > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password) { setError({ kind: 'missing' }); return }
    setBusy(true); setError(null)
    try {
      await login(username.trim(), password)
    } catch (ex) {
      if (ex.code === 'locked' || ex.status === 429) {
        setError({ kind: 'locked' })
        setLockLeft(Number(ex.data?.retry_after_s) || 300)
      } else if (ex.code === 'invalid_credentials' && /deactivated/i.test(ex.message)) setError({ kind: 'inactive' })
      else if (ex.status === 401 || ex.code === 'invalid_credentials') setError({ kind: 'invalid' })
      else if (ex.code === 'rate_limited') setError({ kind: 'other', msg: t('err.rate_limited') })
      else if (ex.status) setError({ kind: 'other', msg: ex.message })
      else setError({ kind: 'network' })
    } finally {
      setBusy(false)
    }
  }

  const locked = error?.kind === 'locked' && lockLeft > 0
  const msg = !error ? null
    : error.kind === 'locked' ? (lockLeft > 0 ? t('auth.locked', { wait: fmtWait(lockLeft, t) }) : t('auth.lockedOver'))
      : error.kind === 'invalid' ? t('auth.invalid')
        : error.kind === 'missing' ? t('auth.missing')
          : error.kind === 'inactive' ? t('auth.inactive')
            : error.kind === 'network' ? t('auth.network')
              : error.msg

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <div>
        <h2 className="auth-title">{t('auth.signIn')}</h2>
        <p className="muted small">{t('auth.signInSub')}</p>
      </div>
      <label className="field">
        <span>{t('auth.username')}</span>
        <input type="text" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
      </label>
      <label className="field">
        <span>{t('auth.password')}</span>
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {msg && <div className={`form-error${error.kind === 'locked' ? ' locked' : ''}`} role="alert">{msg}</div>}
      <button type="submit" className="btn primary block" disabled={busy || locked}>
        {busy && <span className="spinner" />}{t('auth.signInBtn')}
      </button>
      <div className="auth-switch small">
        <span className="muted">{t('auth.needAccess')}</span>{' '}
        <button type="button" className="link-btn" onClick={onApply}>{t('auth.apply')}</button>
      </div>
    </form>
  )
}

const EMPTY = { name: '', email: '', username: '', organisation: '', requested_role_id: '', reason: '' }

function Apply({ onBack }) {
  const { t } = useLang()
  const [roles, setRoles] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)

  useEffect(() => {
    api.rolesPublic().then((r) => setRoles(Array.isArray(r) ? r : [])).catch(() => setRoles([]))
  }, [])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    const f = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()]))
    if (!f.name || !f.email || !f.username || !f.requested_role_id) { setError(t('apply.missing')); return }
    if (!/^\S+@\S+\.\S+$/.test(f.email)) { setError(t('apply.badEmail')); return }
    setBusy(true); setError('')
    try {
      const res = await api.apply(f)
      setDone({ emailed: Number(res.emailed) || 0 })
    } catch (ex) {
      const code = ex.code
      setError(code === 'username_taken' ? t('apply.usernameTaken')
        : code === 'duplicate_application' ? t('apply.duplicate')
          : code === 'rate_limited' ? t('err.rate_limited')
            : ex.status ? ex.message : t('auth.network'))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="auth-form">
        <div className="auth-success-icon" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </div>
        <h2 className="auth-title">{t('apply.sentTitle')}</h2>
        <p className="muted">{done.emailed > 0 ? t(done.emailed === 1 ? 'apply.sent1' : 'apply.sentN', { n: done.emailed }) : t('apply.waiting')}</p>
        <p className="muted small">{t('apply.nextSteps')}</p>
        <button type="button" className="btn block" onClick={onBack}>{t('apply.backToSignIn')}</button>
      </div>
    )
  }

  return (
    <form className="auth-form" onSubmit={submit} noValidate>
      <div>
        <button type="button" className="link-btn small" onClick={onBack}>{t('apply.back')}</button>
        <h2 className="auth-title" style={{ marginTop: 8 }}>{t('apply.title')}</h2>
        <p className="muted small">{t('apply.sub')}</p>
      </div>
      <div className="field-grid">
        <label className="field"><span>{t('apply.name')}</span><input type="text" autoComplete="name" value={form.name} onChange={set('name')} /></label>
        <label className="field"><span>{t('apply.email')}</span><input type="email" autoComplete="email" value={form.email} onChange={set('email')} /></label>
        <label className="field"><span>{t('apply.username')}</span><input type="text" autoComplete="username" value={form.username} onChange={set('username')} /></label>
        <label className="field"><span>{t('apply.org')} <em className="muted">{t('common.optional')}</em></span><input type="text" autoComplete="organization" value={form.organisation} onChange={set('organisation')} /></label>
      </div>
      <label className="field">
        <span>{t('apply.role')}</span>
        <select value={form.requested_role_id} onChange={set('requested_role_id')} disabled={!roles}>
          <option value="">{roles ? t('apply.chooseRole') : t('common.loading')}</option>
          {(roles || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        {form.requested_role_id && roles?.find((r) => r.id === form.requested_role_id)?.description && (
          <span className="tiny muted field-hint">{roles.find((r) => r.id === form.requested_role_id).description}</span>
        )}
      </label>
      <label className="field">
        <span>{t('apply.reason')} <em className="muted">{t('common.optional')}</em></span>
        <textarea rows={3} value={form.reason} onChange={set('reason')} placeholder={t('apply.reasonPh')} />
      </label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button type="submit" className="btn cta block" disabled={busy}>{busy && <span className="spinner" />}{t('apply.submit')}</button>
    </form>
  )
}
