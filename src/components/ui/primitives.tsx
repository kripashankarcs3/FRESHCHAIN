import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import clsx from 'clsx';
import type { Urgency } from '@/lib/algorithms';
import { URGENCY_STYLE } from '@/lib/urgencyStyle';

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  trailing?: ReactNode;
  loading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  // The one saturated surface in the app. Used at most once per screen.
  // Disabled drops it out of the accent entirely — a dimmed green still reads
  // as "press me", which is exactly the wrong signal.
  primary:
    'bg-fresh text-[#052b14] font-semibold hover:brightness-110 active:brightness-95 ' +
    'disabled:bg-surface-3 disabled:text-ink-3 disabled:border disabled:border-line',
  secondary:
    'bg-surface-3 text-ink border border-line-strong hover:bg-[#20252a] hover:border-[#39424a] disabled:opacity-40',
  ghost: 'text-ink-2 hover:text-ink hover:bg-surface-2 disabled:opacity-40',
  danger: 'bg-critical/12 text-critical border border-critical/35 hover:bg-critical/20 disabled:opacity-40',
};

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-md',
  lg: 'h-11 px-5 text-base gap-2 rounded-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, trailing, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'relative inline-flex items-center justify-center whitespace-nowrap transition-all duration-150',
        'disabled:cursor-not-allowed select-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
      {trailing}
    </button>
  );
});

function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-r-transparent opacity-70" />
  );
}

/* -------------------------------------------------------------------------- */
/* Panel — the only container. No nested cards anywhere in this app.           */
/* -------------------------------------------------------------------------- */

export function Panel({
  children,
  className,
  flush,
}: {
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={clsx('rounded-xl border border-line bg-surface shadow-raise', !flush && 'p-4', className)}>
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  hint,
  action,
  className,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={clsx('flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-ink-3">{hint}</p>}
      </div>
      {action}
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* Status vocabulary                                                           */
/* -------------------------------------------------------------------------- */

export function UrgencyPill({ urgency, className }: { urgency: Urgency; className?: string }) {
  const s = URGENCY_STYLE[urgency];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-micro uppercase',
        s.text,
        s.bg,
        s.border,
        className,
      )}
    >
      <span className={clsx('h-1 w-1 rounded-full', s.dot)} />
      {s.label}
    </span>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'fresh' | 'urgent' | 'critical' | 'info';
  className?: string;
}) {
  const tones = {
    neutral: 'text-ink-2 bg-surface-3 border-line-strong',
    fresh: 'text-fresh bg-fresh/10 border-fresh/25',
    urgent: 'text-urgent bg-urgent/10 border-urgent/25',
    critical: 'text-critical bg-critical/10 border-critical/30',
    info: 'text-info bg-info/10 border-info/25',
  };
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-micro uppercase',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function GradeBadge({ grade }: { grade: 'A' | 'B' | 'C' }) {
  const tone = grade === 'A' ? 'fresh' : grade === 'B' ? 'urgent' : 'critical';
  return (
    <Badge tone={tone} className="px-2 py-1 text-xs font-semibold tracking-normal">
      Grade {grade}
    </Badge>
  );
}

/* -------------------------------------------------------------------------- */
/* Form controls                                                               */
/* -------------------------------------------------------------------------- */

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label-micro mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

const CONTROL =
  'w-full h-9 rounded-md border border-line bg-surface-2 px-2.5 text-sm text-ink placeholder:text-ink-3 ' +
  'transition-colors hover:border-line-strong focus:border-fresh/60 focus:outline-none focus:ring-1 focus:ring-fresh/25';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={clsx(CONTROL, 'readout', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={clsx(CONTROL, 'cursor-pointer appearance-none pr-8', className)} {...rest}>
      {children}
    </select>
  );
});

/* -------------------------------------------------------------------------- */
/* Tabs                                                                        */
/* -------------------------------------------------------------------------- */

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
  tone?: 'fresh' | 'urgent' | 'critical';
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={clsx('no-scrollbar flex items-center gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1', className)}
    >
      {items.map((item) => {
        const active = item.id === value;
        const dot =
          item.tone === 'critical' ? 'bg-critical' : item.tone === 'urgent' ? 'bg-urgent' : item.tone === 'fresh' ? 'bg-fresh' : null;
        return (
          <button
            key={item.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={clsx(
              'relative flex shrink-0 items-center gap-1.5 rounded px-2.5 py-1.5 text-sm transition-colors',
              active ? 'bg-surface-3 text-ink' : 'text-ink-3 hover:text-ink-2',
            )}
          >
            {dot && <span className={clsx('h-1.5 w-1.5 rounded-full', dot)} />}
            {item.label}
            {item.count !== undefined && (
              <span className={clsx('readout text-xs', active ? 'text-ink-2' : 'text-ink-3')}>{item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty state                                                                 */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-3">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-ink-2">{title}</h3>
      <p className="mt-1 max-w-[36ch] text-balance text-xs leading-relaxed text-ink-3">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Skeleton                                                                    */
/* -------------------------------------------------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={clsx('relative overflow-hidden rounded bg-surface-2', className)}>
      <div className="absolute inset-0 -translate-x-full animate-sweep bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Key/value readout row — used in every detail panel                          */
/* -------------------------------------------------------------------------- */

export function Readout({
  label,
  value,
  tone,
  mono = true,
}: {
  label: string;
  value: ReactNode;
  tone?: 'fresh' | 'urgent' | 'critical' | 'default';
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="label-micro shrink-0">{label}</span>
      <span
        className={clsx(
          'truncate text-right text-sm',
          mono && 'readout',
          tone === 'fresh' && 'text-fresh',
          tone === 'urgent' && 'text-urgent',
          tone === 'critical' && 'text-critical',
          (!tone || tone === 'default') && 'text-ink',
        )}
      >
        {value}
      </span>
    </div>
  );
}
