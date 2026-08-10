/**
 * Wordmark.
 *
 * The mark is the shelf-life bar — the same object used on every batch card,
 * shrunk. The identity and the core interface element are literally the same
 * shape, which is what makes the product feel designed rather than assembled.
 */
export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden className="shrink-0">
        <rect width="32" height="32" rx="8" fill="var(--surface-3)" />
        <rect x="6" y="21" width="20" height="4" rx="2" fill="var(--fresh)" />
        <rect x="6" y="21" width="6.5" height="4" rx="2" fill="var(--critical)" />
        <path
          d="M16 6.5c4.1 2.3 6.2 5 6.2 7.7a6.2 6.2 0 1 1-12.4 0c0-2.7 2.1-5.4 6.2-7.7Z"
          fill="var(--fresh)"
          opacity=".9"
        />
      </svg>
      <span className="truncate text-[15px] font-semibold tracking-[-0.02em] text-ink">
        Fresh<span className="text-ink-3">Chain</span>
      </span>
    </div>
  );
}
