import { useEffect, useState } from 'react'
import { api, inr, num, lakh } from '../api'
import { go } from '../App'
import { useLang } from '../i18n'
import FootfallChart from '../components/FootfallChart'

const L = {
  en: { title: 'Stations', sub: 'Footfall, peak hours and inventory for every station on the network.', riders: 'riders / day', weekday: 'Weekday', weekend: 'Weekend', peak: 'Peak', spots: 'Spots at this station', vacant: 'vacant', potential: 'Vacant potential', busiest: 'Busiest observed day', week: 'Daily footfall this week', open: 'Open', none: 'No spots at this station.', mo: '/mo' },
  hi: { title: 'स्टेशन', sub: 'हर स्टेशन की यात्री संख्या, व्यस्त समय और उपलब्ध जगहें।', riders: 'यात्री / दिन', weekday: 'कार्यदिवस', weekend: 'सप्ताहांत', peak: 'व्यस्त समय', spots: 'इस स्टेशन की जगहें', vacant: 'खाली', potential: 'खाली जगहों से संभावित आय', busiest: 'सबसे व्यस्त दिन', week: 'इस सप्ताह की दैनिक यात्री संख्या', open: 'खोलें', none: 'इस स्टेशन पर कोई जगह नहीं।', mo: '/माह' },
  gu: { title: 'સ્ટેશન', sub: 'દરેક સ્ટેશનની મુસાફર સંખ્યા, વ્યસ્ત સમય અને ઉપલબ્ધ જગ્યાઓ.', riders: 'મુસાફરો / દિવસ', weekday: 'કામકાજનો દિવસ', weekend: 'સપ્તાહાંત', peak: 'વ્યસ્ત સમય', spots: 'આ સ્ટેશનની જગ્યાઓ', vacant: 'ખાલી', potential: 'ખાલી જગ્યાઓથી સંભવિત આવક', busiest: 'સૌથી વ્યસ્ત દિવસ', week: 'આ અઠવાડિયાની દૈનિક મુસાફર સંખ્યા', open: 'ખોલો', none: 'આ સ્ટેશન પર કોઈ જગ્યા નથી.', mo: '/મહિનો' },
}

export default function Stations() {
  const { lang, tx } = useLang()
  const s = L[lang] || L.en
  const [stations, setStations] = useState(null)
  const [sel, setSel] = useState(null)
  const [detail, setDetail] = useState(null)
  const [footfall, setFootfall] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.stations().then((st) => { setStations(st); setSel(st[0]?.station_id) }).catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!sel) return
    setDetail(null); setFootfall(null)
    api.station(sel).then(setDetail).catch((e) => setError(e.message))
    api.footfall(sel).then(setFootfall).catch(() => {})
  }, [sel])

  if (error) return <div className="error">{error}</div>
  if (!stations) return <div className="skeleton" style={{ height: 300 }} />
  const maxDay = Math.max(1, ...(footfall?.daily || []).map((d) => d.total))

  return (
    <div className="stack">
      <div>
        <h1>{s.title}</h1>
        <div className="muted">{s.sub}</div>
      </div>
      <div className="split" style={{ gridTemplateColumns: 'minmax(240px, 0.8fr) minmax(0, 2fr)' }}>
        <div className="card" style={{ padding: 0 }}>
          {stations.map((st) => (
            <button key={st.station_id} onClick={() => setSel(st.station_id)}
              className="station-row" style={{
                display: 'flex', width: '100%', justifyContent: 'space-between', gap: 8, padding: '12px 16px', border: 0,
                borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'var(--text)',
                background: sel === st.station_id ? 'var(--soft-green)' : 'transparent',
                boxShadow: sel === st.station_id ? 'inset 3px 0 0 var(--orange)' : 'none',
              }}>
              <span><b>{st.name}</b><div className="muted tiny">{tx('stype', st.station_type)} · {st.line}</div></span>
              <span style={{ textAlign: 'right' }}><b>{num(st.avg_daily_footfall)}</b><div className="muted tiny">{s.riders}</div></span>
            </button>
          ))}
        </div>

        {!detail ? <div className="skeleton" style={{ height: 420 }} /> : (
          <div className="stack">
            <div className="grid g4">
              <div className="card"><div className="label">{s.riders}</div><div className="big">{num(detail.avg_daily_footfall)}</div></div>
              <div className="card"><div className="label">{s.weekday}</div><div className="big">{num(detail.weekday_daily)}</div></div>
              <div className="card"><div className="label">{s.weekend}</div><div className="big">{num(detail.weekend_daily)}</div></div>
              <div className="card"><div className="label">{s.potential}</div><div className="big money">{lakh(detail.spots.filter((x) => x.status === 'vacant').reduce((t, x) => t + x.monthly_price, 0))}</div></div>
            </div>

            <div className="card">
              <div className="card-title"><h2>{detail.name}</h2><span className="muted small">{s.peak}: <b>{detail.peak_label}</b></span></div>
              <FootfallChart data={footfall} />
            </div>

            {footfall?.daily && (
              <div className="card">
                <h3 style={{ marginBottom: 12 }}>{s.week}</h3>
                {footfall.daily.map((d) => (
                  <div key={d.date} className="row" style={{ gap: 12, marginBottom: 6 }}>
                    <span className="mono" style={{ width: 92 }}>{d.date}</span>
                    <div className="bar" style={{ flex: 1 }}><div style={{ width: `${(d.total / maxDay) * 100}%` }} /></div>
                    <b style={{ width: 70, textAlign: 'right' }}>{num(d.total)}</b>
                  </div>
                ))}
                {footfall.peak_day && <div className="muted small" style={{ marginTop: 8 }}>{s.busiest}: <b>{footfall.peak_day.date}</b> ({num(footfall.peak_day.total)})</div>}
              </div>
            )}

            <div className="card">
              <h3 style={{ marginBottom: 12 }}>{s.spots}</h3>
              {detail.spots.length === 0 ? <div className="empty">{s.none}</div> : (
                <div className="table-wrap">
                  <table>
                    <tbody>
                      {detail.spots.map((sp) => (
                        <tr key={sp.spot_id} className="clickable" onClick={() => go(`/spot/${sp.spot_id}`)}>
                          <td className="mono">{sp.spot_id}</td>
                          <td>{tx('type', sp.spot_type)}</td>
                          <td>{tx('zone', sp.zone)}</td>
                          <td><span className={`tier ${sp.tier}`}>{tx('tier', sp.tier)}</span></td>
                          <td><span className={`badge ${sp.status === 'vacant' ? 'warn' : 'good'}`}>{tx('status', sp.status)}</span></td>
                          <td className="num price">{inr(sp.monthly_price)}<span className="muted tiny">{s.mo}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
