import { Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Dashboard } from '@/screens/Dashboard';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { Skeleton } from '@/components/ui/primitives';

/**
 * The dashboard is the landing screen and is imported eagerly — code-splitting
 * it would only add a round-trip to the one view that must paint immediately.
 *
 * Every other screen is split out, so the initial bundle carries the shell and
 * the dashboard rather than all eight workspaces. `lazyWithRetry` keeps a tab
 * that was open across a deploy from getting stuck on a 404'd chunk.
 */
const loadScan = () => import('@/screens/Scan').then((m) => ({ default: m.Scan }));
const loadRouting = () => import('@/screens/Routing').then((m) => ({ default: m.Routing }));
const loadAlerts = () => import('@/screens/Alerts').then((m) => ({ default: m.Alerts }));
const loadMarketplace = () => import('@/screens/Marketplace').then((m) => ({ default: m.Marketplace }));
const loadReports = () => import('@/screens/Reports').then((m) => ({ default: m.Reports }));
const loadSettings = () => import('@/screens/Settings').then((m) => ({ default: m.Settings }));
const loadProfile = () => import('@/screens/Profile').then((m) => ({ default: m.Profile }));
const loadCharts = () => import('@/components/viz/Charts');

const Scan = lazyWithRetry(loadScan);
const Routing = lazyWithRetry(loadRouting);
const Alerts = lazyWithRetry(loadAlerts);
const Marketplace = lazyWithRetry(loadMarketplace);
const Reports = lazyWithRetry(loadReports);
const Settings = lazyWithRetry(loadSettings);
const Profile = lazyWithRetry(loadProfile);

/**
 * Pulls every route chunk down once the first paint is done.
 *
 * Splitting the routes buys a faster first paint, but it also makes each tab
 * switch depend on a network fetch — and this product's whole promise is that
 * it keeps working when the network does not. Without this, cutting the wifi
 * and then opening Batch Scan showed a blank panel, which is precisely the
 * failure the split was meant to avoid.
 *
 * Warming them on idle keeps the fast first paint and puts every screen in
 * cache within about a second, so later navigation never touches the network.
 */
function usePrefetchRoutes() {
  useEffect(() => {
    const warm = () => {
      void loadScan();
      void loadRouting();
      void loadAlerts();
      void loadMarketplace();
      void loadReports();
      void loadSettings();
      void loadProfile();
      void loadCharts();
    };

    // Short timeout deliberately: on a busy first paint `requestIdleCallback`
    // can be deferred for seconds, and a tab that loses the network in that
    // window is exactly the case this exists to cover. 600 ms is late enough
    // not to compete with the dashboard's first paint.
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback;
    if (idle) {
      idle(warm, { timeout: 600 });
      return;
    }
    const id = setTimeout(warm, 300);
    return () => clearTimeout(id);
  }, []);
}

/** Holds the layout while a screen chunk arrives, so the page does not jump. */
function ScreenFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Skeleton className="h-[420px] w-full" />
        <Skeleton className="h-[420px] w-full" />
      </div>
    </div>
  );
}

export function App() {
  usePrefetchRoutes();

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route
            path="scan"
            element={
              <Suspense fallback={<ScreenFallback />}>
                <Scan />
              </Suspense>
            }
          />
          <Route
            path="routing"
            element={
              <Suspense fallback={<ScreenFallback />}>
                <Routing />
              </Suspense>
            }
          />
          <Route
            path="alerts"
            element={
              <Suspense fallback={<ScreenFallback />}>
                <Alerts />
              </Suspense>
            }
          />
          <Route
            path="marketplace"
            element={
              <Suspense fallback={<ScreenFallback />}>
                <Marketplace />
              </Suspense>
            }
          />
          <Route
            path="reports"
            element={
              <Suspense fallback={<ScreenFallback />}>
                <Reports />
              </Suspense>
            }
          />
          <Route
            path="settings"
            element={
              <Suspense fallback={<ScreenFallback />}>
                <Settings />
              </Suspense>
            }
          />
          <Route
            path="profile"
            element={
              <Suspense fallback={<ScreenFallback />}>
                <Profile />
              </Suspense>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
