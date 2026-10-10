import { useLang } from '../i18n'

export default function About() {
  const { t } = useLang()
  const dd = { textAlign: 'left', fontWeight: 400 }
  return (
    <div className="stack" style={{ maxWidth: 960 }}>
      <h1>{t('about.title')}</h1>
      <p className="muted">{t('about.intro')}</p>

      <div className="grid g4">
        {[1, 2, 3, 4].map((i) => (
          <div className="card" key={i}><h3>{t(`about.s${i}t`)}</h3><p className="small muted" style={{ marginBottom: 0 }}>{t(`about.s${i}d`)}</p></div>
        ))}
      </div>

      <div className="grid g2">
        <div className="card">
          <h2>{t('about.formulas')}</h2>
          <pre className="mono small" style={{ whiteSpace: 'pre-wrap' }}>{`${t('about.fAd')}
hourly_impressions  = footfall_h × zone_exposure × visibility
monthly_impressions = 22 × weekday_daily + 8 × weekend_daily
monthly_price       = impressions / 1000 × CPM × tier × audience

${t('about.fRetail')}
daily_shoppers = daily_footfall × capture(zone) × conversion × visibility
monthly_sales  = daily_shoppers × avg_ticket × 30
monthly_rent   = max(min_rent, monthly_sales × rent_share)

${t('about.fTiers')}`}</pre>
        </div>
        <div className="card">
          <h2>{t('about.ppp')}</h2>
          <dl className="kv" style={{ gridTemplateColumns: '120px 1fr' }}>
            {[1, 2, 3, 4, 5].map((i) => [
              <dt key={`k${i}`}>{t(`about.k${i}`)}</dt>,
              <dd key={`v${i}`} style={dd}>{t(`about.v${i}`)}</dd>,
            ])}
          </dl>
        </div>
      </div>
      <p className="small muted">{t('about.note')} <code>POST /api/admin/import/footfall</code>.</p>
    </div>
  )
}
