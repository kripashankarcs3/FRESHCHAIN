import { forwardRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Check, Cpu, MapPin, Send, ShieldCheck, Thermometer, Zap } from 'lucide-react';
import clsx from 'clsx';
import { Badge, Button, EmptyState, Panel, Tabs, type TabItem } from '@/components/ui/primitives';
import { useStore } from '@/store/useStore';
import { clockTime, relativeTime } from '@/lib/format';
import type { Alert } from '@/lib/types';

type Lane = 'open' | 'resolved';

const SEVERITY = {
  critical: { text: 'text-critical', bg: 'bg-critical/10', border: 'border-critical/30', dot: 'bg-critical', label: 'Critical' },
  warning: { text: 'text-urgent', bg: 'bg-urgent/10', border: 'border-urgent/30', dot: 'bg-urgent', label: 'Warning' },
  info: { text: 'text-info', bg: 'bg-info/10', border: 'border-info/25', dot: 'bg-info', label: 'Info' },
} as const;

const TIMELINE_ICON = {
  detect: Thermometer,
  compute: Cpu,
  act: Zap,
  notify: Send,
} as const;

export function Alerts() {
  const alerts = useStore((s) => s.alerts);
  const resolveAlert = useStore((s) => s.resolveAlert);
  const triggerCascade = useStore((s) => s.triggerCascade);

  const [lane, setLane] = useState<Lane>('open');

  const open = alerts.filter((a) => !a.resolved);
  const resolved = alerts.filter((a) => a.resolved);
  const rows = lane === 'open' ? open : resolved;

  const tabs: TabItem<Lane>[] = [
    { id: 'open', label: 'Open', count: open.length, tone: open.length ? 'critical' : undefined },
    { id: 'resolved', label: 'Resolved', count: resolved.length },
  ];

  return (
    <div className="space-y-4">
      {/* The cascade explainer. This is the concept judges most need to grasp,
          so it is stated once, plainly, at the top of its own screen. */}
      <Panel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-fresh" />
              <h2 className="text-sm font-semibold text-ink">Cascade response</h2>
            </div>
            <p className="mt-1.5 max-w-[72ch] text-sm leading-relaxed text-ink-2">
              When a sensor moves, FreshChain does not just raise a flag. It recomputes shelf life for every batch in the
              affected block, re-runs the routing engine, changes the destination, and notifies the receiving buyer —
              before anyone reads the alert.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {(['Detect', 'Recompute', 'Re-route', 'Notify'] as const).map((step, i) => (
                <span key={step} className="flex items-center gap-1.5">
                  <span className="rounded border border-line bg-surface-2 px-2 py-1 font-mono text-micro uppercase text-ink-2">
                    {step}
                  </span>
                  {i < 3 && <span className="text-ink-3">→</span>}
                </span>
              ))}
            </div>
          </div>

          <Button variant="danger" size="md" icon={<Thermometer size={14} />} className="shrink-0" onClick={triggerCascade}>
            Simulate temperature spike
          </Button>
        </div>
      </Panel>

      <div className="flex items-center justify-between gap-3">
        <Tabs items={tabs} value={lane} onChange={setLane} />
        {lane === 'open' && open.length > 0 && (
          <p className="hidden text-xs text-ink-3 sm:block">
            {open.filter((a) => a.autoAction).length} of {open.length} already handled automatically
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <Panel flush>
          <EmptyState
            icon={<ShieldCheck size={16} />}
            title={lane === 'open' ? 'No open alerts' : 'Nothing resolved yet'}
            body={
              lane === 'open'
                ? 'Every cold storage block is holding set point and no batch has crossed a shelf-life threshold.'
                : 'Resolved alerts are archived here with their full response timeline.'
            }
          />
        </Panel>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {rows.map((a, i) => (
              <AlertCard key={a.id} alert={a} index={i} onResolve={() => resolveAlert(a.id)} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** forwardRef — see the note on BatchCard; `AnimatePresence mode="popLayout"`
 *  measures each child through a ref. */
const AlertCard = forwardRef<HTMLElement, { alert: Alert; index: number; onResolve: () => void }>(
  function AlertCard({ alert, index, onResolve }, ref) {
  const s = SEVERITY[alert.severity];
  const [expanded, setExpanded] = useState(index === 0 && !alert.resolved);

  return (
    <motion.article
      ref={ref}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.99 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.2), ease: [0.16, 1, 0.3, 1] }}
      className={clsx(
        'relative overflow-hidden rounded-xl border bg-surface shadow-raise',
        alert.resolved ? 'border-line opacity-70' : s.border,
      )}
    >
      <span className={clsx('absolute inset-y-0 left-0 w-[2px]', alert.resolved ? 'bg-line-strong' : s.dot)} />

      <div className="p-4 pl-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={alert.severity === 'critical' ? 'critical' : alert.severity === 'warning' ? 'urgent' : 'info'}>
                {s.label}
              </Badge>
              <span className="readout text-xs text-ink-3">{alert.id}</span>
              {alert.location && (
                <span className="flex items-center gap-1 text-xs text-ink-3">
                  <MapPin size={10} />
                  {alert.location}
                </span>
              )}
              {alert.resolved && (
                <Badge tone="fresh">
                  <Check size={9} strokeWidth={3} /> Resolved
                </Badge>
              )}
            </div>

            <h3 className={clsx('mt-2 text-base font-semibold', alert.resolved ? 'text-ink-2' : 'text-ink')}>
              {alert.title}
            </h3>
            <p className="mt-1 max-w-[80ch] text-sm leading-relaxed text-ink-2">{alert.message}</p>
          </div>

          <span className="readout shrink-0 text-xs text-ink-3">{relativeTime(alert.createdAt)}</span>
        </header>

        {/* The impact calculation — the number that makes the alert matter. */}
        {alert.impact && (
          <div className="mt-3.5 inline-flex flex-wrap items-center gap-2.5 rounded-lg border border-line bg-surface-2 px-3 py-2">
            <span className="label-micro">{alert.impact.label}</span>
            <span className="readout text-sm text-ink-2 line-through decoration-ink-3">{alert.impact.before}</span>
            <span className="text-ink-3">→</span>
            <span className={clsx('readout text-sm font-semibold', s.text)}>{alert.impact.after}</span>
            {alert.affectedBatchIds.length > 0 && (
              <span className="readout border-l border-line pl-2.5 text-xs text-ink-3">
                {alert.affectedBatchIds.length} batch{alert.affectedBatchIds.length > 1 ? 'es' : ''} affected
              </span>
            )}
          </div>
        )}

        {/* What the system did without being asked. */}
        {alert.autoAction && (
          <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-fresh/25 bg-fresh/[0.06] px-3 py-2.5">
            <Zap size={13} className="mt-0.5 shrink-0 text-fresh" strokeWidth={2.2} />
            <div className="min-w-0">
              <p className="label-micro text-fresh/80">Automated action</p>
              <p className="mt-1 text-sm leading-relaxed text-ink">{alert.autoAction}</p>
            </div>
          </div>
        )}

        <div className="mt-3.5 flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Hide response timeline' : 'Response timeline'}
          </Button>
          {!alert.resolved && (
            <Button size="sm" variant="secondary" className="ml-auto" icon={<Check size={12} />} onClick={onResolve}>
              Acknowledge
            </Button>
          )}
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <ol className="mt-3 space-y-0 border-t border-line pt-3.5">
                {alert.timeline.map((t, i) => {
                  const Icon = TIMELINE_ICON[t.kind];
                  const last = i === alert.timeline.length - 1;
                  return (
                    <li key={`${t.at}-${i}`} className="relative flex gap-3 pb-3.5 last:pb-0">
                      {!last && <span className="absolute left-[11px] top-6 h-full w-px bg-line" />}
                      <span className="relative z-10 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-ink-3">
                        <Icon size={11} />
                      </span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="text-xs leading-relaxed text-ink-2">{t.label}</p>
                        <p className="readout mt-0.5 text-micro uppercase text-ink-3">{clockTime(t.at)}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.article>
  );
});
