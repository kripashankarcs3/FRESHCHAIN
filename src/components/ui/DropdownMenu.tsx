import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';

/**
 * A small anchored popover: header notifications, the user menu and the
 * theme toggle all use this. Closes on outside click, Escape, or route
 * change (callers unmount on navigation anyway since it lives in AppShell).
 */
export function DropdownMenu({
  trigger,
  children,
  align = 'end',
  width = 240,
  panelClassName,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  width?: number;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  const toggle = () => setOpen((v) => !v);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      {trigger({ open, toggle })}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            className={clsx(
              'absolute top-[calc(100%+8px)] z-50 rounded-lg border border-line bg-surface-2 shadow-pop',
              align === 'end' ? 'right-0' : 'left-0',
              panelClassName,
            )}
            style={{ width }}
          >
            {children(close)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MenuItem({
  icon,
  label,
  detail,
  onClick,
  active,
  tone = 'default',
}: {
  icon?: ReactNode;
  label: string;
  detail?: string;
  onClick?: () => void;
  active?: boolean;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
        tone === 'danger' ? 'text-critical hover:bg-critical/10' : 'text-ink hover:bg-surface-3',
        active && 'bg-surface-3',
      )}
    >
      {icon && <span className="shrink-0 text-ink-3">{icon}</span>}
      <span className="flex-1 truncate">{label}</span>
      {detail && <span className="readout shrink-0 text-xs text-ink-3">{detail}</span>}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <p className="label-micro px-3 pb-1.5 pt-2.5">{children}</p>;
}

export function MenuDivider() {
  return <div className="my-1 border-t border-line" />;
}
