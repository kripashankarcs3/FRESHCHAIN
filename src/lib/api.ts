/**
 * Backend client.
 *
 * The governing rule: **the app must never get worse when the backend is
 * absent.** FreshChain runs completely standalone — algorithms, grading,
 * routing and recommendations all work in the browser. The backend adds
 * persistence, the trained model and real Claude output on top.
 *
 * So every call here returns `null` on any failure instead of throwing, and
 * every caller is written to fall back to the local path. A dead backend, a
 * missing key or venue wifi dropping mid-demo all degrade to exactly the
 * behaviour we already ship.
 */

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');

export const isBackendConfigured = Boolean(API_URL);

export type BackendStatus = 'disabled' | 'checking' | 'online' | 'offline';

/**
 * Capabilities the backend has told us it does not have.
 *
 * A 503 from a route means the service is up but that capability is not wired
 * (typically: no Supabase credentials). Retrying it on every scan just burns a
 * round-trip and litters the console with failed requests, so we remember the
 * answer for the session and skip straight to the local path.
 */
const unavailable = new Set<string>();

/**
 * Circuit breaker for a configured-but-unreachable backend.
 *
 * A failed connection is not instant — on Windows a refused localhost fetch
 * costs ~2.4 s, and a scan makes two backend calls, so a dead server turned a
 * 2.5 s scan into 7.2 s. Measured, not guessed.
 *
 * After one network failure we stop dialling for a cooldown and go straight to
 * the local path, which keeps scans fast. The cooldown is short so a backend
 * that comes back mid-demo is picked up again on its own.
 */
const UNREACHABLE_COOLDOWN_MS = 30_000;
let unreachableUntil = 0;

/** Wraps fetch with a hard timeout so a hanging backend cannot freeze the UI. */
async function request<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T | null> {
  if (!API_URL) return null;
  if (unavailable.has(path)) return null;

  // /health is the probe that clears the breaker, so it must never be gated
  // by it — otherwise a recovered backend could never be noticed.
  const isProbe = path === '/health';
  if (!isProbe && Date.now() < unreachableUntil) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init?.timeoutMs ?? 6000);

  try {
    const res = await fetch(`${API_URL}${path}`, { ...init, signal: controller.signal });
    unreachableUntil = 0; // The server answered — it is up, whatever it said.
    if (res.status === 503) {
      unavailable.add(path);
      return null;
    }
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    // Network failure or timeout. Either way, stop dialling for a while.
    unreachableUntil = Date.now() + UNREACHABLE_COOLDOWN_MS;
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/* -------------------------------------------------------------------------- */
/* Health                                                                      */
/* -------------------------------------------------------------------------- */

export async function checkHealth(): Promise<boolean> {
  if (!API_URL) return false;
  const res = await request<{ status?: string }>('/health', { timeoutMs: 2500 });
  return res?.status === 'ok';
}

/* -------------------------------------------------------------------------- */
/* Vision — the trained model                                                  */
/* -------------------------------------------------------------------------- */

export interface ModelPrediction {
  /** 0–100. The single number the rest of the product consumes. */
  freshness_score: number;
  /** 0–1 model confidence for the winning class. */
  confidence: number;
  /** Winning class label, e.g. "fresh" | "medium" | "rotten". */
  label: string;
  /** Full distribution, so the UI can show what the model actually weighed. */
  probabilities: Record<string, number>;
  /** Optional model-reported defects; the UI tolerates an empty list. */
  defects?: { label: string; severity: number; detail: string }[];
  /** Inference wall time on the server, milliseconds. */
  elapsed_ms?: number;
  /** Which checkpoint answered — shown in the UI for traceability. */
  model_version?: string;
}

/**
 * Sends the raw photo to the server-side PyTorch model.
 *
 * Longer timeout than other calls: a cold model load on a free-tier dyno can
 * genuinely take a few seconds on the first request of the day.
 */
export async function predictFreshness(file: File, produceType: string): Promise<ModelPrediction | null> {
  if (!API_URL) return null;

  const form = new FormData();
  form.append('image', file);
  form.append('produce_type', produceType);

  return request<ModelPrediction>('/vision/analyse', {
    method: 'POST',
    body: form,
    timeoutMs: 15000,
  });
}

/* -------------------------------------------------------------------------- */
/* Batches                                                                     */
/* -------------------------------------------------------------------------- */

export interface BatchPayload {
  produce_type: string;
  weight_kg: number;
  harvest_date: string;
  freshness_score: number;
  temp_celsius: number;
  humidity_pct: number;
  cold_storage_block?: string;
  confidence?: number;
  defects?: unknown[];
  signals?: unknown[];
  origin?: string;
}

/** Persists a scanned batch. Returns null when the backend is unavailable —
 *  the caller has already added it to the local store either way. */
export function persistBatch(payload: BatchPayload) {
  return request<Record<string, unknown>>('/batches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function fetchBatches() {
  return request<Record<string, unknown>[]>('/batches');
}

/* -------------------------------------------------------------------------- */
/* Recommendation                                                              */
/* -------------------------------------------------------------------------- */

export interface RecommendationPayload {
  produce_type: string;
  weight_kg: number;
  freshness_score: number;
  shelf_life_days: number;
  destination: string;
  suggested_price: number;
  facility: string;
}

/** Claude-written batch recommendation. Null → caller uses the local composer. */
export function fetchRecommendation(payload: RecommendationPayload) {
  return request<{ text?: string }>('/recommendation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeoutMs: 6000,
  });
}

export function fetchDashboardStats() {
  return request<Record<string, number>>('/dashboard/stats');
}
