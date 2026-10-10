import { useState } from 'react'
import { api } from '../api'
import { useAuth, PasswordInput } from '../auth'
import { useLang } from '../i18n'
import Logo from '../components/Logo'
import ThemeToggle from '../components/ThemeToggle'
import { LangSwitch } from '../App'

// First-login gate: admins without an email must add one; temp-password users must change it.
export default function Setup() {
  const { t } = useLang()
  const { user, setSession, logout } = useAuth()
  const askEmail = !!user.needs_email
  const askPw = !!user.must_change_password
  const [email, setEmail] = useState(user.email || '')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const body = {}
    if (askEmail) {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError(t('setup.badEmail')); return }
      body.email = email.trim()
    }
    if (askPw) {
      if (pw.length < 8) { setError(t('pw.tooShort')); return }
      if (pw !== pw2) { setError(t('pw.mismatch')); return }
      body.new_password = pw
    }
    setBusy(true)
    try {
      const res = await api.completeSetup(body)
      setSession(res.token, res.user)
    } catch (ex) {
      setError(ex.status ? ex.message : t('auth.network'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="setup-screen">
      <header className="setup-top">
        <Logo variant="dark" size={28} />
        <div className="setup-top-controls"><LangSwitch /><ThemeToggle /></div>
      </header>
      <main className="setup-main">
        <form className="card setup-card" onSubmit={submit} noValidate>
          <div className="modal-eyebrow">{t('setup.eyebrow')}</div>
          <h1 className="setup-title">{t('setup.title', { name: user.name || user.username })}</h1>
          <p className="muted">{t('setup.sub')}</p>

          {askEmail && (
            <section className="setup-section">
              <h3>{t('setup.emailTitle')}</h3>
              <label className="field">
                <span>{t('setup.email')}</span>
                <input type="email" autoComplete="email" autoFocus placeholder="name@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <span className="tiny muted field-hint">{t('setup.emailHint')}</span>
              </label>
            </section>
          )}

          {askPw && (
            <section className="setup-section">
              <h3>{t('setup.pwTitle')}</h3>
              <p className="small muted" style={{ marginTop: 0 }}>{t('setup.pwSub')}</p>
              <label className="field">
                <span>{t('pw.new')}</span>
                <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" autoFocus={!askEmail} minLength={8} />
              </label>
              <label className="field">
                <span>{t('pw.confirm')}</span>
                <PasswordInput value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" minLength={8} />
              </label>
            </section>
          )}

          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={logout}>{t('nav.signOut')}</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy && <span className="spinner" />}{t('setup.submit')}</button>
          </div>
        </form>
      </main>
    </div>
  )
}
