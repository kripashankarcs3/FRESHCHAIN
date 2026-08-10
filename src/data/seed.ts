/**
 * Seed state for the Ghaziabad pilot node.
 *
 * Every batch here is run through the same `calculateShelfLife` / `smartRoute` /
 * price functions the live scan flow uses — nothing is hand-typed. So the
 * dashboard totals, the routing colours and the marketplace listings are all
 * internally consistent, and a judge can pick any card and the arithmetic holds.
 *
 * A fixed-seed PRNG keeps the demo identical on every reload.
 */

import {
  calculateShelfLife,
  co2Avoided,
  gradeOf,
  smartRoute,
} from '@/lib/algorithms';
import { COLD_STORAGE_BLOCKS, FACILITIES, PRODUCE_LIST, type ProduceType } from '@/lib/produce';
import { shortRecommendation } from '@/lib/recommend';
import type { ActivityEvent, Alert, Batch, BuyerType, Listing } from '@/lib/types';
import { batchId, isoDate } from '@/lib/format';

/* Deterministic PRNG (mulberry32) — same demo every time. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(20260810);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number) => min + rand() * (max - min);

const ORIGINS = [
  'Modinagar farm cluster',
  'Hapur collection centre',
  'Muradnagar FPO',
  'Baghpat farm gate',
  'Meerut aggregation point',
  'Bulandshahr cluster',
];

const now = new Date();

function hoursAgo(h: number): string {
  return new Date(now.getTime() - h * 3600_000).toISOString();
}

function daysAgo(d: number): Date {
  return new Date(now.getTime() - d * 86_400_000);
}

/** Build a fully-derived batch from a few raw inputs. */
function makeBatch(opts: {
  index: number;
  produceType: ProduceType;
  weightKg: number;
  harvestDaysAgo: number;
  freshnessScore: number;
  tempCelsius: number;
  humidityPct: number;
  createdHoursAgo: number;
  status?: Batch['status'];
}): Batch {
  const harvestDate = daysAgo(opts.harvestDaysAgo);
  const conditions = { tempCelsius: opts.tempCelsius, humidityPct: opts.humidityPct };
  const shelf = calculateShelfLife(opts.produceType, harvestDate, conditions, opts.freshnessScore);
  const route = smartRoute(shelf.days, opts.weightKg, opts.produceType);
  const facility = pick(FACILITIES[route.destination]);

  return {
    id: batchId(0x1a00 + opts.index * 977),
    produceType: opts.produceType,
    weightKg: opts.weightKg,
    harvestDate: isoDate(harvestDate),
    freshnessScore: opts.freshnessScore,
    grade: gradeOf(opts.freshnessScore),
    shelfLifeDays: shelf.days,
    destination: route.destination,
    destinationLabel: route.destinationLabel,
    facility,
    urgency: route.urgency,
    suggestedPricePerKg: route.suggestedPricePerKg,
    valueRecovered: route.valueRecovered,
    status: opts.status ?? 'routed',
    createdAt: hoursAgo(opts.createdHoursAgo),
    coldStorageBlock: pick(COLD_STORAGE_BLOCKS),
    tempCelsius: opts.tempCelsius,
    humidityPct: opts.humidityPct,
    confidence: Math.round(between(0.78, 0.96) * 100) / 100,
    defects: [],
    signals: [],
    recommendation: shortRecommendation(route, shelf.days, opts.produceType),
    origin: pick(ORIGINS),
  };
}

/* --------------------------------------------------------------------------
   Batches — a realistic morning's intake at one mandi node.
   Distribution is intentional: a healthy operation is mostly green, with a
   handful of red that need a human. An all-red dashboard reads as fiction.
   -------------------------------------------------------------------------- */

interface RawBatch {
  p: ProduceType;
  kg: number;
  harvest: number;
  score: number;
  temp: number;
  rh: number;
  hrs: number;
  status?: Batch['status'];
}

// Tuned so the floor reads like a real shift: 4 red, 5 amber, 8 green active,
// plus stock already on the rescue board or delivered. A dashboard that is
// mostly red would say the system does not work.
const RAW: RawBatch[] = [
  // Critical — inside the 48-hour rescue window, still saveable.
  { p: 'mango', kg: 340, harvest: 2, score: 58, temp: 18.5, rh: 84, hrs: 1.2 },
  { p: 'leafy_greens', kg: 120, harvest: 1, score: 54, temp: 17.0, rh: 86, hrs: 0.7 },
  { p: 'banana', kg: 290, harvest: 1, score: 62, temp: 17.5, rh: 85, hrs: 2.1 },
  { p: 'tomato', kg: 310, harvest: 3, score: 49, temp: 17.5, rh: 83, hrs: 3.4 },

  // Urgent — quick commerce territory.
  { p: 'tomato', kg: 520, harvest: 2, score: 74, temp: 16.0, rh: 81, hrs: 2.4 },
  { p: 'banana', kg: 610, harvest: 1, score: 78, temp: 15.5, rh: 80, hrs: 3.1 },
  { p: 'mango', kg: 420, harvest: 1, score: 82, temp: 14.0, rh: 78, hrs: 4.0 },
  { p: 'leafy_greens', kg: 95, harvest: 0, score: 86, temp: 9.0, rh: 79, hrs: 5.0 },
  { p: 'tomato', kg: 430, harvest: 2, score: 80, temp: 15.0, rh: 76, hrs: 6.5 },

  // Fresh — full retail and export lead times.
  { p: 'apple', kg: 860, harvest: 8, score: 85, temp: 9.5, rh: 72, hrs: 7.2 },
  { p: 'citrus', kg: 540, harvest: 7, score: 78, temp: 13.0, rh: 75, hrs: 8.1 },
  { p: 'tomato', kg: 780, harvest: 1, score: 88, temp: 14.0, rh: 74, hrs: 9.4 },
  { p: 'apple', kg: 950, harvest: 3, score: 92, temp: 8.0, rh: 70, hrs: 10.6 },
  { p: 'potato', kg: 2400, harvest: 6, score: 86, temp: 13.0, rh: 76, hrs: 12.0 },
  { p: 'onion', kg: 3100, harvest: 9, score: 90, temp: 16.0, rh: 68, hrs: 13.5 },
  { p: 'citrus', kg: 680, harvest: 2, score: 84, temp: 11.0, rh: 72, hrs: 15.2 },
  { p: 'apple', kg: 1200, harvest: 5, score: 89, temp: 7.5, rh: 68, hrs: 17.0 },

  // Already on the rescue board or closed out.
  { p: 'mango', kg: 260, harvest: 2, score: 50, temp: 18.0, rh: 87, hrs: 20.0, status: 'listed' },
  { p: 'leafy_greens', kg: 140, harvest: 2, score: 48, temp: 18.0, rh: 88, hrs: 21.5, status: 'listed' },
  { p: 'banana', kg: 380, harvest: 2, score: 66, temp: 16.5, rh: 82, hrs: 22.8, status: 'claimed' },
  { p: 'potato', kg: 1800, harvest: 11, score: 82, temp: 15.5, rh: 77, hrs: 26.0, status: 'delivered' },
  { p: 'onion', kg: 2200, harvest: 14, score: 88, temp: 17.0, rh: 66, hrs: 28.5, status: 'delivered' },
];

export const seedBatches: Batch[] = RAW.map((r, index) =>
  makeBatch({
    index,
    produceType: r.p,
    weightKg: r.kg,
    harvestDaysAgo: r.harvest,
    freshnessScore: r.score,
    tempCelsius: r.temp,
    humidityPct: r.rh,
    createdHoursAgo: r.hrs,
    status: r.status,
  }),
);

/* --------------------------------------------------------------------------
   Alerts — the cascade system. Each one carries the full chain: what was
   detected, what it computed, what it did, and who it told.
   -------------------------------------------------------------------------- */

// Anchored by index so each alert points at the batch whose numbers actually
// match the story it tells.
const mangoBatch = seedBatches[6]; // 420 kg mango, urgent — the re-routed lot
const greensBatch = seedBatches[1]; // 120 kg leafy greens, critical
const tomatoBatch = seedBatches[4]; // 520 kg tomato, urgent — humidity warning

export const seedAlerts: Alert[] = [
  {
    id: 'ALT-2201',
    type: 'temperature',
    severity: 'critical',
    title: 'Cold storage Block C — temperature spike',
    message: 'Block C held 18 °C for 41 minutes and peaked at 24 °C. Compressor 2 tripped on overload.',
    location: 'Block C · Ghaziabad node',
    autoAction: `${mangoBatch.id} re-routed from Retail & Export to Quick Commerce. Dark Store — Indirapuram Hub notified and has confirmed the slot.`,
    affectedBatchIds: [mangoBatch.id],
    impact: { label: 'Shelf life', before: '6.4 days', after: `${mangoBatch.shelfLifeDays} days` },
    resolved: false,
    createdAt: hoursAgo(1.6),
    timeline: [
      { at: hoursAgo(1.6), label: 'Sensor reported 18 °C — 3 °C above the Block C ceiling', kind: 'detect' },
      {
        at: hoursAgo(1.55),
        label: `Shelf life recomputed for 12 affected mango crates: 6.4 → ${mangoBatch.shelfLifeDays} days`,
        kind: 'compute',
      },
      { at: hoursAgo(1.5), label: 'Routing engine re-ran: destination changed to Quick Commerce', kind: 'act' },
      { at: hoursAgo(1.45), label: 'Buyer notified — pickup slot confirmed for the next dispatch run', kind: 'notify' },
    ],
  },
  {
    id: 'ALT-2200',
    type: 'shelf_life',
    severity: 'critical',
    title: 'Leafy greens crossed the rescue threshold',
    message: `${greensBatch.id} dropped below 2 days of shelf life. Retail dispatch is no longer viable.`,
    location: 'Block A · staging bay',
    autoAction: 'Listed on the Rescue Marketplace at no cost to NGO buyers. Three NGOs within 8 km were notified.',
    affectedBatchIds: [greensBatch.id],
    impact: { label: 'Channel', before: 'Quick Commerce', after: 'NGO Rescue' },
    resolved: false,
    createdAt: hoursAgo(3.2),
    timeline: [
      {
        at: hoursAgo(3.2),
        label: `Shelf life recomputed at ${greensBatch.shelfLifeDays} days on the hourly sweep`,
        kind: 'detect',
      },
      { at: hoursAgo(3.15), label: 'Routing engine returned NGO_RESCUE at CRITICAL urgency', kind: 'act' },
      { at: hoursAgo(3.1), label: 'Marketplace listing created — free tier', kind: 'act' },
      { at: hoursAgo(3.05), label: '3 NGO partners within 8 km notified', kind: 'notify' },
    ],
  },
  {
    id: 'ALT-2199',
    type: 'humidity',
    severity: 'warning',
    title: 'Block B humidity above 88 %',
    message: 'Sustained high humidity raises fungal risk across 4 stored batches. Dehumidifier cycle extended.',
    location: 'Block B',
    autoAction: 'Shelf life re-estimated for 4 batches. No channel change required yet.',
    affectedBatchIds: [tomatoBatch.id],
    resolved: false,
    createdAt: hoursAgo(5.5),
    timeline: [
      { at: hoursAgo(5.5), label: 'Humidity reached 88.4 %, above the 85 % ceiling', kind: 'detect' },
      { at: hoursAgo(5.4), label: 'Penalty applied to 4 batches — average −0.8 days', kind: 'compute' },
    ],
  },
  {
    id: 'ALT-2198',
    type: 'temperature',
    severity: 'warning',
    title: 'Reefer truck UP-14-GT-2291 running warm',
    message: 'In-transit temperature 17 °C against a 12 °C set point on the Indirapuram run.',
    location: 'In transit · NH-9',
    autoAction: 'Driver alerted. Arrival ETA moved forward by 40 minutes to protect the load.',
    affectedBatchIds: [],
    resolved: true,
    createdAt: hoursAgo(9.4),
    resolvedAt: hoursAgo(8.7),
    timeline: [
      { at: hoursAgo(9.4), label: 'Telemetry breached the set point by 5 °C', kind: 'detect' },
      { at: hoursAgo(9.3), label: 'Driver and receiving hub alerted', kind: 'notify' },
      { at: hoursAgo(8.7), label: 'Temperature recovered to 12.4 °C — alert closed', kind: 'act' },
    ],
  },
  {
    id: 'ALT-2197',
    type: 'temperature',
    severity: 'info',
    title: 'Block D returned to set point',
    message: 'Block D stabilised at 4.2 °C after the overnight defrost cycle. No batches affected.',
    location: 'Block D',
    resolved: true,
    affectedBatchIds: [],
    createdAt: hoursAgo(14),
    resolvedAt: hoursAgo(13.4),
    timeline: [
      { at: hoursAgo(14), label: 'Scheduled defrost cycle started', kind: 'detect' },
      { at: hoursAgo(13.4), label: 'Set point recovered within tolerance', kind: 'act' },
    ],
  },
];

/* --------------------------------------------------------------------------
   Marketplace — derived from the batches that routed to rescue.
   -------------------------------------------------------------------------- */

// Free stock is reserved for NGOs and community kitchens — a dark store must
// not be able to claim donated produce. Priced stock is open to everyone.
const FREE_BUYERS: BuyerType[][] = [
  ['NGO', 'Canteen'],
  ['NGO'],
];
const PRICED_BUYERS: BuyerType[][] = [
  ['NGO', 'Dark Store'],
  ['Dark Store', 'Processor'],
  ['Canteen', 'Processor'],
];

const LOCATIONS = [
  'Ghaziabad node · Bay 2',
  'Ghaziabad node · Bay 4',
  'Vaishali cross-dock',
  'Indirapuram staging',
  'Loni collection point',
];

// Anything already on the board comes first so the Claimed lane is never empty,
// then whatever the routing engine has since marked critical.
export const seedListings: Listing[] = [
  ...seedBatches.filter((b) => b.status === 'listed' || b.status === 'claimed'),
  ...seedBatches.filter((b) => b.urgency === 'CRITICAL' && b.status !== 'listed' && b.status !== 'claimed'),
]
  .slice(0, 6)
  .map((b, i) => ({
    id: `LST-${3100 + i}`,
    batchId: b.id,
    produceType: b.produceType,
    weightKg: b.weightKg,
    daysLeft: b.shelfLifeDays,
    pricePerKg: b.shelfLifeDays <= 1 ? 0 : b.suggestedPricePerKg,
    buyerTypes:
      b.shelfLifeDays <= 1 ? FREE_BUYERS[i % FREE_BUYERS.length] : PRICED_BUYERS[i % PRICED_BUYERS.length],
    location: LOCATIONS[i % LOCATIONS.length],
    distanceKm: Math.round(between(1.2, 14) * 10) / 10,
    claimed: b.status === 'claimed',
    claimedBy: b.status === 'claimed' ? 'Robin Hood Army — Ghaziabad Chapter' : undefined,
    createdAt: b.createdAt,
    free: b.shelfLifeDays <= 1,
  }));

/* --------------------------------------------------------------------------
   Activity feed + 14-day trend.
   -------------------------------------------------------------------------- */

const claimedBatch = seedBatches.find((b) => b.status === 'claimed')!;
const retailBatch = seedBatches.find((b) => b.destination === 'RETAIL_EXPORT')!;

/** Derived from the batches themselves, so the feed never contradicts the data. */
export const seedActivity: ActivityEvent[] = [
  {
    id: 'a1',
    at: hoursAgo(0.3),
    kind: 'scan',
    text: `${seedBatches[0].id} scanned — Grade ${seedBatches[0].grade}, ${seedBatches[0].freshnessScore}/100`,
    meta: 'Bay 2',
  },
  { id: 'a2', at: hoursAgo(1.5), kind: 'reroute', text: `${mangoBatch.id} auto-rerouted to Quick Commerce after the Block C spike`, meta: 'Cascade' },
  { id: 'a3', at: hoursAgo(2.4), kind: 'route', text: `${seedBatches[1].id} accepted to ${seedBatches[1].facility}`, meta: 'Operator' },
  { id: 'a4', at: hoursAgo(3.1), kind: 'alert', text: 'Leafy greens crossed the 2-day rescue threshold', meta: 'Block A' },
  {
    id: 'a5',
    at: hoursAgo(4.6),
    kind: 'claim',
    text: `Robin Hood Army claimed ${claimedBatch.weightKg} kg of ${PRODUCE_LIST.find((p) => p.id === claimedBatch.produceType)!.label.toLowerCase()}`,
    meta: 'Rescue',
  },
  { id: 'a6', at: hoursAgo(6.2), kind: 'route', text: `${retailBatch.id} cleared to ${retailBatch.facility}`, meta: 'Operator' },
  {
    id: 'a7',
    at: hoursAgo(8.0),
    kind: 'scan',
    text: `${seedBatches[12].id} scanned — Grade ${seedBatches[12].grade}, ${seedBatches[12].freshnessScore}/100`,
    meta: 'Bay 1',
  },
  { id: 'a8', at: hoursAgo(9.4), kind: 'alert', text: 'Reefer UP-14-GT-2291 running warm on NH-9', meta: 'In transit' },
];

/** Tonnes saved + value recovered per day for the trailing fortnight. */
export const seedTrend = Array.from({ length: 14 }, (_, i) => {
  const day = new Date(now.getTime() - (13 - i) * 86_400_000);
  const growth = 1 + i * 0.055;
  const tonnes = Math.round(between(0.9, 1.6) * growth * 100) / 100;
  return {
    date: day.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    tonnes,
    recovered: Math.round(tonnes * between(105_000, 135_000)),
    spoiled: Math.round(between(0.08, 0.3) * (2 - i * 0.045) * 100) / 100,
  };
});

/** Half-hour slot index carrying the Block C peak that produced ALT-2201. */
const SPIKE_SLOT = 19;

/** Wall-clock label of the peak, so captions and charts cannot drift apart. */
export const seedSpikeTime = new Date(now.getTime() - (23 - SPIKE_SLOT) * 1800_000).toLocaleTimeString('en-IN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Cold-storage telemetry for the last 12 hours, per block. */
export const seedTelemetry = Array.from({ length: 24 }, (_, i) => {
  const t = new Date(now.getTime() - (23 - i) * 1800_000);
  // Block C carries the spike that produced ALT-2201, so the chart and the
  // alert tell the same story.
  const spike = i >= SPIKE_SLOT - 2 && i <= SPIKE_SLOT + 1 ? (i === SPIKE_SLOT ? 24 : 18.5) : 0;
  return {
    time: t.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
    blockA: Math.round(between(3.4, 5.2) * 10) / 10,
    blockB: Math.round(between(5.0, 7.0) * 10) / 10,
    blockC: spike || Math.round(between(4.0, 6.2) * 10) / 10,
    blockD: Math.round(between(2.6, 4.4) * 10) / 10,
  };
});

export const seedProduceMix = PRODUCE_LIST.map((spec) => {
  const rows = seedBatches.filter((b) => b.produceType === spec.id);
  return {
    name: spec.label,
    kg: rows.reduce((sum, b) => sum + b.weightKg, 0),
    batches: rows.length,
  };
}).filter((r) => r.kg > 0);

export const seedCo2Saved = co2Avoided(seedBatches.reduce((s, b) => s + b.weightKg, 0));
