import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutGrid, PackageSearch, Rows3, ScanLine, Search } from 'lucide-react';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { Badge, Button, EmptyState, Panel, Tabs, UrgencyPill, type TabItem } from '@/components/ui/primitives';
import { BatchCard } from '@/components/batch/BatchCard';
import { ShelfLifeBar } from '@/components/viz/ShelfLifeBar';
import { isActive, useStore } from '@/store/useStore';
import { PRODUCE } from '@/lib/produce';
import { formatDays, formatINR, formatWeight, relativeTime, shortDate } from '@/lib/format';
import type { Urgency } from '@/lib/algorithms';

type Filter = 'ALL' | Urgency;
type View = 'grid' | 'table';
type Sort = 'urgency' | 'value' | 'newest';

export function Routing() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const batches = useStore((s) => s.batches);
  const acceptRoute = useStore((s) => s.acceptRoute);

  const filter = (params.get('filter') as Filter) || 'ALL';
  const [view, setView] = useState<View>('grid');
  const [sort, setSort] = useState<Sort>('urgency');
  const [query, setQuery] = useState('');

  const active = useMemo(() => batches.filter(isActive), [batches]);

  const counts = useMemo(
    () => ({
      ALL: active.length,
      CRITICAL: active.filter((b) => b.urgency === 'CRITICAL').length,
      HIGH: active.filter((b) => b.urgency === 'HIGH').length,
      NORMAL: active.filter((b) => b.urgency === 'NORMAL').length,
    }),
    [active],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const order: Record<Urgency, number> = { CRITICAL: 0, HIGH: 1, NORMAL: 2 };

    return active
      .filter((b) => filter === 'ALL' || b.urgency === filter)
      .filter(
        (b) =>
          !q ||
          b.id.toLowerCase().includes(q) ||
          PRODUCE[b.produceType].label.toLowerCase().includes(q) ||
          b.facility.toLowerCase().includes(q) ||
          b.destinationLabel.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        if (sort === 'value') return b.weightKg * b.suggestedPricePerKg - a.weightKg * a.suggestedPricePerKg;
        if (sort === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        return order[a.urgency] - order[b.urgency] || a.shelfLifeDays - b.shelfLifeDays;
      });
  }, [active, filter, query, sort]);

  const tabs: TabItem<Filter>[] = [
    { id: 'ALL', label: 'All', count: counts.ALL },
    { id: 'CRITICAL', label: 'Critical', count: counts.CRITICAL, tone: 'critical' },
    { id: 'HIGH', label: 'Urgent', count: counts.HIGH, tone: 'urgent' },
    { id: 'NORMAL', label: 'Fresh', count: counts.NORMAL, tone: 'fresh' },
  ];

  const pendingCount = rows.filter((b) => b.status === 'pending').length;

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs items={tabs} value={filter} onChange={(id) => setParams(id === 'ALL' ? {} : { filter: id })} />

          <div className="flex items-center gap-2">
            <div className="relative flex-1 lg:w-60">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Batch ID, produce, facility…"
                className="h-9 w-full rounded-md border border-line bg-surface-2 pl-8 pr-2.5 text-sm text-ink placeholder:text-ink-3 focus:border-fresh/60 focus:outline-none focus:ring-1 focus:ring-fresh/25"
              />
            </div>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="h-9 shrink-0 cursor-pointer rounded-md border border-line bg-surface-2 px-2.5 text-sm text-ink-2 focus:border-fresh/60 focus:outline-none"
            >
              <option value="urgency">Sort: urgency</option>
              <option value="value">Sort: lot value</option>
              <option value="newest">Sort: newest</option>
            </select>

            <div className="hidden shrink-0 items-center rounded-md border border-line bg-surface-2 p-0.5 sm:flex">
              {([
                ['grid', LayoutGrid],
                ['table', Rows3],
              ] as const).map(([id, Icon]) => (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  aria-label={`${id} view`}
                  className={clsx(
                    'rounded p-1.5 transition-colors',
                    view === id ? 'bg-surface-3 text-ink' : 'text-ink-3 hover:text-ink-2',
                  )}
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {pendingCount > 0 && (
          <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
            <Badge tone="info">{pendingCount} awaiting acceptance</Badge>
            <p className="text-xs text-ink-3">Accepting a route notifies the receiving facility and locks the price.</p>
          </div>
        )}
      </Panel>

      {rows.length === 0 ? (
        <Panel flush>
          <EmptyState
            icon={<PackageSearch size={16} />}
            title={query ? 'No batches match that search' : 'Nothing in this lane'}
            body={
              query
                ? 'Try a batch ID, a produce name, or the receiving facility.'
                : 'No active batch currently sits in this urgency band. Scan new intake to populate it.'
            }
            action={
              query ? (
                <Button size="sm" variant="secondary" onClick={() => setQuery('')}>
                  Clear search
                </Button>
              ) : (
                <Button size="sm" variant="secondary" icon={<ScanLine size={13} />} onClick={() => navigate('/scan')}>
                  Scan a batch
                </Button>
              )
            }
          />
        </Panel>
      ) : view === 'grid' ? (
        <motion.div layout className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {rows.map((b, i) => (
              <BatchCard key={b.id} batch={b} index={i} onAccept={acceptRoute} />
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <Panel flush className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left">
              <thead>
                <tr className="border-b border-line">
                  {['Batch', 'Produce', 'Weight', 'Harvested', 'Shelf life', 'Destination', 'Rate', 'Status'].map((h) => (
                    <th key={h} className="label-micro whitespace-nowrap px-4 py-2.5 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((b) => {
                  const spec = PRODUCE[b.produceType];
                  return (
                    <tr key={b.id} className="transition-colors hover:bg-surface-2">
                      <td className="readout whitespace-nowrap px-4 py-2.5 text-xs text-ink-2">{b.id}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-sm text-ink">
                        {spec.emoji} {spec.label}
                      </td>
                      <td className="readout whitespace-nowrap px-4 py-2.5 text-sm text-ink-2">{formatWeight(b.weightKg)}</td>
                      <td className="readout whitespace-nowrap px-4 py-2.5 text-xs text-ink-3">{shortDate(b.harvestDate)}</td>
                      <td className="w-40 px-4 py-2.5">
                        <ShelfLifeBar days={b.shelfLifeDays} baseLifeDays={spec.baseLifeDays} size="sm" animate={false} />
                        <span className="readout mt-1 block text-xs text-ink-3">{formatDays(b.shelfLifeDays)}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <p className="text-sm text-ink">{b.destinationLabel}</p>
                        <p className="truncate text-xs text-ink-3">{b.facility}</p>
                      </td>
                      <td className="readout whitespace-nowrap px-4 py-2.5 text-sm text-ink-2">
                        {formatINR(b.suggestedPricePerKg, true)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {b.status === 'pending' ? (
                          <Button size="sm" variant="secondary" onClick={() => acceptRoute(b.id)}>
                            Accept
                          </Button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <UrgencyPill urgency={b.urgency} />
                            <span className="readout text-xs text-ink-3">{relativeTime(b.createdAt)}</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
