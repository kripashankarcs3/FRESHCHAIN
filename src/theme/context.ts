import { createContext } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemeContextValue {
  /** What the user picked — may be 'system'. */
  theme: ThemeChoice;
  /** What is actually on screen right now — never 'system'. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeChoice) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export const THEME_STORAGE_KEY = 'freshchain-theme';
