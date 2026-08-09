import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  HeartHandshake,
  LayoutDashboard,
  Route as RouteIcon,
  ScanLine,
  Thermometer,
} from 'lucide-react';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { useMetrics, useStore } from '@/store/useStore';
import { Button } from '@/components/ui/primitives';
import { Toasts } from '@/components/ui/Toasts';
import { Logo } from '@/components/layout/Logo';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/scan', label: 'Batch Scan', icon: ScanLine },
  { to: '/routing', label: 'Routing', icon: RouteIcon },
  { to: '/alerts', label: 'Alerts', icon: AlertTriangle },
  { to: '/marketplace', label: 'Rescue', icon: HeartHandshake },
] as const;

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Operations', subtitle: 'Ghaziabad node · live' },
  '/scan': { title: 'Batch Scan', subtitle: 'Grade a batch and get its route' },
  '/routing': { title: 'Routing', subtitle: 'Every active batch and where it must go' },
  '/alerts': { title: 'Alert Center', subtitle: 'Cascade detection and automated response' },
  '/marketplace': { title: 'Rescue Marketplace', subtitle: 'Near-expiry stock, claimable now' },
};

export function AppShell() {
  const { pathname } = useLocation();
  const metrics = useMetrics();
  const meta = PAGE_META[pathname] ?? PAGE_META['/'];

  return (
    <div className="relative z-10 flex h-full">
      <Sidebar criticalAlerts={metrics.openAlerts} criticalBatches={metrics.critical} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={meta.title} subtitle={meta.subtitle} />

        <main className="flex-1 overflow-y-auto pb-24 lg:pb-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <MobileNav criticalAlerts={metrics.openAlerts} />
      <Toasts />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Sidebar({ criticalAlerts, criticalBatches }: { criticalAlerts: number; criticalBatches: number }) {
  return (
    <aside className="hidden w-[228px] shrink-0 flex-col border-r border-line bg-surface/60 lg:flex">
      <div className="flex h-14 items-center px-5">
        <Logo />
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3 pt-2">
        <p className="label-micro px-2 pb-2 pt-1">Workspace</p>
        {NAV.map(({ to, label, icon: Icon }) => {
          const badge = to === '/alerts' ? criticalAlerts : to === '/routing' ? criticalBatches : 0;
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                clsx(
                  'group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                  isActive ? 'bg-surface-3 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* Active marker uses the brand colour — the only nav colour in the app. */}
                  <span
                    className={clsx(
                      'absolute -left-3 h-4 w-[2px] rounded-r-full transition-all',
                      isActive ? 'bg-fresh opacity-100' : 'opacity-0',
                    )}
                  />
                  <Icon size={15} strokeWidth={1.9} className={isActive ? 'text-fresh' : 'text-ink-3'} />
                  <span className="flex-1">{label}</span>
                  {badge > 0 && (
                    <span
                      className={clsx(
                        'readout rounded px-1.5 py-0.5 text-micro',
                        to === '/alerts' ? 'bg-critical/15 text-critical' : 'bg-surface-3 text-ink-2',
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <ColdChainStatus />
    </aside>
  );
}

/** Always-visible proof the node is live. Grounds the whole product in hardware. */
function ColdChainStatus() {
  const triggerCascade = useStore((s) => s.triggerCascade);
  const [temp, setTemp] = useState(4.2);

  useEffect(() => {
    const id = setInterval(() => setTemp((t) => Math.round((4.2 + (Math.random() - 0.5) * 0.6) * 10) / 10 || t), 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="border-t border-line p-3">
      <div className="rounded-lg border border-line bg-surface-2 p-3">
        <div className="flex items-center justify-between">
          <span className="label-micro">Cold chain</span>
          <span className="flex items-center gap-1.5 text-micro font-mono uppercase text-fresh">
            <span className="h-1.5 w-1.5 animate-blink rounded-full bg-fresh" />
            Live
          </span>
        </div>
        <div className="mt-2.5 flex items-baseline gap-1.5">
          <Thermometer size={13} className="translate-y-px text-ink-3" />
          <span className="readout text-lg text-ink">{temp.toFixed(1)}</span>
          <span className="readout text-xs text-ink-3">°C avg · 4 blocks</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="mt-2 w-full justify-start px-1.5 text-ink-3 hover:text-critical"
          onClick={triggerCascade}
        >
          Simulate temperature spike
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Topbar({ title, subtitle }: { title: string; subtitle: string }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <div className="lg:hidden">
          <Logo compact />
        </div>

        <div className="hidden min-w-0 flex-1 lg:block">
          <h1 className="truncate text-sm font-semibold text-ink">{title}</h1>
          <p className="truncate text-xs text-ink-3">{subtitle}</p>
        </div>

        <div className="flex flex-1 items-center justify-end gap-3 lg:flex-none">
          <div className="hidden items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 sm:flex">
            <span className="h-1.5 w-1.5 animate-blink rounded-full bg-fresh" />
            <span className="readout text-xs text-ink-2">
              {clock.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </span>
            <span className="text-micro font-mono uppercase text-ink-3">IST</span>
          </div>

          {pathname !== '/scan' && (
            <Button variant="primary" size="md" icon={<ScanLine size={15} strokeWidth={2.2} />} onClick={() => navigate('/scan')}>
              New Scan
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */

function MobileNav({ criticalAlerts }: { criticalAlerts: number }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <div className="grid grid-cols-5">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'relative flex flex-col items-center gap-1 py-2.5 text-[10px] transition-colors',
                isActive ? 'text-fresh' : 'text-ink-3',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute top-0 h-[2px] w-8 rounded-b-full bg-fresh" />}
                <span className="relative">
                  <Icon size={18} strokeWidth={1.9} />
                  {to === '/alerts' && criticalAlerts > 0 && (
                    <span className="absolute -right-1.5 -top-1 h-1.5 w-1.5 rounded-full bg-critical" />
                  )}
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
