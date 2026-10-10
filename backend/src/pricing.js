// Pricing engine: footfall -> impressions / shoppers -> monthly price, with every step exposed.
import { store } from './store.js';

const round = (x, step = 1) => Math.round(x / step) * step;
export const inr = (x) => '₹' + Math.round(x).toLocaleString('en-IN');
const num = (x) => Math.round(x).toLocaleString('en-IN');
const pct = (x) => `${Math.round(x * 100)}%`;

function fmtHour(h) {
  const hh = ((h + 11) % 12) + 1;
  return `${hh} ${h < 12 || h === 24 ? 'AM' : 'PM'}`;
}

// Peak windows: contiguous hours whose footfall is >= 75% of the busiest hour.
export function peakWindows(curve) {
  const entries = Object.entries(curve).map(([h, v]) => [Number(h), v]).sort((a, b) => a[0] - b[0]);
  if (!entries.length) return [];
  const max = Math.max(...entries.map(([, v]) => v));
  const hot = entries.filter(([, v]) => v >= 0.75 * max).map(([h]) => h);
  const windows = [];
  for (const h of hot) {
    const last = windows[windows.length - 1];
    if (last && h === last.end + 1) last.end = h;
    else windows.push({ start: h, end: h });
  }
  return windows.map((w) => ({
    start: w.start,
    end: w.end + 1,
    label: `${fmtHour(w.start)} – ${fmtHour(w.end + 1)}`,
    share: entries.filter(([h]) => h >= w.start && h <= w.end).reduce((s, [, v]) => s + v, 0) /
      entries.reduce((s, [, v]) => s + v, 0),
  }));
}

export function stationStats(stationId, a = store.assumptions) {
  const station = store.stations.get(stationId);
  const prof = store.profiles.get(stationId);
  if (!station || !prof) return null;
  const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0);
  const weekdayDaily = sum(prof.weekday);
  const weekendDaily = sum(prof.weekend);
  const eventActive = Boolean(a.event_mode) && station.station_type === 'stadium';
  const eventExtra = eventActive ? a.event_days_per_month * (a.event_footfall_multiplier - 1) * weekendDaily : 0;
  const monthlyFootfall = a.weekday_days * weekdayDaily + a.weekend_days * weekendDaily + eventExtra;
  const peaks = peakWindows(prof.weekday);
  const peakHour = Object.entries(prof.weekday).sort((x, y) => y[1] - x[1])[0];
  const audience = store.audience.get(station.station_type) || null;
  return {
    ...station,
    weekday_daily: round(weekdayDaily),
    weekend_daily: round(weekendDaily),
    monthly_footfall: round(monthlyFootfall),
    avg_daily_footfall: round(monthlyFootfall / (a.weekday_days + a.weekend_days)),
    event_extra_footfall: round(eventExtra),
    event_active: eventActive,
    peak_hour: peakHour ? { hour: Number(peakHour[0]), label: fmtHour(Number(peakHour[0])), footfall: round(peakHour[1]) } : null,
    peak_windows: peaks,
    peak_label: peaks.map((p) => p.label).join(', '),
    peak_day: prof.peak_day,
    days_observed: prof.days_observed,
    audience,
  };
}

function adPanel(spot, st, a) {
  const exposure = a.zone_exposure[spot.zone] ?? 0.5;
  const vis = spot.visibility_score;
  const tierMult = a.station_tier_multiplier[st.tier] ?? 1;
  const audMult = a.audience_multiplier[st.station_type] ?? 1;
  const wdImpr = st.weekday_daily * exposure * vis;
  const weImpr = st.weekend_daily * exposure * vis;
  const eventImpr = st.event_extra_footfall * exposure * vis;
  const monthlyImpr = a.weekday_days * wdImpr + a.weekend_days * weImpr + eventImpr;
  const effectiveCpm = a.base_cpm * tierMult * audMult;
  const raw = (monthlyImpr / 1000) * effectiveCpm;
  const price = round(raw, 100);
  const steps = [
    { label: 'Weekday daily footfall', formula: 'avg of observed weekdays (entries + exits)', value: num(st.weekday_daily) },
    { label: 'Weekend daily footfall', formula: 'avg of observed weekend days', value: num(st.weekend_daily) },
    { label: 'Zone exposure', formula: `${spot.zone}`, value: exposure },
    { label: 'Visibility score', formula: 'size, sightline, lighting', value: vis },
    { label: 'Weekday daily impressions', formula: `${num(st.weekday_daily)} × ${exposure} × ${vis}`, value: num(wdImpr) },
    { label: 'Weekend daily impressions', formula: `${num(st.weekend_daily)} × ${exposure} × ${vis}`, value: num(weImpr) },
  ];
  if (eventImpr > 0) {
    steps.push({ label: 'Match-day extra impressions', formula: `${a.event_days_per_month} event days × ${a.event_footfall_multiplier - 1}x extra weekend footfall × ${exposure} × ${vis}`, value: num(eventImpr) });
  }
  steps.push(
    { label: 'Monthly impressions', formula: `${a.weekday_days} × ${num(wdImpr)} + ${a.weekend_days} × ${num(weImpr)}${eventImpr ? ` + ${num(eventImpr)}` : ''}`, value: num(monthlyImpr) },
    { label: 'Effective CPM', formula: `₹${a.base_cpm} base × ${tierMult} (tier ${st.tier}) × ${audMult} (${st.station_type} audience)`, value: inr(effectiveCpm) },
    { label: 'Monthly price', formula: `${num(monthlyImpr)} / 1,000 × ${inr(effectiveCpm)}, rounded to ₹100`, value: inr(price), highlight: true },
  );
  return {
    pricing_model: 'impressions',
    monthly_price: price,
    monthly_impressions: round(monthlyImpr),
    daily_impressions: round(monthlyImpr / (a.weekday_days + a.weekend_days)),
    effective_cpm: Math.round(effectiveCpm * 100) / 100,
    dayparts: dayparts(st, monthlyImpr, price),
    steps,
    assumptions_used: {
      base_cpm: a.base_cpm,
      zone_exposure: exposure,
      station_tier_multiplier: tierMult,
      audience_multiplier: audMult,
      weekday_days: a.weekday_days,
      weekend_days: a.weekend_days,
      ...(eventImpr ? { event_days_per_month: a.event_days_per_month, event_footfall_multiplier: a.event_footfall_multiplier } : {}),
    },
  };
}

// Daypart slots from the station's weekday curve: morning/evening peaks use real peak windows when found.
function dayparts(st, monthlyImpr, price) {
  const curve = store.profiles.get(st.station_id)?.weekday || {};
  const hours = Object.entries(curve).map(([h, v]) => [Number(h), v]);
  const total = hours.reduce((s, [, v]) => s + v, 0);
  if (!total || !price) return null;
  const pw = st.peak_windows || [];
  const am = pw.find((w) => w.start < 12) || { start: 7, end: 11 };
  const pm = pw.find((w) => w.start >= 14 && w.start >= am.end) || { start: 17, end: 21 };
  const amR = [am.start, am.end];
  const pmR = [Math.max(pm.start, am.end), Math.max(pm.end, am.end)];
  const ranges = {
    morning: [amR],
    midday: amR[1] < pmR[0] ? [[amR[1], pmR[0]]] : [],
    evening: [pmR],
    night: [[pmR[1], 24], [0, amR[0]]].filter(([s, e]) => e > s),
  };
  const inR = (h, rs) => rs.some(([s, e]) => h >= s && h < e);
  const defs = [
    { key: 'morning', name: 'Morning peak', peak: true },
    { key: 'midday', name: 'Midday', peak: false },
    { key: 'evening', name: 'Evening peak', peak: true },
    { key: 'night', name: 'Night', peak: false },
  ];
  const label = (rs) => rs.map(([s, e]) => `${fmtHour(s)} – ${fmtHour(e)}`).join(', ');
  const slots = defs
    .filter((d) => ranges[d.key].length)
    .map((d) => {
      const share = hours.filter(([h]) => inR(h, ranges[d.key])).reduce((s, [, v]) => s + v, 0) / total;
      return { ...d, hours: label(ranges[d.key]), share, raw: share * price * (d.peak ? 1.15 : 0.85) };
    });
  const rawSum = slots.reduce((s, x) => s + x.raw, 0) || 1;
  const target = price * 1.05;
  const out = slots.map(({ raw, share, ...d }) => {
    const impr = share * monthlyImpr;
    const slotPrice = round((raw / rawSum) * target, 100);
    return {
      ...d,
      share: Math.round(share * 1000) / 1000,
      monthly_impressions: round(impr),
      monthly_price: slotPrice,
      per_1000: impr ? Math.round((slotPrice / (impr / 1000)) * 100) / 100 : 0,
    };
  });
  return { slots: out, total_slot_price: out.reduce((s, x) => s + x.monthly_price, 0), full_day_price: price, uplift: 0.05 };
}

function retail(spot, st, a) {
  const capture = a.capture_rate[spot.zone] ?? 0.03;
  const conv = a.conversion_rate;
  const vis = spot.visibility_score;
  const ticket = a.avg_ticket[spot.spot_type] ?? 100;
  const minRent = a.min_rent[spot.spot_type] ?? 0;
  const daysInMonth = a.weekday_days + a.weekend_days;
  const dailyShoppers = st.avg_daily_footfall * capture * conv * vis;
  const monthlySales = dailyShoppers * ticket * daysInMonth;
  const shareRent = monthlySales * a.rent_share;
  const floorApplied = shareRent < minRent;
  const price = round(Math.max(minRent, shareRent), 100);
  return {
    pricing_model: 'revenue_share',
    monthly_price: price,
    daily_shoppers: round(dailyShoppers),
    monthly_sales: round(monthlySales),
    floor_applied: floorApplied,
    steps: [
      { label: 'Average daily footfall', formula: `monthly footfall ${num(st.monthly_footfall)} / ${daysInMonth} days`, value: num(st.avg_daily_footfall) },
      { label: 'Capture rate', formula: `${spot.zone}`, value: pct(capture) },
      { label: 'Conversion rate', formula: 'approachers who buy', value: pct(conv) },
      { label: 'Visibility score', formula: 'frontage, sightline', value: vis },
      { label: 'Daily shoppers', formula: `${num(st.avg_daily_footfall)} × ${pct(capture)} × ${pct(conv)} × ${vis}`, value: num(dailyShoppers) },
      { label: 'Estimated monthly sales', formula: `${num(dailyShoppers)} × ₹${ticket} ticket × ${daysInMonth} days`, value: inr(monthlySales) },
      { label: 'Revenue-share rent', formula: `${inr(monthlySales)} × ${pct(a.rent_share)}`, value: inr(shareRent) },
      { label: 'Monthly rent', formula: `max(₹${num(minRent)} floor, ${inr(shareRent)})${floorApplied ? ' — floor applied' : ''}`, value: inr(price), highlight: true },
    ],
    assumptions_used: {
      capture_rate: capture,
      conversion_rate: conv,
      avg_ticket: ticket,
      rent_share: a.rent_share,
      min_rent: minRent,
      days_per_month: daysInMonth,
    },
  };
}

function baseRateCard(spot, a) {
  const st = stationStats(spot.station_id, a);
  const calc = spot.spot_type === 'ad_panel' ? adPanel(spot, st, a) : retail(spot, st, a);
  return {
    spot_id: spot.spot_id,
    station_id: spot.station_id,
    station_name: st.name,
    station_type: st.station_type,
    station_tier: st.tier,
    line: st.line,
    spot_type: spot.spot_type,
    zone: spot.zone,
    size: spot.size,
    visibility_score: spot.visibility_score,
    status: spot.status,
    daily_footfall: st.avg_daily_footfall,
    weekday_daily: st.weekday_daily,
    weekend_daily: st.weekend_daily,
    peak_label: st.peak_label,
    peak_windows: st.peak_windows,
    event_active: st.event_active,
    ...calc,
    price_per_day: round(calc.monthly_price / (a.weekday_days + a.weekend_days)),
  };
}

const TYPE_LABEL = { ad_panel: 'ad panel', kiosk: 'kiosk', shop: 'shop' };

// Tiers are relative: within each spot type, top third Premium, middle Standard, bottom Value.
export function allRateCards(a = store.assumptions) {
  const cards = [...store.spots.values()].map((s) => baseRateCard(s, a));
  const byType = {};
  for (const c of cards) (byType[c.spot_type] ||= []).push(c);
  for (const list of Object.values(byType)) {
    list.sort((x, y) => y.monthly_price - x.monthly_price);
    list.forEach((c, i) => {
      const p = i / list.length;
      c.tier = p < 1 / 3 ? 'Premium' : p < 2 / 3 ? 'Standard' : 'Value';
      c.rank = i + 1;
      c.rank_of = list.length;
      c.justification = justify(c);
    });
  }
  return cards.sort((x, y) => y.monthly_price - x.monthly_price);
}

export function rateCard(spotId, a = store.assumptions) {
  return allRateCards(a).find((c) => c.spot_id === spotId) || null;
}

function justify(c) {
  const what = `${c.zone} ${TYPE_LABEL[c.spot_type]} at ${c.station_name} (${c.station_type}, tier ${c.station_tier})`;
  const evidence =
    c.pricing_model === 'impressions'
      ? `${num(c.monthly_impressions)} monthly impressions from ${num(c.daily_footfall)} average daily footfall at an effective CPM of ${inr(c.effective_cpm)}`
      : `${num(c.daily_shoppers)} estimated daily shoppers generating ${inr(c.monthly_sales)} in monthly sales`;
  return `${c.tier}: ${what}. ${evidence}; busiest ${c.peak_label}. Ranks #${c.rank} of ${c.rank_of} ${TYPE_LABEL[c.spot_type]}s on the network.`;
}

export function summary(a = store.assumptions) {
  const cards = allRateCards(a);
  const vacant = cards.filter((c) => c.status === 'vacant');
  const occupied = cards.filter((c) => c.status === 'occupied');
  const total = (l) => l.reduce((s, c) => s + c.monthly_price, 0);
  const group = (list, key) => {
    const m = {};
    for (const c of list) {
      const k = c[key];
      m[k] ||= { key: k, count: 0, monthly: 0 };
      m[k].count++;
      m[k].monthly += c.monthly_price;
    }
    return Object.values(m).sort((x, y) => y.monthly - x.monthly);
  };
  const byStation = group(vacant, 'station_id').map((g) => ({ ...g, station_name: store.stations.get(g.key)?.name }));
  const potential = total(vacant);
  const partnerShare = a.ppp_partner_share;
  return {
    vacant_count: vacant.length,
    occupied_count: occupied.length,
    total_spots: cards.length,
    occupancy_rate: cards.length ? occupied.length / cards.length : 0,
    vacant_potential_monthly: potential,
    vacant_potential_annual: potential * 12,
    occupied_estimated_monthly: total(occupied),
    ppp: {
      partner_share: partnerShare,
      partner_monthly: round(potential * partnerShare),
      metro_net_monthly: round(potential * (1 - partnerShare)),
      metro_capex: 0,
    },
    by_station: byStation,
    by_type: group(vacant, 'spot_type'),
    by_tier: group(vacant, 'tier'),
    top_opportunities: vacant.slice(0, 5),
  };
}

export function rateCardCsv(a = store.assumptions) {
  const cards = allRateCards(a);
  const cols = [
    'spot_id', 'station_name', 'station_type', 'station_tier', 'spot_type', 'zone', 'size', 'visibility_score', 'status',
    'tier', 'monthly_price', 'price_per_day', 'pricing_model', 'monthly_impressions', 'effective_cpm', 'daily_shoppers',
    'monthly_sales', 'daily_footfall', 'peak_label', 'justification',
  ];
  const esc = (v) => {
    if (v === undefined || v === null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...cards.map((c) => cols.map((k) => esc(c[k])).join(','))].join('\n');
}
