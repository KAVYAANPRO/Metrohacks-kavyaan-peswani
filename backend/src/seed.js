// Deterministic synthetic data for Yieldline. Same seed => same numbers every run,
// so the demo is repeatable. Swap with real AFC entry/exit data via POST /api/admin/import.

import { readFileSync } from 'node:fs';

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Calibration (see DATA_SOURCES.md). Station-wise counts are NOT public, so the split below is our
// estimate, constrained by published network totals:
//  - Routine weekdays ~1.95-2.03 lakh passenger journeys/day, Jul-Aug 2026 (GMRC via DeshGujarat, 14 Aug 2026).
//    One journey = 1 entry + 1 exit, so ~4 lakh gate taps/day across 54 stations (avg ~7,400/station).
//  - Phase 2 (Gandhinagar: Yellow + Violet lines) carried only ~10-12% of journeys
//    (24 May 2026: 14,394 of 1,17,939; GMRC via IANS, 1 Jun 2026), so GIFT City / Sachivalaya are small.
//  - Line assignments and names follow the GMRC network map (e.g. "Commerce Six Road", Gujarat University on Blue).
// Old High Court counts gate taps only; Blue<->Red transfers do not pass AFC gates.
const STATIONS = [
  // id, name, line, type, tier, base weekday daily footfall (entries + exits)
  ['ST01', 'Kalupur Railway Station', 'Blue', 'interchange', 'A', 26000],
  ['ST02', 'Old High Court', 'Blue / Red', 'interchange', 'A', 21000],
  ['ST03', 'GIFT City', 'Violet', 'office', 'A', 4000],
  ['ST04', 'Sachivalaya', 'Yellow', 'office', 'B', 3000],
  ['ST05', 'Gujarat University', 'Blue', 'college', 'B', 15000],
  ['ST06', 'Commerce Six Road', 'Blue', 'college', 'B', 13000],
  ['ST07', 'Motera Stadium', 'Red / Yellow', 'stadium', 'B', 9000],
  ['ST08', 'Thaltej Gam', 'Blue', 'residential', 'C', 9500],
  ['ST09', 'Vastral Gam', 'Blue', 'residential', 'C', 8500],
  ['ST10', 'APMC', 'Red', 'residential', 'C', 11000],
];

export const HOURS = Array.from({ length: 19 }, (_, i) => i + 5); // 5..23

// Relative hourly weights by station type (hour 5..23)
const PROFILES = {
  office: [0.2, 0.6, 1.8, 4.2, 5.5, 3.2, 1.5, 1.4, 1.6, 1.3, 1.2, 1.6, 2.6, 4.8, 5.2, 3.0, 1.2, 0.6, 0.3],
  college: [0.1, 0.4, 2.8, 5.0, 4.6, 2.4, 1.6, 1.8, 2.2, 2.0, 2.6, 3.4, 3.0, 2.0, 1.4, 1.0, 0.6, 0.3, 0.2],
  residential: [0.6, 1.8, 3.6, 4.4, 3.4, 2.0, 1.4, 1.2, 1.2, 1.3, 1.5, 2.0, 2.8, 3.8, 4.2, 3.4, 2.2, 1.2, 0.5],
  interchange: [1.2, 2.4, 3.4, 4.6, 4.8, 3.6, 3.0, 2.8, 2.9, 2.8, 3.0, 3.3, 3.8, 4.7, 4.9, 4.0, 3.0, 2.0, 1.2],
  stadium: [0.2, 0.6, 1.6, 2.8, 2.6, 1.6, 1.2, 1.2, 1.3, 1.2, 1.4, 1.8, 2.2, 2.8, 2.6, 1.8, 1.0, 0.5, 0.3],
};

const WEEKEND_FACTOR = { office: 0.35, college: 0.45, residential: 0.9, interchange: 1.05, stadium: 1.3 };

const AUDIENCE = [
  ['interchange', 0.3, 0.42, 0.28, 'long-distance travellers, daily commuters, families, traders'],
  ['office', 0.18, 0.62, 0.2, 'office-goers, IT and finance staff, sales reps'],
  ['college', 0.64, 0.24, 0.12, 'college students, coaching aspirants, young faculty'],
  ['residential', 0.24, 0.4, 0.36, 'homemakers, local residents, school parents, shoppers'],
  ['stadium', 0.46, 0.38, 0.16, 'sports fans, event-goers, young groups'],
];

const SIZES = {
  ad_panel: ['6x4 ft backlit', '10x6 ft backlit', '4x3 ft digital', '20x10 ft wall wrap', '8x4 ft digital'],
  kiosk: ['40 sqft', '60 sqft', '80 sqft'],
  shop: ['120 sqft', '180 sqft', '250 sqft'],
};

// ---- Daily network level, Jul–Sep 2026 ----
// Anchors are published GMRC network journeys/day (see DATA_SOURCES.md and data/gmrc_daily.json).
// Between anchors the routine-weekday level is interpolated linearly; Saturday/Sunday dips follow
// the published Sunday ratio (24 May 2026: 1.18 lakh vs 1.53 lakh May average, ~0.77).
const REF_JOURNEYS = 200000; // routine weekday level the station bases above are calibrated to
const START = Date.UTC(2026, 6, 1); // 1 Jul 2026
const N_DAYS = 92; // through 30 Sep 2026
// Weekend dips sized so monthly averages match GMRC monthly totals (Aug 2026 ≈ 1.75 lakh/day vs >2 lakh weekdays).
const DOW_FACTOR = { 0: 0.6, 6: 0.72 };
const BUILTIN_ANCHORS = [
  ['2026-07-01', 195000],
  ['2026-08-07', 200436],
  ['2026-08-10', 203215],
  ['2026-09-30', 200000],
];

function loadPublished() {
  try {
    return JSON.parse(readFileSync(new URL('./data/gmrc_daily.json', import.meta.url), 'utf8'));
  } catch {
    return { points: [], events: [] };
  }
}

function buildDays() {
  const pub = loadPublished();
  const inRange = (iso) => iso >= '2026-07-01' && iso <= '2026-09-30';
  const routine = (pub.points || []).filter((p) => inRange(p.date) && (!p.kind || p.kind === 'normal') && p.journeys > 100000);
  const anchors = new Map(BUILTIN_ANCHORS);
  for (const p of routine) anchors.set(p.date, p.journeys);
  const list = [...anchors.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const exact = new Map((pub.points || []).filter((p) => inRange(p.date)).map((p) => [p.date, p]));
  const events = new Set((pub.events || []).filter((e) => inRange(e.date) && /cricket|concert/i.test(e.type || '')).map((e) => e.date));
  if (events.size === 0) events.add('2026-09-19'); // illustrative match day so the stadium spike is visible
  const level = (iso) => {
    const t = Date.parse(iso);
    let prev = list[0], next = list[list.length - 1];
    for (const a of list) { if (Date.parse(a[0]) <= t) prev = a; if (Date.parse(a[0]) >= t) { next = a; break; } }
    const t0 = Date.parse(prev[0]), t1 = Date.parse(next[0]);
    return t1 === t0 ? prev[1] : prev[1] + ((next[1] - prev[1]) * (t - t0)) / (t1 - t0);
  };
  return Array.from({ length: N_DAYS }, (_, i) => {
    const date = new Date(START + i * 86400000);
    const iso = date.toISOString().slice(0, 10);
    const dow = date.getUTCDay();
    const base = level(iso);
    const pinned = exact.get(iso);
    // When a published figure exists for that exact day, the network factor reproduces it.
    const netFactor = pinned && !events.has(iso) ? pinned.journeys / base : DOW_FACTOR[dow] ?? 1;
    return { iso, dow, weekend: dow === 0 || dow === 6, level: base, netFactor, event: events.has(iso), published: pinned?.journeys ?? null };
  });
}

function eventWeightSum(weights) {
  return HOURS.reduce((t, h, i) => t + weights[i] * (h >= 15 && h <= 22 ? (h >= 17 && h <= 21 ? 2.2 : 1.4) : 1), 0);
}

export function generateSeed() {
  const rnd = mulberry32(42);
  const uniform = (a, b) => a + (b - a) * rnd();
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  const stations = STATIONS.map(([station_id, name, line, station_type, tier]) => ({
    _id: station_id, station_id, name, line, station_type, tier,
  }));

  const audience = AUDIENCE.map(([station_type, a, b, c, top_segments]) => ({
    _id: station_type, station_type, age_16_25: a, age_26_40: b, age_40_plus: c, top_segments,
  }));

  const days = buildDays();
  const footfall = [];
  const sumBase = STATIONS.reduce((t, st) => t + st[5], 0);
  for (const d of days) {
    // Split the network's day-of-week dip across station types: offices empty out on Sundays,
    // interchanges and the stadium don't. Normalise so the 10 stations follow the network total.
    const typeF = (stype) => (d.dow === 0 ? WEEKEND_FACTOR[stype] * 0.9 : d.dow === 6 ? (1 + WEEKEND_FACTOR[stype]) / 2 : 1);
    const raw = STATIONS.reduce((t, st) => t + st[5] * typeF(st[3]), 0);
    const norm = (sumBase * d.netFactor) / raw;
    for (const [sid, , , stype, , base] of STATIONS) {
      const weights = PROFILES[stype];
      const totalW = weights.reduce((t, w) => t + w, 0);
      let dayTotal = base * (d.level / REF_JOURNEYS) * typeF(stype) * norm;
      if (d.event) dayTotal *= stype === 'stadium' ? 3.2 : 1.06;
      HOURS.forEach((h, i) => {
        let wt = weights[i];
        if (d.event && stype === 'stadium' && h >= 15 && h <= 22) wt *= h >= 17 && h <= 21 ? 2.2 : 1.4;
        const share = wt / (d.event && stype === 'stadium' ? eventWeightSum(weights) : totalW);
        const total = dayTotal * share * uniform(0.93, 1.07);
        let entryShare = 0.5;
        if (stype === 'office' || stype === 'college') entryShare = h < 13 ? 0.35 : 0.65;
        else if (stype === 'residential') entryShare = h < 13 ? 0.65 : 0.35;
        const entries = Math.floor(total * entryShare);
        footfall.push({ station_id: sid, date: d.iso, hour: h, entries, exits: Math.floor(total - entries) });
      });
    }
  }

  // Spots use their own RNG so their ids/types/zones never change when the footfall window changes.
  const srnd = mulberry32(42);
  for (let i = 0; i < 1330; i++) srnd();
  const suniform = (a, b) => a + (b - a) * srnd();
  const spick = (arr) => arr[Math.floor(srnd() * arr.length)];

  const spots = [];
  let n = 1;
  for (const [sid, , , , tier] of STATIONS) {
    const count = tier === 'A' ? 4 + Math.floor(srnd() * 2) : 3 + Math.floor(srnd() * 3);
    for (let i = 0; i < count; i++) {
      const r = srnd();
      const spot_type = r < 0.55 ? 'ad_panel' : r < 0.8 ? 'kiosk' : 'shop';
      const zone = spick(spot_type === 'ad_panel' ? ['concourse', 'exit', 'platform', 'corridor'] : ['concourse', 'exit', 'platform']);
      const id = `SP${String(n).padStart(3, '0')}`;
      spots.push({
        _id: id,
        spot_id: id,
        station_id: sid,
        spot_type,
        zone,
        size: spick(SIZES[spot_type]),
        visibility_score: Math.round(suniform(0.45, 1.0) * 100) / 100,
        status: srnd() < 0.6 ? 'vacant' : 'occupied',
      });
      n++;
    }
  }

  return { stations, audience, footfall, spots };
}
