import { useEffect, useMemo, useState } from 'react'
import { api, inr, num, pct, lakh } from '../api'
import { go } from '../App'
import { useLang } from '../i18n'
import { useAuth } from '../auth'

export default function Dashboard() {
  const { t, tx } = useLang()
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
                  <th>{t('th.spot')}</th><th>{t('th.station')}</th><th>{t('th.type')}</th><th>{t('th.zone')}</th><th>{t('th.size')}</th><th>{t('th.tier')}</th>
                  <th className="num">{t('th.reach')}</th><th className="num">{t('th.perDay')}</th><th className="num">{t('th.monthly')}</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.spot_id} className="clickable" onClick={() => go(`/spot/${s.spot_id}`)}>
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
