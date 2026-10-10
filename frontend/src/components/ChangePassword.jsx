import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth, PasswordInput } from '../auth'
import { useLang } from '../i18n'

export default function ChangePassword({ onClose }) {
  const { t } = useLang()
  const { setSession } = useAuth()
  const [cur, setCur] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!cur) { setError(t('pw.needCurrent')); return }
    if (pw.length < 8) { setError(t('pw.tooShort')); return }
    if (pw !== pw2) { setError(t('pw.mismatch')); return }
    setBusy(true)
    try {
      const res = await api.changePassword(cur, pw)
      setSession(res.token, res.user)
      setDone(true)
    } catch (ex) {
      if (ex.code === 'invalid_password' || ex.status === 401) setError(t('pw.wrongCurrent'))
      else setError(ex.status ? ex.message : t('auth.network'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form className="modal card" role="dialog" aria-modal="true" aria-labelledby="cp-title" onSubmit={submit} noValidate>
        <h2 id="cp-title">{t('pw.title')}</h2>
        {done ? (
          <>
            <p className="muted">{t('pw.done')}</p>
            <div className="modal-actions"><button type="button" className="btn primary" onClick={onClose}>{t('common.close')}</button></div>
          </>
        ) : (
          <>
            <label className="field"><span>{t('pw.current')}</span><PasswordInput value={cur} onChange={(e) => setCur(e.target.value)} autoFocus /></label>
            <label className="field"><span>{t('pw.new')}</span><PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" minLength={8} /></label>
            <label className="field"><span>{t('pw.confirm')}</span><PasswordInput value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" minLength={8} /></label>
            <div className="tiny muted">{t('pw.rule')}</div>
            {error && <div className="form-error" role="alert">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
              <button type="submit" className="btn primary" disabled={busy}>{busy && <span className="spinner" />}{t('pw.save')}</button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
