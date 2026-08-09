/**
 * FreshChain's three original algorithms.
 *
 * These are the product's actual intelligence — no model API is involved at any
 * point in this file. Everything here is deterministic, auditable and runs
 * offline in the browser in microseconds. The LLM layer sits strictly *after*
 * these functions and only explains their output in plain language.
 *
 *   1. calculateShelfLife  — how many days this batch has left
 *   2. smartRoute          — therefore, where it must go
 *   3. optimizePrice       — therefore, what it should sell for
 */

import { PRODUCE, type ProduceType } from './produce';

export type Urgency = 'CRITICAL' | 'HIGH' | 'NORMAL';
export type Destination = 'NGO_RESCUE' | 'QUICK_COMMERCE' | 'RETAIL_EXPORT';

export interface StorageConditions {
  tempCelsius: number;
  humidityPct: number;
}

export interface ShelfLifeResult {
  days: number;
  /** Ordered breakdown of what was subtracted, for the UI's "why" panel. */
  factors: { label: string; days: number }[];
  baseLifeDays: number;
}

/* ------------------------------------------------------------------------- */
/* Algorithm 1 — Shelf Life Calculator                                        */
/* ------------------------------------------------------------------------- */

/**
 * Days of usable life remaining.
 *
 * Base life for the crop, minus time already elapsed since harvest, minus
 * penalties for storage above 15 °C and above 80 % RH. A freshness score from
 * the vision pipeline scales the result: visible decay means the batch is
 * already further along its curve than the calendar suggests.
 */
export function calculateShelfLife(
  produceType: ProduceType,
  harvestDate: Date,
  conditions: StorageConditions,
  freshnessScore = 100,
): ShelfLifeResult {
  const spec = PRODUCE[produceType];
  const baseLife = spec.baseLifeDays;

  const msPerDay = 86_400_000;
  const daysSinceHarvest = Math.max(
    0,
    Math.floor((startOfDay(new Date()).getTime() - startOfDay(harvestDate).getTime()) / msPerDay),
  );

  // Above 15 °C, respiration rate climbs and life burns faster.
  const tempPenalty = Math.max(0, (conditions.tempCelsius - 15) * 0.3 * spec.tempSensitivity);
  // Above 80 % RH, fungal and mould risk rises.
  const humidityPenalty = Math.max(0, (conditions.humidityPct - 80) * 0.1);

  const beforeVision = baseLife - daysSinceHarvest - tempPenalty - humidityPenalty;

  // Visible condition scales the remainder. A score of 100 leaves it untouched;
  // 50 halves it; below ~30 the batch is effectively spent.
  const visionFactor = clamp(0.15 + (freshnessScore / 100) * 0.85, 0.15, 1);
  const visionPenalty = Math.max(0, beforeVision) * (1 - visionFactor);

  const remaining = Math.max(0, beforeVision - visionPenalty);

  return {
    days: round1(remaining),
    baseLifeDays: baseLife,
    factors: [
      { label: 'Days since harvest', days: -daysSinceHarvest },
      { label: `Temperature ${conditions.tempCelsius.toFixed(1)}°C`, days: -round1(tempPenalty) },
      { label: `Humidity ${Math.round(conditions.humidityPct)}%`, days: -round1(humidityPenalty) },
      { label: `Visual condition ${Math.round(freshnessScore)}/100`, days: -round1(visionPenalty) },
    ].filter((f) => f.days !== 0),
  };
}

/* ------------------------------------------------------------------------- */
/* Algorithm 2 — Smart Routing Engine                                         */
/* ------------------------------------------------------------------------- */

export interface RouteResult {
  destination: Destination;
  destinationLabel: string;
  urgency: Urgency;
  /** Hours the operator has before this decision starts costing money. */
  actionWindowHours: number;
  suggestedPricePerKg: number;
  /** The full price derivation, for the UI's breakdown panel. */
  price: PriceResult;
  /** Value this routing decision preserves vs. letting the batch spoil, in ₹. */
  valueRecovered: number;
  rationale: string;
}

const DESTINATION_LABEL: Record<Destination, string> = {
  NGO_RESCUE: 'NGO Rescue',
  QUICK_COMMERCE: 'Quick Commerce',
  RETAIL_EXPORT: 'Retail & Export',
};

/**
 * Where this batch must go.
 *
 * Shelf life is the only axis that matters: produce that cannot survive the
 * distance to retail must be diverted to a channel that consumes it sooner,
 * even at a lower realised price. A lower price beats a total write-off.
 */
export function smartRoute(
  shelfLifeDays: number,
  weightKg: number,
  produceType: ProduceType,
  mandiPricePerKg = PRODUCE[produceType].mandiPricePerKg,
  demandScore = 0.45,
): RouteResult {
  // The channel decision comes first; price is then optimised *within* it, so
  // there is exactly one quoted rate per batch anywhere in the product.
  const channel =
    shelfLifeDays <= 2
      ? {
          destination: 'NGO_RESCUE' as const,
          urgency: 'CRITICAL' as const,
          multiplier: 0.1,
          actionWindowHours: Math.max(2, Math.round(shelfLifeDays * 12)),
          rationale:
            'Below the two-day threshold this batch cannot survive a retail distance. Diverting to rescue channels recovers social value and avoids a full write-off.',
        }
      : shelfLifeDays <= 5
        ? {
            destination: 'QUICK_COMMERCE' as const,
            urgency: 'HIGH' as const,
            multiplier: 0.7,
            actionWindowHours: Math.max(6, Math.round(shelfLifeDays * 10)),
            rationale:
              'Three to five days of life suits 10-minute delivery, where stock turns within a day of arriving at the dark store.',
          }
        : {
            destination: 'RETAIL_EXPORT' as const,
            urgency: 'NORMAL' as const,
            multiplier: 1,
            actionWindowHours: 48,
            rationale:
              'With six or more days remaining the batch tolerates full retail and export lead times at an unreduced rate.',
          };

  const price = optimizePrice(shelfLifeDays, mandiPricePerKg, demandScore, channel.multiplier);

  return {
    destination: channel.destination,
    destinationLabel: DESTINATION_LABEL[channel.destination],
    urgency: channel.urgency,
    actionWindowHours: channel.actionWindowHours,
    suggestedPricePerKg: price.pricePerKg,
    price,
    valueRecovered: recovered({ weightKg, mandiPricePerKg }, price.pricePerKg),
    rationale: channel.rationale,
  };
}

function recovered({ weightKg, mandiPricePerKg }: { weightKg: number; mandiPricePerKg: number }, price: number) {
  // Counterfactual: with no routing decision the batch spoils and realises ~15%
  // of its value as salvage. What routing preserves is the difference.
  const spoilageBaseline = mandiPricePerKg * 0.15;
  return Math.max(0, Math.round((price - spoilageBaseline) * weightKg));
}

/* ------------------------------------------------------------------------- */
/* Algorithm 3 — Price Optimizer                                              */
/* ------------------------------------------------------------------------- */

export interface PriceResult {
  pricePerKg: number;
  urgencyDiscountPct: number;
  demandPremiumPct: number;
  mandiPricePerKg: number;
  channelMultiplier: number;
  channelBasePerKg: number;
}

/**
 * The rate that actually clears the stock.
 *
 *   final = mandi rate × channel multiplier × (1 − urgency discount + demand premium)
 *
 * The channel multiplier comes from the routing engine, so this is the single
 * price the whole product quotes — the routing card, the batch card and the
 * marketplace listing all read the same number. Urgency steepens the discount
 * as life runs out (8 % per day inside the five-day window, floored at 40 %);
 * live demand adds back up to 15 %.
 */
export function optimizePrice(
  shelfLifeDays: number,
  mandiPricePerKg: number,
  demandScore: number,
  channelMultiplier = 1,
): PriceResult {
  const urgencyDiscount = clamp(Math.max(0, (5 - shelfLifeDays) * 0.08), 0, 0.4);
  const demandPremium = clamp(demandScore, 0, 1) * 0.15;
  const channelBasePerKg = mandiPricePerKg * channelMultiplier;
  const finalPrice = channelBasePerKg * (1 - urgencyDiscount + demandPremium);

  return {
    // Never quote below 5 % of the mandi rate — below that it is a donation,
    // and the rescue channel handles those explicitly as free.
    pricePerKg: round2(Math.max(mandiPricePerKg * 0.05, finalPrice)),
    urgencyDiscountPct: Math.round(urgencyDiscount * 100),
    demandPremiumPct: Math.round(demandPremium * 100),
    mandiPricePerKg,
    channelMultiplier,
    channelBasePerKg: round2(channelBasePerKg),
  };
}

/* ------------------------------------------------------------------------- */
/* Shared derivations                                                          */
/* ------------------------------------------------------------------------- */

export function urgencyOf(shelfLifeDays: number): Urgency {
  if (shelfLifeDays <= 2) return 'CRITICAL';
  if (shelfLifeDays <= 5) return 'HIGH';
  return 'NORMAL';
}

export function gradeOf(freshnessScore: number): 'A' | 'B' | 'C' {
  if (freshnessScore > 70) return 'A';
  if (freshnessScore > 40) return 'B';
  return 'C';
}

export function conditionOf(freshnessScore: number): 'Fresh' | 'Medium' | 'Spoiling' {
  if (freshnessScore > 70) return 'Fresh';
  if (freshnessScore > 40) return 'Medium';
  return 'Spoiling';
}

/** CO₂ avoided by not landfilling the batch — 2.5 kg CO₂e per kg of food waste. */
export function co2Avoided(weightKg: number): number {
  return round1((weightKg * 2.5) / 1000);
}

/* Utilities ---------------------------------------------------------------- */

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export const round1 = (n: number) => Math.round(n * 10) / 10;
export const round2 = (n: number) => Math.round(n * 100) / 100;

export function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
