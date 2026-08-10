/**
 * The recommendation layer.
 *
 * Note the ordering: the routing decision has *already been made* by
 * `smartRoute` before anything here runs. This layer only puts that decision
 * into language a mandi supervisor can act on. That separation is deliberate —
 * the intelligence is ours and stays deterministic; the language model is a
 * presentation detail that can fail without affecting a single routing outcome.
 *
 * If `VITE_API_URL` points at the FastAPI service, we ask Claude. Otherwise —
 * and whenever the network, the key or the model is unavailable — we fall back
 * to the local composer below, which is built from the same numbers Claude
 * would have been handed.
 */

import type { RouteResult, ShelfLifeResult } from './algorithms';
import { PRODUCE, type ProduceType } from './produce';
import { formatINR } from './format';
import { fetchRecommendation } from './api';

export interface RecommendationInput {
  produceType: ProduceType;
  weightKg: number;
  freshnessScore: number;
  shelfLife: ShelfLifeResult;
  route: RouteResult;
  facility: string;
}

export interface Recommendation {
  text: string;
  source: 'claude' | 'local';
}

export async function getRecommendation(input: RecommendationInput): Promise<Recommendation> {
  // Routed through the shared client so it shares the timeout and the
  // unreachable-backend circuit breaker — otherwise a dead server costs this
  // call a full connect timeout on top of the one the grading call already paid.
  const res = await fetchRecommendation({
    produce_type: input.produceType,
    weight_kg: input.weightKg,
    freshness_score: input.freshnessScore,
    shelf_life_days: input.shelfLife.days,
    destination: input.route.destination,
    suggested_price: input.route.suggestedPricePerKg,
    facility: input.facility,
  });

  if (res?.text) return { text: res.text, source: 'claude' };
  return { text: compose(input), source: 'local' };
}

/**
 * Local composer. Reads the same figures as the prompt and states the action,
 * the window and the money — in the Hindi-English register operators use on the
 * floor.
 */
function compose({ produceType, weightKg, shelfLife, route, facility }: RecommendationInput): string {
  const spec = PRODUCE[produceType];
  const totalValue = formatINR(route.suggestedPricePerKg * weightKg);
  const days = shelfLife.days;
  const window = route.actionWindowHours;

  if (route.destination === 'NGO_RESCUE') {
    return `${weightKg} kg ${spec.label.toLowerCase()} ka shelf life sirf ${days} din bacha hai — retail bhejoge toh raaste mein hi kharab ho jaayega. Aaj hi ${facility} ko rescue channel pe do, agle ${window} ghante ke andar pickup schedule karo. Rate ${formatINR(route.suggestedPricePerKg)}/kg, total ${totalValue} — poora write-off se ${formatINR(route.valueRecovered)} bach jaayega.`;
  }

  if (route.destination === 'QUICK_COMMERCE') {
    return `${days} din ka life hai — quick commerce ke liye bilkul sahi window. ${facility} ko aaj shaam tak dispatch karo, wahan stock ek din mein turn ho jaata hai. ${formatINR(route.suggestedPricePerKg)}/kg pe list karo (mandi se 30% neeche, par clearance guaranteed) — ${weightKg} kg ka ${totalValue}. ${window} ghante se zyada rukoge toh rescue channel mein chala jaayega.`;
  }

  return `Batch strong hai — ${days} din ka shelf life, full retail distance sambhal lega. ${facility} ko normal lot ke saath bhejo, koi discount ki zaroorat nahi. Mandi rate ${formatINR(route.suggestedPricePerKg)}/kg pe ${totalValue} milega. Cold chain 15°C ke neeche rakho, warna ${spec.label.toLowerCase()} ka life tezi se girta hai.`;
}

/**
 * Short one-liner for dense cards.
 *
 * A routing queue where twenty cards repeat one sentence reads as generated
 * text, so each channel carries a few phrasings and the produce type picks
 * between them — deterministic, but never a wall of identical copy.
 */
export function shortRecommendation(route: RouteResult, shelfLifeDays: number, produceType: ProduceType): string {
  const spec = PRODUCE[produceType];
  const crop = spec.label.toLowerCase();
  const hrs = route.actionWindowHours;
  // Stable per crop, so the same batch always shows the same line.
  const pick = <T,>(options: T[]) => options[crop.length % options.length];

  if (route.destination === 'NGO_RESCUE') {
    return pick([
      `Retail ab possible nahi — ${hrs}h ke andar rescue pickup lagao.`,
      `NGO ko aaj hi do. ${hrs}h baad ye ${crop} kisi kaam ka nahi rahega.`,
      `Free rescue channel — ${hrs}h window, uske baad total loss.`,
    ]);
  }

  if (route.destination === 'QUICK_COMMERCE') {
    return pick([
      `Dark store bhejo — ${shelfLifeDays} din mein stock turn ho jaayega.`,
      `Aaj shaam dispatch karo, 30% discount pe pura lot clear hoga.`,
      `Quick commerce ke liye perfect window — ${hrs}h ke andar nikaalo.`,
    ]);
  }

  return pick([
    `Full mandi rate — ${shelfLifeDays} din ka margin, koi discount nahi.`,
    `Retail lot ke saath bhejo. Cold chain 15°C ke neeche rakho.`,
    `Export consolidation ke liye eligible — ${shelfLifeDays} din bache hain.`,
  ]);
}
