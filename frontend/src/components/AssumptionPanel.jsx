import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useLang } from '../i18n'

// Live-editable assumptions. Changes are debounced and POSTed; the parent receives the
// recomputed rate card so prices update as the slider moves.
export default function AssumptionPanel({ spotId, assumptions, stationType, onUpdate, readOnly = false }) {
  const { t, tx } = useLang()
  const [a, setA] = useState(assumptions)
  const [saving, setSaving] = useState(false)
  const timer = useRef(null)

  useEffect(() => setA(assumptions), [assumptions])

  const push = (patch) => {
    setA((prev) => mergeDeep(prev, patch))
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setSaving(true)
      try { onUpdate(await api.saveAssumptions(patch, spotId)) } finally { setSaving(false) }
    }, 180)
  }

  const reset = async () => {
    setSaving(true)
    try {
      await api.resetAssumptions()
      onUpdate(await api.saveAssumptions({}, spotId))
    } finally { setSaving(false) }
  }

  if (!a) return null
  const zone = (k) => tx('zone', k)
  const type = (k) => tx('type', k)
  const fmtPct = (v) => `${(v * 100).toFixed(1).replace(/\.0$/, '')}%`
  if (readOnly) {
    return (
      <div className="card">
        <div className="card-title">
          <h3>{t('ap.title')}</h3>
          <span className="badge dim">{t('ap.readOnly')}</span>
        </div>
        <dl className="kv">
          <dt>{t('ap.cpm')}</dt><dd>₹{a.base_cpm}</dd>
          <dt>{t('ap.rentShare')}</dt><dd>{fmtPct(a.rent_share)}</dd>
          <dt>{t('ap.conversion')}</dt><dd>{fmtPct(a.conversion_rate)}</dd>
          <dt>{t('ap.audience', { stype: tx('stype', stationType) })}</dt><dd>{(a.audience_multiplier?.[stationType] ?? 1).toFixed(2)}x</dd>
          <dt>{t('ap.ppp')}</dt><dd>{fmtPct(a.ppp_partner_share)}</dd>
          <dt>{t('ap.matchDay')}</dt><dd>{a.event_mode ? t('ap.on') : t('ap.off')}</dd>
          <dt>{t('ap.zoneExp')}</dt><dd>{fmtMap(a.zone_exposure, false, '', zone)}</dd>
          <dt>{t('ap.capture')}</dt><dd>{fmtMap(a.capture_rate, true, '', zone)}</dd>
          <dt>{t('ap.ticket')}</dt><dd>{fmtMap(a.avg_ticket, false, '₹', type)}</dd>
          <dt>{t('ap.minRent')}</dt><dd>{fmtMap(a.min_rent, false, '₹', type)}</dd>
          <dt>{t('ap.tierMult')}</dt><dd>{fmtMap(a.station_tier_multiplier)}</dd>
          <dt>{t('ap.month')}</dt><dd>{t('ap.monthVal', { wd: a.weekday_days, we: a.weekend_days })}</dd>
        </dl>
        <div className="tiny muted" style={{ marginTop: 10 }}>{t('ap.readOnlyHint')}</div>
      </div>
    )
  }
  return (
    <div className="card">
      <div className="card-title">
        <h3>{t('ap.title')}</h3>
        <div className="row" style={{ gap: 8 }}>
          {saving && <span className="spinner" />}
          <button className="btn sm" onClick={reset}>{t('ap.reset')}</button>
        </div>
      </div>
      <div className="stack">
        <Slider label={t('ap.cpm')} unit={t('ap.cpmUnit')} min={10} max={150} step={1} value={a.base_cpm} onChange={(v) => push({ base_cpm: v })} />
        <Slider label={t('ap.rentShare')} value={a.rent_share} min={0.05} max={0.3} step={0.005} pct onChange={(v) => push({ rent_share: v })} />
        <Slider label={t('ap.conversion')} value={a.conversion_rate} min={0.05} max={0.6} step={0.01} pct onChange={(v) => push({ conversion_rate: v })} />
        <Slider label={t('ap.audience', { stype: tx('stype', stationType) })} value={a.audience_multiplier?.[stationType] ?? 1} min={0.5} max={2} step={0.05} x
          onChange={(v) => push({ audience_multiplier: { [stationType]: v } })} />
        <Slider label={t('ap.ppp')} value={a.ppp_partner_share} min={0} max={0.4} step={0.01} pct onChange={(v) => push({ ppp_partner_share: v })} />
        <label className="toggle">
          <span><b>{t('ap.matchDay')}</b><div className="muted tiny">{t('ap.matchDaySub', { days: a.event_days_per_month, mult: a.event_footfall_multiplier })}</div></span>
          <input type="checkbox" checked={!!a.event_mode} onChange={(e) => push({ event_mode: e.target.checked })} />
        </label>
      </div>
      <details style={{ marginTop: 14 }}>
        <summary className="small" style={{ cursor: 'pointer' }}>{t('ap.all')}</summary>
        <dl className="kv" style={{ marginTop: 10 }}>
          <dt>{t('ap.zoneExp')}</dt><dd>{fmtMap(a.zone_exposure, false, '', zone)}</dd>
          <dt>{t('ap.capture')}</dt><dd>{fmtMap(a.capture_rate, true, '', zone)}</dd>
          <dt>{t('ap.ticket')}</dt><dd>{fmtMap(a.avg_ticket, false, '₹', type)}</dd>
          <dt>{t('ap.minRent')}</dt><dd>{fmtMap(a.min_rent, false, '₹', type)}</dd>
          <dt>{t('ap.tierMult')}</dt><dd>{fmtMap(a.station_tier_multiplier)}</dd>
          <dt>{t('ap.month')}</dt><dd>{t('ap.monthVal', { wd: a.weekday_days, we: a.weekend_days })}</dd>
        </dl>
      </details>
    </div>
  )
}

function Slider({ label, value, min, max, step, onChange, unit, pct, x }) {
  const shown = pct ? `${(value * 100).toFixed(1).replace(/\.0$/, '')}%` : x ? `${value.toFixed(2)}x` : `₹${value}`
  return (
    <div className="slider">
      <div className="slider-head"><span>{label}{unit && <span className="muted tiny"> · {unit}</span>}</span><b>{shown}</b></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}

function fmtMap(m = {}, isPct, prefix = '', label = (k) => k) {
  return Object.entries(m).map(([k, v]) => `${label(k)} ${isPct ? Math.round(v * 100) + '%' : prefix + v.toLocaleString('en-IN')}`).join(' · ')
}

function mergeDeep(a, b) {
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' ? { ...a[k], ...v } : v
  return out
}
