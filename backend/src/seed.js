// Deterministic synthetic data for SpotValue. Same seed => same numbers every run,
// so the demo is repeatable. Swap with real AFC entry/exit data via POST /api/admin/import.

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

  // 7 days: Mon 14 Sep 2026 .. Sun 20 Sep 2026. Sat 19 Sep = match day at Motera.
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 8, 14 + i));
    return { iso: d.toISOString().slice(0, 10), weekend: d.getUTCDay() === 0 || d.getUTCDay() === 6 };
  });

  const footfall = [];
  for (const [sid, , , stype, , base] of STATIONS) {
    const weights = PROFILES[stype];
    const totalW = weights.reduce((s, w) => s + w, 0);
    for (const d of days) {
      const factor = d.weekend ? WEEKEND_FACTOR[stype] : 1;
      const matchDay = stype === 'stadium' && d.iso === '2026-09-19';
      HOURS.forEach((h, i) => {
        let wt = weights[i];
        if (matchDay && h >= 15 && h <= 22) wt *= h >= 17 && h <= 21 ? 4.5 : 2.5;
        const total = ((base * factor * wt) / totalW) * uniform(0.9, 1.1);
        let entryShare = 0.5;
        if (stype === 'office' || stype === 'college') entryShare = h < 13 ? 0.35 : 0.65;
        else if (stype === 'residential') entryShare = h < 13 ? 0.65 : 0.35;
        const entries = Math.floor(total * entryShare);
        footfall.push({ station_id: sid, date: d.iso, hour: h, entries, exits: Math.floor(total - entries) });
      });
    }
  }

  const spots = [];
  let n = 1;
  for (const [sid, , , , tier] of STATIONS) {
    const count = tier === 'A' ? 4 + Math.floor(rnd() * 2) : 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < count; i++) {
      const r = rnd();
      const spot_type = r < 0.55 ? 'ad_panel' : r < 0.8 ? 'kiosk' : 'shop';
      const zone = pick(spot_type === 'ad_panel' ? ['concourse', 'exit', 'platform', 'corridor'] : ['concourse', 'exit', 'platform']);
      const id = `SP${String(n).padStart(3, '0')}`;
      spots.push({
        _id: id,
        spot_id: id,
        station_id: sid,
        spot_type,
        zone,
        size: pick(SIZES[spot_type]),
        visibility_score: Math.round(uniform(0.45, 1.0) * 100) / 100,
        status: rnd() < 0.6 ? 'vacant' : 'occupied',
      });
      n++;
    }
  }

  return { stations, audience, footfall, spots };
}
