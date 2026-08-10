import { useEffect, useState } from 'react';
import { checkHealth, isBackendConfigured, type BackendStatus } from '@/lib/api';

/**
 * Polls the backend so the UI can be honest about what is actually running.
 *
 * This matters for the demo: a judge asking "is this really connected to a
 * server?" should get an answer from the interface, not a claim. When no
 * backend is configured the status is 'disabled' and nothing is shown at all.
 */
export function useBackendStatus(): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>(isBackendConfigured ? 'checking' : 'disabled');

  useEffect(() => {
    if (!isBackendConfigured) return;

    let cancelled = false;
    const ping = async () => {
      const ok = await checkHealth();
      if (!cancelled) setStatus(ok ? 'online' : 'offline');
    };

    void ping();
    // Slow poll — this is a status light, not a heartbeat monitor.
    const id = setInterval(ping, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return status;
}
