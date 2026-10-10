import 'dotenv/config';

export const env = {
  MONGODB_URI: (process.env.MONGODB_URI || '').trim(),
  MONGODB_DB: process.env.MONGODB_DB || 'spotvalue',
  PORT: Number(process.env.PORT || 8000),
  CORS_ORIGINS: (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean),
  OLLAMA_URL: (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, ''),
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'gemma3:4b',
  GEMINI_API_KEY: (process.env.GEMINI_API_KEY || '').trim(),
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  LLM_TIMEOUT_MS: Number(process.env.LLM_TIMEOUT_MS || 30000),
  // ---- auth ----
  JWT_SECRET: (process.env.JWT_SECRET || '').trim(),
  ADMIN_USERNAME: (process.env.ADMIN_USERNAME || '').trim(),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  // ---- email ----
  SMTP_HOST: (process.env.SMTP_HOST || '').trim(),
  SMTP_PORT: Number(process.env.SMTP_PORT || 465),
  SMTP_USER: (process.env.SMTP_USER || '').trim(),
  SMTP_PASS: (process.env.SMTP_PASS || '').replace(/\s+/g, ''), // Gmail app passwords are often pasted with spaces
  MAIL_FROM: (process.env.MAIL_FROM || process.env.SMTP_USER || '').trim(),
  APP_URL: (process.env.APP_URL || 'http://localhost:5173').trim().replace(/\/$/, ''),
};

// Every number the pricing engine uses lives here. All are editable via POST /api/assumptions
// and printed on every rate card so a buyer can audit the price.
export const DEFAULT_ASSUMPTIONS = {
  base_cpm: 40, // Rs per 1,000 impressions
  zone_exposure: { concourse: 0.8, exit: 0.7, platform: 0.6, corridor: 0.5 },
  capture_rate: { concourse: 0.06, exit: 0.04, platform: 0.03, corridor: 0.02 },
  conversion_rate: 0.25,
  avg_ticket: { kiosk: 80, shop: 150 },
  rent_share: 0.12,
  min_rent: { kiosk: 15000, shop: 30000 },
  station_tier_multiplier: { A: 1.3, B: 1.0, C: 0.8 },
  audience_multiplier: { interchange: 1.1, office: 1.25, college: 0.95, residential: 0.9, stadium: 1.15 },
  weekday_days: 22,
  weekend_days: 8,
  // Stadium match-day mode
  event_mode: false,
  event_days_per_month: 4,
  event_footfall_multiplier: 2.2,
  // PPP concession: partner's revenue share on spots it fills
  ppp_partner_share: 0.15,
};

export const ASSUMPTION_LABELS = {
  base_cpm: 'Base CPM (₹ per 1,000 impressions)',
  zone_exposure: 'Zone exposure (share of footfall passing the spot)',
  capture_rate: 'Capture rate (share who approach a retail spot)',
  conversion_rate: 'Conversion rate (approachers who buy)',
  avg_ticket: 'Average ticket size (₹)',
  rent_share: 'Rent share of estimated sales',
  min_rent: 'Minimum monthly rent floor (₹)',
  station_tier_multiplier: 'Station tier multiplier',
  audience_multiplier: 'Audience quality multiplier (by station type)',
  weekday_days: 'Weekdays per month',
  weekend_days: 'Weekend days per month',
  event_mode: 'Match-day mode (stadium stations)',
  event_days_per_month: 'Event days per month',
  event_footfall_multiplier: 'Event-day footfall multiplier',
  ppp_partner_share: 'PPP partner revenue share on filled spots',
};
