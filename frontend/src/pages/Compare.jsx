import { useEffect, useState } from 'react'
import { api, inr, num } from '../api'
import { go } from '../App'
import { useLang } from '../i18n'

const L = {
  en: { title: 'Compare spots', sub: 'Side-by-side, every number from the same footfall data. Orange marks the stronger spot on each row.', back: '← Back to dashboard', pick: 'Tick 2–3 spots on the dashboard to compare them.', station: 'Station', type: 'Type', zone: 'Zone', size: 'Size', vis: 'Visibility', footfall: 'Daily footfall', peak: 'Peak hours', reach: 'Monthly reach', cpm: 'Cost per 1,000 people reached', price: 'Monthly price', perDay: 'Per day', tier: 'Tier', rank: 'Network rank', open: 'Open rate card', pitch: 'Pitch', verdict: 'Best value for money', verdictSub: 'Lowest cost per 1,000 people reached', impressions: 'impressions', shoppers: 'shoppers / day' },
  hi: { title: 'जगहों की तुलना', sub: 'एक साथ तुलना, सभी आँकड़े एक ही यात्री डेटा से। नारंगी रंग हर पंक्ति में बेहतर जगह दिखाता है।', back: '← डैशबोर्ड पर वापस', pick: 'तुलना के लिए डैशबोर्ड पर 2–3 जगहें चुनें।', station: 'स्टेशन', type: 'प्रकार', zone: 'क्षेत्र', size: 'आकार', vis: 'दृश्यता', footfall: 'दैनिक यात्री', peak: 'व्यस्त समय', reach: 'मासिक पहुँच', cpm: 'प्रति 1,000 लोगों तक पहुँच की लागत', price: 'मासिक कीमत', perDay: 'प्रति दिन', tier: 'श्रेणी', rank: 'नेटवर्क में स्थान', open: 'रेट कार्ड खोलें', pitch: 'पिच', verdict: 'सबसे किफ़ायती', verdictSub: 'प्रति 1,000 लोगों तक सबसे कम लागत', impressions: 'इम्प्रेशन', shoppers: 'ग्राहक / दिन' },
  gu: { title: 'જગ્યાઓની સરખામણી', sub: 'એકસાથે સરખામણી, બધા આંકડા એક જ મુસાફર ડેટામાંથી. નારંગી રંગ દરેક પંક્તિમાં વધુ સારી જગ્યા બતાવે છે.', back: '← ડેશબોર્ડ પર પાછા', pick: 'સરખામણી માટે ડેશબોર્ડ પર 2–3 જગ્યાઓ પસંદ કરો.', station: 'સ્ટેશન', type: 'પ્રકાર', zone: 'વિસ્તાર', size: 'કદ', vis: 'દૃશ્યતા', footfall: 'દૈનિક મુસાફરો', peak: 'વ્યસ્ત સમય', reach: 'માસિક પહોંચ', cpm: '1,000 લોકો સુધી પહોંચનો ખર્ચ', price: 'માસિક કિંમત', perDay: 'પ્રતિ દિવસ', tier: 'શ્રેણી', rank: 'નેટવર્કમાં ક્રમ', open: 'રેટ કાર્ડ ખોલો', pitch: 'પિચ', verdict: 'સૌથી વધુ કિંમત-લાભ', verdictSub: '1,000 લોકો સુધી સૌથી ઓછો ખર્ચ', impressions: 'ઇમ્પ્રેશન', shoppers: 'ગ્રાહકો / દિવસ' },
}

// People reached per month: impressions for panels, shoppers × 30 for retail.
const reachOf = (c) => (c.pricing_model === 'impressions' ? c.monthly_impressions : (c.daily_shoppers || 0) * 30)
const costPer1k = (c) => (reachOf(c) ? (c.monthly_price / reachOf(c)) * 1000 : null)

export default function Compare({ ids }) {
  const { lang, tx } = useLang()
  const s = L[lang] || L.en
  const [cards, setCards] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (ids.length < 2) return
    Promise.all(ids.map((id) => api.spot(id))).then(setCards).catch((e) => setError(e.message))
  }, [ids.join(',')])

  if (ids.length < 2) return <div className="stack"><a href="#/" className="muted small">{s.back}</a><div className="empty">{s.pick}</div></div>
  if (error) return <div className="error">{error}</div>
  if (!cards) return <div className="skeleton" style={{ height: 360 }} />

  const best = (fn, higher = true) => {
    const vals = cards.map(fn).filter((v) => v != null)
    if (!vals.length) return null
    return higher ? Math.max(...vals) : Math.min(...vals)
  }
  const winner = cards.reduce((w, c) => (costPer1k(c) != null && (w == null || costPer1k(c) < costPer1k(w)) ? c : w), null)

  const rows = [
    [s.station, (c) => <><b>{c.station_name}</b><div className="muted tiny">{tx('stype', c.station_type)} · {c.line}</div></>],
    [s.type, (c) => `${tx('type', c.spot_type)} · ${tx('zone', c.zone)}`],
    [s.size, (c) => c.size],
    [s.vis, (c) => c.visibility_score, (c) => c.visibility_score, true],
    [s.footfall, (c) => num(c.daily_footfall), (c) => c.daily_footfall, true],
    [s.peak, (c) => c.peak_label],
    [s.reach, (c) => <>{num(reachOf(c))} <span className="muted tiny">{c.pricing_model === 'impressions' ? s.impressions : `(${num(c.daily_shoppers)} ${s.shoppers})`}</span></>, reachOf, true],
    [s.cpm, (c) => (costPer1k(c) != null ? inr(costPer1k(c)) : '—'), costPer1k, false],
    [s.price, (c) => <b>{inr(c.monthly_price)}</b>],
    [s.perDay, (c) => inr(c.price_per_day)],
    [s.tier, (c) => <span className={`tier ${c.tier}`}>{tx('tier', c.tier)}</span>],
    [s.rank, (c) => `#${c.rank} / ${c.rank_of}`],
  ]

  return (
    <div className="stack">
      <a href="#/" className="muted small">{s.back}</a>
      <div><h1>{s.title}</h1><div className="muted">{s.sub}</div></div>

      {winner && (
        <div className="hero" style={{ gridTemplateColumns: '1fr auto', alignItems: 'center' }}>
          <div>
            <div className="label">{s.verdict}</div>
            <div className="big">{winner.spot_id} · {winner.station_name}</div>
            <div className="sub">{s.verdictSub}: {inr(costPer1k(winner))}</div>
          </div>
          <button className="btn cta" onClick={() => go(`/spot/${winner.spot_id}`)}>{s.open} →</button>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              {cards.map((c) => <th key={c.spot_id} className="mono" style={{ fontSize: 13 }}>{c.spot_id}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, render, metric, higher]) => {
              const top = metric ? best(metric, higher) : null
              return (
                <tr key={label}>
                  <td className="muted small" style={{ whiteSpace: 'nowrap' }}>{label}</td>
                  {cards.map((c) => {
                    const win = metric && top != null && metric(c) === top && cards.length > 1
                    return <td key={c.spot_id} style={win ? { color: 'var(--orange)', fontWeight: 700 } : undefined}>{render(c)}</td>
                  })}
                </tr>
              )
            })}
            <tr>
              <td></td>
              {cards.map((c) => (
                <td key={c.spot_id}>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn sm" onClick={() => go(`/spot/${c.spot_id}`)}>{s.open}</button>
                    <button className="btn sm primary" onClick={() => go(`/pitch/${c.spot_id}`)}>{s.pitch}</button>
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
