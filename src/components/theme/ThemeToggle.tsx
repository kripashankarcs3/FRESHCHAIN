import { Check, Laptop, Moon, Sun } from 'lucide-react';
import clsx from 'clsx';
import { useTheme } from '@/theme/useTheme';
import type { ThemeChoice } from '@/theme/context';
import { DropdownMenu, MenuLabel } from '@/components/ui/DropdownMenu';

const OPTIONS: { id: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Laptop },
];

/**
 * Header icon button + dropdown. Deliberately understated — per spec this
 * should not compete with "New Scan" for attention, so it is a plain ghost
 * icon button, not a coloured pill.
 */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const Icon = resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <DropdownMenu
      width={168}
      trigger={({ open, toggle }) => (
        <button
          onClick={toggle}
          aria-label="Change theme"
          aria-expanded={open}
          className={clsx(
            'flex h-8 w-8 items-center justify-center rounded-md border transition-colors',
            open
              ? 'border-line-strong bg-surface-3 text-ink'
              : 'border-line bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink',
          )}
        >
          <Icon size={15} strokeWidth={1.9} />
        </button>
      )}
    >
      {(close) => (
        <div className="py-1.5">
          <MenuLabel>Theme</MenuLabel>
          {OPTIONS.map((opt) => {
            const active = theme === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => {
                  setTheme(opt.id);
                  close();
                }}
                className={clsx(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
                  active ? 'bg-surface-3 text-ink' : 'text-ink-2 hover:bg-surface-3 hover:text-ink',
                )}
              >
                <opt.icon size={14} className="shrink-0" />
                <span className="flex-1">{opt.label}</span>
                {active && <Check size={13} className="shrink-0 text-fresh" strokeWidth={2.4} />}
              </button>
            );
          })}
        </div>
      )}
    </DropdownMenu>
  );
}
