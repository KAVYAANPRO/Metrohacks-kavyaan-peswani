import { useEffect, useState } from 'react'
import { api, inr, num, pct } from '../api'
import { go } from '../App'
import { useLang } from '../i18n'
import { useAuth } from '../auth'

export default function PitchView({ id, category: initialCategory, health }) {
  const { t, tx, lang } = useLang()
  const { can } = useAuth()
  const canGen = can('pitch.generate')
  const [missing, setMissing] = useState(false) // no cached pitch and the user can't generate one
  const [pitch, setPitch] = useState(null)
  const [card, setCard] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [category, setCategory] = useState(initialCategory)
  const [custom, setCustom] = useState('')

  const generate = async (opts = {}) => {
    if (!canGen) { setMissing(true); return }
    setMissing(false)
    setLoading(true)
    setError(null)
    try {
      const p = await api.pitch(id, { category: opts.category ?? category, force: !!opts.force, language: lang })
      setPitch(p)
      setCard(p.ratecard)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setMissing(false)
    ;(can('ratecard.view') ? api.ratecard(id) : can('spots.view') ? api.spot(id) : Promise.resolve(null))
      .then((c) => c && setCard(c)).catch(() => {})
    // Show cached pitch (in the current language) instantly if we have one, otherwise generate.
    api.getPitch(id, category, lang).then((p) => {
      if (p.mode === 'template' && health?.llm?.available && canGen) return generate()
      setPitch(p); setCard(p.ratecard)
    }).catch((e) => {
      if (e.status && e.status !== 404) setError(e.message)
      else generate()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, lang])

  const target = (c) => {
    if (!canGen) return
    setCategory(c)
    go(`/pitch/${id}${c ? `?category=${encodeURIComponent(c)}` : ''}`)
    generate({ category: c })
  }

  if (missing && !pitch) {
    return (
      <div className="stack">
        <a href={`#/spot/${id}`} className="muted small">{t('pitch.backRate', { id })}</a>
        <div className="card no-access">
          <h2>{t('pitch.noneTitle')}</h2>
          <p className="muted">{t('pitch.noneBody')}</p>
          <a className="btn" href={`#/spot/${id}`}>{t('pitch.backSpot')}</a>
        </div>
      </div>
    )
  }
  if (error && !pitch) return <div className="error">{error} <a href={`#/spot/${id}`}>{t('pitch.backSpot')}</a></div>

  const f = pitch?.facts
  const isAd = card?.pricing_model === 'impressions'
  return (
    <div className="stack">
      <div className="row between no-print">
        <a href={`#/spot/${id}`} className="muted small">{t('pitch.backRate', { id })}</a>
        <div className="row" style={{ gap: 8 }}>
          {pitch && <ModeBadges pitch={pitch} />}
          {canGen && <button className="btn" disabled={loading} onClick={() => generate({ force: true })}>{loading ? <><span className="spinner" /> {t('pitch.writing')}</> : t('pitch.regen')}</button>}
          <button className="btn cta" disabled={!pitch} onClick={() => window.print()}>{t('pitch.pdf')}</button>
        </div>
      </div>

      {pitch && canGen && (
        <div className="card soft no-print">
          <div className="row" style={{ gap: 8 }}>
            <span className="label">{t('pitch.aim')}</span>
            <button className={`btn sm ${!category ? 'primary' : ''}`} onClick={() => target('')}>{t('pitch.bestFit')}</button>
            {pitch.categories.map((c) => (
              <button key={c.name} className={`btn sm ${category === c.name ? 'primary' : ''}`} onClick={() => target(c.name)}>{c.name}</button>
            ))}
            <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (custom.trim()) target(custom.trim()) }}>
              <input type="text" placeholder={t('pitch.custom')} value={custom} onChange={(e) => setCustom(e.target.value)} />
              <button className="btn sm" type="submit">{t('pitch.go')}</button>
            </form>
          </div>
        </div>
      )}

      {!pitch || loading ? (
        <div className="pitch-sheet">
          <div className="row" style={{ gap: 10 }}><span className="spinner" /> <b>{t('pitch.loading')}</b></div>
          <div className="skeleton" style={{ height: 300, marginTop: 20 }} />
        </div>
      ) : (
        <article className="pitch-sheet" lang={pitch.language || 'en'}>
          <div className="row between">
            <div className="eyebrow">{t('pitch.eyebrow')}</div>
            <span className={`tier ${pitch.facts.tier}`}>{tx('tier', pitch.facts.tier)}</span>
          </div>
          <h1>{pitch.pitch.headline}</h1>
          <div className="muted">
            {tx('type', f.spot_type)} · {tx('zone', f.zone)} · {f.size} · {f.station_name} ({t('pitch.station', { stype: tx('stype', f.station_type) })})
            {category && <> · {t('pitch.aimedAt')} <b style={{ color: 'var(--text)' }}>{category}</b></>}
          </div>

          <div className="pitch-numbers">
            <div><div className="label">{t('pitch.dailyFootfall')}</div><div className="big">{num(f.daily_footfall)}</div></div>
            {isAd
              ? <div><div className="label">{t('pitch.monthlyImpr')}</div><div className="big">{num(f.monthly_impressions)}</div></div>
              : <div><div className="label">{t('pitch.dailyShoppers')}</div><div className="big">{num(f.daily_shoppers)}</div></div>}
            <div><div className="label">{t('pitch.peakHours')}</div><div style={{ fontWeight: 700, marginTop: 4 }}>{f.peak_label}</div></div>
            <div><div className="label">{t('pitch.pricePerDay')}</div><div className="big">{inr(f.price_per_day)}</div></div>
          </div>

          <h3>{t('pitch.who')}</h3>
          <p style={{ marginTop: 6 }}>{pitch.audience_profile}</p>
          <div className="row small" style={{ gap: 18 }}>
            <span>16–25 <b>{pct(f.audience.age_16_25)}</b></span>
            <span>26–40 <b>{pct(f.audience.age_26_40)}</b></span>
            <span>40+ <b>{pct(f.audience.age_40_plus)}</b></span>
          </div>

          <div className="grid g2" style={{ marginTop: 18 }}>
            <div>
              <h3>{t('pitch.why')}</h3>
              <ul>{pitch.pitch.why_this_spot.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
            <div>
              <h3>{isAd ? t('pitch.bestAdv') : t('pitch.bestRet')}</h3>
              {pitch.categories.map((c) => (
                <div className="cat" key={c.name}><b>{c.name}</b><div className="small muted">{c.reason}</div></div>
              ))}
            </div>
          </div>

          <div className="price-box">
            <div>
              <div className="label">{isAd ? t('pitch.monthlyRate') : t('pitch.monthlyRent')}</div>
              <div className="huge" style={{ fontSize: 34 }}>{inr(f.monthly_price)}</div>
            </div>
            <div style={{ maxWidth: 380, textAlign: 'right' }}>{pitch.pitch.call_to_action}</div>
          </div>

          {pitch.gujarati_summary && <div className="guj" lang="gu">{pitch.gujarati_summary}</div>}

          <div className="sheet-foot">
            <span>{t('pitch.foot', { id: f.spot_id })}</span>
            <span>{pitch.mode === 'llm' ? t('pitch.writtenBy', { model: pitch.model }) : t('pitch.template')} · {new Date(pitch.created_at).toLocaleDateString('en-IN')}</span>
          </div>
        </article>
      )}
      {error && pitch && <div className="error no-print">{error}</div>}
    </div>
  )
}

function ModeBadges({ pitch }) {
  const { t } = useLang()
  const g = pitch.grounding
  return (
    <>
      <span className={`badge ${pitch.mode === 'llm' ? 'good' : 'warn'}`} title={pitch.fallback_reason || ''}>
        {pitch.mode === 'llm' ? t('pitch.ai', { model: pitch.model }) : t('pitch.templateMode')}
      </span>
      {g && (
        <span className={`badge ${g.passed ? 'good' : 'warn'}`} title={g.passed ? t('pitch.groundedTitle', { n: g.checked }) : t('pitch.unverifiedTitle', { list: g.unverified.join(', ') })}>
          {g.passed ? t('pitch.grounded', { n: g.checked }) : t(g.unverified.length > 1 ? 'pitch.unverifiedN' : 'pitch.unverified1', { n: g.unverified.length })}
        </span>
      )}
      {pitch.cached && <span className="badge dim">{t('pitch.cached')}</span>}
    </>
  )
}
