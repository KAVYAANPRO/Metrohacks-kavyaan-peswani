// Data layer: MongoDB Atlas is the system of record; an in-memory working copy serves reads
// so the demo is instant. Writes (assumptions, pitches, spot status) go to memory and are
// written through to Mongo. If Mongo is unreachable the app keeps running in-memory.
import dns from 'node:dns';
import { MongoClient } from 'mongodb';
import { env, DEFAULT_ASSUMPTIONS } from './config.js';
import { generateSeed } from './seed.js';

const clone = (o) => JSON.parse(JSON.stringify(o));

export function deepMerge(base, patch) {
  const out = clone(base);
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

const pitchKey = (spotId, category, language) => `${spotId}|${category || ''}|${language || 'en'}`;

const isWeekend = (iso) => {
  const day = new Date(iso + 'T00:00:00Z').getUTCDay();
  return day === 0 || day === 6;
};

class Store {
  constructor() {
    this.client = null;
    this.db = null;
    this.mongoOk = false;
    this.mongoError = null;
    this.stations = new Map();
    this.spots = new Map();
    this.audience = new Map();
    this.footfall = [];
    this.profiles = new Map();
    this.assumptions = clone(DEFAULT_ASSUMPTIONS);
    this.pitches = new Map(); // key `${spot_id}|${category}|${language}`
  }

  async connect() {
    if (!env.MONGODB_URI) {
      this.mongoError = 'MONGODB_URI not set in .env';
      console.warn(`[db] ${this.mongoError} - running in-memory`);
      return;
    }
    // Node on Windows often fails SRV lookups via the system resolver (querySrv ECONNREFUSED).
    if (env.MONGODB_URI.startsWith('mongodb+srv')) {
      try {
        dns.setServers(['8.8.8.8', '1.1.1.1', ...dns.getServers()]);
      } catch { /* keep system DNS */ }
    }
    try {
      this.client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
      await this.client.connect();
      await this.client.db('admin').command({ ping: 1 });
      this.db = this.client.db(env.MONGODB_DB);
      this.mongoOk = true;
      console.log(`[db] connected to MongoDB "${env.MONGODB_DB}"`);
    } catch (e) {
      this.mongoOk = false;
      this.mongoError = String(e.message || e).split('\n')[0].slice(0, 200);
      console.warn(`[db] Mongo connection failed (${this.mongoError}) - running in-memory`);
    }
  }

  async init() {
    await this.connect();
    if (this.mongoOk) {
      try {
        if ((await this.db.collection('stations').countDocuments()) === 0) {
          console.log('[db] empty database, seeding synthetic data');
          await this.seedMongo(generateSeed());
        }
        await this.ensureIndexes();
        await this.loadFromMongo();
        return;
      } catch (e) {
        this.mongoOk = false;
        this.mongoError = String(e.message || e).slice(0, 200);
        console.warn('[db] Mongo read failed, using in-memory seed:', this.mongoError);
      }
    }
    this.loadData(generateSeed());
  }

  async ensureIndexes() {
    await this.db.collection('footfall').createIndex({ station_id: 1, date: 1, hour: 1 });
    await this.db.collection('spots').createIndex({ station_id: 1 });
    await this.db.collection('spots').createIndex({ status: 1 });
    const pitches = this.db.collection('pitches');
    try { await pitches.dropIndex('spot_id_1_category_1'); } catch { /* not present */ }
    await pitches.updateMany({ language: { $exists: false } }, { $set: { language: 'en' } });
    await pitches.createIndex({ spot_id: 1, category: 1, language: 1 }, { unique: true });
  }

  async seedMongo(data, { dropPitches = false } = {}) {
    const { stations, audience, footfall, spots } = data;
    for (const name of ['stations', 'audience', 'footfall', 'spots']) await this.db.collection(name).deleteMany({});
    if (dropPitches) await this.db.collection('pitches').deleteMany({});
    await this.db.collection('stations').insertMany(clone(stations));
    await this.db.collection('audience').insertMany(clone(audience));
    await this.db.collection('footfall').insertMany(clone(footfall));
    await this.db.collection('spots').insertMany(clone(spots));
    const existing = await this.db.collection('settings').findOne({ _id: 'assumptions' });
    if (!existing) await this.db.collection('settings').insertOne({ _id: 'assumptions', ...DEFAULT_ASSUMPTIONS });
  }

  async loadFromMongo() {
    const [stations, audience, footfall, spots, settings, pitches] = await Promise.all([
      this.db.collection('stations').find().toArray(),
      this.db.collection('audience').find().toArray(),
      this.db.collection('footfall').find({}, { projection: { _id: 0 } }).toArray(),
      this.db.collection('spots').find().toArray(),
      this.db.collection('settings').findOne({ _id: 'assumptions' }),
      this.db.collection('pitches').find({}, { projection: { _id: 0 } }).toArray(),
    ]);
    this.loadData({ stations, audience, footfall, spots });
    if (settings) {
      const { _id, ...rest } = settings;
      this.assumptions = deepMerge(DEFAULT_ASSUMPTIONS, rest);
    }
    this.pitches = new Map(pitches.map((p) => [pitchKey(p.spot_id, p.category, p.language), { ...p, language: p.language || 'en' }]));
  }

  loadData({ stations, audience, footfall, spots }) {
    this.stations = new Map(stations.map((s) => [s.station_id, s]));
    this.audience = new Map(audience.map((a) => [a.station_type, a]));
    this.spots = new Map(spots.map((s) => [s.spot_id, s]));
    this.footfall = footfall;
    this.buildProfiles();
  }

  // Average hourly footfall (entries + exits) per station, weekday vs weekend.
  buildProfiles() {
    const acc = new Map();
    for (const r of this.footfall) {
      if (!acc.has(r.station_id)) acc.set(r.station_id, { weekday: {}, weekend: {}, days: {} });
      const a = acc.get(r.station_id);
      const kind = isWeekend(r.date) ? 'weekend' : 'weekday';
      const total = r.entries + r.exits;
      (a[kind][r.hour] ||= []).push(total);
      a.days[r.date] = (a.days[r.date] || 0) + total;
    }
    this.profiles = new Map();
    for (const [sid, a] of acc) {
      const avg = (obj) =>
        Object.fromEntries(Object.entries(obj).map(([h, v]) => [h, v.reduce((s, x) => s + x, 0) / v.length]));
      const dayEntries = Object.entries(a.days);
      const peak = dayEntries.sort((x, y) => y[1] - x[1])[0];
      this.profiles.set(sid, {
        weekday: avg(a.weekday),
        weekend: avg(a.weekend),
        peak_day: peak ? { date: peak[0], total: peak[1], weekend: isWeekend(peak[0]) } : null,
        days_observed: {
          weekday: dayEntries.filter(([d]) => !isWeekend(d)).length,
          weekend: dayEntries.filter(([d]) => isWeekend(d)).length,
        },
      });
    }
  }

  async reseed() {
    const data = generateSeed();
    this.pitches = new Map();
    if (this.mongoOk) {
      await this.seedMongo(data, { dropPitches: true });
      await this.loadFromMongo();
    } else {
      this.loadData(data);
    }
  }

  // Replace footfall with real AFC data: rows of {station_id, date, hour, entries, exits}
  async importFootfall(rows) {
    this.footfall = rows;
    this.buildProfiles();
    this.pitches = new Map();
    if (this.mongoOk) {
      await this.db.collection('footfall').deleteMany({});
      if (rows.length) await this.db.collection('footfall').insertMany(clone(rows));
      await this.db.collection('pitches').deleteMany({});
    }
  }

  async saveAssumptions(patch) {
    this.assumptions = deepMerge(this.assumptions, patch);
    await this.persist('settings', () =>
      this.db.collection('settings').replaceOne({ _id: 'assumptions' }, { _id: 'assumptions', ...this.assumptions }, { upsert: true })
    );
    return this.assumptions;
  }

  async resetAssumptions() {
    this.assumptions = clone(DEFAULT_ASSUMPTIONS);
    return this.saveAssumptions({});
  }

  getPitch(spotId, category = '', language = 'en') {
    return this.pitches.get(pitchKey(spotId, category, language)) || null;
  }

  listPitches(spotId) {
    return [...this.pitches.values()].filter((p) => p.spot_id === spotId);
  }

  async savePitch(doc) {
    const full = { ...doc, category: doc.category || '', language: doc.language || 'en', created_at: new Date().toISOString() };
    this.pitches.set(pitchKey(full.spot_id, full.category, full.language), full);
    await this.persist('pitch', () =>
      this.db.collection('pitches').replaceOne({ spot_id: full.spot_id, category: full.category, language: full.language }, clone(full), { upsert: true })
    );
    return full;
  }

  async updateSpotStatus(spotId, status) {
    const spot = this.spots.get(spotId);
    spot.status = status;
    await this.persist('spot', () => this.db.collection('spots').updateOne({ _id: spotId }, { $set: { status } }));
    return spot;
  }

  async persist(what, fn) {
    if (!this.mongoOk) return;
    try {
      await fn();
    } catch (e) {
      console.warn(`[db] failed to persist ${what}:`, e.message);
    }
  }

  status() {
    return {
      mongo: this.mongoOk ? 'connected' : 'offline',
      mongo_db: this.mongoOk ? env.MONGODB_DB : null,
      mongo_error: this.mongoOk ? null : this.mongoError,
      counts: {
        stations: this.stations.size,
        spots: this.spots.size,
        footfall_rows: this.footfall.length,
        pitches_cached: this.pitches.size,
      },
    };
  }
}

export const store = new Store();
