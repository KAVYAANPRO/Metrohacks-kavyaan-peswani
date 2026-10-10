import { useEffect, useMemo, useState } from 'react'
import { api, inr, num, pct, lakh } from '../api'
import { go } from '../App'
import { useLang } from '../i18n'
import { useAuth } from '../auth'

export default function Dashboard() {
  const { t, tx, lang } = useLang()
  const { can } = useAuth()
  const showRevenue = can('dashboard.view')
  const showStations = can('stations.view')
  const showPpp = can('ppp.view')
  const [csvBusy, setCsvBusy] = useState(false)
  const [csvError, setCsvError] = useState(null)
  const [summary, setSummary] = useState(null)
  const [stations, setStations] = useState(null)
  const [spots, setSpots] = useState(null)
  const [error, setError] = useState(null)
  const [stationFilter, setStationFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [status, setStatus] = useState('vacant')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState([])
  const togglePick = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-3)))
  const X = EXTRA[lang] || EXTRA.en
  const [vacantAll, setVacantAll] = useState([])
  const [fillN, setFillN] = useState(5)
  useEffect(() => { api.spots({ status: 'vacant' }).then(setVacantAll).catch(() => {}) }, [])

  useEffect(() => {
    Promise.all([showRevenue ? api.summary() : null, showStations ? api.stations() : []])
      .then(([s, st]) => { setSummary(s); setStations(st) })
      .catch((e) => setError(e.message))
  }, [showRevenue, showStations])

  useEffect(() => {
    api.spots({ status }).then(setSpots).catch((e) => setError(e.message))
  }, [status])

  const filtered = useMemo(() => {
    if (!spots) return []
    const needle = q.toLowerCase()
    return spots.filter((s) =>
      (!stationFilter || s.station_id === stationFilter) &&
      (!typeFilter || s.spot_type === typeFilter) &&
      (!tierFilter || s.tier === tierFilter) &&
      (!needle || `${s.spot_id} ${s.station_name} ${s.zone} ${s.spot_type} ${tx('zone', s.zone)} ${tx('type', s.spot_type)}`.toLowerCase().includes(needle)))
  }, [spots, stationFilter, typeFilter, tierFilter, q, tx])

  if (error) return <div className="error"><b>{t('dash.errTitle')}</b> {error}. {t('dash.errHint')}</div>
  if ((showRevenue && !summary) || !stations) return <div className="grid g4">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" />)}</div>

  const maxFootfall = Math.max(1, ...stations.map((s) => s.avg_daily_footfall))
  // Without stations.view, build the station filter from the spots themselves.
  const stationOptions = showStations ? stations.map((s) => ({ id: s.station_id, name: s.name }))
    : [...new Map((spots || []).map((s) => [s.station_id, { id: s.station_id, name: s.station_name }])).values()]
  const downloadCsv = async () => {
    setCsvBusy(true); setCsvError(null)
    try { await api.downloadCsv() } catch (e) { setCsvError(e.message) } finally { setCsvBusy(false) }
  }

  return (
    <div className="stack">
      <div className="row between">
        <div>
          <h1>{t('dash.title')}</h1>
          <div className="muted">{t('dash.subtitle')}</div>
        </div>
        {can('export.csv') && (
          <div className="row">
            <button type="button" className="btn" onClick={downloadCsv} disabled={csvBusy}>{csvBusy && <span className="spinner" />}{t('dash.csv')}</button>
          </div>
        )}
      </div>
      {csvError && <div className="error">{csvError}</div>}

      {showRevenue && <section className={`hero${showPpp && summary.ppp ? '' : ' hero-2'}`}>
        <div>
          <div className="label">{t('dash.untapped')}</div>
          <div className="huge">{lakh(summary.vacant_potential_monthly)}</div>
          <div className="sub">{t('dash.untappedSub', { n: summary.vacant_count, annual: lakh(summary.vacant_potential_annual) })}</div>
        </div>
        <div>
          <div className="label">{t('dash.occupancy')}</div>
          <div className="big">{pct(summary.occupancy_rate)}</div>
          <div className="sub">{t('dash.occupancySub', { n: summary.occupied_count, total: summary.total_spots })}</div>
        </div>
        {showPpp && summary.ppp && <>
        <div>
          <div className="label">{t('dash.metroNet')}</div>
          <div className="big">{lakh(summary.ppp.metro_net_monthly)}</div>
          <div className="sub">{t('dash.metroNetSub')}</div>
        </div>
        <div>
          <div className="label">{t('dash.partner')}</div>
          <div className="big">{lakh(summary.ppp.partner_monthly)}</div>
          <div className="sub">{t('dash.partnerSub', { pct: pct(summary.ppp.partner_share) })}</div>
        </div>
        </>}
      </section>}

      {showRevenue && summary.occupied_estimated_monthly > 0 && (
        <section className="card impact">
          <div>
            <div className="label">{X.today}</div>
            <div className="big">{lakh(summary.occupied_estimated_monthly)}<span className="muted small">{t('dash.perMo')}</span></div>
            <div className="muted small">{X.fromFilled.replace('{n}', summary.occupied_count)}</div>
          </div>
          <div className="impact-arrow">→</div>
          <div>
            <div className="label">{X.withAll}</div>
            <div className="big">{lakh(summary.occupied_estimated_monthly + summary.vacant_potential_monthly)}<span className="muted small">{t('dash.perMo')}</span></div>
            <div className="muted small">{X.allSpots.replace('{n}', summary.total_spots)}</div>
          </div>
          <div className="impact-uplift">
            <div className="huge money">+{Math.round((summary.vacant_potential_monthly / summary.occupied_estimated_monthly) * 100)}%</div>
            <div className="muted small">{X.uplift}</div>
          </div>
          <div className="impact-time">
            <div className="label">{X.timeLabel}</div>
            <div className="big">{X.timeValue}</div>
            <div className="muted small">{X.timeSub}</div>
          </div>
        </section>
      )}

      {showRevenue && vacantAll.length > 0 && summary.occupied_estimated_monthly > 0 && (() => {
        const n = Math.min(fillN, vacantAll.length)
        const gain = vacantAll.slice(0, n).reduce((t, c) => t + c.monthly_price, 0)
        const base = summary.occupied_estimated_monthly
        const share = summary.ppp?.partner_share ?? 0.15
        return (
          <section className="card whatif">
            <div className="whatif-head">
              <div>
                <div className="label">{X.wiLabel}</div>
                <h2 style={{ marginTop: 4 }}>{X.wiTitle.replace('{n}', n)}</h2>
              </div>
              <div className="whatif-slider">
                <input type="range" min={1} max={vacantAll.length} value={n} onChange={(e) => setFillN(Number(e.target.value))} aria-label={X.wiLabel} />
                <div className="row between tiny muted"><span>1</span><span>{vacantAll.length}</span></div>
              </div>
            </div>
            <div className="grid g4" style={{ marginTop: 14 }}>
              <div><div className="label">{X.wiMonthly}</div><div className="big money">+{lakh(gain)}</div></div>
              <div><div className="label">{X.wiAnnual}</div><div className="big">+{lakh(gain * 12)}</div></div>
              <div><div className="label">{X.wiUplift}</div><div className="big money">+{Math.round((gain / base) * 100)}%</div></div>
              <div><div className="label">{X.wiMetro}</div><div className="big">{lakh(gain * (1 - share))}</div><div className="muted tiny">{X.wiAfter.replace('{p}', Math.round(share * 100))}</div></div>
            </div>
            <div className="whatif-bar" aria-hidden="true">
              <div style={{ width: `${(base / (base + summary.vacant_potential_monthly)) * 100}%` }} className="wb-base" />
              <div style={{ width: `${(gain / (base + summary.vacant_potential_monthly)) * 100}%` }} className="wb-gain" />
            </div>
            <div className="row tiny muted" style={{ gap: 16, marginTop: 6 }}>
              <span><span className="wb-dot wb-base" /> {X.wiToday}</span>
              <span><span className="wb-dot wb-gain" /> {X.wiAdded.replace('{n}', n)}</span>
            </div>
          </section>
        )
      })()}

      {showRevenue && summary.top_opportunities?.length > 0 && (
        <section>
          <div className="card-title"><h2>{X.sellFirst}</h2><span className="muted small">{X.sellFirstSub}</span></div>
          <div className="grid g5">
            {summary.top_opportunities.map((o, i) => (
              <div key={o.spot_id} className="card station" onClick={() => go(`/spot/${o.spot_id}`)}>
                <div className="row between"><span className="label">#{i + 1} · {o.spot_id}</span><span className={`tier ${o.tier}`}>{tx('tier', o.tier)}</span></div>
                <h3 style={{ margin: '6px 0 2px' }}>{o.station_name}</h3>
                <div className="muted tiny">{tx('type', o.spot_type)} · {tx('zone', o.zone)}</div>
                <div className="big money" style={{ fontSize: 22, marginTop: 8 }}>{inr(o.monthly_price)}</div>
                <div className="muted tiny">{t('dash.perMo')}</div>
                {can('pitch.view') && <button className="btn sm cta" style={{ marginTop: 10 }} onClick={(e) => { e.stopPropagation(); go(`/pitch/${o.spot_id}`) }}>{X.pitchIt}</button>}
              </div>
            ))}
          </div>
        </section>
      )}

      {showStations && <section>
        <div className="card-title"><h2>{t('dash.stations')}</h2><span className="muted small">{t('dash.stationsHint')}</span></div>
        <div className="grid g5">
          {stations.map((s) => (
            <div key={s.station_id}
              className={`card station ${stationFilter === s.station_id ? 'active' : ''}`}
              onClick={() => setStationFilter(stationFilter === s.station_id ? '' : s.station_id)}>
              <div className="row between"><span className="label">{tx('stype', s.station_type)}</span><span className="badge">{t('dash.tier', { tier: s.tier })}</span></div>
              <h3 style={{ margin: '6px 0 2px' }}>{s.name}</h3>
              <div className="muted tiny">{t('dash.line', { line: s.line })}</div>
              <div className="big" style={{ fontSize: 22, marginTop: 8 }}>{num(s.avg_daily_footfall)}</div>
              <div className="muted tiny">{t('dash.ridersDay')}</div>
              <div className="bar" style={{ margin: '8px 0' }}><div style={{ width: `${(s.avg_daily_footfall / maxFootfall) * 100}%` }} /></div>
              <div className="tiny">{t('dash.peak')} <b>{s.peak_label}</b></div>
              <div className="tiny" style={{ marginTop: 4 }}><span className="badge warn" style={{ padding: "0 6px" }}>{t('dash.vacantN', { n: s.spots_vacant })}</span> <b className="money">{lakh(s.vacant_potential_monthly)}</b>{t('dash.perMo')}</div>
            </div>
          ))}
        </div>
      </section>}

      {showRevenue && <section className="grid g3">
        <Breakdown title={t('dash.byType')} rows={summary.by_type.map((r) => ({ key: r.key, label: tx('type', r.key), count: r.count, value: r.monthly }))} />
        <Breakdown title={t('dash.byTier')} rows={summary.by_tier.map((r) => ({ key: r.key, label: tx('tier', r.key), count: r.count, value: r.monthly }))} />
        <Breakdown title={t('dash.byStation')} rows={summary.by_station.slice(0, 5).map((r) => ({ key: r.station_name, label: r.station_name, count: r.count, value: r.monthly }))} />
      </section>}

      <section className="card">
        <div className="card-title">
          <h2>{status === 'vacant' ? t('dash.vacantSpots') : status === 'occupied' ? t('dash.occupiedSpots') : t('dash.allSpots')} <span className="muted small">({filtered.length})</span></h2>
          <div className="row" style={{ gap: 8 }}>
            <input type="search" placeholder={t('dash.search')} value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="vacant">{tx('status', 'vacant')}</option>
              <option value="occupied">{tx('status', 'occupied')}</option>
              <option value="">{t('dash.all')}</option>
            </select>
            <select value={stationFilter} onChange={(e) => setStationFilter(e.target.value)}>
              <option value="">{t('dash.allStations')}</option>
              {stationOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">{t('dash.allTypes')}</option>
              {['ad_panel', 'kiosk', 'shop'].map((k) => <option key={k} value={k}>{tx('typePl', k)}</option>)}
            </select>
            <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)}>
              <option value="">{t('dash.allTiers')}</option>
              {['Premium', 'Standard', 'Value'].map((k) => <option key={k} value={k}>{tx('tier', k)}</option>)}
            </select>
          </div>
        </div>
        {!spots ? <div className="skeleton" /> : filtered.length === 0 ? <div className="empty">{t('dash.empty')}</div> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 28 }} title={X.compareHint}>⇄</th><th>{t('th.spot')}</th><th>{t('th.station')}</th><th>{t('th.type')}</th><th>{t('th.zone')}</th><th>{t('th.size')}</th><th>{t('th.tier')}</th>
                  <th className="num">{t('th.reach')}</th><th className="num">{t('th.perDay')}</th><th className="num">{t('th.monthly')}</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.spot_id} className="clickable" onClick={() => go(`/spot/${s.spot_id}`)}>
                    <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={X.compareHint} checked={picked.includes(s.spot_id)} onChange={() => togglePick(s.spot_id)} /></td>
                    <td className="mono">{s.spot_id}</td>
                    <td>{s.station_name}<div className="muted tiny">{tx('stype', s.station_type)}</div></td>
                    <td>{tx('type', s.spot_type)}</td>
                    <td>{tx('zone', s.zone)}</td>
                    <td className="small">{s.size}</td>
                    <td><span className={`tier ${s.tier}`}>{tx('tier', s.tier)}</span></td>
                    <td className="num small">
                      {s.pricing_model === 'impressions' ? <>{num(s.monthly_impressions)}<div className="muted tiny">{t('dash.impressionsMo')}</div></>
                        : <>{num(s.daily_shoppers)}<div className="muted tiny">{t('dash.shoppersDay')}</div></>}
                    </td>
                    <td className="num">{inr(s.price_per_day)}</td>
                    <td className="num price">{inr(s.monthly_price)}</td>
                    <td><span className="btn sm">{t('dash.open')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {picked.length > 0 && (
        <div className="compare-bar">
          <span><b>{picked.length}</b> {X.selected}: <span className="mono">{picked.join(', ')}</span></span>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm" onClick={() => setPicked([])}>{X.clear}</button>
            <button className="btn sm cta" disabled={picked.length < 2} onClick={() => go(`/compare?ids=${picked.join(',')}`)}>{X.compare}</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Breakdown({ title, rows }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="card">
      <h3 style={{ marginBottom: 12 }}>{title}</h3>
      {rows.map((r) => (
        <div key={r.key} style={{ marginBottom: 10 }}>
          <div className="row between small"><span>{r.label} <span className="muted">· {r.count}</span></span><b>{lakh(r.value)}</b></div>
          <div className="bar orange"><div style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  )
}

const EXTRA = {
  en: { today: 'Earning today', fromFilled: 'from {n} filled spots', withAll: 'With every spot filled', allSpots: 'all {n} spots at suggested prices', uplift: 'non-fare revenue uplift', timeLabel: 'Time to a priced pitch', timeValue: '< 1 min', timeSub: 'was days of manual work', sellFirst: 'Sell these first', sellFirstSub: 'Highest-value vacant spots right now', pitchIt: 'Get pitch →', compareHint: 'Select to compare', selected: 'selected', clear: 'Clear', compare: 'Compare →', wiLabel: 'What-if simulator', wiTitle: 'Fill the top {n} vacant spots', wiMonthly: 'Extra revenue / month', wiAnnual: 'Extra revenue / year', wiUplift: 'Uplift on today', wiMetro: 'Metro keeps / month', wiAfter: 'after {p}% PPP partner share', wiToday: 'Earning today', wiAdded: 'Added by filling top {n}' },
  hi: { today: 'आज की कमाई', fromFilled: '{n} भरी हुई जगहों से', withAll: 'सभी जगहें भरने पर', allSpots: 'सभी {n} जगहें सुझाई गई कीमत पर', uplift: 'नॉन-फ़ेयर आय में बढ़ोतरी', timeLabel: 'कीमत के साथ पिच बनाने का समय', timeValue: '< 1 मिनट', timeSub: 'पहले कई दिन लगते थे', sellFirst: 'पहले इन्हें बेचें', sellFirstSub: 'अभी सबसे ज़्यादा मूल्य वाली खाली जगहें', pitchIt: 'पिच देखें →', compareHint: 'तुलना के लिए चुनें', selected: 'चुनी गईं', clear: 'हटाएँ', compare: 'तुलना करें →', wiLabel: 'क्या-अगर सिम्युलेटर', wiTitle: 'सबसे ऊपर की {n} खाली जगहें भरें', wiMonthly: 'अतिरिक्त आय / माह', wiAnnual: 'अतिरिक्त आय / वर्ष', wiUplift: 'आज से बढ़ोतरी', wiMetro: 'मेट्रो को मिलेगा / माह', wiAfter: '{p}% PPP पार्टनर हिस्से के बाद', wiToday: 'आज की कमाई', wiAdded: 'ऊपर की {n} जगहें भरने से' },
  gu: { today: 'આજની કમાણી', fromFilled: '{n} ભરાયેલી જગ્યાઓથી', withAll: 'બધી જગ્યાઓ ભરાય ત્યારે', allSpots: 'બધી {n} જગ્યાઓ સૂચવેલી કિંમતે', uplift: 'નોન-ફેર આવકમાં વધારો', timeLabel: 'કિંમત સાથે પિચ બનાવવાનો સમય', timeValue: '< 1 મિનિટ', timeSub: 'પહેલાં ઘણા દિવસ લાગતા', sellFirst: 'પહેલાં આ વેચો', sellFirstSub: 'અત્યારે સૌથી વધુ મૂલ્યવાળી ખાલી જગ્યાઓ', pitchIt: 'પિચ જુઓ →', compareHint: 'સરખામણી માટે પસંદ કરો', selected: 'પસંદ', clear: 'હટાવો', compare: 'સરખામણી કરો →', wiLabel: 'જો-તો સિમ્યુલેટર', wiTitle: 'ટોચની {n} ખાલી જગ્યાઓ ભરો', wiMonthly: 'વધારાની આવક / મહિનો', wiAnnual: 'વધારાની આવક / વર્ષ', wiUplift: 'આજ કરતાં વધારો', wiMetro: 'મેટ્રોને મળશે / મહિનો', wiAfter: '{p}% PPP ભાગીદાર હિસ્સા પછી', wiToday: 'આજની કમાણી', wiAdded: 'ટોચની {n} જગ્યાઓ ભરવાથી' },
}
