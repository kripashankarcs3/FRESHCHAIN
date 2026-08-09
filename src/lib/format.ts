/** Indian numbering — ₹2,84,000, not ₹284,000. Judges notice. */
const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export function formatINR(value: number, decimals = false): string {
  return `₹${(decimals ? inr2 : inr).format(decimals ? value : Math.round(value))}`;
}

/** Compact money for tight metric tiles: ₹2.84L, ₹1.2Cr. */
export function formatINRCompact(value: number): string {
  if (value >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(2)}Cr`;
  if (value >= 1_00_000) return `₹${(value / 1_00_000).toFixed(2)}L`;
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(1)}K`;
  return `₹${Math.round(value)}`;
}

export function formatWeight(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)} t`;
  return `${inr.format(Math.round(kg))} kg`;
}

export function formatDays(days: number): string {
  if (days <= 0) return 'expired';
  if (days < 1) return `${Math.round(days * 24)}h left`;
  return `${days % 1 === 0 ? days : days.toFixed(1)} ${days === 1 ? 'day' : 'days'}`;
}

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** BATCH-4F2A style identifier. Short enough to read aloud on a demo. */
export function batchId(seed?: number): string {
  const alphabet = '0123456789ABCDEF';
  const n = seed ?? Math.floor(Math.random() * 0xffff);
  let out = '';
  let v = n;
  for (let i = 0; i < 4; i++) {
    out = alphabet[v % 16] + out;
    v = Math.floor(v / 16);
  }
  return `BATCH-${out}`;
}
