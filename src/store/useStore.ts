/**
 * Application state.
 *
 * One store so the demo story is genuinely connected: a batch scanned on
 * Screen 2 immediately changes the dashboard counters, appears in the routing
 * queue, and — if it grades critical — lands on the rescue marketplace. Nothing
 * in this app is a screenshot.
 */

import { create } from 'zustand';
import { co2Avoided, smartRoute } from '@/lib/algorithms';
import type { ActivityEvent, Alert, Batch, Listing } from '@/lib/types';
import { seedActivity, seedAlerts, seedBatches, seedListings } from '@/data/seed';
import { FACILITIES, PRODUCE } from '@/lib/produce';
import { shortRecommendation } from '@/lib/recommend';

export interface Toast {
  id: string;
  title: string;
  detail?: string;
  tone: 'fresh' | 'urgent' | 'critical' | 'neutral';
}

interface State {
  batches: Batch[];
  alerts: Alert[];
  listings: Listing[];
  activity: ActivityEvent[];
  toasts: Toast[];

  addBatch: (batch: Batch) => void;
  acceptRoute: (batchId: string) => void;
  listOnMarketplace: (batchId: string) => void;
  claimListing: (listingId: string, buyer: string) => void;
  resolveAlert: (alertId: string) => void;
  /** Fires the cold-storage cascade: recompute, re-route, notify. */
  triggerCascade: () => void;
  /** Restores the seeded demo state — for resetting between demo run-throughs. */
  resetDemo: () => void;

  pushToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
}

let seq = 0;
/** Internal keys (toasts, activity rows) — never shown to a user. */
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${seq++}`;

/**
 * Human-facing identifiers continue the seeded sequence, so an alert raised
 * during the demo reads as ALT-2202 rather than a base-36 timestamp.
 */
const nextId = (prefix: string, existing: { id: string }[]) => {
  const highest = existing.reduce((max, row) => {
    const n = Number(row.id.split('-')[1]);
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0);
  return `${prefix}-${highest + 1}`;
};

export const useStore = create<State>((set, get) => ({
  batches: seedBatches,
  alerts: seedAlerts,
  listings: seedListings,
  activity: seedActivity,
  toasts: [],

  addBatch: (batch) =>
    set((s) => ({
      batches: [batch, ...s.batches],
      activity: [
        {
          id: uid('act'),
          at: new Date().toISOString(),
          kind: 'scan',
          text: `${batch.id} scanned — Grade ${batch.grade}, ${batch.freshnessScore}/100`,
          meta: PRODUCE[batch.produceType].label,
        },
        ...s.activity,
      ],
    })),

  acceptRoute: (batchId) => {
    const batch = get().batches.find((b) => b.id === batchId);
    if (!batch || batch.status !== 'pending') return;

    set((s) => ({
      batches: s.batches.map((b) => (b.id === batchId ? { ...b, status: 'routed' } : b)),
      activity: [
        {
          id: uid('act'),
          at: new Date().toISOString(),
          kind: 'route',
          text: `${batch.id} accepted to ${batch.facility}`,
          meta: batch.destinationLabel,
        },
        ...s.activity,
      ],
    }));

    get().pushToast({
      title: `Routed to ${batch.destinationLabel}`,
      detail: `${batch.id} → ${batch.facility}. Buyer notified.`,
      tone: batch.urgency === 'CRITICAL' ? 'critical' : batch.urgency === 'HIGH' ? 'urgent' : 'fresh',
    });

    // A critical batch that has been accepted belongs on the rescue board.
    if (batch.urgency === 'CRITICAL') get().listOnMarketplace(batchId);
  },

  listOnMarketplace: (batchId) => {
    const batch = get().batches.find((b) => b.id === batchId);
    if (!batch) return;
    if (get().listings.some((l) => l.batchId === batchId)) return;

    const free = batch.shelfLifeDays <= 1;
    set((s) => ({
      listings: [
        {
          id: nextId('LST', get().listings),
          batchId: batch.id,
          produceType: batch.produceType,
          weightKg: batch.weightKg,
          daysLeft: batch.shelfLifeDays,
          pricePerKg: free ? 0 : batch.suggestedPricePerKg,
          buyerTypes: free ? ['NGO', 'Canteen'] : ['NGO', 'Dark Store', 'Canteen', 'Processor'],
          location: `Ghaziabad node · ${batch.coldStorageBlock}`,
          // Derived from the receiving facility rather than a fixed 2.4 km on
          // every listing — rescue partners are close, retail hubs are not.
          distanceKm: distanceFor(batch.destination, batch.coldStorageBlock),
          claimed: false,
          createdAt: new Date().toISOString(),
          free,
        },
        ...s.listings,
      ],
      batches: s.batches.map((b) => (b.id === batchId ? { ...b, status: 'listed' } : b)),
    }));
  },

  claimListing: (listingId, buyer) => {
    const listing = get().listings.find((l) => l.id === listingId);
    if (!listing || listing.claimed) return;

    set((s) => ({
      listings: s.listings.map((l) => (l.id === listingId ? { ...l, claimed: true, claimedBy: buyer } : l)),
      batches: s.batches.map((b) => (b.id === listing.batchId ? { ...b, status: 'claimed' } : b)),
      activity: [
        {
          id: uid('act'),
          at: new Date().toISOString(),
          kind: 'claim',
          text: `${buyer} claimed ${listing.weightKg} kg of ${PRODUCE[listing.produceType].label.toLowerCase()}`,
          meta: listing.free ? 'Free · rescue' : 'Rescue',
        },
        ...s.activity,
      ],
    }));

    get().pushToast({
      title: 'Batch claimed',
      detail: `${listing.weightKg} kg going to ${buyer}. Pickup window opens in 2 hours.`,
      tone: 'fresh',
    });
  },

  resolveAlert: (alertId) =>
    set((s) => ({
      alerts: s.alerts.map((a) =>
        a.id === alertId
          ? {
              ...a,
              resolved: true,
              resolvedAt: new Date().toISOString(),
              timeline: [
                ...a.timeline,
                { at: new Date().toISOString(), label: 'Acknowledged and closed by operator', kind: 'act' as const },
              ],
            }
          : a,
      ),
    })),

  resetDemo: () => {
    set({
      batches: seedBatches,
      alerts: seedAlerts,
      listings: seedListings,
      activity: seedActivity,
    });
    get().pushToast({
      title: 'Demo data reset',
      detail: 'Batches, alerts and the rescue board are back to the seeded state.',
      tone: 'neutral',
    });
  },

  /**
   * The cascade demo. A temperature excursion is detected, shelf life is
   * recomputed for everything in the affected block, the routing engine re-runs,
   * and the batches move channel — with no operator in the loop.
   */
  triggerCascade: () => {
    const { batches } = get();
    const block = 'Block C';
    const affected = batches
      .filter((b) => b.coldStorageBlock === block && b.status !== 'delivered' && b.shelfLifeDays > 2)
      .slice(0, 3);

    const at = new Date().toISOString();
    const ids = affected.map((b) => b.id);

    const alert: Alert = {
      id: nextId('ALT', get().alerts),
      type: 'temperature',
      severity: 'critical',
      title: `Cold storage ${block} — temperature spike`,
      message: `${block} climbed from 4 °C to 24 °C. ${affected.length} batches in the block have been re-evaluated.`,
      location: `${block} · Ghaziabad node`,
      autoAction: affected.length
        ? `${affected.length} ${affected.length === 1 ? 'batch' : 'batches'} re-routed automatically. Receiving buyers notified.`
        : 'No batches in this block required a channel change.',
      affectedBatchIds: ids,
      impact: affected.length
        ? {
            label: 'Shelf life',
            before: `${affected[0].shelfLifeDays.toFixed(1)} days`,
            after: `${Math.max(0, affected[0].shelfLifeDays - 3).toFixed(1)} days`,
          }
        : undefined,
      resolved: false,
      createdAt: at,
      timeline: [
        { at, label: `Sensor reported 24 °C in ${block}`, kind: 'detect' },
        { at, label: `Shelf life recomputed for ${affected.length} batches — 3 days lost to the excursion`, kind: 'compute' },
        { at, label: 'Routing engine re-ran and changed destinations', kind: 'act' },
        { at, label: 'Receiving buyers notified of the revised slot', kind: 'notify' },
      ],
    };

    set((s) => ({
      alerts: [alert, ...s.alerts],
      batches: s.batches.map((b) => {
        if (!ids.includes(b.id)) return b;
        // Re-run the real routing engine on the revised shelf life rather than
        // reimplementing the thresholds here — the cascade must reach exactly
        // the same decision the scan flow would.
        const newShelf = Math.max(0, Math.round((b.shelfLifeDays - 3) * 10) / 10);
        const route = smartRoute(newShelf, b.weightKg, b.produceType);
        return {
          ...b,
          shelfLifeDays: newShelf,
          urgency: route.urgency,
          destination: route.destination,
          destinationLabel: route.destinationLabel,
          facility: FACILITIES[route.destination][0],
          suggestedPricePerKg: route.suggestedPricePerKg,
          valueRecovered: route.valueRecovered,
          recommendation: shortRecommendation(route, newShelf, b.produceType),
          tempCelsius: 24,
          rerouted: { from: b.destination, reason: `${block} temperature excursion` },
        };
      }),
      activity: [
        {
          id: uid('act'),
          at,
          kind: 'reroute',
          text: `${affected.length} batches auto-rerouted after the ${block} spike`,
          meta: 'Cascade',
        },
        ...s.activity,
      ],
    }));

    get().pushToast({
      title: 'Cascade triggered',
      detail: `${block} hit 24 °C. ${affected.length} batches re-routed automatically.`,
      tone: 'critical',
    });
  },

  pushToast: (toast) => {
    const id = uid('toast');
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    setTimeout(() => get().dismissToast(id), 5200);
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/* Derived selectors ---------------------------------------------------------- */

/**
 * "Active" means the batch is still physically on site and still the node's
 * problem. Claimed and delivered stock has left the building. The Routing
 * screen applies the same predicate via `isActive`, so the counts on the two
 * screens can never disagree.
 */
export const isActive = (b: Batch) => b.status !== 'delivered' && b.status !== 'claimed';

/**
 * Plausible haul distance for a listing. Rescue partners and community
 * kitchens sit inside the city; retail and export hubs are further out. Keyed
 * off the storage block so the same batch always reports the same distance
 * instead of a number that changes every render.
 */
function distanceFor(destination: Batch['destination'], block: string): number {
  const base = destination === 'NGO_RESCUE' ? 2.4 : destination === 'QUICK_COMMERCE' ? 6.8 : 14.2;
  const offset = (block.charCodeAt(block.length - 1) % 5) * 0.7;
  return Math.round((base + offset) * 10) / 10;
}

export function useMetrics() {
  const batches = useStore((s) => s.batches);
  const alerts = useStore((s) => s.alerts);

  const active = batches.filter(isActive);
  const savedKg = batches
    .filter((b) => b.status === 'routed' || b.status === 'claimed' || b.status === 'delivered')
    .reduce((sum, b) => sum + b.weightKg, 0);

  return {
    tonnesSaved: Math.round((savedKg / 1000) * 100) / 100,
    valueRecovered: batches.reduce((sum, b) => sum + b.valueRecovered, 0),
    batchesRouted: batches.filter((b) => b.status !== 'pending').length,
    co2Tonnes: co2Avoided(savedKg),
    critical: active.filter((b) => b.urgency === 'CRITICAL').length,
    high: active.filter((b) => b.urgency === 'HIGH').length,
    normal: active.filter((b) => b.urgency === 'NORMAL').length,
    pending: batches.filter((b) => b.status === 'pending').length,
    openAlerts: alerts.filter((a) => !a.resolved).length,
    criticalAlerts: alerts.filter((a) => !a.resolved && a.severity === 'critical').length,
    valueAtRisk: active
      .filter((b) => b.urgency === 'CRITICAL')
      .reduce((sum, b) => sum + b.weightKg * PRODUCE[b.produceType].mandiPricePerKg, 0),
  };
}
