import { Suspense, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  ClipboardCheck,
  CornerDownRight,
  HeartHandshake,
  Leaf,
  PackageCheck,
  ScanLine,
  TriangleAlert,
  Wind,
} from 'lucide-react';
import clsx from 'clsx';
import { useMetrics, useStore } from '@/store/useStore';
import { CountUp } from '@/components/ui/CountUp';
import { Button, EmptyState, Panel, PanelHeader, Skeleton, UrgencyPill } from '@/components/ui/primitives';
import { ShelfLifeBar } from '@/components/viz/ShelfLifeBar';
import { formatDays, formatINR, formatINRCompact, formatWeight, relativeTime } from '@/lib/format';
import { COLD_STORAGE_BLOCKS, PRODUCE } from '@/lib/produce';
import { seedSpikeTime, seedYesterday } from '@/data/seed';
import { lazyWithRetry } from '@/lib/lazyWithRetry';

const DiversionChart = lazyWithRetry(() =>
  import('@/components/viz/Charts').then((m) => ({ default: m.DiversionChart })),
);
const ColdChainChart = lazyWithRetry(() =>
  import('@/components/viz/Charts').then((m) => ({ default: m.ColdChainChart })),
);

export function Dashboard() {
  const navigate = useNavigate();
  const m = useMetrics();
  const batches = useStore((s) => s.batches);
  const alerts = useStore((s) => s.alerts);
  const activity = useStore((s) => s.activity);

  // Only batches an operator still has to act on — anything already on the
  // rescue board has had its decision made.
  const attention = batches
    .filter((b) => (b.status === 'pending' || b.status === 'routed') && b.urgency !== 'NORMAL')
    .sort((a, b) => a.shelfLifeDays - b.shelfLifeDays)
    .slice(0, 5);

  const openAlerts = alerts.filter((a) => !a.resolved);

  // Measured against yesterday's close, not written as a fixed string — these
  // have to move when the operator scans a batch, or they are decoration.
  const tonnesDeltaPct = seedYesterday.tonnes
    ? ((m.tonnesSaved - seedYesterday.tonnes) / seedYesterday.tonnes) * 100
    : 0;
  const valueDelta = m.valueRecovered - seedYesterday.recovered;
  // Sign off the *rounded* figure, otherwise a delta of −0.3% renders as the
  // nonsense "−0%".
  const signOf = (n: number, rounded: number) => (rounded === 0 ? '' : n >= 0 ? '+' : '−');
  const tonnesDeltaRounded = Math.round(tonnesDeltaPct);

  return (
    <div className="space-y-4">
      {/* Row 1 — the four numbers that justify the product's existence.        */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric
          label="Produce saved"
          value={<CountUp value={m.tonnesSaved} decimals={2} />}
          unit="tonnes"
          icon={<PackageCheck size={14} />}
          delta={`${signOf(tonnesDeltaPct, tonnesDeltaRounded)}${Math.abs(tonnesDeltaRounded)}% vs yesterday`}
          tone={tonnesDeltaPct >= 0 ? 'fresh' : 'neutral'}
        />
        <Metric
          label="Value recovered"
          value={<CountUp value={m.valueRecovered} format={(n) => formatINRCompact(n)} />}
          unit="today"
          icon={<ArrowUpRight size={14} />}
          delta={`${signOf(valueDelta, Math.round(valueDelta))}${formatINRCompact(Math.abs(valueDelta))} vs yesterday`}
          tone={valueDelta >= 0 ? 'fresh' : 'neutral'}
        />
        <Metric
          label="Batches routed"
          value={<CountUp value={m.batchesRouted} />}
          unit={`of ${batches.length} scanned`}
          icon={<ClipboardCheck size={14} />}
          delta={`${m.pending} awaiting decision`}
          tone="neutral"
        />
        <Metric
          label="CO₂ prevented"
          value={<CountUp value={m.co2Tonnes} decimals={1} />}
          unit="tonnes CO₂e"
          icon={<Wind size={14} />}
          delta="2.5 kg CO₂e per kg diverted"
          tone="fresh"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {/* Triage strip — the operational state of the floor in one line. */}
          <Panel>
            <PanelHeader
              title="Live inventory"
              hint={`${m.critical + m.high + m.normal} active batches across ${COLD_STORAGE_BLOCKS.length} cold storage blocks`}
              action={
                <Button size="sm" variant="ghost" onClick={() => navigate('/routing')}>
                  Open routing →
                </Button>
              }
            />
            <div className="mt-4 grid grid-cols-3 gap-3">
              <TriageTile
                label="Critical"
                sub="≤ 2 days · rescue now"
                count={m.critical}
                tone="critical"
                onClick={() => navigate('/routing?filter=CRITICAL')}
              />
              <TriageTile
                label="Urgent"
                sub="3–5 days · quick commerce"
                count={m.high}
                tone="urgent"
                onClick={() => navigate('/routing?filter=HIGH')}
              />
              <TriageTile
                label="Fresh"
                sub="6+ days · retail & export"
                count={m.normal}
                tone="fresh"
                onClick={() => navigate('/routing?filter=NORMAL')}
              />
            </div>

            {m.valueAtRisk > 0 && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-critical/25 bg-critical/[0.06] px-3 py-2.5">
                <TriangleAlert size={14} className="shrink-0 text-critical" />
                <p className="text-xs text-ink-2">
                  <span className="readout font-medium text-critical">{formatINR(m.valueAtRisk)}</span> of stock is inside
                  the 48-hour spoilage window and needs a routing decision today.
                </p>
                <Button size="sm" variant="danger" className="ml-auto shrink-0" onClick={() => navigate('/routing?filter=CRITICAL')}>
                  Triage
                </Button>
              </div>
            )}
          </Panel>

          {/* Trend — what the system has been doing over the fortnight.        */}
          <Panel>
            <PanelHeader
              title="Waste diverted"
              hint="Tonnes routed to a viable channel vs. tonnes lost to spoilage, last 14 days"
              action={
                <div className="hidden items-center gap-3 sm:flex">
                  <LegendKey colour="var(--fresh)" label="Diverted" />
                  <LegendKey colour="var(--critical)" label="Spoiled" />
                </div>
              }
            />
            <div className="mt-4">
              <Suspense fallback={<Skeleton className="h-[196px] w-full" />}>
                <DiversionChart />
              </Suspense>
            </div>
          </Panel>

          {/* Attention queue — the actual to-do list. */}
          <Panel flush>
            <div className="p-4">
              <PanelHeader
                title="Needs a decision"
                hint="Sorted by time remaining — the top row spoils first"
                action={
                  <Button size="sm" variant="ghost" onClick={() => navigate('/routing')}>
                    View all →
                  </Button>
                }
              />
            </div>
            {attention.length ? (
              <ul className="divide-y divide-line border-t border-line">
                {attention.map((b) => {
                  const spec = PRODUCE[b.produceType];
                  return (
                    <li
                      key={b.id}
                      className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2"
                      onClick={() => navigate('/routing')}
                    >
                      <span className="w-5 shrink-0 text-center text-sm">{spec.emoji}</span>
                      <div className="min-w-0 flex-[1.4]">
                        <p className="truncate text-sm text-ink">{spec.label}</p>
                        <p className="readout truncate text-xs text-ink-3">
                          {b.id} · {formatWeight(b.weightKg)}
                        </p>
                      </div>
                      <div className="hidden min-w-0 flex-1 sm:block">
                        <ShelfLifeBar days={b.shelfLifeDays} baseLifeDays={spec.baseLifeDays} size="sm" showTicks={false} />
                        <p className="readout mt-1 text-xs text-ink-3">{formatDays(b.shelfLifeDays)}</p>
                      </div>
                      <p className="hidden w-32 shrink-0 truncate text-xs text-ink-2 lg:block">{b.destinationLabel}</p>
                      <UrgencyPill urgency={b.urgency} className="shrink-0" />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="border-t border-line">
                <EmptyState
                  icon={<Leaf size={16} />}
                  title="Everything is routed"
                  body="No batch is inside the urgent window. New intake will appear here the moment it is scanned."
                  action={
                    <Button size="sm" variant="secondary" icon={<ScanLine size={13} />} onClick={() => navigate('/scan')}>
                      Scan a batch
                    </Button>
                  }
                />
              </div>
            )}
          </Panel>
        </div>

        {/* Right rail — alerts, cold chain, activity.                          */}
        <div className="space-y-4">
          <Panel flush>
            <div className="p-4">
              <PanelHeader
                title="Active alerts"
                hint={openAlerts.length ? `${openAlerts.length} open · ${m.criticalAlerts} critical` : 'All clear'}
                action={
                  <Button size="sm" variant="ghost" onClick={() => navigate('/alerts')}>
                    All →
                  </Button>
                }
              />
            </div>
            {openAlerts.length ? (
              <ul className="divide-y divide-line border-t border-line">
                {openAlerts.slice(0, 3).map((a) => (
                  <li
                    key={a.id}
                    onClick={() => navigate('/alerts')}
                    className="cursor-pointer px-4 py-3 transition-colors hover:bg-surface-2"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={clsx(
                          'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                          a.severity === 'critical' ? 'bg-critical' : a.severity === 'warning' ? 'bg-urgent' : 'bg-info',
                        )}
                      />
                      <div className="min-w-0">
                        <p className="text-sm leading-snug text-ink">{a.title}</p>
                        {a.autoAction && (
                          <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-fresh/90">
                            <CornerDownRight size={11} className="mt-0.5 shrink-0" />
                            <span className="line-clamp-2">{a.autoAction}</span>
                          </p>
                        )}
                        <p className="readout mt-1.5 text-xs text-ink-3">{relativeTime(a.createdAt)}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="border-t border-line">
                <EmptyState icon={<Leaf size={16} />} title="No open alerts" body="Cold chain is holding set point across all four blocks." />
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Cold storage" hint="Last 12 hours · °C by block" />
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <LegendKey colour="var(--info)" label="Block A" />
              <LegendKey colour="var(--urgent)" label="Block B" />
              <LegendKey colour="var(--critical)" label="Block C" />
              <LegendKey colour="var(--fresh)" label="Block D" />
            </div>
            <div className="mt-2">
              <Suspense fallback={<Skeleton className="h-[132px] w-full" />}>
                <ColdChainChart />
              </Suspense>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-3">
              Block C breached 24 °C at {seedSpikeTime} — the excursion that triggered the mango re-route.
            </p>
          </Panel>

          <Panel flush>
            <div className="p-4">
              <PanelHeader title="Activity" hint="Newest first" />
            </div>
            <ul className="max-h-[280px] divide-y divide-line overflow-y-auto border-t border-line">
              {activity.slice(0, 10).map((e) => (
                <li key={e.id} className="flex items-start gap-2.5 px-4 py-2.5">
                  <ActivityDot kind={e.kind} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-relaxed text-ink-2">{e.text}</p>
                    <p className="readout mt-0.5 text-micro uppercase text-ink-3">
                      {relativeTime(e.at)}
                      {e.meta ? ` · ${e.meta}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Metric({
  label,
  value,
  unit,
  icon,
  delta,
  tone,
}: {
  label: string;
  value: ReactNode;
  unit: string;
  icon: ReactNode;
  delta: string;
  tone: 'fresh' | 'neutral';
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-xl border border-line bg-surface p-3.5 shadow-raise"
    >
      <div className="flex items-center gap-2">
        <span
          className={clsx(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
            tone === 'fresh' ? 'bg-fresh/10 text-fresh' : 'bg-info/10 text-info',
          )}
        >
          {icon}
        </span>
        <span className="label-micro">{label}</span>
      </div>
      <p className="readout mt-2.5 text-3xl font-semibold leading-none text-ink">{value}</p>
      <p className="mt-1.5 text-xs text-ink-3">{unit}</p>
      <p className={clsx('mt-2.5 border-t border-line pt-2 text-xs', tone === 'fresh' ? 'text-fresh/85' : 'text-ink-3')}>
        {delta}
      </p>
    </motion.div>
  );
}

function TriageTile({
  label,
  sub,
  count,
  tone,
  onClick,
}: {
  label: string;
  sub: string;
  count: number;
  tone: 'critical' | 'urgent' | 'fresh';
  onClick: () => void;
}) {
  const colour = tone === 'critical' ? 'text-critical' : tone === 'urgent' ? 'text-urgent' : 'text-fresh';
  const bg = tone === 'critical' ? 'bg-critical' : tone === 'urgent' ? 'bg-urgent' : 'bg-fresh';
  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden rounded-lg border border-line bg-surface-2 p-3 text-left transition-colors hover:border-line-strong hover:bg-surface-3"
    >
      <span className={clsx('absolute inset-x-0 top-0 h-[2px]', bg)} />
      <p className={clsx('readout text-2xl font-semibold leading-none', colour)}>{count}</p>
      <p className="mt-2 text-sm font-medium text-ink">{label}</p>
      <p className="mt-0.5 text-xs leading-snug text-ink-3">{sub}</p>
    </button>
  );
}

function ActivityDot({ kind }: { kind: string }) {
  const map: Record<string, { icon: ReactNode; colour: string }> = {
    scan: { icon: <ScanLine size={11} />, colour: 'text-info' },
    route: { icon: <PackageCheck size={11} />, colour: 'text-fresh' },
    alert: { icon: <TriangleAlert size={11} />, colour: 'text-urgent' },
    reroute: { icon: <TriangleAlert size={11} />, colour: 'text-critical' },
    claim: { icon: <HeartHandshake size={11} />, colour: 'text-fresh' },
  };
  const item = map[kind] ?? map.scan;
  return (
    <span className={clsx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-line bg-surface-2', item.colour)}>
      {item.icon}
    </span>
  );
}

function LegendKey({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-[2px] w-3 rounded-full" style={{ background: colour }} />
      <span className="label-micro">{label}</span>
    </span>
  );
}
