import clsx from 'clsx';
import { motion } from 'framer-motion';
import { urgencyOf } from '@/lib/algorithms';

/** Days the bar spans. Capped at 10 — beyond that the distinction stops
 *  mattering operationally, and a 60-day onion would flatten every other bar. */
const scaleFor = (baseLifeDays: number) => Math.min(baseLifeDays, 10);

/**
 * The product's signature object.
 *
 * A segmented decay meter showing days of life remaining against the crop's
 * full shelf life. It appears on every batch on every screen, at three sizes —
 * one repeated, meaningful object instead of scattered decoration. The two tick
 * marks are the routing thresholds (2 days and 5 days), so an operator can see
 * *why* a batch sits in the channel it does without reading a single word.
 */
export function ShelfLifeBar({
  days,
  baseLifeDays,
  size = 'md',
  showTicks = true,
  animate = true,
  className,
}: {
  days: number;
  baseLifeDays: number;
  size?: 'sm' | 'md' | 'lg';
  showTicks?: boolean;
  animate?: boolean;
  className?: string;
}) {
  const scale = scaleFor(baseLifeDays);
  const pct = Math.max(0, Math.min(100, (days / scale) * 100));
  const urgency = urgencyOf(days);

  const fill =
    urgency === 'CRITICAL' ? 'var(--critical)' : urgency === 'HIGH' ? 'var(--urgent)' : 'var(--fresh)';

  const height = size === 'sm' ? 'h-1' : size === 'lg' ? 'h-2.5' : 'h-1.5';

  return (
    <div className={clsx('relative w-full', className)}>
      <div className={clsx('relative w-full overflow-hidden rounded-full bg-surface-3', height)}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: fill }}
          initial={animate ? { width: 0 } : false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        />
        {/* A critical bar breathes. Nothing else in the app animates on idle. */}
        {urgency === 'CRITICAL' && days > 0 && (
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ background: fill, width: `${pct}%` }}
            animate={{ opacity: [0.55, 1, 0.55] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </div>

      {showTicks && (
        <div className="pointer-events-none absolute inset-0">
          {[2, 5].map((tick) =>
            tick < scale ? (
              <span
                key={tick}
                className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-canvas/80"
                style={{ left: `${(tick / scale) * 100}%` }}
              />
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Axis labels for the bar above. Positioned by the same scale maths as the
 * ticks, so "rescue 2d" always sits exactly on the 2-day tick rather than
 * being evenly spread and quietly lying about where the thresholds are.
 */
export function ShelfLifeScale({ baseLifeDays }: { baseLifeDays: number }) {
  const scale = scaleFor(baseLifeDays);
  return (
    <div className="relative mt-1.5 h-3 select-none">
      <span className="label-micro absolute left-0">0</span>
      {[
        { at: 2, label: 'rescue' },
        { at: 5, label: 'quick' },
      ].map(({ at, label }) =>
        at < scale ? (
          <span
            key={label}
            className="label-micro absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${(at / scale) * 100}%` }}
          >
            {label} {at}d
          </span>
        ) : null,
      )}
      <span className="label-micro absolute right-0">{scale}d</span>
    </div>
  );
}
