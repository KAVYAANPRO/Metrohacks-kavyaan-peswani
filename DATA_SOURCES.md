# Yieldline: data sources and calibration

Yieldline ships with **synthetic** hourly footfall for 10 GMRC stations (`backend/src/seed.js`). The synthetic data is **calibrated to GMRC's published ridership**. The pipeline accepts real AFC (gate) data through a CSV import with no code change.

Research done 10 Oct 2026. Treat every figure as "as reported" by the source named.

---

## (a) Published real data

### Network-wide daily ridership (passenger journeys)

| Figure | Value | Source |
|---|---|---|
| Average daily ridership, 2023 / 2024 / 2025 | 69,000 / 1.01 lakh / 1.33 lakh | State govt release via PTI, [ThePrint, 10 Jun 2026](https://theprint.in/india/ahmedabad-gandhinagar-metros-average-daily-ridership-crosses-1-53-lakh/2956389/) |
| Average daily ridership, May 2026 | **1.53 lakh** | same |
| Cumulative journeys, Oct 2022 to May 2026 | 13.81 crore | same |
| Network size | 68.28 km, 54 stations | same |
| Routine (non-event) days, Jul to Aug 2026 | 1,94,904 to 2,03,215. First routine day above 2 lakh was 7 Aug 2026 (2,00,436). Peak was 10 Aug (2,03,215) | GMRC data via [DeshGujarat, 14 Aug 2026](https://deshgujarat.com/2026/08/14/ahmedabad-metro-ridership-touches-2-lakh-daily-mark/) |
| Heavy-rain day, 23 Jul 2026 | ~1.75 to 1.96 lakh | [DeshGujarat, 23 Jul 2026](https://deshgujarat.com/2026/07/23/1-75-lakh-commuters-opt-for-ahmedabad-metro-amid-heavy-rain-and-waterlogging/) |
| Regular weekends, Jan 2025 | Sat ~1.17 lakh, Sun ~0.92 to 1.02 lakh (313 to 319 trips/day) | GMRC via [DeshGujarat, 27 Jan 2025](https://deshgujarat.com/2025/01/27/coldplay-magic-ahmedabad-metro-had-highest-passengers-ever-on-single-day/) |

### Per-line / per-phase split (only published split found)

| Date | Phase 1 (Ahmedabad: Blue + Red) | Phase 2 (Gandhinagar: Yellow + Violet) | Total |
|---|---|---|---|
| Sun 24 May 2026 (normal) | 1,03,545 | 14,394 (12%) | 1,17,939 |
| Sun 31 May 2026 (IPL final) | 1,77,106 | 18,762 (10%) | 1,95,868 |

Source: GMRC via IANS, [ap7am / DD India, 1 to 2 Jun 2026](https://www.ap7am.com/english-news-128330/gujarat-ipl-final-drives-66-pc-surge-in-ahmedabad-metro-ridership).

### Event days at Narendra Modi Stadium (Motera)

| Date | Event | Journeys |
|---|---|---|
| 30 Apr 2026 | IPL match | ~2.26 lakh (highest reported) ([ThePrint](https://theprint.in/india/ahmedabad-gandhinagar-metros-average-daily-ridership-crosses-1-53-lakh/2956389/)) |
| 21 May 2026 | IPL match | 2.22 lakh (same) |
| 18 Feb 2026 | T20 WC, India vs Netherlands | 2,21,066 ([DeshGujarat, 25 Mar 2026](https://deshgujarat.com/2026/03/25/ahmedabad-metro-recorded-highest-ever-passenger-footfall-on-t20-world-cup-match-day/)) |
| 25 Jan 2025 | Coldplay concert | 2,13,735 vs ~1.17 lakh on a normal Saturday ([DeshGujarat](https://deshgujarat.com/2025/01/27/coldplay-magic-ahmedabad-metro-had-highest-passengers-ever-on-single-day/)) |
| 31 May 2026 | IPL final | 1,95,868, +66% vs the previous Sunday. 62 extra trains ran and the last train left Motera at 2:19 am |

Takeaway: a big Motera event adds roughly **+70k to +100k journeys** network-wide, about +65% to +85% on a weekend baseline. Our default `event_footfall_multiplier` of 2.2 applies to the stadium station only. That is defensible, because almost every extra journey starts or ends at Motera.

### Peak hours and service

- East-West corridor peaks run **8 to 11 am and 5 to 8 pm**. Trains come every 7 min at peak and every 10 min off-peak. North-South runs every 12 min ([DeshGujarat, 24 Jul 2024](https://deshgujarat.com/2024/07/24/gmrc-to-increase-frequency-on-vastral-thaltej-route-of-ahmedabad-metro/)).
- Service hours were extended to **11 pm** from 18 May 2026 ([Swarajya](https://swarajyamag.com/amp/story/news-brief/ahmedabad-gandhinagar-metro-extends-services-till-11-pm-to-support-late-night-commuters-across-gift-city-and-key-business-corridors)). Before that, service ran from about 6:00 am to 10:30 pm. Our hourly window (5 to 23) covers this.

### Station names and lines (checked against the network map, [Wikipedia list](https://en.wikipedia.org/wiki/List_of_Ahmedabad_Metro_stations))

| ID | Station | Line | Opened |
|---|---|---|---|
| ST01 | Kalupur Railway Station | Blue (East-West) | Sep 2022 |
| ST02 | Old High Court | Blue + Red interchange | Sep 2022 |
| ST03 | GIFT City | Violet (GNLU to GIFT City spur, Phase 2) | Sep 2024 |
| ST04 | Sachivalaya | Yellow (Motera to Mahatma Mandir, Phase 2) | Apr 2025 |
| ST05 | Gujarat University | **Blue** (the seed had wrongly listed Red) | Sep 2022 |
| ST06 | Commerce Six **Road** (the seed had "Roads") | Blue | Sep 2022 |
| ST07 | Motera Stadium | Red + Yellow interchange | Sep 2022 |
| ST08 | Thaltej Gam | Blue terminus | Dec 2024 |
| ST09 | Vastral Gam | Blue terminus | Mar 2019 |
| ST10 | APMC | Red terminus | Sep 2022 |

### What is NOT public

- **No station-wise ridership** for Ahmedabad Metro, daily or hourly. We checked GMRC releases, PIB/PTI/IANS coverage and data.gov.in. Nobody publishes a "busiest stations" ranking.
- **No hourly entry/exit dataset** on data.gov.in for GMRC. data.gov.in has only DMRC year-wise and peak-capacity tables.
- The precedent that this data *can* be released comes from Bengaluru. BMRCL station-wise hourly entry/exit data for Aug 2025 was obtained via **RTI** and published on [OpenCity](https://data.opencity.in/dataset/bmrcl-station-wise-ridership-data) (CC BY-NC-SA).

### Advertising rates (sanity check for base CPM ₹40)

- GMRC has **no public station-media rate card**. Train branding rights went to Podhigai Media Group ([media4growth](https://www.media4growth.com/ooh-industry/tenders/podhigai-media-group-secures-exclusive-branding-rights-for-ahmedabad-metro-train-82462)). The contract value was not disclosed.
- Agency rack rates for Ahmedabad Metro trains, per train per month ([The Media Ant](https://www.themediaant.com/nontraditional/ahmedabad-metro-train-advertising/exterior-train-branding)): ₹13.2 lakh for an exterior wrap, ₹6.82 lakh for interior panels, ₹17.82 lakh for a full train. These listings are "subject to GMRCL approval".
- Comparables:
  - A hoarding at Sabarmati Jn railway station lists at ~₹35k to ₹42k per month (The Media Ant).
  - Single panels at Delhi Metro interchanges are quoted at ₹60k to ₹1.2 lakh per month, and at Mumbai Metro key stations at ₹80k to ₹1.5 lakh per month (agency blogs, indicative only).
  - Mumbai Metro digital platform screens are quoted at a **₹300 to ₹700 CPM** ([AdQuick 2026](https://www.adquick.com/dooh-advertising/mumbai-in)). One agency claims a static metro panel works out to a **~₹8 to ₹12 CPM**.
- **Verdict:** ₹40 for static or backlit panels sits between the static and digital quotes. It is a reasonable, conservative default. Example: a tier-A Kalupur concourse panel at ~26k weekday footfall prices at about ₹20k to ₹30k per month, which is below the Sabarmati railway hoarding comparable. The CPM slider exists so GMRC's commercial team can set its own figure.

---

## (b) How the synthetic data is calibrated

1. **Network total.** Routine weekdays now run at about 2 lakh journeys. One journey is one entry plus one exit, so that is **about 4 lakh gate taps per day across 54 stations**, an average of about 7,400 per station.
2. **Phase split.** Phase 2 carries only about 10% to 12% of journeys. GIFT City and Sachivalaya were therefore cut from 30,000 and 22,000 to **4,000 and 3,000**. The old values implied that one Gandhinagar station carried more than the entire published Phase 2 total.
3. **Phase 1 stations.** The eight Phase 1 stations total about 1.13 lakh taps, about 31% of Phase 1's ~3.6 lakh, for 8 of ~32 stations. They are ranked by role:
   - Kalupur (railway station) is highest.
   - Next come Old High Court (interchange, gate taps only), then Gujarat University and Commerce Six Road (college belt).
   - Termini (APMC, Thaltej Gam, Vastral Gam) sit mid-range.
   - Motera's base is low, but it spikes on event days.
4. **Hourly shape.** Profiles peak at 8 to 10 am and 5 to 7 pm, matching GMRC's stated peaks. Weekends drop to about 0.35 to 0.45x for office and college stations, consistent with Sunday ridership being about half of weekday.
5. **Per-station split is our estimate.** It is constrained by published totals but is not observed data. We say so on stage.

| Station | Old base | New base |
|---|---|---|
| ST01 Kalupur Railway Station | 52,000 | 26,000 |
| ST02 Old High Court | 46,000 | 21,000 |
| ST03 GIFT City | 30,000 | 4,000 |
| ST04 Sachivalaya | 22,000 | 3,000 |
| ST05 Gujarat University | 26,000 | 15,000 |
| ST06 Commerce Six Road | 19,000 | 13,000 |
| ST07 Motera Stadium | 14,000 | 9,000 |
| ST08 Thaltej Gam | 12,000 | 9,500 |
| ST09 Vastral Gam | 10,500 | 8,500 |
| ST10 APMC | 13,500 | 11,000 |

---

## (c) How to get real station-wise hourly AFC data

GMRC's AFC (automatic fare collection) system logs every gate entry and exit. Hourly station-wise counts are a routine export for them. It is just not published.

1. **Ask the organisers or GMRC directly (fastest).** The problem statement comes from GMRC. Request an anonymised export covering 2 to 4 weeks, with one row per *station × date × hour* and entries/exits only. That is aggregate data with no personal data. Offer to run Yieldline on it and share the rate card back.
2. **RTI to GMRC (statutory reply within 30 days, nominal fee under Gujarat RTI rules).** GMRC is a state/central PSU. Address the request to its Public Information Officer (PIO), Gujarat Metro Rail Corporation (GMRC) Ltd, Gandhinagar, by post or through the Gujarat RTI online portal. Check GMRC's website for the current PIO details. Suggested wording:
   > "Please provide station-wise, hour-wise counts of AFC gate entries and exits for all operational stations of the Ahmedabad–Gandhinagar Metro for the period [dd/mm/yyyy] to [dd/mm/yyyy], in machine-readable (CSV/Excel) format. No personal data is sought."

   The BMRCL RTI response published on OpenCity is a precedent to cite.
3. **data.gov.in / OGD request.** There is no GMRC dataset today. Use "Suggest a dataset" on data.gov.in to put the request on record.
4. **Interim real-world proxies.** Use GMRC's daily network totals (DeshGujarat and other press, as above) to rescale the synthetic profiles week by week. Manual turnstile or concourse head-counts at 2 to 3 stations for one peak hour can validate the hourly shape.

---

## (d) Importing real data into Yieldline

`POST /api/admin/import/footfall` with `Content-Type: text/csv`. Header:

```
station_id,date,hour,entries,exits
ST01,2026-09-14,8,1450,1310
ST01,2026-09-14,9,1620,1500
```

- `station_id` must be one of **ST01 to ST10**. Unknown IDs are rejected.
- `date` is `YYYY-MM-DD`.
- `hour` is 0 to 23 and marks the start of the hour.
- `entries` and `exits` are non-negative integers.
- The import **replaces all footfall**, so include every station in one file. Weekday/weekend profiles and rate cards are rebuilt immediately.
- A JSON array of the same objects is also accepted.

**Windows PowerShell** (use `curl.exe`, not the `curl` alias):

```powershell
curl.exe -X POST "http://localhost:8000/api/admin/import/footfall" -H "Content-Type: text/csv" --data-binary "@afc_export.csv"
# or natively:
Invoke-RestMethod -Method Post -Uri "http://localhost:8000/api/admin/import/footfall" -ContentType "text/csv" -InFile "afc_export.csv"
```

**bash:**

```bash
curl -X POST http://localhost:8000/api/admin/import/footfall \
  -H "Content-Type: text/csv" --data-binary @afc_export.csv
```

To return to the synthetic demo data, use `POST /api/admin/reseed`.
