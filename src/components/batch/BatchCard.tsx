import { motion } from 'framer-motion';
import { ArrowRight, CornerDownRight, MapPin, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { PRODUCE } from '@/lib/produce';
import { formatDays, formatINR, formatWeight, relativeTime } from '@/lib/format';
import { Badge, Button, UrgencyPill } from '@/components/ui/primitives';
import { URGENCY_STYLE } from '@/lib/urgencyStyle';
import { ShelfLifeBar } from '@/components/viz/ShelfLifeBar';
import type { Batch } from '@/lib/types';

/**
 * The batch card. Reads top-to-bottom as: what it is → how long it has →
 * where it goes → what to do. That order matches how a supervisor actually
 * triages, so the card needs no legend.
 */
export function BatchCard({
  batch,
  onAccept,
  index = 0,
}: {
  batch: Batch;
  onAccept?: (id: string) => void;
  index?: number;
}) {
  const spec = PRODUCE[batch.produceType];
  const style = URGENCY_STYLE[batch.urgency];

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: Math.min(index * 0.03, 0.24), ease: [0.16, 1, 0.3, 1] }}
      className={clsx(
        'group relative overflow-hidden rounded-xl border bg-surface p-3.5 shadow-raise transition-colors',
        'hover:border-line-strong',
        batch.urgency === 'CRITICAL' ? 'border-critical/25' : 'border-line',
      )}
    >
      {/* Urgency rail — 2px of colour carries the whole triage signal. */}
      <span className={clsx('absolute inset-y-0 left-0 w-[2px]', style.dot)} />

      <header className="flex items-start justify-between gap-3 pl-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base leading-none">{spec.emoji}</span>
            <h3 className="truncate text-sm font-semibold text-ink">{spec.label}</h3>
            <span className="readout shrink-0 text-xs text-ink-3">{formatWeight(batch.weightKg)}</span>
          </div>
          <p className="readout mt-1 text-xs text-ink-3">
            {batch.id} · {batch.coldStorageBlock} · {relativeTime(batch.createdAt)}
          </p>
        </div>
        <UrgencyPill urgency={batch.urgency} />
      </header>

      <div className="mt-3.5 pl-2">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="label-micro">Shelf life</span>
          <span className={clsx('readout text-sm font-medium', style.text)}>{formatDays(batch.shelfLifeDays)}</span>
        </div>
        <ShelfLifeBar days={batch.shelfLifeDays} baseLifeDays={spec.baseLifeDays} />
      </div>

      <div className="mt-3.5 space-y-2 rounded-lg border border-line bg-surface-2 p-2.5">
        <div className="flex items-center gap-2 text-sm">
          <ArrowRight size={13} className={clsx('shrink-0', style.text)} strokeWidth={2.2} />
          <span className="font-medium text-ink">{batch.destinationLabel}</span>
          <span className="readout ml-auto shrink-0 text-xs text-ink-2">
            {formatINR(batch.suggestedPricePerKg, true)}/kg
          </span>
        </div>
        <p className="flex items-start gap-1.5 text-xs text-ink-3">
          <MapPin size={11} className="mt-0.5 shrink-0" />
          <span className="truncate">{batch.facility}</span>
        </p>

        {batch.rerouted && (
          <p className="flex items-start gap-1.5 border-t border-line pt-2 text-xs text-urgent">
            <CornerDownRight size={11} className="mt-0.5 shrink-0" />
            <span>Auto-rerouted — {batch.rerouted.reason}</span>
          </p>
        )}
      </div>

      <p className="mt-3 flex items-start gap-1.5 pl-2 text-xs leading-relaxed text-ink-2">
        <Sparkles size={11} className="mt-[3px] shrink-0 text-ink-3" />
        <span className="line-clamp-2">{batch.recommendation}</span>
      </p>

      <footer className="mt-3.5 flex items-center gap-2 pl-2">
        {batch.status === 'pending' && onAccept ? (
          <Button
            size="sm"
            variant={batch.urgency === 'CRITICAL' ? 'danger' : 'secondary'}
            className="flex-1"
            onClick={() => onAccept(batch.id)}
          >
            Accept route
          </Button>
        ) : (
          <Badge tone={batch.status === 'claimed' ? 'fresh' : 'neutral'}>
            {batch.status === 'routed'
              ? 'Routed'
              : batch.status === 'listed'
                ? 'On rescue board'
                : batch.status === 'claimed'
                  ? 'Claimed'
                  : 'Delivered'}
          </Badge>
        )}
        <span className="readout ml-auto text-xs text-ink-3">Grade {batch.grade}</span>
      </footer>
    </motion.article>
  );
}
