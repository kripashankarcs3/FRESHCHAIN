import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  HeartHandshake,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Route as RouteIcon,
  ScanLine,
  Settings as SettingsIcon,
  Thermometer,
  User,
} from 'lucide-react';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { useMetrics, useStore } from '@/store/useStore';
import { COLD_STORAGE_BLOCKS } from '@/lib/produce';
import { seedTelemetry } from '@/data/seed';
import { initialsOf, useProfile } from '@/store/useProfile';
import { Button } from '@/components/ui/primitives';
import { DropdownMenu, MenuDivider, MenuItem, MenuLabel } from '@/components/ui/DropdownMenu';
import { Toasts } from '@/components/ui/Toasts';
import { Logo } from '@/components/layout/Logo';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { relativeTime } from '@/lib/format';
import { useBackendStatus } from '@/hooks/useBackendStatus';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/scan', label: 'Batch Scan', icon: ScanLine },
  { to: '/routing', label: 'Routing', icon: RouteIcon },
  { to: '/alerts', label: 'Alerts', icon: AlertTriangle },
  { to: '/marketplace', label: 'Rescue', icon: HeartHandshake },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
] as const;

/** The five that fit a thumb-reachable bottom bar. Reports/Settings stay
 *  reachable on mobile through the header's account menu instead. */
const MOBILE_NAV = NAV.slice(0, 5);

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Operations Dashboard', subtitle: 'Ghaziabad node · live' },
  '/scan': { title: 'Batch Scan', subtitle: 'Grade a batch and get its route' },
  '/routing': { title: 'Routing', subtitle: 'Every active batch and where it must go' },
  '/alerts': { title: 'Alert Center', subtitle: 'Cascade detection and automated response' },
  '/marketplace': { title: 'Rescue Marketplace', subtitle: 'Near-expiry stock, claimable now' },
  '/reports': { title: 'Reports', subtitle: 'Operational history and exports' },
  '/settings': { title: 'Settings', subtitle: 'Appearance, node and preferences' },
  '/profile': { title: 'Profile', subtitle: 'Operator identity and shift performance' },
};

const SIDEBAR_KEY = 'freshchain-sidebar-collapsed';

export function AppShell() {
  const { pathname } = useLocation();
  const metrics = useMetrics();
  const meta = PAGE_META[pathname] ?? PAGE_META['/'];
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === '1');

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  return (
    <div className="relative z-10 flex h-full">
      <Sidebar
        criticalAlerts={metrics.openAlerts}
        criticalBatches={metrics.critical}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((v) => !v)}
      />

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

function Sidebar({
  criticalAlerts,
  criticalBatches,
  collapsed,
  onToggleCollapsed,
}: {
  criticalAlerts: number;
  criticalBatches: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  return (
    <motion.aside
      animate={{ width: collapsed ? 68 : 228 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="hidden shrink-0 flex-col overflow-hidden border-r border-line bg-surface/60 lg:flex"
    >
      <div className="flex h-14 items-center justify-between px-3.5">
        {!collapsed && (
          <div className="min-w-0 pl-1.5">
            <Logo />
          </div>
        )}
        <button
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={clsx(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink',
            collapsed && 'mx-auto',
          )}
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3 pt-2">
        {!collapsed && <p className="label-micro px-2 pb-2 pt-1">Workspace</p>}
        {NAV.map(({ to, label, icon: Icon }) => {
          const badge = to === '/alerts' ? criticalAlerts : to === '/routing' ? criticalBatches : 0;
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                clsx(
                  'group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                  collapsed && 'justify-center px-0',
                  isActive ? 'bg-surface-3 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* Active marker uses the brand colour — the only nav colour in the app. */}
                  {!collapsed && (
                    <span
                      className={clsx(
                        'absolute -left-3 h-4 w-[2px] rounded-r-full transition-all',
                        isActive ? 'bg-fresh opacity-100' : 'opacity-0',
                      )}
                    />
                  )}
                  <Icon size={15} strokeWidth={1.9} className={isActive ? 'text-fresh' : 'text-ink-3'} />
                  {!collapsed && (
                    <>
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
                  {collapsed && badge > 0 && (
                    <span
                      className={clsx(
                        'absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full',
                        to === '/alerts' ? 'bg-critical' : 'bg-ink-3',
                      )}
                    />
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <ColdChainStatus collapsed={collapsed} />
    </motion.aside>
  );
}

/** Always-visible proof the node is live. Grounds the whole product in hardware. */
function ColdChainStatus({ collapsed }: { collapsed: boolean }) {
  const triggerCascade = useStore((s) => s.triggerCascade);

  // Seeded from the same telemetry the cold-storage chart plots, so the
  // sidebar and the chart cannot disagree. It then drifts by a few tenths the
  // way a real probe does — but it drifts around the measured value, not around
  // an arbitrary constant.
  const baseline = useMemo(() => {
    const latest = seedTelemetry[seedTelemetry.length - 1];
    const readings = COLD_STORAGE_BLOCKS.map((_, i) => [latest.blockA, latest.blockB, latest.blockC, latest.blockD][i]).filter(
      (v): v is number => typeof v === 'number',
    );
    return readings.reduce((s, v) => s + v, 0) / (readings.length || 1);
  }, []);

  const [temp, setTemp] = useState(() => Math.round(baseline * 10) / 10);

  useEffect(() => {
    const id = setInterval(
      () => setTemp(Math.round((baseline + (Math.random() - 0.5) * 0.6) * 10) / 10),
      4000,
    );
    return () => clearInterval(id);
  }, [baseline]);

  if (collapsed) {
    return (
      <div className="border-t border-line p-2.5">
        <button
          onClick={triggerCascade}
          title="Simulate temperature spike"
          className="flex w-full flex-col items-center gap-1 rounded-lg border border-line bg-surface-2 py-2.5 text-fresh transition-colors hover:border-critical/40 hover:text-critical"
        >
          <Thermometer size={14} />
          <span className="readout text-[10px]">{temp.toFixed(1)}°</span>
        </button>
      </div>
    );
  }

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
          <span className="readout text-xs text-ink-3">°C avg · {COLD_STORAGE_BLOCKS.length} blocks</span>
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
          <Logo />
        </div>

        <div className="hidden min-w-0 flex-1 lg:block">
          <h1 className="truncate text-sm font-semibold text-ink">{title}</h1>
          <p className="truncate text-xs text-ink-3">{subtitle}</p>
        </div>

        <div className="flex flex-1 items-center justify-end gap-2 lg:flex-none">
          <BackendChip />

          <div className="hidden items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 sm:flex">
            <span className="h-1.5 w-1.5 animate-blink rounded-full bg-fresh" />
            <span className="readout text-xs text-ink-2">
              {clock.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </span>
            <span className="text-micro font-mono uppercase text-ink-3">IST</span>
          </div>

          <NotificationBell />
          <ThemeToggle />
          <UserMenu />

          {pathname !== '/scan' && (
            <Button
              variant="primary"
              size="md"
              className="ml-1"
              icon={<ScanLine size={15} strokeWidth={2.2} />}
              onClick={() => navigate('/scan')}
            >
              <span className="hidden sm:inline">New Scan</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Honest status light. Only renders when a backend is actually configured —
 * with no `VITE_API_URL` the app is standalone by design and a "disconnected"
 * chip would be misleading rather than informative.
 */
function BackendChip() {
  const status = useBackendStatus();
  if (status === 'disabled') return null;

  const map = {
    checking: { dot: 'bg-ink-3', label: 'Connecting', text: 'text-ink-3' },
    online: { dot: 'bg-fresh', label: 'Live', text: 'text-fresh' },
    offline: { dot: 'bg-urgent', label: 'On-device', text: 'text-urgent' },
  } as const;
  const s = map[status];

  return (
    <div
      title={
        status === 'online'
          ? 'Connected to the FreshChain backend'
          : status === 'offline'
            ? 'Backend unreachable — running fully on-device'
            : 'Checking backend…'
      }
      className="hidden items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 sm:flex"
    >
      <span className={clsx('h-1.5 w-1.5 rounded-full', s.dot, status === 'online' && 'animate-blink')} />
      <span className={clsx('text-micro font-mono uppercase', s.text)}>{s.label}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function NotificationBell() {
  const navigate = useNavigate();
  const alerts = useStore((s) => s.alerts);
  const open = alerts.filter((a) => !a.resolved);
  const critical = open.filter((a) => a.severity === 'critical').length;

  return (
    <DropdownMenu
      width={320}
      align="end"
      trigger={({ open: isOpen, toggle }) => (
        <button
          onClick={toggle}
          aria-label={`Notifications, ${open.length} unread`}
          aria-expanded={isOpen}
          className={clsx(
            'relative flex h-8 w-8 items-center justify-center rounded-md border transition-colors',
            isOpen
              ? 'border-line-strong bg-surface-3 text-ink'
              : 'border-line bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink',
          )}
        >
          <Bell size={15} strokeWidth={1.9} />
          {open.length > 0 && (
            <span
              className={clsx(
                'absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-semibold text-on-fresh',
                critical > 0 ? 'bg-critical text-white' : 'bg-fresh',
              )}
            >
              {open.length}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between px-3 pt-2.5">
            <MenuLabel>Notifications</MenuLabel>
            <span className="readout pb-1.5 pt-2.5 text-xs text-ink-3">{open.length} open</span>
          </div>
          {open.length === 0 ? (
            <p className="px-3 pb-3 pt-1 text-xs leading-relaxed text-ink-3">
              No open alerts — every cold storage block is holding set point.
            </p>
          ) : (
            <ul className="max-h-[300px] divide-y divide-line overflow-y-auto">
              {open.slice(0, 6).map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => {
                      navigate('/alerts');
                      close();
                    }}
                    className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-3"
                  >
                    <span
                      className={clsx(
                        'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                        a.severity === 'critical' ? 'bg-critical' : a.severity === 'warning' ? 'bg-urgent' : 'bg-info',
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-ink">{a.title}</span>
                      <span className="readout mt-0.5 block text-xs text-ink-3">{relativeTime(a.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <MenuDivider />
          <MenuItem
            label="View all alerts"
            onClick={() => {
              navigate('/alerts');
              close();
            }}
          />
        </div>
      )}
    </DropdownMenu>
  );
}

/* -------------------------------------------------------------------------- */

function UserMenu() {
  const navigate = useNavigate();
  const pushToast = useStore((s) => s.pushToast);
  const profile = useProfile((s) => s.profile);

  return (
    <DropdownMenu
      width={220}
      align="end"
      trigger={({ open, toggle }) => (
        <button
          onClick={toggle}
          aria-label="Account menu"
          aria-expanded={open}
          className={clsx(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-on-fresh transition-transform',
            'bg-gradient-to-br from-fresh to-info',
            open && 'ring-2 ring-fresh/40',
          )}
        >
          {initialsOf(profile.name)}
        </button>
      )}
    >
      {(close) => (
        <div className="py-1.5">
          <div className="px-3 pb-2 pt-1">
            <p className="truncate text-sm font-medium text-ink">{profile.name}</p>
            <p className="truncate text-xs text-ink-3">
              {profile.node} · {profile.bay}
            </p>
          </div>
          <MenuDivider />
          <MenuItem
            icon={<User size={14} />}
            label="Profile"
            onClick={() => {
              navigate('/profile');
              close();
            }}
          />
          <MenuItem
            icon={<SettingsIcon size={14} />}
            label="Settings"
            onClick={() => {
              navigate('/settings');
              close();
            }}
          />
          <MenuItem
            icon={<BarChart3 size={14} />}
            label="Reports"
            onClick={() => {
              navigate('/reports');
              close();
            }}
          />
          <MenuDivider />
          <MenuItem
            icon={<LogOut size={14} />}
            label="Sign out"
            tone="danger"
            onClick={() => {
              pushToast({ title: 'Signed out', detail: 'Demo build has a single operator session.', tone: 'neutral' });
              close();
            }}
          />
        </div>
      )}
    </DropdownMenu>
  );
}

/* -------------------------------------------------------------------------- */

function MobileNav({ criticalAlerts }: { criticalAlerts: number }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <div className="grid grid-cols-5">
        {MOBILE_NAV.map(({ to, label, icon: Icon }) => (
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
