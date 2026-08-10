import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ThemeContext, THEME_STORAGE_KEY, type ThemeChoice, type ResolvedTheme } from './context';

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStored(): ThemeChoice {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

/**
 * Applies the resolved theme to the document root.
 *
 * When the choice is explicit, `data-theme` is set and wins over the OS
 * setting (see index.css). When the choice is 'system', the attribute is
 * removed entirely so the `prefers-color-scheme` media query in index.css
 * takes over — that keeps the CSS the single source of truth instead of
 * duplicating OS-detection logic in JS.
 */
function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', choice);
  }
}

/** Browser-chrome tint (address bar on mobile) — kept in sync with the theme. */
function updateMetaThemeColor(resolved: ResolvedTheme) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#08090A' : '#F5F6F8');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(readStored);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    readStored() === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : (readStored() as ResolvedTheme),
  );

  const setTheme = useCallback((next: ThemeChoice) => {
    setThemeState(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    applyTheme(next);
  }, []);

  // Track the resolved theme (for the toggle's icon and the meta tag) whenever
  // the choice changes, and whenever the OS preference changes while on 'system'.
  useEffect(() => {
    applyTheme(theme);

    const compute = () => setResolvedTheme(theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme);
    compute();

    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', compute);
    return () => media.removeEventListener('change', compute);
  }, [theme]);

  useEffect(() => {
    updateMetaThemeColor(resolvedTheme);
  }, [resolvedTheme]);

  // Keep multiple tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) setThemeState(readStored());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
