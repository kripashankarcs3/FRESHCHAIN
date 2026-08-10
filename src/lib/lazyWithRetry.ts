import { lazy, type ComponentType } from 'react';

/**
 * `React.lazy` that survives a redeploy.
 *
 * Vite fingerprints every chunk. When a new build ships, the old filenames stop
 * existing — so a tab that was opened before the deploy still holds references
 * to chunks that are now 404. The dynamic import rejects, the Suspense boundary
 * never resolves, and the user sees a blank panel that "fixes itself on
 * refresh". Exactly the symptom, and it is invisible in local testing because
 * you almost always reload after building.
 *
 * On a failed import we reload once, which fetches the current index.html and
 * therefore the current chunk names. The session flag stops that becoming a
 * reload loop if the import is failing for some other reason (offline, a
 * genuinely broken chunk) — in that case we rethrow and let the error surface.
 */
const RELOAD_FLAG = 'freshchain-chunk-reload';

export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      // Import succeeded — this tab is on a coherent build again.
      try {
        sessionStorage.removeItem(RELOAD_FLAG);
      } catch {
        /* storage unavailable; the flag is only an optimisation */
      }
      return mod;
    } catch (error) {
      let alreadyTried = true;
      try {
        alreadyTried = sessionStorage.getItem(RELOAD_FLAG) === '1';
        if (!alreadyTried) sessionStorage.setItem(RELOAD_FLAG, '1');
      } catch {
        /* no storage: fall through and rethrow rather than risk a loop */
      }

      if (!alreadyTried) {
        window.location.reload();
        // Never settles — the page is being replaced. Resolving or rejecting
        // here would flash an error frame before the reload lands.
        return new Promise<never>(() => {});
      }

      throw error;
    }
  });
}
