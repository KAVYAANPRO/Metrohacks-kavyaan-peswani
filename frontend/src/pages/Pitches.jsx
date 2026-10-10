import { useEffect, useMemo, useState } from 'react'
import { api, inr } from '../api'
import { go } from '../App'
import { useLang } from '../i18n'

const L = {
  en: { title: 'Pitch library', sub: 'Every sales pitch generated so far, ready to open, print or send.', all: 'All languages', empty: 'No pitches yet. Open a spot and generate one.', ai: 'AI', template: 'Template', grounded: 'Grounded', unverified: 'Unverified figures', best: 'Best fit', search: 'Search station or spot', mo: '/mo' },
  hi: { title: 'पिच लाइब्रेरी', sub: 'अब तक बनी सभी सेल्स पिच, खोलने, प्रिंट करने या भेजने के लिए तैयार।', all: 'सभी भाषाएँ', empty: 'अभी कोई पिच नहीं। किसी जगह को खोलकर पिच बनाएँ।', ai: 'AI', template: 'टेम्पलेट', grounded: 'आँकड़े सत्यापित', unverified: 'असत्यापित आँकड़े', best: 'सबसे उपयुक्त', search: 'स्टेशन या जगह खोजें', mo: '/माह' },
  gu: { title: 'પિચ લાઇબ્રેરી', sub: 'અત્યાર સુધી બનેલી બધી સેલ્સ પિચ, ખોલવા, છાપવા કે મોકલવા માટે તૈયાર.', all: 'બધી ભાષાઓ', empty: 'હજુ કોઈ પિચ નથી. કોઈ જગ્યા ખોલીને પિચ બનાવો.', ai: 'AI', template: 'ટેમ્પલેટ', grounded: 'આંકડા ચકાસાયેલ', unverified: 'ચકાસણી વગરના આંકડા', best: 'સૌથી યોગ્ય', search: 'સ્ટેશન કે જગ્યા શોધો', mo: '/મહિનો' },
}
const LANG_NAME = { en: 'English', hi: 'हिंदी', gu: 'ગુજરાતી' }

export default function Pitches() {
  const { lang, tx } = useLang()
  const s = L[lang] || L.en
  const [list, setList] = useState(null)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => { api.pitches().then(setList).catch((e) => setError(e.message)) }, [])

  const shown = useMemo(() => (list || []).filter((p) =>
    (!filter || p.language === filter) &&
    (!q || `${p.spot_id} ${p.station_name}`.toLowerCase().includes(q.toLowerCase()))), [list, filter, q])

  if (error) return <div className="error">{error}</div>
  return (
    <div className="stack">
      <div className="row between">
        <div><h1>{s.title}</h1><div className="muted">{s.sub}</div></div>
        <div className="row" style={{ gap: 8 }}>
          <input type="search" placeholder={s.search} value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">{s.all}</option>
            {Object.entries(LANG_NAME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      {!list ? <div className="skeleton" style={{ height: 240 }} /> : shown.length === 0 ? <div className="empty">{s.empty}</div> : (
        <div className="grid g3">
          {shown.map((p) => (
            <div key={`${p.spot_id}|${p.category}|${p.language}`} className="card station"
              onClick={() => go(`/pitch/${p.spot_id}${p.category ? `?category=${encodeURIComponent(p.category)}` : ''}`)}
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="row between" style={{ gap: 6 }}>
                <span className="mono small">{p.spot_id}</span>
                <span className="row" style={{ gap: 6 }}>
                  <span className="badge">{LANG_NAME[p.language] || p.language}</span>
                  <span className={`badge ${p.mode === 'llm' ? 'good' : 'warn'}`}>{p.mode === 'llm' ? s.ai : s.template}</span>
                </span>
              </div>
              <h3 style={{ lineHeight: 1.35 }}>{p.headline}</h3>
              <div className="muted small">{p.station_name} · {tx('type', p.spot_type)} · {tx('zone', p.zone)}</div>
              <div className="row between" style={{ marginTop: 'auto' }}>
                <span className="small">{p.category || s.best}</span>
                <b className="money">{inr(p.monthly_price)}<span className="muted tiny">{s.mo}</span></b>
              </div>
              <div className="tiny" style={{ color: p.grounded ? 'var(--forest-text, var(--forest))' : 'var(--warn-text, #8a4a22)' }}>
                {p.grounded ? `✓ ${s.grounded}` : `⚠ ${s.unverified}`} · {new Date(p.created_at).toLocaleDateString('en-IN')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
