import type { Destination, Urgency } from './algorithms';
import type { ProduceType } from './produce';
import type { Defect, VisionSignal } from './vision';

export type BatchStatus = 'pending' | 'routed' | 'listed' | 'claimed' | 'delivered';

export interface Batch {
  id: string;
  produceType: ProduceType;
  weightKg: number;
  harvestDate: string; // ISO date
  freshnessScore: number;
  grade: 'A' | 'B' | 'C';
  shelfLifeDays: number;
  destination: Destination;
  destinationLabel: string;
  facility: string;
  urgency: Urgency;
  suggestedPricePerKg: number;
  valueRecovered: number;
  status: BatchStatus;
  createdAt: string; // ISO datetime
  coldStorageBlock: string;
  tempCelsius: number;
  humidityPct: number;
  confidence: number;
  defects: Defect[];
  signals: VisionSignal[];
  recommendation: string;
  /** Set when a cascade alert has re-routed this batch. */
  rerouted?: { from: Destination; reason: string };
  imageUrl?: string;
  origin: string;
}

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface Alert {
  id: string;
  type: 'temperature' | 'shelf_life' | 'humidity' | 'route_confirmed' | 'claim';
  severity: AlertSeverity;
  title: string;
  message: string;
  /** What the system did on its own, without an operator. */
  autoAction?: string;
  affectedBatchIds: string[];
  impact?: { label: string; before: string; after: string };
  resolved: boolean;
  createdAt: string;
  resolvedAt?: string;
  location?: string;
  timeline: { at: string; label: string; kind: 'detect' | 'compute' | 'act' | 'notify' }[];
}

export type BuyerType = 'NGO' | 'Dark Store' | 'Canteen' | 'Processor';

export interface Listing {
  id: string;
  batchId: string;
  produceType: ProduceType;
  weightKg: number;
  daysLeft: number;
  pricePerKg: number;
  buyerTypes: BuyerType[];
  location: string;
  distanceKm: number;
  claimed: boolean;
  claimedBy?: string;
  createdAt: string;
  /** 0–1 days left ⇒ free to NGOs. */
  free: boolean;
}

export interface ActivityEvent {
  id: string;
  at: string;
  kind: 'scan' | 'route' | 'alert' | 'claim' | 'reroute';
  text: string;
  meta?: string;
}
