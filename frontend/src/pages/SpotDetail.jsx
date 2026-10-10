import { useEffect, useState } from 'react'
import { api, inr, num, pct, lakh } from '../api'
import FootfallChart from '../components/FootfallChart'
import AssumptionPanel from '../components/AssumptionPanel'
import { go } from '../App'
import { useLang } from '../i18n'
import { useAuth } from '../auth'

export default function SpotDetail({ id }) {
  const { t, tx, lang } = useLang()
  const { can } = useAuth()
  const canRate = can('ratecard.view')
  const canChart = canRate && can('stations.view')
  const canSummary = can('dashboard.view')
  const [card, setCard] = useState(null)
  const [footfall, setFootfall] = useState(null)
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    setCard(null)
    ;(canRate ? api.ratecard(id) : api.spot(id)).then((c) => {
      setCard(c)
      if (canChart) api.footfall(c.station_id).then(setFootfall).catch(() => {})
    }).catch((e) => setError(e.message))
    if (canSummary) api.summary().then(setSummary).catch(() => {})
  }, [id, canRate, canChart, canSummary])

  const onUpdate = (res) => {
    if (res.ratecard) setCard((prev) => ({ ...prev, ...res.ratecard, assumptions: res.assumptions }))
    if (res.summary) setSummary(res.summary)
    setFlash(true)
    setTimeout(() => setFlash(false), 400)
  }

  const toggleStatus = async () => {
    try {
      const res = await api.setStatus(id, card.status === 'vacant' ? 'occupied' : 'vacant')
      setCard((prev) => ({ ...prev, status: res.spot.status }))
      if (canSummary && res.summary) setSummary(res.summary)
    } catch (e) { setError(e.message) }
  }

  if (error) return <div className="error">{error} <a href="#/">{t('spot.backDash')}</a></div>
  if (!card) return <div className="split"><div className="skeleton" style={{ height: 400 }} /><div className="skeleton" style={{ height: 400 }} /></div>

  const isAd = card.pricing_model === 'impressions'
  const typePl = tx('typePl', card.spot_type)
  return (
    <div className="stack">
      <div className="row between">
        <div>
          <a href="#/" className="muted small">{t('spot.allSpots')}</a>
          <div className="row" style={{ gap: 10, marginTop: 6 }}>
            <h1>{tx('type', card.spot_type)} · {tx('zone', card.zone)}</h1>
            <span className={`tier ${card.tier}`}>{tx('tier', card.tier)}</span>
            <span className={`badge ${card.status === 'vacant' ? 'warn' : 'good'}`}>{tx('status', card.status)}</span>
            {card.event_active && <span className="badge hot">{t('spot.matchDay')}</span>}
          </div>
          <div className="muted">
            <span className="mono">{card.spot_id}</span> · {card.station_name} ({tx('stype', card.station_type)}, {t('spot.tier', { tier: card.station_tier })}) · {card.size} · {t('spot.visibility', { v: card.visibility_score })}
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {can('spots.status') && <button className="btn" onClick={toggleStatus}>{card.status === 'vacant' ? t('spot.markFilled') : t('spot.markVacant')}</button>}
          {can('pitch.view') && <button className="btn cta" onClick={() => go(`/pitch/${card.spot_id}`)}>{can('pitch.generate') ? t('spot.genPitch') : t('spot.viewPitch')}</button>}
        </div>
      </div>

      <div className="grid g4">
        <Stat label={t('spot.monthlyPrice')} value={inr(card.monthly_price)} sub={t('spot.perDay', { v: inr(card.price_per_day) })} strong flash={flash} />
        {isAd
          ? <Stat label={t('spot.monthlyImpr')} value={num(card.monthly_impressions)} sub={t('spot.cpm', { v: inr(card.effective_cpm) })} flash={flash} />
          : <Stat label={t('spot.dailyShoppers')} value={num(card.daily_shoppers)} sub={t('spot.estSales', { v: inr(card.monthly_sales) })} flash={flash} />}
        <Stat label={t('spot.dailyFootfall')} value={num(card.daily_footfall)} sub={t('spot.wkSplit', { a: num(card.weekday_daily), b: num(card.weekend_daily) })} />
        <Stat label={t('spot.rank')} value={t('spot.rankVal', { rank: card.rank, of: card.rank_of })} sub={t('spot.rankSub', { type: lang === 'en' ? typePl.toLowerCase() : typePl })} />
      </div>

      {!canRate ? (
        <div className="card soft muted small">{t('spot.noRatecard')}</div>
      ) : (
      <div className="split">
        <div className="stack">
          <div className="card">
            <div className="card-title">
              <h2>{t('spot.howCalc')}</h2>
              <span className="badge">{isAd ? t('spot.imprCpm') : t('spot.revShare')}</span>
            </div>
            <div className="steps">
              {card.steps.map((s) => (
                <div key={s.label} className={`step ${s.highlight ? 'highlight' : ''}`}>
                  <div><div><b>{s.label}</b></div><div className="formula">{s.formula}</div></div>
                  <div className="value">{s.value}</div>
                </div>
              ))}
            </div>
            <p className="small" style={{ marginBottom: 0 }}><b>{t('spot.justification')}</b> {card.justification}</p>
          </div>

          {canChart && <div className="card">
            <div className="card-title">
              <h2>{t('spot.hourly', { station: card.station_name })}</h2>
              <span className="muted small">{t('spot.peak', { label: card.peak_label })}</span>
            </div>
            <FootfallChart data={footfall} />
            {footfall?.peak_day && (
              <div className="muted small" style={{ marginTop: 8 }}>
                {t('spot.busiest')} <b>{footfall.peak_day.date}</b> {t('spot.busiestRiders', { n: num(footfall.peak_day.total) })}
                {card.station_type === 'stadium' && t('spot.matchDayNote')}.
              </div>
            )}
          </div>}

          {card.audience && (
            <div className="card">
              <h2 style={{ marginBottom: 12 }}>{t('spot.audience')}</h2>
              <div className="grid g3">
                <AgeBar label="16–25" v={card.audience.age_16_25} />
                <AgeBar label="26–40" v={card.audience.age_26_40} />
                <AgeBar label="40+" v={card.audience.age_40_plus} />
              </div>
              <div className="small" style={{ marginTop: 10 }}><span className="muted">{t('spot.topSegments')}</span> {card.audience.top_segments}</div>
            </div>
          )}
        </div>

        <div className="stack" style={{ position: 'sticky', top: 72 }}>
          <AssumptionPanel spotId={card.spot_id} assumptions={card.assumptions} stationType={card.station_type} onUpdate={onUpdate} readOnly={!can('assumptions.edit')} />
          {summary && (
            <div className="card">
              <div className="label">{t('spot.networkPotential')}</div>
              <div className="big money" style={{ transition: "opacity .2s", opacity: flash ? 0.4 : 1 }}>{lakh(summary.vacant_potential_monthly)}<span className="muted small">{t('spot.perMonth')}</span></div>
              <div className="muted small">{t('spot.netSub', { n: summary.vacant_count, pct: pct(summary.occupancy_rate) })}</div>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  )
}

function Stat({ label, value, sub, strong, flash }) {
  return (
    <div className={`card stat ${strong ? 'strong' : ''}`}>
      <div className="label">{label}</div>
      <div className="big" style={{ transition: 'opacity .2s', opacity: flash ? 0.4 : 1 }}>{value}</div>
      <div className="small muted">{sub}</div>
    </div>
  )
}

function AgeBar({ label, v }) {
  return (
    <div>
      <div className="row between small"><span>{label}</span><b>{pct(v)}</b></div>
      <div className="bar"><div style={{ width: `${v * 100}%` }} /></div>
    </div>
  )
}
