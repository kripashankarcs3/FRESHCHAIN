import { AnimatePresence, motion } from 'framer-motion';
import { Check, TriangleAlert, X, Zap } from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '@/store/useStore';

const TONE = {
  fresh: { icon: Check, colour: 'text-fresh', ring: 'border-fresh/30' },
  urgent: { icon: Zap, colour: 'text-urgent', ring: 'border-urgent/30' },
  critical: { icon: TriangleAlert, colour: 'text-critical', ring: 'border-critical/35' },
  neutral: { icon: Check, colour: 'text-ink-2', ring: 'border-line-strong' },
} as const;

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);

  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2 lg:bottom-5 lg:right-5">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const { icon: Icon, colour, ring } = TONE[t.tone];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 24, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 16, scale: 0.97 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className={clsx(
                'pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-surface-2 p-3 shadow-pop',
                ring,
              )}
            >
              <Icon size={15} strokeWidth={2.2} className={clsx('mt-0.5 shrink-0', colour)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{t.title}</p>
                {t.detail && <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{t.detail}</p>}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="shrink-0 rounded p-0.5 text-ink-3 transition-colors hover:text-ink"
              >
                <X size={13} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
