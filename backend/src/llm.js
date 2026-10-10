// AI layer: Google Gemini (cloud) or local Gemma via Ollama writes audience profile, categories and pitch from
// numbers computed by the pricing engine. A grounding check flags any figure the model
// invents. If no provider answers with valid JSON we fall back to a template.
import { env } from './config.js';
import { inr } from './pricing.js';

const num = (x) => Math.round(x).toLocaleString('en-IN');
const pct = (x) => `${Math.round(x * 100)}%`;

// Each ad category: { lang: [name, reason(f)] }. Numbers stay ASCII digits so groundingCheck works.
const AD_CATEGORIES = {
  interchange: [
    { en: ['Travel & hospitality (hotels, cabs, bus operators)', (f) => `${num(f.daily_footfall)} daily riders, many arriving by train with immediate travel needs`],
      hi: ['यात्रा और आतिथ्य (होटल, कैब, बस ऑपरेटर)', (f) => `रोज़ ${num(f.daily_footfall)} यात्री, जिनमें से कई ट्रेन से आते हैं और उन्हें तुरंत यात्रा सुविधाएँ चाहिए`],
      gu: ['પ્રવાસ અને આતિથ્ય (હોટેલ, કેબ, બસ ઓપરેટર)', (f) => `રોજ ${num(f.daily_footfall)} મુસાફરો, જેમાંથી ઘણા ટ્રેનથી આવે છે અને તરત પ્રવાસ સુવિધા શોધે છે`] },
    { en: ['FMCG & packaged food', (f) => `High-frequency mass audience: ${num(f.monthly_impressions || f.monthly_footfall)} monthly reach`],
      hi: ['FMCG और पैकेज्ड फ़ूड', (f) => `बार-बार आने वाला बड़ा दर्शक वर्ग: हर महीने ${num(f.monthly_impressions || f.monthly_footfall)} की पहुँच`],
      gu: ['FMCG અને પેકેજ્ડ ફૂડ', (f) => `વારંવાર આવતો વિશાળ પ્રેક્ષક વર્ગ: દર મહિને ${num(f.monthly_impressions || f.monthly_footfall)} સુધી પહોંચ`] },
    { en: ['Telecom, UPI & fintech apps', (f) => `${pct(f.audience.age_26_40)} of riders are 26–40, the core smartphone-payments segment`],
      hi: ['टेलीकॉम, UPI और फिनटेक ऐप', (f) => `${pct(f.audience.age_26_40)} यात्री 26–40 वर्ष के हैं, जो स्मार्टफ़ोन पेमेंट का मुख्य वर्ग है`],
      gu: ['ટેલિકોમ, UPI અને ફિનટેક એપ', (f) => `${pct(f.audience.age_26_40)} મુસાફરો 26–40 વર્ષના છે, જે સ્માર્ટફોન પેમેન્ટનો મુખ્ય વર્ગ છે`] },
  ],
  office: [
    { en: ['Banking, fintech & insurance', (f) => `${pct(f.audience.age_26_40)} of riders are working professionals aged 26–40`],
      hi: ['बैंकिंग, फिनटेक और बीमा', (f) => `${pct(f.audience.age_26_40)} यात्री 26–40 वर्ष के कामकाजी पेशेवर हैं`],
      gu: ['બેંકિંગ, ફિનટેક અને વીમો', (f) => `${pct(f.audience.age_26_40)} મુસાફરો 26–40 વર્ષના નોકરિયાત વ્યાવસાયિકો છે`] },
    { en: ['Food delivery, cafés & QSR', (f) => `Commute peaks at ${f.peak_label} line up with breakfast and dinner orders`],
      hi: ['फ़ूड डिलीवरी, कैफ़े और QSR', (f) => `${f.peak_label} का आवागमन नाश्ते और रात के खाने के ऑर्डर के समय से मेल खाता है`],
      gu: ['ફૂડ ડિલિવરી, કાફે અને QSR', (f) => `${f.peak_label} ની અવરજવર નાસ્તા અને રાત્રિભોજનના ઓર્ડરના સમય સાથે મેળ ખાય છે`] },
    { en: ['Real estate & co-working', (f) => `Salaried office-goers pass ${f.weekday_daily ? num(f.weekday_daily) : num(f.daily_footfall)} times every weekday`],
      hi: ['रियल एस्टेट और को-वर्किंग', (f) => `हर कार्यदिवस ${f.weekday_daily ? num(f.weekday_daily) : num(f.daily_footfall)} बार वेतनभोगी ऑफ़िस-कर्मचारी यहाँ से गुज़रते हैं`],
      gu: ['રિયલ એસ્ટેટ અને કો-વર્કિંગ', (f) => `દરેક કામકાજી દિવસે ${f.weekday_daily ? num(f.weekday_daily) : num(f.daily_footfall)} વખત પગારદાર ઓફિસ-કર્મચારીઓ અહીંથી પસાર થાય છે`] },
  ],
  college: [
    { en: ['Coaching institutes & ed-tech', (f) => `${pct(f.audience.age_16_25)} of footfall is aged 16–25, peaking ${f.peak_label}`],
      hi: ['कोचिंग संस्थान और एड-टेक', (f) => `${pct(f.audience.age_16_25)} यात्री 16–25 वर्ष के हैं, सबसे ज़्यादा भीड़ ${f.peak_label}`],
      gu: ['કોચિંગ સંસ્થાઓ અને એડ-ટેક', (f) => `${pct(f.audience.age_16_25)} મુસાફરો 16–25 વર્ષના છે, સૌથી વધુ ભીડ ${f.peak_label}`] },
    { en: ['Smartphones & consumer electronics', (f) => `Young, tech-first audience of ${num(f.daily_footfall)} riders a day`],
      hi: ['स्मार्टफ़ोन और कंज़्यूमर इलेक्ट्रॉनिक्स', (f) => `रोज़ ${num(f.daily_footfall)} युवा, टेक-प्रेमी यात्री`],
      gu: ['સ્માર્ટફોન અને કન્ઝ્યુમર ઇલેક્ટ્રોનિક્સ', (f) => `રોજ ${num(f.daily_footfall)} યુવા, ટેક-પ્રેમી મુસાફરો`] },
    { en: ['Fashion, QSR & beverages', (f) => `Students pass twice daily; ${pct(f.audience.age_16_25)} are under 26`],
      hi: ['फ़ैशन, QSR और पेय पदार्थ', (f) => `छात्र दिन में दो बार गुज़रते हैं; ${pct(f.audience.age_16_25)} की उम्र 26 से कम है`],
      gu: ['ફેશન, QSR અને પીણાં', (f) => `વિદ્યાર્થીઓ દિવસમાં બે વાર પસાર થાય છે; ${pct(f.audience.age_16_25)} ની ઉંમર 26 થી ઓછી છે`] },
  ],
  residential: [
    { en: ['Quick commerce & grocery', (f) => `Neighbourhood audience of ${num(f.daily_footfall)} riders returning home ${f.peak_label}`],
      hi: ['क्विक कॉमर्स और किराना', (f) => `${f.peak_label} घर लौटते ${num(f.daily_footfall)} स्थानीय यात्री`],
      gu: ['ક્વિક કોમર્સ અને કરિયાણું', (f) => `${f.peak_label} ઘરે પાછા ફરતા ${num(f.daily_footfall)} સ્થાનિક મુસાફરો`] },
    { en: ['Clinics, diagnostics & pharmacies', (f) => `${pct(f.audience.age_40_plus)} of riders are 40+, families and local residents`],
      hi: ['क्लिनिक, डायग्नोस्टिक्स और फ़ार्मेसी', (f) => `${pct(f.audience.age_40_plus)} यात्री 40+ उम्र के हैं — परिवार और स्थानीय निवासी`],
      gu: ['ક્લિનિક, ડાયગ્નોસ્ટિક્સ અને ફાર્મસી', (f) => `${pct(f.audience.age_40_plus)} મુસાફરો 40+ ઉંમરના છે — પરિવારો અને સ્થાનિક રહેવાસીઓ`] },
    { en: ['Schools, tuition & local real estate', () => 'Repeat local commuters: same people, every day, both directions'],
      hi: ['स्कूल, ट्यूशन और स्थानीय रियल एस्टेट', () => 'नियमित स्थानीय यात्री: वही लोग, हर दिन, दोनों दिशाओं में'],
      gu: ['શાળાઓ, ટ્યુશન અને સ્થાનિક રિયલ એસ્ટેટ', () => 'નિયમિત સ્થાનિક મુસાફરો: એ જ લોકો, દરરોજ, બંને દિશામાં'] },
  ],
  stadium: [
    { en: ['Sports, energy drinks & beverages', (f) => `${pct(f.audience.age_16_25)} of riders are 16–25; match days multiply crowds`],
      hi: ['खेल, एनर्जी ड्रिंक और पेय पदार्थ', (f) => `${pct(f.audience.age_16_25)} यात्री 16–25 वर्ष के हैं; मैच के दिन भीड़ कई गुना हो जाती है`],
      gu: ['રમતગમત, એનર્જી ડ્રિંક અને પીણાં', (f) => `${pct(f.audience.age_16_25)} મુસાફરો 16–25 વર્ષના છે; મેચના દિવસે ભીડ અનેક ગણી થાય છે`] },
    { en: ['OTT streaming & smartphones', (f) => `Event-goers and fans, peaking ${f.peak_label}`],
      hi: ['OTT स्ट्रीमिंग और स्मार्टफ़ोन', (f) => `इवेंट में आने वाले दर्शक और प्रशंसक, सबसे ज़्यादा भीड़ ${f.peak_label}`],
      gu: ['OTT સ્ટ્રીમિંગ અને સ્માર્ટફોન', (f) => `ઇવેન્ટમાં આવતા દર્શકો અને ચાહકો, સૌથી વધુ ભીડ ${f.peak_label}`] },
    { en: ['QSR & food delivery', (f) => `Pre- and post-event crowds of ${num(f.daily_footfall)}+ riders a day`],
      hi: ['QSR और फ़ूड डिलीवरी', (f) => `इवेंट से पहले और बाद में रोज़ ${num(f.daily_footfall)}+ यात्रियों की भीड़`],
      gu: ['QSR અને ફૂડ ડિલિવરી', (f) => `ઇવેન્ટ પહેલાં અને પછી રોજ ${num(f.daily_footfall)}+ મુસાફરોની ભીડ`] },
  ],
};

const RETAIL_CATEGORIES = {
  interchange: [
    { en: 'Packaged snacks & bottled water', hi: 'पैकेज्ड स्नैक्स और बोतलबंद पानी', gu: 'પેકેજ્ડ નાસ્તો અને બોટલબંધ પાણી' },
    { en: 'Coffee & tea chain', hi: 'कॉफ़ी और चाय चेन', gu: 'કોફી અને ચા ચેન' },
    { en: 'Pharmacy & travel essentials', hi: 'फ़ार्मेसी और यात्रा ज़रूरतें', gu: 'ફાર્મસી અને પ્રવાસ જરૂરિયાતો' },
  ],
  office: [
    { en: 'Coffee & breakfast kiosk', hi: 'कॉफ़ी और नाश्ता कियोस्क', gu: 'કોફી અને નાસ્તા કિઓસ્ક' },
    { en: 'Healthy meals & salads', hi: 'हेल्दी भोजन और सलाद', gu: 'હેલ્ધી ભોજન અને સલાડ' },
    { en: 'Mobile accessories & repairs', hi: 'मोबाइल एक्सेसरीज़ और रिपेयर', gu: 'મોબાઇલ એક્સેસરીઝ અને રિપેર' },
  ],
  college: [
    { en: 'Stationery & print shop', hi: 'स्टेशनरी और प्रिंट शॉप', gu: 'સ્ટેશનરી અને પ્રિન્ટ શોપ' },
    { en: 'Juice, tea & quick bites', hi: 'जूस, चाय और झटपट नाश्ता', gu: 'જ્યુસ, ચા અને ઝટપટ નાસ્તો' },
    { en: 'Mobile accessories', hi: 'मोबाइल एक्सेसरीज़', gu: 'મોબાઇલ એક્સેસરીઝ' },
  ],
  residential: [
    { en: 'Daily-needs grocery', hi: 'रोज़मर्रा का किराना', gu: 'રોજિંદી જરૂરિયાતનું કરિયાણું' },
    { en: 'Bakery & sweets', hi: 'बेकरी और मिठाई', gu: 'બેકરી અને મીઠાઈ' },
    { en: 'Pharmacy', hi: 'फ़ार्मेसी', gu: 'ફાર્મસી' },
  ],
  stadium: [
    { en: 'Fan merchandise', hi: 'फ़ैन मर्चेंडाइज़', gu: 'ફેન મર્ચેન્ડાઇઝ' },
    { en: 'Beverages & snacks', hi: 'पेय पदार्थ और स्नैक्स', gu: 'પીણાં અને નાસ્તો' },
    { en: 'Quick bites & ice cream', hi: 'झटपट नाश्ता और आइसक्रीम', gu: 'ઝટપટ નાસ્તો અને આઇસક્રીમ' },
  ],
};

// Display words for the template pitch in Hindi / Gujarati.
const WORDS = {
  hi: {
    station_type: { interchange: 'इंटरचेंज', office: 'ऑफ़िस क्षेत्र', college: 'कॉलेज क्षेत्र', residential: 'आवासीय', stadium: 'स्टेडियम' },
    zone: { concourse: 'कॉनकोर्स', exit: 'निकास द्वार', platform: 'प्लेटफ़ॉर्म', corridor: 'गलियारा' },
    tier: { Premium: 'प्रीमियम', Standard: 'स्टैंडर्ड', Value: 'वैल्यू' },
  },
  gu: {
    station_type: { interchange: 'ઇન્ટરચેન્જ', office: 'ઓફિસ વિસ્તાર', college: 'કોલેજ વિસ્તાર', residential: 'રહેણાંક', stadium: 'સ્ટેડિયમ' },
    zone: { concourse: 'કોનકોર્સ', exit: 'એક્ઝિટ ગેટ', platform: 'પ્લેટફોર્મ', corridor: 'કોરિડોર' },
    tier: { Premium: 'પ્રીમિયમ', Standard: 'સ્ટાન્ડર્ડ', Value: 'વેલ્યુ' },
  },
};

const LANG_NAME = { en: 'English', hi: 'Hindi (Devanagari script)', gu: 'Gujarati (Gujarati script)' };

function facts(card, station) {
  return {
    spot_id: card.spot_id,
    spot_type: card.spot_type,
    zone: card.zone,
    size: card.size,
    station_name: card.station_name,
    station_type: card.station_type,
    station_tier: card.station_tier,
    daily_footfall: card.daily_footfall,
    weekday_daily: card.weekday_daily,
    weekend_daily: card.weekend_daily,
    monthly_footfall: station.monthly_footfall,
    peak_label: card.peak_label,
    peak_share: card.peak_windows?.reduce((s, p) => s + p.share, 0) || 0,
    monthly_impressions: card.monthly_impressions,
    daily_impressions: card.daily_impressions,
    daily_shoppers: card.daily_shoppers,
    monthly_sales: card.monthly_sales,
    monthly_price: card.monthly_price,
    price_per_day: card.price_per_day,
    tier: card.tier,
    audience: station.audience,
  };
}

function buildPrompt(f, category, language = 'en') {
  const isAd = f.spot_type === 'ad_panel';
  return `You are a sales writer for Gujarat Metro's non-fare revenue team.
Use ONLY the numbers given below. Do not invent any statistic, percentage or price.

SPOT: ${f.spot_type.replace('_', ' ')} (${f.size}) in the ${f.zone} at ${f.station_name} (${f.station_type} station, tier ${f.station_tier})
DAILY FOOTFALL: ${num(f.daily_footfall)} (weekday ${num(f.weekday_daily)}, weekend ${num(f.weekend_daily)})
PEAK HOURS: ${f.peak_label} (${pct(f.peak_share)} of daily footfall)
${isAd ? `MONTHLY IMPRESSIONS: ${num(f.monthly_impressions)}` : `ESTIMATED DAILY SHOPPERS: ${num(f.daily_shoppers)}\nESTIMATED MONTHLY SALES: Rs ${num(f.monthly_sales)}`}
AUDIENCE MIX: ${pct(f.audience.age_16_25)} aged 16-25, ${pct(f.audience.age_26_40)} aged 26-40, ${pct(f.audience.age_40_plus)} aged 40+; segments: ${f.audience.top_segments}
MONTHLY PRICE: Rs ${num(f.monthly_price)} (Rs ${num(f.price_per_day)} per day), ${f.tier} tier
${category ? `TARGET BUYER CATEGORY: ${category} (make this the first category and aim the pitch at it)` : `Pick the 3 best-fit ${isAd ? 'advertiser' : 'retailer'} categories.`}

Return ONLY JSON in exactly this shape:
{"audience_profile": "2-3 sentences on who passes this spot and when",
 "categories": [{"name": "...", "reason": "one line using the numbers above"}],
 "pitch": {"headline": "short punchy headline",
           "why_this_spot": ["...", "...", "..."],
           "call_to_action": "..."},
 "gujarati_summary": "one sentence summary in Gujarati"}${language === 'en' ? '' : `

LANGUAGE: Write every text value (audience_profile, category names and reasons, headline, why_this_spot, call_to_action) in ${LANG_NAME[language]}.
Keep the JSON keys in English. Write every number with ASCII digits (0-9) exactly as given above, never in ${language === 'hi' ? 'Devanagari' : 'Gujarati'} numerals. Station names may stay in English. gujarati_summary stays in Gujarati.`}`;
}

function templateText(f, L, isAd) {
  const w = WORDS[L];
  const st = w?.station_type[f.station_type] || f.station_type;
  const zone = w?.zone[f.zone] || f.zone[0].toUpperCase() + f.zone.slice(1);
  const tier = w?.tier[f.tier] || f.tier;
  const a = f.audience;
  if (L === 'hi') return {
    reach: isAd ? `हर महीने ${num(f.monthly_impressions)} इम्प्रेशन` : `रोज़ ${num(f.daily_shoppers)} संभावित ग्राहक`,
    shoppers: `रोज़ ${num(f.daily_footfall)} यात्रियों में से अनुमानित ${num(f.daily_shoppers)} दैनिक ग्राहक`,
    target: `रोज़ ${num(f.daily_footfall)} यात्री, सबसे ज़्यादा भीड़ ${f.peak_label}`,
    audience: `${f.station_name} एक ${st} स्टेशन है, जहाँ औसतन रोज़ ${num(f.daily_footfall)} यात्री आते-जाते हैं; सबसे ज़्यादा भीड़ ${f.peak_label} रहती है। ` +
      `यात्रियों में ${pct(a.age_16_25)} 16–25 वर्ष, ${pct(a.age_26_40)} 26–40 वर्ष और ${pct(a.age_40_plus)} 40+ वर्ष के हैं; मुख्य वर्ग: ${a.top_segments}।`,
    headline: (reach) => `${f.station_name} पर ${reach} — सिर्फ़ ${inr(f.price_per_day)} प्रतिदिन`,
    why: [
      `हर दिन ${num(f.daily_footfall)} यात्री यहाँ से गुज़रते हैं; इनमें से ${pct(f.peak_share)} ${f.peak_label} के दौरान।`,
      isAd ? `${zone} में स्थित (${f.size}) यह पैनल हर महीने ${num(f.monthly_impressions)} इम्प्रेशन देता है।`
        : `${zone} में स्थित जगह (${f.size}), अनुमानित मासिक बिक्री ${inr(f.monthly_sales)}।`,
      `${tier} श्रेणी की कीमत ${inr(f.monthly_price)}/माह — हर रुपया फ़ुटफ़ॉल डेटा पर आधारित।`,
    ],
    cta: `इसी हफ़्ते गुजरात मेट्रो की कमर्शियल टीम से यह ${isAd ? 'पैनल' : 'जगह'} बुक करें — अगले महीने की 1 तारीख से उपलब्ध।`,
  };
  if (L === 'gu') return {
    reach: isAd ? `દર મહિને ${num(f.monthly_impressions)} ઇમ્પ્રેશન` : `રોજ ${num(f.daily_shoppers)} સંભવિત ગ્રાહકો`,
    shoppers: `રોજ ${num(f.daily_footfall)} મુસાફરોમાંથી અંદાજિત ${num(f.daily_shoppers)} દૈનિક ગ્રાહકો`,
    target: `રોજ ${num(f.daily_footfall)} મુસાફરો, સૌથી વધુ ભીડ ${f.peak_label}`,
    audience: `${f.station_name} એક ${st} સ્ટેશન છે, જ્યાં સરેરાશ રોજ ${num(f.daily_footfall)} મુસાફરો અવરજવર કરે છે; સૌથી વધુ ભીડ ${f.peak_label} હોય છે. ` +
      `મુસાફરોમાં ${pct(a.age_16_25)} 16–25 વર્ષ, ${pct(a.age_26_40)} 26–40 વર્ષ અને ${pct(a.age_40_plus)} 40+ વર્ષના છે; મુખ્ય વર્ગ: ${a.top_segments}.`,
    headline: (reach) => `${f.station_name} પર ${reach} — માત્ર ${inr(f.price_per_day)} પ્રતિ દિવસ`,
    why: [
      `દરરોજ ${num(f.daily_footfall)} મુસાફરો અહીંથી પસાર થાય છે; તેમાંથી ${pct(f.peak_share)} ${f.peak_label} દરમિયાન.`,
      isAd ? `${zone} માં આવેલી આ પેનલ (${f.size}) દર મહિને ${num(f.monthly_impressions)} ઇમ્પ્રેશન આપે છે.`
        : `${zone} માં આવેલી જગ્યા (${f.size}), અંદાજિત માસિક વેચાણ ${inr(f.monthly_sales)}.`,
      `${tier} શ્રેણીની કિંમત ${inr(f.monthly_price)}/મહિને — દરેક રૂપિયો ફૂટફોલ ડેટા પર આધારિત.`,
    ],
    cta: `આ જ અઠવાડિયે ગુજરાત મેટ્રોની કોમર્શિયલ ટીમ સાથે આ ${isAd ? 'પેનલ' : 'જગ્યા'} બુક કરો — આવતા મહિનાની 1 તારીખથી ઉપલબ્ધ.`,
  };
  return {
    reach: isAd ? `${num(f.monthly_impressions)} impressions a month` : `${num(f.daily_shoppers)} likely shoppers a day`,
    shoppers: `${num(f.daily_shoppers)} estimated daily shoppers from ${num(f.daily_footfall)} daily riders`,
    target: `${num(f.daily_footfall)} daily riders, busiest ${f.peak_label}`,
    audience: `${f.station_name} is ${/^[aeiou]/.test(st) ? 'an' : 'a'} ${st} station seeing ${num(f.daily_footfall)} riders on an average day, busiest ${f.peak_label}. ` +
      `The crowd is ${pct(a.age_16_25)} aged 16–25, ${pct(a.age_26_40)} aged 26–40 and ${pct(a.age_40_plus)} aged 40+, mostly ${a.top_segments}.`,
    headline: (reach) => `${reach} at ${f.station_name} for ${inr(f.price_per_day)} a day`,
    why: [
      `${num(f.daily_footfall)} riders pass through every day; ${pct(f.peak_share)} of them during ${f.peak_label}.`,
      isAd ? `${zone} placement (${f.size}) delivers ${num(f.monthly_impressions)} monthly impressions.`
        : `${zone} location (${f.size}) with an estimated ${inr(f.monthly_sales)} in monthly sales.`,
      `${tier} tier pricing at ${inr(f.monthly_price)}/month, every rupee traceable to footfall data.`,
    ],
    cta: `Book this ${isAd ? 'panel' : 'space'} with Gujarat Metro's commercial team this week, available from the 1st of next month.`,
  };
}

function templatePitch(f, category, language = 'en') {
  const L = LANG_NAME[language] ? language : 'en';
  const isAd = f.spot_type === 'ad_panel';
  const T = templateText(f, L, isAd);
  let cats = isAd
    ? (AD_CATEGORIES[f.station_type] || AD_CATEGORIES.interchange).map((c) => ({ name: c[L][0], reason: c[L][1](f) }))
    : (RETAIL_CATEGORIES[f.station_type] || RETAIL_CATEGORIES.interchange).map((c) => ({ name: c[L], reason: T.shoppers }));
  if (category) {
    cats = [{ name: category, reason: T.target }, ...cats.filter((c) => c.name !== category)].slice(0, 3);
  }
  return {
    audience_profile: T.audience,
    categories: cats,
    pitch: { headline: T.headline(T.reach), why_this_spot: T.why, call_to_action: T.cta },
    gujarati_summary: `${f.station_name} પર દરરોજ ${num(f.daily_footfall)} મુસાફરો — માત્ર ${inr(f.price_per_day)} પ્રતિ દિવસમાં તમારી બ્રાન્ડ માટે શ્રેષ્ઠ જગ્યા.`,
  };
}

// Grounding check: every figure (>31, so hours/day counts are ignored) must match a fact within 2%.
function groundingCheck(output, f) {
  const allowed = [
    f.daily_footfall, f.weekday_daily, f.weekend_daily, f.monthly_footfall, f.monthly_impressions, f.daily_impressions,
    f.daily_shoppers, f.monthly_sales, f.monthly_price, f.price_per_day,
    f.audience.age_16_25 * 100, f.audience.age_26_40 * 100, f.audience.age_40_plus * 100, f.peak_share * 100,
    (f.audience.age_26_40 + f.audience.age_40_plus) * 100, (f.audience.age_16_25 + f.audience.age_26_40) * 100,
    40, // age band label "40+"
    ...(String(f.size).match(/\d+/g) || []).map(Number), // e.g. "120 sqft", "10x6 ft"
  ].filter((v) => typeof v === 'number' && v > 0);
  const variants = allowed.flatMap((v) => [v, v / 1000, v / 100000, v / 1e6]);
  const text = JSON.stringify(output).replace(/\\u[0-9a-f]{4}/gi, ' ');
  const found = [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, ''))).filter((n) => n > 31);
  const unverified = [...new Set(found.filter((n) => !variants.some((v) => Math.abs(v - n) <= Math.max(0.02 * v, 0.05))))];
  return { checked: found.length, passed: unverified.length === 0, unverified };
}

function validShape(o) {
  return o && typeof o.audience_profile === 'string' && Array.isArray(o.categories) && o.categories.length > 0 &&
    o.categories.every((c) => c && typeof c.name === 'string') && o.pitch && typeof o.pitch.headline === 'string' &&
    Array.isArray(o.pitch.why_this_spot) && typeof o.pitch.call_to_action === 'string';
}

async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
    }),
    signal: AbortSignal.timeout(env.LLM_TIMEOUT_MS),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(`Gemini HTTP ${r.status}${err.error?.message ? `: ${err.error.message}` : ''}`);
  }
  const data = await r.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) throw new Error('Gemini returned no text');
  return text;
}

async function callOllama(prompt) {
  const r = await fetch(`${env.OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: env.OLLAMA_MODEL, prompt, stream: false, format: 'json', options: { temperature: 0.3 } }),
    signal: AbortSignal.timeout(env.LLM_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`);
  return (await r.json()).response;
}

// Provider order: Gemini (if key set) -> local Ollama -> template.
function providers() {
  const list = [];
  if (env.GEMINI_API_KEY) list.push({ name: 'gemini', model: env.GEMINI_MODEL, call: callGemini });
  list.push({ name: 'ollama', model: env.OLLAMA_MODEL, call: callOllama });
  return list;
}

let geminiCache = { at: 0, value: null };
async function geminiStatus() {
  if (!env.GEMINI_API_KEY) return { available: false, provider: 'gemini', model: env.GEMINI_MODEL, reason: 'GEMINI_API_KEY not set' };
  if (Date.now() - geminiCache.at < 60000 && geminiCache.value) return geminiCache.value;
  let value;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}`, {
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY },
      signal: AbortSignal.timeout(4000),
    });
    value = r.ok
      ? { available: true, provider: 'gemini', model: env.GEMINI_MODEL, reason: null }
      : { available: false, provider: 'gemini', model: env.GEMINI_MODEL, reason: r.status === 404 ? 'model not found' : r.status === 400 || r.status === 403 ? 'invalid API key' : `HTTP ${r.status}` };
  } catch {
    value = { available: false, provider: 'gemini', model: env.GEMINI_MODEL, reason: 'no internet' };
  }
  geminiCache = { at: Date.now(), value };
  return value;
}

async function ollamaStatus() {
  try {
    const r = await fetch(`${env.OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return { available: false, provider: 'ollama', model: env.OLLAMA_MODEL, reason: `HTTP ${r.status}` };
    const data = await r.json();
    const models = (data.models || []).map((m) => m.name);
    const has = models.some((m) => m === env.OLLAMA_MODEL || m.split(':')[0] === env.OLLAMA_MODEL);
    return { available: has, provider: 'ollama', model: env.OLLAMA_MODEL, reason: has ? null : 'model not pulled' };
  } catch {
    return { available: false, provider: 'ollama', model: env.OLLAMA_MODEL, reason: 'Ollama not running' };
  }
}

export async function llmStatus() {
  const [gemini, ollama] = await Promise.all([geminiStatus(), ollamaStatus()]);
  const active = gemini.available ? gemini : ollama.available ? ollama : null;
  return {
    available: Boolean(active),
    provider: active?.provider || 'template',
    model: active?.model || 'template',
    reason: active ? null : gemini.reason !== 'GEMINI_API_KEY not set' ? `Gemini: ${gemini.reason}` : 'no AI provider configured',
    providers: { gemini, ollama },
  };
}

export async function generatePitch(card, station, { category = '', language = 'en' } = {}) {
  const f = facts(card, station);
  const started = Date.now();
  const prompt = buildPrompt(f, category, language);
  let mode = 'template';
  let model = 'template';
  let provider = 'template';
  const errors = [];
  let result = null;
  for (const p of providers()) {
    try {
      const parsed = JSON.parse(await p.call(prompt));
      if (!validShape(parsed)) throw new Error('model returned JSON in the wrong shape');
      parsed.categories = parsed.categories.slice(0, 3);
      parsed.pitch.why_this_spot = parsed.pitch.why_this_spot.slice(0, 4);
      result = parsed;
      mode = 'llm';
      model = p.model;
      provider = p.name;
      break;
    } catch (e) {
      errors.push(`${p.name}: ${e.name === 'TimeoutError' ? 'timed out' : String(e.message || e).slice(0, 120)}`);
    }
  }
  if (!result) result = templatePitch(f, category, language);
  if (!result.gujarati_summary) result.gujarati_summary = templatePitch(f, category).gujarati_summary;
  const grounding = groundingCheck(result, f);
  return {
    spot_id: card.spot_id,
    category,
    language,
    mode,
    provider,
    model,
    fallback_reason: errors.length ? errors.join(' | ') : null,
    grounding,
    latency_ms: Date.now() - started,
    facts: f,
    priced_at: card.monthly_price,
    ...result,
  };
}
