// One-off: generate and save pitches for the top vacant spots (npm run pregen -- 6 en,hi).
import { store } from './store.js';
import { allRateCards, stationStats } from './pricing.js';
import { generatePitch } from './llm.js';

const limit = Number(process.argv[2] || 6);
const langs = (process.argv[3] || 'en').split(',');
await store.init();
const top = allRateCards().filter((c) => c.status === 'vacant').slice(0, limit);
for (const lang of langs) {
  for (const card of top) {
    const p = await generatePitch(card, stationStats(card.station_id), { category: '', language: lang });
    await store.savePitch(p);
    console.log(card.spot_id, lang, p.mode, p.grounding?.passed ? 'grounded' : 'check', p.fallback_reason ? `(${p.fallback_reason.slice(0, 60)})` : '');
    await new Promise((r) => setTimeout(r, 4500)); // stay under Gemini free-tier rate limit
  }
}
process.exit(0);
