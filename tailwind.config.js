/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand colors are CSS variables (rgb component triples) so each
        // client can override them at runtime AND so Tailwind's alpha
        // modifiers (`bg-brand/20`, `text-chrome-ink/65`) compose cleanly.
        // Defaults come from src/assets/main.css :root.
        brand: {
          DEFAULT: 'rgb(var(--color-brand) / <alpha-value>)',
          hover:   'rgb(var(--color-brand-hover) / <alpha-value>)',
          active:  'rgb(var(--color-brand-active) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          hover:   'rgb(var(--color-accent-hover) / <alpha-value>)',
        },
        chrome: {
          DEFAULT: 'rgb(var(--color-chrome) / <alpha-value>)',
          ink:     'rgb(var(--color-chrome-ink) / <alpha-value>)',
        },

        // Structural/semantic tokens — stable across clients.
        surface: {
          DEFAULT:  '#F4F7FB',
          raised:   '#FFFFFF',
          elevated: '#F1F5F9',
          dark:     'var(--color-chrome)',  // legacy alias
        },
        divider: {
          DEFAULT: '#E2E8F0',
          bright:  '#CBD5E1',
        },
        ink: {
          DEFAULT:  '#0F172A',
          inverse:  '#F1F5F9',
          muted:    '#64748B',
          disabled: '#94A3B8',
          data:     '#475569',
        },
        success: '#0EA5A0',
        warn:    '#D97706',  // alias of 'warning' for shorter classnames
        warning: '#D97706',
        danger:  '#DC2626',
      },
      borderColor: {
        DEFAULT: '#E2E8F0',
      },
      ringOffsetColor: {
        surface: '#F4F7FB',
      },
      backgroundImage: {
        'brand-gradient':
          'linear-gradient(135deg, rgb(var(--color-brand)) 0%, rgb(var(--color-accent)) 100%)',
      },
      boxShadow: {
        // Slightly more presence for cards on the gradient bg.
        'card':    '0 1px 3px 0 rgb(15 23 42 / 0.04), 0 1px 2px -1px rgb(15 23 42 / 0.04), 0 0 0 1px rgb(15 23 42 / 0.025)',
        'raised':  '0 12px 28px -8px rgb(15 23 42 / 0.10), 0 4px 8px -4px rgb(15 23 42 / 0.05)',
      },
      borderRadius: {
        'card': '14px',
      },
      transitionTimingFunction: {
        // Custom easings — defined in main.css and mirrored here so they're
        // usable as Tailwind utility classes (ease-out-quart, etc.). Built-in
        // CSS keywords are too weak; these are the punchier curves.
        'out-quart':  'cubic-bezier(0.23, 1, 0.32, 1)',
        'out-quint':  'cubic-bezier(0.22, 1, 0.36, 1)',
        'in-out-quart': 'cubic-bezier(0.77, 0, 0.175, 1)',
        'drawer':     'cubic-bezier(0.32, 0.72, 0, 1)',
      },
    },
  },
  plugins: [],
}
