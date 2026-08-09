import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Dashboard } from '@/screens/Dashboard';
import { Scan } from '@/screens/Scan';
import { Routing } from '@/screens/Routing';
import { Alerts } from '@/screens/Alerts';
import { Marketplace } from '@/screens/Marketplace';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="scan" element={<Scan />} />
          <Route path="routing" element={<Routing />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="marketplace" element={<Marketplace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
