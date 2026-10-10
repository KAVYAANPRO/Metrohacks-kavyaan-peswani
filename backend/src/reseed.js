// One-off: rebuild seed data in MongoDB (stations, footfall, spots, audience) and clear cached pitches.
// Usage: npm run reseed   (then restart the server)
import { store } from './store.js';

await store.init();
if (!store.mongoOk) { console.error('MongoDB not connected:', store.mongoError); process.exit(1); }
await store.reseed();
console.log('Reseeded:', JSON.stringify(store.status().counts));
process.exit(0);
