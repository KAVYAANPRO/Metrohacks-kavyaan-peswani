import express from 'express';
import cors from 'cors';
import { env, DEFAULT_ASSUMPTIONS, ASSUMPTION_LABELS } from './config.js';
import { store } from './store.js';
import { allRateCards, rateCard, rateCardCsv, stationStats, summary } from './pricing.js';
import { generatePitch, llmStatus } from './llm.js';
import { HOURS } from './seed.js';
import { auth, requireAuth, requirePerm as perm, hasPerm } from './auth.js';
import { publicAuthRoutes, protectedAuthRoutes } from './authRoutes.js';
import { mailConfigured } from './mailer.js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const app = express();
app.use(cors({ origin: env.CORS_ORIGINS.includes('*') ? true : env.CORS_ORIGINS }));
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ type: 'text/csv', limit: '20mb' }));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const notFound = (res, what) => res.status(404).json({ error: `${what} not found` });

const api = express.Router();

// Strip the PPP split from a summary unless the caller may see it.
const sum = (req, s) => {
  if (!s || hasPerm(req, 'ppp.view')) return s;
  const { ppp, ...rest } = s;
  return rest;
};

// ---------- sales pipeline ----------
const STAGES = ['vacant', 'pitched', 'negotiating', 'booked'];
const stageOf = (spot) => (spot && STAGES.includes(spot.stage) ? spot.stage : spot?.status === 'occupied' ? 'booked' : 'vacant');
const withStage = (c) => {
  if (!c) return c;
  const sp = store.spots.get(c.spot_id);
  return { ...c, stage: stageOf(sp), stage_updated_at: sp?.stage_updated_at || null, stage_by: sp?.stage_by || null, deal_note: sp?.deal_note || '', deal_value: sp?.deal_value ?? null };
};

// ---------- health ----------
api.get('/health', wrap(async (_req, res) => {
  res.json({ ok: true, db: store.status(), llm: await llmStatus(), mail: { configured: mailConfigured() } });
}));

// ---------- auth (public routes, then everything below requires a valid token) ----------
publicAuthRoutes(api);
api.use(requireAuth);
protectedAuthRoutes(api);

// ---------- assumptions ----------
api.get('/assumptions', perm('ratecard.view'), (_req, res) => {
  res.json({ assumptions: store.assumptions, defaults: DEFAULT_ASSUMPTIONS, labels: ASSUMPTION_LABELS });
});

function validateAssumptions(patch) {
  const errors = [];
  const check = (obj, path = []) => {
    for (const [k, v] of Object.entries(obj)) {
      const p = [...path, k].join('.');
      if (path.length === 0 && !(k in DEFAULT_ASSUMPTIONS)) errors.push(`unknown assumption "${k}"`);
      else if (v && typeof v === 'object') check(v, [...path, k]);
      else if (k === 'event_mode') { if (typeof v !== 'boolean') errors.push(`${p} must be true/false`); }
      else if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) errors.push(`${p} must be a non-negative number`);
    }
  };
  check(patch || {});
  return errors;
}

// Update assumptions and return the recomputed network so the UI updates live.
api.post('/assumptions', perm('assumptions.edit'), wrap(async (req, res) => {
  const errors = validateAssumptions(req.body);
  if (errors.length) return res.status(400).json({ error: 'invalid assumptions', details: errors });
  const assumptions = await store.saveAssumptions(req.body);
  const spotId = req.query.spot_id;
  res.json({
    assumptions,
    summary: sum(req, summary(assumptions)),
    ratecard: spotId ? rateCard(spotId, assumptions) : undefined,
  });
}));

api.post('/assumptions/reset', perm('assumptions.edit'), wrap(async (req, res) => {
  const assumptions = await store.resetAssumptions();
  res.json({ assumptions, summary: sum(req, summary(assumptions)) });
}));

// Preview a what-if without saving: POST body = assumption overrides.
api.post('/simulate', perm('ratecard.view'), (req, res) => {
  const errors = validateAssumptions(req.body);
  if (errors.length) return res.status(400).json({ error: 'invalid assumptions', details: errors });
  const a = { ...store.assumptions };
  for (const [k, v] of Object.entries(req.body || {})) a[k] = v && typeof v === 'object' ? { ...a[k], ...v } : v;
  const spotId = req.query.spot_id;
  res.json({ summary: sum(req, summary(a)), ratecard: spotId ? rateCard(spotId, a) : undefined });
});

// ---------- stations ----------
api.get('/stations', perm('stations.view'), (_req, res) => {
  const cards = allRateCards();
  const out = [...store.stations.keys()].map((id) => {
    const s = stationStats(id);
    const mine = cards.filter((c) => c.station_id === id);
    const vacant = mine.filter((c) => c.status === 'vacant');
    return {
      station_id: s.station_id,
      name: s.name,
      line: s.line,
      station_type: s.station_type,
      tier: s.tier,
      avg_daily_footfall: s.avg_daily_footfall,
      weekday_daily: s.weekday_daily,
      weekend_daily: s.weekend_daily,
      peak_hour: s.peak_hour,
      peak_label: s.peak_label,
      spots_total: mine.length,
      spots_vacant: vacant.length,
      vacant_potential_monthly: vacant.reduce((t, c) => t + c.monthly_price, 0),
    };
  });
  res.json(out.sort((a, b) => b.avg_daily_footfall - a.avg_daily_footfall));
});

api.get('/stations/:id', perm('stations.view'), (req, res) => {
  const s = stationStats(req.params.id);
  if (!s) return notFound(res, 'station');
  const spots = allRateCards().filter((c) => c.station_id === req.params.id);
  res.json({ ...s, spots });
});

api.get('/stations/:id/footfall', perm('stations.view'), (req, res) => {
  const prof = store.profiles.get(req.params.id);
  if (!prof) return notFound(res, 'station');
  const s = stationStats(req.params.id);
  const peakHours = new Set(s.peak_windows.flatMap((w) => Array.from({ length: w.end - w.start }, (_, i) => w.start + i)));
  const hourly = HOURS.map((h) => ({
    hour: h,
    label: `${((h + 11) % 12) + 1}${h < 12 ? 'a' : 'p'}`,
    weekday: Math.round(prof.weekday[h] || 0),
    weekend: Math.round(prof.weekend[h] || 0),
    is_peak: peakHours.has(h),
  }));
  const raw = store.footfall.filter((r) => r.station_id === req.params.id);
  const byDate = {};
  for (const r of raw) {
    byDate[r.date] ||= { date: r.date, entries: 0, exits: 0 };
    byDate[r.date].entries += r.entries;
    byDate[r.date].exits += r.exits;
  }
  res.json({
    station_id: req.params.id,
    name: s.name,
    hourly,
    daily: Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({ ...d, total: d.entries + d.exits })),
    peak_windows: s.peak_windows,
    peak_day: s.peak_day,
  });
});

// ---------- spots ----------
api.get('/spots', perm('spots.view'), (req, res) => {
  const { status, station_id, spot_type, tier, zone, q } = req.query;
  let cards = allRateCards();
  if (status) cards = cards.filter((c) => c.status === status);
  if (station_id) cards = cards.filter((c) => c.station_id === station_id);
  if (spot_type) cards = cards.filter((c) => c.spot_type === spot_type);
  if (tier) cards = cards.filter((c) => c.tier.toLowerCase() === String(tier).toLowerCase());
  if (zone) cards = cards.filter((c) => c.zone === zone);
  if (q) {
    const needle = String(q).toLowerCase();
    cards = cards.filter((c) => `${c.spot_id} ${c.station_name} ${c.spot_type} ${c.zone}`.toLowerCase().includes(needle));
  }
  res.json(cards.map(({ steps, assumptions_used, peak_windows, ...rest }) => withStage(rest)));
});

api.get('/spots/:id', perm('spots.view'), (req, res) => {
  const c = rateCard(req.params.id);
  if (!c) return notFound(res, 'spot');
  res.json(withStage(c));
});

api.get('/spots/:id/ratecard', perm('ratecard.view'), (req, res) => {
  const c = rateCard(req.params.id);
  if (!c) return notFound(res, 'spot');
  const station = stationStats(c.station_id);
  res.json({ ...withStage(c), audience: station.audience, assumptions: store.assumptions, labels: ASSUMPTION_LABELS });
});

api.patch('/spots/:id/status', perm('spots.status'), wrap(async (req, res) => {
  if (!store.spots.has(req.params.id)) return notFound(res, 'spot');
  const { status } = req.body || {};
  if (!['vacant', 'occupied'].includes(status)) return res.status(400).json({ error: 'status must be vacant or occupied' });
  await store.updateSpotStatus(req.params.id, status);
  // Keep the pipeline stage consistent with a manual status flip.
  const sp = store.spots.get(req.params.id);
  if (status === 'occupied' && stageOf(sp) !== 'booked') await store.updateSpotStage(req.params.id, { stage: 'booked', by: req.user?.username || null });
  else if (status === 'vacant' && stageOf(sp) === 'booked') await store.updateSpotStage(req.params.id, { stage: 'vacant', by: req.user?.username || null });
  res.json({ spot: withStage(rateCard(req.params.id)), summary: sum(req, summary()) });
}));

api.patch('/spots/:id/stage', perm('spots.status'), wrap(async (req, res) => {
  if (!store.spots.has(req.params.id)) return notFound(res, 'spot');
  const { stage, note, value } = req.body || {};
  if (!STAGES.includes(stage)) return res.status(400).json({ error: `stage must be one of ${STAGES.join(', ')}` });
  if (value !== undefined && value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
    return res.status(400).json({ error: 'value must be a non-negative number' });
  }
  await store.updateSpotStage(req.params.id, {
    stage,
    by: req.user?.username || null,
    note: note === undefined ? undefined : String(note || '').slice(0, 500),
    value: value === undefined ? undefined : value,
  });
  res.json({ spot: withStage(rateCard(req.params.id)), summary: sum(req, summary()) });
}));

api.get('/pipeline', perm('spots.view'), (_req, res) => {
  res.json(allRateCards().map((c) => {
    const w = withStage(c);
    return {
      spot_id: w.spot_id, station_name: w.station_name, spot_type: w.spot_type, zone: w.zone, tier: w.tier,
      monthly_price: w.monthly_price, stage: w.stage, stage_updated_at: w.stage_updated_at, stage_by: w.stage_by,
      deal_note: w.deal_note, deal_value: w.deal_value,
    };
  }));
});

// Side-by-side comparison of two or more spots: /compare?ids=SP001,SP004
api.get('/compare', perm('spots.view'), (req, res) => {
  const ids = String(req.query.ids || '').split(',').filter(Boolean);
  if (ids.length < 2) return res.status(400).json({ error: 'pass at least two ids, e.g. ?ids=SP001,SP002' });
  const cards = allRateCards();
  const found = ids.map((id) => cards.find((c) => c.spot_id === id)).filter(Boolean);
  if (found.length !== ids.length) return notFound(res, 'one or more spots');
  res.json(found);
});

// ---------- pitches ----------
const LANGS = ['en', 'hi', 'gu'];
const lang = (l) => (LANGS.includes(l) ? l : 'en');

async function makePitch(spotId, { category = '', force = false, language = 'en', by = null } = {}) {
  const card = rateCard(spotId);
  if (!card) return null;
  const cached = store.getPitch(spotId, category, language);
  // Cache is valid while the price it was written against still holds.
  const upgradeTemplate = cached?.mode === 'template' && (await llmStatus()).available;
  if (cached && !force && !upgradeTemplate && cached.priced_at === card.monthly_price) return { ...cached, cached: true };
  const pitch = await generatePitch(card, stationStats(card.station_id), { category, language });
  const saved = await store.savePitch(pitch);
  if (stageOf(store.spots.get(spotId)) === 'vacant') await store.updateSpotStage(spotId, { stage: 'pitched', by: by || null });
  return { ...saved, cached: false };
}

api.get('/spots/:id/pitch', perm('pitch.view'), (req, res) => {
  const p = store.getPitch(req.params.id, req.query.category || '', lang(req.query.language));
  if (!p) return notFound(res, 'pitch');
  res.json({ ...p, cached: true, ratecard: rateCard(req.params.id) });
});

api.get('/spots/:id/pitches', perm('pitch.view'), (req, res) => res.json(store.listPitches(req.params.id)));
api.get('/pitches', perm('pitch.view'), (_req, res) => {
  const list = [...store.pitches.values()].map((p) => {
    const spot = store.spots.get(p.spot_id);
    return {
      spot_id: p.spot_id, category: p.category, language: p.language || 'en', mode: p.mode, model: p.model,
      grounded: p.grounding?.passed ?? null, headline: p.pitch?.headline, created_at: p.created_at,
      station_name: store.stations.get(spot?.station_id)?.name, spot_type: spot?.spot_type, zone: spot?.zone,
      monthly_price: p.facts?.monthly_price,
    };
  });
  res.json(list.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))));
});

api.post('/spots/:id/pitch', perm('pitch.generate'), wrap(async (req, res) => {
  const { category = '', force = false, language } = req.body || {};
  const p = await makePitch(req.params.id, { category: String(category).slice(0, 80), force: Boolean(force), language: lang(language), by: req.user?.username });
  if (!p) return notFound(res, 'spot');
  res.json({ ...p, ratecard: rateCard(req.params.id) });
}));

// Pre-generate pitches for the top vacant spots in the background so the demo is instant.
const pregen = { running: false, done: [], total: 0, started_at: null, finished_at: null };
api.post('/pitches/pregenerate', perm('pitch.generate'), (req, res) => {
  if (pregen.running) return res.status(409).json({ error: 'already running', ...pregen });
  const limit = Math.min(Number(req.body?.limit) || 4, 20);
  const language = lang(req.body?.language);
  const ids = req.body?.spot_ids?.length ? req.body.spot_ids : allRateCards().filter((c) => c.status === 'vacant').slice(0, limit).map((c) => c.spot_id);
  Object.assign(pregen, { running: true, done: [], total: ids.length, started_at: new Date().toISOString(), finished_at: null });
  (async () => {
    for (const id of ids) {
      try {
        const p = await makePitch(id, { language });
        pregen.done.push({ spot_id: id, mode: p?.mode, cached: p?.cached });
      } catch (e) {
        pregen.done.push({ spot_id: id, error: e.message });
      }
    }
    pregen.running = false;
    pregen.finished_at = new Date().toISOString();
  })();
  res.status(202).json(pregen);
});
api.get('/pitches/pregenerate', perm('pitch.generate'), (_req, res) => res.json(pregen));

// ---------- summary & export ----------
api.get('/summary', perm('dashboard.view'), (req, res) => res.json(sum(req, summary())));

api.get('/ratecard.csv', perm('export.csv'), (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="spotvalue_ratecard.csv"');
  res.send('﻿' + rateCardCsv());
});

// ---------- admin ----------
api.use('/admin', perm('data.manage'));
api.post('/admin/reseed', wrap(async (_req, res) => {
  await store.reseed();
  res.json({ ok: true, ...store.status() });
}));

// Drop in real AFC data: CSV body (Content-Type: text/csv) with header
// station_id,date,hour,entries,exits  — or JSON array of the same objects.
api.post('/admin/import/footfall', wrap(async (req, res) => {
  let rows = req.body;
  if (typeof rows === 'string') {
    const [header, ...lines] = rows.trim().split(/\r?\n/);
    const cols = header.split(',').map((c) => c.trim());
    rows = lines.filter(Boolean).map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v.trim()])));
  }
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'no rows' });
  const clean = [];
  for (const [i, r] of rows.entries()) {
    const row = { station_id: r.station_id, date: r.date, hour: Number(r.hour), entries: Number(r.entries), exits: Number(r.exits) };
    if (!store.stations.has(row.station_id) || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !(row.hour >= 0 && row.hour <= 23) ||
      !(row.entries >= 0) || !(row.exits >= 0)) {
      return res.status(400).json({ error: `invalid row ${i + 1}`, row: r });
    }
    clean.push(row);
  }
  await store.importFootfall(clean);
  res.json({ ok: true, imported: clean.length, ...store.status() });
}));

app.use('/api', api);
// In production the API also serves the built React app (frontend/dist), so one service runs everything.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
if (existsSync(dist)) {
  app.use(express.static(dist, { index: 'index.html', maxAge: '1h' }));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  app.get('/', (_req, res) => res.json({ name: 'Yieldline API', health: '/api/health' }));
}

app.use((err, _req, res, _next) => {
  console.error('[api]', err);
  res.status(500).json({ error: 'internal error', message: err.message });
});

await store.init();
await auth.init();
app.listen(env.PORT, () => {
  console.log(`Yieldline API on http://localhost:${env.PORT}  (db: ${store.status().mongo})`);
});
