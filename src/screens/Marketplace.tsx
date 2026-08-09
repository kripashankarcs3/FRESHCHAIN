import { forwardRef, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Clock, HeartHandshake, MapPin, PackageOpen, Truck } from 'lucide-react';
import clsx from 'clsx';
import { Badge, Button, EmptyState, Panel, Tabs, type TabItem } from '@/components/ui/primitives';
import { ShelfLifeBar } from '@/components/viz/ShelfLifeBar';
import { useStore } from '@/store/useStore';
import { PRODUCE } from '@/lib/produce';
import { formatDays, formatINR, formatWeight, relativeTime } from '@/lib/format';
import type { BuyerType, Listing } from '@/lib/types';

type Lane = 'available' | 'free' | 'claimed';

const CLAIMANTS: Record<BuyerType, string> = {
  NGO: 'Robin Hood Army — Ghaziabad Chapter',
  'Dark Store': 'Dark Store — Indirapuram Hub',
  Canteen: 'Anna Kshetra Community Kitchen, Loni',
  Processor: 'Ghaziabad Pulp & Puree Unit',
};

export function Marketplace() {
  const listings = useStore((s) => s.listings);
  const claimListing = useStore((s) => s.claimListing);
  const [lane, setLane] = useState<Lane>('available');

  const available = listings.filter((l) => !l.claimed);
  const free = available.filter((l) => l.free);
  const claimed = listings.filter((l) => l.claimed);

  const rows = lane === 'available' ? available : lane === 'free' ? free : claimed;

  const stats = useMemo(() => {
    const rescuedKg = claimed.reduce((s, l) => s + l.weightKg, 0);
    const availableKg = available.reduce((s, l) => s + l.weightKg, 0);
    const mealsEquivalent = Math.round(rescuedKg * 2.4);
    return { rescuedKg, availableKg, mealsEquivalent };
  }, [claimed, available]);

  const tabs: TabItem<Lane>[] = [
    { id: 'available', label: 'Available', count: available.length, tone: 'urgent' },
    { id: 'free', label: 'Free for NGOs', count: free.length, tone: 'critical' },
    { id: 'claimed', label: 'Claimed', count: claimed.length, tone: 'fresh' },
  ];

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <HeartHandshake size={14} className="text-fresh" />
              <h2 className="text-sm font-semibold text-ink">Last stop before the landfill</h2>
            </div>
            <p className="mt-1.5 max-w-[74ch] text-sm leading-relaxed text-ink-2">
              Every batch the routing engine marks critical lands here automatically. NGOs, community kitchens and dark
              stores within 15 km see it the moment it is listed. Under 24 hours of shelf life, it goes out free.
            </p>
          </div>

          <div className="grid shrink-0 grid-cols-3 gap-3 lg:w-[380px]">
            <Stat label="Rescued" value={formatWeight(stats.rescuedKg)} tone="fresh" />
            <Stat label="On the board" value={formatWeight(stats.availableKg)} tone="urgent" />
            <Stat label="Meals equiv." value={stats.mealsEquivalent.toLocaleString('en-IN')} tone="neutral" />
          </div>
        </div>
      </Panel>

      <Tabs items={tabs} value={lane} onChange={setLane} className="w-fit" />

      {rows.length === 0 ? (
        <Panel flush>
          <EmptyState
            icon={<PackageOpen size={16} />}
            title={lane === 'claimed' ? 'Nothing claimed yet' : 'Board is clear'}
            body={
              lane === 'claimed'
                ? 'Claimed batches appear here with the buyer and pickup window.'
                : 'No batch is currently inside the rescue window. That is the goal — this board being empty means nothing is about to spoil.'
            }
          />
        </Panel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {rows.map((l, i) => (
              <ListingCard
                key={l.id}
                listing={l}
                index={i}
                onClaim={() => claimListing(l.id, CLAIMANTS[l.buyerTypes[0]] ?? CLAIMANTS.NGO)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Stat({ label, value, tone }: { label: string; value: string; tone: 'fresh' | 'urgent' | 'neutral' }) {
  const colour = tone === 'fresh' ? 'text-fresh' : tone === 'urgent' ? 'text-urgent' : 'text-ink';
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-2.5">
      <p className="label-micro">{label}</p>
      <p className={clsx('readout mt-1.5 text-lg font-semibold leading-none', colour)}>{value}</p>
    </div>
  );
}

/** forwardRef — see the note on BatchCard; `AnimatePresence mode="popLayout"`
 *  measures each child through a ref. */
const ListingCard = forwardRef<HTMLElement, { listing: Listing; index: number; onClaim: () => void }>(
  function ListingCard({ listing, index, onClaim }, ref) {
  const spec = PRODUCE[listing.produceType];
  const critical = listing.daysLeft <= 1;

  return (
    <motion.article
      ref={ref}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.035, 0.2), ease: [0.16, 1, 0.3, 1] }}
      className={clsx(
        'relative overflow-hidden rounded-xl border bg-surface p-3.5 shadow-raise transition-colors',
        listing.claimed ? 'border-line opacity-75' : critical ? 'border-critical/30' : 'border-line hover:border-line-strong',
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base leading-none">{spec.emoji}</span>
            <h3 className="truncate text-sm font-semibold text-ink">{spec.label}</h3>
          </div>
          <p className="readout mt-1 text-xs text-ink-3">
            {listing.batchId} · listed {relativeTime(listing.createdAt)}
          </p>
        </div>
        {listing.free ? (
          <Badge tone="critical">Free · NGO</Badge>
        ) : (
          <Badge tone="urgent">
            <Clock size={9} /> {formatDays(listing.daysLeft)}
          </Badge>
        )}
      </header>

      <div className="mt-3.5">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="label-micro">Time remaining</span>
          <span className={clsx('readout text-xs', critical ? 'text-critical' : 'text-urgent')}>
            {formatDays(listing.daysLeft)}
          </span>
        </div>
        <ShelfLifeBar days={listing.daysLeft} baseLifeDays={spec.baseLifeDays} showTicks={false} />
      </div>

      <dl className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-lg border border-line bg-surface-2 p-2.5">
        <Cell label="Quantity" value={formatWeight(listing.weightKg)} />
        <Cell
          label="Price"
          value={listing.free ? 'Free' : `${formatINR(listing.pricePerKg, true)}/kg`}
          tone={listing.free ? 'fresh' : undefined}
        />
        <Cell label="Lot value" value={listing.free ? '—' : formatINR(listing.pricePerKg * listing.weightKg)} />
        <Cell label="Distance" value={`${listing.distanceKm} km`} />
      </dl>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-3">
        <MapPin size={11} className="shrink-0" />
        <span className="truncate">{listing.location}</span>
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {listing.buyerTypes.map((t) => (
          <Badge key={t} tone="neutral">
            {t}
          </Badge>
        ))}
      </div>

      <footer className="mt-3.5 border-t border-line pt-3">
        {listing.claimed ? (
          <div className="flex items-start gap-2">
            <Check size={13} className="mt-0.5 shrink-0 text-fresh" strokeWidth={2.6} />
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink">Claimed</p>
              <p className="truncate text-xs text-ink-3">{listing.claimedBy}</p>
            </div>
            <Badge tone="fresh" className="ml-auto shrink-0">
              <Truck size={9} /> Pickup set
            </Badge>
          </div>
        ) : (
          /* Claiming is the good outcome, so it always gets the affirmative
             button — the urgency is already carried by the bar and the badge. */
          <Button variant="primary" size="md" className="w-full" onClick={onClaim}>
            {listing.free ? 'Claim free — NGO' : 'Claim this batch'}
          </Button>
        )}
      </footer>
    </motion.article>
  );
});

function Cell({ label, value, tone }: { label: string; value: string; tone?: 'fresh' }) {
  return (
    <div>
      <dt className="label-micro">{label}</dt>
      <dd className={clsx('readout mt-1 text-sm', tone === 'fresh' ? 'text-fresh' : 'text-ink')}>{value}</dd>
    </div>
  );
}
