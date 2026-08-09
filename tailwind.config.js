/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // Deliberately tight, opinionated scale. Ops tools are dense — 4px rhythm.
    extend: {
      // Channel triplets (see index.css) so `/10`, `/30` alpha modifiers work.
      colors: {
        canvas: 'rgb(var(--canvas-rgb) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--surface-rgb) / <alpha-value>)',
          2: 'rgb(var(--surface-2-rgb) / <alpha-value>)',
          3: 'rgb(var(--surface-3-rgb) / <alpha-value>)',
        },
        line: {
          DEFAULT: 'rgb(var(--line-rgb) / <alpha-value>)',
          strong: 'rgb(var(--line-strong-rgb) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--text-rgb) / <alpha-value>)',
          2: 'rgb(var(--text-2-rgb) / <alpha-value>)',
          3: 'rgb(var(--text-3-rgb) / <alpha-value>)',
        },
        // The brand colour IS the freshness signal. See index.css.
        fresh: 'rgb(var(--fresh-rgb) / <alpha-value>)',
        urgent: 'rgb(var(--urgent-rgb) / <alpha-value>)',
        critical: 'rgb(var(--critical-rgb) / <alpha-value>)',
        info: 'rgb(var(--info-rgb) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        micro: ['10.5px', { lineHeight: '1', letterSpacing: '0.09em' }],
        xs: ['11.5px', { lineHeight: '16px' }],
        sm: ['13px', { lineHeight: '18px' }],
        base: ['14px', { lineHeight: '20px' }],
        lg: ['16px', { lineHeight: '22px' }],
        xl: ['19px', { lineHeight: '25px', letterSpacing: '-0.015em' }],
        '2xl': ['24px', { lineHeight: '29px', letterSpacing: '-0.022em' }],
        '3xl': ['32px', { lineHeight: '35px', letterSpacing: '-0.028em' }],
        '4xl': ['44px', { lineHeight: '46px', letterSpacing: '-0.034em' }],
        '5xl': ['58px', { lineHeight: '58px', letterSpacing: '-0.038em' }],
      },
      borderRadius: {
        DEFAULT: '6px',
        md: '8px',
        lg: '10px',
        xl: '14px',
      },
      boxShadow: {
        // No drop shadows in the system — depth comes from a 1px top highlight.
        raise: 'inset 0 1px 0 0 rgba(255,255,255,0.035)',
        pop: '0 12px 32px -12px rgba(0,0,0,0.7), 0 0 0 1px var(--line-strong)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        sweep: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(200%)' },
        },
        pulseRing: {
          '0%': { boxShadow: '0 0 0 0 var(--ring-color)' },
          '70%': { boxShadow: '0 0 0 6px transparent' },
          '100%': { boxShadow: '0 0 0 0 transparent' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.25' },
        },
      },
      animation: {
        sweep: 'sweep 1.6s cubic-bezier(0.4,0,0.2,1) infinite',
        'pulse-ring': 'pulseRing 2s ease-out infinite',
        blink: 'blink 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
