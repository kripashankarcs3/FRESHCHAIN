import { Suspense, lazy, useMemo } from 'react';
import { Download } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Badge, Button, Panel, PanelHeader, Skeleton } from '@/components/ui/primitives';
import { PRODUCE, PRODUCE_LIST } from '@/lib/produce';
import { formatINR, formatWeight } from '@/lib/format';
import type { Destination } from '@/lib/algorithms';

const DiversionChart = lazy(() => import('@/components/viz/Charts').then((m) => ({ default: m.DiversionChart })));

const DESTINATION_LABEL: Record<Destination, string> = {
  NGO_RESCUE: 'NGO Rescue',
  QUICK_COMMERCE: 'Quick Commerce',
  RETAIL_EXPORT: 'Retail & Export',
};

/**
 * Derived entirely from the live store — a batch scanned five minutes ago
 * shows up here immediately, not just on the dashboard.
 */
export function Reports() {
  const batches = useStore((s) => s.batches);

  const stats = useMemo(() => {
    const total = batches.length;
    const totalWeight = batches.reduce((s, b) => s + b.weightKg, 0);
    const totalValue = batches.reduce((s, b) => s + b.valueRecovered, 0);
    const avgFreshness = total ? batches.reduce((s, b) => s + b.freshnessScore, 0) / total : 0;
    const avgShelfLife = total ? batches.reduce((s, b) => s + b.shelfLifeDays, 0) / total : 0;
    const rescued = batches.filter((b) => b.destination === 'NGO_RESCUE').length;

    const byDestination = (['NGO_RESCUE', 'QUICK_COMMERCE', 'RETAIL_EXPORT'] as Destination[]).map((d) => {
      const rows = batches.filter((b) => b.destination === d);
      return {
        destination: d,
        label: DESTINATION_LABEL[d],
        count: rows.length,
        weight: rows.reduce((s, b) => s + b.weightKg, 0),
        pct: total ? Math.round((rows.length / total) * 100) : 0,
      };
    });

    const byProduce = PRODUCE_LIST.map((spec) => {
      const rows = batches.filter((b) => b.produceType === spec.id);
      return { spec, count: rows.length, weight: rows.reduce((s, b) => s + b.weightKg, 0) };
    })
      .filter((r) => r.count > 0)
      .sort((a, b) => b.weight - a.weight);

    return { total, totalWeight, totalValue, avgFreshness, avgShelfLife, rescued, byDestination, byProduce };
  }, [batches]);

  function exportCsv() {
    const header = [
      'Batch ID',
      'Produce',
      'Weight (kg)',
      'Grade',
      'Freshness',
      'Shelf Life (days)',
      'Destination',
      'Facility',
      'Price/kg',
      'Value Recovered',
      'Status',
      'Created At',
    ];
    const rows = batches.map((b) => [
      b.id,
      PRODUCE[b.produceType].label,
      b.weightKg,
      b.grade,
      b.freshnessScore,
      b.shelfLifeDays,
      DESTINATION_LABEL[b.destination],
      b.facility,
      b.suggestedPricePerKg,
      b.valueRecovered,
      b.status,
      b.createdAt,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `freshchain-batches-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">Operational report</h2>
            <p className="mt-1 text-xs text-ink-3">
              {stats.total} batches on record · Ghaziabad node · generated {new Date().toLocaleDateString('en-IN')}
            </p>
          </div>
          <Button variant="secondary" size="md" icon={<Download size={14} />} onClick={exportCsv}>
            Export CSV
          </Button>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total batches" value={stats.total.toString()} />
        <Stat label="Total weight" value={formatWeight(stats.totalWeight)} />
        <Stat label="Value recovered" value={formatINR(stats.totalValue)} tone="fresh" />
        <Stat label="Rescued" value={`${stats.rescued} batches`} tone={stats.rescued > 0 ? 'critical' : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Panel>
          <PanelHeader title="Waste diverted" hint="Tonnes routed to a viable channel vs. tonnes lost to spoilage, last 14 days" />
          <div className="mt-4">
            <Suspense fallback={<Skeleton className="h-[200px] w-full" />}>
              <DiversionChart />
            </Suspense>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="By channel" hint="Share of all recorded batches" />
          <div className="mt-4 space-y-3">
            {stats.byDestination.map((d) => (
              <div key={d.destination}>
                <div className="mb-1.5 flex items-baseline justify-between text-xs">
                  <span className="text-ink-2">{d.label}</span>
                  <span className="readout text-ink-3">
                    {d.count} · {formatWeight(d.weight)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full rounded-full bg-fresh"
                    style={{
                      width: `${d.pct}%`,
                      background:
                        d.destination === 'NGO_RESCUE'
                          ? 'var(--critical)'
                          : d.destination === 'QUICK_COMMERCE'
                            ? 'var(--urgent)'
                            : 'var(--fresh)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel flush>
        <div className="p-4">
          <PanelHeader title="Produce mix" hint="Every crop recorded at this node, heaviest first" />
        </div>
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[520px] text-left">
            <thead>
              <tr className="border-b border-line">
                {['Produce', 'Batches', 'Weight', 'Share'].map((h) => (
                  <th key={h} className="label-micro whitespace-nowrap px-4 py-2.5 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {stats.byProduce.map((row) => (
                <tr key={row.spec.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-sm text-ink">
                    {row.spec.emoji} {row.spec.label}
                  </td>
                  <td className="readout whitespace-nowrap px-4 py-2.5 text-sm text-ink-2">{row.count}</td>
                  <td className="readout whitespace-nowrap px-4 py-2.5 text-sm text-ink-2">{formatWeight(row.weight)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <Badge tone="neutral">{Math.round((row.weight / (stats.totalWeight || 1)) * 100)}%</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'fresh' | 'critical' }) {
  return (
    <Panel>
      <p className="label-micro">{label}</p>
      <p
        className={
          'readout mt-2 text-2xl font-semibold leading-none ' +
          (tone === 'fresh' ? 'text-fresh' : tone === 'critical' ? 'text-critical' : 'text-ink')
        }
      >
        {value}
      </p>
    </Panel>
  );
}
