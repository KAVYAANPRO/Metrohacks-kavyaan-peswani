import { useState } from 'react'
import { useLang, LANGS } from '../i18n'
import { useAuth } from '../auth'
import ChangePassword from '../components/ChangePassword'

const KEY = 'sv-theme'
const L = {
  en: { title: 'Settings', profile: 'Profile', username: 'Username', role: 'Role', email: 'Email', language: 'Language', theme: 'Appearance', light: 'Light', dark: 'Dark', bw: 'Black & white', security: 'Account & security', changePw: 'Change password', signOut: 'Sign out', signOutSub: 'End your session on this device.' },
  hi: { title: 'सेटिंग्स', profile: 'प्रोफ़ाइल', username: 'यूज़रनेम', role: 'भूमिका', email: 'ईमेल', language: 'भाषा', theme: 'दिखावट', light: 'लाइट', dark: 'डार्क', bw: 'ब्लैक एंड व्हाइट', security: 'खाता और सुरक्षा', changePw: 'पासवर्ड बदलें', signOut: 'साइन आउट', signOutSub: 'इस डिवाइस पर अपना सत्र समाप्त करें।' },
  gu: { title: 'સેટિંગ્સ', profile: 'પ્રોફાઇલ', username: 'યુઝરનેમ', role: 'ભૂમિકા', email: 'ઈમેલ', language: 'ભાષા', theme: 'દેખાવ', light: 'લાઇટ', dark: 'ડાર્ક', bw: 'બ્લેક એન્ડ વ્હાઇટ', security: 'ખાતું અને સુરક્ષા', changePw: 'પાસવર્ડ બદલો', signOut: 'સાઇન આઉટ', signOutSub: 'આ ડિવાઇસ પર તમારું સત્ર સમાપ્ત કરો.' },
}

function readTheme() {
  try { return localStorage.getItem(KEY) || 'light' } catch { return 'light' }
}

export default function Settings() {
  const { lang, setLang } = useLang()
  const { user, logout } = useAuth()
  const s = L[lang] || L.en
  const [theme, setTheme] = useState(readTheme)
  const [changePw, setChangePw] = useState(false)

  const chooseTheme = (t) => {
    setTheme(t)
    if (t === 'light') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = t
    try { localStorage.setItem(KEY, t) } catch { /* storage unavailable */ }
    window.dispatchEvent(new CustomEvent('themechange', { detail: t }))
  }

  const Choice = ({ active, onClick, children, ...rest }) => (
    <button type="button" className={`btn ${active ? 'primary' : ''}`} aria-pressed={active} onClick={onClick} {...rest}>{children}</button>
  )

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <h1>{s.title}</h1>

      <div className="card">
        <h2 style={{ marginBottom: 12 }}>{s.profile}</h2>
        <div className="row" style={{ gap: 16 }}>
          <div className="user-avatar" style={{ width: 48, height: 48, fontSize: 20, background: 'var(--panel, var(--forest))', color: '#fff' }}>
            {(user.name || user.username || '?').trim().charAt(0).toUpperCase()}
          </div>
          <dl className="kv" style={{ flex: 1, gridTemplateColumns: '120px 1fr' }}>
            <dt>{s.username}</dt><dd style={{ textAlign: 'left' }}>{user.username}</dd>
            <dt>{s.role}</dt><dd style={{ textAlign: 'left' }}><span className="badge good">{user.role?.name || '—'}</span></dd>
            <dt>{s.email}</dt><dd style={{ textAlign: 'left' }}>{user.email || '—'}</dd>
          </dl>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12 }}>{s.language}</h2>
        <div className="row" style={{ gap: 8 }}>
          {LANGS.map((l) => <Choice key={l.code} lang={l.code} active={lang === l.code} onClick={() => setLang(l.code)}>{l.name}</Choice>)}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12 }}>{s.theme}</h2>
        <div className="row" style={{ gap: 8 }}>
          {['light', 'dark', 'bw'].map((t) => <Choice key={t} active={theme === t} onClick={() => chooseTheme(t)}>{s[t]}</Choice>)}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 12 }}>{s.security}</h2>
        <div className="row between">
          <button className="btn" onClick={() => setChangePw(true)}>{s.changePw}</button>
          <div className="row" style={{ gap: 10 }}>
            <span className="muted small">{s.signOutSub}</span>
            <button className="btn cta" onClick={logout}>{s.signOut}</button>
          </div>
        </div>
      </div>
      {changePw && <ChangePassword onClose={() => setChangePw(false)} />}
    </div>
  )
}
